// Mobs: AI, physics, rendering, interaction, spawning and persistence.
import { Entity } from '../game/entities.js';
import { moveEntity, liquidState } from '../game/physics.js';
import { mat4 } from '../core/math.js';
import { MOBS, ANIMAL_SPAWNS, NIGHT_SPAWNS, DAY_SPAWNS, CAVE_SPAWNS, WATER_BIOMES } from './defs.js';
import { ANIMS } from './anim.js';
import { MODELS, PAT } from './models.js';
import { ITEMS, I } from '../game/items.js';
import { BLOCKS, B, IS_LIQUID, IS_OPAQUE } from '../world/blocks.js';
import { SEA, HEIGHT } from '../world/constants.js';
import { BIOME } from '../world/biomes.js';

const TMP = mat4.create();
let MOB_SEQ = 1;
export const MOB_CLASSES = {};
export function createMob(game, kind, x, y, z, opts) { const C = MOB_CLASSES[kind] || Mob; return new C(game, kind, x, y, z, opts); }

// ---------------------------------------------------------------- variants (recoloured model copies)
const VARIANT_CACHE = new Map();
function hexToRgb(h) { const v = parseInt(h.slice(1), 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; }
function near(a, b) { return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 0.02; }
export function variantModel(base, key, swaps) {
  const k = key;
  let m = VARIANT_CACHE.get(k);
  if (m) return m;
  const sw = swaps.map(([a, b]) => [hexToRgb(a), hexToRgb(b)]);
  m = Object.assign({}, base, {
    parts: base.parts.map(p => Object.assign({}, p, {
      boxes: p.boxes.map(bx => {
        const n = Object.assign({}, bx);
        for (const [from, to] of sw) { if (near(bx.c, from)) n.c = to; if (near(bx.c2, from)) n.c2 = to; }
        return n;
      }),
    })),
  });
  VARIANT_CACHE.set(k, m);
  return m;
}

const VARIANTS = {
  cow: [['brown', []], ['holstein', [['#5c3e28', '#1e1c1e']]], ['red', [['#5c3e28', '#8a3a1e']]], ['dun', [['#5c3e28', '#a8885a'], ['#efe8dc', '#f4ecd8']]]],
  deer: [['stag', []], ['doe', []]],
  pig: [['pink', []], ['spotted', [['#e8a3a2', '#f0b8b0'], ['#d88a8c', '#5a3a30']]]],
  horse: [
    ['chestnut', []],
    ['bay', [['#7a4a26', '#5a3418'], ['#2e1e12', '#141010']]],
    ['black', [['#7a4a26', '#262220'], ['#5a3418', '#1a1816'], ['#2e1e12', '#101010']]],
    ['white', [['#7a4a26', '#e6e0d6'], ['#5a3418', '#c8c0b4'], ['#2e1e12', '#b8b0a4']]],
    ['palomino', [['#7a4a26', '#c8a060'], ['#5a3418', '#a88040'], ['#2e1e12', '#f0e8d0']]],
  ],
  cat: [['orange', []], ['black', [['#d8892e', '#26242a'], ['#a85a1a', '#18161c'], ['#f0c08a', '#3a3640']]], ['gray', [['#d8892e', '#8a8a90'], ['#a85a1a', '#5a5a62'], ['#f0c08a', '#c8c8cc']]], ['white', [['#d8892e', '#f0eeea'], ['#a85a1a', '#d8d4cc']]]],
  rabbit: [['brown', []], ['white', [['#8a6a4a', '#f2f0ec'], ['#a88a6a', '#ffffff']]], ['gold', [['#8a6a4a', '#d0a860'], ['#a88a6a', '#e8c880']]]],
  fish: [['cod', []], ['salmon', [['#c8a06a', '#c8584a'], ['#a8804a', '#a03a32']]], ['tropical', [['#c8a06a', '#f0c020'], ['#a8804a', '#2a5ad8']]], ['moonfin', [['#c8a06a', '#a8b8d8'], ['#a8804a', '#6a7aa8']]]],
  sheep: [['white', []], ['gray', [['#efe9df', '#8a8a88'], ['#d8d0c4', '#6a6a68']]], ['black', [['#efe9df', '#2a2828'], ['#d8d0c4', '#1a1818']]], ['brown', [['#efe9df', '#7a5a3a'], ['#d8d0c4', '#5a4028']]]],
  wolf: [['gray', []], ['snow', [['#8c8c8a', '#e8e8ec'], ['#7c7c7a', '#d8d8e0']]], ['dark', [['#8c8c8a', '#3a3632'], ['#7c7c7a', '#2a2622']]]],
};
const SHEEP_WOOL = { white: B.wool_white, gray: B.wool_gray, black: B.wool_black, brown: B.wool_brown };

// ---------------------------------------------------------------- Mob
export class Mob extends Entity {
  constructor(game, kind, x, y, z, opts = {}) {
    super(game, x, y, z);
    const def = this.def = MOBS[kind];
    this.type = 'mob';
    this.kind = kind;
    this.mid = MOB_SEQ++;
    this.hw = def.size[0] / 2; this.h = def.size[1];
    this.baby = !!opts.baby;
    this.growT = this.baby ? 240 : 0;
    if (this.baby) { this.hw *= 0.55; this.h *= 0.55; }
    this.hp = opts.hp ?? def.hp;
    this.hittable = true; this.solidBody = true;
    this.persistent = def.type !== 'hostile' && def.type !== 'ambient' && def.type !== 'water';
    if (opts.persistent) this.persistent = true;
    this.yaw = opts.yaw ?? Math.random() * Math.PI * 2;
    this.bodyYaw = this.yaw;
    this.headYaw = 0; this.headPitch = 0;
    this.walkPhase = Math.random() * 10; this.walkAmt = 0;
    this.state = 'idle'; this.stateT = 1 + Math.random() * 3;
    this.goal = null; this.target = null;
    this.attackCD = 0; this.attackAnim = 0; this.hurtT = 0; this.deathT = -1;
    this.fleeT = 0; this.fleeFrom = null;
    this.grazeT = 0; this.grazeMax = 2;
    this.loveT = 0; this.breedCD = 0;
    this.tamed = !!opts.tamed; this.owner = opts.owner || null; this.sitting = !!opts.sitting;
    this.saddled = !!opts.saddled; this.sheared = !!opts.sheared;
    this.angryT = 0;
    this.variant = opts.variant ?? this.pickVariant();
    this.idleT = Math.random() * 10;
    this.fireT = 0;
    this.sleeping = false;
    this.layT = 120 + Math.random() * 300;
    this.home = opts.home || null;
    this.seeT = Math.random();
    this.stuckT = 0;
    this.lastPos = [x, z];
    this.setModel();
    this.pose = this.model.parts.map(() => [0, 0, 0, 0, 0, 0]);
  }

  pickVariant() {
    const v = VARIANTS[this.kind];
    if (!v) return 0;
    if (this.kind === 'sheep') { const r = Math.random(); return r < 0.8 ? 0 : r < 0.9 ? 1 : r < 0.95 ? 2 : 3; }
    if (this.kind === 'rabbit') {
      const b = this.game.world.biomeAt(this.x, this.z);
      return b === BIOME.TUNDRA || b === BIOME.SNOWY_TAIGA ? 1 : b === BIOME.DESERT ? 2 : 0;
    }
    if (this.kind === 'wolf') {
      const b = this.game.world.biomeAt(this.x, this.z);
      return b === BIOME.SNOWY_TAIGA || b === BIOME.TUNDRA ? 1 : Math.random() < 0.2 ? 2 : 0;
    }
    return Math.floor(Math.random() * v.length);
  }

  setModel() {
    let m = this.def.model;
    const v = VARIANTS[this.kind];
    if (v && v[this.variant]) {
      const [name, swaps] = v[this.variant];
      if (MODELS[this.kind + '_' + name]) m = MODELS[this.kind + '_' + name];
      if (swaps.length) m = variantModel(m, this.kind + ':' + name, swaps);
    }
    if (this.kind === 'sheep' && this.sheared) m = variantModel(m, 'sheep:sheared', [['#efe9df', '#d8c4b0'], ['#d8d0c4', '#c8b4a0'], ['#8a8a88', '#d8c4b0'], ['#2a2828', '#d8c4b0'], ['#7a5a3a', '#d8c4b0']]);
    this.model = m;
  }

  get name() { return this.def.name; }
  get isHostile() { return this.def.type === 'hostile' || (this.def.type === 'neutral' && this.angryT > 0); }

  // ---------------------------------------------------------------- damage
  hurt(amount, src = {}) {
    if (this.deathT >= 0 || this.hurtT > 0.35) return false;
    const g = this.game;
    if (src.type === 'fire' && this.def.fireImmune) return false;
    this.hp -= amount;
    this.hurtT = 0.5;
    if (g.hurtFX) g.hurtFX(this, amount, src);
    { const hd = src.dir || (src.entity ? [this.x - src.entity.x, 0, this.z - src.entity.z] : null); if (hd) { const l = Math.hypot(hd[0], hd[2]) || 1; this.hurtDir = [hd[0] / l, hd[2] / l]; } }
    const snd = this.def.sounds.hurt;
    if (snd) g.audio.mob(snd, this, this.baby ? 1.4 : (this.def.scaleSound || 1));
    g.audio.play('hit', this);
    const attacker = src.entity;
    if (src.dir || attacker) {
      let dx, dz;
      if (src.dir) { dx = src.dir[0]; dz = src.dir[2]; } else { dx = this.x - attacker.x; dz = this.z - attacker.z; }
      const l = Math.hypot(dx, dz) || 1;
      const k = (src.knock ?? 1) * 5.5 * (1 - this.def.knockRes);
      this.vx += dx / l * k; this.vz += dz / l * k;
      if (this.onGround) this.vy = Math.max(this.vy, 5 * (1 - this.def.knockRes));
    }
    if (attacker) {
      if (this.def.type === 'animal' || this.def.type === 'ambient') { this.fleeT = 5; this.fleeFrom = attacker; }
      else if (this.def.type === 'neutral') { this.angryT = 30; this.target = attacker; if (this.def.pack) this.alertPack(attacker); }
      else this.target = attacker;
      if (this.tamed && attacker === g.player) { /* owner slap: no anger */ this.target = null; this.angryT = 0; }
    }
    if (this.def.teleports && Math.random() < 0.6) this.teleport();
    if (this.rider && this.rider === g.player && Math.random() < 0.3) this.dismount();
    if (this.hp <= 0) this.die(src);
    return true;
  }

  alertPack(attacker) {
    for (const e of this.game.entities.list) {
      if (e !== this && e.kind === this.kind && !e.tamed && e.distTo(this.x, this.y, this.z) < 16) { e.angryT = 30; e.target = attacker; }
    }
  }

  die(src) {
    if (this.deathT >= 0) return;
    this.deathT = 0;
    this.hp = 0;
    const g = this.game;
    const snd = this.def.sounds.death;
    if (snd) g.audio.mob(snd, this, this.baby ? 1.4 : (this.def.scaleSound || 1));
    if (this.rider) this.dismount();
    g.deathFX && g.deathFX(this, src);
    if (!this.baby) {
      for (const [item, min, max, chance] of this.def.drops) {
        if (chance !== undefined && Math.random() > chance) continue;
        const n = min + Math.floor(Math.random() * (max - min + 1));
        let id = I[item];
        if (this.fireT > 0 && ITEMS[id]) { const cooked = { raw_beef: 'steak', raw_pork: 'cooked_pork', raw_mutton: 'cooked_mutton', raw_chicken: 'cooked_chicken', raw_venison: 'cooked_venison', raw_fish: 'cooked_fish' }[item]; if (cooked) id = I[cooked]; }
        if (n > 0 && id !== undefined) { if (this.isBoss && g.dropBossLoot) g.dropBossLoot(this.x, this.y + 0.5, this.z, id, n); else g.entities.dropItem(this.x, this.y + 0.5, this.z, id, n); }
      }
      if (this.kind === 'sheep' && !this.sheared) g.entities.dropItem(this.x, this.y + 0.5, this.z, SHEEP_WOOL[VARIANTS.sheep[this.variant][0]], 1);
      if (this.saddled) g.entities.dropItem(this.x, this.y + 0.5, this.z, I.saddle, 1);
    }
    if (src.entity === g.player) { if (g.dropXP) g.dropXP(this.x, this.y + this.h * 0.5, this.z, this.def.xp); else g.player.xp += this.def.xp; g.onMobKilled && g.onMobKilled(this); }
    this.persistent = false;
  }

  teleport() {
    const w = this.game.world;
    for (let k = 0; k < 12; k++) {
      const x = this.x + (Math.random() - 0.5) * 16, z = this.z + (Math.random() - 0.5) * 16;
      const top = this.game.surfaceAt(x, z);
      if (Math.abs(top - this.y) > 10) continue;
      const id = w.getBlock(Math.floor(x), top - 1, Math.floor(z));
      if (IS_LIQUID[id]) continue;
      this.game.particles.sparkle(this.x, this.y + 1, this.z, [0.6, 0.2, 0.9], 14);
      this.x = x; this.z = z; this.y = top;
      this.game.particles.sparkle(this.x, this.y + 1, this.z, [0.6, 0.2, 0.9], 14);
      this.game.audio.play('magic', this);
      return;
    }
  }

  // ---------------------------------------------------------------- interaction (right click)
  interact(player, held) {
    const g = this.game;
    const it = held ? ITEMS[held.id] : null;
    const def = this.def;
    if (this.deathT >= 0) return false;
    if (g.villagerInteract && this.isVillager) return g.villagerInteract(this, player, held);
    // milk
    if (def.milk && it && it.name === 'bucket') {
      g.interaction.consumeHeld(); g.giveItem(I.milk_bucket, 1); g.audio.play('bucket_fill', this); return true;
    }
    // shear
    if (def.wool && it && it.name === 'shears' && !this.sheared && !this.baby) {
      this.sheared = true; this.setModel();
      const n = 1 + Math.floor(Math.random() * 3);
      g.entities.dropItem(this.x, this.y + 1, this.z, SHEEP_WOOL[VARIANTS.sheep[this.variant][0]], n);
      g.interaction.damageHeld(1); g.audio.blockSound(B.wool_white, 'break', this.x, this.y, this.z);
      return true;
    }
    // taming
    if (def.tame && !this.tamed && it && def.tame.item && it.name === def.tame.item) {
      g.interaction.consumeHeld();
      if (Math.random() < def.tame.chance) {
        this.tamed = true; this.owner = 'player'; this.persistent = true; this.angryT = 0; this.target = null;
        g.particles.hearts(this.x, this.y + this.h, this.z);
        g.ui.chat(`You tamed a ${def.name}!`, '#7f7');
      } else g.particles.smoke(this.x, this.y + this.h, this.z, 4, 0.7);
      return true;
    }
    // saddle a tamed horse
    if (def.rideable && this.tamed && !this.saddled && it && it.name === 'saddle') {
      this.saddled = true; g.interaction.consumeHeld(); g.audio.play('craft'); return true;
    }
    // feeding / breeding / growth
    if (it && def.food.includes(it.name)) {
      if (this.baby) { this.growT -= 30; g.interaction.consumeHeld(); g.particles.sparkle(this.x, this.y + this.h, this.z, [0.6, 1, 0.5], 5); return true; }
      if (this.hp < def.hp && (this.tamed || def.rideable)) { this.hp = Math.min(def.hp, this.hp + 4); g.interaction.consumeHeld(); g.particles.hearts(this.x, this.y + this.h, this.z); return true; }
      if (this.breedCD <= 0 && this.loveT <= 0) {
        this.loveT = 30; g.interaction.consumeHeld(); g.particles.hearts(this.x, this.y + this.h, this.z);
        if (def.rideable && !this.tamed && Math.random() < 0.15) { this.tamed = true; g.ui.chat(`The ${def.name.toLowerCase()} trusts you now. Try a saddle!`, '#7f7'); }
        return true;
      }
      return false;
    }
    // sit toggle for tamed pets
    if (this.tamed && (this.kind === 'wolf' || this.kind === 'cat') && !it) { this.sitting = !this.sitting; this.goal = null; return true; }
    // ride horses
    if (def.rideable && !this.baby && !player.sneaking) {
      if (this.tamed && !this.saddled && !it) { g.ui.chat(`This ${def.name.toLowerCase()} needs a saddle.`, '#ccc'); return true; }
      this.mount(player);
      return true;
    }
    return false;
  }

  mount(player) {
    this.rider = player; player.riding = this;
    this.goal = null; this.target = null;
    if (!this.tamed) { this.taming = 2 + Math.random() * 4; }
  }
  dismount() {
    const p = this.rider;
    if (!p) return;
    p.riding = null; this.rider = null; this.jumpCharge = 0;
    this.game.ui.jumpBar && this.game.ui.jumpBar(-1);
    // step off to the left, then the right, behind, in front; if all are walled in, stand on the horse's back
    const w = this.game.world, cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const spots = [[-cy, sy], [cy, -sy], [sy, cy], [-sy, -cy]];
    const free = (x, y, z) => { for (let k = 0; k < 2; k++) { const id = w.getBlock(Math.floor(x), Math.floor(y) + k, Math.floor(z)); if (id && BLOCKS[id].solid) return false; } return true; };
    let placed = false;
    for (const [dx, dz] of spots) {
      for (const dy of [0, 1]) {
        const x = this.x + dx * 1.25, z = this.z + dz * 1.25, y = Math.floor(this.y) + dy;
        if (free(x, y, z) && free(x - 0.3, y, z - 0.3) && free(x + 0.3, y, z + 0.3)) { p.x = x; p.z = z; p.y = y + 0.01; placed = true; break; }
      }
      if (placed) break;
    }
    if (!placed) { p.x = this.x; p.z = this.z; p.y = this.y + this.h + 0.05; }
    p.vx = p.vz = 0; p.vy = 0; p.fallDist = 0;
  }

  // called from Game when the player rides this mob
  controlRide(dt, input, active) {
    const p = this.rider;
    if (!p) return;
    if (this.taming > 0) {
      this.taming -= dt;
      this.rearing = Math.max(this.rearing || 0, Math.abs(Math.sin(this.age * 6)) * 0.8);
      this.yaw += Math.sin(this.age * 5) * dt * 3;
      if (this.taming <= 0) {
        if (Math.random() < this.def.tame.chance) { this.tamed = true; this.persistent = true; this.game.particles.hearts(this.x, this.y + 1.8, this.z); this.game.ui.chat(`The ${this.def.name.toLowerCase()} is tamed! Give it a saddle to ride.`, '#7f7'); }
        else { this.game.audio.mob('neigh', this); }
        this.rearing = 0;
        this.dismount();
        return;
      }
    } else if (!this.saddled) { this.dismount(); return; }
    const g = this.game;
    let fwd = 0, str = 0;
    if (active) {
      if (input.is('forward')) fwd += 1; if (input.is('back')) fwd -= 0.35;
      if (input.is('left')) str -= 1; if (input.is('right')) str += 1;
      if (input.was('sneak')) { this.dismount(); return; }
      // jump: hold Space to gather, let go to leap (a tap is a small hop)
      const ready = this.onGround && !this.taming && !(this.liquid && this.liquid.inWater);
      if (input.is('jump') && ready) {
        this.jumpCharge = Math.min(1, (this.jumpCharge || 0) + dt / 0.65);
        g.ui.jumpBar && g.ui.jumpBar(this.jumpCharge);
      } else if (this.jumpCharge > 0) {
        if (ready) {
          const c = Math.max(0.35, this.jumpCharge);
          this.vy = (7.2 + 6.3 * c) * (this.def.jumpPower || 1);   // about one block for a tap, nearly three when fully gathered
          const sy0 = Math.sin(this.yaw), cy0 = Math.cos(this.yaw);
          this.vx -= sy0 * 2.2 * c; this.vz -= cy0 * 2.2 * c;
          this.onGround = false; this.airT = 0;
          g.audio.play('horse_jump', this);
          if (Math.random() < 0.4) g.audio.mob('neigh', this, 1);
        }
        this.jumpCharge = 0;
        g.ui.jumpBar && g.ui.jumpBar(-1);
      }
    }
    // the horse turns towards where you look, quickly but not instantly
    let dyaw = p.yaw - this.yaw; while (dyaw > Math.PI) dyaw -= Math.PI * 2; while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.yaw += dyaw * Math.min(1, dt * (this.onGround ? 9 : 4));
    // gaits: walk (backing up), canter, gallop (sprint)
    const gallop = input.is('sprint') && fwd > 0;
    const RS = this.def.rideSpeed || [7, 11];   // [canter, gallop]
    const sp = (fwd < 0 ? 2.6 : gallop ? RS[1] : RS[0]) * (this.taming > 0 ? 0 : 1) * (this.def.sandSpeed && this.onSand ? 1.2 : 1);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const tx = (-sy * fwd + cy * str * 0.35) * sp, tz = (-cy * fwd - sy * str * 0.35) * sp;
    const k = 1 - Math.exp(-dt * (this.onGround ? (fwd ? 3.2 : 5) : 0.6));
    this.vx += (tx - this.vx) * k; this.vz += (tz - this.vz) * k;
    const wasGround = this.onGround, vy0 = this.vy;
    this.physicsStep(dt, true);
    this.airT = this.onGround ? 0 : (this.airT || 0) + dt;
    if (this.def.sandSpeed) { const fb = this.game.world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.1), Math.floor(this.z)); this.onSand = fb === B.sand || fb === B.red_sand || fb === B.sandstone; }
    if (this.onGround && !wasGround && vy0 < -4) {
      // landing: dust, a heavy double thud, a dip in the stride
      this.landT = 1;
      g.audio.play('horse_land', this);
      g.camShake = Math.max(g.camShake || 0, Math.min(0.2, -vy0 * 0.012));
      for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2; g.particles.add({ x: this.x + Math.cos(a) * 0.5, y: this.y + 0.1, z: this.z + Math.sin(a) * 0.7, vx: Math.cos(a) * 2.2, vy: 0.3 + Math.random() * 0.8, vz: Math.sin(a) * 2.2, size: 0.16, size0: 0.16, grow: 2, r: 0.62, g: 0.56, b: 0.46, a: 0.45, a0: 0.45, fade: true, layer: -1, life: 0.7, drag: 3, light: g.particles.lightAt(this.x, this.y + 0.5, this.z) }); }
    }
    if (this.landT > 0) this.landT = Math.max(0, this.landT - dt * 3);
    // hoof beats follow the stride
    const spd = Math.hypot(this.vx, this.vz);
    if (this.onGround && spd > 0.6) {
      const beats = Math.floor(this.walkPhase / Math.PI * (spd > 8 ? 2 : 1));
      if (beats !== this._beat) { this._beat = beats; g.audio.play('hoof', { x: this.x, y: this.y, z: this.z, gallop: spd > 8, surf: g.world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.1), Math.floor(this.z)) }); }
    }
    // sit in the saddle (its position comes from last frame's animated body, so the rider rides the gait)
    const so = this.seatOff || null;
    const seat = so ? [this.x + so[0], this.y + so[1], this.z + so[2]] : null;
    const want = seat ? seat[1] - 0.55 : this.y + 1.1;
    p.y = p.riding === this && Math.abs((p._seatY ?? want) - want) < 1 ? p._seatY + (want - p._seatY) * Math.min(1, dt * 25) : want;
    p._seatY = p.y;
    p.x = seat ? seat[0] : this.x; p.z = seat ? seat[2] : this.z;
    p.vx = this.vx; p.vy = 0; p.vz = this.vz; p.fallDist = 0;
    p.onGround = true;
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    const g = this.game, def = this.def;
    this.age += dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.attackCD > 0) this.attackCD -= dt;
    if (this.attackAnim > 0) this.attackAnim = Math.max(0, this.attackAnim - dt * 3);
    if (this.deathT >= 0) {
      this.deathT += dt;
      this.physicsStep(dt, false);
      if (this.deathT > 1.0) { this.dead = true; g.particles.poof(this.x, this.y, this.z, 12); }
      return;
    }
    if (this.baby && this.growT > 0) { this.growT -= dt; if (this.growT <= 0) { this.baby = false; this.hw = def.size[0] / 2; this.h = def.size[1]; } }
    if (this.loveT > 0) { this.loveT -= dt; if (Math.random() < dt * 2) g.particles.hearts(this.x, this.y + this.h, this.z); }
    if (this.breedCD > 0) this.breedCD -= dt;
    if (this.angryT > 0) { this.angryT -= dt; if (this.angryT <= 0) this.target = null; }
    if (this.rider) { this.updateAnim(dt); return; }

    // environment
    const liq = liquidState(g.world, this, this.h * 0.8);
    this.liquid = liq;
    if (liq.lava && !def.fireImmune) { this.fireT = 6; if (this.age % 0.5 < dt) this.hurt(4, { type: 'fire' }); }
    if (this.fireT > 0) {
      this.fireT -= dt;
      if (liq.inWater) this.fireT = 0;
      if ((this.age * 2 | 0) !== ((this.age - dt) * 2 | 0)) { this.hurtT = 0; this.hurt(1, { type: 'fire' }); }
      if (Math.random() < dt * 20) g.particles.flame(this.x + (Math.random() - 0.5) * this.hw * 2, this.y + Math.random() * this.h, this.z + (Math.random() - 0.5) * this.hw * 2);
    }
    if (def.burnsInDay && g.isDay && g.dayTime > 0.27 && g.dayTime < 0.73 && g.weather.localRain < 0.1 && !liq.inWater) {
      if (g.world.skyLight(this.x, this.y + this.h, this.z) >= 14 && Math.random() < dt * 0.5) this.fireT = Math.max(this.fireT, 4);
    }
    if (def.aquatic && !liq.inWater) {
      this.flop = true;
      if ((this.age * 2 | 0) !== ((this.age - dt) * 2 | 0)) { this.hurtT = 0; this.hurt(1, {}); }
      if (this.onGround && Math.random() < dt * 3) { this.vy = 4; this.vx = (Math.random() - 0.5) * 3; this.vz = (Math.random() - 0.5) * 3; }
    } else this.flop = false;
    // drowning for non-swimmers (simplified: only very long underwater)
    if (!def.aquatic && liq.eyeInWater && !def.swims) { this.airT = (this.airT || 0) + dt; if (this.airT > 15 && (this.age | 0) !== ((this.age - dt) | 0)) this.hurt(2, {}); } else this.airT = 0;

    // staggered by a heavy blow: no thinking, just tumble
    if (this.staggerT > 0) { this.staggerT -= dt; this.mx = this.mz = 0; this.physicsStep(dt, false); this.updateAnim(dt); return; }
    // ambient aura (shadow wisps, frost motes, embers)
    if (def.aura && Math.random() < dt * def.aura.rate) {
      const ax = this.x + (Math.random() - 0.5) * this.hw * 2.4, ay = this.y + Math.random() * this.h, az = this.z + (Math.random() - 0.5) * this.hw * 2.4;
      if (def.aura.ember) g.particles.ember(ax, ay, az, 0.6);
      else { const c = def.aura.col; g.particles.add({ x: ax, y: ay, z: az, vx: (Math.random() - 0.5) * 0.3, vy: 0.3 + Math.random() * 0.4, vz: (Math.random() - 0.5) * 0.3, size: 0.12, size0: 0.12, grow: 1.5, r: c[0], g: c[1], b: c[2], a: 0.55, a0: 0.55, fade: true, layer: -1, life: 1.2, drag: 1, emis: def.aura.glow ? 1.5 : 0, add: !!def.aura.glow, light: g.particles.lightAt(ax, ay, az) }); }
    }
    // wounded monsters get desperate: faster and quicker to strike
    this.enraged = def.type === 'hostile' && this.hp < def.hp * 0.35;
    // brain
    this.mx = 0; this.mz = 0; this.wantSpeed = 0; this.wantJump = false; this.lookAt = null;
    if (def.type === 'hostile' || (def.type === 'neutral' && this.angryT > 0)) this.brainHostile(dt);
    else if (def.aquatic) this.brainFish(dt);
    else if (def.fly && def.type === 'ambient') this.brainBat(dt);
    else this.brainAnimal(dt);

    // movement
    this.move(dt);
    this.updateAnim(dt);
    // idle sounds
    this.idleT -= dt;
    if (this.idleT <= 0) {
      this.idleT = 4 + Math.random() * 10;
      const snd = def.sounds.idle;
      if (snd && Math.random() < def.idleSound * 8 && this.distTo(g.player.x, g.player.y, g.player.z) < 24 && !this.sleeping) g.audio.mob(snd, this, this.baby ? 1.4 : (def.scaleSound || 1));
    }
  }

  // ---------------------------------------------------------------- brains
  brainAnimal(dt) {
    const g = this.game, p = g.player, def = this.def;
    const dp = this.distTo(p.x, p.y, p.z);
    this.stateT -= dt;
    this.sleeping = false;
    // flee
    if (this.fleeT > 0) {
      this.fleeT -= dt;
      const f = this.fleeFrom || p;
      const dx = this.x - f.x, dz = this.z - f.z, l = Math.hypot(dx, dz) || 1;
      this.mx = dx / l; this.mz = dz / l; this.wantSpeed = def.runSpeed;
      return;
    }
    // skittish animals flee from a sprinting / near player
    if (def.skittish && !this.tamed && dp < def.skittish && (p.sprinting || dp < def.skittish * 0.5) && !this.heldFood(p)) { this.fleeT = 3; this.fleeFrom = p; return; }
    // danger: hostile mobs nearby
    if ((this.age * 4 | 0) !== ((this.age - dt) * 4 | 0)) {
      this._danger = null;
      for (const e of g.entities.list) if (e.type === 'mob' && e !== this && e.isHostile && e.deathT < 0 && e.distTo(this.x, this.y, this.z) < 7 && !(this.tamed && this.kind === 'wolf')) { this._danger = e; break; }
    }
    if (this._danger && !this.tamed) { this.fleeT = 3; this.fleeFrom = this._danger; return; }
    // tamed wolves defend owner
    if (this.tamed && this.kind === 'wolf' && !this.sitting) {
      const t = this.target && this.target.deathT < 0 && !this.target.dead ? this.target : (this._danger || null);
      if (t && t.distTo(p.x, p.y, p.z) < 16) {
        this.target = t;
        this.seekTarget(t, def.runSpeed);
        if (this.distTo(t.x, t.y, t.z) < 1.8 && this.attackCD <= 0) { this.attackCD = 1; this.attackAnim = 1; t.hurt(def.attack.dmg, { entity: this, type: 'mob' }); }
        return;
      }
    }
    // follow owner
    if (this.tamed && (this.kind === 'wolf' || this.kind === 'cat') && !this.sitting) {
      if (dp > 24 && g.world.isLoaded(p.x, p.z)) { this.x = p.x + (Math.random() - 0.5) * 2; this.z = p.z + (Math.random() - 0.5) * 2; this.y = p.y; return; }
      if (dp > 4) { this.seekTarget(p, dp > 10 ? def.runSpeed : def.speed * 1.3); this.lookAt = p; return; }
    }
    if (this.sitting) { this.lookAt = dp < 8 ? p : null; return; }
    // love: find partner
    if (this.loveT > 0) {
      let mate = null, md = 9;
      for (const e of g.entities.list) {
        if (e === this || e.kind !== this.kind || e.loveT <= 0 || e.baby || e.deathT >= 0) continue;
        const d = e.distTo(this.x, this.y, this.z);
        if (d < md) { md = d; mate = e; }
      }
      if (mate) {
        this.seekTarget(mate, def.speed);
        if (md < 1.6) {
          this.loveT = 0; mate.loveT = 0; this.breedCD = 300; mate.breedCD = 300;
          const baby = new Mob(g, this.kind, (this.x + mate.x) / 2, this.y, (this.z + mate.z) / 2, { baby: true, variant: Math.random() < 0.5 ? this.variant : mate.variant, tamed: this.tamed && mate.tamed, persistent: true });
          g.entities.add(baby);
          g.particles.hearts(baby.x, baby.y + 0.5, baby.z);
          if (g.dropXP) g.dropXP(baby.x, baby.y + 0.5, baby.z, 3); else p.xp += 2;
        }
        return;
      }
    }
    // tempted by food
    if (dp < 9 && this.heldFood(p)) {
      this.lookAt = p;
      if (dp > 2.2) this.seekTarget(p, def.speed * 1.2);
      return;
    }
    // babies follow parents
    if (this.baby) {
      for (const e of g.entities.list) if (e.kind === this.kind && !e.baby && e.distTo(this.x, this.y, this.z) < 10 && e.distTo(this.x, this.y, this.z) > 3) { this.seekTarget(e, def.speed); return; }
    }
    // sleep at night
    const night = g.dayTime > 0.8 || g.dayTime < 0.2;
    if (def.sleeps && night && dp > 5 && this.onGround) { this.sleeping = true; this.goal = null; return; }
    // grazing
    if (this.grazeT > 0) {
      this.grazeT -= dt;
      if (this.grazeT <= 0 && def.wool && this.sheared) {
        const bx = Math.floor(this.x), by = Math.floor(this.y - 0.5), bz = Math.floor(this.z);
        if (g.world.getBlock(bx, by, bz) === B.grass) { g.world.setBlock(bx, by, bz, B.dirt, 0); this.sheared = false; this.setModel(); }
      }
      return;
    }
    // lay eggs -> chickens drop feathers/eggs (we drop seeds+feather as "nest" bonus)
    if (def.lays) { this.layT -= dt; if (this.layT <= 0) { this.layT = 300 + Math.random() * 300; g.entities.dropItem(this.x, this.y + 0.3, this.z, I.feather, 1); } }
    this.wander(dt, def.speed);
  }

  heldFood(p) {
    const s = p.held();
    return s && this.def.food.includes(ITEMS[s.id].name);
  }

  wander(dt, speed) {
    const def = this.def;
    if (this.stateT <= 0) {
      if (this.state === 'walk' || Math.random() < 0.45) {
        this.state = 'idle'; this.stateT = 2 + Math.random() * 6; this.goal = null;
        if (Math.random() < 0.35 && (def.type === 'animal')) { this.grazeT = this.grazeMax = 1.5 + Math.random() * 2; }
      } else {
        const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 8;
        this.goal = [this.x + Math.cos(a) * r, this.z + Math.sin(a) * r];
        if (this.home && Math.hypot(this.goal[0] - this.home[0], this.goal[1] - this.home[2]) > 20) this.goal = [this.home[0] + (Math.random() - 0.5) * 10, this.home[2] + (Math.random() - 0.5) * 10];
        this.state = 'walk'; this.stateT = 4 + Math.random() * 6;
      }
    }
    if (this.goal) {
      const dx = this.goal[0] - this.x, dz = this.goal[1] - this.z, l = Math.hypot(dx, dz);
      if (l < 0.6) { this.goal = null; this.stateT = 0; return; }
      this.mx = dx / l; this.mz = dz / l; this.wantSpeed = speed;
      // avoid cliffs and water when wandering
      if (!this.safeAhead()) { this.goal = null; this.stateT = 0; this.mx = this.mz = 0; }
    }
  }

  safeAhead() {
    const w = this.game.world, def = this.def;
    const ax = this.x + this.mx * (this.hw + 0.6), az = this.z + this.mz * (this.hw + 0.6);
    const fy = Math.floor(this.y + 0.2);
    const feet = w.getBlock(Math.floor(ax), fy, Math.floor(az));
    if (IS_LIQUID[feet] === 2) return false;
    if (IS_LIQUID[feet] === 1 && !def.swims && !def.aquatic) return false;
    if (def.fly) return true;
    for (let d = 1; d <= 3; d++) {
      const b = w.getBlock(Math.floor(ax), fy - d, Math.floor(az));
      if (b && (BLOCKS[b].solid || IS_LIQUID[b] === 1)) return IS_LIQUID[b] !== 1 || def.swims;
    }
    return false;
  }

  seekTarget(t, speed) {
    const dx = t.x - this.x, dz = t.z - this.z, l = Math.hypot(dx, dz) || 1;
    this.mx = dx / l; this.mz = dz / l; this.wantSpeed = speed;
    this.lookAt = t;
  }

  canSee(t) {
    const w = this.game.world;
    const ex = this.x, ey = this.y + this.h * 0.85, ez = this.z;
    const tx = t.x, ty = t.y + (t.eyeCur || t.h * 0.85), tz = t.z;
    const dx = tx - ex, dy = ty - ey, dz = tz - ez, d = Math.hypot(dx, dy, dz);
    const hit = w.raycast(ex, ey, ez, dx / d, dy / d, dz / d, d, (id) => IS_OPAQUE[id] ? { t: 0, face: 0 } : null);
    return !hit;
  }

  brainHostile(dt) {
    const g = this.game, p = g.player, def = this.def;
    this.sleeping = false;
    // acquire target
    this.seeT -= dt;
    if (this.seeT <= 0) {
      this.seeT = 0.5;
      if (!this.target || this.target.dead || this.target.deathT >= 0 || (this.target === p && (p.dead || p.creative))) this.target = null;
      if (!this.target && !p.dead && !p.creative && def.type === 'hostile') {
        const d = this.distTo(p.x, p.y, p.z);
        const range = def.follow * (p.sneaking ? 0.6 : 1);
        if (d < range && this.canSee(p)) this.target = p;
      }
      if (this.target === p && this.distTo(p.x, p.y, p.z) > def.follow * 1.6) this.target = null;
    }
    const t = this.target;
    if (!t) { this.wander(dt, def.speed * 0.6); return; }
    const dx = t.x - this.x, dz = t.z - this.z;
    const dist = Math.hypot(dx, t.y - this.y, dz);
    const flat = Math.hypot(dx, dz) || 1;
    this.lookAt = t;
    const atk = def.attack;
    if (atk && atk.ranged) {
      // keep distance and shoot
      this.aiming = dist < atk.range;
      if (dist > atk.range * 0.8) { this.mx = dx / flat; this.mz = dz / flat; this.wantSpeed = def.speed; }
      else if (dist < atk.min) { this.mx = -dx / flat; this.mz = -dz / flat; this.wantSpeed = def.speed; }
      else { const s = Math.sin(this.age * 0.8 + this.mid) > 0 ? 1 : -1; this.mx = -dz / flat * s * 0.6; this.mz = dx / flat * s * 0.6; this.wantSpeed = def.speed * 0.6; }
      if (this.attackCD <= 0 && dist < atk.range && this.canSee(t)) {
        this.attackCD = atk.cd * (0.8 + Math.random() * 0.4);
        this.attackAnim = 1;
        g.shootProjectile && g.shootProjectile(this, t, atk.proj, atk.dmg);
      }
      return;
    }
    // melee
    this.mx = dx / flat; this.mz = dz / flat; this.wantSpeed = def.speed * (dist < 6 ? 1.15 : 1) * (this.enraged ? 1.25 : 1);
    if (def.leaps && dist < 4.5 && dist > 2 && this.onGround && Math.random() < dt * 2) { this.vy = 7; this.vx += dx / flat * 5; this.vz += dz / flat * 5; }
    if (def.teleports && dist > 12 && Math.random() < dt * 0.2) this.teleport();
    const reach = (atk ? atk.reach : 1.5) + (this.hw - 0.3);
    // telegraphed melee: a short wind-up the player can read and step away from
    if (this.windT > 0) {
      this.windT -= dt;
      this.windAnim = Math.min(1, 1 - this.windT / this.windMax);
      this.mx *= 0.25; this.mz *= 0.25;
      if (this.windT > 0) return;
      this.windAnim = 0;
      this.attackAnim = 1;
      if (!(dist < reach * 1.35 && Math.abs(t.y - this.y) < 2.5)) { g.audio.play('swing', this); return; }
      if (t === p) {
        if (p.damage(atk.dmg, 'mob', false, this)) {
          p.knockX = dx / flat * 6; p.knockZ = dz / flat * 6; p.vy = Math.max(p.vy, 5);
          if (atk.poison && Math.random() < atk.poison) p.effects.poison = 5;
        }
      } else if (t.hurt) t.hurt(atk.dmg, { entity: this, type: 'mob' });
      return;
    }
    if (atk && dist < reach && this.attackCD <= 0 && Math.abs(t.y - this.y) < 2.5) {
      this.attackCD = atk.cd * (this.enraged ? 0.75 : 1);
      this.windMax = this.windT = (atk.wind ?? 0.3) * (this.enraged ? 0.75 : 1);
      if (Math.random() < 0.5) g.audio.play('windup', this, 0.8 + Math.random() * 0.4);
    }
    // stop at arm's length; if momentum carried the body into its target, step back out instead of clipping through
    if (flat < this.hw + 0.3 && Math.abs(t.y - this.y) < 2) { this.mx = -dx / flat; this.mz = -dz / flat; this.wantSpeed = def.speed * 0.6; }
    else if (dist < Math.max(0.8, this.hw + 0.5)) { this.mx = 0; this.mz = 0; }
  }

  brainFish(dt) {
    this.stateT -= dt;
    if (!this.liquid.inWater) return;
    if (this.stateT <= 0 || !this.goal) {
      this.stateT = 2 + Math.random() * 4;
      const a = Math.random() * Math.PI * 2;
      this.goal = [this.x + Math.cos(a) * 6, this.z + Math.sin(a) * 6, this.y + (Math.random() - 0.5) * 3];
    }
    const p = this.game.player;
    if (this.distTo(p.x, p.y, p.z) < 4) { const dx = this.x - p.x, dz = this.z - p.z, l = Math.hypot(dx, dz) || 1; this.goal = [this.x + dx / l * 6, this.z + dz / l * 6, this.y]; }
    const dx = this.goal[0] - this.x, dz = this.goal[1] - this.z, l = Math.hypot(dx, dz);
    if (l > 0.5) { this.mx = dx / l; this.mz = dz / l; this.wantSpeed = this.def.speed; }
    const w = this.game.world;
    const above = w.getBlock(Math.floor(this.x), Math.floor(this.y + 0.8), Math.floor(this.z));
    const ty = IS_LIQUID[above] === 1 ? this.goal[2] : this.y - 0.5;
    this.vy += (ty - this.y) * dt * 2;
  }

  brainBat(dt) {
    this.stateT -= dt;
    if (this.stateT <= 0 || !this.goal) {
      this.stateT = 1 + Math.random() * 3;
      this.goal = [this.x + (Math.random() - 0.5) * 10, this.z + (Math.random() - 0.5) * 10, this.y + (Math.random() - 0.5) * 4];
    }
    const dx = this.goal[0] - this.x, dz = this.goal[1] - this.z, l = Math.hypot(dx, dz) || 1;
    this.mx = dx / l; this.mz = dz / l; this.wantSpeed = this.def.speed;
    this.vy += (this.goal[2] - this.y) * dt * 3;
  }

  // ---------------------------------------------------------------- physics
  move(dt) {
    const def = this.def;
    const sp = this.wantSpeed * (this.baby ? 1.2 : 1);
    const tx = this.mx * sp, tz = this.mz * sp;
    const acc = this.onGround || def.fly || def.aquatic || (this.liquid && this.liquid.inWater) ? 10 : 2;
    const k = 1 - Math.exp(-acc * dt);
    this.vx += (tx - this.vx) * k; this.vz += (tz - this.vz) * k;
    if (sp > 0.05 && (Math.abs(this.mx) + Math.abs(this.mz)) > 0.1) {
      const targetYaw = Math.atan2(-this.mx, -this.mz);
      let d = targetYaw - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 8);
    }
    this.physicsStep(dt, true);
    // stuck detection -> jump / repath
    if (sp > 0.3) {
      const moved = Math.hypot(this.x - this.lastPos[0], this.z - this.lastPos[1]);
      if (moved < sp * dt * 0.2) { this.stuckT += dt; if (this.stuckT > 1.5) { this.goal = null; this.stateT = 0; this.stuckT = 0; if (this.onGround) this.vy = 8.5; } }
      else this.stuckT = 0;
    }
    this.lastPos[0] = this.x; this.lastPos[1] = this.z;
  }

  physicsStep(dt, control) {
    const def = this.def, w = this.game.world;
    const inWater = this.liquid && this.liquid.inWater;
    if (def.fly && this.deathT < 0) {
      // hover above ground
      if (def.hover && control) {
        const ground = this.game.precip.occluderAt(this.x, this.z);
        const gy = ground > 0 ? ground : this.game.surfaceAt(this.x, this.z);
        const t = this.target;
        const want = t ? Math.max(gy + def.hover, t.y + 1.5) : gy + def.hover;
        this.vy += (want - this.y) * dt * 2.5;
      }
      this.vy *= Math.exp(-2 * dt);
    } else if (def.aquatic && inWater) {
      this.vy *= Math.exp(-3 * dt);
    } else if (inWater) {
      if (def.swims || control) this.vy += (this.liquid.water > 0.4 ? 14 : 4) * dt;
      this.vy -= 8 * dt;
      this.vy *= Math.exp(-2.5 * dt);
    } else {
      this.vy -= 32 * dt;
      if (def.slowFall && this.vy < -3) this.vy = -3;
    }
    if (this.vy < -50) this.vy = -50;
    const preY = this.y;
    const r = moveEntity(w, this, this.vx * dt, this.vy * dt, this.vz * dt);
    if (r.hitX) this.vx *= 0;
    if (r.hitZ) this.vz *= 0;
    if (r.hitY) { this.onGround = this.vy < 0; this.vy = 0; } else this.onGround = false;
    // auto jump
    if (control && (r.hitX || r.hitZ) && this.onGround && (Math.abs(this.mx) + Math.abs(this.mz) > 0.1 || this.rider)) {
      const ax = Math.floor(this.x + this.mx * (this.hw + 0.4)), az = Math.floor(this.z + this.mz * (this.hw + 0.4));
      const above = w.getBlock(ax, Math.floor(this.y) + Math.ceil(this.h), az);
      if (!above || !BLOCKS[above].solid) this.vy = def.jumpy ? 9.5 : 8.6;
    }
    if (def.hopper && control && this.onGround && (Math.abs(this.mx) + Math.abs(this.mz) > 0.1)) this.vy = this.kind === 'mire_lurker' ? 8 : 6;
    if (this.onGround) { const f = Math.exp(-dt * 6); if (!(Math.abs(this.mx) + Math.abs(this.mz) > 0.1) && !this.rider) { this.vx *= f; this.vz *= f; } }
    // fall damage
    if (!this.onGround && this.y < preY && !inWater && !def.fly) this.fallD = (this.fallD || 0) + (preY - this.y);
    if (this.onGround) { if ((this.fallD || 0) > 4 && !def.slowFall) this.hurt(Math.ceil(this.fallD - 3), {}); this.fallD = 0; }
    if (this.y < -20) this.dead = true;
  }

  updateAnim(dt) {
    const sp = Math.hypot(this.vx, this.vz);
    this.walkPhase += sp * dt * (this.baby ? 3.5 : 2.2);
    this.walkAmt += (Math.min(1, sp / 2.5) - this.walkAmt) * Math.min(1, dt * 8);
    // head tracking
    let hy = 0, hp = 0;
    const t = this.lookAt;
    if (t) {
      const dx = t.x - this.x, dz = t.z - this.z, dy = (t.y + (t.eyeCur || 1)) - (this.y + this.h * 0.85);
      hy = Math.atan2(-dx, -dz) - this.yaw;
      while (hy > Math.PI) hy -= Math.PI * 2; while (hy < -Math.PI) hy += Math.PI * 2;
      hy = Math.max(-1.2, Math.min(1.2, hy));
      hp = Math.max(-0.8, Math.min(0.8, -Math.atan2(dy, Math.hypot(dx, dz))));
    }
    this.headYaw += (hy - this.headYaw) * Math.min(1, dt * 6);
    this.headPitch += (hp - this.headPitch) * Math.min(1, dt * 6);
    this.happy = this.tamed && this.distTo(this.game.player.x, this.game.player.y, this.game.player.z) < 5;
    if (this.rearing > 0 && !this.rider) this.rearing = Math.max(0, this.rearing - dt);
  }

  // ---------------------------------------------------------------- render
  render(er, F) {
    const m = this.model;
    const P = this.pose;
    for (let i = 0; i < P.length; i++) {
      const p = P[i], r = m.parts[i].rest;
      p.fill(0);
      if (r) { p[0] = r[0]; p[1] = r[1]; p[2] = r[2]; }
    }
    const anim = ANIMS[m.anim] || ANIMS.quad;
    anim(this, P, this.game.time);
    // The creature animations were written with "negative pitch = forward / up", but the models face -Z where it is
    // the other way round (grazing heads went up, reaching arms went behind the back, heads looked away from targets).
    // Mirror the animated part of every pitch here; the modelled rest poses stay exactly as built.
    for (let i = 0; i < P.length; i++) { const r = m.parts[i].rest; P[i][0] = 2 * (r ? r[0] : 0) - P[i][0]; }
    const cam = F.camPos;
    const W = mat4.create();
    mat4.translate(W, W, this.x - cam[0], this.y - cam[1], this.z - cam[2]);
    mat4.rotateY(W, W, this.yaw);
    if (this.deathT >= 0) mat4.rotateZ(W, W, Math.min(1, this.deathT * 2.5) * Math.PI / 2);
    else if (this.hurtT > 0 && this.hurtDir) {
      // flinch: lean away from the blow
      const k = Math.sin(Math.min(1, (0.5 - this.hurtT) / 0.5) * Math.PI) * 0.22 * (1 - (this.def.knockRes || 0) * 0.7);
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      const front = this.hurtDir[0] * fx + this.hurtDir[1] * fz, side = this.hurtDir[0] * rx + this.hurtDir[1] * rz;
      mat4.rotateX(W, W, -front * k);
      mat4.rotateZ(W, W, -side * k);
    }
    const s = (this.baby ? 0.55 : 1) * (this.def.scale || 1) / 16;
    mat4.scale(W, W, s, s, s);
    if (this.baby && m.index.head !== undefined) { /* big-headed babies */ }
    const l = this.game.world.getLight(Math.floor(this.x), Math.floor(this.y + this.h * 0.6), Math.floor(this.z));
    const light = [(l >> 4) / 15, (l & 15) / 15, Math.max(0, this.hurtT) * 2, this.def.glow || 0];
    if (this.fireT > 0) light[1] = Math.max(light[1], 0.9);
    const mats = this._mats || (this._mats = m.parts.map(() => mat4.create()));
    for (let i = 0; i < m.parts.length; i++) {
      const part = m.parts[i];
      const pose = P[i];
      const M = mats[i];
      M.set(part.pi >= 0 ? mats[part.pi] : W);
      const pv = part.pivot;
      mat4.translate(M, M, pv[0] + pose[3], pv[1] + pose[4], pv[2] + pose[5]);
      if (pose[1]) mat4.rotateY(M, M, pose[1]);
      if (pose[0]) mat4.rotateX(M, M, pose[0]);
      if (pose[2]) mat4.rotateZ(M, M, pose[2]);
      mat4.translate(M, M, -pv[0], -pv[1], -pv[2]);
      if (part.sleepOnly && !(this.sleeping || this.blink || this.deathT >= 0)) continue;
      for (let k = 0; k < part.boxes.length; k++) {
        const b = part.boxes[k];
        TMP.set(M);
        mat4.translate(TMP, TMP, pv[0] + b.o[0], pv[1] + b.o[1], pv[2] + b.o[2]);
        mat4.scale(TMP, TMP, b.s[0], b.s[1], b.s[2]);
        const lt = b.p === PAT.glow ? [light[0], light[1], light[2], 2.5] : light;
        er.pushBox(TMP, b.c, b.p, b.c2, b.pa, b.s[0], b.s[1], b.s[2], (this.mid * 7 + i * 3 + k) % 97, lt);
      }
    }
    // saddle
    if (this.saddled && m.index.body !== undefined) {
      const M = mats[m.index.body];
      const sd = m.saddle || [-5.5, 19.5, -4, 11, 1.5, 9];
      // seat point: top centre of the saddle, in world space (the rider is placed here)
      const sx = sd[0] + sd[3] / 2, sy2 = sd[1] + sd[4], sz = sd[2] + sd[5] / 2;
      // kept relative to the horse, so it stays valid if the horse moves before it is drawn again
      this.seatOff = [M[0] * sx + M[4] * sy2 + M[8] * sz + M[12] + cam[0] - this.x, M[1] * sx + M[5] * sy2 + M[9] * sz + M[13] + cam[1] - this.y, M[2] * sx + M[6] * sy2 + M[10] * sz + M[14] + cam[2] - this.z];
      TMP.set(M);
      mat4.translate(TMP, TMP, sd[0], sd[1], sd[2]);
      mat4.scale(TMP, TMP, sd[3], sd[4], sd[5]);
      er.pushBox(TMP, [0.35, 0.2, 0.1], PAT.cloth, [0.25, 0.14, 0.08], 0, sd[3], sd[4], sd[5], 5, light);
      // bridle on the head, reins back to the rider's hands (or looped over the saddle horn)
      if (m.index.head !== undefined && this.kind === 'horse') {
        const Hm = mats[m.index.head], hp = m.parts[m.index.head].pivot;
        const strap = [0.2, 0.12, 0.07];
        const hb = (o, sz, c = strap) => { TMP.set(Hm); mat4.translate(TMP, TMP, hp[0] + o[0], hp[1] + o[1], hp[2] + o[2]); mat4.scale(TMP, TMP, sz[0], sz[1], sz[2]); er.pushBox(TMP, c, PAT.flat, c, 0, sz[0], sz[1], sz[2], 5, light); };
        hb([-2.4, -2.2, -10.2], [4.8, 0.7, 0.8]);                                // noseband
        hb([-2.45, -2.9, -10.2], [0.3, 1.6, 3.6]); hb([2.15, -2.9, -10.2], [0.3, 1.6, 3.6]);
        hb([-2.95, -2.6, -6.4], [0.3, 5.6, 0.7]); hb([2.65, -2.6, -6.4], [0.3, 5.6, 0.7]);   // cheek straps
        hb([-2.95, 2.6, -6.4], [5.9, 0.6, 0.7]);                                  // brow band
        hb([-2.6, -2.4, -11.3], [0.4, 0.8, 0.8], [0.62, 0.62, 0.66]); hb([2.2, -2.4, -11.3], [0.4, 0.8, 0.8], [0.62, 0.62, 0.66]);   // bit rings
        const at = (Mx, x, y, z) => [Mx[0] * x + Mx[4] * y + Mx[8] * z + Mx[12], Mx[1] * x + Mx[5] * y + Mx[9] * z + Mx[13], Mx[2] * x + Mx[6] * y + Mx[10] * z + Mx[14]];
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
        for (const sx of [-1, 1]) {
          const a = at(Hm, hp[0] + sx * 2.4, hp[1] - 2, hp[2] - 10.9);
          let b;
          if (this.rider === this.game.player && this.seatOff) {
            const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
            b = [this.x + this.seatOff[0] + fx * 0.36 + rx * sx * 0.14 - cam[0], this.y + this.seatOff[1] + 0.42 - cam[1], this.z + this.seatOff[2] + fz * 0.36 + rz * sx * 0.14 - cam[2]];
          } else b = at(M, sd[0] + sd[3] / 2 + sx * 1.6, sd[1] + sd[4] + 0.6, sd[2] + 0.4);
          // a little slack: sag the middle of the rein
          const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.08, (a[2] + b[2]) / 2];
          for (const [p0, p1] of [[a, mid], [mid, b]]) {
            const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2], len = Math.hypot(dx, dy, dz) || 1;
            const ux = dx / len, uy = dy / len, uz = dz / len;
            let sxv = [uz, 0, -ux]; const sl = Math.hypot(sxv[0], sxv[2]) || 1; sxv = [sxv[0] / sl, 0, sxv[2] / sl];
            const up = [sxv[1] * uz - sxv[2] * uy, sxv[2] * ux - sxv[0] * uz, sxv[0] * uy - sxv[1] * ux];
            const t = 0.025;
            TMP.set([sxv[0] * t, sxv[1] * t, sxv[2] * t, 0, up[0] * t, up[1] * t, up[2] * t, 0, dx, dy, dz, 0, p0[0] - (sxv[0] + up[0]) * t / 2, p0[1] - (sxv[1] + up[1]) * t / 2, p0[2] - (sxv[2] + up[2]) * t / 2, 1]);
            er.pushBox(TMP, strap, PAT.flat, strap, 0, 1, 1, 8, 5, light);
          }
        }
      }
      // stirrup straps and irons
      for (const sx of [-1, 1]) {
        TMP.set(M);
        mat4.translate(TMP, TMP, sx > 0 ? sd[0] + sd[3] : sd[0] - 0.5, sd[1] - 7, sd[2] + sd[5] * 0.45);
        mat4.scale(TMP, TMP, 0.5, 7, 0.8);
        er.pushBox(TMP, [0.22, 0.14, 0.08], PAT.flat, [0.22, 0.14, 0.08], 0, 1, 7, 1, 5, light);
        TMP.set(M);
        mat4.translate(TMP, TMP, sx > 0 ? sd[0] + sd[3] - 0.2 : sd[0] - 0.8, sd[1] - 8, sd[2] + sd[5] * 0.4);
        mat4.scale(TMP, TMP, 1, 1, 1.6);
        er.pushBox(TMP, [0.7, 0.7, 0.74], PAT.metal, [0.5, 0.5, 0.55], 0, 1, 1, 2, 5, light);
      }
    }
  }

  serialize() {
    if (!this.persistent || this.deathT >= 0) return null;
    return { t: 'mob', k: this.kind, x: this.x, y: this.y, z: this.z, hp: this.hp, v: this.variant, b: this.baby ? 1 : 0, gt: this.growT, tm: this.tamed ? 1 : 0, sd: this.saddled ? 1 : 0, sh: this.sheared ? 1 : 0, si: this.sitting ? 1 : 0, yaw: this.yaw, home: this.home, extra: this.extraData ? this.extraData() : undefined };
  }
}

