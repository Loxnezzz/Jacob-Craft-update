// Renders entities (instanced box models with procedural pixel textures), 3D item models, particles and the held item.
import { createProgram } from './gl.js';
import { HEADER, COMMON } from './shaders.js';
import { mat4 } from '../core/math.js';
import { ITEMS } from '../game/items.js';
import { BLOCKS, SHAPE, TINT, BLOCK_FACE_TEX, BLOCK_FRONT_TEX, texLayer } from '../world/blocks.js';
import { TS } from './texgen.js';
import { BIRCH_TINT, PINE_TINT } from '../world/biomes.js';

// ------------------------------------------------------------------ shaders
const BOX_VS = HEADER + `
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_nrm;
layout(location=2) in vec4 i_m0;
layout(location=3) in vec4 i_m1;
layout(location=4) in vec4 i_m2;
layout(location=5) in vec4 i_m3;
layout(location=6) in vec4 i_col;
layout(location=7) in vec4 i_col2;
layout(location=8) in vec4 i_size;
layout(location=9) in vec4 i_light;
uniform mat4 u_viewProj;
uniform mat4 u_shadowMat;
uniform float u_shadowTexel;
uniform float u_shadowPass;
out vec3 v_local;
out vec3 v_nrm;
out vec3 v_wn;
out vec3 v_rel;
out vec4 v_col;
out vec4 v_col2;
out vec4 v_size;
out vec4 v_light;
out vec3 v_shadow;
void main() {
  mat4 M = mat4(i_m0, i_m1, i_m2, i_m3);
  vec4 wp = M * vec4(a_pos, 1.0);
  v_local = a_pos;
  v_nrm = a_nrm;
  v_wn = normalize(mat3(M) * a_nrm);
  v_rel = wp.xyz;
  v_col = i_col; v_col2 = i_col2; v_size = i_size; v_light = i_light;
  if (u_shadowPass > 0.5) {
    vec4 sp = u_shadowMat * wp;
    sp.xy /= length(sp.xy) * 0.85 + 0.15;
    gl_Position = sp;
    v_shadow = vec3(0.0);
    return;
  }
  vec4 sp0 = u_shadowMat * wp;
  float df = length(sp0.xy) * 0.85 + 0.15;
  v_shadow = (u_shadowMat * vec4(wp.xyz + v_wn * u_shadowTexel * df * 1.5, 1.0)).xyz;
  gl_Position = u_viewProj * wp;
}`;

