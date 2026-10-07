// Procedural pixel-art texture generator. Every block texture is 32x32 and produces:
//   albedo RGBA, height (-> normal map), smoothness, tint mask.
import { hashString, RNG } from '../core/noise.js';

export const TS = 32;
const N = TS * TS;

export function hex(h) {
  const v = parseInt(h.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}
const PCACHE = new Map();
function P(list) {
  const key = list.join();
  let p = PCACHE.get(key);
  if (!p) { p = list.map(hex); PCACHE.set(key, p); }
  return p;
}
function pal(list, t) {
  const p = P(list);
  let i = Math.floor(t * p.length);
  if (i < 0) i = 0; if (i >= p.length) i = p.length - 1;
  return p[i];
}
function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function mulc(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

class Img {
  constructor(seed) {
    this.c = new Float32Array(N * 4);
    this.h = new Float32Array(N).fill(0.5);
    this.s = new Float32Array(N);
    this.m = new Float32Array(N);
    this.seed = seed;
    this.normalStrength = 1;
    this.wrap = true;
  }
  set(x, y, col, a = 1) {
    x = ((x % TS) + TS) % TS; y = ((y % TS) + TS) % TS;
    const i = (y * TS + x) * 4;
    this.c[i] = col[0]; this.c[i + 1] = col[1]; this.c[i + 2] = col[2]; this.c[i + 3] = a;
  }
  setClip(x, y, col, a = 1) {
    if (x < 0 || y < 0 || x >= TS || y >= TS) return;
    this.set(x, y, col, a);
  }
  get(x, y) {
    x = ((x % TS) + TS) % TS; y = ((y % TS) + TS) % TS;
    const i = (y * TS + x) * 4;
    return [this.c[i], this.c[i + 1], this.c[i + 2], this.c[i + 3]];
  }
  alpha(x, y) { return this.c[(((y % TS) + TS) % TS * TS + (((x % TS) + TS) % TS)) * 4 + 3]; }
  H(x, y, v) { x = ((x % TS) + TS) % TS; y = ((y % TS) + TS) % TS; this.h[y * TS + x] = v; }
  getH(x, y) { x = ((x % TS) + TS) % TS; y = ((y % TS) + TS) % TS; return this.h[y * TS + x]; }
  S(x, y, v) { x = ((x % TS) + TS) % TS; y = ((y % TS) + TS) % TS; this.s[y * TS + x] = v; }
  M(x, y, v) { x = ((x % TS) + TS) % TS; y = ((y % TS) + TS) % TS; this.m[y * TS + x] = v; }
  fillSmooth(v) { this.s.fill(v); }
  fillMask(v) { this.m.fill(v); }
  clear() { this.c.fill(0); }
  shade(x, y, f) {
    const c = this.get(x, y);
    this.set(x, y, [c[0] * f, c[1] * f, c[2] * f], c[3]);
  }
}

// ---------- tileable noise ----------
function ihash(x, y, s) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, cells, seed) {
  const fx = x / TS * cells, fy = y / TS * cells;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  let tx = fx - x0, ty = fy - y0;
  tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const w = (v) => ((v % cells) + cells) % cells;
  const a = ihash(w(x0), w(y0), seed), b = ihash(w(x0 + 1), w(y0), seed);
  const c = ihash(w(x0), w(y0 + 1), seed), d = ihash(w(x0 + 1), w(y0 + 1), seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
function vnoise2(x, y, cx, cy, seed) { // anisotropic cells
  const fx = x / TS * cx, fy = y / TS * cy;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  let tx = fx - x0, ty = fy - y0;
  tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const wx = (v) => ((v % cx) + cx) % cx, wy = (v) => ((v % cy) + cy) % cy;
  const a = ihash(wx(x0), wy(y0), seed), b = ihash(wx(x0 + 1), wy(y0), seed);
  const c = ihash(wx(x0), wy(y0 + 1), seed), d = ihash(wx(x0 + 1), wy(y0 + 1), seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
function fbm(x, y, cells, oct, seed) {
  let s = 0, a = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += vnoise(x, y, cells, seed + i * 31) * a;
    n += a; a *= 0.5; cells *= 2;
  }
  return s / n;
}
function voronoi(x, y, cells, seed, jitter = 0.85) {
  const fx = x / TS * cells, fy = y / TS * cells;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  let d1 = 1e9, d2 = 1e9, id = 0, px = 0, py = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ix + i, cy = iy + j;
    const wx = ((cx % cells) + cells) % cells, wy = ((cy % cells) + cells) % cells;
    const ox = 0.5 + (ihash(wx, wy, seed) - 0.5) * jitter;
    const oy = 0.5 + (ihash(wx, wy, seed + 7) - 0.5) * jitter;
    const dx = cx + ox - fx, dy = cy + oy - fy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < d1) { d2 = d1; d1 = d; id = wy * cells + wx; px = (cx + ox) / cells * TS; py = (cy + oy) / cells * TS; }
    else if (d < d2) d2 = d;
  }
  // distances in pixels
  const scale = TS / cells;
  return { d1: d1 * scale, d2: d2 * scale, id, px, py };
}

// ---------- reusable painters ----------
function fillNoise(img, cols, opts = {}) {
  const { cells = 4, oct = 3, grain = 0.18, seed = img.seed, hscale = 1, bias = 0, contrast = 1 } = opts;
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    let n = fbm(x, y, cells, oct, seed) * (1 - grain) + ihash(x, y, seed + 99) * grain;
    n = (n - 0.5) * contrast + 0.5 + bias;
    img.set(x, y, pal(cols, n));
    img.H(x, y, 0.5 + (n - 0.5) * hscale);
  }
}

function crackWalk(img, rng, len, col, depth = 0.25, sx, sy) {
  let x = sx ?? rng.irange(0, TS - 1), y = sy ?? rng.irange(0, TS - 1);
  let dx = rng.chance(0.5) ? 1 : -1, dy = rng.chance(0.5) ? 1 : -1;
  for (let i = 0; i < len; i++) {
    img.set(x, y, col);
    img.H(x, y, img.getH(x, y) - depth);
    if (rng.chance(0.5)) x += dx; else y += dy;
    if (rng.chance(0.15)) dx = -dx;
    if (rng.chance(0.15)) dy = -dy;
  }
}

function stoneBase(img, cols = ['#3c3c40', '#45454a', '#4e4e53', '#57575c', '#616166', '#6c6c71'], _unused = 0) {
  // Natural mottled stone: broad tonal patches + clumpy grain + grit, quantised to a small palette.
  // No line features at all (they read as artificial cracks at a distance).
  const r = new RNG(img.seed);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const big = fbm(x, y, 2, 2, img.seed);
    const mid = fbm(x, y, 8, 2, img.seed + 11);
    const grit = ihash(x, y, img.seed + 3);
    let n = big * 0.38 + mid * 0.42 + grit * 0.2;
    n += Math.sin(x * 0.31 + y * 0.83 + big * 5) * 0.03;
    img.set(x, y, pal(cols, (n - 0.22) * 1.75));
    img.H(x, y, 0.45 + (mid - 0.5) * 0.7 + (grit - 0.5) * 0.12);
  }
  const lite = hex(cols[cols.length - 1]), dark = mulc(hex(cols[0]), 0.9);
  for (let i = 0; i < 18; i++) {
    const x = r.irange(0, 31), y = r.irange(0, 31);
    img.set(x, y, lite); img.H(x, y, img.getH(x, y) + 0.12);
  }
  for (let i = 0; i < 10; i++) {
    const x = r.irange(0, 31), y = r.irange(0, 31);
    img.set(x, y, dark); img.H(x, y, img.getH(x, y) - 0.12);
    if (r.chance(0.4)) { img.set(x + 1, y, mulc(dark, 1.05)); }
  }
}

function oreClusters(img, cols, count, opts = {}) {
  const r = new RNG(img.seed + 1234);
  const { size = [3, 6], smooth = 0.3, crystal = false } = opts;
  const P4 = P(cols);
  for (let c = 0; c < count; c++) {
    const cx = r.irange(2, 29), cy = r.irange(2, 29);
    const n = r.irange(size[0], size[1]);
    const pts = [[cx, cy]];
    for (let i = 1; i < n; i++) {
      const b = pts[r.irange(0, pts.length - 1)];
      const d = r.irange(0, 3);
      pts.push([b[0] + [1, -1, 0, 0][d], b[1] + [0, 0, 1, -1][d]]);
    }
    // outline darkening
    for (const [x, y] of pts) for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = pts.some(p => p[0] === x + ox && p[1] === y + oy);
      if (!k) { img.shade(x + ox, y + oy, 0.78); }
    }
    for (const [x, y] of pts) {
      const t = ((cx - x) + (cy - y)) * 0.25 + 0.5 + (r.next() - 0.5) * 0.5;
      let col = P4[Math.max(0, Math.min(P4.length - 1, Math.floor(t * P4.length)))];
      if (crystal && r.chance(0.2)) col = P4[P4.length - 1];
      img.set(x, y, col);
      img.H(x, y, 0.85 + t * 0.15);
      img.S(x, y, smooth);
    }
  }
}

function bricksPattern(img, bw, bh, mortar, colsFn, opts = {}) {
  const { offset = 0.5, bevel = 0.12, mortarCol = hex('#8f8a82'), mortarH = 0.15 } = opts;
  const r = new RNG(img.seed);
  const rows = Math.ceil(TS / bh);
  const shades = [];
  for (let i = 0; i < 64; i++) shades.push(r.next());
  for (let y = 0; y < TS; y++) {
    const row = Math.floor(y / bh);
    const yo = y - row * bh;
    const off = (row % 2) * Math.floor(bw * offset);
    for (let x = 0; x < TS; x++) {
      const xx = (x + off) % TS;
      const col = Math.floor(xx / bw);
      const xo = xx - col * bw;
      const id = (row * 7 + col * 3) % 64;
      if (yo >= bh - mortar || xo >= bw - mortar) {
        const m = mulc(mortarCol, 0.9 + ihash(x, y, img.seed) * 0.2);
        img.set(x, y, m); img.H(x, y, mortarH);
        continue;
      }
      let c = colsFn(x, y, shades[id], id);
      // bevel: light top-left, dark bottom-right
      if (yo === 0 || xo === 0) c = mulc(c, 1 + bevel);
      else if (yo === bh - mortar - 1 || xo === bw - mortar - 1) c = mulc(c, 1 - bevel);
      img.set(x, y, c);
      img.H(x, y, 0.75 + ihash(x, y, img.seed + 2) * 0.15);
    }
  }
  void rows;
}

function mossOverlay(img, amount = 0.5, seed = 77) {
  const cols = ['#3d5a22', '#4a6b28', '#567c2e', '#638c36'];
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const n = fbm(x, y, 4, 3, img.seed + seed) + (1 - y / TS) * 0.12;
    if (n > 1 - amount * 0.62) {
      img.set(x, y, pal(cols, ihash(x, y, img.seed + seed) * 0.7 + (n - 0.5)));
      img.H(x, y, img.getH(x, y) + 0.1);
    }
  }
}

function plankPattern(img, cols, opts = {}) {
  const { boardH = 8 } = opts;
  const r = new RNG(img.seed);
  for (let b = 0; b < TS / boardH; b++) {
    const joint = r.irange(4, 28);
    const shade = 0.92 + r.next() * 0.16;
    for (let y = b * boardH; y < (b + 1) * boardH; y++) {
      for (let x = 0; x < TS; x++) {
        const yo = y - b * boardH;
        const g = vnoise2(x, y + b * 13, 2, 16, img.seed + b) * 0.7 + ihash(x, y, img.seed) * 0.3;
        let c = mulc(pal(cols, g), shade);
        let h = 0.7 + g * 0.2;
        if (yo === boardH - 1) { c = mulc(c, 0.62); h = 0.2; }
        else if (yo === 0) c = mulc(c, 1.08);
        if (x === joint && yo < boardH - 1) { c = mulc(c, 0.7); h = 0.35; }
        img.set(x, y, c); img.H(x, y, h);
      }
      // nails
    }
    const nx1 = (joint + 2) % TS, nx2 = (joint + TS - 3) % TS, ny = b * boardH + 3;
    img.set(nx1, ny, mulc(hex(cols[0]), 0.55)); img.set(nx2, ny, mulc(hex(cols[0]), 0.55));
  }
}

function barkPattern(img, cols, opts = {}) {
  const { crev = 0.36, streakX = 6, streakY = 2 } = opts;
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const n = vnoise2(x, y, streakX * 2, streakY * 2, img.seed) * 0.55 + vnoise2(x, y, streakX * 4, streakY * 3, img.seed + 4) * 0.25 + ihash(x, y, img.seed) * 0.2;
    let c = pal(cols, n);
    let h = n;
    if (n < crev) { c = mulc(c, 0.7); h = 0.1; }
    img.set(x, y, c); img.H(x, y, h);
  }
}

function logTop(img, ringCols, barkCols) {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const dx = x - 15.5, dy = y - 15.5;
    const sq = Math.pow(Math.pow(Math.abs(dx), 4) + Math.pow(Math.abs(dy), 4), 0.25);
    const d = Math.hypot(dx, dy) * 0.35 + sq * 0.65;
    if (d > 13.6) {
      const n = ihash(x, y, img.seed);
      img.set(x, y, pal(barkCols, n)); img.H(x, y, 0.4 + n * 0.3);
      continue;
    }
    const w = d + (vnoise(x, y, 4, img.seed) - 0.5) * 2.2;
    const ring = (w / 2.6) % 1;
    const t = ring < 0.3 ? 0.15 : 0.55 + ihash(x, y, img.seed + 1) * 0.4;
    img.set(x, y, pal(ringCols, t));
    img.H(x, y, ring < 0.3 ? 0.4 : 0.6);
  }
}

