// Cats and foxes, rebuilt: rounder heads with big front-facing eyes (with a glint), whiskers, pointed ears with pink
// or white insides, white socks and bibs, long curling tails (bushy for foxes). They sit and look about, groom,
// stretch out to sleep with their tails curled round, and the foxes pounce. Adds the red fox to forests and taiga.
import { Mob, MOB_CLASSES } from './mobs.js';
import { MOBS, ANIMAL_SPAWNS } from './defs.js';
import { MODELS, PAT, box, beast } from './models.js';
import { BIOME } from '../world/biomes.js';

const rnd = (a, b) => a + Math.random() * (b - a);

// front-facing eyes: iris, pupil, glint; lids (shown asleep or blinking) in the fur colour
function faceEyes(x, y, z, w, h, iris, lid, slit) {
  const E = [], L = [];
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -x - w : x;
    E.push(box([x0, y, z], [w, h, 0.12], iris, PAT.flat));
    E.push(box([x0 + w * (slit ? 0.36 : 0.28), y + h * 0.1, z - 0.03], [w * (slit ? 0.28 : 0.44), h * 0.8, 0.1], '#0e0c0c', PAT.flat));
    E.push(box([x0 + w * 0.12, y + h * 0.62, z - 0.06], [w * 0.3, h * 0.28, 0.08], '#ffffff', PAT.flat));
    L.push(box([x0 - 0.06, y - 0.06, z - 0.1], [w + 0.12, h + 0.12, 0.1], lid, PAT.fur));
  }
  return [E, L];
}

{ // ---------------- cat (orange tabby base; the black / grey / white variants swap these colours)
  const FUR = '#d8892e', STR = '#a85a1a', CREAM = '#f0c08a', WHITE = '#f4ece0';
  const [E, Lid] = faceEyes(0.45, 0.1, -4.48, 1.45, 1.5, '#7ad048', FUR, true);
  MODELS.cat = beast({
    height: 11,
    body: { pivot: [0, 6.2, 0], boxes: [
      box([-2.3, -2.3, -5.2], [4.6, 4.6, 10.4], FUR, PAT.stripes, STR, 3),
      box([-1.9, -2.45, -4.6], [3.8, 0.6, 7.4], CREAM, PAT.fur),
      box([-1.6, -1.8, -5.35], [3.2, 3, 0.3], WHITE, PAT.fur),                                  // bib
    ] },
    legs: { x: 1.4, zf: -3.9, zb: 3.9, top: 4.6, knee: 2.3, w: 1.6, w2: 1.35, c: FUR, sc: FUR, pat: PAT.fur, sock: [0.9, WHITE] },
    head: { pivot: [0, 8.7, -5.0], tilt: 0, boxes: [
      box([-2.8, -2.2, -4.4], [5.6, 4.6, 4.6], FUR, PAT.stripes, STR, 2.5),
      box([-3.1, -2.1, -3.5], [6.2, 2.2, 2.4], CREAM, PAT.fur),                                  // cheek fluff
      box([-1.25, -2.25, -5.0], [2.5, 1.6, 0.8], WHITE, PAT.fur),                                // muzzle
      box([-0.45, -1.05, -5.08], [0.9, 0.55, 0.12], '#e8909a', PAT.flat),                        // nose
      box([-0.08, -1.95, -5.06], [0.16, 0.75, 0.08], '#5a3a30', PAT.flat),
      box([-3.6, -1.45, -4.9], [2.1, 0.1, 0.1], '#f8f8f4', PAT.flat), box([-3.5, -1.9, -4.9], [2.0, 0.1, 0.1], '#f8f8f4', PAT.flat),   // whiskers
      box([1.5, -1.45, -4.9], [2.1, 0.1, 0.1], '#f8f8f4', PAT.flat), box([1.5, -1.9, -4.9], [2.0, 0.1, 0.1], '#f8f8f4', PAT.flat),
      box([-1.4, 1.6, -4.45], [0.5, 0.7, 0.1], STR, PAT.flat), box([-0.25, 1.7, -4.45], [0.5, 0.8, 0.1], STR, PAT.flat), box([0.9, 1.6, -4.45], [0.5, 0.7, 0.1], STR, PAT.flat),   // forehead "M"
    ].concat(E), lids: Lid },
    ears: { pivot: [1.7, 2.3, -2.3], rx: -0.1, rz: 0.12, boxes: [
      box([-0.95, 0, -0.6], [1.9, 1.4, 1.2], FUR, PAT.fur), box([-0.65, 1.4, -0.5], [1.3, 0.9, 1.0], FUR, PAT.fur), box([-0.3, 2.3, -0.4], [0.6, 0.55, 0.8], STR, PAT.fur),
      box([-0.55, 0.3, -0.65], [1.1, 1.5, 0.1], '#f0a8b0', PAT.flat),
    ] },
    tail: { pivot: [0, 7.6, 5.0], rx: -0.55, boxes: [box([-0.55, -0.55, 0], [1.1, 1.1, 5.2], FUR, PAT.stripes, STR, 2)], tip: { pivot: [0, 7.6, 10.0], rx: -0.6, boxes: [box([-0.55, -0.55, 0], [1.1, 1.1, 4.4], FUR, PAT.stripes, STR, 2), box([-0.6, -0.6, 3.6], [1.2, 1.2, 1], STR, PAT.fur)] } },
  });
  Object.assign(MOBS.cat, { model: MODELS.cat, sounds: { idle: 'meow', hurt: 'hiss', death: 'meow' }, idleSound: 0.06, sits: true, grooms: true });
}

