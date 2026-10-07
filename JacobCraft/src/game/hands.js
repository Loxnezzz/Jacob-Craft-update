// First-person arm + held item rig with per-item-type animations.
import { mat4 } from '../core/math.js';
import { ITEMS, I } from './items.js';
import { PAT } from '../mobs/models.js';
import { heldModel, pushHeldModel } from '../gfx/heldModels.js';

// Jacob's colours (same as the third-person model): weathered skin, fingerless leather gloves, leather cuff, coat sleeve
const SKIN = [0.77, 0.56, 0.45], SKIN2 = [0.64, 0.45, 0.35], SKIN_HI = [0.83, 0.62, 0.5];
const GLOVE = [0.23, 0.165, 0.118], GLOVE2 = [0.17, 0.125, 0.086];
const SLEEVE = [0.37, 0.255, 0.19], SLEEVE2 = [0.29, 0.2, 0.14];
const CUFF = [0.23, 0.165, 0.118], CUFF2 = [0.18, 0.13, 0.09];

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function easeOut(t) { return 1 - (1 - t) * (1 - t); }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

// how an item is held / animated
export function holdKind(it) {
  if (!it) return 'empty';
  const tool = it.tool;
  if (tool) {
    if (tool.type === 'sword' || tool.type === 'dagger') return 'sword';
    if (tool.type === 'mace') return 'mace';
    if (['pickaxe', 'axe', 'shovel', 'hoe', 'shears'].includes(tool.type)) return 'tool';
    if (tool.type === 'spear') return 'spear';
    if (tool.type === 'bow') return 'bow';
    if (tool.type === 'crossbow') return 'crossbow';
    if (tool.type === 'gun') return 'gun';
    if (tool.type === 'wand' || tool.type === 'rod' || tool.type === 'igniter') return 'wand';
    if (tool.type === 'shield') return 'shield';
  }
  if (it.block >= 0 && !it.flatIcon) return 'block';
  if (it.block >= 0 && it.flatIcon) return 'flat';
  return 'item';
}

// Swing curves (u = 0..1 through the swing). A quick strike that lands about a quarter of the way through, then a
// slower recovery — the head of a tool travels forward and down onto the crosshair, never backwards or sideways.
// Returns [dx, dy, dz, rx, ry, rz]: fist offset (view metres) and fist rotation (pitch, yaw, roll).
export function swingPose(kind, u, toolType = null) {
  const sq = Math.sqrt(u);
  const s = Math.sin(sq * Math.PI);             // 0 -> 1 (u = .25) -> 0
  const s2 = Math.sin(u * u * Math.PI);          // late, gentle turn
  const s3 = Math.sin(sq * Math.PI * 2);         // small lift then dip
  const sl = Math.sin(u * Math.PI);
  // each tool has its own motion
  if (toolType === 'axe') return [-0.15 * s, 0.1 * s + 0.04 * s3, -0.13 * sl, -0.85 * s, 0.42 * s2, 0.16 * s];      // heavy diagonal hack
  if (toolType === 'shovel') return [-0.08 * s, 0.02 * s3 - 0.04 * s, -0.24 * s, -0.4 * s + 0.35 * s2, 0.12 * s2, 0]; // forward scoop, flick up
  if (toolType === 'hoe') return [-0.1 * s, 0.06 * s, -0.12 * s + 0.08 * s2, -0.75 * s + 0.3 * s2, 0.2 * s2, 0.05 * s]; // chop and pull back
  if (toolType === 'mace') return [-0.12 * s, 0.13 * s + 0.04 * s3, -0.14 * sl, -1.0 * s, 0.25 * s2, 0.06 * s];       // overhead smash
  if (toolType === 'dagger') return [-0.12 * s, 0.04 * s3, -0.22 * sl, -0.3 * s, 0.35 * s2, 0.15 * s];                // quick stab
  switch (kind) {
    case 'tool': case 'mace': case 'wand':
      return [-0.14 * s, 0.08 * s + 0.03 * s3, -0.12 * sl, -0.66 * s, 0.3 * s2, 0.08 * s];  // overhead chop: the head lands on the crosshair
    case 'sword':
      return [-0.18 * s, 0.07 * s + 0.03 * s3, -0.1 * sl, -0.62 * s, 0.45 * s2, 0.22 * s];  // diagonal slash, top-right to bottom-left
    case 'spear':
      return [-0.05 * s, 0.02 * s3, -0.42 * s, 0, 0.06 * s, 0];                           // thrust
    case 'empty':
      return [-0.08 * s, 0.035 * s3, -0.25 * sl, -0.1 * s, 0.22 * s2, 0];                 // punch
    case 'bow': case 'crossbow': case 'gun':
      return [-0.04 * s, 0.02 * s3, -0.1 * sl, -0.12 * s, 0.08 * s2, 0];
    default:
      return [-0.06 * s, 0.03 * s3, -0.16 * sl, -0.4 * s, 0.2 * s2, 0];                   // blocks and items
  }
}

