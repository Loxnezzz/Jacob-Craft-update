// Phase 6 magic: potions + brewing (Alchemy Table), enchantments (Runic Altar), experience levels and orbs.
import { ITEMS, I, enchLevel } from './items.js';
import { B } from '../world/blocks.js';
import { Inventory, stackExtra } from './inventory.js';
import { Entity } from './entities.js';
import { mat4 } from '../core/math.js';
import { PAT } from '../mobs/models.js';

const el = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
};

// ================================================================ potions
export const POTIONS = {
  water: { label: 'No effect', color: '#7aa8ff' },
  base: { label: 'No effect (brewing base)', color: '#a8b47a' },
  healing: { label: 'Instantly heals 4 hearts', color: '#ff6a7a', instant: (p) => p.heal(8) },
  swift: { effect: 'swift', time: 180, label: 'Swiftness', color: '#6ae2f6' },
  night: { effect: 'nightvision', time: 240, label: 'Night Vision', color: '#a89aff' },
  strength: { effect: 'strength', time: 180, label: 'Strength (+3 melee damage)', color: '#ff8a5a' },
  fireward: { effect: 'fireres', time: 240, label: 'Fire Resistance', color: '#ffc040' },
  gill: { effect: 'waterbreath', time: 240, label: 'Water Breathing', color: '#46c8c8' },
};
export const EFFECT_INFO = {
  swift: ['Swiftness', '#6ae2f6'], nightvision: ['Night Vision', '#a89aff'], strength: ['Strength', '#ff8a5a'],
  fireres: ['Fire Resistance', '#ffc040'], waterbreath: ['Water Breathing', '#46c8c8'], poison: ['Poison', '#7ac040'],
  slow: ['Slowness', '#8a96a8'], hunger: ['Hunger', '#9a7a3a'], resist: ['Resistance', '#c8c8d8'], haste: ['Haste', '#f0d060'], leap: ['Leaping', '#9aff9a'],
};
// brewing: [from potion tag, ingredient item name, result item name]
const BREWS = [
  ['water', 'glowdust', 'base_tonic'],
  ['water', 'glowcap', 'base_tonic'],
  ['base', 'berries', 'healing_potion'],
  ['base', 'sugar_reed', 'swift_potion'],
  ['base', 'carrot', 'night_potion'],
  ['base', 'mushroom_red', 'strength_potion'],
  ['base', 'magma', 'fireward_potion'],
  ['base', 'kelp', 'gill_potion'],
];
const BREW_TIME = 10;
function brewResult(bottleId, ingId) {
  const b = ITEMS[bottleId], ing = ITEMS[ingId];
  if (!b || !ing || !b.potion) return 0;
  for (const [from, ingName, res] of BREWS) if (b.potion === from && ing.name === ingName) return I[res];
  return 0;
}
const isIngredient = (id) => BREWS.some(r => ITEMS[id] && ITEMS[id].name === r[1]);
const isBottle = (id) => ITEMS[id] && (ITEMS[id].potion || id === I.glass_bottle);
const isBrewFuel = (id) => id === I.sunstone_shard;

