// Deterministic structure generation (runs in the generation worker).
// Structures are planned per 384x384 region, cached, and each chunk builds only the parts inside it.
import { B, BLOCKS } from './blocks.js';
import { BIOME } from './biomes.js';
import { SEA, HEIGHT } from './constants.js';
import { RNG, hash2 } from '../core/noise.js';

const REGION = 384;
const regionCache = new Map();
const planCache = new Map();

// ---------------------------------------------------------------- builder with rotation
// local: x right, z into the building, front (door) at z = 0 facing -z.  rot rotates facing by +rot.
class SB {
  constructor(ctx, ox, oy, oz, rot) { this.ctx = ctx; this.ox = ox; this.oy = oy; this.oz = oz; this.rot = rot & 3; }
  w(x, z) {
    switch (this.rot) {
      case 0: return [this.ox + x, this.oz + z];
      case 1: return [this.ox - z, this.oz + x];
      case 2: return [this.ox - x, this.oz - z];
      default: return [this.ox + z, this.oz - x];
    }
  }
  inChunk(x, z) { const [wx, wz] = this.w(x, z); return wx >= this.ctx.x0 && wx < this.ctx.x0 + 16 && wz >= this.ctx.z0 && wz < this.ctx.z0 + 16; }
  rotMeta(id, meta) {
    const b = BLOCKS[id];
    const r = this.rot;
    if (!r) return meta;
    const s = b.shape;
    if (s === 4 || s === 6 || s === 9 || b.oriented || b.interact === 'crafting') return (meta & ~3) | (((meta & 3) + r) & 3);
    if (s === 10) return meta === 4 ? 4 : (meta + r) & 3;
    if (s === 7) return meta >= 1 && meta <= 4 ? 1 + ((meta - 1 + r) & 3) : meta;
    if (b.log && (r & 1) && (meta === 1 || meta === 2)) return meta === 1 ? 2 : 1;
    return meta;
  }
  set(x, y, z, id, meta = 0) {
    const [wx, wz] = this.w(x, z);
    this.ctx.force(wx, this.oy + y, wz, id, this.rotMeta(id, meta));
  }
  setIfAir(x, y, z, id, meta = 0) {
    const [wx, wz] = this.w(x, z);
    const cur = this.ctx.get(wx, this.oy + y, wz);
    if (cur === 0 || (cur > 0 && BLOCKS[cur].replaceable)) this.ctx.force(wx, this.oy + y, wz, id, this.rotMeta(id, meta));
  }
  fill(x0, y0, z0, x1, y1, z1, id, meta = 0) {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.set(x, y, z, id, meta);
  }
  // foundation: fill from y-1 down to terrain
  foundation(gen, x0, z0, x1, z1, id) {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const [wx, wz] = this.w(x, z);
      if (wx < this.ctx.x0 || wx >= this.ctx.x0 + 16 || wz < this.ctx.z0 || wz >= this.ctx.z0 + 16) continue;
      let y = this.oy - 1;
      while (y > 1) {
        const cur = this.ctx.get(wx, y, wz);
        if (cur > 0 && BLOCKS[cur].solid && !BLOCKS[cur].name.endsWith('_leaves') && !BLOCKS[cur].name.endsWith('_log')) break;
        this.ctx.force(wx, y, wz, id, 0);
        y--;
        if (this.oy - y > 24) break;
      }
    }
  }
}

// ---------------------------------------------------------------- styles
const STYLES = {
  plains: { floor: B.oak_planks, wall: B.oak_planks, frame: B.oak_log, base: B.cobblestone, stairs: B.oak_stairs, slab: B.oak_slab, door: B.oak_door, light: B.torch, path: B.dirt_path, accent: B.stripped_oak_log, fence: B.oak_fence, roofTop: B.oak_planks },
  taiga: { floor: B.pine_planks, wall: B.pine_planks, frame: B.pine_log, base: B.cobblestone, stairs: B.pine_stairs, slab: B.pine_slab, door: B.spruce_door, light: B.lantern, path: B.dirt_path, accent: B.pine_log, fence: B.oak_fence, roofTop: B.pine_planks },
  snowy: { floor: B.pine_planks, wall: B.pine_planks, frame: B.pine_log, base: B.stone_bricks, stairs: B.pine_stairs, slab: B.pine_slab, door: B.spruce_door, light: B.glow_lantern, path: B.gravel, accent: B.frost_bricks, fence: B.oak_fence, roofTop: B.snow_block, snow: true },
  desert: { floor: B.sandstone, wall: B.sandstone, frame: B.carved_sandstone, base: B.sandstone, stairs: B.sandstone_stairs, slab: B.sandstone_slab, door: B.oak_door, light: B.torch, path: B.sandstone, accent: B.baked_clay_orange, fence: B.oak_fence, roofTop: B.sandstone, flat: true },
  savanna: { floor: B.teak_planks, wall: B.teak_planks, frame: B.oak_log, base: B.cobblestone, stairs: B.teak_stairs, slab: B.teak_slab, door: B.oak_door, light: B.torch, path: B.dirt_path, accent: B.baked_clay_orange, fence: B.oak_fence, roofTop: B.teak_planks },
  jungle: { floor: B.teak_planks, wall: B.teak_planks, frame: B.teak_log, base: B.mossy_cobblestone, stairs: B.teak_stairs, slab: B.teak_slab, door: B.oak_door, light: B.lantern, path: B.dirt_path, accent: B.teak_log, fence: B.oak_fence, roofTop: B.teak_planks, vines: true },
};
const VILLAGE_STYLE = {
  [BIOME.PLAINS]: 'plains', [BIOME.FOREST]: 'plains', [BIOME.BIRCH_FOREST]: 'plains', [BIOME.TAIGA]: 'taiga', [BIOME.SNOWY_TAIGA]: 'snowy', [BIOME.TUNDRA]: 'snowy',
  [BIOME.DESERT]: 'desert', [BIOME.SAVANNA]: 'savanna', [BIOME.JUNGLE]: 'jungle', [BIOME.BADLANDS]: 'desert',
};

const JOBS = ['farmer', 'blacksmith', 'fisher', 'merchant', 'builder', 'hunter', 'librarian', 'healer', 'apprentice'];
const JOB_BLOCK = { farmer: B.hay_bale, blacksmith: B.anvil, fisher: B.barrel, merchant: B.chest, builder: B.crafting_table, hunter: B.barrel, librarian: B.bookshelf, healer: B.sunstone_block, apprentice: B.rune_stone };

