// Large boss models (pixel units). Parts may carry a static `rest` rotation [rx, ry, rz].
import { box, part, PAT } from './models.js';

function finalize(m) {
  const idx = {};
  m.parts.forEach((p, i) => { idx[p.name] = i; });
  for (const p of m.parts) p.pi = p.parent ? idx[p.parent] : -1;
  m.index = idx;
  return m;
}

// ------------------------------------------------------------------ Woolly Mammoth
const FUR = '#6e4a30', FUR2 = '#3a2416', FURD = '#583824', IVORY = '#efe8d6';
export const MAMMOTH = finalize({
  anim: 'mammoth', height: 78,
  parts: [
    part('body', null, [0, 50, 0], [
      box([-21, -17, -32], [42, 36, 64], FUR, PAT.fur, FUR2),
      box([-23, -22, -29], [46, 10, 58], FURD, PAT.fur, FUR2),
      box([-15, 16, -30], [30, 9, 32], FUR, PAT.fur, FUR2),
      box([-22.5, -10, -20], [1, 14, 40], FURD, PAT.fur, FUR2),
      box([21.5, -10, -20], [1, 14, 40], FURD, PAT.fur, FUR2),
    ]),
    part('legFL', null, [-12, 34, -21], [box([-7, -34, -7], [14, 34, 14], FURD, PAT.fur, FUR2), box([-7.5, -34, -7.5], [15, 5, 15], '#2a1e16', PAT.noise), box([-8, -18, -8], [16, 10, 16], FUR, PAT.fur, FUR2)]),
    part('legFR', null, [12, 34, -21], [box([-7, -34, -7], [14, 34, 14], FURD, PAT.fur, FUR2), box([-7.5, -34, -7.5], [15, 5, 15], '#2a1e16', PAT.noise), box([-8, -18, -8], [16, 10, 16], FUR, PAT.fur, FUR2)]),
    part('legBL', null, [-12, 34, 22], [box([-7, -34, -7], [14, 34, 14], FURD, PAT.fur, FUR2), box([-7.5, -34, -7.5], [15, 5, 15], '#2a1e16', PAT.noise), box([-8, -18, -8], [16, 10, 16], FUR, PAT.fur, FUR2)]),
    part('legBR', null, [12, 34, 22], [box([-7, -34, -7], [14, 34, 14], FURD, PAT.fur, FUR2), box([-7.5, -34, -7.5], [15, 5, 15], '#2a1e16', PAT.noise), box([-8, -18, -8], [16, 10, 16], FUR, PAT.fur, FUR2)]),
    part('head', 'body', [0, 62, -31], [
      box([-14, -15, -22], [28, 30, 23], FUR, PAT.fur, FUR2),
      box([-12, 12, -18], [24, 10, 20], FURD, PAT.fur, FUR2),
      box([-14.2, 2, -17], [0.4, 3, 3], '#140e0a', PAT.flat), box([13.8, 2, -17], [0.4, 3, 3], '#140e0a', PAT.flat),
      box([-18, -6, -10], [5, 16, 12], FURD, PAT.fur, FUR2), box([13, -6, -10], [5, 16, 12], FURD, PAT.fur, FUR2),
    ]),
    part('trunk1', 'head', [0, 51, -52], [box([-4.5, -15, -4.5], [9, 16, 9], FURD, PAT.fur, FUR2)], { rest: [0.15, 0, 0] }),
    part('trunk2', 'trunk1', [0, 36, -52], [box([-4, -13, -4], [8, 14, 8], FURD, PAT.fur, FUR2)], { rest: [0.2, 0, 0] }),
    part('trunk3', 'trunk2', [0, 23, -52], [box([-3.5, -11, -3.5], [7, 12, 7], FURD, PAT.fur, FUR2), box([-4, -12, -4], [8, 2.5, 8], '#2a1e16')], { rest: [-0.35, 0, 0] }),
    part('tuskL', 'head', [-9, 49, -48], [box([-2.25, -2.25, -16], [4.5, 4.5, 17], IVORY, PAT.noise, '#d8d0bc')], { rest: [-0.55, 0.12, 0] }),
    part('tuskL2', 'tuskL', [-9, 49, -64], [box([-2, -2, -14], [4, 4, 15], IVORY, PAT.noise, '#d8d0bc')], { rest: [0.85, 0.1, 0] }),
    part('tuskL3', 'tuskL2', [-9, 49, -78], [box([-1.5, -1.5, -10], [3, 3, 11], '#f4eee0', PAT.noise)], { rest: [0.7, 0.15, 0] }),
    part('tuskR', 'head', [9, 49, -48], [box([-2.25, -2.25, -16], [4.5, 4.5, 17], IVORY, PAT.noise, '#d8d0bc')], { rest: [-0.55, -0.12, 0] }),
    part('tuskR2', 'tuskR', [9, 49, -64], [box([-2, -2, -14], [4, 4, 15], IVORY, PAT.noise, '#d8d0bc')], { rest: [0.85, -0.1, 0] }),
    part('tuskR3', 'tuskR2', [9, 49, -78], [box([-1.5, -1.5, -10], [3, 3, 11], '#f4eee0', PAT.noise)], { rest: [0.7, -0.15, 0] }),
    part('tail', 'body', [0, 58, 32], [box([-1.5, -14, -1], [3, 14, 3], FURD, PAT.fur, FUR2), box([-2.5, -18, -1.5], [5, 5, 4], FUR2, PAT.fur)], { rest: [0.2, 0, 0] }),
  ],
});

