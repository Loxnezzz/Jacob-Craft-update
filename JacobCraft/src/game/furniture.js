// Phase 6 functional furniture: sitting on chairs/benches/stools and cooking food on campfires.
import { Entity } from './entities.js';
import { BLOCKS, B } from '../world/blocks.js';
import { ITEMS } from './items.js';
import { smeltResult } from './recipes.js';
import { mat4 } from '../core/math.js';

// invisible seat the player rides while sitting
class Seat extends Entity {
  constructor(game, x, y, z, bx, by, bz, yaw) {
    super(game, x, y, z);
    this.type = 'seat'; this.block = [bx, by, bz, game.world.getBlock(bx, by, bz)];
    this.hw = 0.3; this.h = 0.5; this.rider = null; this.yaw = yaw;
  }
  update() {
    const [bx, by, bz, id] = this.block;
    if (this.game.world.getBlock(bx, by, bz) !== id) this.dismount();
    if (!this.rider) this.dead = true;
  }
  controlRide(dt, input, active) {
    const p = this.rider;
    if (!p) return;
    if (active && (input.was('sneak') || input.was('jump'))) { this.dismount(); return; }
    p.x = this.x; p.z = this.z; p.y = this.y;
    p.vx = p.vy = p.vz = 0; p.fallDist = 0; p.onGround = true;
  }
  dismount() {
    const p = this.rider;
    if (!p) return;
    p.riding = null; this.rider = null;
    p.y = this.block[1] + 1.05;
    this.dead = true;
  }
}

// food sizzling on a campfire
class CampfireFood extends Entity {
  constructor(game, tile) { super(game, tile.x + 0.5, tile.y + 0.4, tile.z + 0.5); this.type = 'decor'; this.tile = tile; }
  update() { if (!this.tile.inv.slots.some(Boolean) || this.game.tiles.get(this.tile.x + ',' + this.tile.y + ',' + this.tile.z) !== this.tile) { this.dead = true; this.tile.disp = null; } }
  render(er, F, list) {
    const t = this.tile;
    const l = this.game.world.getLight(t.x, t.y + 1, t.z);
    t.inv.slots.forEach((s, i) => {
      if (!s) return;
      const M = mat4.create();
      const ox = [0.28, 0.72, 0.28, 0.72][i], oz = [0.28, 0.28, 0.72, 0.72][i];
      mat4.translate(M, M, t.x + ox - F.camPos[0], t.y + 0.36 - F.camPos[1], t.z + oz - F.camPos[2]);
      mat4.rotateY(M, M, i * 1.57 + 0.4);
      mat4.rotateX(M, M, -Math.PI / 2);
      mat4.scale(M, M, 0.36, 0.36, 0.36);
      list.push([s.id, M, [(l >> 4) / 15, Math.max(0.8, (l & 15) / 15), 0, 0]]);
    });
  }
}

const COOK_TIME = 18;

export function installFurniture(game) {
  game.sitOn = (x, y, z) => {
    const p = game.player, bd = BLOCKS[game.world.getBlock(x, y, z)];
    if (!bd.seat || p.riding) return false;
    if (game.world.getBlock(x, y + 1, z) && BLOCKS[game.world.getBlock(x, y + 1, z)].solid) return false;
    const facing = game.world.getMeta(x, y, z) & 3;
    const yaw = [0, -Math.PI / 2, Math.PI, Math.PI / 2][facing];
    const seat = new Seat(game, x + 0.5, y + bd.seat - 0.62, z + 0.5, x, y, z, yaw);
    seat.rider = p; p.riding = seat; p.yaw = yaw;
    game.entities.add(seat);
    game.ui.actionText('Press Sneak or Jump to stand up', 2);
    return true;
  };

  game.useCampfire = (x, y, z, held) => {
    const p = game.player;
    const res = held ? smeltResult(held.id) : 0;
    if (!res || !ITEMS[res].food) return false;
    const t = game.getTile(x, y, z, 'campfire');
    t.cookT = t.cookT || [0, 0, 0, 0];
    const slot = [0, 1, 2, 3].find(i => !t.inv.slots[i]);
    if (slot === undefined) { game.ui.actionText('The campfire is full'); return true; }
    t.inv.slots[slot] = { id: held.id, count: 1, dmg: 0 };
    t.cookT[slot] = 0;
    game.interaction.consumeHeld();
    game.audio.play('sizzle', { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
    if (!t.disp) { t.disp = new CampfireFood(game, t); game.entities.add(t.disp); }
    return true;
  };

  game.tickCampfires = (dt) => {
    for (const [, t] of game.tiles) {
      if (t.type !== 'campfire' || !game.world.isLoaded(t.x, t.z)) continue;
      if (game.world.getBlock(t.x, t.y, t.z) !== B.campfire) continue;
      t.cookT = t.cookT || [0, 0, 0, 0];
      let any = false;
      for (let i = 0; i < 4; i++) {
        const s = t.inv.slots[i];
        if (!s) continue;
        any = true;
        t.cookT[i] += dt;
        if (Math.random() < dt * 1.5) game.particles.smoke(t.x + 0.5, t.y + 0.6, t.z + 0.5, 1, 0.6);
        if (t.cookT[i] >= COOK_TIME) {
          const res = smeltResult(s.id);
          t.inv.slots[i] = null; t.cookT[i] = 0;
          if (res) game.entities.dropItem(t.x + 0.5, t.y + 0.8, t.z + 0.5, res, 1);
          game.audio.play('pickup', { x: t.x + 0.5, y: t.y + 1, z: t.z + 0.5 });
        }
      }
      if (any && !t.disp) { t.disp = new CampfireFood(game, t); game.entities.add(t.disp); }
      if (any && Math.random() < dt * 0.8) game.audio.play('sizzle', { x: t.x + 0.5, y: t.y + 0.5, z: t.z + 0.5 });
    }
  };
  const prevExt = game.extUpdate;
  game.extUpdate = (dt) => { if (prevExt) prevExt(dt); game.tickCampfires(dt); };
}
