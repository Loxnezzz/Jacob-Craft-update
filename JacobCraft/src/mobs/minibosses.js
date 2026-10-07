// Champions (mini-bosses): rare, named, crowned versions of the regular monsters. Each has two special abilities,
// a health bar, an enrage at half health, and drops Wayfinder Shards — the key to the Lair Compass and the
// Worldheart Keystone. They appear rarely in their home biome (or deep underground) at most one at a time.
import { Mob, MOB_CLASSES, createMob } from './mobs.js';
import { MOBS } from './defs.js';
import { MODELS, PAT, box } from './models.js';
import { warn, ring } from './bosses.js';
import { I } from '../game/items.js';
import { BLOCKS } from '../world/blocks.js';

const ELITES = {
  grave_lord: { base: 'shambler', name: 'Grave Lord', epithet: 'Risen king of the restless dead', hp: 160, scale: 1.45, dmg: 7, speed: 2.6,
    tint: [[0.13, 0.2, 0.16], 0.35], crown: '#e8c050', abilities: ['summon', 'slam'], summon: 'shambler', cd: 7 },
  broodmother: { base: 'cave_crawler', name: 'Broodmother', epithet: 'Queen of the deep tunnels', hp: 140, scale: 2.0, dmg: 6, speed: 3.0,
    tint: [[0.24, 0.08, 0.26], 0.4], crown: '#c070ff', abilities: ['brood', 'slam'], summon: 'cave_crawler', cd: 6.5 },
  mire_matriarch: { base: 'mire_lurker', name: 'Mire Matriarch', epithet: 'She who waits beneath the bog', hp: 170, scale: 1.9, dmg: 7, speed: 2.4,
    tint: [[0.1, 0.24, 0.17], 0.35], crown: '#a8e060', abilities: ['pull', 'slam'], cd: 6 },
  sandstalker_alpha: { base: 'dune_scorpion', name: 'Sandstalker Alpha', epithet: 'Terror of the dune sea', hp: 150, scale: 2.0, dmg: 7, speed: 3.0,
    tint: [[0.48, 0.16, 0.08], 0.35], crown: '#ffcc40', abilities: ['burrow', 'summon'], summon: 'dune_scorpion', cd: 7 },
  wraith_queen: { base: 'frost_wraith', name: 'Wraith Queen', epithet: 'Cold sovereign of the white wastes', hp: 140, scale: 1.6, dmg: 6, speed: 2.4,
    tint: [[0.75, 0.9, 1], 0.3], crown: '#9ae8ff', abilities: ['volley', 'nova'], proj: 'ice', cd: 5.5 },
  cinder_tyrant: { base: 'ember_fiend', name: 'Cinder Tyrant', epithet: 'Lord of the burning sky', hp: 150, scale: 1.8, dmg: 7, speed: 2.8,
    tint: [[0.16, 0.04, 0.03], 0.35], crown: '#ff8a2a', abilities: ['barrage', 'firering'], proj: 'fire', cd: 5.5 },
};
export const ELITE_KINDS = Object.keys(ELITES);

