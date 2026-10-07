// Things that watch.
//
// The Gloomstalker (rebuilt): a gaunt, hunched night-thing nearly three metres tall, with arms that reach its knees,
// a split maw and two pin-prick eyes. It keeps its distance and creeps closer only while you are not looking. Meet
// its gaze for too long and it either shrieks and charges or blinks out and reappears beside you. Once hunting it
// is restless: it rushes, freezes, steps through the dark to your flank, and flees through shadow when hurt.
//
// The Wickwalker (new, very rare): a tall figure in a patchwork coat and a pale porcelain mask, a dead lantern in
// its hand and moths circling it. Long ago it kept the lamps lit along the old roads; now it only watches from the
// edge of the light. It never attacks. Walk towards it and it comes apart into moths. Sometimes it leaves a wick.
import { Mob, MOB_CLASSES } from './mobs.js';
import { MOBS } from './defs.js';
import { MODELS, PAT, box, part, finalize } from './models.js';
import { ANIMS } from './anim.js';
import { BLOCKS, IS_LIQUID } from '../world/blocks.js';
import { I } from '../game/items.js';
import { mat4 } from '../core/math.js';

const set = (m, P, name, rx = 0, ry = 0, rz = 0, tx = 0, ty = 0, tz = 0) => {
  const i = m.model.index[name];
  if (i === undefined) return;
  const p = P[i];
  p[0] += rx; p[1] += ry; p[2] += rz; p[3] += tx; p[4] += ty; p[5] += tz;
};
const rnd = (a, b) => a + Math.random() * (b - a);

