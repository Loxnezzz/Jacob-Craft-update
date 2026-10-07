// GPU precipitation (rain streaks / snow flakes occluded by a height map) and lightning bolts.
import { createProgram } from './gl.js';
import { HEADER } from './shaders.js';

const HM = 128; // heightmap window size (blocks)

const PRECIP_VS = HEADER + `
layout(location=0) in vec2 a_corner;
uniform mat4 u_viewProj;
uniform vec3 u_camPos;     // absolute camera position
uniform vec3 u_camFrac;    // camera pos mod 1024 (x,z)
uniform float u_time;
uniform float u_snow;      // 0 rain, 1 snow
uniform vec2 u_wind;
uniform sampler2D u_height;
uniform vec2 u_hmOrigin;   // world x,z of heightmap texel 0
uniform float u_radius;
uniform float u_height2;
out vec2 v_uv;
out float v_vis;
out float v_dist;
float h11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void main() {
  float id = float(gl_InstanceID);
  float R = u_radius;
  float span = R * 2.0;
  // stable world-space column for this instance
  vec2 base = vec2(h11(id * 1.37), h11(id * 2.71 + 3.1)) * span;
  vec2 rel = mod(base - mod(u_camFrac.xz, span), span) - R;
  float speed = mix(18.0, 2.2, u_snow) * (0.8 + 0.4 * h11(id * 5.3));
  float H = u_height2;
  float fall = mod(h11(id * 7.7) * H - u_time * speed - u_camPos.y, H);
  float y = u_camPos.y + fall - H * 0.5;
  vec2 wxz = u_camPos.xz + rel;
  // snow sway
  if (u_snow > 0.5) { wxz += vec2(sin(u_time * 1.3 + id), cos(u_time * 1.1 + id * 1.7)) * 0.35; }
  wxz += u_wind * (H * 0.5 - fall) * mix(0.06, 0.25, u_snow);
  // occlusion
  vec2 huv = (wxz - u_hmOrigin) / 128.0;
  float top = texture(u_height, huv).r * 255.0;
  v_vis = (huv.x > 0.0 && huv.x < 1.0 && huv.y > 0.0 && huv.y < 1.0) ? step(top, y) : 1.0;
  vec3 c = vec3(wxz.x - u_camPos.x, y - u_camPos.y, wxz.y - u_camPos.z);
  v_dist = length(c);
  // billboard around y axis
  vec3 toCam = normalize(vec3(-c.x, 0.0, -c.z) + 1e-5);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  float w = mix(0.022, 0.07, u_snow);
  float len = mix(0.9, 0.07, u_snow);
  vec2 k = a_corner - 0.5;
  vec3 slant = vec3(u_wind.x, 0.0, u_wind.y) * mix(0.05, 0.0, u_snow);
  vec3 p = c + right * k.x * w * (u_snow > 0.5 ? 1.0 : 1.0) + vec3(0.0, k.y * len, 0.0) + slant * k.y;
  if (u_snow > 0.5) p += vec3(0.0, k.x * 0.0, 0.0) + vec3(0.0, k.y * w - k.y * len, 0.0);
  v_uv = a_corner;
  gl_Position = u_viewProj * vec4(p, 1.0);
}`;

const PRECIP_FS = HEADER + `
in vec2 v_uv;
in float v_vis;
in float v_dist;
uniform vec3 u_color;
uniform float u_alpha;
uniform float u_snow;
out vec4 o;
void main() {
  if (v_vis < 0.5) discard;
  float a;
  if (u_snow > 0.5) { float d = length(v_uv - 0.5) * 2.0; a = smoothstep(1.0, 0.3, d); }
  else { a = smoothstep(0.0, 0.5, v_uv.x) * smoothstep(1.0, 0.5, v_uv.x) * smoothstep(0.0, 0.3, v_uv.y) * smoothstep(1.0, 0.6, v_uv.y); }
  a *= u_alpha * smoothstep(1.0, 3.0, v_dist);
  o = vec4(u_color * a, a);
}`;

const BOLT_VS = HEADER + `
layout(location=0) in vec3 a_pos;
layout(location=1) in float a_w;
uniform mat4 u_viewProj;
out float v_w;
void main() { v_w = a_w; gl_Position = u_viewProj * vec4(a_pos, 1.0); }`;
const BOLT_FS = HEADER + `
in float v_w;
uniform float u_int;
out vec4 o;
void main() { float c = 1.0 - abs(v_w); o = vec4(vec3(6.0, 7.0, 12.0) * c * u_int, 0.0); }`;

export class PrecipRenderer {
  constructor(renderer) {
    this.r = renderer;
    const gl = this.gl = renderer.gl;
    this.p = createProgram(gl, PRECIP_VS, PRECIP_FS, 'precip');
    this.pBolt = createProgram(gl, BOLT_VS, BOLT_FS, 'bolt');
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.hmTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.hmTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, HM, HM, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.hmData = new Uint8Array(HM * HM);
    this.hmOrigin = [0, 0];
    this.hmTimer = 0;
    this.boltVAO = gl.createVertexArray();
    this.boltBuf = gl.createBuffer();
    gl.bindVertexArray(this.boltVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.boltBuf);
    gl.bufferData(gl.ARRAY_BUFFER, 4 * 4 * 6 * 2000, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 12);
    gl.bindVertexArray(null);
  }

