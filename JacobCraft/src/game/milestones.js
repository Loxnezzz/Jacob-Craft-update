// Phase 6 boss milestones: cinematic intros, per-boss battle music, dramatic deaths, loot that bursts out as glowing
// pickups with light beams and name labels, permanent Boss Blessings, and the special effects of boss-forged gear.
import { ItemEntity } from './entities.js';
import { ITEMS, I } from './items.js';
import { RECIPES } from './recipes.js';
import { mat4 } from '../core/math.js';
import { PAT } from '../mobs/models.js';

export const BLESSINGS = {
  woolly_mammoth: { name: "Mammoth's Vigor", text: '+2 maximum hearts' },
  forest_warden: { name: "Warden's Grace", text: 'Wounds slowly mend on their own' },
  desert_titan: { name: "Titan's Might", text: '+1 melee damage and faster mining' },
  frost_wyrm: { name: "Wyrm's Breath", text: 'Immune to chill; hold your breath twice as long' },
  volcanic_behemoth: { name: "Behemoth's Hide", text: 'Fire and lava burn half as much' },
};
const THEMES = {
  woolly_mammoth: { tempo: 0.62, root: 55, scale: [0, 3, 5, 7, 10], lead: 'sawtooth', lp: 900, horn: true },
  forest_warden: { tempo: 0.52, root: 73.4, scale: [0, 2, 3, 7, 9], lead: 'triangle', lp: 2400 },
  desert_titan: { tempo: 0.5, root: 61.7, scale: [0, 1, 4, 5, 7, 8], lead: 'sawtooth', lp: 1800 },
  frost_wyrm: { tempo: 0.42, root: 82.4, scale: [0, 3, 7, 10, 12], lead: 'sine', lp: 6000, bells: true },
  volcanic_behemoth: { tempo: 0.4, root: 49, scale: [0, 1, 3, 6, 7], lead: 'square', lp: 1200 },
  husk_king: { tempo: 0.46, root: 58.3, scale: [0, 1, 4, 5, 7, 8, 11], lead: 'sawtooth', lp: 1500, horn: true },
};
const RARE_COL = (it) => it && it.glow ? [1, 0.75, 0.35] : [0.75, 0.6, 1];

// a big, spinning, glowing pickup with a beam of light
export class BossLoot extends ItemEntity {
  constructor(game, x, y, z, stack, vx, vy, vz) {
    super(game, x, y, z, stack, vx, vy, vz);
    this.special = !!ITEMS[stack.id].rare;
    this.life = 1800; this.pickupDelay = 1.2;
    this.label = this.special ? ITEMS[stack.id].label + (stack.count > 1 ? ` ×${stack.count}` : '') : null;
  }
  render(er, F, list) {
    const it = ITEMS[this.stack.id];
    const cube = it.block >= 0 && !it.flatIcon;
    const bob = Math.sin(this.age * 2.2 + this.spin) * 0.08;
    const [sky, blk] = this.lightAt();
    const M = mat4.create();
    mat4.translate(M, M, this.x - F.camPos[0], this.y + 0.35 + bob - F.camPos[1], this.z - F.camPos[2]);
    mat4.rotateY(M, M, this.age * 1.4 + this.spin);
    const s = (cube ? 0.3 : 0.55) * (this.special ? 1.25 : 1);
    mat4.scale(M, M, s, s, s);
    list.push([this.stack.id, M, [Math.max(sky, 0.6), blk, 0, this.special ? 0.35 : 0.1]]);
    if (this.special && this.onGround) {
      const c = RARE_COL(it);
      const pulse = 0.8 + Math.sin(this.age * 3) * 0.2;
      for (const [w, h, e] of [[0.06, 7, 3.5], [0.16, 4.5, 1.2]]) {
        const B = mat4.create();
        mat4.translate(B, B, this.x - w / 2 - F.camPos[0], this.y - F.camPos[1], this.z - w / 2 - F.camPos[2]);
        mat4.scale(B, B, w, h * pulse, w);
        er.pushBox(B, c, PAT.glow, c, 0, 1, 1, 1, 0, [1, 1, 0, e]);
      }
    }
  }
  update(dt) {
    super.update(dt);
    if (this.special && !this.dead && Math.random() < dt * 6) {
      const c = RARE_COL(ITEMS[this.stack.id]);
      this.game.particles.add({ x: this.x + (Math.random() - 0.5) * 0.6, y: this.y + 0.2, z: this.z + (Math.random() - 0.5) * 0.6, vx: 0, vy: 0.8 + Math.random(), vz: 0, size: 0.05, r: c[0], g: c[1], b: c[2], a: 1, a0: 1, fade: true, layer: -2, life: 1.2, emis: 3, add: true });
    }
  }
}