// ===================================================================== Gloomstalker model
{
  const SK = '#0b090e', SK2 = '#17111e', BONE = '#3a2e4a', CLAW = '#cfc3dc', EYE = '#f2e2ff', MAW = '#b44cf0';
  const parts = [];
  // legs: long thighs and shins, splayed toes
  for (const [n, x] of [['L', -1.9], ['R', 1.9]]) {
    parts.push(part('leg' + n, null, [x, 25, 0], [box([-1.05, -12.6, -1.05], [2.1, 13.2, 2.1], SK, PAT.noise, SK2, 0)]));
    parts.push(part('shin' + n, 'leg' + n, [x, 12.6, 0.2], [
      box([-0.9, -12.3, -0.9], [1.8, 12.6, 1.8], SK, PAT.noise, SK2, 0),
      box([-1.25, -12.6, -3.6], [2.5, 0.8, 3.9], SK2, PAT.noise),                         // long splayed foot
      box([-1.2, -12.6, -4.3], [0.5, 0.6, 0.8], CLAW, PAT.flat), box([0.7, -12.6, -4.3], [0.5, 0.6, 0.8], CLAW, PAT.flat),
    ]));
  }
  // torso: narrow pelvis, starved ribcage, ridge of spine
  const tb = [
    box([-2.6, -1.2, -1.5], [5.2, 3.2, 3], SK, PAT.noise, SK2),
    box([-1.6, 1.8, -1.1], [3.2, 3.2, 2.2], SK, PAT.noise, SK2),                          // wasp waist
    box([-3.0, 4.8, -1.8], [6, 9.4, 3.6], SK, PAT.noise, SK2),                             // ribcage
    box([-3.4, 12.6, -1.6], [6.8, 2.2, 3.2], SK2, PAT.noise),                              // shoulder yoke
  ];
  for (let i = 0; i < 4; i++) tb.push(box([-2.5 + (i % 2) * 0.2, 6 + i * 1.8, -1.95], [5, 0.55, 0.2], BONE, PAT.flat));   // ribs
  for (let i = 0; i < 6; i++) tb.push(box([-0.45, 2 + i * 2.1, 1.6], [0.9, 1.1, 0.9 + (i % 2) * 0.4], BONE, PAT.noise));   // spine knuckles
  tb.push(box([-3.9, 13.4, -0.9], [1.4, 1.6, 1.8], BONE, PAT.noise), box([2.5, 13.4, -0.9], [1.4, 1.6, 1.8], BONE, PAT.noise));   // shoulder knobs
  tb.push(box([-0.5, 9.5, -1.98], [1, 1, 0.12], '#3a1650', PAT.glow));                   // a faint ember in the chest
  parts.push(part('body', null, [0, 25, 0], tb));
  // long arms with an elbow, a bony hand and three hooked claws
  for (const [n, x] of [['L', -3.7], ['R', 3.7]]) {
    parts.push(part('arm' + n, 'body', [x, 38.6, 0], [box([-0.8, -12.4, -0.8], [1.6, 12.9, 1.6], SK, PAT.noise, SK2), box([-1, -1, -1], [2, 2.2, 2], SK2, PAT.noise)]));
    const fb = [box([-0.7, -12.2, -0.7], [1.4, 12.6, 1.4], SK, PAT.noise, SK2), box([-1.05, -14.6, -1.2], [2.1, 2.6, 2.2], SK2, PAT.noise)];
    for (let i = 0; i < 3; i++) {
      fb.push(box([-0.95 + i * 0.72, -19.4, -1.05], [0.42, 4.9, 0.42], '#1d1626', PAT.flat));
      fb.push(box([-0.95 + i * 0.72, -20.4, -1.35], [0.42, 1.1, 0.42], CLAW, PAT.flat));
    }
    parts.push(part('fore' + n, 'arm' + n, [x, 26.3, 0], fb));
  }
  // tattered shreds of shadow hanging down the back
  parts.push(part('cloak', 'body', [0, 38, 1.7], [
    box([-3.3, -15, 0], [2.1, 15.5, 0.35], '#060408', PAT.cloth, '#120c18', 2), box([-1.0, -19, 0.12], [2, 19.5, 0.35], '#060408', PAT.cloth, '#120c18', 2),
    box([1.3, -13, 0], [2.1, 13.5, 0.35], '#060408', PAT.cloth, '#120c18', 2), box([-2.5, -21, 0.1], [0.9, 3, 0.3], '#060408', PAT.cloth), box([1.9, -16.5, 0.05], [0.8, 4, 0.3], '#060408', PAT.cloth),
  ]));
  // neck and an elongated skull: brow ridge, deep sockets, pin-prick eyes (one set a little lower), a crack of light
  parts.push(part('neck', 'body', [0, 39.2, -0.2], [box([-0.85, -0.6, -0.85], [1.7, 3.6, 1.7], SK, PAT.noise, SK2)]));
  const hb = [
    box([-2.15, 0, -2.3], [4.3, 8.8, 4.4], SK, PAT.noise, SK2),
    box([-2.3, 5.1, -2.55], [4.6, 0.9, 0.5], SK2, PAT.noise),                               // brow ridge
    box([-1.95, 3.7, -2.42], [1.5, 1.3, 0.18], '#000000', PAT.flat), box([0.45, 3.5, -2.42], [1.5, 1.4, 0.18], '#000000', PAT.flat),   // sockets
    box([-1.6, 4.15, -2.5], [0.62, 0.5, 0.1], EYE, PAT.glow), box([0.86, 3.85, -2.5], [0.62, 0.55, 0.1], EYE, PAT.glow),           // eyes
    box([-0.25, 0.4, -2.42], [0.5, 3.0, 0.14], '#000000', PAT.flat),                         // the closed seam of its maw
    box([-0.12, 0.7, -2.48], [0.24, 2.4, 0.08], MAW, PAT.glow),
    box([0.7, 6.2, -2.38], [0.18, 2.3, 0.08], '#6a2a90', PAT.glow), box([0.55, 5.9, -2.36], [0.4, 0.3, 0.08], '#6a2a90', PAT.glow),   // crack
    box([-2.3, 1.2, -1.6], [0.25, 2.6, 2.4], '#05040a', PAT.flat), box([2.05, 1.2, -1.6], [0.25, 2.6, 2.4], '#05040a', PAT.flat),     // hollow cheeks
    box([-1.7, 8.6, 0.2], [0.6, 2.6, 0.6], SK2, PAT.noise), box([1.1, 8.6, 0.4], [0.6, 2.1, 0.6], SK2, PAT.noise), box([-0.3, 8.6, 1.2], [0.6, 3.2, 0.6], SK2, PAT.noise),   // shard crown
  ];
  parts.push(part('head', 'neck', [0, 42.3, -0.4], hb));
  // the jaw splits open when it screams or strikes
  parts.push(part('jaw', 'head', [0, 42.6, -1.8], [box([-1.5, -1.6, -0.7], [3, 1.9, 1.1], SK, PAT.noise, SK2), box([-0.9, -0.6, -0.78], [1.8, 0.8, 0.1], MAW, PAT.glow), box([-1.1, -1.65, -0.8], [0.35, 0.9, 0.2], CLAW, PAT.flat), box([0.75, -1.65, -0.8], [0.35, 0.9, 0.2], CLAW, PAT.flat)]));
  MODELS.gloomstalker = finalize({ parts, anim: 'gloom', height: 54 });
  Object.assign(MOBS.gloomstalker, { model: MODELS.gloomstalker, size: [0.6, 3.05], hp: 34, speed: 3.1, attack: { dmg: 7, reach: 2.3, cd: 1.2, wind: 0.35 }, sounds: { idle: 'whisper', hurt: 'shriek', death: 'shriek' }, aura: { col: [0.06, 0.03, 0.09], rate: 9 }, scaleSound: 0.8 });
}

