// Phase 6 combat: crossbows, thrown spears, flintlock firearms, melee specials, TNT and explosions.
import { ITEMS, I, blockDrops, enchLevel } from './items.js';
import { BLOCKS, B, IS_LIQUID, BLOCK_FACE_TEX } from '../world/blocks.js';
import { Entity } from './entities.js';
import { cloneStack, stackExtra } from './inventory.js';
import { Projectile } from '../mobs/mobs.js';
import { mat4 } from '../core/math.js';

const LOAD_TIME = { crossbow: 1.1, pistol: 1.5, blunderbuss: 2.1, launcher: 1.3 };

function rnd(a, b) { return a + Math.random() * (b - a); }
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
// random direction inside a cone around d
function jitter(d, spread) {
  if (!spread) return d;
  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
  // build a basis around d
  const up = Math.abs(d[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const u = norm([up[1] * d[2] - up[2] * d[1], up[2] * d[0] - up[0] * d[2], up[0] * d[1] - up[1] * d[0]]);
  const v = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
  return norm([d[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * r, d[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * r, d[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * r]);
}

// Orient an extruded item sprite (drawn handle bottom-left, tip top-right) so its tip points along (yaw, pitch).
export function spriteAlong(M, yaw, pitch, scale, roll = 0) {
  mat4.rotateY(M, M, yaw);
  mat4.rotateX(M, M, pitch);
  if (roll) mat4.rotateZ(M, M, roll);
  mat4.rotateY(M, M, Math.PI / 2);
  mat4.rotateZ(M, M, -Math.PI / 4);
  mat4.scale(M, M, scale, scale, scale);
  return M;
}

// ---------------------------------------------------------------- thrown spear
export class ThrownSpear extends Entity {
  constructor(game, owner, x, y, z, vx, vy, vz, stack, dmg) {
    super(game, x, y, z);
    this.type = 'spear'; this.owner = owner; this.stack = stack; this.dmg = dmg;
    this.vx = vx; this.vy = vy; this.vz = vz;
    this.hw = 0.15; this.h = 0.3;
    this.state = 'fly'; this.life = 600; this.persistent = true;
    this._yaw = Math.atan2(-vx, -vz); this._pitch = Math.atan2(vy, Math.hypot(vx, vz));
  }
  update(dt) {
    const g = this.game;
    this.age += dt; this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    if (this.state === 'fly') {
      this.vy -= 16 * dt;
      const steps = 4;
      for (let s = 0; s < steps; s++) {
        const nx = this.x + this.vx * dt / steps, ny = this.y + this.vy * dt / steps, nz = this.z + this.vz * dt / steps;
        for (const e of g.entities.list) {
          if (e === this.owner || e.dead || !e.hittable || e.type !== 'mob' || (e.deathT !== undefined && e.deathT >= 0)) continue;
          const hw = e.hw + 0.2;
          if (nx > e.x - hw && nx < e.x + hw && ny > e.y - 0.1 && ny < e.y + e.h + 0.1 && nz > e.z - hw && nz < e.z + hw) {
            const l = Math.hypot(this.vx, this.vz) || 1;
            e.hurt(this.dmg, { type: 'proj', entity: this.owner, dir: [this.vx / l, 0, this.vz / l], knock: 0.9, weapon: 'spear' });
            if (ITEMS[this.stack.id].tool.frost && !e.isBoss) { e.staggerT = Math.max(e.staggerT || 0, 2); g.particles.sparkle(e.x, e.y + e.h * 0.5, e.z, [0.7, 0.9, 1], 14); }
            g.audio.play('hit_pierce', this);
            this.vx *= -0.12; this.vz *= -0.12; this.vy = 2;
            this.state = 'drop';
            return;
          }
        }
        const id = g.world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
        if (id && BLOCKS[id].solid) {
          this.state = 'stuck';
          g.audio.play('arrow_hit', this);
          g.particles.blockHit(Math.floor(nx), Math.floor(ny), Math.floor(nz), id, 2);
          return;
        }
        this.x = nx; this.y = ny; this.z = nz;
      }
      this._yaw = Math.atan2(-this.vx, -this.vz); this._pitch = Math.atan2(this.vy, Math.hypot(this.vx, this.vz));
    } else if (this.state === 'drop') {
      this.physics(dt, 24, 0.98, 0.5);
      this._pitch += (-0.15 - this._pitch) * Math.min(1, dt * 6);
      if (this.onGround) this.state = 'stuck';
    }
    if (this.state !== 'fly' && this.age > 0.6) this.tryPickup();
  }
  tryPickup() {
    const g = this.game, p = g.player;
    if (!p || p.dead) return;
    if (Math.abs(p.x - this.x) < 1.3 && Math.abs(p.z - this.z) < 1.3 && Math.abs(p.y + 0.9 - this.y) < 1.8) {
      const s = this.stack;
      const left = p.inventory.add(s.id, 1, s.dmg || 0, g.inventoryOrder(), stackExtra(s));
      if (!left) { g.audio.play('pickup', this); this.dead = true; }
    }
  }
  render(er, F, list) {
    const M = mat4.create();
    mat4.translate(M, M, this.x - F.camPos[0], this.y - F.camPos[1], this.z - F.camPos[2]);
    spriteAlong(M, this._yaw, this._pitch, 1.25);
    const [sky, blk] = this.lightAt();
    list.push([this.stack.id, M, [sky, blk, 0, 0]]);
    const M2 = mat4.create();
    mat4.translate(M2, M2, this.x - F.camPos[0], this.y - F.camPos[1], this.z - F.camPos[2]);
    spriteAlong(M2, this._yaw, this._pitch, 1.25, Math.PI / 2);
    list.push([this.stack.id, M2, [sky, blk, 0, 0]]);
  }
  serialize() { return { t: 'item', x: this.x, y: this.y, z: this.z, s: cloneStack(this.stack), life: 300 }; }
}

// ---------------------------------------------------------------- primed TNT
export class PrimedTNT extends Entity {
  constructor(game, x, y, z, fuse = 4) {
    super(game, x, y, z);
    this.type = 'tnt'; this.fuse = fuse; this.hw = 0.49; this.h = 0.98;
    const a = Math.random() * Math.PI * 2;
    this.vx = Math.cos(a) * 0.6; this.vz = Math.sin(a) * 0.6; this.vy = 3.5;
    this.persistent = true; this.solidBody = false;
    game.audio.play('fuse', this);
  }
  update(dt) {
    const g = this.game;
    this.age += dt; this.fuse -= dt;
    this.physics(dt, 24, 0.98, 0.6);
    if (Math.random() < dt * 14) g.particles.add({ x: this.x + rnd(-0.1, 0.1), y: this.y + 1.05, z: this.z + rnd(-0.1, 0.1), vx: rnd(-0.2, 0.2), vy: 1 + Math.random(), vz: rnd(-0.2, 0.2), size: 0.12, size0: 0.12, grow: 2, r: 0.55, g: 0.55, b: 0.55, a: 0.5, a0: 0.5, fade: true, layer: -1, life: 1, drag: 1, light: 1 });
    if (Math.random() < dt * 25) g.particles.add({ x: this.x, y: this.y + 1.02, z: this.z, vx: rnd(-1, 1), vy: rnd(1, 2.5), vz: rnd(-1, 1), size: 0.04, r: 1, g: 0.75, b: 0.3, a: 1, a0: 1, fade: true, layer: -2, life: 0.35, emis: 5, add: true, grav: 9 });
    if (this.fuse <= 0) { this.dead = true; g.explode(this.x, this.y + 0.5, this.z, 4, { source: this }); }
  }
  render(er, F, list) {
    const M = mat4.create();
    const swell = this.fuse < 0.6 ? 1 + (0.6 - this.fuse) * 0.18 : 1;
    mat4.translate(M, M, this.x - F.camPos[0], this.y + 0.49 - F.camPos[1], this.z - F.camPos[2]);
    mat4.scale(M, M, swell * 0.98, swell * 0.98, swell * 0.98);
    const [sky, blk] = this.lightAt();
    const rate = this.fuse < 1.2 ? 9 : 4;
    const flash = Math.floor(this.age * rate) % 2 ? 0.75 : 0;
    list.push([B.tnt, M, [sky, blk, flash, 0]]);
  }
  serialize() { return { t: 'tnt', x: this.x, y: this.y, z: this.z, fuse: this.fuse }; }
}

export class LaunchedTNT extends PrimedTNT {
  constructor(game, owner, x, y, z) {
    super(game, x, y, z, 3.2);
    this.owner = owner; this.hw = 0.3; this.h = 0.6; this.spin = 0; this.landed = false;
  }
  update(dt) {
    const g = this.game;
    this.age += dt;
    const wasGround = this.onGround;
    this.spin += dt * (this.onGround ? 2 : 9);
    const hit = this.physics(dt, 22, 0.995, 0.5);
    if ((hit.hitX || hit.hitZ) && !this.landed) { this.landed = true; this.fuse = Math.min(this.fuse, 0.15); g.audio.play('thud', this); }
    // smoke trail and fuse sparks
    if (Math.random() < dt * 30) g.particles.add({ x: this.x + rnd(-0.1, 0.1), y: this.y + 0.3, z: this.z + rnd(-0.1, 0.1), vx: rnd(-0.2, 0.2), vy: 0.5, vz: rnd(-0.2, 0.2), size: 0.1, size0: 0.1, grow: 2.4, r: 0.6, g: 0.58, b: 0.55, a: 0.45, a0: 0.45, fade: true, layer: -1, life: 0.8, drag: 1, light: 1 });
    if (Math.random() < dt * 25) g.particles.add({ x: this.x, y: this.y + 0.5, z: this.z, vx: rnd(-1, 1), vy: rnd(1, 2.5), vz: rnd(-1, 1), size: 0.035, r: 1, g: 0.75, b: 0.3, a: 1, a0: 1, fade: true, layer: -2, life: 0.3, emis: 5, add: true, grav: 9 });
    // a creature in the way sets it off at once
    if (this.age > 0.08) {
      for (const e of g.entities.list) {
        if (e === this || e === this.owner || e.dead || e.type !== 'mob' || e.tamed || (e.deathT >= 0)) continue;
        if (Math.abs(e.x - this.x) < (e.hw || 0.4) + 0.35 && Math.abs(e.z - this.z) < (e.hw || 0.4) + 0.35 && this.y + 0.5 > e.y && this.y < e.y + (e.h || 1)) { this.fuse = 0; break; }
      }
    }
    if (this.onGround && !wasGround && !this.landed) { this.landed = true; this.fuse = Math.min(this.fuse, 0.45); g.audio.play('thud', this); }
    if (this.inWater) this.fuse = Math.min(this.fuse, 0.6);
    this.fuse -= dt;
    if (this.fuse <= 0) { this.dead = true; g.explode(this.x, this.y + 0.3, this.z, 3.2, { source: this.owner || this }); }
  }
  render(er, F, list) {
    const M = mat4.create();
    mat4.translate(M, M, this.x - F.camPos[0], this.y + 0.3 - F.camPos[1], this.z - F.camPos[2]);
    mat4.rotateY(M, M, this.spin * 0.7);
    mat4.rotateX(M, M, this.spin);
    mat4.scale(M, M, 0.6, 0.6, 0.6);
    const [sky, blk] = this.lightAt();
    const flash = Math.floor(this.age * 10) % 2 ? 0.75 : 0;
    list.push([B.tnt, M, [sky, blk, flash, 0]]);
  }
  serialize() { return { t: 'tnt', x: this.x, y: this.y, z: this.z, fuse: Math.max(0.5, this.fuse) }; }
}

export function installCombat(game) {
  const C = game.combat = { loadT: 0, needRelease: false };

  // ------------------------------------------------------------ ammo
  function hasAmmo(kind, p) {
    if (p.creative) return true;
    if (kind === 'crossbow') return p.inventory.count(I.arrow) > 0;
    if (kind === 'launcher') return p.inventory.count(B.tnt) > 0;
    return p.inventory.count(I.iron_shot) > 0 && p.inventory.count(I.gunpowder) > 0;
  }
  function useAmmo(kind, p) {
    if (p.creative) return;
    if (kind === 'crossbow') p.inventory.remove(I.arrow, 1);
    else if (kind === 'launcher') p.inventory.remove(B.tnt, 1);
    else { p.inventory.remove(I.iron_shot, 1); p.inventory.remove(I.gunpowder, 1); }
  }

  // ------------------------------------------------------------ crossbow & guns: hold to load, click to fire
  game.weaponHold = (dt, held, it, pressed) => {
    const p = game.player, tool = it.tool;
    const kind = tool.type === 'gun' ? tool.gun : 'crossbow';
    if (held.loaded) {
      if (pressed && !C.needRelease) { if (kind === 'crossbow') fireCrossbow(held); else if (kind === 'launcher') fireLauncher(held); else fireGun(held, it, kind); C.needRelease = true; }
      game.interaction.loadT = 0;
      return;
    }
    if (C.needRelease) return;
    if (!hasAmmo(kind, p)) {
      if (pressed) { game.ui.actionText(kind === 'crossbow' ? 'Needs arrows to load' : kind === 'launcher' ? 'Needs TNT to load' : 'Needs Iron Shot and Gunpowder to load'); game.audio.play('click'); }
      return;
    }
    const time = LOAD_TIME[kind] / (1 + 0.3 * enchLevel(held, 'quickload'));
    if (C.loadT === 0) game.audio.play(kind === 'crossbow' ? 'crank' : 'powder_pour');
    const before = C.loadT;
    C.loadT = Math.min(1, C.loadT + dt / time);
    if (kind === 'crossbow' && Math.floor(before * 4) !== Math.floor(C.loadT * 4) && C.loadT < 1) game.audio.play('crank');
    if (kind !== 'crossbow' && kind !== 'launcher' && before < 0.55 && C.loadT >= 0.55) game.audio.play('ramrod');
    if (kind === 'launcher' && before < 0.6 && C.loadT >= 0.6) game.audio.play('click');
    if (C.loadT >= 1) {
      C.loadT = 0; C.needRelease = true;
      useAmmo(kind, p);
      held.loaded = kind === 'crossbow' ? 'bolt' : kind === 'launcher' ? 'tnt' : 'shot';
      p.inventory.changed();
      game.audio.play(kind === 'crossbow' ? 'crossbow_loaded' : 'gun_cock');
    }
    game.interaction.loadT = C.loadT;
  };
  game.weaponRelease = () => { C.loadT = 0; C.needRelease = false; game.interaction.loadT = 0; };

  function fireCrossbow(held) {
    const p = game.player, d = p.lookDir();
    const sp = 62;
    const pr = new Projectile(game, p, p.x + d[0] * 0.5, p.eyeY - 0.1, p.z + d[2] * 0.5, d[0] * sp, d[1] * sp, d[2] * sp, 'bolt', 9 + 1.5 * enchLevel(held, 'power'));
    pr.pierce = 1 + enchLevel(held, 'piercing');
    if (ITEMS[held.id].tool.infernal) { pr.infernal = true; pr.burning = true; pr.pierce = 0; }
    game.entities.add(pr);
    delete held.loaded;
    game.audio.play('crossbow_fire');
    if (game.hands) game.hands.kick = 0.7;
    game.interaction.damageHeld(1);
    p.inventory.changed();
  }

  // a lit charge lobbed in an arc: it bursts when it strikes a creature, or a moment after it lands
  function fireLauncher(held) {
    const p = game.player, d = p.lookDir(), g = game;
    const sp = 21 + 3 * enchLevel(held, 'power');
    const right = [Math.cos(p.yaw), 0, -Math.sin(p.yaw)];
    const t = new LaunchedTNT(g, p, p.x + d[0] * 0.9 + right[0] * 0.15, p.eyeY - 0.55 + d[1] * 0.9, p.z + d[2] * 0.9 + right[2] * 0.15);
    t.vx = d[0] * sp + (p.vx || 0); t.vy = d[1] * sp + 2.5; t.vz = d[2] * sp + (p.vz || 0);
    g.entities.add(t);
    const mx = p.x + d[0] * 1.1, my = p.eyeY - 0.2 + d[1] * 1.1, mz = p.z + d[2] * 1.1;
    for (let k = 0; k < 12; k++) g.particles.add({ x: mx, y: my, z: mz, vx: d[0] * rnd(1, 4) + rnd(-0.6, 0.6), vy: d[1] * rnd(1, 4) + rnd(0, 0.8), vz: d[2] * rnd(1, 4) + rnd(-0.6, 0.6), size: 0.2, size0: 0.2, grow: 3, r: 0.72, g: 0.7, b: 0.66, a: 0.5, a0: 0.5, fade: true, layer: -1, life: rnd(0.8, 1.6), drag: 2, grav: -0.3, light: g.particles.lightAt(mx, my, mz) });
    for (let k = 0; k < 5; k++) g.particles.add({ x: mx, y: my, z: mz, vx: d[0] * 5 + rnd(-1.5, 1.5), vy: d[1] * 5 + rnd(-1, 1.5), vz: d[2] * 5 + rnd(-1.5, 1.5), size: 0.04, r: 1, g: 0.7, b: 0.25, a: 1, a0: 1, fade: true, layer: -2, life: 0.3, emis: 6, add: true, grav: 10 });
    g.audio.play('launcher_fire');
    g.camShake = Math.max(g.camShake || 0, 0.16);
    if (g.hands) g.hands.kick = 1;
    p.pitch = Math.min(1.5, p.pitch + 0.07);
    delete held.loaded;
    g.interaction.damageHeld(1);
    p.inventory.changed();
  }

  function traceShot(ox, oy, oz, dir, range) {
    const p = game.player;
    const eh = game.entities.raycast(ox, oy, oz, dir[0], dir[1], dir[2], range, (e) => e !== p && e !== p.riding && e.type === 'mob' && !(e.deathT >= 0));
    const bh = game.world.raycast(ox, oy, oz, dir[0], dir[1], dir[2], range, game.interaction.selectFn(false));
    if (eh && (!bh || eh.t < bh.dist)) return { entity: eh.e, t: eh.t };
    if (bh) return { block: bh, t: bh.dist };
    return { t: range };
  }

  function fireGun(held, it, kind) {
    const p = game.player, d = p.lookDir(), g = game;
    const ox = p.x, oy = p.eyeY, oz = p.z;
    const right = [Math.cos(p.yaw), 0, -Math.sin(p.yaw)];
    const mx = ox + d[0] * 0.75 + right[0] * 0.2, my = oy + d[1] * 0.75 - 0.1, mz = oz + d[2] * 0.75 + right[2] * 0.2;
    const blunder = kind === 'blunderbuss';
    const pellets = blunder ? 9 : 1;
    const spread = blunder ? 0.09 : 0.004;
    const range = blunder ? 26 : 70;
    const base = it.tool.dmg * (1 + 0.2 * enchLevel(held, 'power'));
    const hits = new Map();
    for (let i = 0; i < pellets; i++) {
      const dir = jitter(d, spread);
      const res = traceShot(ox, oy, oz, dir, range);
      const hx = ox + dir[0] * res.t, hy = oy + dir[1] * res.t, hz = oz + dir[2] * res.t;
      if (res.entity) {
        const fall = blunder ? Math.max(0.3, 1 - res.t / range) : (res.t > 36 ? Math.max(0.45, 1 - (res.t - 36) / 50) : 1);
        hits.set(res.entity, (hits.get(res.entity) || 0) + base * fall);
        g.particles.crit(hx, hy, hz);
      } else if (res.block) {
        const b = res.block;
        g.particles.blockHit(b.x, b.y, b.z, b.id, b.face);
        g.particles.blockHit(b.x, b.y, b.z, b.id, b.face);
        for (let k = 0; k < 3; k++) g.particles.add({ x: hx, y: hy, z: hz, vx: rnd(-3, 3), vy: rnd(0, 3), vz: rnd(-3, 3), size: 0.03, r: 1, g: 0.8, b: 0.4, a: 1, a0: 1, fade: true, layer: -2, life: 0.25, emis: 6, add: true, grav: 12 });
        if (i === 0) g.audio.play('ricochet', { x: hx, y: hy, z: hz });
        // brittle blocks shatter
        const bd = BLOCKS[b.id];
        if ((bd.sound === 'glass' && bd.hardness <= 0.5) || bd.shape === 2 && bd.hardness === 0) { g.particles.blockBreak(b.x, b.y, b.z, b.id); g.audio.blockSound(b.id, 'break', b.x, b.y, b.z); g.world.breakBlock(b.x, b.y, b.z, false); }
      }
      // tracer streak
      const steps = Math.min(14, Math.floor(res.t / 1.2));
      for (let k = 1; k < steps; k++) {
        const t = k / steps * res.t;
        g.particles.add({ x: ox + dir[0] * t, y: oy - 0.08 + dir[1] * t, z: oz + dir[2] * t, vx: 0, vy: 0, vz: 0, size: 0.025, r: 1, g: 0.85, b: 0.55, a: 0.8, a0: 0.8, fade: true, layer: -2, life: 0.06 + k * 0.004, emis: 4, add: true });
      }
    }
    for (const [e, dmg] of hits) {
      if (e.hurt) { e.hurtT = 0; e.hurt(dmg, { type: 'proj', entity: p, dir: d, knock: blunder ? 1.6 : 1.0, weapon: 'gun' }); }
    }
    // muzzle flash, smoke, sparks
    for (let k = 0; k < 6; k++) g.particles.add({ x: mx + d[0] * k * 0.08, y: my + d[1] * k * 0.08, z: mz + d[2] * k * 0.08, vx: d[0] * rnd(2, 6), vy: d[1] * rnd(2, 6), vz: d[2] * rnd(2, 6), size: 0.22 - k * 0.025, size0: 0.22 - k * 0.025, grow: -0.6, r: 1, g: 0.75, b: 0.35, a: 1, a0: 1, fade: true, layer: -1, life: 0.07, emis: 8, add: true });
    for (let k = 0; k < (blunder ? 16 : 9); k++) g.particles.add({ x: mx + d[0] * rnd(0, 0.6), y: my + d[1] * rnd(0, 0.6), z: mz + d[2] * rnd(0, 0.6), vx: d[0] * rnd(0.5, 3) + rnd(-0.4, 0.4), vy: d[1] * rnd(0.5, 3) + rnd(0.1, 0.6), vz: d[2] * rnd(0.5, 3) + rnd(-0.4, 0.4), size: 0.18, size0: 0.18, grow: 3.5, r: 0.78, g: 0.76, b: 0.72, a: 0.55, a0: 0.55, fade: true, layer: -1, life: rnd(1.4, 2.6), drag: 1.8, grav: -0.25, light: g.particles.lightAt(mx, my, mz) });
    for (let k = 0; k < 8; k++) g.particles.add({ x: mx, y: my, z: mz, vx: d[0] * 6 + rnd(-2, 2), vy: d[1] * 6 + rnd(-1, 2), vz: d[2] * 6 + rnd(-2, 2), size: 0.035, r: 1, g: 0.7, b: 0.25, a: 1, a0: 1, fade: true, layer: -2, life: 0.4, emis: 6, add: true, grav: 10 });
    g.audio.play(blunder ? 'blunderbuss' : 'gunshot');
    g.camShake = Math.max(g.camShake || 0, blunder ? 0.22 : 0.12);
    if (g.hands) g.hands.kick = 1;
    p.pitch = Math.min(1.5, p.pitch + (blunder ? 0.09 : 0.05));
    p.yaw += rnd(-0.015, 0.015);
    if (blunder) { p.knockX = -d[0] * 4; p.knockZ = -d[2] * 4; }
    g.flashT = 0.06;
    delete held.loaded;
    g.interaction.damageHeld(1);
    p.inventory.changed();
  }

  // ------------------------------------------------------------ spear throw (hold use, release)
  game.throwSpear = (draw) => {
    const p = game.player, held = p.held();
    if (!held) return;
    const it = ITEMS[held.id];
    if (!it.tool || it.tool.type !== 'spear') return;
    const power = Math.min(1, draw / 0.9);
    if (power < 0.25) return;
    const d = p.lookDir();
    const sp = 14 + power * 22;
    const st = cloneStack(held); st.count = 1; st.dmg = (st.dmg || 0) + 1;
    const e = new ThrownSpear(game, p, p.x + d[0] * 0.6, p.eyeY - 0.1, p.z + d[2] * 0.6, d[0] * sp, d[1] * sp + 1, d[2] * sp, st, it.tool.dmg * (0.7 + power * 0.9));
    game.entities.add(e);
    if (!p.creative) p.inventory.set(p.selected, null);
    game.audio.play('spear_throw');
    p.swing = 1;
  };

  // ------------------------------------------------------------ melee specials
  game.onMeleeHit = (e, info) => {
    const g = game, p = g.player;
    const { type, dmg, charge, stack } = info;
    // sword sweep: a full-strength grounded swing clips nearby enemies too
    if (type === 'sword' && charge > 0.9 && p.onGround && !p.sprinting) {
      const d = p.lookDir();
      for (const o of g.entities.list) {
        if (o === e || o.dead || o.type !== 'mob' || !o.hurt || o.tamed || o.kind === 'villager' || o.kind === 'wizard') continue;
        if (o.distTo(e.x, e.y, e.z) > 2.6 || o.distTo(p.x, p.y, p.z) > 4) continue;
        o.hurt(1 + dmg * 0.4, { type: 'player', entity: p, knock: 0.45, dir: d, weapon: 'sweep' });
      }
      const fx = p.x + d[0] * 1.6, fz = p.z + d[2] * 1.6;
      // crescent slash streak sweeping across in front of the player
      for (let k = 0; k < 48; k++) {
        const u = k / 47, a = p.yaw + 0.85 - u * 1.7;
        const rr = 1.9 + Math.sin(u * Math.PI) * 0.22;
        const sz = 0.05 + Math.sin(u * Math.PI) * 0.07;
        g.particles.add({ x: p.x - Math.sin(a) * rr, y: p.eyeY - 0.22 - u * 0.32, z: p.z - Math.cos(a) * rr, vx: -Math.cos(a) * 1.5, vy: -0.3, vz: Math.sin(a) * 1.5, size: sz, size0: sz, grow: 0.6, r: 0.6, g: 0.66, b: 0.75, a: 0.5, a0: 0.5, fade: true, layer: -1, life: 0.06 + u * 0.14, emis: 1.2, add: true });
      }
      g.audio.play('sweep', { x: fx, y: p.y + 1, z: fz });
    }
    // mace: stagger, and a falling smash hits everything around
    if (type === 'mace') {
      if (charge > 0.85 && !e.isBoss) e.staggerT = 0.9;
      if (p.fallDist > 1.5) {
        const r = Math.min(4.5, 2 + p.fallDist * 0.35);
        for (const o of g.entities.list) {
          if (o === e || o.dead || o.type !== 'mob' || !o.hurt || o.tamed) continue;
          const dd = o.distTo(e.x, e.y, e.z);
          if (dd > r) continue;
          o.hurtT = 0;
          o.hurt(p.fallDist * 1.6 * (1 - dd / r * 0.5), { type: 'player', entity: p, knock: 1.4, dir: [(o.x - e.x) / (dd || 1), 0, (o.z - e.z) / (dd || 1)], weapon: 'mace' });
        }
        e.hurtT = 0; e.hurt(p.fallDist * 2, { type: 'player', entity: p, knock: 0.5, weapon: 'mace' });
        for (let k = 0; k < 28; k++) {
          const a = k / 28 * Math.PI * 2;
          g.particles.add({ x: e.x + Math.cos(a) * 0.6, y: e.y + 0.1, z: e.z + Math.sin(a) * 0.6, vx: Math.cos(a) * 6, vy: rnd(0.5, 2), vz: Math.sin(a) * 6, size: 0.25, size0: 0.25, grow: 1.5, r: 0.62, g: 0.56, b: 0.48, a: 0.6, a0: 0.6, fade: true, layer: -1, life: 0.7, drag: 3, light: g.particles.lightAt(e.x, e.y + 1, e.z) });
        }
        g.camShake = Math.max(g.camShake || 0, 0.3);
        g.audio.play('mace_smash', e);
        p.fallDist = 0; p.vy = Math.max(p.vy, 6);
      } else g.audio.play('hit_blunt', e);
    }
    if (info.backstab) { g.particles.crit(e.x, e.y + e.h * 0.8, e.z); g.audio.play('backstab', e); }
    const tl = stack ? ITEMS[stack.id].tool : null;
    if (tl && tl.frost && !e.isBoss) { e.staggerT = Math.max(e.staggerT || 0, 1.1); e.vx *= 0.2; e.vz *= 0.2; g.particles.sparkle(e.x, e.y + e.h * 0.5, e.z, [0.7, 0.9, 1], 10); }
    if (tl && tl.ignite && e.def && !e.def.fireImmune) e.fireT = Math.max(e.fireT || 0, 5);
    const fire = enchLevel(stack, 'fire');
    if (fire && e.def && !e.def.fireImmune) e.fireT = Math.max(e.fireT || 0, 3 * fire);
    if (type === 'sword' || type === 'dagger' || type === 'axe') g.audio.play('hit_blade', e);
    else if (type === 'spear') g.audio.play('hit_pierce', e);
  };

  // ------------------------------------------------------------ TNT
  game.primeTNT = (x, y, z, fuse = 4) => {
    if (game.world.getBlock(x, y, z) !== B.tnt) return null;
    game.world.setBlock(x, y, z, 0, 0);
    const t = new PrimedTNT(game, x + 0.5, y, z + 0.5, fuse);
    game.entities.add(t);
    return t;
  };

  game.restoreSpecial = ((orig) => (d) => {
    if (d.t === 'tnt') { const t = new PrimedTNT(game, d.x, d.y, d.z, Math.max(0.5, d.fuse || 2)); t.vx = t.vz = t.vy = 0; game.entities.add(t); return; }
    if (orig) orig(d);
  })(game.restoreSpecial);

  // ------------------------------------------------------------ explosions
  game.explode = (x, y, z, power = 4, opts = {}) => {
    const g = game, w = g.world, p = g.player;
    const inWater = IS_LIQUID[w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))] === 1;
    // ---- blocks
    const destroyed = [];
    const chain = [];
    if (!inWater && opts.breakBlocks !== false) {
      const R = Math.ceil(power);
      for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) {
        const d = Math.hypot(dx, dy * 1.1, dz);
        if (d > power + 0.3) continue;
        const bx = Math.floor(x + dx), by = Math.floor(y + dy), bz = Math.floor(z + dz);
        const id = w.getBlock(bx, by, bz);
        if (!id || IS_LIQUID[id]) continue;
        const bd = BLOCKS[id];
        if (bd.hardness < 0 || bd.hardness >= 40) continue;
        const resist = Math.min(power * 0.9, bd.hardness * 0.55);
        const strength = power * (0.75 + Math.random() * 0.5) - d * 0.85;
        if (strength <= resist) continue;
        if (id === B.tnt) { chain.push([bx, by, bz]); continue; }
        destroyed.push([bx, by, bz, id, w.getMeta(bx, by, bz)]);
      }
      // break outer shell first so falling sand/gravel next to the crater can react
      let drops = 0;
      for (const [bx, by, bz, id, meta] of destroyed) {
        g.dropTileContents && g.dropTileContents(bx, by, bz);
        w.setBlock(bx, by, bz, 0, 0, { noUpdate: true });
        if (drops < 40 && Math.random() < 1 / power) {
          const ds = blockDrops(id, meta, null);
          for (const [did, n] of ds) { g.entities.dropItem(bx + 0.5, by + 0.5, bz + 0.5, did, n); drops++; }
        }
      }
      // neighbour updates around the crater (plants pop off, sand falls, liquids flow)
      const seen = new Set();
      for (const [bx, by, bz] of destroyed) {
        for (const [ox, oy, oz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
          const k = (bx + ox) + ',' + (by + oy) + ',' + (bz + oz);
          if (seen.has(k)) continue;
          seen.add(k);
          if (w.getBlock(bx + ox, by + oy, bz + oz)) w._updateBlock(bx + ox, by + oy, bz + oz);
        }
      }
      for (const [bx, by, bz] of chain) { const t = g.primeTNT(bx, by, bz, rnd(0.4, 1.4)); if (t) { const dd = Math.hypot(bx + 0.5 - x, bz + 0.5 - z) || 1; t.vx = (bx + 0.5 - x) / dd * 4; t.vz = (bz + 0.5 - z) / dd * 4; t.vy = 6; } }
      // scorched ground and the odd flame for big blasts
      if (opts.fire) for (const [bx, by, bz] of destroyed) if (Math.random() < 0.1 && !w.getBlock(bx, by, bz) && BLOCKS[w.getBlock(bx, by - 1, bz)].solid) w.setBlock(bx, by, bz, B.fire, 0);
    }
    // ---- entities
    const reach = power * 2;
    const targets = [p, ...g.entities.list];
    for (const e of targets) {
      if (!e || e.dead || e === opts.source) continue;
      const ex = e.x, ey = e.y + (e.h || 1.8) * 0.5, ez = e.z;
      const d = Math.hypot(ex - x, ey - y, ez - z);
      if (d > reach) continue;
      const impact = (1 - d / reach);
      const dir = norm([ex - x, ey - y + 0.4, ez - z]);
      if (e === p) {
        if (p.creative) continue;
        const dmg = Math.round((impact * impact + impact) / 2 * 7 * power + 1);
        if (p.damage(dmg * (p.effects.resist ? 0.6 : 1), 'explosion', false, opts.source || null)) { /* hurt feedback handled by player */ }
        p.knockX += dir[0] * impact * 18; p.knockZ += dir[2] * impact * 18; p.vy = Math.max(p.vy, dir[1] * impact * 14 + 3 * impact);
      } else if (e.type === 'mob' && e.hurt) {
        const dmg = (impact * impact + impact) / 2 * 7 * power + 1;
        e.hurtT = 0;
        e.hurt(dmg, { type: 'explosion', dir, knock: impact * 2.4 });
        e.vy = Math.max(e.vy, impact * 10);
      } else if (e.type === 'item' || e.type === 'spear') {
        e.vx += dir[0] * impact * 12; e.vy += dir[1] * impact * 10 + 3; e.vz += dir[2] * impact * 12;
      } else if (e.type === 'tnt') {
        e.vx += dir[0] * impact * 10; e.vy += impact * 8; e.vz += dir[2] * impact * 10;
      }
    }
    // ---- effects
    const L = g.particles.lightAt(x, y + 1, z);
    for (let k = 0; k < 14; k++) g.particles.add({ x: x + rnd(-0.6, 0.6), y: y + rnd(-0.4, 0.6), z: z + rnd(-0.6, 0.6), vx: rnd(-3, 3), vy: rnd(-1, 4), vz: rnd(-3, 3), size: rnd(0.8, 1.5), size0: rnd(0.8, 1.5), grow: 1.5, r: 1, g: rnd(0.55, 0.8), b: 0.25, a: 1, a0: 1, fade: true, layer: -1, life: rnd(0.2, 0.4), emis: 7, add: true, drag: 4 });
    for (let k = 0; k < 44; k++) {
      const v = norm([rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)]); const sp = rnd(2, 7) * power / 4;
      const dark = rnd(0.12, 0.4);
      const sz = rnd(0.5, 1.0);
      g.particles.add({ x: x + v[0] * 0.8, y: y + v[1] * 0.8, z: z + v[2] * 0.8, vx: v[0] * sp, vy: v[1] * sp + 1, vz: v[2] * sp, size: sz, size0: sz, grow: 3.2, r: dark, g: dark * 0.95, b: dark * 0.9, a: 0.75, a0: 0.75, fade: true, layer: -1, life: rnd(3.5, 6.5), drag: 2.2, grav: -0.3, light: L, lightUpd: false });
    }
    for (let k = 0; k < 30; k++) g.particles.add({ x, y, z, vx: rnd(-9, 9), vy: rnd(2, 11), vz: rnd(-9, 9), size: 0.05, r: 1, g: 0.65, b: 0.2, a: 1, a0: 1, fade: true, layer: -2, life: rnd(0.6, 1.4), emis: 6, add: true, grav: 16, drag: 0.6 });
    // block debris using the destroyed blocks' textures
    for (let k = 0; k < Math.min(40, destroyed.length * 2); k++) {
      const b = destroyed[(Math.random() * destroyed.length) | 0];
      const layer = BLOCK_FACE_TEX[b[3] * 6];
      g.particles.add({ x: b[0] + 0.5, y: b[1] + 0.5, z: b[2] + 0.5, vx: rnd(-8, 8), vy: rnd(4, 12), vz: rnd(-8, 8), size: rnd(0.1, 0.22), r: 1, g: 1, b: 1, a: 1, layer, u0: Math.random() * 0.8, v0: Math.random() * 0.8, uvs: 0.2, life: rnd(1, 2), grav: 24, drag: 0.3, collide: true, light: L });
    }
    g.audio.play('explode', { x, y, z });
    const pd = Math.hypot(p.x - x, p.y - y, p.z - z);
    g.camShake = Math.max(g.camShake || 0, Math.max(0, 0.7 * (1 - pd / (power * 8))));
    g.flashT = Math.max(g.flashT || 0, 0.1 * Math.max(0, 1 - pd / (power * 6)));
  };
}
