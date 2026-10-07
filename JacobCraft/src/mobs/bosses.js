// Boss framework and the five major bosses. Each attack has a telegraphed wind-up, an active phase and recovery.
import { Mob, MOB_CLASSES, createMob } from './mobs.js';
import { MOBS } from './defs.js';
import { MAMMOTH, WARDEN, TITAN, WYRM_HEAD, wyrmSegment, BEHEMOTH } from './bossModels.js';
import { PAT } from './models.js';
import { Entity } from '../game/entities.js';
import { mat4 } from '../core/math.js';
import { I } from '../game/items.js';
import { B, BLOCKS, IS_LIQUID } from '../world/blocks.js';

const BOSS_BASE = { type: 'boss', drops: [], sounds: { hurt: 'growl', death: 'roar' }, food: [], idleSound: 0, xp: 100, knockRes: 1, follow: 48, attack: null, tame: null };
MOBS.woolly_mammoth = Object.assign({}, MOBS.cow, BOSS_BASE, { id: 'woolly_mammoth', name: 'Woolly Mammoth', hp: 300, speed: 2.4, runSpeed: 4.5, size: [5.2, 7.4], model: MAMMOTH, scale: 1.6, drops: [['mammoth_tusk', 2, 2], ['raw_beef', 8, 12], ['leather', 6, 9], ['wool_white', 8, 12], ['emerald', 4, 8]], sounds: { hurt: 'trumpet', death: 'trumpet' }, wake: 22, title: 'The Woolly Mammoth', subtitle: 'Giant of the frozen valley' });
MOBS.forest_warden = Object.assign({}, MOBS.cow, BOSS_BASE, { id: 'forest_warden', name: 'Ancient Forest Warden', hp: 360, speed: 2.0, size: [3.0, 6.8], model: WARDEN, drops: [['warden_heart', 2, 2], ['elder_log', 12, 20], ['emerald', 6, 10], ['glowcap', 4, 8], ['moss_block', 8, 16]], sounds: { hurt: 'creak', death: 'creak' }, wake: 16, title: 'The Ancient Forest Warden', subtitle: 'Guardian of the elder grove' });
MOBS.desert_titan = Object.assign({}, MOBS.cow, BOSS_BASE, { id: 'desert_titan', name: 'Desert Titan', hp: 420, speed: 1.6, size: [3.6, 8.4], model: TITAN, drops: [['titan_shard', 4, 4], ['gold_ingot', 10, 16], ['sunstone_shard', 8, 12], ['diamond', 2, 4], ['emerald', 8, 12]], sounds: { hurt: 'growl', death: 'roar' }, wake: 14, title: 'The Desert Titan', subtitle: 'It has slept beneath the sands for an age' });
MOBS.frost_wyrm = Object.assign({}, MOBS.cow, BOSS_BASE, { id: 'frost_wyrm', name: 'Frost Wyrm', hp: 380, speed: 7, size: [2.2, 1.8], model: WYRM_HEAD, fly: true, drops: [['wyrm_scale', 4, 4], ['frostite_shard', 12, 20], ['diamond', 2, 4], ['emerald', 6, 10]], sounds: { hurt: 'shriek', death: 'shriek' }, wake: 26, title: 'The Frost Wyrm', subtitle: 'Serpent of the singing peaks' });
MOBS.volcanic_behemoth = Object.assign({}, MOBS.cow, BOSS_BASE, { id: 'volcanic_behemoth', name: 'Volcanic Behemoth', hp: 500, speed: 1.8, size: [4.6, 9.0], model: BEHEMOTH, fireImmune: true, glow: 0.25, drops: [['behemoth_horn', 3, 3], ['emberite_ingot', 5, 8], ['raw_emberite', 4, 8], ['obsidian', 6, 10], ['diamond', 3, 5]], sounds: { hurt: 'growl', death: 'roar' }, wake: 20, title: 'The Volcanic Behemoth', subtitle: 'The mountain itself awakens' });

const TMP = mat4.create();

// ---------------------------------------------------------------- visual helper entities
export class RootSpike extends Entity {
  constructor(game, x, y, z, color = [0.33, 0.24, 0.14], color2 = [0.24, 0.42, 0.13]) {
    super(game, x, y, z);
    this.type = 'fx'; this.life = 1.6; this.c = color; this.c2 = color2; this.seed = Math.random() * 100;
  }
  update(dt) { this.age += dt; if (this.age > this.life) this.dead = true; }
  render(er, F) {
    const t = this.age / this.life;
    const h = (t < 0.15 ? t / 0.15 : t > 0.8 ? (1 - t) / 0.2 : 1) * 2.4;
    const cam = F.camPos;
    for (let k = 0; k < 4; k++) {
      const a = this.seed + k * 1.7;
      const ox = Math.cos(a) * 0.5, oz = Math.sin(a) * 0.5;
      const M = mat4.create();
      mat4.translate(M, M, this.x + ox - cam[0], this.y - cam[1], this.z + oz - cam[2]);
      mat4.rotateZ(M, M, Math.sin(a) * 0.3); mat4.rotateX(M, M, Math.cos(a) * 0.3);
      mat4.translate(M, M, -0.15, 0, -0.15);
      mat4.scale(M, M, 0.3, h * (0.7 + 0.3 * Math.sin(a * 3)), 0.3);
      er.pushBox(M, this.c, PAT.bark, this.c2, 0, 5, 30, 5, k, [1, 0, 0, 0]);
    }
  }
}

export class Boulder extends Entity {
  constructor(game, owner, x, y, z, vx, vy, vz, opts = {}) {
    super(game, x, y, z);
    this.type = 'fx'; this.owner = owner; this.vx = vx; this.vy = vy; this.vz = vz;
    this.size = opts.size || 1.2; this.dmg = opts.dmg || 8; this.radius = opts.radius || 3; this.fire = !!opts.fire;
    this.color = opts.color || [0.75, 0.62, 0.42]; this.color2 = opts.color2 || [0.55, 0.45, 0.3];
    this.spin = 0;
  }
  update(dt) {
    const g = this.game;
    this.age += dt; this.spin += dt * 4;
    this.vy -= 22 * dt;
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt, nz = this.z + this.vz * dt;
    const id = g.world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
    const p = g.player;
    const hitP = Math.hypot(p.x - nx, p.y + 0.9 - ny, p.z - nz) < this.size;
    if ((id && BLOCKS[id].solid) || hitP || this.age > 6) { this.explode(nx, ny, nz); return; }
    this.x = nx; this.y = ny; this.z = nz;
    if (this.fire) { g.particles.flame(this.x, this.y, this.z); if (Math.random() < 0.3) g.particles.smoke(this.x, this.y, this.z, 1, 0.2); }
  }
  explode(x, y, z) {
    const g = this.game;
    this.dead = true;
    aoe(g, x, y, z, this.radius, this.dmg, this.owner, { fire: this.fire, knock: 7 });
    g.audio.play('explode', { x, y, z });
    g.particles.poof(x, y, z, 16);
    if (this.fire) { for (let i = 0; i < 16; i++) g.particles.ember(x, y, z, 2); if (Math.random() < 0.6 && !g.world.getBlock(Math.floor(x), Math.floor(y + 0.5), Math.floor(z))) g.world.setBlock(Math.floor(x), Math.floor(y + 0.5), Math.floor(z), B.fire); }
    g.camShake = Math.max(g.camShake || 0, 0.3 * Math.max(0, 1 - Math.hypot(g.player.x - x, g.player.z - z) / 20));
  }
  render(er, F) {
    const cam = F.camPos;
    const M = mat4.create();
    mat4.translate(M, M, this.x - cam[0], this.y - cam[1], this.z - cam[2]);
    mat4.rotateX(M, M, this.spin); mat4.rotateZ(M, M, this.spin * 0.7);
    mat4.translate(M, M, -this.size / 2, -this.size / 2, -this.size / 2);
    mat4.scale(M, M, this.size, this.size, this.size);
    er.pushBox(M, this.color, this.fire ? PAT.lava : PAT.rock, this.fire ? [1, 0.45, 0.1] : this.color2, 0, this.size * 16, this.size * 16, this.size * 16, 5, [1, 0.3, 0, this.fire ? 0.5 : 0]);
  }
}

