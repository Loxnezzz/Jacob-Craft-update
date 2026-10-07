// Dragons: rare legendary creatures. Find -> befriend (treats) -> tame -> saddle -> ride -> fly.
import { Mob, MOB_CLASSES } from './mobs.js';
import { MOBS } from './defs.js';
import { DRAGON } from './bossModels.js';
import { ANIMS } from './anim.js';
import { ITEMS, I } from '../game/items.js';
import { BLOCKS, IS_LIQUID } from '../world/blocks.js';
import { moveEntity } from '../game/physics.js';
import { PAT } from './models.js';
import { mat4 } from '../core/math.js';

MOBS.dragon = Object.assign({}, MOBS.horse, {
  id: 'dragon', name: 'Dragon', type: 'dragon', hp: 220, speed: 3, runSpeed: 6, size: [3.0, 3.4], model: DRAGON, scale: 1.25,
  drops: [], sounds: { idle: 'growl', hurt: 'roar', death: 'roar' }, food: ['dragon_treat'], idleSound: 0.05, rideable: true,
  knockRes: 0.9, xp: 0, tame: null, fireImmune: true, gallop: false,
});

const TRUST_FRIEND = 3, TRUST_TAME = 6;

export class Dragon extends Mob {
  constructor(game, kind, x, y, z, opts = {}) {
    super(game, kind, x, y, z, Object.assign({ persistent: true }, opts));
    const d = opts.data || {};
    this.isDragon = true;
    this.trust = d.trust || 0;
    this.tamed = !!(d.tamed || opts.tamed);
    this.saddled = !!(d.saddled || opts.saddled);
    this.roost = d.roost || [x, y, z];
    this.flying = d.flying ?? true;
    this.angryT = 0;
    this.pitch = 0;
    this.flapT = 0; this.flapAmt = 1;
    this.orbit = Math.random() * 6.28;
    this.breathT = 0;
    this.landT = 0;
    this.lastHurtByPlayer = -999;
    this.colors = d.colors || null;
  }
  get name() { return this.baby ? 'Dragon Hatchling' : this.tamed ? 'Your Dragon' : 'Wild Dragon'; }
  // hatchlings follow their owner on foot and grow up after a while (treats speed it up)
  growUp(dt) {
    if (!this.baby) return;
    this.growT -= dt;
    if (this.growT > 0) return;
    this.baby = false;
    this.hw = this.def.size[0] / 2; this.h = this.def.size[1];
    const g = this.game;
    g.ui.toast('Your dragon has grown!', 'Put a saddle on it to ride.');
    g.audio.play('roar', this);
    for (let i = 0; i < 30; i++) g.particles.sparkle(this.x, this.y + Math.random() * 3, this.z, [1, 0.8, 0.4], 1);
  }
  extraData() { return { trust: this.trust, tamed: this.tamed, saddled: this.saddled, roost: this.roost, flying: this.flying }; }
  loadExtra(d) { Object.assign(this, { trust: d.trust || 0, tamed: !!d.tamed, saddled: !!d.saddled, roost: d.roost || this.roost, flying: d.flying ?? true }); }

  hurt(amount, src = {}) {
    const g = this.game;
    if (this.rider && src.entity === this.rider) return false;
    if (src.entity === g.player) {
      if (this.tamed) return false;
      this.lastHurtByPlayer = this.age;
      this.trust = Math.max(0, this.trust - 2);
      this.angryT = 25;
    }
    const r = super.hurt(amount, Object.assign({}, src, { knock: 0.2 }));
    this.fleeT = 0;
    return r;
  }