  // rebuild heightmap window around camera (cheap; called a few times per second)
  updateHeightmap(world, cx, cz, dt, force = false) {
    this.hmTimer -= dt;
    const ox = Math.floor(cx) - HM / 2, oz = Math.floor(cz) - HM / 2;
    if (!force && this.hmTimer > 0 && Math.abs(ox - this.hmOrigin[0]) < 8 && Math.abs(oz - this.hmOrigin[1]) < 8) return;
    this.hmTimer = 0.5;
    this.hmOrigin = [ox, oz];
    const d = this.hmData;
    for (let z = 0; z < HM; z++) for (let x = 0; x < HM; x++) {
      d[z * HM + x] = Math.min(255, world.heightAt(ox + x, oz + z));
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.hmTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, HM, HM, gl.RED, gl.UNSIGNED_BYTE, d);
  }

  // height of rain occluder at x,z from CPU copy
  occluderAt(x, z) {
    const ix = Math.floor(x) - this.hmOrigin[0], iz = Math.floor(z) - this.hmOrigin[1];
    if (ix < 0 || iz < 0 || ix >= HM || iz >= HM) return -1;
    return this.hmData[iz * HM + ix];
  }

  draw(F, W) {
    const gl = this.gl, r = this.r;
    const amount = Math.max(W.localRain, W.localSnow);
    if (amount > 0.01) {
      const snow = W.localSnow > W.localRain ? 1 : 0;
      const p = this.p;
      gl.useProgram(p.program);
      gl.uniformMatrix4fv(p.u.u_viewProj, false, r.viewProj);
      gl.uniform3fv(p.u.u_camPos, F.camPos);
      gl.uniform3fv(p.u.u_camFrac, r.camFrac);
      gl.uniform1f(p.u.u_time, F.time);
      gl.uniform1f(p.u.u_snow, snow);
      const wd = W.windDir, ws = W.wind;
      gl.uniform2f(p.u.u_wind, Math.cos(wd) * ws, Math.sin(wd) * ws);
      gl.uniform2fv(p.u.u_hmOrigin, this.hmOrigin);
      gl.uniform1f(p.u.u_radius, snow ? 22 : 18);
      gl.uniform1f(p.u.u_height2, snow ? 30 : 36);
      const L = F.light;
      const amb = [L.ambUp[0] * 2.2 + L.lightColor[0] * 0.25 + W.flash * 2, L.ambUp[1] * 2.2 + L.lightColor[1] * 0.25 + W.flash * 2, L.ambUp[2] * 2.2 + L.lightColor[2] * 0.25 + W.flash * 2.4];
      gl.uniform3fv(p.u.u_color, snow ? amb.map(v => v * 1.6) : amb);
      gl.uniform1f(p.u.u_alpha, snow ? 0.9 : 0.32);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.hmTex); gl.uniform1i(p.u.u_height, 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.bindVertexArray(this.vao);
      const count = Math.floor((snow ? 9000 : 14000) * Math.min(1, amount) * (F.precipQuality || 1));
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.enable(gl.CULL_FACE);
    }
    if (W.bolts.length) this.drawBolts(F, W);
  }

  drawBolts(F, W) {
    const gl = this.gl, r = this.r;
    const verts = [];
    const cam = F.camPos;
    const v = r.view;
    const right = [v[0], v[4], v[8]];
    for (const b of W.bolts) {
      const inten = b.life / 0.35 * (0.7 + Math.random() * 0.6);
      for (const s of b.segs) {
        const w = s[6] * 1.4;
        const ax = s[0] - cam[0], ay = s[1] - cam[1], az = s[2] - cam[2];
        const bx = s[3] - cam[0], by = s[4] - cam[1], bz = s[5] - cam[2];
        const rx = right[0] * w, ry = right[1] * w, rz = right[2] * w;
        verts.push(ax - rx, ay - ry, az - rz, -1, ax + rx, ay + ry, az + rz, 1, bx + rx, by + ry, bz + rz, 1);
        verts.push(ax - rx, ay - ry, az - rz, -1, bx + rx, by + ry, bz + rz, 1, bx - rx, by - ry, bz - rz, -1);
      }
      this._int = inten;
    }
    if (!verts.length) return;
    const arr = new Float32Array(verts.slice(0, 4 * 6 * 2000));
    const p = this.pBolt;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(p.u.u_viewProj, false, r.viewProj);
    gl.uniform1f(p.u.u_int, this._int || 1);
    gl.bindVertexArray(this.boltVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.boltBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, arr);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, arr.length / 4);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
  }
}