ANIMS.gloom = (m, P, t) => {
  const id = m.mid || 0;
  const walk = m.walkAmt, ph = m.walkPhase * 0.72;
  const s = Math.sin(ph) * walk;
  const lift = Math.max(0, Math.cos(ph)) * walk, lift2 = Math.max(0, -Math.cos(ph)) * walk;
  const frozen = m.staredT > 0.2 && !m.target ? 1 : 0;
  const scream = m.screamT > 0 ? Math.min(1, m.screamT * 3, (1.1 - m.screamT) * 6 + 0.2) : 0;
  const wind = m.windAnim || 0, atk = m.attackAnim || 0;
  // long strides with a hitch at the knee
  set(m, P, 'legL', -s * 0.62); set(m, P, 'legR', s * 0.62);
  set(m, P, 'shinL', lift * 0.9); set(m, P, 'shinR', lift2 * 0.9);
  // hunched; sways slowly when idle, stock-still (trembling) when watched
  const sway = (1 - frozen) * (1 - walk) * Math.sin(t * 0.8 + id) * 0.04;
  const tremble = frozen * Math.sin(t * 47 + id) * 0.012;
  set(m, P, 'body', 0.3 - scream * 0.32 + walk * 0.08 - wind * 0.1, 0, sway + tremble, 0, Math.abs(Math.sin(ph)) * walk * 0.6);
  set(m, P, 'neck', -0.15 - scream * 0.25);
  // jerky head: snaps between odd tilts (quantised), locks onto you when watched
  const q = Math.floor(t * 0.9 + id * 3.1);
  const tilt = ((Math.sin(q * 12.9898 + id) * 43758.5453) % 1) * 0.9 * (1 - frozen) * (1 - walk * 0.7);
  set(m, P, 'head', m.headPitch - 0.15 - scream * 0.45 + (m.twitch || 0) * 0.3, m.headYaw + (m.twitch || 0) * 0.4, tilt + frozen * 0.38 + tremble * 3);
  set(m, P, 'jaw', -(scream * 0.9 + wind * 0.5 + atk * 0.4));
  // arms barely swing; they hang, fingers twitching; raise wide to strike
  const hang = Math.sin(t * 1.1 + id) * 0.05 * (1 - frozen);
  set(m, P, 'armL', -0.34 + s * 0.15 + hang - wind * 2.2 + atk * 1.4 - scream * 0.9 - frozen * 0.12, 0, 0.12 + wind * 0.55 + scream * 0.6);
  set(m, P, 'armR', -0.34 - s * 0.15 - hang - wind * 2.2 + atk * 1.4 - scream * 0.9 - frozen * 0.12, 0, -0.12 - wind * 0.55 - scream * 0.6);
  set(m, P, 'foreL', -0.25 - wind * 0.6 - atk * 0.3 + Math.sin(t * 7 + id) * 0.03);
  set(m, P, 'foreR', -0.25 - wind * 0.6 - atk * 0.3 + Math.sin(t * 7.7 + id) * 0.03);
  set(m, P, 'cloak', -0.26 + walk * 0.35 + Math.sin(t * 1.7 + id) * 0.05, 0, Math.sin(t * 1.3 + id) * 0.04);   // hangs straight down from the hunched back
};

// ===================================================================== Gloomstalker behaviour
class Gloomstalker extends Mob {
  constructor(game, kind, x, y, z, opts) {
    super(game, kind, x, y, z, opts);
    this.staredT = 0; this.screamT = 0; this.mood = 'charge'; this.moodT = 2; this.watchT = 0; this.twitch = 0; this.twitchT = 2;
  }

  // is the player looking straight at it (and can actually see it)?
  lookedAtBy(p) {
    const ex = p.x, ey = p.eyeY, ez = p.z;
    const dx = this.x - ex, dy = this.y + this.h * 0.82 - ey, dz = this.z - ez, d = Math.hypot(dx, dy, dz);
    if (d > 48 || d < 0.5) return false;
    const L = p.lookDir();
    const c = (L[0] * dx + L[1] * dy + L[2] * dz) / d;
    const tol = Math.atan(0.9 / d) + 0.06;
    if (c < Math.cos(tol)) return false;
    return this.canSee(p);
  }