  interact(player, held) {
    const g = this.game;
    const it = held ? ITEMS[held.id] : null;
    if (this.deathT >= 0) return false;
    if (it && it.name === 'dragon_treat') {
      if (this.angryT > 0) { g.ui.chat('The dragon snarls. It does not trust you right now.', '#f96'); return true; }
      g.interaction.consumeHeld();
      this.hp = Math.min(this.def.hp, this.hp + 20);
      if (!this.tamed) {
        this.trust++;
        g.particles.hearts(this.x, this.y + this.h * 1.2, this.z);
        g.audio.mob('growl', this, 1.4);
        if (this.trust === TRUST_FRIEND) { g.ui.toast('Dragon befriended', 'The dragon no longer fears you. Keep offering treats.'); }
        if (this.trust >= TRUST_TAME) {
          this.tamed = true; this.owner = 'player';
          g.ui.toast('Dragon tamed!', 'Put a saddle on your dragon to ride it.');
          g.ui.subtitle('A bond is forged', 'The dragon is yours', 4);
          for (let i = 0; i < 30; i++) g.particles.sparkle(this.x, this.y + Math.random() * 4, this.z, [1, 0.8, 0.4], 1);
          g.audio.play('levelup');
        } else if (this.trust < TRUST_FRIEND) g.ui.chat(`The dragon eyes the treat warily... (${this.trust}/${TRUST_TAME})`, '#fd9');
        else g.ui.chat(`The dragon nuzzles your hand. (${this.trust}/${TRUST_TAME})`, '#fd9');
      } else {
        g.particles.hearts(this.x, this.y + this.h * 1.2, this.z);
        if (this.baby) { this.growT = Math.max(1, this.growT - 90); g.ui.actionText && g.ui.actionText(`Your hatchling grows... (${Math.ceil(this.growT / 60)} min to go)`); }
      }
      return true;
    }
    if (this.baby && it && it.name === 'saddle') { g.ui.chat('Your dragon is still too young to carry a rider. Feed it treats to help it grow.', '#ccc'); return true; }
    if (this.tamed && !this.saddled && it && it.name === 'saddle') {
      this.saddled = true; g.interaction.consumeHeld(); g.audio.play('craft'); g.ui.chat('Saddled! Right-click to ride. Space to rise, Shift to descend, W to fly, attack to breathe fire.', '#9cf');
      return true;
    }
    if (this.tamed && this.saddled && !player.sneaking) { this.mount(player); return true; }
    if (this.tamed && !this.saddled) { g.ui.chat('Your dragon needs a saddle before you can ride it.', '#ccc'); return true; }
    if (!this.tamed) { g.ui.chat(this.trust >= TRUST_FRIEND ? 'The dragon tolerates your presence. Offer more treats.' : 'The dragon watches you. Perhaps a treat would help...', '#ccc'); return true; }
    return false;
  }

  mount(player) {
    this.rider = player; player.riding = this;
    this.flying = !this.onGround;
    this.game.thirdPersonBeforeRide = this.game.thirdPerson;
    if (!this.game.thirdPerson) this.game.thirdPerson = 1;
  }
  dismount() {
    const p = this.rider;
    if (!p) return;
    p.riding = null; this.rider = null;
    p.y = this.y + this.h + 0.2;
    p.x += Math.cos(this.yaw) * 2; p.z -= Math.sin(this.yaw) * 2;
    p.vy = 0;
    if (this.game.thirdPersonBeforeRide !== undefined) this.game.thirdPerson = this.game.thirdPersonBeforeRide;
  }

  // ---------------------------------------------------------------- riding / flight
  controlRide(dt, input, active) {
    const p = this.rider;
    if (!p) return;
    const g = this.game;
    let fwd = 0, up = 0, strafe = 0;
    if (active) {
      if (input.is('forward')) fwd = 1;
      if (input.is('back')) fwd = -0.5;
      if (input.is('left')) strafe = -1;
      if (input.is('right')) strafe = 1;
      if (input.is('jump')) up = 1;
      if (input.is('sneak')) up = -1;
      if (input.btn(0)) this.breathing = true; else this.breathing = false;
    }
    this.yaw = p.yaw;
    if (this.onGround && up <= 0 && !this.flying) {
      // walking on ground
      if (input.was('sneak') && active) { this.dismount(); return; }
      const sp = 5;
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      const tx = (-sy * fwd + cy * strafe * 0.6) * sp, tz = (-cy * fwd - sy * strafe * 0.6) * sp;
      const k = 1 - Math.exp(-dt * 6);
      this.vx += (tx - this.vx) * k; this.vz += (tz - this.vz) * k;
      this.vy -= 30 * dt;
      if (up > 0) { this.flying = true; this.vy = 8; }
    } else {
      this.flying = true;
      const boost = input.is('sprint') ? 1.8 : 1;
      const sp = 16 * boost;
      const cp = Math.cos(p.pitch);
      const dir = [-Math.sin(this.yaw) * cp, Math.sin(p.pitch), -Math.cos(this.yaw) * cp];
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      const tx = dir[0] * sp * fwd + cy * strafe * 5, tz = dir[2] * sp * fwd - sy * strafe * 5;
      const ty = dir[1] * sp * Math.max(0, fwd) + up * 9 - (fwd === 0 && up === 0 ? 0.6 : 0);
      const k = 1 - Math.exp(-dt * 2.2);
      this.vx += (tx - this.vx) * k; this.vz += (tz - this.vz) * k; this.vy += (ty - this.vy) * k;
      this.flapAmt = fwd > 0 || up > 0 ? 1 : 0.4;
      // land when touching ground while descending slowly
      if (this.onGround && up < 0) { this.flying = false; }
    }
    this.flightStep(dt);
    this.pitch += ((this.flying ? Math.atan2(this.vy, Math.max(1, Math.hypot(this.vx, this.vz))) * 0.6 : 0) - this.pitch) * Math.min(1, dt * 4);
    p.x = this.x; p.z = this.z; p.y = this.y + this.h * 0.95;
    p.vx = this.vx; p.vy = 0; p.vz = this.vz; p.fallDist = 0; p.onGround = true;
    if (this.breathing) this.breathFire(dt, p.lookDir());
  }

