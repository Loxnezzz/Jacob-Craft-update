// Entity framework: base entity, dropped items, falling blocks, particles.
import { moveEntity } from './physics.js';
import { rayBox } from './physics.js';
import { ITEMS, maxStack } from './items.js';
import { stackExtra } from './inventory.js';
import { mat4 } from '../core/math.js';
import { BLOCKS, IS_LIQUID, BLOCK_FACE_TEX } from '../world/blocks.js';

let NEXT_ID = 1;

export class Entity {
  constructor(game, x, y, z) {
    this.id = NEXT_ID++;
    this.game = game;
    this.x = x; this.y = y; this.z = z;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.hw = 0.25; this.h = 0.5;
    this.yaw = 0;
    this.onGround = false;
    this.inWater = false;
    this.dead = false;
    this.age = 0;
    this.persistent = false;
    this.type = 'entity';
  }
  get world() { return this.game.world; }
  physics(dt, gravity = 32, airDrag = 0.98, groundFriction = 0.55) {
    const w = this.world;
    const id = w.getBlock(Math.floor(this.x), Math.floor(this.y + 0.1), Math.floor(this.z));
    this.inWater = IS_LIQUID[id] === 1;
    if (this.inWater) {
      this.vy += (this.floats ? 6 : -4) * dt;
      this.vy *= Math.exp(-3 * dt);
      this.vx *= Math.exp(-2 * dt); this.vz *= Math.exp(-2 * dt);
    } else {
      this.vy -= gravity * dt;
      this.vy *= Math.pow(airDrag, dt * 20);
    }
    const r = moveEntity(w, this, this.vx * dt, this.vy * dt, this.vz * dt);
    if (r.hitX) this.vx = 0;
    if (r.hitZ) this.vz = 0;
    if (r.hitY) { this.onGround = this.vy < 0; this.vy = 0; } else this.onGround = false;
    if (this.onGround) { const f = Math.pow(groundFriction, dt * 20); this.vx *= f; this.vz *= f; }
    else { const f = Math.pow(airDrag, dt * 20); this.vx *= f; this.vz *= f; }
    return r;
  }
  lightAt() {
    const l = this.world.getLight(Math.floor(this.x), Math.floor(this.y + this.h * 0.5), Math.floor(this.z));
    return [(l >> 4) / 15, (l & 15) / 15];
  }
  distTo(x, y, z) { return Math.hypot(this.x - x, this.y - y, this.z - z); }
  update() {}
  render() {}
  serialize() { return null; }
  hurt() { return false; }
}

export class ItemEntity extends Entity {
  constructor(game, x, y, z, stack, vx = 0, vy = 0, vz = 0) {
    super(game, x, y, z);
    this.type = 'item';
    this.stack = stack;
    this.vx = vx; this.vy = vy; this.vz = vz;
    this.hw = 0.125; this.h = 0.25;
    this.pickupDelay = 0.5;
    this.life = 300;
    this.spin = Math.random() * Math.PI * 2;
    this.floats = true;
    this.mergeTimer = Math.random();
    this.persistent = true;
  }
  update(dt) {
    this.age += dt;
    this.pickupDelay -= dt;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    this.physics(dt, 24, 0.98, 0.6);
    const g = this.game;
    // lava burns items
    if (IS_LIQUID[this.world.getBlock(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z))] === 2) {
      this.dead = true; g.particles.smoke(this.x, this.y + 0.3, this.z, 4); return;
    }
    // merge
    this.mergeTimer -= dt;
    if (this.mergeTimer <= 0) {
      this.mergeTimer = 1;
      const ms = maxStack(this.stack.id);
      if (this.stack.count < ms) {
        for (const o of g.entities.list) {
          if (o === this || o.dead || o.type !== 'item' || o.stack.id !== this.stack.id || (o.stack.dmg || 0) !== (this.stack.dmg || 0) || stackExtra(o.stack) || stackExtra(this.stack)) continue;
          if (Math.abs(o.x - this.x) > 1.2 || Math.abs(o.y - this.y) > 0.6 || Math.abs(o.z - this.z) > 1.2) continue;
          const n = Math.min(ms - this.stack.count, o.stack.count);
          if (n <= 0) continue;
          this.stack.count += n; o.stack.count -= n;
          if (o.stack.count <= 0) o.dead = true;
          this.life = Math.max(this.life, o.life);
        }
      }
    }
    // pickup
    const p = g.player;
    if (this.pickupDelay <= 0 && p && !p.dead) {
      const dx = p.x - this.x, dy = (p.y + 0.9) - (this.y + 0.1), dz = p.z - this.z;
      // a little more reach downward so drops from the block you mined beneath your feet are collected
      if (Math.abs(dx) < 1.0 && dy < 2.05 && dy > -1.4 && Math.abs(dz) < 1.0) {
        const before = this.stack.count;
        const left = p.inventory.add(this.stack.id, this.stack.count, this.stack.dmg || 0, g.inventoryOrder(), stackExtra(this.stack));
        if (left < before) {
          g.audio && g.audio.play('pickup', { x: this.x, y: this.y, z: this.z });
          g.onPickup && g.onPickup(this.stack.id, before - left);
        }
        this.stack.count = left;
        if (left <= 0) this.dead = true;
      } else if (Math.abs(dx) < 2.2 && Math.abs(dy) < 2 && Math.abs(dz) < 2.2) {
        // magnet
        this.vx += dx * dt * 6; this.vz += dz * dt * 6; this.vy += dy * dt * 4;
      }
    }
  }
  render(er, F, list) {
    const it = ITEMS[this.stack.id];
    const cube = it.block >= 0 && !it.flatIcon;
    const bob = Math.sin(this.age * 2.5 + this.spin) * 0.06;
    const n = this.stack.count > 32 ? 3 : this.stack.count > 1 ? 2 : 1;
    const [sky, blk] = this.lightAt();
    for (let k = 0; k < n; k++) {
      const M = mat4.create();
      const ox = k * 0.07, oy = k * 0.05, oz = -k * 0.05;
      mat4.translate(M, M, this.x - F.camPos[0] + ox, this.y + 0.2 + bob + oy - F.camPos[1], this.z - F.camPos[2] + oz);
      mat4.rotateY(M, M, this.age * 1.6 + this.spin);
      const s = cube ? 0.25 : 0.42;
      mat4.scale(M, M, s, s, s);
      list.push([this.stack.id, M, [sky, blk, 0, it.glow ? 0.6 : 0]]);
    }
  }
  serialize() { return { t: 'item', x: this.x, y: this.y, z: this.z, s: this.stack, life: this.life }; }
}

