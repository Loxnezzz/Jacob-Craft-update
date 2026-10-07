// Phase 6: third-person player model ("Jacob") with walk/sneak/ride/sleep poses, attack swings, held item and armor.
import { personModel } from '../mobs/people.js';
import { box, PAT } from '../mobs/models.js';
import { ITEMS } from './items.js';
import { mat4 } from '../core/math.js';
import { heldModel, pushHeldModel } from '../gfx/heldModels.js';

// Jacob: a weathered survivor in his forties — short dark hair greying at the temples, trimmed beard, an old scar
// through the brow, a worn leather coat over a slate shirt, fingerless gloves, a satchel and a rust-red neckerchief.
export const JACOB = {
  skin: '#c49072', skinDark: '#a2725a', hair: '#35261b', hair2: '#2a1d14', hairStyle: 'short', temples: '#7a726a',
  beard: '#3e2d20', beardStyle: 'trimmed', eye: '#5a6440', eyeStyle: 'narrow', brow: '#2a1d14', scar: '#a86a58', lip: '#7a4a42',
  shirt: '#4a5662', shirt2: '#3d4752', collar: '#4a5662', coat: '#5e4130', coat2: '#4a3324', sleeve: '#5e4130', cuff: '#3a2a1e',
  gloves: '#3a2a1e', gloves2: '#2c2016', pants: '#3e3b35', pants2: '#33302b', kneePatch: '#4c483f', boots: '#2e2219',
  belt: '#2a1e14', buckle: '#9a8a62', pouch: '#5a4430', scarf: '#7a3a2c', scarf2: '#64302a', strap: '#3a2a1c', satchel: '#6a4c32',
  wide: 1.12, headScale: 0.9,
};
const ARMOR_COL = { leather: ['#7a4a26', '#5a3418'], copper: ['#c06a36', '#8c4622'], iron: ['#c4c8d0', '#8a8e96'], gold: ['#e8bc28', '#b48a12'], diamond: ['#4cd6df', '#239fab'], emberite: ['#7c281c', '#e04e18'] };

function armorBoxes(p) {
  const out = { head: [], body: [], armL: [], armR: [], legL: [], legR: [] };
  const slots = p.armor.slots;
  const tierOf = (s) => { if (!s) return null; const n = ITEMS[s.id].name; return Object.keys(ARMOR_COL).find(k => n.startsWith(k)); };
  const h = tierOf(slots[0]), c = tierOf(slots[1]), l = tierOf(slots[2]), b = tierOf(slots[3]);
  if (h) { const [a, a2] = ARMOR_COL[h]; out.head.push(box([-4.5, 6.8, -4.5], [9, 1.9, 9], a, PAT.metal, a2), box([-4.55, 2.4, -4.5], [0.6, 4.6, 9], a, PAT.metal, a2), box([3.95, 2.4, -4.5], [0.6, 4.6, 9], a, PAT.metal, a2), box([-4.5, 0.6, 3.9], [9, 6.4, 0.6], a, PAT.metal, a2), box([-4.55, 5.5, -4.6], [9.1, 1.3, 0.6], a2, PAT.metal)); }
  if (c) { const [a, a2] = ARMOR_COL[c]; out.body.push(box([-4.45, 0.8, -2.6], [8.9, 10, 5.2], a, PAT.metal, a2), box([-2.5, 4, -2.75], [5, 5, 0.3], a2, PAT.metal)); for (const k of ['armL', 'armR']) out[k].push(box([-1.85, -3.2, -1.9], [3.7, 4.4, 3.8], a, PAT.metal, a2)); }
  if (l) { const [a, a2] = ARMOR_COL[l]; for (const k of ['legL', 'legR']) out[k].push(box([-2.1, -7.6, -2.1], [4.2, 8, 4.2], a, PAT.metal, a2)); out.body.push(box([-4.3, -0.4, -2.4], [8.6, 1.6, 4.8], a2, PAT.metal)); }
  if (b) { const [a, a2] = ARMOR_COL[b]; for (const k of ['legL', 'legR']) out[k].push(box([-2.25, -11.1, -2.55], [4.5, 4.2, 4.9], a, PAT.metal, a2)); }
  return out;
}