const BOX_FS = HEADER + COMMON + `
in vec3 v_local;
in vec3 v_nrm;
in vec3 v_wn;
in vec3 v_rel;
in vec4 v_col;
in vec4 v_col2;
in vec4 v_size;
in vec4 v_light;
in vec3 v_shadow;
uniform sampler2DShadow u_shadowMap;
uniform float u_shadowPass;
uniform float u_shadowsOn;
layout(location=0) out vec4 o_col;
layout(location=1) out vec4 o_nrm;

float h21(vec2 p, float s) { p += s * 17.13; vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float shadowAt(vec3 sp) {
  float df = length(sp.xy) * 0.85 + 0.15;
  vec2 d = sp.xy / df;
  float edge = max(abs(d.x), abs(d.y));
  if (edge > 0.995 || abs(sp.z) > 0.995) return 1.0;
  vec3 c = vec3(d * 0.5 + 0.5, sp.z * 0.5 + 0.5 - 0.0004);
  float s = 0.0;
  float r = 1.3 / u_shadowSize;
  for (int i = 0; i < 6; i++) s += texture(u_shadowMap, vec3(c.xy + POISSON[i] * r, c.z));
  return mix(s / 6.0, 1.0, smoothstep(0.85, 0.99, edge));
}

void main() {
  if (u_shadowPass > 0.5) { o_col = vec4(1.0); o_nrm = vec4(0.0); return; }
  vec3 an = abs(v_nrm);
  vec3 lp = v_local * v_size.xyz;
  vec2 puv = an.x > 0.5 ? lp.zy : an.y > 0.5 ? lp.xz : lp.xy;
  vec2 cell = floor(puv + 1e-3);
  float seed = v_size.w + (an.x > 0.5 ? 3.0 : an.y > 0.5 ? 7.0 : 11.0) + sign(dot(v_nrm, vec3(1.0, 2.0, 3.0))) * 5.0;
  float n = h21(cell, seed);
  int pat = int(v_col.a + 0.5);
  vec3 c1 = pow(v_col.rgb, vec3(2.2)), c2 = pow(v_col2.rgb, vec3(2.2));
  float param = v_col2.a;
  vec3 base = c1;
  float emis = v_light.w;
  float spec = 0.0;
  if (pat == 0) base = c1 * (0.9 + 0.12 * n);
  else if (pat == 1) { // fur
    float streak = h21(vec2(cell.x, floor(cell.y / 3.0)), seed + 1.0);
    base = c1 * (0.78 + 0.18 * streak + 0.1 * n);
    if (n > 0.92) base = mix(base, c2, 0.6);
  } else if (pat == 2) { // spots: smooth blobs in box space, snapped to pixel cells so they read as pixel art
    vec3 q = (floor(v_local * v_size.xyz + 1e-3) + 0.5) / max(param, 1.0) * 0.62 + v_size.w * 0.37;
    vec3 qi = floor(q), qf = fract(q); qf = qf * qf * (3.0 - 2.0 * qf);
    float a000 = h21(qi.xy + qi.z * 7.31, 2.0), a100 = h21(qi.xy + vec2(1, 0) + qi.z * 7.31, 2.0);
    float a010 = h21(qi.xy + vec2(0, 1) + qi.z * 7.31, 2.0), a110 = h21(qi.xy + vec2(1, 1) + qi.z * 7.31, 2.0);
    float a001 = h21(qi.xy + (qi.z + 1.0) * 7.31, 2.0), a101 = h21(qi.xy + vec2(1, 0) + (qi.z + 1.0) * 7.31, 2.0);
    float a011 = h21(qi.xy + vec2(0, 1) + (qi.z + 1.0) * 7.31, 2.0), a111 = h21(qi.xy + vec2(1, 1) + (qi.z + 1.0) * 7.31, 2.0);
    float sp = mix(mix(mix(a000, a100, qf.x), mix(a010, a110, qf.x), qf.y), mix(mix(a001, a101, qf.x), mix(a011, a111, qf.x), qf.y), qf.z);
    base = (sp > 0.56 ? c2 : c1) * (0.93 + 0.07 * n);
  } else if (pat == 3) { // stripes
    float st = fract((puv.x + puv.y * 0.35) / max(param, 1.0));
    base = (st < 0.4 ? c2 : c1) * (0.9 + 0.12 * n);
  } else if (pat == 4) { // belly gradient (lighter underside)
    float t = clamp(1.0 - v_local.y * 1.6, 0.0, 1.0);
    base = mix(c1, c2, t * t) * (0.9 + 0.12 * n);
  } else if (pat == 5) { // rock with cracks
    float cr = h21(floor(cell / 2.0), seed + 4.0);
    base = c1 * (0.75 + 0.3 * n);
    if (cr > 0.86 || n < 0.08) base = c2 * 0.7;
  } else if (pat == 6) { // moss / leaves patches
    float m = h21(floor(cell / 2.0), seed + 6.0);
    base = mix(c1, c2, step(0.5, m)) * (0.75 + 0.3 * n);
  } else if (pat == 7) { // cloth weave
    float w = mod(cell.x + cell.y, 2.0);
    base = c1 * (0.88 + 0.08 * w + 0.06 * n);
    if (param > 0.5 && mod(cell.y, max(param, 2.0)) < 1.0) base = c2;
  } else if (pat == 8) { // metal
    base = c1 * (0.85 + 0.15 * n); spec = 0.8;
  } else if (pat == 9) { // bark
    float st = h21(vec2(cell.x, floor(cell.y / 4.0)), seed + 3.0);
    base = mix(c1, c2, step(0.65, st)) * (0.8 + 0.2 * n);
  } else if (pat == 10) { // scales
    vec2 sc = vec2(puv.x + mod(floor(puv.y / 2.0), 2.0), puv.y);
    vec2 f = fract(sc / 2.0);
    float edge = step(0.75, f.y) + step(0.8, f.x) * 0.5;
    base = mix(c1, c2, clamp(edge, 0.0, 1.0)) * (0.85 + 0.15 * n); spec = 0.35;
  } else if (pat == 11) { // lava cracks (glowing)
    float cr = h21(floor(cell / 2.0), seed + 9.0);
    bool crack = cr > 0.78 || n > 0.93;
    base = crack ? c2 : c1 * (0.7 + 0.3 * n);
    if (crack) emis = max(emis, 2.5);
  } else if (pat == 12) { // ice
    base = c1 * (0.9 + 0.15 * n); spec = 0.9;
    if (h21(vec2(cell.x - cell.y, 0.0), seed) > 0.85) base = c2;
  } else if (pat == 13) { // glow (eyes etc)
    base = c1; emis = max(emis, 3.0);
  } else if (pat == 14) { // feathers
    vec2 f = fract(vec2(puv.x / 2.0 + floor(puv.y / 2.0) * 0.5, puv.y / 2.0));
    base = mix(c1, c2, smoothstep(0.55, 0.9, f.y)) * (0.88 + 0.12 * n);
  } else if (pat == 15) { // flat (no noise)
    base = c1;
  }
  vec3 albedo = base;
  vec3 N = normalize(v_wn);
  float sky = v_light.x, blk = max(v_light.y, handLightAt(v_rel, normalize(v_wn)));
  float NdotL = max(dot(N, u_lightDir), 0.0);
  float sh = (u_shadowsOn > 0.5 && NdotL > 0.0) ? shadowAt(v_shadow) : 1.0;
  sh *= smoothstep(0.35, 0.85, sky);
  vec3 direct = u_lightColor * NdotL * sh;
  vec3 amb = mix(u_ambDown, u_ambUp, N.y * 0.5 + 0.5) * sky * sky;
  float bl = blk * blk * blk * 0.6 + blk * blk * 0.6;
  vec3 col = albedo * (direct + amb + u_blockColor * bl * 2.2 + vec3(0.012) + u_flash * sky * vec3(0.5, 0.55, 0.8));
  if (spec > 0.0) {
    float dist0 = length(v_rel);
    vec3 V = -v_rel / max(dist0, 1e-4);
    vec3 H = normalize(V + u_lightDir);
    col += u_lightColor * sh * pow(max(dot(N, H), 0.0), 60.0) * spec * 0.6;
  }
  col += albedo * emis;
  col = mix(col, vec3(0.85, 0.1, 0.07) * (0.3 + 0.7 * sky), clamp(v_light.z, 0.0, 1.0) * 0.42);
  float dist = length(v_rel);
  col = applyFog(col, v_rel, dist);
  o_col = vec4(col, 1.0);
  o_nrm = vec4(N * 0.5 + 0.5, spec > 0.5 ? 0.35 : 0.0);
}`;

