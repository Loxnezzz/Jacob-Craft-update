// Phase 6 people: a detailed humanoid builder shared by villagers, wizards and the third-person player.
// Faces have eye whites + iris, brows, nose and mouth; several hairstyles, beards, hats, clothing layers and job props.
import { box, part, PAT } from './models.js';

function fin(m) {
  const idx = {};
  m.parts.forEach((p, i) => { idx[p.name] = i; });
  for (const p of m.parts) p.pi = p.parent ? idx[p.parent] : -1;
  m.index = idx;
  return m;
}
const mir = (bs) => bs.map(b => Object.assign({}, b, { o: [-(b.o[0] + b.s[0]), b.o[1], b.o[2]] }));

const HAIR = {
  short: (c, c2) => [box([-4.2, 6.2, -4.2], [8.4, 2.2, 8.4], c, PAT.fur, c2), box([-4.2, 3, 2.7], [8.4, 3.6, 1.6], c, PAT.fur, c2), box([-4.3, 4.4, -2.2], [0.5, 2.4, 4.8], c, PAT.fur, c2), box([3.8, 4.4, -2.2], [0.5, 2.4, 4.8], c, PAT.fur, c2), box([-3.9, 6.5, -4.45], [7.8, 1, 0.5], c, PAT.fur, c2)],
  messy: (c, c2) => HAIR.short(c, c2).concat([box([-2.6, 8.2, -2.4], [1.6, 1, 1.6], c, PAT.fur), box([0.6, 8.3, -0.6], [1.8, 1.1, 1.8], c, PAT.fur), box([-1, 8.2, 1.4], [1.6, 0.9, 1.6], c, PAT.fur), box([-3.4, 5.6, -4.5], [2.2, 1.2, 0.5], c, PAT.fur), box([1.4, 5.4, -4.5], [1.8, 1.4, 0.5], c, PAT.fur)]),
  long: (c, c2) => HAIR.short(c, c2).concat([box([-4.25, -2.5, 2.6], [8.5, 9, 1.9], c, PAT.fur, c2), box([-4.35, -1, -1.4], [0.7, 6.5, 3.6], c, PAT.fur), box([3.65, -1, -1.4], [0.7, 6.5, 3.6], c, PAT.fur)]),
  ponytail: (c, c2) => HAIR.short(c, c2).concat([box([-1, 1, 4.2], [2, 5.5, 1.6], c, PAT.fur, c2), box([-1.2, 5.6, 4], [2.4, 1, 1], '#a83a3a', PAT.flat)]),
  bun: (c, c2) => HAIR.short(c, c2).concat([box([-1.7, 6.6, 2.4], [3.4, 3, 3.2], c, PAT.fur, c2)]),
  bald: (c, c2) => [box([-4.3, 2.6, -0.8], [0.5, 3, 5], c, PAT.fur, c2), box([3.8, 2.6, -0.8], [0.5, 3, 5], c, PAT.fur, c2), box([-4.2, 2.6, 3.6], [8.4, 3, 0.7], c, PAT.fur, c2)],
  curly: (c, c2) => [box([-4.7, 5.4, -4.7], [9.4, 3.6, 9.4], c, PAT.fur, c2), box([-4.6, 1.6, 2.4], [9.2, 4.6, 2.3], c, PAT.fur, c2), box([-4.6, 3, -2.4], [0.8, 3, 5], c, PAT.fur), box([3.8, 3, -2.4], [0.8, 3, 5], c, PAT.fur)],
  braids: (c, c2) => HAIR.short(c, c2).concat([box([-4.4, -3.5, -1.2], [1.4, 8, 1.4], c, PAT.stripes, c2, 1), box([3, -3.5, -1.2], [1.4, 8, 1.4], c, PAT.stripes, c2, 1)]),
};
const BEARD = {
  full: (c) => [box([-3.2, -1.8, -4.45], [6.4, 3.6, 1.5], c, PAT.fur), box([-4.2, 0, -3.6], [0.6, 3.4, 3], c, PAT.fur), box([3.6, 0, -3.6], [0.6, 3.4, 3], c, PAT.fur), box([-2.2, 1.3, -4.35], [4.4, 0.8, 0.4], c, PAT.fur)],
  long: (c) => BEARD.full(c).concat([box([-2.4, -6, -4.5], [4.8, 4.4, 1.4], c, PAT.fur), box([-1.4, -8.5, -4.4], [2.8, 2.6, 1.2], c, PAT.fur)]),
  mustache: (c) => [box([-2.3, 1.5, -4.3], [4.6, 0.8, 0.45], c, PAT.fur), box([-2.6, 0.8, -4.3], [0.8, 1, 0.4], c, PAT.fur), box([1.8, 0.8, -4.3], [0.8, 1, 0.4], c, PAT.fur)],
  goatee: (c) => [box([-1.1, -1.2, -4.3], [2.2, 2.2, 0.6], c, PAT.fur), box([-1.8, 1.5, -4.3], [3.6, 0.7, 0.4], c, PAT.fur)],
  stubble: (c) => [box([-3, -0.2, -4.08], [6, 2, 0.1], c, PAT.noise)],
  trimmed: (c) => [box([-3.6, -0.6, -4.3], [7.2, 1.9, 0.9], c, PAT.fur), box([-4.08, -0.2, -3.6], [0.5, 3.2, 3.2], c, PAT.fur), box([3.58, -0.2, -3.6], [0.5, 3.2, 3.2], c, PAT.fur),
    box([-2.4, 1.35, -4.36], [4.8, 0.7, 0.45], c, PAT.fur), box([-1.6, -1.4, -4.25], [3.2, 0.9, 0.7], c, PAT.fur), box([-3.2, 0.9, -4.12], [0.8, 1.2, 0.2], c, PAT.fur), box([2.4, 0.9, -4.12], [0.8, 1.2, 0.2], c, PAT.fur)],
};