export function installPlayerModel(game) {
  let cacheKey = '', model = null, mats = null;
  const TMP = mat4.create();
  const st = { bodyYaw: 0, swingT: 0 };
  const buildModel = (p) => {
    const key = p.armor.slots.map(s => s ? s.id : 0).join(',');
    if (key === cacheKey && model) return model;
    cacheKey = key;
    const base = personModel(JACOB);
    const arm = armorBoxes(p);
    model = Object.assign({}, base, { parts: base.parts.map(pt => Object.assign({}, pt, { boxes: pt.boxes.concat(arm[pt.name] || []) })) });
    mats = model.parts.map(() => mat4.create());
    return model;
  };

  game.playerModel = (er, F) => {
    const p = game.player;
    if (!p || p.dead) return;
    const m = buildModel(p);
    const t = game.time;
    // body follows movement; when standing still it lags behind the view by up to ~50 degrees
    const moving = Math.hypot(p.vx, p.vz) > 0.5;
    let target = moving ? Math.atan2(-p.vx, -p.vz) : st.bodyYaw;
    let dv = p.yaw - target; while (dv > Math.PI) dv -= Math.PI * 2; while (dv < -Math.PI) dv += Math.PI * 2;
    if (moving && Math.abs(dv) > 1.2) target = p.yaw; // walking backwards keeps facing the view
    let dLag = p.yaw - st.bodyYaw; while (dLag > Math.PI) dLag -= Math.PI * 2; while (dLag < -Math.PI) dLag += Math.PI * 2;
    if (!moving && Math.abs(dLag) > 0.85) target = p.yaw - Math.sign(dLag) * 0.85;
    let dt = target - st.bodyYaw; while (dt > Math.PI) dt -= Math.PI * 2; while (dt < -Math.PI) dt += Math.PI * 2;
    st.bodyYaw += dt * Math.min(1, (F.dt || 0.016) * (moving ? 10 : 6));
    if (p.riding && p.riding.yaw !== undefined) st.bodyYaw = p.riding.yaw;   // a rider sits square in the saddle
    let headYaw = p.yaw - st.bodyYaw; while (headYaw > Math.PI) headYaw -= Math.PI * 2; while (headYaw < -Math.PI) headYaw += Math.PI * 2;
    headYaw = Math.max(-1.1, Math.min(1.1, headYaw));
    // pose
    const P = m.parts.map(() => [0, 0, 0, 0, 0, 0]);
    const S = (n, rx = 0, ry = 0, rz = 0, tx = 0, ty = 0, tz = 0) => { const i = m.index[n]; if (i === undefined) return; const q = P[i]; q[0] += rx; q[1] += ry; q[2] += rz; q[3] += tx; q[4] += ty; q[5] += tz; };
    const walk = Math.sin(p.bobPhase || 0) * (p.bobAmt || 0) * (p.sprinting ? 1.05 : 0.75);
    const riding = !!p.riding;
    // (on this model a positive pitch swings a limb forward)
    if (riding) {
      // straddling: thighs forward and out around the horse's barrel
      S('legL', 0.85, 0.12, -0.62); S('legR', 0.85, -0.12, 0.62);
      const hs = Math.hypot(p.riding.vx || 0, p.riding.vz || 0);
      if (hs > 8) S('body', -0.2 * Math.min(1, (hs - 8) / 3), 0, 0);
      if (p.riding.landT) S('body', -0.15 * Math.sin(p.riding.landT * Math.PI));
    }
    else { S('legL', walk); S('legR', -walk); }
    S('armL', -walk * 0.8 + Math.sin(t * 1.3) * 0.04, 0, -0.06);
    S('armR', walk * 0.8 - Math.sin(t * 1.3) * 0.04, 0, 0.06);
    if (p.sneaking && !riding) { S('body', -0.42, 0, 0, 0, -1, 0); S('head', 0.3); S('legL', 0, 0, 0, 0, -1, 1.5); S('legR', 0, 0, 0, 0, -1, 1.5); S('armL', 0.35); S('armR', 0.35); }
    if (p.flying && !riding) { S('armL', 0.2, 0, -0.25); S('armR', 0.2, 0, 0.25); }
    // attack / use swing
    // attack / mining swing: the arm comes up in front and chops down (positive pitch swings the arm forward)
    if (p.swing > 0) {
      const u = 1 - p.swing, up = Math.sin(Math.sqrt(u) * Math.PI), down = Math.sin(u * Math.PI);
      S('armR', 1.25 * up + 0.35 * down, -0.3 * up, 0.1 * up);
      S('body', 0, 0.22 * up, 0);
    }
    const held = p.held(), it = held ? ITEMS[held.id] : null;
    const ia = game.interaction;
    if (it && it.tool && (it.tool.type === 'bow') && ia.bowDraw > 0) { S('armR', 1.55, 0.1); S('armL', 1.5, 0.5); }
    else if (it && it.tool && (it.tool.type === 'crossbow' || it.tool.type === 'gun')) { S('armR', 1.35, 0.15); S('armL', 1.3, 0.55); }
    else if (it && !p.swing) S('armR', 0.3);   // hold the item a little out in front
    if (riding && !p.swing && !(it && it.tool && ['bow', 'crossbow', 'gun'].includes(it.tool.type))) { S('armL', 0.55, 0, 0.12); if (!it) S('armR', 0.55, 0, -0.12); }   // hands on the reins
    const offIt = p.offhand && p.offhand.slots[0] ? ITEMS[p.offhand.slots[0].id] : null;
    if (offIt && !(it && it.tool && ['bow', 'crossbow', 'gun'].includes(it.tool.type))) {
      if (p.blocking && offIt.tool && offIt.tool.type === 'shield') S('armL', 1.1, -0.45, 0.1);
      else if (p.swingOff > 0) { const u = 1 - p.swingOff; S('armL', 1.1 * Math.sin(Math.sqrt(u) * Math.PI), 0.3 * Math.sin(u * Math.PI)); }
      else S('armL', 0.3);
    }
    if (p.blocking && it && it.tool && it.tool.type === 'shield') S('armR', 1.1, 0.45, -0.1);
    if (ia.eating) { S('armR', 1.2 + Math.sin(t * 16) * 0.12, 0.5); S('head', 0.15); }
    S('head', -p.pitch, headYaw);
    S('body', 0, 0, 0, 0, Math.sin(t * 2.2) * 0.1, 0);
    // world transform
    const cam = F.camPos;
    const W = mat4.create();
    let py = p.y;
    if (game.sleeping) py += 0.1;
    mat4.translate(W, W, p.x - cam[0], py - cam[1], p.z - cam[2]);
    mat4.rotateY(W, W, st.bodyYaw);
    if (game.sleeping) { mat4.rotateX(W, W, -Math.PI / 2); mat4.translate(W, W, 0, -0.9, -0.3); }
    const sc = 0.95 / 16;
    mat4.scale(W, W, sc, sc, sc);
    const l = game.world.getLight(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z));
    const light = [(l >> 4) / 15, (l & 15) / 15, Math.max(0, p.hurtTime || 0) * 1.6, 0];
    for (let i = 0; i < m.parts.length; i++) {
      const part = m.parts[i], pose = P[i], M = mats[i];
      M.set(part.pi >= 0 ? mats[part.pi] : W);
      const pv = part.pivot;
      mat4.translate(M, M, pv[0] + pose[3], pv[1] + pose[4], pv[2] + pose[5]);
      if (pose[1]) mat4.rotateY(M, M, pose[1]);
      if (pose[0]) mat4.rotateX(M, M, pose[0]);
      if (pose[2]) mat4.rotateZ(M, M, pose[2]);
      mat4.translate(M, M, -pv[0], -pv[1], -pv[2]);
      for (let k = 0; k < part.boxes.length; k++) {
        const b = part.boxes[k];
        TMP.set(M);
        mat4.translate(TMP, TMP, pv[0] + b.o[0], pv[1] + b.o[1], pv[2] + b.o[2]);
        mat4.scale(TMP, TMP, b.s[0], b.s[1], b.s[2]);
        er.pushBox(TMP, b.c, b.p, b.c2, b.pa, b.s[0], b.s[1], b.s[2], (i * 3 + k) % 97, light);
      }
    }
    // held items: main hand on the right arm, off-hand on the left
    const drawHeld = (stack, armName, side) => {
      const item = ITEMS[stack.id];
      const A = mats[m.index[armName]];
      const hand = [m.hand[0] * side, m.hand[1], m.hand[2]]; // model-space grip point
      const H = mat4.create(); H.set(A);
      mat4.translate(H, H, hand[0], hand[1], hand[2]);
      const model3d = heldModel(item, { loaded: !!stack.loaded, load: side > 0 ? (ia.loadT || 0) : 0 });
      if (model3d && model3d.isShield) {
        // a shield faces forward from the hand (raised in front of the chest while blocking)
        const hp = [H[12], H[13], H[14]];
        const G = mat4.create(); G.set(mats[m.index.body]); G[12] = hp[0]; G[13] = hp[1]; G[14] = hp[2];
        mat4.rotateY(G, G, side * (p.blocking ? 0.15 : 0.6));
        mat4.scale(G, G, 16, 16, 16);
        pushHeldModel(er, model3d, G, mat4.create(), light);
      } else if (model3d && model3d.isTool) {
        // tools ride on the arm, handle forward out of the fist; torches and lanterns are held upright
        const T = mat4.create(); T.set(H);
        mat4.rotateX(T, T, model3d.upright ? 0.25 : -Math.PI / 2 + 0.3);
        mat4.scale(T, T, 16, 16, 16);
        pushHeldModel(er, model3d, T, mat4.create(), light);
      } else if (model3d) {
        // position from the hand, orientation from the body: aimed along the view while using ranged weapons
        const hp = [H[12], H[13], H[14]];
        const Bm = mats[m.index.body];
        const G = mat4.create(); G.set(Bm); G[12] = hp[0]; G[13] = hp[1]; G[14] = hp[2];
        const aiming = (item.tool.type === 'crossbow' || item.tool.type === 'gun') || (item.tool.type === 'spear' && ia.bowDraw > 0);
        mat4.rotateY(G, G, headYaw * (aiming ? 0.8 : 0.3));
        mat4.rotateX(G, G, aiming ? p.pitch : -0.25);
        if (item.tool.type === 'spear' && !aiming) mat4.rotateX(G, G, 0.9);   // carried upright-ish
        mat4.scale(G, G, 16, 16, 16);
        pushHeldModel(er, model3d, G, mat4.create(), light);
      } else {
        const isBlock = item.block >= 0 && !item.flatIcon;
        mat4.rotateX(H, H, -Math.PI / 2);
        if (isBlock) { mat4.translate(H, H, 0, -1, -1.5); mat4.scale(H, H, 6, 6, 6); }
        else { mat4.translate(H, H, 0, -4, -1); mat4.rotateY(H, H, Math.PI / 2); mat4.rotateZ(H, H, Math.PI / 4); mat4.scale(H, H, 10, 10, 10); }
        game.entities.itemDraw.push([stack.id, H, [light[0], light[1], 0, item.glow ? 0.5 : 0]]);
      }
    };
    if (held) drawHeld(held, 'armR', 1);
    const off = p.offhand && p.offhand.slots[0];
    if (off) drawHeld(off, 'armL', -1);
  };
}