// ------------------------------------------------------------------ Ancient Forest Warden
const BARK = '#4e3a24', BARK2 = '#33261a', MOSS = '#3e6a22', MOSS2 = '#5a8a2a', BONE = '#d8ccb4';
function antler(side) {
  const s = side;
  return [
    part('antA' + s, 'head', [s * 7, 88, -30], [box([-2, 0, -2], [4, 18, 4], BARK, PAT.bark, BARK2)], { rest: [0.2, 0, -s * 0.5] }),
    part('antB' + s, 'antA' + s, [s * 7, 106, -30], [box([-1.5, 0, -1.5], [3, 14, 3], BARK, PAT.bark, BARK2), box([-6, 10, -6], [12, 8, 12], MOSS, PAT.moss, MOSS2), box([-1, 6, -1], [2, 2, 2], '#60f0ff', PAT.glow)], { rest: [0, 0, s * 0.6] }),
    part('antC' + s, 'antA' + s, [s * 7, 98, -30], [box([-1.5, 0, -1.5], [3, 12, 3], BARK, PAT.bark, BARK2), box([-5, 9, -5], [10, 7, 10], MOSS2, PAT.moss, MOSS)], { rest: [-0.7, 0, -s * 0.5] }),
    part('antD' + s, 'antB' + s, [s * 7, 118, -30], [box([-1.2, 0, -1.2], [2.4, 10, 2.4], BARK, PAT.bark, BARK2), box([-4.5, 8, -4.5], [9, 6, 9], MOSS, PAT.moss, MOSS2)], { rest: [0.5, 0, s * 0.3] }),
  ];
}
export const WARDEN = finalize({
  anim: 'warden', height: 120,
  parts: [
    part('body', null, [0, 56, 0], [
      box([-19, -18, -28], [38, 38, 56], BARK, PAT.bark, BARK2),
      box([-20, 12, -26], [40, 10, 46], MOSS, PAT.moss, MOSS2),
      box([-8, 22, -18], [8, 8, 8], '#2e5a1e', PAT.moss, MOSS2), box([6, 22, -4], [9, 9, 9], '#2e5a1e', PAT.moss, MOSS2), box([-12, 22, 8], [7, 7, 7], '#2e5a1e', PAT.moss, MOSS2),
      box([-2, 30, -15], [2, 4, 2], '#60f0ff', PAT.glow), box([9, 31, -1], [2, 3, 2], '#60f0ff', PAT.glow), box([-10, 29, 10], [2, 3, 2], '#60f0ff', PAT.glow),
      box([-7, -6, -28.6], [14, 16, 1], '#9aff6a', PAT.glow),
      box([-19.5, -18, -20], [1, 20, 30], BARK2, PAT.bark, BARK),
      box([18.5, -18, -20], [1, 20, 30], BARK2, PAT.bark, BARK),
    ]),
    part('legFL', null, [-13, 38, -18], [box([-8, -38, -8], [16, 38, 16], BARK, PAT.bark, BARK2), box([-11, -38, -12], [5, 4, 8], BARK2, PAT.bark), box([6, -38, -12], [5, 4, 8], BARK2, PAT.bark), box([-3, -38, -14], [6, 4, 8], BARK2, PAT.bark)]),
    part('legFR', null, [13, 38, -18], [box([-8, -38, -8], [16, 38, 16], BARK, PAT.bark, BARK2), box([-11, -38, -12], [5, 4, 8], BARK2, PAT.bark), box([6, -38, -12], [5, 4, 8], BARK2, PAT.bark), box([-3, -38, -14], [6, 4, 8], BARK2, PAT.bark)]),
    part('legBL', null, [-13, 34, 20], [box([-7, -34, -7], [14, 34, 14], BARK, PAT.bark, BARK2), box([-9, -34, -10], [18, 4, 6], BARK2, PAT.bark)]),
    part('legBR', null, [13, 34, 20], [box([-7, -34, -7], [14, 34, 14], BARK, PAT.bark, BARK2), box([-9, -34, -10], [18, 4, 6], BARK2, PAT.bark)]),
    part('head', 'body', [0, 70, -28], [
      box([-11, -10, -24], [22, 22, 24], BARK, PAT.bark, BARK2),
      box([-9, -14, -32], [18, 14, 12], BONE, PAT.rock, '#a89a80'),
      box([-9.5, 2, -24.4], [5, 3, 0.6], '#9aff6a', PAT.glow), box([4.5, 2, -24.4], [5, 3, 0.6], '#9aff6a', PAT.glow),
      box([-12, 6, -20], [24, 8, 18], MOSS, PAT.moss, MOSS2),
    ]),
  ].concat(antler(-1), antler(1)),
});