// damage everything (player + non-boss mobs) in radius
function aoe(g, x, y, z, r, dmg, owner, opts = {}) {
  const p = g.player;
  const d = Math.hypot(p.x - x, (p.y + 0.9) - y, p.z - z);
  if (d < r + 0.5 && !(opts.groundOnly && !p.onGround)) {
    const f = 1 - Math.min(1, d / (r + 0.5)) * 0.5;
    if (p.damage(dmg * f, 'mob', false, owner)) {
      const l = Math.hypot(p.x - x, p.z - z) || 1;
      p.knockX = (p.x - x) / l * (opts.knock || 6); p.knockZ = (p.z - z) / l * (opts.knock || 6);
      p.vy = Math.max(p.vy, opts.up || 6);
      if (opts.fire) p.fireTime = Math.max(p.fireTime, 4);
      if (opts.slow) p.effects.slow = opts.slow;
    }
  }
  for (const e of g.entities.list) {
    if (e === owner || e.dead || e.type !== 'mob' || e.isBoss || !e.hurt) continue;
    if (Math.hypot(e.x - x, e.y - y, e.z - z) < r) e.hurt(dmg * 0.5, { entity: owner, dir: [e.x - x, 0, e.z - z] });
  }
}

// ---------------------------------------------------------------- telegraphs (ground warnings + expanding rings)
export function updateTelegraphs(g, dt) {
  const list = g.telegraphs || (g.telegraphs = []);
  for (const t of list) {
    t.t += dt;
    if (t.kind === 'ring') {
      const k = Math.min(1, t.t / t.dur);
      const r = t.r0 + (t.r1 - t.r0) * k;
      const n = Math.floor(r * 3);
      for (let i = 0; i < n; i++) {
        if (Math.random() > 0.5) continue;
        const a = Math.random() * Math.PI * 2;
        g.particles.add({ x: t.x + Math.cos(a) * r, y: t.y + 0.2, z: t.z + Math.sin(a) * r, vx: Math.cos(a) * 2, vy: 1.5 + Math.random(), vz: Math.sin(a) * 2, size: 0.35, size0: 0.35, grow: 1, r: t.color[0], g: t.color[1], b: t.color[2], a: 0.7, a0: 0.7, fade: true, layer: -1, life: 0.6, drag: 2, light: 1, emis: t.emis || 0, add: !!t.emis });
      }
      const p = g.player;
      const d = Math.hypot(p.x - t.x, p.z - t.z);
      if (!t.hit && t.dmg > 0 && Math.abs(d - r) < 1.1 && Math.abs(p.y - t.y) < 2.5 && p.onGround) {
        t.hit = true;
        if (p.damage(t.dmg, 'mob', false, t.owner)) { const l = d || 1; p.knockX = (p.x - t.x) / l * 8; p.knockZ = (p.z - t.z) / l * 8; p.vy = 7; if (t.fire) p.fireTime = 4; if (t.slow) p.effects.slow = t.slow; }
      }
    } else {
      // warning circle: particles on the perimeter, intensifying
      const k = t.t / t.dur;
      const n = Math.ceil(t.r * 4 * (0.4 + k));
      for (let i = 0; i < n; i++) {
        if (Math.random() > 0.35) continue;
        const a = Math.random() * Math.PI * 2;
        const rr = t.r * (0.85 + Math.random() * 0.15);
        g.particles.add({ x: t.x + Math.cos(a) * rr, y: t.y + 0.15, z: t.z + Math.sin(a) * rr, vx: 0, vy: 0.4 + k * 2, vz: 0, size: 0.12 + k * 0.1, r: t.color[0], g: t.color[1], b: t.color[2], a: 1, a0: 1, fade: true, layer: -2, life: 0.4, emis: 2.5, add: true });
      }
      if (t.t >= t.dur && !t.fired) { t.fired = true; t.onDone && t.onDone(); }
    }
  }
  g.telegraphs = list.filter(t => t.kind === 'ring' ? t.t < t.dur : !t.fired);
}
export function warn(g, x, y, z, r, dur, color, onDone) { (g.telegraphs || (g.telegraphs = [])).push({ kind: 'warn', x, y, z, r, dur, t: 0, color, onDone }); }
export function ring(g, owner, x, y, z, r0, r1, dur, dmg, color, extra = {}) { (g.telegraphs || (g.telegraphs = [])).push(Object.assign({ kind: 'ring', owner, x, y, z, r0, r1, dur, t: 0, dmg, color }, extra)); }

// ---------------------------------------------------------------- Boss base
export class Boss extends Mob {
  constructor(game, kind, x, y, z, opts = {}) {
    super(game, kind, x, y, z, Object.assign({}, opts, { persistent: false }));
    this.isBoss = true;
    this.markerId = opts.markerId || null;
    this.homePos = [x, y, z];
    this.awake = false;
    this.act = null; this.actT = 0; this.cd = 2.5;
    this.stunT = 0;
    this.maxHp = this.def.hp;
    this.enraged = false;
    this.regenT = 0;
    this.lastDmgT = 0;
  }
  get bossFrac() { return Math.max(0, this.hp / this.maxHp); }

  hurt(amount, src = {}) {
    if (this.invulnerable) return false;
    if (!this.awake) this.wake();
    if (this.stunT > 0) amount *= 1.5;
    this.lastDmgT = 0;
    // bosses shrug off knockback
    const r = super.hurt(amount, Object.assign({}, src, { knock: 0, dir: null, entity: src.entity }));
    this.vx *= 0.2; this.vz *= 0.2;
    this.fleeT = 0;
    if (src.entity) this.target = src.entity;
    return r;
  }

  wake() {
    if (this.awake) return;
    this.awake = true;
    const g = this.game;
    g.audio.play('roar', this);
    if (g.bossIntro) g.bossIntro(this); else g.ui.subtitle(this.def.title, this.def.subtitle, 4);
    g.camShake = 0.4;
    this.cd = 2.6;
  }

  die(src) {
    super.die(src);
    const g = this.game;
    if (this.markerId && g.bossMarkers.has(this.markerId)) g.bossMarkers.get(this.markerId).defeated = true;
    g.ui.toast('Boss defeated!', this.def.name + ' has fallen.');
    g.ui.subtitle('Victory!', this.def.name + ' defeated', 4);
    g.audio.play('victory');
    if (g.slowMo) g.slowMo(1.4);
    g.camShake = Math.max(g.camShake || 0, 0.5);
    if (g.hitStop) g.hitStop(0.25);
    for (let i = 0; i < 40; i++) g.particles.sparkle(this.x, this.y + this.h * Math.random(), this.z, [1, 0.85, 0.4], 2);
    if (g.grantBlessing) g.grantBlessing(this.kind);
    // the boss's summoned minions crumble with it
    for (const e of g.entities.list) if (e.summoner === this && !e.dead) { g.particles.poof(e.x, e.y + 0.5, e.z, 10); e.dead = true; }
    if (g.dropXP) g.dropXP(this.x, this.y + 1, this.z, this.def.xp); else g.player.xp += this.def.xp;
  }

