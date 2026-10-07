// Phase 6 damage feedback: stylized (non-graphic) impact particles per creature material, small ground
// splats that fade away, player hurt screen effects with a direction indicator, hit-stop and armor sounds.
import { Entity } from './entities.js';
import { BLOCKS, IS_LIQUID } from '../world/blocks.js';
import { mat4 } from '../core/math.js';
import { PAT } from '../mobs/models.js';

// impact material per creature: [colour, secondary colour, leaves splats, emissive]
const MAT = {
  flesh: [[0.62, 0.07, 0.09], [0.42, 0.03, 0.05], true, 0],
  rot: [[0.36, 0.12, 0.09], [0.26, 0.22, 0.1], true, 0],
  sap: [[0.36, 0.52, 0.16], [0.42, 0.3, 0.16], true, 0],
  ichor: [[0.6, 0.66, 0.16], [0.36, 0.42, 0.08], true, 0],
  mud: [[0.32, 0.26, 0.16], [0.22, 0.18, 0.1], true, 0],
  shadow: [[0.3, 0.12, 0.42], [0.08, 0.04, 0.12], false, 1.5],
  ice: [[0.78, 0.9, 1.0], [0.5, 0.7, 0.95], false, 0.6],
  ember: [[1.0, 0.55, 0.12], [0.9, 0.25, 0.05], false, 4],
  stone: [[0.62, 0.58, 0.5], [0.42, 0.4, 0.36], false, 0],
  sand: [[0.86, 0.74, 0.5], [0.66, 0.54, 0.34], false, 0],
  bone: [[0.9, 0.88, 0.8], [0.7, 0.68, 0.6], false, 0],
};
const KIND_MAT = {
  shambler: 'rot', thornling: 'sap', rootling: 'sap', moss_golem: 'sap', forest_warden: 'sap',
  cave_crawler: 'ichor', dune_scorpion: 'ichor', mire_lurker: 'mud', frog: 'flesh',
  gloomstalker: 'shadow', frost_wraith: 'ice', frost_wyrm: 'ice', ember_fiend: 'ember', volcanic_behemoth: 'ember',
  desert_titan: 'sand',
};
export function impactMat(e) { return MAT[(e && (e.def && e.def.bleed)) || KIND_MAT[e && e.kind] || 'flesh']; }

// ---------------------------------------------------------------- ground splats
class SplatLayer extends Entity {
  constructor(game) { super(game, 0, 0, 0); this.type = 'decor'; this.list = []; }
  add(x, y, z, col, size, life = 0) {
    if (this.list.length > 320) this.list.shift();
    const blobs = [];
    const n = 2 + Math.floor(Math.random() * 3) + (size > 0.4 ? 3 : 0);
    for (let i = 0; i < n; i++) blobs.push([(Math.random() - 0.5) * size, (Math.random() - 0.5) * size, size * (0.35 + Math.random() * 0.5)]);
    this.list.push({ x, y, z, col, dry: col.map(v => v * 0.55), life: life || 20 + Math.random() * 10, age: 0, blobs, grow: size > 0.4 ? 1.2 : 0 });
  }
  update(dt) {
    let j = 0;
    for (const s of this.list) { s.age += dt; if (s.age < s.life) this.list[j++] = s; }
    this.list.length = j;
  }
  render(er, F) {
    const cam = F.camPos, w = this.game.world;
    for (const s of this.list) {
      const fade = Math.min(1, (s.life - s.age) / (s.life * 0.45));
      const l = w.getLight(Math.floor(s.x), Math.floor(s.y + 0.1), Math.floor(s.z));
      const light = [(l >> 4) / 15, (l & 15) / 15, 0, 0];
      const k = Math.min(1, s.age / 9), col = [s.col[0] + (s.dry[0] - s.col[0]) * k, s.col[1] + (s.dry[1] - s.col[1]) * k, s.col[2] + (s.dry[2] - s.col[2]) * k];
      const spread = s.grow ? Math.min(1, 0.35 + s.age / s.grow) : 1;   // pools spread out over a second or so
      for (const [ox, oz, r] of s.blobs) {
        const rr = r * (0.4 + 0.6 * fade) * spread;
        const M = mat4.create();
        mat4.translate(M, M, s.x + ox - rr / 2 - cam[0], s.y + 0.004 - cam[1], s.z + oz - rr / 2 - cam[2]);
        mat4.scale(M, M, rr, 0.006, rr);
        er.pushBox(M, col, PAT.flat, col, 0, 1, 1, 1, 0, light);
      }
    }
  }
}

