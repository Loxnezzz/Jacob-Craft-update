// Chunk generator: terrain, caves, ores, surface, trees, plants, structures, initial lighting.
import { CHUNK, HEIGHT, SEA, CHUNK_VOL, idx } from './constants.js';
import { B, BLOCKS, LIGHT_FILTER, LIGHT_EMIT, IS_OPAQUE, IS_LIQUID } from './blocks.js';
import { BIOME, BIOMES, grassColor, foliageColor, SNOWY_BIOMES } from './biomes.js';
import { Terrain } from './terrain.js';
import { Simplex, RNG, hash2, hash3 } from '../core/noise.js';
import { TREES } from './trees.js';
import { placeStructures, structureExclusion } from './structures.js';

class TRNG extends RNG {
  constructor(seed, salt) { super(seed); this.salt = salt; }
  hash(x, y, z) { return hash3(x, y, z, this.salt) / 4294967296; }
}

// tree selection per biome: [chance per candidate, [[type, weight], ...]]
const TREE_TABLE = {
  [BIOME.PLAINS]: [0.018, [['oak', 8], ['big_oak', 1], ['birch', 2], ['bush', 2]]],
  [BIOME.FOREST]: [0.42, [['oak', 10], ['big_oak', 2], ['birch', 4], ['bush', 1]]],
  [BIOME.BIRCH_FOREST]: [0.4, [['birch', 10], ['oak', 1]]],
  [BIOME.ANCIENT_FOREST]: [0.5, [['elder', 3], ['big_oak', 4], ['oak', 2], ['bush', 3]]],
  [BIOME.TAIGA]: [0.42, [['pine', 10], ['bush', 1]]],
  [BIOME.SNOWY_TAIGA]: [0.32, [['snowy_pine', 10]]],
  [BIOME.TUNDRA]: [0.012, [['snowy_pine', 1]]],
  [BIOME.SAVANNA]: [0.035, [['umbrella', 5], ['bush', 1]]],
  [BIOME.JUNGLE]: [0.7, [['teak', 10], ['big_teak', 2], ['jungle_bush', 8]]],
  [BIOME.SWAMP]: [0.16, [['willow', 10]]],
  [BIOME.MOUNTAINS]: [0.05, [['pine', 6], ['oak', 1]]],
  [BIOME.BEACH]: [0.02, [['palm', 1]]],
  [BIOME.DESERT]: [0.0, [['palm', 1]]],
  [BIOME.BADLANDS]: [0.006, [['dead', 1]]],
  [BIOME.VOLCANIC]: [0.012, [['charred', 1]]],
};

const SOIL = new Set([B.grass, B.dirt, B.snowy_grass, B.forest_floor, B.moss_block, B.mud, B.sand, B.red_sand, B.ash, B.basalt, B.scorched_stone]);

const FLOWERS_PLAINS = [B.flower_sunpetal, B.flower_rosebell, B.flower_skybloom, B.flower_pinkmallow];
const FLOWERS_FOREST = [B.flower_rosebell, B.flower_frostlily, B.flower_duskviolet];

const ORES = [
  // [block, attempts, sizeMin, sizeMax, yMin, yMax, biomeFilter]
  [B.coal_ore, 18, 6, 14, 5, 150, null],
  [B.copper_ore, 9, 5, 10, 20, 110, null],
  [B.iron_ore, 11, 4, 9, 2, 80, null],
  [B.gold_ore, 3, 3, 7, 2, 34, null],
  [B.diamond_ore, 1.1, 2, 6, 2, 16, null],
  [B.emerald_ore, 3, 1, 3, 40, 170, new Set([BIOME.MOUNTAINS, BIOME.SNOWY_PEAKS])],
  [B.sunstone_ore, 4, 3, 7, 5, 55, new Set([BIOME.DESERT, BIOME.BADLANDS, BIOME.SAVANNA])],
  [B.frostite_ore, 4, 3, 6, 50, 185, new Set([BIOME.SNOWY_PEAKS, BIOME.TUNDRA, BIOME.SNOWY_TAIGA, BIOME.FROZEN_OCEAN])],
  [B.emberite_ore, 3, 2, 5, 3, 45, new Set([BIOME.VOLCANIC])],
  [B.gravel, 5, 15, 30, 5, 120, null],
  [B.dirt, 6, 15, 30, 30, 140, null],
  [B.granite, 4, 20, 40, 5, 120, null],
  [B.marble, 2, 20, 40, 5, 100, null],
  // phase 6: gunpowder minerals (kept last so older ore layouts are unchanged)
  [B.brimstone_ore, 5, 3, 8, 5, 90, new Set([BIOME.VOLCANIC, BIOME.BADLANDS])],
  [B.brimstone_ore, 0.7, 2, 5, 2, 22, null],
  [B.niter_ore, 6, 3, 7, 40, 100, new Set([BIOME.DESERT, BIOME.BADLANDS, BIOME.SAVANNA])],
  [B.niter_ore, 1.2, 2, 4, 10, 60, null],
];
const ORE_HOSTS = {
  [B.emberite_ore]: new Set([B.basalt, B.scorched_stone]),
  [B.brimstone_ore]: new Set([B.basalt, B.scorched_stone]),
  [B.niter_ore]: new Set([B.sandstone, B.baked_clay_orange, B.baked_clay_red, B.baked_clay_yellow, B.baked_clay_white, B.baked_clay_brown, B.baked_clay_gray]),
};