  update(dt) {
    const g = this.game, p = g.player;
    this.age += dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    this.lastDmgT += dt;
    if (this.deathT >= 0) {
      this.deathT += dt;
      this.physicsStep(dt, false);
      // the body breaks apart into rising light
      if (Math.random() < dt * 40) g.particles.add({ x: this.x + (Math.random() - 0.5) * this.hw * 2, y: this.y + Math.random() * this.h, z: this.z + (Math.random() - 0.5) * this.hw * 2, vx: 0, vy: 2 + Math.random() * 3, vz: 0, size: 0.1 + Math.random() * 0.12, r: 1, g: 0.9, b: 0.6, a: 1, a0: 1, fade: true, layer: -2, life: 1.4, emis: 4, add: true });
      if (this.deathT > 2.5) {
        this.dead = true; g.particles.poof(this.x, this.y + 1, this.z, 40); g.camShake = 0.5;
        for (let i = 0; i < 60; i++) { const a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 8; g.particles.add({ x: this.x, y: this.y + this.h * 0.5, z: this.z, vx: Math.cos(a) * s, vy: (Math.random() - 0.3) * 8, vz: Math.sin(a) * s, size: 0.14, r: 1, g: 0.85, b: 0.5, a: 1, a0: 1, fade: true, layer: -2, life: 1.2, emis: 5, add: true, drag: 1.5 }); }
        g.flashT = Math.max(g.flashT || 0, 0.08);
        g.audio.play('explode', this);
      }
      return;
    }
    this.mx = 0; this.mz = 0; this.wantSpeed = 0; this.lookAt = null;
    const dp = Math.hypot(p.x - this.x, p.z - this.z);
    if (!this.awake) {
      this.sleepIdle(dt);
      if (dp < this.def.wake && !p.creative && !p.dead && Math.abs(p.y - this.y) < 14) this.wake();
    } else {
      // reset when the player leaves or dies
      if (p.dead || dp > 72 || p.creative) {
        this.resetT = (this.resetT || 0) + dt;
        if (this.resetT > 6) { this.awake = false; this.hp = this.maxHp; this.act = null; this.resetT = 0; this.enraged = false; }
      } else this.resetT = 0;
      this.target = p;
      // phase two: a roaring transition, shockwave and faster attacks
      if (!this.phase2 && this.hp < this.maxHp * 0.5) {
        this.phase2 = true; this.enraged = true; this.p2T = 1.4; this.act = null;
        g.audio.play('roar', this); g.camShake = 0.6;
        g.ui.subtitle('', `${this.def.name} is enraged!`, 2.5);
        ring(g, this, this.x, this.y, this.z, 1, 12, 1.2, 6, [1, 0.6, 0.3], { emis: 2 });
      }
      if (this.p2T > 0) { this.p2T -= dt; this.invulnerable = this.p2T > 0; if (Math.random() < dt * 30) g.particles.ember(this.x, this.y + this.h * Math.random(), this.z, 2); }
      if (this.stunT > 0) {
        this.stunT -= dt;
        if (Math.random() < dt * 8) g.particles.sparkle(this.x, this.y + this.h, this.z, [1, 1, 0.6], 1);
      } else if (this.act) {
        this.actT += dt;
        const a = this.act;
        if (a.tick) a.tick(this, dt, this.actT);
        if (this.actT >= a.dur) { if (a.end) a.end(this); this.act = null; this.cd = a.cd ?? 1.5; }
      } else {
        this.cd -= dt * (this.enraged ? 1.5 : 1);
        this.lookAt = p;
        this.chase(dt, dp);
        if (this.cd <= 0) this.chooseAttack(dp);
      }
      // leash
      const dh = Math.hypot(this.homePos[0] - this.x, this.homePos[2] - this.z);
      if (dh > 44 && !this.act) { const l = dh || 1; this.mx = (this.homePos[0] - this.x) / l; this.mz = (this.homePos[2] - this.z) / l; this.wantSpeed = this.def.runSpeed; }
    }
    this.bossFx(dt);
    this.move(dt);
    this.updateAnim(dt);
  }

  sleepIdle(dt) { void dt; }
  chase(dt, dp) {
    const p = this.game.player;
    if (dp > this.preferDist()) { const l = dp || 1; this.mx = (p.x - this.x) / l; this.mz = (p.z - this.z) / l; this.wantSpeed = this.def.speed; }
  }
  preferDist() { return 6; }
  chooseAttack(dp) {
    const opts = this.attacks().filter(a => !a.when || a.when(this, dp));
    let total = 0; for (const a of opts) total += a.w;
    let r = Math.random() * total;
    for (const a of opts) { if (r < a.w) { this.startAttack(a); return; } r -= a.w; }
  }
  startAttack(a) { this.act = a; this.actT = 0; if (a.start) a.start(this); }
  attacks() { return []; }
  bossFx() {}
  faceTarget(dt, k = 6) {
    const p = this.game.player;
    const ty = Math.atan2(-(p.x - this.x), -(p.z - this.z));
    let d = ty - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * k);
  }
  forward() { return [-Math.sin(this.yaw), -Math.cos(this.yaw)]; }

  render(er, F) {
    // initialise rest pose then defer to Mob renderer
    super.render(er, F);
  }
  serialize() { return null; }
}

