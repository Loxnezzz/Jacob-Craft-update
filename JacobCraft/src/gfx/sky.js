// CPU side of the sky: light colours from a small atmosphere model, plus procedural noise textures.

const Re = 6360e3, Ra = 6460e3;
const BR = [5.8e-6, 13.5e-6, 33.1e-6];
const BM = 21e-6;
const HR = 8000, HM = 1200;

function raySphere(ro, rd, r) {
  const b = ro[0] * rd[0] + ro[1] * rd[1] + ro[2] * rd[2];
  const c = ro[0] * ro[0] + ro[1] * ro[1] + ro[2] * ro[2] - r * r;
  const d = b * b - c;
  if (d < 0) return [1e9, -1e9];
  const s = Math.sqrt(d);
  return [-b - s, -b + s];
}

// optical depth from a point along a direction to atmosphere top
function opticalDepth(p, d, steps = 12) {
  const t = raySphere(p, d, Ra)[1];
  const seg = t / steps;
  let r = 0, m = 0;
  for (let i = 0; i < steps; i++) {
    const q = [p[0] + d[0] * seg * (i + 0.5), p[1] + d[1] * seg * (i + 0.5), p[2] + d[2] * seg * (i + 0.5)];
    const h = Math.hypot(q[0], q[1], q[2]) - Re;
    if (h < 0) return null;
    r += Math.exp(-h / HR) * seg; m += Math.exp(-h / HM) * seg;
  }
  return [r, m];
}

export function sunTransmittance(dir) {
  const p = [0, Re + 600, 0];
  // allow slightly below horizon with clamping for smooth sunsets
  const d = [dir[0], Math.max(dir[1], -0.02), dir[2]];
  const l = Math.hypot(d[0], d[1], d[2]);
  d[0] /= l; d[1] /= l; d[2] /= l;
  const od = opticalDepth(p, d);
  if (!od) return [0, 0, 0];
  return [0, 1, 2].map(i => Math.exp(-(BR[i] * od[0] + BM * 1.1 * od[1])));
}

function atmosphere(rd, sd, intensity) {
  const ro = [0, Re + 600, 0];
  let tmax = raySphere(ro, rd, Ra)[1];
  const tg = raySphere(ro, rd, Re);
  if (tg[0] > 0) tmax = Math.min(tmax, tg[0]);
  const NS = 8;
  const seg = tmax / NS;
  const mu = rd[0] * sd[0] + rd[1] * sd[1] + rd[2] * sd[2];
  const phR = 3 / (16 * Math.PI) * (1 + mu * mu);
  const g = 0.76;
  const phM = 3 / (8 * Math.PI) * ((1 - g * g) * (1 + mu * mu)) / ((2 + g * g) * Math.pow(1 + g * g - 2 * g * mu, 1.5));
  let odR = 0, odM = 0;
  const sR = [0, 0, 0], sM = [0, 0, 0];
  for (let i = 0; i < NS; i++) {
    const p = [ro[0] + rd[0] * seg * (i + 0.5), ro[1] + rd[1] * seg * (i + 0.5), ro[2] + rd[2] * seg * (i + 0.5)];
    const h = Math.hypot(p[0], p[1], p[2]) - Re;
    const hr = Math.exp(-h / HR) * seg, hm = Math.exp(-h / HM) * seg;
    odR += hr; odM += hm;
    const ol = opticalDepth(p, sd, 6);
    if (!ol) continue;
    for (let c = 0; c < 3; c++) {
      const att = Math.exp(-(BR[c] * (odR + ol[0]) + BM * 1.1 * (odM + ol[1])));
      sR[c] += att * hr; sM[c] += att * hm;
    }
  }
  return [0, 1, 2].map(c => intensity * (sR[c] * BR[c] * phR + sM[c] * BM * phM));
}

