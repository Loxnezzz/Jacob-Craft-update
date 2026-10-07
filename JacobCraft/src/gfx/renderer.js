// Frame renderer: shadows, sky/clouds, opaque, SSR, water, volumetrics, bloom, exposure, tonemap, FXAA.
import { createProgram, createTexture2D, createDepthTexture, createFBO } from './gl.js';
import * as S from './shaders.js';
import { mat4, frustumPlanes, aabbInFrustum } from '../core/math.js';
import { generateTextures, TS } from './texgen.js';
import { TEXTURE_NAMES } from '../world/blocks.js';
import { generateNoise3D, generateWaterNormals } from './sky.js';
import { HEIGHT } from '../world/constants.js';

const QUALITY = {
  low: { shadowRes: 1024, shadowDist: 72, cloudSteps: 12, cloudScale: 0.25, volSteps: 12, vol: false, ssr: false, renderScale: 0.75, fxaa: true },
  medium: { shadowRes: 2048, shadowDist: 96, cloudSteps: 18, cloudScale: 0.35, volSteps: 16, vol: true, ssr: true, renderScale: 1.0, fxaa: true },
  high: { shadowRes: 3072, shadowDist: 128, cloudSteps: 28, cloudScale: 0.5, volSteps: 24, vol: true, ssr: true, renderScale: 1.0, fxaa: true },
  ultra: { shadowRes: 4096, shadowDist: 160, cloudSteps: 40, cloudScale: 0.5, volSteps: 32, vol: true, ssr: true, renderScale: 1.0, fxaa: true },
};