  flightStep(dt) {
    const r = moveEntity(this.game.world, this, this.vx * dt, this.vy * dt, this.vz * dt);
    if (r.hitX) this.vx *= 0.2;
    if (r.hitZ) this.vz *= 0.2;
    if (r.hitY) { this.onGround = this.vy < 0; this.vy = 0; } else this.onGround = false;
    this.hitWallX = r.hitX; this.hitWallZ = r.hitZ;
  }

  breathFire(dt, dir) {
    const g = this.game;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const hx = this.x + fx * 4.8, hy = this.y + this.h * 0.95, hz = this.z + fz * 4.8;
    for (let i = 0; i < 5; i++) {
      const sp = 20 + Math.random() * 6;
      g.particles.add({ x: hx, y: hy, z: hz, vx: dir[0] * sp + (Math.random() - 0.5) * 4 + this.vx, vy: dir[1] * sp + (Math.random() - 0.5) * 4, vz: dir[2] * sp + (Math.random() - 0.5) * 4 + this.vz, size: 0.45, size0: 0.45, grow: 2.5, r: 1, g: 0.5, b: 0.12, a: 1, a0: 1, fade: true, layer: -1, life: 0.7, drag: 1.2, emis: 6, add: true });
    }
    this.breathT -= dt;
    if (this.breathT <= 0) {
      this.breathT = 0.25;
      g.audio.noise({ f: 900, q: 0.5, dur: 0.3, gain: 0.25 }, this);
      for (const e of g.entities.list) {
        if (e === this || e.dead || !e.hurt || e.type !== 'mob' || e.tamed || e.isVillager) continue;
        const dx = e.x - hx, dy = e.y + e.h / 2 - hy, dz = e.z - hz, d = Math.hypot(dx, dy, dz);
        if (d > 18) continue;
        if ((dx * dir[0] + dy * dir[1] + dz * dir[2]) / (d || 1) > 0.82) { e.hurt(4, { entity: this.rider || this, type: 'fire' }); if (!(e.def && e.def.fireImmune)) e.fireT = 4; }
      }
    }
  }

