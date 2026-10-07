// Chunk mesher. Input is a padded 18x18xH copy of a chunk + its border (blocks, meta, light, tints).
// Vertex format (20 bytes):
//  0: int16 x,y,z (1/128 block, chunk-relative), int16 w = normal(0..6) | wave<<3 | movable<<5
//  8: uint8 u,v (1/32 tex units), uint16 layer
// 12: uint8 sky(0..255), block(0..255), ao(0..3), emissive
// 16: uint8 r,g,b tint, material (low 3 bits) | reflect<<3
import { HEIGHT } from './constants.js';
import {
  BLOCKS, B, SHAPE, LAYER, TINT, IS_OPAQUE, BLOCK_SHAPE, BLOCK_LAYER, IS_LIQUID, IS_WATERLOGGED,
  BLOCK_FACE_TEX, BLOCK_FRONT_TEX, BLOCK_LIT_TEX, texLayer, rotateBox,
} from './blocks.js';
import { BIRCH_TINT, PINE_TINT } from './biomes.js';

export const VERTEX_BYTES = 20;
const PW = 18, PA = 18 * 18;
const PS = 128; // position scale
const US = 32;  // uv scale

class VBuf {
  constructor(cap) { this.alloc(cap); this.n = 0; }
  alloc(cap) {
    const old = this.u8;
    this.cap = cap;
    this.buf = new ArrayBuffer(cap * VERTEX_BYTES);
    this.u8 = new Uint8Array(this.buf);
    this.i16 = new Int16Array(this.buf);
    this.u16 = new Uint16Array(this.buf);
    if (old) this.u8.set(old);
  }
  ensure(k) { if (this.n + k > this.cap) this.alloc(Math.max(this.cap * 2, this.n + k)); }
  v(px, py, pz, w, u, vv, layer, sky, blk, ao, emis, r, g, b, mat) {
    const o = this.n * VERTEX_BYTES;
    const h = o >> 1;
    this.i16[h] = px; this.i16[h + 1] = py; this.i16[h + 2] = pz; this.i16[h + 3] = w;
    const u8 = this.u8;
    u8[o + 8] = u; u8[o + 9] = vv; this.u16[h + 5] = layer;
    u8[o + 12] = sky; u8[o + 13] = blk; u8[o + 14] = ao; u8[o + 15] = emis;
    u8[o + 16] = r; u8[o + 17] = g; u8[o + 18] = b; u8[o + 19] = mat;
    this.n++;
  }
  result() { return this.buf.slice(0, this.n * VERTEX_BYTES); }
}

// face templates: corners (CCW from outside) in unit cube
const FACE_CORNERS = [
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], // +X
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], // -X
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], // +Y
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], // -Y
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], // +Z
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], // -Z
];
const FACE_N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const FACE_AXIS = [0, 0, 1, 1, 2, 2];
// tangent axes for AO per face
const FACE_T = [[1, 2], [1, 2], [0, 2], [0, 2], [0, 1], [0, 1]];
// uv from local position per face (texture space, v=0 top)
function faceUV(f, x, y, z) {
  switch (f) {
    case 0: return [1 - z, 1 - y];
    case 1: return [z, 1 - y];
    case 2: return [x, z];
    case 3: return [x, z];
    case 4: return [x, 1 - y];
    default: return [1 - x, 1 - y];
  }
}

const L_DESTROY = texLayer('destroy_0'); void L_DESTROY;
const WHEAT_TEX = [texLayer('wheat_0'), texLayer('wheat_1'), texLayer('wheat_2'), texLayer('wheat_3')];
const CARROT_TEX = [texLayer('carrots_0'), texLayer('carrots_1'), texLayer('carrots_2'), texLayer('carrots_3')];
const DOOR_TOP = texLayer('door_top'), DOOR_BOTTOM = texLayer('door_bottom');
const BED_HEAD = texLayer('bed_head_top'), BED_FOOT = texLayer('bed_foot_top'), BED_SIDE = texLayer('bed_side'), BED_END = texLayer('bed_end');
const PLANKS_OAK = texLayer('oak_planks');

// per-block precomputed render props
const NB = BLOCKS.length;
const B_EMIS = new Uint8Array(NB), B_MAT = new Uint8Array(NB), B_WAVE = new Uint8Array(NB), B_TINT = new Uint8Array(NB), B_LEAVES = new Uint8Array(NB);
for (const b of BLOCKS) {
  B_EMIS[b.id] = Math.min(127, Math.round(b.emissive * 60)) | (b.emissiveMode ? 128 : 0);
  let mat = b.material || 0;
  if (b.name.endsWith('_leaves')) { mat = 5; B_LEAVES[b.id] = 1; }
  else if (b.shape === SHAPE.CROSS || b.shape === SHAPE.CROP || b.shape === SHAPE.WATER_PLANT) mat = mat || 6;
  B_MAT[b.id] = (mat & 7) | (Math.min(31, Math.round((b.reflect || 0) * 31)) << 3);
  B_WAVE[b.id] = b.wave;
  B_TINT[b.id] = b.tint;
}

