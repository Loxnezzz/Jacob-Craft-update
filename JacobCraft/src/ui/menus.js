// Title screen, world selection, settings, help, pause and death overlays.
import { el } from './ui.js';
import { TS } from '../gfx/texgen.js';
import { texLayer } from '../world/blocks.js';

const SPLASHES = [
  'Now with weather!', 'Mammoth-sized!', 'Ray traced-ish!', 'Mind the Frost Wyrm!', 'Made of blocks!', 'Also try fishing!',
  'Dragons are real!', 'Sunsets included!', '100% original creatures!', 'Watch out for lightning!', 'Village life!',
  'Ancient forests await!', 'Hello, Jacob!', 'Volumetric clouds!', 'Lava glows!', 'Wizards know things!', 'Dig straight down? No!',
];

// Title logo: grass-topped stone letters with a dark extrusion. The canvas is sized from the measured text so
// no letter is ever clipped (the old fixed-width canvas cut off the "J").
export function makeLogo(texData, text = 'JACOB CRAFT') {
  const texCanvas = (name, scale) => {
    const pc = document.createElement('canvas'); pc.width = TS; pc.height = TS;
    const pctx = pc.getContext('2d');
    const img = pctx.createImageData(TS, TS);
    const off = texLayer(name) * TS * TS * 4;
    for (let i = 0; i < TS * TS * 4; i++) img.data[i] = texData.albedo[off + i];
    pctx.putImageData(img, 0, 0);
    const big = document.createElement('canvas'); big.width = TS * scale; big.height = TS * scale;
    const bctx = big.getContext('2d'); bctx.imageSmoothingEnabled = false; bctx.drawImage(pc, 0, 0, TS * scale, TS * scale);
    return big;
  };
  const FONT = 'bold 120px Silkscreen, "VT323", monospace';
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = FONT;
  const m = probe.measureText(text);
  const ext = 16, pad = 28;
  const textW = Math.ceil(Math.max(m.width, (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || m.width)));
  const W = textW + pad * 2 + ext, H = 190;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.font = FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const x = (W - ext) / 2, y = H / 2;
  // soft back glow
  ctx.shadowColor = 'rgba(255, 210, 120, 0.35)'; ctx.shadowBlur = 28;
  ctx.fillStyle = '#000'; ctx.fillText(text, x, y + ext * 0.5);
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
  // extrusion
  for (let d = ext; d > 0; d--) {
    const k = 14 + d * 2;
    ctx.fillStyle = `rgb(${k},${k},${k + 6})`;
    ctx.fillText(text, x + d * 0.55, y + d);
  }
  ctx.lineWidth = 9; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0d0d10'; ctx.strokeText(text, x, y);
  // stone body
  ctx.fillStyle = ctx.createPattern(texCanvas('stone', 4), 'repeat'); ctx.fillText(text, x, y);
  // grass cap on the upper part of every letter
  const cap = document.createElement('canvas'); cap.width = W; cap.height = H;
  const cc = cap.getContext('2d');
  cc.font = FONT; cc.textAlign = 'center'; cc.textBaseline = 'middle';
  cc.fillStyle = '#fff'; cc.fillText(text, x, y);
  cc.globalCompositeOperation = 'source-in';
  const grass = texCanvas('moss', 4);
  cc.fillStyle = cc.createPattern(grass, 'repeat');
  cc.fillRect(0, y - 60, W, 26);
  cc.fillStyle = 'rgba(0,0,0,0)';
  ctx.drawImage(cap, 0, 0);
  // light from above, shade below
  const g = ctx.createLinearGradient(0, y - 62, 0, y + 56);
  g.addColorStop(0, 'rgba(255,255,255,0.32)'); g.addColorStop(0.45, 'rgba(255,255,255,0.0)'); g.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = g; ctx.globalCompositeOperation = 'source-atop'; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  c.className = 'logoCanvas';
  return c;
}

