// The road to the end of Jacob Craft: journal + milestones, play statistics, compasses (home and Lair Compass),
// the spyglass, dragon eggs, and the finale — the Worldheart ritual at a Runic Altar, the ending text and credits.
import { Entity } from './entities.js';
import { ITEMS, I } from './items.js';
import { B, BLOCKS } from '../world/blocks.js';
import { createMob } from '../mobs/mobs.js';
import { MOBS } from '../mobs/defs.js';
import { PAT } from '../mobs/models.js';
import { mat4 } from '../core/math.js';
import { BLESSINGS } from './milestones.js';

export const BEASTS = [
  { kind: 'woolly_mammoth', name: 'The Woolly Mammoth', lair: 'mammoth_valley', hint: 'Roams a frozen valley in the tundra. Giant footprints in the snow lead the way.', col: [0.95, 0.88, 0.74] },
  { kind: 'forest_warden', name: 'The Ancient Forest Warden', lair: 'warden_grove', hint: 'Sleeps inside a ring of standing stones deep in an Ancient Forest.', col: [0.36, 0.86, 0.44] },
  { kind: 'desert_titan', name: 'The Desert Titan', lair: 'desert_temple', hint: 'Buried beneath a sunken temple in the open desert.', col: [1, 0.72, 0.26] },
  { kind: 'frost_wyrm', name: 'The Frost Wyrm', lair: 'frost_spire', hint: 'Coils around an ice spire high in the snowy peaks.', col: [0.56, 0.84, 1] },
  { kind: 'volcanic_behemoth', name: 'The Volcanic Behemoth', lair: 'caldera', hint: 'Waits inside a smoking caldera in the volcanic wastes.', col: [1, 0.42, 0.16] },
];

const has = (n) => (J) => !!J.seen[n];
const MILESTONES = [
  { id: 'wood', title: 'First Light', desc: 'Gather wood from a tree.', check: (J) => Object.keys(J.seen).some(n => n.endsWith('_log')) },
  { id: 'table', title: 'Workbench', desc: 'Craft a Crafting Table.', check: has('crafting_table') },
  { id: 'stone', title: 'Stone Age', desc: 'Make a stone pickaxe.', check: has('stone_pickaxe') },
  { id: 'bed', title: 'Home Sweet Home', desc: 'Sleep in a bed to set your home.', check: (J) => !!J.flags.bed },
  { id: 'iron', title: 'Iron Age', desc: 'Smelt an iron ingot.', check: has('iron_ingot') },
  { id: 'emerald', title: 'Fair Trade', desc: 'Earn an emerald.', check: has('emerald') },
  { id: 'diamond', title: 'Glittering Deep', desc: 'Find a diamond.', check: has('diamond') },
  { id: 'boat', title: 'Set Sail', desc: 'Take a boat out on the water.', check: (J) => !!J.flags.boat },
  { id: 'horse', title: 'Saddle Up', desc: 'Ride a horse.', check: (J) => !!J.flags.horse },
  { id: 'potion', title: 'Alchemist', desc: 'Brew a potion at the Alchemy Table.', check: (J) => !!J.flags.brewed },
  { id: 'rune', title: 'Runesmith', desc: 'Enchant gear at the Runic Altar.', check: (J) => !!J.flags.enchanted },
  { id: 'quest', title: "The Wizard's Errand", desc: "Complete a wizard's quest.", check: (J) => !!J.flags.quest },
  { id: 'champion', major: true, title: 'Champion Slayer', desc: 'Defeat a crowned champion monster.', check: (J) => J.elites.length > 0 },
  { id: 'lair_compass', major: true, title: 'Hunting Legends', desc: 'Craft a Lair Compass from Wayfinder Shards.', check: has('lair_compass') },
  { id: 'beast1', major: true, title: 'Giant Slayer', desc: 'Defeat your first great beast.', check: (J, p) => (p.blessings || []).length >= 1 },
  { id: 'dragon_tame', major: true, title: 'Dragon Friend', desc: 'Win the trust of a wild dragon.', check: (J) => !!J.flags.dragonTamed },
  { id: 'dragon_fly', major: true, title: 'Sky Rider', desc: 'Fly on the back of a dragon.', check: (J) => !!J.flags.dragonFly },
  { id: 'beast5', major: true, title: 'Legend of Five', desc: 'Defeat all five great beasts.', check: (J, p) => BEASTS.every(b => (p.blessings || []).includes(b.kind)) },
  { id: 'keystone', major: true, title: 'The Worldheart Keystone', desc: 'Forge the Worldheart Keystone.', check: has('worldheart_keystone') },
  { id: 'ending', major: true, title: 'The Worldheart', desc: 'Restore the Worldheart at a Runic Altar.', check: (J) => !!J.ending },
  { id: 'hatch', major: true, title: 'A New Beginning', desc: 'Hatch a dragon egg.', check: (J) => !!J.flags.hatched },
];