export class FirstPerson {
  constructor(game) {
    this.g = game;
    this.equip = 1; this.lastId = -1;
    this.lagX = 0; this.lagY = 0; this.prevYaw = 0; this.prevPitch = 0;
    this.kick = 0;
    this.time = 0;
    // tuning (view-space metres: +x right, +y up, -z forward); exposed for live debugging via jc.game.hands.cfg
    this.cfg = {
      // where the fist rests for each kind of held thing
      A: {
        empty: [0.3, -0.25, -0.5], block: [0.29, -0.27, -0.56], flat: [0.29, -0.26, -0.54], item: [0.29, -0.26, -0.54],
        tool: [0.28, -0.28, -0.56], sword: [0.28, -0.28, -0.56], mace: [0.28, -0.28, -0.56], spear: [0.27, -0.3, -0.56], wand: [0.28, -0.28, -0.56],
        bow: [0.17, -0.15, -0.62], crossbow: [0.17, -0.2, -0.55], gun: [0.18, -0.19, -0.56], shield: [0.27, -0.3, -0.52],
      },
      AL: [-0.29, -0.3, -0.54], SL: [-0.74, -0.5, 0.0],   // off-hand fist and shoulder
      // the shoulder the forearm runs back to (off screen, lower right)
      S: [0.74, -0.5, 0.0], Sranged: [0.38, -0.95, -0.12],
      // tool held in the fist: lean left (roll), lean forward (pitch), turn about the handle so the head faces the target
      toolRest: [0.36, -0.55, 0.95], toolScale: 1,
      bowRot: [-0.55, 1.2, 0.2, 0.46, 0.22, -0.22], // rotY, rotZ, rotY per draw, scale, grip x, grip y
      // 3D held models: aim yaw, pitch, roll, offset x/y/z, scale
      model: { crossbow: [0.05, 0.03, 0, 0, 0, 0, 1], gun: [0.06, 0.03, 0, 0, 0.02, 0, 1.2], launcher: [0.07, 0.03, 0, 0.035, -0.04, -0.04, 0.82], spear: [0.08, 0.06, 0, 0, 0, 0, 1] },
    };
  }

  ammoId(kind) {
    const p = this.g.player;
    const id = kind === 'gun' ? (I.iron_shot ?? I.arrow) : I.arrow;
    if (id === undefined) return null;
    return p.creative || p.inventory.count(id) > 0 ? id : null;
  }

  update(dt) {
    const p = this.g.player;
    this.time += dt;
    const held = p.held();
    const id = held ? held.id : 0;
    if (id !== this.lastId) { this.lastId = id; this.equip = 0; }
    this.equip = Math.min(1, this.equip + dt * 4.5);
    const off = p.offhand && p.offhand.slots[0], oid = off ? off.id : 0;
    if (oid !== this.lastOff) { this.lastOff = oid; this.equipOff = 0; }
    this.equipOff = Math.min(1, (this.equipOff ?? 1) + dt * 4.5);
    if (this.kickOff > 0) this.kickOff = Math.max(0, this.kickOff - dt * 4);
    this.blockT = p.blocking ? Math.min(1, (this.blockT || 0) + dt * 9) : Math.max(0, (this.blockT || 0) - dt * 6);
    // look inertia (item lags behind camera rotation)
    let dy = p.yaw - this.prevYaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    const dp = p.pitch - this.prevPitch;
    this.prevYaw = p.yaw; this.prevPitch = p.pitch;
    const k = 1 - Math.exp(-dt * 10);
    this.lagX += (clamp(dy * 1.6, -0.08, 0.08) - this.lagX) * k;
    this.lagY += (clamp(-dp * 1.6, -0.08, 0.08) - this.lagY) * k;
    if (this.kick > 0) this.kick = Math.max(0, this.kick - dt * 3);
  }

