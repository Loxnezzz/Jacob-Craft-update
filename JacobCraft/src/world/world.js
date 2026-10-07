// Main-thread world: chunk streaming, cross-chunk lighting, block edits, fluids, scheduled & random ticks.
import { CHUNK, HEIGHT, SEA, idx, chunkKey } from './constants.js';
import {
  BLOCKS, B, SHAPE, LIGHT_FILTER, LIGHT_EMIT, IS_LIQUID, IS_OPAQUE, IS_WATERLOGGED, BLOCK_SHAPE,
} from './blocks.js';
import { buildPadded } from './mesher.js';
import { Terrain } from './terrain.js';
import { BIOMES } from './biomes.js';

export class Chunk {
  constructor(cx, cz, d) {
    this.cx = cx; this.cz = cz;
    this.key = chunkKey(cx, cz);
    this.blocks = d.blocks; this.meta = d.meta; this.light = d.light;
    this.biomes = d.biomes; this.tints = d.tints; this.heightmap = d.heightmap;
    this.structures = d.structures || [];
    this.dirty = true;
    this.urgent = false;
    this.meshing = false;
    this.meshVer = 0;
    this.mesh = null;     // renderer-owned GPU data
    this.modified = !!d.restored;
    this.savedVersion = 0;
    this.editVersion = 0;
    this.restored = !!d.restored;
  }
}

const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]];