  update(dt) {
    this.screamT = Math.max(0, this.screamT - dt);
    this.twitchT -= dt;
    if (this.twitchT <= 0) { this.twitchT = rnd(0.8, 4); this.twitch = Math.random() < 0.5 ? rnd(-1, 1) : 0; }
    else if (this.twitchT < 0.15) this.twitch *= 0.5;
    // eyes leave faint streaks when it moves fast
    if (this.walkAmt > 0.6 && Math.random() < dt * 10 && this.deathT < 0) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      for (const s of [-1, 1]) this.game.particles.add({ x: this.x + fx * 0.2 + rx * s * 0.07, y: this.y + 2.92, z: this.z + fz * 0.2 + rz * s * 0.07, vx: 0, vy: 0, vz: 0, size: 0.035, r: 0.95, g: 0.85, b: 1, a: 0.8, a0: 0.8, fade: true, layer: -2, life: 0.25, emis: 4, add: true });
    }
    super.update(dt);
  }

  brainHostile(dt) {
    const g = this.game, p = g.player, def = this.def;
    this.sleeping = false;
    const valid = !p.dead && !p.creative;
    const stared = valid && this.lookedAtBy(p);
    this.staredT = stared ? this.staredT + dt : Math.max(0, this.staredT - dt * 2);
    const d = this.distTo(p.x, p.y, p.z);
    if (this.target && (this.target.dead || (this.target === p && !valid) || d > 56)) this.target = null;

    if (!this.target) {
      // lurking: freeze while watched; creep closer while not; stop at the edge of the light and stare
      if (!valid || d > 40) { this.wander(dt, def.speed * 0.45); return; }
      this.lookAt = p;
      if (stared) {
        this.mx = this.mz = 0;
        if (this.staredT > 1.0 || (d < 8 && this.staredT > 0.35)) this.provoke(p);
        return;
      }
      if (d > 11) { this.seekTarget(p, def.speed * 0.6); return; }
      this.watchT += dt;
      if (this.watchT > rnd(4, 9)) this.provoke(p);   // it does not wait for ever
      return;
    }

    // hunting: restless, changes its mind
    this.moodT -= dt;
    if (this.moodT <= 0) {
      const r = Math.random();
      if (d > 12 && r < 0.55) this.mood = 'blink';
      else if (r < 0.2) this.mood = 'freeze';
      else if (r < 0.42 && d < 14) this.mood = 'blink';
      else this.mood = 'charge';
      this.moodT = this.mood === 'freeze' ? rnd(0.5, 0.9) : this.mood === 'blink' ? 0.45 : rnd(1.6, 3.4);
      if (this.mood === 'blink') this.blinkTo(p, true);
    }
    if (this.mood === 'freeze' || (this.mood === 'blink' && this.moodT > 0)) {
      // a beat of stillness before it moves again (a window for the player)
      this.lookAt = p; this.mx = this.mz = 0;
      if (this.windT > 0) super.brainHostile(dt);
      return;
    }
    const tp = def.teleports; def.teleports = false;   // teleports are handled above
    super.brainHostile(dt);
    def.teleports = tp;
    if (this.wantSpeed) this.wantSpeed *= d < 7 ? 1.3 : 1.12;
  }

  provoke(p) {
    const g = this.game;
    this.target = p; this.watchT = 0; this.staredT = 0;
    if (Math.random() < 0.6) {
      this.screamT = 1.1; this.mood = 'freeze'; this.moodT = 0.85;
      g.audio.play('gloom_scream', this);
      if (this.distTo(p.x, p.y, p.z) < 24) g.camShake = Math.max(g.camShake || 0, 0.12);
    } else {
      this.blinkTo(p, true);
      this.mood = 'freeze'; this.moodT = 0.55;
    }
  }

  // step through the dark: to the target's side or back (close), or anywhere nearby (fleeing)
  blinkTo(t, close) {
    const g = this.game, w = g.world;
    for (let k = 0; k < 16; k++) {
      let x, z;
      if (t && close) {
        const a = (t.yaw || 0) + Math.PI + rnd(-1.6, 1.6);   // behind and to the sides of where it is looking
        const r = rnd(3, 5.5);
        x = t.x - Math.sin(a) * r; z = t.z - Math.cos(a) * r;
      } else { const a = Math.random() * Math.PI * 2, r = rnd(6, 12); x = this.x + Math.cos(a) * r; z = this.z + Math.sin(a) * r; }
      const y = standY(w, x, z, t && close ? t.y : this.y, 3.2);
      if (y === null) continue;
      fxBlink(g, this.x, this.y, this.z, true);
      this.x = x; this.y = y; this.z = z; this.vx = this.vz = this.vy = 0;
      fxBlink(g, x, y, z, false);
      g.audio.play('gloom_tp', this);
      if (t) this.yaw = Math.atan2(-(t.x - x), -(t.z - z));
      return true;
    }
    return false;
  }
  teleport() { return this.blinkTo(null, false); }
}
MOB_CLASSES.gloomstalker = Gloomstalker;

