// Collision + selection boxes for block shapes. Boxes are [x0,y0,z0,x1,y1,z1] in block-local units.
import { BLOCKS, SHAPE, B, rotateBox } from './blocks.js';

const FULL = [[0, 0, 0, 1, 1, 1]];
const NONE = [];

function modelBoxes(b, meta) {
  const f = b.oriented ? meta & 3 : 0;
  return b.modelBoxes.map(m => { const [lo, hi] = rotateBox(m.lo, m.hi, f); return [lo[0], lo[1], lo[2], hi[0], Math.min(1.5, hi[1]), hi[2]]; });
}

function doorBox(meta) {
  const facing = meta & 3, open = (meta >> 2) & 1;
  const side = open ? (facing + 1) & 3 : facing;
  const t = 3 / 16;
  if (side === 0) return [[0, 0, 0, 1, 1, t]];
  if (side === 1) return [[1 - t, 0, 0, 1, 1, 1]];
  if (side === 2) return [[0, 0, 1 - t, 1, 1, 1]];
  return [[0, 0, 0, t, 1, 1]];
}

function stairsBoxes(meta) {
  const facing = meta & 3, up = meta & 4;
  const base = up ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1];
  const y0 = up ? 0 : 0.5, y1 = up ? 0.5 : 1;
  let s;
  if (facing === 0) s = [0, y0, 0, 1, y1, 0.5];
  else if (facing === 1) s = [0.5, y0, 0, 1, y1, 1];
  else if (facing === 2) s = [0, y0, 0.5, 1, y1, 1];
  else s = [0, y0, 0, 0.5, y1, 1];
  return [base, s];
}

function fenceBoxes(world, x, y, z, tall) {
  const h = tall ? 1.5 : 1;
  const boxes = [[6 / 16, 0, 6 / 16, 10 / 16, h, 10 / 16]];
  if (!world) return boxes;
  const conn = (dx, dz) => {
    const id = world.getBlock(x + dx, y, z + dz);
    const b = BLOCKS[id];
    return b.fence || (b.opaque && b.shape === SHAPE.CUBE) || b.interact === 'door';
  };
  if (conn(1, 0)) boxes.push([10 / 16, 0, 6 / 16, 1, h, 10 / 16]);
  if (conn(-1, 0)) boxes.push([0, 0, 6 / 16, 6 / 16, h, 10 / 16]);
  if (conn(0, 1)) boxes.push([6 / 16, 0, 10 / 16, 10 / 16, h, 1]);
  if (conn(0, -1)) boxes.push([6 / 16, 0, 0, 10 / 16, h, 6 / 16]);
  return boxes;
}

export function collisionBoxes(id, meta, world, x, y, z) {
  const b = BLOCKS[id];
  if (!b.solid) return NONE;
  switch (b.shape) {
    case SHAPE.CUBE: return FULL;
    case SHAPE.SLAB: return meta & 1 ? [[0, 0.5, 0, 1, 1, 1]] : [[0, 0, 0, 1, 0.5, 1]];
    case SHAPE.STAIRS: return stairsBoxes(meta);
    case SHAPE.FENCE: return fenceBoxes(world, x, y, z, true);
    case SHAPE.DOOR: return (meta >> 2) & 1 ? doorBox(meta) : doorBox(meta);
    case SHAPE.FARMLAND: case SHAPE.PATH: return [[0, 0, 0, 1, 15 / 16, 1]];
    case SHAPE.CACTUS: return [[1 / 16, 0, 1 / 16, 15 / 16, 15 / 16, 15 / 16]];
    case SHAPE.BED: return [[0, 0, 0, 1, 9 / 16, 1]];
    case SHAPE.FLAT: return [[0, 0, 0, 1, 1 / 64, 1]];
    case SHAPE.SNOW_LAYER: return (meta & 7) > 0 ? [[0, 0, 0, 1, (meta & 7) * 2 / 16, 1]] : NONE;
    case SHAPE.MODEL: return b.carpet ? [[0, 0, 0, 1, 1 / 16, 1]] : modelBoxes(b, meta);
    default: return FULL;
  }
}

export function selectionBoxes(id, meta, world, x, y, z) {
  const b = BLOCKS[id];
  switch (b.shape) {
    case SHAPE.NONE: case SHAPE.LIQUID: return NONE;
    case SHAPE.CUBE: return FULL;
    case SHAPE.CROSS: case SHAPE.WATER_PLANT:
      if (id === B.berry_bush) return [[1 / 16, 0, 1 / 16, 15 / 16, 14 / 16, 15 / 16]];
      return [[3 / 16, 0, 3 / 16, 13 / 16, 13 / 16, 13 / 16]];
    case SHAPE.CROP: return [[0, 0, 0, 1, Math.max(2, ((meta & 7) + 1) * 2) / 16, 1]];
    case SHAPE.TORCH: {
      if (meta >= 1 && meta <= 4) {
        const [dx, dz] = [[0, -1], [1, 0], [0, 1], [-1, 0]][meta - 1];
        const cx = 0.5 + dx * 0.3, cz = 0.5 + dz * 0.3;
        return [[cx - 0.15, 0.2, cz - 0.15, cx + 0.15, 0.85, cz + 0.15]];
      }
      return [[6 / 16, 0, 6 / 16, 10 / 16, 10 / 16, 10 / 16]];
    }
    case SHAPE.LADDER: {
      if (meta === 4) return [[2 / 16, 0, 2 / 16, 14 / 16, 1, 14 / 16]];
      const f = meta & 3, e = 2 / 16;
      if (f === 0) return [[0, 0, 0, 1, 1, e]];
      if (f === 1) return [[1 - e, 0, 0, 1, 1, 1]];
      if (f === 2) return [[0, 0, 1 - e, 1, 1, 1]];
      return [[0, 0, 0, e, 1, 1]];
    }
    case SHAPE.SNOW_LAYER: return [[0, 0, 0, 1, ((meta & 7) + 1) * 2 / 16, 1]];
    case SHAPE.FENCE: return fenceBoxes(world, x, y, z, false);
    case SHAPE.LANTERN: return meta & 1 ? [[5 / 16, 3 / 16, 5 / 16, 11 / 16, 1, 11 / 16]] : [[5 / 16, 0, 5 / 16, 11 / 16, 9 / 16, 11 / 16]];
    case SHAPE.FLAT: return [[0, 0, 0, 1, 1 / 16, 1]];
    case SHAPE.MODEL: return modelBoxes(BLOCKS[id], meta);
    default: {
      const c = collisionBoxes(id, meta, world, x, y, z);
      return c.length ? c : FULL;
    }
  }
}
