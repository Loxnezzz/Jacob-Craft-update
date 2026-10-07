// The Sunken Pyramid: its traps, its atmosphere, its scarabs, and the king who sleeps beneath it.
//
// Ankhuret, the Gilded Husk: a desert king wrapped in grave-linen under a gold mask, his back sealed by a scarab
// carapace. He sleeps in his sarcophagus until you come too close. He fights with a curved khopesh and a sun staff:
//   Sand Scythe  a wide sweep around him (watch the gold ring)
//   Sun Lance    a line of light that bursts out of the floor towards you, one step at a time
//   Scarab Tide  a swarm of scarabs boils out of the sand
//   (enraged)    the carapace splits and gilded wings unfold; he sinks into the sand and erupts beneath you
// He drops the Gilded Khopesh (its strikes clog foes with sand), the Husk-King's Nemes (see in the dark),
// gold, gems and a Wayfinder Shard for the road to the Worldheart.
import { MOB_CLASSES, Projectile, createMob } from './mobs.js';
import { MOBS } from './defs.js';
import { MODELS, PAT, box, part, finalize, arthropod } from './models.js';
import { ANIMS } from './anim.js';
import { Boss, warn, ring } from './bosses.js';
import { B, BLOCKS } from '../world/blocks.js';
import { ITEMS } from '../game/items.js';

const set = (m, P, name, rx = 0, ry = 0, rz = 0, tx = 0, ty = 0, tz = 0) => {
  const i = m.model.index[name];
  if (i === undefined) return;
  const p = P[i];
  p[0] += rx; p[1] += ry; p[2] += rz; p[3] += tx; p[4] += ty; p[5] += tz;
};
const rnd = (a, b) => a + Math.random() * (b - a);

