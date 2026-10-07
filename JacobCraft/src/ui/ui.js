// HTML user interface: HUD, container screens with Minecraft-style slot handling, recipe book, chat.
import { ITEMS, I, maxStack } from '../game/items.js';
import { SMELT, RECIPES, matchCrafting, recipeIngredients, ingredientMatches, canCraftWith } from '../game/recipes.js';
import { Inventory, sameItem, cloneStack, stackExtra } from '../game/inventory.js';
import { drawPlayerPortrait } from '../game/playerModel.js';

const el = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
};

// ---------- tiny pixel icons for HUD stats ----------
const ICON_MASKS = {
  heart: ['..##.##..', '.#HH#RR#.', '#HRRRRRR#', '#RRRRRRR#', '#RRRRRRR#', '.#RRRRR#.', '..#RRR#..', '...#R#...', '....#....'],
  food: ['......##.', '.....#WW#', '....#WW#.', '..###W#..', '.#MMM#...', '#MmMMM#..', '#MMMMM#..', '#MMMM#...', '.####....'],
  armor: ['.##...##.', '#AA###AA#', '#AHAAAAA#', '.#AAAAA#.', '.#AHAAA#.', '.#AAAAA#.', '.#AAAAA#.', '.#######.', '.........'],
  bubble: ['...###...', '..#...#..', '.#.H...#.', '.#.H...#.', '.#.....#.', '..#...#..', '...###...', '.........', '.........'],
};
function drawMask(mask, colors, half = false, emptyColors = null) {
  const c = document.createElement('canvas'); c.width = 9; c.height = 9;
  const ctx = c.getContext('2d');
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const ch = mask[y][x];
    if (ch === '.') continue;
    let col = colors[ch] || '#000';
    if (half && x >= 4 && emptyColors) col = emptyColors[ch] || col;
    ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1);
  }
  return c.toDataURL();
}
const STAT_ICONS = {
  heartFull: drawMask(ICON_MASKS.heart, { '#': '#1a0505', R: '#e0161e', H: '#ff9a9a' }),
  heartHalf: drawMask(ICON_MASKS.heart, { '#': '#1a0505', R: '#e0161e', H: '#ff9a9a' }, true, { R: '#3a2a2a', H: '#4a3a3a' }),
  heartEmpty: drawMask(ICON_MASKS.heart, { '#': '#1a0505', R: '#3a2a2a', H: '#4a3a3a' }),
  heartPoison: drawMask(ICON_MASKS.heart, { '#': '#05140a', R: '#6a9a1e', H: '#b8e070' }),
  foodFull: drawMask(ICON_MASKS.food, { '#': '#2a1404', M: '#b2622a', m: '#e09a5a', W: '#f0e6d4' }),
  foodHalf: drawMask(ICON_MASKS.food, { '#': '#2a1404', M: '#b2622a', m: '#e09a5a', W: '#f0e6d4' }, true, { M: '#3a2a20', m: '#4a3a30', W: '#5a5048' }),
  foodEmpty: drawMask(ICON_MASKS.food, { '#': '#2a1404', M: '#3a2a20', m: '#4a3a30', W: '#5a5048' }),
  armorFull: drawMask(ICON_MASKS.armor, { '#': '#1e1e1e', A: '#c8c8c8', H: '#ffffff' }),
  armorHalf: drawMask(ICON_MASKS.armor, { '#': '#1e1e1e', A: '#c8c8c8', H: '#ffffff' }, true, { A: '#3a3a3a', H: '#3a3a3a' }),
  armorEmpty: drawMask(ICON_MASKS.armor, { '#': '#1e1e1e', A: '#3a3a3a', H: '#3a3a3a' }),
  bubble: drawMask(ICON_MASKS.bubble, { '#': '#2a5aa8', H: '#ffffff' }),
};

const TABS = [['all', 'All'], ['basic', 'Basic'], ['tools', 'Tools'], ['combat', 'Combat'], ['building', 'Build'], ['food', 'Food'], ['storage', 'Store'], ['magic', 'Magic'], ['misc', 'Misc'], ['smelt', 'Smelt']];

export class UI {
  constructor(game, icons) {
    this.g = game;
    this.icons = icons;
    this.root = document.getElementById('ui');
    this.screen = null;
    this.hotbarDirty = true;
    this.hover = null;
    this.slotEls = [];
    this.bookTab = 'all';
    this.bookSearch = '';
    this.chatOpen = false;
    this.messages = [];
    this.showDebug = false;
    this.hudHidden = false;
    this.buildHUD();
    this.cursorEl = el('div', 'hidden', document.body); this.cursorEl.id = 'cursorStack';
    this.tooltipEl = el('div', 'hidden', document.body); this.tooltipEl.id = 'tooltip';
    addEventListener('mousemove', (e) => {
      this.mx = e.clientX; this.my = e.clientY;
      this.cursorEl.style.left = (e.clientX - 20) + 'px'; this.cursorEl.style.top = (e.clientY - 20) + 'px';
      this.tooltipEl.style.left = (e.clientX + 16) + 'px'; this.tooltipEl.style.top = (e.clientY - 26) + 'px';
    });
    addEventListener('keydown', (e) => this.onKey(e));
  }

  icon(id) { return this.icons.icons[id] || ''; }