export class FallingBlock extends Entity {
  constructor(game, x, y, z, id, meta, targetY) {
    super(game, x + 0.5, y, z + 0.5);
    this.type = 'falling';
    this.block = id; this.meta = meta; this.targetY = targetY;
    this.hw = 0.49; this.h = 0.98;
  }
  update(dt) {
    this.age += dt;
    this.vy -= 32 * dt;
    this.y += this.vy * dt;
    if (this.y <= this.targetY || this.age > 10) this.dead = true;
  }
  render(er, F, list) {
    const M = mat4.create();
    mat4.translate(M, M, this.x - F.camPos[0], this.y + 0.5 - F.camPos[1], this.z - F.camPos[2]);
    const [sky, blk] = this.lightAt();
    list.push([this.block, M, [sky, blk, 0, 0]]);
  }
}

export class EntityManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.itemDraw = [];
  }
  add(e) { this.list.push(e); return e; }
  dropItem(x, y, z, id, count = 1, dmg = 0, toss = null, extra = null) {
    if (!id || count <= 0) return null;
    const vx = toss ? toss[0] : (Math.random() - 0.5) * 2.2;
    const vy = toss ? toss[1] : 3 + Math.random() * 2;
    const vz = toss ? toss[2] : (Math.random() - 0.5) * 2.2;
    const e = new ItemEntity(this.game, x, y, z, Object.assign({ id, count, dmg }, extra || {}), vx, vy, vz);
    if (toss) e.pickupDelay = 1.5;
    return this.add(e);
  }
  update(dt) {
    const w = this.game.world;
    for (const e of this.list) {
      if (e.dead) continue;
      if (!w.isLoaded(e.x, e.z) || !w.isLoaded(e.x + 16, e.z) || !w.isLoaded(e.x - 16, e.z) || !w.isLoaded(e.x, e.z + 16) || !w.isLoaded(e.x, e.z - 16)) {
        e.frozen = true; continue;
      }
      e.frozen = false;
      e.update(dt);
    }
    if (this.list.some(e => e.dead)) this.list = this.list.filter(e => !e.dead || (e.onRemoved && e.onRemoved(), false));
  }
  // entities whose AABB the ray hits; returns nearest {e, t}
  raycast(ox, oy, oz, dx, dy, dz, maxD, filter) {
    let best = null;
    for (const e of this.list) {
      if (e.dead || !e.hittable || (filter && !filter(e))) continue;
      if (Math.abs(e.x - ox) > maxD + 4 || Math.abs(e.z - oz) > maxD + 4) continue;
      const pad = e.hitPad || 0.05;
      const h = rayBox(ox, oy, oz, dx, dy, dz, e.x - e.hw - pad, e.y - pad, e.z - e.hw - pad, e.x + e.hw + pad, e.y + e.h + pad, e.z + e.hw + pad);
      if (h && h.t <= maxD && (!best || h.t < best.t)) best = { e, t: h.t };
    }
    return best;
  }
  near(x, y, z, r, filter) {
    const out = [];
    for (const e of this.list) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - x, e.y - y, e.z - z);
      if (d <= r && (!filter || filter(e))) out.push(e);
    }
    return out;
  }
  count(filter) { let n = 0; for (const e of this.list) if (!e.dead && filter(e)) n++; return n; }
  render(er, F) {
    er.beginBoxes();
    this.itemDraw.length = 0;
    const cam = F.camPos;
    const R = F.renderDist * 16;
    for (const e of this.list) {
      if (e.dead || e.hidden) continue;
      const dx = e.x - cam[0], dz = e.z - cam[2];
      if (dx * dx + dz * dz > R * R) continue;
      e.render(er, F, this.itemDraw);
    }
  }
  serialize() {
    const out = [];
    for (const e of this.list) { if (e.dead || !e.persistent) continue; const s = e.serialize(); if (s) out.push(s); }
    return out;
  }
}

