// Jacob Craft bootstrap: creates subsystems, runs the title screen and the game loop.
import { Renderer } from './gfx/renderer.js';
import { EntityRenderer } from './gfx/entityRenderer.js';
import { PrecipRenderer } from './gfx/precip.js';
import { IconFactory } from './ui/icons.js';
import { UI } from './ui/ui.js';
import { Menus } from './ui/menus.js';
import { Input } from './game/input.js';
import { Audio } from './audio/audio.js';
import { SaveDB } from './game/save.js';
import { Game } from './game/game.js';
import { World } from './world/world.js';
import { computeSkyLighting } from './gfx/sky.js';
import { hashString } from './core/noise.js';
import { installExtensions } from './game/extensions.js';
import { DEFAULT_BINDS } from './game/input.js';

const DEFAULT_SETTINGS = {
  renderDistance: 8, quality: 'high', fov: 75, sensitivity: 1, invertY: false,
  master: 0.8, music: 0.45, sfx: 1, ambient: 0.8, showFps: true, clouds: true, shadows: true, volumetric: true, ssr: true, viewBob: true, blood: true,
  displayMode: 'windowed', uiScale: 'auto', renderScale: 1, brightness: 1, glare: true,
  difficulty: 'normal', tooltips: true, autosave: true,
  shake: 1, flashes: true, hurtTilt: true, captions: false, contrastCrosshair: false, binds: null,
};