// ---------------------------------------------------------------- region planning
function regionStructures(gen, rx, rz) {
  const key = rx + ',' + rz;
  let list = regionCache.get(key);
  if (list) return list;
  list = [];
  const T = gen.terrain;
  const r = new RNG(hash2(rx, rz, gen.seed ^ 0x57c1));
  const x0 = rx * REGION, z0 = rz * REGION;
  const pick = (m = 48) => [x0 + m + r.irange(0, REGION - 2 * m), z0 + m + r.irange(0, REGION - 2 * m)];
  const col = (x, z) => T.column(x, z, {});
  // village (several placement attempts per region)
  if (r.next() < 0.9) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const [vx, vz] = pick(70);
      const o = col(vx, vz);
      const style = VILLAGE_STYLE[o.biome];
      if (!style || o.height <= SEA || o.height > SEA + 45 || o.river) continue;
      let mn = 999, mx = -999, wet = 0;
      for (let k = 0; k < 12; k++) {
        const a = k / 12 * Math.PI * 2;
        const c = col(Math.round(vx + Math.cos(a) * 26), Math.round(vz + Math.sin(a) * 26));
        mn = Math.min(mn, c.height); mx = Math.max(mx, c.height);
        if (c.height < SEA) wet++;
      }
      if (mx - mn <= 12 && wet <= 3) { list.push({ type: 'village', x: vx, z: vz, y: o.height + 1, style, seed: r.nextInt(), bbox: [vx - 48, vz - 48, vx + 48, vz + 48] }); break; }
    }
  }
  // ruins
  const nr = r.irange(1, 3);
  for (let i = 0; i < nr; i++) {
    const [x, z] = pick(24);
    const o = col(x, z);
    if (o.height <= SEA || o.biome === BIOME.SNOWY_PEAKS || o.biome === BIOME.VOLCANIC) continue;
    const ancient = o.biome === BIOME.ANCIENT_FOREST;
    list.push({ type: ancient ? 'ancient_ruin' : 'ruin', x, z, y: o.height, seed: r.nextInt(), bbox: [x - 10, z - 10, x + 10, z + 10] });
  }
  // wizard tower
  if (r.next() < 0.38) {
    const [x, z] = pick(40);
    const o = col(x, z);
    const ok = [BIOME.FOREST, BIOME.TAIGA, BIOME.BIRCH_FOREST, BIOME.ANCIENT_FOREST, BIOME.SWAMP, BIOME.PLAINS, BIOME.MOUNTAINS, BIOME.SNOWY_TAIGA].includes(o.biome);
    if (ok && o.height > SEA + 1 && o.m < 0.5) list.push({ type: 'wizard_tower', x, z, y: o.height + 1, seed: r.nextInt(), bbox: [x - 6, z - 6, x + 6, z + 6] });
  }
  // shipwreck
  if (r.next() < 0.55) {
    const [x, z] = pick(30);
    const o = col(x, z);
    if (o.height < SEA - 6 && (o.biome === BIOME.OCEAN || o.biome === BIOME.DEEP_OCEAN)) list.push({ type: 'shipwreck', x, z, y: o.height + 1, rot: r.irange(0, 3), seed: r.nextInt(), bbox: [x - 12, z - 12, x + 12, z + 12] });
  }
  // mineshaft
  if (r.next() < 0.4) {
    const [x, z] = pick(60);
    list.push({ type: 'mineshaft', x, z, y: 18 + r.irange(0, 22), seed: r.nextInt(), bbox: [x - 60, z - 60, x + 60, z + 60] });
  }
  // desert temple with the Desert Titan
  if (r.next() < 0.35) {
    const [x, z] = pick(50);
    const o = col(x, z);
    if (o.biome === BIOME.DESERT && o.height > SEA + 1) list.push({ type: 'desert_temple', x, z, y: o.height, seed: r.nextInt(), bbox: [x - 20, z - 20, x + 20, z + 20] });
  }
  // frost spire (Frost Wyrm lair) on snowy peaks
  if (r.next() < 0.45) {
    for (let t = 0; t < 6; t++) {
      const [x, z] = pick(40);
      const o = col(x, z);
      if (o.biome === BIOME.SNOWY_PEAKS && o.height > SEA + 70) { list.push({ type: 'frost_spire', x, z, y: T.surfaceY(x, z, o), seed: r.nextInt(), bbox: [x - 14, z - 14, x + 14, z + 14] }); break; }
    }
  }
  // warden grove in ancient forests
  if (r.next() < 0.5) {
    for (let t = 0; t < 6; t++) {
      const [x, z] = pick(40);
      const o = col(x, z);
      if (o.biome === BIOME.ANCIENT_FOREST && o.height > SEA) { list.push({ type: 'warden_grove', x, z, y: o.height, seed: r.nextInt(), bbox: [x - 16, z - 16, x + 16, z + 16] }); break; }
    }
  }
  // behemoth caldera
  if (r.next() < 0.5) {
    for (let t = 0; t < 6; t++) {
      const [x, z] = pick(50);
      const o = col(x, z);
      if (o.biome === BIOME.VOLCANIC) { list.push({ type: 'caldera', x, z, y: o.height, seed: r.nextInt(), bbox: [x - 18, z - 18, x + 18, z + 18] }); break; }
    }
  }
  // mammoth valley
  if (r.next() < 0.45) {
    for (let t = 0; t < 6; t++) {
      const [x, z] = pick(50);
      const o = col(x, z);
      if ((o.biome === BIOME.TUNDRA || o.biome === BIOME.SNOWY_TAIGA) && o.height > SEA) { list.push({ type: 'mammoth_valley', x, z, y: o.height, seed: r.nextInt(), bbox: [x - 40, z - 40, x + 40, z + 40] }); break; }
    }
  }
  // dragon roost (very rare)
  if (r.next() < 0.12) {
    for (let t = 0; t < 8; t++) {
      const [x, z] = pick(40);
      const o = col(x, z);
      if ((o.biome === BIOME.MOUNTAINS || o.biome === BIOME.SNOWY_PEAKS || o.biome === BIOME.VOLCANIC) && o.height > SEA + 50) { list.push({ type: 'dragon_roost', x, z, y: T.surfaceY(x, z, o), seed: r.nextInt(), bbox: [x - 10, z - 10, x + 10, z + 10] }); break; }
    }
  }
  // the Sunken Pyramid: rare, on a wide flat stretch of open desert, never near a village or the Titan's temple
  if (r.next() < 0.22) {
    for (let t = 0; t < 8; t++) {
      const [x, z] = pick(64);
      const o = col(x, z);
      if (o.biome !== BIOME.DESERT || o.height <= SEA + 1 || o.river) continue;
      let mn = 999, mx = -999, ok = true;
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2;
        for (const rr of [12, 22]) {
          const c = col(Math.round(x + Math.cos(a) * rr), Math.round(z + Math.sin(a) * rr));
          if (c.biome !== BIOME.DESERT && c.biome !== BIOME.BADLANDS) ok = false;
          if (c.height <= SEA + 1) ok = false;
          mn = Math.min(mn, c.height); mx = Math.max(mx, c.height);
        }
      }
      if (!ok || mx - mn > 7) continue;
      if (list.some(q => (q.type === 'desert_temple' || q.type === 'village') && Math.hypot(q.x - x, q.z - z) < 80)) continue;
      list.push({ type: 'pyramid', x, z, y: Math.round((mn + mx) / 2), seed: r.nextInt(), bbox: [x - 22, z - 24, x + 22, z + 26] });
      break;
    }
  }
  regionCache.set(key, list);
  if (regionCache.size > 64) regionCache.delete(regionCache.keys().next().value);
  return list;
}

function nearbyStructures(gen, x0, z0, x1, z1) {
  const out = [];
  const rx0 = Math.floor((x0 - 64) / REGION), rx1 = Math.floor((x1 + 64) / REGION);
  const rz0 = Math.floor((z0 - 64) / REGION), rz1 = Math.floor((z1 + 64) / REGION);
  for (let rz = rz0; rz <= rz1; rz++) for (let rx = rx0; rx <= rx1; rx++) {
    for (const s of regionStructures(gen, rx, rz)) {
      const b = s.bbox;
      if (b[2] < x0 || b[0] > x1 || b[3] < z0 || b[1] > z1) continue;
      out.push(s);
    }
  }
  return out;
}

