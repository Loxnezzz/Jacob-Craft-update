// Tree generators. ctx.log(x,y,z,id,axis) / ctx.leaf(x,y,z,id) / ctx.put(x,y,z,id,meta) write in world coords
// and silently clip to the chunk being generated.
import { B } from './blocks.js';

function blob(ctx, cx, cy, cz, rx, ry, rz, leaf, r, holes = 0.12) {
  // deterministic per world position, so neighbouring chunks agree on which leaves exist
  const present = (x, y, z) => {
    const d = (x * x) / (rx * rx + 0.01) + (y * y) / (ry * ry + 0.01) + (z * z) / (rz * rz + 0.01);
    if (d > 1.05) return false;
    return !(d > 0.7 && r.hash(cx + x, cy + y, cz + z) < holes);
  };
  for (let y = -ry; y <= ry; y++) for (let z = -rz; z <= rz; z++) for (let x = -rx; x <= rx; x++) {
    if (!present(x, y, z)) continue;
    // never leave a lone leaf hanging in the air
    if (!present(x + 1, y, z) && !present(x - 1, y, z) && !present(x, y + 1, z) && !present(x, y - 1, z) && !present(x, y, z + 1) && !present(x, y, z - 1)) continue;
    ctx.leaf(cx + x, cy + y, cz + z, leaf);
  }
}

function trunk(ctx, x, y, z, h, log) {
  for (let i = 0; i < h; i++) ctx.log(x, y + i, z, log, 0);
}

function branch(ctx, x, y, z, dx, dz, len, rise, log) {
  let fx = x + 0.5, fy = y + 0.5, fz = z + 0.5;
  const axis = Math.abs(dx) > Math.abs(dz) ? 1 : 2;
  let px = x, py = y, pz = z;
  for (let i = 0; i < len; i++) {
    fx += dx; fz += dz; fy += rise;
    const nx = Math.floor(fx), ny = Math.floor(fy), nz = Math.floor(fz);
    // step one axis at a time so every log shares a face with the previous one (no diagonal floaters)
    if (nx !== px) { px = nx; if (nz !== pz || ny !== py) ctx.log(px, py, pz, log, axis); }
    if (nz !== pz) { pz = nz; if (ny !== py) ctx.log(px, py, pz, log, axis); }
    py = ny;
    ctx.log(nx, ny, nz, log, rise > 0.7 ? 0 : axis);
  }
  return [Math.floor(fx), Math.floor(fy), Math.floor(fz)];
}

function oakCanopy(ctx, x, top, z, leaf, r) {
  for (let ly = top - 3; ly <= top; ly++) {
    const rad = ly >= top - 1 ? 1 : 2;
    for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
      if (Math.abs(dx) === rad && Math.abs(dz) === rad && (ly === top || r.hash(x + dx, ly, z + dz) < 0.5)) continue;
      ctx.leaf(x + dx, ly, z + dz, leaf);
    }
  }
}