const ZERO4 = new Float32Array(4);
const ONE3 = [1, 1, 1];
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, depth: false, stencil: false, alpha: false, powerPreference: 'high-performance', premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.extCBF = gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    this.hdrFormat = this.extCBF ? gl.RGBA16F : gl.RGBA8;
    this.hdrType = this.extCBF ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    this.quality = 'high';
    this.q = Object.assign({}, QUALITY.high);
    this.stats = { drawn: 0, shadowDrawn: 0, tris: 0 };
    this.view = mat4.create(); this.proj = mat4.create(); this.viewProj = mat4.create();
    this.invViewProj = mat4.create(); this.invProj = mat4.create(); this.invView = mat4.create();
    this.shadowMat = mat4.create();
    this.planes = []; this.shadowPlanes = [];
    this.frame = 0;
    this.near = 0.06; this.far = 600;
    this.overlays = []; // functions(gl, renderer, frame) drawn in forward pass
    this.opaqueHooks = []; // functions drawn in opaque pass (entities)
    this.shadowHooks = [];
    this._initPrograms();
    this._initStatic();
  }

  setQuality(name) {
    this.quality = name;
    this.q = Object.assign({}, QUALITY[name] || QUALITY.high);
    this._initShadow();
    this.resize(true);
  }

  _initPrograms() {
    const gl = this.gl;
    const P = (vs, fs, n) => createProgram(gl, vs, fs, n);
    this.pChunk = P(S.CHUNK_VS, S.CHUNK_FS, 'chunk');
    this.pShadow = P(S.SHADOW_VS, S.SHADOW_FS, 'shadow');
    this.pWater = P(S.WATER_VS, S.WATER_FS, 'water');
    this.pSkyLUT = P(S.FS_VS, S.SKYLUT_FS, 'skylut');
    this.pClouds = P(S.FS_VS, S.CLOUDS_FS, 'clouds');
    this.pSky = P(S.FS_VS, S.SKY_FS, 'sky');
    this.pEnv = P(S.FS_VS, S.ENV_FS, 'env');
    this.pReflect = P(S.FS_VS, S.REFLECT_FS, 'reflect');
    this.pVol = P(S.FS_VS, S.VOLUMETRIC_FS, 'volumetric');
    this.pDown = P(S.FS_VS, S.DOWNSAMPLE_FS, 'down');
    this.pUp = P(S.FS_VS, S.UPSAMPLE_FS, 'up');
    this.pExposure = P(S.FS_VS, S.EXPOSURE_FS, 'exposure');
    this.pComposite = P(S.FS_VS, S.COMPOSITE_FS, 'composite');
    this.pFXAA = P(S.FS_VS, S.FXAA_FS, 'fxaa');
    this.pCopy = P(S.FS_VS, S.COPY_FS, 'copy');
    this.pLine = P(S.LINE_VS, S.LINE_FS, 'line');
    this.pCrack = P(S.CRACK_VS, S.CRACK_FS, 'crack');
  }

  _initStatic() {
    const gl = this.gl;
    this.emptyVAO = gl.createVertexArray();
    // shared quad index buffer
    const MAXQ = 1 << 18;
    const idx = new Uint32Array(MAXQ * 6);
    for (let q = 0, v = 0, i = 0; q < MAXQ; q++, v += 4) {
      idx[i++] = v; idx[i++] = v + 1; idx[i++] = v + 2; idx[i++] = v; idx[i++] = v + 2; idx[i++] = v + 3;
    }
    this.maxQuads = MAXQ;
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

    // block textures
    const t0 = performance.now();
    const tex = generateTextures(TEXTURE_NAMES);
    this.texData = tex;
    const alb = this._makeArray(tex.albedo, true, TEXTURE_NAMES.length, null);
    this.albedoArray = alb.tex;
    this.normalArray = this._makeArray(tex.normal, false, TEXTURE_NAMES.length, alb.levels).tex;
    this.texGenMs = performance.now() - t0;

    // noise 3d
    const n3 = generateNoise3D(64);
    this.noise3D = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, this.noise3D);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, 64, 64, 64, 0, gl.RED, gl.UNSIGNED_BYTE, n3);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.REPEAT);
    gl.generateMipmap(gl.TEXTURE_3D);

    const wn = generateWaterNormals(256);
    this.waterNormal = createTexture2D(gl, 256, 256, { data: wn, wrap: gl.REPEAT, min: gl.LINEAR_MIPMAP_LINEAR, mag: gl.LINEAR, mips: true });

    // sky LUT + env
    this.skyLUT = createTexture2D(gl, 192, 108, { internal: this.hdrFormat, type: this.hdrType, wrap: gl.CLAMP_TO_EDGE });
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    this.skyLUTFBO = createFBO(gl, [this.skyLUT], null);
    this.envTex = createTexture2D(gl, 256, 128, { internal: this.hdrFormat, type: this.hdrType });
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    this.envFBO = createFBO(gl, [this.envTex], null);

    // exposure ping-pong
    this.expTex = [0, 1].map(() => createTexture2D(gl, 1, 1, { internal: this.hdrFormat, type: this.hdrType, min: gl.NEAREST, mag: gl.NEAREST }));
    this.expFBO = this.expTex.map(t => createFBO(gl, [t], null));
    for (const f of this.expFBO) { gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
    this.expIdx = 0;

    // dynamic line/crack buffers
    this.lineVAO = gl.createVertexArray();
    this.lineVBO = gl.createBuffer();
    gl.bindVertexArray(this.lineVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVBO);
    gl.bufferData(gl.ARRAY_BUFFER, 4096 * 12, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    this.crackVAO = gl.createVertexArray();
    this.crackVBO = gl.createBuffer();
    gl.bindVertexArray(this.crackVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.crackVBO);
    gl.bufferData(gl.ARRAY_BUFFER, 2048 * 20, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    gl.bindVertexArray(null);

    this._initShadow();
    this.resize(true);
  }

  // Build a TEXTURE_2D_ARRAY with CPU-generated mips (alpha-preserving for cutouts)
  _makeArray(data, srgb, layers, weightLevels) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
    const levels = Math.log2(TS) + 1;
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8, TS, TS, layers);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, TS, TS, layers, gl.RGBA, gl.UNSIGNED_BYTE, data);
    // mips
    const toLin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const toS = (v) => { v = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(v * 255))); };
    let prev = data, size = TS;
    const allLevels = [data];
    for (let lv = 1; lv < levels; lv++) {
      const wsrc = weightLevels ? weightLevels[lv - 1] : null;
      const ns = size >> 1;
      const out = new Uint8Array(ns * ns * 4 * layers);
      for (let l = 0; l < layers; l++) {
        const po = l * size * size * 4, oo = l * ns * ns * 4;
        for (let y = 0; y < ns; y++) for (let x = 0; x < ns; x++) {
          let r = 0, g = 0, b = 0, a = 0, wsum = 0;
          for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
            const i = po + ((y * 2 + dy) * size + (x * 2 + dx)) * 4;
            const al = prev[i + 3] / 255;
            const w = srgb ? al + 0.001 : (wsrc ? wsrc[i + 3] / 255 + 0.001 : 1);
            if (srgb) { r += toLin(prev[i]) * w; g += toLin(prev[i + 1]) * w; b += toLin(prev[i + 2]) * w; }
            else { r += prev[i] * w; g += prev[i + 1] * w; b += prev[i + 2] * w; }
            a += al; wsum += w;
          }
          const o = oo + (y * ns + x) * 4;
          if (srgb) { out[o] = toS(r / wsum); out[o + 1] = toS(g / wsum); out[o + 2] = toS(b / wsum); }
          else { out[o] = r / wsum; out[o + 1] = g / wsum; out[o + 2] = b / wsum; }
          const av = a / 4;
          // keep cutout coverage from vanishing in the distance
          out[o + 3] = srgb ? Math.round(Math.min(1, av < 0.999 ? av * 1.35 : 1) * 255) : Math.round(av * 255);
        }
      }
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, lv, 0, 0, 0, ns, ns, layers, gl.RGBA, gl.UNSIGNED_BYTE, out);
      prev = out; size = ns;
      allLevels.push(out);
    }
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    // note: no anisotropic filtering - on ANGLE/D3D it forces linear filtering and blurs the pixel art
    return { tex: t, levels: allLevels };
  }

  _initShadow() {
    const gl = this.gl;
    if (this.shadowTex) { gl.deleteTexture(this.shadowTex); gl.deleteFramebuffer(this.shadowFBO); }
    const r = this.q.shadowRes;
    this.shadowTex = createDepthTexture(gl, r, r, true, gl.DEPTH_COMPONENT24);
    this.shadowFBO = createFBO(gl, [], this.shadowTex);
  }

  resize(force = false) {
    const gl = this.gl;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const ch = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (!force && cw === this.canvas.width && ch === this.canvas.height) return;
    this.canvas.width = cw; this.canvas.height = ch;
    const rs = this.q.renderScale * (this.userScale ?? 1);
    const W = Math.max(1, Math.floor(cw * rs));
    const H = Math.max(1, Math.floor(ch * rs));
    this.W = W; this.H = H;
    const del = (t) => t && gl.deleteTexture(t);
    const delF = (f) => f && gl.deleteFramebuffer(f);
    [this.hdrTex, this.nrmTex, this.depthTex, this.copyTex, this.copyDepth, this.volTex, this.cloudTex, this.ldrTex].forEach(del);
    [this.mainFBO, this.fwdFBO, this.copyFBO, this.volFBO, this.cloudFBO, this.ldrFBO].forEach(delF);
    if (this.bloomTex) { this.bloomTex.forEach(del); this.bloomFBO.forEach(delF); }

    const hdr = { internal: this.hdrFormat, type: this.hdrType };
    this.hdrTex = createTexture2D(gl, W, H, hdr);
    this.nrmTex = createTexture2D(gl, W, H, { min: gl.NEAREST, mag: gl.NEAREST });
    this.depthTex = createDepthTexture(gl, W, H);
    this.mainFBO = createFBO(gl, [this.hdrTex, this.nrmTex], this.depthTex);
    this.fwdFBO = createFBO(gl, [this.hdrTex], this.depthTex);
    this.copyTex = createTexture2D(gl, W, H, hdr);
    this.copyDepth = createDepthTexture(gl, W, H);
    this.copyFBO = createFBO(gl, [this.copyTex], this.copyDepth);
    const vw = Math.max(1, W >> 1), vh = Math.max(1, H >> 1);
    this.volTex = createTexture2D(gl, vw, vh, hdr);
    this.volFBO = createFBO(gl, [this.volTex], null);
    const cs = this.q.cloudScale;
    this.cloudTex = createTexture2D(gl, Math.max(1, Math.floor(W * cs)), Math.max(1, Math.floor(H * cs)), hdr);
    this.cloudFBO = createFBO(gl, [this.cloudTex], null);
    this.ldrTex = createTexture2D(gl, W, H, {});
    this.ldrFBO = createFBO(gl, [this.ldrTex], null);
    this.bloomTex = []; this.bloomFBO = [];
    let bw = W, bh = H;
    for (let i = 0; i < 6; i++) {
      bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
      const t = createTexture2D(gl, bw, bh, hdr);
      this.bloomTex.push(t); this.bloomFBO.push(createFBO(gl, [t], null));
    }
    // exposure source: 64x? small target
    if (!this.lumTex) {
      this.lumTex = createTexture2D(gl, 64, 36, hdr);
      this.lumFBO = createFBO(gl, [this.lumTex], null);
    }
  }

  // ---------- chunk meshes ----------
  uploadChunk(chunk, d) {
    const gl = this.gl;
    if (!chunk.mesh) chunk.mesh = { opaque: null, trans: null, minY: 0, maxY: 0 };
    const m = chunk.mesh;
    m.opaque = this._uploadBuf(m.opaque, d.opaque, d.opaqueCount);
    m.trans = this._uploadBuf(m.trans, d.trans, d.transCount);
    m.minY = d.minY; m.maxY = d.maxY;
    gl.bindVertexArray(null);
  }

  _uploadBuf(o, buf, count) {
    const gl = this.gl;
    if (!count) { if (o) { gl.deleteVertexArray(o.vao); gl.deleteBuffer(o.vbo); } return null; }
    if (!o) {
      o = { vao: gl.createVertexArray(), vbo: gl.createBuffer(), count: 0 };
      gl.bindVertexArray(o.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, o.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.SHORT, false, 20, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.UNSIGNED_BYTE, false, 20, 8);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.UNSIGNED_SHORT, false, 20, 10);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, false, 20, 12);
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.UNSIGNED_BYTE, false, 20, 16);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    } else {
      gl.bindVertexArray(o.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, o.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
    }
    o.count = Math.min(count, this.maxQuads * 4);
    return o;
  }

  deleteChunk(chunk) {
    const gl = this.gl;
    const m = chunk.mesh;
    if (!m) return;
    for (const o of [m.opaque, m.trans]) if (o) { gl.deleteVertexArray(o.vao); gl.deleteBuffer(o.vbo); }
    chunk.mesh = null;
  }

  // ---------- frame ----------
  render(F) {
    const gl = this.gl;
    this.frame++;
    this.resize();
    const W = this.W, H = this.H;
    const cam = F.camPos;
    if (!Array.isArray(F.chunks)) F.chunks = Array.from(F.chunks);
    this.far = Math.max(256, F.renderDist * 16 + 80);

    // camera matrices (camera-relative: view has no translation)
    mat4.perspective(this.proj, F.fov, W / H, this.near, this.far);
    const cp = Math.cos(F.pitch), sp = Math.sin(F.pitch), cy = Math.cos(F.yaw), sy = Math.sin(F.yaw);
    const fwd = [-sy * cp, sp, -cy * cp];
    this.forward = fwd;
    mat4.lookAt(this.view, [0, 0, 0], fwd, [0, 1, 0]);
    if (F.bob) {
      const b = mat4.create();
      mat4.translate(b, b, F.bob[0], F.bob[1], 0);
      if (F.roll) mat4.rotateZ(b, b, F.roll);
      mat4.multiply(this.view, b, this.view);
    }
    mat4.multiply(this.viewProj, this.proj, this.view);
    mat4.invert(this.invViewProj, this.viewProj);
    mat4.invert(this.invProj, this.proj);
    mat4.invert(this.invView, this.view);
    frustumPlanes(this.viewProj, this.planes);

    // camera fractional offset for noise continuity
    const camFrac = [cam[0] - Math.floor(cam[0] / 1024) * 1024, cam[1], cam[2] - Math.floor(cam[2] / 1024) * 1024];
    this.camFrac = camFrac;

    this._buildShadowMatrix(F);

    const L = F.light;
    const fogDensity = F.fogDensity;
    // ---- common uniforms set per program ----
    const setCommon = (p) => {
      const u = p.u;
      gl.useProgram(p.program);
      if (u.u_sunDir) gl.uniform3fv(u.u_sunDir, F.sunDir);
      if (u.u_lightDir) gl.uniform3fv(u.u_lightDir, L.lightDir);
      if (u.u_lightColor) gl.uniform3fv(u.u_lightColor, L.lightColor);
      if (u.u_ambUp) gl.uniform3fv(u.u_ambUp, L.ambUp);
      if (u.u_ambDown) gl.uniform3fv(u.u_ambDown, L.ambDown);
      if (u.u_blockColor) gl.uniform3fv(u.u_blockColor, F.blockColor);
      if (u.u_handLight) gl.uniform4fv(u.u_handLight, F.handLight || ZERO4);
      if (u.u_sunScatter) gl.uniform3fv(u.u_sunScatter, L.sunScatter);
      if (u.u_time) gl.uniform1f(u.u_time, F.time);
      if (u.u_camY) gl.uniform1f(u.u_camY, cam[1]);
      if (u.u_fogDensity) gl.uniform1f(u.u_fogDensity, fogDensity);
      if (u.u_fogHeight) gl.uniform1f(u.u_fogHeight, F.fogHeight);
      if (u.u_fogTint) gl.uniform3fv(u.u_fogTint, F.fogTint || ONE3);
      if (u.u_renderDist) gl.uniform1f(u.u_renderDist, F.renderDist * 16 - 8);
      if (u.u_wetness) gl.uniform1f(u.u_wetness, F.wetness);
      if (u.u_flash) gl.uniform1f(u.u_flash, F.flash);
      if (u.u_shadowSize) gl.uniform1f(u.u_shadowSize, this.q.shadowRes);
      if (u.u_cloudShadow) gl.uniform1f(u.u_cloudShadow, F.cloudsOn ? F.cloudCoverage * 0.9 : 0);
      if (u.u_cloudWind) gl.uniform2fv(u.u_cloudWind, F.cloudWind);
      if (u.u_viewProj) gl.uniformMatrix4fv(u.u_viewProj, false, this.viewProj);
      if (u.u_camFrac) gl.uniform3fv(u.u_camFrac, camFrac);
      if (u.u_wind) gl.uniform1f(u.u_wind, F.wind);
      if (u.u_shadowMat) gl.uniformMatrix4fv(u.u_shadowMat, false, this.shadowMat);
      if (u.u_shadowTexel) gl.uniform1f(u.u_shadowTexel, this.shadowTexel);
      if (u.u_shadowsOn) gl.uniform1f(u.u_shadowsOn, F.shadowsOn ? 1 : 0);
      if (u.u_debug) gl.uniform1i(u.u_debug, this.debugMode | 0);
    };
    this.setCommon = setCommon;

    // ---- shadow pass ----
    this.stats.shadowDrawn = 0;
    if (F.shadowsOn && L.lightColor[0] + L.lightColor[1] + L.lightColor[2] > 0.002) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO);
      gl.viewport(0, 0, this.q.shadowRes, this.q.shadowRes);
      gl.depthMask(true);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1.5, 3.0);
      const p = this.pShadow;
      gl.useProgram(p.program);
      gl.uniformMatrix4fv(p.u.u_shadowMat, false, this.shadowMat);
      gl.uniform3fv(p.u.u_camFrac, camFrac);
      gl.uniform1f(p.u.u_time, F.time);
      gl.uniform1f(p.u.u_wind, F.wind);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.albedoArray);
      gl.uniform1i(p.u.u_albedo, 0);
      const sd = this.q.shadowDist + 24;
      for (const c of F.chunks) {
        const m = c.mesh;
        if (!m || !m.opaque) continue;
        const ox = c.cx * 16 - cam[0], oz = c.cz * 16 - cam[2];
        if (ox > sd || ox + 16 < -sd || oz > sd || oz + 16 < -sd) continue;
        if (!aabbInFrustum(this.shadowPlanes, ox, m.minY - cam[1], oz, ox + 16, m.maxY - cam[1], oz + 16)) continue;
        gl.uniform3f(p.u.u_chunkOff, ox, -cam[1], oz);
        gl.bindVertexArray(m.opaque.vao);
        gl.drawElements(gl.TRIANGLES, m.opaque.count / 4 * 6, gl.UNSIGNED_INT, 0);
        this.stats.shadowDrawn++;
      }
      for (const h of this.shadowHooks) h(gl, this, F);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    // ---- sky LUT ----
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);
    gl.bindVertexArray(this.emptyVAO);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.skyLUTFBO);
    gl.viewport(0, 0, 192, 108);
    {
      const p = this.pSkyLUT; gl.useProgram(p.program);
      gl.uniform3fv(p.u.u_sunDir, F.sunDir);
      gl.uniform3fv(p.u.u_moonDir, F.moonDir);
      gl.uniform1f(p.u.u_overcast, F.overcast);
      gl.uniform1f(p.u.u_darken, F.skyDarken);
      gl.uniform3fv(p.u.u_grayTint, F.grayTint);
      gl.uniform1f(p.u.u_withSunGlow, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    // ---- env (reflections) ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.envFBO);
    gl.viewport(0, 0, 256, 128);
    {
      const p = this.pEnv; gl.useProgram(p.program);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.skyLUT); gl.uniform1i(p.u.u_skyLUT, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, this.noise3D); gl.uniform1i(p.u.u_noise3D, 1);
      gl.uniform3fv(p.u.u_lightDir, L.lightDir);
      gl.uniform3fv(p.u.u_lightColor, L.lightColor);
      gl.uniform3fv(p.u.u_sunDir, F.sunDir);
      gl.uniform3fv(p.u.u_sunDisk, L.sunDisk);
      gl.uniform1f(p.u.u_coverage, F.cloudsOn ? F.cloudCoverage : 0);
      gl.uniform2fv(p.u.u_cloudWind, F.cloudWind);
      gl.uniform3fv(p.u.u_camPos, cam);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    // ---- clouds ----
    if (F.cloudsOn) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.cloudFBO);
      gl.viewport(0, 0, this.cloudTex.width, this.cloudTex.height);
      const p = this.pClouds; gl.useProgram(p.program);
      gl.uniformMatrix4fv(p.u.u_invViewProj, false, this.invViewProj);
      gl.uniform3fv(p.u.u_camPos, cam);
      gl.uniform3fv(p.u.u_lightDir, L.lightDir);
      gl.uniform3fv(p.u.u_lightColor, L.lightColor);
      gl.uniform3fv(p.u.u_ambUp, L.ambUp);
      gl.uniform1f(p.u.u_coverage, F.cloudCoverage);
      gl.uniform1f(p.u.u_cloudDensity, F.cloudDensity);
      gl.uniform2fv(p.u.u_cloudWind, F.cloudWind);
      gl.uniform1f(p.u.u_time, F.time);
      gl.uniform1f(p.u.u_flash, F.flash);
      gl.uniform1i(p.u.u_steps, this.q.cloudSteps);
      gl.uniform2f(p.u.u_jitter, (this.frame % 64) * 1.37, 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, this.noise3D); gl.uniform1i(p.u.u_noise3D, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.skyLUT); gl.uniform1i(p.u.u_skyLUT, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // ---- main opaque pass ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.mainFBO);
    gl.viewport(0, 0, W, H);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.depthMask(true);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 1]);
    gl.clearBufferfv(gl.COLOR, 1, [0.5, 0.5, 0.5, 0]);
    gl.clearDepth(1);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    // sky
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE]);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    {
      const p = this.pSky; gl.useProgram(p.program);
      gl.uniformMatrix4fv(p.u.u_invViewProj, false, this.invViewProj);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.skyLUT); gl.uniform1i(p.u.u_skyLUT, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.cloudTex); gl.uniform1i(p.u.u_clouds, 1);
      gl.uniform3fv(p.u.u_sunDir, F.sunDir);
      gl.uniform3fv(p.u.u_moonDir, F.moonDir);
      gl.uniform3fv(p.u.u_sunDisk, L.sunDisk);
      gl.uniform3fv(p.u.u_moonColor, L.moonDisk);
      gl.uniform1f(p.u.u_starVis, L.starVis);
      gl.uniform1f(p.u.u_time, F.time);
      gl.uniform1f(p.u.u_moonPhase, F.moonPhase);
      gl.uniform1f(p.u.u_cloudsOn, F.cloudsOn ? 1 : 0);
      gl.uniform1f(p.u.u_flash, F.flash);
      gl.bindVertexArray(this.emptyVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    {
      const p = this.pChunk;
      setCommon(p);
      this._bindLitTextures(p);
      let drawn = 0, tris = 0;
      const R = F.renderDist * 16 + 16;
      for (const c of F.chunks) {
        const m = c.mesh;
        if (!m || !m.opaque) continue;
        const ox = c.cx * 16 - cam[0], oz = c.cz * 16 - cam[2];
        if (ox > R || ox + 16 < -R || oz > R || oz + 16 < -R) continue;
        if (!aabbInFrustum(this.planes, ox, m.minY - cam[1], oz, ox + 16, m.maxY - cam[1], oz + 16)) continue;
        gl.uniform3f(p.u.u_chunkOff, ox, -cam[1], oz);
        gl.bindVertexArray(m.opaque.vao);
        gl.drawElements(gl.TRIANGLES, m.opaque.count / 4 * 6, gl.UNSIGNED_INT, 0);
        drawn++; tris += m.opaque.count / 2;
      }
      this.stats.drawn = drawn; this.stats.tris = tris;
    }
    for (const h of this.opaqueHooks) h(gl, this, F);
    gl.bindVertexArray(null);

    // ---- copy scene for refraction / SSR ----
    this._blitToCopy(true);

    // ---- SSR on wet / polished surfaces ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fwdFBO);
    gl.viewport(0, 0, W, H);
    if (F.ssrOn && this.q.ssr) {
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      const p = this.pReflect; gl.useProgram(p.program);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.copyTex); gl.uniform1i(p.u.u_sceneColor, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.copyDepth); gl.uniform1i(p.u.u_sceneDepth, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.nrmTex); gl.uniform1i(p.u.u_normalTex, 2);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.envTex); gl.uniform1i(p.u.u_reflEnv, 3);
      gl.uniformMatrix4fv(p.u.u_view, false, this.view);
      gl.uniformMatrix4fv(p.u.u_proj, false, this.proj);
      gl.uniformMatrix4fv(p.u.u_invProj, false, this.invProj);
      gl.uniformMatrix4fv(p.u.u_invView, false, this.invView);
      gl.uniform1f(p.u.u_near, this.near); gl.uniform1f(p.u.u_far, this.far);
      gl.bindVertexArray(this.emptyVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.BLEND);
    }

    // ---- water / translucent ----
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.CULL_FACE);
    {
      const p = this.pWater;
      setCommon(p);
      const u = p.u;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.albedoArray); gl.uniform1i(u.u_albedo, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.shadowTex); gl.uniform1i(u.u_shadowMap, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.skyLUT); gl.uniform1i(u.u_skyLUT, 2);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.copyTex); gl.uniform1i(u.u_sceneColor, 3);
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.copyDepth); gl.uniform1i(u.u_sceneDepth, 4);
      gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, this.envTex); gl.uniform1i(u.u_reflEnv, 5);
      gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, this.waterNormal); gl.uniform1i(u.u_waterNormal, 6);
      gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_3D, this.noise3D); gl.uniform1i(u.u_noise3D, 7);
      gl.uniformMatrix4fv(u.u_view, false, this.view);
      gl.uniformMatrix4fv(u.u_proj, false, this.proj);
      gl.uniform2f(u.u_res, W, H);
      gl.uniform1f(u.u_near, this.near); gl.uniform1f(u.u_far, this.far);
      gl.uniform1f(u.u_ssrOn, F.ssrOn && this.q.ssr ? 1 : 0);
      gl.uniform1f(u.u_rain, F.rain);
      const R = F.renderDist * 16 + 16;
      const list = [];
      for (const c of F.chunks) {
        const m = c.mesh;
        if (!m || !m.trans) continue;
        const ox = c.cx * 16 - cam[0], oz = c.cz * 16 - cam[2];
        if (ox > R || ox + 16 < -R || oz > R || oz + 16 < -R) continue;
        if (!aabbInFrustum(this.planes, ox, m.minY - cam[1], oz, ox + 16, m.maxY - cam[1], oz + 16)) continue;
        list.push([(ox + 8) ** 2 + (oz + 8) ** 2, c, ox, oz]);
      }
      list.sort((a, b) => a[0] - b[0]); // front to back for early-z
      for (const [, c, ox, oz] of list) {
        gl.uniform3f(u.u_chunkOff, ox, -cam[1], oz);
        gl.bindVertexArray(c.mesh.trans.vao);
        gl.drawElements(gl.TRIANGLES, c.mesh.trans.count / 4 * 6, gl.UNSIGNED_INT, 0);
      }
    }
    gl.bindVertexArray(null);

    // ---- forward overlays (particles, selection, held item...) ----
    gl.enable(gl.CULL_FACE);
    for (const h of this.overlays) h(gl, this, F);
    gl.bindVertexArray(null);

    // ---- depth copy for volumetrics/underwater ----
    this._blitToCopy(false);

    // ---- volumetric light ----
    const volOn = F.volumetricOn && this.q.vol && F.volDensity > 0.00001 && L.lightColor[0] + L.lightColor[1] > 0.001;
    if (volOn) {
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.CULL_FACE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.volFBO);
      gl.viewport(0, 0, this.volTex.width, this.volTex.height);
      const p = this.pVol; gl.useProgram(p.program);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.copyDepth); gl.uniform1i(p.u.u_depth, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.shadowTex); gl.uniform1i(p.u.u_shadowMap, 1);
      gl.uniformMatrix4fv(p.u.u_invViewProj, false, this.invViewProj);
      gl.uniformMatrix4fv(p.u.u_shadowMat, false, this.shadowMat);
      gl.uniform3fv(p.u.u_lightDir, L.lightDir);
      gl.uniform3fv(p.u.u_lightColor, L.lightColor);
      gl.uniform3fv(p.u.u_ambUp, L.ambUp);
      gl.uniform1f(p.u.u_near, this.near); gl.uniform1f(p.u.u_far, this.far);
      gl.uniform1f(p.u.u_density, F.volDensity);
      gl.uniform1f(p.u.u_camY, cam[1]);
      gl.uniform1i(p.u.u_steps, this.q.volSteps);
      gl.uniform1f(p.u.u_maxDist, Math.min(this.q.shadowDist, 120));
      gl.uniform1f(p.u.u_underwater, F.underwater ? 1 : 0);
      gl.uniform2f(p.u.u_jitter, (this.frame % 32) * 3.17, 0);
      gl.bindVertexArray(this.emptyVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.volFBO);
      gl.viewport(0, 0, this.volTex.width, this.volTex.height);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    }

    // ---- bloom ----
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.emptyVAO);
    {
      const p = this.pDown; gl.useProgram(p.program);
      let src = this.hdrTex, sw = W, sh = H;
      for (let i = 0; i < this.bloomTex.length; i++) {
        const t = this.bloomTex[i];
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFBO[i]);
        gl.viewport(0, 0, t.width, t.height);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform1i(p.u.u_src, 0);
        gl.uniform2f(p.u.u_texel, 1 / sw, 1 / sh);
        gl.uniform1f(p.u.u_first, i === 0 ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        src = t; sw = t.width; sh = t.height;
      }
      // exposure luminance source: downsample from mip 2 into lum texture
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.lumFBO);
      gl.viewport(0, 0, 64, 36);
      gl.useProgram(this.pCopy.program);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.bloomTex[2]); gl.uniform1i(this.pCopy.u.u_src, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      const pu = this.pUp; gl.useProgram(pu.program);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = this.bloomTex.length - 1; i > 0; i--) {
        const src2 = this.bloomTex[i], dst = this.bloomTex[i - 1];
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFBO[i - 1]);
        gl.viewport(0, 0, dst.width, dst.height);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src2); gl.uniform1i(pu.u.u_src, 0);
        gl.uniform2f(pu.u.u_texel, 1 / src2.width, 1 / src2.height);
        gl.uniform1f(pu.u.u_radius, 1.0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.BLEND);
    }
    // ---- exposure ----
    {
      const next = 1 - this.expIdx;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.expFBO[next]);
      gl.viewport(0, 0, 1, 1);
      const p = this.pExposure; gl.useProgram(p.program);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.lumTex); gl.uniform1i(p.u.u_src, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.expTex[this.expIdx]); gl.uniform1i(p.u.u_prev, 1);
      gl.uniform1f(p.u.u_dt, F.dt);
      gl.uniform1f(p.u.u_minExp, 0.35);
      gl.uniform1f(p.u.u_maxExp, F.maxExposure || 9.0);
      gl.uniform1f(p.u.u_bias, F.exposureBias || 1.0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.expIdx = next;
    }
    // ---- composite ----
    const useFXAA = this.q.fxaa;
    gl.bindFramebuffer(gl.FRAMEBUFFER, useFXAA ? this.ldrFBO : null);
    gl.viewport(0, 0, useFXAA ? W : this.canvas.width, useFXAA ? H : this.canvas.height);
    {
      const p = this.pComposite; gl.useProgram(p.program);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.hdrTex); gl.uniform1i(p.u.u_hdr, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.bloomTex[0]); gl.uniform1i(p.u.u_bloom, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.volTex); gl.uniform1i(p.u.u_vol, 2);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.expTex[this.expIdx]); gl.uniform1i(p.u.u_exposure, 3);
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.copyDepth); gl.uniform1i(p.u.u_depth, 4);
      gl.uniform1f(p.u.u_bloomStr, F.bloomStrength ?? 0.055);
      gl.uniform1f(p.u.u_volStr, volOn ? 1 : 0);
      gl.uniform1f(p.u.u_underwater, F.underwater ? 1 : 0);
      gl.uniform3fv(p.u.u_waterColor, F.underwaterColor || [0.02, 0.08, 0.12]);
      gl.uniform1f(p.u.u_near, this.near); gl.uniform1f(p.u.u_far, this.far);
      gl.uniform1f(p.u.u_time, F.time);
      gl.uniform1f(p.u.u_saturation, F.saturation ?? 1.08);
      gl.uniform3fv(p.u.u_grade, F.grade || [1, 1, 1]);
      gl.uniform1f(p.u.u_vignette, F.vignette ?? 0.55);
      gl.uniform1f(p.u.u_hurt, F.hurt || 0);
      gl.uniform1f(p.u.u_lava, F.inLava ? 1 : 0);
      // project the sun onto the screen for glare
      let glare = 0, su = 0, sv = 0;
      if ((F.glare ?? 0) > 0 && F.sunDir[1] > -0.02 && !F.underwater) {
        const sd = F.sunDir, m = this.viewProj;
        const cx = m[0] * sd[0] + m[4] * sd[1] + m[8] * sd[2], cy = m[1] * sd[0] + m[5] * sd[1] + m[9] * sd[2], cw = m[3] * sd[0] + m[7] * sd[1] + m[11] * sd[2];
        if (cw > 0.01) { su = cx / cw * 0.5 + 0.5; sv = cy / cw * 0.5 + 0.5; glare = F.glare * Math.min(1, (F.sunDir[1] + 0.02) * 6); }
      }
      gl.uniform3f(p.u.u_sunUV, su, sv, glare);
      gl.uniform1f(p.u.u_aspect, W / H);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    if (useFXAA) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      const p = this.pFXAA; gl.useProgram(p.program);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.ldrTex); gl.uniform1i(p.u.u_src, 0);
      gl.uniform2f(p.u.u_texel, 1 / W, 1 / H);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindVertexArray(null);
  }

  _bindLitTextures(p) {
    const gl = this.gl;
    const u = p.u;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.albedoArray); gl.uniform1i(u.u_albedo, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.normalArray); if (u.u_normals) gl.uniform1i(u.u_normals, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.shadowTex); if (u.u_shadowMap) gl.uniform1i(u.u_shadowMap, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.skyLUT); if (u.u_skyLUT) gl.uniform1i(u.u_skyLUT, 3);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_3D, this.noise3D); if (u.u_noise3D) gl.uniform1i(u.u_noise3D, 4);
  }

  _blitToCopy(withColor) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.mainFBO);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.copyFBO);
    gl.blitFramebuffer(0, 0, this.W, this.H, 0, 0, this.W, this.H, (withColor ? gl.COLOR_BUFFER_BIT : 0) | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  }

  _buildShadowMatrix(F) {
    const L = F.light.lightDir;
    const D = this.q.shadowDist;
    const up = Math.abs(L[1]) > 0.98 ? [0, 0, 1] : [0, 1, 0];
    const view = mat4.lookAt(mat4.create(), [L[0] * 300, L[1] * 300, L[2] * 300], [0, 0, 0], up);
    // snap camera position in light space to texels (reduces shimmering)
    const cam = F.camPos;
    const lx = view[0] * cam[0] + view[4] * cam[1] + view[8] * cam[2];
    const ly = view[1] * cam[0] + view[5] * cam[1] + view[9] * cam[2];
    const texel = (2 * D / this.q.shadowRes) * 0.15;
    const sx = lx - Math.floor(lx / texel) * texel, sy = ly - Math.floor(ly / texel) * texel;
    const snap = mat4.create(); mat4.translate(snap, snap, sx, sy, 0);
    const proj = mat4.ortho(mat4.create(), -D, D, -D, D, 20, 600);
    const pv = mat4.multiply(mat4.create(), snap, view);
    mat4.multiply(this.shadowMat, proj, pv);
    this.shadowTexel = texel;
    // planes for culling (undistorted ortho box)
    frustumPlanes(this.shadowMat, this.shadowPlanes);
  }

  // ---- helpers for overlays ----
  drawLines(verts, offset, color) {
    const gl = this.gl;
    const p = this.pLine; gl.useProgram(p.program);
    gl.uniformMatrix4fv(p.u.u_viewProj, false, this.viewProj);
    gl.uniform3fv(p.u.u_offset, offset);
    gl.uniform4fv(p.u.u_color, color);
    gl.bindVertexArray(this.lineVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVBO);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts);
    gl.drawArrays(gl.LINES, 0, verts.length / 3);
  }
}

export { QUALITY, HEIGHT };
