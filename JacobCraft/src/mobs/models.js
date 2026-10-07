// Box-model definitions for creatures. Units are pixels (1/16 block). Model faces -Z.
// A part rotates around its pivot; box offsets are relative to the pivot.

export const PAT = { noise: 0, fur: 1, spots: 2, stripes: 3, belly: 4, rock: 5, moss: 6, cloth: 7, metal: 8, bark: 9, scales: 10, lava: 11, ice: 12, glow: 13, feathers: 14, flat: 15 };

function C(h) { const v = parseInt(h.slice(1), 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; }
export function box(o, s, c, p = 0, c2 = null, pa = 0, e = 0) { return { o, s, c: C(c), p, c2: C(c2 || c), pa, e }; }
export function part(name, parent, pivot, boxes, extra = {}) { return Object.assign({ name, parent, pivot, boxes }, extra); }

export function finalize(m) {
  const idx = {};
  m.parts.forEach((p, i) => { idx[p.name] = i; });
  for (const p of m.parts) p.pi = p.parent ? idx[p.parent] : -1;
  m.index = idx;
  return m;
}

// ---------------------------------------------------------------- generic quadruped
export function quadruped(o) {
  const { bw, bh, bl, legH, legW, hw, hh, hl } = o;
  const col = o.colors;
  const parts = [];
  const bodyY = legH + bh / 2;
  parts.push(part('body', null, [0, bodyY, 0], [box([-bw / 2, -bh / 2, -bl / 2], [bw, bh, bl], col.body, o.pat ?? PAT.fur, col.body2 || col.body, o.patParam || 2)].concat(o.bodyExtra || [])));
  const hipX = bw / 2 - legW / 2 - (o.legInset || 0);
  const front = -bl / 2 + legW / 2 + (o.legEnd || 1), back = bl / 2 - legW / 2 - (o.legEnd || 1);
  const legs = [['legFL', -hipX, front], ['legFR', hipX, front], ['legBL', -hipX, back], ['legBR', hipX, back]];
  for (const [n, x, z] of legs) {
    const bx = [box([-legW / 2, -legH, -legW / 2], [legW, legH, legW], col.leg || col.body, o.legPat ?? PAT.fur, col.leg2 || col.leg || col.body, 2)];
    if (col.hoof) bx.push(box([-legW / 2 - 0.1, -legH - 0.01, -legW / 2 - 0.1], [legW + 0.2, Math.min(2, legH * 0.25), legW + 0.2], col.hoof, PAT.noise));
    parts.push(part(n, null, [x, legH, z], bx));
  }
  const neckY = bodyY + bh * (o.headUp ?? 0.25);
  const hb = [box([-hw / 2, -hh / 2, -hl], [hw, hh, hl], col.head || col.body, o.headPat ?? PAT.fur, col.head2 || col.head || col.body, 2)].concat(o.headExtra || []);
  // eyes
  const ey = o.eyeY ?? hh * 0.12, ez = -hl + (o.eyeZ ?? 1.5);
  const eyeW = o.eyeW || 1;
  hb.push(box([-hw / 2 - 0.05, ey, ez], [0.1 + eyeW * 0, 1, eyeW], col.eye || '#141414', o.eyeGlow ? PAT.glow : PAT.flat));
  hb.push(box([hw / 2 - 0.05, ey, ez], [0.1, 1, eyeW], col.eye || '#141414', o.eyeGlow ? PAT.glow : PAT.flat));
  if (o.eyesFront) {
    hb.push(box([-hw / 2 + 1, ey, -hl - 0.05], [1.2, 1, 0.1], col.eye || '#141414', o.eyeGlow ? PAT.glow : PAT.flat));
    hb.push(box([hw / 2 - 2.2, ey, -hl - 0.05], [1.2, 1, 0.1], col.eye || '#141414', o.eyeGlow ? PAT.glow : PAT.flat));
  }
  parts.push(part('head', o.headOnBody ? 'body' : null, [0, neckY, -bl / 2 + (o.headInset || 0)], hb));
  if (o.tail) parts.push(part('tail', 'body', [0, bodyY + bh / 2 - (o.tail.drop || 1), bl / 2], o.tail.boxes));
  if (o.extraParts) parts.push(...o.extraParts);
  return finalize({ parts, anim: o.anim || 'quad', height: legH + bh + (o.extraH || 4) });
}

// ---------------------------------------------------------------- generic biped / humanoid
export function humanoid(o) {
  const { legH, legW, tw, th, td, aw, ah, hw, hh, hd } = o;
  const col = o.colors;
  const parts = [];
  parts.push(part('legL', null, [-tw / 4, legH, 0], [box([-legW / 2, -legH, -legW / 2], [legW, legH, legW], col.leg, o.legPat ?? PAT.cloth, col.leg2 || col.leg, 0)].concat(col.foot ? [box([-legW / 2 - 0.1, -legH, -legW / 2 - 0.6], [legW + 0.2, 1.5, legW + 0.8], col.foot, PAT.noise)] : [])));
  parts.push(part('legR', null, [tw / 4, legH, 0], [box([-legW / 2, -legH, -legW / 2], [legW, legH, legW], col.leg, o.legPat ?? PAT.cloth, col.leg2 || col.leg, 0)].concat(col.foot ? [box([-legW / 2 - 0.1, -legH, -legW / 2 - 0.6], [legW + 0.2, 1.5, legW + 0.8], col.foot, PAT.noise)] : [])));
  parts.push(part('body', null, [0, legH, 0], [box([-tw / 2, 0, -td / 2], [tw, th, td], col.body, o.bodyPat ?? PAT.cloth, col.body2 || col.body, o.bodyParam || 0)].concat(o.bodyExtra || [])));
  const sh = legH + th - 1;
  parts.push(part('armL', 'body', [-tw / 2 - aw / 2, sh, 0], [box([-aw / 2, -ah + 1, -aw / 2], [aw, ah, aw], col.arm || col.body, o.armPat ?? PAT.cloth, col.arm2 || col.arm || col.body, 0)].concat(o.handL || [])));
  parts.push(part('armR', 'body', [tw / 2 + aw / 2, sh, 0], [box([-aw / 2, -ah + 1, -aw / 2], [aw, ah, aw], col.arm || col.body, o.armPat ?? PAT.cloth, col.arm2 || col.arm || col.body, 0)].concat(o.handR || [])));
  const hb = [box([-hw / 2, 0, -hd / 2], [hw, hh, hd], col.head, o.headPat ?? PAT.noise, col.head2 || col.head, o.headParam || 0)];
  const ey = o.eyeY ?? hh * 0.45;
  hb.push(box([-hw / 2 + 1, ey, -hd / 2 - 0.05], [o.eyeW || 1.5, o.eyeH || 1, 0.1], col.eye || '#202020', o.eyeGlow ? PAT.glow : PAT.flat));
  hb.push(box([hw / 2 - 1 - (o.eyeW || 1.5), ey, -hd / 2 - 0.05], [o.eyeW || 1.5, o.eyeH || 1, 0.1], col.eye || '#202020', o.eyeGlow ? PAT.glow : PAT.flat));
  parts.push(part('head', 'body', [0, legH + th, 0], hb.concat(o.headExtra || [])));
  if (o.extraParts) parts.push(...o.extraParts);
  return finalize({ parts, anim: o.anim || 'biped', height: legH + th + hh });
}

// ---------------------------------------------------------------- bird
export function bird(o) {
  const col = o.colors;
  const parts = [];
  const legH = o.legH;
  parts.push(part('legL', null, [-1.5, legH, 0], [box([-0.5, -legH, -0.5], [1, legH, 1], col.leg, PAT.flat), box([-1, -legH, -2], [2, 0.6, 2.5], col.leg, PAT.flat)]));
  parts.push(part('legR', null, [1.5, legH, 0], [box([-0.5, -legH, -0.5], [1, legH, 1], col.leg, PAT.flat), box([-1, -legH, -2], [2, 0.6, 2.5], col.leg, PAT.flat)]));
  const [bw, bh, bl] = o.body;
  parts.push(part('body', null, [0, legH + bh / 2, 0], [box([-bw / 2, -bh / 2, -bl / 2], [bw, bh, bl], col.body, PAT.feathers, col.body2 || col.body)].concat(o.bodyExtra || [])));
  const [hw, hh, hl] = o.head;
  const hb = [box([-hw / 2, 0, -hl / 2], [hw, hh, hl], col.head || col.body, PAT.feathers, col.head2 || col.head || col.body)];
  hb.push(box([-o.beak[0] / 2, hh * 0.35, -hl / 2 - o.beak[2]], o.beak, col.beak, PAT.noise, col.beak2 || col.beak));
  hb.push(box([-hw / 2 - 0.05, hh * 0.6, -hl / 2 + 0.6], [0.1, 1, 1], '#101010', PAT.flat));
  hb.push(box([hw / 2 - 0.05, hh * 0.6, -hl / 2 + 0.6], [0.1, 1, 1], '#101010', PAT.flat));
  if (col.wattle) hb.push(box([-0.75, hh * 0.1, -hl / 2 - 1], [1.5, 2, 1], col.wattle, PAT.flat));
  parts.push(part('head', 'body', [0, legH + bh * (o.headUp ?? 0.7), -bl / 2 + (o.headInset ?? 1.5)], hb.concat(o.headExtra || [])));
  parts.push(part('wingL', 'body', [-bw / 2, legH + bh * 0.8, 0], [box([-1, -bh * 0.75, -bl / 2 + 1], [1, bh * 0.75, bl - 2], col.wing || col.body, PAT.feathers, col.wing2 || col.body)]));
  parts.push(part('wingR', 'body', [bw / 2, legH + bh * 0.8, 0], [box([0, -bh * 0.75, -bl / 2 + 1], [1, bh * 0.75, bl - 2], col.wing || col.body, PAT.feathers, col.wing2 || col.body)]));
  if (o.tail) parts.push(part('tail', 'body', [0, legH + bh * 0.6, bl / 2], o.tail));
  return finalize({ parts, anim: o.anim || 'bird', height: legH + bh + hh });
}

// ======================================================================= animals
export const MODELS = {};

MODELS.cow = quadruped({
  bw: 12, bh: 10, bl: 18, legH: 11, legW: 4, hw: 8, hh: 8, hl: 7, headUp: 0.35,
  colors: { body: '#5c3e28', body2: '#efe8dc', leg: '#5c3e28', leg2: '#efe8dc', hoof: '#2a2420', head: '#5c3e28', head2: '#efe8dc' },
  pat: PAT.spots, patParam: 3, legPat: PAT.spots, headPat: PAT.spots,
  headExtra: [box([-3, -3.5, -8], [6, 4, 2], '#d8a0a0', PAT.noise), box([-5.5, 2.5, -5], [2, 1.5, 1.5], '#e8e0cc', PAT.noise), box([3.5, 2.5, -5], [2, 1.5, 1.5], '#e8e0cc', PAT.noise), box([-6, 3.4, -5], [1, 2, 1], '#e8e0cc'), box([5, 3.4, -5], [1, 2, 1], '#e8e0cc'), box([-5, 1, -3], [1.5, 1, 2], '#4a3020'), box([3.5, 1, -3], [1.5, 1, 2], '#4a3020')],
  bodyExtra: [box([-2.5, -6.5, 3], [5, 2, 4], '#e0a4a8', PAT.noise)],
  tail: { boxes: [box([-0.75, -9, 0], [1.5, 9, 1.5], '#5c3e28', PAT.fur), box([-1, -11, -0.25], [2, 2.5, 2], '#2a2018', PAT.fur)] },
});

MODELS.pig = quadruped({
  bw: 10, bh: 8, bl: 14, legH: 5, legW: 4, hw: 8, hh: 7, hl: 7, headUp: 0.15,
  colors: { body: '#e8a3a2', body2: '#d88a8c', leg: '#d89092', head: '#e8a3a2', hoof: '#8a5a50' },
  pat: PAT.noise, headPat: PAT.noise, legPat: PAT.noise,
  headExtra: [box([-2, -2.5, -8.2], [4, 3, 1.2], '#f0b2b4', PAT.noise), box([-1.2, -1.5, -8.3], [0.8, 0.8, 0.1], '#7a3a3a', PAT.flat), box([0.4, -1.5, -8.3], [0.8, 0.8, 0.1], '#7a3a3a', PAT.flat), box([-4.5, 2.5, -4], [2, 2.5, 1], '#d88a8c', PAT.noise), box([2.5, 2.5, -4], [2, 2.5, 1], '#d88a8c', PAT.noise)],
  tail: { boxes: [box([-0.5, -1, 0], [1, 1, 2], '#d88a8c', PAT.noise), box([-0.5, 0, 1.5], [1, 1.5, 1], '#d88a8c', PAT.noise)] },
});

MODELS.boar = quadruped({
  bw: 10, bh: 9, bl: 15, legH: 5, legW: 4, hw: 8, hh: 7, hl: 8, headUp: 0.1,
  colors: { body: '#4a3424', body2: '#2e2018', leg: '#3a2a1e', head: '#4a3424', head2: '#2e2018', hoof: '#1e1612' },
  pat: PAT.fur, headPat: PAT.fur,
  bodyExtra: [box([-1.5, 4, -7], [3, 2, 12], '#2a1c12', PAT.fur)],
  headExtra: [box([-2.5, -2.5, -9.2], [5, 3, 1.2], '#7a5a4a', PAT.noise), box([-3.5, -2.5, -8.6], [1, 3.5, 1], '#ece4d0', PAT.noise), box([2.5, -2.5, -8.6], [1, 3.5, 1], '#ece4d0', PAT.noise), box([-4.5, 2.5, -4], [2, 2.5, 1], '#3a2a1e'), box([2.5, 2.5, -4], [2, 2.5, 1], '#3a2a1e')],
  tail: { boxes: [box([-0.5, -3, 0], [1, 3, 1], '#2a1c12')] },
});

MODELS.sheep = quadruped({
  bw: 12, bh: 10, bl: 16, legH: 9, legW: 3, hw: 6, hh: 7, hl: 7, headUp: 0.4, legInset: 1,
  colors: { body: '#efe9df', body2: '#d8d0c4', leg: '#3a3430', head: '#3a3430', hoof: '#1e1a18' },
  pat: PAT.fur, headPat: PAT.noise, legPat: PAT.noise,
  bodyExtra: [],
  headExtra: [box([-3.5, 3, -5.5], [7, 3, 5], '#efe9df', PAT.fur, '#d8d0c4'), box([-5, 2, -3.5], [2, 1.5, 2.5], '#3a3430'), box([3, 2, -3.5], [2, 1.5, 2.5], '#3a3430')],
  tail: { boxes: [box([-1.5, -3, 0], [3, 3, 2], '#efe9df', PAT.fur)] },
});

MODELS.horse = quadruped({
  bw: 10, bh: 10, bl: 22, legH: 15, legW: 4, hw: 6, hh: 6, hl: 11, headUp: 0.6, headInset: 2,
  colors: { body: '#7a4a26', body2: '#5a3418', leg: '#7a4a26', leg2: '#3a2414', hoof: '#2a201a', head: '#7a4a26' },
  pat: PAT.fur, headPat: PAT.fur,
  extraParts: [],
  headExtra: [box([-2, 6, -4], [4, 10, 6], '#7a4a26', PAT.fur), box([-1, 6, 0.5], [2, 12, 3], '#2e1e12', PAT.fur), box([-2.5, 5.5, -11.5], [5, 1, 2], '#2e1e12'), box([-2.8, 1, -11], [0.1, 1, 1], '#101010'), box([2.7, 1, -11], [0.1, 1, 1], '#101010'), box([-2.5, 5, -2], [1.5, 3, 1], '#7a4a26'), box([1, 5, -2], [1.5, 3, 1], '#7a4a26')],
  tail: { drop: 2, boxes: [box([-1.5, -12, 0], [3, 13, 3], '#2e1e12', PAT.fur)] },
  eyeY: 0.5, eyeZ: 2,
});

MODELS.deer = quadruped({
  bw: 9, bh: 9, bl: 16, legH: 14, legW: 3, hw: 5, hh: 5, hl: 8, headUp: 0.7, headInset: 1,
  colors: { body: '#9a6a3e', body2: '#e8d8b8', leg: '#8a5e36', hoof: '#2a201a', head: '#9a6a3e', head2: '#e8d8b8' },
  pat: PAT.belly, headPat: PAT.fur, legPat: PAT.fur,
  headExtra: [box([-1.5, 3, -2], [3, 7, 4], '#9a6a3e', PAT.fur), box([-1.5, -1, -9], [3, 2, 2], '#2a2018'), box([-3.5, 4, -1], [2, 1.5, 1], '#9a6a3e'), box([1.5, 4, -1], [2, 1.5, 1], '#9a6a3e'),
    box([-2.5, 5, -2], [1, 6, 1], '#d8c8a8', PAT.bark), box([1.5, 5, -2], [1, 6, 1], '#d8c8a8', PAT.bark), box([-5, 9, -2], [3, 1, 1], '#d8c8a8'), box([2, 9, -2], [3, 1, 1], '#d8c8a8'), box([-4.5, 10, -2], [1, 3, 1], '#d8c8a8'), box([3.5, 10, -2], [1, 3, 1], '#d8c8a8'), box([-2.5, 11, -2], [1, 3, 1], '#d8c8a8'), box([1.5, 11, -2], [1, 3, 1], '#d8c8a8')],
  tail: { boxes: [box([-1, -2, 0], [2, 3, 1], '#f4ece0')] },
});

MODELS.wolf = quadruped({
  bw: 8, bh: 7, bl: 13, legH: 8, legW: 3, hw: 6, hh: 6, hl: 5, headUp: 0.5, headInset: 0,
  colors: { body: '#8c8c8a', body2: '#d8d6d0', leg: '#8c8c8a', head: '#8c8c8a', head2: '#d8d6d0' },
  pat: PAT.belly, headPat: PAT.fur,
  bodyExtra: [box([-5, -3.5, -7], [10, 8, 6], '#7c7c7a', PAT.fur)],
  headExtra: [box([-1.5, -2, -8.5], [3, 3, 4], '#a8a6a0', PAT.fur), box([-0.75, 0, -8.7], [1.5, 1, 0.3], '#1a1a1a', PAT.flat), box([-3, 3, -2], [2, 3, 1], '#7c7c7a', PAT.fur), box([1, 3, -2], [2, 3, 1], '#7c7c7a', PAT.fur)],
  tail: { boxes: [box([-1, -8, 0], [2, 8, 2], '#7c7c7a', PAT.fur, '#e8e6e0')] },
  eyeY: 0.8, eyeZ: 1,
});

MODELS.cat = quadruped({
  bw: 5, bh: 5, bl: 11, legH: 5, legW: 2, hw: 5, hh: 4, hl: 4, headUp: 0.6,
  colors: { body: '#d8892e', body2: '#a85a1a', leg: '#d8892e', head: '#d8892e', head2: '#a85a1a', eye: '#3ac83a' },
  pat: PAT.stripes, patParam: 3, headPat: PAT.stripes, legPat: PAT.fur,
  headExtra: [box([-1, -1.5, -5], [2, 1.5, 1], '#f0c08a'), box([-2.5, 4, -2], [1.5, 2, 1], '#d8892e'), box([1, 4, -2], [1.5, 2, 1], '#d8892e')],
  tail: { boxes: [box([-0.5, 0, 0], [1, 1, 9], '#d8892e', PAT.stripes, '#a85a1a', 3)] },
  eyeY: 0.5, eyeZ: 0.6,
});

MODELS.arctic_fox = quadruped({
  bw: 6, bh: 5, bl: 11, legH: 5, legW: 2, hw: 6, hh: 5, hl: 4, headUp: 0.5,
  colors: { body: '#f2f2f0', body2: '#d8dce4', leg: '#e8e8e6', head: '#f2f2f0' },
  pat: PAT.fur, headPat: PAT.fur,
  headExtra: [box([-1.5, -1.5, -7], [3, 2.5, 3], '#ffffff', PAT.fur), box([-0.6, -0.5, -7.1], [1.2, 1, 0.2], '#1a1a1a', PAT.flat), box([-3, 3.5, -1.5], [2, 2.5, 1], '#e8e8e6'), box([1, 3.5, -1.5], [2, 2.5, 1], '#e8e8e6')],
  tail: { boxes: [box([-2, -2, 0], [4, 4, 9], '#ffffff', PAT.fur, '#d8dce4')] },
});

MODELS.snow_yak = quadruped({
  bw: 15, bh: 13, bl: 21, legH: 9, legW: 5, hw: 9, hh: 9, hl: 8, headUp: 0.1,
  colors: { body: '#4a3a2e', body2: '#6a5646', leg: '#3a2c22', hoof: '#1a1410', head: '#3a2c22' },
  pat: PAT.fur, headPat: PAT.fur,
  bodyExtra: [box([-8, -9, -11], [16, 6, 22], '#4a3a2e', PAT.fur, '#5a4838'), box([-5, 5, -9], [10, 4, 9], '#4a3a2e', PAT.fur)],
  headExtra: [box([-6.5, 2, -5], [3, 2, 2], '#e0d8c4'), box([3.5, 2, -5], [3, 2, 2], '#e0d8c4'), box([-7.5, 3, -5], [1.5, 4, 2], '#e0d8c4'), box([6, 3, -5], [1.5, 4, 2], '#e0d8c4'), box([-4.5, -6, -8], [9, 4, 7], '#4a3a2e', PAT.fur)],
  tail: { boxes: [box([-1.5, -8, 0], [3, 8, 2], '#3a2c22', PAT.fur)] },
});

MODELS.capybara = quadruped({
  bw: 10, bh: 8, bl: 14, legH: 4, legW: 3, hw: 6, hh: 6, hl: 8, headUp: 0.2,
  colors: { body: '#8a6a48', body2: '#7a5a3a', leg: '#6a4e34', head: '#8a6a48' },
  pat: PAT.fur, headPat: PAT.fur,
  headExtra: [box([-2, -2, -8.5], [4, 3, 1], '#3a2a1e'), box([-3, 3, -2], [1.5, 1.5, 1], '#6a4e34'), box([1.5, 3, -2], [1.5, 1.5, 1], '#6a4e34')],
});

MODELS.jaguar = quadruped({
  bw: 7, bh: 7, bl: 15, legH: 8, legW: 3, hw: 6, hh: 5, hl: 5, headUp: 0.5,
  colors: { body: '#1a1814', body2: '#2e2a24', leg: '#1a1814', head: '#1a1814', eye: '#ffd23a' },
  pat: PAT.spots, patParam: 2, headPat: PAT.spots, eyeGlow: true,
  headExtra: [box([-1.5, -1.5, -7], [3, 2.5, 2.5], '#24201a', PAT.fur), box([-3, 3, -1.5], [1.5, 2, 1], '#1a1814'), box([1.5, 3, -1.5], [1.5, 2, 1], '#1a1814')],
  tail: { boxes: [box([-0.75, -1, 0], [1.5, 1.5, 12], '#1a1814', PAT.spots, '#2e2a24', 2)] },
});

MODELS.chicken = bird({
  legH: 4, body: [6, 6, 8], head: [4, 6, 3], beak: [2, 1.5, 2],
  colors: { body: '#f4f0e8', body2: '#dcd6cc', head: '#f4f0e8', leg: '#e8a020', beak: '#f0a828', wattle: '#d82828' },
  headExtra: [box([-1, 6, -1], [2, 1.5, 2], '#d82828')],
  tail: [box([-2, 0, 0], [4, 4, 2], '#ece8e0', PAT.feathers)],
});

MODELS.toucan = bird({
  legH: 3, body: [5, 7, 6], head: [4, 5, 4], beak: [2, 3, 6], headUp: 0.85, headInset: 1,
  colors: { body: '#141414', body2: '#262626', head: '#141414', head2: '#f0f0e8', leg: '#4a7ad8', beak: '#f0a820', beak2: '#e85a1a', wing: '#141414' },
  bodyExtra: [box([-2, -2, -3.2], [4, 4, 0.5], '#f8f0c8', PAT.noise)],
  tail: [box([-1.5, -3, 0], [3, 6, 2], '#141414', PAT.feathers)],
});

MODELS.penguin = bird({
  legH: 2, body: [7, 11, 6], head: [5, 5, 5], beak: [1.5, 1, 2.5], headUp: 1.0, headInset: 3,
  colors: { body: '#1a1c22', body2: '#2a2c34', head: '#1a1c22', leg: '#f08a20', beak: '#f08a20', wing: '#1a1c22' },
  bodyExtra: [box([-2.8, -4.5, -3.1], [5.6, 8, 0.5], '#f4f4f0', PAT.noise)],
  anim: 'waddle',
});

MODELS.rabbit = finalize({
  anim: 'hop', height: 8,
  parts: [
    part('body', null, [0, 3.5, 0], [box([-2.5, -2.5, -3.5], [5, 5, 7], '#8a6a4a', PAT.fur, '#a88a6a')]),
    part('head', 'body', [0, 5, -3], [box([-2, 0, -3], [4, 4, 4], '#8a6a4a', PAT.fur), box([-1.6, 3.5, -1], [1.2, 5, 1], '#8a6a4a'), box([0.4, 3.5, -1], [1.2, 5, 1], '#8a6a4a'), box([-2.05, 2, -2.5], [0.1, 1, 1], '#101010', PAT.flat), box([1.95, 2, -2.5], [0.1, 1, 1], '#101010', PAT.flat), box([-0.5, 1, -3.1], [1, 0.7, 0.2], '#e8a0a8', PAT.flat)]),
    part('legFL', null, [-1.5, 2, -2.5], [box([-0.75, -2, -0.75], [1.5, 2, 1.5], '#8a6a4a')]),
    part('legFR', null, [1.5, 2, -2.5], [box([-0.75, -2, -0.75], [1.5, 2, 1.5], '#8a6a4a')]),
    part('legBL', null, [-2, 2, 2.5], [box([-1, -2, -1.5], [2, 2, 4], '#8a6a4a')]),
    part('legBR', null, [2, 2, 2.5], [box([-1, -2, -1.5], [2, 2, 4], '#8a6a4a')]),
    part('tail', 'body', [0, 4.5, 3.5], [box([-1, -1, 0], [2, 2, 1.5], '#f4f0e8', PAT.fur)]),
  ],
});

MODELS.frog = finalize({
  anim: 'hop', height: 5,
  parts: [
    part('body', null, [0, 2.5, 0], [box([-3, -1.5, -3.5], [6, 3.5, 7], '#4a7a2e', PAT.spots, '#2e5a1e', 2), box([-2.5, -1.6, -3], [5, 0.5, 6], '#c8d890')]),
    part('head', 'body', [0, 2.5, -3], [box([-3, -1, -2.5], [6, 2.5, 3], '#4a7a2e', PAT.noise), box([-3, 1.2, -1.5], [2, 2, 2], '#4a7a2e'), box([1, 1.2, -1.5], [2, 2, 2], '#4a7a2e'), box([-2.6, 1.8, -1.6], [1.2, 1.2, 0.2], '#e8c020', PAT.flat), box([1.4, 1.8, -1.6], [1.2, 1.2, 0.2], '#e8c020', PAT.flat)]),
    part('legFL', null, [-2.5, 1.5, -2.5], [box([-1, -1.5, -1], [1.5, 1.5, 1.5], '#4a7a2e')]),
    part('legFR', null, [2.5, 1.5, -2.5], [box([-0.5, -1.5, -1], [1.5, 1.5, 1.5], '#4a7a2e')]),
    part('legBL', null, [-3, 1.5, 2.5], [box([-1.5, -1.5, -2], [2.5, 1.5, 4], '#4a7a2e', PAT.spots, '#2e5a1e', 2)]),
    part('legBR', null, [3, 1.5, 2.5], [box([-1, -1.5, -2], [2.5, 1.5, 4], '#4a7a2e', PAT.spots, '#2e5a1e', 2)]),
  ],
});

MODELS.fish = finalize({
  anim: 'fish', height: 4,
  parts: [
    part('body', null, [0, 2, 0], [box([-1.5, -2, -4], [3, 4, 7], '#c8a06a', PAT.scales, '#a8804a'), box([-0.25, 2, -2], [0.5, 1.5, 3], '#a8804a'), box([-1.55, 0.5, -3.3], [0.1, 1, 1], '#101010', PAT.flat), box([1.45, 0.5, -3.3], [0.1, 1, 1], '#101010', PAT.flat)]),
    part('tail', 'body', [0, 2, 3], [box([-0.25, -2, 0], [0.5, 4, 3], '#a8804a', PAT.noise)]),
  ],
});

MODELS.monkey = humanoid({
  legH: 5, legW: 2, tw: 6, th: 7, td: 4, aw: 2, ah: 9, hw: 5, hh: 5, hd: 5,
  colors: { leg: '#5a3e22', body: '#6a4a2a', arm: '#5a3e22', head: '#6a4a2a', head2: '#d8b890' },
  legPat: PAT.fur, bodyPat: PAT.fur, armPat: PAT.fur, headPat: PAT.fur,
  headExtra: [box([-2, 0.5, -2.6], [4, 3, 0.3], '#d8b890', PAT.noise), box([-3.5, 2.5, -0.5], [1.5, 2, 1], '#d8b890'), box([2, 2.5, -0.5], [1.5, 2, 1], '#d8b890')],
  extraParts: [part('tail', 'body', [0, 6, 2], [box([-0.5, -0.5, 0], [1, 1, 8], '#5a3e22', PAT.fur), box([-0.5, 0, 7], [1, 4, 1], '#5a3e22')])],
  eyeY: 2.5, anim: 'monkey',
});

MODELS.bat = finalize({
  anim: 'bat', height: 6,
  parts: [
    part('body', null, [0, 3, 0], [box([-1.5, -2, -1.5], [3, 4, 3], '#3a2a24', PAT.fur), box([-1.5, 2, -1.5], [3, 2, 3], '#3a2a24', PAT.fur), box([-1.5, 3.8, -0.5], [1, 1.5, 1], '#3a2a24'), box([0.5, 3.8, -0.5], [1, 1.5, 1], '#3a2a24'), box([-1, 2.8, -1.6], [0.6, 0.6, 0.2], '#ff4040', PAT.glow), box([0.4, 2.8, -1.6], [0.6, 0.6, 0.2], '#ff4040', PAT.glow)]),
    part('wingL', 'body', [-1.5, 3, 0], [box([-7, -2, -1], [7, 3, 0.4], '#2a1e1a', PAT.noise)]),
    part('wingR', 'body', [1.5, 3, 0], [box([0, -2, -1], [7, 3, 0.4], '#2a1e1a', PAT.noise)]),
  ],
});

// ======================================================================= monsters
MODELS.shambler = humanoid({
  legH: 12, legW: 3.5, tw: 8, th: 12, td: 5, aw: 3, ah: 15, hw: 7, hh: 7, hd: 7,
  colors: { leg: '#3a382c', leg2: '#2a281e', body: '#4a4a36', body2: '#2e2e22', arm: '#6e7a5c', arm2: '#4a5a32', head: '#7a8a6a', head2: '#3e6a22', eye: '#9aff4a' },
  bodyPat: PAT.cloth, bodyParam: 3, armPat: PAT.moss, headPat: PAT.moss, eyeGlow: true, eyeY: 3.5, eyeW: 1.5,
  headExtra: [box([-2.5, 0.5, -3.6], [5, 1.5, 0.4], '#2a1a14', PAT.flat), box([-3.5, 6.5, -3.5], [7, 1.5, 7], '#3e6a22', PAT.moss, '#5a8a2a')],
  bodyExtra: [box([-4.2, 2, -2.7], [8.4, 4, 0.5], '#3e6a22', PAT.moss, '#2a4a18')],
  anim: 'shambler',
});

MODELS.gloomstalker = humanoid({
  legH: 18, legW: 2.5, tw: 6, th: 14, td: 3, aw: 2, ah: 21, hw: 5, hh: 8, hd: 5,
  colors: { leg: '#120e16', body: '#16121c', body2: '#241c30', arm: '#120e16', head: '#16121c', eye: '#d070ff' },
  bodyPat: PAT.noise, armPat: PAT.noise, headPat: PAT.noise, eyeGlow: true, eyeY: 4.5, eyeW: 1.2, eyeH: 2,
  headExtra: [box([-0.5, 2, -2.6], [1, 2.5, 0.2], '#d070ff', PAT.glow)],
  anim: 'stalker',
});

MODELS.thornling = humanoid({
  legH: 11, legW: 3, tw: 7, th: 11, td: 4, aw: 2.5, ah: 13, hw: 7, hh: 7, hd: 7,
  colors: { leg: '#4a3a22', leg2: '#3a2c18', body: '#4a3a22', body2: '#3a2c18', arm: '#4a3a22', arm2: '#3a2c18', head: '#3a6a2a', head2: '#2a4a1e', eye: '#ffd040' },
  legPat: PAT.bark, bodyPat: PAT.bark, armPat: PAT.bark, headPat: PAT.moss, eyeGlow: true, eyeY: 2.5,
  headExtra: [box([-4.5, 5, -4.5], [9, 4, 9], '#3a6a2a', PAT.moss, '#5a8a32'), box([-0.5, 9, -0.5], [1, 3, 1], '#7a5a2a'), box([-3, 7, -5], [1, 1, 2], '#e8e0a0')],
  handR: [box([-0.5, -14, -2], [1, 1, 5], '#8a6a3a', PAT.bark)],
  anim: 'biped',
});

MODELS.mire_lurker = finalize({
  anim: 'hop', height: 12,
  parts: [
    part('body', null, [0, 6, 0], [box([-7, -4, -7], [14, 9, 14], '#4a5a2a', PAT.spots, '#2e3a1a', 3), box([-6, -4.1, -6], [12, 0.5, 12], '#a8a870'), box([-7.2, 2, -2], [14.4, 3, 8], '#3a4a22', PAT.moss, '#5a6a2a')]),
    part('head', 'body', [0, 9, -6], [box([-6.5, -2, -5], [13, 6, 6], '#4a5a2a', PAT.spots, '#2e3a1a', 3), box([-6, -2.2, -5.1], [12, 1.2, 0.3], '#5a1a1a', PAT.flat), box([-6, 3, -3], [3.5, 3.5, 3.5], '#4a5a2a'), box([2.5, 3, -3], [3.5, 3.5, 3.5], '#4a5a2a'), box([-5.4, 4.2, -3.2], [2.2, 2, 0.3], '#f0e040', PAT.glow), box([3.2, 4.2, -3.2], [2.2, 2, 0.3], '#f0e040', PAT.glow)]),
    part('legFL', null, [-6, 4, -5], [box([-1.5, -4, -1.5], [3, 4, 3], '#4a5a2a')]),
    part('legFR', null, [6, 4, -5], [box([-1.5, -4, -1.5], [3, 4, 3], '#4a5a2a')]),
    part('legBL', null, [-7, 4, 5], [box([-2.5, -4, -3], [4, 4, 7], '#4a5a2a', PAT.spots, '#2e3a1a', 3)]),
    part('legBR', null, [7, 4, 5], [box([-1.5, -4, -3], [4, 4, 7], '#4a5a2a', PAT.spots, '#2e3a1a', 3)]),
  ],
});

export function arthropod(o) {
  const parts = [];
  const col = o.colors;
  parts.push(part('body', null, [0, o.bodyY, 0], [box([-o.bw / 2, -o.bh / 2, -o.bl / 2], [o.bw, o.bh, o.bl], col.body, PAT.scales, col.body2)].concat(o.bodyExtra || [])));
  const hb = [box([-o.hw / 2, -o.hh / 2, -o.hl], [o.hw, o.hh, o.hl], col.head || col.body, PAT.scales, col.body2)];
  hb.push(box([-o.hw / 2 + 0.5, 0, -o.hl - 0.05], [1.2, 1, 0.1], col.eye, PAT.glow));
  hb.push(box([o.hw / 2 - 1.7, 0, -o.hl - 0.05], [1.2, 1, 0.1], col.eye, PAT.glow));
  hb.push(box([-o.hw / 2 + 2, 1, -o.hl - 0.05], [0.8, 0.8, 0.1], col.eye, PAT.glow));
  hb.push(box([o.hw / 2 - 2.8, 1, -o.hl - 0.05], [0.8, 0.8, 0.1], col.eye, PAT.glow));
  parts.push(part('head', 'body', [0, o.bodyY, -o.bl / 2], hb.concat(o.headExtra || [])));
  const n = o.legs;
  for (let i = 0; i < n; i++) {
    const z = -o.bl / 2 + 2 + (o.bl - 4) * (i / (n - 1));
    parts.push(part('legL' + i, null, [-o.bw / 2, o.bodyY, z], [box([-o.legLen, -0.6, -0.6], [o.legLen, 1.2, 1.2], col.leg, PAT.scales, col.body2), box([-o.legLen, -o.bodyY, -0.6], [1.2, o.bodyY, 1.2], col.leg, PAT.scales, col.body2)]));
    parts.push(part('legR' + i, null, [o.bw / 2, o.bodyY, z], [box([0, -0.6, -0.6], [o.legLen, 1.2, 1.2], col.leg, PAT.scales, col.body2), box([o.legLen - 1.2, -o.bodyY, -0.6], [1.2, o.bodyY, 1.2], col.leg, PAT.scales, col.body2)]));
  }
  if (o.extraParts) parts.push(...o.extraParts);
  return finalize({ parts, anim: 'arthropod', height: o.bodyY + o.bh / 2 + (o.extraH || 2), legs: n });
}

MODELS.cave_crawler = arthropod({
  bodyY: 4, bw: 9, bh: 5, bl: 14, hw: 7, hh: 5, hl: 5, legs: 4, legLen: 6,
  colors: { body: '#3a2a22', body2: '#5a4030', leg: '#2e221c', eye: '#ff3a2a' },
  bodyExtra: [box([-5, 2, -5], [10, 2, 4], '#4a3428', PAT.scales, '#6a4a34'), box([-5, 2, 1], [10, 2, 4], '#4a3428', PAT.scales, '#6a4a34')],
  headExtra: [box([-3, -2, -7], [1.5, 1.5, 2.5], '#c8b090'), box([1.5, -2, -7], [1.5, 1.5, 2.5], '#c8b090')],
});

MODELS.dune_scorpion = arthropod({
  bodyY: 4, bw: 10, bh: 4, bl: 13, hw: 7, hh: 4, hl: 4, legs: 3, legLen: 5,
  colors: { body: '#c89a5a', body2: '#8a6a3a', leg: '#a8804a', eye: '#202020' },
  headExtra: [box([-7, -1.5, -8], [4, 3, 5], '#b88a4a', PAT.scales, '#8a6a3a'), box([3, -1.5, -8], [4, 3, 5], '#b88a4a', PAT.scales, '#8a6a3a'), box([-7.5, -1.5, -10], [2, 3, 2.5], '#8a6a3a'), box([5.5, -1.5, -10], [2, 3, 2.5], '#8a6a3a')],
  extraParts: [
    part('tail0', 'body', [0, 5, 6.5], [box([-1.5, 0, 0], [3, 3, 4], '#c89a5a', PAT.scales, '#8a6a3a')]),
    part('tail1', 'tail0', [0, 6, 10], [box([-1.25, 0, -1], [2.5, 5, 2.5], '#c89a5a', PAT.scales, '#8a6a3a')]),
    part('tail2', 'tail1', [0, 11, 9.5], [box([-1, 0, -3], [2, 2.5, 4], '#c89a5a', PAT.scales, '#8a6a3a'), box([-0.75, -1, -4.5], [1.5, 2, 2], '#2a1a10')]),
  ],
  extraH: 9,
});

MODELS.frost_wraith = finalize({
  anim: 'float', height: 26,
  parts: [
    part('body', null, [0, 8, 0], [box([-5, 8, -4], [10, 10, 8], '#a8c8f0', PAT.ice, '#e8f4ff'), box([-4, 2, -3], [8, 6, 6], '#90b4e0', PAT.ice, '#d0e8ff'), box([-3, -3, -2], [6, 5, 4], '#7aa0d8', PAT.ice, '#c0dcff'), box([-1.5, -7, -1], [3, 4, 2], '#6a90c8', PAT.ice, '#b0d0ff')]),
    part('head', 'body', [0, 26, 0], [box([-4, 0, -4], [8, 8, 8], '#c8e0ff', PAT.ice, '#ffffff'), box([-4.5, 4, -4.5], [9, 5, 9], '#7aa0d8', PAT.ice, '#a8c8f0'), box([-2.8, 2.5, -4.6], [1.6, 1.2, 0.2], '#60f0ff', PAT.glow), box([1.2, 2.5, -4.6], [1.6, 1.2, 0.2], '#60f0ff', PAT.glow)]),
    part('armL', 'body', [-5, 24, 0], [box([-2.5, -11, -1.5], [2.5, 11, 3], '#90b4e0', PAT.ice, '#e8f4ff'), box([-3, -13, -2], [3.5, 2.5, 4], '#e8f4ff', PAT.ice)]),
    part('armR', 'body', [5, 24, 0], [box([0, -11, -1.5], [2.5, 11, 3], '#90b4e0', PAT.ice, '#e8f4ff'), box([-0.5, -13, -2], [3.5, 2.5, 4], '#e8f4ff', PAT.ice)]),
    part('shard0', null, [0, 20, 0], [box([8, 0, -1], [1.5, 4, 1.5], '#d8f0ff', PAT.glow)]),
    part('shard1', null, [0, 20, 0], [box([-9.5, 2, -1], [1.5, 4, 1.5], '#d8f0ff', PAT.glow)]),
  ],
});

MODELS.ember_fiend = humanoid({
  legH: 7, legW: 2.5, tw: 6, th: 7, td: 4, aw: 2, ah: 8, hw: 6, hh: 6, hd: 6,
  colors: { leg: '#241816', body: '#2a1c18', body2: '#ff7a1a', arm: '#241816', arm2: '#ff9a2a', head: '#2a1c18', head2: '#ff8a20', eye: '#ffd040' },
  legPat: PAT.lava, bodyPat: PAT.lava, armPat: PAT.lava, headPat: PAT.lava, eyeGlow: true, eyeY: 2.5,
  headExtra: [box([-3.5, 5, -1], [1.5, 3, 1.5], '#1a1210'), box([2, 5, -1], [1.5, 3, 1.5], '#1a1210'), box([-4, 7.5, -0.5], [1, 2, 1], '#1a1210'), box([3, 7.5, -0.5], [1, 2, 1], '#1a1210')],
  extraParts: [
    part('wingL', 'body', [-2, 13, 2], [box([-9, -4, 0], [9, 7, 0.5], '#3a1a12', PAT.lava, '#c84a10')]),
    part('wingR', 'body', [2, 13, 2], [box([0, -4, 0], [9, 7, 0.5], '#3a1a12', PAT.lava, '#c84a10')]),
  ],
  anim: 'fiend',
});

MODELS.moss_golem = humanoid({
  legH: 12, legW: 6, tw: 16, th: 16, td: 9, aw: 6, ah: 22, hw: 9, hh: 8, hd: 8,
  colors: { leg: '#6a6a62', leg2: '#3e6a22', body: '#6a6a62', body2: '#3e6a22', arm: '#6a6a62', arm2: '#3e6a22', head: '#6a6a62', head2: '#3e6a22', eye: '#9aff6a' },
  legPat: PAT.moss, bodyPat: PAT.moss, armPat: PAT.moss, headPat: PAT.moss, eyeGlow: true, eyeY: 3, eyeW: 2,
  bodyExtra: [box([-8.5, 13, -5], [17, 4, 10], '#3e6a22', PAT.moss, '#5a8a2a'), box([-3, 6, -4.8], [6, 6, 0.4], '#9aff6a', PAT.glow)],
  headExtra: [box([-5, 7, -5], [10, 2, 10], '#3e6a22', PAT.moss, '#5a8a2a')],
  anim: 'golem',
});

MODELS.rootling = humanoid({
  legH: 5, legW: 2, tw: 5, th: 6, td: 4, aw: 1.5, ah: 7, hw: 6, hh: 5, hd: 5,
  colors: { leg: '#4a3420', body: '#5a4028', body2: '#3a2a18', arm: '#4a3420', head: '#5a4028', head2: '#3e6a22', eye: '#c0ff60' },
  legPat: PAT.bark, bodyPat: PAT.bark, armPat: PAT.bark, headPat: PAT.moss, eyeGlow: true, eyeY: 2,
  headExtra: [box([-3.5, 4, -3], [7, 2, 6], '#3e6a22', PAT.moss, '#6a9a3a'), box([-0.5, 6, -0.5], [1, 3, 1], '#4a3420')],
});


// ======================================================================= Phase 6 animal overhaul
// "beast" builder: body, jointed legs (upper + shin), optional neck, head with ears/eyelids, tail chain.
// All pivots are absolute model coordinates (1 unit = 1/16 block, -Z forward, y = 0 ground).
const mirrorBoxes = (bs) => bs.map(b => Object.assign({}, b, { o: [-(b.o[0] + b.s[0]), b.o[1], b.o[2]] }));
export function beast(o) {
  const parts = [];
  parts.push(part('body', null, o.body.pivot, o.body.boxes));
  const L = o.legs;
  for (const [n, sx, front] of [['FL', -1, true], ['FR', 1, true], ['BL', -1, false], ['BR', 1, false]]) {
    const z = front ? L.zf : L.zb;
    const top = front ? (L.topF ?? L.top) : L.top, knee = front ? (L.kneeF ?? L.knee) : L.knee;
    const w = front ? (L.wf ?? L.w) : (L.wb ?? L.w);
    const c = front ? (L.cf ?? L.c) : (L.cb ?? L.c);
    parts.push(part('leg' + n, null, [sx * L.x, top, z], [box([-w / 2, knee - top - 0.6, -w / 2], [w, top - knee + 2, w], c, L.pat ?? PAT.fur, L.c2 || c, 2)]));
    const sb = [box([-L.w2 / 2, -knee, -L.w2 / 2], [L.w2, knee + 0.6, L.w2], L.sc || c, L.pat ?? PAT.fur, L.sc2 || L.sc || c, 2)];
    if (L.sock) sb.push(box([-L.w2 / 2 - 0.06, -knee + (L.hoofH || 0), -L.w2 / 2 - 0.06], [L.w2 + 0.12, L.sock[0], L.w2 + 0.12], L.sock[1], PAT.fur));
    if (L.hoof) sb.push(box([-L.w2 / 2 - 0.2, -knee, -L.w2 / 2 - 0.25], [L.w2 + 0.4, L.hoofH || 1.4, L.w2 + 0.45], L.hoof, PAT.noise));
    parts.push(part('shin' + n, 'leg' + n, [sx * L.x, knee, z], sb));
  }
  if (o.neck) parts.push(part('neck', 'body', o.neck.pivot, o.neck.boxes, { rest: [o.neck.tilt || 0, 0, 0] }));
  const H = o.head;
  parts.push(part('head', o.neck ? 'neck' : 'body', H.pivot, H.boxes, { rest: [H.tilt || 0, 0, 0] }));
  if (H.lids) parts.push(part('lids', 'head', H.pivot, H.lids, { sleepOnly: true }));
  if (o.ears) {
    const E = o.ears;
    parts.push(part('earL', 'head', [-E.pivot[0], E.pivot[1], E.pivot[2]], mirrorBoxes(E.boxes), { rest: [E.rx || 0, 0, -(E.rz || 0)] }));
    parts.push(part('earR', 'head', E.pivot, E.boxes, { rest: [E.rx || 0, 0, E.rz || 0] }));
  }
  if (o.tail) {
    parts.push(part('tail', 'body', o.tail.pivot, o.tail.boxes, { rest: [o.tail.rx || 0, 0, 0] }));
    if (o.tail.tip) parts.push(part('tail2', 'tail', o.tail.tip.pivot, o.tail.tip.boxes, { rest: [o.tail.tip.rx || 0, 0, 0] }));
  }
  if (o.extraParts) parts.push(...o.extraParts);
  return finalize({ parts, anim: 'beast', height: o.height, saddle: o.saddle });
}
// eyes with a white glint, plus matching eyelid boxes for sleeping/blinking
export function eyes(x, y, z, h, w, lid, col = '#141210') {
  const e = [box([-x - 0.06, y, z], [0.12, h, w], col, PAT.flat), box([x - 0.06, y, z], [0.12, h, w], col, PAT.flat),
    box([-x - 0.08, y + h * 0.55, z + w * 0.15], [0.1, h * 0.3, w * 0.3], '#f4f4f0', PAT.flat), box([x - 0.02, y + h * 0.55, z + w * 0.15], [0.1, h * 0.3, w * 0.3], '#f4f4f0', PAT.flat)];
  const l = [box([-x - 0.14, y - 0.1, z - 0.1], [0.12, h + 0.2, w + 0.2], lid, PAT.flat), box([x + 0.02, y - 0.1, z - 0.1], [0.12, h + 0.2, w + 0.2], lid, PAT.flat)];
  return [e, l];
}

{ // ---------------- cow
  const [E, Lid] = eyes(3.5, 0.6, -5.6, 1.3, 1.5, '#5c3e28');
  MODELS.cow = beast({
    height: 26,
    body: { pivot: [0, 16, 0], boxes: [
      box([-6.5, -5.5, -10], [13, 11, 20], '#5c3e28', PAT.spots, '#efe8dc', 3.2),
      box([-6, 4.6, 5.5], [12, 1.4, 4], '#5c3e28', PAT.spots, '#efe8dc', 3.2),        // hip bones
      box([-2.6, -8, 3], [5.2, 2.6, 4.2], '#e0a4a8', PAT.noise),                       // udder
      box([-1.8, -8.8, 3.6], [0.9, 1, 0.9], '#d08890', PAT.flat), box([0.9, -8.8, 3.6], [0.9, 1, 0.9], '#d08890', PAT.flat),
      box([-1.8, -8.8, 5.6], [0.9, 1, 0.9], '#d08890', PAT.flat), box([0.9, -8.8, 5.6], [0.9, 1, 0.9], '#d08890', PAT.flat),
    ] },
    legs: { x: 4.3, zf: -7, zb: 7, top: 12, knee: 5.5, w: 3.8, w2: 3.2, c: '#5c3e28', sc: '#efe8dc', sc2: '#d8d0c0', hoof: '#2a2420', hoofH: 1.4, pat: PAT.fur },
    neck: { pivot: [0, 18, -9], tilt: -1.05, boxes: [box([-3.2, -3, -3.2], [6.4, 8, 6.4], '#5c3e28', PAT.spots, '#efe8dc', 3.2), box([-2.4, -3.5, -3.6], [4.8, 6, 1.5], '#efe8dc', PAT.fur)] },
    head: { pivot: [0, 23, -9], tilt: 0.75, boxes: [
      box([-3.6, -4, -8], [7.2, 7.2, 8.5], '#5c3e28', PAT.spots, '#efe8dc', 3.2),
      box([-1.6, -0.5, -8.1], [3.2, 3.6, 0.3], '#efe8dc', PAT.fur),                       // blaze
      box([-3.1, -4.6, -10], [6.2, 4.2, 2.6], '#e2b0a8', PAT.noise),                     // muzzle
      box([-2.2, -2.9, -10.1], [1.1, 1.1, 0.2], '#5a2a2a', PAT.flat), box([1.1, -2.9, -10.1], [1.1, 1.1, 0.2], '#5a2a2a', PAT.flat),
      box([-5.4, 2.2, -3.5], [2, 1.4, 1.4], '#e8e0cc', PAT.noise), box([3.4, 2.2, -3.5], [2, 1.4, 1.4], '#e8e0cc', PAT.noise),   // horns
      box([-5.9, 3.2, -3.4], [1, 1.8, 1], '#c8c0aa', PAT.noise), box([4.9, 3.2, -3.4], [1, 1.8, 1], '#c8c0aa', PAT.noise),
    ].concat(E), lids: Lid },
    ears: { pivot: [3.6, 1.2, -2.6], rz: 0.35, boxes: [box([0, -0.7, -1], [3.2, 1.5, 2.2], '#5c3e28', PAT.noise), box([0.4, -0.4, -1.05], [2.4, 0.9, 0.2], '#e0a4a8', PAT.flat)] },
    tail: { pivot: [0, 20.5, 10], rx: 0.1, boxes: [box([-0.7, -9.5, -0.7], [1.4, 10, 1.4], '#5c3e28', PAT.fur)], tip: { pivot: [0, 11, 10], boxes: [box([-1.2, -3, -1.2], [2.4, 3.2, 2.4], '#2a2018', PAT.fur)] } },
  });
}

{ // ---------------- horse
  const [E, Lid] = eyes(2.85, 0.4, -5.6, 1.4, 1.6, '#7a4a26');
  MODELS.horse = beast({
    height: 38, saddle: [-5.6, 25, -6.5, 11.2, 1.6, 10],
    body: { pivot: [0, 20, 0], boxes: [
      box([-5, -5, -11.5], [10, 10, 23], '#7a4a26', PAT.fur, '#5a3418'),
      box([-4.6, -5.6, -12.3], [9.2, 8.6, 4], '#7a4a26', PAT.fur, '#5a3418'),        // chest
      box([-5.3, -3.5, 6.5], [10.6, 8, 6], '#7a4a26', PAT.fur, '#5a3418'),          // haunches
    ] },
    legs: { x: 3.3, zf: -8.6, zb: 8.4, top: 16, knee: 8, w: 3.4, wb: 4.2, w2: 2.6, c: '#7a4a26', sc: '#7a4a26', hoof: '#2a201a', hoofH: 1.6, pat: PAT.fur },
    neck: { pivot: [0, 22, -10], tilt: -0.6, boxes: [
      box([-2.4, -2.5, -3.2], [4.8, 15, 6.2], '#7a4a26', PAT.fur, '#5a3418'),
      box([-0.95, -1, 2.6], [1.9, 14.5, 2.2], '#2e1e12', PAT.fur),                      // mane
    ] },
    head: { pivot: [0, 33.5, -10], tilt: -0.36, boxes: [
      box([-2.8, -3, -6.5], [5.6, 6.2, 7], '#7a4a26', PAT.fur, '#5a3418'),              // skull & cheeks
      box([-2.15, -3.1, -12], [4.3, 4.6, 6], '#7a4a26', PAT.fur, '#5a3418'),            // long muzzle
      box([-2.25, -3.2, -12.6], [4.5, 3.2, 1.4], '#3a2a22', PAT.noise),                 // soft nose
      box([-1.6, -1.6, -12.7], [0.9, 1, 0.2], '#141010', PAT.flat), box([0.7, -1.6, -12.7], [0.9, 1, 0.2], '#141010', PAT.flat),
      box([-1.3, 2.8, -6], [2.6, 1.3, 3], '#2e1e12', PAT.fur),                          // forelock
      box([-1.4, -0.6, -6.6], [2.8, 2.4, 0.2], '#f2ece0', PAT.flat),                    // star
    ].concat(E), lids: Lid },
    ears: { pivot: [1.7, 3, -1.8], rx: -0.25, rz: 0.12, boxes: [box([-0.7, 0, -0.6], [1.4, 3.2, 1.2], '#7a4a26', PAT.fur)] },
    tail: { pivot: [0, 23.5, 11.5], rx: 0.25, boxes: [box([-1.2, -2.2, -0.8], [2.4, 3.2, 3], '#2e1e12', PAT.fur)], tip: { pivot: [0, 22, 13.5], rx: 0.2, boxes: [box([-1.6, -13.5, -1.4], [3.2, 14.5, 2.8], '#2e1e12', PAT.fur)] } },
  });
}

{ // ---------------- pig
  const [E, Lid] = eyes(4.05, 0.5, -6.2, 1, 1.2, '#e8a3a2');
  MODELS.pig = beast({
    height: 16,
    body: { pivot: [0, 9, 0], boxes: [box([-5, -4.5, -8], [10, 9, 16], '#e8a3a2', PAT.noise, '#d88a8c'), box([-4.6, -5, -6], [9.2, 1, 12], '#d88a8c', PAT.noise)] },
    legs: { x: 3, zf: -5.2, zb: 5.2, top: 6, knee: 3, w: 3.2, w2: 2.8, c: '#e0989a', hoof: '#8a5a50', hoofH: 1, pat: PAT.noise },
    head: { pivot: [0, 11, -7.5], tilt: -0.1, boxes: [
      box([-4, -4, -7], [8, 8, 7.5], '#e8a3a2', PAT.noise, '#d88a8c'),
      box([-2.3, -3.2, -8.8], [4.6, 3.4, 2], '#f2b4b6', PAT.noise),
      box([-1.4, -2.2, -8.85], [0.9, 1, 0.2], '#7a3a3a', PAT.flat), box([0.5, -2.2, -8.85], [0.9, 1, 0.2], '#7a3a3a', PAT.flat),
    ].concat(E), lids: Lid },
    ears: { pivot: [2.6, 3.6, -3.5], rx: 0.75, rz: 0.2, boxes: [box([-1.4, 0, -2.6], [2.8, 0.7, 3], '#d88a8c', PAT.noise)] },
    tail: { pivot: [0, 12, 8], rx: -0.4, boxes: [box([-0.5, -0.5, 0], [1, 1, 1.6], '#d88a8c', PAT.noise), box([-0.5, 0.3, 1.2], [1, 1.4, 1], '#d88a8c', PAT.noise)] },
  });
}

{ // ---------------- boar
  const [E, Lid] = eyes(4.05, 0.8, -6, 1, 1.1, '#4a3424', '#e8a020');
  MODELS.boar = beast({
    height: 17,
    body: { pivot: [0, 10, 0], boxes: [box([-5, -4.8, -8.5], [10, 9.6, 17], '#4a3424', PAT.fur, '#2e2018'), box([-1.6, 4.4, -9], [3.2, 2.4, 13], '#1e140c', PAT.fur)] },
    legs: { x: 3, zf: -5.6, zb: 5.6, top: 6.5, knee: 3.2, w: 3.2, w2: 2.6, c: '#3a2a1e', hoof: '#1e1612', hoofH: 1, pat: PAT.fur },
    head: { pivot: [0, 12, -8], tilt: -0.25, boxes: [
      box([-4, -4, -7.5], [8, 8, 8], '#4a3424', PAT.fur, '#2e2018'),
      box([-2.6, -3.6, -10.2], [5.2, 3.6, 3], '#5a4232', PAT.noise),
      box([-2.6, -3.7, -10.4], [5.2, 2.4, 0.3], '#2a1c14', PAT.flat),
      box([-3.6, -3, -9.6], [1, 3.6, 1], '#ece4d0', PAT.noise), box([2.6, -3, -9.6], [1, 3.6, 1], '#ece4d0', PAT.noise),   // tusks
      box([-1.2, 3.8, -6], [2.4, 2.2, 6], '#1e140c', PAT.fur),
    ].concat(E), lids: Lid },
    ears: { pivot: [2.6, 3.6, -3], rx: -0.2, rz: 0.4, boxes: [box([-1, 0, -0.6], [2, 2.6, 1.2], '#3a2a1e', PAT.fur)] },
    tail: { pivot: [0, 13, 8.5], rx: 0.6, boxes: [box([-0.5, -3.5, -0.5], [1, 3.5, 1], '#1e140c', PAT.fur)] },
  });
}

{ // ---------------- sheep
  const [E, Lid] = eyes(2.55, 0.4, -4.5, 1, 1.1, '#3a3430', '#d8c890');
  MODELS.sheep = beast({
    height: 22,
    body: { pivot: [0, 13, 0], boxes: [
      box([-6.5, -5.5, -9], [13, 11, 18], '#efe9df', PAT.fur, '#d8d0c4'),
      box([-5.5, 4.5, -7.5], [11, 2, 15], '#efe9df', PAT.fur, '#d8d0c4'),
      box([-7, -3, -6], [14, 6, 12], '#efe9df', PAT.fur, '#d8d0c4'),
    ] },
    legs: { x: 3.6, zf: -6, zb: 6, top: 9, knee: 4.5, w: 2.6, w2: 2.1, c: '#3a3430', hoof: '#1e1a18', hoofH: 1, pat: PAT.noise },
    head: { pivot: [0, 16, -8.5], tilt: -0.2, boxes: [
      box([-2.5, -3, -6.2], [5, 6, 6.5], '#3a3430', PAT.noise),
      box([-3.3, 1.6, -5], [6.6, 3.4, 5.8], '#efe9df', PAT.fur, '#d8d0c4'),
      box([-1.4, -2.6, -6.4], [2.8, 1.2, 0.2], '#2a2420', PAT.flat),
    ].concat(E), lids: Lid },
    ears: { pivot: [2.4, 1, -2.2], rz: 0.5, boxes: [box([0, -0.6, -0.9], [2.8, 1.2, 1.8], '#3a3430', PAT.noise)] },
    tail: { pivot: [0, 15, 9], rx: 0.5, boxes: [box([-1.5, -4, -0.5], [3, 4.5, 2.2], '#efe9df', PAT.fur, '#d8d0c4')] },
  });
}

{ // ---------------- deer (stag + doe)
  const mk = (antlers) => {
    const [E, Lid] = eyes(2.25, 0.5, -4.4, 1.2, 1.3, '#9a6a3e');
    const ant = antlers ? [
      box([-2.2, 2.4, -2], [1, 4, 1], '#d8c8a8', PAT.bark), box([1.2, 2.4, -2], [1, 4, 1], '#d8c8a8', PAT.bark),
      box([-4.8, 6, -2], [3.2, 1, 1], '#d8c8a8', PAT.bark), box([1.6, 6, -2], [3.2, 1, 1], '#d8c8a8', PAT.bark),
      box([-4.6, 6.8, -2], [1, 3.4, 1], '#d8c8a8', PAT.bark), box([3.6, 6.8, -2], [1, 3.4, 1], '#d8c8a8', PAT.bark),
      box([-2.2, 6.2, -2.4], [1, 4.5, 1], '#d8c8a8', PAT.bark), box([1.2, 6.2, -2.4], [1, 4.5, 1], '#d8c8a8', PAT.bark),
      box([-2.6, 4.4, -3.6], [1, 1, 2], '#d8c8a8', PAT.bark), box([1.6, 4.4, -3.6], [1, 1, 2], '#d8c8a8', PAT.bark),
    ] : [];
    return beast({
      height: 32,
      body: { pivot: [0, 17, 0], boxes: [box([-4, -4.5, -8.5], [8, 9, 17], '#9a6a3e', PAT.belly, '#e8d8b8'), box([-3.2, -3, 7.6], [6.4, 5.5, 1.2], '#f4ece0', PAT.fur)] },
      legs: { x: 2.6, zf: -6.4, zb: 6.6, top: 13.5, knee: 7, w: 2.6, wb: 3.2, w2: 1.8, c: '#8a5e36', hoof: '#2a201a', hoofH: 1.1, pat: PAT.fur },
      neck: { pivot: [0, 19.5, -7.5], tilt: -0.32, boxes: [box([-1.8, -2, -2.1], [3.6, 10.5, 4.2], '#9a6a3e', PAT.belly, '#e8d8b8')] },
      head: { pivot: [0, 28.5, -7.5], tilt: 0.0, boxes: [
        box([-2.2, -2.4, -4.5], [4.4, 4.6, 5], '#9a6a3e', PAT.fur),
        box([-1.6, -2.5, -8], [3.2, 3, 3.8], '#9a6a3e', PAT.fur),
        box([-1.6, -2.6, -8.5], [3.2, 1.8, 0.8], '#2a2018', PAT.noise),
        box([-1.7, -2.6, -6], [3.4, 0.6, 2.5], '#e8d8b8', PAT.flat),
      ].concat(E, ant), lids: Lid },
      ears: { pivot: [2, 1.6, -1.5], rx: -0.1, rz: 0.45, boxes: [box([0, -0.3, -0.5], [3, 2, 0.9], '#9a6a3e', PAT.fur), box([0.4, 0, -0.55], [2.2, 1.3, 0.1], '#e8c8b0', PAT.flat)] },
      tail: { pivot: [0, 20, 8.6], rx: -0.3, boxes: [box([-1.1, -2.4, -0.4], [2.2, 3, 1.2], '#f4ece0', PAT.fur)] },
    });
  };
  MODELS.deer = mk(true);
  MODELS.deer_doe = mk(false);
}

{ // ---------------- wolf
  const [E, Lid] = eyes(3.05, 0.9, -3.5, 1, 1.1, '#8c8c8a', '#e8b830');
  MODELS.wolf = beast({
    height: 17,
    body: { pivot: [0, 11, 0], boxes: [
      box([-3.4, -3.3, -7], [6.8, 6.8, 14], '#8c8c8a', PAT.belly, '#d8d6d0'),
      box([-4.6, -3.8, -8.2], [9.2, 8.8, 6.5], '#7c7c7a', PAT.fur, '#9c9c9a'),          // ruff
    ] },
    legs: { x: 2.3, zf: -5, zb: 5, top: 8.5, knee: 4.2, w: 2.5, wb: 2.9, w2: 1.9, c: '#8c8c8a', sc: '#a8a6a0', pat: PAT.fur },
    head: { pivot: [0, 14, -8], tilt: 0, boxes: [
      box([-3, -2.6, -4.6], [6, 5.6, 5.2], '#8c8c8a', PAT.fur, '#d8d6d0'),
      box([-1.6, -2.6, -8], [3.2, 2.8, 3.8], '#a8a6a0', PAT.fur),
      box([-0.8, -0.6, -8.2], [1.6, 1, 0.4], '#1a1a1a', PAT.flat),
      box([-1.4, -2.7, -7.6], [2.8, 0.5, 2.8], '#2a2622', PAT.flat),
      box([-3.1, -2.4, -3], [6.2, 2.4, 2.4], '#d8d6d0', PAT.fur),
    ].concat(E), lids: Lid },
    ears: { pivot: [1.9, 3, -2.4], rx: -0.15, rz: 0.1, boxes: [box([-1, 0, -0.6], [2, 3, 1.2], '#7c7c7a', PAT.fur), box([-0.6, 0.4, -0.65], [1.2, 1.8, 0.1], '#c89a9a', PAT.flat)] },
    tail: { pivot: [0, 12.5, 7], rx: 0.75, boxes: [box([-1.2, -1.2, 0], [2.4, 2.4, 4.5], '#7c7c7a', PAT.fur, '#e8e6e0')], tip: { pivot: [0, 12.5, 11.3], rx: 0.1, boxes: [box([-1.3, -1.3, 0], [2.6, 2.6, 4.5], '#7c7c7a', PAT.fur, '#e8e6e0')] } },
  });
}

{ // ---------------- cat
  const [E, Lid] = eyes(2.55, 0.4, -3.2, 1.1, 1.1, '#d8892e', '#3ac83a');
  MODELS.cat = beast({
    height: 10,
    body: { pivot: [0, 6, 0], boxes: [box([-2.5, -2.5, -5.5], [5, 5, 11], '#d8892e', PAT.stripes, '#a85a1a', 3), box([-2.2, -2.6, -4], [4.4, 0.6, 8], '#f0c08a', PAT.fur)] },
    legs: { x: 1.5, zf: -4.1, zb: 4.1, top: 4.5, knee: 2.2, w: 1.8, w2: 1.5, c: '#d8892e', sc: '#d8892e', pat: PAT.fur, sock: [0.8, '#f0c08a'] },
    head: { pivot: [0, 8, -5.5], tilt: 0, boxes: [
      box([-2.5, -2, -4], [5, 4, 4], '#d8892e', PAT.stripes, '#a85a1a', 3),
      box([-1.3, -2, -4.8], [2.6, 1.7, 1], '#f0c08a', PAT.fur),
      box([-0.4, -0.9, -4.85], [0.8, 0.6, 0.1], '#e88a8a', PAT.flat),
    ].concat(E), lids: Lid },
    ears: { pivot: [1.5, 2, -2], rx: -0.1, boxes: [box([-0.75, 0, -0.5], [1.5, 1.9, 1], '#d8892e', PAT.fur), box([-0.45, 0.3, -0.55], [0.9, 1.1, 0.1], '#e8a0a0', PAT.flat)] },
    tail: { pivot: [0, 7.6, 5.4], rx: -0.5, boxes: [box([-0.5, -0.5, 0], [1, 1, 5], '#d8892e', PAT.stripes, '#a85a1a', 2)], tip: { pivot: [0, 7.6, 10.2], rx: -0.6, boxes: [box([-0.5, -0.5, 0], [1, 1, 4.5], '#d8892e', PAT.stripes, '#a85a1a', 2)] } },
  });
}

{ // ---------------- arctic fox
  const [E, Lid] = eyes(3.05, 0.6, -3, 1, 1, '#f2f2f0', '#2a2a30');
  MODELS.arctic_fox = beast({
    height: 11,
    body: { pivot: [0, 6.5, 0], boxes: [box([-3, -2.5, -5.5], [6, 5, 11], '#f2f2f0', PAT.fur, '#d8dce4')] },
    legs: { x: 1.8, zf: -4, zb: 4, top: 4.5, knee: 2.2, w: 2, w2: 1.6, c: '#e8e8e6', pat: PAT.fur },
    head: { pivot: [0, 8.5, -5.5], boxes: [
      box([-3, -2, -4], [6, 4.6, 4.4], '#f2f2f0', PAT.fur), box([-1.4, -2, -7], [2.8, 2.4, 3.2], '#ffffff', PAT.fur), box([-0.6, -1, -7.1], [1.2, 1, 0.2], '#1a1a1a', PAT.flat),
    ].concat(E), lids: Lid },
    ears: { pivot: [1.8, 2.6, -2], boxes: [box([-1, 0, -0.5], [2, 2.6, 1], '#e8e8e6', PAT.fur)] },
    tail: { pivot: [0, 7.5, 5.4], rx: 0.5, boxes: [box([-2, -2, 0], [4, 4, 9], '#ffffff', PAT.fur, '#d8dce4')] },
  });
}

{ // ---------------- snow yak
  const [E, Lid] = eyes(4.55, -0.5, -5.5, 1.1, 1.2, '#3a2c22', '#1a1410');
  MODELS.snow_yak = beast({
    height: 30,
    body: { pivot: [0, 16, 0], boxes: [
      box([-7.5, -6.5, -10.5], [15, 13, 21], '#4a3a2e', PAT.fur, '#6a5646'),
      box([-8, -9.5, -10.5], [16, 5, 21], '#3a2c22', PAT.fur, '#4a3a2e'),                // hair skirt
      box([-5.5, 6, -9.5], [11, 4.5, 9.5], '#4a3a2e', PAT.fur, '#6a5646'),               // shoulder hump
    ] },
    legs: { x: 4.6, zf: -7.4, zb: 7.4, top: 9.5, knee: 4.5, w: 4.8, w2: 4, c: '#3a2c22', hoof: '#1a1410', hoofH: 1.4, pat: PAT.fur },
    head: { pivot: [0, 16, -10.5], tilt: -0.3, boxes: [
      box([-4.5, -4.5, -7], [9, 9, 7.5], '#3a2c22', PAT.fur),
      box([-3.4, -4.8, -8.8], [6.8, 5, 2.2], '#6a5646', PAT.noise),
      box([-3, -8.5, -6.5], [6, 4.5, 5], '#3a2c22', PAT.fur),                             // beard
      box([-8, 2, -4.6], [3.6, 2.2, 2.2], '#e0d8c4', PAT.noise), box([4.4, 2, -4.6], [3.6, 2.2, 2.2], '#e0d8c4', PAT.noise),
      box([-8.6, 3.6, -4.4], [1.8, 4, 1.8], '#e0d8c4', PAT.noise), box([6.8, 3.6, -4.4], [1.8, 4, 1.8], '#e0d8c4', PAT.noise),
    ].concat(E), lids: Lid },
    tail: { pivot: [0, 20, 10.5], rx: 0.2, boxes: [box([-1.5, -9, -0.5], [3, 9.5, 2], '#3a2c22', PAT.fur)] },
  });
}

{ // ---------------- capybara
  const [E, Lid] = eyes(3.05, 1.6, -4.6, 1, 1, '#8a6a48');
  MODELS.capybara = beast({
    height: 15,
    body: { pivot: [0, 7.5, 0], boxes: [box([-5, -4.5, -7.5], [10, 9, 15], '#8a6a48', PAT.fur, '#7a5a3a')] },
    legs: { x: 3, zf: -5, zb: 5, top: 5, knee: 2.5, w: 2.8, w2: 2.4, c: '#6a4e34', pat: PAT.fur },
    head: { pivot: [0, 10, -7], tilt: -0.1, boxes: [
      box([-3, -3, -8.5], [6, 6.5, 9], '#8a6a48', PAT.fur), box([-2.6, -2.6, -8.7], [5.2, 2.6, 0.4], '#3a2a1e', PAT.noise),
    ].concat(E), lids: Lid },
    ears: { pivot: [2.4, 3.4, -1.6], boxes: [box([-0.7, 0, -0.5], [1.4, 1.2, 1], '#6a4e34', PAT.fur)] },
  });
}

{ // ---------------- jaguar
  const [E, Lid] = eyes(3.05, 0.6, -3.8, 1, 1.2, '#1a1814', '#ffd23a');
  MODELS.jaguar = beast({
    height: 15,
    body: { pivot: [0, 10, 0], boxes: [box([-3.5, -3.3, -8], [7, 6.6, 16], '#1a1814', PAT.spots, '#2e2a24', 2)] },
    legs: { x: 2.4, zf: -6, zb: 6, top: 7.5, knee: 3.7, w: 2.8, wb: 3.2, w2: 2.3, c: '#1a1814', pat: PAT.spots },
    head: { pivot: [0, 12, -8], boxes: [
      box([-3, -2.5, -4.8], [6, 5, 5.2], '#1a1814', PAT.spots, '#2e2a24', 2), box([-1.6, -2.5, -7], [3.2, 2.6, 2.6], '#24201a', PAT.fur),
      box([-1.6, -2.6, -5.8], [0.6, 2.2, 0.6], '#e8e4d8', PAT.flat), box([1, -2.6, -5.8], [0.6, 2.2, 0.6], '#e8e4d8', PAT.flat),
    ].concat(E.map(b => b.c[2] < 0.5 ? Object.assign({}, b, { p: PAT.glow }) : b)), lids: Lid },
    ears: { pivot: [2, 2.4, -1.6], boxes: [box([-0.8, 0, -0.5], [1.6, 1.6, 1], '#1a1814', PAT.fur)] },
    tail: { pivot: [0, 11.5, 8], rx: 0.4, boxes: [box([-0.75, -0.75, 0], [1.5, 1.5, 6], '#1a1814', PAT.spots, '#2e2a24', 2)], tip: { pivot: [0, 11.5, 14], rx: -0.4, boxes: [box([-0.75, -0.75, 0], [1.5, 1.5, 6], '#1a1814', PAT.spots, '#2e2a24', 2)] } },
  });
}


// ======================================================================= Phase 6 monster detail pass
{ // shambler: torn tunic, exposed ribs, slack jaw, mushrooms sprouting from the scalp
  const m = MODELS.shambler;
  const body = m.parts[m.index.body], head = m.parts[m.index.head], armL = m.parts[m.index.armL], armR = m.parts[m.index.armR];
  body.boxes.push(
    box([-2.4, 5.5, -2.65], [4.8, 4, 0.2], '#c8c0a8', PAT.stripes, '#4a3a2e', 1),        // ribs through a tear
    box([-4.2, -2.5, -2.7], [2.4, 3, 0.4], '#2e2e22', PAT.cloth), box([1.2, -3, -2.7], [2.6, 3.5, 0.4], '#2e2e22', PAT.cloth), // hanging rags
    box([-4.1, 0.2, -2.6], [8.2, 1, 5.2], '#5a4632', PAT.noise),                          // rope belt
    box([2.6, 9, -2.7], [1.6, 2, 0.4], '#2e2e22', PAT.cloth));
  head.boxes.push(
    box([-2.2, 7.2, -1.2], [1.3, 1.5, 1.3], '#e8e0d0', PAT.flat), box([-2.5, 8.6, -1.5], [2, 0.9, 2], '#b82a2a', PAT.spots, '#f0e8d8', 1), // mushroom
    box([1.5, 7.2, 1], [1, 1, 1], '#e8e0d0', PAT.flat), box([1.2, 8.1, 0.7], [1.6, 0.7, 1.6], '#a8803a', PAT.noise));
  m.parts.push(part('jaw', 'head', [0, 23.5, -1.5], [box([-2.6, -1.8, -2.2], [5.2, 1.8, 4], '#6a7a5a', PAT.moss, '#3e6a22'), box([-2, -0.6, -2.3], [4, 0.6, 0.2], '#d8d0b0', PAT.flat)]));
  for (const a of [armL, armR]) a.boxes.push(box([-1.3, -15.5, -2.2], [0.6, 2, 0.6], '#c8c0a8', PAT.flat), box([0.6, -15.5, -2.2], [0.6, 2, 0.6], '#c8c0a8', PAT.flat));
  m.index.jaw = m.parts.length - 1; m.parts[m.index.jaw].pi = m.index.head;
}
{ // gloomstalker: claws, tattered shadow cloak, slit eyes and a glowing maw
  const m = MODELS.gloomstalker;
  const head = m.parts[m.index.head], armL = m.parts[m.index.armL], armR = m.parts[m.index.armR], body = m.parts[m.index.body];
  head.boxes.push(box([-1.6, 1.2, -2.62], [3.2, 0.5, 0.2], '#b050e0', PAT.glow), box([-2.6, 7.6, -1], [1, 3, 1], '#0e0a12', PAT.noise), box([1.6, 7.6, -1], [1, 3, 1], '#0e0a12', PAT.noise));
  for (const a of [armL, armR]) for (let i = 0; i < 3; i++) a.boxes.push(box([-0.9 + i * 0.7, -24.5, -1.2], [0.35, 4, 0.35], '#24182e', PAT.flat));
  body.boxes.push(box([-3.6, -6, 1.6], [7.2, 19, 0.6], '#0c0910', PAT.cloth, '#1a1222', 2), box([-3, -8, 1.8], [2, 3, 0.4], '#0c0910', PAT.cloth), box([1, -9, 1.8], [2, 4, 0.4], '#0c0910', PAT.cloth),
    box([-4, 13, -1.6], [1.6, 1.6, 3.2], '#1a1222', PAT.noise), box([2.4, 13, -1.6], [1.6, 1.6, 3.2], '#1a1222', PAT.noise));
}
{ // cave crawler: bulbous abdomen with markings, fangs and a cluster of eyes
  const m = MODELS.cave_crawler;
  m.parts[m.index.body].boxes.push(box([-4, -1, 6.5], [8, 6.5, 8], '#2e221c', PAT.spots, '#7a2a1a', 2), box([-1, 3.6, 8], [2, 2, 5], '#a83a20', PAT.flat));
  m.parts[m.index.head].boxes.push(box([-1.6, -3.6, -6.2], [1, 2.4, 1], '#e8e0c8', PAT.flat), box([0.6, -3.6, -6.2], [1, 2.4, 1], '#e8e0c8', PAT.flat),
    box([-1, 1.8, -5.05], [0.7, 0.7, 0.1], '#ff3a2a', PAT.glow), box([0.3, 1.8, -5.05], [0.7, 0.7, 0.1], '#ff3a2a', PAT.glow));
}
{ // thornling: thorns along the limbs and back, faintly glowing heart-wood
  const m = MODELS.thornling;
  const body = m.parts[m.index.body];
  for (const [y, z] of [[3, 2.2], [6, 2.2], [9, 2.2], [11, -2.4]]) body.boxes.push(box([-0.4, y, z], [0.8, 0.8, 1.6 * Math.sign(z)], '#c8b070', PAT.flat));
  body.boxes.push(box([-1.2, 5, -2.1], [2.4, 3, 0.2], '#ffd040', PAT.glow));
  for (const n of ['armL', 'armR']) { const a = m.parts[m.index[n]]; a.boxes.push(box([-1.6, -6, -0.4], [0.8, 0.8, 0.8], '#c8b070', PAT.flat), box([0.9, -9, -0.4], [0.8, 0.8, 0.8], '#c8b070', PAT.flat)); }
}
{ // moss golem: boulder shoulders, mossy beard and little flowers
  const m = MODELS.moss_golem;
  m.parts[m.index.body].boxes.push(box([-10, 12, -4], [5, 6, 8], '#7a7a70', PAT.rock, '#5a5a52'), box([5, 12, -4], [5, 6, 8], '#7a7a70', PAT.rock, '#5a5a52'),
    box([-10.2, 17.6, -2], [1.4, 1.4, 1.4], '#f0d040', PAT.flat), box([8.6, 17.6, 1], [1.4, 1.4, 1.4], '#e86aa0', PAT.flat));
  m.parts[m.index.head].boxes.push(box([-3.5, -3, -4.6], [7, 3.5, 1.2], '#3e6a22', PAT.moss, '#5a8a2a'));
}
{ // frost wraith: icicle crown and a ragged frozen hem
  const m = MODELS.frost_wraith;
  const head = m.parts[m.index.head];
  for (const x of [-3.5, -1, 1.5, 3]) head.boxes.push(box([x - 0.5, 9, -0.5], [1, 3 + Math.abs(x) * 0.4, 1], '#e8f8ff', PAT.ice));
  m.parts[m.index.body].boxes.push(box([-2.5, -9, -0.8], [1.5, 3, 1.5], '#b0d0ff', PAT.ice), box([1, -10, -0.6], [1.2, 3.5, 1.2], '#b0d0ff', PAT.ice));
}
{ // ember fiend: barbed tail with a burning tip
  const m = MODELS.ember_fiend;
  m.parts.push(part('tail', 'body', [0, 8, 2], [box([-0.6, -0.6, 0], [1.2, 1.2, 6], '#241816', PAT.lava, '#ff7a1a'), box([-1, -1, 5.5], [2, 2, 2], '#ffb040', PAT.glow)]));
  m.index.tail = m.parts.length - 1; m.parts[m.index.tail].pi = m.index.body;
}

// ======================================================================= villagers & wizards
export function villagerModel(o) {
  return humanoid({
    legH: 11, legW: 3.5, tw: 8, th: 12, td: 5, aw: 3, ah: 12, hw: 8, hh: 8, hd: 8,
    colors: { leg: o.pants, leg2: o.pants2 || o.pants, body: o.shirt, body2: o.trim || o.shirt, arm: o.sleeve || o.shirt, head: o.skin, head2: o.skin, eye: '#2a2a3a', foot: o.boots || '#3a2a1e' },
    bodyPat: PAT.cloth, bodyParam: o.stripe || 0, armPat: PAT.cloth, legPat: PAT.cloth, headPat: PAT.noise, eyeY: 3.5,
    handL: [box([-1.5, -12, -1.5], [3, 2, 3], o.skin, PAT.noise)],
    handR: [box([-1.5, -12, -1.5], [3, 2, 3], o.skin, PAT.noise)].concat(o.tool ? [box([-0.5, -14, -4], [1, 1, 6], o.tool, PAT.metal)] : []),
    headExtra: [
      box([-4.1, 7, -4.1], [8.2, 2, 8.2], o.hair, PAT.fur, o.hair2 || o.hair),
      box([-4.1, 2, 2.5], [8.2, 6, 1.6], o.hair, PAT.fur, o.hair2 || o.hair),
      box([-1, 2, -4.6], [2, 2.5, 0.6], o.skinDark || o.skin, PAT.noise),
      box([-2.5, 0.8, -4.1], [5, 0.6, 0.1], '#7a3a3a', PAT.flat),
    ].concat(o.hat || []).concat(o.beard ? [box([-3, -2, -4.3], [6, 4, 1], o.beard, PAT.fur)] : []),
    bodyExtra: [].concat(o.apron ? [box([-3.5, 0, -2.7], [7, 10, 0.4], o.apron, PAT.cloth)] : []).concat(o.belt ? [box([-4.1, 3, -2.6], [8.2, 1.2, 5.2], o.belt, PAT.noise)] : []).concat(o.robe ? [box([-4.6, -9, -3], [9.2, 9, 6], o.shirt, PAT.cloth, o.trim || o.shirt, 3)] : []),
    anim: 'villager',
  });
}