// ================================================================= Woolly Mammoth
class Mammoth extends Boss {
  sleepIdle(dt) {
    // graze peacefully, wander slowly around the valley
    this.stateT -= dt;
    if (this.stateT <= 0) {
      this.stateT = 4 + Math.random() * 6;
      if (Math.random() < 0.5) { const a = Math.random() * 6.28; this.goal = [this.homePos[0] + Math.cos(a) * 14, this.homePos[2] + Math.sin(a) * 14]; } else { this.goal = null; this.grazeT = this.grazeMax = 3; }
    }
    if (this.grazeT > 0) this.grazeT -= dt;
    if (this.goal) { const dx = this.goal[0] - this.x, dz = this.goal[1] - this.z, l = Math.hypot(dx, dz); if (l > 1) { this.mx = dx / l; this.mz = dz / l; this.wantSpeed = 1.2; } else this.goal = null; }
  }
  bossFx(dt) {
    const g = this.game;
    this.breathT = (this.breathT || 0) - dt;
    if (this.breathT <= 0) {
      this.breathT = 2.5 + Math.random() * 2;
      const [fx, fz] = this.forward();
      for (let i = 0; i < 6; i++) g.particles.add({ x: this.x + fx * 6.8, y: this.y + 2.4, z: this.z + fz * 6.8, vx: fx * 1.2 + (Math.random() - 0.5) * 0.4, vy: 0.3 + Math.random() * 0.2, vz: fz * 1.2 + (Math.random() - 0.5) * 0.4, size: 0.3, size0: 0.3, grow: 3, r: 0.95, g: 0.97, b: 1, a: 0.45, a0: 0.45, fade: true, layer: -1, life: 1.6, drag: 1.5, light: g.particles.lightAt(this.x, this.y + 3, this.z) });
    }
    if (this.hp < this.maxHp * 0.5 && !this.enraged) { this.enraged = true; g.audio.mob('trumpet', this, 0.8); g.ui.subtitle('', 'The Mammoth is enraged!', 2); }
    // dust when walking
    if (Math.hypot(this.vx, this.vz) > 3 && Math.random() < dt * 20) g.particles.poof(this.x + (Math.random() - 0.5) * 3, this.y, this.z + (Math.random() - 0.5) * 3, 1);
  }
  preferDist() { return 7; }
  attacks() {
    return [
      { name: 'charge', w: 4, dur: 3.4, cd: 1.6, when: (b, d) => d > 6,
        start: (b) => { b.charging = 0; b.game.audio.mob('trumpet', b, 0.9); },
        tick: (b, dt, t) => {
          const g = b.game;
          if (t < 1.2) { b.faceTarget(dt, 5); b.chargePose = Math.min(1, t * 2); if (Math.random() < dt * 25) g.particles.poof(b.x - b.forward()[0] * 1.5, b.y, b.z - b.forward()[1] * 1.5, 1); return; }
          const [fx, fz] = b.forward();
          b.vx = fx * 13; b.vz = fz * 13; b.mx = fx; b.mz = fz; b.wantSpeed = 13;
          const p = g.player;
          if (!b._hitThis && Math.hypot(p.x - b.x, p.z - b.z) < 4.6 && Math.abs(p.y - b.y) < 6) {
            b._hitThis = true;
            if (p.damage(12, 'mob', false, b)) { p.knockX = fx * 16; p.knockZ = fz * 16; p.vy = 9; g.camShake = 0.5; }
          }
          if (b.hitWallX || b.hitWallZ || b.stuckT > 0.3) { b.stunT = 2.5; b.act = null; b.cd = 0.5; b.chargePose = 0; b._hitThis = false; g.camShake = 0.4; g.audio.play('explode', b); g.ui.subtitle('', 'The Mammoth is stunned!', 1.5); }
        },
        end: (b) => { b.chargePose = 0; b._hitThis = false; },
      },
      { name: 'tusk', w: 4, dur: 1.4, cd: 1.0, when: (b, d) => d < 7,
        start: (b) => { b.swipe = 0; },
        tick: (b, dt, t) => {
          b.faceTarget(dt, 3);
          b.swipe = t < 0.6 ? -t / 0.6 : Math.min(1, (t - 0.6) * 4);
          if (t > 0.65 && !b._swiped) {
            b._swiped = true;
            const p = b.game.player, [fx, fz] = b.forward();
            const dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz);
            if (d < 9.5 && (dx * fx + dz * fz) / (d || 1) > 0.2) { if (p.damage(8, 'mob', false, b)) { p.knockX = -fz * 10 * Math.sign(dx * -fz + dz * fx || 1); p.knockZ = fx * 10; p.vy = 6; } }
            b.game.audio.play('swing', b);
          }
        },
        end: (b) => { b.swipe = 0; b._swiped = false; },
      },
      { name: 'stomp', w: 3, dur: 1.8, cd: 1.2, when: (b, d) => d < 9,
        start: (b) => warn(b.game, b.x, b.y, b.z, 6, 0.95, [1, 0.9, 0.7]),
        tick: (b, dt, t) => {
          b.rearing = t < 0.9 ? t / 0.9 : Math.max(0, 1 - (t - 0.9) * 5);
          if (t > 0.95 && !b._stomped) {
            b._stomped = true;
            aoe(b.game, b.x, b.y, b.z, 6, 6, b, { up: 10, knock: 7, groundOnly: true });
            b.game.camShake = 0.5; b.game.audio.play('explode', b);
            for (let i = 0; i < 30; i++) b.game.particles.poof(b.x + (Math.random() - 0.5) * 8, b.y, b.z + (Math.random() - 0.5) * 8, 1);
          }
        },
        end: (b) => { b._stomped = false; b.rearing = 0; },
      },
      { name: 'shockwave', w: 3, dur: 2.6, cd: 2.0, when: (b) => b.enraged,
        start: (b) => { b.game.audio.mob('trumpet', b, 0.7); },
        tick: (b, dt, t) => {
          b.rearing = t < 1.0 ? t : Math.max(0, 1 - (t - 1) * 4);
          if (t > 1.05 && !b._sw) { b._sw = true; ring(b.game, b, b.x, b.y, b.z, 2, 18, 1.6, 7, [0.95, 0.97, 1], { slow: 3 }); b.game.camShake = 0.6; b.game.audio.play('explode', b); }
        },
        end: (b) => { b._sw = false; b.rearing = 0; },
      },
    ];
  }
}

// ================================================================= Ancient Forest Warden
class Warden extends Boss {
  sleepIdle(dt) { this.grazeT = 1; void dt; }
  preferDist() { return 5; }
  bossFx(dt) {
    const g = this.game;
    if (Math.random() < dt * 4) g.particles.sparkle(this.x + (Math.random() - 0.5) * 3, this.y + 4 + Math.random() * 3, this.z + (Math.random() - 0.5) * 3, [0.5, 1, 0.6], 1);
    if (this.rooted) {
      this.hp = Math.min(this.maxHp, this.hp + dt * this.maxHp * 0.03);
      if (Math.random() < dt * 20) g.particles.sparkle(this.x, this.y + Math.random() * 5, this.z, [0.4, 1, 0.4], 1);
    }
  }
  hurt(amount, src) {
    const r = super.hurt(amount, src);
    if (this.rooted) { this.rootBreak = (this.rootBreak || 0) + amount; if (this.rootBreak > 30) { this.rooted = false; this.act = null; this.stunT = 2; this.game.ui.subtitle('', 'You broke the Warden\'s roots!', 1.5); } }
    return r;
  }
  attacks() {
    const g = this.game;
    return [
      { name: 'slam', w: 4, dur: 1.6, cd: 1.0, when: (b, d) => d < 7,
        start: (b) => warn(g, b.x - Math.sin(b.yaw) * 3, b.y, b.z - Math.cos(b.yaw) * 3, 4.5, 0.9, [0.6, 1, 0.4]),
        tick: (b, dt, t) => {
          b.rearing = t < 0.9 ? t / 0.9 : Math.max(0, 1 - (t - 0.9) * 5);
          if (t > 0.92 && !b._s) { b._s = true; const [fx, fz] = b.forward(); aoe(g, b.x + fx * 3, b.y, b.z + fz * 3, 4.5, 9, b, { up: 8 }); g.camShake = 0.45; g.audio.play('explode', b); for (let i = 0; i < 24; i++) g.particles.poof(b.x + fx * 3 + (Math.random() - 0.5) * 6, b.y, b.z + fz * 3 + (Math.random() - 0.5) * 6, 1); }
        },
        end: (b) => { b._s = false; b.rearing = 0; },
      },
      { name: 'roots', w: 4, dur: 2.0, cd: 1.2,
        start: (b) => {
          const p = g.player;
          b.game.audio.mob('creak', b, 0.6);
          for (let k = 0; k < 3; k++) {
            const x = p.x + (k === 0 ? 0 : (Math.random() - 0.5) * 6), z = p.z + (k === 0 ? 0 : (Math.random() - 0.5) * 6);
            const y = g.mobs.groundAt(x, z);
            warn(g, x, y, z, 1.6, 1.1, [0.5, 0.9, 0.3], () => {
              g.entities.add(new RootSpike(g, x, y, z));
              aoe(g, x, y + 0.5, z, 1.8, 7, b, { up: 9, slow: 3 });
              g.audio.blockSound(B.oak_log, 'break', x, y, z);
            });
          }
        },
        tick: (b, dt) => b.faceTarget(dt, 4),
      },
      { name: 'whip', w: 3, dur: 1.5, cd: 1.0, when: (b, d) => d < 9,
        tick: (b, dt, t) => {
          b.faceTarget(dt, 2);
          b.swipe = t < 0.7 ? -t / 0.7 : Math.min(1, (t - 0.7) * 4);
          if (t > 0.75 && !b._w) {
            b._w = true;
            const p = g.player, [fx, fz] = b.forward(), dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz);
            if (d < 9 && (dx * fx + dz * fz) / (d || 1) > -0.1 && p.damage(7, 'mob', false, b)) { p.knockX = dx / d * 12; p.knockZ = dz / d * 12; p.vy = 6; }
            g.audio.play('swing', b);
          }
        },
        end: (b) => { b._w = false; b.swipe = 0; },
      },
      { name: 'summon', w: 2, dur: 1.6, cd: 2.0, when: () => g.entities.count(e => e.kind === 'rootling' && !e.dead) < 5,
        start: (b) => { g.audio.mob('creak', b, 0.5); },
        tick: (b, dt, t) => {
          if (t > 1 && !b._sm) {
            b._sm = true;
            for (let k = 0; k < 3; k++) {
              const a = Math.random() * 6.28, x = b.x + Math.cos(a) * 5, z = b.z + Math.sin(a) * 5;
              const y = g.mobs.groundAt(x, z);
              if (y > 0) { const m = createMob(g, 'rootling', x, y, z, {}); m.target = g.player; m.summoner = b; g.entities.add(m); g.particles.poof(x, y, z, 6); }
            }
          }
        },
        end: (b) => { b._sm = false; },
      },
      { name: 'regrow', w: 3, dur: 5, cd: 3, when: (b) => b.hp < b.maxHp * 0.35 && !b._regrown,
        start: (b) => { b.rooted = true; b.rootBreak = 0; b._regrown = true; g.ui.subtitle('', 'The Warden takes root to heal — strike it!', 2); },
        end: (b) => { b.rooted = false; },
      },
    ];
  }
}

