// Climate + height model. Pure functions of (seed, x, z) so any thread can query any column.
import { Simplex, RNG, hash2 } from '../core/noise.js';
import { SEA, HEIGHT } from './constants.js';
import { BIOME } from './biomes.js';

function sstep(a, b, x) {
  let t = (x - a) / (b - a);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
}
function lerp(a, b, t) { return a + (b - a) * t; }

// piecewise-linear spline helper
function spline(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const t = (x - x0) / (x1 - x0);
      const s = t * t * (3 - 2 * t);
      return y0 + (y1 - y0) * (t * 0.4 + s * 0.6);
    }
  }
  return pts[pts.length - 1][1];
}

const CONT_SPLINE = [
  [-1.2, SEA - 42], [-0.6, SEA - 30], [-0.38, SEA - 18], [-0.24, SEA - 9], [-0.14, SEA - 3],
  [-0.08, SEA + 0.5], [0.0, SEA + 3], [0.25, SEA + 8], [0.6, SEA + 16], [1.2, SEA + 26],
];

export class Terrain {
  constructor(seed) {
    this.seed = seed >>> 0;
    const r = new RNG(this.seed ^ 0x9e3779b9);
    this.nCont = new Simplex(r.nextInt());
    this.nEro = new Simplex(r.nextInt());
    this.nPeak = new Simplex(r.nextInt());
    this.nTemp = new Simplex(r.nextInt());
    this.nHum = new Simplex(r.nextInt());
    this.nWeird = new Simplex(r.nextInt());
    this.nDetail = new Simplex(r.nextInt());
    this.nRiver = new Simplex(r.nextInt());
    this.nWarp = new Simplex(r.nextInt());
    this.nVolc = new Simplex(r.nextInt());
    this.nMesa = new Simplex(r.nextInt());
    this.nDune = new Simplex(r.nextInt());
    this.nOver = new Simplex(r.nextInt());
    this.nEdge = new Simplex(r.nextInt());
    this.out = {};
  }

  // Fill `o` with climate + height data for column (x,z)
  column(x, z, o = this.out) {
    const wx = x + this.nWarp.noise2(x / 380, z / 380) * 55;
    const wz = z + this.nWarp.noise2(x / 380 + 71.3, z / 380 - 33.1) * 55;

    const c = this.nCont.fbm2(wx / 1800, wz / 1800, 5) * 1.9 + 0.2;
    const e = this.nEro.fbm2(wx / 1100, wz / 1100, 4) * 1.8;
    const edgeJit = this.nEdge.noise2(x / 22, z / 22) * 0.05;
    const t = this.nTemp.fbm2(x / 2200, z / 2200, 3) * 2.0 + edgeJit;
    const h = this.nHum.fbm2(x / 1900, z / 1900, 3) * 2.0 + edgeJit;
    const w = this.nWeird.fbm2(x / 1000, z / 1000, 3) * 2.0;

    const land = sstep(-0.16, 0.02, c);
    let height = spline(CONT_SPLINE, c);

    // mountains: low erosion + inland
    const m = sstep(-0.05, -0.55, e) * sstep(-0.1, 0.15, c);
    const ridge = this.nPeak.ridged2(wx / 620, wz / 620, 5);
    height += m * (Math.pow(ridge, 2.0) * 105 + 14);

    // hills / detail
    const hillAmp = 3 + 10 * sstep(0.4, -0.3, e);
    const detail = this.nDetail.fbm2(x / 150, z / 150, 4);
    height += detail * hillAmp * 2 * (0.35 + 0.65 * land);

    // hot zone helpers
    const hot = sstep(0.32, 0.5, t);
    // desert dunes
    const dry = sstep(-0.05, -0.25, h);
    const dune = this.nDune.noise2(x / 55, z / 85);
    height += (1 - Math.abs(dune)) * (1 - Math.abs(dune)) * 6 * hot * dry * land * (1 - m);

    // badlands mesas
    const badW = hot * sstep(-0.25, -0.1, h) * sstep(0.42, 0.28, h) * sstep(0.05, 0.22, w) * land * (1 - m * 0.8);
    if (badW > 0.001) {
      const p = sstep(-0.1, 0.35, this.nMesa.fbm2(x / 240, z / 240, 3)) * 34;
      const step = 7;
      const k = p / step;
      const fl = Math.floor(k), fr = k - fl;
      const terr = (fl + sstep(0.72, 0.95, fr)) * step;
      height = lerp(height, SEA + 5 + terr + detail * 2, badW);
    }

    // swamps flatten near sea level
    const swW = sstep(0.32, 0.5, h) * sstep(0.55, 0.25, Math.abs(t)) * sstep(SEA + 12, SEA + 4, height) * land * (1 - m);
    if (swW > 0.001) height = lerp(height, SEA + 0.2 + detail * 1.8, swW * 0.9);

    // volcanic region with cones & craters
    const vol = this.nVolc.fbm2(x / 1300, z / 1300, 2) * 2.0;
    const vW = sstep(0.58, 0.72, vol) * land;
    let crater = 0, lavaLevel = -1, craterLava = -1;
    if (vW > 0.001) {
      const cell = 210;
      const gx = Math.floor(x / cell), gz = Math.floor(z / cell);
      let cone = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const hsh = hash2(gx + dx, gz + dz, this.seed ^ 0x51ed);
        if ((hsh & 255) < 70) continue;
        const ccx = (gx + dx) * cell + 40 + ((hsh >>> 8) & 127);
        const ccz = (gz + dz) * cell + 40 + ((hsh >>> 16) & 127);
        const d = Math.hypot(x - ccx, z - ccz);
        const R = 70 + ((hsh >>> 24) & 31);
        let v = Math.pow(Math.max(0, 1 - d / R), 1.5) * 92;
        let inCrater = false;
        if (d < 15) { const cr = Math.sqrt(1 - d / 15) * 30; v -= cr; if (cr > crater) crater = cr; inCrater = d < 13; }
        if (v > cone) {
          cone = v;
          // one flat lava lake per crater, a few blocks below the rim (never a per-column level)
          craterLava = inCrater ? Math.floor(SEA + 5 + Math.pow(Math.max(0, 1 - 15 / R), 1.5) * 92 - 4) : -1;
        }
      }
      const rug = Math.abs(this.nDetail.noise2(x / 40, z / 40)) * 9;
      const vh = SEA + 5 + cone + rug * (crater > 0 ? 0.3 : 1);
      height = lerp(height, vh, vW);
      if (craterLava > 0 && vW > 0.85 && height < craterLava) lavaLevel = craterLava;
    }

