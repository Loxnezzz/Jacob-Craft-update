// Hooks later-phase systems (mobs, projectiles, villages, structures, boats, bosses, dragons) into the Game.
import { MobSystem, Projectile, createMob } from '../mobs/mobs.js';
import { MOBS } from '../mobs/defs.js';
import { installVillagerUI } from '../mobs/villagers.js';
import '../mobs/bosses.js';
import '../mobs/dragon.js';
import { ITEMS, I, enchLevel } from './items.js';
import { installCombat } from './combat.js';
import { installMagic } from './magic.js';
import { installFurniture } from './furniture.js';
import { installFeedback, installCaptions } from './feedback.js';
import { installAmbient } from './ambient.js';
import { installPlayerModel } from './playerModel.js';
import { installMilestones } from './milestones.js';
import { installChampions } from '../mobs/minibosses.js';
import { installJourney } from './journey.js';
import { installOffhand } from './offhand.js';
import { installRecipeUnlocks } from './recipeUnlock.js';
import { installStalkers } from '../mobs/stalkers.js';
import { installWildlife } from '../mobs/wildlife.js';
import { installDecor } from './decor.js';
import { installPyramid } from '../mobs/pyramid.js';
import '../mobs/pets.js';
import { Boat } from './boats.js';
import { rollLoot } from './loot.js';
import { locateStructures } from '../world/structures.js';
import { WorldGen } from '../world/worldgen.js';
import { IS_LIQUID } from '../world/blocks.js';
import { updateTelegraphs } from '../mobs/bosses.js';