  // ---------------------------------------------------------------- AI when not ridden
  update(dt) {
    this.growUp(dt);
    if (this.rider) {
      this.age += dt;
      if (this.hurtT > 0) this.hurtT -= dt;
      this.updateAnim(dt);
      this.flapT += dt * (this.flying ? 7 : 2) * (0.5 + this.flapAmt);
      return;
    }
    const g = this.game, p = g.player;
    this.age += dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.attackCD > 0) this.attackCD -= dt;
    if (this.angryT > 0) this.angryT -= dt;
    if (this.deathT >= 0) { this.deathT += dt; this.vy -= 20 * dt; this.flightStep(dt); if (this.deathT > 2) { this.dead = true; g.particles.poof(this.x, this.y + 1, this.z, 30); } return; }
    const dp = Math.hypot(p.x - this.x, p.z - this.z);
    const holdingTreat = p.held() && ITEMS[p.held().id].name === 'dragon_treat';
    let tx, ty, tz, sp;
    this.breathing = false;
    if (this.angryT > 0 && !p.dead && !p.creative && dp < 60) {
      // swoop at the player and breathe fire
      this.flying = true;
      this.orbit += dt * 0.8;
      tx = p.x + Math.cos(this.orbit) * 14; tz = p.z + Math.sin(this.orbit) * 14; ty = p.y + 9; sp = 12;
      if (dp < 22 && this.canSee(p)) {
        const dir = [p.x - this.x, p.y + 1 - (this.y + this.h), p.z - this.z]; const l = Math.hypot(...dir); dir[0] /= l; dir[1] /= l; dir[2] /= l;
        this.faceDir(dir, dt);
        if (Math.sin(this.age * 0.9) > 0.3) {
          this.breathFireWild(dt, dir);
        }
      }
    } else if (this.tamed) {
      // follow owner, land nearby when close
      const dOwner = Math.hypot(p.x - this.x, p.y - this.y, p.z - this.z);
      if (this.sitting) { tx = this.x; tz = this.z; ty = this.y; sp = 0; this.flying = false; }
      else if (dOwner > 40) { this.x = p.x + 6; this.z = p.z + 6; this.y = p.y + 10; this.flying = true; tx = p.x; tz = p.z; ty = p.y + 6; sp = 8; }
      else if (dOwner > 10) { this.flying = true; tx = p.x + 4; tz = p.z + 4; ty = p.y + 5; sp = Math.min(14, dOwner); }
      else { tx = p.x + 4; tz = p.z + 4; ty = g.mobs.groundAt(this.x, this.z); sp = 3; if (this.y - ty < 1.5) this.flying = false; }
    } else {
      // wild: circle the roost, sometimes land on the nest; approach a player holding treats if trusting
      const [rx, ry, rz] = this.roost;
      if (holdingTreat && dp < 20 && this.age - this.lastHurtByPlayer > 30) {
        tx = p.x + (this.x - p.x) / (dp || 1) * 4; tz = p.z + (this.z - p.z) / (dp || 1) * 4; ty = g.mobs.groundAt(tx, tz); sp = 5;
        this.lookAt = p;
        if (this.y - ty < 1.5) this.flying = false;
      } else {
        this.landT -= dt;
        if (this.landT < -40) this.landT = 20 + Math.random() * 25;
        if (this.landT > 0) { tx = rx; tz = rz; ty = ry; sp = 5; if (Math.hypot(this.x - rx, this.z - rz) < 2 && this.y - ry < 2) { this.flying = false; sp = 0; } }
        else { this.flying = true; this.orbit += dt * 0.18; tx = rx + Math.cos(this.orbit) * 26; tz = rz + Math.sin(this.orbit) * 26; ty = ry + 14 + Math.sin(this.age * 0.3) * 6; sp = 9; }
      }
    }
    if (sp > 0) {
      if (!this.flying) {
        // walk on ground
        const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
        if (d > 1.5) { this.vx += ((dx / d) * Math.min(sp, 4) - this.vx) * Math.min(1, dt * 4); this.vz += ((dz / d) * Math.min(sp, 4) - this.vz) * Math.min(1, dt * 4); this.yaw = Math.atan2(-dx, -dz); }
        else { this.vx *= Math.exp(-dt * 6); this.vz *= Math.exp(-dt * 6); }
        this.vy -= 30 * dt;
        if ((this.hitWallX || this.hitWallZ) && this.onGround) this.vy = 9;
        if (ty > this.y + 3) this.flying = true;
      } else {
        const dx = tx - this.x, dy = ty - this.y, dz = tz - this.z, d = Math.hypot(dx, dy, dz) || 1;
        const k = 1 - Math.exp(-dt * 1.6);
        this.vx += (dx / d * sp - this.vx) * k; this.vy += (dy / d * sp - this.vy) * k; this.vz += (dz / d * sp - this.vz) * k;
        const hs = Math.hypot(this.vx, this.vz);
        if (hs > 0.5 && !this.breathingWild) { const ty2 = Math.atan2(-this.vx, -this.vz); let dd = ty2 - this.yaw; while (dd > Math.PI) dd -= 6.283; while (dd < -Math.PI) dd += 6.283; this.yaw += dd * Math.min(1, dt * 3); }
        // keep clear of terrain
        const gy = g.mobs.groundAt(this.x + this.vx * 0.5, this.z + this.vz * 0.5);
        if (gy > 0 && this.y < gy + 3 && ty > gy + 3) this.vy += 20 * dt;
      }
    } else { this.vx *= Math.exp(-dt * 6); this.vz *= Math.exp(-dt * 6); this.vy -= 30 * dt; }
    this.breathingWild = false;
    this.flightStep(dt);
    if (this.onGround && this.flying && this.vy <= 0 && sp <= 5) this.flying = false;
    this.pitch += ((this.flying ? Math.atan2(this.vy, Math.max(1, Math.hypot(this.vx, this.vz))) * 0.5 : 0) - this.pitch) * Math.min(1, dt * 3);
    this.flapAmt = this.flying ? (this.vy > 1 ? 1.3 : 0.8) : 0;
    this.flapT += dt * (this.flying ? 6 : 0) * (0.5 + this.flapAmt);
    this.updateAnim(dt);
    this.idleT -= dt;
    if (this.idleT <= 0) { this.idleT = 8 + Math.random() * 12; if (dp < 60) g.audio.mob('growl', this, 0.7); }
  }

  faceDir(dir, dt) {
    const ty = Math.atan2(-dir[0], -dir[2]);
    let d = ty - this.yaw; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283;
    this.yaw += d * Math.min(1, dt * 4);
  }

  breathFireWild(dt, dir) {
    this.breathingWild = true;
    const g = this.game;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const hx = this.x + fx * 4.8, hy = this.y + this.h * 0.95, hz = this.z + fz * 4.8;
    for (let i = 0; i < 4; i++) {
      const sp = 18;
      g.particles.add({ x: hx, y: hy, z: hz, vx: dir[0] * sp + (Math.random() - 0.5) * 4, vy: dir[1] * sp + (Math.random() - 0.5) * 4, vz: dir[2] * sp + (Math.random() - 0.5) * 4, size: 0.45, size0: 0.45, grow: 2.5, r: 1, g: 0.5, b: 0.12, a: 1, a0: 1, fade: true, layer: -1, life: 0.8, drag: 1.2, emis: 6, add: true });
    }
    this.breathT -= dt;
    if (this.breathT <= 0) {
      this.breathT = 0.35;
      const p = g.player;
      const dx = p.x - hx, dy = p.y + 1 - hy, dz = p.z - hz, d = Math.hypot(dx, dy, dz);
      if (d < 20 && (dx * dir[0] + dy * dir[1] + dz * dir[2]) / d > 0.85 && p.damage(3, 'mob', false, this)) p.fireTime = Math.max(p.fireTime, 3);
    }
  }

  // ---------------------------------------------------------------- render extras (saddle)
  render(er, F) {
    const savePitch = this.pitch;
    super.render(er, F);
    if (this.saddled) {
      const cam = F.camPos;
      const M = mat4.create();
      mat4.translate(M, M, this.x - cam[0], this.y - cam[1], this.z - cam[2]);
      mat4.rotateY(M, M, this.yaw);
      const s = this.def.scale / 16;
      mat4.scale(M, M, s, s, s);
      mat4.translate(M, M, -7, 40, -16);
      mat4.scale(M, M, 14, 3, 14);
      const l = this.game.world.getLight(Math.floor(this.x), Math.floor(this.y + 2), Math.floor(this.z));
      er.pushBox(M, [0.45, 0.25, 0.12], PAT.cloth, [0.85, 0.65, 0.2], 3, 14, 3, 14, 4, [(l >> 4) / 15, (l & 15) / 15, 0, 0]);
    }
    this.pitch = savePitch;
  }
}