    // rivers
    const rv = Math.abs(this.nRiver.fbm2(wx / 950, wz / 950, 4));
    const riverW = 0.032;
    let river = false;
    if (c > -0.14) {
      const k = sstep(riverW * 2.6, riverW * 0.4, rv) * (1 - 0.75 * m) * (1 - vW);
      if (k > 0) {
        const target = SEA - 2.5 - sstep(riverW, 0, rv) * 3;
        height = lerp(height, Math.min(height, target), k);
        if (rv < riverW && height < SEA) river = true;
      }
    }

    // climate adjusted for altitude
    const alt = Math.max(0, height - (SEA + 40));
    const te = t - alt * 0.011;

    if (height > HEIGHT - 8) height = HEIGHT - 8;
    if (height < 6) height = 6;

    o.c = c; o.e = e; o.t = t; o.te = te; o.h = h; o.w = w; o.m = m;
    o.height = Math.floor(height);
    o.hf = height;
    o.river = river;
    o.vW = vW; o.badW = badW; o.swW = swW; o.lavaLevel = lavaLevel;
    o.biome = this.pickBiome(o);
    return o;
  }

  pickBiome(o) {
    const { c, height, te, h, w, m, river, vW, badW, swW } = o;
    if (height < SEA - 1 && c < -0.1) {
      if (te < -0.5) return BIOME.FROZEN_OCEAN;
      if (height < SEA - 18) return BIOME.DEEP_OCEAN;
      return BIOME.OCEAN;
    }
    if (river) return te < -0.45 ? BIOME.FROZEN_RIVER : BIOME.RIVER;
    if (vW > 0.5) return BIOME.VOLCANIC;
    if (height > SEA + 78 || m > 0.6) {
      if (te < -0.15 || height > SEA + 96) return BIOME.SNOWY_PEAKS;
      return BIOME.MOUNTAINS;
    }
    if (badW > 0.5) return BIOME.BADLANDS;
    if (swW > 0.5) return BIOME.SWAMP;
    if (height <= SEA + 2 && c < 0.02) return te < -0.45 ? BIOME.SNOWY_BEACH : BIOME.BEACH;
    if (te < -0.45) return h > 0.05 ? BIOME.SNOWY_TAIGA : BIOME.TUNDRA;
    if (te < -0.18) return h > -0.15 ? BIOME.TAIGA : BIOME.PLAINS;
    if (te > 0.42) {
      if (h < -0.08) return BIOME.DESERT;
      if (h < 0.3) return BIOME.SAVANNA;
      return BIOME.JUNGLE;
    }
    if (w > 0.55 && h > 0.0) return BIOME.ANCIENT_FOREST;
    if (h > 0.18) return w < -0.35 ? BIOME.BIRCH_FOREST : BIOME.FOREST;
    if (h > -0.05 && w < -0.5) return BIOME.BIRCH_FOREST;
    return BIOME.PLAINS;
  }

  // 3D overhang density test for mountain columns; returns true if solid at y
  overhangSolid(x, y, z, o) {
    const n = this.nOver.noise3(x / 42, y / 28, z / 42) * 0.7 + this.nOver.noise3(x / 17, y / 14, z / 17) * 0.3;
    const d = (o.hf - y) / 13 + n * o.m * 1.25;
    return d > 0;
  }

  // Solid flags for the overhang band [base, base+32] of a mountain column. Above the 2D height the column
  // must stay connected to the ground (no floating rock islands); below it the noise may carve shallow
  // undercuts that form overhangs, but never below sea level. Returns base; flags in this.bandFlags.
  band(x, z, o) {
    const base = o.height - 16;
    const f = this.bandFlags || (this.bandFlags = new Uint8Array(33));
    for (let k = 0; k <= 32; k++) {
      const y = base + k;
      let s;
      if (y <= o.hf) s = k < 6 || y <= SEA + 2 || o.hf - y > 9 || this.overhangSolid(x, y, z, o);
      else s = f[k - 1] === 1 && this.overhangSolid(x, y, z, o);
      f[k] = s ? 1 : 0;
    }
    return base;
  }

  // Actual surface top for a column, accounting for overhangs (used for cross-chunk features)
  surfaceY(x, z, o = this.column(x, z, {})) {
    if (o.m < 0.25) return o.height;
    const base = this.band(x, z, o);
    for (let k = 32; k >= 0; k--) if (this.bandFlags[k]) return base + k;
    return base;
  }
}
