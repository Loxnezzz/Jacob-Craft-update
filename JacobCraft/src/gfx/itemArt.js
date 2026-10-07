// 16x16 procedural item sprites. Returns RGBA Uint8ClampedArray(16*16*4).
import { hex } from './texgen.js';

const S = 16;
export const PAL = {
  wood: ['#3f2c19', '#5e4128', '#7f5a36', '#a07a48', '#bf9a5e'],
  stone: ['#3e3e42', '#5e5e62', '#7c7c80', '#9c9ca0', '#bcbcc0'],
  copper: ['#5a2a12', '#8c4622', '#c06a36', '#e09058', '#f6bc8c'],
  iron: ['#4a4a50', '#7c7c84', '#aeaeb6', '#d4d4da', '#f4f4f6'],
  iron_raw: ['#5a4232', '#8a6a52', '#b48e70', '#d4b294', '#ecd4bc'],
  gold: ['#6a4a06', '#b48a12', '#e8bc28', '#f8dc5c', '#fff4b0'],
  diamond: ['#0c4c54', '#178c98', '#34c8d2', '#8aeef2', '#e0fdff'],
  emerald: ['#08401c', '#11782f', '#22b454', '#66ea92', '#ccffde'],
  emberite: ['#2a0804', '#5a120a', '#962410', '#e04e18', '#ffb04a'],
  sunstone: ['#7a3c08', '#c87210', '#f8aa20', '#ffdc70', '#fff8d0'],
  frostite: ['#1e4a80', '#3672c4', '#6eaaf4', '#bfe0ff', '#ffffff'],
  wayfinder: ['#123a3a', '#1e6a66', '#2fb0a0', '#7ef0d8', '#e8fff8'],
  leather: ['#3a200e', '#5e3518', '#804a24', '#a06434', '#c08048'],
  clay: ['#5a606e', '#7a8090', '#969cac', '#b0b6c4', '#cad0da'],
  snow: ['#a8b6c8', '#c8d4e2', '#e2eaf4', '#f2f6fb', '#ffffff'],
  raw_red: ['#4a0c0c', '#7e1a1a', '#b02e2e', '#d64e4e', '#f0a0a0'],
  raw_pink: ['#6a3030', '#a85050', '#d87676', '#eea0a0', '#ffdcdc'],
  cooked: ['#2e1606', '#5c3214', '#844c22', '#a86a34', '#cc9056'],
  fish_raw: ['#1e3a56', '#3c6a92', '#6c9cc0', '#a2c8e0', '#e0f0f8'],
  fish_cooked: ['#3e220c', '#6c421c', '#966236', '#ba8650', '#dcb080'],
  elder: ['#14301a', '#24502a', '#3e8038', '#6eb858', '#c0ff9a'],
  sand: ['#7a6236', '#ae8e56', '#d2b478', '#e8d098', '#fff0c8'],
  heal: ['#4a0612', '#8c1024', '#d8243e', '#ff6a7a', '#ffd0d8'],
  swift: ['#063a4a', '#0e6c86', '#1eb0d0', '#6ae2f6', '#d0fbff'],
  night: ['#120a3a', '#22166c', '#3e2eb0', '#7a6ae8', '#d0c8ff'],
  bone: ['#8a8470', '#b4ae98', '#d4cfba', '#ece8d6', '#fffcf0'],
  white: ['#7a7a7a', '#a8a8a8', '#d0d0d0', '#ececec', '#ffffff'],
  water: ['#123a7a', '#1e56a8', '#2e74d0', '#5a9ae8', '#b8d8ff'],
  murky: ['#2a3420', '#3e4a2c', '#56643a', '#76844e', '#a8b47a'],
  strength: ['#4a0a06', '#7e1a0e', '#b8361a', '#e8642e', '#ffb07a'],
  fireward: ['#5a2a04', '#a0520a', '#e88a14', '#ffc040', '#fff0a0'],
  gill: ['#06343a', '#0c5a64', '#16909a', '#46c8c8', '#b0f4ec'],
  brass: ['#4a3208', '#7e5a14', '#b48a2a', '#dcb84e', '#f8e49a'],
  gunmetal: ['#16181c', '#262a30', '#3a4048', '#56606a', '#848e98'],
};

class Spr {
  constructor() { this.d = new Uint8ClampedArray(S * S * 4); }
  set(x, y, c, a = 255) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    const col = typeof c === 'string' ? hex(c) : c;
    this.d[i] = col[0] * 255; this.d[i + 1] = col[1] * 255; this.d[i + 2] = col[2] * 255; this.d[i + 3] = a;
  }
  get(x, y) { if (x < 0 || y < 0 || x >= S || y >= S) return null; const i = (y * S + x) * 4; return this.d[i + 3] ? [this.d[i], this.d[i + 1], this.d[i + 2]] : null; }
  has(x, y) { if (x < 0 || y < 0 || x >= S || y >= S) return false; return this.d[(y * S + x) * 4 + 3] > 0; }
  // darken pixels on the shape boundary (inner outline) for the classic item look
  outline(f = 0.5) {
    const copy = new Uint8ClampedArray(this.d);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      if (!copy[i + 3]) continue;
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const xx = x + dx, yy = y + dy;
        return xx < 0 || yy < 0 || xx >= S || yy >= S || !copy[(yy * S + xx) * 4 + 3];
      });
      if (edge) { this.d[i] *= f; this.d[i + 1] *= f; this.d[i + 2] *= f; }
    }
    return this;
  }
}

const P = (name) => (PAL[name] || PAL.iron);
function pick(p, t) { return p[Math.max(0, Math.min(p.length - 1, Math.round(t * (p.length - 1))))]; }

function handle(s, x0, y0, len, pal = PAL.wood) {
  for (let t = 0; t < len; t++) {
    s.set(x0 + t, y0 - t, pal[3]);
    s.set(x0 + t + 1, y0 - t, pal[1]);
  }
}

// rotated-frame painter: a = along handle (to top-right), p = perpendicular (to top-left)
function frame(s, cx, cy, fn) {
  const r = Math.SQRT1_2;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const u = (dx - dy) * r;   // along (1,-1)
    const v = (-dx - dy) * r;  // perp (-1,-1)
    const c = fn(u, v, x, y);
    if (c) s.set(x, y, c);
  }
}