// ===================================================================== models
{
  const LIN = '#d8cdb0', LIN2 = '#a89a78', GOLD = '#e0b030', GOLD2 = '#a87818', LAPIS = '#2a5ab8', TURQ = '#40e8d0';
  const parts = [];
  for (const [n, x] of [['legL', -2], ['legR', 2]]) parts.push(part(n, null, [x, 18, 0], [
    box([-1.6, -18, -1.6], [3.2, 18.5, 3.2], LIN, PAT.cloth, LIN2, 3), box([-1.8, -16.6, -1.8], [3.6, 1, 3.6], GOLD, PAT.metal, GOLD2),
    box([-1.7, -18, -3], [3.4, 1.2, 4.4], LIN2, PAT.cloth),
  ]));
  parts.push(part('body', null, [0, 18, 0], [
    box([-4.2, -3, -2.4], [8.4, 5, 4.8], '#efe6cc', PAT.cloth, '#d8ccaa', 2), box([-1.2, -3.2, -2.62], [2.4, 5, 0.3], GOLD, PAT.metal, GOLD2),
    box([-4.3, 1.6, -2.5], [8.6, 1.2, 5], GOLD, PAT.metal, GOLD2),
    box([-4, 2.5, -2.2], [8, 11, 4.4], LIN, PAT.cloth, LIN2, 3),
    box([-4.6, 10.5, -2.5], [9.2, 3, 0.4], GOLD, PAT.metal, GOLD2), box([-4.4, 11.2, -2.62], [8.8, 0.5, 0.12], LAPIS, PAT.flat), box([-4.4, 12.3, -2.62], [8.8, 0.5, 0.12], TURQ, PAT.flat),
    box([-4.6, 12.6, -2.5], [9.2, 0.9, 5], GOLD, PAT.metal, GOLD2),
    box([-1, 8.4, -2.62], [2, 1.8, 0.2], TURQ, PAT.glow),                                         // scarab amulet
  ]));
  for (const [n, s] of [['shellL', -1], ['shellR', 1]]) parts.push(part(n, 'body', [s * 0.15, 31, 2.2], [box([s < 0 ? -4.4 : 0, -12, 0], [4.4, 12.5, 1.6], '#163434', PAT.metal, '#2a9a86')]));
  for (const [n, s] of [['wingL', -1], ['wingR', 1]]) parts.push(part(n, 'body', [s * 0.8, 30.5, 2.6], [box([s < 0 ? -10 : 0, -13, 0], [10, 14, 0.15], '#ffd060', PAT.glow), box([s < 0 ? -10 : 9.4, -9, -0.05], [0.6, 9, 0.25], '#a87818', PAT.metal)]));
  for (const [n, x] of [['armL', -5.3], ['armR', 5.3]]) parts.push(part(n, 'body', [x, 31, 0], [
    box([-1.3, -12, -1.3], [2.6, 13, 2.6], LIN, PAT.cloth, LIN2, 3), box([-1.5, -9.2, -1.5], [3, 2.6, 3], GOLD, PAT.metal, GOLD2),
    box([-1.2, -13.6, -1.2], [2.4, 1.8, 2.4], LIN2, PAT.cloth),
  ]));
  // the khopesh, curving forward out of the right fist
  parts.push(part('blade', 'armR', [5.3, 18.5, -0.2], [
    box([-0.4, -1.4, -0.4], [0.8, 3, 0.8], '#3a2a1a', PAT.bark), box([-0.6, -0.4, -1.2], [1.2, 0.6, 1.2], GOLD, PAT.metal),
    box([-0.3, -0.6, -6.2], [0.6, 1.6, 5.2], '#e8c050', PAT.metal, '#b88a20'), box([-0.3, 0.6, -8], [0.6, 2.6, 1.9], '#e8c050', PAT.metal, '#b88a20'), box([-0.3, 2.6, -9], [0.6, 1.4, 1.2], '#e8c050', PAT.metal, '#b88a20'),
  ]));
  // the sun staff in the left
  parts.push(part('staff', 'armL', [-5.3, 18.5, 0], [
    box([-0.35, -6, -0.35], [0.7, 17, 0.7], '#3a2a1a', PAT.bark), box([-1.7, 10.5, -0.3], [3.4, 3.4, 0.6], '#ffd860', PAT.glow), box([-2.2, 10, -0.2], [0.6, 2.6, 0.4], GOLD, PAT.metal), box([1.6, 10, -0.2], [0.6, 2.6, 0.4], GOLD, PAT.metal),
  ]));
  // head: grave wraps, a gold mask with burning turquoise eyes, the striped nemes and a cobra on the brow
  parts.push(part('head', 'body', [0, 31.5, 0], [
    box([-2.6, 0, -2.6], [5.2, 6.2, 5.2], LIN, PAT.cloth, LIN2, 3),
    box([-2.4, 0.3, -2.78], [4.8, 5.6, 0.25], GOLD, PAT.metal, GOLD2),
    box([-1.75, 3.2, -2.88], [1.25, 0.65, 0.1], TURQ, PAT.glow), box([0.5, 3.2, -2.88], [1.25, 0.65, 0.1], TURQ, PAT.glow),
    box([-1.9, 3.95, -2.86], [1.6, 0.25, 0.08], '#1a1408', PAT.flat), box([0.3, 3.95, -2.86], [1.6, 0.25, 0.08], '#1a1408', PAT.flat),
    box([-0.6, -2.2, -2.7], [1.2, 2.6, 1], GOLD, PAT.stripes, LAPIS, 0.6),                          // ceremonial beard
    box([-3, 4.6, -2.9], [6, 2.4, 6], GOLD, PAT.stripes, LAPIS, 0.8),                                // nemes crown
    box([-3.6, -3.2, -2.2], [1, 7.8, 2.6], GOLD, PAT.stripes, LAPIS, 0.8), box([2.6, -3.2, -2.2], [1, 7.8, 2.6], GOLD, PAT.stripes, LAPIS, 0.8),
    box([-1.6, -4.2, 2.4], [3.2, 7.4, 1], GOLD, PAT.stripes, LAPIS, 0.8),
    box([-0.4, 6.4, -3.15], [0.8, 1.9, 0.6], GOLD, PAT.metal), box([-0.15, 7.6, -3.3], [0.3, 0.3, 0.1], '#e02040', PAT.glow),
  ]));
  MODELS.husk_king_open = finalize({ parts, anim: 'husk', height: 40 });
  // sealed: the same rig with the wings folded away inside the carapace (they only exist once it splits open)
  MODELS.husk_king = finalize({ parts: parts.map(pt => pt.name === 'wingL' || pt.name === 'wingR' ? Object.assign({}, pt, { boxes: [] }) : pt), anim: 'husk', height: 40 });
}
MODELS.scarab = arthropod({
  bodyY: 1.6, bw: 4.6, bh: 2.4, bl: 5.6, hw: 3.2, hh: 1.8, hl: 1.8, legs: 3, legLen: 2.2,
  colors: { body: '#1a5a5a', body2: '#d8a830', leg: '#14140e', eye: '#ffd040' },
  bodyExtra: [box([-0.15, 1.15, -2.8], [0.3, 0.4, 5.6], '#d8a830', PAT.flat), box([-2, 1.1, -2.4], [4, 0.3, 1], '#2a8a7a', PAT.metal)],
  headExtra: [box([-1.4, -0.4, -2.8], [0.6, 0.6, 1.2], '#d8a830', PAT.flat), box([0.8, -0.4, -2.8], [0.6, 0.6, 1.2], '#d8a830', PAT.flat)],
});