// ================================================================ enchantments
const T = (it) => it.tool ? it.tool.type : null;
const MELEE = (it) => ['sword', 'axe', 'dagger', 'mace', 'spear'].includes(T(it));
const DIGGER = (it) => ['pickaxe', 'axe', 'shovel', 'hoe'].includes(T(it));
const RANGED = (it) => ['bow', 'crossbow', 'gun'].includes(T(it));
export const ENCHANTS = {
  sharpness: { name: 'Keen Edge', max: 4, applies: MELEE, w: 10 },
  knockback: { name: 'Gale Strike', max: 2, applies: (it) => ['sword', 'mace'].includes(T(it)), w: 5 },
  fire: { name: 'Emberbrand', max: 2, applies: (it) => ['sword', 'axe', 'bow', 'dagger', 'spear'].includes(T(it)), w: 3 },
  efficiency: { name: 'Swift Mining', max: 4, applies: DIGGER, w: 10 },
  fortune: { name: 'Prospector', max: 3, applies: (it) => ['pickaxe', 'shovel', 'hoe'].includes(T(it)), w: 3 },
  unbreaking: { name: 'Enduring', max: 3, applies: (it) => !!((it.tool && it.tool.dur) || it.armor), w: 6 },
  protection: { name: 'Warding', max: 4, applies: (it) => !!it.armor, w: 10 },
  feather: { name: 'Featherfall', max: 4, applies: (it) => it.armor && it.armor.slot === 3, w: 5 },
  swiftness: { name: 'Fleetfoot', max: 3, applies: (it) => it.armor && it.armor.slot === 3, w: 3 },
  power: { name: 'Power', max: 4, applies: RANGED, w: 10 },
  quickload: { name: 'Quick Draw', max: 3, applies: (it) => RANGED(it) || T(it) === 'spear', w: 5 },
  piercing: { name: 'Piercing', max: 3, applies: (it) => T(it) === 'crossbow', w: 4 },
  infinity: { name: 'Endless Quiver', max: 1, applies: (it) => T(it) === 'bow', w: 1 },
};
const EXCLUSIVE = [['infinity', 'fire'], ['fortune', 'efficiency']];
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
export function enchantNames(ench) {
  const out = [];
  for (const k in ench) if (ENCHANTS[k]) out.push(ENCHANTS[k].name + (ENCHANTS[k].max > 1 ? ' ' + ROMAN[ench[k]] : ''));
  return out;
}
function enchantable(it) { return it && (it.name === 'book' || Object.values(ENCHANTS).some(e => e.applies(it))); }

// deterministic offers for (item, player seed, slot)
function makeOffers(it, seed, shelves) {
  const rnd = mulberry(seed ^ (it.id * 2654435761));
  const base = 1 + Math.floor(rnd() * 3) + Math.floor(shelves / 2) + Math.floor(rnd() * (shelves % 2 + 1));
  const costs = [Math.max(1, Math.floor(base / 3)), Math.max(2, Math.floor(base * 2 / 3) + 1), Math.max(3, base + Math.floor(shelves * 0.6))];
  const pool = Object.entries(ENCHANTS).filter(([, e]) => it.name === 'book' || e.applies(it));
  return costs.map((cost, slot) => {
    const picks = {};
    const n = 1 + (cost >= 8 && rnd() < 0.5 ? 1 : 0) + (cost >= 14 && rnd() < 0.35 ? 1 : 0);
    for (let k = 0; k < n && pool.length; k++) {
      let total = 0; for (const [, e] of pool) total += e.w;
      let r = rnd() * total, key = pool[0][0];
      for (const [kk, e] of pool) { r -= e.w; if (r <= 0) { key = kk; break; } }
      if (picks[key]) continue;
      if (EXCLUSIVE.some(([a, b]) => (key === a && picks[b]) || (key === b && picks[a]))) continue;
      const e = ENCHANTS[key];
      picks[key] = Math.max(1, Math.min(e.max, Math.round((cost / 15) * e.max + rnd() * 0.8)));
    }
    return { cost, dust: slot + 1, ench: picks };
  });
}
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ================================================================ experience
export function levelCost(n) { return 12 + n * 6; }
export function xpToLevel(xp) {
  let lvl = 0, need = levelCost(0);
  while (xp >= need) { xp -= need; lvl++; need = levelCost(lvl); }
  return { level: lvl, frac: xp / need, into: xp, need };
}
export function xpForLevel(level) { let t = 0; for (let i = 0; i < level; i++) t += levelCost(i); return t; }

