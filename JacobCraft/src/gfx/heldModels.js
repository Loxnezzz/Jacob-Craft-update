// 3D box models for weapons that are held pointing forward (crossbows, firearms, spears).
// Flat item sprites read badly when seen end-on, so these are built from boxes like creature models.
// Coordinates are metres in the hand frame: fist at the origin, -Z forward (muzzle/tip), +Y up.
import { PAT } from '../mobs/models.js';
import { mat4 } from '../core/math.js';
import { PAL } from './itemArt.js';

function C(h) { const v = parseInt(h.slice(1), 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; }
const WOOD = C('#7a5432'), WOOD_D = C('#4e3420'), WOOD_L = C('#9a7044');
const IRON = C('#c4c8d0'), IRON_D = C('#6e737c');
const GUN = C('#3a4048'), GUN_L = C('#5e6670');
const BRASS = C('#c89a3a'), BRASS_D = C('#8a6420');
const STRING = C('#dcd8cc'), LEATHER = C('#6a4024'), FEATHER = C('#ece8e0');
const HEADS = { flint_spear: [C('#55555e'), C('#2e2e34')], iron_spear: [C('#d4d6dc'), C('#8a8e96')] };

// ---------------------------------------------------------------- hand tools
// Tool frame: the grip is at the origin, the handle runs up +Y, the striking side of the head faces -Z.
// Built in "pixels" (P = 1/32 m), so a pickaxe is about half a metre long.
const P = 1 / 32;
const TOOL_CACHE = new Map();
const LEATHER_D = C('#4a2c16');
export function toolModel(it) {
  if (!it || !it.tool) return null;
  const type = it.tool.type;
  if (!['pickaxe', 'axe', 'shovel', 'hoe', 'sword', 'dagger', 'mace'].includes(type)) return null;
  const key = it.name;
  if (TOOL_CACHE.has(key)) return TOOL_CACHE.get(key);
  const pal = (PAL[it.pal] || PAL.iron).map(C);
  const glow = it.glow ? 1.6 : 0;
  const out = [];
  out.isTool = true;
  // head colours: main, shade, edge highlight
  const H0 = pal[2], H1 = pal[1], H2 = pal[3];
  const A = (x0, y0, z0, x1, y1, z1, c, p = PAT.metal, c2 = c, e = 0) => out.push({ t: 0, a: [x0 * P, y0 * P, z0 * P], b: [x1 * P, y1 * P, z1 * P], c, p, c2, e });
  const handle = (y0, y1) => {
    A(-0.6, y0, -0.6, 0.6, y1, 0.6, WOOD, PAT.bark, WOOD_D);
    A(-0.75, y0 - 0.5, -0.75, 0.75, y0, 0.75, WOOD_D, PAT.bark, WOOD_D);   // butt
  };
  const metal = it.pal === 'wood' ? PAT.bark : it.pal === 'stone' ? PAT.rock : PAT.metal;
  if (type === 'pickaxe') {
    handle(-4.5, 12);
    A(-0.85, 10.6, -0.85, 0.85, 12.3, 0.85, H1, metal, H1);               // collar
    A(-0.9, 11.6, -2.2, 0.9, 14, 2.2, H0, metal, H1, glow);                 // centre of the head
    for (const sz of [-1, 1]) {
      const z = (a, b) => (sz < 0 ? [-b, -a] : [a, b]);
      let [z0, z1] = z(2.2, 4.6); A(-0.8, 11.1, z0, 0.8, 13.4, z1, H0, metal, H1, glow);
      [z0, z1] = z(4.6, 6.7); A(-0.7, 10.3, z0, 0.7, 12.4, z1, H0, metal, H1, glow);
      [z0, z1] = z(6.7, 8); A(-0.55, 9.4, z0, 0.55, 11.2, z1, H2, metal, H0, glow);   // sharpened points
    }
  } else if (type === 'axe') {
    handle(-4.5, 13.5);
    A(-0.9, 9.6, -1.3, 0.9, 13.6, 1.3, H1, metal, H1, glow);                // socket around the handle
    A(-0.75, 10.3, 1.3, 0.75, 12.9, 2.7, H1, metal, H1, glow);              // poll (back)
    A(-0.6, 9.9, -3.4, 0.6, 13.3, -1.3, H0, metal, H1, glow);               // cheek
    A(-0.55, 8.6, -5.2, 0.55, 14.6, -3.4, H0, metal, H1, glow);             // flared bit
    A(-0.4, 8.8, -5.9, 0.4, 14.4, -5.2, H2, metal, H2, glow);               // honed edge
  } else if (type === 'shovel') {
    handle(-4.5, 11);
    A(-0.75, 10.4, -0.75, 0.75, 12.2, 0.75, H1, metal, H1, glow);           // neck
    A(-2.3, 12, -0.4, 2.3, 17, 0.4, H0, metal, H1, glow);                   // blade
    A(-1.6, 17, -0.35, 1.6, 18, 0.35, H2, metal, H0, glow);                 // rounded, honed tip
  } else if (type === 'hoe') {
    handle(-4.5, 13.6);
    A(-0.85, 12, -1, 0.85, 14.2, 1, H1, metal, H1, glow);                   // socket
    A(-0.5, 12.7, -5.6, 0.5, 14.1, -1, H0, metal, H1, glow);                // blade arm
    A(-0.45, 10.8, -6.8, 0.45, 14.1, -5.6, H2, metal, H0, glow);            // hooked edge
  } else if (type === 'sword' || type === 'dagger') {
    const len = type === 'dagger' ? 8 : 15;
    A(-0.95, -3.8, -0.95, 0.95, -2.6, 0.95, H1, metal, H1, glow);           // pommel
    A(-0.6, -2.6, -0.6, 0.6, 1.4, 0.6, LEATHER, PAT.cloth, LEATHER_D);     // grip
    A(-0.85, 1.4, type === 'dagger' ? -2.2 : -3.3, 0.85, 2.5, type === 'dagger' ? 2.2 : 3.3, H1, metal, H1, glow); // guard
    A(-0.35, 2.5, -1.25, 0.35, 2.5 + len, 1.25, H0, metal, H2, glow);       // blade
    A(-0.42, 3.1, -0.28, 0.42, 1.5 + len, 0.28, H1, metal, H1, glow);       // fuller
    A(-0.3, 2.5 + len, -0.75, 0.3, 4 + len, 0.75, H2, metal, H0, glow);     // point
  } else if (type === 'mace') {
    handle(-4.5, 10);
    A(-0.8, 9.4, -0.8, 0.8, 10.4, 0.8, H1, metal, H1, glow);
    A(-2.1, 10.2, -2.1, 2.1, 14.6, 2.1, H0, metal, H1, glow);               // head
    for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) A(x ? (x > 0 ? 2.1 : -3.2) : -0.45, 10.8, z ? (z > 0 ? 2.1 : -3.2) : -0.45, x ? (x > 0 ? 3.2 : -2.1) : 0.45, 14, z ? (z > 0 ? 3.2 : -2.1) : 0.45, H2, metal, H0, glow); // flanges
    A(-0.6, 14.6, -0.6, 0.6, 16, 0.6, H2, metal, H0, glow);                 // crown spike
  }
  TOOL_CACHE.set(key, out);
  return out;
}