export function installFeedback(game) {
  const ui = game.ui;
  const layer = () => {
    if (!game.splats || !game.entities.list.includes(game.splats)) { game.splats = new SplatLayer(game); game.entities.add(game.splats); }
    return game.splats;
  };
  const bloodOn = () => game.settings.blood !== false;

  // ---------------------------------------------------------- creature impacts
  game.hurtFX = (e, amount, src = {}) => {
    const m = impactMat(e);
    const P = game.particles;
    const ox = e.x, oy = e.y + (e.h || 1) * 0.6, oz = e.z;
    const dir = src.dir || (src.entity ? [e.x - src.entity.x, 0, e.z - src.entity.z] : [0, 0, 0]);
    const dl = Math.hypot(dir[0], dir[2]) || 1;
    const dx = dir[0] / dl, dz = dir[2] / dl;
    const n = Math.min(34, 10 + Math.round(amount * 2.4));
    const scale = Math.min(2.2, Math.max(0.8, (e.h || 1) / 1.6));
    const splats = bloodOn() && m[2];
    if (!bloodOn() && m[2]) {
      // gore off: neutral dust puffs only
      for (let i = 0; i < 5; i++) P.add({ x: ox, y: oy, z: oz, vx: dx * 1.5 + (Math.random() - 0.5) * 2, vy: Math.random() * 1.5, vz: dz * 1.5 + (Math.random() - 0.5) * 2, size: 0.12, size0: 0.12, grow: 1.5, r: 0.85, g: 0.85, b: 0.85, a: 0.6, a0: 0.6, fade: true, layer: -1, life: 0.5, drag: 3, light: P.lightAt(ox, oy, oz) });
      return;
    }
    for (let i = 0; i < n; i++) {
      const c = Math.random() < 0.65 ? m[0] : m[1];
      const sp = 1.5 + Math.random() * 3.5;
      const q = {
        x: ox + (Math.random() - 0.5) * 0.3 * scale, y: oy + (Math.random() - 0.5) * 0.4 * scale, z: oz + (Math.random() - 0.5) * 0.3 * scale,
        vx: dx * sp + (Math.random() - 0.5) * 2.4, vy: 1 + Math.random() * 3, vz: dz * sp + (Math.random() - 0.5) * 2.4,
        size: (0.035 + Math.random() * 0.045) * Math.min(1.5, scale), r: c[0], g: c[1], b: c[2], a: 1, a0: 1, fade: false, layer: m[3] > 1 ? -2 : -3, rot: Math.random() * 3,
        life: 0.7 + Math.random() * 0.6, grav: 20, drag: 0.6, collide: true, emis: m[3], add: m[3] > 1,
        light: P.lightAt(ox, oy, oz),
      };
      if (splats && i % 2 === 0) q.onLand = (p) => { if (onGround(p)) layer().add(p.x, Math.floor(p.y - 0.05) + topOf(p.x, p.y, p.z), p.z, m[1], 0.16 + Math.random() * 0.18); };
      P.add(q);
    }
    if (splats) {
      // a soft puff of mist where the blow landed
      for (let i = 0; i < 4; i++) P.add({ x: ox + dx * 0.15, y: oy, z: oz + dz * 0.15, vx: dx * (0.8 + Math.random()) + (Math.random() - 0.5) * 0.8, vy: 0.2 + Math.random() * 0.6, vz: dz * (0.8 + Math.random()) + (Math.random() - 0.5) * 0.8, size: 0.12 * scale, size0: 0.12 * scale, grow: 2.2, r: m[0][0], g: m[0][1], b: m[0][2], a: 0.5, a0: 0.5, fade: true, layer: -1, life: 0.45 + Math.random() * 0.25, drag: 4, light: P.lightAt(ox, oy, oz) });
      bleeding.set(e, Math.min(2.5, (bleeding.get(e) || 0) + 0.8 + amount * 0.12));
    }
    if (m === MAT.ember) for (let i = 0; i < 4; i++) P.ember(ox, oy, oz, 1.4);
    if (m === MAT.shadow) P.smoke(ox, oy, oz, 3, 0.08);
  };
  // wounded creatures drip for a moment as they move, leaving a short trail
  const bleeding = new Map();
  let dripT = 0;
  const prevExt = game.extUpdate;
  game.extUpdate = (dt) => {
    prevExt && prevExt(dt);
    if (!bleeding.size) return;
    dripT += dt;
    if (dripT < 0.11) return;
    const step = dripT; dripT = 0;
    for (const [e, t] of bleeding) {
      const left = t - step;
      if (left <= 0 || e.dead || !bloodOn()) { bleeding.delete(e); continue; }
      bleeding.set(e, left);
      if (Math.random() > 0.75) continue;
      const m = impactMat(e);
      const h = e.h || 1, hw = e.hw || 0.3;
      game.particles.add({ x: e.x + (Math.random() - 0.5) * hw, y: e.y + h * (0.3 + Math.random() * 0.3), z: e.z + (Math.random() - 0.5) * hw, vx: 0, vy: -0.5, vz: 0, size: 0.03 + Math.random() * 0.025, r: m[1][0], g: m[1][1], b: m[1][2], a: 1, a0: 1, layer: -3, life: 1.2, grav: 18, collide: true, light: game.particles.lightAt(e.x, e.y + 0.5, e.z),
        onLand: (p) => { if (onGround(p)) layer().add(p.x, Math.floor(p.y - 0.05) + topOf(p.x, p.y, p.z), p.z, m[1], 0.09 + Math.random() * 0.08); } });
    }
  };

  // a creature that falls leaves a pool where it lay (living creatures only; constructs and spirits just burst)
  game.deathFX = (e, src) => {
    void src;
    const m = impactMat(e);
    if (!bloodOn() || !m[2]) return;
    const big = Math.min(2, Math.max(0.7, (e.h || 1) * (e.hw || 0.4) * 2.2));
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3;
      game.particles.add({ x: e.x, y: e.y + (e.h || 1) * 0.5, z: e.z, vx: Math.cos(a) * sp, vy: 1 + Math.random() * 3, vz: Math.sin(a) * sp, size: 0.04 + Math.random() * 0.04, r: m[0][0], g: m[0][1], b: m[0][2], a: 1, a0: 1, layer: -3, life: 1, grav: 20, collide: true, light: game.particles.lightAt(e.x, e.y + 0.5, e.z),
        onLand: i % 3 ? null : (p) => { if (onGround(p)) layer().add(p.x, Math.floor(p.y - 0.05) + topOf(p.x, p.y, p.z), p.z, m[1], 0.15 + Math.random() * 0.15); } });
    }
    const gy = Math.floor(e.y - 0.05);
    setTimeout(() => { if (onGround({ x: e.x, y: gy + 1.02, z: e.z })) layer().add(e.x, gy + topOf(e.x, gy + 1.02, e.z), e.z, m[1], 0.55 * big, 30); }, 450);
    bleeding.delete(e);
  };

  // a splat only forms where a drop actually came down onto solid ground (not against a wall mid-air, not in water)
  function onGround(p) {
    const w = game.world;
    const below = w.getBlock(Math.floor(p.x), Math.floor(p.y - 0.05), Math.floor(p.z));
    const here = w.getBlock(Math.floor(p.x), Math.floor(p.y + 0.1), Math.floor(p.z));
    return !!below && BLOCKS[below].solid && !IS_LIQUID[below] && !IS_LIQUID[here];
  }
  function topOf(x, y, z) {
    const id = game.world.getBlock(Math.floor(x), Math.floor(y - 0.05), Math.floor(z));
    if (!id || IS_LIQUID[id]) return 0;
    const b = BLOCKS[id];
    return b.shape === 3 ? 0.5 : b.shape === 1 ? 1 : 0.95;
  }

  // ---------------------------------------------------------- player hurt feedback
  if (!ui.hurtEl) {
    ui.hurtEl = document.createElement('div'); ui.hurtEl.id = 'hurtFx'; ui.hud.appendChild(ui.hurtEl);
    ui.hurtDirEl = document.createElement('div'); ui.hurtDirEl.id = 'hurtDir'; ui.hud.appendChild(ui.hurtDirEl);
  }
  game.hurtRoll = 0;
  const prevHurt = game.onPlayerHurt.bind(game);
  game.onPlayerHurt = (dmg, cause, source) => {
    prevHurt(dmg, cause, source);
    const p = game.player;
    game.hurtPulse = Math.min(1, 0.45 + dmg * 0.08);
    game.hurtRoll = (Math.random() < 0.5 ? -1 : 1) * Math.min(0.09, 0.03 + dmg * 0.008);
    game.camShake = Math.max(game.camShake || 0, Math.min(0.45, 0.15 + dmg * 0.03));
    if (source && source.x !== undefined) {
      const ang = Math.atan2(source.x - p.x, source.z - p.z);
      const rel = ang - (p.yaw + Math.PI);
      game.hurtDir = { a: Math.atan2(Math.sin(rel), Math.cos(rel)), t: 1.2 };
    }
    // armor clank
    if (p.armorPoints() > 0 && cause !== 'fall' && cause !== 'drown' && cause !== 'starve' && cause !== 'poison') game.audio.play('armor_hit');
    if (bloodOn() && cause !== 'drown' && cause !== 'starve' && cause !== 'fall' && cause !== 'poison') {
      for (let i = 0; i < 6 + Math.min(8, Math.round(dmg)); i++) {
        const a = Math.random() * Math.PI * 2;
        const q = { x: p.x + Math.cos(a) * 0.6, y: p.y + 0.8 + Math.random() * 0.6, z: p.z + Math.sin(a) * 0.6, vx: Math.cos(a) * 1.5, vy: 1 + Math.random() * 2, vz: Math.sin(a) * 1.5, size: 0.04 + Math.random() * 0.03, r: 0.62, g: 0.07, b: 0.09, a: 1, a0: 1, layer: -3, life: 0.9, grav: 20, collide: true, light: game.particles.lightAt(p.x, p.y + 1, p.z) };
        if (i % 3 === 0) q.onLand = (pp) => { if (onGround(pp)) layer().add(pp.x, Math.floor(pp.y - 0.05) + topOf(pp.x, pp.y, pp.z), pp.z, MAT.flesh[1], 0.12 + Math.random() * 0.1); };
        game.particles.add(q);
      }
    }
  };

  // ---------------------------------------------------------- hit-stop: a few frames of weight on heavy blows
  game.hitStopT = 0;
  game.hitStop = (t) => { game.hitStopT = Math.max(game.hitStopT, t); };

  const prevHud = ui.updateHUD.bind(ui);
  ui.updateHUD = (dt) => {
    prevHud(dt);
    const p = game.player;
    if (!p) return;
    game.hurtPulse = Math.max(0, (game.hurtPulse || 0) - dt * 1.6);
    game.hurtRoll *= Math.exp(-dt * 7);
    const low = !p.creative && p.health <= 6 ? (1 - p.health / 6) * (0.55 + 0.45 * Math.sin(performance.now() / 260)) * 0.6 : 0;
    const o = Math.min(1, game.hurtPulse + low);
    if (Math.abs(o - (ui._hurtO || 0)) > 0.01) { ui._hurtO = o; ui.hurtEl.style.opacity = o; }
    const hd = game.hurtDir;
    if (hd && hd.t > 0) {
      hd.t -= dt;
      ui.hurtDirEl.style.opacity = Math.min(1, hd.t * 1.5);
      ui.hurtDirEl.style.transform = `translate(-50%, -50%) rotate(${-hd.a}rad)`;
    } else if (ui.hurtDirEl.style.opacity !== '0') ui.hurtDirEl.style.opacity = 0;
  };
}