export class XPOrb extends Entity {
  constructor(game, x, y, z, value) {
    super(game, x, y, z);
    this.type = 'xp'; this.value = value; this.hw = 0.12; this.h = 0.24;
    this.vx = (Math.random() - 0.5) * 3; this.vy = 2 + Math.random() * 3; this.vz = (Math.random() - 0.5) * 3;
    this.life = 120; this.phase = Math.random() * 6;
    this.floats = true;
  }
  update(dt) {
    const g = this.game, p = g.player;
    this.age += dt; this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    const dx = p.x - this.x, dy = p.y + 0.8 - this.y, dz = p.z - this.z;
    const d = Math.hypot(dx, dy, dz);
    if (this.age > 0.5 && d < 7 && !p.dead) {
      const k = (1 - d / 7) * 34 * dt;
      this.vx += dx / d * k; this.vy += dy / d * k; this.vz += dz / d * k;
      this.vx *= 0.94; this.vy *= 0.94; this.vz *= 0.94;
      this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
      if (d < 0.7) { this.dead = true; g.gainXP(this.value); }
    } else this.physics(dt, 14, 0.98, 0.7);
  }
  render(er, F) {
    const s = 0.08 + Math.min(0.1, this.value * 0.012);
    const pulse = 1 + Math.sin(this.age * 8 + this.phase) * 0.15;
    const M = mat4.create();
    mat4.translate(M, M, this.x - F.camPos[0], this.y + 0.15 - F.camPos[1], this.z - F.camPos[2]);
    mat4.rotateY(M, M, this.age * 3);
    mat4.rotateX(M, M, 0.6);
    mat4.scale(M, M, s * pulse, s * pulse, s * pulse);
    mat4.translate(M, M, -0.5, -0.5, -0.5);
    const c = Math.sin(this.age * 5 + this.phase) > 0 ? [0.72, 1.0, 0.35] : [1.0, 0.92, 0.35];
    er.pushBox(M, c, PAT.glow, c, 0, 2, 2, 2, 1, [1, 1, 0, 2.5]);
  }
}