  draw(gl, r, F) {
    const g = this.g, p = g.player, er = g.er;
    const held = p.held();
    const it = held ? ITEMS[held.id] : null;
    const kind = holdKind(it);
    const C = this.cfg;
    const handProj = mat4.perspective(mat4.create(), 70 * Math.PI / 180, r.W / r.H, 0.03, 10);
    const vp = mat4.multiply(mat4.create(), handProj, r.view);
    const lt = g.world.getLight(Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z));
    const light = [Math.max(0.08, (lt >> 4) / 15), (lt & 15) / 15, 0, 0];

    // ---- shared motion: equip, bob, idle sway, look lag ----
    const G = mat4.create();
    const eq = easeOut(this.equip);
    const bobX = Math.sin(p.bobPhase) * 0.028 * p.bobAmt, bobY = -Math.abs(Math.cos(p.bobPhase)) * 0.032 * p.bobAmt;
    const sway = Math.sin(this.time * 1.7) * 0.005;
    mat4.translate(G, G, bobX - this.lagX, bobY + sway - this.lagY - (1 - eq) * 0.55, 0);
    if (p.sprinting && p.onGround && !p.swing) { mat4.rotateZ(G, G, -0.08); mat4.translate(G, G, 0.02, -0.03, 0); }

    // swing progress 0..1 (0 = idle)
    const t = p.swing > 0 ? 1 - p.swing : 0;
    const eat = g.interaction.eating ? g.interaction.eating.t : 0;
    const draw = g.interaction.bowDraw || 0;

    // ---- the fist frame H (view space) ----
    const A = C.A[kind];
    const H = mat4.create();
    H.set(G);
    mat4.translate(H, H, A[0], A[1], A[2]);
    const pose = (q) => {
      mat4.translate(H, H, q[0], q[1], q[2]);
      if (q[4]) mat4.rotateY(H, H, q[4]);
      if (q[3]) mat4.rotateX(H, H, q[3]);
      if (q[5]) mat4.rotateZ(H, H, q[5]);
    };
    if (eat > 0) {
      const b = Math.abs(Math.sin(eat * 16)) * 0.035;
      const e = easeOut(clamp(eat * 4, 0, 1));
      pose([-0.2 * e, (0.14 - b) * e, 0.12 * e, 0.4 * e, 0.6 * e, 0]);
    } else if (t > 0) {
      const q = swingPose(kind, t, it && it.tool ? it.tool.type : null);
      // the fist travels towards what it is hitting (block face or creature), strongest at the moment of impact
      const tg = g.interaction.target;
      if (tg && (tg.type === 'block' || (tg.type === 'entity' && tg.e))) {
        const wp = tg.type === 'block' ? [tg.px ?? tg.x + 0.5, tg.py ?? tg.y + 0.5, tg.pz ?? tg.z + 0.5] : [tg.e.x, tg.e.y + (tg.e.h || 1) * 0.6, tg.e.z];
        const V = r.view, rx = wp[0] - F.camPos[0], ry = wp[1] - F.camPos[1], rz = wp[2] - F.camPos[2];
        const v = [V[0] * rx + V[4] * ry + V[8] * rz + V[12], V[1] * rx + V[5] * ry + V[9] * rz + V[13], V[2] * rx + V[6] * ry + V[10] * rz + V[14]];
        const dx = v[0] - A[0], dy = v[1] - A[1], dz = v[2] - A[2], L = Math.hypot(dx, dy, dz) || 1;
        const reach = Math.min(0.15, L * 0.28) * Math.sin(Math.sqrt(t) * Math.PI);
        q[0] += dx / L * reach; q[1] += dy / L * reach; q[2] += dz / L * reach * 0.6;
      }
      pose(q);
    } else if (kind === 'bow') {
      const d = easeOut(clamp(draw / 1.0, 0, 1));
      const shake = draw > 0.95 ? Math.sin(this.time * 45) * 0.004 * Math.min(1, (draw - 0.95) * 4 + 0.3) : 0;
      mat4.translate(H, H, -0.12 * d + shake, 0.05 * d + shake * 0.5, 0.06 * d);
      if (this.kick > 0) mat4.translate(H, H, 0, 0, 0.05 * this.kick);
    } else if (kind === 'spear' && draw > 0) {
      // wind the spear back over the shoulder for a throw
      const d = easeOut(clamp(draw / 0.9, 0, 1));
      const shake = draw > 0.9 ? Math.sin(this.time * 40) * 0.003 : 0;
      mat4.translate(H, H, 0.04 * d + shake, 0.17 * d, 0.2 * d);
      mat4.rotateX(H, H, 0.28 * d);
    } else if (kind === 'crossbow' || kind === 'gun') {
      const load = g.interaction.loadT || 0;
      mat4.translate(H, H, 0, -0.12 * load, 0.06 * load);
      mat4.rotateX(H, H, -0.6 * load + 0.4 * this.kick);
      mat4.translate(H, H, 0, 0, 0.12 * this.kick);
    }

