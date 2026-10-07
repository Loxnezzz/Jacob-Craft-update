// Phase 6 ambient wildlife: flocking songbirds that perch on trees and scatter when approached,
// gulls over the sea, hawks circling high over dry land, butterflies over flowers and fireflies at night.
// One lightweight manager entity simulates and renders everything (no per-critter Mob overhead).
import { Entity } from './entities.js';
import { BLOCKS, B, IS_LIQUID } from '../world/blocks.js';
import { BIOME } from '../world/biomes.js';
import { mat4 } from '../core/math.js';
import { PAT } from '../mobs/models.js';

function C(h) { const v = parseInt(h.slice(1), 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; }
const SPECIES = {
  sparrow: { body: C('#8a6a48'), belly: C('#d8c8a8'), head: C('#6a5038'), wing: C('#5e4630'), beak: C('#d8a040'), size: 1, song: 'sparrow' },
  robin: { body: C('#6a5a4a'), belly: C('#d8643a'), head: C('#4e4238'), wing: C('#54483c'), beak: C('#e0b040'), size: 1.05, song: 'robin' },
  bluebird: { body: C('#3466c8'), belly: C('#e09454'), head: C('#2e5cbc'), wing: C('#2a4e9a'), beak: C('#2a2a2a'), size: 1, song: 'bluebird' },
  finch: { body: C('#e8c830'), belly: C('#f4e070'), head: C('#2a2a20'), wing: C('#3a3a2a'), beak: C('#e09a30'), size: 0.85, song: 'finch' },
  crow: { body: C('#1c1c24'), belly: C('#26262e'), head: C('#18181e'), wing: C('#14141a'), beak: C('#2a2a2a'), size: 1.35, song: 'crow' },
  gull: { body: C('#f2f2f0'), belly: C('#ffffff'), head: C('#f6f6f4'), wing: C('#a8b0b8'), beak: C('#f0c030'), size: 1.5, song: 'gull' },
  hawk: { body: C('#6a4a2a'), belly: C('#d8c8b0'), head: C('#5a3e22'), wing: C('#4e3620'), beak: C('#e8c040'), size: 1.9, song: 'hawk' },
};
const BIOME_BIRDS = {
  [BIOME.FOREST]: ['sparrow', 'robin', 'bluebird'], [BIOME.BIRCH_FOREST]: ['robin', 'bluebird', 'finch'], [BIOME.ANCIENT_FOREST]: ['robin', 'crow'],
  [BIOME.PLAINS]: ['sparrow', 'finch', 'crow'], [BIOME.SAVANNA]: ['finch', 'sparrow'], [BIOME.JUNGLE]: ['finch', 'bluebird'],
  [BIOME.TAIGA]: ['crow', 'sparrow'], [BIOME.SNOWY_TAIGA]: ['crow'], [BIOME.SWAMP]: ['crow'], [BIOME.RIVER]: ['sparrow', 'robin'],
  [BIOME.BEACH]: ['gull'], [BIOME.OCEAN]: ['gull'], [BIOME.DEEP_OCEAN]: ['gull'], [BIOME.SNOWY_BEACH]: ['gull'],
  [BIOME.DESERT]: ['hawk'], [BIOME.BADLANDS]: ['hawk'], [BIOME.MOUNTAINS]: ['hawk', 'crow'], [BIOME.SNOWY_PEAKS]: ['hawk'],
};
const BUTTERFLY_COLS = [[C('#f0a020'), C('#2a2a2a')], [C('#4aa0f0'), C('#1a2a4a')], [C('#f0f0f0'), C('#c8c8c8')], [C('#e04a8a'), C('#5a1a3a')], [C('#f0e040'), C('#4a3a10')]];
const FLOWERS = new Set();
for (const b of BLOCKS) if (b.name.startsWith('flower_')) FLOWERS.add(b.id);

function rnd(a, b) { return a + Math.random() * (b - a); }

class Wildlife extends Entity {
  constructor(game) {
    super(game, 0, 0, 0);
    this.type = 'decor';
    this.birds = []; this.flocks = []; this.flies = []; this.fireflies = [];
    this.spawnT = 1; this.flowerSpots = [];
  }

  // top surface where a bird can stand (leaves or ground) near x,z
  perchAt(x, z) {
    const w = this.game.world;
    const gx = Math.floor(x), gz = Math.floor(z);
    for (let y = 150; y > 40; y--) {
      const id = w.getBlock(gx, y, gz);
      if (!id) continue;
      if (IS_LIQUID[id]) return null;
      const b = BLOCKS[id];
      if (b.shape === 2 || b.shape === 14) continue; // grass/flowers: stand below them
      if (!b.solid && !b.name.endsWith('_leaves')) continue;
      if (w.getBlock(gx, y + 1, gz)) return null;
      return [gx + 0.5 + rnd(-0.3, 0.3), y + 1, gz + 0.5 + rnd(-0.3, 0.3)];
    }
    return null;
  }

  update(dt) {
    const g = this.game, p = g.player, w = g.world;
    if (!p) return;
    const day = g.dayTime > 0.22 && g.dayTime < 0.78;
    const rain = g.weather.localRain + g.weather.localSnow;
    const bio = g.currentBiomeId;
    // ---- population management
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 2.5;
      const kinds = BIOME_BIRDS[bio];
      const want = !day || rain > 0.5 || !kinds ? 0 : kinds[0] === 'hawk' ? 2 : kinds[0] === 'gull' ? 7 : 14;
      if (this.birds.length < want && this.flocks.length < 4) this.spawnFlock(kinds);
      // butterflies over flowers on calm days
      if (day && rain < 0.1 && this.flies.length < 8) this.spawnButterfly();
      // fireflies on warm nights
      const warm = [BIOME.PLAINS, BIOME.FOREST, BIOME.SWAMP, BIOME.JUNGLE, BIOME.BIRCH_FOREST, BIOME.RIVER, BIOME.SAVANNA].includes(bio);
      const night = g.dayTime > 0.8 || g.dayTime < 0.2;
      if (night && warm && rain < 0.2) while (this.fireflies.length < 26) {
        const a = Math.random() * Math.PI * 2, r = rnd(4, 22);
        const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        const gy = g.surfaceAt(Math.floor(x), Math.floor(z));
        if (gy < 40 || IS_LIQUID[w.getBlock(Math.floor(x), gy - 1, Math.floor(z))] && bio !== BIOME.SWAMP) break;
        this.fireflies.push({ x, y: gy + rnd(0.4, 2.6), z, hx: x, hy: gy + 1.2, hz: z, ph: Math.random() * 10, life: rnd(20, 60), t: 0 });
      }
    }
    // ---- flocks steer toward targets; birds follow with simple boids
    for (const f of this.flocks) {
      f.t -= dt;
      if (f.t <= 0 || !f.target) {
        f.t = rnd(7, 15);
        const a = Math.random() * Math.PI * 2, r = rnd(10, 30);
        const tx = p.x + Math.cos(a) * r, tz = p.z + Math.sin(a) * r;
        const land = f.kind !== 'hawk' && f.kind !== 'gull' && Math.random() < 0.55;
        const gy = g.surfaceAt(Math.floor(tx), Math.floor(tz));
        f.target = [tx, gy + (f.kind === 'hawk' ? rnd(28, 40) : f.kind === 'gull' ? rnd(8, 16) : rnd(6, 14)), tz];
        f.land = land;
        if (land) for (const b of this.birds) if (b.flock === f && b.state === 'fly') { const pp = this.perchAt(tx + rnd(-4, 4), tz + rnd(-4, 4)); if (pp) { b.perch = pp; b.state = 'land'; } }
      }
    }
    const pdx = (b) => Math.hypot(b.x - p.x, b.z - p.z) + Math.abs(b.y - p.y) * 0.5;
    const scareR = p.sprinting ? 11 : p.sneaking ? 3.5 : 7;
    let j = 0;
    for (const b of this.birds) {
      b.t += dt; b.wing += dt * (b.state === 'perch' ? 0 : b.glide > 0 ? 2 : 22);
      const d = pdx(b);
      if (d > 90) continue; // despawn far birds
      if ((b.state === 'perch' || b.state === 'land') && d < scareR) {
        b.state = 'fly'; b.perch = null; b.vy = rnd(4, 6);
        const l = Math.hypot(b.x - p.x, b.z - p.z) || 1;
        b.vx = (b.x - p.x) / l * 6; b.vz = (b.z - p.z) / l * 6;
        if (Math.random() < 0.4) g.audio.play('flutter', b);
      }
      if (b.state === 'perch') {
        b.perchT -= dt;
        b.hop = Math.max(0, b.hop - dt * 4);
        if (Math.random() < dt * 0.5) { b.hop = 1; b.yaw += rnd(-1.2, 1.2); }
        b.peck = Math.random() < dt * 0.7 ? 1 : Math.max(0, (b.peck || 0) - dt * 3);
        if (Math.random() < dt * 0.08) g.audio.bird(SPECIES[b.kind].song, b);
        if (b.perchT <= 0 || w.getBlock(Math.floor(b.x), Math.floor(b.y - 0.5), Math.floor(b.z)) === 0) { b.state = 'fly'; b.vy = 4; }
      } else if (b.state === 'land') {
        const [tx, ty, tz] = b.perch;
        const dx = tx - b.x, dy = ty - b.y, dz = tz - b.z, dd = Math.hypot(dx, dy, dz);
        const sp = Math.min(7, 1.5 + dd * 1.2);
        b.vx += (dx / dd * sp - b.vx) * Math.min(1, dt * 3);
        b.vy += (dy / dd * sp - b.vy) * Math.min(1, dt * 3);
        b.vz += (dz / dd * sp - b.vz) * Math.min(1, dt * 3);
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        b.yaw = Math.atan2(-b.vx, -b.vz);
        if (dd < 0.25) { b.state = 'perch'; b.x = tx; b.y = ty; b.z = tz; b.vx = b.vy = b.vz = 0; b.perchT = rnd(8, 26); b.hop = 0; }
      } else {
        // boids within flock
        const f = b.flock;
        let cx = 0, cy = 0, cz = 0, ax = 0, az = 0, sx = 0, sy = 0, sz = 0, n = 0;
        for (const o of this.birds) {
          if (o === b || o.flock !== f || o.state !== 'fly') continue;
          cx += o.x; cy += o.y; cz += o.z; ax += o.vx; az += o.vz; n++;
          const dx = b.x - o.x, dy = b.y - o.y, dz = b.z - o.z, dd = dx * dx + dy * dy + dz * dz;
          if (dd < 2.2) { sx += dx / (dd + 0.1); sy += dy / (dd + 0.1); sz += dz / (dd + 0.1); }
        }
        let fx = 0, fy = 0, fz = 0;
        if (n) { fx += (cx / n - b.x) * 0.8; fy += (cy / n - b.y) * 0.8; fz += (cz / n - b.z) * 0.8; fx += (ax / n - b.vx) * 0.5; fz += (az / n - b.vz) * 0.5; }
        fx += sx * 1.5; fy += sy * 1.5; fz += sz * 1.5;
        if (f.target) {
          const dx = f.target[0] - b.x, dy = f.target[1] - b.y, dz = f.target[2] - b.z, dd = Math.hypot(dx, dy, dz) || 1;
          if (b.kind === 'hawk' || b.kind === 'gull') { // circle around the target
            fx += (dx / dd) * 2 + (-dz / dd) * 3.5; fz += (dz / dd) * 2 + (dx / dd) * 3.5; fy += dy * 0.4;
          } else { fx += dx / dd * 3; fy += dy / dd * 2.5; fz += dz / dd * 3; }
        }
        // keep above terrain
        const gy = g.precip.occluderAt ? g.precip.occluderAt(b.x, b.z) : 0;
        if (gy > 0 && b.y < gy + 3) fy += (gy + 3 - b.y) * 3;
        const maxSp = b.kind === 'hawk' ? 7 : b.kind === 'gull' ? 6.5 : 8;
        b.vx += fx * dt * 2.2; b.vy += fy * dt * 2.2; b.vz += fz * dt * 2.2;
        const sp = Math.hypot(b.vx, b.vy, b.vz);
        if (sp > maxSp) { b.vx *= maxSp / sp; b.vy *= maxSp / sp; b.vz *= maxSp / sp; }
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        const ty = Math.atan2(-b.vx, -b.vz);
        let dyaw = ty - b.yaw; while (dyaw > Math.PI) dyaw -= Math.PI * 2; while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        b.bank = Math.max(-0.7, Math.min(0.7, dyaw * 2));
        b.yaw += dyaw * Math.min(1, dt * 5);
        b.pitchA = Math.atan2(b.vy, Math.hypot(b.vx, b.vz)) * 0.6;
        b.glide = b.vy < -0.5 || b.kind === 'hawk' || b.kind === 'gull' ? (b.glide > 0 ? b.glide - dt : (Math.random() < dt * 0.6 ? rnd(0.5, 2) : 0)) : 0;
        if (Math.random() < dt * 0.04) g.audio.bird(SPECIES[b.kind].song, b);
      }
      this.birds[j++] = b;
    }
    this.birds.length = j;
    this.flocks = this.flocks.filter(f => this.birds.some(b => b.flock === f));
    // ---- butterflies
    j = 0;
    for (const f of this.flies) {
      f.t += dt; f.life -= dt;
      if (f.life <= 0 || Math.hypot(f.x - p.x, f.z - p.z) > 50 || !day) continue;
      f.wx += (Math.random() - 0.5) * dt * 6; f.wy += (Math.random() - 0.5) * dt * 4; f.wz += (Math.random() - 0.5) * dt * 6;
      f.wx += (f.hx - f.x) * dt * 0.4; f.wz += (f.hz - f.z) * dt * 0.4; f.wy += (f.hy - f.y) * dt * 0.8;
      const l = Math.hypot(f.wx, f.wy, f.wz); if (l > 1.6) { f.wx *= 1.6 / l; f.wy *= 1.6 / l; f.wz *= 1.6 / l; }
      f.x += f.wx * dt; f.y += f.wy * dt + Math.sin(f.t * 9) * dt * 0.6; f.z += f.wz * dt;
      f.yaw = Math.atan2(-f.wx, -f.wz);
      this.flies[j++] = f;
    }
    this.flies.length = j;
    // ---- fireflies
    j = 0;
    const night = g.dayTime > 0.78 || g.dayTime < 0.22;
    for (const f of this.fireflies) {
      f.t += dt; f.life -= dt;
      if (f.life <= 0 || !night || Math.hypot(f.x - p.x, f.z - p.z) > 40) continue;
      f.x += Math.sin(f.t * 0.7 + f.ph) * dt * 0.5 + (f.hx - f.x) * dt * 0.05;
      f.y += Math.sin(f.t * 1.1 + f.ph * 2) * dt * 0.3 + (f.hy - f.y) * dt * 0.1;
      f.z += Math.cos(f.t * 0.6 + f.ph) * dt * 0.5 + (f.hz - f.z) * dt * 0.05;
      this.fireflies[j++] = f;
    }
    this.fireflies.length = j;
  }

  spawnFlock(kinds) {
    const g = this.game, p = g.player;
    const kind = kinds[(Math.random() * kinds.length) | 0];
    const a = Math.random() * Math.PI * 2, r = rnd(30, 48);
    const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
    const gy = g.surfaceAt(Math.floor(x), Math.floor(z));
    const f = { kind, t: 0, target: null };
    this.flocks.push(f);
    const n = kind === 'hawk' ? 1 : kind === 'crow' ? 2 + (Math.random() * 3 | 0) : kind === 'gull' ? 2 + (Math.random() * 4 | 0) : 3 + (Math.random() * 5 | 0);
    for (let i = 0; i < n; i++) {
      this.birds.push({ kind, flock: f, x: x + rnd(-2, 2), y: gy + rnd(10, 18) + (kind === 'hawk' ? 20 : 0), z: z + rnd(-2, 2), vx: -Math.cos(a) * 4, vy: 0, vz: -Math.sin(a) * 4, yaw: 0, bank: 0, pitchA: 0, wing: Math.random() * 6, glide: 0, state: 'fly', t: 0, hop: 0, peck: 0 });
    }
  }

  spawnButterfly() {
    const g = this.game, p = g.player, w = g.world;
    for (let k = 0; k < 24; k++) {
      const x = Math.floor(p.x + rnd(-18, 18)), z = Math.floor(p.z + rnd(-18, 18));
      const gy = g.surfaceAt(x, z);
      const id = w.getBlock(x, gy, z) || w.getBlock(x, gy - 1, z);
      if (FLOWERS.has(id) || (id === B.tall_grass && Math.random() < 0.08)) {
        const c = BUTTERFLY_COLS[(Math.random() * BUTTERFLY_COLS.length) | 0];
        this.flies.push({ x: x + 0.5, y: gy + 0.8, z: z + 0.5, hx: x + 0.5, hy: gy + 1, hz: z + 0.5, wx: 0, wy: 0, wz: 0, t: Math.random() * 5, life: rnd(30, 70), col: c[0], col2: c[1], yaw: 0 });
        return;
      }
    }
  }

  render(er, F) {
    const cam = F.camPos, w = this.game.world;
    const lightAt = (x, y, z) => { const l = w.getLight(Math.floor(x), Math.floor(y), Math.floor(z)); return [(l >> 4) / 15, (l & 15) / 15, 0, 0]; };
    const box = (W, x, y, z, sx, sy, sz, c, light, pat = PAT.feathers, c2 = c) => {
      const M = mat4.create(); M.set(W);
      mat4.translate(M, M, x, y, z);
      mat4.scale(M, M, sx, sy, sz);
      er.pushBox(M, c, pat, c2, 0, Math.max(1, sx * 16), Math.max(1, sy * 16), Math.max(1, sz * 16), 5, light);
    };
    for (const b of this.birds) {
      const dx = b.x - cam[0], dz = b.z - cam[2];
      if (dx * dx + dz * dz > 80 * 80) continue;
      const S = SPECIES[b.kind];
      const light = lightAt(b.x, b.y + 0.2, b.z);
      const W = mat4.create();
      const hop = b.state === 'perch' ? Math.sin(b.hop * Math.PI) * 0.08 : 0;
      mat4.translate(W, W, dx, b.y - cam[1] + hop, dz);
      mat4.rotateY(W, W, b.yaw);
      if (b.state !== 'perch') { mat4.rotateZ(W, W, b.bank || 0); mat4.rotateX(W, W, b.pitchA || 0); }
      const s = 0.06 * S.size;
      mat4.scale(W, W, s, s, s);
      // body (units ~ 1/16 of a bird)
      box(W, -1.5, 0.6, -2, 3, 2.4, 4.5, S.body, light, PAT.feathers, S.belly);
      box(W, -1.3, 0.5, -1.6, 2.6, 1.2, 3.6, S.belly, light, PAT.flat);
      const peck = b.state === 'perch' ? (b.peck || 0) * 0.9 : 0;
      const H = mat4.create(); H.set(W);
      mat4.translate(H, H, 0, 2.6, -2.2);
      mat4.rotateX(H, H, -peck);
      box(H, -1.2, -0.6, -1.8, 2.4, 2.2, 2.2, S.head, light);
      box(H, -0.45, 0.0, -2.9, 0.9, 0.7, 1.2, S.beak, light, PAT.flat);
      box(W, -1, 1.4, 2.2, 2, 0.6, 2.4, S.wing, light);                     // tail
      if (b.state === 'perch') {
        box(W, -1.0, -0.4, -0.4, 0.5, 1.2, 0.5, S.beak, light, PAT.flat);   // legs
        box(W, 0.5, -0.4, -0.4, 0.5, 1.2, 0.5, S.beak, light, PAT.flat);
        box(W, -1.65, 1.0, -1.5, 0.4, 1.8, 3.6, S.wing, light);            // folded wings
        box(W, 1.25, 1.0, -1.5, 0.4, 1.8, 3.6, S.wing, light);
      } else {
        const flap = b.glide > 0 ? 0.12 : Math.sin(b.wing) * 0.9;
        for (const side of [-1, 1]) {
          const M = mat4.create(); M.set(W);
          mat4.translate(M, M, side * 1.4, 2.2, -0.6);
          mat4.rotateZ(M, M, side * flap);
          const span = b.kind === 'hawk' || b.kind === 'gull' ? 7 : 5;
          box(M, side > 0 ? 0 : -span, -0.25, -1.2, span, 0.5, 3, S.wing, light);
        }
      }
    }
    for (const f of this.flies) {
      const light = lightAt(f.x, f.y, f.z);
      const W = mat4.create();
      mat4.translate(W, W, f.x - cam[0], f.y - cam[1], f.z - cam[2]);
      mat4.rotateY(W, W, f.yaw);
      const flap = Math.sin(f.t * 22) * 1.1;
      box(W, -0.008, -0.01, -0.04, 0.016, 0.02, 0.08, [0.15, 0.12, 0.1], light, PAT.flat);
      for (const side of [-1, 1]) {
        const M = mat4.create(); M.set(W);
        mat4.rotateZ(M, M, side * (0.3 + flap));
        box(M, side > 0 ? 0.004 : -0.084, 0, -0.05, 0.08, 0.006, 0.09, f.col, light, PAT.spots, f.col2);
      }
    }
    for (const f of this.fireflies) {
      const blink = Math.max(0, Math.sin(f.t * 2.3 + f.ph * 3)) ** 3;
      if (blink < 0.05) continue;
      const W = mat4.create();
      const s = 0.035 + blink * 0.025;
      mat4.translate(W, W, f.x - cam[0] - s / 2, f.y - cam[1] - s / 2, f.z - cam[2] - s / 2);
      mat4.scale(W, W, s, s, s);
      er.pushBox(W, [0.75, 1.0, 0.35], PAT.glow, [0.95, 1.0, 0.6], 0, 1, 1, 1, 1, [1, 1, 0, 2 + blink * 5]);
    }
  }
}

export function installAmbient(game) {
  const ensure = () => {
    if (!game.wildlife || !game.entities.list.includes(game.wildlife)) { game.wildlife = new Wildlife(game); game.entities.add(game.wildlife); }
  };
  const prevExt = game.extUpdate;
  game.extUpdate = (dt) => { if (prevExt) prevExt(dt); ensure(); };
}