// find standing room near a height (scans down/up for a solid floor with clear headroom)
function standY(w, x, z, nearY, height) {
  const bx = Math.floor(x), bz = Math.floor(z), y0 = Math.floor(nearY);
  for (let dy = 0; dy <= 7; dy++) {
    for (const y of dy ? [y0 - dy, y0 + dy] : [y0]) {
      const fl = w.getBlock(bx, y - 1, bz);
      if (!fl || !BLOCKS[fl].solid || IS_LIQUID[fl]) continue;
      let clear = true;
      for (let k = 0; k < Math.ceil(height); k++) { const id = w.getBlock(bx, y + k, bz); if (id && (BLOCKS[id].solid || IS_LIQUID[id])) { clear = false; break; } }
      if (clear) return y;
    }
  }
  return null;
}

function fxBlink(g, x, y, z, leaving) {
  const P = g.particles;
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, hgt = Math.random() * 3, r = leaving ? rnd(0.2, 0.5) : rnd(0.6, 1.4);
    const sx = x + Math.cos(a) * r, sz = z + Math.sin(a) * r, sy = y + hgt;
    const v = leaving ? -1.6 : 2.2;   // leaving: motes rush inward; arriving: they burst out
    P.add({ x: sx, y: sy, z: sz, vx: Math.cos(a) * v, vy: rnd(-0.3, 0.6), vz: Math.sin(a) * v, size: rnd(0.08, 0.16), size0: 0.14, grow: leaving ? -0.6 : 1.4, r: 0.05, g: 0.03, b: 0.08, a: 0.75, a0: 0.75, fade: true, layer: -1, life: rnd(0.35, 0.7), drag: 2, light: P.lightAt(x, y + 1, z) });
  }
  for (let i = 0; i < 10; i++) P.add({ x: x + rnd(-0.3, 0.3), y: y + rnd(0.2, 2.9), z: z + rnd(-0.3, 0.3), vx: rnd(-1.2, 1.2), vy: rnd(-0.5, 1.5), vz: rnd(-1.2, 1.2), size: 0.04, r: 0.75, g: 0.35, b: 1, a: 1, a0: 1, fade: true, layer: -2, life: rnd(0.3, 0.6), emis: 4, add: true, grav: 1 });
}