    gl.depthRange(0, 0.04);
    const model = it ? heldModel(it, { load: g.interaction.loadT || 0, loaded: !!(held && held.loaded) }) : null;
    er.beginBoxes();
    const xf = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
    const box = (M, x0, y0, z0, x1, y1, z1, col, pat, col2) => {
      const B = mat4.create(); B.set(M);
      mat4.translate(B, B, x0, y0, z0);
      mat4.scale(B, B, x1 - x0, y1 - y0, z1 - z0);
      er.pushBox(mat4.multiply(mat4.create(), r.invView, B), col, pat, col2, 0, (x1 - x0) * 32, (y1 - y0) * 32, (z1 - z0) * 32, 3, light);
    };
    // ---- arms: a gloved fist in the hand frame, then wrist -> shoulder as one straight forearm in the coat sleeve ----
    const drawArm = (Hf, Sv, side, open) => {
      const wrist = xf(Hf, [0, -0.005, 0.06]);
      const dx = Sv[0] - wrist[0], dy = Sv[1] - wrist[1], dz = Sv[2] - wrist[2];
      const len = Math.hypot(dx, dy, dz);
      const at = (k) => [wrist[0] + dx * k / len, wrist[1] + dy * k / len, wrist[2] + dz * k / len];
      pushHeldModel(er, [
        { t: 1, p0: wrist, p1: at(0.04), w: 0.104, h: 0.104, c: GLOVE, p: PAT.noise, c2: GLOVE2 },        // glove cuff
        { t: 1, p0: at(0.035), p1: at(0.085), w: 0.124, h: 0.124, c: CUFF, p: PAT.noise, c2: CUFF2 },      // leather sleeve cuff
        { t: 1, p0: at(0.08), p1: Sv, w: 0.118, h: 0.118, c: SLEEVE, p: PAT.cloth, c2: SLEEVE2 },          // coat sleeve
      ], mat4.create(), r.invView, light);
      const X = (x0, x1) => side > 0 ? [x0, x1] : [-x1, -x0];   // mirror across the hand for the left
      const fb = (x0, y0, z0, x1, y1, z1, c, pt, c2) => { const [a, b2] = X(x0, x1); box(Hf, a, y0, z0, b2, y1, z1, c, pt, c2); };
      fb(-0.058, -0.058, -0.055, 0.058, 0.05, 0.068, GLOVE, PAT.noise, GLOVE2);                          // back of the gloved hand
      for (let k = 0; k < 4; k++) {
        const x0 = -0.056 + k * 0.0285;
        fb(x0, 0.0, -0.078, x0 + 0.0255, 0.062, -0.04, GLOVE2, PAT.noise, GLOVE);                          // glove knuckles
        if (!open) fb(x0, -0.058, -0.074, x0 + 0.0255, 0.002, -0.05, SKIN, PAT.noise, SKIN2);             // bare curled fingers
        else fb(x0, -0.03, -0.11, x0 + 0.0255, 0.0, -0.05, SKIN, PAT.noise, SKIN2);                        // open fingers
      }
      fb(-0.082, -0.004, -0.06, -0.05, 0.044, 0.012, GLOVE, PAT.noise, GLOVE2);                          // thumb (gloved)
      fb(-0.082, -0.004, -0.088, -0.05, 0.034, -0.06, SKIN_HI, PAT.noise, SKIN2);                         // thumb tip
    };
    {
      const ranged = kind === 'bow' || kind === 'crossbow' || kind === 'gun';
      drawArm(H, xf(G, ranged ? C.Sranged : C.S), 1, kind === 'item' || kind === 'flat');
    }
    // held 3D models in a hand frame (side +1 right, -1 left)
    const placeModel = (Hf, mdl, itm, knd, side) => {
      if (mdl.isShield) {
        const M = mat4.create(); M.set(Hf);
        const b = side > 0 && p.blocking ? this.blockT : side < 0 ? this.blockT : 0;
        mat4.translate(M, M, -side * 0.02 - side * 0.15 * b, 0.07 + 0.12 * b, -0.05 + 0.03 * b);
        mat4.rotateY(M, M, side * (0.75 - 0.7 * b));
        mat4.rotateX(M, M, 0.08 - 0.06 * b);
        const ss = 0.82 + 0.12 * b; mat4.scale(M, M, ss, ss, ss);
        if (!b) mat4.translate(M, M, 0, -0.05, 0);
        pushHeldModel(er, mdl, M, r.invView, light);
      } else if (mdl.isTool) {
        const TR = C.toolRest;
        const M = mat4.create(); M.set(Hf);
        if (mdl.upright) {                                   // torches and lanterns stand up in the fist
          if (mdl.hang) mat4.translate(M, M, 0, -0.02, -0.02);
          mat4.rotateZ(M, M, side * 0.18); mat4.rotateX(M, M, -0.22);
        } else {
          mat4.rotateZ(M, M, side * TR[0]);                  // lean the top towards the middle of the screen
          mat4.rotateX(M, M, TR[1]);                         // and forwards
          mat4.rotateY(M, M, side * TR[2]);                  // turn so the blade / pick faces the target
          if (knd === 'sword') mat4.rotateY(M, M, -side * 0.55);           // show more of the flat of a blade
          if (itm.tool && itm.tool.type === 'shovel') mat4.rotateY(M, M, -side * 0.9);   // and the face of a spade
        }
        const sc = C.toolScale * (itm.tool && itm.tool.type === 'dagger' ? 0.9 : 1);
        if (sc !== 1) mat4.scale(M, M, sc, sc, sc);
        pushHeldModel(er, mdl, M, r.invView, light);
      } else {
        const Q = (itm.tool && itm.tool.gun === 'launcher' && C.model.launcher) || C.model[knd] || C.model.gun;
        const MM = mat4.create(); MM.set(Hf);
        mat4.translate(MM, MM, Q[3], Q[4], Q[5]);
        mat4.rotateY(MM, MM, Q[0]); mat4.rotateX(MM, MM, Q[1]); if (Q[2]) mat4.rotateZ(MM, MM, Q[2]);
        if (Q[6] !== 1) mat4.scale(MM, MM, Q[6], Q[6], Q[6]);
        pushHeldModel(er, mdl, MM, r.invView, light);
      }
    };
    if (model) placeModel(H, model, it, kind, 1);