// crowned, recoloured copy of the base model
function eliteModel(baseModel, e) {
  const [tc, tk] = e.tint;
  const tint = (c) => [c[0] * (1 - tk) + tc[0] * tk, c[1] * (1 - tk) + tc[1] * tk, c[2] * (1 - tk) + tc[2] * tk];
  const headName = baseModel.index.head !== undefined ? 'head' : 'body';
  const parts = baseModel.parts.map(pt => {
    const boxes = pt.boxes.map(b => b.p === PAT.glow ? b : Object.assign({}, b, { c: tint(b.c), c2: tint(b.c2) }));
    if (pt.name === headName && pt.boxes.length) {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, top = -1e9;
      for (const b of pt.boxes) { x0 = Math.min(x0, b.o[0]); x1 = Math.max(x1, b.o[0] + b.s[0]); z0 = Math.min(z0, b.o[2]); z1 = Math.max(z1, b.o[2] + b.s[2]); top = Math.max(top, b.o[1] + b.s[1]); }
      const w = Math.min(7, x1 - x0), d = Math.min(7, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      boxes.push(box([cx - w / 2, top, cz - d / 2], [w, 1, d], e.crown, PAT.metal));
      for (const [sx, sz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) boxes.push(box([cx - w / 2 + sx * (w - 1), top + 1, cz - d / 2 + sz * (d - 1)], [1, 1.6, 1], e.crown, PAT.metal));
      boxes.push(box([cx - 0.6, top + 1, cz - d / 2 - 0.2], [1.2, 1.2, 0.6], '#ff3a6a', PAT.glow));
    }
    return Object.assign({}, pt, { boxes });
  });
  return Object.assign({}, baseModel, { parts });
}

for (const [id, e] of Object.entries(ELITES)) {
  const b = MOBS[e.base];
  MOBS[id] = Object.assign({}, b, {
    id, name: e.name, epithet: e.epithet, hp: e.hp, speed: e.speed, runSpeed: e.speed * 1.4, scale: e.scale,
    size: [b.size[0] * e.scale * 0.85, b.size[1] * e.scale],
    attack: Object.assign({}, b.attack, { dmg: e.dmg, cd: (b.attack.cd || 1) * 0.9 }),
    drops: [['wayfinder_shard', 1, 2], ['emerald', 3, 6], ['diamond', 0, 1, 0.5], ['glowdust', 2, 4]],
    xp: 60, burnsInDay: false, follow: 40, knockRes: 0.7, scaleSound: 0.55, elite: true,
    model: eliteModel(b.model || MODELS[e.base], e),
  });
}

class Champion extends Mob {
  constructor(game, kind, x, y, z, opts = {}) {
    super(game, kind, x, y, z, opts);
    this.isElite = true;
    this.persistent = false;
    this.maxHp = this.def.hp;
    this.E = ELITES[kind];
    this.abilityT = 3;
    this.queue = [];
    this.announced = false;
    this.hidden = false;
  }
  get bossFrac() { return Math.max(0, this.hp / this.maxHp); }

  hurt(amount, src = {}) {
    if (this.hidden) return false;
    const r = super.hurt(amount, Object.assign({}, src, { knock: (src.knock ?? 0.4) * 0.3 }));
    if (src.entity === this.game.player) this.target = this.game.player;
    return r;
  }

  die(src) {
    if (this.deathT >= 0) return;
    // champion drops burst out like boss loot
    const drops = this.def.drops;
    this.def = Object.assign({}, this.def, { drops: [] });
    super.die(src);
    const g = this.game;
    for (const [item, mn, mx, ch] of drops) {
      if (ch !== undefined && Math.random() > ch) continue;
      const n = mn + Math.floor(Math.random() * (mx - mn + 1));
      if (n > 0) { if (g.dropBossLoot) g.dropBossLoot(this.x, this.y + 0.5, this.z, I[item], n); else g.entities.dropItem(this.x, this.y + 0.5, this.z, I[item], n); }
    }
    for (const e of g.entities.list) if (e.summoner === this && !e.dead) { g.particles.poof(e.x, e.y + 0.5, e.z, 8); e.dead = true; }
    g.ui.toast('Champion defeated!', this.def.name + ' has fallen.');
    g.audio.play('victory');
    for (let i = 0; i < 24; i++) g.particles.sparkle(this.x, this.y + this.h * Math.random(), this.z, [1, 0.85, 0.4], 2);
    g.eliteCooldown = 240;
    if (src.entity === g.player && g.onEliteKilled) g.onEliteKilled(this);
  }

  update(dt) {
    const g = this.game, p = g.player;
    for (let i = this.queue.length - 1; i >= 0; i--) { const q = this.queue[i]; q[0] -= dt; if (q[0] <= 0) { this.queue.splice(i, 1); q[1](); } }
    if (this.hidden) { this.vx = this.vz = 0; return; } // burrowed: no AI, no attacks until it resurfaces
    super.update(dt);
    if (this.deathT >= 0 || this.dead) return;
    if (Math.random() < dt * 4) g.particles.sparkle(this.x + (Math.random() - 0.5) * this.hw * 2, this.y + this.h + 0.2, this.z + (Math.random() - 0.5) * this.hw * 2, hexRgb(this.E.crown), 1);
    const dp = Math.hypot(p.x - this.x, p.y - this.y, p.z - this.z);
    if (this.target === p && !this.announced && dp < 30) {
      this.announced = true;
      g.ui.subtitle(this.def.name, this.def.epithet, 3.5);
      g.audio.play('boss_sting');
    }
    if (!this.enraged && this.hp < this.maxHp * 0.5) {
      this.enraged = true;
      g.ui.subtitle('', `${this.def.name} is enraged!`, 2);
      g.audio.mob(this.def.sounds.hurt || 'roar', this, 0.5);
    }
    if (this.target !== p || p.dead || p.creative || dp > 32) return;
    this.abilityT -= dt * (this.enraged ? 1.4 : 1);
    if (this.abilityT > 0) return;
    this.abilityT = this.E.cd * (0.8 + Math.random() * 0.4);
    const ab = this.E.abilities[Math.random() < 0.5 ? 0 : 1];
    this.use(ab, dp);
  }

  use(ab, dp) {
    const g = this.game, p = g.player, E = this.E, col = hexRgb(E.crown);
    const alive = g.entities.count(e => e.summoner === this && !e.dead);
    if ((ab === 'summon' || ab === 'brood') && alive >= 4) ab = E.abilities.find(a => a !== ab) || ab;
    if (ab === 'slam' && dp > 7) ab = E.abilities.find(a => a !== 'slam') || ab;
    switch (ab) {
      case 'summon': case 'brood': {
        const n = ab === 'brood' ? 3 : 2;
        g.audio.mob(this.def.sounds.idle || 'groan', this, 0.5);
        for (let k = 0; k < n; k++) {
          const a = Math.random() * Math.PI * 2, x = this.x + Math.cos(a) * 3.5, z = this.z + Math.sin(a) * 3.5;
          const y = g.mobs.groundAt(x, z);
          if (y <= 0 || Math.abs(y - this.y) > 4) continue;
          warn(g, x, y, z, 1.2, 0.9, col, () => {
            if (this.dead || this.deathT >= 0) return;
            const m = createMob(g, E.summon, x, y, z, { baby: ab === 'brood' });
            m.summoner = this; m.target = p; m.persistent = false;
            g.entities.add(m); g.particles.poof(x, y + 0.3, z, 10);
          });
        }
        break;
      }
      case 'slam': {
        this.attackAnim = 1; this.vx = this.vz = 0;
        warn(g, this.x, this.y, this.z, 6.5, 1.0, col, () => {
          if (this.dead || this.deathT >= 0) return;
          ring(g, this, this.x, this.y, this.z, 1, 7, 0.6, 6, col);
          g.camShake = Math.max(g.camShake || 0, 0.35);
          g.audio.play('explode', this);
        });
        break;
      }
      case 'pull': {
        if (dp < 3.5 || dp > 15 || !this.canSee(p)) { this.use('slam', dp); return; }
        const steps = Math.ceil(dp * 3);
        for (let k = 0; k < steps; k++) { const t = k / steps; g.particles.add({ x: this.x + (p.x - this.x) * t, y: this.y + this.h * 0.6 + (p.y + 1 - this.y - this.h * 0.6) * t, z: this.z + (p.z - this.z) * t, vx: 0, vy: 0, vz: 0, size: 0.12, r: 0.85, g: 0.35, b: 0.45, a: 1, a0: 1, fade: true, layer: -2, life: 0.35 }); }
        const l = dp || 1;
        p.knockX = (this.x - p.x) / l * 16; p.knockZ = (this.z - p.z) / l * 16; p.vy = 5;
        p.damage(3, 'mob', false, this);
        g.audio.mob('croak', this, 0.5);
        break;
      }
      case 'burrow': {
        this.hidden = true; this.vx = this.vz = 0;
        g.audio.mob('rumble', this, 0.6);
        for (let k = 0; k < 30; k++) g.particles.add({ x: this.x + (Math.random() - 0.5) * 2, y: this.y + 0.2, z: this.z + (Math.random() - 0.5) * 2, vx: (Math.random() - 0.5) * 4, vy: 3 + Math.random() * 4, vz: (Math.random() - 0.5) * 4, size: 0.18, r: 0.86, g: 0.76, b: 0.52, a: 1, a0: 1, fade: true, layer: -3, life: 0.9, grav: 14 });
        const tx = p.x, tz = p.z, ty = g.mobs.groundAt(p.x, p.z);
        this.queue.push([0.8, () => warn(g, tx, ty, tz, 2.6, 1.1, [1, 0.8, 0.4], () => {
          this.x = tx; this.z = tz; this.y = ty; this.hidden = false; this.vy = 6;
          ring(g, this, tx, ty, tz, 0.5, 3.2, 0.35, 0, [0.9, 0.75, 0.45]);
          // anyone still standing in the marked circle is thrown into the air
          if (Math.hypot(p.x - tx, p.z - tz) < 2.8 && Math.abs(p.y - ty) < 3 && p.damage(8, 'mob', false, this)) { p.vy = 9; p.knockX = (p.x - tx) * 3; p.knockZ = (p.z - tz) * 3; }
          g.camShake = Math.max(g.camShake || 0, 0.4);
          g.audio.play('explode', this);
          for (let k = 0; k < 40; k++) g.particles.add({ x: tx + (Math.random() - 0.5) * 3, y: ty + 0.3, z: tz + (Math.random() - 0.5) * 3, vx: (Math.random() - 0.5) * 6, vy: 4 + Math.random() * 6, vz: (Math.random() - 0.5) * 6, size: 0.2, r: 0.86, g: 0.76, b: 0.52, a: 1, a0: 1, fade: true, layer: -3, life: 1, grav: 14 });
        })]);
        // safety: always resurface
        this.queue.push([3.5, () => { this.hidden = false; }]);
        break;
      }
      case 'volley': {
        this.attackAnim = 1;
        for (let k = -2; k <= 2; k++) {
          const a = Math.atan2(p.z - this.z, p.x - this.x) + k * 0.16, d = dp;
          g.shootProjectile && g.shootProjectile(this, { x: this.x + Math.cos(a) * d, y: p.y, z: this.z + Math.sin(a) * d, h: 1.8 }, E.proj, 4);
        }
        break;
      }
      case 'barrage': {
        for (let k = 0; k < 4; k++) this.queue.push([k * 0.3, () => { if (!this.dead && this.deathT < 0) { this.attackAnim = 1; g.shootProjectile && g.shootProjectile(this, p, E.proj, 5); } }]);
        break;
      }
      case 'nova': {
        const gy = g.mobs.groundAt(this.x, this.z);
        warn(g, this.x, gy, this.z, 7, 0.9, [0.75, 0.92, 1], () => { if (!this.dead && this.deathT < 0) ring(g, this, this.x, gy, this.z, 1, 9, 0.7, 4, [0.75, 0.92, 1], { slow: 6, emis: 1 }); });
        g.audio.play('magic', this);
        break;
      }
      case 'firering': {
        const gy = g.mobs.groundAt(this.x, this.z);
        warn(g, this.x, gy, this.z, 7, 0.9, [1, 0.5, 0.15], () => { if (!this.dead && this.deathT < 0) ring(g, this, this.x, gy, this.z, 1, 9, 0.7, 5, [1, 0.5, 0.15], { fire: true, emis: 3 }); });
        g.audio.play('ignite', this);
        break;
      }
    }
  }

  render(er, F) { if (!this.hidden) super.render(er, F); }
}
for (const id of ELITE_KINDS) MOB_CLASSES[id] = Champion;

function hexRgb(h) { const v = parseInt(h.slice(1), 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; }

// ---------------------------------------------------------------- rare appearances
const SURFACE = [
  ['grave_lord', (k, night) => night && ['PLAINS', 'FOREST', 'BIRCH_FOREST', 'TAIGA', 'SAVANNA', 'MOUNTAINS', 'ANCIENT_FOREST', 'JUNGLE'].includes(k)],
  ['mire_matriarch', (k, night, storm) => (night || storm) && k === 'SWAMP'],
  ['sandstalker_alpha', (k, night) => night && (k === 'DESERT' || k === 'BADLANDS')],
  ['wraith_queen', (k, night) => night && ['TUNDRA', 'SNOWY_TAIGA', 'SNOWY_PEAKS', 'FROZEN_OCEAN', 'FROZEN_RIVER'].includes(k)],
  ['cinder_tyrant', (k) => k === 'VOLCANIC'],
];

export function installChampions(game) {
  game.eliteCooldown = 90;
  let rollT = 20;
  const prev = game.extUpdate;
  game.extUpdate = (dt) => {
    if (prev) prev(dt);
    const p = game.player;
    // health bar for an engaged champion when no great beast is fighting
    let bossUp = false;
    for (const b of game.bossAlive.values()) if (!b.dead && b.awake && b.deathT < 0 && Math.hypot(b.x - p.x, b.z - p.z) < 70) bossUp = true;
    if (!bossUp) {
      let best = null, bd = 1e9;
      for (const e of game.entities.list) {
        if (!e.isElite || e.dead || e.deathT >= 0 || e.target !== p) continue;
        const d = Math.hypot(e.x - p.x, e.z - p.z);
        if (d < 40 && d < bd) { bd = d; best = e; }
      }
      game.ui.boss(best ? best.def.name : null, best ? best.bossFrac : 0, !!best);
    }
    // rare spawns
    if (game.eliteCooldown > 0) game.eliteCooldown -= dt;
    rollT -= dt;
    if (rollT > 0) return;
    rollT = 20;
    if (game.eliteCooldown > 0 || p.dead || game.settings.difficulty === 'peaceful') return;
    if (game.entities.list.some(e => e.isElite && !e.dead)) return;
    if (Math.random() > (game.eliteChance ?? 0.05)) return;
    game.spawnChampion();
  };

  game.spawnChampion = (forceKind) => {
    const p = game.player, w = game.world;
    const key = game.currentBiome ? game.currentBiome.key : '';
    const night = !game.isDay || game.dayTime > 0.77 || game.dayTime < 0.23;
    const storm = game.weather.storm > 0.5;
    const surface = game.mobs.groundAt(p.x, p.z);
    const deep = surface > 0 && p.y < surface - 8;
    let kind = forceKind;
    if (!kind) {
      if (deep) kind = 'broodmother';
      else { const opts = SURFACE.filter(([, ok]) => ok(key, night, storm)).map(([k]) => k); kind = opts[(Math.random() * opts.length) | 0]; }
    }
    if (!kind) return null;
    for (let tries = 0; tries < 12; tries++) {
      const a = Math.random() * Math.PI * 2, d = forceKind ? 14 : 26 + Math.random() * 12;
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (!w.isLoaded(x, z)) continue;
      let y = -1;
      if (kind === 'broodmother' && !forceKind) {
        for (let ty = Math.floor(p.y) + 6; ty > Math.floor(p.y) - 12; ty--) {
          const b = w.getBlock(Math.floor(x), ty - 1, Math.floor(z));
          if (b && BLOCKS[b].solid && !w.getBlock(Math.floor(x), ty, Math.floor(z)) && !w.getBlock(Math.floor(x), ty + 1, Math.floor(z)) && !w.getBlock(Math.floor(x), ty + 2, Math.floor(z))) { y = ty; break; }
        }
      } else y = game.mobs.groundAt(x, z);
      if (y <= 0) continue;
      const m = createMob(game, kind, x, y + 0.1, z, {});
      if (MOBS[kind].fly) m.y += 3;
      m.target = p;
      game.entities.add(m);
      return m;
    }
    return null;
  };
}