// ===================================================================== the Wickwalker
{
  const COAT = '#4a4640', COAT2 = '#3a3632', MASK = '#e9e4d8', HOOD = '#2e2b28';
  const parts = [];
  const coat = [
    box([-3.1, 0, -2.1], [6.2, 30, 4.2], COAT, PAT.cloth, COAT2, 2),
    box([-3.5, -0.1, -2.5], [7, 6, 5], COAT2, PAT.cloth, '#2a2724', 2),                        // ragged hem
    box([-2.2, 12, -2.25], [2.4, 3.2, 0.2], '#5a5248', PAT.cloth), box([0.6, 19, -2.25], [2, 2.6, 0.2], '#3e4446', PAT.cloth),   // patches
    box([-1.4, 6, 2.15], [2.8, 3.4, 0.2], '#58504a', PAT.cloth), box([1.1, 23, -2.25], [0.5, 0.5, 0.1], '#9a8a6a', PAT.flat),
    box([-0.25, 8, -2.24], [0.5, 22, 0.1], '#2a2724', PAT.flat),                                  // seam
  ];
  parts.push(part('body', null, [0, 0, 0], coat));
  for (const [n, x] of [['armL', -3.9], ['armR', 3.9]]) {
    const ab = [box([-0.9, -15.5, -0.9], [1.8, 16, 1.8], COAT, PAT.cloth, COAT2), box([-0.7, -17.6, -0.75], [1.4, 2.2, 1.5], '#d8d2c4', PAT.noise)];   // long sleeve, pale thin hand
    if (n === 'armR') ab.push(box([-0.15, -18.6, -0.15], [0.3, 1.2, 0.3], '#3a3630', PAT.metal));                 // lantern ring
    parts.push(part(n, 'body', [x, 29.5, 0], ab));
  }
  // a small dead lantern; faintly lit by the moths inside it
  parts.push(part('lantern', 'armR', [3.9, 10.8, 0], [
    box([-1.2, -3.2, -1.2], [2.4, 3.2, 2.4], '#2e2c28', PAT.metal), box([-0.9, -2.9, -0.9], [1.8, 2.6, 1.8], '#c8dcb4', PAT.glow),
    box([-1.4, -3.5, -1.4], [2.8, 0.5, 2.8], '#2e2c28', PAT.metal), box([-1.0, 0, -1.0], [2, 0.6, 2], '#2e2c28', PAT.metal),
  ]));
  // hood and porcelain mask: smooth, two small dark eye holes, a hairline crack
  parts.push(part('head', 'body', [0, 30, 0], [
    box([-3.1, -0.5, -2.2], [6.2, 9.6, 5.2], HOOD, PAT.cloth, '#24221f', 2),
    box([-2.3, 1.2, -2.42], [4.6, 6.6, 0.3], MASK, PAT.noise),
    box([-1.55, 4.6, -2.5], [0.75, 0.55, 0.1], '#100e0c', PAT.flat), box([0.8, 4.6, -2.5], [0.75, 0.55, 0.1], '#100e0c', PAT.flat),
    box([0.45, 2.2, -2.47], [0.14, 3.0, 0.06], '#8a8478', PAT.flat), box([0.2, 2.0, -2.47], [0.3, 0.14, 0.06], '#8a8478', PAT.flat),
    box([-2.9, 8.6, -1.8], [5.8, 1.6, 4.6], HOOD, PAT.cloth),                                   // peak of the hood
  ]));
  MODELS.wickwalker = finalize({ parts, anim: 'wick', height: 42 });
  MOBS.wickwalker = Object.assign({}, MOBS.bat, {
    id: 'wickwalker', name: 'The Wickwalker', type: 'watcher', hp: 999, speed: 0, runSpeed: 0, size: [0.7, 2.65], model: MODELS.wickwalker,
    drops: [], sounds: {}, idleSound: 0, fly: false, xp: 0, knockRes: 1, attack: null, follow: 0, aura: null,
  });
}

ANIMS.wick = (m, P, t) => {
  const id = m.mid || 0;
  set(m, P, 'body', 0, 0, Math.sin(t * 0.4 + id) * 0.012);
  set(m, P, 'head', m.headPitch * 0.6 + 0.08, m.headYaw, 0.18 + Math.sin(t * 0.21 + id) * 0.05);   // head tilted, watching
  set(m, P, 'armL', 0.02, 0, 0.05); set(m, P, 'armR', -0.05, 0, -0.04);
  set(m, P, 'lantern', 0.05 + Math.sin(t * 0.9 + id) * 0.06, 0, Math.sin(t * 0.7 + id) * 0.05);
};