    // ---- the off-hand ----
    const offStack = p.offhand && p.offhand.slots[0];
    const offIt = offStack ? ITEMS[offStack.id] : null;
    let HL = null, offModel = null, offKind = null;
    if (offIt && !(kind === 'bow' || kind === 'crossbow' || kind === 'gun')) {
      offKind = holdKind(offIt);
      HL = mat4.create();
      const GL = mat4.create();
      const eqo = easeOut(this.equipOff ?? 1);
      mat4.translate(GL, GL, bobX * 0.8 - this.lagX, bobY + sway - this.lagY - (1 - eqo) * 0.55, 0);
      HL.set(GL);
      const AL = C.AL;
      mat4.translate(HL, HL, AL[0], AL[1], AL[2]);
      const poseL = (q) => {   // mirrored pose
        mat4.translate(HL, HL, -q[0], q[1], q[2]);
        if (q[4]) mat4.rotateY(HL, HL, -q[4]);
        if (q[3]) mat4.rotateX(HL, HL, q[3]);
        if (q[5]) mat4.rotateZ(HL, HL, -q[5]);
      };
      const ia = g.interaction;
      if (ia.eatingOff && ia.eating) {
        const b = Math.abs(Math.sin(ia.eating.t * 16)) * 0.035, e = easeOut(clamp(ia.eating.t * 4, 0, 1));
        poseL([-0.2 * e, (0.14 - b) * e, 0.12 * e, 0.4 * e, 0.6 * e, 0]);
      } else if (p.swingOff > 0) poseL(swingPose(offKind === 'shield' ? 'item' : offKind, 1 - p.swingOff));
      if (this.kickOff > 0) mat4.translate(HL, HL, 0, 0, 0.04 * this.kickOff);
      drawArm(HL, xf(GL, C.SL), -1, offKind === 'item' || offKind === 'flat');
      offModel = heldModel(offIt, {});
      if (offModel) placeModel(HL, offModel, offIt, offKind, -1);
    }
    {
      const vpSave = r.viewProj; r.viewProj = vp;
      er.drawBoxes(F, false, { noShadow: true });   // hands are lit like the player, never by world shadows
      r.viewProj = vpSave;
    }

