// GLSL sources for every render pass.

const HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;
precision highp sampler2DShadow;
precision highp sampler3D;
#define PI 3.14159265
`;

// Shared uniforms & helpers for lit surfaces
const COMMON = `
uniform vec3 u_sunDir;
uniform vec3 u_lightDir;
uniform vec3 u_lightColor;
uniform vec3 u_ambUp;
uniform vec3 u_ambDown;
uniform vec3 u_blockColor;
uniform vec4 u_handLight;   // a torch or lantern held by the player: camera-relative position, strength
float handLightAt(vec3 rel, vec3 N) {
  if (u_handLight.w <= 0.0) return 0.0;
  vec3 d = u_handLight.xyz - rel; float l = length(d);
  float f = clamp(1.0 - l / 12.0, 0.0, 1.0);
  return u_handLight.w * f * f * (0.6 + 0.4 * max(dot(N, d / max(l, 1e-3)), 0.0));
}
uniform vec3 u_sunScatter;
uniform float u_time;
uniform float u_camY;
uniform float u_fogDensity;
uniform float u_fogHeight;
uniform vec3 u_fogTint;
uniform float u_renderDist;
uniform float u_wetness;
uniform float u_flash;
uniform float u_shadowSize;
uniform float u_cloudShadow;
uniform vec2 u_cloudWind;
uniform sampler2D u_skyLUT;
uniform sampler3D u_noise3D;