class Wickwalker extends Mob {
  constructor(game, kind, x, y, z, opts) {
    super(game, kind, x, y, z, opts);
    this.life = rnd(28, 60); this.gone = false; this.persistent = false; this.moths = [];
    for (let i = 0; i < 9; i++) this.moths.push({ a: Math.random() * 6.28, r: rnd(0.5, 1.4), h: rnd(0.4, 2.6), s: rnd(0.6, 1.4) * (Math.random() < 0.5 ? -1 : 1), f: rnd(18, 26) });
  }
  update(dt) {
    const g = this.game, p = g.player;
    this.age += dt;
    this.life -= dt;
    // it does not move; it turns slowly to face you and its head follows
    const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, p.y - this.y, dz);
    let want = Math.atan2(-dx, -dz) - this.yaw; while (want > Math.PI) want -= Math.PI * 2; while (want < -Math.PI) want += Math.PI * 2;
    this.yaw += want * Math.min(1, dt * 0.35);
    this.lookAt = p;
    this.walkAmt = 0; this.vx = this.vz = 0;
    this.updateAnim(dt);
    if (Math.random() < dt * 1.2) this.mothFX(1, false);
    if (this.life <= 0) return this.vanish(false);
    // approach it and it comes apart; the closer you sneak, the luckier you are
    const near = p.sprinting ? 26 : p.sneaking ? 13 : 19;
    if (!p.creative && d < near) return this.vanish(true);
    if (g.zoom && this.watched && this.watched > 1.4) return this.vanish(true);   // stared at through a spyglass
  }
  vanish(byPlayer) {
    if (this.gone) return;
    this.gone = true; this.dead = true;
    const g = this.game;
    this.mothFX(48, true);
    g.audio.play('moth_flutter', this);
    if (byPlayer && Math.random() < 0.35) g.entities.dropItem(this.x, this.y + 0.4, this.z, I.pale_wick, 1);
    g.onWickVanish && g.onWickVanish(this, byPlayer);
  }
  mothFX(n, burst) {
    const P = this.game.particles;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, h = rnd(0.3, 2.6);
      P.add({ x: this.x + Math.cos(a) * rnd(0.1, 0.6), y: this.y + h, z: this.z + Math.sin(a) * rnd(0.1, 0.6), vx: Math.cos(a) * (burst ? rnd(1, 3) : 0.3), vy: burst ? rnd(0.6, 2.4) : 0.4, vz: Math.sin(a) * (burst ? rnd(1, 3) : 0.3), size: rnd(0.04, 0.07), r: 0.86, g: 0.9, b: 0.78, a: 0.9, a0: 0.9, fade: true, layer: -2, life: burst ? rnd(1.2, 2.6) : 1.6, drag: 1.2, grav: -0.4, emis: 1.2, add: false, rot: Math.random() * 6, light: P.lightAt(this.x, this.y + 1, this.z) });
    }
  }
  hurt() { this.vanish(true); return false; }
  brainHostile() {}
  serialize() { return null; }
  render(er, F) {
    if (this.gone) return;
    super.render(er, F);
    // moths circling: two flapping wing plates each
    const t = this.game.time, cam = F.camPos;
    const light = [0.4, 0.5, 0, 1.4];
    const M = mat4.create();
    for (const mo of this.moths) {
      const a = mo.a + t * mo.s, x = this.x + Math.cos(a) * mo.r, z = this.z + Math.sin(a) * mo.r, y = this.y + mo.h + Math.sin(t * 2 + mo.a) * 0.15;
      const flap = Math.sin(t * mo.f + mo.a) * 0.9;
      for (const sd of [-1, 1]) {
        M.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x - cam[0], y - cam[1], z - cam[2], 1]);
        mat4.rotateY(M, M, -a);
        mat4.rotateZ(M, M, sd * flap);
        mat4.translate(M, M, sd > 0 ? 0 : -0.07, 0, -0.025);
        mat4.scale(M, M, 0.07, 0.006, 0.05);
        er.pushBox(M, [0.86, 0.86, 0.78], PAT.flat, [0.7, 0.7, 0.62], 0, 1, 1, 1, 0, light);
      }
    }
  }
}
MOB_CLASSES.wickwalker = Wickwalker;