class App {
  constructor() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS);
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem('jc_settings') || '{}')); } catch (e) { /* ignore */ }
    this.mode = 'boot';
    this.last = performance.now();
  }

  async init() {
    const boot = document.getElementById('boot');
    const status = (t) => { boot.innerHTML = `Jacob Craft<small>${t}</small>`; };
    status('Starting renderer…');
    await new Promise(r => setTimeout(r, 20));
    const canvas = document.getElementById('gl');
    try {
      this.renderer = new Renderer(canvas);
    } catch (e) {
      status('Sorry — this browser could not start WebGL2: ' + e.message);
      throw e;
    }
    this.renderer.setQuality(this.settings.quality);
    status('Painting items…');
    await new Promise(r => setTimeout(r, 10));
    this.icons = new IconFactory(this.renderer.texData).build();
    this.er = new EntityRenderer(this.renderer, this.icons);
    this.precip = new PrecipRenderer(this.renderer);
    this.input = new Input(canvas);
    this.audio = new Audio();
    this.db = new SaveDB();
    await this.db.open().catch(e => console.warn('IndexedDB unavailable', e));
    this.game = new Game({ renderer: this.renderer, er: this.er, precip: this.precip, audio: this.audio, input: this.input, icons: this.icons, db: this.db, settings: this.settings });
    this.ui = new UI(this.game, this.icons);
    this.game.ui = this.ui;
    this.menus = new Menus(this);
    this.game.showDeath = (msg) => { this.input.unlock(); this.menus.death(msg); };
    this.game.onScreenClose = () => { if (this.mode === 'game') this.input.lock(); };
    this.game.onChatClose = () => { if (this.mode === 'game') this.input.lock(); };
    installExtensions(this.game);
    this.ui.setHudVisible(false);

    this.input.onLockChange = (locked) => {
      if (!locked && this.mode === 'game' && this.game.state === 'playing' && !this.ui.isOpen && !this.ui.chatOpen && !this.game.player.dead) this.pause();
    };
    canvas.addEventListener('mousedown', () => {
      this.audio.init();
      if (this.mode === 'game' && this.game.state === 'playing' && !this.ui.isOpen && !this.ui.chatOpen && !this.game.player.dead) this.input.lock();
    });
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.mode === 'game' && this.game.state === 'paused' && !this.ui.isOpen) { e.preventDefault(); this.resume(); }
    });
    addEventListener('beforeunload', () => { if (this.mode === 'game') this.game.saveWorld(true); });
    window.jc = this; // debug handle
    addEventListener('resize', () => this.applyUIScale());
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && this.settings.displayMode !== 'windowed' && this._wantFs) { /* user left fullscreen with Esc: keep their preference for next launch */ } });
    this.applySettings();

    status('Shaping the world…');
    this.startMenuWorld();
    this.menus.title();
    boot.remove();
    this.loop();
  }

  saveSettings() { localStorage.setItem('jc_settings', JSON.stringify(this.settings)); }
  applySettings(changed) {
    const S = this.settings;
    if (this.renderer.quality !== S.quality) this.renderer.setQuality(S.quality);
    if ((this.renderer.userScale ?? 1) !== S.renderScale) { this.renderer.userScale = S.renderScale; this.renderer.resize(true); }
    if (this.game.world) this.game.world.renderDistance = S.renderDistance;
    if (this.menuWorld) this.menuWorld.renderDistance = Math.min(S.renderDistance, 8);
    this.audio.setVolumes(S.master, S.music, S.sfx, S.ambient);
    this.input.binds = Object.assign({}, DEFAULT_BINDS, S.binds || {});
    document.body.classList.toggle('hcCross', !!S.contrastCrosshair);
    document.body.classList.toggle('noTooltips', S.tooltips === false);
    this.applyUIScale();
    if (changed === 'displayMode') this.applyDisplayMode();
    this.saveSettings();
  }

  // UI scale: zoom the whole HTML layer; 'auto' follows the window height, and shrinks further on narrow windows so
  // the inventory screen (about 780px wide at 1x) always fits
  applyUIScale() {
    const S = this.settings;
    const kH = innerHeight >= 1500 ? 1.5 : innerHeight >= 1080 ? 1.25 : innerHeight < 520 ? 0.75 : innerHeight < 640 ? 0.85 : 1;
    const kW = Math.max(0.5, Math.floor(innerWidth / 780 * 20) / 20);
    const k = S.uiScale === 'auto' ? Math.min(kH, kW) : +S.uiScale;
    const ui = document.getElementById('ui');
    if (ui.style.zoom !== String(k)) ui.style.zoom = k;
    document.documentElement.style.setProperty('--ui-zoom', k);
  }

  // Windowed / Borderless Fullscreen / Fullscreen (fullscreen also captures system keys where the browser allows it)
  applyDisplayMode() {
    const S = this.settings, de = document.documentElement;
    const kb = navigator.keyboard;
    if (S.displayMode === 'windowed') {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      if (kb && kb.unlock) kb.unlock();
      return;
    }
    const go = document.fullscreenElement ? Promise.resolve() : (de.requestFullscreen ? de.requestFullscreen({ navigationUI: 'hide' }) : Promise.reject());
    go.then(() => {
      if (S.displayMode === 'fullscreen' && kb && kb.lock) kb.lock().catch(() => {});
      else if (kb && kb.unlock) kb.unlock();
    }).catch(() => {});
  }

  // ---------------- title panorama ----------------
  startMenuWorld() {
    const seed = hashString('jacobcraft-title-7');
    this.menuWorld = new World(seed, { renderDistance: Math.min(7, this.settings.renderDistance) });
    this.menuWorld.events.onMesh = (c, d) => this.renderer.uploadChunk(c, d);
    this.menuWorld.events.onUnload = (c) => this.renderer.deleteChunk(c);
    const T = this.menuWorld.terrain;
    let best = [0, 0], bh = 80, score = -1e9;
    for (let i = 0; i < 400; i++) {
      const x = (i % 20) * 32 - 320, z = Math.floor(i / 20) * 32 - 320;
      const o = T.column(x, z, {});
      if (![7, 8, 9, 11, 14, 18].includes(o.biome)) continue; // no jungle/ancient forest: their giant trees swallow the camera
      // prefer moderately elevated spots overlooking lower land / water
      const lower = T.column(x + 48, z + 48, {}).height;
      const sc = (o.height - lower) - Math.abs(o.height - 82) * 0.5 + (o.biome === 10 ? 20 : 0);
      if (sc > score) { score = sc; bh = o.height; best = [x, z]; }
    }
    this.menuCam = { x: best[0], z: best[1], y: bh + 18, t: 0 };
    this.mode = 'menu';
  }
  stopMenuWorld() {
    if (!this.menuWorld) return;
    this.menuWorld.destroy();
    for (const c of this.menuWorld.chunks.values()) this.renderer.deleteChunk(c);
    this.menuWorld = null;
  }

  renderMenu(dt) {
    const w = this.menuWorld;
    if (!w) return;
    const c = this.menuCam;
    c.t += dt;
    w.update(c.x, c.z, dt);
    // never sit inside terrain or a tree crown: drift upward until the view is clear
    for (let k = -1; k <= 2; k++) {
      const id = w.getBlock(Math.floor(c.x), Math.floor(c.y + k), Math.floor(c.z));
      if (id && id !== 0) { c.y += dt * 12; break; }
    }
    const yaw = c.t * 0.035;
    const dayTime = 0.66;
    const ang = (dayTime - 0.25) * Math.PI * 2;
    const sd = [Math.cos(ang) * 0.94, Math.sin(ang), 0.34];
    const l = Math.hypot(...sd); const sunDir = sd.map(v => v / l);
    const moonDir = sunDir.map(v => -v);
    if (!this._menuLight) this._menuLight = computeSkyLighting(sunDir, moonDir, { overcast: 0, rain: 0 });
    this.renderer.render({
      camPos: [c.x, c.y, c.z], yaw, pitch: -0.12, fov: 70 * Math.PI / 180, time: c.t, dt,
      renderDist: w.renderDistance, chunks: w.chunks.values(), sunDir, moonDir, moonPhase: 0.2, light: this._menuLight,
      blockColor: [1, 0.62, 0.3], fogDensity: 0.0022, fogHeight: 0.022, wetness: 0, flash: 0, wind: 0.4,
      shadowsOn: this.settings.shadows, cloudsOn: this.settings.clouds, cloudCoverage: 0.45, cloudDensity: 1, cloudWind: [c.t * 0.003, c.t * 0.001],
      overcast: 0, skyDarken: 1, grayTint: [0.8, 0.85, 0.9], ssrOn: this.settings.ssr, rain: 0, volumetricOn: this.settings.volumetric, volDensity: 0.003,
      underwater: false, bloomStrength: 0.05, saturation: 1.1, grade: [1.04, 1, 0.97], vignette: 0.7,
      glare: this.settings.glare === false ? 0 : 0.9, exposureBias: this.settings.brightness || 1,
    });
  }

  // ---------------- sessions ----------------
  async createWorld(name, seedText, gamemode) {
    if (!seedText) seedText = String(Math.floor(Math.random() * 2 ** 31));
    const seed = /^-?\d+$/.test(seedText) ? (Number(seedText) >>> 0) : hashString(seedText);
    const meta = { id: 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), name, seedText, seed, gamemode, created: Date.now(), lastPlayed: Date.now() };
    await this.db.putWorld(meta);
    this.playWorld(meta);
  }

  async playWorld(meta) {
    this.audio.init();
    if (this.settings.displayMode !== 'windowed' && !document.fullscreenElement) this.applyDisplayMode();
    this.menus.loading('Generating terrain…');
    this.stopMenuWorld();
    this.mode = 'loading';
    try {
      await this.game.startWorld(meta, (f, n) => this.menus.setLoading(f, `Building terrain… (${n} chunks)`));
    } catch (e) {
      console.error(e);
      this.menus.setLoading(0, 'Failed to load world: ' + e.message);
      return;
    }
    this.menus.clear();
    this.mode = 'game';
    this.ui.setHudVisible(true);
    this.applySettings();
    this.input.lock();
  }

  pause() {
    if (this.mode !== 'game') return;
    this.game.state = 'paused';
    this.menus.pause();
    this.game.saveWorld(true);
  }
  resume() {
    this.menus.clear();
    this.game.state = 'playing';
    this.input.lock();
  }
  respawn() {
    this.menus.clear();
    this.game.respawn();
    this.game.state = 'playing';
    this.input.lock();
  }
  async quitToTitle() {
    this.menus.loading('Saving world…');
    await this.game.saveWorld(true).catch(e => console.warn(e));
    this.ui.closeScreen(true);
    this.game.stopWorld();
    this.ui.setHudVisible(false);
    this.input.unlock();
    this.startMenuWorld();
    this.menus.title();
  }

  // ---------------- loop ----------------
  loop() {
    let lastRaf = 0;
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      try { this.frame(dt); } catch (e) { console.error(e); }
      this.input.endFrame();
    };
    const raf = () => { lastRaf = performance.now(); tick(); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    // fallback when rAF is throttled (hidden preview panes)
    setInterval(() => { if (performance.now() - lastRaf > 250) tick(); }, 33);
  }

  frame(dt) {
    this.fpsAcc = (this.fpsAcc || 0) + dt; this.fpsN = (this.fpsN || 0) + 1;
    if (this.fpsAcc > 0.5) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
    if (this.mode === 'menu' || this.mode === 'loading') {
      if (this.menuWorld) this.renderMenu(dt);
      return;
    }
    if (this.mode === 'game') {
      const g = this.game;
      g.update(dt);
      g.render(dt);
      this.ui.updateHUD(dt);
      this.ui.setFPS(`${Math.round(this.fps || 0)} fps`, this.settings.showFps);
      if (this.ui.showDebug) this.ui.setDebug(this.debugText());
    }
  }

  debugText() {
    const g = this.game, p = g.player, w = g.world, r = this.renderer;
    const t = g.interaction.target;
    const W = g.weather;
    const hours = Math.floor(((g.dayTime + 0.25) % 1) * 24), mins = Math.floor((((g.dayTime + 0.25) % 1) * 24 % 1) * 60);
    return [
      `Jacob Craft  ${Math.round(this.fps || 0)} fps  quality: ${r.quality}`,
      `XYZ: ${p.x.toFixed(2)} / ${p.y.toFixed(2)} / ${p.z.toFixed(2)}`,
      `Chunk: ${Math.floor(p.x / 16)}, ${Math.floor(p.z / 16)}  loaded ${w.chunks.size}  drawn ${r.stats.drawn}  shadow ${r.stats.shadowDrawn}`,
      `Biome: ${g.currentBiome ? g.currentBiome.label : '?'}   Light: sky ${w.skyLight(p.x, p.eyeY, p.z)} block ${w.blockLight(p.x, p.eyeY, p.z)}`,
      `Day ${g.day + 1}  ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}   Weather: ${W.state} (rain ${W.localRain.toFixed(2)} snow ${W.localSnow.toFixed(2)} fog ${W.fogDensity.toFixed(4)} wet ${W.wetness.toFixed(2)})`,
      `Facing: ${['N', 'W', 'S', 'E'][Math.round(((p.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 2)) % 4]}  Entities: ${g.entities.list.length}${g.mobs ? ' mobs ' + g.mobs.list.length : ''}  Particles: ${g.particles.list.length}`,
      t ? (t.type === 'block' ? `Target: ${t.x} ${t.y} ${t.z}  ${w.getBlock(t.x, t.y, t.z)}` : `Target: ${t.e.type}`) : 'Target: none',
      `Seed: ${g.meta ? g.meta.seedText : ''}  Mode: ${p.gamemode}`,
    ].join('\n');
  }
}

new App().init().catch(e => console.error(e));