export function installExtensions(game) {
  game.mobs = new MobSystem(game);
  installCombat(game);
  game.mobs.render = () => {};
  installVillagerUI(game);

  // ------------------------------------------------------------ persistence of extra world state
  game.pendingLoot = new Map();
  game.bossMarkers = new Map();
  game.dragonMarkers = new Map();
  game.saveExtra = () => ({
    pendingLoot: [...game.pendingLoot],
    bosses: [...game.bossMarkers.values()],
    dragons: [...game.dragonMarkers.values()],
    populated: game.mobs ? [...game.mobs.populated].slice(-20000) : [],
  });
  game.loadExtra = (meta) => {
    game.pendingLoot = new Map(meta.pendingLoot || []);
    game.bossMarkers = new Map((meta.bosses || []).map(b => [b.id, b]));
    game.dragonMarkers = new Map((meta.dragons || []).map(b => [b.id, b]));
    game.mainGen = new WorldGen(meta.seed >>> 0);
  };

  game.fillLoot = (t, x, y, z) => {
    const key = x + ',' + y + ',' + z;
    const table = game.pendingLoot.get(key);
    if (table) { rollLoot(table, t.inv); game.pendingLoot.delete(key); t.label = table === 'wizard' ? "Wizard's Chest" : table === 'temple' ? 'Ancient Coffer' : 'Chest'; }
  };

  game.locate = (x, z, r) => game.mainGen ? locateStructures(game.mainGen, x, z, r) : [];
  game.locateStructure = (want) => {
    const p = game.player;
    const list = game.locate(p.x, p.z, 3000).filter(s => s.type.replace('_', ' ').includes(want) || s.type.includes(want));
    if (!list.length) return false;
    list.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    const s = list[0];
    game.ui.chat(`Nearest ${s.type.replace(/_/g, ' ')}: ${s.x}, ${s.z} (${Math.round(Math.hypot(s.x - p.x, s.z - p.z))} blocks)`, '#9cf');
    return true;
  };

  // ------------------------------------------------------------ structures appearing in fresh chunks
  game.onStructures = (c, fresh) => {
    if (!c.structures || !c.structures.length) return;
    for (const s of c.structures) {
      if (s.type === 'chest') {
        if (fresh && !game.tiles.has(s.x + ',' + s.y + ',' + s.z)) game.pendingLoot.set(s.x + ',' + s.y + ',' + s.z, s.loot);
      } else if (s.type === 'village' && fresh) {
        for (const r of s.residents) {
          const sp = r.door || s.meet;
          const v = createMob(game, 'villager', sp[0] + 0.5, sp[1] + 0.5, sp[2] + 0.5, {
            data: { name: r.name, job: r.job, bed: r.bed, door: r.door, work: r.work, meet: s.meet, village: s.id, look: r.look, gender: r.gender },
          });
          game.entities.add(v);
        }
        // a cat or two living in the village
        if (Math.random() < 0.6) game.mobs.spawn('cat', s.meet[0], s.meet[1] + 0.5, s.meet[2], { persistent: true });
      } else if (s.type === 'wizard' && fresh) {
        const wz = createMob(game, 'wizard', s.x, s.y + 0.2, s.z, { data: { name: 'Archmage ' + ['Orrin', 'Velma', 'Thalos', 'Ysolde', 'Grimwald', 'Seraphine'][Math.abs(s.seed) % 6], job: 'wizard', look: s.seed } });
        game.entities.add(wz);
      } else if (s.type === 'boss') {
        if (!game.bossMarkers.has(s.id)) game.bossMarkers.set(s.id, { id: s.id, kind: s.kind, x: s.x, y: s.y, z: s.z, defeated: false });
      } else if (s.type === 'dragon') {
        if (!game.dragonMarkers.has(s.id)) game.dragonMarkers.set(s.id, { id: s.id, x: s.x, y: s.y, z: s.z, seed: s.seed, spawned: false });
      }
    }
  };

  // ------------------------------------------------------------ projectiles & combat items
  game.shootProjectile = (owner, target, kind, dmg) => {
    const sx = owner.x, sy = owner.y + owner.h * 0.8, sz = owner.z;
    const tx = target.x, ty = target.y + (target.eyeCur ? target.eyeCur * 0.75 : target.h * 0.6), tz = target.z;
    const speed = kind === 'thorn' ? 22 : kind === 'ice' ? 18 : kind === 'fire' ? 15 : 20;
    const dx = tx - sx, dy = ty - sy, dz = tz - sz;
    const d = Math.hypot(dx, dy, dz) || 1;
    const grav = kind === 'thorn' || kind === 'arrow' ? 14 : 0;
    const time = d / speed;
    const vy = dy / time + 0.5 * grav * time;
    const inacc = 0.06;
    const p = new Projectile(game, owner, sx + dx / d * 0.6, sy, sz + dz / d * 0.6, dx / time + (Math.random() - 0.5) * speed * inacc, vy + (Math.random() - 0.5) * speed * inacc, dz / time + (Math.random() - 0.5) * speed * inacc, kind, dmg);
    game.entities.add(p);
    if (kind === 'fire') game.audio.play('ignite', owner);
    else if (kind === 'ice') game.audio.play('magic', owner);
    else game.audio.play('bow', owner);
    return p;
  };

  game.fireArrow = (draw) => {
    const p = game.player, held = p.held();
    const power = Math.min(1, draw / 1.0);
    if (power < 0.15) return;
    const infinite = enchLevel(held, 'infinity') > 0;
    const hasArrow = p.creative || infinite || p.inventory.count(I.arrow) > 0;
    if (!hasArrow) { game.ui.actionText('You need arrows to shoot'); return; }
    if (!p.creative && !infinite) p.inventory.remove(I.arrow, 1);
    const d = p.lookDir();
    const sp = 14 + power * 44;
    const pr = new Projectile(game, p, p.x + d[0] * 0.5, p.eyeY - 0.1, p.z + d[2] * 0.5, d[0] * sp, d[1] * sp, d[2] * sp, 'arrow', 2 + power * 7 + enchLevel(held, 'power') * 1.5);
    pr.crit = power >= 1;
    pr.burning = enchLevel(held, 'fire') > 0;
    pr.root = !!(held && ITEMS[held.id].tool && ITEMS[held.id].tool.root);
    pr.noPickup = p.creative || infinite;
    game.entities.add(pr);
    game.audio.play('bow', null, 0.8 + power * 0.4);
    if (game.hands) game.hands.kick = 0.25;
    game.interaction.damageHeld(1);
  };

  game.throwItem = (held) => {
    const p = game.player;
    const d = p.lookDir();
    const pr = new Projectile(game, p, p.x + d[0] * 0.5, p.eyeY - 0.1, p.z + d[2] * 0.5, d[0] * 22, d[1] * 22 + 2, d[2] * 22, 'snowball', 0.5);
    game.entities.add(pr);
    game.interaction.consumeHeld();
    game.audio.play('swing');
    void held;
  };

  game.castSpell = (held) => {
    const p = game.player;
    const it = ITEMS[held.id];
    const spell = it.tool.spell || 'spark';
    const d = p.lookDir();
    const kind = spell === 'fire' ? 'fire' : spell === 'frost' ? 'ice' : 'magic';
    const dmg = spell === 'fire' ? 9 : spell === 'frost' ? 8 : 5;
    const pr = new Projectile(game, p, p.x + d[0] * 0.6, p.eyeY - 0.15, p.z + d[2] * 0.6, d[0] * 26, d[1] * 26, d[2] * 26, kind, dmg);
    if (kind === 'magic') pr.color = [0.5, 0.85, 1.0];
    game.entities.add(pr);
    game.audio.play('magic');
    game.interaction.damageHeld(1);
    game.interaction.useCooldown = 0.6;
  };

  // ------------------------------------------------------------ boats
  game.placeBoat = (t, held) => {
    const p = game.player;
    const hit = game.interaction.raycastBlock(5, true);
    if (!hit) return;
    let y = hit.y + 1;
    if (IS_LIQUID[hit.id] === 1) y = hit.y + 0.6;
    const b = new Boat(game, hit.px, y, hit.pz, p.yaw);
    game.entities.add(b);
    game.interaction.consumeHeld();
    game.audio.play('splash', b);
    void t; void held;
  };

  game.restoreSpecial = ((prev) => (d) => {
    if (d.t === 'boat') game.entities.add(new Boat(game, d.x, d.y, d.z, d.yaw));
    else if (prev) prev(d);
  })(game.restoreSpecial);

  game.restoreEntity = ((orig) => (d) => {
    if (d.t === 'item') return orig.call(game, d);
    game.mobs.restore(d);
  })(game.restoreEntity);

  game.onMobKilled = (m) => { void m; };

  // ------------------------------------------------------------ bosses
  game.bossAlive = new Map();
  game._bossT = 0;
  game._beatT = 0;
  game.extUpdate = (dt) => {
    const p = game.player, w = game.world;
    // remount whatever the player was riding when the world was saved (quitting mid-flight must not drop them)
    if (p._remount) {
      const R = p._remount;
      R.t += dt;
      const m = game.entities.list.find(e => !e.dead && !e.rider && (e.kind || e.type) === R.kind && Math.hypot(e.x - R.x, e.y - R.y, e.z - R.z) < 4);
      if (m) { if (m.mount) m.mount(p); else m.interact(p, null); p._remount = null; }
      else if (R.t > 12) { p._remount = null; const gy = game.mobs.groundAt(p.x, p.z); if (gy > 0 && p.y - gy > 3) p.y = gy; } // mount is gone: set them down safely
      else { p.x = R.px; p.y = R.py; p.z = R.pz; p.vx = p.vy = p.vz = 0; }
      p.fallDist = 0;
    }
    updateTelegraphs(game, dt);
    game._bossT -= dt;
    if (game._bossT <= 0) {
      game._bossT = 1;
      for (const m of game.bossMarkers.values()) {
        const alive = game.bossAlive.get(m.id);
        if (alive && alive.dead) game.bossAlive.delete(m.id);
        if (m.defeated || game.bossAlive.has(m.id)) continue;
        const d = Math.hypot(m.x - p.x, m.z - p.z);
        if (d > 80 || !w.isLoaded(m.x, m.z) || !w.isLoaded(m.x + 16, m.z + 16) || !w.isLoaded(m.x - 16, m.z - 16)) continue;
        let y = m.y;
        if (m.kind !== 'desert_titan' && m.kind !== 'husk_king') { const gy = game.mobs.groundAt(m.x, m.z); if (gy > 0) y = gy; }
        const b = createMob(game, m.kind, m.x, y, m.z, { markerId: m.id });
        game.entities.add(b);
        game.bossAlive.set(m.id, b);
      }
    }
    // legendary dragons at their roosts
    if (game._bossT === 1) {
      for (const m of game.dragonMarkers.values()) {
        if (m.spawned) continue;
        const d = Math.hypot(m.x - p.x, m.z - p.z);
        if (d > 96 || !w.isLoaded(m.x, m.z)) continue;
        const dr = createMob(game, 'dragon', m.x, m.y + 12, m.z, { data: { roost: [m.x, m.y, m.z] } });
        game.entities.add(dr);
        m.spawned = true;
        game.ui.subtitle('', 'A great shadow passes overhead...', 3);
        game.audio.play('roar', dr);
      }
    }
    // boss bar for the nearest awake boss
    let best = null, bd = 1e9;
    for (const b of game.bossAlive.values()) {
      if (b.dead || !b.awake || b.deathT >= 0) continue;
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (d < 70 && d < bd) { bd = d; best = b; }
    }
    game.ui.boss(best ? best.def.name : null, best ? best.bossFrac : 0);
    // battle drums
    if (best && game.audio.ctx && game.bossMusic) game.bossMusic(best, dt);
    else if (best && game.audio.ctx) {
      game._beatT -= dt;
      if (game._beatT <= 0) {
        game._beat = (game._beat || 0) + 1;
        game._beatT = best.enraged ? 0.42 : 0.55;
        game.audio.tone({ f: 58, fEnd: 40, dur: 0.35, gain: 0.35, dest: game.audio.mus });
        if (game._beat % 2 === 0) game.audio.noise({ f: 1800, q: 0.7, dur: 0.12, gain: 0.12, dest: game.audio.mus });
        if (game._beat % 8 === 0) game.audio.tone({ f: [110, 98, 123, 92][(game._beat / 8) % 4 | 0], dur: 2.2, gain: 0.12, wave: 'sawtooth', lp: 500, attack: 0.3, dest: game.audio.mus });
      }
    }
    // desert sandstorm
    if (game.sandstorm > 0) {
      game.sandstorm -= dt;
      for (let i = 0; i < 30; i++) game.particles.add({ x: p.x + (Math.random() - 0.5) * 30, y: p.y + Math.random() * 8 - 1, z: p.z + (Math.random() - 0.5) * 30, vx: 9 + Math.random() * 4, vy: (Math.random() - 0.5), vz: 3 + Math.random() * 2, size: 0.12, r: 0.9, g: 0.75, b: 0.5, a: 0.6, a0: 0.6, fade: true, layer: -1, life: 1.2, drag: 0.1, light: 0.8 });
      p.effects.slow = Math.max(p.effects.slow || 0, 0.5);
    }
  };
  game.frameHook = (F) => {
    if (game.sandstorm > 0) {
      const k = Math.min(1, game.sandstorm / 2);
      F.fogDensity = Math.max(F.fogDensity, 0.06 * k);
      F.grade = [1 + 0.22 * k, 1 - 0.02 * k, 1 - 0.3 * k];
      F.saturation = 1 - 0.25 * k;
      F.volDensity = 0.01;
    }
  };

  // ------------------------------------------------------------ commands
  game.extraCommand = (name, args) => {
    if (name === 'spawn' || name === 'summon') {
      const kind = args[0];
      if (!MOBS[kind]) { game.ui.chat('Unknown creature. Try: ' + Object.keys(MOBS).join(', '), '#f88'); return true; }
      const p = game.player, d = p.lookDir();
      const n = Math.min(20, +args[1] || 1);
      for (let i = 0; i < n; i++) {
        const m = createMob(game, kind, p.x + d[0] * 4 + (Math.random() - 0.5), p.y + 0.5, p.z + d[2] * 4 + (Math.random() - 0.5), { persistent: MOBS[kind].type !== 'hostile' });
        game.entities.add(m);
      }
      game.ui.chat(`Summoned ${n} ${MOBS[kind].name}.`, '#9cf');
      return true;
    }
    if (name === 'killall') {
      let n = 0;
      for (const e of game.entities.list) if (e.type === 'mob' && (args[0] ? e.kind === args[0] : e.def.type === 'hostile')) { e.dead = true; n++; }
      game.ui.chat(`Removed ${n} creatures.`, '#9cf');
      return true;
    }
    return false;
  };
  installMagic(game);
  installFurniture(game);
  installFeedback(game);
  installCaptions(game);
  installAmbient(game);
  installPlayerModel(game);
  installMilestones(game);
  installChampions(game);
  installJourney(game);
  installOffhand(game);
  installRecipeUnlocks(game);
  installStalkers(game);
  installWildlife(game);
  installDecor(game);
  installPyramid(game);
}