export function installMilestones(game) {
  const ui = game.ui;
  // ---------------------------------------------------------- loot fountain
  game.dropBossLoot = (x, y, z, id, n) => {
    const it = ITEMS[id];
    const piles = it.rare ? [n] : n > 6 ? [Math.ceil(n / 2), Math.floor(n / 2)] : [n];
    for (const count of piles) {
      if (count <= 0) continue;
      const a = Math.random() * Math.PI * 2, sp = 2.5 + Math.random() * 3.5;
      game.entities.add(new BossLoot(game, x, y + 1.5, z, { id, count, dmg: 0 }, Math.cos(a) * sp, 7 + Math.random() * 4, Math.sin(a) * sp));
    }
  };

  // ---------------------------------------------------------- floating name labels for special loot
  const labelBox = document.createElement('div'); labelBox.id = 'worldLabels'; ui.hud.appendChild(labelBox);
  const labels = new Map();
  const prevHud = ui.updateHUD.bind(ui);
  ui.updateHUD = (dt) => {
    prevHud(dt);
    const F = game.lastF, r = game.renderer;
    const seen = new Set();
    if (F && r.viewProj) {
      const m = r.viewProj;
      for (const e of game.entities.list) {
        if (!(e instanceof BossLoot) || !e.label || e.dead) continue;
        const x = e.x - F.camPos[0], y = e.y + 1.3 - F.camPos[1], z = e.z - F.camPos[2];
        const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
        const d2 = x * x + y * y + z * z;
        if (cw <= 0.1 || d2 > 48 * 48) continue;
        const sx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / cw, sy = (m[1] * x + m[5] * y + m[9] * z + m[13]) / cw;
        let el = labels.get(e);
        if (!el) { el = document.createElement('div'); el.className = 'wlabel' + (ITEMS[e.stack.id].glow ? ' gold' : ''); el.textContent = e.label; labelBox.appendChild(el); labels.set(e, el); }
        const zoom = parseFloat(document.getElementById('ui').style.zoom) || 1;
        el.style.left = ((sx * 0.5 + 0.5) * innerWidth / zoom) + 'px';
        el.style.top = ((0.5 - sy * 0.5) * innerHeight / zoom) + 'px';
        el.style.opacity = Math.max(0.25, 1 - Math.sqrt(d2) / 48);
        seen.add(e);
      }
    }
    for (const [e, el] of labels) if (!seen.has(e)) { el.remove(); labels.delete(e); }
    // cinematic bars and the boss title card (driven by game time so it never depends on CSS animation timing)
    if (game.cineT > 0) { game.cineT -= dt; if (game.cineT <= 0) document.body.classList.remove('cine'); }
    if (game.cardT !== undefined && game.cardT !== null) {
      game.cardT += dt;
      const t = game.cardT;
      const o = t < 0.45 ? t / 0.45 : t > 3.3 ? Math.max(0, (4 - t) / 0.7) : 1;
      card.style.opacity = o;
      card.style.transform = 'translateX(-50%) scale(' + (1 + Math.max(0, 0.45 - t) * 0.35) + ')';
      if (t > 4) game.cardT = null;
    }
  };

  // ---------------------------------------------------------- pickup announcements + recipe unlocks
  const prevPickup = game.onPickup;
  game.onPickup = (id, n) => {
    if (prevPickup) prevPickup(id, n);
    const it = ITEMS[id];
    if (!it || !it.rare) return;
    if (game.journey && game.journey.seen && game.journey.seen[it.name]) return; // only the first one gets a fanfare
    if (game.journey && game.journey.seen) game.journey.seen[it.name] = 1;
    game.audio.play('legendary');
    ui.toast('Obtained', `${it.label}${n > 1 ? ' ×' + n : ''}`);
    const unlocked = RECIPES.filter(rc => {
      const ings = rc.type === 'shaped' ? Object.values(rc.key) : rc.ings;
      return ings.includes(it.name);
    }).map(rc => ITEMS[rc.result].label);
    if (unlocked.length) ui.chat(`New recipes unlocked: ${[...new Set(unlocked)].join(', ')}`, '#ffd27a');
  };

  // ---------------------------------------------------------- blessings
  game.applyBlessings = () => {
    const p = game.player;
    p.blessings = p.blessings || [];
    const hp = 20 + (p.blessings.includes('woolly_mammoth') ? 4 : 0);
    if (p.maxHealth !== hp) { p.maxHealth = hp; p.health = Math.min(p.health, hp); }
  };
  game.grantBlessing = (kind) => {
    const p = game.player, b = BLESSINGS[kind];
    if (!b) return;
    p.blessings = p.blessings || [];
    if (p.blessings.includes(kind)) return;
    p.blessings.push(kind);
    game.applyBlessings();
    p.health = p.maxHealth;
    // shown once the victory text has faded; if another boss's title card is up, wait for it to finish
    const show = () => { if (game.cardT !== undefined && game.cardT !== null) { setTimeout(show, 800); return; } ui.subtitle(b.name, b.text, 5); game.audio.play('enchant'); };
    setTimeout(show, 4500);
    ui.chat(`Boss Blessing gained — ${b.name}: ${b.text}.`, '#9ef0ff');
  };
  game.hasBlessing = (kind) => !!(game.player.blessings && game.player.blessings.includes(kind));

  // ---------------------------------------------------------- intro card
  const card = document.createElement('div'); card.id = 'bossCard'; ui.hud.appendChild(card);
  game.bossIntro = (boss) => {
    card.innerHTML = `<small>${boss.def.subtitle || ''}</small><b>${boss.def.title || boss.def.name}</b>`;
    clearTimeout(ui._subT); ui.subEl.style.opacity = 0; // the title card replaces whatever subtitle was showing
    game.cardT = 0;
    document.body.classList.add('cine'); game.cineT = 4.2;
    game.audio.play('boss_sting');
  };

  // ---------------------------------------------------------- per-boss music (replaces the generic drums)
  game.bossMusic = (boss, dt) => {
    const A = game.audio;
    if (!A.ctx) return;
    const th = THEMES[boss.kind] || THEMES.woolly_mammoth;
    game._beatT -= dt;
    if (game._beatT > 0) return;
    const beat = game._beat = (game._beat || 0) + 1;
    game._beatT = th.tempo * (boss.enraged ? 0.8 : 1);
    const D = A.mus;
    A.tone({ f: th.root * 1.06, fEnd: th.root * 0.7, dur: 0.35, gain: beat % 4 === 1 ? 0.42 : 0.3, dest: D });
    if (beat % 2 === 0) A.noise({ f: 1800, q: 0.7, dur: 0.12, gain: 0.12, dest: D });
    if (boss.enraged && beat % 2 === 1) A.noise({ f: 300, q: 1, type: 'lowpass', dur: 0.15, gain: 0.25, buf: A.brown, dest: D });
    if (beat % 8 === 1) A.tone({ f: th.root * 2, dur: th.tempo * 7.5, gain: 0.08, wave: 'sawtooth', lp: 500, attack: 0.4, dest: D });
    if (th.horn && beat % 16 === 1) A.tone({ f: th.root * 3, fEnd: th.root * 3 * 1.06, dur: th.tempo * 6, gain: 0.07, wave: 'sawtooth', lp: 1100, attack: 0.6, dest: D, verb: true });
    if (Math.random() < 0.55) {
      const deg = th.scale[(Math.random() * th.scale.length) | 0];
      const f = th.root * 4 * Math.pow(2, deg / 12) * (Math.random() < 0.25 ? 2 : 1);
      A.tone({ f, dur: th.bells ? 1.4 : th.tempo * 0.9, gain: th.bells ? 0.05 : 0.04, wave: th.lead, lp: th.lp, attack: th.bells ? 0.005 : 0.03, dest: D, verb: !!th.bells });
    }
  };

  // ---------------------------------------------------------- slow motion for boss deaths
  game.slowMo = (t) => { game.slowMoT = Math.max(game.slowMoT || 0, t); };
}

// ---------------------------------------------------------------- gear effects helpers (used by player/combat code)
export function armorFlag(p, key) {
  for (const s of p.armor.slots) if (s && ITEMS[s.id].armor && ITEMS[s.id].armor[key]) return true;
  return false;
}
void I;
