// Game: owns the active world session and drives update + render each frame.
import { World } from '../world/world.js';
import { SEA, HEIGHT, CHUNK } from '../world/constants.js';
import { BLOCKS, B, SHAPE, IS_LIQUID, LIGHT_EMIT, texLayer } from '../world/blocks.js';
import { BIOMES } from '../world/biomes.js';
import { selectionBoxes } from '../world/shapes.js';
import { computeSkyLighting } from '../gfx/sky.js';
import { mat4 } from '../core/math.js';
import { Player } from './player.js';
import { Interaction } from './interact.js';
import { EntityManager, ItemEntity, FallingBlock, Particles } from './entities.js';
import { Weather } from './weather.js';
import { ITEMS, I, itemByName, fuelValue, blockDrops } from './items.js';
import { smeltResult } from './recipes.js';
import { Inventory, stackExtra } from './inventory.js';
import { WorldSaver } from './save.js';
import { TREES } from '../world/trees.js';
import { RNG } from '../core/noise.js';
import { FirstPerson, holdKind } from './hands.js';

const TILE_SIZE = { chest: 27, furnace: 3, brewing: 5, campfire: 4 };

export const DAY_LENGTH = 1200; // seconds per full day

export class Game {
  constructor(ctx) {
    Object.assign(this, ctx); // renderer, er, precip, ui, audio, input, icons, db, settings
    this.world = null;
    this.player = null;
    this.state = 'none';
    this.time = 0;
    this.dayTime = 0.3;
    this.day = 0;
    this.tiles = new Map();
    this.particles = new Particles(this);
    this.entities = new EntityManager(this);
    this.weather = new Weather(this);
    this.interaction = new Interaction(this);
    this.lightCache = null; this.lightTimer = 0;
    this.skyExposure = 1;
    this.hurtFlash = 0;
    this.fpsAcc = 0; this.fpsFrames = 0; this.fps = 0;
    this.envTimer = 0;
    this.autosaveTimer = 60;
    this.tickAcc = 0;
    this.physAcc = 0;
    this.thirdPerson = 0;
    this.renderer.opaqueHooks.push((gl, r, F) => { if (this.player && F.game) this.drawEntities(gl, r, F); });
    this.renderer.shadowHooks.push((gl, r, F) => { if (this.player && F.game) this.er.drawShadowSnapshot(F); });
    this.renderer.overlays.push((gl, r, F) => { if (this.player && F.game) this.drawOverlays(gl, r, F); });
    this.mobs = null; // set by mob system
  }

