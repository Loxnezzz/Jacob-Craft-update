// Builds UI icons (data URLs) for every item: isometric cubes for blocks, scaled sprites for items.
import { ITEMS } from '../game/items.js';
import { BLOCKS, SHAPE, TINT, BLOCK_FACE_TEX, BLOCK_FRONT_TEX, texLayer } from '../world/blocks.js';
import { TS } from '../gfx/texgen.js';
import { drawItemSprite } from '../gfx/itemArt.js';
import { BIRCH_TINT, PINE_TINT } from '../world/biomes.js';

const DEFAULT_TINT = {
  [TINT.GRASS]: [0.52, 0.74, 0.34],
  [TINT.FOLIAGE]: [0.42, 0.64, 0.28],
  [TINT.BIRCH]: BIRCH_TINT,
  [TINT.PINE]: PINE_TINT,
  [TINT.WATER]: [0.25, 0.45, 0.85],
};

export class IconFactory {
  constructor(texData) {
    this.alb = texData.albedo;
    this.nrm = texData.normal;
    this.icons = [];        // data URL per item id
    this.sprites = [];      // 16x16 RGBA per non-block item
    this.faceCache = new Map();
  }

  faceCanvas(layer, tint, shade, crop) {
    const key = layer + '|' + (tint ? tint.join() : '') + '|' + shade + '|' + (crop || '');
    let c = this.faceCache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = TS; c.height = TS;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(TS, TS);
    const off = layer * TS * TS * 4;
    for (let i = 0; i < TS * TS; i++) {
      let r = this.alb[off + i * 4], g = this.alb[off + i * 4 + 1], b = this.alb[off + i * 4 + 2];
      const a = this.alb[off + i * 4 + 3];
      const m = this.nrm[off + i * 4 + 2] / 255;
      if (tint && m > 0) { r *= 1 - m + m * tint[0]; g *= 1 - m + m * tint[1]; b *= 1 - m + m * tint[2]; }
      const y = (i / TS) | 0;
      if (crop && y < crop) { img.data[i * 4 + 3] = 0; continue; }
      img.data[i * 4] = r * shade; img.data[i * 4 + 1] = g * shade; img.data[i * 4 + 2] = b * shade; img.data[i * 4 + 3] = a < 128 && tint === null ? a : a;
    }
    ctx.putImageData(img, 0, 0);
    this.faceCache.set(key, c);
    return c;
  }

  cubeIcon(top, left, right, tints, height = 1) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const k = 28 / TS;
    const h = height;
    const dy = (1 - h) * 28;
    // top
    ctx.setTransform(k, -k / 2, k, k / 2, 4, 18 + dy);
    ctx.drawImage(this.faceCanvas(top, tints[0], 1.0), 0, 0);
    const crop = h < 1 ? Math.round((1 - h) * TS) : 0;
    // left (front-left)
    ctx.setTransform(k, k / 2, 0, k, 4, 18);
    ctx.drawImage(this.faceCanvas(left, tints[1], 0.78, crop), 0, 0);
    // right
    ctx.setTransform(k, -k / 2, 0, k, 32, 32);
    ctx.drawImage(this.faceCanvas(right, tints[2], 0.6, crop), 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return c.toDataURL();
  }