const vec2 POISSON[12] = vec2[12](
  vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696, 0.457), vec2(-0.203, 0.621),
  vec2(0.962, -0.195), vec2(0.473, -0.480), vec2(0.519, 0.767), vec2(0.185, -0.893),
  vec2(0.507, 0.064), vec2(0.896, 0.412), vec2(-0.322, -0.933), vec2(-0.792, -0.598));

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i), b = hash12(i + vec2(1, 0)), c = hash12(i + vec2(0, 1)), d = hash12(i + vec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec2 skyLutUV(vec3 d) {
  float lat = asin(clamp(d.y, -1.0, 1.0));
  float v = 0.5 + 0.5 * sign(lat) * sqrt(abs(lat) / (PI * 0.5));
  float u = atan(d.z, d.x) / (2.0 * PI) + 0.5;
  return vec2(u, v);
}
vec3 skyColor(vec3 d) { return texture(u_skyLUT, skyLutUV(d)).rgb; }

vec3 faceN(int n) {
  if (n == 0) return vec3(1, 0, 0);
  if (n == 1) return vec3(-1, 0, 0);
  if (n == 2) return vec3(0, 1, 0);
  if (n == 3) return vec3(0, -1, 0);
  if (n == 4) return vec3(0, 0, 1);
  if (n == 5) return vec3(0, 0, -1);
  return vec3(0, 1, 0);
}
void faceTB(int n, out vec3 T, out vec3 B) {
  if (n == 0) { T = vec3(0, 0, -1); B = vec3(0, 1, 0); }
  else if (n == 1) { T = vec3(0, 0, 1); B = vec3(0, 1, 0); }
  else if (n == 2) { T = vec3(1, 0, 0); B = vec3(0, 0, -1); }
  else if (n == 3) { T = vec3(1, 0, 0); B = vec3(0, 0, 1); }
  else if (n == 4) { T = vec3(1, 0, 0); B = vec3(0, 1, 0); }
  else { T = vec3(-1, 0, 0); B = vec3(0, 1, 0); }
}

vec3 applyFog(vec3 col, vec3 rel, float dist) {
  vec3 dir = rel / max(dist, 1e-4);
  float b = u_fogHeight;
  float h0 = u_camY - 64.0;
  float dy = rel.y;
  float base = u_fogDensity * exp(-b * max(h0, -40.0));
  float fi = abs(b * dy) > 0.001 ? base * (1.0 - exp(-b * dy)) / (b * dy) * dist : base * dist;
  float f = 1.0 - exp(-max(fi, 0.0));
  float horiz = length(rel.xz);
  float border = smoothstep(u_renderDist * 0.70, u_renderDist * 0.97, horiz);
  f = max(f, border);
  vec3 fd = dir; fd.y = max(fd.y, 0.03);
  vec3 fc = skyColor(normalize(fd));
  float fl = dot(fc, vec3(0.299, 0.587, 0.114));
  fc = mix(fc, fl * vec3(0.9, 0.97, 1.06), smoothstep(0.0, -0.5, dir.y) * 0.45); // same haze as the sky below the horizon
  fc *= mix(vec3(1.0), u_fogTint, clamp(f * 1.6, 0.0, 1.0));
  float mu = max(dot(dir, u_sunDir), 0.0);
  fc += u_sunScatter * (pow(mu, 6.0) * 0.6 + pow(mu, 32.0)) * (1.0 - border * 0.6);
  return mix(col, fc, clamp(f, 0.0, 1.0));
}

float cloudShadowAt(vec3 absP) {
  if (u_cloudShadow <= 0.0) return 1.0;
  vec3 p = absP + u_lightDir * ((240.0 - absP.y) / max(u_lightDir.y, 0.15));
  vec3 q = vec3(p.x * 0.0018 + u_cloudWind.x, 0.35, p.z * 0.0018 + u_cloudWind.y);
  float n = texture(u_noise3D, q).r;
  float c = smoothstep(1.0 - u_cloudShadow, 1.0 - u_cloudShadow + 0.35, n);
  return 1.0 - c * 0.75;
}
`;

// ---------------- chunk (opaque/cutout) ----------------
export const CHUNK_VS = HEADER + `
layout(location=0) in vec4 a_pos;
layout(location=1) in vec2 a_uv;
layout(location=2) in float a_layer;
layout(location=3) in vec4 a_light;
layout(location=4) in vec4 a_tint;
uniform mat4 u_viewProj;
uniform vec3 u_chunkOff;
uniform vec3 u_camFrac;
uniform float u_time;
uniform float u_wind;
uniform mat4 u_shadowMat;
uniform float u_shadowTexel;
uniform vec3 u_lightDir;
out vec3 v_rel;
out vec3 v_abs;
out vec3 v_uvl;
out vec4 v_light;
out vec4 v_tint;
flat out int v_n;
out vec3 v_shadow;
vec3 faceN(int n) {
  if (n == 0) return vec3(1, 0, 0); if (n == 1) return vec3(-1, 0, 0); if (n == 2) return vec3(0, 1, 0);
  if (n == 3) return vec3(0, -1, 0); if (n == 4) return vec3(0, 0, 1); if (n == 5) return vec3(0, 0, -1);
  return vec3(0, 1, 0);
}
void main() {
  int w = int(a_pos.w);
  int n = w & 7;
  int wave = (w >> 3) & 3;
  bool mov = (w & 32) != 0;
  vec3 p = a_pos.xyz / 128.0 + u_chunkOff;
  vec3 absP = p + u_camFrac;
  if (mov && (wave == 1 || wave == 2)) {
    float ph = dot(absP, vec3(0.71, 0.33, 0.93));
    float s = u_time;
    float amp = (wave == 1 ? 0.03 : 0.07) * (0.35 + u_wind);
    vec3 off = vec3(sin(s * 1.9 + ph) + 0.5 * sin(s * 3.7 + ph * 1.7), 0.0, cos(s * 1.5 + ph * 1.3) + 0.5 * sin(s * 2.9 + ph * 0.7)) * amp;
    if (wave == 1) off.y = sin(s * 2.3 + ph * 2.1) * amp * 0.4;
    p += off;
  }
  v_rel = p; v_abs = absP;
  v_uvl = vec3(a_uv / 32.0, a_layer);
  v_light = a_light;
  v_tint = a_tint;
  v_n = n;
  vec3 N = faceN(n);
  vec4 sp0 = u_shadowMat * vec4(p, 1.0);
  float df = length(sp0.xy) * 0.85 + 0.15;
  vec3 off = (n == 6 ? u_lightDir : N) * u_shadowTexel * df * 1.6;
  v_shadow = (u_shadowMat * vec4(p + off, 1.0)).xyz;
  gl_Position = u_viewProj * vec4(p, 1.0);
}`;

export const CHUNK_FS = HEADER + COMMON + `
in vec3 v_rel;
in vec3 v_abs;
in vec3 v_uvl;
in vec4 v_light;
in vec4 v_tint;
flat in int v_n;
in vec3 v_shadow;
uniform sampler2DArray u_albedo;
uniform sampler2DArray u_normals;
uniform sampler2DShadow u_shadowMap;
uniform float u_shadowsOn;
uniform int u_debug;
layout(location=0) out vec4 o_col;
layout(location=1) out vec4 o_nrm;

float shadowAt(vec3 sp) {
  float df = length(sp.xy) * 0.85 + 0.15;
  vec2 d = sp.xy / df;
  float edge = max(abs(d.x), abs(d.y));
  if (edge > 0.995 || abs(sp.z) > 0.995) return 1.0;
  vec3 c = vec3(d * 0.5 + 0.5, sp.z * 0.5 + 0.5 - 0.00025);
  float s = 0.0;
  float r = 1.4 / u_shadowSize;
  for (int i = 0; i < 12; i++) s += texture(u_shadowMap, vec3(c.xy + POISSON[i] * r, c.z));
  s /= 12.0;
  return mix(s, 1.0, smoothstep(0.85, 0.99, edge));
}

void main() {
  vec4 alb = texture(u_albedo, v_uvl);
  int mt = int(v_tint.a + 0.5);
  int mat = mt & 7;
  float reflectLvl = float(mt >> 3) / 31.0;
  if (alb.a < 0.4) discard;
  if (mat == 2) {
    vec2 uv = v_uvl.xy + vec2(sin(u_time * 0.35 + v_abs.z * 0.4) * 0.06, u_time * 0.025);
    alb = texture(u_albedo, vec3(uv, v_uvl.z));
  }
  vec4 ns = texture(u_normals, v_uvl);
  vec3 tint = pow(v_tint.rgb / 255.0, vec3(2.2));
  vec3 albedo = alb.rgb * mix(vec3(1.0), tint, ns.b);
  vec3 N = faceN(v_n);
  vec3 T, Bt; faceTB(v_n, T, Bt);
  vec2 nxy = (ns.rg * 2.0 - 1.0);
  vec3 Nm = v_n == 6 ? vec3(0.0, 1.0, 0.0) : normalize(N * sqrt(max(0.0, 1.0 - dot(nxy, nxy))) + T * nxy.x + Bt * nxy.y);
  float sky = v_light.x / 255.0;
  float blk = v_light.y / 255.0;
  float ao = v_light.z / 3.0;
  ao = mix(0.32, 1.0, ao * ao * 0.4 + ao * 0.6);
  float dist = length(v_rel);
  vec3 V = v_rel / -max(dist, 1e-4);

  float skyGate = smoothstep(0.4, 0.9, sky);
  float geoNdotL = dot(N, u_lightDir);
  float shadow = 0.0;
  if (geoNdotL > 0.0 || v_n == 6 || mat == 5) {
    shadow = (u_shadowsOn > 0.5 ? shadowAt(v_shadow) : 1.0) * skyGate;
    shadow *= cloudShadowAt(v_abs);
  }
  float NdotL = max(dot(Nm, u_lightDir), 0.0);
  float diff = v_n == 6 ? 0.55 + 0.45 * max(u_lightDir.y, 0.0) : NdotL;
  if (mat == 5) diff = max(NdotL, 0.0) * 0.7 + 0.3;
  vec3 direct = u_lightColor * diff * shadow;
  if (mat == 5 || mat == 6) {
    float back = pow(max(dot(-V, u_lightDir), 0.0), 4.0);
    direct += u_lightColor * shadow * back * 0.9 * (0.5 + 0.5 * ns.b);
  }
  float skyAmb = sky * sky;
  vec3 amb = mix(u_ambDown, u_ambUp, Nm.y * 0.5 + 0.5) * skyAmb;
  blk = max(blk, handLightAt(v_rel, Nm));
  float bl = blk * blk * blk * 0.6 + blk * blk * 0.6;
  bl *= 1.0 + 0.05 * sin(u_time * 11.0 + v_abs.x * 1.3 + v_abs.z * 0.7);
  vec3 blockL = u_blockColor * bl * 2.2;
  vec3 minAmb = vec3(0.010, 0.010, 0.014);
  vec3 flash = u_flash * skyAmb * vec3(0.55, 0.6, 0.85);

  // wet surfaces
  float smoothv = max(ns.a, reflectLvl);
  float wet = 0.0;
  if (u_wetness > 0.0 && sky > 0.7) {
    float exposure = smoothstep(0.8, 0.97, sky);
    float pud = smoothstep(0.42, 0.62, vnoise(v_abs.xz * 0.11) * 0.7 + vnoise(v_abs.xz * 0.37) * 0.3);
    float up = smoothstep(0.6, 0.95, N.y);
    wet = u_wetness * exposure * (up * (0.45 + 0.55 * pud) + (1.0 - up) * 0.35);
    if (mat == 5 || mat == 6) wet *= 0.4;
    albedo *= mix(1.0, 0.58, wet * (1.0 - pud * up * 0.35));
    smoothv = max(smoothv, wet * (0.55 + 0.45 * pud * up));
    if (up > 0.5) Nm = normalize(mix(Nm, N, wet * pud));
  }

  vec3 col = albedo * (direct + (amb + blockL + minAmb + flash) * ao);

  if (smoothv > 0.02) {
    vec3 H = normalize(V + u_lightDir);
    float ndh = max(dot(Nm, H), 0.0);
    float rough = max(0.04, 1.0 - smoothv);
    float a2 = rough * rough * rough * rough;
    float dd = ndh * ndh * (a2 - 1.0) + 1.0;
    float D = a2 / (PI * dd * dd);
    float F = 0.04 + 0.96 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
    col += u_lightColor * shadow * NdotL * min(D * F * 0.25, 40.0) * smoothv;
  }
  int em = int(v_light.w + 0.5);
  float emis = float(em & 127) / 60.0;
  if (emis > 0.0) {
    float lum = dot(alb.rgb, vec3(0.3, 0.59, 0.11));
    float mask = (em >= 128) ? smoothstep(0.12, 0.45, lum) : 1.0;
    col += alb.rgb * emis * mask * 3.0;
  }
  col = applyFog(col, v_rel, dist);
  if (u_debug == 1) col = albedo;
  else if (u_debug == 2) col = vec3(ns.b);
  else if (u_debug == 3) col = tint;
  else if (u_debug == 4) col = vec3(shadow);
  else if (u_debug == 5) col = Nm * 0.5 + 0.5;
  else if (u_debug == 6) col = vec3(sky, blk, ao);
  o_col = vec4(col, 1.0);
  float refl = smoothv > 0.3 ? smoothv : 0.0;
  o_nrm = vec4(Nm * 0.5 + 0.5, refl);
}`;

// ---------------- shadow pass ----------------
export const SHADOW_VS = HEADER + `
layout(location=0) in vec4 a_pos;
layout(location=1) in vec2 a_uv;
layout(location=2) in float a_layer;
uniform vec3 u_chunkOff;
uniform vec3 u_camFrac;
uniform mat4 u_shadowMat;
uniform float u_time;
uniform float u_wind;
out vec3 v_uvl;
void main() {
  int w = int(a_pos.w);
  int wave = (w >> 3) & 3;
  bool mov = (w & 32) != 0;
  vec3 p = a_pos.xyz / 128.0 + u_chunkOff;
  if (mov && (wave == 1 || wave == 2)) {
    vec3 absP = p + u_camFrac;
    float ph = dot(absP, vec3(0.71, 0.33, 0.93));
    float amp = (wave == 1 ? 0.03 : 0.07) * (0.35 + u_wind);
    p += vec3(sin(u_time * 1.9 + ph) + 0.5 * sin(u_time * 3.7 + ph * 1.7), 0.0, cos(u_time * 1.5 + ph * 1.3) + 0.5 * sin(u_time * 2.9 + ph * 0.7)) * amp;
  }
  v_uvl = vec3(a_uv / 32.0, a_layer);
  vec4 sp = u_shadowMat * vec4(p, 1.0);
  float df = length(sp.xy) * 0.85 + 0.15;
  sp.xy /= df;
  gl_Position = sp;
}`;

export const SHADOW_FS = HEADER + `
in vec3 v_uvl;
uniform sampler2DArray u_albedo;
out vec4 o;
void main() {
  if (texture(u_albedo, v_uvl).a < 0.4) discard;
  o = vec4(1.0);
}`;

// ---------------- water / translucent ----------------
export const WATER_VS = HEADER + `
layout(location=0) in vec4 a_pos;
layout(location=1) in vec2 a_uv;
layout(location=2) in float a_layer;
layout(location=3) in vec4 a_light;
layout(location=4) in vec4 a_tint;
uniform mat4 u_viewProj;
uniform vec3 u_chunkOff;
uniform vec3 u_camFrac;
uniform float u_time;
uniform mat4 u_shadowMat;
uniform float u_shadowTexel;
out vec3 v_rel;
out vec3 v_abs;
out vec3 v_uvl;
out vec4 v_light;
out vec4 v_tint;
flat out int v_n;
out vec3 v_shadow;
void main() {
  int w = int(a_pos.w);
  int n = w & 7;
  int wave = (w >> 3) & 3;
  bool mov = (w & 32) != 0;
  vec3 p = a_pos.xyz / 128.0 + u_chunkOff;
  vec3 absP = p + u_camFrac;
  if (mov && wave == 3) {
    float wv = sin(absP.x * 0.7 + u_time * 1.4) * 0.5 + sin(absP.z * 0.83 - u_time * 1.15) * 0.35 + sin((absP.x + absP.z) * 1.9 + u_time * 2.3) * 0.15;
    p.y += wv * 0.03 - 0.035;
  }
  v_rel = p; v_abs = p + u_camFrac;
  v_uvl = vec3(a_uv / 32.0, a_layer);
  v_light = a_light; v_tint = a_tint; v_n = n;
  vec4 sp0 = u_shadowMat * vec4(p, 1.0);
  float df = length(sp0.xy) * 0.85 + 0.15;
  v_shadow = (u_shadowMat * vec4(p + vec3(0.0, 1.0, 0.0) * u_shadowTexel * df * 1.5, 1.0)).xyz;
  gl_Position = u_viewProj * vec4(p, 1.0);
}`;

export const WATER_FS = HEADER + COMMON + `
in vec3 v_rel;
in vec3 v_abs;
in vec3 v_uvl;
in vec4 v_light;
in vec4 v_tint;
flat in int v_n;
in vec3 v_shadow;
uniform sampler2DArray u_albedo;
uniform sampler2DShadow u_shadowMap;
uniform sampler2D u_sceneColor;
uniform sampler2D u_sceneDepth;
uniform sampler2D u_reflEnv;
uniform sampler2D u_waterNormal;
uniform mat4 u_view;
uniform mat4 u_proj;
uniform vec2 u_res;
uniform float u_near;
uniform float u_far;
uniform float u_shadowsOn;
uniform float u_ssrOn;
uniform float u_rain;
layout(location=0) out vec4 o_col;

float linDepth(float d) { float z = d * 2.0 - 1.0; return 2.0 * u_near * u_far / (u_far + u_near - z * (u_far - u_near)); }

float shadowAt(vec3 sp) {
  float df = length(sp.xy) * 0.85 + 0.15;
  vec2 d = sp.xy / df;
  float edge = max(abs(d.x), abs(d.y));
  if (edge > 0.995 || abs(sp.z) > 0.995) return 1.0;
  vec3 c = vec3(d * 0.5 + 0.5, sp.z * 0.5 + 0.5 - 0.0003);
  float s = 0.0;
  float r = 1.2 / u_shadowSize;
  for (int i = 0; i < 6; i++) s += texture(u_shadowMap, vec3(c.xy + POISSON[i] * r, c.z));
  return mix(s / 6.0, 1.0, smoothstep(0.85, 0.99, edge));
}

vec3 envRefl(vec3 R) {
  R.y = abs(R.y) < 0.02 ? 0.02 : R.y;
  if (R.y < 0.0) R.y = -R.y * 0.5;
  return texture(u_reflEnv, skyLutUV(normalize(R))).rgb;
}

vec4 ssr(vec3 posRel, vec3 R, float jitter) {
  vec3 vp = (u_view * vec4(posRel, 1.0)).xyz;
  vec3 vr = normalize((u_view * vec4(R, 0.0)).xyz);
  if (vr.z > 0.2) return vec4(0.0);
  float stepLen = 0.35 + jitter * 0.3;
  vec3 p = vp;
  vec2 hitUV = vec2(-1.0);
  for (int i = 0; i < 40; i++) {
    vec3 prev = p;
    p += vr * stepLen;
    stepLen *= 1.12;
    vec4 clip = u_proj * vec4(p, 1.0);
    vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || clip.w < 0.0) break;
    float sceneZ = linDepth(texture(u_sceneDepth, uv).r);
    float rayZ = -p.z;
    float diff = rayZ - sceneZ;
    if (diff > 0.0 && diff < stepLen * 2.5 + 0.4) {
      vec3 a = prev, b = p;
      for (int k = 0; k < 5; k++) {
        vec3 m = (a + b) * 0.5;
        vec4 cm = u_proj * vec4(m, 1.0);
        vec2 um = cm.xy / cm.w * 0.5 + 0.5;
        float sz = linDepth(texture(u_sceneDepth, um).r);
        if (-m.z > sz) b = m; else a = m;
      }
      vec4 cb = u_proj * vec4(b, 1.0);
      hitUV = cb.xy / cb.w * 0.5 + 0.5;
      break;
    }
  }
  if (hitUV.x < 0.0) return vec4(0.0);
  if (texture(u_sceneDepth, hitUV).r >= 0.99999) return vec4(0.0);
  vec2 e = smoothstep(vec2(0.0), vec2(0.12), hitUV) * smoothstep(vec2(1.0), vec2(0.88), hitUV);
  return vec4(texture(u_sceneColor, hitUV).rgb, e.x * e.y);
}