function leavesPattern(img, cols, opts = {}) {
  const { density = 0.36, needles = false, tinted = true } = opts;
  const r = new RNG(img.seed);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const cl = fbm(x, y, 8, 2, img.seed);
    const n = cl * 0.65 + ihash(x, y, img.seed + 3) * 0.35;
    if (n < density) { img.set(x, y, [0, 0, 0], 0); img.H(x, y, 0); continue; }
    let t = (cl - 0.3) * 1.5 + (ihash(x, y, img.seed + 8) - 0.5) * 0.5;
    const c = pal(cols, t);
    img.set(x, y, c); img.H(x, y, 0.3 + t * 0.6);
    if (tinted) img.M(x, y, 1);
  }
  if (needles) {
    for (let i = 0; i < 60; i++) {
      let x = r.irange(0, 31), y = r.irange(0, 31);
      const dx = r.chance(0.5) ? 1 : -1;
      for (let k = 0; k < 3; k++) {
        img.set(x, y, pal(cols, 0.2 + r.next() * 0.3)); img.H(x, y, 0.3);
        if (tinted) img.M(x, y, 1);
        x += dx; y += 1;
      }
    }
  }
  // highlight specks
  for (let i = 0; i < 26; i++) {
    const x = r.irange(0, 31), y = r.irange(0, 31);
    if (img.alpha(x, y) > 0) { img.set(x, y, pal(cols, 0.95)); img.H(x, y, 0.95); }
  }
}

function speckle(img, count, col, h = 0.1, seed = 5) {
  const r = new RNG(img.seed + seed);
  for (let i = 0; i < count; i++) {
    const x = r.irange(0, 31), y = r.irange(0, 31);
    img.set(x, y, typeof col === 'function' ? col(r) : col);
    img.H(x, y, img.getH(x, y) + h);
  }
}

function metalPanel(img, cols, opts = {}) {
  const { rivets = true, glint = 0.6 } = opts;
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const n = vnoise2(x, y, 2, 16, img.seed) * 0.5 + ihash(x, y, img.seed) * 0.15 + 0.3;
    let c = pal(cols, n);
    let h = 0.7;
    const edge = Math.min(x, y, 31 - x, 31 - y);
    if (edge === 0) { c = mulc(c, 0.7); h = 0.3; }
    else if (edge === 1) { c = (x === 1 || y === 1) ? mulc(c, 1.2) : mulc(c, 0.85); h = 0.85; }
    img.set(x, y, c); img.H(x, y, h); img.S(x, y, glint);
  }
  if (rivets) for (const [x, y] of [[4, 4], [27, 4], [4, 27], [27, 27]]) {
    img.set(x, y, mulc(hex(cols[cols.length - 1]), 1.1)); img.H(x, y, 1);
    img.set(x + 1, y + 1, mulc(hex(cols[0]), 0.7));
  }
}

function gemTiles(img, cols, opts = {}) {
  const { smooth = 0.85 } = opts;
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const v = voronoi(x, y, 3, img.seed, 0.6);
    const edge = v.d2 - v.d1;
    let t = 0.35 + ((x - v.px) * -0.04 + (y - v.py) * -0.04) + ihash(v.id, 0, img.seed) * 0.25;
    let c = pal(cols, t);
    let h = 0.8 - v.d1 / 14;
    if (edge < 1.0) { c = mulc(hex(cols[0]), 0.85); h = 0.2; }
    img.set(x, y, c); img.H(x, y, h); img.S(x, y, smooth);
  }
  const edge = (x, y) => Math.min(x, y, 31 - x, 31 - y);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) if (edge(x, y) === 0) img.shade(x, y, 0.75);
}

function plantStem(img, x0, y0, y1, col, wiggle = 0, seed = 1) {
  let x = x0;
  for (let y = y0; y >= y1; y--) {
    img.setClip(Math.round(x), y, col);
    if (wiggle) x += (ihash(y, 0, seed) - 0.5) * wiggle;
  }
  return Math.round(x);
}

function disc(img, cx, cy, r, colFn) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r) { const c = colFn(x, y, d); if (c) img.setClip(x, y, c); }
    }
}

function woolPattern(img, base) {
  const b = hex(base);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const f = Math.sin((x + y * 0.5) * 1.3 + vnoise(x, y, 8, img.seed) * 6) * 0.5 + 0.5;
    const n = f * 0.12 + ihash(x, y, img.seed) * 0.08 + vnoise(x, y, 4, img.seed + 3) * 0.1;
    img.set(x, y, mulc(b, 0.86 + n)); img.H(x, y, 0.5 + n * 2);
  }
}

function cropPattern(img, stage, kind) {
  img.clear(); img.wrap = false;
  const r = new RNG(img.seed);
  const green = ['#2f6b1f', '#3d8a28', '#4ea232', '#62b83f'];
  const gold = ['#9a7a26', '#c19a35', '#dcbc4c', '#efd36a'];
  const hmax = [8, 15, 23, 29][stage];
  for (let s = 0; s < 6; s++) {
    let x = 3 + s * 5 + r.irange(-1, 1);
    const h = Math.max(3, hmax - r.irange(0, 4));
    for (let k = 0; k < h; k++) {
      const y = 31 - k;
      const t = k / h;
      let c = kind === 'wheat' && stage === 3 ? pal(gold, 0.3 + t * 0.6) : pal(green, 0.2 + t * 0.6);
      if (kind === 'wheat' && stage === 2 && t > 0.6) c = pal(gold, t);
      img.setClip(x, y, c);
      if (k > 2 && r.chance(0.18)) { img.setClip(x + (r.chance(0.5) ? 1 : -1), y, c); }
      if (r.chance(0.1)) x += r.chance(0.5) ? 1 : -1;
    }
    if (kind === 'wheat' && stage >= 2) {
      for (let k = 0; k < 6; k++) {
        const y = 31 - h + k;
        img.setClip(x - 1, y, pal(gold, 0.6 + (k % 2) * 0.3));
        img.setClip(x + 1, y, pal(gold, 0.4 + (k % 2) * 0.3));
      }
    }
    if (kind === 'carrots' && stage === 3) {
      img.setClip(x, 31, hex('#e2741f')); img.setClip(x + 1, 31, hex('#c95f14')); img.setClip(x, 30, hex('#f08a2a'));
    }
  }
}

// ---------- texture definitions ----------
const G = {};

G.stone = (img) => stoneBase(img);
G.cobblestone = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const v = voronoi(x, y, 4, img.seed, 0.9);
    const edge = v.d2 - v.d1;
    const base = 0.35 + ihash(v.id, 1, img.seed) * 0.45;
    const lit = ((v.px - x) + (v.py - y)) * 0.035;
    const n = base + lit + (ihash(x, y, img.seed) - 0.5) * 0.18;
    let c = pal(['#37373b', '#424246', '#4d4d51', '#58585c', '#636367', '#6f6f73'], n);
    let h = 0.55 + (1 - v.d1 / 6) * 0.35;
    if (edge < 1.3) { c = hex('#28282b'); h = 0.05; }
    img.set(x, y, c); img.H(x, y, h);
  }
};
G.mossy_cobblestone = (img) => { G.cobblestone(img); mossOverlay(img, 0.55); };
G.bedrock = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const v = voronoi(x, y, 5, img.seed, 1);
    const n = ihash(v.id, 3, img.seed) * 0.7 + ihash(x, y, img.seed) * 0.3;
    img.set(x, y, pal(['#1f1f22', '#2e2e32', '#3e3e43', '#56565b', '#6e6e73'], n));
    img.H(x, y, n);
  }
};
G.dirt = (img) => {
  fillNoise(img, ['#583b25', '#66452b', '#734f32', '#7f5a3a', '#8b6543', '#96704c'], { cells: 4, oct: 3, grain: 0.35 });
  const r = new RNG(img.seed);
  // pebbles
  for (let i = 0; i < 9; i++) {
    const x = r.irange(0, 31), y = r.irange(0, 31);
    const g = pal(['#6d6762', '#7c7670', '#8d8780'], r.next());
    img.set(x, y, g); img.H(x, y, 0.95);
    if (r.chance(0.6)) { img.set(x + 1, y, mulc(g, 0.85)); img.H(x + 1, y, 0.85); }
    if (r.chance(0.4)) { img.set(x, y + 1, mulc(g, 0.7)); img.H(x, y + 1, 0.7); }
  }
  // a few tiny root fibres (short and low contrast so they never read as cracks)
  for (let i = 0; i < 3; i++) {
    let x = r.irange(0, 31), y = r.irange(0, 31);
    for (let k = 0; k < r.irange(2, 3); k++) {
      img.set(x, y, mulc(img.get(x, y), 1.12)); img.H(x, y, 0.7);
      x += r.irange(-1, 1); y += 1;
    }
  }
  // dark specks
  speckle(img, 20, hex('#3f2918'), -0.25);
};
G.grass_top = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const n = fbm(x, y, 4, 2, img.seed) * 0.45 + ihash(x, y, img.seed) * 0.4 + vnoise2(x, y, 32, 8, img.seed + 2) * 0.15;
    img.set(x, y, pal(['#6f6f6f', '#7f7f7f', '#8f8f8f', '#a0a0a0', '#b2b2b2', '#c4c4c4'], n));
    img.H(x, y, n); img.M(x, y, 1);
  }
};
G.grass_side = (img) => {
  G.dirt(img);
  for (let x = 0; x < TS; x++) {
    const depth = 5 + Math.floor(vnoise(x, 0, 8, img.seed) * 4 + ihash(x, 1, img.seed) * 3);
    for (let y = 0; y < depth; y++) {
      const n = ihash(x, y, img.seed + 5) * 0.6 + 0.3 - (y / depth) * 0.2;
      img.set(x, y, pal(['#6f6f6f', '#808080', '#929292', '#a4a4a4', '#b6b6b6'], n));
      img.H(x, y, 0.8); img.M(x, y, 1);
    }
    img.set(x, depth, mulc(img.get(x, depth), 0.75));
    if (ihash(x, 9, img.seed) > 0.75) { img.set(x, depth, pal(['#7a7a7a'], 0)); img.M(x, depth, 1); }
  }
};
G.grass_snow_side = (img) => {
  G.dirt(img);
  for (let x = 0; x < TS; x++) {
    const depth = 6 + Math.floor(vnoise(x, 0, 8, img.seed) * 4 + ihash(x, 1, img.seed) * 2);
    for (let y = 0; y < depth; y++) {
      img.set(x, y, pal(['#dfe7f1', '#e8eef6', '#f1f5fa', '#fafcff'], ihash(x, y, img.seed) * 0.6 + 0.4 - y / depth * 0.3));
      img.H(x, y, 0.85); img.S(x, y, 0.25);
    }
    img.set(x, depth, mulc(img.get(x, depth), 0.8));
  }
};
G.sand = (img) => {
  fillNoise(img, ['#cdb47a', '#d6bf86', '#dcc690', '#e2cd99', '#e8d5a3', '#efdeb0'], { cells: 4, oct: 2, grain: 0.6 });
  speckle(img, 18, hex('#b49a63'), -0.2);
  speckle(img, 10, hex('#f6ead0'), 0.1, 9);
};
G.red_sand = (img) => {
  fillNoise(img, ['#a5521f', '#b35d25', '#bd672c', '#c77234', '#d07d3d'], { cells: 4, oct: 2, grain: 0.6 });
  speckle(img, 18, hex('#8a4116'), -0.2);
};
G.gravel = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const v = voronoi(x, y, 8, img.seed, 1);
    const edge = v.d2 - v.d1;
    const t = ihash(v.id, 2, img.seed);
    const cols = t < 0.33 ? ['#6a6460', '#7a7470', '#8a8480'] : t < 0.66 ? ['#7d7a78', '#8f8c8a', '#a19e9c'] : ['#6b5d52', '#7c6c60', '#8d7c6f'];
    let c = pal(cols, 0.5 + (v.px - x + v.py - y) * 0.08);
    let h = 0.8 - v.d1 / 4;
    if (edge < 0.8) { c = hex('#4a4542'); h = 0; }
    img.set(x, y, c); img.H(x, y, h);
  }
};
G.clay = (img) => {
  fillNoise(img, ['#8f95a3', '#979dab', '#9fa5b3', '#a7adbb', '#aeb4c2'], { cells: 2, oct: 3, grain: 0.25 });
  img.normalStrength = 0.4;
};
G.sandstone_top = (img) => {
  fillNoise(img, ['#cfb880', '#d7c18a', '#dec993', '#e5d19c'], { cells: 3, oct: 3, grain: 0.3 });
  img.normalStrength = 0.5;
};
G.sandstone_bottom = (img) => {
  fillNoise(img, ['#c3aa70', '#ccb47a', '#d6be85', '#dec88f'], { cells: 6, oct: 3, grain: 0.4 });
};
G.sandstone_side = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const band = vnoise2(x, y, 2, 12, img.seed) * 0.6 + ihash(x, y, img.seed) * 0.25;
    let n = band;
    if (y < 4) n += 0.25;
    if (y > 27) n -= 0.15;
    let c = pal(['#bea46b', '#c8ae75', '#d2b980', '#dbc38a', '#e3cd95'], n);
    let h = 0.5 + band * 0.4;
    if (y === 4 || y === 27 || (y % 9 === 0 && ihash(x >> 2, y, img.seed) > 0.5)) { c = mulc(c, 0.82); h = 0.2; }
    img.set(x, y, c); img.H(x, y, h);
  }
};
G.carved_sandstone = (img) => {
  G.sandstone_top(img);
  const dark = hex('#a88f58');
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const e = Math.min(x, y, 31 - x, 31 - y);
    if (e === 1 || e === 2) { img.set(x, y, e === 1 ? dark : mulc(dark, 1.15)); img.H(x, y, 0.2); }
    const d = Math.hypot(x - 15.5, y - 15.5);
    if (Math.abs(d - 7) < 0.8 || d < 2.5) { img.set(x, y, dark); img.H(x, y, 0.15); }
    const a = Math.atan2(y - 15.5, x - 15.5);
    if (d > 8.5 && d < 12 && Math.abs(Math.sin(a * 4)) > 0.92) { img.set(x, y, dark); img.H(x, y, 0.15); }
  }
};
G.snow = (img) => {
  fillNoise(img, ['#dfe7f2', '#e7eef7', '#eff4fa', '#f7fafd', '#ffffff'], { cells: 4, oct: 3, grain: 0.4, bias: 0.15 });
  speckle(img, 12, hex('#cbd8ea'), -0.2);
  img.fillSmooth(0.25); img.normalStrength = 0.5;
};
G.ice = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const n = fbm(x, y, 3, 3, img.seed) * 0.7 + ihash(x, y, img.seed) * 0.1;
    const streak = Math.abs(((x + y * 0.6) % 11) - 5.5) < 0.6 ? 0.2 : 0;
    img.set(x, y, pal(['#8fb8ea', '#9cc2ef', '#a9ccf3', '#b9d7f7', '#cfe4fb'], n + streak), 0.75);
    img.H(x, y, 0.5 + streak);
  }
  const r = new RNG(img.seed);
  void r;
  for (let i = 0; i < N; i++) img.c[i * 4 + 3] = 0.72;
  img.fillSmooth(0.95); img.normalStrength = 0.3;
};
G.frost_ice = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const v = voronoi(x, y, 3, img.seed, 0.9);
    const n = ihash(v.id, 0, img.seed) * 0.5 + fbm(x, y, 4, 2, img.seed) * 0.4;
    let c = pal(['#7fa6dc', '#8cb1e3', '#99bcea', '#a7c7ef', '#b8d4f4'], n);
    if (v.d2 - v.d1 < 0.9) c = hex('#c9e0fa');
    img.set(x, y, c); img.H(x, y, n);
  }
  img.fillSmooth(0.75); img.normalStrength = 0.5;
};
G.water = (img) => {
  fillNoise(img, ['#24509e', '#2a5aac', '#3164b8', '#3a6fc4', '#4a7ed0'], { cells: 4, oct: 3, grain: 0.15 });
  for (let i = 0; i < N; i++) img.c[i * 4 + 3] = 0.8;
  img.fillSmooth(1); img.fillMask(1);
};
G.water_flow = G.water;
G.lava = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const v = voronoi(x, y, 4, img.seed, 0.9);
    const n = fbm(x, y, 4, 3, img.seed) * 0.6 + (1 - Math.min(1, (v.d2 - v.d1) / 4)) * 0.5;
    img.set(x, y, pal(['#8c1a05', '#b52e08', '#d9480c', '#f06f14', '#fb9a26', '#ffc94a', '#fff08f'], n));
    img.H(x, y, 1 - n);
  }
  img.normalStrength = 0.5;
};
G.mud = (img) => {
  fillNoise(img, ['#352820', '#3d2e25', '#45352a', '#4e3c30', '#574436'], { cells: 3, oct: 3, grain: 0.3 });
  speckle(img, 14, hex('#2a1f19'), -0.3);
  img.fillSmooth(0.45);
};
G.moss = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const n = fbm(x, y, 8, 2, img.seed) * 0.55 + ihash(x, y, img.seed) * 0.45;
    img.set(x, y, pal(['#3a5520', '#456427', '#51732d', '#5d8234', '#6a903c', '#7a9f47'], n));
    img.H(x, y, n);
  }
};
G.forest_floor_top = (img) => {
  fillNoise(img, ['#4a3220', '#573b25', '#64452b', '#6f4e2f'], { cells: 4, oct: 2, grain: 0.4 });
  const r = new RNG(img.seed);
  const litter = ['#8a5a28', '#9b6a2e', '#7b4f22', '#a8783a', '#5f6b2a', '#6c3b1a'];
  for (let i = 0; i < 70; i++) {
    let x = r.irange(0, 31), y = r.irange(0, 31);
    const c = pal(litter, r.next());
    const dx = r.irange(-1, 1), dy = r.chance(0.5) ? 1 : -1;
    for (let k = 0; k < r.irange(2, 4); k++) { img.set(x, y, c); img.H(x, y, 0.8); x += dx; y += dy; }
  }
};
G.forest_floor_side = (img) => {
  G.dirt(img);
  for (let x = 0; x < TS; x++) {
    const depth = 3 + Math.floor(ihash(x, 0, img.seed) * 3);
    for (let y = 0; y < depth; y++) {
      img.set(x, y, pal(['#5a3c22', '#7b4f22', '#8a5a28', '#64452b'], ihash(x, y, img.seed + 3)));
      img.H(x, y, 0.8);
    }
  }
};