export function structureExclusion(gen, x, z) {
  for (const s of nearbyStructures(gen, x, z, x, z)) {
    if (s.type === 'village') {
      const plan = villagePlan(gen, s);
      for (const p of plan.pieces) if (x >= p.bb[0] - 2 && x <= p.bb[2] + 2 && z >= p.bb[1] - 2 && z <= p.bb[3] + 2) return true;
    } else if (s.type === 'mammoth_valley' || s.type === 'warden_grove') {
      const r = s.type === 'mammoth_valley' ? 26 : 13;
      if (Math.hypot(x - s.x, z - s.z) < r) return true;
    } else if (s.type !== 'mineshaft') {
      const b = s.bbox;
      if (x >= b[0] + 2 && x <= b[2] - 2 && z >= b[1] + 2 && z <= b[3] - 2) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- villages
const NAME_A = ['Ar', 'Bel', 'Cor', 'Da', 'El', 'Fen', 'Gar', 'Hal', 'Isa', 'Jor', 'Kel', 'Lin', 'Mar', 'Nel', 'Or', 'Pem', 'Quin', 'Ros', 'Sel', 'Tam', 'Ul', 'Ves', 'Wil', 'Yor', 'Zan', 'Bro', 'Cal', 'Edd', 'Fia', 'Gwen'];
const NAME_B = ['wen', 'ric', 'a', 'den', 'iel', 'ora', 'tho', 'ka', 'mund', 'ette', 'is', 'van', 'ley', 'ro', 'na', 'bert', 'lo', 'mira', 'ton', 'sy', 'dric', 'ina'];
export function villagerName(r) { return r.pick(NAME_A) + r.pick(NAME_B); }

function villagePlan(gen, s) {
  const key = s.x + ',' + s.z;
  let plan = planCache.get(key);
  if (plan) return plan;
  const T = gen.terrain;
  const r = new RNG(s.seed);
  const hAt = (x, z) => T.column(x, z, {}).height;
  const pieces = [];
  const roads = [];
  const overl = (bb) => pieces.some(p => !(bb[2] < p.bb[0] - 1 || bb[0] > p.bb[2] + 1 || bb[3] < p.bb[1] - 1 || bb[1] > p.bb[3] + 1)) ||
    roads.some(rd => !(bb[2] < rd[0] || bb[0] > rd[2] || bb[3] < rd[1] || bb[1] > rd[3]));
  // well / plaza in the middle
  const cy = hAt(s.x, s.z) + 1;
  pieces.push({ kind: 'well', x: s.x - 2, z: s.z - 2, y: cy, rot: 0, w: 5, d: 5, bb: [s.x - 2, s.z - 2, s.x + 2, s.z + 2] });
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const order = [0, 1, 2, 3].sort(() => r.next() - 0.5);
  const nRoads = 3 + (r.next() < 0.5 ? 1 : 0);
  const residents = [];
  const jobs = JOBS.slice().sort(() => r.next() - 0.5);
  let jobIdx = 0;
  const kinds = ['small', 'small', 'medium', 'medium', 'large', 'farm', 'farm', 'smithy', 'library', 'hall', 'storage', 'tower'];
  for (let k = 0; k < nRoads; k++) {
    const [dx, dz] = dirs[order[k]];
    const len = 22 + r.irange(0, 16);
    const sx = s.x + dx * 3, sz = s.z + dz * 3;
    const ex = s.x + dx * len, ez = s.z + dz * len;
    roads.push([Math.min(sx, ex) - (dz ? 1 : 0), Math.min(sz, ez) - (dx ? 1 : 0), Math.max(sx, ex) + (dz ? 1 : 0), Math.max(sz, ez) + (dx ? 1 : 0)]);
    // lots along both sides
    for (let t = 6; t < len - 3; t += 9 + r.irange(0, 3)) {
      for (const side of [-1, 1]) {
        if (r.next() < 0.18) continue;
        const kind = kinds[r.irange(0, kinds.length - 1)];
        const [w, d] = kind === 'small' ? [5, 5] : kind === 'medium' ? [7, 6] : kind === 'large' ? [9, 7] : kind === 'farm' ? [9, 9] : kind === 'smithy' ? [7, 7] : kind === 'library' ? [7, 8] : kind === 'hall' ? [9, 9] : kind === 'storage' ? [7, 6] : [3, 3];
        // perpendicular offset from road
        const px = dz !== 0 ? side : 0, pz = dx !== 0 ? side : 0;
        const along = [s.x + dx * t, s.z + dz * t];
        // front-left corner such that the front faces the road
        const off = 3;
        let ox, oz, rot;
        // rot: front (local -z) must point toward the road (direction -px,-pz)
        if (px === 1) { rot = 3; ox = along[0] + off; oz = along[1] + Math.floor(w / 2); }
        else if (px === -1) { rot = 1; ox = along[0] - off; oz = along[1] - Math.floor(w / 2); }
        else if (pz === 1) { rot = 0; ox = along[0] - Math.floor(w / 2); oz = along[1] + off; }
        else { rot = 2; ox = along[0] + Math.floor(w / 2); oz = along[1] - off; }
        // compute bbox in world
        const pts = [[0, 0], [w - 1, 0], [0, d - 1], [w - 1, d - 1]].map(([lx, lz]) => {
          switch (rot) { case 0: return [ox + lx, oz + lz]; case 1: return [ox - lz, oz + lx]; case 2: return [ox - lx, oz - lz]; default: return [ox + lz, oz - lx]; }
        });
        const bb = [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
        if (overl(bb)) continue;
        // terrain check
        const hc = hAt(Math.round((bb[0] + bb[2]) / 2), Math.round((bb[1] + bb[3]) / 2));
        if (hc < SEA) continue;
        let job = null;
        if (kind === 'farm') job = 'farmer';
        else if (kind === 'smithy') job = 'blacksmith';
        else if (kind === 'library') job = 'librarian';
        else if (kind !== 'tower' && kind !== 'storage' && kind !== 'hall') { job = jobs[jobIdx % jobs.length]; jobIdx++; }
        const piece = { kind, x: ox, z: oz, y: hc + 1, rot, w, d, bb, job, seed: r.nextInt() };
        pieces.push(piece);
        if (['small', 'medium', 'large', 'library', 'smithy'].includes(kind)) {
          const beds = kind === 'large' ? 2 : 1;
          for (let b = 0; b < beds; b++) {
            const rr = new RNG(piece.seed + b);
            residents.push({ job: job || 'merchant', name: villagerName(rr), house: pieces.length - 1, bed: b, gender: rr.next() < 0.5 ? 0 : 1, look: rr.nextInt() });
          }
        }
        if (kind === 'farm' && residents.length) { /* farmers work fields */ }
      }
    }
  }
  plan = { s, pieces, roads, residents, cy };
  planCache.set(key, plan);
  if (planCache.size > 32) planCache.delete(planCache.keys().next().value);
  return plan;
}

function buildRoadCell(gen, ctx, x, z, style) {
  if (x < ctx.x0 || x >= ctx.x0 + 16 || z < ctx.z0 || z >= ctx.z0 + 16) return;
  const T = gen.terrain;
  const h = T.column(x, z, {}).height;
  if (h < SEA) { // bridge
    ctx.force(x, SEA, z, style.floor, 0);
    for (let y = SEA + 1; y < SEA + 3; y++) ctx.force(x, y, z, 0, 0);
    return;
  }
  let top = h;
  while (top < HEIGHT - 2 && ctx.get(x, top + 1, z) > 0 && BLOCKS[ctx.get(x, top + 1, z)].solid && top < h + 3) top++;
  ctx.force(x, top, z, style.path, 0);
  for (let y = top + 1; y < top + 4; y++) { const c = ctx.get(x, y, z); if (c > 0 && !BLOCKS[c].name.endsWith('_log')) ctx.force(x, y, z, 0, 0); }
}

function buildHouse(gen, ctx, p, style, out, plan, pieceIndex) {
  const sb = new SB(ctx, p.x, p.y, p.z, p.rot);
  const { w, d } = p;
  const r = new RNG(p.seed);
  const H = p.kind === 'large' || p.kind === 'hall' ? 5 : 4;
  sb.foundation(gen, -1, -1, w, d, style.base);
  // clear interior volume
  sb.fill(-1, 0, -1, w, H + Math.ceil(w / 2) + 2, d, 0);
  // floor
  sb.fill(0, -1, 0, w - 1, -1, d - 1, style.floor);
  // walls
  for (let y = 0; y < H; y++) for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
    const edgeX = x === 0 || x === w - 1, edgeZ = z === 0 || z === d - 1;
    if (!edgeX && !edgeZ) continue;
    const corner = edgeX && edgeZ;
    let id = corner ? style.frame : style.wall;
    if (y === 0 && !corner) id = style.base === B.sandstone ? style.wall : style.base;
    // windows
    if (!corner && y === 2 && ((edgeX && z % 2 === 1 && z > 0 && z < d - 1) || (edgeZ && z === d - 1 && x % 2 === 1))) id = B.glass;
    sb.set(x, y, z, id, corner ? 0 : 0);
  }
  // door
  const dx = Math.floor(w / 2);
  sb.set(dx, 0, 0, style.door, 0);
  sb.set(dx, 1, 0, style.door, 8);
  if (H > 4) sb.set(dx, 2, 0, style.wall);
  sb.set(dx, -1, -1, style.path === B.sandstone ? B.sandstone : style.path);
  sb.set(dx, -1, -2, style.path === B.sandstone ? B.sandstone : style.path);
  sb.set(dx, 0, -1, 0); sb.set(dx, 1, -1, 0);
  // light outside door
  sb.set(dx + 1, 2, -1, B.torch, 1 + 2);
  // roof
  if (style.flat) {
    sb.fill(-1, H, -1, w, H, d, style.wall);
    for (let x = -1; x <= w; x++) { sb.set(x, H + 1, -1, style.slab); sb.set(x, H + 1, d, style.slab); }
    for (let z = 0; z < d; z++) { sb.set(-1, H + 1, z, style.slab); sb.set(w, H + 1, z, style.slab); }
  } else {
    const half = Math.ceil(w / 2);
    for (let i = 0; i <= half; i++) {
      const y = H + i;
      const xl = -1 + i, xr = w - i;
      if (xl > xr) break;
      for (let z = -1; z <= d; z++) {
        if (xl === xr) { sb.set(xl, y, z, style.slab); continue; }
        sb.set(xl, y, z, style.stairs, 1);
        sb.set(xr, y, z, style.stairs, 3);
        if (style.snow && r.next() < 0.45) { sb.set(xl, y + 1, z, B.snow_layer); }
        if (style.snow && r.next() < 0.45) { sb.set(xr, y + 1, z, B.snow_layer); }
      }
      // gable walls
      if (i > 0) for (let x = xl + 1; x < xr; x++) { sb.set(x, y, 0, style.wall); sb.set(x, y, d - 1, style.wall); }
      if (xr - xl === 1) for (let z = -1; z <= d; z++) sb.set(xl, y + 1, z, style.slab), sb.set(xr, y + 1, z, style.slab);
    }

  }
  if (style.vines) for (let k = 0; k < 6; k++) { const z = r.irange(0, d - 1); sb.setIfAir(-1, r.irange(0, H - 1), z, B.vines, 1); }
  // interior
  const job = p.job;
  // bed against back wall
  const beds = p.kind === 'large' ? 2 : 1;
  const bedPos = [];
  for (let b = 0; b < beds; b++) {
    const bx = 1 + b * 2;
    if (bx >= w - 1) break;
    sb.set(bx, 0, d - 2, B.bed, 2 | 4);
    sb.set(bx, 0, d - 3, B.bed, 2);
    bedPos.push(sb.w(bx, d - 3).concat([p.y]));
  }
  const jb = JOB_BLOCK[job];
  if (jb) {
    sb.set(w - 2, 0, d - 2, jb, 2);
    if (job === 'blacksmith') sb.set(w - 2, 0, d - 3, B.furnace, 3);
    if (job === 'librarian') { for (let z = 1; z < d - 1; z++) sb.set(w - 2, 0, z, B.bookshelf), sb.set(w - 2, 1, z, B.bookshelf); }
  }
  if (w >= 7) sb.set(1, 0, 1, B.crafting_table, 0);
  // chest with loot
  if (r.next() < 0.6) {
    sb.set(w - 2, 0, 1, B.chest, 2);
    const [cx, cz] = sb.w(w - 2, 1);
    if (cx >= ctx.x0 && cx < ctx.x0 + 16 && cz >= ctx.z0 && cz < ctx.z0 + 16) out.push({ type: 'chest', x: cx, y: p.y, z: cz, loot: job === 'blacksmith' ? 'smithy' : 'village' });
  }
  // light inside
  sb.set(Math.floor(w / 2), H - 1, Math.floor(d / 2), style.light === B.torch ? B.lantern : style.light, 1);
  // carpet-ish rug
  if (w >= 7) for (let x = 2; x < w - 2; x++) for (let z = 2; z < d - 2; z++) if (r.next() < 0.5) {}
  p.beds = bedPos;
  void plan; void pieceIndex;
}

function buildFarm(gen, ctx, p, style) {
  const sb = new SB(ctx, p.x, p.y, p.z, p.rot);
  const r = new RNG(p.seed);
  sb.foundation(gen, -1, -1, p.w, p.d, B.dirt);
  sb.fill(-1, 0, -1, p.w, 3, p.d, 0);
  const crop = r.next() < 0.6 ? B.wheat : B.carrots;
  for (let z = 0; z < p.d; z++) for (let x = 0; x < p.w; x++) {
    const border = x === 0 || x === p.w - 1 || z === 0 || z === p.d - 1;
    if (border) { sb.set(x, -1, z, style.frame === B.carved_sandstone ? B.sandstone : B.oak_log, x === 0 || x === p.w - 1 ? 2 : 1); continue; }
    if (x === Math.floor(p.w / 2)) { sb.set(x, -1, z, B.water); continue; }
    sb.set(x, -1, z, B.farmland, 1);
    sb.set(x, 0, z, crop, r.irange(2, 7));
  }
  sb.set(0, 0, 0, B.torch); sb.set(p.w - 1, 0, 0, B.torch);
  sb.set(0, 0, p.d - 1, B.hay_bale); sb.set(p.w - 1, 0, p.d - 1, B.hay_bale);
  p.work = sb.w(Math.floor(p.w / 2) - 1, 1).concat([p.y]);
}

function buildWell(gen, ctx, p, style) {
  const sb = new SB(ctx, p.x, p.y, p.z, 0);
  sb.foundation(gen, -1, -1, 5, 5, style.base);
  sb.fill(-1, 0, -1, 5, 5, 5, 0);
  sb.fill(-1, -1, -1, 5, -1, 5, style.path === B.sandstone ? B.sandstone : B.cobblestone);
  sb.fill(1, -1, 1, 3, 0, 3, style.base);
  sb.fill(2, -3, 2, 2, -1, 2, B.water);
  sb.set(2, 0, 2, B.water);
  sb.set(2, -1, 2, B.water);
  for (const [x, z] of [[1, 1], [3, 1], [1, 3], [3, 3]]) { sb.set(x, 1, z, style.fence); sb.set(x, 2, z, style.fence); }
  sb.fill(1, 3, 1, 3, 3, 3, style.slab);
  sb.set(2, 2, 2, B.lantern, 1);
  for (const [x, z] of [[-1, -1], [5, -1], [-1, 5], [5, 5]]) { sb.set(x, 0, z, style.fence); sb.set(x, 1, z, B.lantern); }
}

function buildTower(gen, ctx, p, style) {
  const sb = new SB(ctx, p.x, p.y, p.z, p.rot);
  sb.foundation(gen, 0, 0, 2, 2, style.base);
  sb.fill(0, 0, 0, 2, 9, 2, 0);
  for (const [x, z] of [[0, 0], [2, 0], [0, 2], [2, 2]]) sb.fill(x, 0, z, x, 7, z, style.frame);
  sb.fill(1, 0, 2, 1, 7, 2, style.wall);
  for (let y = 0; y < 8; y++) sb.set(1, y, 1, B.ladder, 0);
  sb.fill(-1, 8, -1, 3, 8, 3, style.floor);
  sb.set(1, 8, 1, 0);
  for (let x = -1; x <= 3; x++) { sb.set(x, 9, -1, style.fence); sb.set(x, 9, 3, style.fence); }
  for (let z = 0; z <= 2; z++) { sb.set(-1, 9, z, style.fence); sb.set(3, 9, z, style.fence); }
  sb.set(-1, 10, -1, B.torch); sb.set(3, 10, 3, B.torch);
}

function buildVillage(gen, ctx, s, out) {
  const plan = villagePlan(gen, s);
  const style = STYLES[s.style];
  const x0 = ctx.x0, z0 = ctx.z0, x1 = x0 + 15, z1 = z0 + 15;
  // roads
  for (const rd of plan.roads) {
    if (rd[2] < x0 || rd[0] > x1 || rd[3] < z0 || rd[1] > z1) continue;
    for (let z = Math.max(rd[1], z0); z <= Math.min(rd[3], z1); z++) for (let x = Math.max(rd[0], x0); x <= Math.min(rd[2], x1); x++) buildRoadCell(gen, ctx, x, z, style);
  }
  plan.pieces.forEach((p, i) => {
    const b = p.bb;
    if (b[2] + 3 < x0 || b[0] - 3 > x1 || b[3] + 3 < z0 || b[1] - 3 > z1) {
      // still compute beds for resident data (house geometry) in center chunk
      if (!p.beds && ['small', 'medium', 'large', 'library', 'smithy'].includes(p.kind)) {
        const sb = new SB({ x0: 1e9, z0: 1e9 }, p.x, p.y, p.z, p.rot);
        p.beds = [];
        for (let k = 0; k < (p.kind === 'large' ? 2 : 1); k++) p.beds.push(sb.w(1 + k * 2, p.d - 3).concat([p.y]));
        p.door = sb.w(Math.floor(p.w / 2), -2).concat([p.y]);
      }
      return;
    }
    if (p.kind === 'well') buildWell(gen, ctx, p, style);
    else if (p.kind === 'farm') buildFarm(gen, ctx, p, style);
    else if (p.kind === 'tower') buildTower(gen, ctx, p, style);
    else {
      buildHouse(gen, ctx, p, style, out, plan, i);
      const sb = new SB({ x0: 1e9, z0: 1e9 }, p.x, p.y, p.z, p.rot);
      p.door = sb.w(Math.floor(p.w / 2), -2).concat([p.y]);
    }
  });
  // village record goes with the chunk containing the centre
  if (s.x >= x0 && s.x <= x1 && s.z >= z0 && s.z <= z1) {
    const res = plan.residents.map(rz => {
      const house = plan.pieces[rz.house];
      if (!house.beds) {
        const sb = new SB({ x0: 1e9, z0: 1e9 }, house.x, house.y, house.z, house.rot);
        house.beds = []; for (let k = 0; k < (house.kind === 'large' ? 2 : 1); k++) house.beds.push(sb.w(1 + k * 2, house.d - 3).concat([house.y]));
        house.door = sb.w(Math.floor(house.w / 2), -2).concat([house.y]);
      }
      const bed = house.beds[rz.bed] || house.beds[0];
      const farm = rz.job === 'farmer' ? plan.pieces.find(pp => pp.kind === 'farm') : null;
      const work = farm ? [farm.bb[0] + 2, farm.y, farm.bb[1] + 2] : [Math.round((house.bb[0] + house.bb[2]) / 2), house.y, Math.round((house.bb[1] + house.bb[3]) / 2)];
      return { name: rz.name, job: rz.job, bed: [bed[0], bed[2], bed[1]], door: house.door ? [house.door[0], house.door[2], house.door[1]] : null, work, gender: rz.gender, look: rz.look };
    });
    out.push({ type: 'village', id: s.x + ',' + s.z, x: s.x, y: plan.cy, z: s.z, style: s.style, residents: res, meet: [s.x + 4, plan.cy, s.z] });
  }
}

// ---------------------------------------------------------------- other structures
function buildRuin(gen, ctx, s, out, ancient) {
  const r = new RNG(s.seed);
  const sb = new SB(ctx, s.x - 5, s.y, s.z - 5, r.irange(0, 3));
  const wall = ancient ? [B.ancient_bricks, B.mossy_ancient_bricks, B.mossy_ancient_bricks] : [B.stone_bricks, B.cracked_stone_bricks, B.mossy_stone_bricks, B.mossy_cobblestone];
  const w = 9 + r.irange(0, 3), d = 7 + r.irange(0, 3);
  sb.foundation(gen, 0, 0, w - 1, d - 1, ancient ? B.ancient_bricks : B.cobblestone);
  for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
    const edge = x === 0 || z === 0 || x === w - 1 || z === d - 1;
    sb.set(x, -1, z, r.pick(wall));
    if (!edge) { sb.fill(x, 0, z, x, 4, z, 0); if (r.next() < 0.15) sb.set(x, 0, z, r.pick(wall)); continue; }
    const hgt = Math.floor(r.next() * (ancient ? 6 : 4));
    for (let y = 0; y < hgt; y++) sb.set(x, y, z, r.pick(wall));
    for (let y = hgt; y < 6; y++) sb.set(x, y, z, 0);
    if (r.next() < 0.1) sb.setIfAir(x, hgt, z, B.vines, 4);
  }
  if (ancient) {
    sb.set(Math.floor(w / 2), 0, Math.floor(d / 2), B.rune_stone);
    for (const [x, z] of [[1, 1], [w - 2, 1], [1, d - 2], [w - 2, d - 2]]) for (let y = 0; y < 5; y++) sb.set(x, y, z, y === 4 ? B.rune_stone : B.ancient_bricks);
  }
  if (r.next() < 0.75) {
    sb.set(Math.floor(w / 2) + 1, 0, Math.floor(d / 2), B.chest, 0);
    const [cx, cz] = sb.w(Math.floor(w / 2) + 1, Math.floor(d / 2));
    if (cx >= ctx.x0 && cx < ctx.x0 + 16 && cz >= ctx.z0 && cz < ctx.z0 + 16) out.push({ type: 'chest', x: cx, y: s.y, z: cz, loot: ancient ? 'ancient' : 'ruins' });
  }
}

function buildWizardTower(gen, ctx, s, out) {
  const r = new RNG(s.seed);
  const sb = new SB(ctx, s.x - 3, s.y, s.z - 3, r.irange(0, 3));
  const H = 22 + r.irange(0, 6);
  const W = 7;
  sb.foundation(gen, -1, -1, W, W, B.stone_bricks);
  for (let y = 0; y < H; y++) for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
    const cornerCut = (x === 0 || x === W - 1) && (z === 0 || z === W - 1);
    if (cornerCut) continue;
    const edge = x === 0 || z === 0 || x === W - 1 || z === W - 1;
    if (!edge) { sb.set(x, y, z, 0); continue; }
    let id = r.next() < 0.15 ? B.mossy_stone_bricks : (y % 6 === 5 ? B.marble_bricks : B.stone_bricks);
    if (y % 6 === 2 && (x === 3 || z === 3)) id = B.glass;
    sb.set(x, y, z, id);
  }
  // floors every 6 with ladder hole
  for (let f = 0; f * 6 < H; f++) {
    const y = f * 6 - 1;
    for (let z = 1; z < W - 1; z++) for (let x = 1; x < W - 1; x++) sb.set(x, y, z, f === 0 ? B.marble : B.oak_planks);
    sb.set(1, y, 1, f === 0 ? B.marble : 0);
    for (let k = 0; k < 6 && y + k + 1 < H; k++) if (f * 6 + k < H - 1) sb.set(1, y + 1 + k, 1, B.ladder, 0);
    sb.set(3, y + 4, 3, B.lantern, 1);
    if (f > 0) { sb.set(5, y + 1, 5, B.bookshelf); sb.set(5, y + 2, 5, B.bookshelf); sb.set(4, y + 1, 5, B.bookshelf); }
  }
  // entrance
  sb.set(3, 0, 0, B.oak_door, 0); sb.set(3, 1, 0, B.oak_door, 8);
  sb.set(3, -1, -1, B.dirt_path);
  // roof cone
  for (let i = 0; i < 6; i++) {
    const rr = 4 - Math.floor(i * 0.7);
    for (let z = 3 - rr; z <= 3 + rr; z++) for (let x = 3 - rr; x <= 3 + rr; x++) {
      if (Math.abs(x - 3) + Math.abs(z - 3) > rr + 1) continue;
      if (Math.abs(x - 3) === rr || Math.abs(z - 3) === rr || Math.abs(x - 3) + Math.abs(z - 3) >= rr) sb.set(x, H + i, z, B.purple_wool_roof);
    }
  }
  sb.set(3, H + 4, 3, B.purple_wool_roof); sb.set(3, H + 5, 3, B.purple_wool_roof);
  sb.set(3, H + 6, 3, B.rune_stone); sb.set(3, H + 7, 3, B.glow_lantern);
  // top room: wizard's study
  const top = Math.floor((H - 1) / 6) * 6;
  sb.set(5, top, 1, B.rune_stone); sb.set(4, top, 1, B.chest, 0);
  const [cx, cz] = sb.w(4, 1);
  if (cx >= ctx.x0 && cx < ctx.x0 + 16 && cz >= ctx.z0 && cz < ctx.z0 + 16) out.push({ type: 'chest', x: cx, y: s.y + top, z: cz, loot: 'wizard' });
  const [wx, wz] = sb.w(3, 3);
  if (wx >= ctx.x0 && wx < ctx.x0 + 16 && wz >= ctx.z0 && wz < ctx.z0 + 16) out.push({ type: 'wizard', x: wx + 0.5, y: s.y + top, z: wz + 0.5, id: 'wiz' + s.x + ',' + s.z, seed: s.seed });
}

function buildShipwreck(gen, ctx, s, out) {
  const r = new RNG(s.seed);
  const sb = new SB(ctx, s.x - 3, s.y, s.z - 8, s.rot);
  const L = 17;
  sb.foundation(gen, 0, 0, 6, L - 1, B.sand);
  for (let z = 0; z < L; z++) {
    const t = z / (L - 1);
    const half = Math.round(3 * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05)));
    for (let x = 3 - half; x <= 3 + half; x++) {
      const broken = r.next() < 0.18;
      if (!broken) sb.set(x, 0, z, B.oak_planks);
      if (x === 3 - half || x === 3 + half) for (let y = 1; y <= 2 + (half > 2 ? 1 : 0); y++) if (r.next() > 0.25) sb.set(x, y, z, y === 1 ? B.oak_log : B.oak_planks, 2);
    }
  }
  for (let y = 1; y < 6 + r.irange(0, 4); y++) sb.set(3, y, 7, B.oak_log);
  sb.set(3, 1, 12, B.chest, 0);
  const [cx, cz] = sb.w(3, 12);
  if (cx >= ctx.x0 && cx < ctx.x0 + 16 && cz >= ctx.z0 && cz < ctx.z0 + 16) out.push({ type: 'chest', x: cx, y: s.y + 1, z: cz, loot: 'shipwreck' });
  void gen;
}

