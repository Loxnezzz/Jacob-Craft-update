// Wildlife: the creatures that make each biome feel lived in.
//   plains & woods  songbirds, owls (at night, up in the trees), deer on the open grass
//   ancient forest  the Glimmerstag: a rare white stag with softly glowing antlers
//   desert          sand lizards, vultures circling overhead, camels you can tame and ride; far fewer scorpions
//   snow            snow hares, wolves, and at night the Frostfang
//   jungle          parrots, tapirs
//   swamp           dragonflies by day, fireflies and Bog Wisps by night
//   mountains       ridge goats, eagles, the occasional ridge lynx
//   ocean           dolphins, sharks in deep water, drifting jellyfish and lanternfish in the dark below
//   volcanic        magma beetles, and Cinder Hounds after dark
import { Mob, MOB_CLASSES, VARIANTS, variantModel } from './mobs.js';
import { MOBS, ANIMAL_SPAWNS, NIGHT_SPAWNS, DAY_SPAWNS } from './defs.js';
import { MODELS, PAT, box, part, finalize, beast, bird, eyes } from './models.js';
import { ANIMS } from './anim.js';
import { BIOME } from '../world/biomes.js';
import { BLOCKS, B, IS_LIQUID } from '../world/blocks.js';
import { moveEntity } from '../game/physics.js';

const set = (m, P, name, rx = 0, ry = 0, rz = 0, tx = 0, ty = 0, tz = 0) => {
  const i = m.model.index[name];
  if (i === undefined) return;
  const p = P[i];
  p[0] += rx; p[1] += ry; p[2] += rz; p[3] += tx; p[4] += ty; p[5] += tz;
};
const rnd = (a, b) => a + Math.random() * (b - a);