// ---------------------------------------------------------------- projectile
export class Projectile extends Entity {
  constructor(game, owner, x, y, z, vx, vy, vz, kind, dmg) {
    super(game, x, y, z);
    this.type = 'projectile'; this.owner = owner; this.kind = kind; this.dmg = dmg;
    this.vx = vx; this.vy = vy; this.vz = vz;
    this.hw = 0.12; this.h = 0.24;
    this.life = 8; this.stuck = false;
    this.grav = kind === 'arrow' || kind === 'thorn' ? 14 : kind === 'bolt' ? 6 : kind === 'snowball' ? 18 : 0;
    this.pierce = 0; this.hitSet = null;
  }
  update(dt) {
    const g = this.game;
    this.age += dt; this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    if (this.stuck) { if ((this.kind === 'arrow' || this.kind === 'bolt') && this.age > 0.5) this.tryPickup(); return; }
    this.vy -= this.grav * dt;
    const steps = 3;
    for (let s = 0; s < steps; s++) {
      const nx = this.x + this.vx * dt / steps, ny = this.y + this.vy * dt / steps, nz = this.z + this.vz * dt / steps;
      // entity hits
      const targets = this.owner === g.player ? g.entities.list : [g.player, ...g.entities.list.filter(e => e.type === 'mob' && e !== this.owner && e.isHostile === false && false)];
      for (const e of targets) {
        if (!e || e === this.owner || e.dead || (e.deathT !== undefined && e.deathT >= 0)) continue;
        if (e !== g.player && !e.hittable) continue;
        if (this.hitSet && this.hitSet.has(e)) continue;
        const hw = e.hw + 0.15;
        if (nx > e.x - hw && nx < e.x + hw && ny > e.y - 0.1 && ny < e.y + e.h + 0.1 && nz > e.z - hw && nz < e.z + hw) {
          this.hitEntity(e);
          if (this.dead) return;
        }
      }
      const id = g.world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
      if (id && BLOCKS[id].solid) { this.hitBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz), id); return; }
      if (IS_LIQUID[id] === 1 && this.kind === 'fire') { this.dead = true; g.particles.smoke(nx, ny, nz, 4, 0.7); g.audio.play('fizz', this); return; }
      this.x = nx; this.y = ny; this.z = nz;
    }
    if (this.crit && Math.random() < 0.9) g.particles.add({ x: this.x, y: this.y, z: this.z, vx: 0, vy: 0, vz: 0, size: 0.05, r: 1, g: 0.9, b: 0.6, a: 1, a0: 1, fade: true, layer: -2, life: 0.35, emis: 3, add: true });
    if (this.burning && Math.random() < 0.7) g.particles.flame(this.x, this.y, this.z);
    if (this.kind === 'fire' && Math.random() < 0.8) g.particles.flame(this.x, this.y, this.z);
    if (this.kind === 'ice' && Math.random() < 0.5) g.particles.sparkle(this.x, this.y, this.z, [0.7, 0.9, 1], 1);
    if (this.kind === 'magic' && Math.random() < 0.9) g.particles.sparkle(this.x, this.y, this.z, this.color || [0.6, 0.8, 1], 1);
  }
  hitEntity(e) {
    const g = this.game;
    if (this.infernal && !this._boom) { this._boom = true; g.explode && g.explode(this.x, this.y, this.z, 1.8, { breakBlocks: false, source: this.owner }); }
    if (this.root && e.hurt && e !== g.player && !e.isBoss) { e.staggerT = Math.max(e.staggerT || 0, 1.6); for (let k = 0; k < 6; k++) g.particles.add({ x: e.x + (Math.random() - 0.5), y: e.y + 0.1, z: e.z + (Math.random() - 0.5), vx: 0, vy: 1.5, vz: 0, size: 0.1, r: 0.35, g: 0.6, b: 0.2, a: 1, a0: 1, fade: true, layer: -3, life: 0.8, light: 1 }); }
    const dir = [this.vx, this.vy, this.vz];
    const l = Math.hypot(...dir) || 1;
    if (e === g.player) {
      if (g.player.damage(this.dmg, 'mob', false, this.owner)) {
        g.player.knockX = this.vx / l * 3; g.player.knockZ = this.vz / l * 3;
        if (this.kind === 'ice') g.player.effects.slow = 4;
        if (this.kind === 'fire') g.player.fireTime = 4;
      }
    } else if (e.hurt) {
      const speedK = this.kind === 'arrow' ? Math.min(1.25, Math.hypot(this.vx, this.vy, this.vz) / 40) : 1;
      e.hurtT = Math.min(e.hurtT || 0, 0.3);
      e.hurt(this.dmg * (this.kind === 'arrow' ? Math.max(0.5, speedK) : 1) * (this.crit ? 1.25 : 1), { entity: this.owner, dir: [dir[0] / l, 0, dir[2] / l], knock: this.kind === 'bolt' ? 0.9 : 0.6, type: this.kind === 'fire' ? 'fire' : 'proj', weapon: this.kind });
      if ((this.kind === 'fire' || this.burning) && e.def && !e.def.fireImmune) e.fireT = 4;
      if (this.kind === 'ice' && e.vx !== undefined) { e.vx *= 0.2; e.vz *= 0.2; }
    }
    g.audio.play(this.kind === 'arrow' || this.kind === 'bolt' ? 'hit_pierce' : 'arrow_hit', this);
    this.burst();
    if (this.pierce > 0 && e !== g.player) {
      this.pierce--;
      (this.hitSet || (this.hitSet = new Set())).add(e);
      this.vx *= 0.85; this.vy *= 0.85; this.vz *= 0.85;
      return;
    }
    this.dead = true;
  }
  hitBlock(x, y, z, id) {
    const g = this.game;
    if (this.infernal && !this._boom) { this._boom = true; this.dead = true; g.explode && g.explode(this.x, this.y, this.z, 1.8, { breakBlocks: false, fire: true, source: this.owner }); return; }
    if (this.kind === 'arrow' || this.kind === 'bolt') {
      this.stuck = true; this.life = 60; g.audio.play('arrow_hit', this);
      // back the tip out of the block slightly and spit a few chips
      const l = Math.hypot(this.vx, this.vy, this.vz) || 1;
      this.x -= this.vx / l * 0.05; this.y -= this.vy / l * 0.05; this.z -= this.vz / l * 0.05;
      g.particles.blockHit(x, y, z, id, this.vy < -Math.abs(this.vx) - Math.abs(this.vz) ? 2 : 0);
      this.quiver = 0.35;
      return;
    }
    if (this.kind === 'fire') {
      const above = g.world.getBlock(x, y + 1, z);
      if (!above && Math.random() < 0.5) g.world.setBlock(x, y + 1, z, B.fire, 0);
    }
    void id;
    this.burst();
    this.dead = true;
  }
  burst() {
    const g = this.game;
    if (this.kind === 'fire') { for (let i = 0; i < 8; i++) g.particles.flame(this.x, this.y, this.z); g.particles.smoke(this.x, this.y, this.z, 4, 0.3); }
    else if (this.kind === 'ice') g.particles.sparkle(this.x, this.y, this.z, [0.7, 0.9, 1], 10);
    else if (this.kind === 'snowball') g.particles.poof(this.x, this.y, this.z, 6);
    else if (this.kind === 'magic') g.particles.sparkle(this.x, this.y, this.z, this.color || [0.6, 0.8, 1], 14);
  }
  tryPickup() {
    const p = this.game.player;
    if (this.owner === p && Math.abs(p.x - this.x) < 1 && Math.abs(p.z - this.z) < 1 && Math.abs(p.y + 0.9 - this.y) < 1.5) {
      if (!p.creative && !this.noPickup) p.inventory.add(I.arrow, 1);
      this.game.audio.play('pickup', this);
      this.dead = true;
    }
  }
  render(er, F, list) {
    const cam = F.camPos;
    const M = mat4.create();
    mat4.translate(M, M, this.x - cam[0], this.y - cam[1], this.z - cam[2]);
    const yaw = Math.atan2(-this.vx, -this.vz), pitch = Math.atan2(this.vy, Math.hypot(this.vx, this.vz));
    if (!this.stuck) { this._yaw = yaw; this._pitch = pitch; }
    if ((this.kind === 'arrow' || this.kind === 'bolt') && list) {
      const l = this.game.world.getLight(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z));
      const lt = [(l >> 4) / 15, (l & 15) / 15, 0, this.crit ? 0.4 : 0];
      if (this.quiver > 0) this.quiver = Math.max(0, this.quiver - F.dt);
      const wob = this.quiver > 0 ? Math.sin(this.quiver * 60) * this.quiver * 0.25 : 0;
      for (let k = 0; k < 2; k++) {
        const A = mat4.create(); A.set(M);
        mat4.rotateY(A, A, this._yaw || 0);
        mat4.rotateX(A, A, (this._pitch || 0) + wob);
        mat4.rotateZ(A, A, k * Math.PI / 2);
        mat4.translate(A, A, 0, 0, 0.12);
        mat4.rotateY(A, A, Math.PI / 2);
        mat4.rotateZ(A, A, -Math.PI / 4);
        const sc = this.kind === 'bolt' ? 0.62 : 0.72;
        mat4.scale(A, A, sc, sc, sc);
        list.push([I.arrow, A, lt]);
      }
      return;
    }
    mat4.rotateY(M, M, this._yaw || 0);
    mat4.rotateX(M, M, this._pitch || 0);
    const l = this.game.world.getLight(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z));
    const light = [(l >> 4) / 15, (l & 15) / 15, 0, 0];
    const K = {
      arrow: [[0.55, 0.4, 0.25], PAT.bark, 0.08, 0.08, 0.7, 0],
      thorn: [[0.35, 0.28, 0.12], PAT.bark, 0.1, 0.1, 0.55, 0],
      ice: [[0.75, 0.9, 1.0], PAT.ice, 0.22, 0.22, 0.6, 1.2],
      fire: [[1.0, 0.5, 0.1], PAT.lava, 0.35, 0.35, 0.35, 3],
      snowball: [[0.95, 0.97, 1.0], PAT.noise, 0.22, 0.22, 0.22, 0],
      magic: [[0.6, 0.85, 1.0], PAT.glow, 0.2, 0.2, 0.2, 3],
    }[this.kind] || [[1, 1, 1], 0, 0.2, 0.2, 0.2, 0];
    const [c, pat, sx, sy, sz, em] = K;
    mat4.translate(M, M, -sx / 2, -sy / 2, -sz / 2);
    mat4.scale(M, M, sx, sy, sz);
    er.pushBox(M, this.color || c, pat, c, 0, sx * 16, sy * 16, sz * 16, 3, [light[0], light[1], 0, em]);
  }
}