export function meshChunk(pb, pm, pl, ptint) {
  const opq = new VBuf(16384);
  const trn = new VBuf(4096);
  let minY = HEIGHT, maxY = 0;

  const P = (x, y, z) => y * PA + (z + 1) * PW + (x + 1);

  // --- helpers capturing current block ---
  let cur = 0, cx = 0, cy = 0, cz = 0, cmeta = 0;

  const isWaterCell = (id) => IS_LIQUID[id] === 1 || IS_WATERLOGGED[id] === 1;

  function tintFor(kind, x, z, f) {
    if (kind === TINT.NONE) return [255, 255, 255];
    if (kind === TINT.BIRCH) return [BIRCH_TINT[0] * 255, BIRCH_TINT[1] * 255, BIRCH_TINT[2] * 255];
    if (kind === TINT.PINE) return [PINE_TINT[0] * 255, PINE_TINT[1] * 255, PINE_TINT[2] * 255];
    const o = kind === TINT.GRASS ? 0 : kind === TINT.FOLIAGE ? 3 : 6;
    // average 3x3 columns for smooth biome blending
    let r = 0, g = 0, b = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const i = ((z + dz + 1) * PW + (x + dx + 1)) * 9 + o;
      r += ptint[i]; g += ptint[i + 1]; b += ptint[i + 2];
    }
    void f;
    return [r / 9, g / 9, b / 9];
  }

  // smooth light & AO for a face corner. (bx,by,bz) = front cell, t1/t2 tangent offsets.
  const cornerOut = [0, 0, 0];
  function cornerLight(fx, fy, fz, a1, d1, a2, d2, doAO) {
    const o1 = [0, 0, 0]; o1[a1] = d1;
    const o2 = [0, 0, 0]; o2[a2] = d2;
    const yf = fy;
    if (yf < 0 || yf >= HEIGHT) { cornerOut[0] = 255; cornerOut[1] = 0; cornerOut[2] = 3; return cornerOut; }
    const ifr = P(fx, fy, fz);
    const s1y = fy + o1[1], s2y = fy + o2[1], cy2 = fy + o1[1] + o2[1];
    const okY = (y) => y >= 0 && y < HEIGHT;
    const i1 = okY(s1y) ? P(fx + o1[0], s1y, fz + o1[2]) : -1;
    const i2 = okY(s2y) ? P(fx + o2[0], s2y, fz + o2[2]) : -1;
    const ic = okY(cy2) ? P(fx + o1[0] + o2[0], cy2, fz + o1[2] + o2[2]) : -1;
    const op1 = i1 >= 0 ? IS_OPAQUE[pb[i1]] : 0;
    const op2 = i2 >= 0 ? IS_OPAQUE[pb[i2]] : 0;
    const opc = ic >= 0 ? IS_OPAQUE[pb[ic]] : 0;
    let ao = 3;
    if (doAO) ao = (op1 && op2) ? 0 : 3 - (op1 + op2 + opc);
    let ss = pl[ifr] >> 4, bs = pl[ifr] & 15, n = 1;
    if (!op1 && i1 >= 0) { ss += pl[i1] >> 4; bs += pl[i1] & 15; n++; }
    if (!op2 && i2 >= 0) { ss += pl[i2] >> 4; bs += pl[i2] & 15; n++; }
    if (!opc && ic >= 0 && !(op1 && op2)) { ss += pl[ic] >> 4; bs += pl[ic] & 15; n++; }
    cornerOut[0] = Math.round(ss / n / 15 * 255);
    cornerOut[1] = Math.round(bs / n / 15 * 255);
    cornerOut[2] = ao;
    return cornerOut;
  }

  function ownLight(x, y, z) {
    const i = P(x, y, z);
    return [Math.round((pl[i] >> 4) / 15 * 255), Math.round((pl[i] & 15) / 15 * 255)];
  }

  // Emit an axis-aligned box face. lo/hi in block-local units. rot: rotate uv 90deg.
  const tmpL = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
  function boxFace(vb, f, lo, hi, layer, tint, wave, emis, mat, opts) {
    const n = FACE_N[f];
    const ax = FACE_AXIS[f];
    const onBoundary = n[ax] > 0 ? hi[ax] >= 1 : lo[ax] <= 0;
    // front cell for lighting
    let fx = cx, fy = cy, fz = cz;
    if (onBoundary || (opts && opts.frontLight)) { fx += n[0]; fy += n[1]; fz += n[2]; }
    const corners = FACE_CORNERS[f];
    const [ta, tb] = FACE_T[f];
    const doAO = onBoundary && !(opts && opts.noAO);
    let aoSum02 = 0, aoSum13 = 0;
    for (let k = 0; k < 4; k++) {
      const c = corners[k];
      if (fy < 0 || fy >= HEIGHT) { tmpL[k][0] = 255; tmpL[k][1] = 0; tmpL[k][2] = 3; }
      else if (onBoundary || (opts && opts.frontLight)) {
        const r = cornerLight(fx, fy, fz, ta, c[ta] ? 1 : -1, tb, c[tb] ? 1 : -1, doAO);
        tmpL[k][0] = r[0]; tmpL[k][1] = r[1]; tmpL[k][2] = r[2];
      } else {
        const ol = ownLight(cx, cy, cz);
        tmpL[k][0] = ol[0]; tmpL[k][1] = ol[1]; tmpL[k][2] = 3;
      }
    }
    aoSum02 = tmpL[0][2] + tmpL[2][2]; aoSum13 = tmpL[1][2] + tmpL[3][2];
    const flip = aoSum02 < aoSum13;
    vb.ensure(4);
    const w = f | (wave << 3);
    for (let kk = 0; kk < 4; kk++) {
      const k = flip ? (kk + 1) & 3 : kk;
      const c = corners[k];
      const lx = c[0] ? hi[0] : lo[0], ly = c[1] ? hi[1] : lo[1], lz = c[2] ? hi[2] : lo[2];
      let [u, v] = faceUV(f, lx, ly, lz);
      if (opts && opts.rot) { const t = u; u = v; v = 1 - t; }
      if (opts && opts.uvOff) { u = u * opts.uvOff[2] + opts.uvOff[0]; v = v * opts.uvOff[3] + opts.uvOff[1]; }
      let px = cx + lx, py = cy + ly, pz = cz + lz;
      if (opts && opts.xf) { const p = opts.xf(lx, ly, lz); px = cx + p[0]; py = cy + p[1]; pz = cz + p[2]; }
      const movable = wave === 1 || (wave === 2 && ly > 0.01) ? 32 : 0;
      vb.v(Math.round(px * PS), Math.round(py * PS), Math.round(pz * PS), w | movable,
        Math.round(u * US), Math.round(v * US), layer, tmpL[k][0], tmpL[k][1], tmpL[k][2], emis, tint[0], tint[1], tint[2], mat);
    }
  }

  function faceVisible(f, lo, hi) {
    const n = FACE_N[f];
    const ax = FACE_AXIS[f];
    const onBoundary = n[ax] > 0 ? hi[ax] >= 1 : lo[ax] <= 0;
    if (!onBoundary) return true;
    const ny = cy + n[1];
    if (ny < 0) return false;
    if (ny >= HEIGHT) return true;
    const nb = pb[P(cx + n[0], ny, cz + n[2])];
    return !IS_OPAQUE[nb];
  }

  function box(vb, lo, hi, texs, tint, wave, emis, mat, opts, faceMask = 63) {
    for (let f = 0; f < 6; f++) {
      if (!(faceMask & (1 << f))) continue;
      if (!(opts && opts.noCull) && !faceVisible(f, lo, hi)) continue;
      const t = typeof texs === 'number' ? texs : texs[f];
      if (t < 0) continue;
      boxFace(vb, f, lo, hi, t, Array.isArray(tint[0]) ? tint[f] : tint, wave, emis, mat, opts);
    }
  }

  // raw quad with explicit positions (block-local), uv (0..1), normal index
  function quad(vb, pts, uvs, nIdx, layer, light, tint, wave, emis, mat) {
    vb.ensure(4);
    for (let k = 0; k < 4; k++) {
      const p = pts[k];
      const movable = wave === 1 || (wave === 2 && p[1] > 0.01) ? 32 : 0;
      vb.v(Math.round((cx + p[0]) * PS), Math.round((cy + p[1]) * PS), Math.round((cz + p[2]) * PS), nIdx | (wave << 3) | movable,
        Math.round(uvs[k][0] * US), Math.round(uvs[k][1] * US), layer, light[0], light[1], 3, emis, tint[0], tint[1], tint[2], mat);
    }
  }
  const UVQ = [[0, 1], [1, 1], [1, 0], [0, 0]];
  function crossQuads(vb, layer, light, tint, wave, emis, mat, jitter, scale = 1, height = 1, yoff = 0) {
    let ox = 0, oz = 0;
    if (jitter) {
      let h = (cx * 3129871) ^ (cz * 116129781) ^ (cy * 4211);
      h = (h * h * 42317861 + h * 11) | 0;
      ox = (((h >> 16) & 15) / 15 - 0.5) * 0.35;
      oz = (((h >> 20) & 15) / 15 - 0.5) * 0.35;
    }
    const a = 0.5 - 0.5 * scale * 0.98, b2 = 0.5 + 0.5 * scale * 0.98;
    const P1 = [[a + ox, yoff, a + oz], [b2 + ox, yoff, b2 + oz], [b2 + ox, yoff + height, b2 + oz], [a + ox, yoff + height, a + oz]];
    const P2 = [[b2 + ox, yoff, a + oz], [a + ox, yoff, b2 + oz], [a + ox, yoff + height, b2 + oz], [b2 + ox, yoff + height, a + oz]];
    for (const pts of [P1, P2]) {
      quad(vb, pts, UVQ, 6, layer, light, tint, wave, emis, mat);
      quad(vb, [pts[1], pts[0], pts[3], pts[2]], [UVQ[0], UVQ[1], UVQ[2], UVQ[3]], 6, layer, light, tint, wave, emis, mat);
    }
  }

  function liquidHeightAt(x, y, z, kind) {
    // returns height for a corner (x,z) in cell-corner coordinates using the 4 surrounding cells
    let total = 0, count = 0;
    for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) {
      const qx = x + dx, qz = z + dz;
      if (qx < -1 || qx > 16 || qz < -1 || qz > 16) continue;
      const i = P(qx, y, qz);
      const id = pb[i];
      const isL = kind === 1 ? isWaterCell(id) : IS_LIQUID[id] === 2;
      if (isL) {
        if (y + 1 < HEIGHT) {
          const above = pb[i + PA];
          if (kind === 1 ? isWaterCell(above) : IS_LIQUID[above] === 2) return 1;
        }
        const m = IS_WATERLOGGED[id] ? 0 : pm[i];
        const lvl = m & 8 ? 0 : m & 7;
        const h = (8 - lvl) / 9;
        const w = lvl === 0 ? 10 : 1;
        total += h * w; count += w;
      } else if (!IS_OPAQUE[id] && !(BLOCKS[id].solid && BLOCK_SHAPE[id] !== SHAPE.CROSS)) {
        count += 1;
      }
    }
    return count ? total / count : 0.889;
  }

  function meshLiquid(kind) {
    const vb = kind === 1 ? trn : opq;
    const layer = kind === 1 ? texLayer('water') : texLayer('lava');
    const mat = kind === 1 ? 1 : 2;
    const tint = kind === 1 ? tintFor(TINT.WATER, cx, cz) : [255, 255, 255];
    const emis = kind === 2 ? B_EMIS[B.lava] : 0;
    const same = (id) => kind === 1 ? isWaterCell(id) : IS_LIQUID[id] === 2;
    const aboveId = cy + 1 < HEIGHT ? pb[P(cx, cy + 1, cz)] : 0;
    const full = same(aboveId);
    let h00, h10, h11, h01;
    if (full) h00 = h10 = h11 = h01 = 1;
    else {
      h00 = liquidHeightAt(cx, cy, cz, kind);
      h10 = liquidHeightAt(cx + 1, cy, cz, kind);
      h11 = liquidHeightAt(cx + 1, cy, cz + 1, kind);
      h01 = liquidHeightAt(cx, cy, cz + 1, kind);
    }
    const lit = ownLight(cx, cy, cz);
    // top
    if (!full && !IS_OPAQUE[aboveId] && aboveId !== B.ice) {
      const L = cy + 1 < HEIGHT ? ownLight(cx, cy + 1, cz) : [255, 0];
      const Lm = [Math.max(L[0], lit[0]), Math.max(L[1], lit[1])];
      quad(vb, [[0, h01, 1], [1, h11, 1], [1, h10, 0], [0, h00, 0]], [[0, 1], [1, 1], [1, 0], [0, 0]], 2, layer, Lm, tint, 0, emis, mat);
    }
    // bottom
    if (cy > 0) {
      const below = pb[P(cx, cy - 1, cz)];
      if (!same(below) && !IS_OPAQUE[below]) {
        quad(vb, [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], [[0, 0], [1, 0], [1, 1], [0, 1]], 3, layer, lit, tint, 0, emis, mat);
      }
    }
    // sides
    const sides = [
      [0, 1, 0, [[1, 0, 1], [1, 0, 0], [1, h10, 0], [1, h11, 1]]],
      [1, -1, 0, [[0, 0, 0], [0, 0, 1], [0, h01, 1], [0, h00, 0]]],
      [4, 0, 1, [[0, 0, 1], [1, 0, 1], [1, h11, 1], [0, h01, 1]]],
      [5, 0, -1, [[1, 0, 0], [0, 0, 0], [0, h00, 0], [1, h10, 0]]],
    ];
    for (const [f, dx, dz, pts] of sides) {
      const nid = pb[P(cx + dx, cy, cz + dz)];
      if (same(nid) || IS_OPAQUE[nid] || (kind === 1 && nid === B.ice)) continue;
      const L = ownLight(cx + dx, cy, cz + dz);
      const Lm = [Math.max(L[0], lit[0] * 0.8), Math.max(L[1], lit[1])];
      const uvs = pts.map(p => [f === 0 || f === 5 ? 1 - (p[2] + p[0]) % 2 : (p[0] + p[2]) % 2, 1 - p[1]]);
      quad(vb, pts, uvs, f, layer, Lm, tint, 0, emis, mat);
    }
  }

  for (let y = 0; y < HEIGHT; y++) {
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        const i = P(x, y, z);
        const id = pb[i];
        if (id === 0) continue;
        cur = id; cx = x; cy = y; cz = z; cmeta = pm[i];
        const bd = BLOCKS[id];
        const shape = BLOCK_SHAPE[id];
        const layer = BLOCK_LAYER[id];
        const vb = layer === LAYER.TRANSLUCENT ? trn : opq;
        const emis = B_EMIS[id], mat = B_MAT[id], wave = B_WAVE[id];
        const before = opq.n + trn.n;

        switch (shape) {
          case SHAPE.CUBE: {
            const tint = B_TINT[id] ? tintFor(B_TINT[id], x, z) : [255, 255, 255];
            const isLeaves = B_LEAVES[id];
            let exposed = false;
            if (isLeaves) {
              for (let f = 0; f < 6; f++) {
                const n = FACE_N[f];
                const ny = y + n[1];
                if (ny < 0 || ny >= HEIGHT) { exposed = true; break; }
                const nid = pb[P(x + n[0], ny, z + n[2])];
                if (!IS_OPAQUE[nid] && !B_LEAVES[nid]) { exposed = true; break; }
              }
            }
            const logAxis = bd.log ? (cmeta & 3) : 0;
            const facing = bd.oriented || bd.interact === 'crafting' ? (cmeta & 3) : -1;
            for (let f = 0; f < 6; f++) {
              const n = FACE_N[f];
              const ny = y + n[1];
              if (ny < 0) continue;
              if (ny < HEIGHT) {
                const nid = pb[P(x + n[0], ny, z + n[2])];
                if (IS_OPAQUE[nid]) continue;
                if (nid === id && !isLeaves) continue; // glass/ice/self
                if (isLeaves && B_LEAVES[nid] && !exposed) continue;
              }
              let tex = BLOCK_FACE_TEX[id * 6 + f];
              let rot = false;
              if (logAxis === 1) { // along X
                if (f === 0 || f === 1) tex = BLOCK_FACE_TEX[id * 6 + 2];
                else { tex = BLOCK_FACE_TEX[id * 6 + 0]; rot = true; }
              } else if (logAxis === 2) { // along Z
                if (f === 4 || f === 5) tex = BLOCK_FACE_TEX[id * 6 + 2];
                else { tex = BLOCK_FACE_TEX[id * 6 + 0]; rot = f === 0 || f === 1; }
              }
              if (facing >= 0 && BLOCK_FRONT_TEX[id] >= 0) {
                const frontFace = [5, 0, 4, 1][facing];
                if (f === frontFace) tex = (cmeta & 4) && BLOCK_LIT_TEX[id] >= 0 ? BLOCK_LIT_TEX[id] : BLOCK_FRONT_TEX[id];
              }
              boxFace(vb, f, [0, 0, 0], [1, 1, 1], tex, tint, wave, emis, mat, rot ? { rot } : null);
            }
            break;
          }
          case SHAPE.LIQUID:
            meshLiquid(IS_LIQUID[id]);
            break;
          case SHAPE.CROSS: {
            const tint = B_TINT[id] ? tintFor(B_TINT[id], x, z) : [255, 255, 255];
            const L = ownLight(x, y, z);
            const jitter = id === B.tall_grass || id === B.fern || bd.name.startsWith('flower') || id === B.dead_bush;
            crossQuads(vb, BLOCK_FACE_TEX[id * 6], L, tint, wave, emis, mat, jitter, id === B.berry_bush ? 1.1 : 1);
            break;
          }
          case SHAPE.WATER_PLANT: {
            const L = ownLight(x, y, z);
            crossQuads(opq, BLOCK_FACE_TEX[id * 6], L, [255, 255, 255], wave, emis, mat, true);
            meshLiquid(1);
            break;
          }
          case SHAPE.CROP: {
            const L = ownLight(x, y, z);
            let tex = BLOCK_FACE_TEX[id * 6];
            if (id === B.wheat) tex = WHEAT_TEX[Math.min(3, cmeta >> 1)];
            else if (id === B.carrots) tex = CARROT_TEX[Math.min(3, cmeta >> 1)];
            const T = [255, 255, 255];
            const yb = id === B.fire ? 0 : -1 / 16;
            for (const p of [0.25, 0.75]) {
              const a = [[p, yb, 0], [p, yb, 1], [p, 1 + yb, 1], [p, 1 + yb, 0]];
              const bq = [[0, yb, p], [1, yb, p], [1, 1 + yb, p], [0, 1 + yb, p]];
              for (const pts of [a, bq]) {
                quad(vb, pts, UVQ, 6, tex, L, T, wave, emis, mat);
                quad(vb, [pts[1], pts[0], pts[3], pts[2]], UVQ, 6, tex, L, T, wave, emis, mat);
              }
            }
            break;
          }
          case SHAPE.MODEL: {
            const facing = bd.oriented ? cmeta & 3 : 0;
            const W = B_TINT[id] ? tintFor(B_TINT[id], x, z) : [255, 255, 255];
            for (const m of bd.modelBoxes) {
              const [lo, hi] = rotateBox(m.lo, m.hi, facing);
              const texs = m.tex >= 0 ? m.tex : [0, 1, 2, 3, 4, 5].map(f => BLOCK_FACE_TEX[id * 6 + f]);
              box(vb, lo, hi, texs, W, 0, emis, mat, { noAO: true });
            }
            if (bd.crossTex !== undefined) crossQuads(vb, bd.crossTex, ownLight(x, y, z), [255, 255, 255], 0, emis, mat || 6, false, bd.crossS || 0.9, bd.crossH || 0.85, bd.crossY || 0);
            break;
          }
          case SHAPE.SLAB: {
            const top = cmeta & 1;
            const lo = [0, top ? 0.5 : 0, 0], hi = [1, top ? 1 : 0.5, 1];
            box(vb, lo, hi, BLOCK_FACE_TEX[id * 6], [255, 255, 255], 0, emis, mat, null);
            break;
          }
          case SHAPE.STAIRS: {
            const facing = cmeta & 3, upside = cmeta & 4;
            const tex = BLOCK_FACE_TEX[id * 6];
            const W = [255, 255, 255];
            box(vb, [0, upside ? 0.5 : 0, 0], [1, upside ? 1 : 0.5, 1], tex, W, 0, emis, mat, null);
            let lo, hi;
            const y0 = upside ? 0 : 0.5, y1 = upside ? 0.5 : 1;
            if (facing === 0) { lo = [0, y0, 0]; hi = [1, y1, 0.5]; }
            else if (facing === 1) { lo = [0.5, y0, 0]; hi = [1, y1, 1]; }
            else if (facing === 2) { lo = [0, y0, 0.5]; hi = [1, y1, 1]; }
            else { lo = [0, y0, 0]; hi = [0.5, y1, 1]; }
            box(vb, lo, hi, tex, W, 0, emis, mat, null);
            break;
          }
          case SHAPE.FENCE: {
            const tex = BLOCK_FACE_TEX[id * 6];
            const W = [255, 255, 255];
            box(vb, [6 / 16, 0, 6 / 16], [10 / 16, 1, 10 / 16], tex, W, 0, emis, mat, null);
            const conn = (dx, dz) => {
              const nid = pb[P(x + dx, y, z + dz)];
              return BLOCKS[nid].fence || IS_OPAQUE[nid] || BLOCKS[nid].interact === 'door';
            };
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              if (!conn(dx, dz)) continue;
              for (const [ya, yb] of [[6 / 16, 9 / 16], [12 / 16, 15 / 16]]) {
                let lo, hi;
                if (dx === 1) { lo = [10 / 16, ya, 7 / 16]; hi = [1, yb, 9 / 16]; }
                else if (dx === -1) { lo = [0, ya, 7 / 16]; hi = [6 / 16, yb, 9 / 16]; }
                else if (dz === 1) { lo = [7 / 16, ya, 10 / 16]; hi = [9 / 16, yb, 1]; }
                else { lo = [7 / 16, ya, 0]; hi = [9 / 16, yb, 6 / 16]; }
                box(vb, lo, hi, tex, W, 0, emis, mat, null);
              }
            }
            break;
          }
          case SHAPE.DOOR: {
            const facing = cmeta & 3, open = (cmeta >> 2) & 1, topHalf = (cmeta >> 3) & 1;
            const tex = topHalf ? DOOR_TOP : DOOR_BOTTOM;
            const side = open ? (facing + 1) & 3 : facing;
            const t = 3 / 16;
            let lo, hi;
            if (side === 0) { lo = [0, 0, 0]; hi = [1, 1, t]; }
            else if (side === 1) { lo = [1 - t, 0, 0]; hi = [1, 1, 1]; }
            else if (side === 2) { lo = [0, 0, 1 - t]; hi = [1, 1, 1]; }
            else { lo = [0, 0, 0]; hi = [t, 1, 1]; }
            box(vb, lo, hi, tex, [255, 255, 255], 0, emis, mat, { noAO: true });
            break;
          }
          case SHAPE.TORCH: {
            const tex = BLOCK_FACE_TEX[id * 6];
            const lo = [7 / 16, 0, 7 / 16], hi = [9 / 16, 10 / 16, 9 / 16];
            let xf = null;
            if (cmeta >= 1 && cmeta <= 4) {
              const [dx, dz] = [[0, -1], [1, 0], [0, 1], [-1, 0]][cmeta - 1];
              // lean away from wall: base pushed to wall, top tilted out
              xf = (lx, ly, lz) => {
                const lean = 0.38 * ly;
                return [lx + dx * (0.5 - 0.06) - dx * lean, ly + 0.2, lz + dz * (0.5 - 0.06) - dz * lean];
              };
            }
            // custom uv window: torch art lives at x 14..18, y 12..32 of 32px
            const opts = { noCull: true, noAO: true, xf, uvTorch: true };
            for (let f = 0; f < 6; f++) {
              const n = FACE_N[f];
              void n;
              const uvOff = f === 2 ? [14 / 32, 12 / 32, 4 / 32, 4 / 32] : f === 3 ? [14 / 32, 28 / 32, 4 / 32, 4 / 32] : null;
              torchFace(vb, f, lo, hi, tex, emis, mat, xf, uvOff);
            }
            break;
          }
          case SHAPE.LADDER: {
            const tex = BLOCK_FACE_TEX[id * 6];
            const tint = B_TINT[id] ? tintFor(B_TINT[id], x, z) : [255, 255, 255];
            const L = ownLight(x, y, z);
            if (cmeta === 4) { crossQuads(vb, tex, L, tint, wave, emis, mat, false); break; }
            const e = 1 / 16;
            let pts;
            const f = cmeta & 3;
            if (f === 0) pts = [[1, 0, e], [0, 0, e], [0, 1, e], [1, 1, e]];
            else if (f === 1) pts = [[1 - e, 0, 1], [1 - e, 0, 0], [1 - e, 1, 0], [1 - e, 1, 1]];
            else if (f === 2) pts = [[0, 0, 1 - e], [1, 0, 1 - e], [1, 1, 1 - e], [0, 1, 1 - e]];
            else pts = [[e, 0, 0], [e, 0, 1], [e, 1, 1], [e, 1, 0]];
            const nIdx = [4, 1, 5, 0][f];
            quad(vb, pts, UVQ, nIdx, tex, L, tint, wave, emis, mat);
            quad(vb, [pts[1], pts[0], pts[3], pts[2]], UVQ, nIdx ^ 1, tex, L, tint, wave, emis, mat);
            break;
          }
          case SHAPE.SNOW_LAYER: {
            const h = ((cmeta & 7) + 1) * 2 / 16;
            box(vb, [0, 0, 0], [1, h, 1], BLOCK_FACE_TEX[id * 6], [255, 255, 255], 0, emis, mat, null);
            break;
          }
          case SHAPE.FARMLAND: case SHAPE.PATH: {
            const texs = [];
            for (let f = 0; f < 6; f++) texs.push(BLOCK_FACE_TEX[id * 6 + f]);
            box(vb, [0, 0, 0], [1, 15 / 16, 1], texs, [255, 255, 255], 0, emis, mat, null);
            break;
          }
          case SHAPE.CACTUS: {
            const side = BLOCK_FACE_TEX[id * 6], top = BLOCK_FACE_TEX[id * 6 + 2];
            const e = 1 / 16;
            box(vb, [e, 0, e], [1 - e, 1, 1 - e], [side, side, top, top, side, side], [255, 255, 255], 0, emis, mat, { frontLight: false });
            break;
          }
          case SHAPE.FLAT: {
            const tint = B_TINT[id] ? tintFor(B_TINT[id], x, z) : [255, 255, 255];
            const L = ownLight(x, y, z);
            const h = 1 / 64;
            const r = ((x * 7 + z * 13 + y) & 3);
            const uvr = [UVQ, [[1, 1], [1, 0], [0, 0], [0, 1]], [[1, 0], [0, 0], [0, 1], [1, 1]], [[0, 0], [0, 1], [1, 1], [1, 0]]][r];
            quad(vb, [[0, h, 1], [1, h, 1], [1, h, 0], [0, h, 0]], uvr, 2, BLOCK_FACE_TEX[id * 6], L, tint, 0, emis, mat);
            quad(vb, [[0, h, 0], [1, h, 0], [1, h, 1], [0, h, 1]], uvr, 3, BLOCK_FACE_TEX[id * 6], L, tint, 0, emis, mat);
            break;
          }
          case SHAPE.LANTERN: {
            const tex = BLOCK_FACE_TEX[id * 6];
            const hang = cmeta & 1;
            const lo = [5 / 16, hang ? 3 / 16 : 0, 5 / 16], hi = [11 / 16, hang ? 11 / 16 : 8 / 16, 11 / 16];
            for (let f = 0; f < 6; f++) {
              const uvOff = f === 2 || f === 3 ? [10 / 32, 9 / 32, 12 / 32, 2 / 32] : [10 / 32, 9 / 32, 12 / 32, 17 / 32];
              lanternFace(vb, f, lo, hi, tex, emis, mat, uvOff);
            }
            if (hang) {
              const L = ownLight(x, y, z);
              const pts = [[0.5, 11 / 16, 0.5 - 0.1], [0.5, 11 / 16, 0.5 + 0.1], [0.5, 1, 0.5 + 0.1], [0.5, 1, 0.5 - 0.1]];
              quad(vb, pts, [[14 / 32, 9 / 32], [18 / 32, 9 / 32], [18 / 32, 4 / 32], [14 / 32, 4 / 32]], 6, tex, L, [255, 255, 255], 0, 0, mat);
              quad(vb, [pts[1], pts[0], pts[3], pts[2]], [[14 / 32, 9 / 32], [18 / 32, 9 / 32], [18 / 32, 4 / 32], [14 / 32, 4 / 32]], 6, tex, L, [255, 255, 255], 0, 0, mat);
            }
            break;
          }
          case SHAPE.BED: {
            const facing = cmeta & 3, head = (cmeta >> 2) & 1;
            const top = head ? BED_HEAD : BED_FOOT;
            const texs = [BED_SIDE, BED_SIDE, top, PLANKS_OAK, BED_SIDE, BED_SIDE];
            // rotate the top texture so the pillow points toward the head end
            const rotTop = facing === 1 || facing === 3;
            for (let f = 0; f < 6; f++) {
              if (!faceVisible(f, [0, 0, 0], [1, 9 / 16, 1])) continue;
              let opts = null;
              if (f === 2) {
                opts = rotTop ? { rot: true } : null;
              }
              boxFace(vb, f, [0, 0, 0], [1, 9 / 16, 1], texs[f], [255, 255, 255], 0, emis, mat, opts);
            }
            void BED_END;
            break;
          }
          default: break;
        }
        if (opq.n + trn.n > before) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
    }
  }

  function torchFace(vb, f, lo, hi, tex, emis, mat, xf, uvOff) {
    const corners = FACE_CORNERS[f];
    const L = ownLight(cx, cy, cz);
    vb.ensure(4);
    for (let k = 0; k < 4; k++) {
      const c = corners[k];
      const lx = c[0] ? hi[0] : lo[0], ly = c[1] ? hi[1] : lo[1], lz = c[2] ? hi[2] : lo[2];
      let u, v;
      if (uvOff) { const uv = faceUV(f, (lx - lo[0]) / (hi[0] - lo[0]), (ly - lo[1]) / (hi[1] - lo[1]), (lz - lo[2]) / (hi[2] - lo[2])); u = uvOff[0] + uv[0] * uvOff[2]; v = uvOff[1] + uv[1] * uvOff[3]; }
      else {
        const uv = faceUV(f, (lx - lo[0]) / (hi[0] - lo[0]), (ly - lo[1]) / (hi[1] - lo[1]), (lz - lo[2]) / (hi[2] - lo[2]));
        u = 14 / 32 + uv[0] * 4 / 32; v = 12 / 32 + uv[1] * 20 / 32;
      }
      const p = xf ? xf(lx, ly, lz) : [lx, ly, lz];
      vb.v(Math.round((cx + p[0]) * PS), Math.round((cy + p[1]) * PS), Math.round((cz + p[2]) * PS), f,
        Math.round(u * US), Math.round(v * US), tex, L[0], L[1], 3, emis, 255, 255, 255, mat);
    }
  }

  function lanternFace(vb, f, lo, hi, tex, emis, mat, uvOff) {
    const corners = FACE_CORNERS[f];
    const L = ownLight(cx, cy, cz);
    vb.ensure(4);
    for (let k = 0; k < 4; k++) {
      const c = corners[k];
      const lx = c[0] ? hi[0] : lo[0], ly = c[1] ? hi[1] : lo[1], lz = c[2] ? hi[2] : lo[2];
      const uv = faceUV(f, (lx - lo[0]) / (hi[0] - lo[0]), (ly - lo[1]) / (hi[1] - lo[1]), (lz - lo[2]) / (hi[2] - lo[2]));
      const u = uvOff[0] + uv[0] * uvOff[2], v = uvOff[1] + uv[1] * uvOff[3];
      vb.v(Math.round((cx + lx) * PS), Math.round((cy + ly) * PS), Math.round((cz + lz) * PS), f,
        Math.round(u * US), Math.round(v * US), tex, L[0], L[1], 3, emis, 255, 255, 255, mat);
    }
  }

  void cur;
  return {
    opaque: opq.result(), opaqueCount: opq.n,
    trans: trn.result(), transCount: trn.n,
    minY: minY > maxY ? 0 : minY, maxY: minY > maxY ? 0 : maxY + 1,
  };
}