const ART = {
  stick(s) { handle(s, 3, 13, 10); },
  pickaxe(s, pal) {
    handle(s, 2, 14, 9);
    frame(s, 10.6, 5.4, (u, v) => {
      const bend = 0.13 * v * v;
      const uu = u + bend;
      if (Math.abs(v) <= 6.4 && uu > -0.9 && uu < 1.1) return pick(pal, 0.45 + uu * 0.35 - Math.abs(v) * 0.02);
      return null;
    });
  },
  axe(s, pal) {
    handle(s, 2, 14, 10);
    frame(s, 10.2, 5.8, (u, v) => {
      if (v > 0.2 && v < 5.2 && Math.abs(u) < 1.4 + v * 0.42 && !(v < 1 && Math.abs(u) > 1.2)) return pick(pal, 0.3 + v * 0.13 - (u < 0 ? 0.15 : 0));
      if (v <= 0.2 && v > -1.3 && Math.abs(u) < 1.2) return pal[1];
      return null;
    });
  },
  shovel(s, pal) {
    handle(s, 2, 14, 9);
    frame(s, 11.6, 4.4, (u, v) => {
      const d = (u * u) / 9 + (v * v) / 5.2;
      if (d < 1 && u > -2.5) return pick(pal, 0.75 - d * 0.5 + v * 0.05);
      return null;
    });
  },
  hoe(s, pal) {
    handle(s, 2, 14, 10);
    frame(s, 11.2, 4.8, (u, v) => {
      if (u > -0.8 && u < 1.3 && v > -1.2 && v < 4.8) return pick(pal, 0.4 + u * 0.25);
      return null;
    });
  },
  sword(s, pal) {
    // blade: 3px wide with a bright edge and a dark fuller, tapering to a point
    frame(s, 8, 8, (u, v) => {
      if (u > -1.2 && u < 8.6) {
        const w = u > 6 ? 1.5 * (8.6 - u) / 2.6 : 1.5;
        if (Math.abs(v) <= w) return v > 0.6 ? pal[4] : v < -0.6 ? pal[1] : u < 6 ? pal[2] : pal[3];
      }
      if (u > -2.4 && u <= -1.2 && Math.abs(v) < 3.6) return Math.abs(v) > 2.8 ? pal[1] : pal[3];
      if (u > -6.2 && u <= -2.4 && Math.abs(v) < 0.8) return (Math.round(u * 1.4) & 1) ? PAL.leather[1] : PAL.leather[3];
      if (u > -7.6 && u <= -6.2 && Math.abs(v) < 1.3) return pal[3];
      return null;
    });
  },
  dagger(s, pal) {
    frame(s, 6.5, 9.5, (u, v) => {
      if (u > -0.2 && u < 6.2) { const w = 1.3 * Math.min(1, (6.2 - u) / 2.2); if (Math.abs(v) <= w) return v > 0.4 ? pal[4] : v < -0.4 ? pal[1] : pal[3]; }
      if (u > -1.4 && u <= -0.2 && Math.abs(v) < 2.6) return pal[1];
      if (u > -4.6 && u <= -1.4 && Math.abs(v) < 0.8) return (Math.round(u * 1.5) & 1) ? PAL.leather[1] : PAL.leather[3];
      if (u > -5.8 && u <= -4.6 && Math.abs(v) < 1.2) return pal[3];
      return null;
    });
  },
  spear(s, pal) {
    for (let t = 0; t < 12; t++) { s.set(1 + t, 15 - t, PAL.wood[2]); s.set(2 + t, 15 - t, PAL.wood[1]); }
    s.set(9, 7, PAL.leather[2]); s.set(10, 6, PAL.leather[2]); s.set(10, 7, PAL.leather[3]);
    frame(s, 13, 3, (u, v) => {
      const w = u < 0 ? 1.6 + u * 0.55 : 1.6 * (1 - u / 3.2);
      if (u > -2.6 && u < 3.2 && Math.abs(v) <= w) return v > 0.3 ? pal[4] : v < -0.3 ? pal[1] : pal[3];
      return null;
    });
  },
  mace(s, pal) {
    for (let t = 0; t < 8; t++) { s.set(2 + t, 14 - t, PAL.wood[2]); s.set(3 + t, 14 - t, PAL.wood[1]); }
    s.set(2, 14, pal[2]); s.set(3, 14, pal[1]); s.set(2, 13, pal[1]);
    for (let y = 0; y < 10; y++) for (let x = 6; x < 16; x++) {
      const d = Math.hypot(x - 11, y - 4.6);
      if (d < 3.4) s.set(x, y, pick(pal, 0.95 - d * 0.18 + (x < 11 ? 0.1 : 0)));
    }
    for (const [x, y] of [[11, 0], [15, 4], [11, 9], [7, 4], [14, 1], [8, 1], [14, 8]]) s.set(x, y, pal[4]);
  },
  crossbow(s) {
    const w = PAL.wood, ir = PAL.iron;
    for (let t = 0; t < 11; t++) { s.set(2 + t, 14 - t, w[2]); s.set(3 + t, 14 - t, w[1]); s.set(2 + t, 13 - t, w[3]); }
    s.set(4, 13, w[0]); s.set(5, 13, ir[1]); s.set(5, 14, ir[2]);
    // string from the prod tips back to the latch
    for (let t = 0; t <= 8; t++) { const k = t / 8; s.set(5.6 + k * 2.2, 2.2 + k * 6.6, '#dcd8cc'); s.set(13.6 - k * 6.4, 10.4 - k * 1.8, '#dcd8cc'); }
    // prod (bow arms) across the front
    frame(s, 10.5, 5.5, (u, v) => {
      const bend = 0.09 * v * v;
      if (Math.abs(v) <= 6.2 && Math.abs(u + bend) < 0.75) return Math.abs(v) > 5 ? ir[3] : w[4];
      return null;
    });
    s.set(8, 8, ir[3]); s.set(9, 7, ir[2]);
  },
  // guns are drawn as side profiles along the sprite diagonal: u = toward the muzzle (top-right), v = up (top-left)
  pistol(s) {
    const g = PAL.gunmetal, w = PAL.wood, br = PAL.brass;
    frame(s, 5.2, 10.8, (u, v) => {
      if (u > 10.4 && u < 11.8 && Math.abs(v) < 1.15) return br[3];                       // muzzle ring
      if (u > 0 && u < 11.8 && Math.abs(v) < 0.85) return v > 0.25 ? g[4] : g[2];        // barrel
      if (u > 0.4 && u < 6.5 && v <= -0.85 && v > -1.9) return v > -1.3 ? w[3] : w[1];   // forestock
      if (u > -0.6 && u < 0.9 && v >= 0.85 && v < 2.4) return v > 1.8 ? g[3] : g[1];     // cocked hammer
      if (u > 0.2 && u < 2.4 && v > -1.6 && v < 0.85) return br[2];                       // lock plate
      const gc = -0.6 + v * 0.42;                                                         // grip slants back as it drops
      if (v <= -0.5 && v > -5.6 && Math.abs(u - gc) < 1.25) return v < -4.7 ? br[3] : (u - gc) > 0.3 ? w[1] : w[3];
      if (u > 1.4 && u < 3.4 && v > -3 && v < -1.6 && !(u > 2 && u < 2.8 && v > -2.5)) return br[1]; // trigger guard
      return null;
    });
  },
  khopesh(s) {
    // a sickle-sword: straight grip, then a long blade bending into a hook
    const g = PAL.gold, w = PAL.wood;
    for (let i = 0; i < 4; i++) { s.set(3 + i, 12 - i, w[1 + (i % 2)]); s.set(4 + i, 13 - i, w[2]); }
    s.set(6, 9, g[3]); s.set(7, 10, g[2]); s.set(5, 8, g[2]);
    const pts = [[8, 8], [9, 7], [10, 6], [11, 5], [12, 4], [13, 4], [14, 5], [14, 6], [13, 7]];
    pts.forEach(([x, y], k) => { s.set(x, y, k > 5 ? g[4] : g[3]); s.set(x - 1, y, g[2]); if (k < 6) s.set(x, y - 1, g[4]); });
  },
  nemes(s) {
    // striped gold and lapis headdress with lappets and a cobra on the brow
    const g = PAL.gold;
    for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) {
      const top = y < 7 && x > 3 && x < 12, lap = y >= 7 && (x < 6 || x > 9);
      if (!top && !lap) continue;
      s.set(x, y, (y % 2 ? g[3] : '#2a5ab8'));
    }
    for (let x = 6; x < 10; x++) for (let y = 7; y < 11; y++) s.set(x, y, '#d8cdb0');
    s.set(7, 8, '#40e8d0'); s.set(8, 8, '#40e8d0'); s.set(7, 2, g[4]); s.set(8, 2, g[4]); s.set(7, 3, '#e02040');
  },
  wick(s) {
    // a short twisted pale wick with a faint greenish glow at its tip
    for (let y = 4; y < 14; y++) { const x = 8 + Math.round(Math.sin(y * 0.9) * 0.8); s.set(x, y, y % 2 ? '#e8e2d2' : '#d0c8b4'); s.set(x + 1, y, '#b8b0a0'); }
    s.set(8, 3, '#e8f4d8'); s.set(9, 3, '#c8e0b0'); s.set(8, 2, '#d0f0c0'); s.set(7, 3, '#a8c890');
    s.set(9, 14, '#6a6458'); s.set(8, 14, '#7a7468');
  },
  launcher(s) {
    const g = PAL.gunmetal, w = PAL.wood, br = PAL.brass;
    frame(s, 5.6, 10.4, (u, v) => {
      if (u > 10.2 && u < 12.2 && Math.abs(v) < 1.5) return v > 0.4 ? '#e04a3a' : '#a82a20';           // TNT nose in the muzzle
      if (u > 9.4 && u < 10.6 && Math.abs(v) < 2.2) return v > 0.6 ? br[4] : br[2];                   // muzzle band
      if (u > 4.6 && u < 5.6 && Math.abs(v) < 2.1) return br[3];                                         // middle band
      if (u > -1.2 && u < 10.4 && Math.abs(v) < 1.85) return v > 0.8 ? g[4] : v > -0.6 ? g[3] : g[1];   // fat tube
      if (u > -1.8 && u < -0.6 && Math.abs(v) < 2.0) return br[2];                                       // breech cap
      if (u > 2.4 && u < 4.4 && v <= -1.85 && v > -4.6) return v < -4 ? w[1] : w[3];                    // grip
      const sv = -0.4 + (u + 1.5) * 0.32;
      if (u <= -1.5 && u > -6 && v < sv + 1.1 && v > sv - 1.5) return v > sv ? w[4] : w[2];            // stock
      if (u > 0.4 && u < 2.0 && v > 1.85 && v < 3.0) return g[2];                                       // sight
      return null;
    });
  },
  blunderbuss(s) {
    const g = PAL.brass, w = PAL.wood, m = PAL.gunmetal;
    frame(s, 6.4, 9.6, (u, v) => {
      if (u > 8.6 && u < 11.2 && Math.abs(v) < 1.0 + (u - 8.6) * 0.75) return Math.abs(v) > 1.3 + (u - 8.6) * 0.55 ? g[1] : v > 0 ? g[4] : g[3]; // flared muzzle
      if (u > -0.5 && u < 8.8 && Math.abs(v) < 0.9) return v > 0.25 ? g[4] : g[2];       // brass barrel
      if (u > -0.2 && u < 5 && v <= -0.9 && v > -1.8) return w[2];                        // forestock
      if (u > -1.2 && u < 0.3 && v >= 0.9 && v < 2.2) return m[3];                        // hammer
      // butt stock runs back and down
      const sv = -0.6 + (u + 0.5) * 0.38;
      if (u <= -0.5 && u > -6.8 && v < sv + 1.0 && v > sv - 1.6 - (-u) * 0.12) return v > sv + 0.3 ? w[4] : w[2];
      if (u > 0.6 && u < 2.6 && v > -2.8 && v < -1.7 && !(u > 1.2 && u < 2 && v > -2.3)) return m[2]; // trigger guard
      return null;
    });
  },
  shot(s) {
    for (const [cx, cy] of [[6, 10], [10, 10], [8, 7], [12, 7], [5, 6]]) for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < 1.9) s.set(x, y, pick(PAL.gunmetal, 0.95 - d * 0.35 - (x > cx ? 0.15 : 0)));
    }
  },
  gunpowder(s) {
    for (let y = 5; y < 15; y++) for (let x = 2; x < 15; x++) {
      const h = (x * 13 + y * 7) % 5;
      if (((x - 8.5) / 6) ** 2 + ((y - 11.5) / 3.6) ** 2 < 1 && h !== 0) s.set(x, y, pick(['#1a1a1c', '#2a2a2e', '#3c3c42', '#56565e', '#7a7a84'], 0.15 + h * 0.15 + (y < 10 ? 0.15 : 0)));
    }
    s.set(6, 9, '#c8a050'); s.set(11, 11, '#c8a050'); s.set(9, 8, '#e0e0e0');
  },
  brimstone(s) {
    const p = ['#6a5404', '#a8880c', '#d8b81c', '#f4dc4a', '#fff6b0'];
    for (let y = 3; y < 14; y++) for (let x = 3; x < 14; x++) {
      const d = Math.abs(x - 8.5) + Math.abs(y - 8.5) * 1.2 + Math.sin(x * 2.1 + y) * 0.8;
      if (d < 6.2) s.set(x, y, pick(p, 0.95 - d * 0.1 + ((x * 5 + y * 3) % 4 === 0 ? 0.2 : 0) - (x > 9 && y > 8 ? 0.25 : 0)));
    }
  },
  niter(s) {
    const p = ['#8a8a84', '#b8b8b0', '#dcdcd4', '#f0f0ea', '#ffffff'];
    for (const [cx, cy, h] of [[6, 12, 7], [9, 12, 9], [12, 12, 6], [8, 12, 5]]) for (let t = 0; t < h; t++) {
      const yy = cy - t, ww = t > h - 3 ? 0 : 1;
      for (let k = -ww; k <= ww; k++) s.set(cx + k, yy, pick(p, 0.5 + k * 0.25 + t * 0.05));
    }
  },
  nugget(s, pal) {
    for (let y = 6; y < 12; y++) for (let x = 5; x < 12; x++) if (Math.hypot(x - 8, (y - 9) * 1.3) < 3.2) s.set(x, y, pick(pal, 0.85 - Math.hypot(x - 7, y - 8) * 0.15));
  },
  bottle(s) {
    for (let y = 6; y < 15; y++) for (let x = 3; x < 14; x++) if (Math.hypot(x - 8.5, y - 10) < 4.6) s.set(x, y, (x < 7 && y < 11) ? '#f4fbff' : '#c8dce8', 150);
    for (let y = 2; y < 7; y++) { s.set(7, y, '#c8dce8', 170); s.set(8, y, '#e8f4fa', 170); s.set(9, y, '#b0c8d8', 170); }
    s.set(7, 1, PAL.wood[2]); s.set(8, 1, PAL.wood[3]); s.set(9, 1, PAL.wood[2]);
  },
  tome(s) {
    for (let y = 2; y < 15; y++) for (let x = 3; x < 13; x++) s.set(x, y, x < 5 ? '#2a1446' : '#46207a');
    for (let y = 3; y < 14; y++) s.set(12, y, '#ece4cc');
    for (const [x, y] of [[8, 5], [7, 6], [9, 6], [8, 7], [8, 8], [7, 9], [9, 9], [8, 10], [6, 8], [10, 8]]) s.set(x, y, '#5ae8ff');
    s.set(4, 2, '#c8a040'); s.set(4, 14, '#c8a040');
  },
  coal(s, pal = ['#0e0e0e', '#1c1c1c', '#2c2c2c', '#444444', '#6a6a6a']) {
    for (let y = 3; y < 14; y++) for (let x = 3; x < 14; x++) {
      const d = Math.hypot(x - 8.2, (y - 8.5) * 1.1) + Math.sin(x * 1.7 + y) * 0.7;
      if (d < 5.2) s.set(x, y, pick(pal, 0.25 + (8 - x + 8 - y) * 0.05 + ((x * 7 + y * 3) % 5 === 0 ? 0.4 : 0)));
    }
  },
  charcoal(s) { ART.coal(s, ['#1a120a', '#2a1e12', '#3c2c1c', '#4e3c28', '#6a5440']); },
  raw(s, pal) {
    const pts = [[8, 8, 4.3], [5.5, 10, 2.6], [10.5, 5.5, 2.5], [10, 10.5, 2.4]];
    for (let y = 2; y < 15; y++) for (let x = 2; x < 15; x++) {
      for (const [cx, cy, r] of pts) {
        const d = Math.hypot(x - cx, y - cy);
        if (d < r) { s.set(x, y, pick(pal, 0.35 + (cx - x + cy - y) * 0.06 + ((x * 5 + y * 7) % 6 === 0 ? 0.3 : 0))); break; }
      }
    }
  },
  ingot(s, pal) {
    for (let y = 5; y < 12; y++) for (let x = 2; x < 15; x++) {
      const top = y < 8;
      const inset = top ? 8 - y : 0;
      if (x < 2 + inset || x > 14 - inset + (top ? 0 : 0)) continue;
      if (!top && x > 13) continue;
      s.set(x, y, top ? pick(pal, 0.8 - (y - 5) * 0.05) : pick(pal, 0.45 - (x > 11 ? 0.2 : 0)));
    }
    s.set(4, 6, pal[4]); s.set(5, 6, pal[4]);
  },
  gem(s, pal) {
    for (let y = 2; y < 15; y++) for (let x = 2; x < 15; x++) {
      const dx = Math.abs(x - 8), dy = y < 6 ? (6 - y) * 1.6 : (y - 6) * 0.7;
      if (dx + dy < 6.2) {
        const facet = y < 6 ? 0.85 : x < 8 ? 0.55 : 0.35;
        s.set(x, y, pick(pal, facet + (dx < 1 ? 0.15 : 0)));
      }
    }
    s.set(6, 4, pal[4]); s.set(7, 3, pal[4]);
  },
  emerald(s, pal) {
    for (let y = 2; y < 15; y++) for (let x = 3; x < 14; x++) {
      const dx = Math.abs(x - 8), dy = Math.abs(y - 8.5);
      if (dx <= 4 && dy <= 6 - Math.max(0, dx - 2) * 1.2) s.set(x, y, pick(pal, 0.4 + (dx < 2 ? 0.25 : 0) + (y < 7 ? 0.2 : 0)));
    }
    s.set(7, 5, pal[4]); s.set(7, 6, pal[4]);
  },
  shard(s, pal) {
    for (const [ox, oy, h, w] of [[8, 13, 11, 2.4], [5, 14, 7, 1.8], [11, 14, 8, 1.6]]) {
      for (let k = 0; k < h; k++) {
        const ww = w * (1 - k / h * 0.7);
        for (let x = Math.floor(ox - ww); x <= Math.ceil(ox + ww); x++) {
          if (Math.abs(x - ox) <= ww) s.set(x, oy - k, pick(pal, 0.45 + (x < ox ? 0.3 : 0) + k / h * 0.25));
        }
      }
    }
  },
  ball(s, pal) {
    for (let y = 3; y < 14; y++) for (let x = 3; x < 14; x++) {
      const d = Math.hypot(x - 8, y - 8.5);
      if (d < 5) s.set(x, y, pick(pal, 0.85 - d * 0.08 - (x + y - 16) * 0.04));
    }
  },
  brick(s) {
    const p = ['#4a1a10', '#7a2c1c', '#a03c28', '#c05438', '#d87458'];
    for (let y = 5; y < 12; y++) for (let x = 2; x < 15; x++) s.set(x, y, pick(p, y < 7 ? 0.8 : 0.45 + ((x * 3 + y) % 4 === 0 ? 0.15 : 0)));
  },
  flint(s) {
    const p = ['#1e1e22', '#34343a', '#4c4c54', '#6a6a74', '#9090a0'];
    for (let y = 3; y < 14; y++) for (let x = 4; x < 13; x++) {
      if (Math.abs(x - 8) + Math.abs(y - 8.5) * 0.7 < 5.2 - (y > 10 ? (y - 10) * 0.6 : 0)) s.set(x, y, pick(p, 0.3 + (x < 8 ? 0.35 : 0) + (y < 6 ? 0.2 : 0)));
    }
  },
  string(s) {
    for (let t = 0; t < 13; t++) { const x = 2 + t, y = 8 + Math.round(Math.sin(t * 0.9) * 3); s.set(x, y, '#e8e8e8'); if (t % 3 === 0) s.set(x, y + 1, '#b0b0b0'); }
  },
  feather(s) {
    for (let t = 0; t < 12; t++) {
      const x = 3 + t, y = 13 - t;
      s.set(x, y, '#d0d0d0');
      if (t > 2) { s.set(x - 1, y - 1, '#ffffff'); s.set(x + 1, y + 1, '#e4e4e4'); }
      if (t > 4 && t < 11) { s.set(x - 2, y - 1, '#f4f4f4'); s.set(x + 1, y + 2, '#c8c8c8'); }
    }
  },
  leather(s) {
    const p = PAL.leather;
    for (let y = 3; y < 14; y++) for (let x = 3; x < 14; x++) {
      const wob = Math.sin(x * 1.3) * 0.8 + Math.cos(y * 1.1) * 0.8;
      if (Math.abs(x - 8) < 5 + wob * 0.4 && Math.abs(y - 8.5) < 5 + wob * 0.3) s.set(x, y, pick(p, 0.5 + wob * 0.12));
    }
  },
  bone(s) {
    const p = PAL.bone;
    for (let t = 0; t < 9; t++) { s.set(4 + t, 11 - t, p[3]); s.set(5 + t, 11 - t, p[2]); }
    for (const [x, y] of [[3, 11], [4, 12], [3, 12], [12, 3], [13, 3], [12, 2], [13, 4], [2, 11]]) s.set(x, y, p[4]);
  },
  wheat(s) {
    const g = ['#7a5a14', '#a8801e', '#d0a630', '#e8c650', '#f8e080'];
    for (let k = 0; k < 4; k++) {
      const ox = 4 + k * 2;
      for (let y = 6; y < 15; y++) s.set(ox + Math.round((y - 15) * -0.15 * (k - 1.5)), y, g[1]);
      for (let y = 1; y < 7; y++) { s.set(ox - 1 + (y % 2), y, g[3]); s.set(ox + (y % 2), y, g[2]); }
    }
  },
  seeds(s) {
    for (const [x, y] of [[5, 6], [9, 5], [7, 9], [11, 9], [4, 11], [9, 12], [12, 6]]) { s.set(x, y, '#5a8a2a'); s.set(x + 1, y, '#3e6a1a'); s.set(x, y + 1, '#7aa83a'); }
  },
  carrot(s) {
    const o = ['#7a3008', '#b8500e', '#e47418', '#f8962e', '#ffbc6a'];
    for (let t = 0; t < 10; t++) {
      const w = (10 - t) * 0.22;
      for (let k = -1; k <= 1; k++) if (Math.abs(k) <= w) s.set(4 + t + k, 12 - t + k, pick(o, 0.5 + k * 0.25));
    }
    for (const [x, y] of [[12, 2], [13, 1], [14, 2], [12, 4], [14, 4], [13, 3]]) s.set(x, y, '#4a9a2a');
  },
  apple(s) {
    const r = ['#5a0a0a', '#8e1414', '#c42222', '#e84a3a', '#ffa090'];
    for (let y = 4; y < 15; y++) for (let x = 2; x < 15; x++) {
      const d = Math.hypot((x - 8.5) * 0.95, y - 9.5) - (Math.abs(x - 8.5) < 1.5 && y < 6 ? -1 : 0);
      if (d < 5.2) s.set(x, y, pick(r, 0.7 - d * 0.08 - (x - 8) * 0.04));
    }
    s.set(8, 3, '#5a3a1a'); s.set(8, 2, '#5a3a1a'); s.set(9, 2, '#3e8a2a'); s.set(10, 1, '#4ea232'); s.set(10, 2, '#3e8a2a');
    s.set(6, 7, '#ffd0c8');
  },
  berries(s) {
    for (const [x, y] of [[5, 8], [8, 7], [10, 10], [6, 11], [9, 12], [11, 7]]) {
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) s.set(x + dx, y + dy, dx + dy === 0 ? '#ff7a8a' : '#c41e3a');
    }
    s.set(8, 5, '#3e8a2a'); s.set(9, 4, '#3e8a2a'); s.set(7, 4, '#4ea232');
  },
  bread(s) {
    const b = ['#5a3008', '#8a4e14', '#b8742a', '#d89a4a', '#f0c070'];
    for (let y = 5; y < 13; y++) for (let x = 2; x < 15; x++) {
      const d = ((x - 8.5) / 6.5) ** 2 + ((y - 9) / 4) ** 2;
      if (d < 1) s.set(x, y, pick(b, 0.8 - (y - 5) * 0.08 + ((x % 4 === 0 && y < 9) ? -0.2 : 0)));
    }
  },
  meat(s, pal) {
    for (let y = 3; y < 14; y++) for (let x = 2; x < 15; x++) {
      const d = ((x - 8.5) / 6) ** 2 + ((y - 8.5) / 4.6) ** 2 + Math.sin(x * 0.9 + y) * 0.06;
      if (d < 1) s.set(x, y, d > 0.72 ? '#f0e6dc' : pick(pal, 0.65 - d * 0.4 + ((x + y) % 5 === 0 ? 0.1 : 0)));
    }
  },
  chop(s, pal) {
    for (let y = 3; y < 13; y++) for (let x = 2; x < 13; x++) {
      const d = ((x - 7.5) / 5) ** 2 + ((y - 7.5) / 4.4) ** 2;
      if (d < 1) s.set(x, y, d > 0.75 ? '#f6ece2' : pick(pal, 0.6 - d * 0.35));
    }
    for (let t = 0; t < 4; t++) { s.set(11 + t, 11 + t, '#ece4d4'); s.set(12 + t, 11 + t, '#c8c0b0'); }
  },
  drumstick(s, pal) {
    for (let y = 2; y < 11; y++) for (let x = 5; x < 15; x++) {
      const d = ((x - 9.5) / 4.6) ** 2 + ((y - 6.5) / 4.2) ** 2;
      if (d < 1) s.set(x, y, pick(pal, 0.75 - d * 0.45));
    }
    for (let t = 0; t < 5; t++) { s.set(6 - t, 10 + t, '#ece4d4'); s.set(5 - t, 10 + t, '#c8c0b0'); }
    s.set(1, 14, '#ffffff'); s.set(2, 15, '#ffffff');
  },
  fish(s, pal) {
    for (let y = 4; y < 13; y++) for (let x = 2; x < 13; x++) {
      const d = ((x - 7) / 5) ** 2 + ((y - 8.5) / 3.2) ** 2;
      if (d < 1) s.set(x, y, pick(pal, y < 8 ? 0.35 : 0.7));
    }
    for (let y = 4; y < 13; y++) { const w = Math.abs(y - 8.5); if (w > 0.5) for (let x = 12; x < 12 + Math.min(3, w); x++) s.set(x, y, pal[1]); }
    s.set(4, 7, '#101010'); s.set(4, 6, '#f0f0f0');
  },
  stew(s) {
    ART.bowl(s);
    for (let x = 4; x < 13; x++) { s.set(x, 7, '#a0703a'); s.set(x, 8, '#8a5a2a'); }
    s.set(6, 7, '#c22b22'); s.set(10, 7, '#e8e0d0'); s.set(8, 6, '#93714a');
  },
  bowl(s) {
    const w = PAL.wood;
    for (let y = 7; y < 13; y++) for (let x = 2; x < 15; x++) {
      const half = 6.5 - (y - 7) * 0.9;
      if (Math.abs(x - 8.5) < half) s.set(x, y, pick(w, 0.55 - (y - 7) * 0.06 + (x < 8 ? 0.15 : 0)));
    }
  },
  bucket(s, pal, it) {
    const p = PAL.iron;
    for (let y = 5; y < 15; y++) {
      const half = 5.5 - (y - 5) * 0.25;
      for (let x = 2; x < 15; x++) if (Math.abs(x - 8.5) < half) s.set(x, y, pick(p, 0.6 - (x - 8) * 0.06 - (y - 5) * 0.02));
    }
    for (let x = 3; x < 14; x++) s.set(x, 5, p[1]);
    for (let t = 0; t < 7; t++) { const a = Math.PI * t / 6; s.set(8.5 + Math.cos(a) * 5, 4 - Math.sin(a) * 3, p[0]); }
    const fill = it && it.fill;
    if (fill) {
      const c = fill === 'water' ? ['#1e4aa8', '#3a6fd8'] : fill === 'lava' ? ['#d8480c', '#ffb030'] : ['#e8e8e8', '#ffffff'];
      for (let x = 4; x < 13; x++) { s.set(x, 6, c[1]); s.set(x, 7, c[0]); }
    }
  },
  bow(s) {
    const w = PAL.wood;
    // string along the chord (bottom-left to top-right)
    for (let x = 3; x <= 13; x++) s.set(x, 16 - x, '#dcd8cc');
    // limbs: deep curve bulging to the top-left of the chord, 2px thick
    const r = Math.SQRT1_2;
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const cx = 2.6 + t * 11, cy = 13.4 - t * 11;
      const b = Math.sin(t * Math.PI) * 5.2;
      s.set(Math.floor(cx - b * r), Math.floor(cy - b * r), w[2]);
      s.set(Math.floor(cx - (b + 0.9) * r), Math.floor(cy - (b + 0.9) * r), w[4]);
    }
    // recurve tips
    s.set(13, 2, w[3]); s.set(14, 1, w[4]); s.set(2, 13, w[3]); s.set(1, 14, w[4]);
    // leather grip at the middle of the limbs
    for (const [x, y] of [[4, 5], [5, 4], [5, 5], [4, 4], [3, 5], [5, 3]]) s.set(x, y, PAL.leather[2]);
  },
  bow_nostring(s) {
    const w = PAL.wood;
    const r = Math.SQRT1_2;
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const cx = 2.6 + t * 11, cy = 13.4 - t * 11;
      const b = Math.sin(t * Math.PI) * 6.2;
      s.set(Math.floor(cx - b * r + 0.6), Math.floor(cy - b * r + 0.6), w[2]);
      s.set(Math.floor(cx - (b + 0.9) * r + 0.6), Math.floor(cy - (b + 0.9) * r + 0.6), w[4]);
    }
    s.set(13, 2, w[3]); s.set(14, 1, w[4]); s.set(2, 13, w[3]); s.set(1, 14, w[4]);
    for (const [x, y] of [[4, 5], [5, 4], [5, 5], [4, 4], [3, 5], [5, 3]]) s.set(x, y, PAL.leather[2]);
  },
  arrow(s) {
    for (let t = 0; t < 9; t++) s.set(4 + t, 11 - t, PAL.wood[3]);
    s.set(13, 2, '#9a9aa0'); s.set(12, 2, '#c0c0c8'); s.set(13, 3, '#c0c0c8'); s.set(14, 1, '#e0e0e8');
    for (const [x, y] of [[2, 12], [3, 13], [2, 13], [3, 11], [4, 13], [2, 11]]) s.set(x, y, '#f0f0f0');
  },
  rod(s) {
    for (let t = 0; t < 12; t++) { s.set(2 + t, 14 - t, PAL.wood[3]); }
    for (let y = 3; y < 13; y++) s.set(14, y, '#d8d8d8');
    s.set(13, 13, '#9a9aa0'); s.set(14, 13, '#9a9aa0'); s.set(13, 12, '#9a9aa0');
  },
  shears(s) {
    const p = PAL.iron;
    for (let t = 0; t < 7; t++) { s.set(8 + t * 0.9, 7 - t * 0.9, p[3]); s.set(7 - t * 0.9, 7 - t * 0.9, p[2]); }
    for (const [cx, cy] of [[5, 11], [10, 11]]) for (let a = 0; a < 12; a++) s.set(cx + Math.cos(a / 12 * 6.28) * 2.2, cy + Math.sin(a / 12 * 6.28) * 2.2, '#8a1c1c');
  },
  flint_steel(s) {
    for (let a = 0; a < 16; a++) s.set(6 + Math.cos(a / 16 * 6.28) * 3.5, 6 + Math.sin(a / 16 * 6.28) * 3.5, PAL.iron[2]);
    ART.flint_small(s);
  },
  flint_small(s) { for (let y = 9; y < 14; y++) for (let x = 9; x < 14; x++) if (Math.abs(x - 11) + Math.abs(y - 11.5) < 3) s.set(x, y, '#4c4c54'); },
  boat(s) {
    const w = PAL.wood;
    for (let y = 6; y < 12; y++) for (let x = 1; x < 15; x++) {
      const half = 7 - Math.max(0, y - 8) * 1.4;
      if (Math.abs(x - 8) < half) s.set(x, y, pick(w, y === 6 ? 0.9 : 0.5 - (y - 6) * 0.05));
    }
    for (let x = 3; x < 13; x++) s.set(x, 7, w[1]);
  },
  saddle(s) {
    const p = PAL.leather;
    for (let y = 4; y < 11; y++) for (let x = 2; x < 15; x++) if (((x - 8.5) / 6.5) ** 2 + ((y - 7) / 3.4) ** 2 < 1) s.set(x, y, pick(p, 0.6 - (y - 4) * 0.05));
    for (let y = 10; y < 15; y++) { s.set(4, y, p[1]); s.set(12, y, p[1]); }
    s.set(4, 14, PAL.iron[2]); s.set(12, 14, PAL.iron[2]);
  },
  paper(s) { for (let y = 3; y < 14; y++) for (let x = 3; x < 13; x++) s.set(x, y, (y % 3 === 0 && x > 4 && x < 11) ? '#c8c4b8' : '#f2eee4'); },
  book(s) {
    for (let y = 3; y < 14; y++) for (let x = 3; x < 13; x++) s.set(x, y, x < 5 ? '#5a2a14' : '#8a3e1e');
    for (let y = 4; y < 13; y++) s.set(12, y, '#f2eee4');
    s.set(8, 6, '#e8c040'); s.set(9, 6, '#e8c040');
  },
  fiber(s) { for (let k = 0; k < 3; k++) for (let y = 2; y < 15; y++) s.set(5 + k * 3 + Math.round(Math.sin(y * 0.6 + k)), y, k === 1 ? '#a0cf72' : '#86b55c'); },
  dust(s, pal) {
    for (let y = 6; y < 14; y++) for (let x = 3; x < 14; x++) {
      const h = (x * 13 + y * 7) % 5;
      if (((x - 8.5) / 5) ** 2 + ((y - 11) / 3) ** 2 < 1 && h !== 0) s.set(x, y, pick(pal, 0.3 + h * 0.15));
    }
  },
  tusk(s, pal) {
    const p = pal && pal !== PAL.iron ? pal : PAL.bone;
    for (let t = 0; t < 14; t++) {
      const a = t / 13;
      const x = 2 + t * 0.85, y = 14 - Math.sin(a * Math.PI * 0.9) * 10 - a * 2;
      const w = 2.2 * (1 - a * 0.75);
      for (let k = -1; k <= 1; k++) if (Math.abs(k) <= w) s.set(x, y + k, pick(p, 0.6 - k * 0.2));
    }
  },
  core(s, pal) {
    for (let y = 2; y < 15; y++) for (let x = 2; x < 15; x++) {
      const d = Math.hypot(x - 8.5, y - 8.5);
      if (d < 6) s.set(x, y, pick(pal, 0.95 - d * 0.12 + Math.sin(Math.atan2(y - 8.5, x - 8.5) * 5) * 0.1));
    }
  },
  scale(s, pal) {
    for (let y = 2; y < 15; y++) for (let x = 3; x < 14; x++) {
      const d = ((x - 8.5) / 5.2) ** 2 + ((y - 7) / 6) ** 2;
      if (d < 1 && !(y > 11 && Math.abs(x - 8.5) > (14 - y) * 1.5)) s.set(x, y, pick(pal, 0.85 - d * 0.5 + (Math.abs(x - 8.5) < 1 ? 0.15 : 0)));
    }
  },
  egg(s) {
    const p = ['#2a0a3a', '#4a1a6a', '#7a2aa0', '#b05ad8', '#e8b0ff'];
    for (let y = 1; y < 15; y++) for (let x = 3; x < 14; x++) {
      const d = ((x - 8.5) / 5) ** 2 + ((y - 9) / (y < 9 ? 7.5 : 5.5)) ** 2;
      if (d < 1) s.set(x, y, pick(p, 0.7 - d * 0.4 + ((x * 3 + y * 5) % 7 === 0 ? 0.3 : 0)));
    }
  },
  wand(s) {
    for (let t = 0; t < 11; t++) { s.set(3 + t, 13 - t, PAL.wood[2]); s.set(4 + t, 13 - t, PAL.wood[1]); }
    for (const [x, y, c] of [[13, 2, '#bfe8ff'], [14, 2, '#6fc0ff'], [13, 1, '#6fc0ff'], [12, 3, '#3fa0ff'], [14, 1, '#ffffff']]) s.set(x, y, c);
  },
  staff(s, pal) {
    for (let t = 0; t < 11; t++) { s.set(2 + t, 14 - t, PAL.wood[2]); s.set(3 + t, 14 - t, PAL.wood[1]); }
    for (let y = 0; y < 6; y++) for (let x = 10; x < 16; x++) if (Math.hypot(x - 12.5, y - 3) < 2.8) s.set(x, y, pick(pal, 0.9 - Math.hypot(x - 12.5, y - 3) * 0.2));
  },
  potion(s, pal) {
    for (let y = 6; y < 15; y++) for (let x = 3; x < 14; x++) if (Math.hypot(x - 8.5, y - 10) < 4.6) s.set(x, y, y < 8 ? '#d8e8f0' : pick(pal, 0.75 - Math.hypot(x - 7, y - 9) * 0.08));
    for (let y = 2; y < 7; y++) { s.set(7, y, '#c8dce8'); s.set(8, y, '#e8f4fa'); s.set(9, y, '#b0c8d8'); }
    s.set(7, 1, PAL.wood[2]); s.set(8, 1, PAL.wood[3]); s.set(9, 1, PAL.wood[2]);
  },
  treat(s) {
    for (let y = 3; y < 14; y++) for (let x = 3; x < 14; x++) {
      const d = Math.hypot(x - 8.5, (y - 8.5) * 1.15);
      if (d < 5.2) s.set(x, y, (x + y) % 3 === 0 ? '#ffe070' : pick(['#6a0a3a', '#a0145a', '#e0287a', '#ff6aa8'], 0.8 - d * 0.1));
    }
    s.set(8, 2, '#3e8a2a'); s.set(9, 1, '#4ea232');
  },
  compass(s) {
    for (let y = 2; y < 15; y++) for (let x = 2; x < 15; x++) {
      const d = Math.hypot(x - 8.5, y - 8.5);
      if (d < 6.2) s.set(x, y, d > 5 ? PAL.copper[2] : '#e8e4d8');
    }
    for (let t = 0; t < 4; t++) { s.set(8 + t * 0.5, 8 - t, '#d82020'); s.set(8 - t * 0.5, 9 + t, '#3a3a3a'); }
  },
  shield(s) {
    // a heater shield: oak boards in an iron rim with a central boss
    for (let y = 1; y < 16; y++) for (let x = 2; x < 15; x++) {
      const half = y < 9 ? 6.5 : 6.5 - (y - 9) * 0.95;
      const d = Math.abs(x - 8.5);
      if (d > half) continue;
      const rim = d > half - 1.2 || y < 2;
      s.set(x, y, rim ? (y % 3 === 0 ? PAL.iron[3] : PAL.iron[2]) : pick(PAL.wood, 0.45 + ((x >> 1) % 2) * 0.15 + (y % 5 === 0 ? -0.15 : 0)));
    }
    for (let y = 6; y < 10; y++) for (let x = 7; x < 11; x++) s.set(x, y, Math.hypot(x - 8.5, y - 7.5) < 1.6 ? PAL.iron[3] : PAL.iron[1]);
  },
  lair_compass(s) {
    // dark rune-ringed compass with a glowing teal needle
    for (let y = 1; y < 16; y++) for (let x = 1; x < 16; x++) {
      const d = Math.hypot(x - 8.5, y - 8.5);
      if (d < 7) s.set(x, y, d > 5.8 ? PAL.wayfinder[1] : d > 5 ? '#2a2236' : pick(['#1a1626', '#221c30', '#2a2238'], 0.6 - d * 0.05));
    }
    for (const [x, y] of [[8, 2], [14, 8], [8, 14], [2, 8]]) s.set(x, y, PAL.wayfinder[4]);
    for (let t = 0; t < 5; t++) { s.set(8 + Math.round(t * 0.6), 8 - t, t > 3 ? PAL.wayfinder[4] : PAL.wayfinder[3]); s.set(8 - Math.round(t * 0.4), 9 + t * 0.8, '#5a5068'); }
    s.set(8, 8, '#e8fff8');
  },
  keystone(s) {
    // a faceted stone holding the five colours of the great beasts
    const cols = ['#e8dcc0', '#5ad06a', '#f0b040', '#8ad0ff', '#ff6a2a'];
    for (let y = 1; y < 16; y++) for (let x = 2; x < 15; x++) {
      const dy = Math.abs(y - 8.5), dx = Math.abs(x - 8.5);
      if (dx + dy * 0.85 > 7) continue;
      const a = Math.atan2(y - 8.5, x - 8.5), k = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 5) % 5;
      const edge = dx + dy * 0.85 > 5.8;
      s.set(x, y, edge ? '#3a3046' : Math.hypot(x - 8.5, y - 8.5) < 1.8 ? '#ffffff' : cols[k]);
    }
  },
  spyglass(s) {
    for (let t = 0; t < 11; t++) { s.set(3 + t, 12 - t, PAL.copper[t < 5 ? 2 : 3]); s.set(4 + t, 12 - t, PAL.copper[1]); s.set(3 + t, 13 - t, PAL.copper[1]); }
    s.set(14, 1, '#bfe8ff'); s.set(13, 1, '#8ac4ff');
  },
  // armor
  helmet(s, pal) {
    for (let y = 3; y < 12; y++) for (let x = 2; x < 15; x++) {
      const dome = ((x - 8.5) / 6.5) ** 2 + ((y - 8) / 5) ** 2 < 1;
      const cut = y > 8 && x > 4 && x < 13;
      if (dome && !cut) s.set(x, y, pick(pal, 0.75 - (y - 3) * 0.05 + (x < 6 ? 0.1 : 0)));
    }
  },
  chestplate(s, pal) {
    for (let y = 2; y < 15; y++) for (let x = 1; x < 16; x++) {
      const body = x >= 4 && x <= 12 && y >= 4;
      const shoulder = y >= 2 && y <= 6 && x >= 1 && x <= 15 && !(x >= 6 && x <= 10 && y < 4);
      const neck = x >= 6 && x <= 10 && y < 4;
      if ((body || shoulder) && !neck) s.set(x, y, pick(pal, 0.6 - (y - 2) * 0.025 + (x < 8 ? 0.12 : -0.05)));
    }
  },
  leggings(s, pal) {
    for (let y = 2; y < 15; y++) for (let x = 3; x < 14; x++) {
      const waist = y < 6;
      const leg = (x <= 7 || x >= 9);
      if (waist || leg) s.set(x, y, pick(pal, 0.55 - (y - 2) * 0.02 + (x < 7 ? 0.12 : 0)));
    }
  },
  boots(s, pal) {
    for (const ox of [2, 9]) for (let y = 6; y < 14; y++) for (let x = ox; x < ox + 6; x++) {
      if (y < 10 && x > ox + 3) continue;
      s.set(x, y, pick(pal, 0.6 - (y - 6) * 0.04 + (x === ox ? 0.15 : 0)));
    }
  },
};

export function drawItemSprite(it) {
  const s = new Spr();
  const fn = ART[it.art] || ART.ball;
  const pal = P(it.pal);
  fn(s, pal, it);
  s.outline(it.art === 'string' || it.art === 'seeds' || it.art === 'fiber' ? 1 : 0.55);
  return s.d;
}