const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.round(n).toLocaleString('en-US');

// ---------------------------------------------------------------- dragon egg
export class DragonEgg extends Entity {
  constructor(game, x, y, z, hatch = 60) {
    super(game, x, y, z);
    this.type = 'dragon_egg'; this.persistent = true;
    this.hw = 0.3; this.h = 0.8;
    this.hatch = hatch;
  }
  update(dt) {
    const g = this.game, p = g.player;
    this.age += dt;
    // it only warms while someone keeps it company
    if (Math.hypot(p.x - this.x, p.z - this.z) < 24) this.hatch -= dt;
    if (Math.random() < dt * (this.hatch < 10 ? 10 : 2)) g.particles.sparkle(this.x + (Math.random() - 0.5) * 0.6, this.y + 0.4 + Math.random() * 0.5, this.z + (Math.random() - 0.5) * 0.6, [0.8, 0.5, 1], 1);
    if (this.hatch < 10 && Math.random() < dt * 1.5) g.audio.mob('clatter', this, 1.6);
    if (this.hatch > 0) return;
    this.dead = true;
    g.particles.poof(this.x, this.y + 0.5, this.z, 24);
    for (let i = 0; i < 30; i++) g.particles.sparkle(this.x, this.y + Math.random() * 1.5, this.z, [1, 0.8, 0.4], 1);
    g.audio.play('legendary');
    const d = createMob(g, 'dragon', this.x, this.y + 0.1, this.z, { baby: true, tamed: true, data: { tamed: true, trust: 6, roost: [this.x, this.y, this.z] } });
    d.tamed = true; d.owner = 'player'; d.trust = 6; d.growT = 600; d.flying = false;
    g.entities.add(d);
    g.ui.toast('A dragon has hatched!', 'Your hatchling will grow in about ten minutes. Treats help.');
    g.ui.subtitle('A New Beginning', 'A dragon hatchling has chosen you', 4);
    if (g.journey) g.journey.flags.hatched = true;
  }
  render(er, F) {
    const cam = F.camPos, k = this.hatch < 10 ? (10 - this.hatch) / 10 : 0;
    const wob = Math.sin(this.age * (6 + k * 18)) * (0.03 + k * 0.18) * (Math.sin(this.age * 1.3) > 0 || k > 0 ? 1 : 0.2);
    const l = this.game.world.getLight(Math.floor(this.x), Math.floor(this.y + 0.5), Math.floor(this.z));
    const light = [(l >> 4) / 15, (l & 15) / 15, 0, 0.25];
    for (const [w, y0, h] of [[6, 0, 3], [8, 3, 4], [7, 7, 3], [5, 10, 2], [3, 12, 1]]) {
      const M = mat4.create();
      mat4.translate(M, M, this.x - cam[0], this.y - cam[1], this.z - cam[2]);
      mat4.rotateZ(M, M, wob); mat4.rotateX(M, M, wob * 0.6);
      mat4.scale(M, M, 1 / 16, 1 / 16, 1 / 16);
      mat4.translate(M, M, -w / 2, y0, -w / 2);
      mat4.scale(M, M, w, h, w);
      er.pushBox(M, [0.42, 0.16, 0.6], PAT.spots, [0.85, 0.6, 1], 0.5, w, h, w, 11, light);
    }
  }
  serialize() { return { t: 'dragon_egg', x: this.x, y: this.y, z: this.z, hatch: this.hatch }; }
}