ANIMS.husk = (m, P, t) => {
  const id = m.mid || 0;
  const s = Math.sin(m.walkPhase * 0.8) * m.walkAmt;
  set(m, P, 'legL', s * 0.45); set(m, P, 'legR', -s * 0.45);
  const asleep = !m.awake && m.deathT < 0 ? 1 : 0;
  const a = m.act ? m.act.name : null, at = m.actT || 0;
  // asleep: arms crossed on the chest, head bowed
  if (asleep) {
    set(m, P, 'armL', -1.3, 0.75, 0.25); set(m, P, 'armR', -1.3, -0.75, -0.25); set(m, P, 'head', 0.25);
    set(m, P, 'staff', 0.9, 0, 0); set(m, P, 'blade', 1.2);
  } else {
    let L = -0.35 + Math.sin(t * 1.1 + id) * 0.04, R = -0.25 + s * 0.2, Rz = 0, Lz = 0, head = m.headPitch * 0.5, body = 0.05;
    if (a === 'sweep') { const k = at < 0.85 ? at / 0.85 : 1; R = at < 0.85 ? -0.4 - 1.9 * k : -2.3 + Math.min(1, (at - 0.85) / 0.2) * 2.6; Rz = at < 0.85 ? -0.8 * k : 0.6; body = at < 0.85 ? -0.15 * k : 0.25; }
    if (a === 'lance') { const k = Math.min(1, at / 0.6); L = -0.35 - 2.5 * k; Lz = 0.25 * k; head = -0.35 * k; }
    if (a === 'scarabs') { const k = Math.min(1, at / 0.5); L = -2.6 * k; R = -2.6 * k; Lz = 0.6 * k; Rz = -0.6 * k; head = -0.4 * k; body = -0.2 * k; }
    if (m.attackAnim) R -= m.attackAnim * 1.2;
    set(m, P, 'armL', L, 0, Lz + 0.08); set(m, P, 'armR', R, 0, Rz - 0.08);
    set(m, P, 'head', head, m.headYaw * 0.6, Math.sin(t * 0.7 + id) * 0.04);
    set(m, P, 'body', body);
  }
  // enraged: the carapace splits and the wings unfold, beating slowly
  const open = m._open = (m._open || 0) + ((m.phase2 && m.deathT < 0 ? 1 : 0) - (m._open || 0)) * 0.08;
  const beat = Math.sin(t * 3 + id) * 0.15 * open;
  set(m, P, 'shellL', 0, -1.1 * open, -0.35 * open); set(m, P, 'shellR', 0, 1.1 * open, 0.35 * open);
  set(m, P, 'wingL', -0.1 * open, -1.3 * open - beat, -0.3 * open); set(m, P, 'wingR', -0.1 * open, 1.3 * open + beat, 0.3 * open);
};