function buildMineshaft(gen, ctx, s, out) {
  const r = new RNG(s.seed);
  // corridors: a cross with branches, built procedurally as segments
  const segs = [];
  const walk = (x, z, dx, dz, len, depth) => {
    for (let i = 0; i < len; i++) {
      segs.push([x, z, dx, dz, i]);
      x += dx; z += dz;
    }
    if (depth < 3) {
      for (let k = 0; k < 2; k++) if (r.next() < 0.6) {
        const nd = r.next() < 0.5 ? [dz, dx] : [-dz, -dx];
        walk(x - dx * r.irange(2, len - 2), z - dz * r.irange(2, len - 2), nd[0], nd[1], r.irange(12, 30), depth + 1);
      }
    }
  };
  walk(s.x, s.z, 1, 0, r.irange(20, 40), 0);
  walk(s.x, s.z, -1, 0, r.irange(20, 40), 0);
  walk(s.x, s.z, 0, 1, r.irange(20, 40), 0);
  const y = s.y;
  const T = gen.terrain;
  for (const [x, z, dx, dz, i] of segs) {
    if (x < ctx.x0 - 2 || x > ctx.x0 + 17 || z < ctx.z0 - 2 || z > ctx.z0 + 17) continue;
    const surf = T.column(x, z, {}).height;
    if (y + 7 >= surf || surf < SEA) continue;
    const px = dz, pz = dx; // perpendicular
    for (let w = -1; w <= 1; w++) for (let h = 0; h < 3; h++) ctx.force(x + px * w, y + h, z + pz * w, 0, 0);
    for (let w = -1; w <= 1; w++) { const b = ctx.get(x + px * w, y - 1, z + pz * w); if (b === 0 || b === B.lava || b === B.water) ctx.force(x + px * w, y - 1, z + pz * w, B.oak_planks, 0); }
    if (i % 5 === 0) {
      ctx.force(x + px, y, z + pz, B.oak_fence, 0); ctx.force(x + px, y + 1, z + pz, B.oak_fence, 0);
      ctx.force(x - px, y, z - pz, B.oak_fence, 0); ctx.force(x - px, y + 1, z - pz, B.oak_fence, 0);
      for (let w = -1; w <= 1; w++) ctx.force(x + px * w, y + 2, z + pz * w, B.oak_planks, 0);
      if (r.next() < 0.3) ctx.force(x, y + 1, z, B.torch, 0);
    }
    if (r.next() < 0.04) ctx.force(x + px * (r.next() < 0.5 ? 1 : -1), y + 2, z + pz, B.cobweb, 0);
    if (r.next() < 0.012 && x >= ctx.x0 && x < ctx.x0 + 16 && z >= ctx.z0 && z < ctx.z0 + 16) {
      ctx.force(x + px, y, z + pz, B.chest, 0);
      if (x + px >= ctx.x0 && x + px < ctx.x0 + 16 && z + pz >= ctx.z0 && z + pz < ctx.z0 + 16) out.push({ type: 'chest', x: x + px, y, z: z + pz, loot: 'mineshaft' });
    }
  }
}

