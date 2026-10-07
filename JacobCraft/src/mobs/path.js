// Grid A* pathfinding for 2-block-tall walkers. Doors count as passable (villagers open them).
import { BLOCKS, SHAPE, IS_LIQUID } from '../world/blocks.js';

function passable(w, x, y, z) {
  const id = w.getBlock(x, y, z);
  if (!id) return true;
  const b = BLOCKS[id];
  if (b.shape === SHAPE.DOOR) return true;
  if (IS_LIQUID[id] === 2) return false;
  return !b.solid || b.shape === SHAPE.SNOW_LAYER;
}
function standable(w, x, y, z) {
  const id = w.getBlock(x, y - 1, z);
  if (!id) return false;
  const b = BLOCKS[id];
  if (IS_LIQUID[id] === 1) return true; // can wade
  if (b.fence) return false;
  return b.solid || b.shape === SHAPE.SNOW_LAYER;
}

class Heap {
  constructor() { this.a = []; }
  push(n) { const a = this.a; a.push(n); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < a.length && a[l].f < a[m].f) m = l; if (r < a.length && a[r].f < a[m].f) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top;
  }
  get size() { return this.a.length; }
}

export function findPath(w, sx, sy, sz, gx, gy, gz, maxNodes = 2500) {
  sx = Math.floor(sx); sy = Math.floor(sy + 0.01); sz = Math.floor(sz);
  gx = Math.floor(gx); gy = Math.floor(gy); gz = Math.floor(gz);
  const key = (x, y, z) => (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
  const h = (x, y, z) => Math.abs(x - gx) + Math.abs(z - gz) + Math.abs(y - gy) * 1.5;
  const open = new Heap();
  const seen = new Map();
  const start = { x: sx, y: sy, z: sz, g: 0, f: h(sx, sy, sz), p: null };
  open.push(start);
  seen.set(key(sx, sy, sz), start);
  let best = start, n = 0;
  while (open.size && n++ < maxNodes) {
    const c = open.pop();
    if (c.closed) continue;
    c.closed = true;
    if (c.x === gx && c.z === gz && Math.abs(c.y - gy) <= 1) { best = c; break; }
    if (h(c.x, c.y, c.z) < h(best.x, best.y, best.z)) best = c;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = c.x + dx, nz = c.z + dz;
      let ny = null;
      // same level
      if (passable(w, nx, c.y, nz) && passable(w, nx, c.y + 1, nz)) {
        if (standable(w, nx, c.y, nz)) ny = c.y;
        else { // drop down up to 3
          for (let d = 1; d <= 3; d++) {
            if (!passable(w, nx, c.y - d, nz)) break;
            if (standable(w, nx, c.y - d, nz)) { ny = c.y - d; break; }
          }
        }
      } else if (passable(w, c.x, c.y + 2, c.z) && passable(w, nx, c.y + 1, nz) && passable(w, nx, c.y + 2, nz) && standable(w, nx, c.y + 1, nz)) {
        ny = c.y + 1; // step up
      }
      if (ny === null) continue;
      const k = key(nx, ny, nz);
      const cost = c.g + 1 + (ny !== c.y ? 0.5 : 0) + (IS_LIQUID[w.getBlock(nx, ny, nz)] ? 3 : 0);
      const ex = seen.get(k);
      if (ex && (ex.closed || ex.g <= cost)) continue;
      const node = { x: nx, y: ny, z: nz, g: cost, f: cost + h(nx, ny, nz) * 1.1, p: c };
      seen.set(k, node);
      open.push(node);
    }
  }
  const path = [];
  for (let c = best; c; c = c.p) path.push([c.x + 0.5, c.y, c.z + 0.5]);
  path.reverse();
  return { path, complete: best.x === gx && best.z === gz };
}