const ITEM_VS = HEADER + `
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_nrm;
layout(location=2) in vec3 a_uvl;
layout(location=3) in vec4 a_tint;
uniform mat4 u_viewProj;
uniform mat4 u_model;
uniform mat4 u_shadowMat;
uniform float u_shadowTexel;
out vec3 v_uvl;
out vec3 v_nrm;
out vec4 v_tint;
out vec3 v_rel;
out vec3 v_shadow;
void main() {
  vec4 wp = u_model * vec4(a_pos, 1.0);
  v_uvl = a_uvl; v_tint = a_tint; v_rel = wp.xyz;
  v_nrm = normalize(mat3(u_model) * a_nrm);
  vec4 sp0 = u_shadowMat * wp;
  float df = length(sp0.xy) * 0.85 + 0.15;
  v_shadow = (u_shadowMat * vec4(wp.xyz + v_nrm * u_shadowTexel * df * 1.5, 1.0)).xyz;
  gl_Position = u_viewProj * wp;
}`;

const ITEM_FS = HEADER + COMMON + `
in vec3 v_uvl;
in vec3 v_nrm;
in vec4 v_tint;
in vec3 v_rel;
in vec3 v_shadow;
uniform sampler2DArray u_albedo;
uniform sampler2DArray u_items;
uniform sampler2DShadow u_shadowMap;
uniform vec4 u_light;
uniform float u_fogOn;
uniform float u_shadowsOn;
uniform float u_glint;
layout(location=0) out vec4 o_col;
layout(location=1) out vec4 o_nrm;
float shadowAt(vec3 sp) {
  float df = length(sp.xy) * 0.85 + 0.15;
  vec2 d = sp.xy / df;
  if (max(abs(d.x), abs(d.y)) > 0.995 || abs(sp.z) > 0.995) return 1.0;
  return texture(u_shadowMap, vec3(d * 0.5 + 0.5, sp.z * 0.5 + 0.5 - 0.0005));
}
void main() {
  vec4 t = v_tint.a > 0.5 ? texture(u_items, vec3(v_uvl.xy, v_uvl.z)) : texture(u_albedo, v_uvl);
  if (t.a < 0.4) discard;
  vec3 albedo = t.rgb * pow(v_tint.rgb, vec3(2.2));
  vec3 N = normalize(v_nrm);
  float sky = u_light.x, blk = max(u_light.y, handLightAt(v_rel, normalize(v_nrm)));
  float NdotL = max(dot(N, u_lightDir), 0.0);
  float sh = u_shadowsOn > 0.5 ? shadowAt(v_shadow) : 1.0;
  sh *= smoothstep(0.35, 0.85, sky);
  vec3 amb = mix(u_ambDown, u_ambUp, N.y * 0.5 + 0.5) * sky * sky;
  float bl = blk * blk * blk * 0.6 + blk * blk * 0.6;
  vec3 col = albedo * (u_lightColor * NdotL * sh + amb + u_blockColor * bl * 2.2 + vec3(0.02));
  col += albedo * u_light.w;
  col = mix(col, vec3(1.4), clamp(u_light.z, 0.0, 1.0)); // white flash (primed explosives)
  if (u_glint > 0.0) col += vec3(0.5, 0.3, 1.0) * u_glint * (0.5 + 0.5 * sin(u_time * 3.0 + v_uvl.x * 12.0 + v_uvl.y * 9.0));
  float dist = length(v_rel);
  if (u_fogOn > 0.5) col = applyFog(col, v_rel, dist);
  o_col = vec4(col, 1.0);
  o_nrm = vec4(N * 0.5 + 0.5, 0.0);
}`;