// ================================================================= Desert Titan
class Titan extends Boss {
  sleepIdle() { this.dormant = true; }
  wake() { super.wake(); this.dormant = false; }
  preferDist() { return 8; }
  bossFx(dt) {
    const g = this.game;
    if (this.burrowed) { if (Math.random() < dt * 30) g.particles.poof(this.x + (Math.random() - 0.5) * 3, this.y + 8.5, this.z + (Math.random() - 0.5) * 3, 1); }
  }
  attacks() {
    const g = this.game;
    return [
      { name: 'rock', w: 4, dur: 1.8, cd: 0.8,
        tick: (b, dt, t) => {
          b.faceTarget(dt, 4); b.throwPose = Math.min(1, t / 0.9);
          if (t > 1.0 && !b._t) {
            b._t = true;
            const p = g.player;
            const sx = b.x - Math.sin(b.yaw) * 2 + Math.cos(b.yaw) * 2, sy = b.y + 8, sz = b.z - Math.cos(b.yaw) * 2 - Math.sin(b.yaw) * 2;
            const dx = p.x - sx, dz = p.z - sz, dy = p.y - sy, d = Math.hypot(dx, dz);
            const T = Math.max(0.8, d / 16);
            g.entities.add(new Boulder(g, b, sx, sy, sz, dx / T, dy / T + 0.5 * 22 * T, dz / T, { size: 1.6, dmg: 9, radius: 3.2 }));
            g.audio.play('swing', b);
          }
        },
        end: (b) => { b._t = false; b.throwPose = 0; },
      },
      { name: 'slam', w: 3, dur: 1.8, cd: 1.0, when: (b, d) => d < 9,
        start: (b) => warn(g, b.x - Math.sin(b.yaw) * 3, b.y, b.z - Math.cos(b.yaw) * 3, 6, 1.0, [1, 0.8, 0.4]),
        tick: (b, dt, t) => {
          b.slamPose = t < 1.0 ? t : Math.max(0, 1 - (t - 1) * 4);
          if (t > 1.02 && !b._s) { b._s = true; aoe(g, b.x - Math.sin(b.yaw) * 3, b.y, b.z - Math.cos(b.yaw) * 3, 6, 10, b, { up: 9, groundOnly: false }); g.camShake = 0.55; g.audio.play('explode', b); for (let i = 0; i < 30; i++) g.particles.poof(b.x + (Math.random() - 0.5) * 10, b.y, b.z + (Math.random() - 0.5) * 10, 1); }
        },
        end: (b) => { b._s = false; b.slamPose = 0; },
      },
      { name: 'sandstorm', w: 2, dur: 1.5, cd: 1.0, when: () => !(g.sandstorm > 0),
        start: (b) => { g.sandstorm = 12; g.audio.play('roar', b); g.ui.subtitle('', 'A sandstorm rises!', 2); },
      },
      { name: 'burrow', w: 3, dur: 4.2, cd: 1.5,
        start: (b) => { b.invulnerable = true; b.burrowed = true; g.audio.play('explode', b); },
        tick: (b, dt, t) => {
          if (t < 1.2) { b.sink = t / 1.2; return; }
          if (!b._bw) {
            b._bw = true;
            const p = g.player;
            b._tx = p.x; b._tz = p.z;
            warn(g, p.x, g.mobs.groundAt(p.x, p.z), p.z, 3.5, 1.4, [1, 0.7, 0.3], () => {
              b.x = b._tx; b.z = b._tz; b.y = g.mobs.groundAt(b._tx, b._tz);
              aoe(g, b.x, b.y, b.z, 3.8, 12, b, { up: 12 });
              g.camShake = 0.7; g.audio.play('explode', b);
              for (let i = 0; i < 40; i++) g.particles.poof(b.x + (Math.random() - 0.5) * 6, b.y, b.z + (Math.random() - 0.5) * 6, 1);
              b.emergeT = 0.8;
            });
          }
          if (b.emergeT > 0) { b.emergeT -= dt; b.sink = Math.max(0, b.emergeT / 0.8); }
        },
        end: (b) => { b.invulnerable = false; b.burrowed = false; b.sink = 0; b._bw = false; },
      },
      { name: 'summon', w: 2, dur: 1.2, cd: 1.5, when: () => g.entities.count(e => e.kind === 'dune_scorpion' && !e.dead) < 4,
        start: (b) => {
          for (let k = 0; k < 3; k++) {
            const a = Math.random() * 6.28, x = b.x + Math.cos(a) * 6, z = b.z + Math.sin(a) * 6;
            const y = g.mobs.groundAt(x, z);
            if (y > 0) { const m = createMob(g, 'dune_scorpion', x, y, z, {}); m.target = g.player; m.summoner = b; g.entities.add(m); g.particles.poof(x, y, z, 8); }
          }
          g.audio.mob('clatter', b);
        },
      },
    ];
  }
  render(er, F) {
    if (this.sink) { const y = this.y; this.y -= this.sink * 8.5; super.render(er, F); this.y = y; }
    else super.render(er, F);
  }
}