const WHATS_NEW = [
  ['An Ending', 'Defeat all five great beasts, forge the Worldheart Keystone and restore the Worldheart at a Runic Altar.'],
  ['Champions', 'Six crowned champion monsters with their own powers. They drop Wayfinder Shards.'],
  ['Lair Compass', 'Craft one from Wayfinder Shards and it points to the nearest great beast you have not yet defeated.'],
  ['Journal', 'Press J to track milestones, the five great beasts and your road to the ending.'],
  ['Dragon Eggs', 'Hatch your own dragon and raise it until it is big enough to ride.'],
  ['Spyglass & Compass', 'The spyglass now zooms in, and the compass always points home.'],
  ['Weapons', 'Crossbows, throwable spears, daggers, maces and fully reworked bows with real draw animations and arrow physics.'],
  ['Flintlocks', 'The Emberlock Pistol and Thunder Blunderbuss — loud, smoky, and fed with Iron Shot and Gunpowder.'],
  ['Gunpowder & TNT', 'Mine Brimstone and Niter, mix your own Gunpowder, and blow things up (responsibly).'],
  ['Alchemy', 'Brew healing, swiftness, strength, fire resistance, night vision and water breathing at the Alchemy Table.'],
  ['Runic Altar', 'Enchant gear with experience levels and Glow Dust. XP orbs now drop from creatures and ores.'],
  ['Building', '50+ new blocks: polished stone, roof shingles, plaster, glazed tiles, stained glass and real furniture you can sit on.'],
  ['Feel', 'New first-person hands, hit-stop, flinches, impact effects, damage direction and a richer soundscape with real birds.'],
  ['Atmosphere', 'Biome-tinted fog, dawn valley mist, sun glare, butterflies by day and fireflies by night.'],
];