// ---------------------------------------------------------------- off-hand friendly models
// Shield: face towards -Z, held by a grip at the origin. Torch/lantern: like tools, grip at the origin, up +Y.
const SHIELD_W = C('#8a6038'), SHIELD_W2 = C('#6e4a2a'), RIM = C('#9ea2aa'), RIM_D = C('#5e626a');
export function shieldModel() {
  const out = []; out.isShield = true;
  const A = (x0, y0, z0, x1, y1, z1, c, p = PAT.bark, c2 = c) => out.push({ t: 0, a: [x0, y0, z0], b: [x1, y1, z1], c, p, c2 });
  A(-0.17, -0.2, -0.05, 0.17, 0.24, -0.02, SHIELD_W, PAT.bark, SHIELD_W2);       // boards
  A(-0.14, -0.27, -0.05, 0.14, -0.2, -0.02, SHIELD_W, PAT.bark, SHIELD_W2);      // tapered foot
  A(-0.09, -0.32, -0.05, 0.09, -0.27, -0.02, SHIELD_W, PAT.bark, SHIELD_W2);
  A(-0.18, 0.22, -0.056, 0.18, 0.26, -0.014, RIM, PAT.metal, RIM_D);              // iron rim
  A(-0.185, -0.2, -0.056, -0.155, 0.24, -0.014, RIM, PAT.metal, RIM_D);
  A(0.155, -0.2, -0.056, 0.185, 0.24, -0.014, RIM, PAT.metal, RIM_D);
  A(-0.05, -0.02, -0.075, 0.05, 0.08, -0.05, RIM, PAT.metal, RIM_D);              // boss
  A(-0.02, -0.06, -0.02, 0.02, 0.1, 0.01, WOOD_D, PAT.bark);                      // grip
  return out;
}
const FLAME = C('#ffcc55'), FLAME2 = C('#ff7a1a'), COAL = C('#3a2a1a');
function lightModel(it) {
  const out = []; out.isTool = true; out.upright = true;
  const A = (x0, y0, z0, x1, y1, z1, c, p = PAT.noise, c2 = c, e = 0) => out.push({ t: 0, a: [x0 * P, y0 * P, z0 * P], b: [x1 * P, y1 * P, z1 * P], c, p, c2, e });
  if (it.name.includes('lantern')) {
    const glass = it.name === 'glow_lantern' ? C('#9ad8ff') : C('#ffb04a');
    A(-0.5, -2, -0.5, 0.5, 3, 0.5, IRON_D, PAT.metal);                         // handle bar in the fist
    A(-2.4, 3, -2.4, 2.4, 3.8, 2.4, IRON_D, PAT.metal);                       // lid
    A(-2, 3.8, -2, 2, 4.4, 2, IRON_D, PAT.metal);
    A(-2.4, -3.2, -2.4, 2.4, -2.4, 2.4, IRON_D, PAT.metal);                   // base
    A(-2, -2.4, -2, 2, 3, 2, glass, PAT.glow, glass, 2.8);                     // glowing glass
    for (const [x, z] of [[-2.4, -2.4], [1.8, -2.4], [-2.4, 1.8], [1.8, 1.8]]) A(x, -2.4, z, x + 0.6, 3, z + 0.6, IRON_D, PAT.metal);
    out.upright = true; out.hang = true;
    return out;
  }
  A(-0.55, -5, -0.55, 0.55, 6, 0.55, WOOD, PAT.bark, WOOD_D);                 // stick
  A(-0.75, 5.6, -0.75, 0.75, 7, 0.75, COAL, PAT.noise, COAL, 1.2);           // coal head
  A(-0.6, 7, -0.6, 0.6, 8.4, 0.6, FLAME2, PAT.glow, FLAME2, 3.2);             // flame
  A(-0.35, 8.4, -0.35, 0.35, 9.4, 0.35, FLAME, PAT.glow, FLAME, 3.8);
  return out;
}