// ---------------------------------------------------------------- spawning & persistence
export class MobSystem {
  constructor(game) {
    this.game = game;
    this.dormant = new Map(); // chunkKey -> [serialized]
    this.populated = new Set();
    this.spawnT = 2; this.animalT = 5; this.waterT = 3;
  }
  reset() {
    this.dormant = new Map();
    this.populated = new Set(this.game.meta && this.game.meta.populated || []);
    this.spawnT = 2;
  }
  get list() { return this.game.entities.list.filter(e => e.type === 'mob'); }

  spawn(kind, x, y, z, opts) {
    const m = createMob(this.game, kind, x, y, z, opts);
    this.game.entities.add(m);
    return m;
  }

  restore(d) {
    const key = Math.floor(d.x / 16) + ',' + Math.floor(d.z / 16);
    const w = this.game.world;
    if (w && w.chunks.has(key)) this.instantiate(d);
    else { let a = this.dormant.get(key); if (!a) { a = []; this.dormant.set(key, a); } a.push(d); }
  }
  instantiate(d) {
    if (d.t !== 'mob' || !MOBS[d.k]) { if (this.game.restoreSpecial) this.game.restoreSpecial(d); return; }
    const m = createMob(this.game, d.k, d.x, d.y + 0.05, d.z, { hp: d.hp, variant: d.v, baby: !!d.b, tamed: !!d.tm, saddled: !!d.sd, sheared: !!d.sh, sitting: !!d.si, yaw: d.yaw, home: d.home, persistent: true, data: d.extra });
    if (d.b) m.growT = d.gt || 120;
    if (d.extra && m.loadExtra) m.loadExtra(d.extra);
    this.game.entities.add(m);
    return m;
  }