function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function scale3(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function sstep(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function lum(c) { return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722; }

// weather: { overcast 0..1, rain 0..1, storm 0..1 }
export function computeSkyLighting(sunDir, moonDir, weather, moonPhase = 0) {
  const ov = weather.overcast || 0, rain = weather.rain || 0;
  const sunT = sunTransmittance(sunDir);
  const sunUp = sstep(-0.06, 0.06, sunDir[1]);
  const moonUp = sstep(-0.05, 0.08, moonDir[1]);
  const SUN = 3.4;
  let sunCol = scale3(sunT, SUN * sunUp);
  // ambient from sky samples
  const dirs = [[0, 1, 0], [0.8, 0.6, 0], [-0.8, 0.6, 0], [0, 0.6, 0.8], [0, 0.6, -0.8], [0.6, 0.25, 0.75], [-0.6, 0.25, -0.75]];
  let amb = [0, 0, 0];
  for (const d of dirs) {
    const l = Math.hypot(d[0], d[1], d[2]);
    const a = atmosphere([d[0] / l, d[1] / l, d[2] / l], sunDir, 20);
    amb = [amb[0] + a[0], amb[1] + a[1], amb[2] + a[2]];
  }
  amb = scale3(amb, 1 / dirs.length * 2.2);
  // night
  const moonBright = 0.5 + 0.5 * Math.cos((moonPhase - 0.5) * Math.PI * 2) * 0.5;
  const moonCol = scale3([0.42, 0.52, 0.78], 0.32 * moonUp * (0.55 + moonBright * 0.45));
  const nightAmb = [0.010, 0.014, 0.030];
  amb = [amb[0] + nightAmb[0], amb[1] + nightAmb[1], amb[2] + nightAmb[2]];
  // overcast desaturates & darkens
  const g = lum(amb);
  const grayAmb = scale3([0.85, 0.9, 1.0], g * 1.15);
  amb = mix3(amb, grayAmb, ov * 0.85);
  amb = scale3(amb, 1 - rain * 0.35);
  // main light: sun by day, moon by night (cross-fade through zero to avoid shadow pops)
  let lightDir, lightColor, isDay;
  if (sunDir[1] > -0.03) {
    lightDir = sunDir; lightColor = sunCol; isDay = true;
  } else {
    lightDir = moonDir; lightColor = moonCol; isDay = false;
  }
  const dimmer = 1 - ov * 0.82;
  lightColor = scale3(lightColor, dimmer);
  // ground bounce
  const ambDown = [amb[0] * 0.35 + lightColor[0] * 0.05, amb[1] * 0.33 + lightColor[1] * 0.045, amb[2] * 0.3 + lightColor[2] * 0.04];
  const sunDisk = scale3(sunT, 38 * sunUp * (1 - ov * 0.97));
  const sunScatter = scale3(sunT, 0.55 * sunUp * (1 - ov * 0.8));
  const starVis = sstep(0.05, -0.2, sunDir[1]) * (1 - ov);
  const moonDisk = scale3([1.0, 0.98, 0.92], 1.6 * moonUp * (1 - ov * 0.9));
  return { lightDir, lightColor, ambUp: amb, ambDown, sunDisk, sunScatter, starVis, moonDisk, isDay, sunT };
}

// ---------- noise textures ----------
function ihash3(x, y, z, s) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 1103515245) ^ Math.imul(z, 668265263) ^ Math.imul(s, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise3(x, y, z, period, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  let fx = x - x0, fy = y - y0, fz = z - z0;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const w = (v) => ((v % period) + period) % period;
  const xa = w(x0), xb = w(x0 + 1), ya = w(y0), yb = w(y0 + 1), za = w(z0), zb = w(z0 + 1);
  const c000 = ihash3(xa, ya, za, seed), c100 = ihash3(xb, ya, za, seed), c010 = ihash3(xa, yb, za, seed), c110 = ihash3(xb, yb, za, seed);
  const c001 = ihash3(xa, ya, zb, seed), c101 = ihash3(xb, ya, zb, seed), c011 = ihash3(xa, yb, zb, seed), c111 = ihash3(xb, yb, zb, seed);
  const a = c000 + (c100 - c000) * fx, b = c010 + (c110 - c010) * fx;
  const c = c001 + (c101 - c001) * fx, d = c011 + (c111 - c011) * fx;
  const e = a + (b - a) * fy, f = c + (d - c) * fy;
  return e + (f - e) * fz;
}

function worley3(x, y, z, cells, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let d1 = 9;
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = ix + dx, cy = iy + dy, cz = iz + dz;
    const wx = ((cx % cells) + cells) % cells, wy = ((cy % cells) + cells) % cells, wz = ((cz % cells) + cells) % cells;
    const px = cx + ihash3(wx, wy, wz, seed), py = cy + ihash3(wx, wy, wz, seed + 1), pz = cz + ihash3(wx, wy, wz, seed + 2);
    const d = (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2;
    if (d < d1) d1 = d;
  }
  return Math.sqrt(d1);
}

export function generateNoise3D(S = 64) {
  const out = new Uint8Array(S * S * S);
  let i = 0;
  for (let z = 0; z < S; z++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let f = 0, a = 0.5, per = 4;
    for (let o = 0; o < 4; o++) {
      f += valueNoise3(x / S * per, y / S * per, z / S * per, per, 11 + o) * a;
      a *= 0.5; per *= 2;
    }
    f /= 0.9375;
    const w1 = worley3(x / S * 5, y / S * 5, z / S * 5, 5, 3);
    const w2 = worley3(x / S * 10, y / S * 10, z / S * 10, 10, 7);
    const wor = 1 - Math.min(1, (w1 * 0.7 + w2 * 0.3) * 1.05);
    // perlin-worley blend
    let v = f * 0.55 + wor * 0.55 - 0.08;
    v = Math.max(0, Math.min(1, (v - 0.25) * 1.6));
    out[i++] = Math.round(v * 255);
  }
  return out;
}

export function generateWaterNormals(S = 256) {
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0, a = 0.5, per = 8;
    for (let o = 0; o < 5; o++) {
      v += valueNoise3(x / S * per, y / S * per, 0.5, per, 41 + o) * a;
      a *= 0.5; per *= 2;
    }
    h[y * S + x] = v;
  }
  const out = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const hl = h[y * S + ((x + S - 1) % S)], hr = h[y * S + ((x + 1) % S)];
    const hu = h[((y + S - 1) % S) * S + x], hd = h[((y + 1) % S) * S + x];
    let nx = (hl - hr) * 6, ny = (hu - hd) * 6, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * S + x) * 4;
    out[i] = (nx * 0.5 + 0.5) * 255; out[i + 1] = (ny * 0.5 + 0.5) * 255; out[i + 2] = (nz * 0.5 + 0.5) * 255; out[i + 3] = 255;
  }
  return out;
}