export class World {
  constructor(seed, opts = {}) {
    this.seed = seed >>> 0;
    this.terrain = new Terrain(this.seed);
    this.chunks = new Map();
    this.pending = new Map(); // key -> worker index
    this.renderDistance = opts.renderDistance || 8;
    this.saver = opts.saver || null;
    this.events = {
      onMesh: null,        // (chunk, data)
      onUnload: null,      // (chunk)
      onChunkLoaded: null, // (chunk)
      onDrop: null,        // (x,y,z,itemName|id,count)
      onBlockChanged: null,// (x,y,z,old,new)
    };
    const nGen = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 2));
    this.genWorkers = [];
    this.genLoad = [];
    for (let i = 0; i < nGen; i++) {
      const w = new Worker(new URL('../workers/genWorker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => this._onGen(e.data, i);
      w.onerror = (e) => console.error('gen worker error', e.message || e);
      w.postMessage({ type: 'init', seed: this.seed });
      this.genWorkers.push(w); this.genLoad.push(0);
    }
    const nMesh = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 2));
    this.meshWorkers = [];
    this.meshLoad = [];
    for (let i = 0; i < nMesh; i++) {
      const w = new Worker(new URL('../workers/meshWorker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => this._onMesh(e.data, i);
      w.onerror = (e) => console.error('mesh worker error', e.message || e);
      this.meshWorkers.push(w); this.meshLoad.push(0);
    }
    this.centerCX = 1e9; this.centerCZ = 1e9;
    this.wanted = [];
    this.wantTimer = 0;
    this._last = null;
    // lighting queues
    this.qC = []; this.qI = new Int32Array(1 << 16); this.qL = new Uint8Array(1 << 16);
    // ticks
    this.tick = 0;
    this.scheduled = new Map(); // key -> tick
    this.tickQueue = new Map(); // tick -> [x,y,z,...]
    this.randomTickSpeed = 3;
    this.stats = { genReq: 0, meshReq: 0 };
  }

  destroy() {
    for (const w of this.genWorkers) w.terminate();
    for (const w of this.meshWorkers) w.terminate();
  }

  // ---------- access ----------
  getChunk(cx, cz) {
    const l = this._last;
    if (l && l.cx === cx && l.cz === cz) return l;
    const c = this.chunks.get(chunkKey(cx, cz));
    if (c) this._last = c;
    return c;
  }
  chunkAt(x, z) { return this.getChunk(Math.floor(x / 16), Math.floor(z / 16)); }
  isLoaded(x, z) { return !!this.chunkAt(x, z); }
  getBlock(x, y, z) {
    if (y < 0 || y >= HEIGHT) return 0;
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return 0;
    return c.blocks[idx(x & 15, y, z & 15)];
  }
  getMeta(x, y, z) {
    if (y < 0 || y >= HEIGHT) return 0;
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return 0;
    return c.meta[idx(x & 15, y, z & 15)];
  }
  getLight(x, y, z) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    if (y >= HEIGHT) return 0xf0;
    if (y < 0) return 0;
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return 0xf0;
    return c.light[idx(x & 15, y, z & 15)];
  }
  skyLight(x, y, z) { return this.getLight(x, y, z) >> 4; }
  blockLight(x, y, z) { return this.getLight(x, y, z) & 15; }
  heightAt(x, z) {
    x = Math.floor(x); z = Math.floor(z);
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return SEA;
    return c.heightmap[((z & 15) << 4) | (x & 15)];
  }
  biomeAt(x, z) {
    x = Math.floor(x); z = Math.floor(z);
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return this.terrain.column(x, z, {}).biome;
    return c.biomes[((z & 15) << 4) | (x & 15)];
  }
  biomeInfo(x, z) { return BIOMES[this.biomeAt(x, z)]; }

  // ---------- streaming ----------
  update(px, pz, dt, camDir) {
    const pcx = Math.floor(px / 16), pcz = Math.floor(pz / 16);
    this.wantTimer -= dt;
    if (pcx !== this.centerCX || pcz !== this.centerCZ || this.wantTimer <= 0) {
      this.centerCX = pcx; this.centerCZ = pcz;
      this.wantTimer = 0.5;
      this._rebuildWanted(pcx, pcz);
      this._unloadFar(pcx, pcz);
    }
    // dispatch generation
    for (let k = 0; k < this.wanted.length; k++) {
      const w = this.wanted[k];
      if (this.chunks.has(w.key) || this.pending.has(w.key)) continue;
      let best = -1, bl = 1e9;
      for (let i = 0; i < this.genWorkers.length; i++) if (this.genLoad[i] < bl) { bl = this.genLoad[i]; best = i; }
      if (bl >= 3) break;
      this._requestChunk(w.cx, w.cz, best);
    }
    this._dispatchMeshing(px, pz, camDir);
  }

  _rebuildWanted(pcx, pcz) {
    const R = this.renderDistance + 1;
    const list = [];
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const d = dx * dx + dz * dz;
      if (d > (R + 0.5) * (R + 0.5)) continue;
      list.push({ cx: pcx + dx, cz: pcz + dz, key: chunkKey(pcx + dx, pcz + dz), d });
    }
    list.sort((a, b) => a.d - b.d);
    this.wanted = list;
  }

  _unloadFar(pcx, pcz) {
    const R = this.renderDistance + 3;
    for (const c of this.chunks.values()) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz > R * R) this._unload(c);
    }
  }

  _unload(c) {
    if (c.modified && this.saver) this.saver.saveChunk(c);
    if (this.events.onUnload) this.events.onUnload(c);
    this.chunks.delete(c.key);
    if (this._last === c) this._last = null;
  }

  async _requestChunk(cx, cz, wi) {
    const key = chunkKey(cx, cz);
    this.pending.set(key, wi);
    this.genLoad[wi]++;
    this.stats.genReq++;
    if (this.saver && this.saver.hasChunk(key)) {
      try {
        const d = await this.saver.loadChunk(key);
        if (d && this.pending.get(key) === wi) {
          this.genWorkers[wi].postMessage({ type: 'restore', cx, cz, blocks: d.blocks, meta: d.meta }, [d.blocks.buffer, d.meta.buffer]);
          return;
        }
      } catch (e) { console.warn('chunk load failed', key, e); }
    }
    this.genWorkers[wi].postMessage({ type: 'gen', cx, cz });
  }

  _onGen(d, wi) {
    this.genLoad[wi] = Math.max(0, this.genLoad[wi] - 1);
    const key = chunkKey(d.cx, d.cz);
    this.pending.delete(key);
    if (d.type === 'error') { console.error('generation worker error', d.error); return; }
    if (this.chunks.has(key)) return;
    // discard if now far away
    const dx = d.cx - this.centerCX, dz = d.cz - this.centerCZ;
    const R = this.renderDistance + 3;
    if (dx * dx + dz * dz > R * R) return;
    const c = new Chunk(d.cx, d.cz, d);
    this.chunks.set(key, c);
    this._mergeLight(c);
    // neighbours need remesh (border AO/light)
    for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
      const n = this.getChunk(c.cx + ox, c.cz + oz);
      if (n) n.dirty = true;
    }
    if (this.events.onChunkLoaded) this.events.onChunkLoaded(c);
  }

  meshable(c) {
    for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
      if (!this.getChunk(c.cx + ox, c.cz + oz)) return false;
    }
    return true;
  }

  _dispatchMeshing(px, pz) {
    let free = 0;
    for (let i = 0; i < this.meshWorkers.length; i++) free += Math.max(0, 2 - this.meshLoad[i]);
    if (!free) return;
    const pcx = px / 16 - 0.5, pcz = pz / 16 - 0.5;
    const cands = [];
    for (const c of this.chunks.values()) {
      if (!c.dirty || c.meshing) continue;
      const dx = c.cx - pcx, dz = c.cz - pcz;
      const d = dx * dx + dz * dz;
      if (d > (this.renderDistance + 0.5) ** 2) continue;
      if (!this.meshable(c)) continue;
      cands.push([c.urgent ? -1 : d, c]);
    }
    if (!cands.length) return;
    cands.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < cands.length && free > 0; k++) {
      const c = cands[k][1];
      let best = 0;
      for (let i = 1; i < this.meshWorkers.length; i++) if (this.meshLoad[i] < this.meshLoad[best]) best = i;
      if (this.meshLoad[best] >= 2) break;
      this._sendMesh(c, best);
      free--;
    }
  }

  _sendMesh(c, wi) {
    const pad = buildPadded((dx, dz) => this.getChunk(c.cx + dx, c.cz + dz));
    c.dirty = false; c.urgent = false; c.meshing = true;
    c.meshVer++;
    this.meshLoad[wi]++;
    this.stats.meshReq++;
    this.meshWorkers[wi].postMessage({ key: c.key, ver: c.meshVer, pb: pad.pb, pm: pad.pm, pl: pad.pl, pt: pad.pt },
      [pad.pb.buffer, pad.pm.buffer, pad.pl.buffer, pad.pt.buffer]);
  }

  _onMesh(d, wi) {
    this.meshLoad[wi] = Math.max(0, this.meshLoad[wi] - 1);
    const c = this.chunks.get(d.key);
    if (!c) return;
    c.meshing = false;
    if (d.error) { if (!this._meshErr) console.error('mesh worker error', d.error); this._meshErr = true; return; }
    if (this.events.onMesh) this.events.onMesh(c, d);
  }

  // Force remesh of chunk at block coords quickly (player edits)
  markDirtyAt(c, x, z, urgent = false) {
    c.dirty = true; if (urgent) c.urgent = true;
    const ex = x === 0 ? -1 : x === 15 ? 1 : 0;
    const ez = z === 0 ? -1 : z === 15 ? 1 : 0;
    if (ex || ez) {
      const mark = (ox, oz) => { const n = this.getChunk(c.cx + ox, c.cz + oz); if (n) { n.dirty = true; if (urgent) n.urgent = true; } };
      if (ex) mark(ex, 0);
      if (ez) mark(0, ez);
      if (ex && ez) mark(ex, ez);
    }
  }

  // ---------- lighting ----------
  _qReset() { this.qn = 0; this.qh = 0; this.qC.length = 0; }
  _qPush(c, i, l = 0) {
    if (this.qn >= this.qI.length) {
      const ni = new Int32Array(this.qI.length * 2); ni.set(this.qI); this.qI = ni;
      const nl = new Uint8Array(this.qL.length * 2); nl.set(this.qL); this.qL = nl;
    }
    this.qC[this.qn] = c; this.qI[this.qn] = i; this.qL[this.qn] = l; this.qn++;
  }

  // neighbour cell in direction d; returns index and sets this._nc (or -1)
  _nb(c, i, d) {
    const x = i & 15, z = (i >> 4) & 15, y = i >> 8;
    switch (d) {
      case 0: if (x < 15) { this._nc = c; return i + 1; } this._nc = this.getChunk(c.cx + 1, c.cz); return this._nc ? i - 15 : -1;
      case 1: if (x > 0) { this._nc = c; return i - 1; } this._nc = this.getChunk(c.cx - 1, c.cz); return this._nc ? i + 15 : -1;
      case 2: if (z < 15) { this._nc = c; return i + 16; } this._nc = this.getChunk(c.cx, c.cz + 1); return this._nc ? i - 240 : -1;
      case 3: if (z > 0) { this._nc = c; return i - 16; } this._nc = this.getChunk(c.cx, c.cz - 1); return this._nc ? i + 240 : -1;
      case 4: if (y < HEIGHT - 1) { this._nc = c; return i + 256; } return -1;
      default: if (y > 0) { this._nc = c; return i - 256; } return -1;
    }
  }

  _propagate(shift, touched) {
    const mask = 15 << shift;
    while (this.qh < this.qn) {
      const c = this.qC[this.qh], i = this.qI[this.qh]; this.qh++;
      const l = (c.light[i] >> shift) & 15;
      if (l <= 1 && !(shift === 4 && l === 15)) continue;
      for (let d = 0; d < 6; d++) {
        const j = this._nb(c, i, d);
        if (j < 0) continue;
        const nc = this._nc;
        const f = LIGHT_FILTER[nc.blocks[j]];
        if (f >= 15) continue;
        let nl = l - 1 - f;
        if (shift === 4 && d === 5 && l === 15 && f === 0) nl = 15;
        if (nl <= 0) continue;
        if (nl <= ((nc.light[j] >> shift) & 15)) continue;
        nc.light[j] = (nc.light[j] & ~mask) | (nl << shift);
        if (touched) touched.add(nc);
        this.markDirtyAt(nc, j & 15, (j >> 4) & 15);
        this._qPush(nc, j);
      }
    }
  }

  // Remove light starting from cell; collects relight sources into the queue afterwards.
  _removeLight(c, i, shift) {
    const mask = 15 << shift;
    const rem = [];
    const start = (c.light[i] >> shift) & 15;
    c.light[i] &= ~mask;
    rem.push(c, i, start);
    this._qReset();
    let h = 0;
    while (h < rem.length) {
      const rc = rem[h], ri = rem[h + 1], rl = rem[h + 2]; h += 3;
      for (let d = 0; d < 6; d++) {
        const j = this._nb(rc, ri, d);
        if (j < 0) continue;
        const nc = this._nc;
        const nl = (nc.light[j] >> shift) & 15;
        if (nl === 0) continue;
        if (nl < rl || (shift === 4 && d === 5 && rl === 15 && nl === 15)) {
          nc.light[j] &= ~mask;
          this.markDirtyAt(nc, j & 15, (j >> 4) & 15, true);
          rem.push(nc, j, nl);
          if (shift === 0) {
            const e = LIGHT_EMIT[nc.blocks[j]];
            if (e > 0) { nc.light[j] |= e; this._qPush(nc, j); }
          }
        } else {
          this._qPush(nc, j);
        }
      }
    }
  }

  _mergeLight(c) {
    // pull light across borders from loaded neighbours and push ours into them
    this._qReset();
    const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [ox, oz] of sides) {
      const n = this.getChunk(c.cx + ox, c.cz + oz);
      if (!n) continue;
      for (let y = 0; y < HEIGHT; y++) for (let k = 0; k < 16; k++) {
        let ia, ib;
        if (ox === 1) { ia = idx(15, y, k); ib = idx(0, y, k); }
        else if (ox === -1) { ia = idx(0, y, k); ib = idx(15, y, k); }
        else if (oz === 1) { ia = idx(k, y, 15); ib = idx(k, y, 0); }
        else { ia = idx(k, y, 0); ib = idx(k, y, 15); }
        const la = c.light[ia], lb = n.light[ib];
        if (la === lb) continue;
        if ((la >> 4) > (lb >> 4) + 1 || (la & 15) > (lb & 15) + 1) this._qPush(c, ia);
        if ((lb >> 4) > (la >> 4) + 1 || (lb & 15) > (la & 15) + 1) this._qPush(n, ib);
      }
    }
    const saveN = this.qn;
    // sky
    this.qh = 0;
    this._propagate(4, null);
    // block: re-run same seeds
    this.qh = 0; this.qn = saveN;
    this._propagate(0, null);
    this._qReset();
  }

  // ---------- block edits ----------
  setBlock(x, y, z, id, meta = 0, opts = {}) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    if (y < 0 || y >= HEIGHT) return false;
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return false;
    const lx = x & 15, lz = z & 15;
    const i = idx(lx, y, lz);
    const old = c.blocks[i], oldMeta = c.meta[i];
    if (old === id && oldMeta === meta) return false;
    c.blocks[i] = id; c.meta[i] = meta;
    c.modified = true; c.editVersion++;
    // heightmap
    const hi = (lz << 4) | lx;
    const blocksPrecip = (b) => b !== 0 && (BLOCKS[b].solid || IS_LIQUID[b] || LIGHT_FILTER[b] > 0);
    if (blocksPrecip(id)) { if (y + 1 > c.heightmap[hi]) c.heightmap[hi] = y + 1; }
    else if (c.heightmap[hi] === y + 1) {
      let yy = y - 1;
      while (yy > 0 && !blocksPrecip(c.blocks[idx(lx, yy, lz)])) yy--;
      c.heightmap[hi] = yy + 1;
    }
    // lighting
    if (old !== id) {
      const fOld = LIGHT_FILTER[old], fNew = LIGHT_FILTER[id];
      const eOld = LIGHT_EMIT[old], eNew = LIGHT_EMIT[id];
      if (fNew > fOld) { this._removeLight(c, i, 4); this._propagate(4); }
      if (fNew > fOld || eOld > eNew) { this._removeLight(c, i, 0); this._propagate(0); }
      if (eNew > 0) {
        this._qReset();
        c.light[i] = (c.light[i] & 0xf0) | Math.max(eNew, c.light[i] & 15);
        this._qPush(c, i);
        this._propagate(0);
      }
      if (fNew < fOld) {
        // light flows in from neighbours
        for (const shift of [4, 0]) {
          this._qReset();
          for (let d = 0; d < 6; d++) {
            const j = this._nb(c, i, d);
            if (j >= 0) this._qPush(this._nc, j);
          }
          this._propagate(shift);
        }
      }
      this._qReset();
    }
    this.markDirtyAt(c, lx, lz, true);
    if (!opts.noUpdate) this._neighborUpdates(x, y, z, old);
    if (this.events.onBlockChanged) this.events.onBlockChanged(x, y, z, old, id);
    return true;
  }

  // break block (drops via event), used by player and updates
  breakBlock(x, y, z, drop = true) {
    const id = this.getBlock(x, y, z);
    if (!id) return 0;
    const meta = this.getMeta(x, y, z);
    const bd = BLOCKS[id];
    let repl = 0;
    if (IS_WATERLOGGED[id]) { repl = B.water; }
    // doors: remove other half
    if (bd.shape === SHAPE.DOOR) {
      const oy = (meta & 8) ? y - 1 : y + 1;
      if (this.getBlock(x, oy, z) === id) this.setBlock(x, oy, z, 0, 0, { noUpdate: true });
    }
    if (bd.shape === SHAPE.BED) {
      const f = meta & 3, head = (meta >> 2) & 1;
      const [dx, dz] = [[0, -1], [1, 0], [0, 1], [-1, 0]][f];
      const ox = head ? x - dx : x + dx, oz = head ? z - dz : z + dz;
      if (this.getBlock(ox, y, oz) === id) this.setBlock(ox, y, oz, 0, 0, { noUpdate: true });
    }
    this.setBlock(x, y, z, repl, 0);
    if (drop && this.events.onDrop) this.events.onDrop(x, y, z, id, meta);
    return id;
  }

  _neighborUpdates(x, y, z, oldId) {
    this._updateBlock(x, y, z);
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      this._updateBlock(x + dx, y + dy, z + dz);
    }
    void oldId;
  }

  _updateBlock(x, y, z) {
    const id = this.getBlock(x, y, z);
    if (!id) return;
    const bd = BLOCKS[id];
    if (IS_LIQUID[id] || IS_WATERLOGGED[id]) { this.schedule(x, y, z, IS_LIQUID[id] === 2 ? 30 : 5); }
    // any liquid adjacent may want to flow into a newly opened cell
    if (bd.gravity) {
      const below = this.getBlock(x, y - 1, z);
      if (below === 0 || IS_LIQUID[below] || BLOCKS[below].replaceable) this.schedule(x, y, z, 2);
    }
    const shape = bd.shape;
    const below = this.getBlock(x, y - 1, z);
    const bb = BLOCKS[below];
    const supported = bb.solid && (bb.shape === SHAPE.CUBE || bb.shape === SHAPE.FARMLAND || bb.shape === SHAPE.PATH || bb.shape === SHAPE.SLAB || bb.shape === SHAPE.STAIRS || bb.name.endsWith('_leaves'));
    if (shape === SHAPE.CROSS || shape === SHAPE.CROP || shape === SHAPE.WATER_PLANT) {
      let ok = supported;
      if (id === B.reeds || id === B.kelp) ok = ok || below === id;
      if (id === B.cactus) ok = below === B.sand || below === B.red_sand || below === B.cactus;
      if (bd.crop) ok = below === B.farmland;
      if (!ok) this.breakBlock(x, y, z, true);
    } else if (shape === SHAPE.SNOW_LAYER || shape === SHAPE.LANTERN && !(this.getMeta(x, y, z) & 1) || shape === SHAPE.FLAT && id !== B.lily_pad) {
      if (!supported && !IS_OPAQUE[below]) this.breakBlock(x, y, z, shape !== SHAPE.SNOW_LAYER);
    } else if (id === B.lily_pad) {
      if (!IS_LIQUID[below]) this.breakBlock(x, y, z, true);
    } else if (shape === SHAPE.TORCH) {
      const m = this.getMeta(x, y, z);
      let ok;
      if (m >= 1 && m <= 4) {
        const [dx, dz] = [[0, -1], [1, 0], [0, 1], [-1, 0]][m - 1];
        ok = IS_OPAQUE[this.getBlock(x + dx, y, z + dz)];
      } else ok = supported || IS_OPAQUE[below] || bb.fence;
      if (!ok) this.breakBlock(x, y, z, true);
    } else if (shape === SHAPE.DOOR) {
      const m = this.getMeta(x, y, z);
      const oy = (m & 8) ? y - 1 : y + 1;
      if (this.getBlock(x, oy, z) !== id) this.setBlock(x, y, z, 0, 0, { noUpdate: true });
    } else if (shape === SHAPE.LADDER && this.getMeta(x, y, z) !== 4) {
      const m = this.getMeta(x, y, z) & 3;
      const [dx, dz] = [[0, -1], [1, 0], [0, 1], [-1, 0]][m];
      if (!IS_OPAQUE[this.getBlock(x + dx, y, z + dz)]) this.breakBlock(x, y, z, id === B.ladder);
    } else if (id === B.vines && this.getMeta(x, y, z) === 4) {
      const above = this.getBlock(x, y + 1, z);
      if (above === 0) this.breakBlock(x, y, z, false);
    }
    if (id === B.grass || id === B.snowy_grass || id === B.farmland || id === B.dirt_path) {
      const above = this.getBlock(x, y + 1, z);
      if (IS_OPAQUE[above]) this.setBlock(x, y, z, B.dirt, 0, { noUpdate: true });
    }
  }

  // ---------- ticks ----------
  schedule(x, y, z, delay) {
    const key = x + ',' + y + ',' + z;
    const due = this.tick + delay;
    const ex = this.scheduled.get(key);
    if (ex !== undefined && ex <= due) return;
    this.scheduled.set(key, due);
    let list = this.tickQueue.get(due);
    if (!list) { list = []; this.tickQueue.set(due, list); }
    list.push(x, y, z);
  }

  gameTick(px, pz) {
    this.tick++;
    const list = this.tickQueue.get(this.tick);
    if (list) {
      this.tickQueue.delete(this.tick);
      let budget = 4000;
      for (let k = 0; k < list.length; k += 3) {
        const x = list[k], y = list[k + 1], z = list[k + 2];
        const key = x + ',' + y + ',' + z;
        if (this.scheduled.get(key) !== this.tick) continue;
        this.scheduled.delete(key);
        if (budget-- <= 0) { this.schedule(x, y, z, 1); continue; }
        this._scheduledTick(x, y, z);
      }
    }
    this._randomTicks(px, pz);
  }

  _scheduledTick(x, y, z) {
    const id = this.getBlock(x, y, z);
    if (!this.isLoaded(x, z)) return;
    if (IS_LIQUID[id] || IS_WATERLOGGED[id]) this._fluidTick(x, y, z, id);
    else if (BLOCKS[id].gravity) {
      const below = this.getBlock(x, y - 1, z);
      if (below === 0 || IS_LIQUID[below] || BLOCKS[below].replaceable) {
        const meta = this.getMeta(x, y, z);
        let ty = y - 1;
        while (ty > 0) {
          const b = this.getBlock(x, ty - 1, z);
          if (!(b === 0 || IS_LIQUID[b] || BLOCKS[b].replaceable)) break;
          ty--;
        }
        if (this.events.onFallingBlock) this.events.onFallingBlock(x, y, z, id, meta, ty);
        this.setBlock(x, y, z, 0, 0);
        const tb = this.getBlock(x, ty, z);
        if (tb && BLOCKS[tb].replaceable && !IS_LIQUID[tb]) this.breakBlock(x, ty, z, true);
        this.setBlock(x, ty, z, id, meta);
      }
    }
  }

  _canFlowInto(b) {
    return b === 0 || (BLOCKS[b].replaceable && !IS_LIQUID[b] && !IS_WATERLOGGED[b]);
  }

  _fluidTick(x, y, z, id) {
    const kind = IS_WATERLOGGED[id] ? 1 : IS_LIQUID[id];
    const liquidId = kind === 1 ? B.water : B.lava;
    const same = (b) => kind === 1 ? (IS_LIQUID[b] === 1 || IS_WATERLOGGED[b]) : IS_LIQUID[b] === 2;
    const metaOf = (xx, yy, zz) => { const b = this.getBlock(xx, yy, zz); return IS_WATERLOGGED[b] ? 0 : this.getMeta(xx, yy, zz); };
    let meta = IS_WATERLOGGED[id] ? 0 : this.getMeta(x, y, z);
    const maxL = kind === 1 ? 7 : 3;
    const delay = kind === 1 ? 5 : 30;
    const isSource = (meta & 15) === 0;

    // lava/water interaction
    if (kind === 2) {
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
        const nb = this.getBlock(x + dx, y + dy, z + dz);
        if (IS_LIQUID[nb] === 1 || IS_WATERLOGGED[nb]) {
          this.setBlock(x, y, z, isSource ? B.obsidian : B.cobblestone, 0);
          if (this.events.onFizz) this.events.onFizz(x, y, z);
          return;
        }
      }
    }

    if (!isSource) {
      let level = 99, falling = false, sources = 0;
      const above = this.getBlock(x, y + 1, z);
      if (same(above)) { falling = true; level = 0; }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nb = this.getBlock(x + dx, y, z + dz);
        if (!same(nb)) continue;
        const nm = metaOf(x + dx, y, z + dz);
        const nl = (nm & 8) ? 0 : (nm & 7);
        if ((nm & 15) === 0) sources++;
        if (nl + 1 < level) level = nl + 1;
      }
      const below = this.getBlock(x, y - 1, z);
      if (kind === 1 && sources >= 2 && (BLOCKS[below].solid || (IS_LIQUID[below] === 1 && (metaOf(x, y - 1, z) & 15) === 0))) {
        this.setBlock(x, y, z, liquidId, 0); meta = 0;
      } else if (!falling && level > maxL) {
        this.setBlock(x, y, z, 0, 0);
        return;
      } else {
        const nm = falling ? 8 : level;
        if (nm !== meta) { this.setBlock(x, y, z, liquidId, nm); meta = nm; }
      }
    }
    // spreading
    const below = this.getBlock(x, y - 1, z);
    if (y > 0 && this._canFlowInto(below)) {
      if (below) this.breakBlock(x, y - 1, z, true);
      this.setBlock(x, y - 1, z, liquidId, 8);
      this.schedule(x, y - 1, z, delay);
      return;
    }
    if (y > 0 && kind === 2 && IS_LIQUID[below] === 1) { this.setBlock(x, y - 1, z, B.stone, 0); return; }
    const lvl = (meta & 8) ? 0 : (meta & 7);
    if (same(below) && !isSource && !(meta & 8)) return; // flowing on top of liquid doesn't spread
    if (lvl >= maxL) return;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nb = this.getBlock(x + dx, y, z + dz);
      if (this._canFlowInto(nb)) {
        if (nb) this.breakBlock(x + dx, y, z + dz, true);
        this.setBlock(x + dx, y, z + dz, liquidId, lvl + 1);
        this.schedule(x + dx, y, z + dz, delay);
      } else if (same(nb) && !IS_WATERLOGGED[nb]) {
        const nm = this.getMeta(x + dx, y, z + dz);
        const nl = (nm & 8) ? 0 : (nm & 7);
        if ((nm & 15) !== 0 && nl > lvl + 1) { this.setBlock(x + dx, y, z + dz, liquidId, lvl + 1); this.schedule(x + dx, y, z + dz, delay); }
      }
    }
  }

  _randomTicks(px, pz) {
    if (!this.randomTickSpeed) return;
    const pcx = Math.floor(px / 16), pcz = Math.floor(pz / 16);
    const R = Math.min(6, this.renderDistance);
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const c = this.getChunk(pcx + dx, pcz + dz);
      if (!c) continue;
      for (let s = 0; s < HEIGHT / 16; s++) {
        for (let k = 0; k < this.randomTickSpeed; k++) {
          const r = (Math.random() * 4096) | 0;
          const i = (s << 12) | r;
          const id = c.blocks[i];
          if (!id) continue;
          if (RANDOM_TICK[id]) RANDOM_TICK[id](this, c.cx * 16 + (i & 15), i >> 8, c.cz * 16 + ((i >> 4) & 15), c, i);
        }
      }
    }
  }

  // Ray march for the first block whose selection box is hit. Returns {x,y,z,face,id,meta,dist,px,py,pz}
  raycast(ox, oy, oz, dx, dy, dz, maxDist, selectFn) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tMaxX = dx !== 0 ? (dx > 0 ? (x + 1 - ox) : (ox - x)) * tDeltaX : Infinity;
    let tMaxY = dy !== 0 ? (dy > 0 ? (y + 1 - oy) : (oy - y)) * tDeltaY : Infinity;
    let tMaxZ = dz !== 0 ? (dz > 0 ? (z + 1 - oz) : (oz - z)) * tDeltaZ : Infinity;
    let t = 0;
    for (let n = 0; n < 256 && t <= maxDist; n++) {
      const id = this.getBlock(x, y, z);
      if (id) {
        const hit = selectFn(id, this.getMeta(x, y, z), x, y, z, ox, oy, oz, dx, dy, dz);
        if (hit && hit.t <= maxDist) return { x, y, z, face: hit.face, id, meta: this.getMeta(x, y, z), dist: hit.t, px: ox + dx * hit.t, py: oy + dy * hit.t, pz: oz + dz * hit.t };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDeltaX; }
      else if (tMaxY < tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDeltaY; }
      else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; }
    }
    return null;
  }
}