// ores
const ORE = (cols, count, opts) => (img) => { stoneBase(img); oreClusters(img, cols, count, opts); };
G.coal_ore = ORE(['#151515', '#232323', '#323232', '#474747'], 7, { smooth: 0.2 });
G.copper_ore = (img) => {
  stoneBase(img);
  oreClusters(img, ['#6f3a1b', '#9c5128', '#c26a36', '#dd8b52', '#efad7a'], 7, { smooth: 0.4 });
  const r = new RNG(img.seed + 9);
  for (let i = 0; i < 6; i++) { const x = r.irange(0, 31), y = r.irange(0, 31); if (img.getH(x, y) > 0.8) img.set(x, y, hex('#4fa58a')); }
};
G.iron_ore = ORE(['#7e6250', '#a07e66', '#c19c80', '#dcbca0', '#efd8c2'], 7, { smooth: 0.35 });
G.gold_ore = ORE(['#8a6a0e', '#c49a17', '#eac532', '#fbe46a', '#fff6b8'], 6, { smooth: 0.7 });
G.emerald_ore = ORE(['#0b4f25', '#138536', '#24bd5b', '#6ef09a', '#d0ffe0'], 4, { smooth: 0.9, size: [2, 4], crystal: true });
G.diamond_ore = ORE(['#155f68', '#239fab', '#4cd6df', '#a6f6f8', '#effeff'], 5, { smooth: 0.95, size: [2, 5], crystal: true });
G.sunstone_ore = ORE(['#8f460a', '#d97f12', '#ffb627', '#ffe27a', '#fffbd9'], 6, { smooth: 0.6, size: [3, 6] });
G.frostite_ore = (img) => {
  stoneBase(img, ['#434b55', '#4c555f', '#565f69', '#606973', '#6b747e']);
  oreClusters(img, ['#24548f', '#3f7fd0', '#7ab6ff', '#c7e6ff', '#ffffff'], 5, { smooth: 0.9, size: [3, 6], crystal: true });
};
G.emberite_ore = (img) => {
  G.basalt_side(img);
  oreClusters(img, ['#4a0b03', '#8f1d08', '#e2461a', '#ff8a2e', '#ffd36b'], 6, { smooth: 0.5, size: [3, 7] });
};

// metal blocks
G.coal_block = (img) => { metalPanel(img, ['#121212', '#1b1b1b', '#242424', '#2e2e2e', '#3a3a3a'], { rivets: false, glint: 0.3 }); speckle(img, 20, hex('#5a5a5a'), 0.2); };
G.copper_block = (img) => { metalPanel(img, ['#8a4524', '#a5552c', '#bf6a3a', '#d6824e', '#e89c6c'], { glint: 0.65 }); speckle(img, 10, hex('#5aa88e'), 0, 4); };
G.iron_block = (img) => metalPanel(img, ['#9a9a9a', '#ababab', '#bcbcbc', '#cccccc', '#dcdcdc'], { glint: 0.7 });
G.gold_block = (img) => metalPanel(img, ['#b8860b', '#d4a017', '#ebbd2c', '#f8d64e', '#fff08a'], { glint: 0.85 });
G.diamond_block = (img) => gemTiles(img, ['#1d8a94', '#2ab7c2', '#55d9e0', '#94eff2', '#dafcfd']);
G.emerald_block = (img) => gemTiles(img, ['#0f6a31', '#189445', '#2abd5f', '#5fe38a', '#b5f7cb']);
G.frostite_block = (img) => gemTiles(img, ['#2a5c9c', '#3f7fd0', '#6aa8f0', '#a6d2ff', '#eef8ff']);
G.emberite_block = (img) => {
  metalPanel(img, ['#3a0f0a', '#4f1610', '#651e15', '#7c281c', '#933526'], { glint: 0.6 });
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    if ((x === 15 || x === 16 || y === 15 || y === 16) && Math.min(x, y, 31 - x, 31 - y) > 2) {
      img.set(x, y, pal(['#ff6a1a', '#ffa23a', '#ffd06a'], ihash(x, y, img.seed))); img.H(x, y, 0.2);
    }
  }
};
G.sunstone_block = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const v = voronoi(x, y, 4, img.seed, 0.8);
    const n = 0.4 + (1 - v.d1 / 5) * 0.5 + ihash(x, y, img.seed) * 0.15;
    let c = pal(['#c96a10', '#e88a18', '#ffb02e', '#ffd25e', '#fff0a8', '#fffbe6'], n);
    if (v.d2 - v.d1 < 1) c = hex('#a85a10');
    const e = Math.min(x, y, 31 - x, 31 - y);
    if (e < 2) c = e === 0 ? hex('#6b4a2a') : hex('#8a6238');
    img.set(x, y, c); img.H(x, y, e < 2 ? 0.9 : n * 0.6);
  }
};

// woods
const WOOD = {
  oak: { bark: ['#3f2d1a', '#4d3721', '#5a4128', '#684b2f', '#765637'], planks: ['#8b6a3e', '#977446', '#a37e4e', '#ae8856', '#b9935f'], ring: ['#6f5232', '#9c7a49', '#ab8854', '#b8955e'], leaves: ['#4e4e4e', '#636363', '#787878', '#8e8e8e', '#a6a6a6'] },
  birch: { bark: ['#cfcbc0', '#dbd7cd', '#e5e2d9', '#efece5', '#f7f5f0'], planks: ['#bfae74', '#c9b87e', '#d2c288', '#dbcb92', '#e3d49c'], ring: ['#a8955f', '#cdbb82', '#d8c78e', '#e1d199'], leaves: ['#5a5a5a', '#6e6e6e', '#838383', '#999999', '#b0b0b0'] },
  pine: { bark: ['#2f2015', '#3a281a', '#45301f', '#513924', '#5d422a'], planks: ['#5f4026', '#6b4a2c', '#775333', '#835d3a', '#8f6741'], ring: ['#5a3f26', '#7a5636', '#86603c', '#916a43'], leaves: ['#3e3e3e', '#4f4f4f', '#616161', '#737373', '#878787'] },
  willow: { bark: ['#4a4236', '#554c3f', '#605648', '#6b6152', '#766c5c'], planks: ['#7d6e54', '#89795d', '#958567', '#a19170', '#ad9d7a'], ring: ['#6c5e45', '#958567', '#a19170', '#ad9d7a'], leaves: ['#555555', '#6a6a6a', '#808080', '#969696', '#acacac'] },
  teak: { bark: ['#4b3c1f', '#584725', '#65532c', '#725e33', '#7f6a3b'], planks: ['#8f5e38', '#9c6940', '#a97448', '#b67f51', '#c38b5a'], ring: ['#7a4f2e', '#a97448', '#b67f51', '#c38b5a'], leaves: ['#4a4a4a', '#5e5e5e', '#737373', '#898989', '#a0a0a0'] },
  elder: { bark: ['#2b241e', '#352c25', '#3f352c', '#4a3f34', '#55493d'], planks: ['#525a46', '#5d6650', '#68715a', '#737c64', '#7e876e'], ring: ['#454c3a', '#68715a', '#737c64', '#7e876e'], leaves: ['#474747', '#5b5b5b', '#707070', '#868686', '#9c9c9c'] },
  palm: { bark: ['#6e5a3c', '#7d6845', '#8c764f', '#9b8459', '#aa9263'], planks: ['#b98f62', '#c49a6c', '#cfa576', '#d9b081', '#e3bb8c'], ring: ['#9e7a50', '#c49a6c', '#cfa576', '#d9b081'], leaves: ['#525252', '#676767', '#7d7d7d', '#939393', '#aaaaaa'] },
};
for (const w in WOOD) {
  const d = WOOD[w];
  G[w + '_log'] = (img) => {
    if (w === 'birch') {
      fillNoise(img, d.bark, { cells: 2, oct: 2, grain: 0.3 });
      const r = new RNG(img.seed);
      for (let i = 0; i < 14; i++) {
        const y = r.irange(0, 31), x0 = r.irange(0, 31), len = r.irange(2, 7);
        for (let k = 0; k < len; k++) { img.set(x0 + k, y, hex(k === 0 || k === len - 1 ? '#4a4540' : '#26221f')); img.H(x0 + k, y, 0.2); }
      }
    } else if (w === 'palm') {
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
        const n = vnoise2(x, y, 4, 2, img.seed) * 0.4 + ihash(x, y, img.seed) * 0.2 + ((y % 8) / 8) * 0.4;
        let c = pal(d.bark, n);
        if (y % 8 === 7) c = mulc(c, 0.7);
        img.set(x, y, c); img.H(x, y, (y % 8) / 8);
      }
    } else {
      barkPattern(img, d.bark);
      if (w === 'elder' || w === 'teak') mossOverlay(img, w === 'elder' ? 0.45 : 0.25, 31);
    }
  };
  G[w + '_log_top'] = (img) => logTop(img, d.ring, d.bark);
  G[w + '_planks'] = (img) => plankPattern(img, d.planks);
  G[w + '_leaves'] = (img) => leavesPattern(img, d.leaves, { needles: w === 'pine', density: w === 'pine' ? 0.4 : w === 'willow' ? 0.4 : 0.34 });
}
G.snowy_pine_leaves = (img) => {
  leavesPattern(img, ['#24402c', '#2c4c34', '#35583c', '#3f6445', '#4a704f'], { needles: true, density: 0.38, tinted: false });
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    if (img.alpha(x, y) > 0 && fbm(x, y, 4, 2, img.seed + 50) > 0.52) {
      img.set(x, y, pal(['#dfe8f2', '#eef3f9', '#ffffff'], ihash(x, y, 4))); img.H(x, y, 0.9);
    }
  }
};
G.stripped_oak_log = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const n = vnoise2(x, y, 16, 2, img.seed) * 0.7 + ihash(x, y, img.seed) * 0.3;
    img.set(x, y, pal(['#9b7a4a', '#a88553', '#b4905c', '#bf9b66'], n)); img.H(x, y, n);
  }
};