// ===================================================================== definitions
MOBS.husk_king = Object.assign({}, MOBS.cow, {
  id: 'husk_king', name: 'Ankhuret', type: 'boss', hp: 280, speed: 1.7, runSpeed: 3.2, size: [1.1, 2.55], model: MODELS.husk_king,
  drops: [['gilded_khopesh', 1, 1], ['husk_crown', 1, 1], ['gold_ingot', 8, 14], ['emerald', 4, 8], ['diamond', 1, 3], ['wayfinder_shard', 1, 1]],
  sounds: { hurt: 'husk_rasp', death: 'husk_rasp' }, food: [], idleSound: 0, xp: 140, knockRes: 1, follow: 48, attack: null, tame: null,
  wake: 12, title: 'Ankhuret, the Gilded Husk', subtitle: 'The king the desert buried, and forgot', miniboss: true,
});
MOBS.scarab = Object.assign({}, MOBS.cave_crawler, {
  id: 'scarab', name: 'Tomb Scarab', hp: 5, speed: 3.6, size: [0.45, 0.32], model: MODELS.scarab, drops: [], sounds: { idle: 'skitter', hurt: 'hiss', death: 'clatter' },
  attack: { dmg: 2, reach: 1.1, cd: 0.7 }, leaps: false, climbs: false, xp: 1, follow: 30,
});