// ------------------------------------------------------------------ Desert Titan
const SAND = '#d2b07a', SAND2 = '#a88a58', GOLD = '#e0b040', LAPIS = '#2a4aa0';
export const TITAN = finalize({
  anim: 'titan', height: 140,
  parts: [
    part('legL', null, [-14, 46, 0], [box([-9, -46, -9], [18, 46, 18], SAND, PAT.rock, SAND2), box([-11, -46, -13], [22, 8, 24], SAND2, PAT.rock, SAND)]),
    part('legR', null, [14, 46, 0], [box([-9, -46, -9], [18, 46, 18], SAND, PAT.rock, SAND2), box([-11, -46, -13], [22, 8, 24], SAND2, PAT.rock, SAND)]),
    part('body', null, [0, 46, 0], [
      box([-26, 0, -13], [52, 44, 26], SAND, PAT.rock, SAND2),
      box([-28, 34, -15], [56, 12, 30], SAND2, PAT.rock, SAND),
      box([-20, 10, -13.6], [40, 3, 1], '#ffb030', PAT.glow), box([-3, 14, -13.6], [6, 18, 1], '#ffb030', PAT.glow), box([-14, 24, -13.6], [28, 3, 1], '#ffb030', PAT.glow),
      box([-27, -2, -14], [54, 6, 28], GOLD, PAT.metal),
    ]),
    part('armL', 'body', [-34, 86, 0], [box([-8, -44, -8], [16, 46, 16], SAND, PAT.rock, SAND2), box([-11, -60, -11], [22, 18, 22], SAND2, PAT.rock, SAND), box([-9, -12, -9], [18, 6, 18], GOLD, PAT.metal)]),
    part('armR', 'body', [34, 86, 0], [box([-8, -44, -8], [16, 46, 16], SAND, PAT.rock, SAND2), box([-11, -60, -11], [22, 18, 22], SAND2, PAT.rock, SAND), box([-9, -12, -9], [18, 6, 18], GOLD, PAT.metal)]),
    part('head', 'body', [0, 90, -2], [
      box([-15, 0, -16], [30, 30, 28], SAND, PAT.rock, SAND2),
      box([-21, -6, -8], [42, 34, 22], LAPIS, PAT.stripes, GOLD, 3),
      box([-16, 28, -12], [32, 8, 20], LAPIS, PAT.stripes, GOLD, 3),
      box([-10, 12, -16.6], [7, 4, 1], '#ffa020', PAT.glow), box([3, 12, -16.6], [7, 4, 1], '#ffa020', PAT.glow),
      box([-6, 2, -18], [12, 6, 3], SAND2, PAT.rock),
      box([-4, -6, -14], [8, 8, 10], GOLD, PAT.metal),
    ]),
  ],
});