function def(id, o) {
  MOBS[id] = Object.assign({
    id, name: id, type: 'animal', hp: 10, speed: 1.6, runSpeed: 3.2, size: [0.8, 1.2], model: MODELS[id],
    drops: [], sounds: {}, idleSound: 0.08, food: [], scale: 1, sleeps: false, swims: false, aquatic: false, fly: false,
    xp: 2, knockRes: 0, attack: null, follow: 16,
  }, o);
}
// recolour an existing model (colour swaps by hex), optionally making some colours glow
function recolor(base, swaps, glow = []) {
  const C = (h) => { const v = parseInt(h.slice(1), 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; };
  const same = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 0.02;
  const S = swaps.map(([a, b]) => [C(a), C(b)]), G = glow.map(C);
  const sw = (c) => { for (const [a, b] of S) if (same(c, a)) return b; return c; };
  const parts = base.parts.map(pt => Object.assign({}, pt, { boxes: pt.boxes.map(b => Object.assign({}, b, { c: sw(b.c), c2: sw(b.c2), p: G.some(g => same(sw(b.c), g)) ? PAT.glow : b.p })) }));
  return finalize(Object.assign({}, base, { parts }));
}

// ===================================================================== models
// --- songbirds (meadowlark / robin / bluebird variants)
MODELS.songbird = bird({
  legH: 1.6, body: [3.2, 3.2, 4.6], head: [2.6, 2.6, 2.6], beak: [0.8, 0.7, 1.3], headUp: 0.8, headInset: 0.9,
  colors: { body: '#8a6a3a', body2: '#6a4a26', head: '#8a6a3a', leg: '#c8a070', beak: '#3a3020', wing: '#6a4a26', wing2: '#4a3218' },
  bodyExtra: [box([-1.35, -1.3, -2.4], [2.7, 2.2, 0.3], '#f0d040', PAT.noise), box([-0.4, 0.2, -2.45], [0.8, 0.8, 0.2], '#2a2018', PAT.flat)],
  tail: [box([-1, -0.4, 0], [2, 0.8, 2.6], '#5a3a1c', PAT.feathers)],
});
// --- owl: round body, big facial disc, ear tufts, huge eyes
MODELS.owl = bird({
  legH: 1.5, body: [5, 7, 5], head: [5.2, 4.6, 4.6], beak: [0.8, 1.1, 0.8], headUp: 1.0, headInset: 2.4,
  colors: { body: '#8a6a48', body2: '#6a4e34', head: '#8a6a48', head2: '#a88a64', leg: '#c8a868', beak: '#4a3a28', wing: '#6a4e34', wing2: '#4e3a26' },
  bodyExtra: [box([-2.2, -3, -2.6], [4.4, 5.2, 0.3], '#d8c8a4', PAT.feathers, '#c0aa84')],
  headExtra: [
    box([-2.4, 0.5, -2.42], [4.8, 3.6, 0.2], '#e2d4b4', PAT.noise),
    box([-2.0, 1.8, -2.5], [1.5, 1.5, 0.1], '#f0a818', PAT.glow), box([0.5, 1.8, -2.5], [1.5, 1.5, 0.1], '#f0a818', PAT.glow),
    box([-1.65, 2.15, -2.55], [0.8, 0.8, 0.1], '#100c08', PAT.flat), box([0.85, 2.15, -2.55], [0.8, 0.8, 0.1], '#100c08', PAT.flat),
    box([-2.6, 4.2, -1.2], [1.1, 1.6, 1.2], '#6a4e34', PAT.feathers), box([1.5, 4.2, -1.2], [1.1, 1.6, 1.2], '#6a4e34', PAT.feathers),
  ],
  tail: [box([-1.6, -1.5, 0], [3.2, 1.5, 2], '#6a4e34', PAT.feathers)],
});
// --- parrot (red, blue, green)
MODELS.parrot = bird({
  legH: 2, body: [3.6, 5, 4], head: [3.2, 3.6, 3.2], beak: [1.3, 1.7, 1.4], headUp: 0.85, headInset: 1,
  colors: { body: '#d82a22', body2: '#a81a16', head: '#d82a22', head2: '#f0e8d8', leg: '#6a6a6a', beak: '#2a2a2a', beak2: '#e8e0d0', wing: '#2a6ad8', wing2: '#f0c020' },
  headExtra: [box([-1.62, 1.2, -1.2], [0.1, 1.4, 1.6], '#f4f0e8', PAT.flat), box([1.52, 1.2, -1.2], [0.1, 1.4, 1.6], '#f4f0e8', PAT.flat)],
  tail: [box([-0.8, -6, 0], [1.6, 6.5, 1.2], '#d82a22', PAT.feathers, '#2a6ad8')],
});
// --- big soaring birds: long spread wings built as horizontal plates
function soarer(o) {
  const parts = [];
  parts.push(part('body', null, [0, 4, 0], [box([-2.6, -2.2, -5], [5.2, 4.4, 10], o.body, PAT.feathers, o.body2)].concat(o.bodyExtra || [])));
  parts.push(part('head', 'body', [0, 5, -5], [box([-1.4, -1, -2.8], [2.8, 2.6, 3], o.head, PAT.feathers, o.head2 || o.head), box([-0.6, -0.4, -4.3], [1.2, 1.4, 1.6], o.beak, PAT.flat), box([-0.4, -1.1, -4.6], [0.8, 0.8, 0.6], o.beak2 || o.beak, PAT.flat),
    box([-1.45, 0.6, -2.2], [0.1, 0.6, 0.6], '#100c08', PAT.flat), box([1.35, 0.6, -2.2], [0.1, 0.6, 0.6], '#100c08', PAT.flat)].concat(o.headExtra || [])));
  for (const [n, s] of [['wingL', -1], ['wingR', 1]]) {
    const b = [box([s < 0 ? -9 : 0, -0.35, -3.5], [9, 0.7, 7], o.wing, PAT.feathers, o.wing2), box([s < 0 ? -16 : 8.5, -0.3, -2.8], [7.5, 0.6, 5.6], o.wing2, PAT.feathers, o.tip || o.wing2)];
    for (let i = 0; i < 4; i++) b.push(box([s < 0 ? -17.5 + i * 0.2 : 15.5 - i * 0.2, -0.25, -2.6 + i * 1.5], [2, 0.5, 1.1], o.tip || o.wing2, PAT.flat));
    parts.push(part(n, 'body', [s * 2.6, 5, -1], b));
  }
  parts.push(part('tail', 'body', [0, 4.4, 5], [box([-2.4, -0.4, 0], [4.8, 0.8, 4.2], o.tailC || o.wing2, PAT.feathers)]));
  parts.push(part('legL', 'body', [-1.2, 2, 1], [box([-0.5, -2.4, -0.5], [1, 2.4, 1], o.leg, PAT.flat), box([-0.8, -2.6, -1.5], [1.6, 0.4, 2], o.leg, PAT.flat)]));
  parts.push(part('legR', 'body', [1.2, 2, 1], [box([-0.5, -2.4, -0.5], [1, 2.4, 1], o.leg, PAT.flat), box([-0.8, -2.6, -1.5], [1.6, 0.4, 2], o.leg, PAT.flat)]));
  return finalize({ parts, anim: 'soar', height: 9 });
}
MODELS.vulture = soarer({ body: '#3a2e28', body2: '#2a201c', head: '#c87a6a', head2: '#a85a4a', beak: '#d8c8a8', beak2: '#3a3020', wing: '#2e2420', wing2: '#221a16', tip: '#16100c', leg: '#a89070',
  bodyExtra: [box([-2.8, 1.4, -5.6], [5.6, 1.6, 2.2], '#e8e0d0', PAT.fur)] });
MODELS.eagle = soarer({ body: '#5a3a22', body2: '#3e2814', head: '#f2efe6', head2: '#d8d4ca', beak: '#f0c030', beak2: '#c89010', wing: '#4e321c', wing2: '#3a2414', tip: '#22160c', leg: '#f0c030', tailC: '#f2efe6' });

// --- ridge goat
{
  const [E, Lid] = eyes(2.35, 0.6, -4.6, 1.1, 1.4, '#d8d2c4', '#2a2218');
  MODELS.goat = beast({
    height: 26,
    body: { pivot: [0, 14, 0], boxes: [box([-3.8, -4, -7], [7.6, 8.4, 14], '#e8e2d6', PAT.fur, '#d0c8b8'), box([-4.1, -2.5, -6], [8.2, 5, 6], '#e8e2d6', PAT.fur, '#d0c8b8')] },
    legs: { x: 2.4, zf: -5, zb: 5.2, top: 11, knee: 5.5, w: 2.6, w2: 2.0, c: '#e0dacc', sc: '#d6cfc0', hoof: '#3a3430', hoofH: 1.1, pat: PAT.fur },
    neck: { pivot: [0, 16, -6.2], tilt: -0.35, boxes: [box([-1.8, -2, -2], [3.6, 7, 4], '#e8e2d6', PAT.fur, '#d0c8b8')] },
    head: { pivot: [0, 22, -6.6], tilt: 0.1, boxes: [
      box([-2.2, -2, -5], [4.4, 4.4, 5.4], '#e8e2d6', PAT.fur, '#d0c8b8'), box([-1.6, -2.6, -7.2], [3.2, 3.2, 2.6], '#e2dbcc', PAT.noise),
      box([-0.9, -5.6, -6.4], [1.8, 3.2, 1.4], '#d8d0c0', PAT.fur),                                    // beard
      box([-1.9, 2.2, -2.6], [1.2, 2.2, 1.2], '#5a5046', PAT.rock), box([0.7, 2.2, -2.6], [1.2, 2.2, 1.2], '#5a5046', PAT.rock),   // horns sweep back
      box([-2.0, 3.8, -1.6], [1.1, 1.1, 2.4], '#4a4036', PAT.rock), box([0.9, 3.8, -1.6], [1.1, 1.1, 2.4], '#4a4036', PAT.rock),
      box([-2.0, 3.2, 0.5], [1, 1.6, 1], '#4a4036', PAT.rock), box([1.0, 3.2, 0.5], [1, 1.6, 1], '#4a4036', PAT.rock),
    ].concat(E), lids: Lid },
    ears: { pivot: [2.2, 1, -2.4], rz: 0.6, boxes: [box([0, -0.5, -0.8], [2.6, 1, 1.6], '#e2dbcc', PAT.fur)] },
    tail: { pivot: [0, 17.5, 7], rx: -0.6, boxes: [box([-0.8, -0.5, -0.5], [1.6, 2.6, 1.2], '#e8e2d6', PAT.fur)] },
  });
}
// --- ridge lynx: low, long, spotted, with a thick tail
{
  const [E, Lid] = eyes(2.25, 0.8, -4.2, 1.0, 1.3, '#cfc8bc', '#2a2a18');
  MODELS.lynx = beast({
    height: 16,
    body: { pivot: [0, 10, 0], boxes: [box([-3.2, -3, -7.5], [6.4, 6.2, 15], '#d8d2c6', PAT.spots, '#5a5650', 0.7)] },
    legs: { x: 2.1, zf: -5.6, zb: 5.6, top: 8, knee: 4, w: 2.4, w2: 2.1, c: '#d0c9bc', sc: '#cac2b4', pat: PAT.spots, sc2: '#5a5650' },
    head: { pivot: [0, 13, -7.4], tilt: 0, boxes: [
      box([-2.6, -2.2, -4.4], [5.2, 4.6, 4.6], '#d8d2c6', PAT.spots, '#5a5650', 0.6), box([-1.5, -2.2, -5.7], [3, 2.2, 1.6], '#e8e2d8', PAT.noise),
      box([-0.5, -0.8, -5.8], [1, 0.7, 0.2], '#3a2a2a', PAT.flat), box([-2.8, -2.6, -2.4], [0.8, 2.6, 2], '#e8e2d8', PAT.fur), box([2.0, -2.6, -2.4], [0.8, 2.6, 2], '#e8e2d8', PAT.fur),
    ].concat(E), lids: Lid },
    ears: { pivot: [1.6, 2.2, -1.6], boxes: [box([-0.6, 0, -0.5], [1.4, 2.4, 1], '#5a5650', PAT.fur), box([-0.2, 2.2, -0.2], [0.5, 1.2, 0.4], '#2a2826', PAT.flat)] },
    tail: { pivot: [0, 12.4, 7.2], rx: 0.9, boxes: [box([-1.2, -1, -0.5], [2.4, 2.4, 6], '#d8d2c6', PAT.stripes, '#4a4640', 2)], tip: { pivot: [0, 12.4, 12.8], rx: 0.2, boxes: [box([-1.3, -1.1, -0.2], [2.6, 2.6, 4.5], '#d8d2c6', PAT.stripes, '#4a4640', 2)] } },
  });
}
// --- camel: long legs, two humps, a long curved neck; a saddle sits between the humps
{
  const [E, Lid] = eyes(2.6, 0.6, -5.2, 1.0, 1.4, '#b89458', '#2a1e12');
  MODELS.camel = beast({
    height: 42, saddle: [-5.2, 31, -2.4, 10.4, 1.4, 5],
    body: { pivot: [0, 26, 0], boxes: [
      box([-5, -5, -11], [10, 10, 22], '#c8a46a', PAT.fur, '#a88450'),
      box([-3.6, 5, -8.4], [7.2, 4.4, 5.2], '#c8a46a', PAT.fur, '#a88450'), box([-2.8, 9.2, -7.6], [5.6, 1.6, 3.6], '#c8a46a', PAT.fur),
      box([-3.6, 5, 3.2], [7.2, 4.4, 5.2], '#c8a46a', PAT.fur, '#a88450'), box([-2.8, 9.2, 4], [5.6, 1.6, 3.6], '#c8a46a', PAT.fur),
      box([-4.6, -5.6, -9], [9.2, 1, 9], '#b89458', PAT.fur),
    ] },
    legs: { x: 3.4, zf: -8, zb: 8, top: 22, knee: 11, w: 3.4, w2: 2.6, c: '#c09c62', sc: '#b89458', hoof: '#8a7050', hoofH: 1.4, pat: PAT.fur },
    neck: { pivot: [0, 26, -10], tilt: -0.85, boxes: [box([-2, -2.5, -2.3], [4, 14, 4.6], '#c8a46a', PAT.fur, '#a88450'), box([-1.8, -2.5, 1.9], [3.6, 10, 1.4], '#b08c56', PAT.fur)] },
    head: { pivot: [0, 38.5, -11.6], tilt: 0.55, boxes: [
      box([-2.5, -2.4, -6.6], [5, 5, 7.4], '#c8a46a', PAT.fur, '#a88450'), box([-2.1, -2.8, -9.2], [4.2, 3.6, 3], '#b89458', PAT.noise),
      box([-1.9, -3.2, -9.4], [3.8, 1, 2.6], '#a88450', PAT.flat), box([-1.5, -1.2, -9.3], [0.8, 0.7, 0.2], '#3a2a1a', PAT.flat), box([0.7, -1.2, -9.3], [0.8, 0.7, 0.2], '#3a2a1a', PAT.flat),
      box([-2.7, 1.2, -5.6], [5.4, 0.8, 1.2], '#a88450', PAT.fur),                                           // heavy brow
    ].concat(E), lids: Lid },
    ears: { pivot: [2.2, 1.8, -1.6], rz: 0.4, boxes: [box([0, -0.4, -0.6], [1.6, 1, 1.2], '#b89458', PAT.fur)] },
    tail: { pivot: [0, 28, 11], rx: 0.3, boxes: [box([-0.6, -8, -0.5], [1.2, 8.5, 1], '#a88450', PAT.fur)], tip: { pivot: [0, 20, 11], boxes: [box([-0.9, -2.6, -0.8], [1.8, 2.8, 1.6], '#6a5030', PAT.fur)] } },
  });
}
// --- tapir: dark head and legs, pale saddle, a short trunk
{
  const [E, Lid] = eyes(2.6, 0.6, -4.2, 0.9, 1.1, '#1e1c20');
  MODELS.tapir = beast({
    height: 20,
    body: { pivot: [0, 12, 0], boxes: [box([-4.4, -4.4, -8.5], [8.8, 9, 17], '#1e1c20', PAT.fur, '#141216'), box([-4.6, -4.6, -2.6], [9.2, 9.4, 8.2], '#e8e4dc', PAT.fur, '#d0ccc4')] },
    legs: { x: 2.8, zf: -6, zb: 6, top: 9, knee: 4.5, w: 3.2, w2: 2.6, c: '#1e1c20', hoof: '#0e0c0e', hoofH: 1, pat: PAT.fur },
    head: { pivot: [0, 13, -8.4], tilt: 0.25, boxes: [
      box([-2.8, -2.8, -5.4], [5.6, 5.6, 6], '#1e1c20', PAT.fur, '#141216'), box([-1.6, -2.4, -8.6], [3.2, 2.8, 3.4], '#262428', PAT.noise),
      box([-1.1, -3.6, -9.4], [2.2, 2, 1.6], '#262428', PAT.noise),                                         // trunk tip
      box([-2.9, -2.9, -3], [5.8, 0.6, 1.4], '#e8e4dc', PAT.flat),                                           // pale lip line
    ].concat(E), lids: Lid },
    ears: { pivot: [2.2, 2.4, -1.4], boxes: [box([-0.6, 0, -0.5], [1.6, 2, 1], '#1e1c20', PAT.fur), box([-0.4, 1.8, -0.55], [1.2, 0.4, 0.1], '#e8e4dc', PAT.flat)] },
    tail: { pivot: [0, 14, 8.5], rx: 0.3, boxes: [box([-0.5, -1.6, -0.4], [1, 2, 0.8], '#1e1c20', PAT.fur)] },
  });
}
// --- sand lizard: low and long, splayed little legs, a whip of a tail
{
  const E = [box([-1.45, 0.2, -2.6], [0.1, 0.6, 0.6], '#101010', PAT.flat), box([1.35, 0.2, -2.6], [0.1, 0.6, 0.6], '#101010', PAT.flat)];
  MODELS.lizard = beast({
    height: 4,
    body: { pivot: [0, 2.4, 0], boxes: [box([-1.6, -1, -3.8], [3.2, 2.1, 7.6], '#c8a060', PAT.spots, '#8a6a3a', 1.4), box([-1.3, -1.1, -3.4], [2.6, 0.3, 6.8], '#e8d0a0', PAT.flat)] },
    legs: { x: 2.0, zf: -2.6, zb: 2.6, top: 2.2, knee: 1.1, w: 1.0, w2: 0.9, c: '#b89050', pat: PAT.noise },
    head: { pivot: [0, 2.9, -3.8], boxes: [box([-1.4, -0.9, -3.2], [2.8, 1.9, 3.4], '#c8a060', PAT.spots, '#8a6a3a', 1.2), box([-0.15, -0.95, -3.3], [0.3, 0.3, 0.2], '#e86a3a', PAT.flat)].concat(E) },
    tail: { pivot: [0, 2.4, 3.6], rx: 0, boxes: [box([-0.8, -0.6, -0.2], [1.6, 1.2, 4.4], '#c8a060', PAT.spots, '#8a6a3a', 1.2)], tip: { pivot: [0, 2.4, 7.8], rx: 0, boxes: [box([-0.45, -0.4, -0.2], [0.9, 0.8, 4.8], '#b89050', PAT.noise)] } },
  });
}
// --- recoloured cousins
MODELS.snow_hare = recolor(MODELS.rabbit, [['#8a6a4a', '#f2f0ec'], ['#a88a6a', '#ffffff']]);
MODELS.frostfang = recolor(MODELS.wolf, [['#8c8c8a', '#dfe8ee'], ['#7c7c7a', '#b8ccd8'], ['#d8d6d0', '#f4f8fa'], ['#a8a6a0', '#c8d8e2'], ['#e8b830', '#9ad8ff'], ['#e8e6e0', '#ffffff']], ['#9ad8ff']);
MODELS.cinder_hound = recolor(MODELS.wolf, [['#8c8c8a', '#2a2422'], ['#7c7c7a', '#1a1614'], ['#d8d6d0', '#e05a18'], ['#a8a6a0', '#3a2a24'], ['#e8b830', '#ffae3a'], ['#e8e6e0', '#ff7a1a']], ['#ffae3a', '#e05a18']);
MODELS.glimmerstag = recolor(MODELS.deer, [['#9a6a3e', '#ece8e2'], ['#8a5e36', '#dcd6cc'], ['#e8d8b8', '#ffffff'], ['#d8c8a8', '#bfe8ff']], ['#bfe8ff']);
MODELS.lanternfish = recolor(MODELS.fish, [['#c8a06a', '#22283a'], ['#a8804a', '#141826']]);
MODELS.lanternfish.parts[0].boxes.push(box([-0.15, 4, -5.5], [0.3, 0.3, 2.5], '#3a3a4a', PAT.flat), box([-0.5, 3.6, -6], [1, 1, 1], '#a8f0ff', PAT.glow));
// --- magma beetle: a glowing shell on six little legs
MODELS.magma_beetle = finalize({
  anim: 'arthropod', height: 6, legs: 3,
  parts: [
    part('body', null, [0, 2.6, 0], [box([-2.8, -1.2, -3.6], [5.6, 3, 7.2], '#2a1a14', PAT.rock, '#1a100c'), box([-2.4, 1.6, -3.2], [4.8, 0.8, 6.4], '#ff7a1a', PAT.lava, '#e0400a'), box([-0.15, 1.65, -3.2], [0.3, 0.9, 6.4], '#1a100c', PAT.flat)]),
    part('head', 'body', [0, 2.6, -3.6], [box([-1.6, -1, -1.8], [3.2, 2, 1.9], '#2a1a14', PAT.rock), box([-1.2, 0.2, -1.85], [0.6, 0.6, 0.1], '#ffd060', PAT.glow), box([0.6, 0.2, -1.85], [0.6, 0.6, 0.1], '#ffd060', PAT.glow), box([-1.5, -0.6, -2.8], [0.5, 0.5, 1.2], '#1a100c', PAT.flat), box([1, -0.6, -2.8], [0.5, 0.5, 1.2], '#1a100c', PAT.flat)]),
    ...[0, 1, 2].flatMap(i => {
      const z = -2.2 + i * 2.2;
      return [part('legL' + i, null, [-2.8, 2, z], [box([-2.2, -0.35, -0.35], [2.2, 0.7, 0.7], '#1a100c', PAT.flat), box([-2.2, -2, -0.35], [0.7, 2, 0.7], '#1a100c', PAT.flat)]),
        part('legR' + i, null, [2.8, 2, z], [box([0, -0.35, -0.35], [2.2, 0.7, 0.7], '#1a100c', PAT.flat), box([1.5, -2, -0.35], [0.7, 2, 0.7], '#1a100c', PAT.flat)])];
    }),
  ],
});
// --- bog wisp: a cold green light with a dim halo
MODELS.bog_wisp = finalize({
  anim: 'wisp', height: 8,
  parts: [
    part('body', null, [0, 4, 0], [box([-1.2, -1.2, -1.2], [2.4, 2.4, 2.4], '#d8ffb0', PAT.glow), box([-2, -2, -2], [4, 4, 4], '#4a8a3a', PAT.glow)]),
    part('ring', 'body', [0, 4, 0], [box([-3.2, -0.2, -0.2], [1, 0.4, 0.4], '#a8f080', PAT.glow), box([2.2, -0.2, -0.2], [1, 0.4, 0.4], '#a8f080', PAT.glow), box([-0.2, -0.2, -3.2], [0.4, 0.4, 1], '#a8f080', PAT.glow), box([-0.2, -0.2, 2.2], [0.4, 0.4, 1], '#a8f080', PAT.glow)]),
  ],
});
// --- dragonfly: long thin body, four glassy wings
MODELS.dragonfly = finalize({
  anim: 'bat', height: 2,
  parts: [
    part('body', null, [0, 1, 0], [box([-0.3, -0.3, -1.2], [0.6, 0.6, 5], '#2a8ac8', PAT.flat), box([-0.55, -0.4, -2.0], [1.1, 0.9, 1], '#1a5a8a', PAT.flat)]),
    part('wingL', 'body', [-0.3, 1.2, -0.6], [box([-3.4, 0, -0.5], [3.4, 0.1, 1.1], '#d8f0ff', PAT.flat), box([-3.0, 0, 0.8], [3, 0.1, 1], '#d8f0ff', PAT.flat)]),
    part('wingR', 'body', [0.3, 1.2, -0.6], [box([0, 0, -0.5], [3.4, 0.1, 1.1], '#d8f0ff', PAT.flat), box([0, 0, 0.8], [3, 0.1, 1], '#d8f0ff', PAT.flat)]),
  ],
});
// --- dolphin and shark
function swimmer(o) {
  const parts = [];
  parts.push(part('body', null, [0, o.h / 2, 0], [box([-o.w / 2, -o.h / 2, -o.l / 2], [o.w, o.h, o.l], o.c, PAT.noise, o.c2), box([-o.w / 2 + 0.3, -o.h / 2 - 0.05, -o.l / 2 + 1], [o.w - 0.6, o.h * 0.4, o.l - 3], o.belly, PAT.flat),
    box([-0.4, o.h / 2, -1], [0.8, o.fin, 3], o.c2, PAT.flat), box([-o.w / 2 - 2.4, -o.h / 2 + 0.5, -o.l / 2 + 3.5], [2.4, 0.5, 2.6], o.c2, PAT.flat), box([o.w / 2, -o.h / 2 + 0.5, -o.l / 2 + 3.5], [2.4, 0.5, 2.6], o.c2, PAT.flat)].concat(o.bodyExtra || [])));
  parts.push(part('head', 'body', [0, o.h / 2, -o.l / 2], [box([-o.w / 2 + 0.4, -o.h / 2 + 0.3, -o.snout], [o.w - 0.8, o.h - 0.8, o.snout], o.c, PAT.noise, o.c2), box([-o.w / 2 + 0.38, 0.2, -2.2], [0.1, 0.8, 0.8], '#101010', PAT.flat), box([o.w / 2 - 0.48, 0.2, -2.2], [0.1, 0.8, 0.8], '#101010', PAT.flat)].concat(o.headExtra || [])));
  parts.push(part('tail', 'body', [0, o.h / 2, o.l / 2], [box([-o.w / 2 + 0.8, -o.h / 2 + 0.8, 0], [o.w - 1.6, o.h - 1.6, o.tail], o.c, PAT.noise, o.c2)]));
  parts.push(part('fluke', 'tail', [0, o.h / 2, o.l / 2 + o.tail], o.vertical
    ? [box([-0.3, -o.h * 0.6, -0.5], [0.6, o.h * 1.5, 2.2], o.c2, PAT.flat)]
    : [box([-o.w * 0.9, -0.3, -0.5], [o.w * 1.8, 0.6, 2.4], o.c2, PAT.flat)]));
  return finalize({ parts, anim: 'swim', height: o.h });
}
MODELS.dolphin = swimmer({ w: 4.4, h: 4.6, l: 15, snout: 4.4, tail: 5, fin: 2.6, c: '#7a8a9a', c2: '#5a6a7a', belly: '#d8dee4', headExtra: [box([-0.9, -1.8, -6.4], [1.8, 1.2, 2.4], '#7a8a9a', PAT.noise)] });
MODELS.shark = swimmer({ w: 6, h: 6.4, l: 24, snout: 5.4, tail: 8, fin: 5, c: '#6a7480', c2: '#4a525c', belly: '#e6e8ea', vertical: true,
  headExtra: [box([-2.2, -2.6, -5.0], [4.4, 0.4, 2.4], '#f4f4f0', PAT.flat), box([-2.6, 0.6, -2.6], [0.1, 1, 1.4], '#2a2e34', PAT.flat), box([2.5, 0.6, -2.6], [0.1, 1, 1.4], '#2a2e34', PAT.flat)] });
// --- jellyfish: a pale glowing bell trailing tentacles
MODELS.jellyfish = finalize({
  anim: 'jelly', height: 10,
  parts: [
    part('body', null, [0, 8, 0], [box([-3, -1, -3], [6, 4, 6], '#c8a0e0', PAT.glow), box([-2.4, 3, -2.4], [4.8, 1.2, 4.8], '#e0c8f0', PAT.glow), box([-3.2, -1.4, -3.2], [6.4, 0.6, 6.4], '#a070c8', PAT.glow)]),
    ...[[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8], [0, 0]].map(([x, z], i) => part('ten' + i, 'body', [x, 7, z], [box([-0.25, -7 - (i % 2) * 2, -0.25], [0.5, 7 + (i % 2) * 2, 0.5], '#d8b8f0', PAT.glow)])),
  ],
});

// ===================================================================== animations
ANIMS.soar = (m, P, t) => {
  // gliding with the wings spread; now and then a few slow, deep beats
  const beat = m.flapT > 0 ? Math.sin(t * 7) * 0.6 : 0;
  const bank = Math.max(-0.5, Math.min(0.5, m.bank || 0));
  set(m, P, 'body', 0.05, 0, bank);
  set(m, P, 'wingL', 0, 0, beat + Math.sin(t * 1.3 + m.id) * 0.04); set(m, P, 'wingR', 0, 0, -beat - Math.sin(t * 1.3 + m.id) * 0.04);
  set(m, P, 'tail', 0, Math.sin(t * 0.9 + m.id) * 0.15);
  set(m, P, 'head', m.headPitch * 0.5 + 0.1, m.headYaw * 0.5 + Math.sin(t * 0.5 + m.id) * 0.3);
  set(m, P, 'legL', 1.2); set(m, P, 'legR', 1.2);   // tucked
};
ANIMS.swim = (m, P, t) => {
  const sp = 5 + m.walkAmt * 7;
  set(m, P, 'body', Math.sin(t * 2 + m.id) * 0.05 + (m.leap || 0), Math.sin(t * sp * 0.5) * 0.06);
  if (m.model.parts[m.model.index.fluke].boxes[0].s[0] < 1) {   // shark: side to side
    set(m, P, 'tail', 0, Math.sin(t * sp) * 0.35); set(m, P, 'fluke', 0, Math.sin(t * sp - 0.8) * 0.45);
    set(m, P, 'head', 0, -Math.sin(t * sp) * 0.08);
  } else {                                                        // dolphin: up and down
    set(m, P, 'tail', Math.sin(t * sp) * 0.3); set(m, P, 'fluke', Math.sin(t * sp - 0.8) * 0.45);
  }
};
ANIMS.jelly = (m, P, t) => {
  const pulse = Math.sin(t * 2.2 + m.id);
  set(m, P, 'body', 0, t * 0.2, 0, 0, pulse * 0.4);
  for (let i = 0; i < 5; i++) set(m, P, 'ten' + i, Math.sin(t * 1.6 + i) * 0.2 - pulse * 0.1, 0, Math.cos(t * 1.3 + i * 2) * 0.2);
};
ANIMS.wisp = (m, P, t) => {
  set(m, P, 'body', 0, 0, 0, 0, Math.sin(t * 2.4 + m.id) * 1.4);
  set(m, P, 'ring', Math.sin(t) * 0.4, t * 2.5, 0);
};

// ===================================================================== creature definitions
def('songbird', { name: 'Songbird', hp: 2, speed: 1.2, runSpeed: 5, size: [0.3, 0.35], drops: [['feather', 0, 1]], sounds: { idle: 'tweet', hurt: 'squeak', death: 'squeak' }, food: ['seeds'], idleSound: 0.3, flier: true, xp: 1 });
def('owl', { name: 'Owl', hp: 6, speed: 1.0, runSpeed: 5, size: [0.45, 0.65], drops: [['feather', 1, 2]], sounds: { idle: 'hoot', hurt: 'squeak', death: 'squeak' }, food: ['raw_chicken'], idleSound: 0.18, flier: true, nocturnal: true, xp: 2 });
def('parrot', { name: 'Parrot', hp: 6, speed: 1.4, runSpeed: 5, size: [0.4, 0.6], drops: [['feather', 1, 2]], sounds: { idle: 'squawk', hurt: 'squawk', death: 'squeak' }, food: ['seeds', 'berries', 'apple'], idleSound: 0.25, flier: true, xp: 1 });
def('vulture', { name: 'Vulture', type: 'ambient', hp: 10, speed: 4, size: [0.9, 0.6], drops: [['feather', 1, 3], ['bone', 0, 1]], sounds: { idle: 'caw', hurt: 'caw', death: 'caw' }, fly: true, idleSound: 0.05, soar: { alt: [18, 26], r: [10, 18] }, xp: 2 });
def('eagle', { name: 'Mountain Eagle', type: 'ambient', hp: 12, speed: 5, size: [0.9, 0.6], drops: [['feather', 2, 3]], sounds: { idle: 'screech', hurt: 'screech', death: 'screech' }, fly: true, idleSound: 0.06, soar: { alt: [20, 32], r: [14, 24] }, xp: 3 });
def('goat', { name: 'Ridge Goat', type: 'neutral', hp: 12, speed: 1.6, runSpeed: 3.8, size: [0.8, 1.35], drops: [['raw_mutton', 1, 2], ['leather', 0, 1]], sounds: { idle: 'bleat', hurt: 'bleat', death: 'bleat' }, food: ['wheat_item'], attack: { dmg: 3, reach: 1.6, cd: 1.6, wind: 0.5, knock: 2.2 }, jumpy: true, sleeps: true });
def('lynx', { name: 'Ridge Lynx', type: 'neutral', hp: 16, speed: 1.6, runSpeed: 4.6, size: [0.65, 0.95], drops: [['leather', 1, 2]], sounds: { idle: 'snarl', hurt: 'snarl', death: 'snarl' }, food: ['raw_mutton', 'raw_chicken'], attack: { dmg: 5, reach: 1.6, cd: 1.0 }, leaps: true, predator: true, xp: 5 });
def('camel', { name: 'Camel', hp: 26, speed: 1.3, runSpeed: 3.6, size: [1.4, 2.3], drops: [['leather', 0, 3]], sounds: { idle: 'grunt', hurt: 'grunt', death: 'grunt' }, food: ['cactus', 'wheat_item', 'apple'], rideable: true, tame: { item: null, chance: 0.3 }, rideSpeed: [5.5, 8.5], jumpPower: 0.75, sandSpeed: true, scaleSound: 0.8 });
def('tapir', { name: 'Tapir', hp: 18, speed: 1.1, runSpeed: 3.0, size: [0.9, 1.15], drops: [['leather', 0, 2], ['raw_pork', 1, 2]], sounds: { idle: 'whistle', hurt: 'squeak', death: 'squeak' }, food: ['apple', 'berries'], swims: true, sleeps: true });
def('lizard', { name: 'Sand Lizard', hp: 4, speed: 2.2, runSpeed: 6, size: [0.35, 0.25], drops: [], sounds: { idle: 'hiss', hurt: 'hiss', death: 'hiss' }, food: [], skittish: 7, idleSound: 0.02, xp: 1 });
def('snow_hare', { name: 'Snow Hare', hp: 3, speed: 2.2, runSpeed: 4.8, size: [0.4, 0.5], drops: [['leather', 0, 1]], sounds: { idle: 'squeak', hurt: 'squeak', death: 'squeak' }, food: ['carrot'], hopper: true, idleSound: 0.02, skittish: 9 });
def('glimmerstag', { name: 'Glimmerstag', hp: 20, speed: 1.8, runSpeed: 6.0, size: [0.9, 1.6], drops: [['glowdust', 2, 4], ['leather', 1, 2]], sounds: { idle: 'squeak', hurt: 'squeak', death: 'squeak' }, food: ['apple'], skittish: 22, aura: { col: [0.75, 0.92, 1], rate: 6, glow: true }, glow: 0.2, xp: 12 });
def('frostfang', { name: 'Frostfang', type: 'hostile', hp: 18, speed: 3.6, size: [0.65, 0.9], drops: [['bone', 0, 2], ['frostite_shard', 0, 1, 0.15]], sounds: { idle: 'howl', hurt: 'snarl', death: 'howl' }, attack: { dmg: 4, reach: 1.5, cd: 1.0, chill: true }, leaps: true, aura: { col: [0.85, 0.95, 1], rate: 3, glow: true }, xp: 6 });
def('cinder_hound', { name: 'Cinder Hound', type: 'hostile', hp: 20, speed: 3.8, size: [0.65, 0.9], drops: [['coal', 0, 2], ['brimstone', 0, 1, 0.3]], sounds: { idle: 'snarl', hurt: 'snarl', death: 'snarl' }, attack: { dmg: 5, reach: 1.5, cd: 1.0, burn: true }, leaps: true, fireImmune: true, aura: { ember: true, rate: 6 }, glow: 0.3, xp: 7 });
def('magma_beetle', { name: 'Magma Beetle', hp: 8, speed: 0.9, size: [0.6, 0.45], drops: [['coal', 0, 1], ['brimstone', 0, 1, 0.25]], sounds: { idle: 'skitter', hurt: 'hiss', death: 'clatter' }, fireImmune: true, glow: 0.6, idleSound: 0.02 });
def('bog_wisp', { name: 'Bog Wisp', type: 'hostile', hp: 8, speed: 2.0, size: [0.4, 0.5], drops: [['glowdust', 1, 2]], sounds: { idle: 'whisper', hurt: 'shriek', death: 'wail' }, attack: { dmg: 3, reach: 1.4, cd: 1.6, poison: 0.6 }, fly: true, hover: 1.6, glow: 1.2, aura: { col: [0.6, 1, 0.5], rate: 6, glow: true }, xp: 5 });
def('dragonfly', { name: 'Dragonfly', type: 'ambient', hp: 1, speed: 4.5, size: [0.3, 0.15], drops: [], sounds: {}, fly: true, xp: 0 });
def('dolphin', { name: 'Dolphin', type: 'water', hp: 14, speed: 4.5, size: [0.8, 0.6], drops: [['raw_fish', 1, 2]], sounds: { idle: 'click', hurt: 'click', death: 'click' }, aquatic: true, idleSound: 0.2, playful: true, xp: 2 });
def('shark', { name: 'Shark', type: 'hostile', hp: 26, speed: 4.2, size: [1.0, 0.8], drops: [['raw_fish', 2, 4], ['bone', 1, 2]], sounds: {}, aquatic: true, attack: { dmg: 6, reach: 1.8, cd: 1.3 }, follow: 20, xp: 8 });
def('jellyfish', { name: 'Glow Jelly', type: 'water', hp: 4, speed: 0.6, size: [0.6, 0.7], drops: [['glowdust', 0, 1]], sounds: {}, aquatic: true, glow: 0.8, sting: 2, xp: 1 });
def('lanternfish', { name: 'Lanternfish', type: 'water', hp: 3, speed: 2.0, size: [0.4, 0.35], drops: [['raw_fish', 1, 1], ['glowdust', 0, 1, 0.3]], aquatic: true, glow: 0.4, xp: 1 });

VARIANTS.songbird = [['meadowlark', []], ['robin', [['#8a6a3a', '#5a4a3e'], ['#6a4a26', '#3e322a'], ['#f0d040', '#e06a3a']]], ['bluebird', [['#8a6a3a', '#3a6ac8'], ['#6a4a26', '#2a4a98'], ['#f0d040', '#e8a060']]]];
VARIANTS.parrot = [['scarlet', []], ['azure', [['#d82a22', '#2a7ae0'], ['#a81a16', '#1a5ab0'], ['#2a6ad8', '#f0c020']]], ['jade', [['#d82a22', '#2ab04a'], ['#a81a16', '#1a8034'], ['#2a6ad8', '#e83a2a']]]];

// ===================================================================== behaviour
// Birds walk and peck on the ground and burst into flight when startled, gliding down again further off.
class GroundBird extends Mob {
  brainAnimal(dt) {
    const g = this.game, p = g.player, def = this.def;
    const d = this.distTo(p.x, p.y, p.z);
    if (this.airT > 0) {
      this.airT -= dt;
      const fx = this.x - (this.fleeFrom ? this.fleeFrom.x : p.x), fz = this.z - (this.fleeFrom ? this.fleeFrom.z : p.z), l = Math.hypot(fx, fz) || 1;
      this.mx = fx / l; this.mz = fz / l; this.wantSpeed = def.runSpeed;
      return;
    }
    const scare = (p.sprinting ? 9 : p.sneaking ? 2.5 : 5) * (this.kind === 'owl' ? 0.7 : 1);
    if (!p.creative && d < scare && !this.heldFood(p)) { this.takeOff(p); return; }
    // owls sit quietly by day; at night they look around and call
    if (def.nocturnal && g.isDay && Math.random() > dt) { this.lookAt = d < 10 ? p : null; return; }
    if (this.fleeT > 0) { this.takeOff(this.fleeFrom || p); this.fleeT = 0; return; }
    if (Math.random() < dt * 0.25) this.grazeT = this.grazeMax = 0.6 + Math.random();   // peck
    super.brainAnimal(dt);
    if (this.kind !== 'owl' && this.wantSpeed > 0 && this.onGround && Math.random() < dt * 3) this.vy = 3.5;   // little hops
  }
  takeOff(from) {
    this.airT = rnd(1.6, 2.6); this.fleeFrom = from; this.vy = 7;
    this.game.audio.play('flutter', this);
  }
  physicsStep(dt, control) {
    if (this.airT > 0) {
      // flap upwards for a moment, then glide down
      this.vy += ((this.airT > 1 ? 4 : -1.2) - this.vy) * Math.min(1, dt * 3);
      this.flying = true;
      const r = moveEntity(this.game.world, this, this.vx * dt, this.vy * dt, this.vz * dt);
      if (r.hitX) this.vx = 0; if (r.hitZ) this.vz = 0;
      if (r.hitY) { this.onGround = this.vy < 0; this.vy = 0; } else this.onGround = false;
      return;
    }
    this.flying = !this.onGround && this.vy < -1;
    if (!this.onGround && this.vy < -2.5) this.vy = -2.5;   // flutter down, never plummet
    super.physicsStep(dt, control);
  }
}
for (const k of ['songbird', 'owl', 'parrot']) MOB_CLASSES[k] = GroundBird;

// Vultures and eagles circle high overhead on thermals.
class Soarer extends Mob {
  constructor(game, kind, x, y, z, opts) {
    super(game, kind, x, y, z, opts);
    const S = this.def.soar;
    this.center = [x, z]; this.r = rnd(S.r[0], S.r[1]); this.ang = Math.random() * 6.28; this.dir = Math.random() < 0.5 ? 1 : -1;
    this.alt = rnd(S.alt[0], S.alt[1]); this.flapT = 0; this.persistent = false;
  }
  brainBat(dt) {
    const g = this.game, def = this.def;
    this.ang += this.dir * dt * def.speed / this.r;
    if (Math.random() < dt * 0.02) { this.center = [this.center[0] + rnd(-20, 20), this.center[1] + rnd(-20, 20)]; }
    const tx = this.center[0] + Math.cos(this.ang) * this.r, tz = this.center[1] + Math.sin(this.ang) * this.r;
    const dx = tx - this.x, dz = tz - this.z, l = Math.hypot(dx, dz) || 1;
    this.mx = dx / l; this.mz = dz / l; this.wantSpeed = def.speed;
    const ground = g.mobs.groundAt(this.x, this.z);
    const want = (ground > 0 ? ground : this.y) + this.alt;
    this.vy += (want - this.y) * dt * 0.6;
    this.bank = -this.dir * 0.35;
    this.flapT -= dt;
    if (this.flapT < -rnd(6, 14)) this.flapT = 1.4;
  }
  hurt(a, src) { const r = super.hurt(a, src); this.alt += 6; this.r += 4; return r; }
}
MOB_CLASSES.vulture = Soarer; MOB_CLASSES.eagle = Soarer;

// Ridge lynxes: shy by day, dangerous if you wander close at night.
class Lynx extends Mob {
  brainAnimal(dt) {
    const g = this.game, p = g.player;
    const night = g.dayTime > 0.77 || g.dayTime < 0.23;
    if (night && !p.creative && !p.dead && this.distTo(p.x, p.y, p.z) < 9 && this.canSee(p)) { this.angryT = 20; this.target = p; }
    super.brainAnimal(dt);
  }
}
MOB_CLASSES.lynx = Lynx;

// Dolphins race about, leap clear of the water, and keep pace with boats.
class Dolphin extends Mob {
  brainFish(dt) {
    super.brainFish(dt);
    const g = this.game, p = g.player;
    if (!this.liquid || !this.liquid.inWater) return;
    const d = this.distTo(p.x, p.y, p.z);
    if (d < 20 && d > 4 && (p.riding && p.riding.type === 'boat' || (p.liquid && p.liquid.inWater))) {
      const dx = p.x - this.x, dz = p.z - this.z, l = Math.hypot(dx, dz) || 1;
      this.mx = dx / l; this.mz = dz / l; this.wantSpeed = this.def.speed * 1.2;
      this.vy += ((p.y - 1) - this.y) * dt;
    }
    // breach: near the surface and going fast, now and then
    const above = g.world.getBlock(Math.floor(this.x), Math.floor(this.y + 1.2), Math.floor(this.z));
    if (!IS_LIQUID[above] && Math.hypot(this.vx, this.vz) > 2 && Math.random() < dt * 0.15) { this.vy = 9; this.leapT = 1.2; g.audio.play('splash', this); }
  }
  update(dt) {
    super.update(dt);
    if (this.leapT > 0) { this.leapT -= dt; this.leap = -Math.max(-0.6, Math.min(0.6, this.vy * 0.08)); } else this.leap = 0;
  }
  physicsStep(dt, control) {
    if (this.leapT > 0 && !(this.liquid && this.liquid.inWater)) { this.vy -= 24 * dt; const r = moveEntity(this.game.world, this, this.vx * dt, this.vy * dt, this.vz * dt); if (r.hitY) this.vy = 0; return; }
    super.physicsStep(dt, control);
  }
}
MOB_CLASSES.dolphin = Dolphin;

// Sharks patrol deep water and close in on swimmers.
class Shark extends Mob {
  brainHostile(dt) {
    const g = this.game, p = g.player, def = this.def;
    const inW = (e) => e.liquid && e.liquid.inWater || IS_LIQUID[g.world.getBlock(Math.floor(e.x), Math.floor(e.y + 0.5), Math.floor(e.z))] === 1;
    const d = this.distTo(p.x, p.y, p.z);
    if (!p.creative && !p.dead && d < def.follow && inW(p) && !(p.riding && p.riding.type === 'boat')) {
      const dx = p.x - this.x, dz = p.z - this.z, l = Math.hypot(dx, dz) || 1;
      this.lookAt = p;
      // circle once or twice before closing in
      this.circleT = (this.circleT ?? rnd(2, 5)) - dt;
      const s = this.circleT > 0 ? 1 : 0;
      this.mx = dx / l * (1 - s * 0.7) - dz / l * s * 0.7; this.mz = dz / l * (1 - s * 0.7) + dx / l * s * 0.7;
      this.wantSpeed = def.speed * (s ? 0.7 : 1.2);
      this.vy += ((p.y + 0.3) - this.y) * dt * 2;
      if (d < def.attack.reach + 0.6 && this.attackCD <= 0) {
        this.attackCD = def.attack.cd; this.attackAnim = 1; this.circleT = rnd(2, 4);
        if (p.damage(def.attack.dmg, 'mob', false, this)) { p.knockX = dx / l * 4; p.knockZ = dz / l * 4; }
        g.audio.play('hit_blade', this);
      }
      return;
    }
    this.circleT = undefined;
    this.brainFish(dt);
  }
}
MOB_CLASSES.shark = Shark;

// Jellyfish drift and pulse; touching one stings.
class Jelly extends Mob {
  brainFish(dt) {
    this.mx = Math.sin(this.age * 0.2 + this.id) * 0.3; this.mz = Math.cos(this.age * 0.17 + this.id) * 0.3; this.wantSpeed = this.def.speed;
    this.vy += Math.max(0, Math.sin(this.age * 2.2 + this.id)) * dt * 2 - dt * 0.6;
    const p = this.game.player;
    this.stingCD = (this.stingCD || 0) - dt;
    if (this.stingCD <= 0 && !p.creative && Math.abs(p.x - this.x) < 0.8 && Math.abs(p.z - this.z) < 0.8 && p.y < this.y + 0.8 && p.y + 1.8 > this.y) {
      this.stingCD = 2;
      if (p.damage(this.def.sting, 'mob', false, this)) p.effects.poison = Math.max(p.effects.poison || 0, 3);
    }
  }
}
MOB_CLASSES.jellyfish = Jelly;

// Frostfang bites chill; Cinder Hound bites burn.
class Hound extends Mob {
  brainHostile(dt) {
    const before = this.game.player.health;
    super.brainHostile(dt);
    const p = this.game.player;
    if (p.health < before && this.target === p) {
      if (this.def.attack.chill) { p.effects.slow = Math.max(p.effects.slow || 0, 3); this.game.particles.sparkle(p.x, p.y + 1, p.z, [0.7, 0.9, 1], 8); }
      if (this.def.attack.burn && !p.effects.fireward) p.fireT = Math.max(p.fireT || 0, 3);
    }
  }
}
MOB_CLASSES.frostfang = Hound; MOB_CLASSES.cinder_hound = Hound;

// ===================================================================== where they live
const add = (T, biome, rows) => { T[biome] = (T[biome] || []).concat(rows); };
add(ANIMAL_SPAWNS, BIOME.PLAINS, [['deer', 3, 1, 3], ['songbird', 5, 2, 4]]);
add(ANIMAL_SPAWNS, BIOME.FOREST, [['songbird', 3, 1, 3]]);
add(ANIMAL_SPAWNS, BIOME.BIRCH_FOREST, [['songbird', 4, 2, 3]]);
add(ANIMAL_SPAWNS, BIOME.ANCIENT_FOREST, [['glimmerstag', 0.6, 1, 1], ['songbird', 2, 1, 2]]);
add(ANIMAL_SPAWNS, BIOME.TAIGA, [['snow_hare', 2, 1, 2]]);
ANIMAL_SPAWNS[BIOME.SNOWY_TAIGA] = [['arctic_fox', 5, 1, 3], ['wolf', 4, 2, 4], ['snow_hare', 4, 1, 3], ['snow_yak', 2, 2, 3]];
ANIMAL_SPAWNS[BIOME.TUNDRA] = [['snow_yak', 5, 2, 4], ['arctic_fox', 4, 1, 2], ['snow_hare', 4, 1, 3], ['wolf', 2, 2, 3]];
ANIMAL_SPAWNS[BIOME.MOUNTAINS] = [['goat', 7, 2, 4], ['sheep', 3, 2, 3], ['snow_yak', 1, 1, 2], ['lynx', 1, 1, 1]];
ANIMAL_SPAWNS[BIOME.SNOWY_PEAKS] = [['goat', 4, 1, 3], ['snow_yak', 2, 1, 2], ['lynx', 1, 1, 1]];
ANIMAL_SPAWNS[BIOME.DESERT] = [['lizard', 6, 1, 3], ['camel', 3, 1, 3], ['rabbit', 1, 1, 2]];
add(ANIMAL_SPAWNS, BIOME.BADLANDS, [['lizard', 4, 1, 2], ['goat', 2, 1, 3]]);
add(ANIMAL_SPAWNS, BIOME.SAVANNA, [['camel', 1, 1, 2], ['songbird', 2, 1, 3]]);
add(ANIMAL_SPAWNS, BIOME.JUNGLE, [['parrot', 6, 1, 3], ['tapir', 3, 1, 2]]);
add(ANIMAL_SPAWNS, BIOME.VOLCANIC, [['magma_beetle', 6, 1, 3]]);
// fewer scorpions: a desert night should feel tense, not crowded
NIGHT_SPAWNS[BIOME.DESERT] = [['dune_scorpion', 3, 1, 1], ['shambler', 7, 1, 2]];
NIGHT_SPAWNS[BIOME.BADLANDS] = [['dune_scorpion', 3, 1, 1], ['shambler', 6, 1, 2]];
delete DAY_SPAWNS[BIOME.DESERT];
add(NIGHT_SPAWNS, BIOME.SNOWY_TAIGA, [['frostfang', 4, 1, 2]]);
add(NIGHT_SPAWNS, BIOME.TUNDRA, [['frostfang', 4, 1, 2]]);
add(NIGHT_SPAWNS, BIOME.SWAMP, [['bog_wisp', 4, 1, 1]]);
add(NIGHT_SPAWNS, BIOME.VOLCANIC, [['cinder_hound', 6, 1, 2]]);

const SKY = { [BIOME.DESERT]: 'vulture', [BIOME.BADLANDS]: 'vulture', [BIOME.SAVANNA]: 'vulture', [BIOME.MOUNTAINS]: 'eagle', [BIOME.SNOWY_PEAKS]: 'eagle' };
const OWL_BIOMES = new Set([BIOME.FOREST, BIOME.BIRCH_FOREST, BIOME.ANCIENT_FOREST, BIOME.TAIGA, BIOME.SNOWY_TAIGA]);
const FIREFLY_BIOMES = new Set([BIOME.SWAMP, BIOME.PLAINS, BIOME.FOREST, BIOME.BIRCH_FOREST, BIOME.JUNGLE, BIOME.ANCIENT_FOREST]);
const SEA = new Set([BIOME.OCEAN, BIOME.DEEP_OCEAN, BIOME.BEACH]);

export function installWildlife(game) {
  let skyT = 8, owlT = 10, seaT = 5, flyT = 6;
  const count = (k, r) => { const p = game.player; let n = 0; for (const e of game.entities.list) if (e.kind === k && !e.dead && e.distTo(p.x, p.y, p.z) < r) n++; return n; };
  const spot = (minD, maxD) => { const p = game.player, a = Math.random() * Math.PI * 2, d = rnd(minD, maxD); return [p.x + Math.cos(a) * d, p.z + Math.sin(a) * d]; };
  const prevExt = game.extUpdate;
  game.extUpdate = (dt) => {
    prevExt && prevExt(dt);
    const p = game.player, w = game.world, M = game.mobs;
    if (!p || !M || p.dead) return;
    const night = game.dayTime > 0.78 || game.dayTime < 0.22;
    const here = w.biomeAt(p.x, p.z);
    // big birds circling overhead (by day)
    if ((skyT -= dt) <= 0) {
      skyT = 20;
      const kind = SKY[here];
      if (kind && !night && count(kind, 120) < 2 && Math.random() < 0.6) {
        const [x, z] = spot(30, 60);
        if (w.isLoaded(x, z)) { const gy = M.groundAt(x, z); if (gy > 0) M.spawn(kind, x, gy + 22, z); }
      }
    }
    // owls perched in the canopy at night
    if ((owlT -= dt) <= 0) {
      owlT = 15;
      if (night && OWL_BIOMES.has(here) && count('owl', 48) < 2 && Math.random() < 0.5) {
        for (let k = 0; k < 10; k++) {
          const [x, z] = spot(12, 32);
          if (!w.isLoaded(x, z)) continue;
          for (let y = Math.floor(p.y) + 16; y > p.y - 6; y--) {
            const id = w.getBlock(Math.floor(x), y, Math.floor(z));
            if (!id) continue;
            if (BLOCKS[id].name.endsWith('_leaves') && !w.getBlock(Math.floor(x), y + 1, Math.floor(z))) { M.spawn('owl', Math.floor(x) + 0.5, y + 1, Math.floor(z) + 0.5); k = 99; }
            break;
          }
        }
      }
    }
    // the sea: pods of dolphins, the odd shark in deep water, jellyfish and lanternfish in the dark
    if ((seaT -= dt) <= 0) {
      seaT = 6;
      const [x, z] = spot(14, 40);
      const b = w.isLoaded(x, z) ? w.biomeAt(x, z) : -1;
      if (SEA.has(b)) {
        const top = M.groundAt(x, z) - 1;
        if (IS_LIQUID[w.getBlock(Math.floor(x), top, Math.floor(z))] === 1) {
          let depth = 0; while (IS_LIQUID[w.getBlock(Math.floor(x), top - depth - 1, Math.floor(z))] === 1 && depth < 40) depth++;
          const deep = b === BIOME.DEEP_OCEAN || depth > 14;
          const r = Math.random();
          if (r < 0.35 && depth > 4 && count('dolphin', 64) < 4) for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) M.spawn('dolphin', x + rnd(-2, 2), top - 1.5, z + rnd(-2, 2));
          else if (r < 0.45 && deep && count('shark', 80) < 1) M.spawn('shark', x, top - Math.min(depth - 2, 6), z);
          else if (r < 0.7 && depth > 6 && count('jellyfish', 48) < 6) for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) M.spawn('jellyfish', x + rnd(-3, 3), top - rnd(2, Math.min(depth - 1, 12)), z + rnd(-3, 3));
          else if (deep && depth > 12 && count('lanternfish', 48) < 8) for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) M.spawn('lanternfish', x + rnd(-2, 2), top - depth + rnd(1, 5), z + rnd(-2, 2));
        }
      }
    }
    // dragonflies over swamp water by day
    if ((flyT -= dt) <= 0) {
      flyT = 8;
      if (!night && (here === BIOME.SWAMP || here === BIOME.RIVER) && count('dragonfly', 32) < 4) {
        const [x, z] = spot(6, 18);
        if (w.isLoaded(x, z)) { const gy = M.groundAt(x, z); if (gy > 0) M.spawn('dragonfly', x, gy + rnd(0.6, 2), z); }
      }
    }
    // fireflies on warm nights (particles only)
    if (night && FIREFLY_BIOMES.has(here) && game.weather.localRain < 0.2 && Math.random() < dt * (here === BIOME.SWAMP ? 9 : 4)) {
      const [x, z] = spot(2, 18);
      const gy = M.groundAt(x, z);
      if (gy > 0 && Math.abs(gy - p.y) < 10) {
        const y = gy + rnd(0.3, 2.2);
        game.particles.add({ x, y, z, vx: rnd(-0.3, 0.3), vy: rnd(-0.1, 0.2), vz: rnd(-0.3, 0.3), size: 0.045, size0: 0.045, r: 0.85, g: 1, b: 0.35, a: 1, a0: 1, fade: true, layer: -2, life: rnd(2.5, 5), drag: 0.6, grav: -0.05, emis: 6, add: true, blink: true });
      }
    }
  };
}