// st: { load: 0..1 crank/load progress, loaded: bool }
export function heldModel(it, st = {}) {
  if (!it) return null;
  if (it.block >= 0 && (it.name.endsWith('torch') || it.name.endsWith('lantern'))) return lightModel(it);
  if (!it.tool) return null;
  if (it.tool.type === 'shield') return shieldModel();
  const tm = toolModel(it);
  if (tm) return tm;
  const out = [];
  const A = (x0, y0, z0, x1, y1, z1, c, p = PAT.noise, c2 = c) => out.push({ t: 0, a: [x0, y0, z0], b: [x1, y1, z1], c, p, c2 });
  const L = (p0, p1, w, h, c, p = PAT.noise, c2 = c) => out.push({ t: 1, p0, p1, w, h, c, p, c2 });
  const type = it.tool.type;
  if (type === 'crossbow') {
    A(-0.024, 0.02, -0.40, 0.024, 0.06, 0.10, WOOD, PAT.bark, WOOD_D);       // stock
    A(-0.009, 0.06, -0.40, 0.009, 0.066, -0.03, WOOD_D);                     // bolt groove
    A(-0.03, -0.035, 0.06, 0.03, 0.06, 0.22, WOOD_D, PAT.bark, WOOD);        // butt
    A(-0.018, -0.07, -0.02, 0.018, 0.02, 0.05, WOOD);                        // grip
    A(-0.006, -0.04, -0.06, 0.006, 0.02, -0.035, IRON_D, PAT.metal);          // trigger
    A(-0.032, 0.012, -0.44, 0.032, 0.068, -0.39, IRON, PAT.metal, IRON_D);   // front cap
    A(-0.03, 0.055, -0.08, 0.03, 0.075, -0.03, IRON_D, PAT.metal);            // latch
    const tipL = [-0.21, 0.045, -0.35], tipR = [0.21, 0.045, -0.35];
    L([0, 0.045, -0.415], [-0.11, 0.045, -0.395], 0.024, 0.032, WOOD_L, PAT.bark, WOOD);
    L([-0.11, 0.045, -0.395], tipL, 0.02, 0.028, WOOD_L, PAT.bark, WOOD);
    L([0, 0.045, -0.415], [0.11, 0.045, -0.395], 0.024, 0.032, WOOD_L, PAT.bark, WOOD);
    L([0.11, 0.045, -0.395], tipR, 0.02, 0.028, WOOD_L, PAT.bark, WOOD);
    A(tipL[0] - 0.012, 0.03, tipL[2] - 0.012, tipL[0] + 0.012, 0.06, tipL[2] + 0.012, IRON, PAT.metal);
    A(tipR[0] - 0.012, 0.03, tipR[2] - 0.012, tipR[0] + 0.012, 0.06, tipR[2] + 0.012, IRON, PAT.metal);
    const pull = st.loaded ? 1 : (st.load || 0);
    const nock = [0, 0.066, -0.34 + 0.27 * pull];
    L(tipL, nock, 0.006, 0.006, STRING, PAT.flat);
    L(tipR, nock, 0.006, 0.006, STRING, PAT.flat);
    if (st.loaded) {
      L([0, 0.074, -0.07], [0, 0.074, -0.45], 0.012, 0.012, WOOD_L, PAT.flat, WOOD);
      L([0, 0.074, -0.45], [0, 0.074, -0.5], 0.022, 0.006, IRON, PAT.metal);
      L([0, 0.074, -0.07], [0, 0.074, -0.12], 0.03, 0.004, FEATHER, PAT.flat);
    }
    return out;
  }
  if (type === 'gun' && it.tool.gun === 'launcher') {
    const TUBE = C('#4a5058'), TUBE_L = C('#6a727c'), RED = C('#c8382c'), RED_D = C('#8a2018');
    A(-0.055, 0.03, -0.62, 0.055, 0.14, 0.08, TUBE, PAT.metal, TUBE_L);          // fat tube
    for (const z of [-0.6, -0.34, -0.06]) A(-0.064, 0.021, z - 0.035, 0.064, 0.149, z, BRASS, PAT.metal, BRASS_D);   // bands
    A(-0.047, 0.038, -0.632, 0.047, 0.132, -0.615, GUN, PAT.metal);               // dark bore
    if (st.loaded) {
      A(-0.044, 0.041, -0.67, 0.044, 0.129, -0.6, RED, PAT.cloth, RED_D);         // the charge, nose out
      A(-0.045, 0.07, -0.674, 0.045, 0.1, -0.6, C('#e8e0c8'), PAT.cloth);         // its paper band
      L([0, 0.085, -0.67], [0, 0.11, -0.71], 0.006, 0.006, STRING, PAT.flat);      // fuse
    }
    A(-0.06, 0.025, 0.08, 0.06, 0.145, 0.12, BRASS, PAT.metal, BRASS_D);         // breech cap
    A(-0.01, 0.14, -0.2, 0.01, 0.175, -0.16, GUN_L, PAT.metal);                  // sight
    A(-0.008, 0.14, -0.58, 0.008, 0.165, -0.56, GUN_L, PAT.metal);
    L([0, 0.035, -0.02], [0, -0.1, 0.04], 0.04, 0.055, WOOD, PAT.bark, WOOD_D);  // grip
    A(-0.03, -0.04, -0.3, 0.03, 0.035, -0.22, WOOD, PAT.bark, WOOD_D);           // fore-grip
    L([0, 0.06, 0.1], [0, -0.03, 0.36], 0.05, 0.08, WOOD, PAT.bark, WOOD_D);     // shoulder stock
    A(-0.004, 0.0, -0.075, 0.004, 0.03, -0.06, GUN_L, PAT.metal);                // trigger
    return out;
  }
  if (type === 'gun' && it.tool.gun === 'pistol') {
    A(-0.017, 0.05, -0.36, 0.017, 0.084, 0.0, GUN, PAT.metal, GUN_L);       // barrel
    A(-0.021, 0.046, -0.378, 0.021, 0.088, -0.35, BRASS, PAT.metal, BRASS_D); // muzzle ring
    A(-0.02, 0.026, -0.25, 0.02, 0.056, 0.02, WOOD, PAT.bark, WOOD_D);       // forestock
    A(0.017, 0.034, -0.045, 0.026, 0.078, 0.045, BRASS, PAT.metal, BRASS_D); // lock plate
    L([0.004, 0.072, 0.025], [0.004, 0.112, 0.045], 0.012, 0.016, GUN_L, PAT.metal);  // hammer
    A(-0.008, 0.082, -0.03, 0.008, 0.104, -0.008, GUN_L, PAT.metal);         // frizzen
    L([0, 0.045, 0.0], [0, -0.1, 0.075], 0.036, 0.05, WOOD, PAT.bark, WOOD_D); // grip
    L([0, -0.088, 0.07], [0, -0.118, 0.084], 0.044, 0.058, BRASS, PAT.metal, BRASS_D); // butt cap
    A(-0.004, 0.0, -0.065, 0.004, 0.012, -0.005, BRASS, PAT.metal);           // trigger guard
    A(-0.003, 0.008, -0.034, 0.003, 0.03, -0.024, GUN, PAT.metal);            // trigger
    return out;
  }
  if (type === 'gun') {
    A(-0.022, 0.05, -0.58, 0.022, 0.094, 0.02, BRASS, PAT.metal, BRASS_D);  // barrel
    A(-0.03, 0.042, -0.62, 0.03, 0.102, -0.578, BRASS, PAT.metal, BRASS_D); // flare
    A(-0.04, 0.032, -0.652, 0.04, 0.112, -0.618, BRASS, PAT.metal, BRASS_D);
    A(-0.026, 0.02, -0.42, 0.026, 0.056, 0.03, WOOD, PAT.bark, WOOD_D);      // forestock
    A(0.022, 0.03, -0.03, 0.031, 0.082, 0.06, GUN, PAT.metal, GUN_L);        // lock
    L([0.004, 0.08, 0.03], [0.004, 0.122, 0.052], 0.013, 0.018, GUN_L, PAT.metal);
    L([0, 0.045, 0.02], [0, -0.07, 0.38], 0.046, 0.075, WOOD, PAT.bark, WOOD_D); // shoulder stock
    A(-0.004, -0.002, -0.07, 0.004, 0.012, 0.0, GUN_L, PAT.metal);
    A(-0.003, 0.006, -0.04, 0.003, 0.028, -0.03, GUN, PAT.metal);
    return out;
  }
  if (type === 'spear') {
    const [h, h2] = HEADS[it.name] || HEADS.iron_spear;
    L([0, 0, 0.3], [0, 0, -0.86], 0.03, 0.03, WOOD_L, PAT.bark, WOOD);       // shaft
    A(-0.021, -0.021, -0.9, 0.021, 0.021, -0.83, LEATHER, PAT.cloth);        // binding
    A(-0.021, -0.021, -0.05, 0.021, 0.021, 0.05, LEATHER, PAT.cloth);        // hand wrap
    L([0, 0, -0.86], [0, 0, -1.2], 0.09, 0.016, h, PAT.metal, h2);           // leaf blade
    L([0, 0, -0.86], [0, 0, -1.14], 0.016, 0.07, h, PAT.metal, h2);
    L([0, 0, -1.18], [0, 0, -1.26], 0.03, 0.012, h, PAT.metal, h2);          // tip
    A(-0.018, -0.018, 0.3, 0.018, 0.018, 0.33, IRON_D, PAT.metal);            // butt cap
    return out;
  }
  return null;
}