// ------------------------------------------------------------------ Frost Wyrm (head + segments rendered along a path)
const ICE = '#a8c8f0', ICE2 = '#e8f4ff', ICED = '#7aa0d8';
export const WYRM_HEAD = finalize({
  anim: 'none', height: 20,
  parts: [
    part('head', null, [0, 0, 0], [
      box([-9, -7, -14], [18, 14, 26], ICE, PAT.scales, ICE2),
      box([-7, -11, -28], [14, 6, 18], ICED, PAT.scales, ICE2),
      box([-8, -2, -30], [16, 8, 18], ICE, PAT.ice, ICE2),
      box([-9.2, 1, -10], [0.4, 3, 4], '#60f0ff', PAT.glow), box([8.8, 1, -10], [0.4, 3, 4], '#60f0ff', PAT.glow),
      box([-6, -9, -29], [1, 3, 1], '#ffffff'), box([5, -9, -29], [1, 3, 1], '#ffffff'),
    ]),
    part('jaw', 'head', [0, -6, -12], [box([-7, -4, -16], [14, 4, 17], ICED, PAT.scales, ICE2)]),
    part('hornL', 'head', [-7, 6, 4], [box([-2, 0, 0], [4, 4, 18], ICE2, PAT.ice), box([-1.5, 2, 16], [3, 6, 3], ICE2, PAT.ice)], { rest: [0.5, -0.3, 0] }),
    part('hornR', 'head', [7, 6, 4], [box([-2, 0, 0], [4, 4, 18], ICE2, PAT.ice), box([-1.5, 2, 16], [3, 6, 3], ICE2, PAT.ice)], { rest: [0.5, 0.3, 0] }),
    part('crest', 'head', [0, 7, 0], [box([-1, 0, -6], [2, 8, 14], ICE2, PAT.glow)], { rest: [0.3, 0, 0] }),
  ],
});
export function wyrmSegment(i, n) {
  const t = i / n;
  const w = 16 - t * 10, h = 14 - t * 8;
  const boxes = [box([-w / 2, -h / 2, -9], [w, h, 18], ICE, PAT.scales, ICE2), box([-w / 2 + 1, -h / 2 - 0.5, -8], [w - 2, 1, 16], '#d8e8ff', PAT.ice)];
  if (i % 2 === 0) boxes.push(box([-1, h / 2, -4], [2, 6 - t * 3, 6], ICE2, PAT.ice));
  if (i === 2 || i === 4) { boxes.push(box([-w / 2 - 18, 0, -6], [18, 1.5, 14], '#c8e0ff', PAT.ice, ICE2)); boxes.push(box([w / 2, 0, -6], [18, 1.5, 14], '#c8e0ff', PAT.ice, ICE2)); }
  if (i === n - 1) boxes.push(box([-6, -1, 6], [12, 2, 12], ICE2, PAT.ice));
  return boxes;
}