G.glass = (img) => {
  img.clear();
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const e = Math.min(x, y, 31 - x, 31 - y);
    if (e === 0) { img.set(x, y, hex('#9fb4bf'), 1); img.H(x, y, 0.7); }
    else if (e === 1) { img.set(x, y, hex('#dbe8ee'), 1); img.H(x, y, 0.9); }
    else img.set(x, y, [0.85, 0.92, 0.95], 0);
  }
  // diagonal shine streaks
  for (let k = 0; k < 6; k++) { img.set(5 + k, 10 - k, hex('#ffffff'), 1); img.set(7 + k, 11 - k, hex('#e9f3f7'), 1); }
  for (let k = 0; k < 4; k++) img.set(20 + k, 26 - k, hex('#ffffff'), 1);
  img.fillSmooth(0.95); img.wrap = false;
};
G.bricks = (img) => {
  bricksPattern(img, 11, 6, 1, (x, y, s) => mulc(pal(['#7c3125', '#8b392b', '#994232', '#a64b39', '#b25641'], s * 0.8 + ihash(x, y, img.seed) * 0.25), 1),
    { mortarCol: hex('#a39d94'), mortarH: 0.1, bevel: 0.1 });
};
const stoneBrickCols = ['#646468', '#6f6f73', '#7a7a7e', '#858589', '#909094'];
G.stone_bricks = (img) => {
  bricksPattern(img, 16, 8, 1, (x, y, s) => pal(stoneBrickCols, s * 0.4 + 0.25 + (fbm(x, y, 4, 2, img.seed) - 0.5) * 0.5 + (ihash(x, y, img.seed) - 0.5) * 0.25),
    { mortarCol: hex('#3f3f42'), mortarH: 0.05, bevel: 0.12 });
};
G.cracked_stone_bricks = (img) => {
  G.stone_bricks(img);
  const r = new RNG(img.seed + 5);
  for (let i = 0; i < 3; i++) crackWalk(img, r, r.irange(5, 9), hex('#4a4a4e'), 0.25);
};
G.mossy_stone_bricks = (img) => { G.stone_bricks(img); mossOverlay(img, 0.5); };
G.smooth_stone = (img) => {
  fillNoise(img, ['#9a9a9c', '#a2a2a4', '#aaaaac', '#b2b2b4'], { cells: 2, oct: 2, grain: 0.3 });
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const e = Math.min(x, y, 31 - x, 31 - y);
    if (e === 0) { img.set(x, y, hex('#7d7d80')); img.H(x, y, 0.2); }
  }
  img.fillSmooth(0.35); img.normalStrength = 0.6;
};
G.darkstone = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const n = vnoise2(x, y, 4, 12, img.seed) * 0.5 + fbm(x, y, 4, 2, img.seed + 3) * 0.3 + ihash(x, y, img.seed) * 0.2;
    img.set(x, y, pal(['#2e2e36', '#373740', '#40404a', '#4a4a54', '#54545e'], n)); img.H(x, y, n);
  }
  const r = new RNG(img.seed);
  for (let i = 0; i < 12; i++) { const x = r.irange(0, 31), y = r.irange(0, 31); img.set(x, y, hex('#5e5e6a')); }
};
G.granite = (img) => {
  fillNoise(img, ['#875a49', '#966655', '#a47262', '#b17e6e', '#bd8b7b'], { cells: 4, oct: 3, grain: 0.45 });
  speckle(img, 30, hex('#d9b7a6'), 0.15);
  speckle(img, 20, hex('#5f3d31'), -0.15, 3);
};
G.marble = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const n = fbm(x, y, 2, 4, img.seed);
    const vein = Math.abs(Math.sin((x * 0.25 + y * 0.12 + n * 6)));
    let c = pal(['#dedbd5', '#e6e3dd', '#eeebe6', '#f6f4f0'], ihash(x, y, img.seed) * 0.5 + 0.5);
    if (vein < 0.12) c = mixc(c, hex('#8c8a88'), 0.6);
    img.set(x, y, c); img.H(x, y, vein < 0.12 ? 0.4 : 0.6);
  }
  img.fillSmooth(0.55); img.normalStrength = 0.4;
};
G.marble_bricks = (img) => {
  bricksPattern(img, 16, 16, 1, (x, y, s) => pal(['#e2dfd9', '#e9e6e1', '#f0eee9', '#f7f5f1'], s * 0.5 + ihash(x, y, img.seed) * 0.4),
    { mortarCol: hex('#b5b1aa'), mortarH: 0.1, bevel: 0.06 });
  img.fillSmooth(0.45);
};
G.basalt_side = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const col = Math.floor(x / 6);
    const n = vnoise2(x, y, 16, 3, img.seed) * 0.4 + ihash(col, 0, img.seed) * 0.3 + ihash(x, y, img.seed) * 0.2;
    let c = pal(['#2f2f33', '#38383c', '#414146', '#4a4a50', '#54545a'], n);
    let h = n;
    if (x % 6 === 5) { c = mulc(c, 0.7); h = 0.1; }
    img.set(x, y, c); img.H(x, y, h);
  }
};
G.basalt_top = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const v = voronoi(x, y, 3, img.seed, 0.7);
    let c = pal(['#36363a', '#3f3f44', '#48484d', '#525257'], ihash(v.id, 0, img.seed) * 0.6 + ihash(x, y, 1) * 0.3);
    if (v.d2 - v.d1 < 1) c = hex('#26262a');
    img.set(x, y, c); img.H(x, y, v.d2 - v.d1 < 1 ? 0.1 : 0.6);
  }
};
G.ash = (img) => {
  fillNoise(img, ['#55524f', '#5f5c59', '#696663', '#73706d', '#7d7a77'], { cells: 4, oct: 3, grain: 0.55 });
  speckle(img, 16, hex('#3a3836'), -0.2);
  speckle(img, 8, hex('#a3412a'), 0, 4);
};
G.obsidian = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const v = voronoi(x, y, 4, img.seed, 1);
    const n = fbm(x, y, 4, 3, img.seed) * 0.6 + ihash(v.id, 0, img.seed) * 0.4;
    img.set(x, y, pal(['#0e0a16', '#151020', '#1d162b', '#271e38', '#352a4c', '#4b3d69'], n)); img.H(x, y, n);
  }
  img.fillSmooth(0.85);
};
G.magma = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const v = voronoi(x, y, 4, img.seed, 0.9);
    const e = v.d2 - v.d1;
    let c, h;
    if (e < 1.6) { c = pal(['#ff7a1a', '#ffb23a', '#ffe08a'], 1 - e / 1.6 + ihash(x, y, 2) * 0.2); h = 0; }
    else { c = pal(['#3a1a12', '#4a2116', '#5a291a', '#6b331f'], ihash(v.id, 0, img.seed) * 0.6 + ihash(x, y, 3) * 0.3); h = 0.7; }
    img.set(x, y, c); img.H(x, y, h);
  }
};
G.scorched_stone = (img) => {
  stoneBase(img, ['#221e20', '#2a2528', '#322c30', '#3a3438', '#433c40', '#4d4549'], 5);
};
const CLAY_COL = { red: '#8a3a2b', orange: '#a0562a', yellow: '#b2813a', white: '#cfb1a0', brown: '#4d3324', gray: '#3b2c27' };
for (const c in CLAY_COL) {
  G['baked_clay_' + c] = (img) => {
    const b = hex(CLAY_COL[c]);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const n = fbm(x, y, 4, 2, img.seed) * 0.12 + ihash(x, y, img.seed) * 0.08;
      img.set(x, y, mulc(b, 0.92 + n)); img.H(x, y, 0.5 + n);
    }
    img.normalStrength = 0.5;
  };
}