  // ------------------------------------------------------------------ session
  async startWorld(meta, onProgress) {
    this.stopWorld();
    this.meta = meta;
    const keys = await this.db.chunkKeys(meta.id);
    const saver = new WorldSaver(this.db, meta.id, keys);
    const w = this.world = new World(meta.seed, { renderDistance: this.settings.renderDistance, saver });
    w.events.onMesh = (c, d) => this.renderer.uploadChunk(c, d);
    w.events.onUnload = (c) => { this.renderer.deleteChunk(c); this.mobs && this.mobs.onChunkUnload(c); };
    w.events.onDrop = (x, y, z, id, meta2) => { for (const [did, n] of blockDrops(id, meta2, null)) this.entities.dropItem(x + 0.5, y + 0.3, z + 0.5, did, n); };
    w.events.onFallingBlock = (x, y, z, id, m, ty) => this.entities.add(new FallingBlock(this, x, y, z, id, m, ty));
    w.events.onFizz = (x, y, z) => { this.audio.play('fizz', { x, y, z }); this.particles.smoke(x + 0.5, y + 1, z + 0.5, 6, 0.6); };
    w.events.onGrowTree = (x, y, z, kind) => this.growTree(x, y, z, kind);
    w.events.onChunkLoaded = (c) => { const fresh = this.mobs ? this.mobs.onChunkLoaded(c) : true; this.onStructures && this.onStructures(c, fresh); };
    w.events.onBlockChanged = () => { this._hmDirty = true; };
    this.tiles = new Map();
    this.entities = new EntityManager(this);
    this.particles = new Particles(this);
    this.weather = new Weather(this);
    this.player = new Player(this);
    this.interaction = new Interaction(this);
    this.player.inventory.onChange = () => { this.ui.hotbarDirty = true; };
    this.player.armor.onChange = () => { this.ui.hotbarDirty = true; };
    this.player.offhand.onChange = () => { this.ui.hotbarDirty = true; };
    this.mobs && this.mobs.reset();
    this.loadExtra && this.loadExtra(meta);
    const p = this.player;
    if (meta.player) {
      p.load(meta.player);
      this.dayTime = meta.dayTime ?? 0.3;
      this.day = meta.day || 0;
      this.weather.load(meta.weather);
      for (const t of meta.tiles || []) {
        const tile = Object.assign({}, t);
        tile.inv = new Inventory(TILE_SIZE[t.type] || 3);
        tile.inv.load(t.inv);
        this.tiles.set(t.key, tile);
      }
      this.pendingEntities = meta.entities || [];
      this.spawn = meta.spawn;
      this.spawnBed = !!meta.spawnBed;
    } else {
      p.gamemode = meta.gamemode || 'survival';
      this.dayTime = 0.27;
      this.spawn = this.findSpawn(); this.spawnBed = false;
      p.x = this.spawn[0] + 0.5; p.z = this.spawn[2] + 0.5; p.y = this.spawn[1];
      p.yaw = Math.PI * 0.75;
      this.weather.set('clear', 400);
      this.pendingEntities = [];
      this.isNewWorld = true;
    }
    this.state = 'loading';
    // wait for terrain around player
    const t0 = performance.now();
    await new Promise((resolve) => {
      const check = () => {
        w.update(p.x, p.z, 0.016);
        const pcx = Math.floor(p.x / 16), pcz = Math.floor(p.z / 16);
        let need = 0, have = 0;
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
          need++;
          const c = w.getChunk(pcx + dx, pcz + dz);
          if (c && c.mesh) have++;
        }
        onProgress && onProgress(have / need, w.chunks.size);
        if (have >= need || performance.now() - t0 > 30000) resolve();
        else setTimeout(check, 50);
      };
      check();
    });
    // settle player on the ground for new worlds
    if (!meta.player) {
      const top = this.surfaceAt(p.x, p.z);
      p.y = top + 0.01;
      // face the most open view rather than a cliff face or a tree trunk
      const blocker = (id, m, x, y, z, ox, oy, oz) => (BLOCKS[id].solid || BLOCKS[id].name.endsWith('_leaves')) ? { t: Math.hypot(x + 0.5 - ox, y + 0.5 - oy, z + 0.5 - oz), face: 0 } : null;
      const open = [];
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2, dx = -Math.sin(a), dz = -Math.cos(a);
        let score = 0;
        for (const dy of [0, 0.15]) { const hit = w.raycast(p.x, p.y + 1.62, p.z, dx, dy, dz, 48, blocker); score += hit ? hit.dist : 48; }
        open.push(score);
      }
      // weigh the neighbouring directions too, so the view is centred on open space instead of grazing a wall
      let best = -1;
      for (let k = 0; k < 16; k++) {
        const sc = open[k] + 0.6 * (open[(k + 15) % 16] + open[(k + 1) % 16]) + 0.25 * (open[(k + 14) % 16] + open[(k + 2) % 16]);
        if (sc > best + 0.5) { best = sc; p.yaw = k / 16 * Math.PI * 2; }
      }
    }
    for (const e of this.pendingEntities) this.restoreEntity(e);
    this.pendingEntities = [];
    this.state = 'playing';
    this.lightCache = null;
    this.precip.updateHeightmap(w, p.x, p.z, 0, true);
    if (this.isNewWorld) {
      this.ui.subtitle('Jacob Craft', 'Explore · Mine · Craft · Build · Fight · Discover', 4);
      this.ui.chat('Welcome to Jacob Craft! Press E for inventory & recipes, T for chat, /help for commands.', '#ffe070');
    }
    this.isNewWorld = false;
  }

  stopWorld() {
    if (this.world) { this.world.destroy(); for (const c of this.world.chunks.values()) this.renderer.deleteChunk(c); }
    this.world = null;
    this.player = null;
    this.state = 'none';
  }

  async saveWorld(quiet = false) {
    if (!this.world || !this.meta || this.state !== 'playing' && this.state !== 'paused') return;
    for (const c of this.world.chunks.values()) if (c.modified) this.world.saver.saveChunk(c);
    const tiles = [];
    for (const [key, t] of this.tiles) tiles.push(Object.assign({}, t, { key, inv: t.inv.toJSON() }));
    const meta = Object.assign({}, this.meta, {
      player: this.player.serialize(), dayTime: this.dayTime, day: this.day, weather: this.weather.serialize(),
      tiles, entities: this.serializeEntities(), spawn: this.spawn, spawnBed: !!this.spawnBed, lastPlayed: Date.now(),
      gamemode: this.player.gamemode,
    }, this.saveExtra ? this.saveExtra() : {});
    this.meta = meta;
    await this.db.putWorld(meta);
    await this.world.saver.flush();
    if (!quiet) this.ui.chat('World saved.', '#aaa');
  }

  serializeEntities() {
    const out = this.entities.serialize();
    if (this.mobs) out.push(...this.mobs.serializeDormant());
    return out;
  }
  restoreEntity(d) {
    if (d.t === 'item') { const e = new ItemEntity(this, d.x, d.y, d.z, d.s); e.life = d.life || 300; this.entities.add(e); }
    else if (this.mobs) this.mobs.restore(d);
  }

  findSpawn() {
    const T = this.world.terrain;
    const r = new RNG(this.world.seed);
    for (let i = 0; i < 400; i++) {
      const ang = i * 2.399, rad = Math.sqrt(i) * 40;
      const x = Math.round(Math.cos(ang) * rad), z = Math.round(Math.sin(ang) * rad);
      const o = T.column(x, z, {});
      const bad = [0, 1, 2, 5, 6, 21, 15, 14].includes(o.biome);
      if (!bad && o.height > SEA + 1 && o.height < SEA + 40) return [x, o.height + 2, z];
    }
    void r;
    return [0, 90, 0];
  }

  surfaceAt(x, z) {
    const w = this.world;
    for (let y = HEIGHT - 2; y > 0; y--) {
      const id = w.getBlock(x, y, z);
      if (id && BLOCKS[id].solid) return y + 1;
      if (IS_LIQUID[id]) return y + 1;
    }
    return SEA + 1;
  }

  // ------------------------------------------------------------------ helpers
  inventoryOrder(fromContainer) {
    const o = [];
    for (let i = 0; i < 9; i++) o.push(i);
    for (let i = 9; i < 36; i++) o.push(i);
    void fromContainer;
    return o;
  }
  giveItem(id, count = 1, dmg = 0, extra = null) {
    const p = this.player;
    const left = p.inventory.add(id, count, dmg, this.inventoryOrder(), extra);
    if (left > 0) this.entities.dropItem(p.x, p.y + 1.2, p.z, id, left, dmg, null, extra);
  }
  dropFromPlayer(stack) {
    const p = this.player;
    const d = p.lookDir();
    this.entities.dropItem(p.x + d[0] * 0.3, p.eyeY - 0.3, p.z + d[2] * 0.3, stack.id, stack.count, stack.dmg, [d[0] * 4, d[1] * 4 + 1.5, d[2] * 4], stackExtra(stack));
  }
  fuelValue(id) { return fuelValue(id); }
  smeltable(id) { return smeltResult(id) > 0; }

  getTile(x, y, z, type) {
    const key = x + ',' + y + ',' + z;
    let t = this.tiles.get(key);
    if (!t || t.type !== type) {
      t = { type, inv: new Inventory(TILE_SIZE[type] || 3), burn: 0, burnMax: 0, cook: 0, cookMax: 8, x, y, z };
      this.tiles.set(key, t);
      if (type === 'chest' && this.fillLoot) this.fillLoot(t, x, y, z);
    }
    return t;
  }
  dropTileContents(x, y, z) {
    const key = x + ',' + y + ',' + z;
    const t = this.tiles.get(key);
    if (!t) return;
    for (const s of t.inv.slots) if (s) this.entities.dropItem(x + 0.5, y + 0.5, z + 0.5, s.id, s.count, s.dmg, null, stackExtra(s));
    this.tiles.delete(key);
    if (this.ui.container === t) this.ui.closeScreen();
  }

  tickFurnaces(dt) {
    for (const [, t] of this.tiles) {
      if (t.type !== 'furnace') continue;
      if (!this.world.isLoaded(t.x, t.z)) continue;
      const inv = t.inv;
      const input = inv.slots[0], fuel = inv.slots[1], out = inv.slots[2];
      const res = input ? smeltResult(input.id) : 0;
      const can = res && (!out || (out.id === res && out.count < ITEMS[res].stack));
      const wasLit = t.burn > 0;
      if (t.burn <= 0 && can && fuel && fuelValue(fuel.id) > 0) {
        t.burnMax = t.burn = fuelValue(fuel.id) / 10 * t.cookMax;
        if (ITEMS[fuel.id].name === 'lava_bucket') inv.slots[1] = { id: I.bucket, count: 1, dmg: 0 };
        else { fuel.count--; if (fuel.count <= 0) inv.slots[1] = null; }
        inv.changed();
      }
      if (t.burn > 0) {
        t.burn -= dt;
        if (can) {
          t.cook += dt;
          if (t.cook >= t.cookMax) {
            t.cook = 0;
            input.count--; if (input.count <= 0) inv.slots[0] = null;
            if (out) out.count++; else inv.slots[2] = { id: res, count: 1, dmg: 0 };
            t.xp = (t.xp || 0) + 1;
            inv.changed();
          }
        } else t.cook = 0;
        if (Math.random() < dt * 3) this.particles.flame(t.x + 0.5 + (Math.random() - 0.5) * 0.4, t.y + 0.3, t.z + 0.5 + (Math.random() - 0.5) * 0.4);
      } else t.cook = Math.max(0, t.cook - dt * 2);
      const lit = t.burn > 0;
      if (lit !== wasLit) {
        const m = this.world.getMeta(t.x, t.y, t.z);
        if (this.world.getBlock(t.x, t.y, t.z) === B.furnace) this.world.setBlock(t.x, t.y, t.z, B.furnace, lit ? (m | 4) : (m & 3), { noUpdate: true });
      }
    }
  }

  onSmeltTake(s) {
    void s;
    const t = this.ui.container;
    if (t && t.xp) { if (this.dropXP) this.dropXP(this.player.x, this.player.y + 1, this.player.z, t.xp); else this.player.xp += t.xp; t.xp = 0; }
  }

  growTree(x, y, z, kind) {
    const w = this.world;
    // check room
    for (let k = 1; k < 6; k++) if (w.getBlock(x, y + k, z) && !BLOCKS[w.getBlock(x, y + k, z)].replaceable) return;
    w.setBlock(x, y, z, 0, 0, { noUpdate: true });
    const r = new RNG((x * 73856093) ^ (z * 19349663) ^ y);
    r.hash = (a, b, c) => ((Math.imul(a, 374761393) ^ Math.imul(b, 1103515245) ^ Math.imul(c, 668265263)) >>> 0) / 4294967296;
    const ctx = {
      log: (wx, wy, wz, id, axis) => { const c = w.getBlock(wx, wy, wz); if (!c || BLOCKS[c].replaceable || BLOCKS[c].name.endsWith('_leaves')) w.setBlock(wx, wy, wz, id, axis, { noUpdate: true }); },
      leaf: (wx, wy, wz, id, hanging) => { const c = w.getBlock(wx, wy, wz); if (!c || (BLOCKS[c].replaceable && !IS_LIQUID[c])) w.setBlock(wx, wy, wz, id, hanging ? 4 : 0, { noUpdate: true }); },
      put: (wx, wy, wz, id, m) => { if (!w.getBlock(wx, wy, wz)) w.setBlock(wx, wy, wz, id, m, { noUpdate: true }); },
    };
    (TREES[kind] || TREES.oak)(ctx, x, y, z, r);
    this.particles.sparkle(x + 0.5, y + 1, z + 0.5, [0.5, 1, 0.5], 10);
  }

  trySleep(x, y, z) {
    const p = this.player;
    this.spawn = [x, y + 1, z];
    this.spawnBed = true;
    const night = this.dayTime > 0.77 || this.dayTime < 0.23;
    const storm = this.weather.state === 'storm';
    if (!night && !storm) { this.ui.chat('Respawn point set. You can only sleep at night or during thunderstorms.', '#ddd'); return; }
    if (this.mobs && this.mobs.hostilesNear(p.x, p.y, p.z, 8)) { this.ui.chat('You may not rest now; there are monsters nearby.', '#f88'); return; }
    this.sleeping = { t: 0, x, y, z };
    p.x = x + 0.5; p.z = z + 0.5; p.y = y + 0.56; p.vx = p.vz = p.vy = 0;
    this.ui.sleepEl.style.opacity = 1;
  }
  updateSleep(dt) {
    const s = this.sleeping;
    if (!s) return;
    s.t += dt;
    if (s.t > 2.2) {
      if (this.dayTime > 0.5) this.day++;
      this.dayTime = 0.235;
      if (this.weather.rain > 0.1) this.weather.set('clear');
      this.sleeping = null;
      this.ui.sleepEl.style.opacity = 0;
      this.ui.chat('Good morning! Respawn point set.', '#ffe070');
      this.saveWorld(true);
    }
  }

  // ------------------------------------------------------------------ events
  onPlayerHurt(dmg, cause) {
    this.hurtFlash = 1;
    this.audio.play('hurt');
    this.camShake = 0.25;
    void dmg; void cause;
  }
  onPlayerDeath(cause, source) {
    const p = this.player;
    this.audio.play('death');
    if (!p.creative) {
      for (const inv of [p.inventory, p.armor, p.offhand]) {
        for (let i = 0; i < inv.size; i++) { const s = inv.slots[i]; if (s) this.entities.dropItem(p.x, p.y + 1, p.z, s.id, s.count, s.dmg, null, stackExtra(s)); }
        inv.clear();
      }
      p.xp = 0;
    }
    const msgs = { fall: 'hit the ground too hard', lava: 'tried to swim in lava', drown: 'drowned', fire: 'burned to death', starve: 'starved to death', cactus: 'was pricked to death', void: 'fell out of the world', mob: 'was slain', generic: 'died', lightning: 'was struck by lightning' };
    const who = source && source.name ? ` by ${source.name}` : '';
    this.deathMsg = 'Jacob ' + (msgs[cause] || msgs.generic) + who;
    this.ui.chat(this.deathMsg, '#f66');
    this.showDeath && this.showDeath(this.deathMsg);
  }
  respawn() {
    const p = this.player;
    let s = this.spawn || this.findSpawn();
    if (this.spawnBed && this.world.isLoaded(s[0], s[2]) && this.world.getBlock(s[0], s[1] - 1, s[2]) !== B.bed) {
      this.spawnBed = false; this.spawn = s = this.findSpawn();
      this.ui.chat('Your home bed was missing, so you woke up where you first arrived.', '#ddd');
    }
    p.respawn([s[0] + 0.5, s[1], s[2] + 0.5]);
    if (this.world.isLoaded(s[0], s[2])) p.y = Math.max(s[1], this.surfaceAt(s[0], s[2]));
    this.hurtFlash = 0;
  }
  onLightning(x, y, z, dist) {
    const w = this.world;
    if (dist < 120 && w.isLoaded(x, z)) {
      const top = w.getBlock(Math.floor(x), y - 1, Math.floor(z));
      if (top && BLOCKS[top].flammable !== false && !w.getBlock(Math.floor(x), y, Math.floor(z)) && Math.random() < 0.4) w.setBlock(Math.floor(x), y, Math.floor(z), B.fire, 0);
      this.particles.sparkle(x, y, z, [0.7, 0.8, 1], 20);
    }
    const p = this.player;
    if (Math.hypot(p.x - x, p.z - z) < 3 && Math.abs(p.y - y) < 6) { p.damage(5, 'lightning'); p.fireTime = 4; }
    this.mobs && this.mobs.onLightning(x, y, z);
  }
  onLand(e, fall) {
    if (fall > 4 && e === this.player) this.camShake = Math.min(0.3, fall * 0.02);
  }

  // ------------------------------------------------------------------ commands
  runCommand(cmd) {
    const [name, ...args] = cmd.trim().split(/\s+/);
    const p = this.player, ui = this.ui;
    const say = (t, c = '#9cf') => ui.chat(t, c);
    switch ((name || '').toLowerCase()) {
      case 'help':
        say('Commands: /time set <day|noon|sunset|night|midnight|0-24000>, /weather <clear|cloudy|rain|heavy|thunder|fog>, /gamemode <survival|creative>, /tp x y z, /give <item> [n], /seed, /kill, /heal, /feed, /fly, /spawn <mob>, /locate <biome>, /clear, /speed');
        break;
      case 'time': {
        const v = args[0] === 'set' ? args[1] : args[0];
        const named = { day: 0.29, sunrise: 0.245, morning: 0.3, noon: 0.5, sunset: 0.745, dusk: 0.77, night: 0.85, midnight: 0 };
        let t = named[v];
        if (t === undefined && !isNaN(+v)) t = ((+v / 24000) + 0.25) % 1;
        if (t === undefined) return say('Usage: /time set <day|noon|sunset|night|midnight|ticks>', '#f88');
        this.dayTime = t; say('Time set.');
        break;
      }
      case 'weather': {
        const map = { thunder: 'storm', storm: 'storm', clear: 'clear', rain: 'rain', heavy: 'heavy', cloudy: 'cloudy', fog: 'fog', snow: 'rain' };
        const s = map[args[0]];
        if (!s) return say('Usage: /weather <clear|cloudy|rain|heavy|thunder|fog> [seconds]', '#f88');
        this.weather.set(s, args[1] ? +args[1] : undefined);
        say('Weather set to ' + s + '.');
        break;
      }
      case 'gamemode': case 'gm': {
        const m = { survival: 'survival', s: 'survival', 0: 'survival', creative: 'creative', c: 'creative', 1: 'creative' }[args[0]];
        if (!m) return say('Usage: /gamemode <survival|creative>', '#f88');
        p.gamemode = m; if (m === 'survival') p.flying = false;
        say('Game mode set to ' + m + '.');
        break;
      }
      case 'tp': {
        const n = args.map(Number);
        if (n.length < 3 || n.some(isNaN)) return say('Usage: /tp x y z', '#f88');
        p.x = n[0]; p.y = n[1]; p.z = n[2]; p.vx = p.vy = p.vz = 0; p.fallDist = 0;
        say(`Teleported to ${n.join(' ')}.`);
        break;
      }
      case 'give': {
        const it = itemByName(args[0]) || ITEMS.find(x => x && x.label.toLowerCase().replace(/ /g, '_') === (args[0] || '').toLowerCase());
        if (!it) return say('Unknown item: ' + args[0], '#f88');
        this.giveItem(it.id, Math.max(1, Math.min(6400, +args[1] || 1)));
        say(`Gave ${args[1] || 1} ${it.label}.`);
        break;
      }
      case 'seed': say('Seed: ' + this.meta.seedText + ' (' + this.world.seed + ')'); break;
      case 'kill': p.damage(1000, 'void', true); break;
      case 'heal': p.health = p.maxHealth; say('Healed.'); break;
      case 'feed': p.food = 20; p.saturation = 10; say('Fed.'); break;
      case 'fly': if (p.creative) { p.flying = !p.flying; } else say('Flying requires creative mode.', '#f88'); break;
      case 'clear': p.inventory.clear(); say('Inventory cleared.'); break;
      case 'speed': this.timeScale = +args[0] || 1; say('Time scale ' + this.timeScale); break;
      case 'locate': {
        const want = (args.join(' ') || '').toLowerCase();
        const T = this.world.terrain;
        let best = null;
        for (let r = 64; r < 6000 && !best; r += 64) {
          for (let a = 0; a < 32; a++) {
            const x = Math.round(p.x + Math.cos(a / 32 * 6.283) * r), z = Math.round(p.z + Math.sin(a / 32 * 6.283) * r);
            const b = BIOMES[T.column(x, z, {}).biome];
            if (b.label.toLowerCase().includes(want)) { best = [x, z, b.label]; break; }
          }
        }
        if (best) say(`Nearest ${best[2]}: ${best[0]}, ${best[1]} (${Math.round(Math.hypot(best[0] - p.x, best[1] - p.z))} blocks)`);
        else if (this.locateStructure && this.locateStructure(want)) { /* handled */ }
        else say('Could not find ' + want, '#f88');
        break;
      }
      default:
        if (this.extraCommand && this.extraCommand(name, args)) break;
        say('Unknown command. Type /help', '#f88');
    }
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    if (!this.world || this.state === 'none') return;
    const p = this.player, input = this.input, ui = this.ui;
    const ts = this.timeScale || 1;
    const active = this.state === 'playing' && !ui.isOpen && !ui.chatOpen && !p.dead && (input.locked || this.debugActive) && !this.sleeping;
    // ---- input-driven actions
    if (active) {
      const sens = 0.0022 * (this.settings.sensitivity || 1) * (this.zoom ? 0.25 : 1);
      p.yaw -= input.mouse.dx * sens;
      p.pitch -= input.mouse.dy * sens * (this.settings.invertY ? -1 : 1);
      p.pitch = Math.max(-1.5707, Math.min(1.5707, p.pitch));
      if (input.mouse.wheel) { p.selected = (p.selected + (input.mouse.wheel > 0 ? 1 : -1) + 9) % 9; }
      for (let i = 1; i <= 9; i++) if (input.keyPressed('Digit' + i)) p.selected = i - 1;
      if (input.was('inventory')) { ui.openInventory(); input.unlock(); }
      if (input.was('journal') && ui.openJournal) { ui.openJournal(); input.unlock(); }
      if (input.was('swap') && this.swapHands) this.swapHands();
      if (input.was('drop')) {
        const s = p.held();
        if (s) { const n = input.key('ControlLeft') ? s.count : 1; this.dropFromPlayer(Object.assign({ id: s.id, count: n, dmg: s.dmg }, stackExtra(s) || {})); s.count -= n; if (s.count <= 0) p.inventory.set(p.selected, null); else p.inventory.changed(); }
      }
      if (input.was('chat')) { ui.openChat(''); }
      if (input.was('command')) { ui.openChat('/'); }
      if (input.was('perspective')) this.thirdPerson = (this.thirdPerson + 1) % 3;
    }
    if (input.was('debug')) ui.showDebug = !ui.showDebug;
    if (input.was('hideHud')) { this.hideHud = !this.hideHud; ui.setHudVisible(!this.hideHud); }

    if (this.state === 'paused') return;

    this.time += dt;
    // ---- time of day
    if (!this.sleeping) {
      const prev = this.dayTime;
      this.dayTime = (this.dayTime + dt * ts / DAY_LENGTH) % 1;
      if (this.dayTime < prev) this.day++;
    }
    this.updateSleep(dt);

    // ---- player physics at fixed 60 Hz
    this.physAcc += dt;
    let steps = 0;
    while (this.physAcc >= 1 / 60 && steps < 5) {
      this.physAcc -= 1 / 60; steps++;
      if (!p.dead && !this.sleeping) {
        // a mount that has gone (died, despawned, unloaded) lets its rider down
        if (p.riding && (p.riding.dead || (p.riding.deathT >= 0) || !this.entities.list.includes(p.riding))) { p.riding.rider = null; p.riding = null; p.fallDist = 0; }
        if (p.riding) p.riding.controlRide(1 / 60, input, active);
        else p.updateMovement(1 / 60, input, active);
      }
    }
    if (steps >= 5) this.physAcc = 0;
    p.updateSurvival(dt);
    if (p.swing > 0 && !this.freezeSwing) {
      const kind = holdKind(p.held() ? ITEMS[p.held().id] : null);
      const hit = p.held() ? ITEMS[p.held().id] : null;
      const as = hit && hit.tool && hit.tool.atkSpeed ? hit.tool.atkSpeed : kind === 'empty' ? 3.6 : 2.4;
      const rate = Math.max(2.2, Math.min(4.5, 1.6 + as * 1.1));
      p.swing = Math.max(0, p.swing - dt * rate);
    }
    if (!this.hands) this.hands = new FirstPerson(this);
    this.hands.update(dt);
    this.interaction.update(dt, input, active);

    // ---- world
    const w = this.world;
    w.update(p.x, p.z, dt);
    this.tickAcc += dt;
    let ticks = 0;
    while (this.tickAcc >= 0.05 && ticks < 4) { this.tickAcc -= 0.05; w.gameTick(p.x, p.z); ticks++; }
    if (ticks >= 4) this.tickAcc = 0;
    this.tickFurnaces(dt);
    // hit-stop briefly slows the world (not the camera) on heavy blows
    let edt = dt;
    if (this.slowMoT > 0) { this.slowMoT -= dt; edt = dt * 0.3; }
    if (this.hitStopT > 0) { this.hitStopT -= dt; edt = dt * 0.06; }
    this.entities.update(edt);
    this.mobs && this.mobs.update(edt);
    this.extUpdate && this.extUpdate(edt);
    this.particles.update(edt);

    // ---- environment sampling
    this.envTimer -= dt;
    if (this.envTimer <= 0) {
      this.envTimer = 0.25;
      this.currentBiomeId = w.biomeAt(p.x, p.z);
      this.currentBiome = BIOMES[this.currentBiomeId];
      const sk = w.skyLight(p.x, p.eyeY, p.z) / 15;
      this.skyExposureTarget = sk * sk;
      let water = 0, lava = 0, fire = 0, torches = 0, leaves = 0, sea = 0;
      for (let k = 0; k < 110; k++) {
        const near = k >= 40;
        const x = Math.floor(p.x + (Math.random() - 0.5) * (near ? 10 : 16)), y = Math.floor(p.y + (Math.random() - 0.5) * (near ? 7 : 10)), z = Math.floor(p.z + (Math.random() - 0.5) * (near ? 10 : 16));
        const id = w.getBlock(x, y, z);
        if (IS_LIQUID[id] === 1 && (w.getMeta(x, y, z) & 7)) water++;
        else if (IS_LIQUID[id] === 1 && y >= SEA - 1 && y <= SEA && !w.getBlock(x, y + 1, z)) sea++;
        else if (id && BLOCKS[id].name.endsWith('_leaves')) leaves++;
        else if (IS_LIQUID[id] === 2) { lava++; if (Math.random() < 0.3) this.particles.ember(x + 0.5, y + 1, z + 0.5, 0.5); }
        else if (id === B.fire) fire++;
        else if (id === B.torch) { torches++; this.particles.flame(x + 0.5, y + 0.72, z + 0.5); if (Math.random() < 0.4) this.particles.smoke(x + 0.5, y + 0.85, z + 0.5, 1, 0.25); }
        else if (id === B.magma && Math.random() < 0.3) this.particles.ember(x + 0.5, y + 1, z + 0.5, 0.3);
        else if (id === B.glowcap && Math.random() < 0.5) this.particles.sparkle(x + 0.5, y + 0.3, z + 0.5, [0.3, 0.9, 1], 1);
        else if (id === B.campfire) { fire++; for (let s = 0; s < 3; s++) this.particles.smoke(x + 0.5, y + 0.6 + s * 0.3, z + 0.5, 1, 0.42); this.particles.ember(x + 0.5, y + 0.5, z + 0.5, 0.4); this.particles.flame(x + 0.5 + (Math.random() - 0.5) * 0.3, y + 0.4, z + 0.5 + (Math.random() - 0.5) * 0.3); }
        else if (id === B.candle && Math.random() < 0.5) this.particles.flame(x + 0.5, y + 0.52, z + 0.5);
        else if (id && BLOCKS[id].fx && this.blockFx) { if (BLOCKS[id].fx !== 'moths') fire++; this.blockFx(BLOCKS[id].fx, x, y, z); }
      }
      this.nearWater = Math.min(1, water / 4); this.nearLava = Math.min(1, lava / 3); this.nearFire = Math.min(1, fire / 2);
      this.nearLeaves = Math.min(1, leaves / 12);
      this.nearOcean = (this.nearOcean || 0) * 0.7 + Math.min(1, sea / 10) * 0.3;
      if ((this._villT = (this._villT || 0) - 1) <= 0) { this._villT = 8; this.nearVillage = this.entities.list.some(e => e.kind === 'villager' && Math.abs(e.x - p.x) < 48 && Math.abs(e.z - p.z) < 48) ? 1 : 0; }
    }
    this.skyExposure += ((this.skyExposureTarget ?? 1) - this.skyExposure) * Math.min(1, dt * 2);
    this.weather.update(dt * ts, { biome: this.currentBiomeId, x: p.x, y: p.y, z: p.z, timeOfDay: this.dayTime, underwater: p.liquid.eyeInWater });
    // rain splashes on surfaces
    if (this.weather.localRain > 0.05) this.spawnRainSplashes(dt);
    if (this.weather.localRain > 0.2 && this.skyExposure > 0.8 && !p.creative) p.fireTime = 0;
    this.precip.updateHeightmap(w, p.x, p.z, dt, this._hmDirty && Math.random() < 0.1);
    this._hmDirty = false;
    this.audio.update(dt, this);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2);
    this.camShake = Math.max(0, (this.camShake || 0) - dt);

    // autosave
    this.autosaveTimer -= dt;
    if (this.autosaveTimer <= 0) { this.autosaveTimer = 120; if (this.settings.autosave !== false) this.saveWorld(true); }
  }

  spawnRainSplashes(dt) {
    const p = this.player, W = this.weather;
    const n = Math.floor(W.localRain * 60 * dt * 10 + Math.random());
    for (let i = 0; i < n; i++) {
      const x = p.x + (Math.random() - 0.5) * 24, z = p.z + (Math.random() - 0.5) * 24;
      const top = this.precip.occluderAt(x, z);
      if (top < 0 || top > p.y + 12) continue;
      const id = this.world.getBlock(Math.floor(x), top - 1, Math.floor(z));
      const light = this.particles.lightAt(x, top + 0.2, z);
      if (IS_LIQUID[id] === 1) {
        this.particles.add({ x, y: top - 0.05, z, vx: 0, vy: 1.2, vz: 0, size: 0.05, r: 0.7, g: 0.8, b: 1, a: 0.6, a0: 0.6, fade: true, layer: -1, life: 0.25, grav: 12, light });
      } else {
        for (let k = 0; k < 2; k++) this.particles.add({ x, y: top + 0.02, z, vx: (Math.random() - 0.5) * 1.4, vy: 1 + Math.random(), vz: (Math.random() - 0.5) * 1.4, size: 0.035, r: 0.75, g: 0.82, b: 0.95, a: 0.6, a0: 0.6, fade: true, layer: -1, life: 0.3, grav: 16, light });
      }
    }
  }

  // ------------------------------------------------------------------ render
  frameParams(dt) {
    const p = this.player, W = this.weather, S = this.settings;
    const ang = (this.dayTime - 0.25) * Math.PI * 2;
    const sd = [Math.cos(ang) * 0.94, Math.sin(ang), 0.34];
    const l = Math.hypot(...sd);
    const sunDir = sd.map(v => v / l);
    const moonDir = [-sunDir[0], -sunDir[1], -sunDir[2] * 0.6];
    const ml = Math.hypot(...moonDir); moonDir[0] /= ml; moonDir[1] /= ml; moonDir[2] /= ml;
    const moonPhase = (this.day % 8) / 8;
    this.lightTimer -= dt;
    if (!this.lightCache || this.lightTimer <= 0) {
      this.lightTimer = 0.1;
      this.lightCache = computeSkyLighting(sunDir, moonDir, { overcast: W.overcast, rain: Math.max(W.localRain, W.localSnow) }, moonPhase);
    }
    const L = this.lightCache;
    this.isDay = sunDir[1] > -0.05;
    const underwater = p.liquid.eyeInWater;
    const bob = S.viewBob && !this.thirdPerson ? [Math.sin(p.bobPhase) * 0.045 * p.bobAmt, -Math.abs(Math.cos(p.bobPhase)) * 0.06 * p.bobAmt] : [0, 0];
    const shakeK = S.shake ?? 1;
    if (this.camShake > 0 && shakeK > 0) { bob[0] += (Math.random() - 0.5) * this.camShake * 0.3 * shakeK; bob[1] += (Math.random() - 0.5) * this.camShake * 0.3 * shakeK; }
    let fov = S.fov;
    if (p.sprinting) fov *= 1.12;
    if (p.flying && p.sprinting) fov *= 1.05;
    this.fovCur = this.fovCur ? this.fovCur + (fov - this.fovCur) * Math.min(1, dt * 8) : fov;
    if (this.zoom) this.fovCur = 20;
    // camera
    let camPos = [p.x, p.eyeY, p.z], yaw = p.yaw, pitch = p.pitch;
    if (this.sleeping) { camPos = [p.x, p.y + 0.3, p.z]; pitch = 0.3; }
    if (this.thirdPerson) {
      const d = p.lookDir();
      const back = this.thirdPerson === 1 ? -1 : 1;
      // pull the camera back for big mounts (dragons need room to see their wings)
      const want = p.riding && p.riding.isDragon ? 10 : p.riding && p.riding.def ? 5.5 : 4;
      this._camDist = (this._camDist || want) + (want - (this._camDist || want)) * Math.min(1, dt * 3);
      let dist = this._camDist;
      if (p.riding && p.riding.isDragon) camPos[1] += 1.6;
      const hit = this.world.raycast(camPos[0], camPos[1], camPos[2], d[0] * back, d[1] * back, d[2] * back, dist, (id) => BLOCKS[id].opaque ? { t: 0, face: 0 } : null);
      if (hit) dist = Math.max(0.5, hit.dist - 0.3);
      camPos = [camPos[0] + d[0] * back * dist, camPos[1] + d[1] * back * dist, camPos[2] + d[2] * back * dist];
      if (this.thirdPerson === 2) { yaw += Math.PI; pitch = -pitch; }
    }
    const nightVision = p.effects.nightvision ? 1 : 0;
    const biome = this.currentBiome || BIOMES[7];
    // atmosphere: biome fog tint (swamp green, desert warm haze, volcanic ash...), stormy grey, low valley mist at dawn
    {
      const FT = { SWAMP: [0.8, 0.92, 0.7], ANCIENT_FOREST: [0.8, 0.94, 0.84], JUNGLE: [0.88, 1.0, 0.88], VOLCANIC: [1.12, 0.84, 0.68], DESERT: [1.1, 0.98, 0.84], BADLANDS: [1.12, 0.92, 0.78], SNOWY_PEAKS: [0.94, 0.98, 1.06], TUNDRA: [0.95, 0.98, 1.05], SNOWY_TAIGA: [0.94, 0.98, 1.04], TAIGA: [0.92, 0.98, 0.98] };
      let t = FT[biome.key] || [1, 1, 1];
      const st = Math.min(1, W.storm * 0.9 + W.rain * 0.3);
      t = t.map((v, i) => v * (1 - st) + [0.82, 0.85, 0.9][i] * st);
      const cur = this.fogTintCur || (this.fogTintCur = t.slice());
      for (let i = 0; i < 3; i++) cur[i] += (t[i] - cur[i]) * Math.min(1, dt * 0.6);
      const dawn = Math.max(0, 1 - Math.abs(this.dayTime - 0.27) / 0.07);
      const hT = 0.022 + dawn * 0.045 + (biome.key === 'SWAMP' ? 0.02 : 0);
      this.fogHeightCur = (this.fogHeightCur || 0.022) + (hT - (this.fogHeightCur || 0.022)) * Math.min(1, dt * 0.5);
    }
    const stormDark = W.storm * 0.55 + W.rain * 0.18;
    const sunsetWarm = Math.max(0, 1 - Math.abs(sunDir[1] - 0.05) / 0.2);
    return {
      game: true,
      camPos, yaw, pitch, fov: this.fovCur * Math.PI / 180, time: this.time, dt,
      handLight: this.heldLight > 0 ? [p.x + Math.cos(p.yaw) * 0.35 - camPos[0], p.eyeY - 0.35 - camPos[1], p.z - Math.sin(p.yaw) * 0.35 - camPos[2], this.heldLight] : null,
      renderDist: this.world.renderDistance, chunks: this.world.chunks.values(),
      sunDir, moonDir, moonPhase, light: L,
      blockColor: [1.0, 0.62, 0.30],
      fogDensity: W.fogDensity, fogHeight: this.fogHeightCur || 0.022, fogTint: this.fogTintCur || [1, 1, 1], glare: S.glare === false ? 0 : 1 - W.overcast * 0.85, wetness: W.wetness, flash: W.flash * (S.flashes === false ? 0.15 : 1), wind: W.wind,
      shadowsOn: S.shadows, cloudsOn: S.clouds, cloudCoverage: W.cover, cloudDensity: 0.9 + W.storm * 0.6, cloudWind: W.cloudWind,
      overcast: W.overcast, skyDarken: 1 - stormDark, grayTint: [0.72, 0.76, 0.82],
      ssrOn: S.ssr, rain: W.localRain, volumetricOn: S.volumetric, volDensity: W.volDensity,
      underwater, underwaterColor: biome.water.map(v => v * 0.12),
      bloomStrength: 0.05, exposureBias: (nightVision ? 4 : 1) * (S.brightness || 1), maxExposure: (nightVision ? 30 : 4.5) * Math.max(1, S.brightness || 1),
      saturation: 1.08 - W.overcast * 0.12, grade: [1 + sunsetWarm * 0.06, 1, 1 - sunsetWarm * 0.05],
      vignette: 0.5, hurt: this.hurtFlash, inLava: p.liquid.eyeInLava, bob: this.thirdPerson ? null : bob, roll: this.thirdPerson || S.hurtTilt === false ? 0 : (this.hurtRoll || 0),
      precipQuality: S.quality === 'low' ? 0.5 : 1,
    };
  }

  render(dt) {
    if (!this.world || !this.player) return;
    const F = this.frameParams(dt);
    if (this.frameHook) this.frameHook(F);
    this.lastF = F;
    this.renderer.render(F);
  }

  drawEntities(gl, r, F) {
    const er = this.er;
    this.entities.render(er, F);
    if (this.mobs) this.mobs.render(er, F);
    if (this.thirdPerson && this.playerModel) this.playerModel(er, F);
    er.drawBoxes(F, false);
    er.snapshotShadow(F.camPos);
    const items = this.entities.itemDraw;
    if (items.length) {
      er.beginItems(F);
      gl.disable(gl.CULL_FACE);
      for (const [id, M, light] of items) er.drawItem(id, M, light);
      gl.enable(gl.CULL_FACE);
    }
  }

  drawOverlays(gl, r, F) {
    const er = this.er;
    // particles
    er.drawParticles(F, this.particles.list);
    // weather
    this.precip.draw(F, this.weather);
    // selection outline + crack
    const t = this.interaction.target;
    if (t && t.type === 'block' && !this.hideHud) {
      const boxes = selectionBoxes(t.id, t.meta, this.world, t.x, t.y, t.z);
      const verts = [];
      const e = 0.002;
      for (const b of boxes) {
        const x0 = b[0] - e, y0 = b[1] - e, z0 = b[2] - e, x1 = b[3] + e, y1 = b[4] + e, z1 = b[5] + e;
        const P = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
        for (const [a, b2] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) verts.push(...P[a], ...P[b2]);
      }
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      r.drawLines(new Float32Array(verts), [t.x - F.camPos[0], t.y - F.camPos[1], t.z - F.camPos[2]], [0, 0, 0, 0.65]);
      const m = this.interaction.mining;
      if (m && m.x === t.x && m.y === t.y && m.z === t.z && m.progress > 0) this.drawCrack(gl, r, F, boxes, t, Math.min(9, Math.floor(m.progress * 10)));
      gl.disable(gl.BLEND);
    }
    // first person hand / held item
    if (!this.thirdPerson && !this.hideHud && !this.player.dead && !this.sleeping) this.drawHand(gl, r, F);
  }

  drawCrack(gl, r, F, boxes, t, stage) {
    const verts = [];
    const e = 0.004;
    for (const b of boxes) {
      const x0 = b[0] - e, y0 = b[1] - e, z0 = b[2] - e, x1 = b[3] + e, y1 = b[4] + e, z1 = b[5] + e;
      const q = (a, b2, c, d, uv) => { for (const k of [0, 1, 2, 0, 2, 3]) { const p = [a, b2, c, d][k]; verts.push(p[0], p[1], p[2], uv[k][0], uv[k][1]); } };
      const UV = [[0, 1], [1, 1], [1, 0], [0, 0]];
      q([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], UV);
      q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], UV);
      q([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], UV);
      q([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], UV);
      q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], UV);
      q([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], UV);
    }
    const p = r.pCrack;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(p.u.u_viewProj, false, r.viewProj);
    gl.uniform3f(p.u.u_offset, t.x - F.camPos[0], t.y - F.camPos[1], t.z - F.camPos[2]);
    gl.uniform1f(p.u.u_layer, texLayer('destroy_' + stage));
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, r.albedoArray); gl.uniform1i(p.u.u_albedo, 0);
    gl.bindVertexArray(r.crackVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, r.crackVBO);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(verts));
    gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, 0, verts.length / 5);
    gl.depthMask(true);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  drawHand(gl, r, F) {
    if (!this.hands) this.hands = new FirstPerson(this);
    if (this.zoom) return; // looking through the spyglass
    this.hands.draw(gl, r, F);
  }

}

export { CHUNK, LIGHT_EMIT, SHAPE };