// Build the padded arrays from a 3x3 neighbourhood of chunk data (main thread helper).
// chunks: function(dx,dz) -> chunk or null ; chunk = {blocks, meta, light, tints}
export function buildPadded(get, H = HEIGHT) {
  const size = PA * H;
  const pb = new Uint8Array(size), pm = new Uint8Array(size), pl = new Uint8Array(size);
  const pt = new Uint8Array(PA * 9);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const c = get(dx, dz);
    const xs = dx === -1 ? 15 : 0, xe = dx === 1 ? 0 : 15;
    const zs = dz === -1 ? 15 : 0, ze = dz === 1 ? 0 : 15;
    for (let lz = zs; lz <= ze; lz++) {
      const pz = lz + dz * 16 + 1;
      for (let lx = xs; lx <= xe; lx++) {
        const px = lx + dx * 16 + 1;
        const pcol = pz * PW + px;
        if (!c) {
          for (let y = 0; y < H; y++) pl[y * PA + pcol] = 0xf0;
          continue;
        }
        const ccol = (lz << 4) | lx;
        const cb = c.blocks, cm = c.meta, cl = c.light;
        for (let y = 0; y < H; y++) {
          const si = (y << 8) | ccol, di = y * PA + pcol;
          pb[di] = cb[si]; pm[di] = cm[si]; pl[di] = cl[si];
        }
        const ti = ccol * 9, to = pcol * 9;
        for (let k = 0; k < 9; k++) pt[to + k] = c.tints[ti + k];
      }
    }
  }
  return { pb, pm, pl, pt };
}