// ------------------------------------------------------------------ Volcanic Behemoth
const ROCK = '#221816', LAVA = '#ff6a1a', HORN = '#141010';
export const BEHEMOTH = finalize({
  anim: 'behemoth', height: 150,
  parts: [
    part('body', null, [0, 72, 0], [
      box([-30, -24, -32], [60, 50, 64], ROCK, PAT.lava, LAVA),
      box([-34, 14, -34], [68, 18, 40], '#2e201c', PAT.lava, '#ff8a2a'),
      box([-10, 30, -20], [6, 10, 6], '#1a1210', PAT.lava, LAVA), box([4, 30, -8], [6, 12, 6], '#1a1210', PAT.lava, LAVA), box([-6, 28, 8], [6, 9, 6], '#1a1210', PAT.lava, LAVA),
      box([-8, -10, -32.6], [16, 18, 1], '#ffb030', PAT.glow),
    ], { rest: [-0.18, 0, 0] }),
    part('legFL', null, [-24, 58, -22], [box([-11, -58, -11], [22, 58, 22], ROCK, PAT.lava, LAVA), box([-13, -58, -15], [26, 10, 28], '#1a1210', PAT.rock, '#3a2a24')]),
    part('legFR', null, [24, 58, -22], [box([-11, -58, -11], [22, 58, 22], ROCK, PAT.lava, LAVA), box([-13, -58, -15], [26, 10, 28], '#1a1210', PAT.rock, '#3a2a24')]),
    part('legBL', null, [-22, 44, 24], [box([-10, -44, -10], [20, 44, 20], ROCK, PAT.lava, LAVA), box([-12, -44, -13], [24, 8, 24], '#1a1210', PAT.rock)]),
    part('legBR', null, [22, 44, 24], [box([-10, -44, -10], [20, 44, 20], ROCK, PAT.lava, LAVA), box([-12, -44, -13], [24, 8, 24], '#1a1210', PAT.rock)]),
    part('head', 'body', [0, 92, -34], [
      box([-17, -16, -30], [34, 30, 32], ROCK, PAT.lava, LAVA),
      box([-15, -22, -34], [30, 10, 24], '#1a1210', PAT.rock, '#3a2a24'),
      box([-12, -18, -34.4], [24, 4, 1], '#ffd040', PAT.glow),
      box([-12, 2, -30.6], [7, 4, 1], '#ffd040', PAT.glow), box([5, 2, -30.6], [7, 4, 1], '#ffd040', PAT.glow),
    ]),
    part('hornL', 'head', [-15, 104, -46], [box([-4, -4, 0], [8, 8, 22], HORN, PAT.rock, '#3a2a24')], { rest: [0.6, -0.6, 0] }),
    part('hornL2', 'hornL', [-15, 104, -24], [box([-3, -3, 0], [6, 6, 20], HORN, PAT.rock, '#3a2a24'), box([-2, -2, 18], [4, 4, 6], '#ff8a2a', PAT.glow)], { rest: [-0.9, 0, 0] }),
    part('hornR', 'head', [15, 104, -46], [box([-4, -4, 0], [8, 8, 22], HORN, PAT.rock, '#3a2a24')], { rest: [0.6, 0.6, 0] }),
    part('hornR2', 'hornR', [15, 104, -24], [box([-3, -3, 0], [6, 6, 20], HORN, PAT.rock, '#3a2a24'), box([-2, -2, 18], [4, 4, 6], '#ff8a2a', PAT.glow)], { rest: [-0.9, 0, 0] }),
    part('tail', 'body', [0, 80, 32], [box([-6, -6, 0], [12, 12, 26], ROCK, PAT.lava, LAVA), box([-2, 6, 6], [4, 8, 4], HORN), box([-2, 6, 16], [4, 6, 4], HORN)], { rest: [-0.4, 0, 0] }),
  ],
});