  // isometric icon built from a block's box model (furniture etc.)
  modelIcon(b, tint) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const boxes = b.modelBoxes.map((m, i) => ({ m, i })).sort((A, B2) => (A.m.lo[0] + A.m.lo[2] + A.m.lo[1] * 0.2) - (B2.m.lo[0] + B2.m.lo[2] + B2.m.lo[1] * 0.2));
    // fit small models to the icon
    let x0 = 1, y0 = 1, z0 = 1, x1 = 0, y1 = 0, z1 = 0;
    for (const { m } of boxes) { x0 = Math.min(x0, m.lo[0]); y0 = Math.min(y0, m.lo[1]); z0 = Math.min(z0, m.lo[2]); x1 = Math.max(x1, m.hi[0]); y1 = Math.max(y1, m.hi[1]); z1 = Math.max(z1, m.hi[2]); }
    const ext = Math.max(x1 - x0, z1 - z0, (y1 - y0) * 0.9);
    const sc = Math.min(1.9, 1 / Math.max(0.2, ext)) * (ext < 0.99 ? 0.9 : 1);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, cy = (y0 + y1) / 2;
    const ccx = 32 + (cx - cz) * 28, ccy = 36 + (cx + cz) * 14 - cy * 28;
    const Gm = new DOMMatrix().translate(32, 34).scale(sc).translate(-ccx, -ccy);
    const draw = (layer, shade, mtx, sx, sy, sw, sh) => {
      if (sw <= 0 || sh <= 0) return;
      ctx.setTransform(Gm.multiply(mtx));
      ctx.drawImage(this.faceCanvas(layer, tint, shade), sx, sy, sw, sh, sx, sy, sw, sh);
    };
    const T = 32, K = 28 / 32, H = 14 / 32;
    for (const { m } of boxes) {
      const [ax, ay, az] = m.lo, [bx, by, bz] = m.hi;
      const tex = (f) => m.tex >= 0 ? m.tex : BLOCK_FACE_TEX[b.id * 6 + f];
      // +z (left) face
      draw(tex(4), 0.78, new DOMMatrix([K, H, 0, K, 32 - bz * 28, 8 + bz * 14]), ax * T, (1 - by) * T, (bx - ax) * T, (by - ay) * T);
      // +x (right) face
      draw(tex(0), 0.6, new DOMMatrix([K, -H, 0, K, 4 + bx * 28, 22 + bx * 14]), (1 - bz) * T, (1 - by) * T, (bz - az) * T, (by - ay) * T);
      // top
      draw(tex(2), 1.0, new DOMMatrix([K, H, -K, H, 32, 36 - by * 28]), ax * T, az * T, (bx - ax) * T, (bz - az) * T);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return c.toDataURL();
  }

  stairIcon(b, tint) {
    // reuse the model renderer with a two-box stair shape
    const fake = { id: b.id, modelBoxes: [{ lo: [0, 0, 0], hi: [1, 0.5, 1], tex: -1 }, { lo: [0, 0.5, 0], hi: [1, 1, 0.5], tex: -1 }] };
    return this.modelIcon(fake, tint);
  }

  flatIcon(layers, tint) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    if (layers.length === 2) {
      ctx.drawImage(this.faceCanvas(layers[0], tint, 1), 16, 0, 32, 32);
      ctx.drawImage(this.faceCanvas(layers[1], tint, 1), 16, 32, 32, 32);
    } else {
      ctx.drawImage(this.faceCanvas(layers[0], tint, 1), 0, 0, 64, 64);
    }
    return c.toDataURL();
  }

  spriteIcon(d) {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 16;
    c.getContext('2d').putImageData(new ImageData(d, 16, 16), 0, 0);
    const big = document.createElement('canvas');
    big.width = 64; big.height = 64;
    const ctx = big.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(c, 0, 0, 64, 64);
    return big.toDataURL();
  }

  build() {
    for (const it of ITEMS) {
      if (!it) continue;
      try {
        if (it.block >= 0) {
          const b = BLOCKS[it.block];
          const tint = b.tint ? DEFAULT_TINT[b.tint] : null;
          if (b.shape === SHAPE.MODEL) this.icons[it.id] = this.modelIcon(b, tint);
          else if (it.flatIcon) {
            if (b.shape === SHAPE.DOOR) this.icons[it.id] = this.flatIcon([texLayer('door_top'), texLayer('door_bottom')], null);
            else if (b.shape === SHAPE.BED) this.icons[it.id] = this.cubeIcon(texLayer('bed_head_top'), texLayer('bed_side'), texLayer('bed_side'), [null, null, null], 0.56);
            else this.icons[it.id] = this.flatIcon([BLOCK_FACE_TEX[b.id * 6]], tint);
          } else {
            const top = BLOCK_FACE_TEX[b.id * 6 + 2];
            let left = BLOCK_FACE_TEX[b.id * 6 + 4], right = BLOCK_FACE_TEX[b.id * 6 + 0];
            if (BLOCK_FRONT_TEX[b.id] >= 0) left = BLOCK_FRONT_TEX[b.id];
            const t = [tint, b.name === 'grass' ? tint : tint, tint];
            let h = 1;
            if (b.shape === SHAPE.SLAB) h = 0.5;
            if (b.shape === SHAPE.STAIRS) { this.icons[it.id] = this.stairIcon(b, tint); continue; }
            if (b.shape === SHAPE.SNOW_LAYER) h = 0.25;
            if (b.shape === SHAPE.FARMLAND || b.shape === SHAPE.PATH) h = 0.94;
            this.icons[it.id] = this.cubeIcon(top, left, right, t, h);
          }
        } else {
          const d = drawItemSprite(it);
          this.sprites[it.id] = d;
          this.icons[it.id] = this.spriteIcon(d);
        }
      } catch (e) {
        console.warn('icon failed', it.name, e);
      }
    }
    return this;
  }
}