    // ---- off-hand sprites and blocks ----
    if (offIt && HL && !offModel) {
      const M = mat4.create(); M.set(HL);
      if (offKind === 'block') {
        mat4.translate(M, M, 0.06, 0.07, -0.08);
        mat4.rotateY(M, M, -(Math.PI / 4 + 0.2));
        mat4.rotateX(M, M, 0.1);
        mat4.scale(M, M, 0.22, 0.22, 0.22);
      } else {
        mat4.translate(M, M, 0.04, 0.09, -0.06);
        mat4.rotateY(M, M, -0.5);
        mat4.rotateX(M, M, -0.25);
        const sc = offKind === 'flat' ? 0.34 : 0.3;
        mat4.scale(M, M, sc, sc, sc);
      }
      er.beginItems(F, { viewProj: vp, noFog: true, noShadow: true });
      gl.disable(gl.CULL_FACE);
      er.drawItem(offStack.id, mat4.multiply(mat4.create(), r.invView, M), [light[0], light[1], 0, offIt.glow ? 0.5 : 0], offStack.ench && Object.keys(offStack.ench).length ? 0.6 : 0);
      gl.enable(gl.CULL_FACE);
    }

    // ---- flat sprites and blocks ----
    if (it && kind !== 'empty' && !model) {
      const M = mat4.create(); M.set(H);
      if (kind === 'block') {
        mat4.translate(M, M, -0.06, 0.07, -0.08);
        mat4.rotateY(M, M, Math.PI / 4 + 0.2);
        mat4.rotateX(M, M, 0.1);
        mat4.scale(M, M, 0.22, 0.22, 0.22);
      } else if (kind === 'tool' || kind === 'sword' || kind === 'mace' || kind === 'wand') {
        // sprite tools without a 3D model (shears, wands, staves): handle in the fist, head up and to the left
        mat4.rotateZ(M, M, 0.5);
        mat4.rotateX(M, M, -0.3);
        mat4.rotateY(M, M, -0.5);
        mat4.scale(M, M, 0.5, 0.5, 0.5);
        mat4.translate(M, M, 0.28, 0.28, 0);
      } else if (kind === 'spear') {
        mat4.rotateY(M, M, Math.PI / 2 + 0.12);
        mat4.rotateZ(M, M, -Math.PI / 4 + 0.08);
        mat4.scale(M, M, 1.1, 1.1, 1.1);
        mat4.translate(M, M, -0.05, 0.05, 0);
      } else if (kind === 'bow') {
        // limbs vertical, bulge pointing away from the player, grip in the fist
        const d = clamp(draw, 0, 1);
        const BC = C.bowRot;
        mat4.rotateY(M, M, BC[0] + BC[2] * d);
        mat4.rotateZ(M, M, BC[1]);
        mat4.scale(M, M, BC[3], BC[3], BC[3]);
        mat4.translate(M, M, BC[4], BC[5], 0);
      } else {
        // small items rest on the fingers
        mat4.translate(M, M, -0.04, 0.09, -0.06);
        mat4.rotateY(M, M, 0.5);
        mat4.rotateX(M, M, -0.25);
        const sc = kind === 'flat' ? 0.34 : 0.3;
        mat4.scale(M, M, sc, sc, sc);
        mat4.rotateY(M, M, Math.PI);
      }
      const W = mat4.multiply(mat4.create(), r.invView, M);
      er.beginItems(F, { viewProj: vp, noFog: true, noShadow: true });
      gl.disable(gl.CULL_FACE);
      const glint = held.ench && Object.keys(held.ench).length ? 0.6 : 0;
      const pulling = kind === 'bow' && draw > 0.04 && I.bow_pulling !== undefined;
      er.drawItem(pulling ? I.bow_pulling : held.id, W, [light[0], light[1], 0, it.glow ? 0.5 : 0], glint);
      if (pulling) this.drawBowString(gl, r, F, er, M, H, clamp(draw, 0, 1), light, vp);
      // nocked arrow / loaded bolt
      if ((kind === 'bow' && draw > 0.08) || (kind === 'crossbow' && held.loaded)) {
        const arrowId = this.ammoId(kind);
        if (arrowId != null) {
          const AM2 = mat4.create(); AM2.set(H);
          if (kind === 'bow') mat4.translate(AM2, AM2, -0.015, 0.01, -0.24 + 0.12 * easeOut(clamp(draw, 0, 1))); // rests on the bow, nock at the string
          else mat4.translate(AM2, AM2, 0, 0.04, -0.12);
          mat4.rotateY(AM2, AM2, Math.PI / 2 + 0.03);
          mat4.rotateX(AM2, AM2, 0.5); // roll so the fletching is visible
          mat4.rotateZ(AM2, AM2, -Math.PI / 4);
          mat4.scale(AM2, AM2, 0.55, 0.55, 0.55);
          er.drawItem(arrowId, mat4.multiply(mat4.create(), r.invView, AM2), [light[0], light[1], 0, 0], 0);
        }
      }
      gl.enable(gl.CULL_FACE);
    }
    gl.depthRange(0, 1);
  }

  // bent bowstring from both limb tips back to the arrow nock
  drawBowString(gl, r, F, er, M, H, d, light, vp) {
    const tipA = [0.34, 0.41, 0, 1], tipB = [-0.41, -0.34, 0, 1];
    const xf = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
    const a = xf(M, tipA), b = xf(M, tipB);
    const n = xf(H, [-0.015, 0.01, 0.07 + 0.12 * easeOut(d), 1]); // the arrow's nock
    er.beginBoxes();
    const seg = (p0, p1) => {
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
      const len = Math.hypot(dx, dy, dz) || 1;
      // two perpendicular axes for a thin square cord
      let ux = -dz, uy = 0, uz = dx; let ul = Math.hypot(ux, uy, uz);
      if (ul < 1e-4) { ux = 1; uy = 0; uz = 0; ul = 1; }
      const th = 0.006;
      ux = ux / ul * th; uy = uy / ul * th; uz = uz / ul * th;
      const vx = (dy * uz - dz * uy) / len, vy = (dz * ux - dx * uz) / len, vz = (dx * uy - dy * ux) / len;
      const S = mat4.create();
      S[0] = dx; S[1] = dy; S[2] = dz;
      S[4] = ux; S[5] = uy; S[6] = uz;
      S[8] = vx; S[9] = vy; S[10] = vz;
      S[12] = p0[0] - (ux + vx) / 2; S[13] = p0[1] - (uy + vy) / 2; S[14] = p0[2] - (uz + vz) / 2;
      er.pushBox(mat4.multiply(mat4.create(), r.invView, S), [0.86, 0.84, 0.78], PAT.flat, [0.86, 0.84, 0.78], 0, 1, 1, 1, 3, light);
    };
    seg(a, n); seg(b, n);
    const vpSave = r.viewProj; r.viewProj = vp;
    er.drawBoxes(F, false);
    r.viewProj = vpSave;
    er.beginItems(F, { viewProj: vp, noFog: true });
    gl.disable(gl.CULL_FACE);
  }
}
