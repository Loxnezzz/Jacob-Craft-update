// The player: movement physics, survival stats, damage, inventory ownership.
import { moveWithStep, liquidState, boxCollides } from './physics.js';
import { Inventory } from './inventory.js';
import { ITEMS, I, enchLevel } from './items.js';
import { BLOCKS, B, IS_LIQUID } from '../world/blocks.js';
import { HEIGHT } from '../world/constants.js';

export const GRAVITY = 32;
const JUMP_V = 9.0;
const WALK = 4.317, SPRINT = 5.612, SNEAK = 1.3;

export class Player {
  constructor(game) {
    this.game = game;
    this.x = 0; this.y = 80; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.hw = 0.3; this.h = 1.8;
    this.yaw = 0; this.pitch = 0;
    this.onGround = false;
    this.wasOnGround = false;
    this.sneaking = false; this.sprinting = false; this.flying = false;
    this.eyeH = 1.62; this.eyeCur = 1.62;
    this.health = 20; this.maxHealth = 20;
    this.food = 20; this.saturation = 5; this.exhaustion = 0;
    this.air = 300; this.maxAir = 300;
    this.fallDist = 0;
    this.hurtTime = 0; this.invuln = 0; this.lastDamage = 0;
    this.regenTimer = 0; this.starveTimer = 0; this.fireTime = 0; this.lavaTimer = 0; this.drownTimer = 0;
    this.dead = false;
    this.inventory = new Inventory(36);
    this.armor = new Inventory(4);
    this.offhand = new Inventory(1);
    this.selected = 0;
    this.cursor = null;
    this.gamemode = 'survival';
    this.spawn = null;
    this.walkDist = 0; this.bobPhase = 0; this.bobAmt = 0;
    this.lastJumpTap = 0; this.lastSprintTap = 0;
    this.liquid = { water: 0, inWater: false, lava: false, eyeInWater: false };
    this.inWeb = false;
    this.climbing = false;
    this.riding = null;
    this.effects = {};   // name -> seconds remaining
    this.xp = 0; this.level = 0;
    this.attackCooldown = 0;
    this.swing = 0;
    this.stepSoundDist = 0;
    this.knockX = 0; this.knockZ = 0;
  }

  get eyeY() { return this.y + this.eyeCur; }
  get creative() { return this.gamemode === 'creative'; }
  held() { return this.inventory.slots[this.selected]; }
  lookDir() {
    const cp = Math.cos(this.pitch);
    return [-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp];
  }

  armorPoints() {
    let p = 0;
    for (const s of this.armor.slots) if (s && ITEMS[s.id].armor) p += ITEMS[s.id].armor.pts;
    return p;
  }