// ---------------------------------------------------------------- the Worldheart ritual (visual + timeline)
class Ritual extends Entity {
  constructor(game, x, y, z, onDone) {
    super(game, x + 0.5, y + 1, z + 0.5);
    this.type = 'ritual'; this.t = 0; this.onDone = onDone; this.fired = new Set();
  }
  pts() { return BEASTS.map((b, i) => { const a = i / 5 * Math.PI * 2 - Math.PI / 2; return [this.x + Math.cos(a) * 3.2, this.z + Math.sin(a) * 3.2, b.col]; }); }
  update(dt) {
    const g = this.game, A = g.audio;
    this.t += dt;
    const t = this.t;
    BEASTS.forEach((b, i) => {
      const at = 0.8 + i * 1.1;
      if (t >= at && !this.fired.has(i)) {
        this.fired.add(i);
        const [px, pz, c] = this.pts()[i];
        if (A.ctx) A.tone({ f: [220, 261.6, 329.6, 392, 523.3][i], dur: 3.5, gain: 0.12, wave: 'triangle', attack: 0.05, dest: A.mus, verb: true });
        for (let k = 0; k < 24; k++) g.particles.sparkle(px, this.y + Math.random() * 3, pz, c, 1);
        g.ui.actionText((BLESSINGS[b.kind] || {}).name || b.name, 1.2);
      }
    });
    // spiralling motes drawn toward the centre
    if (t > 1 && t < 8.5) for (const [px, pz, c] of this.pts()) if (Math.random() < dt * 14) {
      g.particles.add({ x: px, y: this.y + 0.5 + Math.random() * 2, z: pz, vx: (this.x - px) * 0.6, vy: 1.2 + Math.random(), vz: (this.z - pz) * 0.6, size: 0.09, r: c[0], g: c[1], b: c[2], a: 1, a0: 1, fade: true, layer: -2, life: 1.4, emis: 4, add: true });
    }
    if (t >= 7 && !this.fired.has('pillar')) {
      this.fired.add('pillar');
      if (A.ctx) for (const f of [130.8, 196, 261.6, 392]) A.tone({ f, dur: 6, gain: 0.1, wave: 'sine', attack: 0.4, dest: A.mus, verb: true });
      A.play('legendary');
    }
    if (t >= 8.6 && !this.fired.has('flash')) {
      this.fired.add('flash');
      g.flashT = Math.max(g.flashT || 0, 0.35); g.weather.flash = 1.4; g.camShake = 0.6;
      A.play('explode');
      for (let k = 0; k < 80; k++) { const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 9; g.particles.add({ x: this.x, y: this.y + 1, z: this.z, vx: Math.cos(a) * s, vy: (Math.random() - 0.2) * 9, vz: Math.sin(a) * s, size: 0.14, r: 1, g: 0.92, b: 0.7, a: 1, a0: 1, fade: true, layer: -2, life: 1.6, emis: 6, add: true, drag: 1.2 }); }
    }
    if (t >= 10.2) { this.dead = true; this.onDone && this.onDone(); }
  }
  render(er, F) {
    const cam = F.camPos, t = this.t;
    const beam = (x, z, c, w, h, e) => {
      const M = mat4.create();
      mat4.translate(M, M, x - w / 2 - cam[0], this.y - 1 - cam[1], z - w / 2 - cam[2]);
      mat4.scale(M, M, w, h, w);
      er.pushBox(M, c, PAT.glow, c, 0, 1, 1, 1, 0, [1, 1, 0, e]);
    };
    this.pts().forEach(([px, pz, c], i) => {
      const at = 0.8 + i * 1.1;
      if (t < at || t > 8.7) return;
      const k = Math.min(1, (t - at) / 0.4);
      beam(px, pz, c, 0.12, 30 * k, 3.5);
      beam(px, pz, c, 0.35, 6 * k, 1.2);
    });
    if (t >= 7) { const k = Math.min(1, (t - 7) / 1.4); beam(this.x, this.z, [1, 0.95, 0.8], 0.25 + k * 0.9, 120 * k, 5); }
  }
}

// ---------------------------------------------------------------- ending text
const POEM = [
  'Before the first village, before the first fire,',
  'the world was held together by five old hearts.',
  'They slept in the cold valley and the deep forest,',
  'under the sand, on the frozen peak, inside the burning mountain.',
  '',
  'Their sleep grew restless. Their hearts grew heavy.',
  'And the world began, slowly, to forget itself.',
  '',
  'Then someone came along who would not stop exploring.',
  'Who punched a tree, and built a house, and wondered what was over the next hill.',
  '',
  'You walked into the cold, and the forest, and the fire.',
  'You set the great beasts free.',
  'Their strength is yours now, and the Worldheart beats again.',
  '',
  'The world is not finished. It never will be.',
  'There is always another hill.',
];