// Push a held model's boxes. H = view-space hand matrix, invView converts view -> camera-relative world.
export function pushHeldModel(er, boxes, H, invView, light) {
  const tmp = mat4.create();
  for (const b of boxes) {
    const M = mat4.create();
    if (b.t === 0) {
      M.set(H);
      mat4.translate(M, M, b.a[0], b.a[1], b.a[2]);
      const sx = b.b[0] - b.a[0], sy = b.b[1] - b.a[1], sz = b.b[2] - b.a[2];
      mat4.scale(M, M, sx, sy, sz);
      er.pushBox(mat4.multiply(tmp, invView, M).slice(), b.c, b.p, b.c2, 0, sx * 16, sy * 16, sz * 16, 3, b.e ? [light[0], light[1], light[2], Math.max(light[3] || 0, b.e)] : light);
    } else {
      const dx = b.p1[0] - b.p0[0], dy = b.p1[1] - b.p0[1], dz = b.p1[2] - b.p0[2];
      const len = Math.hypot(dx, dy, dz) || 1;
      // side axis (horizontal, perpendicular to the bar) and up axis
      let sxv = -dz, syv = 0, szv = dx; let sl = Math.hypot(sxv, syv, szv);
      if (sl < 1e-5) { sxv = 1; syv = 0; szv = 0; sl = 1; }
      sxv /= sl; syv /= sl; szv /= sl;
      const ux = (dy * szv - dz * syv) / len, uy = (dz * sxv - dx * szv) / len, uz = (dx * syv - dy * sxv) / len;
      const L = mat4.create();
      L[0] = sxv * b.w; L[1] = syv * b.w; L[2] = szv * b.w;
      L[4] = ux * b.h; L[5] = uy * b.h; L[6] = uz * b.h;
      L[8] = dx; L[9] = dy; L[10] = dz;
      L[12] = b.p0[0] - (sxv * b.w + ux * b.h) / 2; L[13] = b.p0[1] - (syv * b.w + uy * b.h) / 2; L[14] = b.p0[2] - (szv * b.w + uz * b.h) / 2;
      mat4.multiply(M, H, L);
      er.pushBox(mat4.multiply(tmp, invView, M).slice(), b.c, b.p, b.c2, 0, b.w * 16, b.h * 16, len * 16, 3, b.e ? [light[0], light[1], light[2], Math.max(light[3] || 0, b.e)] : light);
    }
  }
}