  // =================================================================== HUD
  buildHUD() {
    const hud = this.hud = el('div', '', this.root); hud.id = 'hud';
    el('div', '', hud).id = 'crosshair';
    this.atkEl = el('div', '', hud); this.atkEl.id = 'atkMeter'; el('i', '', this.atkEl);   // attack recharge
    this.debugEl = el('div', 'hidden', hud); this.debugEl.id = 'debug';
    this.fpsEl = el('div', 'hidden', hud); this.fpsEl.id = 'fps';
    this.bossEl = el('div', 'hidden', hud); this.bossEl.id = 'bossbar';
    this.bossEl.innerHTML = '<div class="nm"></div><div class="bar"><i></i></div>';
    this.chatEl = el('div', '', hud); this.chatEl.id = 'chat';
    this.toastEl = el('div', '', hud); this.toastEl.id = 'toast';
    this.subEl = el('div', '', hud); this.subEl.id = 'subtitle'; this.subEl.style.opacity = 0;
    this.itemNameEl = el('div', '', hud); this.itemNameEl.id = 'itemName';
    const wrap = el('div', '', hud); wrap.id = 'hotbarWrap';
    const stats = el('div', '', wrap); stats.id = 'stats';
    const left = el('div', 'statCol', stats);
    this.armorRow = el('div', 'statRow', left);
    this.heartRow = el('div', 'statRow', left);
    const right = el('div', 'statCol', stats);
    this.airRow = el('div', 'statRow right', right);
    this.foodRow = el('div', 'statRow right', right);
    this.hearts = []; this.foods = []; this.armors = []; this.bubbles = [];
    for (let i = 0; i < 10; i++) {
      this.hearts.push(el('img', '', this.heartRow));
      this.foods.push(el('img', '', this.foodRow));
      this.armors.push(el('img', '', this.armorRow));
      this.bubbles.push(el('img', '', this.airRow));
    }
    this.xpEl = el('div', '', wrap); this.xpEl.id = 'xpbar'; el('i', '', this.xpEl);
    const hb = el('div', '', wrap); hb.id = 'hotbar';
    this.hslots = [];
    for (let i = 0; i < 9; i++) this.hslots.push(el('div', 'hslot', hb));
    this.offSlot = el('div', 'hslot offhand', hb);   // off-hand, shown left of the hotbar when it holds something
    this.sleepEl = el('div', '', hud); this.sleepEl.id = 'sleepFade';
    this.flashEl = el('div', '', hud); this.flashEl.id = 'screenFlash';
  }

  // short status line above the hotbar (reuses the item-name slot)
  actionText(text, time = 1.6) {
    this.itemNameEl.textContent = text;
    this.itemNameEl.style.opacity = 1;
    this.itemNameTimer = time;
  }

  setHudVisible(v) { this.hud.classList.toggle('hidden', !v); }

  renderStackInto(div, s) {
    div.innerHTML = '';
    if (!s) return;
    const img = el('img', 'icon', div); img.src = this.icon(s.id); img.draggable = false;
    if (s.ench && Object.keys(s.ench).length) el('i', 'glint', div);
    if (s.count > 1) el('span', 'cnt', div, String(s.count));
    const it = ITEMS[s.id];
    const dur = it.tool ? it.tool.dur : it.armor ? it.armor.dur : 0;
    if (dur && s.dmg > 0) {
      const f = Math.max(0, 1 - s.dmg / dur);
      const d = el('div', 'dur', div);
      const bar = el('i', '', d);
      bar.style.width = (f * 100) + '%';
      bar.style.background = `hsl(${f * 120}, 90%, 50%)`;
    }
  }

  updateHUD(dt) {
    const g = this.g, p = g.player;
    if (!p) return;
    if (this.hotbarDirty) {
      for (let i = 0; i < 9; i++) this.renderStackInto(this.hslots[i], p.inventory.slots[i]);
      if (p.offhand) { this.renderStackInto(this.offSlot, p.offhand.slots[0]); this.offSlot.classList.toggle('on', !!p.offhand.slots[0]); }
      this.hotbarDirty = false;
    }
    for (let i = 0; i < 9; i++) this.hslots[i].classList.toggle('sel', i === p.selected);
    {
      const hs = p.held(), tl = hs && ITEMS[hs.id] ? ITEMS[hs.id].tool : null;
      const melee = !tl || !['bow', 'crossbow', 'gun', 'shield', 'spyglass', 'wand', 'rod'].includes(tl.type);
      const ready = g.interaction && g.interaction.attackReady ? g.interaction.attackReady() : 1;
      this.atkEl.style.opacity = melee && ready < 1 && !p.creative ? 1 : 0;
      this.atkEl.firstChild.style.width = Math.round(ready * 100) + '%';
    }
    const surv = !p.creative;
    this.heartRow.parentElement.style.opacity = surv ? 1 : 0;
    this.foodRow.parentElement.style.opacity = surv ? 1 : 0;
    if (surv) {
      const hp = Math.ceil(p.health);
      const poison = p.effects.poison;
      const shake = p.health <= 4 ? 1 : 0;
      const nh = Math.ceil(p.maxHealth / 2);
      while (this.hearts.length < nh) this.hearts.push(el('img', '', this.heartRow));
      for (let i = 0; i < this.hearts.length; i++) this.hearts[i].style.display = i < nh ? '' : 'none';
      for (let i = 0; i < 10; i++) {
        const f = p.food - i * 2;
        const fs = f >= 2 ? STAT_ICONS.foodFull : f === 1 ? STAT_ICONS.foodHalf : STAT_ICONS.foodEmpty;
        if (this.foods[i].src !== fs) this.foods[i].src = fs;
      }
      for (let i = 0; i < nh; i++) {
        const v = hp - i * 2;
        const src = v >= 2 ? (poison ? STAT_ICONS.heartPoison : STAT_ICONS.heartFull) : v === 1 ? STAT_ICONS.heartHalf : STAT_ICONS.heartEmpty;
        if (this.hearts[i].src !== src) this.hearts[i].src = src;
        this.hearts[i].style.transform = shake ? `translateY(${(Math.random() - 0.5) * 3}px)` : '';
      }
      const ap = p.armorPoints();
      this.armorRow.style.opacity = ap > 0 ? 1 : 0;
      for (let i = 0; i < 10; i++) {
        const v = ap - i * 2;
        const src = v >= 2 ? STAT_ICONS.armorFull : v === 1 ? STAT_ICONS.armorHalf : STAT_ICONS.armorEmpty;
        if (this.armors[i].src !== src) this.armors[i].src = src;
      }
      const underwater = p.liquid.eyeInWater || p.air < p.maxAir;
      this.airRow.style.display = underwater ? 'flex' : 'none';
      const bubbles = Math.ceil(p.air / p.maxAir * 10);
      for (let i = 0; i < 10; i++) { if (!this.bubbles[i].src) this.bubbles[i].src = STAT_ICONS.bubble; this.bubbles[i].style.opacity = i < bubbles ? 1 : 0; }
    }
    this.xpEl.style.opacity = surv ? 1 : 0;
    this.xpEl.firstChild.style.width = ((p.xp % 100)) + '%';
    // item name fade
    if (this._lastSel !== p.selected || this._lastSelId !== (p.held() ? p.held().id : 0)) {
      this._lastSel = p.selected; this._lastSelId = p.held() ? p.held().id : 0;
      const s = p.held();
      this.itemNameEl.textContent = s ? ITEMS[s.id].label : '';
      this.itemNameEl.style.opacity = 1;
      this.itemNameTimer = 2;
    }
    if (this.itemNameTimer > 0) { this.itemNameTimer -= dt; if (this.itemNameTimer <= 0) this.itemNameEl.style.opacity = 0; }
    this.itemNameEl.style.bottom = (surv ? 112 : 70) + 'px';
    // chat fade
    const now = performance.now();
    for (const m of this.messages) {
      const age = (now - m.t) / 1000;
      m.el.style.opacity = this.chatOpen ? 1 : age > 9 ? Math.max(0, 1 - (age - 9)) : 1;
    }
    if (this.messages.length > 12) { const m = this.messages.shift(); m.el.remove(); }
    // furnace screen live update
    if (this.screen === 'furnace') this.updateFurnaceUI();
    // explosion / muzzle flash
    if (g.flashT > 0) g.flashT = Math.max(0, g.flashT - dt);
    const fo = g.settings.flashes === false ? 0 : Math.min(0.5, (g.flashT || 0) * 5);
    if (fo !== this._flashO) { this._flashO = fo; this.flashEl.style.opacity = fo; }
  }