function foxModel(c) {
  const [E, Lid] = faceEyes(0.55, 0.3, -4.05, 1.2, 1.0, c.eye, c.fur, true);
  return beast({
    height: 12,
    body: { pivot: [0, 6.6, 0], boxes: [
      box([-2.6, -2.4, -5.4], [5.2, 4.8, 10.8], c.fur, PAT.fur, c.fur2),
      box([-1.9, -2.2, -5.62], [3.8, 3.4, 0.4], c.white, PAT.fur),                                 // bib
      box([-2, -2.5, -4.5], [4, 0.5, 8], c.white, PAT.fur),
    ] },
    legs: { x: 1.6, zf: -4, zb: 4, top: 4.6, knee: 2.2, w: 1.7, w2: 1.3, c: c.fur, sc: c.sock, pat: PAT.fur },
    head: { pivot: [0, 8.9, -5.4], tilt: 0, boxes: [
      box([-2.6, -2.0, -4.0], [5.2, 4.2, 4.2], c.fur, PAT.fur, c.fur2),
      box([-2.9, -2.2, -3.2], [5.8, 1.8, 2.2], c.white, PAT.fur),                                  // cheek ruff
      box([-1.2, -2.0, -7.0], [2.4, 2.0, 3.2], c.fur, PAT.fur, c.fur2),                            // narrow snout
      box([-1.15, -2.05, -6.9], [2.3, 0.8, 3.0], c.white, PAT.fur),
      box([-0.5, -1.15, -7.12], [1.0, 0.8, 0.2], '#141010', PAT.flat),                             // nose
      box([-0.04, -2.0, -7.05], [0.08, 0.6, 0.08], '#3a2a24', PAT.flat),
    ].concat(E), lids: Lid },
    ears: { pivot: [1.7, 2.1, -1.8], rx: -0.05, rz: 0.15, boxes: [
      box([-1.1, 0, -0.5], [2.2, 1.6, 1], c.fur, PAT.fur), box([-0.8, 1.6, -0.45], [1.6, 1.1, 0.9], c.fur, PAT.fur), box([-0.45, 2.6, -0.4], [0.9, 0.7, 0.8], c.tip, PAT.fur),
      box([-0.7, 0.3, -0.55], [1.4, 1.5, 0.1], c.inner, PAT.flat),
    ] },
    tail: { pivot: [0, 7.4, 5.2], rx: 0.55, boxes: [box([-1.5, -1.5, 0], [3, 3, 5], c.fur, PAT.fur, c.fur2)], tip: { pivot: [0, 7.4, 10], rx: 0.15, boxes: [box([-1.9, -1.9, 0], [3.8, 3.8, 3.8], c.fur, PAT.fur, c.fur2), box([-1.7, -1.7, 3.6], [3.4, 3.4, 1.8], c.white, PAT.fur)] } },
  });
}
MODELS.fox = foxModel({ fur: '#d8622a', fur2: '#b84a1c', white: '#f4ece2', sock: '#2e2420', tip: '#2e2420', inner: '#f4ece2', eye: '#e8a020' });
MODELS.arctic_fox = foxModel({ fur: '#f2f2f0', fur2: '#dde2ea', white: '#ffffff', sock: '#e6e8ec', tip: '#cfd4dc', inner: '#d8dce4', eye: '#2a2a30' });
Object.assign(MOBS.arctic_fox, { model: MODELS.arctic_fox, sounds: { idle: 'yip', hurt: 'yip', death: 'yip' }, sits: true, pounces: true });
MOBS.fox = Object.assign({}, MOBS.arctic_fox, { id: 'fox', name: 'Red Fox', model: MODELS.fox, food: ['berries', 'raw_chicken', 'raw_fish'] });