// ================================================================ install
export function installMagic(game) {
  const ui = game.ui;
  game.enchantNames = enchantNames;
  game.potionInfo = (tag) => { const p = POTIONS[tag]; return p ? { text: p.time ? `${p.label} (${Math.floor(p.time / 60)}:${String(p.time % 60).padStart(2, '0')})` : p.label, color: p.color } : null; };
  game.enchantSeed = (game.enchantSeed ?? (Math.random() * 1e9) | 0);

  for (const it of ITEMS) if (it && it.potion) it.returns = 'glass_bottle';

  // ---------------------------------------------------------- potions
  game.drinkPotion = (tag) => {
    const P = POTIONS[tag], p = game.player;
    if (!P) return;
    if (P.instant) P.instant(p);
    if (P.effect) p.effects[P.effect] = Math.max(p.effects[P.effect] || 0, P.time);
    const col = hexRGB(P.color);
    // swirl of motes around the drinker (kept clear of the first-person camera)
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2, rr = 0.75 + Math.random() * 0.4;
      game.particles.add({ x: p.x + Math.cos(a) * rr, y: p.y + 0.1 + Math.random() * 1.1, z: p.z + Math.sin(a) * rr, vx: -Math.sin(a) * 0.5, vy: 0.5 + Math.random() * 0.5, vz: Math.cos(a) * 0.5, size: 0.05, r: col[0], g: col[1], b: col[2], a: 1, a0: 1, fade: true, layer: -2, life: 1 + Math.random() * 0.6, emis: 2, add: true });
    }
    game.audio.play('magic');
  };

  // ---------------------------------------------------------- experience
  game.gainXP = (n) => {
    const p = game.player;
    const before = xpToLevel(p.xp).level;
    p.xp += n;
    const after = xpToLevel(p.xp).level;
    game.audio.play('xp', null, 0.8 + Math.random() * 0.5);
    if (after > before) { game.audio.play('levelup'); if (after % 5 === 0) ui.actionText(`Level ${after}!`, 2); }
  };
  game.dropXP = (x, y, z, total) => {
    total = Math.round(total);
    while (total > 0) {
      const v = total >= 10 ? 5 : total >= 3 ? 3 : 1;
      game.entities.add(new XPOrb(game, x + (Math.random() - 0.5) * 0.5, y + 0.3, z + (Math.random() - 0.5) * 0.5, v));
      total -= v;
    }
  };

  // ---------------------------------------------------------- brewing tick
  game.tickBrewing = (dt) => {
    for (const [, t] of game.tiles) {
      if (t.type !== 'brewing' || !game.world.isLoaded(t.x, t.z)) continue;
      const inv = t.inv;
      const ing = inv.slots[3], fuel = inv.slots[4];
      t.charges = t.charges || 0;
      const can = ing && [0, 1, 2].some(i => inv.slots[i] && brewResult(inv.slots[i].id, ing.id));
      if (can && t.charges <= 0 && fuel && isBrewFuel(fuel.id)) {
        t.charges = 8; fuel.count--; if (fuel.count <= 0) inv.slots[4] = null; inv.changed();
      }
      if (can && t.charges > 0) {
        t.brew = (t.brew || 0) + dt;
        if (Math.random() < dt * 6) game.particles.add({ x: t.x + 0.3 + Math.random() * 0.4, y: t.y + 1.02, z: t.z + 0.3 + Math.random() * 0.4, vx: 0, vy: 0.4 + Math.random() * 0.4, vz: 0, size: 0.06, size0: 0.06, grow: 1.5, r: 0.55, g: 1, b: 0.6, a: 0.8, a0: 0.8, fade: true, layer: -1, life: 0.8, emis: 2, add: true });
        if (t.brew >= BREW_TIME) {
          t.brew = 0; t.charges--;
          for (let i = 0; i < 3; i++) { const b = inv.slots[i]; const r = b && brewResult(b.id, ing.id); if (r) inv.slots[i] = { id: r, count: 1, dmg: 0 }; }
          ing.count--; if (ing.count <= 0) inv.slots[3] = null;
          inv.changed();
          game.audio.play('brew_done', { x: t.x + 0.5, y: t.y + 1, z: t.z + 0.5 });
          game.onBrewed && game.onBrewed();
        }
      } else t.brew = Math.max(0, (t.brew || 0) - dt * 2);
    }
  };
  const prevExt = game.extUpdate;
  game.extUpdate = (dt) => { if (prevExt) prevExt(dt); game.tickBrewing(dt); };

  // ---------------------------------------------------------- Alchemy Table screen
  ui.openBrewing = (x, y, z) => {
    const tile = game.getTile(x, y, z, 'brewing');
    tile.quickMoveIn = (s, ref) => {
      const inv = tile.inv;
      let target = -1;
      if (isBrewFuel(s.id) && (!inv.slots[4] || inv.slots[4].id === s.id)) target = 4;
      else if (isIngredient(s.id) && (!inv.slots[3] || inv.slots[3].id === s.id)) target = 3;
      else if (isBottle(s.id)) target = [0, 1, 2].find(i => !inv.slots[i]) ?? -1;
      if (target < 0) return false;
      if (!inv.slots[target]) { inv.slots[target] = s; if (ref && ref.inv) ref.inv.slots[ref.i] = null; }
      else { const n = Math.min(s.count, ITEMS[s.id].stack - inv.slots[target].count); inv.slots[target].count += n; s.count -= n; if (s.count <= 0 && ref && ref.inv) ref.inv.slots[ref.i] = null; }
      inv.changed();
      return true;
    };
    ui.container = tile;
    game.audio.play('chest_open', { x, y, z });
    ui.openScreen('brewing', (root) => {
      ui.container = tile;
      const panel = el('div', 'panel brewing', root);
      el('h3', '', panel, 'Alchemy Table');
      const box = el('div', 'brewBox', panel);
      const top = el('div', 'brewTop', box);
      const fuelCol = el('div', 'brewFuel', top);
      ui.makeSlot(fuelCol, { inv: tile.inv, i: 4, kind: 'normal', ghost: I.sunstone_shard, accept: (st) => isBrewFuel(st.id) });
      ui.brewCharges = el('div', 'charges', fuelCol); el('i', '', ui.brewCharges);
      ui.makeSlot(top, { inv: tile.inv, i: 3, kind: 'normal', accept: (st) => isIngredient(st.id) });
      ui.brewBubbles = el('div', 'bubbles', top); el('i', '', ui.brewBubbles);
      const row = el('div', 'brewBottles', box);
      for (let i = 0; i < 3; i++) ui.makeSlot(row, { inv: tile.inv, i, kind: 'normal', ghost: I.glass_bottle, accept: (st) => isBottle(st.id) && st.count === 1 });
      el('div', 'hint', panel, 'Water Bottle + Glow Dust → Murky Tonic. Then add: Berries (Healing), Reed Fiber (Swiftness), Carrot (Night Vision), Red Mushroom (Strength), Magma (Fire Resistance), Kelp (Water Breathing). Fuel: Sunstone Shard.');
      ui.playerSlots(panel);
    });
    tile.inv.onChange = () => ui.refreshSlots();
  };

  // ---------------------------------------------------------- Runic Altar screen
  ui.openEnchanting = (x, y, z) => {
    const p = game.player;
    const inv = new Inventory(2);
    // nearby bookshelves strengthen the altar
    let shelves = 0;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 0; dy <= 1; dy++) {
      if (Math.abs(dx) < 2 && Math.abs(dz) < 2) continue;
      if (game.world.getBlock(x + dx, y + dy, z + dz) === B.bookshelf) shelves++;
    }
    shelves = Math.min(15, shelves);
    const tile = { type: 'altar', inv, x, y, z,
      onClose: () => { for (const s of inv.slots) if (s) game.giveItem(s.id, s.count, s.dmg || 0, stackExtra(s)); inv.slots.fill(null); },
      quickMoveIn: (s, ref) => {
        const it = ITEMS[s.id];
        let target = -1;
        if (s.id === I.glowdust || s.id === I.runic_tome) target = 1;
        else if (enchantable(it) && s.count === 1) target = 0;
        if (target < 0) return false;
        const cur = inv.slots[target];
        if (!cur) { inv.slots[target] = s; if (ref && ref.inv) ref.inv.slots[ref.i] = null; }
        else if (cur.id === s.id && s.id === I.glowdust) { const n = Math.min(s.count, 64 - cur.count); cur.count += n; s.count -= n; if (s.count <= 0 && ref && ref.inv) ref.inv.slots[ref.i] = null; }
        else return false;
        inv.changed();
        return true;
      },
    };
    ui.container = tile;
    game.audio.play('magic', { x, y, z });
    ui.openScreen('enchanting', (root) => {
      ui.container = tile;
      const panel = el('div', 'panel altar', root);
      el('h3', '', panel, 'Runic Altar' + (shelves ? ` <small>· ${shelves} bookshelves</small>` : ''));
      const row = el('div', 'altarRow', panel);
      const slots = el('div', 'altarSlots', row);
      ui.makeSlot(slots, { inv, i: 0, kind: 'normal', accept: (st) => st.count === 1 && enchantable(ITEMS[st.id]) });
      ui.makeSlot(slots, { inv, i: 1, kind: 'normal', ghost: I.glowdust, accept: (st) => st.id === I.glowdust || st.id === I.runic_tome });
      const offers = el('div', 'offers', row);
      const lvlEl = el('div', 'altarLevel', panel);
      const render = () => {
        offers.innerHTML = '';
        const item = inv.slots[0], cat = inv.slots[1];
        const lv = xpToLevel(p.xp).level;
        lvlEl.textContent = p.creative ? 'Creative: no cost' : `Your level: ${lv}`;
        if (!item) { el('div', 'offer empty', offers, 'Place gear or a book to see its runes'); return; }
        const it = ITEMS[item.id];
        // binding a Runic Tome onto gear
        if (cat && cat.id === I.runic_tome && it.name !== 'book') {
          const tomeE = cat.ench || {};
          const merged = Object.assign({}, item.ench || {});
          let ok = false;
          for (const k in tomeE) if (ENCHANTS[k] && ENCHANTS[k].applies(it)) { merged[k] = Math.min(ENCHANTS[k].max, merged[k] === tomeE[k] ? tomeE[k] + 1 : Math.max(merged[k] || 0, tomeE[k])); ok = true; }
          const cost = 3 + Object.keys(tomeE).length * 2;
          const b = el('div', 'offer' + (ok && (p.creative || lv >= cost) ? '' : ' locked'), offers, `<b>Bind tome</b><span>${enchantNames(tomeE).join(', ') || '—'}</span><em>${cost} levels</em>`);
          b.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            if (!ok || (!p.creative && lv < cost)) { game.audio.play('click'); return; }
            item.ench = merged; inv.slots[1] = null;
            if (!p.creative) p.xp = Math.max(0, p.xp - (xpForLevel(lv) - xpForLevel(lv - cost)));
            game.audio.play('enchant'); inv.changed(); render();
          });
          return;
        }
        const list = makeOffers(it, game.enchantSeed + (item.ench ? 7 : 0), shelves);
        const dust = cat && cat.id === I.glowdust ? cat.count : 0;
        list.forEach((o, i) => {
          const can = p.creative || (lv >= o.cost && dust >= o.dust);
          const first = Object.keys(o.ench)[0];
          const label = first ? ENCHANTS[first].name + (ENCHANTS[first].max > 1 ? ' ' + ROMAN[o.ench[first]] : '') + (Object.keys(o.ench).length > 1 ? ' …' : '') : '—';
          const b = el('div', 'offer' + (can ? '' : ' locked'), offers, `<b>${label}</b><span>${'ᚠᚢᚦᚨᚱᚲᚷᚹ'.slice(i, i + 3 + (o.cost % 4))}</span><em>${o.cost} lv · ${o.dust} dust</em>`);
          b.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            if (!can) { game.audio.play('click'); return; }
            if (it.name === 'book') inv.slots[0] = { id: I.runic_tome, count: 1, dmg: 0, ench: Object.assign({}, o.ench) };
            else item.ench = Object.assign({}, item.ench || {}, o.ench);
            if (!p.creative) {
              const cur = inv.slots[1]; if (cur) { cur.count -= o.dust; if (cur.count <= 0) inv.slots[1] = null; }
              p.xp = Math.max(0, p.xp - (xpForLevel(lv) - xpForLevel(Math.max(0, lv - (i + 1)))));
            }
            game.enchantSeed = (Math.random() * 1e9) | 0;
            game.audio.play('enchant');
            for (let k = 0; k < 24; k++) game.particles.add({ x: x + 0.5 + (Math.random() - 0.5) * 3, y: y + 1.5 + Math.random(), z: z + 0.5 + (Math.random() - 0.5) * 3, vx: 0, vy: -0.6, vz: 0, size: 0.08, r: 0.4, g: 0.9, b: 1, a: 1, a0: 1, fade: true, layer: -2, life: 1.2, emis: 3, add: true });
            inv.changed(); render();
          });
        });
      };
      tile.render = render;
      el('div', 'hint', panel, 'Costs levels and Glow Dust. Enchant a Book to make a Runic Tome, then bind it onto gear here.');
      ui.playerSlots(panel);
      render();
    });
    inv.onChange = () => { ui.refreshSlots(); if (tile.render) tile.render(); };
  };

  // live progress for the alchemy screen
  const prevHud = ui.updateHUD.bind(ui);
  ui.updateHUD = (dt) => {
    prevHud(dt);
    if (ui.screen === 'brewing' && ui.container && ui.brewBubbles) {
      const t = ui.container;
      ui.brewBubbles.firstChild.style.height = ((t.brew || 0) / BREW_TIME * 100) + '%';
      ui.brewCharges.firstChild.style.width = ((t.charges || 0) / 8 * 100) + '%';
    }
    updateEffectsHUD(game, dt);
    updateLevelHUD(game);
  };
}