// ---------------------------------------------------------------- inventory portrait
// A small software render of Jacob (with his current armor) for the inventory screen: boxes are posed, turned to a
// three-quarter view, split into faces and painted back-to-front. The head (and a little of the body) follows the mouse.
const rotAround = (q, pv, ry, rx) => {
  let x = q[0] - pv[0], y = q[1] - pv[1], z = q[2] - pv[2];
  if (rx) { const c = Math.cos(rx), s = Math.sin(rx); const y2 = y * c - z * s; z = y * s + z * c; y = y2; }
  if (ry) { const c = Math.cos(ry), s = Math.sin(ry); const x2 = x * c + z * s; z = -x * s + z * c; x = x2; }
  return [x + pv[0], y + pv[1], z + pv[2]];
};
const FACES = [[0, 1, 3, 2, [-1, 0, 0]], [4, 6, 7, 5, [1, 0, 0]], [0, 4, 5, 1, [0, -1, 0]], [2, 3, 7, 6, [0, 1, 0]], [0, 2, 6, 4, [0, 0, -1]], [1, 5, 7, 3, [0, 0, 1]]];
export function drawPlayerPortrait(canvas, p, lookX = 0, lookY = 0) {
  const base = personModel(JACOB), arm = armorBoxes(p);
  const parts = base.parts.map(pt => Object.assign({}, pt, { boxes: pt.boxes.concat(arm[pt.name] || []) }));
  const headYaw = Math.max(-0.9, Math.min(0.9, lookX)), headPitch = Math.max(-0.6, Math.min(0.6, lookY));
  const pose = parts.map(pt => pt.name === 'head' ? [headYaw * 0.7, -headPitch] : pt.name === 'armL' || pt.name === 'armR' ? [0, 0] : [0, 0]);
  const viewYaw = 0.5 + headYaw * 0.3, viewPitch = -0.16;
  const cy = Math.cos(viewYaw), sy = Math.sin(viewYaw), cp = Math.cos(viewPitch), sp = Math.sin(viewPitch);
  const view = (q) => { const x = q[0] * cy + q[2] * sy, z0 = -q[0] * sy + q[2] * cy, y = (q[1] - 16) * cp - z0 * sp, z = (q[1] - 16) * sp + z0 * cp; return [x, y, z]; };
  const xf = (i, q) => { let j = i; while (j >= 0) { q = rotAround(q, parts[j].pivot, pose[j][0], pose[j][1]); j = parts[j].pi; } return view(q); };
  const L = [-0.45, 0.7, -0.55];
  // z-buffered at twice the canvas size, then smoothed down: small features (eyes, brows, buttons) always sit on
  // top of the surfaces they belong to, which a back-to-front face sort cannot guarantee
  const SS = 2, W = canvas.width, H = canvas.height, w = W * SS, h = H * SS, sc = h / 41, ox = w / 2, oy = h * 0.46;
  let zb = canvas._zb;
  if (!zb || zb.w !== w || zb.h !== h) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    zb = canvas._zb = { w, h, z: new Float32Array(w * h), cv, cx: cv.getContext('2d') };
    zb.img = zb.cx.createImageData(w, h);
  }
  const Z = zb.z, px = zb.img.data;
  Z.fill(1e9); px.fill(0);
  const tri = (a, b, c, r, g, bl, bias) => {
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 1e-6) return;
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(w - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(h - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const inv = 1 / area;
    for (let y = y0; y <= y1; y++) {
      const py = y + 0.5;
      for (let x = x0; x <= x1; x++) {
        const qx = x + 0.5;
        const w0 = ((b[0] - qx) * (c[1] - py) - (b[1] - py) * (c[0] - qx)) * inv;
        const w1 = ((c[0] - qx) * (a[1] - py) - (c[1] - py) * (a[0] - qx)) * inv;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
        const d = w0 * a[2] + w1 * b[2] + w2 * c[2] + bias, k = y * w + x;
        if (d >= Z[k]) continue;
        Z[k] = d; const o = k * 4;
        px[o] = r; px[o + 1] = g; px[o + 2] = bl; px[o + 3] = 255;
      }
    }
  };
  parts.forEach((pt, i) => {
    const pv = pt.pivot;
    for (const b of pt.boxes) {
      const o = [pv[0] + b.o[0], pv[1] + b.o[1], pv[2] + b.o[2]], s = b.s;
      const bias = Math.min(s[0], s[1], s[2]) <= 1.01 ? -0.06 : 0;   // thin details win ties with the surface beneath
      const V = [];
      for (let k = 0; k < 8; k++) {
        const q = xf(i, [o[0] + (k & 4 ? s[0] : 0), o[1] + (k & 2 ? s[1] : 0), o[2] + (k & 1 ? s[2] : 0)]);
        V.push([ox + q[0] * sc, oy - q[1] * sc, q[2]]);
      }
      const c0 = xf(i, o);
      for (const f of FACES) {
        const n = xf(i, [o[0] + f[4][0], o[1] + f[4][1], o[2] + f[4][2]]);
        const N = [n[0] - c0[0], n[1] - c0[1], n[2] - c0[2]];
        if (N[2] >= -0.02) continue; // facing away
        const lit = 0.58 + 0.5 * Math.max(0, N[0] * L[0] + N[1] * L[1] + N[2] * L[2]);
        const col = f[4][1] !== 0 ? b.c2 : b.c;
        const r = Math.min(255, Math.round(col[0] * lit * 255)), g = Math.min(255, Math.round(col[1] * lit * 255)), bl = Math.min(255, Math.round(col[2] * lit * 255));
        tri(V[f[0]], V[f[1]], V[f[2]], r, g, bl, bias);
        tri(V[f[0]], V[f[2]], V[f[3]], r, g, bl, bias);
      }
    }
  });
  zb.cx.putImageData(zb.img, 0, 0);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  // a soft shadow under his boots
  const g0 = ctx.createRadialGradient(W / 2, H * 0.865, 1, W / 2, H * 0.865, W * 0.3);
  g0.addColorStop(0, 'rgba(0,0,0,0.45)'); g0.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g0; ctx.beginPath(); ctx.ellipse(W / 2, H * 0.865, W * 0.3, H * 0.04, 0, 0, Math.PI * 2); ctx.fill();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(zb.cv, 0, 0, W, H);
}