const PART_VS = HEADER + `
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 i_pos;   // xyz camera-relative, size
layout(location=2) in vec4 i_col;   // premultiplied-ish rgba (a = opacity, 0 = additive)
layout(location=3) in vec4 i_tex;   // layer, u0, v0, uvSize (layer < 0 => soft round)
layout(location=4) in vec4 i_ext;   // emissive, rotation, light, unused
uniform mat4 u_viewProj;
uniform vec3 u_camRight;
uniform vec3 u_camUp;
out vec2 v_uv;
out vec4 v_col;
out vec4 v_tex;
out vec4 v_ext;
out vec3 v_rel;
void main() {
  float r = i_ext.y;
  vec2 c = a_corner - 0.5;
  vec2 rc = vec2(c.x * cos(r) - c.y * sin(r), c.x * sin(r) + c.y * cos(r));
  vec3 p = i_pos.xyz + (u_camRight * rc.x + u_camUp * rc.y) * i_pos.w;
  v_uv = a_corner; v_col = i_col; v_tex = i_tex; v_ext = i_ext; v_rel = p;
  gl_Position = u_viewProj * vec4(p, 1.0);
}`;

const PART_FS = HEADER + COMMON + `
in vec2 v_uv;
in vec4 v_col;
in vec4 v_tex;
in vec4 v_ext;
in vec3 v_rel;
uniform sampler2DArray u_albedo;
out vec4 o;
void main() {
  vec3 col; float a;
  float light = v_ext.z;
  if (v_tex.x >= 0.0) {
    vec4 t = texture(u_albedo, vec3(v_tex.yz + v_uv * v_tex.w, v_tex.x));
    if (t.a < 0.5) discard;
    col = t.rgb * v_col.rgb;
    vec3 L = u_lightColor * 0.6 * smoothstep(0.3, 0.9, light) + u_ambUp * light * light + vec3(0.02);
    col *= L + v_ext.x;
    a = 1.0;
  } else {
    float d = length(v_uv - 0.5) * 2.0;
    float shape = v_tex.x < -2.5 ? 1.0 : v_tex.x < -1.5 ? step(d, 1.0) : smoothstep(1.0, 0.2, d); // -3 square chip, -2 dot, -1 soft puff
    if (shape <= 0.01) discard;
    vec3 L = v_ext.x > 0.0 ? vec3(v_ext.x) : (u_lightColor * 0.5 + u_ambUp * 1.2) * max(light, 0.08) + vec3(0.02);
    col = v_col.rgb * L * shape;
    a = v_col.a * shape;
  }
  float dist = length(v_rel);
  if (v_ext.x <= 0.0) col = mix(col, applyFog(col, v_rel, dist), 1.0);
  bool add = v_ext.w > 0.5;
  o = vec4(col * (add ? 1.0 : a), add ? 0.0 : a);
}`;