// o: { skin, skinDark, hair, hair2, hairStyle, beard, beardStyle, eye, shirt, shirt2, sleeve, pants, pants2, boots,
//      collar, belt, buckle, apron, vest, robe, robeTrim, scarf, cape, rolled, glasses, blush, earring, hat:[boxes],
//      handR:[boxes], back:[boxes], height (scale), wide (shoulder factor), stripe }
export function personModel(o) {
  const parts = [];
  const sk = o.skin, skd = o.skinDark || o.skin;
  const W = o.wide || 1;
  const pants = o.pants || '#3a3a46', pants2 = o.pants2 || pants, boots = o.boots || '#3a2a1e';
  const legBoxes = [
    box([-1.9, -11, -1.9], [3.8, 11.2, 3.8], pants, PAT.cloth, pants2, 0),
    box([-2.05, -11, -2.35], [4.1, 3.4, 4.55], boots, PAT.noise),
    box([-2.1, -11, -2.4], [4.2, 0.7, 4.6], '#1e1612', PAT.flat),
  ];
  if (o.kneePatch) legBoxes.push(box([-1.95, -6.8, -1.95], [1.8, 1.6, 0.1], o.kneePatch, PAT.cloth));
  parts.push(part('legL', null, [-2, 11, 0], legBoxes));
  parts.push(part('legR', null, [2, 11, 0], mir(legBoxes)));
  const tw = 8 * W;
  const body = [box([-tw / 2, 0, -2.2], [tw, 11, 4.4], o.shirt, PAT.cloth, o.shirt2 || o.shirt, o.stripe || 0)];
  body.push(box([-2.2, 9.6, -2.35], [4.4, 1.4, 0.3], o.collar || skd, PAT.flat));                 // collar / neckline
  if (o.coat) {
    const c = o.coat, c2 = o.coat2 || o.coat;
    body.push(box([-tw / 2 - 0.25, -5.5, -2.5], [tw * 0.34, 16.3, 5], c, PAT.cloth, c2), box([tw / 2 - tw * 0.34 + 0.25, -5.5, -2.5], [tw * 0.34, 16.3, 5], c, PAT.cloth, c2),
      box([-tw / 2 - 0.25, -5.5, 0.4], [tw + 0.5, 16.3, 2.15], c, PAT.cloth, c2),
      box([-tw / 2 - 0.35, 8.6, -2.65], [tw * 0.3, 2.6, 0.5], c2, PAT.cloth), box([tw / 2 - tw * 0.3 + 0.35, 8.6, -2.65], [tw * 0.3, 2.6, 0.5], c2, PAT.cloth),  // lapels
      box([-tw / 2 - 0.3, 10.2, -0.6], [tw + 0.6, 1.6, 3.2], c2, PAT.cloth),                                     // turned-up collar
      box([-tw / 2 - 0.3, -1.2, -2.6], [1.6, 2.2, 0.3], c2, PAT.cloth), box([tw / 2 - 1.3, -1.2, -2.6], [1.6, 2.2, 0.3], c2, PAT.cloth)); // pocket flaps
  }
  if (o.strap) body.push(box([1.4, 1.2, -2.48], [1, 9.4, 0.25], o.strap, PAT.noise), box([-1.6, 1.2, 2.2], [1, 9.4, 0.25], o.strap, PAT.noise));
  if (o.satchel) body.push(box([-tw / 2 - 1.4, -3, -1.6], [1.6, 3.6, 3.4], o.satchel, PAT.noise), box([-tw / 2 - 1.5, -0.2, -1.7], [1.7, 0.8, 3.6], o.strap || o.satchel, PAT.noise));
  if (o.vest) body.push(box([-tw / 2 - 0.15, 1.2, -2.4], [tw * 0.36, 9.6, 4.8], o.vest, PAT.cloth), box([tw / 2 - tw * 0.36 + 0.15, 1.2, -2.4], [tw * 0.36, 9.6, 4.8], o.vest, PAT.cloth), box([-tw / 2 - 0.15, 1.2, 0.6], [tw + 0.3, 9.6, 1.9], o.vest, PAT.cloth));
  if (o.apron) body.push(box([-3.3, -7, -2.55], [6.6, 15, 0.4], o.apron, PAT.cloth), box([-1.4, 6.8, -2.6], [2.8, 2.4, 0.2], o.apronPocket || o.apron, PAT.flat));
  if (o.belt) body.push(box([-tw / 2 - 0.1, 0.4, -2.3], [tw + 0.2, 1.4, 4.6], o.belt, PAT.noise), box([-0.7, 0.3, -2.45], [1.4, 1.6, 0.2], o.buckle || '#d8b040', PAT.metal));
  if (o.pouch) body.push(box([2, -1.6, -2.6], [1.8, 2.2, 1.2], o.pouch, PAT.noise));
  if (o.scarf) body.push(box([-4.4, 9.4, -2.7], [8.8, 2.1, 5.4], o.scarf, PAT.cloth, o.scarf2 || o.scarf, 2), box([-3.2, 4.4, -2.85], [1.8, 5.2, 0.4], o.scarf, PAT.cloth));
  if (o.robe) body.push(box([-tw / 2 - 0.4, -8.5, -2.6], [tw + 0.8, 9, 5.2], o.robe, PAT.cloth, o.robeTrim || o.robe, 3), box([-tw / 2 - 0.45, -8.6, -2.65], [tw + 0.9, 1, 5.3], o.robeTrim || o.robe, PAT.flat));
  if (o.back) body.push(...o.back);
  if (o.cape) body.push(box([-tw / 2, -9, 2.2], [tw, 19, 0.6], o.cape, PAT.cloth, o.capeTrim || o.cape, 2));
  parts.push(part('body', null, [0, 11, 0], body));
  // arms
  const sleeve = o.sleeve || o.shirt;
  const armBoxes = [
    box([-1.5, -6.5, -1.6], [3, 7.6, 3.2], sleeve, PAT.cloth, o.shirt2 || sleeve, 0),
    box([-1.45, -10, -1.55], [2.9, 3.6, 3.1], o.rolled ? sk : sleeve, o.rolled ? PAT.noise : PAT.cloth, o.rolled ? skd : sleeve, 0),
    box([-1.55, -6.8, -1.65], [3.1, 0.7, 3.3], o.cuff || o.shirt2 || sleeve, PAT.flat),
    box([-1.5, -12.2, -1.6], [3, 2.4, 3.2], sk, PAT.noise, skd),
  ];
  if (o.gloves) armBoxes.push(box([-1.58, -11.6, -1.68], [3.16, 1.9, 3.36], o.gloves, PAT.noise), box([-1.6, -10.2, -1.7], [3.2, 0.8, 3.4], o.gloves2 || o.gloves, PAT.flat));
  parts.push(part('armL', 'body', [-tw / 2 - 1.5, 21, 0], mir(armBoxes)));
  parts.push(part('armR', 'body', [tw / 2 + 1.5, 21, 0], armBoxes.concat(o.handR || [])));
  // head & face
  const eye = o.eye || '#3a5a8a';
  const face = [
    box([-4, 0, -4], [8, 8, 8], sk, PAT.noise, skd),
    ...(o.eyeStyle === 'narrow' ? [
      box([-3.1, 3.2, -4.06], [2, 0.9, 0.1], '#e8e2d6', PAT.flat), box([1.1, 3.2, -4.06], [2, 0.9, 0.1], '#e8e2d6', PAT.flat),
      box([-2.2, 3.2, -4.1], [1.1, 0.9, 0.1], eye, PAT.flat), box([1.1, 3.2, -4.1], [1.1, 0.9, 0.1], eye, PAT.flat),
      box([-1.95, 3.4, -4.13], [0.5, 0.5, 0.05], '#0e0c0a', PAT.flat), box([1.45, 3.4, -4.13], [0.5, 0.5, 0.05], '#0e0c0a', PAT.flat),
      box([-3.3, 4.1, -4.12], [2.4, 0.4, 0.14], skd, PAT.flat), box([0.9, 4.1, -4.12], [2.4, 0.4, 0.14], skd, PAT.flat),            // heavy lids
      box([-3.5, 4.5, -4.18], [2.7, 0.8, 0.2], o.brow || o.hair || '#3a2418', PAT.flat), box([0.8, 4.5, -4.18], [2.7, 0.8, 0.2], o.brow || o.hair || '#3a2418', PAT.flat),
      box([-3.2, 2.6, -4.07], [2, 0.3, 0.06], skd, PAT.flat), box([1.2, 2.6, -4.07], [2, 0.3, 0.06], skd, PAT.flat),             // tired creases
      box([-4.03, 3.3, -3.4], [0.08, 0.3, 0.9], skd, PAT.flat), box([3.95, 3.3, -3.4], [0.08, 0.3, 0.9], skd, PAT.flat),        // crow's feet
      box([-3.6, 1.6, -4.07], [1.4, 0.8, 0.08], skd, PAT.flat), box([2.2, 1.6, -4.07], [1.4, 0.8, 0.08], skd, PAT.flat),       // cheekbone shadow
    ] : [
      box([-3.1, 3.1, -4.06], [2, 1.4, 0.1], '#f4f2ec', PAT.flat), box([1.1, 3.1, -4.06], [2, 1.4, 0.1], '#f4f2ec', PAT.flat),
      box([-2.15, 3.1, -4.1], [1, 1.4, 0.1], eye, PAT.flat), box([1.15, 3.1, -4.1], [1, 1.4, 0.1], eye, PAT.flat),
      box([-1.85, 3.55, -4.13], [0.4, 0.5, 0.05], '#101010', PAT.flat), box([1.45, 3.55, -4.13], [0.4, 0.5, 0.05], '#101010', PAT.flat),
      box([-3.3, 4.75, -4.1], [2.4, 0.6, 0.12], o.brow || o.hair || '#3a2418', PAT.flat), box([0.9, 4.75, -4.1], [2.4, 0.6, 0.12], o.brow || o.hair || '#3a2418', PAT.flat),
    ]),
    box([-0.75, 1.9, -4.6], [1.5, 1.9, 0.6], skd, PAT.noise),
    box([-1.4, 0.85, -4.06], [2.8, 0.5, 0.1], o.lip || '#8a4a44', PAT.flat),
    box([-4.06, 2.4, -1.2], [0.1, 2, 1.4], skd, PAT.flat), box([3.96, 2.4, -1.2], [0.1, 2, 1.4], skd, PAT.flat),   // ears
  ];
  if (o.blush) face.push(box([-3.5, 1.9, -4.05], [1.2, 0.8, 0.1], o.blush, PAT.flat), box([2.3, 1.9, -4.05], [1.2, 0.8, 0.1], o.blush, PAT.flat));
  if (o.freckles) face.push(box([-3, 2.4, -4.07], [0.4, 0.4, 0.05], o.freckles, PAT.flat), box([-2.3, 2.1, -4.07], [0.4, 0.4, 0.05], o.freckles, PAT.flat), box([2, 2.3, -4.07], [0.4, 0.4, 0.05], o.freckles, PAT.flat), box([2.7, 2.0, -4.07], [0.4, 0.4, 0.05], o.freckles, PAT.flat));
  if (o.glasses) face.push(box([-3.4, 2.8, -4.3], [2.6, 0.3, 0.2], o.glasses, PAT.metal), box([0.8, 2.8, -4.3], [2.6, 0.3, 0.2], o.glasses, PAT.metal), box([-3.4, 4.5, -4.3], [2.6, 0.3, 0.2], o.glasses, PAT.metal), box([0.8, 4.5, -4.3], [2.6, 0.3, 0.2], o.glasses, PAT.metal), box([-0.8, 3.8, -4.3], [1.6, 0.3, 0.2], o.glasses, PAT.metal), box([-3.6, 2.8, -4.3], [0.3, 2, 0.2], o.glasses, PAT.metal), box([3.3, 2.8, -4.3], [0.3, 2, 0.2], o.glasses, PAT.metal));
  if (o.scar) face.push(box([0.95, 2.2, -4.16], [0.3, 3.4, 0.08], o.scar, PAT.flat), box([1.25, 2.0, -4.16], [0.3, 0.6, 0.08], o.scar, PAT.flat));
  if (o.temples) face.push(box([-4.32, 3.2, -1.6], [0.5, 2.4, 3.4], o.temples, PAT.fur), box([3.82, 3.2, -1.6], [0.5, 2.4, 3.4], o.temples, PAT.fur));
  if (o.earring) face.push(box([-4.25, 1.6, -0.8], [0.3, 0.7, 0.4], o.earring, PAT.metal), box([3.95, 1.6, -0.8], [0.3, 0.7, 0.4], o.earring, PAT.metal));
  const hairFn = HAIR[o.hairStyle] || HAIR.short;
  const headBoxes = face.concat(o.hairStyle === 'none' ? [] : hairFn(o.hair, o.hair2 || o.hair));
  if (o.beardStyle && o.beard) headBoxes.push(...(BEARD[o.beardStyle] || BEARD.full)(o.beard));
  if (o.hat) headBoxes.push(...o.hat);
  // a smaller head reads as an adult rather than a child (scaled about the neck)
  const hs = o.headScale || 1;
  const head = hs === 1 ? headBoxes : headBoxes.map(b => Object.assign({}, b, { o: b.o.map(v => v * hs), s: b.s.map(v => v * hs) }));
  parts.push(part('head', 'body', [0, 22, 0], head));
  return fin({ parts, anim: o.anim || 'person', height: 31, hand: [tw / 2 + 1.5, 9.5, -0.2] });
}