  setDebug(text) {
    this.debugEl.classList.toggle('hidden', !this.showDebug);
    if (this.showDebug) this.debugEl.textContent = text;
  }

  setFPS(text, show) { this.fpsEl.classList.toggle('hidden', !show); this.fpsEl.textContent = text; }

  boss(name, frac, elite = false) {
    if (name === null) { this.bossEl.classList.add('hidden'); return; }
    this.bossEl.classList.remove('hidden');
    this.bossEl.classList.toggle('elite', !!elite);
    this.bossEl.querySelector('.nm').textContent = name;
    this.bossEl.querySelector('i').style.width = Math.max(0, frac * 100) + '%';
  }

  chat(text, color = '#fff') {
    const m = el('div', 'msg', this.chatEl);
    m.textContent = text; m.style.color = color;
    this.messages.push({ el: m, t: performance.now() });
  }

  jumpBar(v) {
    if (!this.jumpEl) { this.jumpEl = el('div', '', this.hud); this.jumpEl.id = 'jumpBar'; el('i', '', this.jumpEl); }
    if (v < 0) { this.jumpEl.style.opacity = 0; return; }
    this.jumpEl.style.opacity = 1;
    this.jumpEl.firstChild.style.width = Math.round(v * 100) + '%';
    this.jumpEl.classList.toggle('full', v >= 1);
  }

  // a quiet line of text above the hotbar's left end (recipe discoveries and the like), never more than three
  notice(text, iconId = 0) {
    if (!this.noticeEl) { this.noticeEl = el('div', '', this.hud); this.noticeEl.id = 'notices'; }
    while (this.noticeEl.children.length >= 3) this.noticeEl.firstChild.remove();
    const n = el('div', 'n', this.noticeEl);
    if (iconId) { const im = el('img', '', n); im.src = this.icon(iconId); }
    el('span', '', n, text);
    setTimeout(() => n.classList.add('out'), 3800);
    setTimeout(() => n.remove(), 4600);
  }

  toast(title, text) {
    const t = el('div', 't', this.toastEl, `<b>${title}</b>${text}`);
    setTimeout(() => t.remove(), 5000);
  }

  subtitle(text, small = '', time = 3) {
    this.subEl.innerHTML = text + (small ? `<small>${small}</small>` : '');
    this.subEl.style.opacity = 1;
    clearTimeout(this._subT);
    this._subT = setTimeout(() => { this.subEl.style.opacity = 0; }, time * 1000);
  }

  // =================================================================== screens
  get isOpen() { return !!this.screen; }

  openScreen(name, build) {
    this.closeScreen(true);
    this.screen = name;
    this.slotEls = [];
    this.screenEl = el('div', '', this.root); this.screenEl.id = 'screen';
    this.screenEl.addEventListener('mousedown', (e) => { if (e.target === this.screenEl && this.screen !== 'pause') this.closeScreen(); });
    this.screenEl.addEventListener('contextmenu', (e) => e.preventDefault());
    build(this.screenEl);
    this.g.onScreenOpen && this.g.onScreenOpen(name);
    this.refreshSlots();
  }

  closeScreen(silent = false) {
    if (!this.screen) return;
    const g = this.g, p = g.player;
    // return crafting grid & cursor
    if (this.craftInv) {
      for (const s of this.craftInv.slots) if (s) g.giveItem(s.id, s.count, s.dmg, stackExtra(s));
      this.craftInv = null;
    }
    if (p && p.cursor) { g.giveItem(p.cursor.id, p.cursor.count, p.cursor.dmg, stackExtra(p.cursor)); p.cursor = null; }
    if (this.container && this.container.onClose) this.container.onClose();
    this.screenEl && this.screenEl.remove();
    this.screenEl = null;
    const was = this.screen;
    this.screen = null;
    this.slotEls = [];
    this.bookGrid = null; this.furnArrow = null; this.flameEl = null;
    if (this.container && this.container.inv) this.container.inv.onChange = null;
    this.container = null;
    this.hover = null;
    this.cursorEl.classList.add('hidden');
    this.tooltipEl.classList.add('hidden');
    this.hotbarDirty = true;
    if (!silent) this.g.onScreenClose && this.g.onScreenClose(was);
  }