function buildDesertTemple(gen, ctx, s, out) {
  const r = new RNG(s.seed);
  const sb = new SB(ctx, s.x - 10, s.y - 2, s.z - 10, 0);
  sb.foundation(gen, 0, 0, 20, 20, B.sandstone);
  // pyramid (partially buried)
  for (let i = 0; i < 10; i++) {
    for (let z = i; z <= 20 - i; z++) for (let x = i; x <= 20 - i; x++) {
      const edge = x === i || z === i || x === 20 - i || z === 20 - i;
      if (edge) sb.set(x, i, z, (x + z + i) % 7 === 0 ? B.cursed_sandstone : (i % 3 === 0 ? B.carved_sandstone : B.sandstone));
      else if (i < 9) sb.set(x, i, z, 0);
    }
  }
  sb.set(10, 10, 10, B.cursed_sandstone);
  // entrance tunnel on the north side
  for (let z = -2; z <= 1; z++) for (let y = 2; y < 5; y++) for (let x = 9; x <= 11; x++) sb.set(x, y, z, 0);
  for (let x = 8; x <= 12; x++) { sb.set(x, 5, -2, B.carved_sandstone); }
  // hall floor
  for (let z = 1; z < 20; z++) for (let x = 1; x < 20; x++) sb.set(x, 1, z, (x + z) % 2 ? B.sandstone : B.carved_sandstone);
  sb.set(10, 1, 10, 0);
  // stair shaft down to the titan's chamber
  for (let k = 0; k < 14; k++) { sb.set(10, 1 - k, 10, 0); sb.set(10, 1 - k, 11, B.ladder, 0); }
  // underground chamber (arena)
  const cy = -16;
  for (let y = cy; y < cy + 12; y++) for (let z = -2; z <= 22; z++) for (let x = -2; x <= 22; x++) {
    const dx = x - 10, dz = z - 10;
    const d = Math.hypot(dx, dz);
    if (d > 12.5) continue;
    const shell = d > 11.5 || y === cy || y === cy + 11;
    sb.set(x, y, z, shell ? (r.next() < 0.1 ? B.cursed_sandstone : B.sandstone) : 0);
  }
  for (const [x, z] of [[4, 4], [16, 4], [4, 16], [16, 16]]) for (let y = cy + 1; y < cy + 11; y++) sb.set(x, y, z, y % 3 === 0 ? B.cursed_sandstone : B.carved_sandstone);
  for (const [x, z] of [[10, 2], [2, 10], [18, 10], [10, 18]]) sb.set(x, cy + 3, z, B.torch);
  for (const [x, z] of [[8, 18], [12, 18]]) {
    sb.set(x, cy + 1, z, B.chest, 0);
    const [cx, cz] = sb.w(x, z);
    if (cx >= ctx.x0 && cx < ctx.x0 + 16 && cz >= ctx.z0 && cz < ctx.z0 + 16) out.push({ type: 'chest', x: cx, y: s.y - 2 + cy + 1, z: cz, loot: 'temple' });
  }
  const [bx, bz] = sb.w(10, 12);
  if (bx >= ctx.x0 && bx < ctx.x0 + 16 && bz >= ctx.z0 && bz < ctx.z0 + 16) out.push({ type: 'boss', kind: 'desert_titan', x: bx + 0.5, y: s.y - 2 + cy + 1, z: bz + 0.5, id: 'titan' + s.x + ',' + s.z });
}