// plants
G.tall_grass = (img) => {
  img.clear(); img.wrap = false;
  const r = new RNG(img.seed);
  for (let b = 0; b < 13; b++) {
    let x = r.irange(2, 29);
    const h = r.irange(10, 28);
    const lean = (r.next() - 0.5) * 0.35;
    let fx = x;
    for (let k = 0; k < h; k++) {
      const y = 31 - k;
      const t = k / h;
      img.setClip(Math.round(fx), y, pal(['#6a6a6a', '#7f7f7f', '#959595', '#ababab', '#c0c0c0'], 0.15 + t * 0.7 + r.next() * 0.15));
      img.M(Math.round(fx), y, 1);
      if (k < h * 0.3) { img.setClip(Math.round(fx) + 1, y, pal(['#5f5f5f', '#747474'], r.next())); img.M(Math.round(fx) + 1, y, 1); }
      fx += lean * (0.5 + t);
    }
  }
};
G.fern = (img) => {
  img.clear(); img.wrap = false;
  const r = new RNG(img.seed);
  for (let f = 0; f < 5; f++) {
    const ang = -Math.PI / 2 + (f - 2) * 0.38;
    const len = r.irange(18, 27);
    for (let k = 0; k < len; k++) {
      const x = Math.round(16 + Math.cos(ang) * k * (0.8 + k * 0.012)), y = Math.round(31 + Math.sin(ang) * k);
      img.setClip(x, y, pal(['#686868', '#7c7c7c'], r.next())); img.M(x, y, 1);
      if (k % 2 === 0 && k > 2) {
        const w = Math.max(1, Math.round((1 - k / len) * 4));
        for (let s = 1; s <= w; s++) {
          img.setClip(x + s, y + (s >> 1), pal(['#8a8a8a', '#a0a0a0', '#b6b6b6'], r.next())); img.M(x + s, y + (s >> 1), 1);
          img.setClip(x - s, y + (s >> 1), pal(['#8a8a8a', '#a0a0a0', '#b6b6b6'], r.next())); img.M(x - s, y + (s >> 1), 1);
        }
      }
    }
  }
};
function flower(img, petal, center, shape) {
  img.clear(); img.wrap = false;
  const stem = hex('#3d7a2a'), leaf = hex('#4f9233');
  const top = shape === 'tall' ? 8 : shape === 'cluster' ? 6 : 12;
  plantStem(img, 16, 31, top, stem, 0.6, img.seed);
  for (const [lx, ly, d] of [[15, 25, -1], [17, 21, 1]]) {
    for (let k = 0; k < 4; k++) img.setClip(lx + d * k, ly - (k >> 1), k === 3 ? mulc(leaf, 1.2) : leaf);
  }
  const P5 = P(petal);
  if (shape === 'daisy') {
    for (let a = 0; a < 10; a++) {
      const an = a / 10 * Math.PI * 2;
      for (let k = 2; k < 7; k++) img.setClip(Math.round(16 + Math.cos(an) * k), Math.round(top + Math.sin(an) * k * 0.9), P5[Math.min(P5.length - 1, Math.floor(k / 2))]);
    }
    disc(img, 16, top, 2, () => hex(center));
  } else if (shape === 'bell') {
    for (let y = -6; y <= 2; y++) for (let x = -5; x <= 5; x++) {
      const w = y < -3 ? 3 : y < 0 ? 4 : 5;
      if (Math.abs(x) <= w - (y === 2 && Math.abs(x) % 2 === 1 ? 1 : 0)) img.setClip(16 + x, top + y, P5[Math.max(0, Math.min(P5.length - 1, Math.floor((x + 6) / 4 + (y + 6) / 8)))]);
    }
    img.setClip(16, top + 3, hex(center));
  } else if (shape === 'star') {
    for (let a = 0; a < 5; a++) {
      const an = a / 5 * Math.PI * 2 - Math.PI / 2;
      for (let k = 0; k < 6; k++) for (let w = -1; w <= 1; w++) {
        if (Math.abs(w) > (6 - k) / 3) continue;
        img.setClip(Math.round(16 + Math.cos(an) * k - Math.sin(an) * w), Math.round(top + Math.sin(an) * k + Math.cos(an) * w), P5[Math.min(P5.length - 1, Math.floor(k / 2))]);
      }
    }
    disc(img, 16, top, 1.2, () => hex(center));
  } else if (shape === 'tall') {
    for (let p = 0; p < 3; p++) {
      const dx = (p - 1) * 3;
      for (let k = 0; k < 9; k++) img.setClip(16 + dx + Math.round(dx * k * 0.08), top + 6 - k, P5[Math.min(P5.length - 1, Math.floor(k / 3))]);
      for (let k = 0; k < 6; k++) img.setClip(16 + dx + 1, top + 5 - k, P5[1]);
    }
    img.setClip(16, top + 7, hex(center));
  } else if (shape === 'cluster') {
    const r = new RNG(img.seed);
    for (let i = 0; i < 26; i++) {
      const y = top + r.irange(0, 14), x = 16 + r.irange(-2, 2) + (y % 2);
      img.setClip(x, y, P5[r.irange(0, P5.length - 1)]);
    }
  } else if (shape === 'pom') {
    disc(img, 16, top, 5, (x, y, d) => P5[Math.min(P5.length - 1, Math.floor((1 - d / 5.5) * P5.length + ihash(x, y, 3) * 1.5))]);
  }
}
G.flower_rosebell = (img) => flower(img, ['#7a1218', '#a81c24', '#d02a30', '#ec4a44'], '#f7d24a', 'bell');
G.flower_sunpetal = (img) => flower(img, ['#d9a10f', '#f2c21c', '#ffdc3a', '#fff07a'], '#c2601a', 'daisy');
G.flower_skybloom = (img) => flower(img, ['#2142a8', '#3466dc', '#5d8cf5', '#9fc0ff'], '#ffffff', 'star');
G.flower_frostlily = (img) => flower(img, ['#b9cbe0', '#d7e3f0', '#eef4fb', '#ffffff'], '#f2d24a', 'tall');
G.flower_duskviolet = (img) => flower(img, ['#4a2378', '#6431a0', '#8048c4', '#a46ee0'], '#ffffff', 'cluster');
G.flower_pinkmallow = (img) => flower(img, ['#b6407a', '#d65a96', '#ee7db2', '#ffaad0'], '#ffffff', 'pom');
G.dead_bush = (img) => {
  img.clear(); img.wrap = false;
  const r = new RNG(img.seed);
  const col = ['#6b4a26', '#7d5a30', '#8f6a3a'];
  const branch = (x, y, ang, len, depth) => {
    for (let k = 0; k < len; k++) {
      x += Math.cos(ang); y += Math.sin(ang);
      img.setClip(Math.round(x), Math.round(y), pal(col, r.next()));
    }
    if (depth > 0) {
      branch(x, y, ang - 0.5 - r.next() * 0.3, len * 0.7, depth - 1);
      branch(x, y, ang + 0.5 + r.next() * 0.3, len * 0.7, depth - 1);
    }
  };
  branch(16, 31, -Math.PI / 2, 7, 3);
};
G.cactus_side = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const ridge = Math.abs(((x + 2) % 6) - 3) / 3;
    const n = 0.3 + ridge * 0.5 + ihash(x, y, img.seed) * 0.15;
    let c = pal(['#1f5520', '#2a6a2a', '#357d33', '#43903e', '#53a34b'], n);
    if (x < 2 || x > 29) c = [0, 0, 0];
    img.set(x, y, c, x < 2 || x > 29 ? 0 : 1); img.H(x, y, n);
  }
  const r = new RNG(img.seed);
  for (let i = 0; i < 18; i++) { const x = 2 + ((r.irange(0, 4) * 6 + 3) % 28), y = r.irange(0, 31); img.set(x, y, hex('#e8e2b0')); img.H(x, y, 1); }
};
G.cactus_top = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const d = Math.max(Math.abs(x - 15.5), Math.abs(y - 15.5));
    const n = 0.3 + ((d % 4) / 4) * 0.4 + ihash(x, y, img.seed) * 0.2;
    img.set(x, y, pal(['#2a6a2a', '#357d33', '#43903e', '#53a34b'], n), d > 14 ? 0 : 1); img.H(x, y, n);
  }
};
G.reeds = (img) => {
  img.clear(); img.wrap = false;
  for (const sx of [6, 15, 24]) {
    for (let y = 0; y < TS; y++) {
      const seg = y % 10 === 0;
      const c = seg ? hex('#6e9a4a') : pal(['#86b55c', '#93c266', '#a0cf72'], ihash(sx, y, img.seed));
      img.set(sx, y, c); img.set(sx + 1, y, mulc(c, 0.85));
      if (seg && y > 0) { img.setClip(sx + 2, y + 1, hex('#7aa852')); img.setClip(sx + 3, y + 2, hex('#7aa852')); }
    }
  }
};
function mushroom(img, cap, dots, glow) {
  img.clear(); img.wrap = false;
  for (let y = 22; y < 32; y++) for (let x = 14; x < 18; x++) img.set(x, y, pal(['#d9d2c0', '#e6e0d0', '#efeadd'], (x - 14) / 4));
  for (let y = 12; y < 23; y++) {
    const w = y < 15 ? 4 + (y - 12) * 2 : 10;
    for (let x = 16 - w; x < 16 + w; x++) {
      const t = 1 - (y - 12) / 11 * 0.6 + ihash(x, y, img.seed) * 0.2 - Math.abs(x - 16) / w * 0.3;
      img.setClip(x, y, pal(cap, t));
    }
  }
  if (dots) for (const [x, y] of [[12, 15], [18, 14], [15, 18], [21, 18], [9, 19]]) img.setClip(x, y, hex(dots));
  void glow;
}
G.mushroom_red = (img) => mushroom(img, ['#7a1612', '#9e1f19', '#c22b22', '#dc3b2e'], '#f4eee0');
G.mushroom_brown = (img) => mushroom(img, ['#5a3f2b', '#6d4d35', '#80603f', '#93714a'], null);
G.glowcap = (img) => mushroom(img, ['#0f5f6b', '#1d8f9a', '#3fd0d6', '#a6fbff'], '#ffffff', true);
G.berry_bush = (img) => {
  leavesPattern(img, ['#244a1c', '#2d5a22', '#376b29', '#427c31', '#4f8c3a'], { density: 0.3, tinted: false });
  img.wrap = false;
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const d = Math.hypot(x - 16, (y - 18) * 1.2);
    if (d > 15) img.set(x, y, [0, 0, 0], 0);
  }
  const r = new RNG(img.seed);
  for (let i = 0; i < 12; i++) {
    const x = r.irange(6, 25), y = r.irange(8, 27);
    if (img.alpha(x, y) > 0) { img.set(x, y, hex('#c41e3a')); img.setClip(x + 1, y, hex('#8e1228')); img.setClip(x, y - 1, hex('#ff6f80')); }
  }
};
G.lily_pad = (img) => {
  img.clear(); img.wrap = false;
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const dx = x - 15.5, dy = y - 15.5, d = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    if (d < 14 && !(a > -0.35 && a < 0.05 && d > 2)) {
      const vein = Math.abs(Math.sin(a * 6)) < 0.15 ? 0.25 : 0;
      img.set(x, y, pal(['#5d5d5d', '#727272', '#878787', '#9c9c9c'], 0.4 + vein + ihash(x, y, 3) * 0.3 - d / 40));
      img.M(x, y, 1);
    }
  }
};
G.vines = (img) => {
  img.clear(); img.wrap = false;
  const r = new RNG(img.seed);
  for (let s = 0; s < 6; s++) {
    let x = r.irange(1, 30);
    const len = r.irange(14, 32);
    for (let y = 0; y < len; y++) {
      img.setClip(x, y, pal(['#5a5a5a', '#707070'], r.next())); img.M(x, y, 1);
      if (r.chance(0.35)) {
        const d = r.chance(0.5) ? 1 : -1;
        img.setClip(x + d, y, pal(['#8a8a8a', '#a2a2a2', '#b8b8b8'], r.next())); img.M(x + d, y, 1);
        img.setClip(x + d * 2, y + 1, pal(['#8a8a8a', '#a2a2a2'], r.next())); img.M(x + d * 2, y + 1, 1);
      }
      if (r.chance(0.2)) x += r.chance(0.5) ? 1 : -1;
    }
  }
};
function saplingArt(img, trunk, leaf) {
  img.clear(); img.wrap = false;
  plantStem(img, 16, 31, 14, hex(trunk));
  plantStem(img, 15, 31, 22, mulc(hex(trunk), 0.8));
  disc(img, 16, 12, 6.5, (x, y, d) => ihash(x, y, img.seed) > 0.25 ? pal(leaf, 1 - d / 7 + ihash(x, y, 9) * 0.3) : null);
  disc(img, 11, 17, 3.5, (x, y) => ihash(x, y, img.seed + 1) > 0.3 ? pal(leaf, 0.4 + ihash(x, y, 2) * 0.3) : null);
  disc(img, 21, 17, 3.5, (x, y) => ihash(x, y, img.seed + 2) > 0.3 ? pal(leaf, 0.4 + ihash(x, y, 2) * 0.3) : null);
}
G.sapling_oak = (img) => saplingArt(img, '#5a4128', ['#2f5e1e', '#3c7426', '#4a8a2f', '#5aa03a']);
G.sapling_birch = (img) => saplingArt(img, '#d8d4c9', ['#4a7a2a', '#5a8e32', '#6ba23c', '#7fb64a']);
G.sapling_pine = (img) => {
  img.clear(); img.wrap = false;
  plantStem(img, 16, 31, 6, hex('#45301f'));
  for (let y = 6; y < 27; y++) {
    const w = Math.floor((y - 4) / 2.4) - ((y % 6) < 2 ? 1 : 0);
    for (let x = 16 - w; x <= 16 + w; x++) if (ihash(x, y, 4) > 0.2) img.setClip(x, y, pal(['#1f3f26', '#2a4f2f', '#355f39'], ihash(x, y, 5)));
  }
};
G.wheat_0 = (img) => cropPattern(img, 0, 'wheat');
G.wheat_1 = (img) => cropPattern(img, 1, 'wheat');
G.wheat_2 = (img) => cropPattern(img, 2, 'wheat');
G.wheat_3 = (img) => cropPattern(img, 3, 'wheat');
G.carrots_0 = (img) => cropPattern(img, 0, 'carrots');
G.carrots_1 = (img) => cropPattern(img, 1, 'carrots');
G.carrots_2 = (img) => cropPattern(img, 2, 'carrots');
G.carrots_3 = (img) => cropPattern(img, 3, 'carrots');
G.farmland = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const furrow = (y % 8) < 2;
    const n = ihash(x, y, img.seed) * 0.4 + fbm(x, y, 4, 2, img.seed) * 0.4 + (furrow ? 0 : 0.25);
    img.set(x, y, pal(['#3a2416', '#47301e', '#553a25', '#62442c', '#704f33'], n)); img.H(x, y, furrow ? 0.1 : 0.7);
  }
  img.fillSmooth(0.2);
};
G.path_top = (img) => {
  fillNoise(img, ['#8a6c42', '#94754a', '#9e7e51', '#a88759', '#b19061'], { cells: 4, oct: 3, grain: 0.4 });
  speckle(img, 14, hex('#6e5432'), -0.2);
  img.normalStrength = 0.6;
};
G.path_side = (img) => {
  G.dirt(img);
  for (let x = 0; x < TS; x++) for (let y = 0; y < 3; y++) img.set(x, y, pal(['#8a6c42', '#9e7e51', '#b19061'], ihash(x, y, img.seed)));
};