// ================================================================= Frost Wyrm (flying serpent)
class Wyrm extends Boss {
  constructor(game, kind, x, y, z, opts) {
    super(game, kind, x, y + 10, z, opts);
    this.trail = [];
    this.nSeg = 14;
    this.segModels = [];
    for (let i = 0; i < this.nSeg; i++) this.segModels.push(wyrmSegment(i, this.nSeg));
    this.orbitA = Math.random() * 6.28;
    this.pitch = 0;
    this.iceWalls = [];
  }
  sleepIdle(dt) {
    // coil slowly above the spire
    this.orbitA += dt * 0.25;
    const tx = this.homePos[0] + Math.cos(this.orbitA) * 8, tz = this.homePos[2] + Math.sin(this.orbitA) * 8, ty = this.homePos[1] + 6;
    this.flyToward(tx, ty, tz, 3, dt);
  }
  flyToward(tx, ty, tz, speed, dt) {
    const dx = tx - this.x, dy = ty - this.y, dz = tz - this.z, d = Math.hypot(dx, dy, dz) || 1;
    const k = 1 - Math.exp(-dt * 2.5);
    this.vx += (dx / d * speed - this.vx) * k; this.vy += (dy / d * speed - this.vy) * k; this.vz += (dz / d * speed - this.vz) * k;
  }
  chase(dt, dp) {
    const p = this.game.player;
    this.orbitA += dt * 0.6;
    const tx = p.x + Math.cos(this.orbitA) * 16, tz = p.z + Math.sin(this.orbitA) * 16, ty = Math.max(p.y + 8, this.homePos[1] + 4);
    this.flyToward(tx, ty, tz, this.def.speed, dt);
    void dp;
  }
  move(dt) {
    // free flight; no gravity
    if (this.act && this.act.name === 'dive' && this.actT > 1.0 && this.actT < 1.6) { /* driven in tick */ }
    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    const g = this.game;
    const ground = g.mobs.groundAt(this.x, this.z);
    if (ground > 0 && this.y < ground + 1) { this.y = ground + 1; this.vy = Math.max(0, this.vy); }
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > 0.5) {
      const ty = Math.atan2(-this.vx, -this.vz);
      let d = ty - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 4);
    }
    this.pitch = Math.atan2(this.vy, Math.max(0.5, sp));
    if (this.act && this.act.face) { this.faceTarget(dt, 6); }
    // trail for segments
    const last = this.trail[0];
    if (!last || Math.hypot(last[0] - this.x, last[1] - this.y, last[2] - this.z) > 0.25) {
      this.trail.unshift([this.x, this.y, this.z]);
      if (this.trail.length > this.nSeg * 8 + 10) this.trail.pop();
    }
    this.onGround = false;
  }
  physicsStep() {}
  bossFx(dt) {
    const g = this.game;
    if (Math.random() < dt * 12) g.particles.sparkle(this.x + (Math.random() - 0.5) * 2, this.y, this.z + (Math.random() - 0.5) * 2, [0.75, 0.9, 1], 1);
    // melt old ice walls
    if (this.iceWalls.length) {
      this.iceWalls = this.iceWalls.filter(w => {
        w.t -= dt;
        if (w.t > 0) return true;
        for (const [x, y, z] of w.blocks) if (g.world.getBlock(x, y, z) === B.frost_ice) g.world.setBlock(x, y, z, 0, 0);
        return false;
      });
    }
    // breath stream
    if (this.breathing) {
      const p = g.player;
      const [fx, fz] = this.forward();
      for (let i = 0; i < 6; i++) {
        const sp = 14 + Math.random() * 4;
        const dir = [p.x - this.x, p.y + 1 - this.y, p.z - this.z];
        const l = Math.hypot(...dir) || 1;
        g.particles.add({ x: this.x + fx * 2, y: this.y - 0.3, z: this.z + fz * 2, vx: dir[0] / l * sp + (Math.random() - 0.5) * 3, vy: dir[1] / l * sp + (Math.random() - 0.5) * 3, vz: dir[2] / l * sp + (Math.random() - 0.5) * 3, size: 0.3, size0: 0.3, grow: 3, r: 0.8, g: 0.92, b: 1, a: 0.6, a0: 0.6, fade: true, layer: -1, life: 1.0, drag: 1.2, light: 1, emis: 0.6 });
      }
    }
  }
  attacks() {
    const g = this.game;
    return [
      { name: 'breath', w: 4, dur: 3.2, cd: 1.2, face: true,
        tick: (b, dt, t) => {
          const p = g.player;
          b.flyToward(p.x + Math.cos(b.orbitA) * 10, p.y + 6, p.z + Math.sin(b.orbitA) * 10, 4, dt);
          b.jawOpen = Math.min(1, t * 2);
          b.breathing = t > 0.6 && t < 3.0;
          if (b.breathing) {
            b._bt = (b._bt || 0) + dt;
            if (b._bt > 0.3) {
              b._bt = 0;
              const dx = p.x - b.x, dy = p.y + 1 - b.y, dz = p.z - b.z, d = Math.hypot(dx, dy, dz);
              if (d < 18 && b.canSee(p) && p.damage(2.5, 'mob', true, b)) p.effects.slow = 3;
            }
          }
        },
        end: (b) => { b.breathing = false; b.jawOpen = 0; },
      },
      { name: 'volley', w: 3, dur: 1.8, cd: 1.0, face: true,
        tick: (b, dt, t) => {
          b.jawOpen = Math.min(1, t * 3);
          if (t > 0.8 && !b._v) {
            b._v = true;
            for (let k = 0; k < 5; k++) {
              const p = g.player;
              const tgt = { x: p.x + (Math.random() - 0.5) * 4, y: p.y, z: p.z + (Math.random() - 0.5) * 4, h: 1.8 };
              g.shootProjectile(b, tgt, 'ice', 5);
            }
          }
        },
        end: (b) => { b._v = false; b.jawOpen = 0; },
      },
      { name: 'walls', w: 2, dur: 1.4, cd: 1.0,
        start: (b) => {
          const p = g.player, w = g.world;
          const blocks = [];
          for (let k = 0; k < 3; k++) {
            const a = k / 3 * Math.PI * 2 + Math.random();
            const cx = Math.floor(p.x + Math.cos(a) * 4), cz = Math.floor(p.z + Math.sin(a) * 4);
            const gy = g.mobs.groundAt(cx, cz);
            const px = Math.round(-Math.sin(a)), pz = Math.round(Math.cos(a));
            for (let s = -2; s <= 2; s++) for (let y = 0; y < 4; y++) {
              const x = cx + px * s, z = cz + pz * s;
              if (!w.getBlock(x, gy + y, z)) { w.setBlock(x, gy + y, z, B.frost_ice, 0); blocks.push([x, gy + y, z]); }
            }
          }
          b.iceWalls.push({ blocks, t: 14 });
          g.audio.play('magic', b);
        },
      },
      { name: 'dive', w: 3, dur: 3.0, cd: 1.5,
        start: (b) => { const p = g.player; b._dx = p.x; b._dz = p.z; b._dy = g.mobs.groundAt(p.x, p.z); warn(g, b._dx, b._dy, b._dz, 5, 1.6, [0.7, 0.9, 1]); },
        tick: (b, dt, t) => {
          if (t < 1.0) { b.flyToward(b._dx, b._dy + 16, b._dz, 10, dt); return; }
          if (t < 1.6) { b.flyToward(b._dx, b._dy, b._dz, 26, dt); return; }
          if (!b._dv) { b._dv = true; aoe(g, b._dx, b._dy, b._dz, 5, 10, b, { up: 9, slow: 3 }); g.camShake = 0.6; g.audio.play('explode', b); for (let i = 0; i < 30; i++) g.particles.sparkle(b._dx + (Math.random() - 0.5) * 8, b._dy, b._dz + (Math.random() - 0.5) * 8, [0.8, 0.95, 1], 1); b.stunT = 1.4; }
          b.vy = 0;
        },
        end: (b) => { b._dv = false; },
      },
    ];
  }
  render(er, F) {
    const cam = F.camPos;
    const l = this.game.world.getLight(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z));
    const light = [Math.max(0.6, (l >> 4) / 15), (l & 15) / 15, Math.max(0, this.hurtT) * 2, 0.15];
    // head
    const m = this.model;
    const W = mat4.create();
    mat4.translate(W, W, this.x - cam[0], this.y - cam[1], this.z - cam[2]);
    mat4.rotateY(W, W, this.yaw);
    mat4.rotateX(W, W, this.pitch);
    if (this.deathT >= 0) mat4.rotateZ(W, W, Math.min(1, this.deathT) * 1.5);
    mat4.scale(W, W, 1 / 16, 1 / 16, 1 / 16);
    const mats = this._mats || (this._mats = m.parts.map(() => mat4.create()));
    for (let i = 0; i < m.parts.length; i++) {
      const part = m.parts[i];
      const M = mats[i];
      M.set(part.pi >= 0 ? mats[part.pi] : W);
      const pv = part.pivot;
      mat4.translate(M, M, pv[0], pv[1], pv[2]);
      const rest = part.rest || [0, 0, 0];
      let rx = rest[0];
      if (part.name === 'jaw') rx += (this.jawOpen || 0) * 0.6;
      if (rest[1]) mat4.rotateY(M, M, rest[1]);
      if (rx) mat4.rotateX(M, M, rx);
      mat4.translate(M, M, -pv[0], -pv[1], -pv[2]);
      for (const b of part.boxes) {
        TMP.set(M);
        mat4.translate(TMP, TMP, pv[0] + b.o[0], pv[1] + b.o[1], pv[2] + b.o[2]);
        mat4.scale(TMP, TMP, b.s[0], b.s[1], b.s[2]);
        er.pushBox(TMP, b.c, b.p, b.c2, b.pa, b.s[0], b.s[1], b.s[2], i, b.p === PAT.glow ? [light[0], light[1], light[2], 2.5] : light);
      }
    }
    // body segments along trail
    const spacing = 1.05;
    let dist = 0, idx = 0;
    let prev = [this.x, this.y, this.z];
    for (let s = 0; s < this.nSeg; s++) {
      const want = (s + 1) * spacing + 0.8;
      let pos = null;
      while (idx < this.trail.length - 1) {
        const a = this.trail[idx], b2 = this.trail[idx + 1];
        const seg = Math.hypot(a[0] - b2[0], a[1] - b2[1], a[2] - b2[2]);
        if (dist + seg >= want) { const k = (want - dist) / (seg || 1); pos = [a[0] + (b2[0] - a[0]) * k, a[1] + (b2[1] - a[1]) * k, a[2] + (b2[2] - a[2]) * k]; break; }
        dist += seg; idx++;
      }
      if (!pos) { const [fx, fz] = this.forward(); pos = [this.x - fx * want, this.y, this.z - fz * want]; }
      const dx = prev[0] - pos[0], dy = prev[1] - pos[1], dz = prev[2] - pos[2];
      const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
      const M = mat4.create();
      mat4.translate(M, M, pos[0] - cam[0], pos[1] - cam[1] + Math.sin(this.age * 3 - s * 0.6) * 0.15, pos[2] - cam[2]);
      mat4.rotateY(M, M, yaw); mat4.rotateX(M, M, pitch);
      mat4.rotateZ(M, M, Math.sin(this.age * 2 - s * 0.5) * 0.08);
      mat4.scale(M, M, 1 / 16, 1 / 16, 1 / 16);
      for (const b of this.segModels[s]) {
        TMP.set(M);
        mat4.translate(TMP, TMP, b.o[0], b.o[1], b.o[2]);
        mat4.scale(TMP, TMP, b.s[0], b.s[1], b.s[2]);
        er.pushBox(TMP, b.c, b.p, b.c2, b.pa, b.s[0], b.s[1], b.s[2], s + 20, light);
      }
      prev = pos;
    }
  }
}