// --------------------------------------------------------------- behaviour
// Small hunters: sit down to watch the world for a while, wash, and (foxes) pounce at something in the grass.
class SmallHunter extends Mob {
  brainAnimal(dt) {
    this.loungeT = Math.max(0, (this.loungeT || 0) - dt);
    this.groomT = Math.max(0, (this.groomT || 0) - dt);
    super.brainAnimal(dt);
    if (this.sleeping || this.fleeT > 0) { this.loungeT = 0; return; }
    const idle = !this.goal && this.state === 'idle' && !(this.grazeT > 0);
    if (idle && !this.loungeT && Math.random() < dt * 0.12) { this.loungeT = rnd(4, 11); this.stateT = Math.max(this.stateT, this.loungeT); }
    if ((this.loungeT || this.sitting) && this.def.grooms && !this.groomT && Math.random() < dt * 0.15) this.groomT = rnd(1.6, 3);
    if (this.loungeT) { this.mx = this.mz = 0; this.wantSpeed = 0; this.grazeT = 0; }
    // a fox's pounce: freeze, then a high hop forward, nose first
    if (this.def.pounces && idle && !this.loungeT && this.onGround && Math.random() < dt * 0.05) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      this.vy = 7; this.vx = fx * 3.5; this.vz = fz * 3.5; this.pounceT = 0.9;
    }
    if (this.pounceT > 0) this.pounceT -= dt;
    // a contented cat purrs when its owner is close
    if (this.kind === 'cat' && this.tamed && (this.loungeT || this.sitting) && this.distTo(this.game.player.x, this.game.player.y, this.game.player.z) < 3 && Math.random() < dt * 0.15) this.game.audio.mob('purr', this);
  }
}
MOB_CLASSES.cat = SmallHunter; MOB_CLASSES.arctic_fox = SmallHunter; MOB_CLASSES.fox = SmallHunter;

const add = (biome, rows) => { ANIMAL_SPAWNS[biome] = (ANIMAL_SPAWNS[biome] || []).concat(rows); };
add(BIOME.FOREST, [['fox', 2, 1, 2]]);
add(BIOME.TAIGA, [['fox', 3, 1, 2]]);
add(BIOME.BIRCH_FOREST, [['fox', 1, 1, 1]]);
add(BIOME.PLAINS, [['cat', 0.5, 1, 1]]);