// whole-body pitch for flight is applied through the body part
ANIMS.dragon = (m, P, t) => {
  const idx = m.model.index;
  const add = (n, rx = 0, ry = 0, rz = 0, tx = 0, ty = 0, tz = 0) => { const i = idx[n]; if (i === undefined) return; const p = P[i]; p[0] += rx; p[1] += ry; p[2] += rz; p[3] += tx; p[4] += ty; p[5] += tz; };
  const flying = m.flying && !m.onGround;
  const flap = flying ? Math.sin(m.flapT || t * 6) : 0;
  const glide = flying ? 0.15 : 0;
  add('wingL', 0, 0, flying ? flap * 0.8 + glide : 1.1);
  add('wingR', 0, 0, flying ? -flap * 0.8 - glide : -1.1);
  add('wingL2', 0, 0, flying ? flap * 0.5 : 1.6);
  add('wingR2', 0, 0, flying ? -flap * 0.5 : -1.6);
  add('body', -(m.pitch || 0), 0, 0, 0, flying ? Math.sin(m.flapT || 0) * 1.5 : 0);
  const s = Math.sin(m.walkPhase * 0.8) * m.walkAmt * 0.6;
  if (flying) { for (const n of ['legFL', 'legFR', 'legBL', 'legBR']) add(n, 0.9); }
  else { add('legFL', s); add('legBR', s); add('legFR', -s); add('legBL', -s); }
  add('neck', Math.sin(t * 1.1) * 0.05 + (m.breathing || m.breathingWild ? -0.25 : 0), m.headYaw * 0.4);
  add('head', m.headPitch * 0.4 + (m.breathing || m.breathingWild ? 0.2 : 0));
  add('tail1', 0, Math.sin(t * 1.4) * 0.2); add('tail2', 0, Math.sin(t * 1.4 - 0.6) * 0.25); add('tail3', 0, Math.sin(t * 1.4 - 1.2) * 0.3);
};

MOB_CLASSES.dragon = Dragon;