// ===================================================================== the Wickwalker's comings and goings
export function installStalkers(game) {
  const ui = game.ui;
  let checkT = 20, follow = null, current = null;
  const J = () => { const pl = game.player; if (!pl.journey) pl.journey = {}; const j = pl.journey; j.wick = j.wick || { last: -1e9, seen: 0 }; j.creatures = j.creatures || {}; return j; };
  const now = () => (J().stats ? J().stats.time : game.time) || 0;

  function eligible() {
    const p = game.player;
    if (!p || p.dead || game.sleeping || game.state !== 'playing') return false;
    if ((game.day || 0) < 2) return false;
    if (game.entities.list.some(e => e.isBoss && !e.dead && e.distTo(p.x, p.y, p.z) < 80)) return false;
    const night = game.dayTime > 0.79 || game.dayTime < 0.21;
    const ground = game.mobs.groundAt(p.x, p.z);
    const deep = ground > 0 && p.y < ground - 14;
    return night || deep;
  }

  // somewhere you might just notice it: a ridge, the far end of a tunnel, behind you, by your home
  function place(mode) {
    const p = game.player, w = game.world;
    const L = p.lookDir(), yaw = Math.atan2(-L[0], -L[2]);
    for (let k = 0; k < 40; k++) {
      let a, r;
      if (mode === 'behind') { a = yaw + Math.PI + rnd(-0.6, 0.6); r = rnd(30, 44); }
      else if (mode === 'home' && p.spawn) {
        const hx = p.spawn.x ?? p.spawn[0], hz = p.spawn.z ?? p.spawn[2];
        if (hx === undefined || Math.hypot(hx - p.x, hz - p.z) > 70) { mode = 'edge'; continue; }
        a = Math.random() * Math.PI * 2; r = rnd(26, 38);
        const x = hx + Math.cos(a) * r, z = hz + Math.sin(a) * r;
        const y = standY(w, x, z, p.y, 2.7); if (y === null) continue;
        if (Math.hypot(x - p.x, z - p.z) < 28) continue;
        return [x, y, z];
      } else { a = yaw + (Math.random() < 0.5 ? -1 : 1) * rnd(0.45, 1.1); r = rnd(32, 52); }   // at the edge of your view
      const x = p.x - Math.sin(a) * r, z = p.z - Math.cos(a) * r;
      const y = standY(w, x, z, p.y, 2.7);
      if (y === null || Math.abs(y - p.y) > 24) continue;
      const id = w.getBlock(Math.floor(x), y - 1, Math.floor(z));
      if (!id || IS_LIQUID[id]) continue;
      // it should be visible from where you stand, but not lit up
      const bl = w.getLight(Math.floor(x), y + 1, Math.floor(z)) & 15;
      if (bl > 6) continue;
      const ex = p.x, ey = p.eyeY, ez = p.z, tx = x, ty = y + 2.2, tz = z;
      const dx = tx - ex, dy = ty - ey, dz = tz - ez, dd = Math.hypot(dx, dy, dz);
      const hit = w.raycast(ex, ey, ez, dx / dd, dy / dd, dz / dd, dd, (bid) => BLOCKS[bid].opaque ? { t: 0, face: 0 } : null);
      if (hit && mode !== 'behind') continue;
      return [x, y, z];
    }
    return null;
  }

  function summon(mode) {
    const p = game.player;
    if (current && !current.dead) return current;
    const ground = game.mobs.groundAt(p.x, p.z);
    const m = mode || (ground > 0 && p.y < ground - 14 ? 'edge' : ['edge', 'edge', 'behind', 'home'][Math.floor(Math.random() * 4)]);
    const at = place(m) || place('edge');
    if (!at) return null;
    const e = new Wickwalker(game, 'wickwalker', at[0] + 0.5, at[1], at[2] + 0.5, {});
    e.yaw = Math.atan2(-(p.x - e.x), -(p.z - e.z));
    game.entities.add(e);
    current = e;
    J().wick.last = now();
    game.audio.play('wick_chime', e);
    return e;
  }
  game.summonWickwalker = summon;

  game.onWickVanish = (e, byPlayer) => {
    current = null;
    // now and then it is not done with you yet
    if (byPlayer && Math.random() < 0.2) follow = rnd(40, 90);
  };

  const prevExt = game.extUpdate;
  game.extUpdate = (dt) => {
    prevExt && prevExt(dt);
    const p = game.player;
    if (!p) return;
    // while it is out there: torches gutter, a moth finds your light now and then, and you might catch its eye
    if (current && !current.dead) {
      const d = current.distTo(p.x, p.y, p.z);
      game.wickNear = Math.max(0, 1 - d / 64);
      if (game.heldLight > 0 && Math.random() < dt * 0.35 * game.wickNear) {
        const L = p.lookDir();
        game.particles.add({ x: p.x + L[0] * 1.2 + rnd(-0.4, 0.4), y: p.eyeY - 0.3 + rnd(-0.2, 0.4), z: p.z + L[2] * 1.2 + rnd(-0.4, 0.4), vx: rnd(-0.4, 0.4), vy: rnd(0, 0.3), vz: rnd(-0.4, 0.4), size: 0.05, r: 0.86, g: 0.9, b: 0.78, a: 0.9, a0: 0.9, fade: true, layer: -2, life: 2.2, drag: 0.8, grav: -0.2, emis: 1, light: 1 });
      }
      // seen? (looking at it with a clear line)
      const dx = current.x - p.x, dy = current.y + 2.2 - p.eyeY, dz = current.z - p.z, dd = Math.hypot(dx, dy, dz);
      const L = p.lookDir();
      const looking = (L[0] * dx + L[1] * dy + L[2] * dz) / dd > Math.cos(Math.atan(1.2 / dd) + (game.zoom ? 0.02 : 0.12));
      if (looking && current.canSee(p)) {
        current.watched = (current.watched || 0) + dt;
        const j = J();
        if (!j.creatures.wickwalker) {
          j.creatures.wickwalker = Date.now();
          j.wick.seen = (j.wick.seen || 0) + 1;
          ui.notice('Something is watching from the dark…');
        }
        if (Math.random() < dt * 0.25) game.audio.play('moth_flutter', current);
      }
    } else game.wickNear = 0;

    if (follow !== null) { follow -= dt; if (follow <= 0) { follow = null; if (eligible()) summon(); } return; }
    checkT -= dt;
    if (checkT > 0) return;
    checkT = 60;
    if (!eligible() || current) return;
    if (now() - J().wick.last < 1200) return;      // twenty minutes of play between sightings at the very least
    if (Math.random() < 0.015) summon();
  };
}