// ------------------------------------------------------------------ geometry helpers
// unit cube 0..1 with normals; 24 verts / 36 idx
function cubeGeometry() {
  const P = [], N = [], idx = [];
  const faces = [
    [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 0]],
    [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0], [-1, 0, 0]],
    [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0], [0, 1, 0]],
    [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, -1, 0]],
    [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]],
    [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, -1]],
  ];
  faces.forEach((f, fi) => {
    for (let k = 0; k < 4; k++) { P.push(...f[k]); N.push(...f[4]); }
    const b = fi * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  return { P: new Float32Array(P), N: new Float32Array(N), idx: new Uint16Array(idx) };
}

const DEFAULT_TINT = { [TINT.GRASS]: [0.52, 0.74, 0.34], [TINT.FOLIAGE]: [0.42, 0.64, 0.28], [TINT.BIRCH]: BIRCH_TINT, [TINT.PINE]: PINE_TINT, [TINT.WATER]: [0.3, 0.5, 0.9] };

export class EntityRenderer {
  constructor(renderer, iconFactory) {
    this.r = renderer;
    const gl = this.gl = renderer.gl;
    this.pBox = createProgram(gl, BOX_VS, BOX_FS, 'box');
    this.pItem = createProgram(gl, ITEM_VS, ITEM_FS, 'item');
    this.pPart = createProgram(gl, PART_VS, PART_FS, 'particle');
    this.icons = iconFactory;
    // cube
    const cube = cubeGeometry();
    this.boxVAO = gl.createVertexArray();
    gl.bindVertexArray(this.boxVAO);
    const pb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.bufferData(gl.ARRAY_BUFFER, cube.P, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const nb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.bufferData(gl.ARRAY_BUFFER, cube.N, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cube.idx, gl.STATIC_DRAW);
    this.instBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    this.instCap = 4096;
    this.instData = new Float32Array(this.instCap * 32);
    gl.bufferData(gl.ARRAY_BUFFER, this.instData.byteLength, gl.DYNAMIC_DRAW);
    for (let i = 0; i < 8; i++) {
      gl.enableVertexAttribArray(2 + i);
      gl.vertexAttribPointer(2 + i, 4, gl.FLOAT, false, 128, i * 16);
      gl.vertexAttribDivisor(2 + i, 1);
    }
    gl.bindVertexArray(null);
    this.instCount = 0;

    // item sprite array (16x16)
    this.itemLayer = [];
    const sprites = [];
    for (const it of ITEMS) if (it && iconFactory.sprites[it.id]) { this.itemLayer[it.id] = sprites.length; sprites.push(iconFactory.sprites[it.id]); }
    this.itemArray = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.itemArray);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.SRGB8_ALPHA8, 16, 16, Math.max(1, sprites.length));
    const all = new Uint8Array(16 * 16 * 4 * Math.max(1, sprites.length));
    sprites.forEach((d, i) => all.set(d, i * 1024));
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, 16, 16, Math.max(1, sprites.length), gl.RGBA, gl.UNSIGNED_BYTE, all);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.spriteData = sprites;
    this.itemMeshes = new Map();

    // particles
    this.partVAO = gl.createVertexArray();
    gl.bindVertexArray(this.partVAO);
    const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.partBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.partBuf);
    this.partCap = 8192;
    this.partData = new Float32Array(this.partCap * 16);
    gl.bufferData(gl.ARRAY_BUFFER, this.partData.byteLength, gl.DYNAMIC_DRAW);
    for (let i = 0; i < 4; i++) {
      gl.enableVertexAttribArray(1 + i);
      gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, 64, i * 16);
      gl.vertexAttribDivisor(1 + i, 1);
    }
    gl.bindVertexArray(null);
    this.tmpM = mat4.create();
  }

  // ---------------- box instances ----------------
  beginBoxes() { this.instCount = 0; }
  // M: model matrix (camera-relative, maps unit cube), col [r,g,b], pat, col2, param, size [px], seed, light [sky, blk, hurt, emis]
  pushBox(M, col, pat, col2, param, sx, sy, sz, seed, light) {
    if (this.instCount >= this.instCap) {
      this.instCap *= 2;
      const nd = new Float32Array(this.instCap * 32); nd.set(this.instData); this.instData = nd;
      const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf); gl.bufferData(gl.ARRAY_BUFFER, this.instData.byteLength, gl.DYNAMIC_DRAW);
    }
    const o = this.instCount * 32, d = this.instData;
    d.set(M, o);
    d[o + 16] = col[0]; d[o + 17] = col[1]; d[o + 18] = col[2]; d[o + 19] = pat;
    d[o + 20] = col2[0]; d[o + 21] = col2[1]; d[o + 22] = col2[2]; d[o + 23] = param;
    d[o + 24] = sx; d[o + 25] = sy; d[o + 26] = sz; d[o + 27] = seed;
    d[o + 28] = light[0]; d[o + 29] = light[1]; d[o + 30] = light[2]; d[o + 31] = light[3];
    this.instCount++;
  }

  drawBoxes(F, shadowPass = false, opts = {}) {
    const data = opts.data || this.instData, count = opts.count ?? this.instCount;
    if (!count) return;
    const gl = this.gl, r = this.r;
    const p = this.pBox;
    if (shadowPass) {
      gl.useProgram(p.program);
      gl.uniformMatrix4fv(p.u.u_shadowMat, false, r.shadowMat);
      gl.uniform1f(p.u.u_shadowPass, 1);
      // every sampler the program declares must see a compatible texture, even though the depth-only pass never
      // reads them (otherwise the draw is rejected): a stand-in depth texture for the shadow map, which is the
      // render target right now and so cannot be bound itself
      if (!this.dummyDepth) {
        const t = this.dummyDepth = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT16, 1, 1, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
      }
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.dummyDepth); gl.uniform1i(p.u.u_shadowMap, 2);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, r.skyLUT); gl.uniform1i(p.u.u_skyLUT, 3);
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_3D, r.noise3D); gl.uniform1i(p.u.u_noise3D, 4);
    } else {
      r.setCommon(p);
      gl.uniform1f(p.u.u_shadowPass, 0);
      if (opts.noShadow) gl.uniform1f(p.u.u_shadowsOn, 0);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, r.shadowTex); gl.uniform1i(p.u.u_shadowMap, 2);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, r.skyLUT); gl.uniform1i(p.u.u_skyLUT, 3);
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_3D, r.noise3D); gl.uniform1i(p.u.u_noise3D, 4);
    }
    gl.bindVertexArray(this.boxVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * 32);
    gl.drawElementsInstanced(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, count);
    gl.bindVertexArray(null);
  }

  // Creature/entity boxes are kept for the next frame's sun-shadow pass (which runs before they are rebuilt).
  // Without this the shadow pass drew whatever was pushed last: the first-person arm, which then shadowed itself.
  snapshotShadow(camPos) {
    const n = this.instCount * 32;
    if (!this.shadowData || this.shadowData.length < n) this.shadowData = new Float32Array(Math.max(n, 32 * 256));
    this.shadowData.set(this.instData.subarray(0, n));
    this.shadowCount = this.instCount;
    this.shadowCam = [camPos[0], camPos[1], camPos[2]];
  }
  drawShadowSnapshot(F) {
    if (!this.shadowCount) return;
    // matrices are camera-relative: shift last frame's boxes to this frame's camera
    const d = this.shadowData, c = this.shadowCam, ox = c[0] - F.camPos[0], oy = c[1] - F.camPos[1], oz = c[2] - F.camPos[2];
    if (ox || oy || oz) for (let i = 0; i < this.shadowCount; i++) { const o = i * 32; d[o + 12] += ox; d[o + 13] += oy; d[o + 14] += oz; }
    this.shadowCam = [F.camPos[0], F.camPos[1], F.camPos[2]];
    if (this.shadowCount > this.instCap) return;
    this.drawBoxes(F, true, { data: d, count: this.shadowCount });
  }

  // ---------------- item models ----------------
  itemMesh(id) {
    let m = this.itemMeshes.get(id);
    if (m) return m;
    const it = ITEMS[id];
    const verts = []; // pos3 nrm3 uvl3 tint4
    const push = (p, n, uv, layer, tint, isItem) => verts.push(p[0], p[1], p[2], n[0], n[1], n[2], uv[0], uv[1], layer, tint[0], tint[1], tint[2], isItem ? 1 : 0);
    const quad = (pts, n, uvs, layer, tint, isItem) => { for (const k of [0, 1, 2, 0, 2, 3]) push(pts[k], n, uvs[k], layer, tint, isItem); };
    let isBlockCube = false;
    if (it.block >= 0 && !it.flatIcon) {
      isBlockCube = true;
      const b = BLOCKS[it.block];
      const tint = b.tint ? DEFAULT_TINT[b.tint] : [1, 1, 1];
      let h = 1;
      if (b.shape === SHAPE.SLAB) h = 0.5; else if (b.shape === SHAPE.SNOW_LAYER) h = 0.125; else if (b.shape === SHAPE.FARMLAND || b.shape === SHAPE.PATH) h = 15 / 16;
      const faces = [
        [[[1, 0, 1], [1, 0, 0], [1, h, 0], [1, h, 1]], [1, 0, 0]],
        [[[0, 0, 0], [0, 0, 1], [0, h, 1], [0, h, 0]], [-1, 0, 0]],
        [[[0, h, 1], [1, h, 1], [1, h, 0], [0, h, 0]], [0, 1, 0]],
        [[[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], [0, -1, 0]],
        [[[0, 0, 1], [1, 0, 1], [1, h, 1], [0, h, 1]], [0, 0, 1]],
        [[[1, 0, 0], [0, 0, 0], [0, h, 0], [1, h, 0]], [0, 0, -1]],
      ];
      // furniture/stairs: one textured box per model part, otherwise a (possibly short) cube
      const parts = b.shape === SHAPE.MODEL ? b.modelBoxes
        : b.shape === SHAPE.STAIRS ? [{ lo: [0, 0, 0], hi: [1, 0.5, 1], tex: -1 }, { lo: [0, 0.5, 0], hi: [1, 1, 0.5], tex: -1 }]
        : [{ lo: [0, 0, 0], hi: [1, h, 1], tex: -1 }];
      const yOff = b.shape === SHAPE.MODEL || b.shape === SHAPE.STAIRS ? 0.5 : h / 2;
      for (const part of parts) {
        const [x0, y0, z0] = part.lo, [x1, y1, z1] = part.hi;
        const pf = [
          [[[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], [[1 - z1, 1 - y0], [1 - z0, 1 - y0], [1 - z0, 1 - y1], [1 - z1, 1 - y1]]],
          [[[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], [[z0, 1 - y0], [z1, 1 - y0], [z1, 1 - y1], [z0, 1 - y1]]],
          [[[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], [[x0, z1], [x1, z1], [x1, z0], [x0, z0]]],
          [[[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]],
          [[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], [[x0, 1 - y0], [x1, 1 - y0], [x1, 1 - y1], [x0, 1 - y1]]],
          [[[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], [[1 - x1, 1 - y0], [1 - x0, 1 - y0], [1 - x0, 1 - y1], [1 - x1, 1 - y1]]],
        ];
        pf.forEach(([pts, n, uvs], f) => {
          let layer = part.tex >= 0 ? part.tex : BLOCK_FACE_TEX[b.id * 6 + f];
          if (f === 4 && BLOCK_FRONT_TEX[b.id] >= 0 && part.tex < 0) layer = BLOCK_FRONT_TEX[b.id];
          const tt = b.name === 'grass' && f !== 2 ? [1, 1, 1] : tint;
          quad(pts.map(p => [p[0] - 0.5, p[1] - yOff, p[2] - 0.5]), n, uvs, layer, tt, false);
        });
      }
      void faces;
    } else {
      // extruded sprite
      let w, data, layer, isItem, tint = [1, 1, 1];
      if (it.block >= 0) {
        const b = BLOCKS[it.block];
        layer = BLOCK_FACE_TEX[b.id * 6];
        if (b.shape === SHAPE.DOOR) layer = texLayer('door_bottom');
        w = TS; isItem = false;
        data = this.r.texData.albedo.subarray(layer * TS * TS * 4, (layer + 1) * TS * TS * 4);
        if (b.tint) tint = DEFAULT_TINT[b.tint];
      } else {
        layer = this.itemLayer[id];
        w = 16; isItem = true;
        data = this.spriteData[layer];
      }
      const px = 1 / w, depth = 1 / 16;
      const z0 = -depth / 2, z1 = depth / 2;
      const P = (x, y, z) => [x - 0.5, 0.5 - y, z];
      quad([P(0, 1, z1), P(1, 1, z1), P(1, 0, z1), P(0, 0, z1)], [0, 0, 1], [[0, 1], [1, 1], [1, 0], [0, 0]], layer, tint, isItem);
      quad([P(1, 1, z0), P(0, 1, z0), P(0, 0, z0), P(1, 0, z0)], [0, 0, -1], [[1, 1], [0, 1], [0, 0], [1, 0]], layer, tint, isItem);
      const op = (x, y) => x >= 0 && y >= 0 && x < w && y < w && data[(y * w + x) * 4 + 3] > 100;
      for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
        if (!op(x, y)) continue;
        const u = (x + 0.5) / w, v = (y + 0.5) / w;
        const uv4 = [[u, v], [u, v], [u, v], [u, v]];
        const X0 = x * px, X1 = (x + 1) * px, Y0 = y * px, Y1 = (y + 1) * px;
        if (!op(x - 1, y)) quad([P(X0, Y1, z0), P(X0, Y1, z1), P(X0, Y0, z1), P(X0, Y0, z0)], [-1, 0, 0], uv4, layer, tint, isItem);
        if (!op(x + 1, y)) quad([P(X1, Y1, z1), P(X1, Y1, z0), P(X1, Y0, z0), P(X1, Y0, z1)], [1, 0, 0], uv4, layer, tint, isItem);
        if (!op(x, y - 1)) quad([P(X0, Y0, z1), P(X1, Y0, z1), P(X1, Y0, z0), P(X0, Y0, z0)], [0, 1, 0], uv4, layer, tint, isItem);
        if (!op(x, y + 1)) quad([P(X0, Y1, z0), P(X1, Y1, z0), P(X1, Y1, z1), P(X0, Y1, z1)], [0, -1, 0], uv4, layer, tint, isItem);
      }
    }
    const gl = this.gl;
    const arr = new Float32Array(verts);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 52, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 52, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 52, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 52, 36);
    gl.bindVertexArray(null);
    m = { vao, count: arr.length / 13, cube: isBlockCube };
    this.itemMeshes.set(id, m);
    return m;
  }

  beginItems(F, opts = {}) {
    const gl = this.gl, r = this.r, p = this.pItem;
    r.setCommon(p);
    if (opts.viewProj) gl.uniformMatrix4fv(p.u.u_viewProj, false, opts.viewProj);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, r.albedoArray); gl.uniform1i(p.u.u_albedo, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.itemArray); gl.uniform1i(p.u.u_items, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, r.shadowTex); gl.uniform1i(p.u.u_shadowMap, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, r.skyLUT); gl.uniform1i(p.u.u_skyLUT, 3);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_3D, r.noise3D); gl.uniform1i(p.u.u_noise3D, 4);
    gl.uniform1f(p.u.u_fogOn, opts.noFog ? 0 : 1);
    if (opts.noShadow) gl.uniform1f(p.u.u_shadowsOn, 0);
  }

  drawItem(id, M, light, glint = 0) {
    const gl = this.gl, p = this.pItem;
    const m = this.itemMesh(id);
    gl.uniformMatrix4fv(p.u.u_model, false, M);
    gl.uniform4fv(p.u.u_light, light);
    gl.uniform1f(p.u.u_glint, glint);
    gl.bindVertexArray(m.vao);
    gl.drawArrays(gl.TRIANGLES, 0, m.count);
  }

  // ---------------- particles ----------------
  drawParticles(F, list) {
    if (!list.length) return;
    const gl = this.gl, r = this.r, p = this.pPart;
    const cam = F.camPos;
    let n = Math.min(list.length, this.partCap);
    // sort back to front
    const arr = list.slice(0, n);
    for (const q of arr) q._d = (q.x - cam[0]) ** 2 + (q.y - cam[1]) ** 2 + (q.z - cam[2]) ** 2;
    arr.sort((a, b) => b._d - a._d);
    const d = this.partData;
    for (let i = 0; i < n; i++) {
      const q = arr[i], o = i * 16;
      d[o] = q.x - cam[0]; d[o + 1] = q.y - cam[1]; d[o + 2] = q.z - cam[2]; d[o + 3] = q.size;
      d[o + 4] = q.r; d[o + 5] = q.g; d[o + 6] = q.b; d[o + 7] = q.a;
      d[o + 8] = q.layer; d[o + 9] = q.u0 || 0; d[o + 10] = q.v0 || 0; d[o + 11] = q.uvs || 0.2;
      d[o + 12] = q.emis || 0; d[o + 13] = q.rot || 0; d[o + 14] = q.light ?? 1; d[o + 15] = q.add ? 1 : 0;
    }
    r.setCommon(p);
    const v = r.view;
    gl.uniform3f(p.u.u_camRight, v[0], v[4], v[8]);
    gl.uniform3f(p.u.u_camUp, v[1], v[5], v[9]);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, r.albedoArray); gl.uniform1i(p.u.u_albedo, 0);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, r.skyLUT); gl.uniform1i(p.u.u_skyLUT, 3);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_3D, r.noise3D); gl.uniform1i(p.u.u_noise3D, 4);
    gl.bindVertexArray(this.partVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.partBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, d, 0, n * 16);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.bindVertexArray(null);
  }
}
