// IndexedDB persistence: world list/metadata and modified chunks (run-length encoded).
import { CHUNK_VOL } from '../world/constants.js';

const DB_NAME = 'jacobcraft';
const DB_VER = 1;

export function rleEncode(a) {
  const out = new Uint8Array(a.length * 2 + 4);
  let o = 0, i = 0;
  while (i < a.length) {
    const v = a[i];
    let n = 1;
    while (i + n < a.length && a[i + n] === v && n < 255) n++;
    out[o++] = v; out[o++] = n;
    i += n;
  }
  return out.slice(0, o);
}
export function rleDecode(r, len) {
  const out = new Uint8Array(len);
  let o = 0;
  for (let i = 0; i < r.length; i += 2) {
    out.fill(r[i], o, o + r[i + 1]);
    o += r[i + 1];
  }
  return out;
}

function req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

export class SaveDB {
  async open() {
    if (this.db) return this.db;
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('worlds')) db.createObjectStore('worlds', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks');
    };
    this.db = await req(r);
    return this.db;
  }
  store(name, mode = 'readonly') { return this.db.transaction(name, mode).objectStore(name); }
  async listWorlds() {
    await this.open();
    const all = await req(this.store('worlds').getAll());
    return all.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
  }
  async getWorld(id) { await this.open(); return req(this.store('worlds').get(id)); }
  async putWorld(meta) { await this.open(); return req(this.store('worlds', 'readwrite').put(meta)); }
  async deleteWorld(id) {
    await this.open();
    await req(this.store('worlds', 'readwrite').delete(id));
    const range = IDBKeyRange.bound(id + '|', id + '|￿');
    await req(this.store('chunks', 'readwrite').delete(range));
  }
  async chunkKeys(worldId) {
    await this.open();
    const range = IDBKeyRange.bound(worldId + '|', worldId + '|￿');
    const keys = await req(this.store('chunks').getAllKeys(range));
    return new Set(keys.map(k => k.slice(worldId.length + 1)));
  }
  async getChunk(worldId, key) {
    await this.open();
    const d = await req(this.store('chunks').get(worldId + '|' + key));
    if (!d) return null;
    return { blocks: rleDecode(d.b, CHUNK_VOL), meta: rleDecode(d.m, CHUNK_VOL) };
  }
  async putChunk(worldId, key, blocks, meta) {
    await this.open();
    return req(this.store('chunks', 'readwrite').put({ b: rleEncode(blocks), m: rleEncode(meta) }, worldId + '|' + key));
  }
}

// Adapter used by World for chunk persistence
export class WorldSaver {
  constructor(db, worldId, keys) {
    this.db = db; this.worldId = worldId; this.keys = keys;
    this.pending = new Set();
  }
  hasChunk(key) { return this.keys.has(key); }
  loadChunk(key) { return this.db.getChunk(this.worldId, key); }
  saveChunk(c) {
    if (c.savedVersion === c.editVersion && !c.restoredDirty) return;
    c.savedVersion = c.editVersion;
    this.keys.add(c.key);
    const p = this.db.putChunk(this.worldId, c.key, c.blocks.slice(), c.meta.slice()).catch(e => console.warn('save chunk failed', e));
    this.pending.add(p);
    p.finally(() => this.pending.delete(p));
  }
  async flush() { await Promise.all([...this.pending]); }
}