// ===================================================================== the king
class HuskKing extends Boss {
  preferDist() { return 2.6; }
  sleepIdle(dt) {
    this.yaw = this.homeYaw ?? (this.homeYaw = 0);   // facing the stairs, waiting
    if (Math.random() < dt * 3) this.game.particles.add({ x: this.x + rnd(-0.6, 0.6), y: this.y + rnd(0.5, 2.4), z: this.z + rnd(-0.6, 0.6), vx: 0, vy: -0.2, vz: 0, size: 0.04, r: 0.85, g: 0.75, b: 0.5, a: 0.6, a0: 0.6, fade: true, layer: -1, life: 2, drag: 1, light: 0.6 });
    void dt;
  }
  wake() {
    if (this.awake) return;
    super.wake();
    const g = this.game;
    g.audio.play('husk_roar', this);
    // dust pours from the ceiling as the tomb shakes
    for (let i = 0; i < 60; i++) g.particles.add({ x: this.x + rnd(-10, 10), y: this.y + 7, z: this.z + rnd(-8, 8), vx: 0, vy: -rnd(0.5, 2), vz: 0, size: rnd(0.05, 0.12), r: 0.86, g: 0.76, b: 0.52, a: 0.8, a0: 0.8, fade: true, layer: -1, life: rnd(1.5, 3), grav: 2, light: g.particles.lightAt(this.x, this.y + 2, this.z) });
    g.camShake = Math.max(g.camShake || 0, 0.5);
  }
  attacks() {
    const g = this.game, p = g.player, boss = this;
    const minions = g.entities.list.filter(e => e.summoner === this && !e.dead).length;
    return [
      { name: 'sweep', w: 3, when: (b, dp) => dp < 5.5, dur: 1.35, cd: 1.0,
        start: (b) => { warn(g, b.x, b.y, b.z, 4.2, 0.85, [1, 0.8, 0.3]); g.audio.play('husk_rasp', b); },
        tick: (b, dt, t) => { b.faceTarget(dt, t < 0.7 ? 5 : 0); if (t >= 0.85 && !b._swept) { b._swept = true; g.audio.play('sweep', b); aoe(g, b, b.x, b.y + 1, b.z, 4.2, 8, 7); sandBurst(g, b.x, b.y, b.z, 4.2, 30); } },
        end: (b) => { b._swept = false; } },
      { name: 'lance', w: 2.2, when: (b, dp) => dp > 3.5, dur: 2.6, cd: 1.4,
        start: (b) => {
          const dx = p.x - b.x, dz = p.z - b.z, l = Math.hypot(dx, dz) || 1;
          b._lance = []; for (let k = 1; k <= 7; k++) b._lance.push([b.x + dx / l * k * 2.3, b.z + dz / l * k * 2.3]);
          g.audio.play('magic', b);
        },
        tick: (b, dt, t) => {
          b.faceTarget(dt, 3);
          if (t > 0.6 && !b._lanced) {
            b._lanced = true;
            b._lance.forEach(([x, z], k) => setTimeout(() => warn(g, x, b.y, z, 1.3, 0.55, [1, 0.9, 0.4], () => {
              aoe(g, b, x, b.y + 0.5, z, 1.5, 6, 5, true);
              for (let i = 0; i < 14; i++) g.particles.add({ x: x + rnd(-0.4, 0.4), y: b.y + rnd(0, 0.5), z: z + rnd(-0.4, 0.4), vx: 0, vy: rnd(6, 11), vz: 0, size: rnd(0.1, 0.2), r: 1, g: 0.85, b: 0.4, a: 1, a0: 1, fade: true, layer: -2, life: 0.5, emis: 6, add: true });
              g.audio.play('ignite', { x, y: b.y, z });
            }), k * 130));
          }
        },
        end: (b) => { b._lanced = false; } },
      { name: 'scarabs', w: minions < 5 ? (boss.phase2 ? 2 : 1.4) : 0, dur: 1.5, cd: 1.6,
        start: (b) => { g.audio.play('husk_roar', b); },
        tick: (b, dt, t) => {
          if (t > 0.7 && !b._summoned) {
            b._summoned = true;
            const n = b.phase2 ? 6 : 4;
            for (let i = 0; i < n; i++) {
              const a = i / n * Math.PI * 2 + rnd(-0.3, 0.3), x = b.x + Math.cos(a) * rnd(2.5, 4.5), z = b.z + Math.sin(a) * rnd(2.5, 4.5);
              const s = createMob(g, 'scarab', x, b.y + 0.1, z, {}); s.summoner = b; s.target = p; s.persistent = false; g.entities.add(s);
              sandBurst(g, x, b.y, z, 0.8, 10);
            }
          }
        },
        end: (b) => { b._summoned = false; } },
      { name: 'veil', w: boss.phase2 ? 2.4 : 0, dur: 3.1, cd: 1.2,
        start: (b) => { b.invulnerable = true; g.audio.play('husk_rasp', b); },
        tick: (b, dt, t) => {
          if (t < 0.6) { b.sink = t / 0.6 * 3; if (Math.random() < dt * 30) sandBurst(g, b.x, b.y, b.z, 1.2, 2); return; }
          if (t < 2.2) {
            b.sink = 3.2;
            // a moving mound of sand slides under you
            const dx = p.x - b.x, dz = p.z - b.z, l = Math.hypot(dx, dz);
            if (l > 0.3) { const st = Math.min(l, dt * 7); b.x += dx / l * st; b.z += dz / l * st; }
            if (Math.random() < dt * 40) sandBurst(g, b.x, b.y, b.z, 0.6, 2);
            return;
          }
          if (!b._marked) { b._marked = true; warn(g, b.x, b.y, b.z, 2.8, 0.55, [1, 0.75, 0.3]); g.audio.play('rumble', b); }
          if (t > 2.75 && !b._erupted) {
            b._erupted = true; b.sink = 0; b.invulnerable = false;
            ring(g, b, b.x, b.y, b.z, 0.5, 6, 0.6, 7, [0.95, 0.8, 0.45]);
            aoe(g, b, b.x, b.y + 1, b.z, 2.8, 7, 8, false, 9);
            sandBurst(g, b.x, b.y, b.z, 2.5, 50);
            g.camShake = Math.max(g.camShake || 0, 0.35);
            g.audio.play('husk_roar', b);
          }
        },
        end: (b) => { b._marked = b._erupted = false; b.sink = 0; b.invulnerable = false; } },
    ];
  }
  bossFx(dt) {
    const g = this.game;
    if (this.phase2 && this.model !== MODELS.husk_king_open) this.model = MODELS.husk_king_open;
    if (!this.awake || this.deathT >= 0) return;
    if (Math.random() < dt * 6) { const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw); g.particles.add({ x: this.x + fx * 0.3, y: this.y + 2.15, z: this.z + fz * 0.3, vx: rnd(-0.2, 0.2), vy: 0.3, vz: rnd(-0.2, 0.2), size: 0.05, r: 0.3, g: 1, b: 0.85, a: 1, a0: 1, fade: true, layer: -2, life: 0.6, emis: 4, add: true }); }
    if (this.phase2 && Math.random() < dt * 10) g.particles.add({ x: this.x + rnd(-1.2, 1.2), y: this.y + rnd(1, 2.4), z: this.z + rnd(-1.2, 1.2), vx: 0, vy: rnd(0.2, 0.8), vz: 0, size: 0.06, r: 1, g: 0.85, b: 0.4, a: 1, a0: 1, fade: true, layer: -2, life: 0.8, emis: 4, add: true });
  }
  render(er, F) {
    if (this.sink > 2.9) return;   // fully under the sand
    const y = this.y; this.y -= this.sink || 0;
    super.render(er, F);
    this.y = y;
  }
  die(src) {
    super.die(src);
    const g = this.game;
    if (g.journey) { g.journey.flags = g.journey.flags || {}; g.journey.flags.huskKing = true; }
  }
}
MOB_CLASSES.husk_king = HuskKing;