// utility blocks
G.crafting_table_top = (img) => {
  plankPattern(img, WOOD.oak.planks);
  const dark = hex('#4a3420');
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const e = Math.min(x, y, 31 - x, 31 - y);
    if (e < 2) { img.set(x, y, e === 0 ? dark : hex('#6b4c2c')); img.H(x, y, 0.9); }
    else if ((x === 11 || x === 20 || y === 11 || y === 20) && e > 3) { img.set(x, y, dark); img.H(x, y, 0.2); }
  }
};
G.crafting_table_side = (img) => {
  plankPattern(img, WOOD.oak.planks);
  const dark = hex('#3a2818'), metal = hex('#9a9a9a'), metalD = hex('#6a6a6a');
  for (let x = 0; x < TS; x++) for (let y = 0; y < 4; y++) img.set(x, y, y === 3 ? dark : hex('#6b4c2c'));
  // saw
  for (let k = 0; k < 12; k++) { img.set(6 + k, 10 + Math.floor(k / 3), metal); img.set(6 + k, 11 + Math.floor(k / 3), k % 2 ? metalD : metal); }
  for (let k = 0; k < 4; k++) img.set(4 + k % 2, 9 + k, hex('#7a4a22'));
  // hammer
  for (let y = 14; y < 28; y++) img.set(23, y, hex('#7a4a22'));
  for (let x = 20; x < 27; x++) { img.set(x, 14, metal); img.set(x, 15, metalD); }
};
G.crafting_table_front = (img) => {
  G.crafting_table_side(img);
  const metal = hex('#a8a8a8');
  for (let y = 18; y < 28; y++) { img.set(8, y, hex('#7a4a22')); }
  for (let x = 5; x < 12; x++) img.set(x, 17, metal);
};
G.furnace_side = (img) => {
  stoneBase(img, ['#5a5a5d', '#656568', '#707073', '#7b7b7e', '#86868a'], 2);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const e = Math.min(x, y, 31 - x, 31 - y);
    if (e === 0) { img.set(x, y, hex('#3e3e41')); img.H(x, y, 0.2); }
  }
};
G.furnace_top = (img) => { G.furnace_side(img); };
function furnaceFront(img, lit) {
  G.furnace_side(img);
  for (let y = 16; y < 28; y++) for (let x = 7; x < 25; x++) {
    const e = Math.min(x - 7, y - 16, 24 - x, 27 - y);
    let c;
    if (e === 0) c = hex('#2e2e30');
    else if (lit) c = pal(['#5a1405', '#b03a0a', '#f07818', '#ffc040', '#fff0a0'], (y - 16) / 12 * 0.8 + ihash(x, y, 4) * 0.4);
    else c = hex('#141414');
    img.set(x, y, c); img.H(x, y, e === 0 ? 0.6 : 0);
  }
  for (let x = 7; x < 25; x += 3) for (let y = 17; y < 27; y++) if (!lit) img.set(x, y, hex('#3a3a3c'));
  for (let x = 6; x < 26; x++) { img.set(x, 9, hex('#3a3a3c')); img.set(x, 12, hex('#3a3a3c')); }
}
G.furnace_front = (img) => furnaceFront(img, false);
G.furnace_front_lit = (img) => furnaceFront(img, true);
function chestBase(img) {
  plankPattern(img, ['#7a5428', '#86602e', '#926b35', '#9e773c'], { boardH: 8 });
  const dark = hex('#3a2510');
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const e = Math.min(x, y, 31 - x, 31 - y);
    if (e < 2) { img.set(x, y, e === 0 ? dark : hex('#5a3a1a')); img.H(x, y, 0.9); }
  }
}
G.chest_side = (img) => { chestBase(img); for (let x = 0; x < TS; x++) { img.set(x, 11, hex('#3a2510')); img.set(x, 12, hex('#2a1a0a')); } };
G.chest_top = (img) => chestBase(img);
G.chest_front = (img) => {
  G.chest_side(img);
  for (let y = 9; y < 17; y++) for (let x = 13; x < 19; x++) {
    const e = Math.min(x - 13, y - 9, 18 - x, 16 - y);
    img.set(x, y, e === 0 ? hex('#6b5a2a') : pal(['#c9a53a', '#e2c04e', '#f5da72'], (17 - y) / 8)); img.H(x, y, 1); img.S(x, y, 0.8);
  }
  img.set(15, 13, hex('#2a1a0a')); img.set(16, 13, hex('#2a1a0a')); img.set(15, 14, hex('#2a1a0a'));
};
G.torch = (img) => {
  // art window used by the torch model: x 14..17, y 12..31 (stick y 18..31, flame y 12..17)
  img.clear(); img.wrap = false;
  for (let y = 18; y < 32; y++) for (let x = 14; x < 18; x++) img.set(x, y, pal(['#4a3018', '#6a4828', '#8a6036', '#9c7040'], (x - 14) / 4 + ihash(x, y, 3) * 0.3));
  for (let y = 12; y < 18; y++) for (let x = 14; x < 18; x++) {
    const t = (y - 12) / 6;
    const core = x === 15 || x === 16;
    img.set(x, y, pal(['#ff6a10', '#ff9a24', '#ffcc50', '#fff2b0', '#ffffff'], (core ? 0.55 : 0.2) + (1 - Math.abs(t - 0.6)) * 0.45));
  }
  img.set(15, 11, hex('#ffb030')); img.set(16, 10, hex('#ff8a20'));
};
G.lantern = (img) => {
  img.clear(); img.wrap = false;
  const iron = hex('#3a3a40'), ironL = hex('#5a5a62');
  for (let y = 10; y < 26; y++) for (let x = 10; x < 22; x++) {
    const e = Math.min(x - 10, y - 10, 21 - x, 25 - y);
    if (e === 0 || ((x === 15 || x === 16) && y < 12)) img.set(x, y, e === 0 && x < 16 ? ironL : iron);
    else img.set(x, y, pal(['#ff9a2a', '#ffc04a', '#ffe08a', '#fff6d0'], 1 - Math.hypot(x - 15.5, y - 18) / 7));
  }
  for (let x = 12; x < 20; x++) img.set(x, 9, iron);
  for (let y = 4; y < 9; y++) { img.set(14, y, iron); img.set(17, y, iron); }
  for (let x = 14; x < 18; x++) img.set(x, 4, ironL);
};
G.frost_lantern = (img) => {
  G.lantern(img);
  for (let i = 0; i < N; i++) {
    const r = img.c[i * 4], g = img.c[i * 4 + 1], b = img.c[i * 4 + 2];
    if (r > 0.8 && img.c[i * 4 + 3] > 0) { img.c[i * 4] = b * 0.5; img.c[i * 4 + 1] = g * 0.95; img.c[i * 4 + 2] = Math.min(1, r * 1.05); }
  }
};
G.ladder = (img) => {
  img.clear(); img.wrap = false;
  const cols = WOOD.oak.planks;
  for (let y = 0; y < TS; y++) for (const x of [4, 5, 26, 27]) img.set(x, y, mulc(pal(cols, ihash(x, y, 1)), x === 5 || x === 27 ? 0.8 : 1));
  for (let ry = 3; ry < TS; ry += 8) for (let x = 6; x < 26; x++) { img.set(x, ry, pal(cols, ihash(x, ry, 2))); img.set(x, ry + 1, mulc(pal(cols, 0.3), 0.75)); }
};
function doorArt(img, top) {
  plankPattern(img, WOOD.oak.planks, { boardH: 8 });
  img.wrap = false;
  const dark = hex('#4a3420');
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const e = Math.min(x, 31 - x, top ? y : 31 - y);
    if (e < 3) { img.set(x, y, e === 0 ? dark : mulc(hex('#8b6a3e'), 0.85)); img.H(x, y, 0.9); }
  }
  if (top) {
    for (let y = 6; y < 26; y++) for (let x = 6; x < 26; x++) {
      if (x === 15 || x === 16 || y === 15 || y === 16) { img.set(x, y, dark); continue; }
      img.set(x, y, [0.7, 0.8, 0.85], 0);
    }
  } else {
    for (let y = 4; y < 28; y++) for (const x of [6, 25]) img.set(x, y, dark);
    for (let x = 6; x < 26; x++) { img.set(x, 4, dark); img.set(x, 27, dark); }
    img.set(24, 2, hex('#c9a53a')); img.set(24, 3, hex('#9a7a2a')); img.set(23, 2, hex('#e2c04e'));
  }
}
G.door_top = (img) => doorArt(img, true);
G.door_bottom = (img) => doorArt(img, false);
G.bed_head_top = (img) => {
  woolPattern(img, '#a8242c');
  for (let y = 0; y < 13; y++) for (let x = 2; x < 30; x++) img.set(x, y, pal(['#d8d8d8', '#e8e8e8', '#f6f6f6'], 0.5 + ihash(x, y, 1) * 0.5 - (y === 12 ? 0.6 : 0)));
};
G.bed_foot_top = (img) => woolPattern(img, '#a8242c');
G.bed_side = (img) => {
  woolPattern(img, '#a8242c');
  for (let y = 16; y < TS; y++) for (let x = 0; x < TS; x++) img.set(x, y, pal(WOOD.oak.planks, ihash(x, y, 4)), y > 24 && x > 3 && x < 28 ? 0 : 1);
  img.wrap = false;
};
G.bed_end = (img) => G.bed_side(img);
G.bookshelf = (img) => {
  plankPattern(img, WOOD.oak.planks);
  const bookCols = ['#7a1f1f', '#1f3f7a', '#2f6a2a', '#7a5a1f', '#5a2a6a', '#2a6a6a', '#8a3a1a'];
  const r = new RNG(img.seed);
  for (const shelf of [2, 18]) {
    let x = 2;
    while (x < 30) {
      const w = r.irange(2, 3), h = r.irange(10, 13);
      const c = hex(r.pick(bookCols));
      for (let bx = x; bx < Math.min(30, x + w); bx++) for (let y = shelf + 13 - h; y < shelf + 13; y++) {
        img.set(bx, y, mulc(c, bx === x ? 1.2 : 1 - (y === shelf + 13 - h + 2 ? 0.25 : 0)));
        img.H(bx, y, 0.6);
      }
      x += w;
    }
  }
};
G.hay_side = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const n = vnoise2(x, y, 2, 32, img.seed) * 0.6 + ihash(x, y, img.seed) * 0.4;
    let c = pal(['#9a7c1f', '#b08f27', '#c5a332', '#d6b43f', '#e3c34f'], n);
    if (y === 6 || y === 7 || y === 24 || y === 25) c = pal(['#7a3f1a', '#8a4a20'], ihash(x, y, 2));
    img.set(x, y, c); img.H(x, y, n);
  }
};
G.hay_top = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const v = voronoi(x, y, 10, img.seed, 1);
    img.set(x, y, pal(['#8a6c18', '#a8891f', '#c5a332', '#dfbe4a'], 1 - v.d1 / 2 + ihash(x, y, 1) * 0.2)); img.H(x, y, 1 - v.d1 / 2);
  }
};
const WOOL = { white: '#e9ecec', red: '#a12722', orange: '#e06f12', yellow: '#f5c22b', green: '#4f7a1c', blue: '#2f3d9a', purple: '#7a2aa6', black: '#1a1a1e', brown: '#6b4428', gray: '#4a4f52' };
for (const c in WOOL) G['wool_' + c] = (img) => woolPattern(img, WOOL[c]);
G.cobweb = (img) => {
  img.clear(); img.wrap = false;
  const col = hex('#e8e8e8');
  for (let a = 0; a < 8; a++) {
    const an = a / 8 * Math.PI * 2 + 0.2;
    for (let k = 0; k < 16; k++) img.setClip(Math.round(16 + Math.cos(an) * k), Math.round(16 + Math.sin(an) * k), col, 1);
  }
  for (const rad of [4, 8, 12]) for (let t = 0; t < 64; t++) {
    const an = t / 64 * Math.PI * 2;
    if (ihash(t, rad, 3) > 0.3) img.setClip(Math.round(16 + Math.cos(an) * rad), Math.round(16 + Math.sin(an) * rad), col, 1);
  }
};
G.ancient_bricks = (img) => {
  bricksPattern(img, 13, 9, 1, (x, y, s) => pal(['#4d5550', '#57605a', '#626b64', '#6c766e', '#78827a'], s * 0.5 + fbm(x, y, 4, 2, img.seed) * 0.4 + ihash(x, y, img.seed) * 0.2 - 0.1),
    { mortarCol: hex('#2f3430'), mortarH: 0.0, bevel: 0.1, offset: 0.37 });
  const r = new RNG(img.seed + 3);
  for (let i = 0; i < 14; i++) { const x = r.irange(0, 31), y = r.irange(0, 31); img.shade(x, y, 0.88); }
};
G.mossy_ancient_bricks = (img) => { G.ancient_bricks(img); mossOverlay(img, 0.65, 12); };
G.rune_stone = (img) => {
  stoneBase(img, ['#2a2d36', '#32353f', '#3a3d48', '#424651', '#4b4f5a'], 2);
  const glow = ['#3fa0ff', '#6fc0ff', '#bfe8ff'];
  const r = new RNG(img.seed);
  // carve a glyph made of strokes
  const strokes = [[8, 8, 0, 1, 16], [8, 8, 1, 0, 10], [8, 16, 1, 0, 8], [18, 8, 0, 1, 8], [18, 16, 1, 1, 7], [12, 20, 1, -1, 5], [22, 6, 0, 1, 20], [6, 24, 1, 0, 20]];
  for (const [x0, y0, dx, dy, len] of strokes) {
    for (let k = 0; k < len; k++) {
      const x = x0 + dx * k, y = y0 + dy * k;
      img.setClip(x, y, pal(glow, 0.5 + r.next() * 0.5)); img.H(x, y, 0.1);
    }
  }
  const e = (x, y) => Math.min(x, y, 31 - x, 31 - y);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) if (e(x, y) === 1) { img.set(x, y, hex('#5a6070')); img.H(x, y, 0.9); }
};
G.frost_bricks = (img) => {
  bricksPattern(img, 16, 8, 1, (x, y, s) => pal(['#8fb0d8', '#9cbbe0', '#a9c6e7', '#b6d1ee', '#c3dcf5'], s * 0.5 + ihash(x, y, img.seed) * 0.35),
    { mortarCol: hex('#dfeefc'), mortarH: 0.1, bevel: 0.1 });
  img.fillSmooth(0.5);
};
G.volcanic_bricks = (img) => {
  bricksPattern(img, 16, 8, 1, (x, y, s) => pal(['#25211f', '#2e2927', '#38322f', '#423b37'], s * 0.5 + ihash(x, y, img.seed) * 0.35),
    { mortarCol: hex('#6a2414'), mortarH: 0.1, bevel: 0.1 });
};
G.seagrass = (img) => {
  img.clear(); img.wrap = false;
  const r = new RNG(img.seed);
  for (let b = 0; b < 9; b++) {
    let x = r.irange(3, 28);
    const h = r.irange(14, 31);
    for (let k = 0; k < h; k++) {
      img.setClip(Math.round(x), 31 - k, pal(['#2a6b2a', '#348034', '#3f953d', '#4fa84a'], k / h + r.next() * 0.2));
      x += Math.sin(k * 0.4 + b) * 0.35;
    }
  }
};
G.kelp = (img) => {
  img.clear(); img.wrap = false;
  for (let y = 0; y < TS; y++) {
    const x = Math.round(16 + Math.sin(y * 0.35) * 3);
    for (let w = -1; w <= 1; w++) img.setClip(x + w, y, pal(['#3d5a1a', '#4d6e22', '#5e822b'], 0.5 + w * 0.3 + ihash(x, y, 1) * 0.2));
    if (y % 8 === 3) { img.setClip(x + 3, y, hex('#7a8a2a')); img.setClip(x + 4, y + 1, hex('#8a9a32')); img.setClip(x - 3, y + 4, hex('#7a8a2a')); }
  }
};
const REEF = { pink: ['#9a3a5a', '#b84a6e', '#d45f84', '#ec7d9e'], blue: ['#1f4a9a', '#2a5fb8', '#3a78d4', '#5a96ec'], yellow: ['#a8861a', '#c49f22', '#dcb92e', '#f0d040'] };
for (const c in REEF) G['reef_' + c] = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const v = voronoi(x, y, 6, img.seed, 1);
    const hole = v.d1 < 1.1;
    img.set(x, y, hole ? mulc(hex(REEF[c][0]), 0.6) : pal(REEF[c], 0.3 + (1 - v.d1 / 4) * 0.5 + ihash(x, y, 1) * 0.2));
    img.H(x, y, hole ? 0 : 0.8);
  }
};
G.gourd_side = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const rib = Math.abs(((x + 3) % 8) - 4) / 4;
    const n = 0.25 + rib * 0.55 + ihash(x, y, img.seed) * 0.15;
    img.set(x, y, pal(['#a24a0a', '#c45f12', '#dc7419', '#ec8a24', '#f8a23a'], n)); img.H(x, y, rib);
  }
};
G.gourd_top = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const d = Math.hypot(x - 15.5, y - 15.5), a = Math.atan2(y - 15.5, x - 15.5);
    const rib = Math.abs(Math.sin(a * 5));
    img.set(x, y, pal(['#a24a0a', '#c45f12', '#dc7419', '#ec8a24'], 0.3 + rib * 0.5)); img.H(x, y, rib);
    if (d < 3) img.set(x, y, pal(['#4a3a1a', '#5a4a22'], ihash(x, y, 1)));
  }
};
G.fire = (img) => {
  img.clear(); img.wrap = false;
  const r = new RNG(img.seed);
  for (let t = 0; t < 7; t++) {
    const cx = 3 + t * 4.3 + r.next() * 2, h = r.irange(14, 30);
    for (let k = 0; k < h; k++) {
      const w = (1 - k / h) * 2.6;
      for (let x = Math.floor(cx - w); x <= Math.ceil(cx + w); x++) {
        img.setClip(x + Math.round(Math.sin(k * 0.3 + t) * 1.2), 31 - k, pal(['#c8300a', '#f0620f', '#ff9420', '#ffc848', '#fff2a8'], (1 - k / h) * 0.7 + (1 - Math.abs(x - cx) / (w + 0.5)) * 0.4));
      }
    }
  }
};
// Block-breaking cracks: a single fracture network radiating from the middle of the face. Each stage reveals more
// of the same network, so cracks visibly spread across the block instead of flickering between random scribbles.
const CRACKS = (() => {
  const r = new RNG(4242);
  const pts = []; // [x, y, distance along the crack, width]
  const grow = (x, y, ang, len, d0, w0, depth) => {
    let fx = x, fy = y;
    for (let k = 0; k < len; k++) {
      ang += (r.next() - 0.5) * 0.55;
      fx += Math.cos(ang); fy += Math.sin(ang);
      if (fx < 0 || fy < 0 || fx > 31 || fy > 31) break;
      pts.push([Math.round(fx), Math.round(fy), d0 + k, k < len * 0.45 ? w0 : 1]);
      if (depth < 2 && r.next() < 0.14) grow(fx, fy, ang + (r.next() < 0.5 ? 1 : -1) * (0.6 + r.next() * 0.7), len * 0.5, d0 + k, 1, depth + 1);
    }
  };
  for (let b = 0; b < 6; b++) grow(15.5, 15.5, b / 6 * Math.PI * 2 + r.next() * 0.8, 15 + r.next() * 9, 0, 2, 0);
  return pts;
})();
for (let i = 0; i < 10; i++) {
  G['destroy_' + i] = (img) => {
    img.clear();
    const reach = 3 + i * 2.3;
    const on = CRACKS.filter(c => c[2] <= reach);
    for (const [x, y] of on) img.setClip(x + 1, y + 1, [0.66, 0.66, 0.66], 0.32);   // light lip below each crack
    for (const [x, y, , w] of on) {
      img.setClip(x, y, [0.06, 0.06, 0.07], 0.94);
      if (w > 1) img.setClip(x + 1, y, [0.1, 0.1, 0.11], 0.88);
    }
    img.wrap = false;
  };
}