export function installJourney(game) {
  const ui = game.ui, p = () => game.player;

  // ---------------------------------------------------------- state (saved with the player)
  const ensure = () => {
    const pl = game.player;
    if (!pl.journey) pl.journey = {};
    const J = pl.journey;
    J.seen = J.seen || {}; J.done = J.done || {}; J.flags = J.flags || {}; J.elites = J.elites || [];
    J.stats = Object.assign({ mined: 0, placed: 0, killed: 0, deaths: 0, dist: 0, time: 0 }, J.stats || {});
    if (J.init === undefined) J.init = false;
    game.journey = J;
    return J;
  };

  // ---------------------------------------------------------- stats hooks
  const prevKilled = game.onMobKilled;
  game.onMobKilled = (m) => { prevKilled && prevKilled(m); ensure().stats.killed++; };
  const prevBreak = game.onBlockBreak;
  game.onBlockBreak = (...a) => { prevBreak && prevBreak(...a); if (!p().creative) ensure().stats.mined++; };
  const prevPlace = game.onBlockPlaced;
  game.onBlockPlaced = (...a) => { prevPlace && prevPlace(...a); if (!p().creative) ensure().stats.placed++; };
  const prevDeath = game.onPlayerDeath.bind(game);
  game.onPlayerDeath = (c, s) => { ensure().stats.deaths++; return prevDeath(c, s); };
  const prevSleep = game.trySleep.bind(game);
  game.trySleep = (x, y, z) => { ensure().flags.bed = true; return prevSleep(x, y, z); };
  game.onEliteKilled = (m) => { const J = ensure(); J.elites.push(m.kind); };
  game.onQuestDone = () => { ensure().flags.quest = true; };
  game.onBrewed = () => { ensure().flags.brewed = true; };

  // ---------------------------------------------------------- discovering places (once, the first time you reach them)
  const PLACES = {
    ruin: ['Crumbling Ruins', 'Long abandoned. Something may be left in the chests.', 20],
    ancient_ruin: ['Ancient Ruins', 'Older than any village in these lands', 24],
    mineshaft: ['Abandoned Mineshaft', 'The miners left in a hurry', 28],
    shipwreck: ['Shipwreck', 'Whatever it carried may still be aboard', 22],
    wizard_tower: ['Wizard Tower', 'Someone strange lives here', 22],
    dragon_roost: ['Dragon Roost', 'Bones and scorched stone. Something huge nests here.', 40],
    pyramid: ['The Sunken Pyramid', 'A tomb for a king the desert forgot', 36],
  };
  let placeT = 0;
  const checkPlaces = () => {
    const J = ensure(), pl = game.player;
    if (!game.locate) return;
    J.found = J.found || {};
    const ground = game.mobs.groundAt(pl.x, pl.z);
    const underground = ground > 0 && pl.y < ground - 6;
    for (const st of game.locate(pl.x, pl.z, 64)) {
      const info = PLACES[st.type];
      if (!info) continue;
      const key = st.type + ':' + st.x + ',' + st.z;
      if (J.found[key]) continue;
      if (Math.hypot(st.x - pl.x, st.z - pl.z) > info[2]) continue;
      if (st.type === 'mineshaft' && !underground) continue;   // you find a mineshaft by being down in it
      J.found[key] = 1;
      J.stats.places = (J.stats.places || 0) + 1;
      ui.subtitle(info[0], info[1], 3.5);
      game.audio.play('enchant');
      break;
    }
  };

  // ---------------------------------------------------------- milestone checks (once a second)
  let checkT = 0, lastX = null, lastZ = null;
  const check = (silent) => {
    const J = ensure(), pl = game.player;
    for (const s of pl.inventory.slots) if (s) { J.seen[ITEMS[s.id].name] = 1; if (s.ench) J.flags.enchanted = true; }
    for (const s of pl.armor.slots) if (s) J.seen[ITEMS[s.id].name] = 1;
    const r = pl.riding;
    if (r) { if (r.type === 'boat') J.flags.boat = true; if (r.kind === 'horse') J.flags.horse = true; if (r.isDragon && r.flying) J.flags.dragonFly = true; }
    if (!J.flags.dragonTamed && game.entities.list.some(e => e.isDragon && e.tamed && !e.baby)) J.flags.dragonTamed = true;
    for (const m of MILESTONES) {
      if (J.done[m.id] || !m.check(J, pl)) continue;
      J.done[m.id] = Date.now();
      if (!silent && m.major) { ui.toast('Milestone reached', m.title); game.audio.play('xp'); }
    }
  };

  const prevExt = game.extUpdate;
  game.extUpdate = (dt) => {
    if (prevExt) prevExt(dt);
    const J = ensure(), pl = game.player;
    if (!J.init) { check(true); J.init = true; }
    J.stats.time += dt;
    if (lastX !== null && !pl.dead) { const d = Math.hypot(pl.x - lastX, pl.z - lastZ); if (d < 20) J.stats.dist += d; }
    lastX = pl.x; lastZ = pl.z;
    checkT -= dt;
    if (checkT <= 0) { checkT = 1; check(false); }
    placeT -= dt;
    if (placeT <= 0 && !pl.dead) { placeT = 2; checkPlaces(); }
  };

  // ---------------------------------------------------------- compasses + spyglass overlay (HUD)
  const hud = el('div', '', ui.hud); hud.id = 'compassHud';
  const needle = el('i', 'needle', hud); const label = el('span', '', hud);
  const scope = el('div', '', ui.hud); scope.id = 'spyglass';
  let lairT = 0, lair = null;
  const prevHud = ui.updateHUD.bind(ui);
  ui.updateHUD = (dt) => {
    prevHud(dt);
    const pl = game.player;
    document.body.classList.toggle('scoped', !!game.zoom);
    const held = pl && pl.held(), it = held ? ITEMS[held.id] : null;
    let target = null, name = '';
    if (it && it.name === 'compass') {
      const s = game.spawn;
      if (s) { target = [s[0] + 0.5, s[2] + 0.5]; name = game.spawnBed ? 'Home' : 'World spawn'; }
    } else if (it && it.name === 'lair_compass') {
      lairT -= dt;
      if (lairT <= 0) {
        lairT = 3;
        const left = BEASTS.filter(b => !(pl.blessings || []).includes(b.kind));
        lair = null;
        if (left.length) {
          let bd = 1e12;
          for (const s of game.locate(pl.x, pl.z, 4000)) {
            const b = left.find(x => x.lair === s.type);
            if (!b) continue;
            const d = Math.hypot(s.x - pl.x, s.z - pl.z);
            if (d < bd) { bd = d; lair = { x: s.x, z: s.z, b }; }
          }
        } else lair = { done: true };
      }
      if (lair && lair.done) name = 'All five great beasts have fallen';
      else if (lair) { target = [lair.x, lair.z]; name = lair.b.name.replace(/^The /, '') + "'s lair"; }
      else name = 'The needle spins... no lair within reach';
    }
    if (!it || (it.name !== 'compass' && it.name !== 'lair_compass')) { hud.classList.remove('on'); return; }
    hud.classList.add('on');
    hud.classList.toggle('lair', it.name === 'lair_compass');
    if (target) {
      const ty = Math.atan2(-(target[0] - pl.x), -(target[1] - pl.z));
      let rel = ty - pl.yaw; while (rel > Math.PI) rel -= Math.PI * 2; while (rel < -Math.PI) rel += Math.PI * 2;
      needle.style.transform = `rotate(${(-rel * 180 / Math.PI).toFixed(1)}deg)`;
      const d = Math.hypot(target[0] - pl.x, target[1] - pl.z);
      label.textContent = `${name} · ${d < 4 ? 'here' : fmt(d) + ' m'}`;
    } else {
      needle.style.transform = `rotate(${(game.time * 400) % 360}deg)`;
      label.textContent = name;
    }
  };

  // ---------------------------------------------------------- special item uses (keystone, dragon egg)
  game.useSpecial = (t, held, it) => {
    if (!it) return false;
    if (it.name === 'worldheart_keystone') {
      if (!t || t.type !== 'block' || t.id !== B.runic_altar) { ui.actionText('Use the Keystone on a Runic Altar'); return true; }
      const left = BEASTS.filter(b => !(game.player.blessings || []).includes(b.kind));
      if (left.length) {
        ui.subtitle('The Keystone is cold', `${left.length} great beast${left.length > 1 ? 's' : ''} still slumber${left.length > 1 ? '' : 's'}`, 3.5);
        ui.chat('Still to defeat: ' + left.map(b => b.name.replace(/^The /, '')).join(', ') + '. (See your Journal: J)', '#ffd27a');
        game.audio.play('click');
        return true;
      }
      game.interaction.consumeHeld();
      startRitual(t.x, t.y, t.z);
      return true;
    }
    if (it.name === 'dragon_egg') {
      if (!t || t.type !== 'block' || t.face !== 2) { ui.actionText('Place the egg on top of a block'); return true; }
      const above = game.world.getBlock(t.x, t.y + 1, t.z);
      const soft = above && (BLOCKS[above].replaceable || (!BLOCKS[above].solid && BLOCKS[above].hardness === 0));
      if (above && !soft) { ui.actionText('Not enough room for the egg'); return true; }
      if (above) game.interaction.breakAt(t.x, t.y + 1, t.z, !game.player.creative); // grass and flowers make way
      game.entities.add(new DragonEgg(game, t.x + 0.5, t.y + 1, t.z + 0.5));
      game.interaction.consumeHeld();
      game.audio.play('chest_open', { x: t.x, y: t.y + 1, z: t.z });
      ui.chat('The egg is warm. Stay close and it will hatch.', '#d8b0ff');
      return true;
    }
    return false;
  };
  game.restoreSpecial = ((prev) => (d) => {
    if (d.t === 'dragon_egg') { game.entities.add(new DragonEgg(game, d.x, d.y, d.z, d.hatch ?? 60)); return; }
    if (prev) prev(d);
  })(game.restoreSpecial);

  // ---------------------------------------------------------- the finale
  let ending = null;
  function startRitual(x, y, z) {
    const pl = game.player;
    ending = { x, y, z, phase: 'ritual', done: false };
    // the world falls silent: nearby monsters fade away
    for (const e of game.entities.list) if (e.type === 'mob' && e.def && (e.def.type === 'hostile' || e.isElite) && !e.isBoss && Math.hypot(e.x - x, e.z - z) < 48) { game.particles.poof(e.x, e.y + 0.5, e.z, 8); e.dead = true; }
    pl.invuln = 1e6;
    if (pl.riding && pl.riding.dismount) pl.riding.dismount();
    // step back so the whole ring of light is in view
    {
      let dx = pl.x - (x + 0.5), dz = pl.z - (z + 0.5);
      const l = Math.hypot(dx, dz);
      if (l < 0.5) { dx = Math.sin(pl.yaw); dz = Math.cos(pl.yaw); } else { dx /= l; dz /= l; }
      for (const r of [9, 8, 7, 6, 5]) {
        const nx = x + 0.5 + dx * r, nz = z + 0.5 + dz * r, gy = Math.floor(game.mobs.groundAt(nx, nz));
        const W = game.world, fx = Math.floor(nx), fz = Math.floor(nz), below = W.getBlock(fx, gy - 1, fz);
        // dry, open ground only (two blocks of air over something solid)
        if (gy > 0 && Math.abs(gy - y) < 5 && !W.getBlock(fx, gy, fz) && !W.getBlock(fx, gy + 1, fz) && below && BLOCKS[below].solid) { pl.x = nx; pl.z = nz; pl.y = gy; pl.vx = pl.vy = pl.vz = 0; break; }
      }
    }
    document.body.classList.add('cine'); game.cineT = 12;
    ui.subtitle('The Worldheart', 'Five hearts answer the keystone', 5);
    game.entities.add(new Ritual(game, x, y, z, () => showEnding()));
    ui.openScreen('ritual', (root) => {
      root.classList.add('clear');
      const c = el('div', 'ritualCover', root);
      el('div', 'skip', c, 'Esc — skip');
    });
    // Esc skips straight to the credits (the ritual screen hands over without closing, so the mouse stays free)
    ui.container = { onEscape: () => showEnding(), onClose: () => { if (ending && ending.phase === 'ritual') setTimeout(showEnding, 0); } };
    ending.look = true;
  }

  function showEnding() {
    if (!ending || ending.phase !== 'ritual') return;
    ending.phase = 'credits';
    const J = ensure(), pl = game.player, S = J.stats;
    ui.openScreen('ending', (root) => {
      const wrap = el('div', 'endingWrap', root);
      const roll = el('div', 'endingRoll', wrap);
      el('h1', '', roll, 'THE WORLDHEART');
      for (const line of POEM) el('p', line ? '' : 'gap', roll, esc(line));
      el('div', 'sep', roll);
      el('h2', '', roll, 'JACOB CRAFT');
      el('p', 'role', roll, 'A game by');
      el('p', 'name', roll, 'Jacob');
      el('p', 'role', roll, 'World, creatures, music and sound');
      el('p', 'name', roll, 'Generated in code, one block at a time');
      el('p', 'role', roll, 'Engine');
      el('p', 'name', roll, 'A custom WebGL2 voxel renderer');
      el('p', 'role', roll, 'Starring');
      el('p', 'name', roll, 'Jacob · the villagers who sold you bread · five very large animals · one dragon');
      el('div', 'sep', roll);
      el('h2', '', roll, 'YOUR JOURNEY');
      const st = el('div', 'endStats', roll);
      const row = (k, v) => { const r = el('div', '', st); el('span', '', r, k); el('b', '', r, v); };
      row('Days survived', fmt(game.day || 0));
      row('Time played', `${Math.floor(S.time / 3600)}h ${Math.floor(S.time / 60) % 60}m`);
      row('Distance travelled', (S.dist / 1000).toFixed(1) + ' km');
      row('Places discovered', fmt(S.places || 0));
      row('Blocks mined', fmt(S.mined));
      row('Blocks placed', fmt(S.placed));
      row('Creatures defeated', fmt(S.killed));
      row('Champions defeated', fmt(J.elites.length));
      row('Great beasts', `${(pl.blessings || []).filter(k => BEASTS.some(b => b.kind === k)).length} / 5`);
      row('Deaths', fmt(S.deaths));
      row('Milestones', `${MILESTONES.filter(m => J.done[m.id] || m.id === 'ending').length} / ${MILESTONES.length}`);
      el('div', 'sep', roll);
      el('p', 'thanks', roll, 'Thank you for playing.');
      el('p', '', roll, 'The world goes on. Something waits for you at the altar.');
      const b = el('button', 'btn', roll, 'Continue your adventure');
      b.onclick = () => ui.closeScreen();
      ending.roll = roll; ending.wrap = wrap; ending.scroll = innerHeight * 0.38; // the roll starts below the screen; scroll lifts it
    });
    ui.container = { onClose: () => finishEnding() };
    ending.musicT = 0; ending.beat = 0;
  }

  function finishEnding() {
    if (!ending || ending.phase === 'over') return;
    ending.phase = 'over';
    const J = ensure(), pl = game.player;
    J.ending = (J.ending || 0) + 1;
    pl.invuln = 0;
    // the dawn after: a new morning, clear skies, and the monsters that gathered during the credits are gone
    for (const e of game.entities.list) if (e.type === 'mob' && e.def && (e.def.type === 'hostile' || e.isElite) && !e.isBoss && Math.hypot(e.x - pl.x, e.z - pl.z) < 64) { game.particles.poof(e.x, e.y + 0.5, e.z, 6); e.dead = true; }
    if (game.dayTime > 0.24) game.day = (game.day || 0) + 1;
    game.dayTime = 0.24;
    game.weather.set('clear', 600);
    pl.health = pl.maxHealth; pl.food = 20;
    document.body.classList.remove('cine'); game.cineT = 0;
    if (game.dropBossLoot) game.dropBossLoot(ending.x + 0.5, ending.y + 1, ending.z + 0.5, I.dragon_egg, 1);
    game.audio.play('legendary');
    ui.subtitle('Jacob Craft', 'The world goes on — and so do you', 5);
    ui.chat('You restored the Worldheart. A Dragon Egg rests on the altar.', '#ffd27a');
    game.saveWorld && game.saveWorld(true);
    ending = null;
  }

  // drive the ritual camera and the credits scroll/music from the game loop (independent of CSS animation timing)
  const prevHud2 = ui.updateHUD;
  ui.updateHUD = (dt) => {
    prevHud2(dt);
    if (!ending) return;
    const pl = game.player;
    // nothing can hurt you during the finale (drowning and burning bypass invulnerability)
    pl.air = pl.maxAir || 300; pl.fireTime = 0; pl.health = Math.max(pl.health, pl.maxHealth * 0.5); pl.fallDist = 0;
    if (ending.phase === 'ritual') {
      const dx = ending.x + 0.5 - pl.x, dz = ending.z + 0.5 - pl.z, dy = ending.y + 4 - (pl.y + 1.62);
      const ty = Math.atan2(-dx, -dz), tp = Math.atan2(dy, Math.hypot(dx, dz));
      let d = ty - pl.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      pl.yaw += d * Math.min(1, dt * 2); pl.pitch += (tp - pl.pitch) * Math.min(1, dt * 2);
    } else if (ending.phase === 'credits' && ending.roll) {
      ending.scroll += dt * 26;
      // stop once the button sits mid-screen (it carries half a screen of margin below it)
      ending.scroll = Math.min(ending.scroll, ending.roll.offsetHeight);
      ending.roll.style.transform = `translateY(${-ending.scroll}px)`;
      // a slow music-box melody
      const A = game.audio;
      ending.musicT -= dt;
      if (A.ctx && ending.musicT <= 0) {
        ending.musicT = 0.55;
        const chords = [[261.6, 329.6, 392], [220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7]];
        const ch = chords[Math.floor(ending.beat / 8) % 4];
        const f = ch[ending.beat % 3] * (ending.beat % 8 >= 4 ? 2 : 1);
        A.tone({ f, dur: 1.6, gain: 0.05, wave: 'triangle', attack: 0.01, dest: A.mus, verb: true });
        if (ending.beat % 8 === 0) A.tone({ f: ch[0] / 2, dur: 4.4, gain: 0.05, wave: 'sine', attack: 0.3, dest: A.mus, verb: true });
        ending.beat++;
      }
    }
  };
  // mouse wheel speeds up / rewinds the credits
  addEventListener('wheel', (e) => { if (ending && ending.phase === 'credits') ending.scroll = Math.max(0, ending.scroll + e.deltaY); });

  // ---------------------------------------------------------- journal screen
  ui.openJournal = () => {
    const J = ensure(), pl = game.player;
    check(false);
    game.audio.play('chest_open');
    ui.openScreen('journal', (root) => {
      const panel = el('div', 'panel journal', root);
      el('h3', '', panel, "Jacob's Journal");
      const cols = el('div', 'jcols', panel);
      // milestones
      const left = el('div', 'jcol', cols);
      const nDone = MILESTONES.filter(m => J.done[m.id]).length;
      el('h4', '', left, `Journey <small>${nDone} / ${MILESTONES.length}</small>`);
      const list = el('div', 'jlist', left);
      for (const m of MILESTONES) {
        const r = el('div', 'jm' + (J.done[m.id] ? ' done' : ''), list);
        el('i', '', r, J.done[m.id] ? '✔' : '');
        el('b', '', r, esc(m.title));
        el('span', '', r, esc(m.desc));
      }
      // great beasts + the road to the ending
      const right = el('div', 'jcol', cols);
      const bl = pl.blessings || [];
      el('h4', '', right, `The Five Great Beasts <small>${BEASTS.filter(b => bl.includes(b.kind)).length} / 5</small>`);
      for (const b of BEASTS) {
        const done = bl.includes(b.kind);
        const c = el('div', 'beast' + (done ? ' done' : ''), right);
        c.style.setProperty('--bc', `rgb(${b.col.map(v => Math.round(v * 255)).join(',')})`);
        el('b', '', c, esc(b.name) + (done ? ' — defeated' : ''));
        el('span', '', c, done ? esc(`${BLESSINGS[b.kind].name}: ${BLESSINGS[b.kind].text}`) : esc(b.hint));
      }
      el('h4', '', right, 'The Worldheart');
      const steps = [
        ['Defeat crowned champions for Wayfinder Shards', J.elites.length > 0],
        ['Craft a Lair Compass (Compass + 2 Wayfinder Shards)', !!J.seen.lair_compass],
        ['Defeat all five great beasts', BEASTS.every(b => bl.includes(b.kind))],
        ['Forge the Worldheart Keystone (frostite, sunstone, emberite, diamond, glow dust, wayfinder shard)', !!J.seen.worldheart_keystone],
        ['Use the Keystone on a Runic Altar', !!J.ending],
      ];
      const sl = el('div', 'jsteps', right);
      steps.forEach(([t, d], i) => { const r = el('div', 'jm' + (d ? ' done' : ''), sl); el('i', '', r, d ? '✔' : String(i + 1)); el('span', '', r, esc(t)); });
      if (J.elites.length) {
        const names = {};
        for (const k of J.elites) names[k] = (names[k] || 0) + 1;
        el('div', 'jnote', right, 'Champions defeated: ' + Object.entries(names).map(([k, n]) => `${esc(MOBS[k] ? MOBS[k].name : k)}${n > 1 ? ' ×' + n : ''}`).join(', '));
      }
      const S = J.stats;
      el('div', 'jstats', panel, `Day ${fmt(game.day || 0)} · ${(S.dist / 1000).toFixed(1)} km travelled · ${fmt(S.mined)} blocks mined · ${fmt(S.placed)} placed · ${fmt(S.killed)} creatures defeated · ${fmt(S.deaths)} deaths`);
    });
  };
}