function aoe(g, owner, x, y, z, r, dmg, knock, groundOnly = false, up = 6) {
  const p = g.player;
  const d = Math.hypot(p.x - x, p.y + 0.9 - y, p.z - z);
  if (d < r + 0.4 && !(groundOnly && !p.onGround)) {
    if (p.damage(dmg, 'mob', false, owner)) { const l = Math.hypot(p.x - x, p.z - z) || 1; p.knockX = (p.x - x) / l * knock; p.knockZ = (p.z - z) / l * knock; p.vy = Math.max(p.vy, up); }
  }
}
function sandBurst(g, x, y, z, r, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, rr = Math.random() * r;
    g.particles.add({ x: x + Math.cos(a) * rr, y: y + 0.1, z: z + Math.sin(a) * rr, vx: Math.cos(a) * rnd(0.5, 2.5), vy: rnd(1.5, 4.5), vz: Math.sin(a) * rnd(0.5, 2.5), size: rnd(0.1, 0.22), size0: 0.15, grow: 1.2, r: 0.86, g: 0.74, b: 0.48, a: 0.75, a0: 0.75, fade: true, layer: -1, life: rnd(0.6, 1.2), grav: 6, drag: 1.5, light: g.particles.lightAt(x, y + 1, z) });
  }
}

// ===================================================================== traps, atmosphere, rewards
export function installPyramid(game) {
  const ui = game.ui;
  const traps = () => (game.meta.traps = game.meta.traps || []);
  const pyramids = () => (game.meta.pyramids = game.meta.pyramids || []);

  const prevStruct = game.onStructures;
  game.onStructures = (c, fresh) => {
    prevStruct && prevStruct(c, fresh);
    if (!c.structures || !game.meta) return;
    for (const s of c.structures) {
      if (s.type === 'trap' && !traps().some(t => t.id === s.id)) traps().push(Object.assign({ armed: true }, s));
      if (s.type === 'pyramid' && !pyramids().some(q => q.id === s.id)) pyramids().push({ id: s.id, x: s.cx[0], y: s.cx[1], z: s.cx[2], tomb: s.tomb });
    }
  };

  let ambT = 0, sandT = 0;
  const prevExt = game.extUpdate;
  game.extUpdate = (dt) => {
    prevExt && prevExt(dt);
    const p = game.player, w = game.world;
    if (!p || p.dead || !game.meta) return;
    const fx = Math.floor(p.x), fy = Math.floor(p.y + 0.05), fz = Math.floor(p.z);
    for (const t of traps()) {
      if (Math.abs(t.x - p.x) > 24 || Math.abs(t.z - p.z) > 24) continue;
      t.cd = Math.max(0, (t.cd || 0) - dt);
      if (t.kind === 'darts') {
        if (t.cd > 0 || p.creative || fx !== t.x || fz !== t.z || Math.abs(fy - t.y) > 0) continue;
        if (w.getBlock(t.x, t.y, t.z) !== B.sandstone_plate) continue;   // the plate was dug up: disarmed
        t.cd = 2.2;
        game.audio.play('click', { x: t.x, y: t.y, z: t.z });
        setTimeout(() => {
          for (const [x, y, z, dx, dz] of t.from) {
            if (w.getBlock(Math.floor(x - dx * 0.5), Math.floor(y), Math.floor(z - dz * 0.5)) !== B.cursed_sandstone) continue;   // emitter broken
            const pr = new Projectile(game, { x, y, z, type: 'trap', h: 0 }, x + dx * 0.2, y, z + dz * 0.2, dx * 26, 0.6, dz * 26, 'arrow', 3);
            pr.noPickup = true;
            game.entities.add(pr);
            game.audio.play('bow', { x, y, z }, 1.3);
          }
        }, 120);
      } else if (t.kind === 'collapse') {
        if (!t.armed) continue;
        const on = t.cells.some(([x, y, z]) => fx === x && fz === z && Math.abs(fy - (y + 1)) < 1);
        if (!on || p.creative) continue;
        t.armed = false;
        game.audio.play('rumble', p);
        setTimeout(() => {
          for (const [x, y, z] of t.cells) {
            if (w.getBlock(x, y, z) !== B.sand) continue;
            game.particles.blockBreak(x, y, z, B.sand);
            w.setBlock(x, y, z, 0);
          }
          game.audio.blockSound(B.sand, 'break', t.x, t.y, t.z);
        }, 350);
      } else if (t.kind === 'sandfall') {
        if (!t.armed || p.creative || fx !== t.x || fz !== t.z || fy !== t.y) continue;
        if (w.getBlock(t.x, t.y, t.z) !== B.sandstone_plate) continue;
        t.armed = false;
        game.audio.play('click', p); game.audio.play('rumble', p);
        game.camShake = Math.max(game.camShake || 0, 0.25);
        for (const [x, y, z] of t.cells) if (!w.getBlock(x, y, z)) w.setBlock(x, y, z, B.sand);
        for (let i = 0; i < 40; i++) game.particles.add({ x: t.cells[0][0] + Math.random(), y: t.cells[0][1] + 1 + Math.random(), z: t.cells[0][2] + Math.random(), vx: 0, vy: -rnd(1, 3), vz: 0, size: 0.1, r: 0.86, g: 0.76, b: 0.5, a: 0.8, a0: 0.8, fade: true, layer: -1, life: 1.2, grav: 8, light: 0.6 });
        ui.notice('The way back is sealed with sand.');
      }
    }
    // the pyramid's voice: wind in the passages, trickling sand, a low hum near the tomb
    ambT -= dt; sandT -= dt;
    for (const q of pyramids()) {
      const dx = p.x - q.x, dz = p.z - q.z;
      if (Math.abs(dx) > 17 || Math.abs(dz) > 26 || p.y > q.y + 14 || p.y < q.y - 14) continue;
      const inside = w.skyLight(p.x, p.eyeY, p.z) < 6;
      if (!inside) continue;
      if (sandT <= 0) {
        sandT = rnd(0.4, 1.4);
        const x = p.x + rnd(-6, 6), z = p.z + rnd(-6, 6);
        let cy = Math.floor(p.y) + 1; while (cy < p.y + 8 && !w.getBlock(Math.floor(x), cy, Math.floor(z))) cy++;
        if (w.getBlock(Math.floor(x), cy, Math.floor(z))) for (let i = 0; i < 6; i++) game.particles.add({ x: x + rnd(-0.1, 0.1), y: cy - 0.05, z: z + rnd(-0.1, 0.1), vx: 0, vy: -rnd(0.5, 1.5), vz: 0, size: 0.03, r: 0.86, g: 0.76, b: 0.5, a: 0.9, a0: 0.9, layer: -1, life: 1.5, grav: 10, collide: true, light: 0.5 });
      }
      if (ambT <= 0) { ambT = rnd(5, 11); game.audio.play(p.y < q.y - 4 ? 'tomb_hum' : 'tomb_wind', p); }
      break;
    }
    // the nemes lets its wearer see in the dark; the khopesh's sand slows what it strikes
    const head = p.armor.slots[0];
    if (head && ITEMS[head.id].armor && ITEMS[head.id].armor.nightsight) p.effects.nightvision = Math.max(p.effects.nightvision || 0, 1.5);
  };
  const prevHit = game.onMeleeHit;
  game.onMeleeHit = (e, info) => {
    prevHit && prevHit(e, info);
    const tl = info.stack ? ITEMS[info.stack.id].tool : null;
    if (tl && tl.sand && !e.isBoss) { e.staggerT = Math.max(e.staggerT || 0, 0.5); e.vx *= 0.3; e.vz *= 0.3; sandBurst(game, e.x, e.y, e.z, 0.6, 10); }
  };
  void BLOCKS;
}