G.barrel_side = (img) => {
  plankPattern(img, ['#6a4626', '#76502c', '#825a32', '#8e6438'], { boardH: 32 });
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    if (x % 6 === 5) { img.set(x, y, mulc(img.get(x, y), 0.7)); img.H(x, y, 0.2); }
    if (y === 4 || y === 5 || y === 26 || y === 27) { img.set(x, y, pal(['#3a3a40', '#4a4a52', '#5a5a62'], ihash(x, y, 2))); img.H(x, y, 0.9); img.S(x, y, 0.5); }
  }
};
G.barrel_top = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const d = Math.hypot(x - 15.5, y - 15.5);
    let c = pal(['#6a4626', '#76502c', '#825a32'], ihash(x >> 2, y, 4) * 0.6 + 0.2);
    if (d > 13.5) c = hex('#3a3a40');
    else if (Math.abs(d - 9) < 0.7) c = hex('#4a3018');
    img.set(x, y, c); img.H(x, y, d > 13.5 ? 0.9 : 0.6);
  }
};
G.bone_side = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const n = vnoise2(x, y, 2, 16, img.seed) * 0.5 + ihash(x, y, img.seed) * 0.2 + 0.3;
    let c = pal(['#c8c2ac', '#d6d0ba', '#e4dec8', '#f0ead6'], n);
    if (x < 2 || x > 29) c = mulc(c, 0.8);
    img.set(x, y, c); img.H(x, y, n);
  }
};
G.bone_top = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const d = Math.max(Math.abs(x - 15.5), Math.abs(y - 15.5));
    let c = pal(['#c8c2ac', '#d6d0ba', '#e4dec8'], 0.5 + ihash(x, y, 1) * 0.4);
    if (d < 7) c = pal(['#a89a80', '#b8aa90'], ihash(x, y, 3));
    img.set(x, y, c); img.H(x, y, d < 7 ? 0.3 : 0.7);
  }
};
G.snow_print = (img) => {
  G.snow(img);
  // a huge round footprint with toe marks
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const d = Math.hypot(x - 15.5, (y - 17) * 1.1);
    if (d < 11) { img.set(x, y, pal(['#b8c8dc', '#c4d2e4', '#ccd8e8'], ihash(x, y, 2) * 0.6 + d / 30)); img.H(x, y, 0.1); }
  }
  for (const [tx, ty] of [[7, 5], [13, 3], [19, 3], [25, 5]]) disc(img, tx, ty, 2.2, () => hex('#b4c4d8'));
};
G.glyph_sandstone = (img) => {
  G.sandstone_side(img);
  const glow = ['#ff9a2a', '#ffc04a', '#ffe08a'];
  const r = new RNG(img.seed);
  for (let k = 0; k < 4; k++) {
    let x = r.irange(6, 25), y = r.irange(8, 24);
    for (let s = 0; s < 6; s++) {
      img.setClip(x, y, pal(glow, r.next())); img.H(x, y, 0.1);
      if (r.chance(0.5)) x += r.chance(0.5) ? 1 : -1; else y += r.chance(0.5) ? 1 : -1;
    }
  }
  for (let x = 4; x < 28; x++) { img.set(x, 6, hex('#a88f58')); img.set(x, 26, hex('#a88f58')); }
};
G.heartwood_side = (img) => {
  barkPattern(img, WOOD.elder.bark);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    if (img.getH(x, y) < 0.15 && fbm(x, y, 4, 2, img.seed) > 0.45) { img.set(x, y, pal(['#5aff8a', '#9aff6a', '#d0ffa0'], ihash(x, y, 9))); }
  }
};
G.dragon_nest_top = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const n = vnoise2(x + y, x - y, 8, 8, img.seed) * 0.6 + ihash(x, y, img.seed) * 0.4;
    let c = pal(['#3a2a1a', '#4a3a22', '#5a4a2a', '#6a5a32'], n);
    if (((x + y * 3) % 7) === 0) c = pal(['#c8a050', '#e8c070'], ihash(x, y, 1));
    if (ihash(x, y, 5) > 0.985) c = hex('#ff8a2a');
    img.set(x, y, c); img.H(x, y, n);
  }
};

// ---- phase 6: explosives, alchemy, enchanting ----
function dynamiteSticks(img) {
  // four vertical paper-wrapped charges, rounded shading per stick
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const sx = x % 8;
    const round = 1 - Math.abs(sx - 3.5) / 4;
    let c = pal(['#5a0c0a', '#7e140f', '#a61e16', '#c62e20', '#de4a32'], round * 0.85 + ihash(x, y, img.seed) * 0.15);
    if (sx === 7) c = hex('#3a0806');
    img.set(x, y, c); img.H(x, y, 0.3 + round * 0.6);
  }
}
G.tnt_side = (img) => {
  dynamiteSticks(img);
  // twine bands
  for (const by of [5, 25]) for (let x = 0; x < TS; x++) for (let y = by; y < by + 3; y++) {
    const c = pal(['#5a4426', '#7a5e36', '#9a7a48', '#b8955a'], ((x + y * 2) % 4) / 4 + ihash(x, y, 3) * 0.2);
    img.set(x, y, y === by + 2 ? mulc(c, 0.7) : c); img.H(x, y, 0.9);
  }
  // hazard label
  for (let y = 11; y < 21; y++) for (let x = 6; x < 26; x++) {
    const e = Math.min(x - 6, y - 11, 25 - x, 20 - y);
    img.set(x, y, e === 0 ? hex('#2a1a10') : pal(['#d8c8a0', '#e6d8b4', '#f0e6c8'], ihash(x, y, 7) * 0.6 + 0.3)); img.H(x, y, 0.8);
  }
  // flame glyph on the label
  for (const [x, y] of [[15, 13], [16, 13], [14, 14], [15, 14], [16, 14], [17, 14], [14, 15], [15, 15], [16, 15], [17, 15], [13, 16], [14, 16], [17, 16], [18, 16], [13, 17], [14, 17], [17, 17], [18, 17], [14, 18], [15, 18], [16, 18], [17, 18]]) img.set(x, y, hex('#1e1410'));
  for (const [x, y] of [[15, 16], [16, 16], [15, 17], [16, 17]]) img.set(x, y, hex('#c83a14'));
};
function stickEnds(img, fuse) {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const cx = (x % 16) - 7.5, cy = (y % 16) - 7.5;
    const d = Math.hypot(cx, cy);
    let c, h;
    if (d < 6.5) { c = pal(['#d8c8a0', '#c8b48a', '#b09a70', '#8a7450'], d / 6.5 * 0.8 + ihash(x, y, img.seed) * 0.25); h = 0.7 - d * 0.03; }
    else if (d < 7.6) { c = hex('#a61e16'); h = 0.85; }
    else { c = hex('#3a0806'); h = 0.1; }
    img.set(x, y, c); img.H(x, y, h);
  }
  if (fuse) {
    for (let y = 13; y < 19; y++) for (let x = 13; x < 19; x++) if (Math.hypot(x - 15.5, y - 15.5) < 2.8) { img.set(x, y, hex('#3a2a1a')); img.H(x, y, 1); }
    for (const [x, y] of [[15, 15], [16, 16], [16, 15]]) img.set(x, y, hex('#8a6a40'));
  }
}
G.tnt_top = (img) => stickEnds(img, true);
G.tnt_bottom = (img) => stickEnds(img, false);
G.brimstone_ore = (img) => {
  stoneBase(img, ['#4a3e36', '#564840', '#62534a', '#6e5e54', '#7a6a5e', '#86766a']);
  oreClusters(img, ['#8a7408', '#c4a812', '#e8cf2a', '#f8ea6a', '#fffbc8'], 8, { smooth: 0.3, size: [3, 7] });
  img.fillMask(0);
};
G.niter_ore = (img) => {
  G.sandstone_side(img);
  oreClusters(img, ['#b8b4a8', '#d6d2c6', '#ecebe4', '#f8f8f4', '#ffffff'], 9, { smooth: 0.6, size: [2, 5], crystal: true });
};
G.alchemy_side = (img) => {
  plankPattern(img, ['#3a2614', '#45301a', '#503820', '#5a4026'], { boardH: 32 });
  const r = new RNG(img.seed);
  const frame = hex('#24160a');
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const e = Math.min(x, y, 31 - x, 31 - y);
    if (e < 2) { img.set(x, y, e === 0 ? frame : hex('#6a4a28')); img.H(x, y, 0.9); }
  }
  // two shelves with bottles
  for (const sy of [14, 27]) {
    for (let x = 2; x < 30; x++) { img.set(x, sy, hex('#7a5630')); img.set(x, sy + 1, hex('#2a1a0c')); img.H(x, sy, 1); }
    let x = 3;
    while (x < 27) {
      const w = r.irange(3, 5), h = r.irange(5, 9);
      const col = ['#d23a4a', '#3a8ad8', '#5ad86a', '#c86ae8', '#f0b030'][r.irange(0, 4)];
      for (let yy = sy - h; yy < sy; yy++) for (let xx = x; xx < x + w; xx++) {
        const neck = yy < sy - h + 2 && (xx === x || xx === x + w - 1);
        if (neck) continue;
        const liquid = yy > sy - h + 2;
        img.set(xx, yy, liquid ? mulc(hex(col), 0.8 + (xx === x ? 0.35 : 0)) : hex('#cfe6ee'));
        img.H(xx, yy, 0.85); img.S(xx, yy, 0.8);
      }
      x += w + r.irange(1, 2);
    }
  }
};
G.alchemy_top = (img) => {
  plankPattern(img, ['#4a3220', '#553a26', '#60422c', '#6a4a32'], { boardH: 8 });
  // brass-ringed basin with glowing brew
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const d = Math.hypot(x - 15.5, y - 15.5);
    if (d < 11) {
      if (d > 9.5) { img.set(x, y, pal(['#8a6a20', '#c89a3a', '#e8c060'], ihash(x, y, 2) * 0.5 + (x < 16 ? 0.4 : 0))); img.H(x, y, 1); img.S(x, y, 0.8); }
      else { img.set(x, y, pal(['#2a8a4a', '#3ab85a', '#6aec7a', '#c8ffb0'], 0.8 - d / 12 + ihash(x, y, 5) * 0.3)); img.H(x, y, 0.2); img.S(x, y, 0.9); }
    }
  }
  for (const [x, y] of [[13, 12], [18, 17], [15, 19], [19, 13]]) img.set(x, y, hex('#f4ffe0'));
};
G.runic_altar_side = (img) => {
  stoneBase(img, ['#16121e', '#1c1726', '#221c2e', '#282236', '#2e283e']);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    if (y < 3) { img.set(x, y, hex('#3a3046')); img.H(x, y, 1); }
    if (y > 28) { img.set(x, y, hex('#100c16')); img.H(x, y, 0.2); }
  }
  // glowing rune glyphs
  const r = new RNG(img.seed);
  const glow = ['#3ae0ff', '#7af0ff', '#c8fbff'];
  for (let k = 0; k < 3; k++) {
    const gx = 4 + k * 9, gy = 11;
    for (let s = 0; s < 9; s++) {
      const x = gx + r.irange(0, 5), y = gy + r.irange(0, 9);
      img.set(x, y, pal(glow, r.next())); img.H(x, y, 0.1);
      if (r.chance(0.6)) img.set(x, y + 1, pal(glow, r.next()));
    }
  }
};
G.runic_altar_top = (img) => {
  stoneBase(img, ['#16121e', '#1c1726', '#221c2e', '#282236', '#2e283e']);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const d = Math.hypot(x - 15.5, y - 15.5);
    const a = Math.atan2(y - 15.5, x - 15.5);
    if (d > 11.5 && d < 13 && Math.sin(a * 12) > -0.3) { img.set(x, y, pal(['#3ae0ff', '#7af0ff', '#c8fbff'], ihash(x, y, 1))); img.H(x, y, 0.1); }
  }
  // open tome in the centre
  for (let y = 10; y < 22; y++) for (let x = 8; x < 24; x++) {
    const spine = x === 15 || x === 16;
    const e = Math.min(x - 8, y - 10, 23 - x, 21 - y);
    img.set(x, y, e === 0 ? hex('#4a1a14') : spine ? hex('#6a2a1a') : (y % 3 === 0 && x > 9 && x < 22 && !spine) ? hex('#6a8aa8') : hex('#e8e0c8'));
    img.H(x, y, 0.9);
  }
};