// ---------- random tick behaviours ----------
const RANDOM_TICK = [];
RANDOM_TICK[B.grass] = (w, x, y, z) => {
  // spread to nearby dirt with light
  const tx = x + ((Math.random() * 3) | 0) - 1, ty = y + ((Math.random() * 5) | 0) - 3, tz = z + ((Math.random() * 3) | 0) - 1;
  if (w.getBlock(tx, ty, tz) === B.dirt && w.getBlock(tx, ty + 1, tz) === 0 && w.skyLight(tx, ty + 1, tz) >= 9) w.setBlock(tx, ty, tz, B.grass, 0, { noUpdate: true });
};
const cropTick = (w, x, y, z) => {
  const m = w.getMeta(x, y, z);
  const lit = Math.max(w.skyLight(x, y, z), w.blockLight(x, y, z));
  if (m < 7 && lit >= 9 && Math.random() < 0.35) w.setBlock(x, y, z, w.getBlock(x, y, z), m + 1, { noUpdate: true });
};
RANDOM_TICK[B.wheat] = cropTick;
RANDOM_TICK[B.carrots] = cropTick;
const saplingTick = (w, x, y, z) => {
  if (Math.random() < 0.08 && w.skyLight(x, y, z) >= 9 && w.events.onGrowTree) w.events.onGrowTree(x, y, z, BLOCKS[w.getBlock(x, y, z)].sapling);
};
RANDOM_TICK[B.sapling_oak] = saplingTick;
RANDOM_TICK[B.sapling_birch] = saplingTick;
RANDOM_TICK[B.sapling_pine] = saplingTick;
RANDOM_TICK[B.reeds] = (w, x, y, z) => {
  if (Math.random() < 0.15 && w.getBlock(x, y + 1, z) === 0) {
    let h = 1; while (w.getBlock(x, y - h, z) === B.reeds) h++;
    if (h < 3) w.setBlock(x, y + 1, z, B.reeds);
  }
};
RANDOM_TICK[B.cactus] = (w, x, y, z) => {
  if (Math.random() < 0.1 && w.getBlock(x, y + 1, z) === 0) {
    let h = 1; while (w.getBlock(x, y - h, z) === B.cactus) h++;
    if (h < 3) w.setBlock(x, y + 1, z, B.cactus);
  }
};
RANDOM_TICK[B.ice] = (w, x, y, z) => {
  if (w.blockLight(x, y + 1, z) > 11 || w.blockLight(x + 1, y, z) > 11) w.setBlock(x, y, z, B.water, 0);
};
RANDOM_TICK[B.snow_layer] = (w, x, y, z) => {
  if (w.blockLight(x, y, z) > 11) w.setBlock(x, y, z, 0, 0);
};
RANDOM_TICK[B.farmland] = (w, x, y, z) => {
  // dries out without nearby water (simplified: stays as long as water within 4)
  let wet = false;
  for (let dz = -4; dz <= 4 && !wet; dz++) for (let dx = -4; dx <= 4 && !wet; dx++) for (let dy = 0; dy <= 1; dy++) if (IS_LIQUID[w.getBlock(x + dx, y + dy, z + dz)] === 1) { wet = true; break; }
  const m = w.getMeta(x, y, z);
  if (wet && m !== 1) w.setBlock(x, y, z, B.farmland, 1, { noUpdate: true });
  else if (!wet) {
    const above = w.getBlock(x, y + 1, z);
    if (!BLOCKS[above].crop && Math.random() < 0.2) w.setBlock(x, y, z, B.dirt, 0);
    else if (m !== 0) w.setBlock(x, y, z, B.farmland, 0, { noUpdate: true });
  }
};
RANDOM_TICK[B.fire] = (w, x, y, z) => {
  if (Math.random() < 0.3) w.setBlock(x, y, z, 0, 0);
};
export { RANDOM_TICK };
