// AABB vs voxel world collision (axis-separated sweep, Minecraft style) + liquid queries.
import { collisionBoxes } from '../world/shapes.js';
import { BLOCKS, IS_LIQUID, IS_WATERLOGGED } from '../world/blocks.js';

const EPS = 1e-6;
const boxes = [];

function gather(world, x0, y0, z0, x1, y1, z1) {
  boxes.length = 0;
  const bx0 = Math.floor(x0), by0 = Math.floor(y0) - 1, bz0 = Math.floor(z0);
  const bx1 = Math.floor(x1), by1 = Math.floor(y1), bz1 = Math.floor(z1);
  for (let y = by0; y <= by1; y++) for (let z = bz0; z <= bz1; z++) for (let x = bx0; x <= bx1; x++) {
    let id;
    if (!world.isLoaded(x, z)) id = 3; // treat unloaded as solid stone so nobody falls out of the world
    else id = world.getBlock(x, y, z);
    if (!id) continue;
    const b = BLOCKS[id];
    if (!b.solid) continue;
    const meta = world.getMeta(x, y, z);
    for (const c of collisionBoxes(id, meta, world, x, y, z)) {
      boxes.push(x + c[0], y + c[1], z + c[2], x + c[3], y + c[4], z + c[5]);
    }
  }
  return boxes;
}

// e: {x, y, z, hw, h}  (x,z center, y feet). Moves in place. Returns collision flags.
export function moveEntity(world, e, dx, dy, dz) {
  const hw = e.hw, h = e.h;
  const minX = Math.min(e.x - hw, e.x - hw + dx), maxX = Math.max(e.x + hw, e.x + hw + dx);
  const minY = Math.min(e.y, e.y + dy), maxY = Math.max(e.y + h, e.y + h + dy);
  const minZ = Math.min(e.z - hw, e.z - hw + dz), maxZ = Math.max(e.z + hw, e.z + hw + dz);
  const B = gather(world, minX, minY, minZ, maxX, maxY, maxZ);
  const n = B.length;
  const ody = dy, odx = dx, odz = dz;
  // Y
  let x0 = e.x - hw, x1 = e.x + hw, z0 = e.z - hw, z1 = e.z + hw, y0 = e.y, y1 = e.y + h;
  for (let i = 0; i < n; i += 6) {
    if (B[i + 3] <= x0 + EPS || B[i] >= x1 - EPS || B[i + 5] <= z0 + EPS || B[i + 2] >= z1 - EPS) continue;
    if (dy > 0 && B[i + 1] >= y1 - EPS) dy = Math.min(dy, B[i + 1] - y1);
    else if (dy < 0 && B[i + 4] <= y0 + EPS) dy = Math.max(dy, B[i + 4] - y0);
  }
  e.y += dy; y0 = e.y; y1 = e.y + h;
  // X
  for (let i = 0; i < n; i += 6) {
    if (B[i + 4] <= y0 + EPS || B[i + 1] >= y1 - EPS || B[i + 5] <= z0 + EPS || B[i + 2] >= z1 - EPS) continue;
    if (dx > 0 && B[i] >= x1 - EPS) dx = Math.min(dx, B[i] - x1);
    else if (dx < 0 && B[i + 3] <= x0 + EPS) dx = Math.max(dx, B[i + 3] - x0);
  }
  e.x += dx; x0 = e.x - hw; x1 = e.x + hw;
  // Z
  for (let i = 0; i < n; i += 6) {
    if (B[i + 4] <= y0 + EPS || B[i + 1] >= y1 - EPS || B[i + 3] <= x0 + EPS || B[i] >= x1 - EPS) continue;
    if (dz > 0 && B[i + 2] >= z1 - EPS) dz = Math.min(dz, B[i + 2] - z1);
    else if (dz < 0 && B[i + 5] <= z0 + EPS) dz = Math.max(dz, B[i + 5] - z0);
  }
  e.z += dz;
  return {
    hitX: Math.abs(dx - odx) > 1e-7, hitY: Math.abs(dy - ody) > 1e-7, hitZ: Math.abs(dz - odz) > 1e-7,
    onGround: ody < 0 && Math.abs(dy - ody) > 1e-7,
    dx, dy, dz,
  };
}