// ---- phase 6: building blocks ----
function polished(img, cols, border = 1) {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const n = fbm(x, y, 3, 2, img.seed) * 0.7 + ihash(x, y, img.seed) * 0.12 + vnoise2(x + y * 0.4, y, 6, 12, img.seed + 4) * 0.18;
    let c = pal(cols, n);
    const e = Math.min(x, y, 31 - x, 31 - y);
    if (e < border) c = mulc(c, x < 16 && y < 16 ? 1.12 : 0.82);
    img.set(x, y, c); img.H(x, y, e < border ? 0.75 : 0.95); img.S(x, y, 0.55);
  }
}
G.polished_granite = (img) => polished(img, ['#7a4c3a', '#8a5844', '#9a644e', '#a87058', '#b47c62', '#c08a70']);
G.polished_basalt_side = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const n = vnoise2(x, y, 16, 2, img.seed) * 0.6 + ihash(x, y, img.seed) * 0.15;
    const groove = (x % 8 === 0);
    img.set(x, y, groove ? hex('#2c2c32') : pal(['#3e3e46', '#48484f', '#525259', '#5c5c63'], n));
    img.H(x, y, groove ? 0.3 : 0.9); img.S(x, y, 0.45);
  }
};
G.polished_basalt_top = (img) => polished(img, ['#3a3a42', '#43434b', '#4c4c54', '#55555d'], 2);
G.polished_darkstone = (img) => polished(img, ['#22202a', '#2a2832', '#32303a', '#3a3842', '#44424c'], 2);
G.darkstone_bricks = (img) => bricksPattern(img, 16, 8, 1, (x, y, t) => pal(['#2a2832', '#32303a', '#3a3842', '#44424c'], t * 0.6 + ihash(x, y, img.seed) * 0.4), { mortarCol: hex('#18161e') });
G.chiseled_stone_bricks = (img) => {
  stoneBase(img, ['#76767a', '#808084', '#8a8a8e', '#949498', '#9e9ea2']);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const e = Math.min(x, y, 31 - x, 31 - y);
    if (e < 2) { img.set(x, y, e === 0 ? hex('#4e4e52') : hex('#a8a8ac')); img.H(x, y, e === 0 ? 0.2 : 1); }
    const d = Math.max(Math.abs(x - 15.5), Math.abs(y - 15.5));
    if (d > 7 && d < 9) { img.shade(x, y, 0.72); img.H(x, y, 0.35); }
    if (d < 4 && (x + y) % 4 === 0) { img.shade(x, y, 0.8); img.H(x, y, 0.4); }
  }
};
G.sandstone_bricks = (img) => bricksPattern(img, 16, 8, 1, (x, y, t) => pal(['#c8ae7a', '#d4ba86', '#dcc490', '#e4cc98'], t * 0.5 + ihash(x, y, img.seed) * 0.5), { mortarCol: hex('#a48a5a') });
G.mud_bricks = (img) => bricksPattern(img, 16, 8, 1, (x, y, t) => pal(['#7a5e46', '#86684e', '#927256', '#9c7c5e'], t * 0.5 + ihash(x, y, img.seed) * 0.5), { mortarCol: hex('#5a4434') });
G.stone_tiles = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const tx = x >> 4, ty = y >> 4;
    const n = 0.4 + ihash(tx, ty, img.seed) * 0.3 + fbm(x, y, 4, 2, img.seed) * 0.25;
    let c = pal(['#7c7c80', '#86868a', '#909094', '#9a9a9e', '#a4a4a8'], n);
    const lx = x & 15, ly = y & 15;
    if (lx === 0 || ly === 0) c = hex('#5e5e62');
    else if (lx === 1 || ly === 1) c = mulc(c, 1.08);
    img.set(x, y, c); img.H(x, y, lx === 0 || ly === 0 ? 0.2 : 0.9); img.S(x, y, 0.3);
  }
};
function shingles(img, cols, edge) {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const row = y >> 3, ly = y & 7;
    const off = (row & 1) * 4;
    const lx = (x + off) & 7;
    const id = ((x + off) >> 3) + row * 5;
    const curve = Math.abs(lx - 3.5) / 3.5;
    const n = 0.3 + ihash(id, 3, img.seed) * 0.35 + (1 - ly / 7) * 0.25 - curve * curve * 0.15;
    let c = pal(cols, n);
    if (ly === 7 || lx === 0) c = hex(edge);
    img.set(x, y, c); img.H(x, y, ly === 7 ? 0.2 : 0.4 + (ly / 7) * 0.5);
  }
}
G.clay_shingles = (img) => shingles(img, ['#7a2e1e', '#8e3a24', '#a2462c', '#b45434', '#c4623e'], '#4a1a12');
G.slate_shingles = (img) => shingles(img, ['#384050', '#424a5a', '#4c5464', '#565e6e', '#606878'], '#20242e');
G.thatch = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const strand = vnoise2(x * 3, y, 32, 4, img.seed);
    const n = strand * 0.6 + ihash(x, y, img.seed) * 0.25 + ((y & 7) < 2 ? -0.15 : 0);
    img.set(x, y, pal(['#6e5a26', '#86702e', '#9c8438', '#b09844', '#c4ac52'], n)); img.H(x, y, n);
  }
};
G.timber_frame = (img) => {
  const beam = (x, y) => x < 3 || x > 28 || y < 3 || y > 28 || Math.abs(x - y) < 2;
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    if (beam(x, y)) { img.set(x, y, pal(['#3a2614', '#45301a', '#503820'], ihash(x >> 1, y, img.seed) * 0.6 + ((x + y) % 5 === 0 ? 0.3 : 0))); img.H(x, y, 0.95); }
    else { img.set(x, y, pal(['#d8d0c0', '#e2dacb', '#ece6d8'], fbm(x, y, 4, 2, img.seed) * 0.8 + ihash(x, y, 1) * 0.2)); img.H(x, y, 0.55); }
  }
};
const PLASTER = { white: ['#d8d6d0', '#e2e0da', '#ecebe6', '#f4f3ef'], cream: ['#d8c8a0', '#e2d2ac', '#ecdcb8', '#f4e6c4'], terracotta: ['#a85a3a', '#b46444', '#c06e4e', '#cc7a58'], sage: ['#7e9474', '#88a07e', '#94aa88', '#a0b494'], slate: ['#4e5866', '#586270', '#626c7a', '#6c7684'] };
for (const k in PLASTER) G['plaster_' + k] = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const n = fbm(x, y, 3, 3, img.seed) * 0.75 + ihash(x, y, img.seed) * 0.25;
    img.set(x, y, pal(PLASTER[k], n)); img.H(x, y, 0.5 + (n - 0.5) * 0.3);
  }
};
function glazed(img, cols, motif) {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const lx = x & 15, ly = y & 15;
    const d = Math.hypot(lx - 7.5, ly - 7.5);
    let c = pal(cols, 0.55 + ihash(x, y, img.seed) * 0.1);
    if (motif === 0 && (Math.abs(lx - ly) < 1 || Math.abs(15 - lx - ly) < 1)) c = hex('#f4f0e4');
    if (motif === 1 && d > 4.5 && d < 6) c = hex('#f4f0e4');
    if (d < 2) c = hex(cols[cols.length - 1]);
    if (lx === 0 || ly === 0) c = mulc(hex(cols[0]), 0.8);
    img.set(x, y, c); img.H(x, y, lx === 0 || ly === 0 ? 0.3 : 0.9); img.S(x, y, 0.85);
  }
}
G.blue_tiles = (img) => glazed(img, ['#183c7a', '#1e4c96', '#2a5cae', '#3a72c8', '#e8c050'], 0);
G.teal_tiles = (img) => glazed(img, ['#0e5a50', '#147064', '#1c8676', '#2a9c8a', '#f0d070'], 1);
const STAIN = { red: '#c8283a', orange: '#e87a1e', yellow: '#f0d030', green: '#3ab84a', blue: '#2a5ae0', purple: '#9a3ad8' };
for (const k in STAIN) G['stained_glass_' + k] = (img) => {
  const base = hex(STAIN[k]);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const e = Math.min(x, y, 31 - x, 31 - y);
    const lead = e < 1 || x === 15 || y === 15 || (x + y === 31 && e > 3);
    if (lead) { img.set(x, y, hex('#2a2a30'), 1); img.H(x, y, 0.9); continue; }
    const shade = 0.85 + ihash(x >> 2, y >> 2, img.seed) * 0.3 + (x < y ? 0.05 : -0.05);
    img.set(x, y, mulc(base, shade), 0.55); img.H(x, y, 0.5); img.S(x, y, 0.9);
  }
};
G.crate_side = (img) => {
  plankPattern(img, ['#8a6a3e', '#967446', '#a27e4e', '#ae8856'], { boardH: 8 });
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const e = Math.min(x, y, 31 - x, 31 - y);
    if (e < 3 || Math.abs(x - y) < 2) { img.set(x, y, pal(['#5a4024', '#6a4c2c', '#7a5834'], ihash(x, y, 2) * 0.5 + (e < 1 ? 0 : 0.4))); img.H(x, y, 1); }
  }
  for (const [x, y] of [[2, 2], [29, 2], [2, 29], [29, 29]]) { img.set(x, y, hex('#9a9aa0')); img.S(x, y, 0.8); }
};
G.crate_top = (img) => {
  plankPattern(img, ['#8a6a3e', '#967446', '#a27e4e', '#ae8856'], { boardH: 8 });
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) if (Math.min(x, y, 31 - x, 31 - y) < 3) { img.set(x, y, pal(['#5a4024', '#6a4c2c'], ihash(x, y, 2))); img.H(x, y, 1); }
};
G.cupboard_side = (img) => { plankPattern(img, ['#6a4a2a', '#765432', '#825e3a', '#8e6842'], { boardH: 32 }); for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) if (Math.min(x, y, 31 - x, 31 - y) < 2) img.set(x, y, hex('#3e2a16')); };
G.cupboard_front = (img) => {
  G.cupboard_side(img);
  for (const ox of [3, 17]) for (let y = 3; y < 29; y++) for (let x = ox; x < ox + 12; x++) {
    const e = Math.min(x - ox, y - 3, ox + 11 - x, 28 - y);
    img.set(x, y, e === 0 ? hex('#3e2a16') : e === 1 ? hex('#9a7448') : pal(['#7a5634', '#86603a'], ihash(x, y >> 2, 4))); img.H(x, y, e < 2 ? 1 : 0.6);
  }
  for (const x of [13, 18]) { img.set(x, 15, hex('#e0c060')); img.set(x, 16, hex('#a88430')); img.S(x, 15, 0.9); }
};
G.candle = (img) => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { img.set(x, y, pal(['#e8dcc0', '#f0e6cc', '#f8f0dc'], ihash(x, y, 3) * 0.4 + (x & 15) / 16 * 0.5)); img.H(x, y, 0.8); } };
G.candle_flame = (img) => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) img.set(x, y, pal(['#ff8a20', '#ffc040', '#fff0a0', '#ffffff'], 1 - y / 32 + ihash(x, y, 2) * 0.2)); };
G.lantern_glass = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const frame = (x & 15) < 2 || (y & 15) < 2;
    img.set(x, y, frame ? hex('#2e2e34') : pal(['#ffb040', '#ffd070', '#fff0b8', '#ffffff'], 1 - Math.hypot((x & 15) - 8, (y & 15) - 9) / 9));
  }
};
G.campfire_coals = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const n = vnoise(x, y, 8, img.seed);
    const hot = n > 0.62;
    img.set(x, y, hot ? pal(['#c83a0a', '#ff7a1a', '#ffc04a'], (n - 0.62) * 3) : pal(['#1a1614', '#2a2420', '#3a322a', '#5a5048'], n * 1.4));
    img.H(x, y, n);
  }
};

G.dark_iron = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const n = vnoise(x, y, 6, img.seed), edge = Math.min(x, y, 31 - x, 31 - y) < 2;
    img.set(x, y, pal(['#1e1e22', '#2c2c32', '#3a3a42', '#4a4a52'], n * 0.7 + (edge ? 0.3 : 0)));
    img.H(x, y, n * 0.5 + (edge ? 0.5 : 0)); img.S(x, y, 0.55); img.M(x, y, 0.8);
  }
};
G.paper_lantern = (img) => {
  // warm red paper between thin bamboo ribs, glowing from within
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const rib = (y % 8) === 0, seam = (x % 16) === 0;
    const glow = 1 - Math.abs(x % 16 - 8) / 10;
    img.set(x, y, rib || seam ? hex('#4a2410') : pal(['#7a160e', '#a8241a', '#c83a22', '#e86030'], glow * 0.85 + ihash(x, y, 3) * 0.12));
    img.H(x, y, rib || seam ? 1 : 0.4);
  }
};
G.moth_glass = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const frame = (x & 15) < 2 || (y & 15) < 2;
    const moth = ((x * 7 + y * 13) % 29 === 0) && !frame;
    img.set(x, y, frame ? hex('#2e2e34') : moth ? hex('#4a4a3a') : pal(['#8ab47a', '#b8dca0', '#e2f6d0', '#ffffff'], 1 - Math.hypot((x & 15) - 8, (y & 15) - 9) / 9));
  }
};
G.brass = (img) => {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const n = vnoise(x, y, 6, img.seed);
    img.set(x, y, pal(['#6a4a14', '#a8781e', '#d8a838', '#f0d070'], 0.35 + n * 0.5 + (y < 3 ? 0.2 : 0)));
    img.H(x, y, n * 0.4); img.S(x, y, 0.8); img.M(x, y, 0.9);
  }
};
G.shelf_goods = (img) => {
  // book spines, jars and a little pot, in bands
  const cols = ['#8a2a22', '#2a4a8a', '#3a6a2a', '#a8782a', '#5a2a6a', '#2a5a5a', '#c8b890'];
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const spine = Math.floor(x / 3);
    const c = cols[(spine * 5 + (y > 15 ? 3 : 0)) % cols.length];
    const band = (y % 16) === 4 || (y % 16) === 12;
    img.set(x, y, x % 3 === 2 ? hex('#2a1e14') : band ? hex('#e0c870') : pal([c, c], 0.5 + ihash(x, y, 2) * 0.2));
    img.H(x, y, x % 3 === 2 ? 0 : 0.7);
  }
};
G.urn = (img) => {
  // terracotta with a dark painted band and little wave marks
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const band = y >= 12 && y <= 18, wave = band && ((x + Math.round(Math.sin(y) * 2)) % 6 === 0);
    img.set(x, y, band ? (wave ? hex('#e8c890') : hex('#3a2418')) : pal(['#9a4a24', '#b85e30', '#c8703a'], ihash(x, y, 3) * 0.6 + 0.2));
    img.H(x, y, band ? 0.6 : 0.4);
  }
};

// smoothness defaults per texture (0..1)
const SMOOTH = {
  stone: 0.12, cobblestone: 0.08, sand: 0.05, gravel: 0.1, dirt: 0.04, grass_top: 0.08, clay: 0.25, marble: 0.5,
};

function computeNormals(img, out, off) {
  const h = img.h;
  const s = img.normalStrength * 2.2;
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const i = y * TS + x;
    const xl = img.wrap ? (x + TS - 1) % TS : Math.max(0, x - 1), xr = img.wrap ? (x + 1) % TS : Math.min(TS - 1, x + 1);
    const yu = img.wrap ? (y + TS - 1) % TS : Math.max(0, y - 1), yd = img.wrap ? (y + 1) % TS : Math.min(TS - 1, y + 1);
    let dx = (h[y * TS + xr] - h[y * TS + xl]) * s;
    let dy = (h[yd * TS + x] - h[yu * TS + x]) * s;
    const a = img.c[i * 4 + 3];
    if (a <= 0.01) { dx = 0; dy = 0; }
    let nx = -dx, ny = dy, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    nx /= l; ny /= l;
    out[off + i * 4] = Math.round((nx * 0.5 + 0.5) * 255);
    out[off + i * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
    out[off + i * 4 + 2] = Math.round(clamp01(img.m[i]) * 255);
    out[off + i * 4 + 3] = Math.round(clamp01(img.s[i]) * 255);
  }
}

// Generate all textures listed in names. Returns { albedo: Uint8Array, normal: Uint8Array, images: Map name -> ImageData-like RGBA }.
export function generateTextures(names) {
  const albedo = new Uint8Array(names.length * N * 4);
  const normal = new Uint8Array(names.length * N * 4);
  for (let t = 0; t < names.length; t++) {
    const name = names[t];
    const img = new Img(hashString(name) & 0xffff);
    const fn = G[name];
    if (fn) fn(img); else {
      // fallback: magenta checker
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) img.set(x, y, ((x >> 3) + (y >> 3)) & 1 ? [1, 0, 1] : [0.1, 0.1, 0.1]);
      console.warn('missing texture generator', name);
    }
    const sm = SMOOTH[name];
    if (sm !== undefined) for (let i = 0; i < N; i++) img.s[i] = Math.max(img.s[i], sm);
    const off = t * N * 4;
    for (let i = 0; i < N * 4; i++) albedo[off + i] = Math.round(clamp01(img.c[i]) * 255);
    computeNormals(img, normal, off);
  }
  return { albedo, normal };
}

export { G as TEXTURE_GENERATORS, pal, P as palette };