  onChunkLoaded(c) {
    const a = this.dormant.get(c.key);
    if (a) { this.dormant.delete(c.key); for (const d of a) this.instantiate(d); }
    if (!this.populated.has(c.key)) {
      this.populated.add(c.key);
      if (!c.restored) this.populateChunk(c);
      return true;
    }
    return false;
  }

  onChunkUnload(c) {
    const ents = this.game.entities;
    for (const e of ents.list) {
      if (e.dead || e.type !== 'mob') continue;
      if (Math.floor(e.x / 16) !== c.cx || Math.floor(e.z / 16) !== c.cz) continue;
      if (e.rider) continue;
      const d = e.serialize();
      if (d) { let a = this.dormant.get(c.key); if (!a) { a = []; this.dormant.set(c.key, a); } a.push(d); }
      e.dead = true;
    }
  }

  serializeDormant() {
    const out = [];
    for (const a of this.dormant.values()) out.push(...a);
    if (this.game.meta) this.game.meta.populated = [...this.populated].slice(-20000);
    return out;
  }

  populateChunk(c) {
    const g = this.game, w = g.world;
    const rng = Math.random;
    if (rng() > 0.12) return;
    const lx = Math.floor(rng() * 16), lz = Math.floor(rng() * 16);
    const biome = c.biomes[lz * 16 + lx];
    const table = ANIMAL_SPAWNS[biome];
    if (!table) return;
    const pick = weighted(table);
    if (!pick) return;
    const [kind, , mn, mx] = pick;
    const n = mn + Math.floor(rng() * (mx - mn + 1));
    for (let i = 0; i < n; i++) {
      const x = c.cx * 16 + Math.max(0, Math.min(15, lx + Math.floor((rng() - 0.5) * 6))) + 0.5;
      const z = c.cz * 16 + Math.max(0, Math.min(15, lz + Math.floor((rng() - 0.5) * 6))) + 0.5;
      const y = this.groundAt(x, z);
      if (y < 0) continue;
      const below = w.getBlock(Math.floor(x), y - 1, Math.floor(z));
      if (IS_LIQUID[below] && !MOBS[kind].swims) continue;
      this.spawn(kind, x, y, z, { baby: rng() < 0.12, persistent: true });
    }
  }