// ------------------------------------------------------------------ Dragon
const SCALE = '#5a2a6a', SCALE2 = '#8a4aa8', BELLY = '#d8b070', WINGM = '#3a1a4a';
export const DRAGON = finalize({
  anim: 'dragon', height: 60,
  parts: [
    part('body', null, [0, 30, 0], [box([-11, -10, -24], [22, 20, 48], SCALE, PAT.scales, SCALE2), box([-9, -11, -20], [18, 2, 40], BELLY, PAT.stripes, '#b8904a', 2), box([-1, 10, -20], [2, 5, 4], '#e8d8f0'), box([-1, 10, -8], [2, 6, 4], '#e8d8f0'), box([-1, 10, 4], [2, 5, 4], '#e8d8f0')]),
    part('neck', 'body', [0, 36, -24], [box([-6, -6, -18], [12, 12, 20], SCALE, PAT.scales, SCALE2), box([-1, 6, -16], [2, 4, 4], '#e8d8f0')], { rest: [0.5, 0, 0] }),
    part('head', 'neck', [0, 44, -40], [box([-7, -5, -20], [14, 11, 22], SCALE, PAT.scales, SCALE2), box([-5, -9, -26], [10, 6, 14], SCALE2, PAT.scales), box([-7.2, 0, -14], [0.4, 2.5, 3], '#ffd040', PAT.glow), box([6.8, 0, -14], [0.4, 2.5, 3], '#ffd040', PAT.glow), box([-6, 4, -2], [3, 3, 14], '#e8d8f0'), box([3, 4, -2], [3, 3, 14], '#e8d8f0')], { rest: [-0.5, 0, 0] }),
    part('wingL', 'body', [-11, 38, -10], [box([-34, -1, -8], [34, 2, 14], SCALE2, PAT.scales, SCALE), box([-30, -0.5, -4], [30, 1, 28], WINGM, PAT.noise, SCALE)]),
    part('wingL2', 'wingL', [-45, 38, -10], [box([-28, -1, -6], [28, 2, 10], SCALE2, PAT.scales), box([-26, -0.5, -2], [26, 1, 24], WINGM, PAT.noise)]),
    part('wingR', 'body', [11, 38, -10], [box([0, -1, -8], [34, 2, 14], SCALE2, PAT.scales, SCALE), box([0, -0.5, -4], [30, 1, 28], WINGM, PAT.noise, SCALE)]),
    part('wingR2', 'wingR', [45, 38, -10], [box([0, -1, -6], [28, 2, 10], SCALE2, PAT.scales), box([0, -0.5, -2], [26, 1, 24], WINGM, PAT.noise)]),
    part('legFL', null, [-9, 20, -14], [box([-3.5, -20, -3.5], [7, 20, 7], SCALE, PAT.scales, SCALE2), box([-4, -20, -7], [8, 3, 9], '#2a1a2e')]),
    part('legFR', null, [9, 20, -14], [box([-3.5, -20, -3.5], [7, 20, 7], SCALE, PAT.scales, SCALE2), box([-4, -20, -7], [8, 3, 9], '#2a1a2e')]),
    part('legBL', null, [-9, 20, 16], [box([-4, -20, -4], [8, 20, 8], SCALE, PAT.scales, SCALE2), box([-4.5, -20, -8], [9, 3, 10], '#2a1a2e')]),
    part('legBR', null, [9, 20, 16], [box([-4, -20, -4], [8, 20, 8], SCALE, PAT.scales, SCALE2), box([-4.5, -20, -8], [9, 3, 10], '#2a1a2e')]),
    part('tail1', 'body', [0, 30, 24], [box([-7, -7, 0], [14, 14, 20], SCALE, PAT.scales, SCALE2)], { rest: [-0.15, 0, 0] }),
    part('tail2', 'tail1', [0, 30, 44], [box([-5, -5, 0], [10, 10, 18], SCALE, PAT.scales, SCALE2)], { rest: [-0.1, 0, 0] }),
    part('tail3', 'tail2', [0, 30, 62], [box([-3, -3, 0], [6, 6, 16], SCALE, PAT.scales, SCALE2), box([-6, -0.5, 10], [12, 1, 10], SCALE2, PAT.scales)], { rest: [0.05, 0, 0] }),
  ],
});