function buildFrostSpire(gen, ctx, s, out) {
  const r = new RNG(s.seed);
  const sb = new SB(ctx, s.x, s.y, s.z, 0);
  // ring of tall ice spikes and an icy platform
  for (let k = 0; k < 9; k++) {
    const a = k / 9 * Math.PI * 2 + r.next() * 0.3;
    const rad = 9 + r.next() * 3;
    const x = Math.round(Math.cos(a) * rad), z = Math.round(Math.sin(a) * rad);
    const h = 8 + r.irange(0, 14);
    sb.foundation(gen, x - 2, z - 2, x + 2, z + 2, B.frost_ice);
    for (let y = -2; y < h; y++) {
      const w = Math.max(0, Math.floor((1 - y / h) * 2.2));
      for (let dz = -w; dz <= w; dz++) for (let dx = -w; dx <= w; dx++) if (Math.abs(dx) + Math.abs(dz) <= w) sb.set(x + dx, y, z + dz, y > h - 3 ? B.ice_spike : B.frost_ice);
    }
  }
  sb.foundation(gen, -7, -7, 7, 7, B.packed_snow || B.snow_block);
  for (let z = -7; z <= 7; z++) for (let x = -7; x <= 7; x++) if (x * x + z * z < 52) { sb.set(x, -1, z, B.frost_bricks); for (let y = 0; y < 8; y++) sb.set(x, y, z, 0); }
  sb.set(0, 0, 0, B.glow_lantern);
  if (s.x >= ctx.x0 && s.x < ctx.x0 + 16 && s.z >= ctx.z0 && s.z < ctx.z0 + 16) out.push({ type: 'boss', kind: 'frost_wyrm', x: s.x + 0.5, y: s.y + 1, z: s.z + 0.5, id: 'wyrm' + s.x + ',' + s.z });
}

function buildWardenGrove(gen, ctx, s, out) {
  const r = new RNG(s.seed);
  const sb = new SB(ctx, s.x, s.y + 1, s.z, 0);
  // circle of standing stones and a heartwood shrine
  for (let k = 0; k < 10; k++) {
    const a = k / 10 * Math.PI * 2;
    const x = Math.round(Math.cos(a) * 12), z = Math.round(Math.sin(a) * 12);
    sb.foundation(gen, x, z, x, z, B.mossy_ancient_bricks);
    for (let y = -1; y < 4 + (k % 3); y++) sb.set(x, y, z, y === 3 + (k % 3) - 1 ? B.rune_stone : B.mossy_ancient_bricks);
  }
  for (let z = -10; z <= 10; z++) for (let x = -10; x <= 10; x++) if (x * x + z * z < 100) { sb.set(x, -1, z, r.next() < 0.6 ? B.moss_block : B.forest_floor); for (let y = 0; y < 3; y++) { const c = [x, z]; void c; } }
  for (let y = -1; y < 3; y++) sb.set(0, y, 0, B.heartwood, 0);
  for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) sb.setIfAir(x, 0, z, B.glowcap);
  if (s.x >= ctx.x0 && s.x < ctx.x0 + 16 && s.z >= ctx.z0 && s.z < ctx.z0 + 16) out.push({ type: 'boss', kind: 'forest_warden', x: s.x + 0.5, y: s.y + 1, z: s.z + 3.5, id: 'warden' + s.x + ',' + s.z });
}

function buildCaldera(gen, ctx, s, out) {
  const sb = new SB(ctx, s.x, s.y, s.z, 0);
  sb.foundation(gen, -16, -16, 16, 16, B.basalt);
  for (let z = -16; z <= 16; z++) for (let x = -16; x <= 16; x++) {
    const d = Math.hypot(x, z);
    if (d > 16) continue;
    if (d > 13) { for (let y = 0; y < 4 + Math.round((d - 13) * 2); y++) sb.set(x, y, z, B.volcanic_bricks); continue; }
    sb.set(x, -1, z, d < 4 ? B.lava : (d < 6 ? B.magma : B.basalt));
    for (let y = 0; y < 14; y++) sb.set(x, y, z, 0);
  }
  if (s.x >= ctx.x0 && s.x < ctx.x0 + 16 && s.z >= ctx.z0 && s.z < ctx.z0 + 16) out.push({ type: 'boss', kind: 'volcanic_behemoth', x: s.x + 8.5, y: s.y, z: s.z + 0.5, id: 'behemoth' + s.x + ',' + s.z });
}