void main() {
  int mt = int(v_tint.a + 0.5);
  int mat = mt & 7;
  float dist = length(v_rel);
  vec3 V = v_rel / -max(dist, 1e-4);
  vec3 N0 = faceN(v_n);
  bool under = !gl_FrontFacing;
  vec2 suv = gl_FragCoord.xy / u_res;
  float sky = v_light.x / 255.0;
  float shadow = (u_shadowsOn > 0.5 ? shadowAt(v_shadow) : 1.0) * smoothstep(0.4, 0.9, sky) * cloudShadowAt(v_abs);

  if (mat == 7) {
    // stained glass: leaded frame is opaque, panes tint what is behind them
    vec4 alb = texture(u_albedo, v_uvl);
    vec3 N = N0;
    float NdotL = max(dot(N, u_lightDir), 0.0);
    vec3 lit = alb.rgb * (u_lightColor * NdotL * shadow + mix(u_ambDown, u_ambUp, N.y * 0.5 + 0.5) * sky * sky + u_blockColor * pow(v_light.y / 255.0, 2.0) * 1.5);
    vec3 col;
    if (alb.a > 0.9) col = lit;
    else {
      vec3 refr = texture(u_sceneColor, suv + N.xz * 0.003).rgb;
      float F = 0.04 + 0.96 * pow(1.0 - abs(dot(N, V)), 5.0);
      col = refr * mix(vec3(1.0), alb.rgb * 1.7, 0.8) + lit * 0.18 + envRefl(reflect(-V, N)) * F * 0.5;
    }
    col = applyFog(col, v_rel, dist);
    o_col = vec4(col, 1.0);
    return;
  }
  if (mat == 3) {
    // ice: textured, partly refractive
    vec4 alb = texture(u_albedo, v_uvl);
    vec3 N = N0;
    float NdotL = max(dot(N, u_lightDir), 0.0);
    vec3 lit = alb.rgb * (u_lightColor * NdotL * shadow + mix(u_ambDown, u_ambUp, N.y * 0.5 + 0.5) * sky * sky + u_blockColor * pow(v_light.y / 255.0, 2.0) * 1.5);
    vec2 ruv = suv + N.xz * 0.01;
    vec3 refr = texture(u_sceneColor, ruv).rgb * vec3(0.75, 0.88, 1.0);
    float F = 0.04 + 0.96 * pow(1.0 - abs(dot(N, V)), 5.0);
    vec3 refl = envRefl(reflect(-V, N));
    vec3 col = mix(refr, lit, 0.55) + refl * F * 0.6;
    col = applyFog(col, v_rel, dist);
    o_col = vec4(col, 1.0);
    return;
  }

  // ----- water -----
  vec2 wp = v_abs.xz;
  float t = u_time;
  vec3 n1 = texture(u_waterNormal, wp * 0.045 + vec2(t * 0.012, t * 0.007)).rgb * 2.0 - 1.0;
  vec3 n2 = texture(u_waterNormal, wp * 0.11 + vec2(-t * 0.018, t * 0.021)).rgb * 2.0 - 1.0;
  vec3 n3 = texture(u_waterNormal, wp * 0.31 + vec2(t * 0.04, -t * 0.03)).rgb * 2.0 - 1.0;
  vec2 nxy = n1.xy * 0.55 + n2.xy * 0.35 + n3.xy * 0.2;
  // rain ripples
  if (u_rain > 0.0 && sky > 0.8) {
    vec2 cell = floor(wp * 1.6);
    vec2 f = fract(wp * 1.6) - 0.5;
    float h = hash12(cell);
    float ph = fract(t * 1.3 + h);
    float r = length(f - (vec2(hash12(cell + 3.1), hash12(cell + 7.7)) - 0.5) * 0.5);
    float ring = sin((r - ph * 0.5) * 40.0) * smoothstep(0.5, 0.0, r) * (1.0 - ph) * step(0.35, h);
    nxy += normalize(f + 1e-4) * ring * 0.35 * u_rain;
  }
  vec3 N;
  if (v_n == 2) N = normalize(vec3(nxy.x * 0.6, 1.0, nxy.y * 0.6));
  else { vec3 T, B; faceTB(v_n, T, B); N = normalize(N0 + T * nxy.x * 0.4 + B * nxy.y * 0.4); }
  if (under) N = -N;

  vec3 waterTint = pow(v_tint.rgb / 255.0, vec3(2.2));
  float NdotV = max(dot(N, V), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);

  // refraction
  float sceneD = texture(u_sceneDepth, suv).r;
  float waterZ = dist;
  vec2 ruv = suv + nxy * 0.035 / max(1.0, dist * 0.08);
  float rd = texture(u_sceneDepth, ruv).r;
  if (linDepth(rd) < linDepth(gl_FragCoord.z)) { ruv = suv; rd = sceneD; }
  float sceneZ = linDepth(rd);
  float thick = max(sceneZ - linDepth(gl_FragCoord.z), 0.0);
  if (rd >= 0.99999) thick = 60.0;
  vec3 refr = texture(u_sceneColor, ruv).rgb;
  vec3 absorb = exp(-thick * (vec3(1.0) - waterTint) * vec3(0.55, 0.32, 0.22) * 1.2);
  vec3 ambientW = (u_ambUp * sky * sky + u_lightColor * shadow * 0.2) * waterTint * 0.45;
  vec3 deep = ambientW;
  vec3 body = refr * absorb + deep * (1.0 - absorb);
  if (under) body = refr * vec3(0.7, 0.85, 0.95);

  // reflection
  vec3 R = reflect(-V, N);
  vec3 refl;
  if (under) {
    refl = deep * 0.6;
    F = NdotV < 0.65 ? 1.0 : F;
  } else {
    refl = envRefl(R) * mix(0.25, 1.0, sky);
    if (u_ssrOn > 0.5) {
      vec4 s = ssr(v_rel, R, hash12(gl_FragCoord.xy));
      refl = mix(refl, s.rgb, s.a);
    }
  }
  vec3 col = mix(body, refl, F);
  // sun specular
  if (!under) {
    vec3 H = normalize(V + u_lightDir);
    float ndh = max(dot(N, H), 0.0);
    float spec = pow(ndh, 900.0) * 60.0 + pow(ndh, 120.0) * 2.0;
    col += u_lightColor * spec * shadow * (1.0 - u_rain * 0.7);
  }
  // shoreline foam
  float foam = smoothstep(0.35, 0.0, thick) * (0.5 + 0.5 * vnoise(wp * 4.0 + t * 0.6));
  col = mix(col, (u_ambUp * sky + u_lightColor * shadow * 0.5) * 0.9, foam * 0.35 * (v_n == 2 ? 1.0 : 0.0));
  col += u_blockColor * pow(v_light.y / 255.0, 2.0) * 0.5 * waterTint;
  col += u_flash * sky * vec3(0.25, 0.28, 0.35) * F;
  if (!under) col = applyFog(col, v_rel, dist);
  o_col = vec4(col, 1.0);
}`;

// ---------------- full screen passes ----------------
export const FS_VS = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const ATMOS = `
const float Re = 6360e3;
const float Ra = 6460e3;
const vec3 BR = vec3(5.8e-6, 13.5e-6, 33.1e-6);
const float BM = 21e-6;
const float HR = 8000.0;
const float HM = 1200.0;
vec2 raySphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd), c = dot(ro, ro) - r * r;
  float d = b * b - c;
  if (d < 0.0) return vec2(1e9, -1e9);
  d = sqrt(d);
  return vec2(-b - d, -b + d);
}
vec3 atmosphere(vec3 rd, vec3 sd, float intensity, float mieG) {
  vec3 ro = vec3(0.0, Re + 600.0, 0.0);
  vec2 ta = raySphere(ro, rd, Ra);
  float tmax = ta.y;
  vec2 tg = raySphere(ro, rd, Re);
  if (tg.x > 0.0) tmax = min(tmax, tg.x);
  const int NS = 16;
  float seg = tmax / float(NS);
  float t = 0.0;
  vec3 sumR = vec3(0.0), sumM = vec3(0.0);
  float odR = 0.0, odM = 0.0;
  float mu = dot(rd, sd);
  float phR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float g = mieG;
  float phM = 3.0 / (8.0 * PI) * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  for (int i = 0; i < NS; i++) {
    vec3 p = ro + rd * (t + seg * 0.5);
    float h = length(p) - Re;
    float hr = exp(-h / HR) * seg, hm = exp(-h / HM) * seg;
    odR += hr; odM += hm;
    vec2 tl = raySphere(p, sd, Ra);
    float sl = tl.y / 6.0;
    float odlR = 0.0, odlM = 0.0;
    bool ok = true;
    for (int j = 0; j < 6; j++) {
      vec3 q = p + sd * (sl * (float(j) + 0.5));
      float hl = length(q) - Re;
      if (hl < 0.0) { ok = false; break; }
      odlR += exp(-hl / HR) * sl; odlM += exp(-hl / HM) * sl;
    }
    if (ok) {
      vec3 tau = BR * (odR + odlR) + BM * 1.1 * (odM + odlM);
      vec3 att = exp(-tau);
      sumR += att * hr; sumM += att * hm;
    }
    t += seg;
  }
  return intensity * (sumR * BR * phR + sumM * BM * phM);
}
`;

// Sky-view LUT: atmosphere only (fog & ambient)
export const SKYLUT_FS = HEADER + ATMOS + `
in vec2 v_uv;
uniform vec3 u_sunDir;
uniform vec3 u_moonDir;
uniform float u_overcast;
uniform float u_darken;
uniform vec3 u_grayTint;
uniform float u_withSunGlow;
out vec4 o;
void main() {
  float s = (v_uv.y - 0.5) * 2.0;
  float lat = sign(s) * s * s * PI * 0.5;
  float lon = (v_uv.x - 0.5) * 2.0 * PI;
  vec3 rd = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
  vec3 rdu = rd; rdu.y = max(rdu.y, 0.0); rdu = normalize(rdu + vec3(0.0, 0.0001, 0.0));
  vec3 c = atmosphere(rdu, u_sunDir, 20.0, u_withSunGlow > 0.5 ? 0.76 : 0.6);
  c += atmosphere(rdu, u_moonDir, 0.06, 0.6) * vec3(0.8, 0.9, 1.2);
  c += vec3(0.0006, 0.0008, 0.0016);
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, u_grayTint * lum * 1.1 + u_grayTint * 0.002, u_overcast);
  c *= u_darken;
  if (rd.y < 0.0) c *= mix(1.0, 0.55, smoothstep(0.0, -0.3, rd.y));
  o = vec4(c, 1.0);
}`;

// Volumetric clouds, rendered at reduced resolution. rgb = in-scattered light, a = transmittance
export const CLOUDS_FS = HEADER + `
in vec2 v_uv;
uniform mat4 u_invViewProj;
uniform vec3 u_camPos;
uniform vec3 u_lightDir;
uniform vec3 u_lightColor;
uniform vec3 u_ambUp;
uniform float u_coverage;
uniform float u_cloudDensity;
uniform vec2 u_cloudWind;
uniform float u_time;
uniform float u_flash;
uniform int u_steps;
uniform sampler3D u_noise3D;
uniform sampler2D u_skyLUT;
uniform vec2 u_jitter;
out vec4 o;
const float CB = 220.0;
const float CT = 300.0;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float remap(float v, float a, float b, float c, float d) { return c + (v - a) / (b - a) * (d - c); }
float density(vec3 p, bool cheap) {
  float h = (p.y - CB) / (CT - CB);
  if (h < 0.0 || h > 1.0) return 0.0;
  vec3 q = vec3(p.x * 0.0018 + u_cloudWind.x, h * 0.35 + 0.2, p.z * 0.0018 + u_cloudWind.y);
  float base = texture(u_noise3D, q).r;
  float grad = smoothstep(0.0, 0.18, h) * smoothstep(1.0, 0.45, h);
  float cov = u_coverage;
  float d = remap(base * grad, 1.0 - cov, 1.0, 0.0, 1.0);
  if (d <= 0.0) return 0.0;
  if (!cheap) {
    float det = texture(u_noise3D, p * 0.011 + vec3(u_time * 0.004, -u_time * 0.002, 0.0)).r;
    d -= det * 0.32 * (1.0 - d);
  }
  return max(d, 0.0) * u_cloudDensity;
}
vec2 skyLutUV(vec3 d) {
  float lat = asin(clamp(d.y, -1.0, 1.0));
  float v = 0.5 + 0.5 * sign(lat) * sqrt(abs(lat) / (PI * 0.5));
  float u = atan(d.z, d.x) / (2.0 * PI) + 0.5;
  return vec2(u, v);
}
void main() {
  vec4 wp = u_invViewProj * vec4(v_uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 rd = normalize(wp.xyz / wp.w);
  vec3 ro = u_camPos;
  float t0, t1;
  if (abs(rd.y) < 1e-4) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float ta = (CB - ro.y) / rd.y, tb = (CT - ro.y) / rd.y;
  t0 = max(min(ta, tb), 0.0); t1 = max(ta, tb);
  if (t1 <= 0.0) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
  t1 = min(t1, t0 + 1600.0);
  float maxDist = 5200.0;
  if (t0 > maxDist) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
  int steps = u_steps;
  float seg = (t1 - t0) / float(steps);
  float jit = hash12(gl_FragCoord.xy + u_jitter);
  float t = t0 + seg * jit;
  float T = 1.0;
  vec3 S = vec3(0.0);
  float mu = dot(rd, u_lightDir);
  float g1 = 0.65, g2 = -0.25;
  float hg1 = (1.0 - g1 * g1) / (4.0 * PI * pow(1.0 + g1 * g1 - 2.0 * g1 * mu, 1.5));
  float hg2 = (1.0 - g2 * g2) / (4.0 * PI * pow(1.0 + g2 * g2 - 2.0 * g2 * mu, 1.5));
  float phase = mix(hg2, hg1, 0.7) * 4.0 * PI;
  vec3 skyTop = texture(u_skyLUT, skyLutUV(vec3(0.0, 1.0, 0.0))).rgb;
  vec3 amb = mix(skyTop * 1.6, u_ambUp * 1.2, 0.5);
  for (int i = 0; i < 64; i++) {
    if (i >= steps || T < 0.02) break;
    vec3 p = ro + rd * t;
    float d = density(p, false);
    if (d > 0.002) {
      float ld = 0.0;
      for (int j = 1; j <= 4; j++) ld += density(p + u_lightDir * (float(j * j) * 9.0), true);
      float lightT = exp(-ld * 9.0 * 0.9);
      float powder = 1.0 - exp(-d * 2.0 * 10.0);
      float h = (p.y - CB) / (CT - CB);
      vec3 lum = u_lightColor * lightT * phase * mix(1.0, powder, 0.5) + amb * (0.35 + 0.65 * h) + vec3(u_flash * 1.8);
      float sigma = d * 0.09;
      float tr = exp(-sigma * seg);
      S += T * lum * (1.0 - tr);
      T *= tr;
    }
    t += seg;
  }
  // distance fade into atmosphere
  float fade = exp(-t0 / 3800.0);
  S *= fade;
  T = mix(1.0, T, fade);
  o = vec4(S, T);
}`;

// Sky pass: LUT + sun + moon + stars + clouds composite
export const SKY_FS = HEADER + `
in vec2 v_uv;
uniform mat4 u_invViewProj;
uniform sampler2D u_skyLUT;
uniform sampler2D u_clouds;
uniform vec3 u_sunDir;
uniform vec3 u_moonDir;
uniform vec3 u_sunDisk;
uniform vec3 u_moonColor;
uniform float u_starVis;
uniform float u_time;
uniform float u_moonPhase;
uniform float u_cloudsOn;
uniform float u_flash;
out vec4 o;
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec2 skyLutUV(vec3 d) {
  float lat = asin(clamp(d.y, -1.0, 1.0));
  float v = 0.5 + 0.5 * sign(lat) * sqrt(abs(lat) / (PI * 0.5));
  float u = atan(d.z, d.x) / (2.0 * PI) + 0.5;
  return vec2(u, v);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
void main() {
  vec4 wp = u_invViewProj * vec4(v_uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 rd = normalize(wp.xyz / wp.w);
  // below the horizon continue the hazy horizon colour (matches the terrain fog) instead of the LUT ground bounce
  vec3 rdh = rd; rdh.y = max(rd.y, 0.03); rdh = normalize(rdh);
  vec3 col = texture(u_skyLUT, skyLutUV(rdh)).rgb;
  // looking down into the haze: cool and desaturate the warm horizon a little rather than darkening it (darkening
  // a pale yellow horizon reads as khaki/olive from the air)
  float below = smoothstep(0.0, -0.5, rd.y);
  float hl = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, hl * vec3(0.9, 0.97, 1.06), below * 0.45);
  float horizonMask = smoothstep(-0.02, 0.04, rd.y);
  // stars
  if (u_starVis > 0.0 && rd.y > 0.0) {
    vec3 sp = rd * 300.0;
    vec3 cell = floor(sp);
    float h = hash13(cell);
    if (h > 0.9965) {
      vec3 c = cell + 0.5 + (vec3(hash13(cell + 1.3), hash13(cell + 2.7), hash13(cell + 5.1)) - 0.5) * 0.6;
      float d = length(sp - c);
      float tw = 0.65 + 0.35 * sin(u_time * (2.0 + h * 10.0) + h * 100.0);
      float b = smoothstep(0.55, 0.0, d) * tw * (h - 0.9965) / 0.0035;
      vec3 sc = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.85, 0.7), hash13(cell + 9.0));
      col += sc * b * 0.25 * u_starVis * horizonMask;
    }
    // faint milky band
    float band = exp(-pow(dot(rd, normalize(vec3(0.3, 0.2, 1.0))) * 3.0, 2.0));
    col += vec3(0.010, 0.010, 0.016) * band * vnoise3(rd * 18.0) * u_starVis * horizonMask;
  }
  // sun
  float sd = dot(rd, u_sunDir);
  float sunR = 0.99985;
  if (sd > sunR - 0.0006) {
    float e = smoothstep(sunR - 0.0006, sunR + 0.00005, sd);
    float limb = 0.6 + 0.4 * sqrt(max(0.0, 1.0 - (1.0 - sd) / (1.0 - sunR + 1e-6)));
    col += u_sunDisk * e * limb * horizonMask;
  }
  // moon
  float md = dot(rd, u_moonDir);
  if (md > 0.9993) {
    vec3 up = abs(u_moonDir.y) > 0.9 ? vec3(1, 0, 0) : vec3(0, 1, 0);
    vec3 mx = normalize(cross(up, u_moonDir));
    vec3 my = cross(u_moonDir, mx);
    vec2 q = vec2(dot(rd, mx), dot(rd, my)) / 0.0374;
    float r = length(q);
    if (r < 1.0) {
      vec3 n = vec3(q, sqrt(1.0 - r * r));
      float crater = vnoise3(vec3(q * 3.0, 1.0)) * 0.6 + vnoise3(vec3(q * 9.0, 2.0)) * 0.4;
      float phaseL = clamp(dot(n, normalize(vec3(cos(u_moonPhase * 6.2831), 0.0, sin(u_moonPhase * 6.2831) * 0.6 + 0.2))) * 2.0 + 0.4, 0.06, 1.0);
      col += u_moonColor * (0.65 + 0.35 * crater) * phaseL * smoothstep(1.0, 0.96, r) * horizonMask;
    }
  }
  if (u_cloudsOn > 0.5) {
    vec4 cl = texture(u_clouds, v_uv);
    col = col * cl.a + cl.rgb;
  }
  col += vec3(0.18, 0.2, 0.28) * u_flash * max(rd.y, 0.0);
  o = vec4(col, 1.0);
}`;

// Reflection environment: atmosphere + cheap clouds in equirect
export const ENV_FS = HEADER + `
in vec2 v_uv;
uniform sampler2D u_skyLUT;
uniform sampler3D u_noise3D;
uniform vec3 u_lightDir;
uniform vec3 u_lightColor;
uniform vec3 u_sunDir;
uniform vec3 u_sunDisk;
uniform float u_coverage;
uniform vec2 u_cloudWind;
uniform vec3 u_camPos;
out vec4 o;
void main() {
  float s = (v_uv.y - 0.5) * 2.0;
  float lat = sign(s) * s * s * PI * 0.5;
  float lon = (v_uv.x - 0.5) * 2.0 * PI;
  vec3 rd = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
  vec3 col = texture(u_skyLUT, v_uv).rgb;
  float sd = dot(rd, u_sunDir);
  col += u_sunDisk * 0.004 * pow(max(sd, 0.0), 600.0);
  if (rd.y > 0.01) {
    float t = (260.0 - u_camPos.y) / rd.y;
    vec3 p = u_camPos + rd * t;
    vec3 q = vec3(p.x * 0.0018 + u_cloudWind.x, 0.45, p.z * 0.0018 + u_cloudWind.y);
    float n = texture(u_noise3D, q).r;
    float c = smoothstep(1.0 - u_coverage, 1.0 - u_coverage + 0.3, n) * exp(-t / 4000.0);
    vec3 cc = u_lightColor * 0.6 * (0.6 + 0.4 * max(dot(rd, u_lightDir), 0.0)) + texture(u_skyLUT, vec2(0.5, 1.0)).rgb * 1.2;
    col = mix(col, cc, c * 0.85);
  }
  o = vec4(col, 1.0);
}`;

// Screen-space reflections for wet / polished surfaces (applied over opaque scene)
export const REFLECT_FS = HEADER + `
in vec2 v_uv;
uniform sampler2D u_sceneColor;
uniform sampler2D u_sceneDepth;
uniform sampler2D u_normalTex;
uniform sampler2D u_reflEnv;
uniform mat4 u_view;
uniform mat4 u_proj;
uniform mat4 u_invProj;
uniform mat4 u_invView;
uniform float u_near;
uniform float u_far;
out vec4 o;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float linDepth(float d) { float z = d * 2.0 - 1.0; return 2.0 * u_near * u_far / (u_far + u_near - z * (u_far - u_near)); }
vec2 skyLutUV(vec3 d) {
  float lat = asin(clamp(d.y, -1.0, 1.0));
  float v = 0.5 + 0.5 * sign(lat) * sqrt(abs(lat) / (PI * 0.5));
  float u = atan(d.z, d.x) / (2.0 * PI) + 0.5;
  return vec2(u, v);
}
void main() {
  vec4 nr = texture(u_normalTex, v_uv);
  float refl = nr.a;
  if (refl < 0.05) discard;
  float d = texture(u_sceneDepth, v_uv).r;
  if (d >= 0.99999) discard;
  vec4 vpos = u_invProj * vec4(v_uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec3 vp = vpos.xyz / vpos.w;
  vec3 Nw = normalize(nr.rgb * 2.0 - 1.0);
  vec3 vn = normalize((u_view * vec4(Nw, 0.0)).xyz);
  vec3 V = normalize(-vp);
  vec3 vr = reflect(-V, vn);
  float F = 0.04 + 0.96 * pow(1.0 - max(dot(vn, V), 0.0), 5.0);
  float amount = refl * mix(F, 1.0, refl * 0.35);
  vec3 wr = (u_invView * vec4(vr, 0.0)).xyz;
  vec3 wrc = wr; wrc.y = max(wrc.y, 0.02);
  vec3 envc = texture(u_reflEnv, skyLutUV(normalize(wrc))).rgb;
  vec3 res = envc * smoothstep(-0.1, 0.25, wr.y);
  float stepLen = 0.3 + hash12(gl_FragCoord.xy) * 0.3;
  vec3 p = vp + vn * 0.05;
  for (int i = 0; i < 28; i++) {
    vec3 prev = p;
    p += vr * stepLen; stepLen *= 1.15;
    vec4 c = u_proj * vec4(p, 1.0);
    if (c.w <= 0.0) break;
    vec2 uv = c.xy / c.w * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
    float sz = linDepth(texture(u_sceneDepth, uv).r);
    float diff = -p.z - sz;
    if (diff > 0.0 && diff < stepLen * 2.5 + 0.3) {
      vec3 a = prev, b = p;
      for (int k = 0; k < 4; k++) {
        vec3 m = (a + b) * 0.5;
        vec4 cm = u_proj * vec4(m, 1.0);
        vec2 um = cm.xy / cm.w * 0.5 + 0.5;
        if (-m.z > linDepth(texture(u_sceneDepth, um).r)) b = m; else a = m;
      }
      vec4 cb = u_proj * vec4(b, 1.0);
      vec2 huv = cb.xy / cb.w * 0.5 + 0.5;
      vec2 e = smoothstep(vec2(0.0), vec2(0.1), huv) * smoothstep(vec2(1.0), vec2(0.9), huv);
      if (texture(u_sceneDepth, huv).r < 0.99999) res = mix(res, texture(u_sceneColor, huv).rgb, e.x * e.y);
      break;
    }
  }
  o = vec4(res, clamp(amount, 0.0, 1.0));
}`;

// Volumetric light (god rays) + height fog in-scatter, rendered at half resolution
export const VOLUMETRIC_FS = HEADER + `
in vec2 v_uv;
uniform sampler2D u_depth;
uniform sampler2DShadow u_shadowMap;
uniform mat4 u_invViewProj;
uniform mat4 u_shadowMat;
uniform vec3 u_lightDir;
uniform vec3 u_lightColor;
uniform vec3 u_ambUp;
uniform float u_near;
uniform float u_far;
uniform float u_density;
uniform float u_camY;
uniform int u_steps;
uniform float u_maxDist;
uniform float u_underwater;
uniform vec2 u_jitter;
out vec4 o;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float linDepth(float d) { float z = d * 2.0 - 1.0; return 2.0 * u_near * u_far / (u_far + u_near - z * (u_far - u_near)); }
void main() {
  float d = texture(u_depth, v_uv).r;
  vec4 wp = u_invViewProj * vec4(v_uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec3 pos = wp.xyz / wp.w;
  float dist = length(pos);
  vec3 rd = pos / dist;
  float maxD = min(dist, u_maxDist);
  if (d >= 0.99999) maxD = u_maxDist * 0.6;
  int steps = u_steps;
  float seg = maxD / float(steps);
  float jit = hash12(gl_FragCoord.xy + u_jitter);
  float mu = dot(rd, u_lightDir);
  float g = 0.72;
  float phase = (1.0 - g * g) / (4.0 * PI * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  phase = phase * 0.8 + 0.2 / (4.0 * PI);
  vec3 acc = vec3(0.0);
  float trans = 1.0;
  for (int i = 0; i < 48; i++) {
    if (i >= steps) break;
    float t = (float(i) + jit) * seg;
    vec3 p = rd * t;
    vec4 sp = u_shadowMat * vec4(p, 1.0);
    float df = length(sp.xy) * 0.85 + 0.15;
    vec2 dd = sp.xy / df;
    float vis = 1.0;
    if (abs(dd.x) < 0.99 && abs(dd.y) < 0.99) vis = texture(u_shadowMap, vec3(dd * 0.5 + 0.5, sp.z * 0.5 + 0.5 - 0.001));
    float h = u_camY + p.y;
    float dens = u_density * exp(-max(h - 62.0, 0.0) * 0.035);
    if (u_underwater > 0.5) dens = u_density * 3.0;
    acc += vis * dens * seg * trans;
    trans *= exp(-dens * seg * 0.5);
  }
  float shaft = 0.22 + 1.5 * pow(max(mu, 0.0), 6.0) + 2.5 * pow(max(mu, 0.0), 40.0);
  vec3 col = acc * u_lightColor * shaft * 0.3;
  o = vec4(col, 1.0);
}`;

// Bloom
export const DOWNSAMPLE_FS = HEADER + `
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec2 u_texel;
uniform float u_first;
out vec4 o;
vec3 karis(vec3 c) { return c / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722)) * 0.25); }
void main() {
  vec2 t = u_texel;
  vec3 a = texture(u_src, v_uv + t * vec2(-2, 2)).rgb, b = texture(u_src, v_uv + t * vec2(0, 2)).rgb, c = texture(u_src, v_uv + t * vec2(2, 2)).rgb;
  vec3 d = texture(u_src, v_uv + t * vec2(-2, 0)).rgb, e = texture(u_src, v_uv).rgb, f = texture(u_src, v_uv + t * vec2(2, 0)).rgb;
  vec3 g = texture(u_src, v_uv + t * vec2(-2, -2)).rgb, h = texture(u_src, v_uv + t * vec2(0, -2)).rgb, i = texture(u_src, v_uv + t * vec2(2, -2)).rgb;
  vec3 j = texture(u_src, v_uv + t * vec2(-1, 1)).rgb, k = texture(u_src, v_uv + t * vec2(1, 1)).rgb;
  vec3 l = texture(u_src, v_uv + t * vec2(-1, -1)).rgb, m = texture(u_src, v_uv + t * vec2(1, -1)).rgb;
  vec3 r = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  if (u_first > 0.5) r = karis(r);
  o = vec4(min(r, vec3(500.0)), 1.0);
}`;

export const UPSAMPLE_FS = HEADER + `
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec2 u_texel;
uniform float u_radius;
out vec4 o;
void main() {
  vec2 t = u_texel * u_radius;
  vec3 s = texture(u_src, v_uv + vec2(-t.x, t.y)).rgb + texture(u_src, v_uv + vec2(0, t.y)).rgb * 2.0 + texture(u_src, v_uv + vec2(t.x, t.y)).rgb
    + texture(u_src, v_uv + vec2(-t.x, 0)).rgb * 2.0 + texture(u_src, v_uv).rgb * 4.0 + texture(u_src, v_uv + vec2(t.x, 0)).rgb * 2.0
    + texture(u_src, v_uv + vec2(-t.x, -t.y)).rgb + texture(u_src, v_uv + vec2(0, -t.y)).rgb * 2.0 + texture(u_src, v_uv + vec2(t.x, -t.y)).rgb;
  o = vec4(s / 16.0, 1.0);
}`;

// Auto exposure: average log luminance of a small mip, blend with previous
export const EXPOSURE_FS = HEADER + `
in vec2 v_uv;
uniform sampler2D u_src;
uniform sampler2D u_prev;
uniform float u_dt;
uniform float u_minExp;
uniform float u_maxExp;
uniform float u_bias;
out vec4 o;
void main() {
  float sum = 0.0, wsum = 0.0;
  for (int y = 0; y < 8; y++) for (int x = 0; x < 8; x++) {
    vec2 uv = (vec2(x, y) + 0.5) / 8.0;
    float w = 1.0 - length(uv - 0.5) * 0.9;
    float l = dot(texture(u_src, uv).rgb, vec3(0.2126, 0.7152, 0.0722));
    sum += log(max(l, 1e-4)) * w; wsum += w;
  }
  float avg = exp(sum / wsum);
  float target = clamp(0.16 * u_bias / avg, u_minExp, u_maxExp);
  float prev = texture(u_prev, vec2(0.5)).r;
  if (prev <= 0.0) prev = target;
  float speed = target > prev ? 1.2 : 2.2;
  float e = prev + (target - prev) * (1.0 - exp(-u_dt * speed));
  o = vec4(e, avg, 0.0, 1.0);
}`;

// Final composite + tonemap
export const COMPOSITE_FS = HEADER + `
in vec2 v_uv;
uniform sampler2D u_hdr;
uniform sampler2D u_bloom;
uniform sampler2D u_vol;
uniform sampler2D u_exposure;
uniform sampler2D u_depth;
uniform float u_bloomStr;
uniform float u_volStr;
uniform float u_underwater;
uniform vec3 u_waterColor;
uniform float u_near;
uniform float u_far;
uniform float u_time;
uniform float u_saturation;
uniform vec3 u_grade;
uniform float u_vignette;
uniform float u_hurt;
uniform float u_lava;
uniform vec3 u_sunUV;     // xy = screen position of the sun, z = glare strength (0 = off)
uniform float u_aspect;
out vec4 o;
float linDepth(float d) { float z = d * 2.0 - 1.0; return 2.0 * u_near * u_far / (u_far + u_near - z * (u_far - u_near)); }
// subtle sun glare + lens ghosts, only when the sun disc is actually visible (sky in the depth buffer)
vec3 sunGlare(vec2 uv) {
  if (u_sunUV.z <= 0.0) return vec3(0.0);
  vec2 s = u_sunUV.xy;
  float vis = 0.0;
  for (int i = 0; i < 9; i++) {
    vec2 o2 = vec2(float(i % 3) - 1.0, float(i / 3) - 1.0) * 0.012;
    vec2 t = s + o2;
    if (t.x > 0.0 && t.x < 1.0 && t.y > 0.0 && t.y < 1.0) vis += step(0.99999, texture(u_depth, t).r);
  }
  vis /= 9.0;
  float edge = smoothstep(-0.25, 0.05, s.x) * smoothstep(1.25, 0.95, s.x) * smoothstep(-0.25, 0.05, s.y) * smoothstep(1.25, 0.95, s.y);
  vis *= edge * u_sunUV.z;
  if (vis <= 0.001) return vec3(0.0);
  vec2 d = (uv - s) * vec2(u_aspect, 1.0);
  float r = length(d);
  vec3 g = vec3(1.0, 0.86, 0.62) * (exp(-r * 9.0) * 0.22 + exp(-r * 2.6) * 0.05);
  g += vec3(1.0, 0.9, 0.75) * exp(-abs(d.y) * 160.0) * exp(-abs(d.x) * 2.2) * 0.05;   // faint horizontal streak
  vec2 axis = vec2(0.5) - s;
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    float pos = fk == 0.0 ? 0.55 : fk == 1.0 ? 0.95 : fk == 2.0 ? 1.4 : -0.35;
    float rad = fk == 0.0 ? 0.035 : fk == 1.0 ? 0.06 : fk == 2.0 ? 0.11 : 0.025;
    vec3 tint = fk == 0.0 ? vec3(0.9, 0.7, 1.0) : fk == 1.0 ? vec3(0.6, 0.9, 0.7) : fk == 2.0 ? vec3(0.55, 0.7, 1.0) : vec3(1.0, 0.8, 0.5);
    vec2 gp = s + axis * pos;
    float gd = length((uv - gp) * vec2(u_aspect, 1.0));
    g += tint * smoothstep(rad, rad * 0.7, gd) * 0.018 * (1.0 + smoothstep(rad * 0.85, rad, gd) * 1.5);
  }
  return g * vis;
}
vec3 aces(vec3 x) {
  const mat3 ACESInputMat = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 ACESOutputMat = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  x = ACESInputMat * x;
  vec3 a = x * (x + 0.0245786) - 0.000090537;
  vec3 b = x * (0.983729 * x + 0.4329510) + 0.238081;
  x = ACESOutputMat * (a / b);
  return clamp(x, 0.0, 1.0);
}
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec2 uv = v_uv;
  if (u_underwater > 0.5) uv += vec2(sin(uv.y * 30.0 + u_time * 2.0), cos(uv.x * 26.0 + u_time * 1.7)) * 0.0015;
  vec3 col = texture(u_hdr, uv).rgb;
  vec3 vol = texture(u_vol, uv).rgb;
  col += vol * u_volStr;
  if (u_underwater > 0.5) {
    float ld = linDepth(texture(u_depth, uv).r);
    float f = 1.0 - exp(-ld * 0.09);
    col = mix(col * vec3(0.55, 0.8, 0.95), u_waterColor, f);
  }
  if (u_lava > 0.5) col = mix(col, vec3(4.0, 1.2, 0.2), 0.85);
  vec3 bloom = texture(u_bloom, uv).rgb;
  col = mix(col, bloom, u_bloomStr);
  float exposure = texture(u_exposure, vec2(0.5)).r;
  col *= exposure;
  col *= u_grade;
  col = aces(col);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, u_saturation);
  vec2 q = v_uv - 0.5;
  col *= 1.0 - dot(q, q) * u_vignette;
  if (u_hurt > 0.0) col = mix(col, vec3(0.6, 0.0, 0.0), u_hurt * smoothstep(0.2, 0.75, length(q)) * 0.6);
  col += sunGlare(v_uv);
  col = pow(col, vec3(1.0 / 2.2));
  col += (hash12(gl_FragCoord.xy + fract(u_time) * 100.0) - 0.5) / 255.0;
  o = vec4(col, 1.0);
}`;

export const FXAA_FS = HEADER + `
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec2 u_texel;
out vec4 o;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec3 rgbNW = texture(u_src, v_uv + vec2(-1, -1) * u_texel).rgb;
  vec3 rgbNE = texture(u_src, v_uv + vec2(1, -1) * u_texel).rgb;
  vec3 rgbSW = texture(u_src, v_uv + vec2(-1, 1) * u_texel).rgb;
  vec3 rgbSE = texture(u_src, v_uv + vec2(1, 1) * u_texel).rgb;
  vec3 rgbM = texture(u_src, v_uv).rgb;
  float lNW = luma(rgbNW), lNE = luma(rgbNE), lSW = luma(rgbSW), lSE = luma(rgbSE), lM = luma(rgbM);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float dirReduce = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = clamp(dir * rcp, -8.0, 8.0) * u_texel;
  vec3 a = 0.5 * (texture(u_src, v_uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture(u_src, v_uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture(u_src, v_uv + dir * -0.5).rgb + texture(u_src, v_uv + dir * 0.5).rgb);
  float lB = luma(b);
  o = vec4((lB < lMin || lB > lMax) ? a : b, 1.0);
}`;

export const COPY_FS = HEADER + `
in vec2 v_uv;
uniform sampler2D u_src;
out vec4 o;
void main() { o = texture(u_src, v_uv); }`;

// Simple colored lines / boxes (selection outline, debug)
export const LINE_VS = HEADER + `
layout(location=0) in vec3 a_pos;
uniform mat4 u_viewProj;
uniform vec3 u_offset;
void main() { gl_Position = u_viewProj * vec4(a_pos + u_offset, 1.0); gl_Position.z -= 0.0005 * gl_Position.w; }`;
export const LINE_FS = HEADER + `
uniform vec4 u_color;
out vec4 o;
void main() { o = u_color; }`;

// Block crack overlay (multiplicative)
export const CRACK_VS = HEADER + `
layout(location=0) in vec3 a_pos;
layout(location=1) in vec2 a_uv;
uniform mat4 u_viewProj;
uniform vec3 u_offset;
out vec2 v_uv;
void main() { v_uv = a_uv; gl_Position = u_viewProj * vec4(a_pos + u_offset, 1.0); gl_Position.z -= 0.0008 * gl_Position.w; }`;
export const CRACK_FS = HEADER + `
in vec2 v_uv;
uniform sampler2DArray u_albedo;
uniform float u_layer;
out vec4 o;
void main() {
  vec4 c = textureLod(u_albedo, vec3(v_uv, u_layer), 0.0);
  if (c.a < 0.1) discard;
  o = vec4(c.rgb, c.a);
}`;

export { COMMON, HEADER };