const NATURAL = new Set([B.stone, B.dirt, B.grass, B.sand, B.red_sand, B.gravel, B.clay, B.snowy_grass, B.forest_floor, B.moss_block, B.mud, B.granite, B.marble, B.sandstone, B.ash, B.basalt, B.scorched_stone, B.snow_block, B.darkstone, B.mammoth_trail].filter(v => v !== undefined));
const LEAVES = new Set(BLOCKS.filter(b => b.name.endsWith('_leaves')).map(b => b.id));
const ORE_IDS = new Set(BLOCKS.filter(b => b.name.endsWith('_ore') || b.name.startsWith('baked_clay') || ['magma', 'frost_ice', 'ice', 'packed_ice', 'obsidian', 'glacier_ice'].includes(b.name)).map(b => b.id));
const CLAY_BANDS = [B.baked_clay_orange, B.baked_clay_red, B.baked_clay_yellow, B.baked_clay_orange, B.baked_clay_white, B.baked_clay_brown, B.baked_clay_orange, B.baked_clay_red, B.baked_clay_gray, B.baked_clay_yellow, B.baked_clay_orange, B.baked_clay_white];

export class WorldGen {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.terrain = new Terrain(this.seed);
    const r = new RNG(this.seed ^ 0x1234567);
    this.nCaveA = new Simplex(r.nextInt());
    this.nCaveB = new Simplex(r.nextInt());
    this.nCheese = new Simplex(r.nextInt());
    this.nSurf = new Simplex(r.nextInt());
    this.nPatch = new Simplex(r.nextInt());
    this.nEntr = new Simplex(r.nextInt());
  }

  treeSiteOk(x, z, o, type) {
    const T = this.terrain;
    if (o.lavaLevel > 0) return false;
    if (this.nEntr.noise2(x / 70, z / 70) > 0.38) return false; // cave entrances may remove the soil
    const sandy = type === 'palm' || type === 'dead' || type === 'charred';
    const n = [T.column(x + 1, z, {}).height, T.column(x - 1, z, {}).height, T.column(x, z + 1, {}).height, T.column(x, z - 1, {}).height];
    const slope = Math.max(Math.abs(n[0] - n[1]), Math.abs(n[2] - n[3]));
    if ((o.biome === BIOME.MOUNTAINS || o.biome === BIOME.SNOWY_PEAKS) && slope > 4 && !sandy) return false;
    if (slope > 6) return false;
    if (!sandy && o.height < SEA + 2 && o.c < 0.08) return false; // beachy sand
    if (!sandy && (o.biome === BIOME.DESERT || o.biome === BIOME.BEACH || o.biome === BIOME.BADLANDS)) return false;
    return true;
  }

  generate(cx, cz) {
    const T = this.terrain;
    const blocks = new Uint8Array(CHUNK_VOL);
    const meta = new Uint8Array(CHUNK_VOL);
    const biomes = new Uint8Array(256);
    const tints = new Uint8Array(256 * 9);
    const x0 = cx * CHUNK, z0 = cz * CHUNK;

    // 18x18 column infos (with border ring for slopes)
    const cols = new Array(18 * 18);
    for (let z = -1; z <= 16; z++) for (let x = -1; x <= 16; x++) {
      cols[(z + 1) * 18 + (x + 1)] = T.column(x0 + x, z0 + z, {});
    }
    const col = (x, z) => cols[(z + 1) * 18 + (x + 1)];

    // ---------- cave noise (low res grid) ----------
    const GY = HEIGHT / 4 + 1;
    const caveA = new Float32Array(5 * 5 * GY), caveB = new Float32Array(5 * 5 * GY), caveC = new Float32Array(5 * 5 * GY);
    for (let gz = 0; gz < 5; gz++) for (let gx = 0; gx < 5; gx++) for (let gy = 0; gy < GY; gy++) {
      const wx = x0 + gx * 4, wy = gy * 4, wz = z0 + gz * 4;
      const i = (gy * 5 + gz) * 5 + gx;
      caveA[i] = this.nCaveA.noise3(wx / 64, wy / 42, wz / 64);
      caveB[i] = this.nCaveB.noise3(wx / 64, wy / 42, wz / 64);
      caveC[i] = this.nCheese.noise3(wx / 96, wy / 52, wz / 96);
    }
    const sampleGrid = (arr, x, y, z) => {
      const fx = x / 4, fy = y / 4, fz = z / 4;
      const ix = Math.min(3, fx | 0), iy = Math.min(GY - 2, fy | 0), iz = Math.min(3, fz | 0);
      const tx = fx - ix, ty = fy - iy, tz = fz - iz;
      const i000 = (iy * 5 + iz) * 5 + ix;
      const s = 25;
      const c00 = arr[i000] + (arr[i000 + 1] - arr[i000]) * tx;
      const c10 = arr[i000 + 5] + (arr[i000 + 6] - arr[i000 + 5]) * tx;
      const c01 = arr[i000 + s] + (arr[i000 + s + 1] - arr[i000 + s]) * tx;
      const c11 = arr[i000 + s + 5] + (arr[i000 + s + 6] - arr[i000 + s + 5]) * tx;
      const c0 = c00 + (c10 - c00) * tz, c1 = c01 + (c11 - c01) * tz;
      return c0 + (c1 - c0) * ty;
    };

    const surfaceY = new Int16Array(256);
    const rngB = new RNG(hash2(cx, cz, this.seed ^ 0xb00b));

    // ---------- terrain fill ----------
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const o = col(x, z);
      const wx = x0 + x, wz = z0 + z;
      const ci = z * 16 + x;
      biomes[ci] = o.biome;
      const bio = o.biome;

      // solid mask
      const overhang = o.m >= 0.25;
      let top = o.height, bandBase = 0, band = null;
      if (overhang) {
        bandBase = T.band(wx, wz, o);
        band = T.bandFlags.slice();
        top = bandBase;
        for (let k = 32; k >= 0; k--) if (band[k]) { top = bandBase + k; break; }
      }
      surfaceY[ci] = top;
      const solidAt = (y) => {
        if (!overhang) return y <= o.height;
        if (y < bandBase) return true;
        if (y > bandBase + 32) return false;
        return band[y - bandBase] === 1;
      };

      // slope estimate
      const hN = col(x, z - 1).height, hS = col(x, z + 1).height, hE = col(x + 1, z).height, hW = col(x - 1, z).height;
      const slope = Math.max(Math.abs(hN - hS), Math.abs(hE - hW));

      const snowLine = SEA + 88 + this.nSurf.noise2(wx / 30, wz / 30) * 6;
      const snowy = SNOWY_BIOMES.has(bio) || o.height > snowLine;
      const patch = this.nPatch.noise2(wx / 24, wz / 24);

      // choose materials
      let topB = B.grass, fill = B.dirt, fillDepth = 3 + ((hash2(wx, wz, this.seed) & 3) === 0 ? 1 : 0), under = B.sand;
      switch (bio) {
        case BIOME.DESERT: topB = B.sand; fill = B.sand; fillDepth = 4; break;
        case BIOME.BEACH: topB = B.sand; fill = B.sand; fillDepth = 3; break;
        case BIOME.SNOWY_BEACH: topB = B.sand; fill = B.sand; fillDepth = 3; break;
        case BIOME.BADLANDS: topB = B.red_sand; fill = B.red_sand; fillDepth = 1; break;
        case BIOME.SNOWY_PEAKS: topB = slope > 4 ? B.stone : (patch > 0.45 ? B.frost_ice : B.snow_block); fill = slope > 4 ? B.stone : B.snow_block; fillDepth = 2; break;
        case BIOME.MOUNTAINS: topB = slope > 4 ? (patch > 0.3 ? B.gravel : B.stone) : B.grass; fill = slope > 4 ? B.stone : B.dirt; break;
        case BIOME.ANCIENT_FOREST: topB = patch > 0.25 ? B.moss_block : B.forest_floor; break;
        case BIOME.TAIGA: topB = patch > 0.35 ? B.forest_floor : B.grass; break;
        case BIOME.SNOWY_TAIGA: case BIOME.TUNDRA: topB = B.snowy_grass; break;
        case BIOME.SWAMP: topB = patch > 0.4 ? B.mud : B.grass; break;
        case BIOME.VOLCANIC: topB = patch > 0.35 ? B.ash : patch < -0.4 ? B.magma : (patch > 0 ? B.scorched_stone : B.basalt); fill = B.basalt; fillDepth = 4; break;
        case BIOME.OCEAN: case BIOME.DEEP_OCEAN: case BIOME.FROZEN_OCEAN:
          topB = o.height < SEA - 20 ? B.gravel : (patch > 0.4 ? B.clay : patch < -0.4 ? B.gravel : B.sand); fill = topB === B.clay ? B.clay : B.sand; fillDepth = 3; break;
        case BIOME.RIVER: case BIOME.FROZEN_RIVER: topB = patch > 0.3 ? B.clay : patch < -0.3 ? B.gravel : B.sand; fill = B.sand; fillDepth = 2; break;
      }
      if (snowy && bio === BIOME.MOUNTAINS && slope <= 4) topB = B.snow_block;
      if ((bio === BIOME.MOUNTAINS || bio === BIOME.SNOWY_PEAKS) && slope > 6) { topB = B.stone; fill = B.stone; }
      if (bio === BIOME.DESERT || bio === BIOME.BEACH || bio === BIOME.SNOWY_BEACH) under = B.sandstone;
      if (bio === BIOME.VOLCANIC) under = B.basalt;

      const darkLevel = 14 + ((hash2(wx, wz, this.seed + 3) & 3));
      let depth = -1;
      const waterTop = Math.max(SEA, o.lavaLevel);
      for (let y = HEIGHT - 1; y >= 0; y--) {
        const i = idx(x, y, z);
        if (y === 0 || (y < 4 && rngB.next() < (4 - y) * 0.25)) { blocks[i] = B.bedrock; continue; }
        if (!solidAt(y)) {
          depth = -1;
          if (y <= SEA) blocks[i] = B.water;
          if (o.lavaLevel > 0 && y <= o.lavaLevel && y > o.height - 2) blocks[i] = B.lava;
          continue;
        }
        depth++;
        let b;
        const underwater = y < SEA && top < SEA;
        if (bio === BIOME.BADLANDS && depth >= 1) {
          const band = Math.floor((y + this.nSurf.noise2(wx / 60, wz / 60) * 3) / 2);
          b = y > SEA + 2 && depth < 30 ? CLAY_BANDS[((band % CLAY_BANDS.length) + CLAY_BANDS.length) % CLAY_BANDS.length] : B.stone;
          if (depth >= 1 && y > o.height - 1 && y > SEA + 30) b = CLAY_BANDS[((band % 12) + 12) % 12];
        } else if (depth === 0) {
          if (underwater) b = (topB === B.grass || topB === B.snowy_grass || topB === B.forest_floor || topB === B.moss_block || topB === B.mud || topB === B.snow_block) ? (bio === BIOME.SWAMP ? (patch > 0 ? B.clay : B.mud) : (y > SEA - 4 ? B.dirt : B.gravel)) : topB;
          else if (y < SEA + 2 && (topB === B.grass || topB === B.snowy_grass) && (bio === BIOME.PLAINS || bio === BIOME.SAVANNA || bio === BIOME.FOREST) && col(x, z).c < 0.08 && slope < 3) b = B.sand;
          else b = topB;
        } else if (depth <= fillDepth) {
          b = underwater && fill === B.dirt ? B.dirt : fill;
          if (depth === fillDepth && (fill === B.sand) && under) b = under;
        } else if (depth <= fillDepth + 3 && under === B.sandstone) {
          b = B.sandstone;
        } else {
          b = y < darkLevel ? B.darkstone : B.stone;
        }
        blocks[i] = b;
      }
      // frozen water surface
      if ((bio === BIOME.FROZEN_OCEAN || bio === BIOME.FROZEN_RIVER || (snowy && top < SEA)) && blocks[idx(x, SEA, z)] === B.water) {
        if (bio !== BIOME.FROZEN_OCEAN || patch > -0.5) blocks[idx(x, SEA, z)] = B.ice;
      }
      void waterTop;
    }

    // ---------- caves ----------
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const ci = z * 16 + x;
      const top = surfaceY[ci];
      const o = col(x, z);
      const wx = x0 + x, wz = z0 + z;
      const entrance = this.nEntr.noise2(wx / 70, wz / 70) > 0.45 && top > SEA + 2;
      let maxY = top < SEA + 1 ? top - 9 : (entrance ? top + 1 : top - 6);
      if (o.lavaLevel > 0) maxY = Math.min(maxY, top - 10);
      for (let y = 1; y <= maxY && y < HEIGHT - 1; y++) {
        const i = idx(x, y, z);
        const b = blocks[i];
        if (b === B.bedrock || b === B.water || b === B.lava || b === 0) continue;
        const a = sampleGrid(caveA, x, y, z), bb = sampleGrid(caveB, x, y, z);
        const depthFactor = y < 50 ? 1.25 : 1.0;
        let cave = a * a + bb * bb < 0.0055 * depthFactor;
        if (!cave && y < 60) {
          const c = sampleGrid(caveC, x, y, z);
          cave = c > 0.6 - (60 - y) * 0.002;
        }
        if (cave) {
          // don't open into water above
          const above = blocks[idx(x, y + 1, z)];
          if (above === B.water) continue;
          blocks[i] = y <= 10 ? B.lava : 0;
        }
      }
    }

    // ---------- ores ----------
    const rOre = new RNG(hash2(cx, cz, this.seed ^ 0x0e5));
    for (const [ore, att, smin, smax, ymin, ymax, filter] of ORES) {
      let n = Math.floor(att) + (rOre.next() < att - Math.floor(att) ? 1 : 0);
      for (let a = 0; a < n; a++) {
        let x = rOre.irange(0, 15), z = rOre.irange(0, 15), y = rOre.irange(ymin, ymax);
        if (filter && !filter.has(biomes[z * 16 + x])) continue;
        const size = rOre.irange(smin, smax);
        for (let s = 0; s < size; s++) {
          if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < HEIGHT) {
            const i = idx(x, y, z);
            const b = blocks[i];
            if (b === B.stone || b === B.darkstone || (ORE_HOSTS[ore] && ORE_HOSTS[ore].has(b))) blocks[i] = ore;
          }
          const d = rOre.irange(0, 5);
          if (d === 0) x++; else if (d === 1) x--; else if (d === 2) y++; else if (d === 3) y--; else if (d === 4) z++; else z--;
        }
      }
    }

    // ---------- features context ----------
    const ctx = {
      put(wx, wy, wz, id, m = 0) {
        const lx = wx - x0, lz = wz - z0;
        if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || wy < 1 || wy >= HEIGHT) return;
        const i = idx(lx, wy, lz);
        const cur = blocks[i];
        if (cur !== 0 && !BLOCKS[cur].replaceable && !BLOCKS[cur].name.endsWith('_leaves')) return;
        // decorations such as trunk vines must not punch holes in a neighbouring canopy (that strands single leaves)
        if (cur !== 0 && !BLOCKS[id].solid && BLOCKS[cur].name.endsWith('_leaves')) return;
        blocks[i] = id; meta[i] = m;
      },
      log(wx, wy, wz, id, axis) {
        const lx = wx - x0, lz = wz - z0;
        if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || wy < 1 || wy >= HEIGHT) return;
        const i = idx(lx, wy, lz);
        const cur = blocks[i];
        if (cur === B.bedrock) return;
        if (cur !== 0 && !BLOCKS[cur].replaceable && !BLOCKS[cur].name.endsWith('_leaves') && cur !== B.dirt && cur !== B.grass && cur !== B.forest_floor && cur !== B.moss_block && cur !== B.snowy_grass && cur !== B.mud && cur !== B.sand) return;
        blocks[i] = id; meta[i] = axis;
      },
      leaf(wx, wy, wz, id, hanging) {
        const lx = wx - x0, lz = wz - z0;
        if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || wy < 1 || wy >= HEIGHT) return;
        const i = idx(lx, wy, lz);
        const cur = blocks[i];
        if (cur !== 0 && !(BLOCKS[cur].replaceable && cur !== B.water)) return;
        blocks[i] = id; meta[i] = hanging ? 4 : 0;
      },
      get(wx, wy, wz) {
        const lx = wx - x0, lz = wz - z0;
        if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || wy < 0 || wy >= HEIGHT) return -1;
        return blocks[idx(lx, wy, lz)];
      },
      x0, z0, blocks, meta,
    };

    // ---------- structures (before trees so trees can avoid them) ----------
    const structInfo = placeStructures(this, ctx, cx, cz);

    // ---------- trees (neighbor-aware) ----------
    const tmpCol = {};
    for (let ncz = cz - 1; ncz <= cz + 1; ncz++) for (let ncx = cx - 1; ncx <= cx + 1; ncx++) {
      const salt = hash2(ncx, ncz, this.seed ^ 0x7ee);
      const rc = new RNG(salt);
      const candidates = 32;
      for (let k = 0; k < candidates; k++) {
        const tx = ncx * 16 + rc.irange(0, 15), tz = ncz * 16 + rc.irange(0, 15);
        const roll = rc.next(), pick = rc.next(), tseed = rc.nextInt();
        // early reject: too far to affect this chunk (max canopy reach ~14)
        if (tx < x0 - 15 || tx > x0 + 30 || tz < z0 - 15 || tz > z0 + 30) continue;
        const o = T.column(tx, tz, tmpCol);
        const table = TREE_TABLE[o.biome];
        if (!table) continue;
        let chance = table[0];
        if (o.biome === BIOME.DESERT && o.height <= SEA + 2) chance = 0.12; // oasis palms
        if (o.biome === BIOME.BEACH && o.te < 0.15) chance = 0;
        if (o.biome === BIOME.MOUNTAINS && o.height > SEA + 60) chance *= 0.3;
        if (roll >= chance) continue;
        if (o.height < SEA || o.river) continue;
        const sy = o.m >= 0.25 ? T.surfaceY(tx, tz, o) : o.height;
        if (sy < SEA) continue;
        if (structureExclusion(this, tx, tz)) continue;
        // pick type
        const list = table[1];
        let total = 0; for (const [, w] of list) total += w;
        let p = pick * total, type = list[0][0];
        for (const [t, w] of list) { if (p < w) { type = t; break; } p -= w; }
        // Site validity must be decided purely from terrain functions (never from this chunk's blocks):
        // a tree whose canopy crosses into a neighbour chunk must make the same decision there.
        if (!this.treeSiteOk(tx, tz, o, type)) continue;
        const g = ctx.get(tx, sy, tz);
        const tr = new TRNG(tseed, tseed ^ 0x5bd1e995);
        TREES[type](ctx, tx, sy + 1, tz, tr);
        if (g !== -1 && (g === B.grass || g === B.snowy_grass)) ctx.blocks[idx(tx - x0, sy, tz - z0)] = B.dirt;
      }
    }

    // ---------- plants & surface details ----------
    const rP = new RNG(hash2(cx, cz, this.seed ^ 0x91a7));
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const ci = z * 16 + x;
      const o = col(x, z);
      const bio = o.biome;
      const wx = x0 + x, wz = z0 + z;
      // find top non-air
      let y = HEIGHT - 2;
      while (y > 0 && blocks[idx(x, y, z)] === 0) y--;
      const b = blocks[idx(x, y, z)];
      const above = idx(x, y + 1, z);
      const r = rP.next(), r2 = rP.next();
      if (b === B.water) {
        // underwater flora
        let fy = y; while (fy > 0 && blocks[idx(x, fy, z)] === B.water) fy--;
        const depthW = y - fy;
        const floor = blocks[idx(x, fy, z)];
        if (depthW >= 2 && (floor === B.sand || floor === B.gravel || floor === B.clay || floor === B.dirt || floor === B.mud)) {
          const warm = o.te > 0.3 && (bio === BIOME.OCEAN);
          if (warm && this.nPatch.noise2(wx / 14, wz / 14) > 0.35 && depthW > 3) {
            const reef = [B.reef_pink, B.reef_blue, B.reef_yellow][hash2(wx >> 2, wz >> 2, 5) % 3];
            const hh = 1 + (hash2(wx, wz, 9) % 3);
            for (let k = 1; k <= hh && fy + k < y - 1; k++) blocks[idx(x, fy + k, z)] = reef;
          } else if (r < 0.035 && depthW > 4) {
            const len = 2 + Math.floor(r2 * (depthW - 2));
            for (let k = 1; k <= len && fy + k < y; k++) blocks[idx(x, fy + k, z)] = B.kelp;
          } else if (r < 0.2) blocks[idx(x, fy + 1, z)] = B.seagrass;
        }
        if (bio === BIOME.SWAMP && depthW <= 2 && r < 0.08 && blocks[above] === 0) blocks[above] = B.lily_pad;
        continue;
      }
      if (blocks[above] !== 0) continue;
      const nearWater = (dx, dz) => {
        const lx = x + dx, lz = z + dz;
        if (lx < 0 || lx > 15 || lz < 0 || lz > 15) return false;
        return blocks[idx(lx, y, lz)] === B.water;
      };
      const waterAdj = nearWater(1, 0) || nearWater(-1, 0) || nearWater(0, 1) || nearWater(0, -1);
      if (waterAdj && (b === B.grass || b === B.sand || b === B.dirt || b === B.mud) && r < 0.12 && bio !== BIOME.FROZEN_RIVER) {
        const hh = 1 + Math.floor(r2 * 3);
        for (let k = 1; k <= hh; k++) blocks[idx(x, y + k, z)] = B.reeds;
        continue;
      }
      if (b === B.grass) {
        let p = null;
        switch (bio) {
          case BIOME.PLAINS: p = r < 0.28 ? B.tall_grass : r < 0.315 ? FLOWERS_PLAINS[(r2 * 4) | 0] : r < 0.317 ? B.berry_bush : null; break;
          case BIOME.FOREST: case BIOME.BIRCH_FOREST: p = r < 0.14 ? B.tall_grass : r < 0.19 ? B.fern : r < 0.205 ? FLOWERS_FOREST[(r2 * 3) | 0] : r < 0.212 ? (r2 < 0.5 ? B.mushroom_red : B.mushroom_brown) : r < 0.216 ? B.berry_bush : null; break;
          case BIOME.TAIGA: p = r < 0.15 ? B.fern : r < 0.22 ? B.tall_grass : r < 0.235 ? B.berry_bush : r < 0.245 ? B.mushroom_brown : null; break;
          case BIOME.SAVANNA: p = r < 0.4 ? B.tall_grass : r < 0.405 ? B.flower_sunpetal : null; break;
          case BIOME.JUNGLE: p = r < 0.22 ? B.fern : r < 0.48 ? B.tall_grass : r < 0.49 ? B.flower_rosebell : r < 0.494 ? B.pumpkin : r < 0.5 ? B.flower_pinkmallow : null; break;
          case BIOME.SWAMP: p = r < 0.12 ? B.tall_grass : r < 0.17 ? B.fern : r < 0.18 ? B.mushroom_brown : r < 0.19 ? B.flower_duskviolet : null; break;
          case BIOME.MOUNTAINS: p = r < 0.1 ? B.tall_grass : r < 0.11 ? B.flower_skybloom : null; break;
          case BIOME.ANCIENT_FOREST: p = r < 0.1 ? B.tall_grass : r < 0.25 ? B.fern : null; break;
          default: p = r < 0.1 ? B.tall_grass : null;
        }
        if (p !== null) blocks[above] = p;
      } else if (b === B.moss_block || b === B.forest_floor) {
        if (bio === BIOME.ANCIENT_FOREST) {
          blocks[above] = r < 0.2 ? B.fern : r < 0.24 ? B.glowcap : r < 0.28 ? B.mushroom_red : r < 0.3 ? B.flower_duskviolet : r < 0.36 ? B.tall_grass : 0;
        } else if (r < 0.12) blocks[above] = B.fern;
      } else if (b === B.sand && bio === BIOME.DESERT) {
        if (r < 0.005 && x > 0 && x < 15 && z > 0 && z < 15) {
          const hh = 1 + Math.floor(r2 * 3);
          for (let k = 1; k <= hh; k++) blocks[idx(x, y + k, z)] = B.cactus;
        } else if (r < 0.013) blocks[above] = B.dead_bush;
      } else if (b === B.red_sand || (bio === BIOME.BADLANDS && b !== 0)) {
        if (r < 0.012) blocks[above] = B.dead_bush;
      } else if (b === B.snowy_grass && r < 0.01) {
        blocks[above] = B.flower_frostlily;
      }
      void ci;
    }

    // ---------- snow cover ----------
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const o = col(x, z);
      const snowLine = SEA + 88 + this.nSurf.noise2((x0 + x) / 30, (z0 + z) / 30) * 6;
      if (!(SNOWY_BIOMES.has(o.biome) || o.height > snowLine)) continue;
      let y = HEIGHT - 2;
      while (y > 0 && blocks[idx(x, y, z)] === 0) y--;
      const b = blocks[idx(x, y, z)];
      if (b === B.grass) blocks[idx(x, y, z)] = B.snowy_grass;
      if (b === B.water || b === B.ice || b === B.lava || b === B.snow_layer) continue;
      const bd = BLOCKS[b];
      if (bd.replaceable && b !== 0) { blocks[idx(x, y, z)] = B.snow_layer; continue; }
      if ((IS_OPAQUE[b] || bd.name.endsWith('_leaves')) && y + 1 < HEIGHT) {
        blocks[idx(x, y + 1, z)] = B.snow_layer;
        meta[idx(x, y + 1, z)] = 0;
      }
    }

    // ---------- cleanup: no lone floating voxels ----------
    // cave carving and canopy holes can leave single terrain blocks or leaves with no face neighbours; remove them
    // (and whatever plant or snow sat on top) so nothing hangs in the air.
    {
      const solidish = (id) => id !== 0 && !IS_LIQUID[id] && (BLOCKS[id].solid || LEAVES.has(id));
      // on the chunk border only terrain is checked (the unseen side is assumed empty: at worst a one-block lip
      // goes); border leaves may belong to a canopy in the next chunk, so they stay.
      const sol = (x, y, z) => x >= 0 && x < 16 && z >= 0 && z < 16 && solidish(blocks[idx(x, y, z)]);
      const wat = (x, y, z) => x >= 0 && x < 16 && z >= 0 && z < 16 && IS_LIQUID[blocks[idx(x, y, z)]] === 1;
      for (let y = 2; y < HEIGHT - 2; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        const i = idx(x, y, z), b = blocks[i];
        const edge = x === 0 || x === 15 || z === 0 || z === 15;
        if (edge ? !(NATURAL.has(b) || ORE_IDS.has(b)) : !NATURAL.has(b) && !LEAVES.has(b)) continue;
        if (sol(x + 1, y, z) || sol(x - 1, y, z) || sol(x, y + 1, z) || sol(x, y - 1, z) || sol(x, y, z + 1) || sol(x, y, z - 1)) continue;
        if (edge && IS_LIQUID[blocks[idx(x, y - 1, z)]]) continue;
        const nearWater = wat(x + 1, y, z) || wat(x - 1, y, z) || wat(x, y, z + 1) || wat(x, y, z - 1) || wat(x, y + 1, z);
        blocks[i] = nearWater && y <= SEA ? B.water : 0; meta[i] = 0;
        const above = blocks[idx(x, y + 1, z)];
        if (above && !IS_LIQUID[above] && (BLOCKS[above].replaceable || BLOCKS[above].shape === 2 || BLOCKS[above].shape === 11)) { blocks[idx(x, y + 1, z)] = 0; meta[idx(x, y + 1, z)] = 0; }
      }
      // small detached clumps (a cave-cut overhang chip, a stray strip of canopy): flood from every block that has
      // nothing under it; a clump of at most 12 natural blocks that touches nothing else and stays inside this
      // chunk is removed. Anything touching a log, a structure block or the chunk border is left alone.
      // keep[] marks blocks already proven to belong to a component that stays (anything touching them stays too);
      // stamp[] is the per-flood visited mark.
      const MAXC = 12, keep = new Uint8Array(blocks.length), stamp = new Int32Array(blocks.length), comp = [];
      let fid = 0;
      const natural = (id) => NATURAL.has(id) || LEAVES.has(id) || ORE_IDS.has(id);
      for (let y = 3; y < HEIGHT - 2; y++) for (let z = 1; z < 15; z++) for (let x = 1; x < 15; x++) {
        const i = idx(x, y, z);
        if (keep[i] || !natural(blocks[i]) || solidish(blocks[idx(x, y - 1, z)])) continue;
        fid++; comp.length = 0; comp.push(i); stamp[i] = fid;
        let ok = true;
        for (let h = 0; h < comp.length && ok; h++) {
          const j = comp[h], jx = j & 15, jz = (j >> 4) & 15, jy = j >> 8;
          if (jx === 0 || jx === 15 || jz === 0 || jz === 15 || jy <= 2 || IS_LIQUID[blocks[j - 256]]) { ok = false; break; } // ice floes may rest on water
          for (const n of [j + 1, j - 1, j + 16, j - 16, j + 256, j - 256]) {
            if (stamp[n] === fid || !solidish(blocks[n])) continue;
            if (keep[n] || !natural(blocks[n]) || comp.length >= MAXC) { ok = false; break; }
            stamp[n] = fid; comp.push(n);
          }
        }
        if (!ok) { for (const j of comp) keep[j] = 1; continue; }
        for (const j of comp) {
          const jy = j >> 8;
          const wet = jy <= SEA && (IS_LIQUID[blocks[j + 1]] === 1 || IS_LIQUID[blocks[j - 1]] === 1 || IS_LIQUID[blocks[j + 16]] === 1 || IS_LIQUID[blocks[j - 16]] === 1 || IS_LIQUID[blocks[j + 256]] === 1);
          blocks[j] = wet ? B.water : 0; meta[j] = 0;
          const up = blocks[j + 256];
          if (up && !IS_LIQUID[up] && (BLOCKS[up].replaceable || BLOCKS[up].shape === 2 || BLOCKS[up].shape === 11)) { blocks[j + 256] = 0; meta[j + 256] = 0; }
        }
      }
    }

    // ---------- tints ----------
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const o = col(x, z);
      const g = grassColor(o.te, o.h, o.biome), f = foliageColor(o.te, o.h, o.biome), w = BIOMES[o.biome].water;
      const i = (z * 16 + x) * 9;
      tints[i] = g[0] * 255; tints[i + 1] = g[1] * 255; tints[i + 2] = g[2] * 255;
      tints[i + 3] = f[0] * 255; tints[i + 4] = f[1] * 255; tints[i + 5] = f[2] * 255;
      tints[i + 6] = w[0] * 255; tints[i + 7] = w[1] * 255; tints[i + 8] = w[2] * 255;
    }

    const light = computeLocalLight(blocks);
    const heightmap = computeHeightmap(blocks);
    return { cx, cz, blocks, meta, light, biomes, tints, heightmap, structures: structInfo };
  }
}