function hexRGB(h) { const v = parseInt(h.slice(1), 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; }

function updateEffectsHUD(game, dt) {
  const ui = game.ui, p = game.player;
  if (!ui.effectsEl) { ui.effectsEl = el('div', '', ui.hud); ui.effectsEl.id = 'effects'; ui._effT = 0; }
  ui._effT -= dt;
  if (ui._effT > 0) return;
  ui._effT = 0.25;
  let html = '';
  for (const k in p.effects) {
    const info = EFFECT_INFO[k];
    if (!info) continue;
    const t = Math.ceil(p.effects[k]);
    html += `<div class="eff" style="--c:${info[1]}"><i></i>${info[0]}<span>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</span></div>`;
  }
  if (html !== ui._effHtml) { ui._effHtml = html; ui.effectsEl.innerHTML = html; }
}

function updateLevelHUD(game) {
  const ui = game.ui, p = game.player;
  if (!ui.xpEl) return;
  const L = xpToLevel(p.xp);
  ui.xpEl.firstChild.style.width = (L.frac * 100) + '%';
  if (!ui.lvlEl) { ui.lvlEl = el('span', 'lvl', ui.xpEl); }
  const txt = L.level > 0 ? String(L.level) : '';
  if (ui.lvlEl.textContent !== txt) ui.lvlEl.textContent = txt;
}