function buildMammothValley(gen, ctx, s, out) {
  // giant footprints leading toward the den, plus old bones
  const r = new RNG(s.seed);
  const T = gen.terrain;
  const a = r.next() * Math.PI * 2;
  for (let k = 3; k < 14; k++) {
    const px = Math.round(s.x + Math.cos(a) * k * 3 + (k % 2 ? 1.5 : -1.5) * Math.sin(a));
    const pz = Math.round(s.z + Math.sin(a) * k * 3 - (k % 2 ? 1.5 : -1.5) * Math.cos(a));
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const x = px + dx, z = pz + dz;
      if (x < ctx.x0 || x >= ctx.x0 + 16 || z < ctx.z0 || z >= ctx.z0 + 16) continue;
      const h = T.column(x, z, {}).height;
      ctx.force(x, h, z, B.mammoth_trail, 0);
      if (ctx.get(x, h + 1, z) === B.snow_layer) ctx.force(x, h + 1, z, 0, 0);
    }
  }
  // an ancient half-buried skeleton (spine + ribs), all from one base height so nothing floats
  const bx = s.x + 6, bz = s.z - 5;
  let base = 999;
  for (let i = 0; i < 9; i++) for (let dz = -3; dz <= 3; dz++) base = Math.min(base, T.column(bx + i, bz + dz, {}).height);
  const put = (x, y, z) => {
    if (x < ctx.x0 || x >= ctx.x0 + 16 || z < ctx.z0 || z >= ctx.z0 + 16) return;
    ctx.force(x, y, z, B.bone_block, 0);
  };
  for (let i = 0; i < 9; i++) put(bx + i, base + 3, bz);
  // ribs: continuous arcs from the spine down to the ground on both sides (every block shares a face with the next)
  for (let i = 1; i < 8; i += 2) {
    let prev = base;
    for (let dz = -3; dz <= 3; dz++) {
      const y = base + Math.round(Math.sqrt(Math.max(0, 9.5 - dz * dz)));
      for (let yy = Math.min(prev, y); yy <= Math.max(prev, y); yy++) put(bx + i, yy, bz + dz);
      prev = y;
    }
  }
  // skull and tusks
  for (let x = bx - 2; x <= bx - 1; x++) for (let y = base + 1; y <= base + 3; y++) for (let dz = -1; dz <= 1; dz++) if (!(dz !== 0 && y === base + 3)) put(x, y, bz + dz);
  for (const dz of [-1, 1]) { put(bx - 3, base + 1, bz + dz); put(bx - 4, base + 1, bz + dz); put(bx - 4, base + 2, bz + dz); }
  if (s.x >= ctx.x0 && s.x < ctx.x0 + 16 && s.z >= ctx.z0 && s.z < ctx.z0 + 16) out.push({ type: 'boss', kind: 'woolly_mammoth', x: s.x + 0.5, y: s.y + 1, z: s.z + 0.5, id: 'mammoth' + s.x + ',' + s.z });
}

function buildDragonRoost(gen, ctx, s, out) {
  const sb = new SB(ctx, s.x, s.y + 1, s.z, 0);
  sb.foundation(gen, -5, -5, 5, 5, B.scorched_stone);
  for (let z = -5; z <= 5; z++) for (let x = -5; x <= 5; x++) {
    const d = Math.hypot(x, z);
    if (d > 5) continue;
    sb.set(x, -1, z, B.dragon_nest);
    if (d > 3.5) sb.set(x, 0, z, B.bone_block);
    for (let y = d > 3.5 ? 1 : 0; y < 6; y++) sb.set(x, y, z, 0);
  }
  if (s.x >= ctx.x0 && s.x < ctx.x0 + 16 && s.z >= ctx.z0 && s.z < ctx.z0 + 16) out.push({ type: 'dragon', x: s.x + 0.5, y: s.y + 1, z: s.z + 0.5, id: 'dragon' + s.x + ',' + s.z, seed: s.seed });
}