export class Menus {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('ui');
    this.el = null;
  }
  clear() { if (this.el) this.el.remove(); this.el = null; }
  base(withLogo = true) {
    this.clear();
    const m = this.el = el('div', '', this.root); m.id = 'menu';
    el('div', 'shade', m);
    if (withLogo) {
      const wrap = el('div', '', m); wrap.id = 'logo';
      wrap.appendChild(this.logo || (this.logo = makeLogo(this.app.renderer.texData)));
      el('div', 'tagline', wrap, 'A VOXEL ADVENTURE');
      const sp = el('div', '', wrap); sp.id = 'splash'; sp.textContent = SPLASHES[Math.floor(Math.random() * SPLASHES.length)];
    }
    return m;
  }

  title() {
    // fonts may still be loading on first boot: rebuild the logo once they are ready so it measures correctly
    if (!this._fontsReady && document.fonts) { document.fonts.ready.then(() => { this._fontsReady = true; this.logo = null; if (this.app.mode === 'menu' && this.el && this.el.querySelector('#logo')) this.title(); }); }
    const m = this.base(true);
    m.classList.add('titleScreen');
    const b = el('div', 'mbtns', m);
    const btn = (parent, label, fn, cls = '') => { const x = el('button', 'btn ' + cls, parent, label); x.onclick = () => { this.app.audio.init(); this.app.audio.play('click'); fn(); }; return x; };
    btn(b, '<span class="ico">▶</span> Play', () => this.worlds(), 'primary big');
    const row = el('div', 'brow', b);
    btn(row, 'Settings', () => this.settings(() => this.title()));
    btn(row, 'How to Play', () => this.help(() => this.title()));
    btn(b, "What's New", () => this.whatsNew(() => this.title()), 'ghost');
    const f = el('div', 'mfoot', m);
    el('span', '', f, 'Jacob Craft · v1.1 “The Worldheart Update”');
    el('span', '', f, 'An original voxel adventure');
  }

  whatsNew(back) {
    const m = this.base(false);
    const d = el('div', 'dialog wide', m);
    el('h2', '', d, "What's New");
    const g = el('div', 'news', d);
    for (const [t, txt] of WHATS_NEW) { const c = el('div', 'item', g); el('b', '', c, t); el('p', '', c, txt); }
    const btns = el('div', 'btns', d);
    el('button', 'btn', btns, 'Back').onclick = back;
  }

  async worlds() {
    const m = this.base(false);
    const d = el('div', 'dialog', m);
    el('h2', '', d, 'Select World');
    const list = el('div', 'wlist', d);
    let sel = null;
    const worlds = await this.app.db.listWorlds();
    if (!worlds.length) el('p', '', list, 'No worlds yet — create one!');
    for (const w of worlds) {
      const row = el('div', 'w', list);
      const info = el('div', '', row);
      el('div', 'nm', info, escapeHtml(w.name));
      el('div', 'meta', info, `${w.gamemode === 'creative' ? 'Creative' : 'Survival'} · seed ${escapeHtml(String(w.seedText))} · ${w.lastPlayed ? new Date(w.lastPlayed).toLocaleString() : 'new'}`);
      row.onclick = () => { [...list.children].forEach(c => c.classList.remove('sel')); row.classList.add('sel'); sel = w; play.disabled = false; del.disabled = false; };
      row.ondblclick = () => this.app.playWorld(w);
    }
    const btns = el('div', 'btns', d);
    const play = el('button', 'btn', btns, 'Play Selected'); play.disabled = true;
    play.onclick = () => sel && this.app.playWorld(sel);
    el('button', 'btn', btns, 'Create New World').onclick = () => this.create();
    const btns2 = el('div', 'btns', d);
    const del = el('button', 'btn danger', btns2, 'Delete'); del.disabled = true;
    del.onclick = async () => {
      if (!sel) return;
      if (!confirm(`Delete "${sel.name}" forever? This cannot be undone.`)) return;
      await this.app.db.deleteWorld(sel.id);
      this.worlds();
    };
    el('button', 'btn', btns2, 'Back').onclick = () => this.title();
  }

  create() {
    const m = this.base(false);
    const d = el('div', 'dialog', m);
    el('h2', '', d, 'Create New World');
    const l1 = el('label', '', d, 'World Name');
    const name = el('input', '', l1); name.type = 'text'; name.value = 'New World';
    const l2 = el('label', '', d, 'Seed (leave blank for random)');
    const seed = el('input', '', l2); seed.type = 'text'; seed.placeholder = 'e.g. jacob';
    const l3 = el('label', '', d, 'Game Mode');
    const mode = el('select', '', l3);
    mode.innerHTML = '<option value="survival">Survival — gather, craft, survive</option><option value="creative">Creative — unlimited blocks, flight</option>';
    for (const inp of [name, seed]) {
      inp.addEventListener('focus', () => { this.app.input.textFocus = true; });
      inp.addEventListener('blur', () => { this.app.input.textFocus = false; });
    }
    const btns = el('div', 'btns', d);
    el('button', 'btn', btns, 'Create World').onclick = () => {
      this.app.input.textFocus = false;
      this.app.createWorld(name.value.trim() || 'New World', seed.value.trim(), mode.value);
    };
    el('button', 'btn', btns, 'Cancel').onclick = () => this.worlds();
    setTimeout(() => name.focus(), 50);
  }

  settings(back, tab = this._setTab || 'video') {
    this._setTab = tab;
    const m = this.base(false);
    const d = el('div', 'dialog wide', m);
    el('h2', '', d, 'Settings');
    const S = this.app.settings;
    const tabs = el('div', 'tabs', d);
    for (const [k, l] of [['video', 'Video'], ['audio', 'Audio'], ['controls', 'Controls'], ['gameplay', 'Gameplay'], ['access', 'Accessibility']]) {
      const t = el('button', 'tab' + (k === tab ? ' on' : ''), tabs, l);
      t.onclick = () => { this.app.audio.play('click'); this.settings(back, k); };
    }
    const grid = el('div', 'setting', d);
    const range = (label, key, min, max, step, fmt = (v) => v) => {
      const l = el('label', '', grid);
      const t = el('span', '', l);
      const r = el('input', '', l); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = S[key];
      const upd = () => { t.textContent = `${label}: ${fmt(+r.value)}`; };
      upd();
      r.oninput = () => { S[key] = +r.value; upd(); this.app.applySettings(); };
    };
    const toggle = (label, key) => {
      const l = el('label', '', grid);
      const b = el('button', 'btn small', l);
      const upd = () => { b.textContent = `${label}: ${S[key] ? 'ON' : 'OFF'}`; };
      upd();
      b.onclick = () => { S[key] = !S[key]; upd(); this.app.applySettings(); };
    };
    const choice = (label, key, opts) => {
      const l = el('label', '', grid);
      const b = el('button', 'btn small', l);
      const upd = () => { const o = opts.find(o => o[0] === S[key]) || opts[0]; b.textContent = `${label}: ${o[1]}`; };
      upd();
      b.onclick = () => { const i = opts.findIndex(o => o[0] === S[key]); S[key] = opts[(i + 1) % opts.length][0]; upd(); this.app.applySettings(key); };
    };
    const pct = (v) => Math.round(v * 100) + '%';
    if (tab === 'video') {
      choice('Graphics', 'quality', [['low', 'Fast'], ['medium', 'Fancy'], ['high', 'Shaders'], ['ultra', 'Ultra RTX']]);
      choice('Display', 'displayMode', [['windowed', 'Windowed'], ['borderless', 'Borderless Fullscreen'], ['fullscreen', 'Fullscreen']]);
      range('Render Distance', 'renderDistance', 4, 16, 1, (v) => v + ' chunks');
      range('Field of View', 'fov', 50, 110, 1);
      range('Resolution Scale', 'renderScale', 0.5, 1, 0.05, pct);
      choice('UI Scale', 'uiScale', [['auto', 'Auto'], [0.75, '75%'], [1, '100%'], [1.25, '125%'], [1.5, '150%'], [2, '200%']]);
      range('Brightness', 'brightness', 0.6, 1.6, 0.05, pct);
      toggle('Shadows', 'shadows');
      toggle('Volumetric Clouds', 'clouds');
      toggle('God Rays & Mist', 'volumetric');
      toggle('Reflections', 'ssr');
      toggle('Sun Glare', 'glare');
      toggle('View Bobbing', 'viewBob');
      toggle('Show FPS', 'showFps');
    } else if (tab === 'audio') {
      range('Master Volume', 'master', 0, 1, 0.05, pct);
      range('Music', 'music', 0, 1, 0.05, pct);
      range('Sound Effects', 'sfx', 0, 1, 0.05, pct);
      range('Ambience & Weather', 'ambient', 0, 1, 0.05, pct);
    } else if (tab === 'controls') {
      range('Mouse Sensitivity', 'sensitivity', 0.2, 3, 0.05, pct);
      toggle('Invert Mouse', 'invertY');
      const kb = el('div', 'keybinds', d);
      const NAMES = { forward: 'Walk Forward', back: 'Walk Backward', left: 'Strafe Left', right: 'Strafe Right', jump: 'Jump / Swim', sneak: 'Sneak', sprint: 'Sprint', inventory: 'Inventory', journal: 'Journal', swap: 'Swap Hands', drop: 'Drop Item', chat: 'Chat', command: 'Command', perspective: 'Camera View', hideHud: 'Hide HUD', debug: 'Debug Info' };
      const binds = this.app.input.binds;
      const pretty = (c) => c.replace(/^Key/, '').replace(/^Digit/, '').replace('ControlLeft', 'L-Ctrl').replace('ShiftLeft', 'L-Shift').replace('Space', 'Space');
      for (const k in NAMES) {
        const r = el('div', 'kb', kb);
        el('span', '', r, NAMES[k]);
        const b = el('button', 'btn small', r, pretty(binds[k]));
        b.onclick = () => {
          b.textContent = '> press a key <'; b.classList.add('listen');
          const h = (e) => {
            e.preventDefault(); e.stopPropagation();
            removeEventListener('keydown', h, true);
            if (e.code !== 'Escape') { binds[k] = e.code; S.binds = Object.assign({}, binds); this.app.saveSettings(); }
            this.settings(back, 'controls');
          };
          addEventListener('keydown', h, true);
        };
      }
      const rb = el('div', 'btns', d);
      el('button', 'btn small', rb, 'Reset Keys').onclick = () => { S.binds = null; this.app.applySettings(); this.settings(back, 'controls'); };
    } else if (tab === 'gameplay') {
      choice('Difficulty', 'difficulty', [['peaceful', 'Peaceful'], ['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']]);
      toggle('Impact Effects (stylized blood)', 'blood');
      toggle('Item Tooltips', 'tooltips');
      toggle('Auto-save every 2 min', 'autosave');
    } else {
      range('Camera Shake', 'shake', 0, 1, 0.05, pct);
      toggle('Screen Flashes', 'flashes');
      toggle('Hurt Camera Tilt', 'hurtTilt');
      toggle('Sound Captions', 'captions');
      toggle('High-Contrast Crosshair', 'contrastCrosshair');
    }
    const btns = el('div', 'btns', d);
    el('button', 'btn', btns, 'Done').onclick = () => { this.app.saveSettings(); back(); };
  }

  help(back) {
    const m = this.base(false);
    const d = el('div', 'dialog', m);
    el('h2', '', d, 'How to Play');
    const h = el('div', 'help', d);
    h.innerHTML = `
<p><b>WASD</b> move · <b>Space</b> jump/swim · <b>Shift</b> sneak · <b>Ctrl</b> or double-tap W sprint</p>
<p><b>Left click</b> mine / attack (hold to break blocks)</p>
<p><b>Right click</b> place blocks, use items, open doors & chests, eat (hold)</p>
<p><b>1–9 / wheel</b> hotbar · <b>E</b> inventory & recipe book · <b>J</b> journal · <b>Q</b> drop</p>
<p><b>T</b> chat · <b>/</b> commands · <b>F3</b> debug · <b>F5</b> camera · <b>F1</b> hide HUD · <b>Esc</b> pause</p>
<p><b>Creative:</b> double-tap Space to fly, middle-click to pick blocks</p>
<p><b>Getting started:</b> punch a tree for logs → craft planks & sticks → a crafting table → wooden pickaxe → stone tools. Build a shelter before your first night!</p>
<p><b>Crafting:</b> open the inventory (E) and click any recipe in the recipe book to fill the grid automatically. Shift-click to craft in bulk.</p>
<p><b>Smelting:</b> furnaces turn raw ores into ingots, sand into glass and raw food into cooked meals.</p>
<p><b>Weather:</b> storms roll in, lightning can strike nearby, snow falls in cold lands — the world reacts.</p>
<p><b>Explore:</b> ancient forests, frozen peaks, badlands, jungles, swamps and volcanic wastes hide villages, wizards, ruins — and five legendary bosses.</p>
<p><b>Your goal:</b> press <b>J</b> for your Journal. Defeat crowned champions for Wayfinder Shards, craft a Lair Compass to track down the five great beasts, then forge the Worldheart Keystone and use it on a Runic Altar to finish the game. The world keeps going afterwards.</p>`;
    const btns = el('div', 'btns', d);
    el('button', 'btn', btns, 'Back').onclick = back;
  }

  loading(text = 'Generating terrain…') {
    const m = this.base(false);
    m.style.background = 'rgba(10,8,6,0.85)';
    const d = el('div', '', m); d.id = 'loading';
    d.style.background = 'transparent';
    this.loadText = el('div', '', d, text);
    const bar = el('div', 'bar', d);
    this.loadBar = el('i', '', bar);
  }
  setLoading(f, text) { if (this.loadBar) this.loadBar.style.width = Math.round(f * 100) + '%'; if (text && this.loadText) this.loadText.textContent = text; }

  pause() {
    this.clear();
    const m = this.el = el('div', '', this.root); m.id = 'menu';
    m.style.background = 'rgba(0,0,0,0.45)';
    const d = el('div', 'mbtns', m); d.style.marginTop = '22vh';
    el('h2', '', d, 'Game Paused').style.cssText = 'font:28px Silkscreen,monospace;text-align:center;margin:0 0 10px;text-shadow:2px 2px 0 #000';
    el('button', 'btn', d, 'Back to Game').onclick = () => this.app.resume();
    el('button', 'btn', d, 'Journal').onclick = () => { this.clear(); this.app.game.state = 'playing'; this.app.game.ui.openJournal(); };
    el('button', 'btn', d, 'Settings').onclick = () => this.settings(() => this.pause());
    el('button', 'btn', d, 'How to Play').onclick = () => this.help(() => this.pause());
    el('button', 'btn', d, 'Save & Quit to Title').onclick = () => this.app.quitToTitle();
  }

  death(msg) {
    this.clear();
    const m = this.el = el('div', '', this.root); m.id = 'death';
    el('h1', '', m, 'You Died!');
    el('p', '', m, escapeHtml(msg || ''));
    const b = el('div', 'mbtns', m); b.style.marginTop = '20px';
    el('button', 'btn', b, 'Respawn').onclick = () => this.app.respawn();
    el('button', 'btn', b, 'Title Screen').onclick = () => this.app.quitToTitle();
  }
}

export function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