// ---------------------------------------------------------------- sound captions (accessibility)
const CAPTIONS = {
  explode: 'Explosion', gunshot: 'Gunshot', blunderbuss: 'Blunderbuss blast', fuse: 'Fuse hisses', hurt: 'You are hurt', death: 'You died',
  bow: 'Bow fires', crossbow_fire: 'Crossbow fires', arrow_hit: 'Arrow hits', hit: 'Something is hit', crit: 'Critical hit', roar: 'Roar', thunder: 'Thunder',
  door_open: 'Door opens', door_close: 'Door closes', chest_open: 'Chest opens', splash: 'Splash', ignite: 'Fire ignites', levelup: 'Level up',
  break_tool: 'Tool breaks', magic: 'Magic shimmers', enchant: 'Runes glow', brew_done: 'Potion bubbles', xp: 'Experience gained', sizzle: 'Food sizzles',
  mob_growl: 'Growling', mob_hiss: 'Hissing', mob_shriek: 'Shrieking', mob_clatter: 'Clattering', mob_creak: 'Creaking', mob_moo: 'Cow moos', mob_oink: 'Pig oinks',
  mob_baa: 'Sheep bleats', mob_cluck: 'Chicken clucks', mob_neigh: 'Horse neighs', mob_bark: 'Wolf barks', mob_howl: 'Wolf howls', mob_meow: 'Cat meows',
  mob_croak: 'Frog croaks', mob_trumpet: 'Mammoth trumpets', mob_hmm: 'Villager murmurs', bird: 'Birds sing',
};
export function installCaptions(game) {
  const ui = game.ui;
  const box = document.createElement('div'); box.id = 'captions'; ui.hud.appendChild(box);
  const live = new Map();
  game.audio.onCaption = (name, pos) => {
    if (!game.settings.captions) return;
    const text = CAPTIONS[name];
    if (!text) return;
    const p = game.player;
    let arrow = '';
    if (pos && p) {
      const ang = Math.atan2(pos.x - p.x, pos.z - p.z) - (p.yaw + Math.PI);
      const a = Math.atan2(Math.sin(ang), Math.cos(ang));
      arrow = Math.abs(a) < 0.5 ? '' : a < 0 ? '>' : '<';
      if (Math.abs(a) > 2.6) arrow = 'v';
    }
    let e = live.get(text);
    if (!e) { e = document.createElement('div'); e.className = 'cap'; box.appendChild(e); live.set(text, e); }
    e.innerHTML = `<i>${arrow === '<' ? '&lt;' : ''}</i>${text}<i>${arrow === '>' ? '&gt;' : arrow === 'v' ? 'v' : ''}</i>`;
    e.style.opacity = 1;
    clearTimeout(e._t);
    e._t = setTimeout(() => { e.style.opacity = 0; setTimeout(() => { if (e.style.opacity === '0') { e.remove(); live.delete(text); } }, 500); }, 2200);
  };
}