  // ---------- movement ----------
  updateMovement(dt, input, controlsActive) {
    const world = this.game.world;
    this.wasOnGround = this.onGround;
    let fwd = 0, strafe = 0, jump = false, sneak = false;
    if (controlsActive) {
      if (input.is('forward')) fwd += 1;
      if (input.is('back')) fwd -= 1;
      if (input.is('left')) strafe -= 1;
      if (input.is('right')) strafe += 1;
      jump = input.is('jump');
      sneak = input.is('sneak');
      // double tap jump toggles flight in creative
      if (input.was('jump') && this.creative) {
        const now = performance.now();
        if (now - this.lastJumpTap < 300) { this.flying = !this.flying; this.vy = 0; }
        this.lastJumpTap = now;
      }
      if (input.was('forward')) {
        const now = performance.now();
        if (now - this.lastSprintTap < 280 && this.food > 6) this.sprinting = true;
        this.lastSprintTap = now;
      }
      if (input.is('sprint') && fwd > 0 && (this.food > 6 || this.creative) && !sneak) this.sprinting = true;
    }
    if (fwd <= 0 || sneak || (this.food <= 6 && !this.creative)) this.sprinting = false;
    if (!this.creative) this.flying = false;
    this.sneaking = sneak && !this.flying;

    this.liquid = liquidState(world, this, this.eyeCur);
    const inWater = this.liquid.inWater, inLava = this.liquid.lava;
    // web / climb
    const fx = Math.floor(this.x), fy = Math.floor(this.y + 0.1), fz = Math.floor(this.z);
    const feet = world.getBlock(fx, fy, fz), head = world.getBlock(fx, Math.floor(this.y + 1.2), fz);
    this.inWeb = feet === B.cobweb || head === B.cobweb;
    this.climbing = (BLOCKS[feet].climbable || BLOCKS[head].climbable) && !this.flying;

    let speed = this.sprinting ? SPRINT : this.sneaking ? SNEAK : WALK;
    if (this.effects.swift) speed *= 1.35;
    if (this.effects.slow) speed *= 0.5;
    const fleet = enchLevel(this.armor.slots[3], 'swiftness');
    if (fleet && !this.flying) speed *= 1 + fleet * 0.08;
    const boots = this.armor.slots[3];
    if (boots && ITEMS[boots.id].armor && ITEMS[boots.id].armor.swift && !this.flying) {
      const under = world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.2), Math.floor(this.z));
      speed *= under === B.sand || under === B.red_sand || under === B.sandstone ? 1.35 : 1.2;
    }
    const ia = this.game.interaction;
    if (ia && !this.flying && (ia.bowDraw > 0 || ia.loadT > 0 || ia.eating)) speed *= 0.5;
    if (this.blocking && !this.flying) speed *= 0.4;   // shield raised
    if (this.flying) speed = this.sprinting ? 21 : 10.9;
    if (inWater && !this.flying) speed = this.sprinting ? 3.9 : 2.3;
    if (inLava) speed = 1.2;
    if (this.inWeb) speed *= 0.25;
    const len = Math.hypot(fwd, strafe) || 1;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const tx = ((-sy) * fwd + cy * strafe) / len * speed * (fwd || strafe ? 1 : 0);
    const tz = ((-cy) * fwd - sy * strafe) / len * speed * (fwd || strafe ? 1 : 0);

    // ground slipperiness
    let slip = 0;
    if (this.onGround) {
      const below = world.getBlock(fx, Math.floor(this.y - 0.05), fz);
      slip = BLOCKS[below].slippery || 0;
    }
    let accel;
    if (this.flying) accel = 8;
    else if (inWater || inLava) accel = 6;
    else if (this.onGround) accel = slip ? 1.2 : 16;
    else accel = 2.6;
    const k = 1 - Math.exp(-accel * dt);
    this.vx += (tx - this.vx) * k;
    this.vz += (tz - this.vz) * k;
    // knockback
    if (this.knockX || this.knockZ) {
      this.vx += this.knockX; this.vz += this.knockZ;
      this.knockX = 0; this.knockZ = 0;
    }

    // vertical
    if (this.flying) {
      let ty = 0;
      if (jump) ty += 8; if (sneak && controlsActive) ty -= 8;
      this.vy += (ty - this.vy) * (1 - Math.exp(-10 * dt));
    } else if (inWater || inLava) {
      this.vy -= (inLava ? 4 : 7) * dt;
      if (jump) this.vy += (inLava ? 14 : 22) * dt;
      this.vy *= Math.exp(-(inLava ? 4 : 2.6) * dt);
      if (this.vy < -4) this.vy = -4;
      // hop out of water at edges
      if (jump && this.liquid.water < 0.6 && (this.hitWallX || this.hitWallZ)) this.vy = 6.2;
      this.fallDist = 0;
    } else if (this.climbing) {
      this.vy -= GRAVITY * dt;
      if (this.vy < -2.4) this.vy = -2.4;
      if ((fwd !== 0 || strafe !== 0) && (this.hitWallX || this.hitWallZ) || jump) this.vy = 2.6;
      if (this.sneaking && this.vy < 0) this.vy = 0;
      this.fallDist = 0;
    } else {
      this.vy -= GRAVITY * dt;
      this.vy *= Math.exp(-0.4 * dt);
      if (this.vy < -60) this.vy = -60;
      if (jump && this.onGround && controlsActive) {
        this.vy = JUMP_V * (this.effects.leap ? 1.3 : 1);
        if (this.sprinting) { this.vx += -sy * 1.6; this.vz += -cy * 1.6; this.exhaust(0.2); }
        else this.exhaust(0.05);
        this.game.audio && this.game.audio.step(this, true);
      }
    }
    if (this.inWeb) { this.vy *= 0.2; }

    let dx = this.vx * dt, dy = this.vy * dt, dz = this.vz * dt;
    // sneak edge protection
    if (this.sneaking && this.onGround && !this.flying) {
      const step = 0.05;
      const test = (ox, oz) => boxCollides(world, this.x - this.hw + ox, this.y - 0.6, this.z - this.hw + oz, this.x + this.hw + ox, this.y - 0.01, this.z + this.hw + oz);
      while (dx !== 0 && !test(dx, 0)) { if (Math.abs(dx) < step) { dx = 0; break; } dx -= Math.sign(dx) * step; }
      while (dz !== 0 && !test(0, dz)) { if (Math.abs(dz) < step) { dz = 0; break; } dz -= Math.sign(dz) * step; }
      while (dx !== 0 && dz !== 0 && !test(dx, dz)) {
        if (Math.abs(dx) < step) dx = 0; else dx -= Math.sign(dx) * step;
        if (Math.abs(dz) < step) dz = 0; else dz -= Math.sign(dz) * step;
      }
    }
    const preY = this.y;
    const r = moveWithStep(world, this, dx, dy, dz, this.onGround && !inWater ? 0.6 : 0);
    this.hitWallX = r.hitX; this.hitWallZ = r.hitZ;
    if (r.hitX) this.vx = 0;
    if (r.hitZ) this.vz = 0;
    if (r.hitY) {
      if (this.vy < 0) this.onGround = true;
      this.vy = 0;
    } else this.onGround = false;
    if (r.stepped) this.onGround = true;
    if (this.onGround && this.flying && !jump) this.flying = false;

    // fall damage
    if (!this.onGround && !inWater && !this.flying && !this.climbing) {
      if (this.y < preY) this.fallDist += preY - this.y;
    }
    if (this.onGround && !this.wasOnGround) {
      if (this.fallDist > 3.2 && !this.creative && !inWater) {
        const below = world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.2), Math.floor(this.z));
        let dmg = Math.ceil(this.fallDist - 3);
        if (below === B.hay_bale) dmg = Math.floor(dmg * 0.2);
        if (dmg > 0) this.damage(dmg, 'fall');
      }
      if (this.fallDist > 1.5) this.game.onLand && this.game.onLand(this, this.fallDist);
      this.fallDist = 0;
    }
    if (inWater || this.flying) this.fallDist = 0;

    // walking distance (bob + footsteps)
    const moved = Math.hypot(this.x - (this._lx ?? this.x), this.z - (this._lz ?? this.z));
    this._lx = this.x; this._lz = this.z;
    if (this.onGround && !this.flying) {
      this.walkDist += moved;
      this.stepSoundDist += moved;
      if (this.stepSoundDist > (this.sprinting ? 2.0 : 1.7)) { this.stepSoundDist = 0; this.game.audio && this.game.audio.step(this, false); }
      this.exhaust(moved * (this.sprinting ? 0.1 : 0.02));   // walking makes you hungry too, sprinting much more
    } else if (inWater) this.exhaust(moved * 0.015);
    const targetBob = this.onGround && !this.flying ? Math.min(1, Math.hypot(this.vx, this.vz) / 4.3) : 0;
    this.bobAmt += (targetBob - this.bobAmt) * Math.min(1, dt * 10);
    this.bobPhase = this.walkDist * Math.PI / 1.4;

    // eye height
    const targetEye = this.sneaking ? 1.32 : 1.62;
    this.eyeCur += (targetEye - this.eyeCur) * Math.min(1, dt * 14);

    // void
    if (this.y < -32) this.damage(4, 'void', true);
    if (this.y > HEIGHT + 64) this.y = HEIGHT + 64;
  }

  // ---------- survival ----------
  exhaust(v) { if (!this.creative) this.exhaustion += v; }

  updateSurvival(dt) {
    if (this.dead) return;
    for (const k in this.effects) { this.effects[k] -= dt; if (this.effects[k] <= 0) delete this.effects[k]; }
    if (this.hurtTime > 0) this.hurtTime -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.creative) { this.health = this.maxHealth; this.food = 20; this.air = this.maxAir; return; }
    // hunger: a steady drain on top of what you do (a full bar lasts roughly half an hour of ordinary play)
    this.exhaust(dt * 0.03);
    while (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else this.food = Math.max(0, this.food - 1);
    }
    // regen / starvation
    if (this.food >= 18 && this.health < this.maxHealth) {
      this.regenTimer += dt;
      const interval = this.food === 20 && this.saturation > 0 ? 0.5 : 4;
      if (this.regenTimer >= interval) {
        this.regenTimer = 0;
        this.heal(1);
        this.exhaustion += interval < 1 ? Math.min(6, this.saturation) * 0.5 + 1 : 6;
      }
    } else if (this.food <= 0) {
      this.starveTimer += dt;
      if (this.starveTimer >= 4) { this.starveTimer = 0; if (this.health > 1) this.damage(1, 'starve', true); }
    } else this.regenTimer = 0;
    // poison
    if (this.effects.poison) {
      this._poisonT = (this._poisonT || 0) + dt;
      if (this._poisonT >= 1.25) { this._poisonT = 0; if (this.health > 1) this.damage(1, 'poison', true); }
    }
    if (this.effects.hunger) this.exhaust(dt * 0.5);
    // air
    const bless = this.blessings || [];
    const hasArmor = (k) => this.armor.slots.some(s => s && ITEMS[s.id].armor && ITEMS[s.id].armor[k]);
    if ((bless.includes('frost_wyrm') || hasArmor('warm')) && this.effects.slow) delete this.effects.slow;
    if (bless.includes('forest_warden') || hasArmor('regen')) {
      this._mendT = (this._mendT || 0) + dt;
      if (this._mendT >= (hasArmor('regen') && bless.includes('forest_warden') ? 4 : 7)) { this._mendT = 0; if (this.health < this.maxHealth && this.food > 6) this.heal(1); }
    }
    if (this.liquid.eyeInWater && !this.effects.waterbreath) {
      this.air -= dt * (bless.includes('frost_wyrm') ? 10 : 20);
      if (this.air <= 0) {
        this.air = 0;
        this.drownTimer += dt;
        if (this.drownTimer >= 1) { this.drownTimer = 0; this.damage(2, 'drown', true); }
      }
    } else this.air = Math.min(this.maxAir, this.air + dt * 60);
    // lava & fire
    if (this.liquid.lava) {
      this.fireTime = 8;
      this.lavaTimer += dt;
      if (this.lavaTimer >= 0.5) { this.lavaTimer = 0; this.damage(4, 'lava'); }
    }
    const fireImmune = this.armor.slots.some(s => s && ITEMS[s.id].armor && ITEMS[s.id].armor.fireRes) && this.armor.slots.filter(Boolean).length === 4;
    if (this.fireTime > 0) {
      if (this.liquid.inWater) this.fireTime = 0;
      this.fireTime -= dt;
      this._fireTick = (this._fireTick || 0) + dt;
      if (this._fireTick >= 1) { this._fireTick = 0; if (!fireImmune) this.damage(1, 'fire', true); }
    }
    // standing in fire/cactus
    const w = this.game.world;
    const feet = w.getBlock(Math.floor(this.x), Math.floor(this.y + 0.1), Math.floor(this.z));
    if (feet === B.fire || feet === B.campfire) this.fireTime = Math.max(this.fireTime, 4);
    // cactus contact
    for (const [ox, oz] of [[0.35, 0], [-0.35, 0], [0, 0.35], [0, -0.35]]) {
      if (w.getBlock(Math.floor(this.x + ox), Math.floor(this.y + 0.5), Math.floor(this.z + oz)) === B.cactus) { this.damage(1, 'cactus'); break; }
    }
  }

  heal(n) { if (!this.dead) this.health = Math.min(this.maxHealth, this.health + n); }

  // returns true if damage applied
  damage(amount, cause = 'generic', bypassArmor = false, source = null) {
    if (this.dead || this.creative && cause !== 'void') return false;
    if (this.game.tryBlock && this.game.tryBlock(amount, cause, source)) return false;   // caught on a raised shield
    if (this.invuln > 0 && cause !== 'void' && cause !== 'starve' && cause !== 'drown') {
      if (amount <= this.lastDamage) return false;
      amount -= this.lastDamage;
    } else this.lastDamage = amount;
    if (this.effects.fireres && (cause === 'fire' || cause === 'lava')) return false;
    let dmg = amount;
    if ((cause === 'fire' || cause === 'lava') && ((this.blessings || []).includes('volcanic_behemoth') || this.armor.slots.some(s => s && ITEMS[s.id].armor && ITEMS[s.id].armor.emberHalf))) dmg *= 0.5;
    if (cause === 'mob' || cause === 'explosion') dmg *= ({ peaceful: 0.5, easy: 0.6, normal: 1, hard: 1.4 })[this.game.settings.difficulty] ?? 1;
    if (cause === 'fall') dmg *= 1 - Math.min(0.6, enchLevel(this.armor.slots[3], 'feather') * 0.15);
    if (!bypassArmor && cause !== 'fall') {
      const pts = this.armorPoints();
      let tough = 0;
      for (const s of this.armor.slots) if (s && ITEMS[s.id].armor) tough += ITEMS[s.id].armor.tough;
      const red = Math.min(20, Math.max(pts / 5, pts - dmg / (2 + tough / 4))) / 25;
      dmg *= 1 - red;
      // Warding enchantment
      let prot = 0;
      for (const s of this.armor.slots) prot += enchLevel(s, 'protection');
      dmg *= 1 - Math.min(0.64, prot * 0.04);
      // wear armor
      for (let i = 0; i < 4; i++) {
        const s = this.armor.slots[i];
        if (!s) continue;
        const unb = enchLevel(s, 'unbreaking');
        if (unb && Math.random() < unb / (unb + 1)) continue;
        s.dmg = (s.dmg || 0) + Math.max(1, Math.floor(amount / 4));
        if (s.dmg >= ITEMS[s.id].armor.dur) { this.armor.slots[i] = null; this.game.audio && this.game.audio.play('break_tool'); }
      }
      this.armor.changed();
    }
    if (this.effects.resist) dmg *= 0.6;
    this.health -= dmg;
    this.hurtTime = 0.5;
    this.invuln = 0.5;
    this.exhaust(0.1);
    this.game.onPlayerHurt && this.game.onPlayerHurt(dmg, cause, source);
    if (this.health <= 0) { this.health = 0; this.die(cause, source); }
    return true;
  }

  die(cause, source) {
    if (this.dead) return;
    this.dead = true;
    this.game.onPlayerDeath && this.game.onPlayerDeath(cause, source);
  }

  respawn(pos) {
    this.dead = false;
    this.health = this.maxHealth; this.food = 20; this.saturation = 5; this.exhaustion = 0; this.air = this.maxAir;
    this.fireTime = 0; this.fallDist = 0; this.vx = this.vy = this.vz = 0;
    this.effects = {};
    this.x = pos[0]; this.y = pos[1]; this.z = pos[2];
  }

  eat(item) {
    const f = ITEMS[item].food;
    if (!f) return false;
    this.food = Math.min(20, this.food + f[0]);
    this.saturation = Math.min(this.food, this.saturation + f[0] * f[1] * 0.5 / 2 + f[1]);
    if (ITEMS[item].poison && Math.random() < ITEMS[item].poison) this.effects.hunger = 15;
    return true;
  }

  serialize() {
    return {
      x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: this.pitch,
      health: this.health, food: this.food, saturation: this.saturation, air: this.air,
      inventory: this.inventory.toJSON(), armor: this.armor.toJSON(), selected: this.selected,
      gamemode: this.gamemode, spawn: this.spawn, flying: this.flying, xp: this.xp, effects: this.effects, blessings: this.blessings || [],
      journey: this.journey || null,
      offhand: this.offhand.toJSON(),
      seen: this.seenItems ? [...this.seenItems].map(id => ITEMS[id] ? ITEMS[id].name : null).filter(Boolean) : null,
      riding: this.riding && this.riding.persistent === true ? { kind: this.riding.kind || this.riding.type, x: this.riding.x, y: this.riding.y, z: this.riding.z } : null,
    };
  }
  load(d) {
    if (!d) return;
    this.x = d.x; this.y = d.y; this.z = d.z; this.yaw = d.yaw || 0; this.pitch = d.pitch || 0;
    this.health = d.health ?? 20; this.food = d.food ?? 20; this.saturation = d.saturation ?? 5; this.air = d.air ?? 300;
    this.inventory.load(d.inventory); this.armor.load(d.armor);
    this.selected = d.selected || 0;
    this.gamemode = d.gamemode || 'survival';
    this.spawn = d.spawn || null;
    this.flying = !!d.flying;
    this.xp = d.xp || 0;
    this.effects = d.effects || {};
    this.blessings = d.blessings || [];
    this.journey = d.journey || null;
    this.offhand.clear(); if (d.offhand) this.offhand.load(d.offhand);
    this.seenItems = d.seen ? new Set(d.seen.map(n => I[n]).filter(id => id !== undefined)) : null;
    this._recipesOpen = null;
    this.maxHealth = 20 + (this.blessings.includes('woolly_mammoth') ? 4 : 0);
    if (this.health <= 0) this.health = 20;
    // the mount is restored with its chunk a moment later; hold the player in place until it can be remounted
    this._remount = d.riding ? Object.assign({ px: this.x, py: this.y, pz: this.z, t: 0 }, d.riding) : null;
  }
}

export { IS_LIQUID };