// ================================================================= Volcanic Behemoth
class Behemoth extends Boss {
  sleepIdle(dt) { this.sleeping = false; if (Math.random() < dt * 2) this.game.particles.smoke(this.x, this.y + 8, this.z, 1, 0.25); }
  preferDist() { return 9; }
  bossFx(dt) {
    const g = this.game;
    if (Math.random() < dt * (this.enraged ? 30 : 10)) g.particles.ember(this.x + (Math.random() - 0.5) * 4, this.y + 6 + Math.random() * 3, this.z + (Math.random() - 0.5) * 4, this.enraged ? 2 : 1);
    if (Math.random() < dt * 6) g.particles.smoke(this.x + (Math.random() - 0.5) * 3, this.y + 8.5, this.z + (Math.random() - 0.5) * 3, 1, 0.2);
    if (this.hp < this.maxHp * 0.35 && !this.enraged) {
      this.enraged = true;
      this.def = Object.assign({}, this.def, { glow: 0.9, speed: 2.6 });
      g.ui.subtitle('', 'The Behemoth erupts with fury!', 2.5);
      g.audio.play('roar', this); g.camShake = 0.6;
      ring(g, this, this.x, this.y, this.z, 2, 20, 1.8, 9, [1, 0.5, 0.15], { fire: true, emis: 3 });
    }
    if (this.breathing) {
      const p = g.player, [fx, fz] = this.forward();
      for (let i = 0; i < 8; i++) {
        const dir = [p.x - this.x, p.y + 1 - (this.y + 5), p.z - this.z], l = Math.hypot(...dir) || 1, sp = 16;
        g.particles.add({ x: this.x + fx * 4, y: this.y + 5.5, z: this.z + fz * 4, vx: dir[0] / l * sp + (Math.random() - 0.5) * 4, vy: dir[1] / l * sp + (Math.random() - 0.5) * 4, vz: dir[2] / l * sp + (Math.random() - 0.5) * 4, size: 0.4, size0: 0.4, grow: 2, r: 1, g: 0.45, b: 0.1, a: 1, a0: 1, fade: true, layer: -1, life: 0.8, drag: 1, emis: 5, add: true });
      }
    }
  }
  attacks() {
    const g = this.game;
    return [
      { name: 'spit', w: 4, dur: 1.8, cd: 0.8,
        tick: (b, dt, t) => {
          b.faceTarget(dt, 4); b.jawOpen = Math.min(1, t * 2);
          if (t > 0.9 && !b._sp) {
            b._sp = true;
            const p = g.player;
            for (let k = 0; k < (b.enraged ? 5 : 3); k++) {
              const sx = b.x - Math.sin(b.yaw) * 4, sy = b.y + 6, sz = b.z - Math.cos(b.yaw) * 4;
              const tx = p.x + (Math.random() - 0.5) * 6, tz = p.z + (Math.random() - 0.5) * 6;
              const dx = tx - sx, dz = tz - sz, d = Math.hypot(dx, dz), T = Math.max(0.9, d / 15);
              g.entities.add(new Boulder(g, b, sx, sy, sz, dx / T, (p.y - sy) / T + 0.5 * 22 * T, dz / T, { size: 0.9, dmg: 6, radius: 2.5, fire: true, color: [0.25, 0.12, 0.08], color2: [1, 0.5, 0.1] }));
            }
            g.audio.play('ignite', b);
          }
        },
        end: (b) => { b._sp = false; b.jawOpen = 0; },
      },
      { name: 'eruptions', w: 4, dur: 2.4, cd: 1.0,
        start: (b) => {
          const p = g.player;
          const n = b.enraged ? 8 : 5;
          for (let k = 0; k < n; k++) {
            const x = p.x + (k === 0 ? 0 : (Math.random() - 0.5) * 12), z = p.z + (k === 0 ? 0 : (Math.random() - 0.5) * 12);
            const y = g.mobs.groundAt(x, z);
            warn(g, x, y, z, 1.8, 1.2 + k * 0.08, [1, 0.45, 0.1], () => {
              aoe(g, x, y + 0.5, z, 2.0, 8, b, { up: 11, fire: true });
              for (let i = 0; i < 20; i++) g.particles.add({ x: x + (Math.random() - 0.5), y, z: z + (Math.random() - 0.5), vx: (Math.random() - 0.5) * 2, vy: 8 + Math.random() * 8, vz: (Math.random() - 0.5) * 2, size: 0.35, size0: 0.35, grow: 1.5, r: 1, g: 0.5, b: 0.12, a: 1, a0: 1, fade: true, layer: -1, life: 0.9, grav: 12, emis: 6, add: true });
              g.particles.smoke(x, y + 1, z, 6, 0.25);
              g.audio.play('explode', { x, y, z });
            });
          }
          g.audio.play('roar', b);
        },
        tick: (b, dt) => b.faceTarget(dt, 3),
      },
      { name: 'stomp', w: 3, dur: 2.2, cd: 1.2,
        tick: (b, dt, t) => {
          b.rearing = t < 1.1 ? t / 1.1 : Math.max(0, 1 - (t - 1.1) * 4);
          if (t > 1.15 && !b._st) { b._st = true; ring(g, b, b.x, b.y, b.z, 2, 18, 1.6, 9, [1, 0.45, 0.12], { fire: true, emis: 3 }); g.camShake = 0.6; g.audio.play('explode', b); }
        },
        end: (b) => { b._st = false; b.rearing = 0; },
      },
      { name: 'breath', w: 3, dur: 3.0, cd: 1.2, when: (b, d) => d < 18,
        tick: (b, dt, t) => {
          b.faceTarget(dt, 2.5); b.jawOpen = Math.min(1, t * 2);
          b.breathing = t > 0.7 && t < 2.7;
          if (b.breathing) {
            b._bt = (b._bt || 0) + dt;
            if (b._bt > 0.3) {
              b._bt = 0;
              const p = g.player, [fx, fz] = b.forward(), dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz);
              if (d < 18 && (dx * fx + dz * fz) / (d || 1) > 0.75 && p.damage(3, 'mob', false, b)) p.fireTime = Math.max(p.fireTime, 3);
            }
          }
        },
        end: (b) => { b.breathing = false; b.jawOpen = 0; },
      },
    ];
  }
}