// ---------------------------------------------------------------- particles
export class Particles {
  constructor(game) { this.game = game; this.list = []; }
  add(p) {
    if (this.list.length > 6000) return;
    p.age = 0;
    this.list.push(p);
  }
  update(dt) {
    const w = this.game.world;
    let j = 0;
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vy -= (p.grav ?? 0) * dt;
      const drag = Math.exp(-(p.drag ?? 0.5) * dt);
      p.vx *= drag; p.vy *= drag; p.vz *= drag;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      if (p.collide) {
        const id = w.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
        if (id && BLOCKS[id].solid && BLOCKS[id].opaque) { p.vy = 0; p.vx *= 0.5; p.vz *= 0.5; if (p.onLand) { const f = p.onLand; p.onLand = null; f(p); p.age = Math.max(p.age, p.life - 0.15); } }
        else { p.x = nx; p.y = ny; p.z = nz; }
      } else { p.x = nx; p.y = ny; p.z = nz; }
      if (p.fade) p.a = p.a0 * (1 - p.age / p.life);
      if (p.grow) p.size = p.size0 * (1 + p.grow * p.age / p.life);
      if (p.spinv) p.rot += p.spinv * dt;
      if (p.lightUpd) {
        const l = w.getLight(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
        p.light = Math.max((l >> 4) / 15, (l & 15) / 15 * 0.9);
      }
      this.list[j++] = p;
    }
    this.list.length = j;
  }
  lightAt(x, y, z) {
    const l = this.game.world.getLight(Math.floor(x), Math.floor(y), Math.floor(z));
    return Math.max((l >> 4) / 15, (l & 15) / 15 * 0.9);
  }
  blockBreak(x, y, z, id) {
    const layer = BLOCK_FACE_TEX[id * 6 + 0];
    const light = this.lightAt(x + 0.5, y + 0.5, z + 0.5);
    const b = BLOCKS[id];
    const tint = b.tint ? [0.55, 0.75, 0.35] : [1, 1, 1];
    for (let i = 0; i < 28; i++) {
      const px = x + Math.random(), py = y + Math.random(), pz = z + Math.random();
      this.add({
        x: px, y: py, z: pz, vx: (px - x - 0.5) * 4, vy: Math.random() * 4 + 1, vz: (pz - z - 0.5) * 4,
        size: 0.08 + Math.random() * 0.08, r: tint[0], g: tint[1], b: tint[2], a: 1, layer, u0: Math.random() * 0.8, v0: Math.random() * 0.8, uvs: 0.18,
        life: 0.6 + Math.random() * 0.6, grav: 22, drag: 0.4, collide: true, light,
      });
    }
  }
  blockHit(x, y, z, id, face) {
    const layer = BLOCK_FACE_TEX[id * 6 + 0];
    const light = this.lightAt(x + 0.5, y + 1, z + 0.5);
    const n = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][face] || [0, 1, 0];
    for (let i = 0; i < 2; i++) {
      const px = x + 0.5 + n[0] * 0.52 + (n[0] ? 0 : Math.random() - 0.5);
      const py = y + 0.5 + n[1] * 0.52 + (n[1] ? 0 : Math.random() - 0.5);
      const pz = z + 0.5 + n[2] * 0.52 + (n[2] ? 0 : Math.random() - 0.5);
      this.add({ x: px, y: py, z: pz, vx: n[0] * 1.5 + (Math.random() - 0.5), vy: 1.5 + Math.random(), vz: n[2] * 1.5 + (Math.random() - 0.5), size: 0.07, r: 1, g: 1, b: 1, a: 1, layer, u0: Math.random() * 0.8, v0: Math.random() * 0.8, uvs: 0.15, life: 0.4, grav: 20, collide: true, light });
    }
  }
  smoke(x, y, z, n = 6, dark = 0.3) {
    for (let i = 0; i < n; i++) {
      this.add({ x: x + (Math.random() - 0.5) * 0.4, y: y + Math.random() * 0.2, z: z + (Math.random() - 0.5) * 0.4, vx: (Math.random() - 0.5) * 0.3, vy: 0.8 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.3,
        size: 0.25, size0: 0.25, grow: 2.5, r: dark, g: dark, b: dark, a: 0.5, a0: 0.5, fade: true, layer: -1, life: 1.6 + Math.random(), grav: -0.2, drag: 0.8, light: this.lightAt(x, y, z) });
    }
  }
  flame(x, y, z) {
    this.add({ x, y, z, vx: (Math.random() - 0.5) * 0.1, vy: 0.25 + Math.random() * 0.3, vz: (Math.random() - 0.5) * 0.1, size: 0.12, size0: 0.12, grow: -0.6, r: 1.0, g: 0.55, b: 0.18, a: 1, a0: 1, fade: true, layer: -1, life: 0.5 + Math.random() * 0.3, emis: 4, add: true });
  }
  ember(x, y, z, s = 1) {
    this.add({ x, y, z, vx: (Math.random() - 0.5) * 1.2 * s, vy: 0.5 + Math.random() * 1.5 * s, vz: (Math.random() - 0.5) * 1.2 * s, size: 0.05, r: 1, g: 0.45, b: 0.1, a: 1, a0: 1, fade: true, layer: -2, life: 1 + Math.random() * 1.5, emis: 6, add: true, grav: -0.3, drag: 0.6 });
  }
  splash(x, y, z, n = 10) {
    for (let i = 0; i < n; i++) {
      this.add({ x: x + (Math.random() - 0.5) * 0.8, y, z: z + (Math.random() - 0.5) * 0.8, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 2, size: 0.06, r: 0.65, g: 0.78, b: 0.95, a: 0.8, a0: 0.8, fade: true, layer: -1, life: 0.6, grav: 20, light: this.lightAt(x, y + 1, z) });
    }
  }
  sparkle(x, y, z, col = [1, 0.9, 0.5], n = 8) {
    for (let i = 0; i < n; i++) {
      this.add({ x: x + (Math.random() - 0.5), y: y + Math.random(), z: z + (Math.random() - 0.5), vx: (Math.random() - 0.5) * 0.6, vy: Math.random() * 0.8, vz: (Math.random() - 0.5) * 0.6, size: 0.07, r: col[0], g: col[1], b: col[2], a: 1, a0: 1, fade: true, layer: -2, life: 0.8 + Math.random() * 0.6, emis: 3, add: true });
    }
  }
  hearts(x, y, z) {
    for (let i = 0; i < 4; i++) this.add({ x: x + (Math.random() - 0.5) * 0.6, y: y + Math.random() * 0.4, z: z + (Math.random() - 0.5) * 0.6, vx: 0, vy: 0.8, vz: 0, size: 0.18, r: 1, g: 0.2, b: 0.3, a: 1, a0: 1, fade: true, layer: -2, life: 1.2, emis: 2, add: false });
  }
  crit(x, y, z) {
    for (let i = 0; i < 10; i++) this.add({ x, y, z, vx: (Math.random() - 0.5) * 4, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 4, size: 0.06, r: 1, g: 0.85, b: 0.4, a: 1, a0: 1, fade: true, layer: -2, life: 0.5, emis: 2, add: true, grav: 8 });
  }
  poof(x, y, z, n = 14) {
    for (let i = 0; i < n; i++) this.add({ x: x + (Math.random() - 0.5), y: y + Math.random() * 1.2, z: z + (Math.random() - 0.5), vx: (Math.random() - 0.5) * 1.5, vy: Math.random() * 1.2, vz: (Math.random() - 0.5) * 1.5, size: 0.3, size0: 0.3, grow: 1, r: 0.9, g: 0.9, b: 0.9, a: 0.7, a0: 0.7, fade: true, layer: -1, life: 0.8 + Math.random() * 0.4, drag: 2, light: this.lightAt(x, y + 0.5, z) });
  }
}