  groundAt(x, z) {
    const w = this.game.world;
    for (let y = HEIGHT - 2; y > 1; y--) {
      const id = w.getBlock(Math.floor(x), y, Math.floor(z));
      if (!id) continue;
      if (BLOCKS[id].solid && !BLOCKS[id].name.endsWith('_leaves')) return y + 1;
      if (IS_LIQUID[id]) return y + 1;
      if (BLOCKS[id].name.endsWith('_leaves')) return -1;
    }
    return -1;
  }

  hostilesNear(x, y, z, r) {
    for (const e of this.game.entities.list) if (e.type === 'mob' && e.def.type === 'hostile' && e.deathT < 0 && e.distTo(x, y, z) < r) return true;
    return false;
  }

  onLightning(x, y, z) {
    for (const e of this.game.entities.list) if (e.type === 'mob' && e.distTo(x, y, z) < 3) { e.hurt(6, { type: 'fire' }); e.fireT = 5; }
  }

  update(dt) {
    const g = this.game, p = g.player, w = g.world;
    if (!p) return;
    // despawn
    for (const e of g.entities.list) {
      if (e.type !== 'mob' || e.dead || e.persistent) continue;
      const d = e.distTo(p.x, p.y, p.z);
      if (d > 96 || (d > 40 && Math.random() < dt * 0.02)) e.dead = true;
      if (e.def.burnsInDay && g.isDay && d > 32 && Math.random() < dt * 0.05) e.dead = true;
      if (g.settings.difficulty === 'peaceful' && e.def.type === 'hostile') { e.dead = true; g.particles.poof(e.x, e.y, e.z, 6); }
    }
    // separation
    const mobs = g.entities.list.filter(e => e.type === 'mob' && !e.dead && e.distTo(p.x, p.y, p.z) < 48);
    for (let i = 0; i < mobs.length; i++) for (let j = i + 1; j < mobs.length; j++) {
      const a = mobs[i], b = mobs[j];
      const dx = b.x - a.x, dz = b.z - a.z, min = a.hw + b.hw;
      if (Math.abs(dx) > min || Math.abs(dz) > min || Math.abs(a.y - b.y) > 1.5) continue;
      const d = Math.hypot(dx, dz) || 0.01;
      if (d < min) { const push = (min - d) * 2 * dt; a.vx -= dx / d * push * 4; a.vz -= dz / d * push * 4; b.vx += dx / d * push * 4; b.vz += dz / d * push * 4; }
    }
    if (p.creative && !g.spawnInCreative) return;
    // hostile spawning
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 1;
      const hostiles = mobs.filter(e => e.def.type === 'hostile').length;
      if (hostiles < 14) for (let k = 0; k < 4; k++) this.trySpawnHostile();
    }
    this.animalT -= dt;
    if (this.animalT <= 0) {
      this.animalT = 15;
      const animals = g.entities.list.filter(e => e.type === 'mob' && e.def.type === 'animal' && e.distTo(p.x, p.y, p.z) < 80).length;
      if (animals < 12) this.trySpawnAnimal();
    }
    this.waterT -= dt;
    if (this.waterT <= 0) {
      this.waterT = 3;
      const fish = mobs.filter(e => e.def.aquatic).length;
      if (fish < 8) this.trySpawnWater();
      const bats = mobs.filter(e => e.kind === 'bat').length;
      if (bats < 3 && Math.random() < 0.3) this.trySpawnBat();
    }
  }

  randomSpot(minD, maxD) {
    const p = this.game.player;
    const a = Math.random() * Math.PI * 2, d = minD + Math.random() * (maxD - minD);
    return [p.x + Math.cos(a) * d, p.z + Math.sin(a) * d];
  }

  trySpawnHostile() {
    const g = this.game, w = g.world, p = g.player;
    const [x, z] = this.randomSpot(22, 52);
    if (!w.isLoaded(x, z) || !w.isLoaded(x + 16, z) || !w.isLoaded(x - 16, z)) return;
    const biome = w.biomeAt(x, z);
    const night = !g.isDay || g.dayTime > 0.77 || g.dayTime < 0.23;
    // cave or surface?
    const surface = this.groundAt(x, z);
    let y = -1, table = null;
    if (Math.random() < 0.5 && p.y < surface - 6) {
      // cave spawn near player's depth
      const yy = Math.floor(p.y + (Math.random() - 0.5) * 20);
      for (let k = 0; k < 16; k++) {
        const ty = yy - k;
        if (ty < 2) break;
        const b = w.getBlock(Math.floor(x), ty - 1, Math.floor(z)), a1 = w.getBlock(Math.floor(x), ty, Math.floor(z)), a2 = w.getBlock(Math.floor(x), ty + 1, Math.floor(z));
        if (b && BLOCKS[b].solid && !a1 && !a2) {
          const l = w.getLight(Math.floor(x), ty, Math.floor(z));
          if ((l >> 4) < 4 && (l & 15) < 4 && g.settings.difficulty !== 'peaceful') { y = ty; table = CAVE_SPAWNS; }
          break;
        }
      }
    } else if (surface > 0) {
      const l = w.getLight(Math.floor(x), surface, Math.floor(z));
      if ((l & 15) > 5) return;
      const below = w.getBlock(Math.floor(x), surface - 1, Math.floor(z));
      if (IS_LIQUID[below] && biome !== BIOME.SWAMP) return;
      const stormDark = g.weather.storm > 0.6 && Math.random() < 0.3;
      if (g.settings.difficulty === 'peaceful') return;
      if (night || stormDark) table = NIGHT_SPAWNS[biome] || NIGHT_SPAWNS.default;
      else if (DAY_SPAWNS[biome] && Math.random() < 0.15) table = DAY_SPAWNS[biome];
      y = surface;
    }
    if (!table || y < 0) return;
    if (Math.hypot(x - p.x, y - p.y, z - p.z) < 20) return;
    const pick = weighted(table);
    if (!pick) return;
    const [kind, , mn, mx] = pick;
    if (kind === 'moss_golem' && g.entities.count(e => e.kind === 'moss_golem') > 1) return;
    const n = mn + Math.floor(Math.random() * (mx - mn + 1));
    for (let i = 0; i < n; i++) {
      const sx = x + (Math.random() - 0.5) * 3, sz = z + (Math.random() - 0.5) * 3;
      const sy = table === CAVE_SPAWNS ? y : this.groundAt(sx, sz);
      if (sy < 0) continue;
      const m = this.spawn(kind, sx, sy, sz);
      if (MOBS[kind].fly) m.y += 2;
    }
  }

  trySpawnAnimal() {
    const g = this.game, w = g.world;
    if (!g.isDay) return;
    const [x, z] = this.randomSpot(32, 64);
    if (!w.isLoaded(x, z)) return;
    const y = this.groundAt(x, z);
    if (y < 0) return;
    const below = w.getBlock(Math.floor(x), y - 1, Math.floor(z));
    if (below !== B.grass && below !== B.snowy_grass && below !== B.sand && below !== B.forest_floor && below !== B.moss_block) return;
    const table = ANIMAL_SPAWNS[w.biomeAt(x, z)];
    if (!table) return;
    const pick = weighted(table);
    const n = pick[2] + Math.floor(Math.random() * (pick[3] - pick[2] + 1));
    for (let i = 0; i < n; i++) this.spawn(pick[0], x + (Math.random() - 0.5) * 3, y, z + (Math.random() - 0.5) * 3, { persistent: true });
  }

  trySpawnWater() {
    const g = this.game, w = g.world;
    const [x, z] = this.randomSpot(10, 36);
    if (!w.isLoaded(x, z)) return;
    if (!WATER_BIOMES.has(w.biomeAt(x, z))) return;
    const top = this.groundAt(x, z) - 1;
    if (IS_LIQUID[w.getBlock(Math.floor(x), top, Math.floor(z))] !== 1) return;
    let d = 0; while (IS_LIQUID[w.getBlock(Math.floor(x), top - d - 1, Math.floor(z))] === 1 && d < 12) d++;
    if (d < 2) return;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) this.spawn('fish', x + Math.random() * 2, top - 1 - Math.random() * (d - 1), z + Math.random() * 2);
  }

  trySpawnBat() {
    const g = this.game, w = g.world, p = g.player;
    const [x, z] = this.randomSpot(8, 24);
    const y = Math.floor(p.y + (Math.random() - 0.5) * 10);
    if (!w.isLoaded(x, z) || w.getBlock(Math.floor(x), y, Math.floor(z))) return;
    const l = w.getLight(Math.floor(x), y, Math.floor(z));
    if ((l >> 4) > 3 || (l & 15) > 4) return;
    this.spawn('bat', x, y, z);
  }
}

function weighted(table) {
  let total = 0; for (const t of table) total += t[1];
  let r = Math.random() * total;
  for (const t of table) { if (r < t[1]) return t; r -= t[1]; }
  return table[0];
}

export { MODELS, SEA, VARIANTS };