MOB_CLASSES.woolly_mammoth = Mammoth;
MOB_CLASSES.forest_warden = Warden;
MOB_CLASSES.desert_titan = Titan;
MOB_CLASSES.frost_wyrm = Wyrm;
MOB_CLASSES.volcanic_behemoth = Behemoth;

// ---------------------------------------------------------------- boss animations
import { ANIMS } from './anim.js';
function set(m, P, name, rx = 0, ry = 0, rz = 0, tx = 0, ty = 0, tz = 0) {
  const i = m.model.index[name]; if (i === undefined) return;
  const p = P[i]; p[0] += rx; p[1] += ry; p[2] += rz; p[3] += tx; p[4] += ty; p[5] += tz;
}
ANIMS.mammoth = (m, P, t) => {
  const s = Math.sin(m.walkPhase * 0.55) * m.walkAmt * 0.45;
  set(m, P, 'legFL', s); set(m, P, 'legBR', s); set(m, P, 'legFR', -s); set(m, P, 'legBL', -s);
  const charge = m.chargePose || 0, rear = m.rearing || 0, swipe = m.swipe || 0;
  set(m, P, 'body', -rear * 0.55, 0, 0, 0, rear * 8);
  set(m, P, 'legFL', -rear * 0.9, 0, 0, 0, rear * 8); set(m, P, 'legFR', -rear * 0.9, 0, 0, 0, rear * 8);
  set(m, P, 'head', charge * 0.5 + (m.grazeT > 0 ? 0.5 : 0) + m.headPitch * 0.4, swipe * 0.7 + m.headYaw * 0.5);
  set(m, P, 'trunk1', Math.sin(t * 1.3) * 0.12 - rear * 0.9 - charge * 0.6, Math.sin(t * 0.9) * 0.15);
  set(m, P, 'trunk2', Math.sin(t * 1.3 + 0.6) * 0.15 - rear * 0.6);
  set(m, P, 'trunk3', Math.sin(t * 1.3 + 1.2) * 0.2 - rear * 0.8);
  set(m, P, 'tail', 0, Math.sin(t * 2) * 0.3);
  set(m, P, 'body', 0, 0, Math.sin(m.walkPhase * 0.55) * 0.03 * m.walkAmt, 0, Math.abs(Math.sin(m.walkPhase * 0.55)) * m.walkAmt * 1.2);
};
ANIMS.warden = (m, P, t) => {
  const s = Math.sin(m.walkPhase * 0.6) * m.walkAmt * 0.45;
  set(m, P, 'legFL', s); set(m, P, 'legBR', s); set(m, P, 'legFR', -s); set(m, P, 'legBL', -s);
  const rear = m.rearing || 0, swipe = m.swipe || 0;
  set(m, P, 'body', -rear * 0.5, swipe * 0.25, 0, 0, rear * 10);
  set(m, P, 'legFL', -rear * 1.0, 0, 0, 0, rear * 10); set(m, P, 'legFR', -rear * 1.0, 0, 0, 0, rear * 10);
  set(m, P, 'head', m.headPitch * 0.5 + (m.rooted ? 0.6 : 0) + Math.sin(t * 0.8) * 0.05, m.headYaw * 0.5 + swipe * 0.9);
  for (const s2 of [-1, 1]) { set(m, P, 'antB' + s2, 0, 0, Math.sin(t * 1.4 + s2) * 0.06); set(m, P, 'antD' + s2, 0, 0, Math.sin(t * 1.7 + s2) * 0.08); }
  if (m.awake === false) { set(m, P, 'head', 0.5); }
};
ANIMS.titan = (m, P, t) => {
  const s = Math.sin(m.walkPhase * 0.5) * m.walkAmt * 0.5;
  set(m, P, 'legL', s); set(m, P, 'legR', -s);
  const thr = m.throwPose || 0, slam = m.slamPose || 0;
  set(m, P, 'armL', -s * 0.5 - slam * 2.6 + (m.dormant ? 0.3 : 0));
  set(m, P, 'armR', s * 0.5 - thr * 2.8 - slam * 2.6 + (m.dormant ? 0.3 : 0));
  set(m, P, 'head', m.headPitch * 0.5 + (m.dormant ? 0.5 : 0) + Math.sin(t * 0.6) * 0.03, m.headYaw * 0.5);
  set(m, P, 'body', slam * 0.35 + (m.dormant ? 0.35 : 0));
};
ANIMS.behemoth = (m, P, t) => {
  const s = Math.sin(m.walkPhase * 0.45) * m.walkAmt * 0.4;
  set(m, P, 'legFL', s); set(m, P, 'legBR', s); set(m, P, 'legFR', -s); set(m, P, 'legBL', -s);
  const rear = m.rearing || 0;
  set(m, P, 'body', -rear * 0.5, 0, 0, 0, rear * 12);
  set(m, P, 'legFL', -rear * 1.1, 0, 0, 0, rear * 12); set(m, P, 'legFR', -rear * 1.1, 0, 0, 0, rear * 12);
  set(m, P, 'head', m.headPitch * 0.4 - (m.jawOpen || 0) * 0.3, m.headYaw * 0.4);
  set(m, P, 'tail', 0, Math.sin(t * 1.1) * 0.25);
};
ANIMS.none = () => {};
