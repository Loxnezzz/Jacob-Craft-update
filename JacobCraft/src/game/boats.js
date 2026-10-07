// Rowable boats.
import { Entity } from './entities.js';
import { moveEntity } from './physics.js';
import { mat4 } from '../core/math.js';
import { IS_LIQUID, IS_WATERLOGGED } from '../world/blocks.js';
import { I } from './items.js';
import { PAT } from '../mobs/models.js';

const WOOD = [0.62, 0.46, 0.28], WOOD2 = [0.45, 0.32, 0.18];

export class Boat extends Entity {
  constructor(game, x, y, z, yaw = 0) {
    super(game, x, y, z);
    this.type = 'boat';
    this.hw = 0.7; this.h = 0.55;
    this.yaw = yaw;
    this.hittable = true; this.solidBody = true; this.persistent = true;
    this.hp = 4; this.rider = null; this.paddle = 0; this.yawV = 0;
    this.hurtT = 0;
  }
  waterLevel() {
    const w = this.world;
    const x = Math.floor(this.x), z = Math.floor(this.z);
    for (let y = Math.floor(this.y + 1); y >= Math.floor(this.y - 1); y--) {
      const id = w.getBlock(x, y, z);
      if (IS_LIQUID[id] === 1 || IS_WATERLOGGED[id]) {
        const above = w.getBlock(x, y + 1, z);
        return y + (IS_LIQUID[above] === 1 ? 1 : 0.875);
      }
    }
    return null;
  }
  update(dt) {
    this.age += dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.rider) return; // controlled in controlRide
    this.physicsStep(dt, 0, 0);
  }
  physicsStep(dt, thrust, turn) {
    const wl = this.waterLevel();
    const onWater = wl !== null;
    if (onWater) {
      const target = wl - 0.25;
      this.vy += (target - this.y) * 30 * dt;
      this.vy *= Math.exp(-6 * dt);
    } else this.vy -= 24 * dt;
    this.yawV += turn * dt * 5;
    this.yawV *= Math.exp(-6 * dt);
    this.yaw += this.yawV * dt;
    const maxSp = onWater ? 8 : 1.2;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    this.vx += fx * thrust * dt * (onWater ? 9 : 3);
    this.vz += fz * thrust * dt * (onWater ? 9 : 3);
    // lateral drag (boats glide forward)
    const fwd = this.vx * fx + this.vz * fz;
    const latX = this.vx - fx * fwd, latZ = this.vz - fz * fwd;
    const dragF = Math.exp(-(onWater ? 0.6 : 4) * dt), latD = Math.exp(-4 * dt);
    this.vx = fx * fwd * dragF + latX * latD;
    this.vz = fz * fwd * dragF + latZ * latD;
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > maxSp) { this.vx *= maxSp / sp; this.vz *= maxSp / sp; }
    const r = moveEntity(this.world, this, this.vx * dt, this.vy * dt, this.vz * dt);
    if (r.hitX) this.vx *= -0.2;
    if (r.hitZ) this.vz *= -0.2;
    if (r.hitY) this.vy = 0;
    this.paddle += Math.abs(thrust) * dt * 6 + Math.abs(turn) * dt * 3;
    if (onWater && sp > 2 && Math.random() < dt * sp) this.game.particles.splash(this.x - fx * 0.8, wl, this.z - fz * 0.8, 2);
  }
  controlRide(dt, input, active) {
    const p = this.rider;
    let thrust = 0, turn = 0;
    if (active) {
      if (input.is('forward')) thrust += 1;
      if (input.is('back')) thrust -= 0.5;
      if (input.is('left')) turn += 1;
      if (input.is('right')) turn -= 1;
      if (input.was('sneak')) { this.dismount(); return; }
    }
    this.physicsStep(dt, thrust, turn);
    p.x = this.x; p.z = this.z; p.y = this.y + 0.15;
    p.vx = this.vx; p.vz = this.vz; p.vy = 0; p.fallDist = 0; p.onGround = true;
  }
  interact(player) {
    if (this.rider) return false;
    this.rider = player; player.riding = this;
    player.yaw = this.yaw;
    return true;
  }
  dismount() {
    const p = this.rider;
    if (!p) return;
    p.riding = null; this.rider = null;
    p.y = this.y + 0.8;
    p.x += Math.cos(this.yaw) * 0.9; p.z -= Math.sin(this.yaw) * 0.9;
  }
  hurt(amount, src = {}) {
    if (this.hurtT > 0) return false;
    this.hurtT = 0.3;
    this.hp -= amount;
    this.game.audio.blockSound(31, 'hit', this.x, this.y, this.z);
    if (this.hp <= 0) {
      if (this.rider) this.dismount();
      this.dead = true;
      if (!(src.entity && src.entity.creative)) this.game.entities.dropItem(this.x, this.y + 0.5, this.z, I.oak_boat, 1);
      this.game.particles.poof(this.x, this.y, this.z, 6);
    }
    return true;
  }
  render(er, F) {
    const cam = F.camPos;
    const W = mat4.create();
    mat4.translate(W, W, this.x - cam[0], this.y - cam[1], this.z - cam[2]);
    mat4.rotateY(W, W, this.yaw);
    if (this.hurtT > 0) mat4.rotateZ(W, W, Math.sin(this.hurtT * 40) * 0.08);
    const l = this.world.getLight(Math.floor(this.x), Math.floor(this.y + 0.5), Math.floor(this.z));
    const light = [(l >> 4) / 15, (l & 15) / 15, 0, 0];
    const bx = (x, y, z, sx, sy, sz, c = WOOD, pat = PAT.bark) => {
      const M = mat4.create(); M.set(W);
      mat4.translate(M, M, x / 16, y / 16, z / 16);
      mat4.scale(M, M, sx / 16, sy / 16, sz / 16);
      er.pushBox(M, c, pat, WOOD2, 0, sx, sy, sz, 7, light);
    };
    bx(-10, 0, -14, 20, 2, 28);          // floor
    bx(-11, 0, -14, 2, 7, 28);           // left side
    bx(9, 0, -14, 2, 7, 28);             // right side
    bx(-9, 0, -15, 18, 7, 2);            // front
    bx(-9, 0, 13, 18, 7, 2);             // back
    bx(-9, 4, -2, 18, 1.5, 4, WOOD2);    // seat
    // paddles
    for (const side of [-1, 1]) {
      const M = mat4.create(); M.set(W);
      mat4.translate(M, M, side * 12 / 16, 6 / 16, 0);
      mat4.rotateX(M, M, Math.sin(this.paddle + (side > 0 ? 0 : Math.PI)) * 0.6);
      mat4.rotateZ(M, M, side * 0.5);
      mat4.translate(M, M, -0.5 / 16, -14 / 16, -0.5 / 16);
      mat4.scale(M, M, 1 / 16, 16 / 16, 1 / 16);
      er.pushBox(M, WOOD2, PAT.bark, WOOD, 0, 1, 16, 1, 9, light);
      const B2 = mat4.create(); B2.set(W);
      mat4.translate(B2, B2, side * 12 / 16, 6 / 16, 0);
      mat4.rotateX(B2, B2, Math.sin(this.paddle + (side > 0 ? 0 : Math.PI)) * 0.6);
      mat4.rotateZ(B2, B2, side * 0.5);
      mat4.translate(B2, B2, -0.5 / 16, -16 / 16, -2 / 16);
      mat4.scale(B2, B2, 1 / 16, 5 / 16, 4 / 16);
      er.pushBox(B2, WOOD, PAT.bark, WOOD2, 0, 1, 5, 4, 11, light);
    }
  }
  serialize() { return { t: 'boat', x: this.x, y: this.y, z: this.z, yaw: this.yaw }; }
}