export const TREES = {
  oak(ctx, x, y, z, r) {
    const h = r.irange(4, 6);
    trunk(ctx, x, y, z, h, B.oak_log);
    oakCanopy(ctx, x, y + h, z, B.oak_leaves, r);
  },
  big_oak(ctx, x, y, z, r, logId = B.oak_log, leafId = B.oak_leaves) {
    const h = r.irange(8, 12);
    trunk(ctx, x, y, z, h, logId);
    blob(ctx, x, y + h, z, 3, 2, 3, leafId, r);
    const nb = r.irange(2, 4);
    for (let i = 0; i < nb; i++) {
      const a = r.next() * Math.PI * 2;
      const by = y + r.irange(Math.floor(h * 0.45), h - 2);
      const len = r.irange(3, 5);
      const end = branch(ctx, x, by, z, Math.cos(a) * 0.8, Math.sin(a) * 0.8, len, 0.5, logId);
      blob(ctx, end[0], end[1] + 1, end[2], 2 + (r.next() < 0.4 ? 1 : 0), 2, 2, leafId, r);
    }
    // a few roots flaring at the base
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (r.next() < 0.5) ctx.log(x + dx, y, z + dz, logId, dx ? 1 : 2);
  },
  birch(ctx, x, y, z, r) {
    const h = r.irange(5, 7);
    trunk(ctx, x, y, z, h, B.birch_log);
    oakCanopy(ctx, x, y + h, z, B.birch_leaves, r);
  },
  pine(ctx, x, y, z, r, snowy = false) {
    const h = r.irange(7, 13);
    const leaf = snowy ? B.snowy_pine_leaves : B.pine_leaves;
    trunk(ctx, x, y, z, h, B.pine_log);
    let rad = 0;
    const start = y + r.irange(2, 3);
    let maxR = h > 10 ? 3 : 2;
    for (let ly = y + h + 1; ly >= start; ly--) {
      for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
        if (rad > 0 && Math.abs(dx) === rad && Math.abs(dz) === rad) continue;
        if (dx === 0 && dz === 0 && ly < y + h) continue;
        ctx.leaf(x + dx, ly, z + dz, leaf);
      }
      if (rad >= maxR || (rad >= 1 && r.next() < 0.35)) rad = rad > 1 ? 1 : 0; else rad++;
      if (ly < y + h * 0.5 && rad === 0) rad = 1;
    }
    ctx.leaf(x, y + h, z, leaf);
    ctx.leaf(x, y + h + 1, z, leaf);
  },
  snowy_pine(ctx, x, y, z, r) { TREES.pine(ctx, x, y, z, r, true); },
  willow(ctx, x, y, z, r) {
    const h = r.irange(5, 7);
    trunk(ctx, x, y, z, h, B.willow_log);
    const top = y + h;
    blob(ctx, x, top, z, 4, 2, 4, B.willow_leaves, r, 0.2);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + r.next();
      branch(ctx, x, top - 2, z, Math.cos(a) * 0.9, Math.sin(a) * 0.9, 2, 0.4, B.willow_log);
    }
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.hypot(dx, dz);
      if (d < 2.6 || d > 3.5) continue; // strands hang from inside the canopy's lower layer, never beside it
      if (r.hash(x + dx, top, z + dz) < 0.45) continue;
      const len = 2 + Math.floor(r.hash(x + dx, top + 1, z + dz) * 4);
      ctx.leaf(x + dx, top - 1, z + dz, B.willow_leaves); ctx.leaf(x + dx, top, z + dz, B.willow_leaves); // anchor
      for (let k = 1; k <= len; k++) ctx.leaf(x + dx, top - 1 - k, z + dz, k === len ? B.vines : B.willow_leaves, k === len);
    }
  },
  teak(ctx, x, y, z, r) {
    const h = r.irange(9, 15);
    trunk(ctx, x, y, z, h, B.teak_log);
    blob(ctx, x, y + h, z, 3, 1, 3, B.teak_leaves, r, 0.2);
    blob(ctx, x, y + h + 1, z, 2, 1, 2, B.teak_leaves, r, 0.2);
    for (let i = 0; i < 2; i++) {
      const a = r.next() * Math.PI * 2;
      const by = y + r.irange(4, h - 3);
      const end = branch(ctx, x, by, z, Math.cos(a), Math.sin(a), 2, 0.3, B.teak_log);
      blob(ctx, end[0], end[1], end[2], 2, 1, 2, B.teak_leaves, r);
    }
    hangVines(ctx, x, y + h, z, 4, r);
    for (const [dx, dz, f] of [[1, 0, 3], [-1, 0, 1], [0, 1, 0], [0, -1, 2]]) {
      for (let k = 1; k < h - 1; k++) if (r.hash(x + dx, y + k, z + dz) < 0.3) ctx.put(x + dx, y + k, z + dz, B.vines, f);
    }
  },
  big_teak(ctx, x, y, z, r) {
    const h = r.irange(18, 28);
    for (let i = 0; i < h; i++) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) ctx.log(x + dx, y + i, z + dz, B.teak_log, 0);
    blob(ctx, x, y + h, z, 5, 2, 5, B.teak_leaves, r, 0.18);
    blob(ctx, x, y + h + 2, z, 3, 1, 3, B.teak_leaves, r, 0.18);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + r.next() * 0.6;
      const by = y + r.irange(Math.floor(h * 0.5), h - 4);
      const end = branch(ctx, x, by, z, Math.cos(a), Math.sin(a), r.irange(3, 5), 0.4, B.teak_log);
      blob(ctx, end[0], end[1] + 1, end[2], 3, 1, 3, B.teak_leaves, r);
    }
    hangVines(ctx, x, y + h, z, 6, r);
    for (const [dx, dz] of [[2, 0], [-1, 0], [0, 2], [0, -1], [2, 1], [1, 2], [-1, 1], [1, -1]]) {
      if (r.next() < 0.5) ctx.log(x + dx, y, z + dz, B.teak_log, 0);
    }
  },
  elder(ctx, x, y, z, r) {
    const h = r.irange(18, 28);
    // 2x2 trunk with buttress roots
    for (let i = -3; i < h; i++) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) ctx.log(x + dx, y + i, z + dz, B.elder_log, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + r.next() * 0.5;
      const dx = Math.cos(a), dz = Math.sin(a);
      let fx = x + 1 + dx, fz = z + 1 + dz, fy = y + r.irange(2, 4);
      const len = r.irange(3, 6);
      const ax = Math.abs(dx) > Math.abs(dz) ? 1 : 2;
      // start from the trunk cell nearest the root and step one axis at a time (two blocks tall), so the root
      // stays face-connected to the trunk all the way down
      let px = Math.min(x + 1, Math.max(x, Math.floor(fx))), pz = Math.min(z + 1, Math.max(z, Math.floor(fz)));
      for (let k = 0; k < len; k++) {
        const nx = Math.floor(fx), ny = Math.floor(fy), nz = Math.floor(fz);
        if (nx !== px && nz !== pz) { ctx.log(nx, ny, pz, B.elder_log, ax); ctx.log(nx, ny - 1, pz, B.elder_log, 0); }
        ctx.log(nx, ny, nz, B.elder_log, ax);
        ctx.log(nx, ny - 1, nz, B.elder_log, 0);
        px = nx; pz = nz;
        fx += dx * 0.9; fz += dz * 0.9; fy -= 0.6;
      }
    }
    // canopy layers
    blob(ctx, x, y + h, z, 7, 3, 7, B.elder_leaves, r, 0.15);
    blob(ctx, x, y + h + 3, z, 4, 2, 4, B.elder_leaves, r, 0.15);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + r.next() * 0.5;
      const by = y + r.irange(Math.floor(h * 0.45), h - 4);
      const end = branch(ctx, x, by, z, Math.cos(a), Math.sin(a), r.irange(4, 7), 0.45, B.elder_log);
      blob(ctx, end[0], end[1] + 1, end[2], 4, 2, 4, B.elder_leaves, r, 0.2);
    }
    hangVines(ctx, x, y + h - 1, z, 8, r);
  },
  palm(ctx, x, y, z, r) {
    const h = r.irange(6, 9);
    const a = r.next() * Math.PI * 2;
    const dx = Math.cos(a), dz = Math.sin(a);
    let fx = x + 0.5, fz = z + 0.5;
    let tx = x, tz = z;
    for (let i = 0; i < h; i++) {
      const nx = Math.floor(fx), nz = Math.floor(fz);
      // the lean steps one axis at a time so every trunk block shares a face with the one below
      if (nx !== tx || nz !== tz) { ctx.log(tx, y + i, tz, B.palm_log, 0); if (nx !== tx && nz !== tz) ctx.log(nx, y + i, tz, B.palm_log, 0); }
      tx = nx; tz = nz;
      ctx.log(tx, y + i, tz, B.palm_log, 0);
      if (i > 2) { fx += dx * 0.3; fz += dz * 0.3; }
    }
    const top = y + h;
    ctx.leaf(tx, top, tz, B.palm_leaves);
    // fronds droop in face-connected steps (a lone diagonal leaf would float)
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let py = top;
      for (let k = 1; k <= 4; k++) {
        const yy = top - (k >= 3 ? k - 2 : 0);
        if (yy < py) ctx.leaf(tx + ox * k, py, tz + oz * k, B.palm_leaves);
        ctx.leaf(tx + ox * k, yy, tz + oz * k, B.palm_leaves);
        py = yy;
      }
    }
    let flip = 0;
    for (const [ox, oz] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const path = flip++ & 1 ? [[1, 0, 1], [1, 0, 2], [2, 0, 2], [2, -1, 2], [2, -1, 3], [3, -1, 3]] : [[1, 0, 1], [2, 0, 1], [2, 0, 2], [2, -1, 2], [3, -1, 2], [3, -1, 3]];
      for (const [a, dy, b] of path) ctx.leaf(tx + ox * a, top + dy, tz + oz * b, B.palm_leaves);
    }
  },
  umbrella(ctx, x, y, z, r) {
    const h = r.irange(4, 6);
    trunk(ctx, x, y, z, h, B.oak_log);
    const a = r.next() * Math.PI * 2;
    const end = branch(ctx, x, y + h - 1, z, Math.cos(a) * 0.9, Math.sin(a) * 0.9, r.irange(2, 3), 0.7, B.oak_log);
    const [ex, ey, ez] = end;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      if (Math.abs(dx) + Math.abs(dz) > 4) continue;
      ctx.leaf(ex + dx, ey + 1, ez + dz, B.oak_leaves);
      if (Math.abs(dx) + Math.abs(dz) <= 2) ctx.leaf(ex + dx, ey + 2, ez + dz, B.oak_leaves);
    }
  },
  dead(ctx, x, y, z, r, logId = B.oak_log) {
    const h = r.irange(3, 6);
    trunk(ctx, x, y, z, h, logId);
    for (let i = 0; i < 2; i++) {
      const a = r.next() * Math.PI * 2;
      branch(ctx, x, y + r.irange(1, h - 1), z, Math.cos(a), Math.sin(a), r.irange(1, 2), 0.5, logId);
    }
  },
  charred(ctx, x, y, z, r) { TREES.dead(ctx, x, y, z, r, B.pine_log); },
  bush(ctx, x, y, z, r) {
    ctx.log(x, y, z, B.oak_log, 0);
    blob(ctx, x, y + 1, z, 2, 1, 2, B.oak_leaves, r, 0.3);
  },
  jungle_bush(ctx, x, y, z, r) {
    ctx.log(x, y, z, B.teak_log, 0);
    blob(ctx, x, y, z, 2, 1, 2, B.teak_leaves, r, 0.25);
  },
};

function hangVines(ctx, x, y, z, rad, r) {
  for (let i = 0; i < rad * 4; i++) {
    const a = r.next() * Math.PI * 2;
    const d = rad * (0.6 + r.next() * 0.45);
    const vx = Math.round(x + Math.cos(a) * d), vz = Math.round(z + Math.sin(a) * d);
    const len = r.irange(2, 7);
    for (let k = 0; k < len; k++) ctx.leaf(vx, y - 1 - k, vz, B.vines, true);
  }
}