// Highest non-air, light-blocking-or-precip-blocking block per column (+1 = first free cell)
export function computeHeightmap(blocks) {
  const hm = new Int16Array(256);
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    let y = HEIGHT - 1;
    while (y > 0) {
      const b = blocks[idx(x, y, z)];
      if (b !== 0 && BLOCKS[b].solid !== false || b === B.water || b === B.lava || (b !== 0 && LIGHT_FILTER[b] > 0)) break;
      y--;
    }
    hm[z * 16 + x] = y + 1;
  }
  return hm;
}

// Sky light + block light computed inside the chunk only (cross-chunk merge happens on main thread).
export function computeLocalLight(blocks) {
  const light = new Uint8Array(CHUNK_VOL);
  const queue = new Int32Array(CHUNK_VOL * 2);
  let qh = 0, qt = 0;
  // sky columns
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    let l = 15;
    for (let y = HEIGHT - 1; y >= 0; y--) {
      const i = idx(x, y, z);
      const f = LIGHT_FILTER[blocks[i]];
      if (f >= 15) l = 0;
      else if (f > 0) l = Math.max(0, l - f);
      if (l === 0) break;
      light[i] = l << 4;
    }
  }
  // seed horizontal spread from sky-lit cells adjacent to darker transparent cells
  for (let y = 1; y < HEIGHT - 1; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const i = idx(x, y, z);
    const s = light[i] >> 4;
    if (s < 2) continue;
    let need = false;
    if (x > 0 && (light[i - 1] >> 4) < s - 1 && LIGHT_FILTER[blocks[i - 1]] < 15) need = true;
    else if (x < 15 && (light[i + 1] >> 4) < s - 1 && LIGHT_FILTER[blocks[i + 1]] < 15) need = true;
    else if (z > 0 && (light[i - 16] >> 4) < s - 1 && LIGHT_FILTER[blocks[i - 16]] < 15) need = true;
    else if (z < 15 && (light[i + 16] >> 4) < s - 1 && LIGHT_FILTER[blocks[i + 16]] < 15) need = true;
    else if ((light[i - 256] >> 4) < s - 1 && LIGHT_FILTER[blocks[i - 256]] < 15) need = true;
    if (need) queue[qt++] = i;
  }
  const spread = (shift, mask) => {
    while (qh < qt) {
      const i = queue[qh++];
      const l = (light[i] >> shift) & 15;
      if (l <= 1) continue;
      const x = i & 15, z = (i >> 4) & 15, y = i >> 8;
      for (let d = 0; d < 6; d++) {
        let j;
        if (d === 0) { if (x === 15) continue; j = i + 1; }
        else if (d === 1) { if (x === 0) continue; j = i - 1; }
        else if (d === 2) { if (z === 15) continue; j = i + 16; }
        else if (d === 3) { if (z === 0) continue; j = i - 16; }
        else if (d === 4) { if (y === HEIGHT - 1) continue; j = i + 256; }
        else { if (y === 0) continue; j = i - 256; }
        const f = LIGHT_FILTER[blocks[j]];
        if (f >= 15) continue;
        const nl = l - 1 - f;
        if (nl <= ((light[j] >> shift) & 15)) continue;
        light[j] = (light[j] & ~mask) | (nl << shift);
        queue[qt++] = j;
        if (qt >= queue.length) qt = 0; // shouldn't happen
      }
    }
  };
  spread(4, 0xf0);
  // block light
  qh = 0; qt = 0;
  for (let i = 0; i < CHUNK_VOL; i++) {
    const e = LIGHT_EMIT[blocks[i]];
    if (e > 0) { light[i] = (light[i] & 0xf0) | e; queue[qt++] = i; }
  }
  spread(0, 0x0f);
  return light;
}