// ---------------------------------------------------------------- the Sunken Pyramid (rare, open desert)
// Local frame: x 0..32 across, z 0..32 front to back, the entrance faces -z. The tomb lies beneath, a little south.
function buildPyramid(gen, ctx, s, out) {
  const r = new RNG(s.seed);
  const sb = new SB(ctx, s.x - 16, s.y, s.z - 16, 0);
  const N = 32;
  const rec = (x, y, z, o) => { const [wx, wz] = sb.w(x, z); if (wx >= ctx.x0 && wx < ctx.x0 + 16 && wz >= ctx.z0 && wz < ctx.z0 + 16) out.push(Object.assign({ x: wx, y: s.y + y, z: wz }, o)); };
  const W = (x, y, z) => { const [wx, wz] = sb.w(x, z); return [wx, s.y + y, wz]; };
  const id = 'pyr' + s.x + ',' + s.z;
  // ---- ground: a sandstone plaza and foundation; dunes over the footprint are cleared
  sb.foundation(gen, -4, -6, N + 4, N + 4, B.sandstone);
  sb.fill(-4, 0, -6, N + 4, 0, N + 4, B.sandstone);
  sb.fill(-4, 1, -6, N + 4, 22, N + 4, 0);
  for (let z = -6; z <= -1; z++) for (let x = 9; x <= 23; x++) sb.set(x, 0, z, (x + z) % 2 ? B.sandstone_bricks : B.sandstone);
  // ---- the stepped body
  for (let i = 0; i <= 15; i++) {
    const a = i, b2 = N - i;
    for (let z = a; z <= b2; z++) for (let x = a; x <= b2; x++) {
      const edge = x === a || z === a || x === b2 || z === b2;
      sb.set(x, i, z, edge ? (i % 4 === 3 ? B.carved_sandstone : B.sandstone) : B.sandstone_bricks);
    }
  }
  sb.set(16, 16, 16, B.gold_block);
  // obelisks and braziers either side of the approach
  for (const ox of [10, 22]) {
    for (let y = 1; y <= 6; y++) sb.set(ox, y, -4, y === 6 ? B.gold_block : y % 3 === 0 ? B.carved_sandstone : B.sandstone);
    sb.set(ox + (ox < 16 ? 2 : -2), 1, -2, B.brazier);
  }
  // ---- underground shell (tomb, stairwell, pit) so caves cannot breach it
  sb.fill(3, -12, 11, 29, -1, 41, B.sandstone_bricks);
  // ---- entrance corridor with a dart trap
  sb.fill(15, 1, 0, 17, 3, 9, 0);
  for (let y = 1; y <= 4; y++) { sb.set(14, y, 0, B.carved_sandstone); sb.set(18, y, 0, B.carved_sandstone); }
  for (let x = 14; x <= 18; x++) sb.set(x, 4, 0, B.carved_sandstone);
  sb.set(16, 5, 0, B.gold_block);
  for (let z = 1; z <= 9; z++) for (let x = 15; x <= 17; x++) sb.set(x, 0, z, B.sandstone_bricks);
  for (const z of [4, 7]) {
    sb.set(16, 1, z, B.sandstone_plate);
    sb.set(14, 2, z, B.cursed_sandstone); sb.set(18, 2, z, B.cursed_sandstone);
    const [px, py, pz] = W(16, 1, z), [ax, ay, az] = W(14, 2, z), [bx, by, bz] = W(18, 2, z);
    rec(16, 1, z, { type: 'trap', kind: 'darts', id: id + ':dart' + z, from: [[ax + 1, ay + 0.5, az + 0.5, 1, 0], [bx, by + 0.5, bz + 0.5, -1, 0]] });
    void px; void py; void pz;
  }
  sb.set(14, 3, 2, B.wall_sconce, 1); sb.set(18, 3, 2, B.wall_sconce, 3);
  // ---- the grand hall
  sb.fill(8, 1, 10, 24, 6, 24, 0);
  for (let z = 10; z <= 24; z++) for (let x = 8; x <= 24; x++) sb.set(x, 0, z, x >= 15 && x <= 17 ? B.blue_tiles : (x + z) % 2 ? B.sandstone_bricks : B.sandstone);
  for (const px of [11, 21]) for (const pz of [13, 17, 21]) for (let y = 1; y <= 6; y++) sb.set(px, y, pz, y === 4 ? B.sandstone : y === 6 ? B.gold_block : B.carved_sandstone);
  for (let x = 9; x <= 23; x++) if (x % 3 === 0) sb.set(x, 3, 25 - 1 + 1, B.cursed_sandstone);
  for (let z = 11; z <= 23; z++) if (z % 3 === 0) { sb.set(7, 3, z, B.cursed_sandstone); sb.set(25, 3, z, B.cursed_sandstone); }
  // mural on the back wall: a gold sun disc on azure, with rays
  for (let y = 2; y <= 5; y++) for (let x = 13; x <= 19; x++) sb.set(x, y, 25, B.blue_tiles);
  for (const [x, y] of [[16, 4], [15, 4], [17, 4], [16, 5], [16, 3]]) sb.set(x, y, 25, B.gold_block);
  for (const [x, y] of [[14, 2], [18, 2], [14, 5], [18, 5]]) sb.set(x, y, 25, B.baked_clay_yellow);
  // braziers in the corners, sconces on the walls
  for (const [x, z] of [[9, 11], [23, 11], [9, 23], [23, 23]]) sb.set(x, 1, z, B.brazier);
  for (const z of [14, 20]) { sb.set(8, 4, z, B.wall_sconce, 1); sb.set(24, 4, z, B.wall_sconce, 3); }
  // guardian statues flanking the way down
  for (const x of [13, 19]) { sb.set(x, 1, 12, B.carved_sandstone); sb.set(x, 2, 12, B.sandstone_bricks); sb.set(x, 3, 12, B.gold_block); sb.set(x, 1, 11, B.clay_urn); }
  // ---- stairwell down to the tomb (3 wide, one block per step)
  for (let k = 0; k <= 10; k++) {
    const z = 12 + k, y = -k;
    for (let x = 14; x <= 18; x++) {
      if (x === 14 || x === 18) { for (let yy = y - 1; yy <= Math.min(y + 4, 0); yy++) sb.set(x, yy, z, B.sandstone_bricks); continue; }
      sb.set(x, y, z, B.sandstone_stairs, 0);
      for (let yy = y + 1; yy <= y + 4; yy++) if (yy <= 6) sb.set(x, yy, z, 0);
      sb.set(x, y - 1, z, B.sandstone_bricks);
    }
  }
  for (let z = 12; z <= 22; z++) { sb.set(14, 1, z, B.sandstone_slab); sb.set(18, 1, z, B.sandstone_slab); }   // low parapet round the opening
  sb.set(14, -4, 17, B.wall_sconce, 1); sb.set(18, -4, 17, B.wall_sconce, 3);
  // ---- the tomb: an arena under the sands
  const T0 = -10, T1 = -3;
  sb.fill(6, T0, 23, 26, T1, 39, 0);
  for (let z = 23; z <= 39; z++) for (let x = 6; x <= 26; x++) sb.set(x, T0 - 1, z, (x + z) % 2 ? B.sandstone_bricks : B.carved_sandstone);
  for (let z = 23; z <= 39; z++) for (let x = 6; x <= 26; x++) if ((x + z) % 4 === 0) sb.set(x, T1 + 1, z, B.blue_tiles);
  for (const px of [9, 23]) for (const pz of [26, 31, 36]) for (let y = T0; y <= T1; y++) sb.set(px, y, pz, y === T0 + 3 ? B.cursed_sandstone : B.carved_sandstone);
  for (const [x, z] of [[7, 24], [25, 24], [7, 38], [25, 38]]) sb.set(x, T0, z, B.brazier);
  for (const z of [27, 35]) { sb.set(6, T0 + 3, z, B.wall_sconce, 1); sb.set(26, T0 + 3, z, B.wall_sconce, 3); }
  // the king's dais and sarcophagus
  sb.fill(12, T0, 31, 20, T0, 37, B.sandstone_bricks);
  sb.fill(14, T0 + 1, 32, 18, T0 + 1, 36, B.carved_sandstone);
  for (const [x, z] of [[14, 32], [18, 32], [14, 36], [18, 36]]) sb.set(x, T0 + 1, z, B.gold_block);
  for (const [x, z] of [[12, 31], [20, 31]]) sb.set(x, T0 + 1, z, B.clay_urn);
  for (const x of [11, 21]) sb.set(x, T0, 29, B.brazier);   // firelight on the king's face
  // treasure behind the dais
  for (const x of [11, 21]) {
    sb.set(x, T0, 38, B.chest, 2);
    rec(x, T0, 38, { type: 'chest', loot: 'pyramid_tomb' });
  }
  for (const x of [13, 19]) sb.set(x, T0, 39, B.gold_block);
  for (const x of [15, 16, 17]) sb.set(x, T0, 39, B.clay_urn);
  rec(16, T0 + 2, 34, { type: 'boss', kind: 'husk_king', id: 'husk' + s.x + ',' + s.z });
  // ---- west: the treasure room, with a floor that gives way
  sb.fill(4, 1, 13, 6, 3, 21, 0);
  for (let z = 16; z <= 17; z++) for (let y = 1; y <= 2; y++) sb.set(7, y, z, 0);
  for (const z of [14, 20]) { sb.set(4, 1, z, B.chest, 1); rec(4, 1, z, { type: 'chest', loot: 'pyramid' }); }
  sb.set(6, 1, 13, B.clay_urn); sb.set(6, 1, 21, B.clay_urn); sb.set(4, 1, 17, B.gold_block); sb.set(4, 2, 17, B.oil_lamp);
  // the pit under the doorway
  sb.fill(5, -4, 16, 6, -1, 17, 0);
  for (let z = 15; z <= 18; z++) for (let x = 4; x <= 7; x++) { sb.set(x, -5, z, B.sandstone_bricks); if (x === 4 || x === 7 || z === 15 || z === 18) for (let y = -4; y <= -1; y++) sb.set(x, y, z, B.sandstone_bricks); }
  sb.set(5, -4, 16, B.bone_block); sb.set(6, -4, 17, B.bone_block);
  for (let y = -4; y <= 0; y++) sb.set(5, y, 18 - 1 + 0, 0);
  for (let y = -4; y <= -1; y++) sb.set(4, y, 16, B.ladder, 1);
  const collapse = [];
  for (let z = 16; z <= 17; z++) for (let x = 5; x <= 6; x++) { sb.set(x, 0, z, B.sand); collapse.push(W(x, 0, z)); }
  rec(5, 0, 16, { type: 'trap', kind: 'collapse', id: id + ':pit', cells: collapse });
  // ---- east: the offering room and a hidden way through its south wall
  sb.fill(26, 1, 13, 28, 3, 21, 0);
  for (let z = 16; z <= 17; z++) for (let y = 1; y <= 2; y++) sb.set(25, y, z, 0);
  sb.set(28, 1, 17, B.chest, 3); rec(28, 1, 17, { type: 'chest', loot: 'pyramid' });
  for (const z of [13, 15, 19, 21]) sb.set(28, 1, z, B.clay_urn);
  sb.set(27, 1, 13, B.candle); sb.set(27, 1, 21, B.candle);
  sb.set(27, 1, 22, B.sandstone); sb.set(27, 2, 22, B.sandstone); sb.set(27, 3, 22, B.cursed_sandstone);   // the odd stones out
  sb.fill(27, 1, 23, 27, 2, 25, 0);
  sb.set(27, 1, 24, B.sandstone_plate);
  rec(27, 1, 24, { type: 'trap', kind: 'sandfall', id: id + ':sand', cells: [W(27, 2, 23), W(27, 1, 23)] });
  // the secret chamber
  sb.fill(24, 1, 26, 28, 2, 28, 0);
  sb.set(26, 1, 28, B.chest, 0); rec(26, 1, 28, { type: 'chest', loot: 'pyramid_secret' });
  sb.set(24, 1, 26, B.gold_block); sb.set(28, 1, 26, B.gold_block); sb.set(24, 1, 28, B.candle); sb.set(28, 1, 28, B.candle);
  for (let x = 24; x <= 28; x++) sb.set(x, 2, 29, B.cursed_sandstone);
  // the record that tells the game where the pyramid is (ambience, discovery)
  rec(16, 0, 16, { type: 'pyramid', id, cx: W(16, 0, 16), tomb: W(16, T0, 31) });
  void r;
}

// ---------------------------------------------------------------- entry
export function placeStructures(gen, ctx, cx, cz) {
  const out = [];
  const x0 = cx * 16, z0 = cz * 16;
  // structure builders need unrestricted writes inside the chunk
  ctx.force = (wx, wy, wz, id, m) => {
    const lx = wx - x0, lz = wz - z0;
    if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || wy < 1 || wy >= HEIGHT) return;
    const i = (wy << 8) | (lz << 4) | lx;
    ctx.blocks[i] = id; ctx.meta[i] = m || 0;
  };
  for (const s of nearbyStructures(gen, x0, z0, x0 + 15, z0 + 15)) {
    try {
      switch (s.type) {
        case 'village': buildVillage(gen, ctx, s, out); break;
        case 'ruin': buildRuin(gen, ctx, s, out, false); break;
        case 'ancient_ruin': buildRuin(gen, ctx, s, out, true); break;
        case 'wizard_tower': buildWizardTower(gen, ctx, s, out); break;
        case 'shipwreck': buildShipwreck(gen, ctx, s, out); break;
        case 'mineshaft': buildMineshaft(gen, ctx, s, out); break;
        case 'desert_temple': buildDesertTemple(gen, ctx, s, out); break;
        case 'frost_spire': buildFrostSpire(gen, ctx, s, out); break;
        case 'warden_grove': buildWardenGrove(gen, ctx, s, out); break;
        case 'caldera': buildCaldera(gen, ctx, s, out); break;
        case 'mammoth_valley': buildMammothValley(gen, ctx, s, out); break;
        case 'dragon_roost': buildDragonRoost(gen, ctx, s, out); break;
        case 'pyramid': buildPyramid(gen, ctx, s, out); break;
      }
    } catch (e) { console.error('structure build failed', s.type, e); }
  }
  return out;
}

// For /locate: list structures near a position
export function locateStructures(gen, x, z, radius) {
  return nearbyStructures(gen, x - radius, z - radius, x + radius, z + radius).map(s => ({ type: s.type, x: s.x, z: s.z }));
}
