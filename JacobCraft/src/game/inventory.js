// Item stacks and inventories. A stack is a plain object {id, count, dmg} so it serializes trivially.
import { ITEMS, maxStack } from './items.js';

// Optional per-stack data that must travel with the item (enchantments, loaded ammo, custom name).
const EXTRA_KEYS = ['ench', 'loaded', 'name'];
export function stackExtra(s) {
  if (!s) return null;
  let e = null;
  for (const k of EXTRA_KEYS) if (s[k] !== undefined && s[k] !== null && s[k] !== false) { (e || (e = {}))[k] = k === 'ench' ? Object.assign({}, s[k]) : s[k]; }
  if (e && e.ench && !Object.keys(e.ench).length) delete e.ench;
  return e && Object.keys(e).length ? e : null;
}
export function stack(id, count = 1, dmg = 0, extra = null) { const s = { id, count, dmg }; if (extra) Object.assign(s, extra); return s; }
export function cloneStack(s) { return s ? stack(s.id, s.count, s.dmg || 0, stackExtra(s)) : null; }
export function sameItem(a, b) { return a && b && a.id === b.id && (a.dmg || 0) === (b.dmg || 0) && !ITEMS[a.id].tool && !ITEMS[a.id].armor && !stackExtra(a) && !stackExtra(b); }

export class Inventory {
  constructor(size) {
    this.size = size;
    this.slots = new Array(size).fill(null);
    this.onChange = null;
  }
  changed() { if (this.onChange) this.onChange(); }
  get(i) { return this.slots[i]; }
  set(i, s) { this.slots[i] = s && s.count > 0 ? s : null; this.changed(); }

  // Add items; returns leftover count. order: optional array of slot indices to try first
  add(id, count, dmg = 0, order = null, extra = null) {
    const ms = extra ? 1 : maxStack(id);
    const idxs = order || [...Array(this.size).keys()];
    // merge
    if (ms > 1) {
      for (const i of idxs) {
        const s = this.slots[i];
        if (s && s.id === id && (s.dmg || 0) === dmg && s.count < ms && !stackExtra(s)) {
          const n = Math.min(count, ms - s.count);
          s.count += n; count -= n;
          if (!count) break;
        }
      }
    }
    // empty slots
    for (const i of idxs) {
      if (!count) break;
      if (!this.slots[i]) {
        const n = Math.min(count, ms);
        this.slots[i] = stack(id, n, dmg, extra);
        count -= n;
      }
    }
    this.changed();
    return count;
  }

  addStack(s, order) {
    if (!s) return 0;
    const left = this.add(s.id, s.count, s.dmg || 0, order, stackExtra(s));
    return left;
  }

  count(id) {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  remove(id, count) {
    let removed = 0;
    for (let i = this.size - 1; i >= 0 && removed < count; i--) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const n = Math.min(count - removed, s.count);
        s.count -= n; removed += n;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    this.changed();
    return removed;
  }

  countsMap() {
    const m = new Map();
    for (const s of this.slots) if (s) m.set(s.id, (m.get(s.id) || 0) + s.count);
    return m;
  }

  clear() { this.slots.fill(null); this.changed(); }

  toJSON() { return this.slots.map(cloneStack); }
  load(arr) {
    this.slots.fill(null);
    if (Array.isArray(arr)) arr.forEach((s, i) => { if (i < this.size && s && ITEMS[s.id]) this.slots[i] = cloneStack(s); });
    this.changed();
  }
}