  // slot management
  makeSlot(parent, ref, big = false) {
    const d = el('div', 'slot' + (big ? ' big' : ''), parent);
    d.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); this.clickSlot(ref, e.button, e.shiftKey); });
    d.addEventListener('mouseenter', () => { this.hover = ref; this.showTooltip(ref); });
    d.addEventListener('mouseleave', () => { if (this.hover === ref) { this.hover = null; this.tooltipEl.classList.add('hidden'); } });
    ref.el = d;
    this.slotEls.push(ref);
    return d;
  }

  slotGrid(parent, inv, from, count, cols, kind = 'normal') {
    const grid = el('div', 'slots', parent);
    grid.style.gridTemplateColumns = `repeat(${cols}, var(--slot-size))`;
    for (let i = 0; i < count; i++) this.makeSlot(grid, { inv, i: from + i, kind });
    return grid;
  }

  playerSlots(parent) {
    const p = this.g.player;
    const c = el('div', 'col', parent);
    el('h3', '', c, 'Inventory');
    this.slotGrid(c, p.inventory, 9, 27, 9, 'main');
    const sp = el('div', '', c); sp.style.height = '6px';
    this.slotGrid(c, p.inventory, 0, 9, 9, 'hotbar');
    return c;
  }

  getStack(ref) {
    if (ref.kind === 'craftOut') return this.craftResult ? { id: this.craftResult.result, count: this.craftResult.count, dmg: 0 } : null;
    if (ref.kind === 'creative') return { id: ref.id, count: maxStack(ref.id), dmg: 0 };
    if (!ref.inv) return null;   // trash and other inventory-less slots
    return ref.inv.slots[ref.i];
  }

  refreshSlots() {
    if (!this.screen) return;
    if (this.craftInv) this.updateCraftResult();
    for (const ref of this.slotEls) {
      if (ref.kind === 'creative') continue;
      const s = this.getStack(ref);
      this.renderStackInto(ref.el, s);
      if (!s && ref.ghost) { const g = el('img', 'icon ghost', ref.el); g.src = this.icon(ref.ghost); g.style.cssText = 'position:absolute;inset:4px;width:calc(100% - 8px);height:calc(100% - 8px);opacity:0.25;filter:grayscale(1)'; }
    }
    const c = this.g.player.cursor;
    if (c) { this.cursorEl.classList.remove('hidden'); this.cursorEl.innerHTML = ''; const img = el('img', '', this.cursorEl); img.src = this.icon(c.id); if (c.count > 1) el('span', 'cnt', this.cursorEl, String(c.count)); }
    else this.cursorEl.classList.add('hidden');
    if (this.bookGrid) this.renderBook();
    if (this.hover) this.showTooltip(this.hover);
    this.hotbarDirty = true;
  }

  showTooltip(ref) {
    const s = ref.kind === 'creative' ? { id: ref.id, count: 1 } : this.getStack(ref);
    if (!s || this.g.player.cursor) { this.tooltipEl.classList.add('hidden'); return; }
    const it = ITEMS[s.id];
    let html = `<div class="${it.rare ? 'rare' : ''}">${it.label}</div>`;
    if (it.tool && it.tool.dur) html += `<div class="sub">Durability: ${it.tool.dur - (s.dmg || 0)} / ${it.tool.dur}</div>`;
    if (it.tool && it.tool.dmg) html += `<div class="sub">${it.tool.dmg.toFixed(1)} attack damage</div>`;
    if (it.armor) html += `<div class="sub">+${it.armor.pts} armor · ${it.armor.dur - (s.dmg || 0)} / ${it.armor.dur}</div>`;
    if (it.food) html += `<div class="sub">Restores ${it.food[0] / 2} hunger</div>`;
    if (s.ench && this.g.enchantNames) for (const line of this.g.enchantNames(s.ench)) html += `<div class="ench">${line}</div>`;
    if (s.loaded) html += `<div class="sub" style="color:#ffd27a">Loaded</div>`;
    if (it.potion && this.g.potionInfo) { const pi = this.g.potionInfo(it.potion); if (pi) html += `<div class="sub" style="color:${pi.color}">${pi.text}</div>`; }
    if (it.desc) html += `<div class="sub desc">${it.desc}</div>`;
    this.tooltipEl.innerHTML = html;
    this.tooltipEl.classList.remove('hidden');
  }

  // core click logic
  clickSlot(ref, button, shift) {
    const g = this.g, p = g.player;
    if (button === 1) { // middle: creative clone
      const s = this.getStack(ref);
      if (s && p.creative && !p.cursor) p.cursor = { id: s.id, count: maxStack(s.id), dmg: 0 };
      this.refreshSlots(); return;
    }
    if (ref.kind === 'creative') {
      if (shift) g.giveItem(ref.id, maxStack(ref.id));
      else if (p.cursor && p.cursor.id === ref.id) p.cursor.count = Math.min(maxStack(ref.id), p.cursor.count + (button === 2 ? 1 : maxStack(ref.id)));
      else if (p.cursor) p.cursor = null;
      else p.cursor = { id: ref.id, count: button === 2 ? 1 : maxStack(ref.id), dmg: 0 };
      this.refreshSlots(); g.audio && g.audio.play('click'); return;
    }
    if (ref.kind === 'trash') { p.cursor = null; this.refreshSlots(); return; }
    if (ref.kind === 'craftOut') { this.takeCraft(shift); return; }
    if (ref.kind === 'output') {
      const s = ref.inv.slots[ref.i];
      if (!s) return;
      if (shift) { const left = p.inventory.add(s.id, s.count, s.dmg || 0, g.inventoryOrder(), stackExtra(s)); ref.inv.set(ref.i, left ? Object.assign({ id: s.id, count: left, dmg: 0 }, stackExtra(s) || {}) : null); }
      else if (!p.cursor) { p.cursor = s; ref.inv.set(ref.i, null); }
      else if (sameItem(p.cursor, s) && p.cursor.count + s.count <= maxStack(s.id)) { p.cursor.count += s.count; ref.inv.set(ref.i, null); }
      if (ref.onTake) ref.onTake(s);
      this.refreshSlots(); return;
    }
    const inv = ref.inv, i = ref.i;
    const s = inv.slots[i];
    if (shift && s) { this.quickMove(ref); this.refreshSlots(); return; }
    // armor slot restrictions
    const accepts = (st) => {
      if (!st) return true;
      if (ref.accept) return ref.accept(st);
      if (ref.kind === 'armor') { const a = ITEMS[st.id].armor; return a && a.slot === ref.armorSlot; }
      if (ref.kind === 'fuel') return true;
      return true;
    };
    const c = p.cursor;
    if (button === 0) {
      if (!c && s) { p.cursor = s; inv.slots[i] = null; }
      else if (c && !s) { if (!accepts(c)) return; inv.slots[i] = c; p.cursor = null; }
      else if (c && s) {
        if (sameItem(c, s)) {
          const ms = maxStack(s.id);
          const n = Math.min(c.count, ms - s.count);
          s.count += n; c.count -= n;
          if (c.count <= 0) p.cursor = null;
        } else if (accepts(c)) { inv.slots[i] = c; p.cursor = s; }
      }
    } else if (button === 2) {
      if (!c && s) {
        const half = Math.ceil(s.count / 2);
        p.cursor = { id: s.id, count: half, dmg: s.dmg || 0 };
        s.count -= half;
        if (s.count <= 0) inv.slots[i] = null;
      } else if (c && !s) {
        if (!accepts(c)) return;
        inv.slots[i] = { id: c.id, count: 1, dmg: c.dmg || 0 };
        c.count--; if (c.count <= 0) p.cursor = null;
      } else if (c && s) {
        if (sameItem(c, s) && s.count < maxStack(s.id)) { s.count++; c.count--; if (c.count <= 0) p.cursor = null; }
        else if (!sameItem(c, s) && accepts(c)) { inv.slots[i] = c; p.cursor = s; }
      }
    }
    inv.changed();
    g.audio && g.audio.play('click');
    this.refreshSlots();
  }

  quickMove(ref) {
    const g = this.g, p = g.player;
    const s = ref.inv.slots[ref.i];
    if (!s) return;
    const it = ITEMS[s.id];
    const pinv = p.inventory;
    let targets = null;
    if (ref.inv === pinv) {
      // armor auto-equip
      if (it.armor && (this.screen === 'inventory') && !p.armor.slots[it.armor.slot]) {
        p.armor.set(it.armor.slot, s); ref.inv.set(ref.i, null); return;
      }
      if (this.container && this.container.quickMoveIn) { if (this.container.quickMoveIn(s, ref)) { pinv.changed(); return; } }
      if (this.container) {
        // furnace: smeltable -> input, fuel -> fuel slot
        if (this.screen === 'furnace') {
          const tile = this.container;
          const fuel = g.fuelValue(s.id) > 0;
          const smelt = g.smeltable(s.id);
          const slot = smelt ? 0 : fuel ? 1 : -1;
          if (slot < 0) targets = null;
          else {
            const cur = tile.inv.slots[slot];
            if (!cur) { tile.inv.set(slot, s); ref.inv.set(ref.i, null); return; }
            if (sameItem(cur, s)) { const n = Math.min(s.count, maxStack(s.id) - cur.count); cur.count += n; s.count -= n; if (!s.count) ref.inv.set(ref.i, null); tile.inv.changed(); return; }
            return;
          }
        } else {
          const left = this.container.inv.add(s.id, s.count, s.dmg || 0, null, stackExtra(s));
          s.count = left; if (!left) ref.inv.set(ref.i, null);
          pinv.changed(); return;
        }
      }
      targets = ref.i < 9 ? [...Array(27).keys()].map(k => k + 9) : [...Array(9).keys()];
      const left = pinv.add(s.id, s.count, s.dmg || 0, targets, stackExtra(s));
      if (left === s.count) return;
      // add() modified other slots; current slot still holds original stack object
      s.count = left; if (!left) pinv.slots[ref.i] = null;
      pinv.changed();
    } else {
      const left = pinv.add(s.id, s.count, s.dmg || 0, g.inventoryOrder(true), stackExtra(s));
      s.count = left; if (!left) ref.inv.slots[ref.i] = null;
      ref.inv.changed();
    }
  }

  // ---------- crafting ----------
  updateCraftResult() {
    const inv = this.craftInv;
    const grid = inv.slots.map(s => s ? s.id : 0);
    this.craftResult = matchCrafting(grid, this.craftW, this.craftW);
  }

  takeCraft(shift) {
    const g = this.g, p = g.player;
    const r = this.craftResult;
    if (!r) return;
    const doOne = () => {
      const cur = matchCrafting(this.craftInv.slots.map(s => s ? s.id : 0), this.craftW, this.craftW);
      if (!cur || cur !== r) return false;
      if (shift) {
        const left = p.inventory.add(r.result, r.count, 0, g.inventoryOrder());
        if (left) { if (left === r.count) return false; g.entities.dropItem(p.x, p.y + 1, p.z, r.result, left); }
      } else {
        if (p.cursor && (p.cursor.id !== r.result || p.cursor.count + r.count > maxStack(r.result))) return false;
        if (p.cursor) p.cursor.count += r.count; else p.cursor = { id: r.result, count: r.count, dmg: 0 };
      }
      for (let k = 0; k < this.craftInv.size; k++) {
        const s = this.craftInv.slots[k];
        if (!s) continue;
        const it = ITEMS[s.id];
        s.count--;
        if (it.fill && it.name.endsWith('bucket')) { this.craftInv.slots[k] = { id: I.bucket, count: 1, dmg: 0 }; continue; }
        if (s.count <= 0) this.craftInv.slots[k] = null;
      }
      g.onCraft && g.onCraft(r.result, r.count);
      return true;
    };
    if (shift) { let n = 0; while (n < 64 && doOne()) n++; }
    else doOne();
    g.audio && g.audio.play('craft');
    this.craftInv.changed();
    this.refreshSlots();
  }

  craftingPanel(parent, w) {
    this.craftW = w;
    this.craftInv = new Inventory(w * w);
    const row = el('div', 'row', parent);
    this.slotGrid(row, this.craftInv, 0, w * w, w, 'craft');
    el('div', 'arrow', row);
    this.makeSlot(row, { kind: 'craftOut' }, true);
    return row;
  }

  recipeBook(parent) {
    const book = el('div', 'book', parent);
    const search = el('input', '', book);
    search.placeholder = 'Search recipes…';
    search.value = this.bookSearch;
    search.addEventListener('focus', () => { this.g.input.textFocus = true; });
    search.addEventListener('blur', () => { this.g.input.textFocus = false; });
    search.addEventListener('input', () => { this.bookSearch = search.value.toLowerCase(); this.renderBook(); });
    search.addEventListener('keydown', (e) => e.stopPropagation());
    const tabs = el('div', 'tabs', book);
    for (const [k, lab] of TABS) {
      const b = el('button', k === this.bookTab ? 'on' : '', tabs, lab);
      b.addEventListener('mousedown', (e) => { e.stopPropagation(); this.bookTab = k; [...tabs.children].forEach(c => c.classList.remove('on')); b.classList.add('on'); this.renderBook(); });
    }
    this.bookGrid = el('div', 'grid', book);
    this.renderBook();
  }

  renderBook() {
    const grid = this.bookGrid;
    if (!grid) return;
    const p = this.g.player;
    const counts = p.inventory.countsMap();
    if (this.craftInv) for (const s of this.craftInv.slots) if (s) counts.set(s.id, (counts.get(s.id) || 0) + s.count);
    const seen = new Set();
    const list = [];
    const g = this.g;
    if (this.bookTab === 'smelt') { this.renderSmeltBook(grid); return; }
    const lockedRes = new Set(), shownRes = new Set();
    for (const r of RECIPES) {
      if (this.bookTab !== 'all' && r.group !== this.bookTab) continue;
      if (g.recipeUnlocked && !g.recipeUnlocked(r)) { lockedRes.add(r.result); continue; }
      if (r.type === 'shaped' && (r.w > this.craftW || r.h > this.craftW)) continue;
      if (r.type === 'shapeless' && r.ings.length > this.craftW * this.craftW) continue;
      const it = ITEMS[r.result];
      if (this.bookSearch && !it.label.toLowerCase().includes(this.bookSearch)) continue;
      const key = r.result + ':' + (r.type === 'shaped' ? r.pattern.join('|') : r.ings.join('+'));
      if (seen.has(key)) continue; seen.add(key);
      const can = p.creative || canCraftWith(r, counts);
      list.push([r, can]); shownRes.add(r.result);
    }
    list.sort((a, b) => (b[1] - a[1]));
    grid.innerHTML = '';
    const fresh = g.freshRecipes;
    for (const [r, can] of list.slice(0, 200)) {
      const isNew = fresh && fresh.has(r.result);
      const d = el('div', 'r' + (can ? '' : ' no') + (isNew ? ' new' : ''), grid);
      const img = el('img', '', d); img.src = this.icon(r.result);
      if (r.count > 1) el('span', 'cnt', d, String(r.count));
      d.title = ITEMS[r.result].label + '\n' + this.describeRecipe(r);
      d.addEventListener('mousedown', (e) => { e.stopPropagation(); if (can) this.autoFill(r, e.shiftKey); });
      if (isNew) d.addEventListener('mouseenter', () => { fresh.delete(r.result); d.classList.remove('new'); });
    }
    let hidden = 0;
    for (const id of lockedRes) if (!shownRes.has(id)) hidden++;
    if (hidden > 0 && !this.bookSearch) el('div', 'locked', grid, `${hidden} more recipe${hidden > 1 ? 's' : ''} to discover. Gather new materials to reveal them.`);
  }

  // furnace recipes: shown as information (what goes in, what comes out)
  renderSmeltBook(grid) {
    const g = this.g;
    grid.innerHTML = '';
    let hidden = 0;
    const seenOut = new Set();
    for (const [inName, outName] of Object.entries(SMELT)) {
      const a = I[inName], b = I[outName];
      if (a === undefined || b === undefined) continue;
      if (this.bookSearch && !ITEMS[b].label.toLowerCase().includes(this.bookSearch) && !ITEMS[a].label.toLowerCase().includes(this.bookSearch)) continue;
      if (g.smeltUnlocked && !g.smeltUnlocked(inName)) { hidden++; continue; }
      const key = inName + '>' + outName;
      if (seenOut.has(key)) continue; seenOut.add(key);
      const d = el('div', 'r smelt', grid);
      const i1 = el('img', 'in', d); i1.src = this.icon(a);
      const i2 = el('img', '', d); i2.src = this.icon(b);
      d.title = `${ITEMS[a].label} → ${ITEMS[b].label}\nSmelt it in a furnace (or cook it on a campfire).`;
    }
    if (hidden > 0 && !this.bookSearch) el('div', 'locked', grid, `${hidden} more to discover.`);
  }

  describeRecipe(r) {
    const parts = [];
    for (const [ing, n] of recipeIngredients(r)) {
      const name = ing.startsWith('#') ? 'any ' + ing.slice(1) : (ITEMS[I[ing]] ? ITEMS[I[ing]].label : ing);
      parts.push(`${n}× ${name}`);
    }
    return parts.join(', ');
  }

  autoFill(r, max) {
    const g = this.g, p = g.player;
    const inv = this.craftInv;
    // return current grid items
    for (let k = 0; k < inv.size; k++) { const s = inv.slots[k]; if (s) { g.giveItem(s.id, s.count, s.dmg); inv.slots[k] = null; } }
    const w = this.craftW;
    const cells = [];
    if (r.type === 'shaped') {
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
        const ch = r.pattern[y][x];
        if (ch !== '.' && ch !== ' ') cells.push([y * w + x, r.key[ch]]);
      }
    } else r.ings.forEach((ing, k) => cells.push([k, ing]));
    const times = max ? 64 : 1;
    for (let t = 0; t < times; t++) {
      let ok = true;
      for (const [slot, ing] of cells) {
        const cur = inv.slots[slot];
        let found = -1;
        for (let k = 0; k < 36; k++) {
          const s = p.inventory.slots[k];
          if (s && ingredientMatches(ing, s.id) && (!cur || sameItem(cur, s))) { found = k; break; }
        }
        if (found < 0) {
          if (p.creative) { const id = ing.startsWith('#') ? this.anyMatching(ing) : I[ing]; if (cur) cur.count++; else inv.slots[slot] = { id, count: 1, dmg: 0 }; continue; }
          ok = false; break;
        }
        const s = p.inventory.slots[found];
        if (cur && cur.count >= maxStack(cur.id)) { ok = false; break; }
        s.count--;
        if (s.count <= 0) p.inventory.slots[found] = null;
        if (cur) cur.count++; else inv.slots[slot] = { id: s.id, count: 1, dmg: s.dmg || 0 };
      }
      if (!ok) break;
    }
    p.inventory.changed(); inv.changed();
    this.refreshSlots();
  }

  anyMatching(tag) { for (const it of ITEMS) if (it && ingredientMatches(tag, it.id)) return it.id; return 0; }

  // ---------- specific screens ----------
  openInventory() {
    const g = this.g, p = g.player;
    this.container = null;
    this.openScreen('inventory', (root) => {
      const row = el('div', 'row', root);
      row.style.alignItems = 'flex-start';
      if (p.creative) this.creativePalette(row);
      else this.recipeBook(el('div', 'panel', row));
      const panel = el('div', 'panel', row);
      const top = el('div', 'row', panel);
      const armorCol = el('div', 'col', top);
      armorCol.style.gap = '0';
      const ghosts = [I.iron_helmet, I.iron_chestplate, I.iron_leggings, I.iron_boots];
      for (let k = 0; k < 4; k++) this.makeSlot(armorCol, { inv: p.armor, i: k, kind: 'armor', armorSlot: k, ghost: ghosts[k] });
      const offCell = this.makeSlot(armorCol, { inv: p.offhand, i: 0, kind: 'normal', ghost: I.shield });
      offCell.classList.add('offhandSlot'); offCell.title = 'Off-hand (F swaps with your selected slot)';
      const pv = el('div', 'player-preview', top);
      const cv = el('canvas', '', pv); cv.width = 132; cv.height = 180;
      const stats = el('div', 'stats-mini', pv);
      let look = [0, 0], armorKey = '';
      const redraw = () => {
        armorKey = p.armor.slots.map(s => s ? s.id : 0).join(',');
        drawPlayerPortrait(cv, p, look[0], look[1]);
        stats.innerHTML = `<span>❤ ${Math.ceil(p.health)}/${p.maxHealth}</span><span>🍖 ${p.food}</span><span>🛡 ${p.armorPoints()}</span>`;
      };
      redraw();
      const scr = pv.closest('#screen') || document.body;
      const onMove = (e) => {
        const r = cv.getBoundingClientRect();
        look = [(e.clientX - (r.left + r.width / 2)) / 260, (e.clientY - (r.top + r.height * 0.25)) / 260];
        redraw();
      };
      scr.addEventListener('mousemove', onMove);
      const iv = setInterval(() => {
        if (!cv.isConnected) { clearInterval(iv); scr.removeEventListener('mousemove', onMove); return; }
        if (p.armor.slots.map(s => s ? s.id : 0).join(',') !== armorKey) redraw();
      }, 150);
      const cc = el('div', 'col', top);
      el('h3', '', cc, 'Crafting');
      this.craftingPanel(cc, 2);
      this.playerSlots(panel);
    });
  }

  creativePalette(parent) {
    const panel = el('div', 'panel', parent);
    panel.style.width = '470px';
    el('h3', '', panel, 'Creative Items');
    const search = el('input', '', panel);
    search.placeholder = 'Search items…';
    search.style.cssText = 'font:18px VT323,monospace;width:100%;margin-bottom:4px;padding:2px 6px';
    search.addEventListener('focus', () => { this.g.input.textFocus = true; });
    search.addEventListener('blur', () => { this.g.input.textFocus = false; });
    search.addEventListener('keydown', (e) => e.stopPropagation());
    const grid = el('div', 'slots', panel);
    grid.style.cssText = 'grid-template-columns:repeat(10,var(--slot-size));max-height:390px;overflow-y:auto';
    const render = () => {
      grid.innerHTML = '';
      const q = search.value.toLowerCase();
      for (const it of ITEMS) {
        if (!it || it.hidden || (q && !it.label.toLowerCase().includes(q))) continue;
        const d = this.makeSlot(grid, { kind: 'creative', id: it.id });
        this.renderStackInto(d, { id: it.id, count: 1 });
      }
      const trash = this.makeSlot(grid, { kind: 'trash' });
      trash.innerHTML = '<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#a00;font-size:26px">✖</span>';
    };
    search.addEventListener('input', render);
    render();
  }

  openCrafting() {
    this.container = null;
    this.openScreen('crafting', (root) => {
      const row = el('div', 'row', root);
      row.style.alignItems = 'flex-start';
      this.recipeBook(el('div', 'panel', row));
      const panel = el('div', 'panel', row);
      el('h3', '', panel, 'Crafting Table');
      const c = this.craftingPanel(panel, 3);
      c.style.margin = '6px 0 12px 40px';
      this.playerSlots(panel);
    });
  }

  openChest(x, y, z) {
    const g = this.g;
    const tile = g.getTile(x, y, z, 'chest');
    this.container = tile;
    g.audio && g.audio.play('chest_open', { x, y, z });
    this.openScreen('chest', (root) => {
      this.container = tile;
      const panel = el('div', 'panel', root);
      el('h3', '', panel, tile.label || 'Chest');
      this.slotGrid(panel, tile.inv, 0, 27, 9, 'container');
      el('div', '', panel).style.height = '10px';
      this.playerSlots(panel);
    });
    tile.inv.onChange = () => this.refreshSlots();
  }

  openFurnace(x, y, z) {
    const g = this.g;
    const tile = g.getTile(x, y, z, 'furnace');
    this.container = tile;
    this.openScreen('furnace', (root) => {
      this.container = tile;
      const panel = el('div', 'panel', root);
      el('h3', '', panel, 'Furnace');
      const row = el('div', 'row', panel);
      row.style.margin = '6px 0 14px 70px';
      const left = el('div', 'col', row);
      this.makeSlot(left, { inv: tile.inv, i: 0, kind: 'normal' });
      this.flameEl = el('div', 'flame', left); el('i', '', this.flameEl); this.flameEl.style.margin = '0 8px';
      this.makeSlot(left, { inv: tile.inv, i: 1, kind: 'fuel' });
      const arrow = el('div', 'arrow', row);
      this.furnArrow = el('div', 'progress', arrow);
      this.makeSlot(row, { inv: tile.inv, i: 2, kind: 'output', onTake: (s) => g.onSmeltTake && g.onSmeltTake(s) }, true);
      this.playerSlots(panel);
    });
    tile.inv.onChange = () => this.refreshSlots();
  }

  updateFurnaceUI() {
    const t = this.container;
    if (!t || !this.furnArrow) return;
    this.furnArrow.style.width = Math.round((t.cook || 0) / (t.cookMax || 8) * 26) + 'px';
    const f = t.burnMax ? t.burn / t.burnMax : 0;
    this.flameEl.firstChild.style.height = Math.round(f * 100) + '%';
  }

  // =================================================================== keys
  onKey(e) {
    const g = this.g;
    if (this.chatOpen) return;
    if (!this.screen) return;
    if (e.code === 'Escape' || (e.code === g.input.binds.inventory && this.screen !== 'pause' && this.screen !== 'settings' && !g.input.textFocus)) {
      e.preventDefault();
      if (e.repeat) return; // a held key must not close the screen that the first press opened
      if (e.code === 'Escape' && this.container && this.container.onEscape) { this.container.onEscape(); return; }
      if (this.screen === 'pause') { this.closeScreen(); return; }
      this.closeScreen();
      return;
    }
    if (this.hover && !g.input.textFocus) {
      const m = /^Digit([1-9])$/.exec(e.code);
      if (m && this.hover.inv) {
        const hi = +m[1] - 1;
        const p = g.player;
        const a = this.hover.inv.slots[this.hover.i];
        const b = p.inventory.slots[hi];
        if (this.hover.kind === 'output' || this.hover.kind === 'craftOut') return;
        this.hover.inv.slots[this.hover.i] = b; p.inventory.slots[hi] = a;
        this.hover.inv.changed(); p.inventory.changed();
        this.refreshSlots();
      }
      if (e.code === g.input.binds.drop && this.hover.inv) {
        const s = this.hover.inv.slots[this.hover.i];
        if (s) {
          const n = e.ctrlKey ? s.count : 1;
          g.dropFromPlayer(Object.assign({ id: s.id, count: n, dmg: s.dmg || 0 }, stackExtra(s) || {}));
          s.count -= n; if (s.count <= 0) this.hover.inv.slots[this.hover.i] = null;
          this.hover.inv.changed(); this.refreshSlots();
        }
      }
    }
  }

  // =================================================================== chat
  openChat(prefix = '') {
    if (this.chatOpen) return;
    this.chatOpen = true;
    const inp = this.chatInput = el('input', '', this.root);
    inp.id = 'chatInput';
    inp.value = prefix;
    this.g.input.textFocus = true;
    this.g.input.unlock();
    setTimeout(() => { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }, 10);
    this.chatHistIdx = (this.chatHist || []).length;
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Enter') {
        const v = inp.value.trim();
        if (v) {
          (this.chatHist = this.chatHist || []).push(v);
          if (v.startsWith('/')) this.g.runCommand(v.slice(1));
          else this.chat('<Jacob> ' + v);
        }
        this.closeChat();
      } else if (e.code === 'Escape') this.closeChat();
      else if (e.code === 'ArrowUp' && this.chatHist && this.chatHist.length) { this.chatHistIdx = Math.max(0, this.chatHistIdx - 1); inp.value = this.chatHist[this.chatHistIdx]; }
      else if (e.code === 'ArrowDown' && this.chatHist) { this.chatHistIdx = Math.min(this.chatHist.length, this.chatHistIdx + 1); inp.value = this.chatHist[this.chatHistIdx] || ''; }
    });
  }
  closeChat() {
    if (!this.chatOpen) return;
    this.chatOpen = false;
    this.chatInput.remove();
    this.g.input.textFocus = false;
    this.g.onChatClose && this.g.onChatClose();
  }
}

export { el, STAT_ICONS, cloneStack };