// Move with automatic step-up (for walking onto slabs/stairs)
export function moveWithStep(world, e, dx, dy, dz, stepH) {
  const sx = e.x, sy = e.y, sz = e.z;
  const r = moveEntity(world, e, dx, dy, dz);
  if (stepH > 0 && (r.hitX || r.hitZ) && (e.onGround || r.onGround)) {
    const ax = e.x, ay = e.y, az = e.z;
    e.x = sx; e.y = sy; e.z = sz;
    const up = moveEntity(world, e, 0, stepH, 0);
    const h2 = moveEntity(world, e, dx, 0, dz);
    const down = moveEntity(world, e, 0, -(up.dy) - 0.01, 0);
    const d1 = (ax - sx) ** 2 + (az - sz) ** 2, d2 = (e.x - sx) ** 2 + (e.z - sz) ** 2;
    if (d2 > d1 + 1e-6 && down.onGround) {
      return { hitX: h2.hitX, hitY: true, hitZ: h2.hitZ, onGround: true, stepped: true };
    }
    e.x = ax; e.y = ay; e.z = az;
  }
  return r;
}

export function boxCollides(world, x0, y0, z0, x1, y1, z1) {
  const B = gather(world, x0, y0, z0, x1, y1, z1);
  for (let i = 0; i < B.length; i += 6) {
    if (B[i + 3] > x0 + EPS && B[i] < x1 - EPS && B[i + 4] > y0 + EPS && B[i + 1] < y1 - EPS && B[i + 5] > z0 + EPS && B[i + 2] < z1 - EPS) return true;
  }
  return false;
}

// Liquid occupancy of an entity box: returns {water, lava, waterTop, eyeInWater}
export function liquidState(world, e, eyeH) {
  let water = 0, lava = false, cells = 0, waterTop = -1e9;
  const x0 = Math.floor(e.x - e.hw + 0.001), x1 = Math.floor(e.x + e.hw - 0.001);
  const z0 = Math.floor(e.z - e.hw + 0.001), z1 = Math.floor(e.z + e.hw - 0.001);
  const y0 = Math.floor(e.y + 0.001), y1 = Math.floor(e.y + e.h - 0.001);
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const id = world.getBlock(x, y, z);
    cells++;
    if (IS_LIQUID[id] === 1 || IS_WATERLOGGED[id]) {
      const m = IS_WATERLOGGED[id] ? 0 : world.getMeta(x, y, z);
      const lvl = (m & 8) ? 0 : (m & 7);
      const top = y + (IS_LIQUID[world.getBlock(x, y + 1, z)] === 1 ? 1 : (8 - lvl) / 9);
      if (e.y < top) { water++; if (top > waterTop) waterTop = top; }
    } else if (IS_LIQUID[id] === 2) lava = true;
  }
  const ex = Math.floor(e.x), ey = Math.floor(e.y + eyeH), ez = Math.floor(e.z);
  const eid = world.getBlock(ex, ey, ez);
  let eyeInWater = false;
  if (IS_LIQUID[eid] === 1 || IS_WATERLOGGED[eid]) {
    const m = IS_WATERLOGGED[eid] ? 0 : world.getMeta(ex, ey, ez);
    const lvl = (m & 8) ? 0 : (m & 7);
    const top = ey + (IS_LIQUID[world.getBlock(ex, ey + 1, ez)] === 1 ? 1 : (8 - lvl) / 9);
    eyeInWater = e.y + eyeH < top;
  }
  const eyeInLava = IS_LIQUID[eid] === 2;
  return { water: cells ? water / cells : 0, inWater: water > 0, lava, waterTop, eyeInWater, eyeInLava };
}

// Ray vs axis aligned box (slab method). Returns {t, face} or null.
export function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity, face = -1;
  const ax = [[ox, dx, x0, x1, 0], [oy, dy, y0, y1, 2], [oz, dz, z0, z1, 4]];
  for (const [o, d, lo, hi, fbase] of ax) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    let f1 = fbase + 1, f2 = fbase; // entering lo side => face pointing negative
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; const f = f1; f1 = f2; f2 = f; }
    if (t1 > tmin) { tmin = t1; face = f1; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return { t: Math.max(0, tmin), face };
}
