// Off-hand: a second held slot (F swaps it with the selected hotbar slot). When the main hand has nothing to do on
// right click, the off-hand acts instead — eat its food, place its torch or block, raise its shield. A torch or lantern
// in either hand lights the surroundings. Shields block frontal melee, projectiles and blasts.
import { ITEMS, I } from './items.js';
import { B, BLOCKS, LIGHT_EMIT } from '../world/blocks.js';

const RANGED = ['wand', 'bow', 'crossbow', 'gun', 'spear', 'spyglass', 'igniter', 'rod'];

// does this stack do something on right click (given what the player is looking at)?
export function hasUse(stack, t, p) {
  if (!stack) return false;
  const it = ITEMS[stack.id];
  if (!it) return false;
  if (it.food) return p ? (p.food < 20 || p.creative || it.id === I.golden_apple) : true;
  if (it.drink) return true;
  if ((it.block >= 0 || it.places) && t && t.type === 'block') return true;
  if (it.name === 'bucket' || it.name === 'glass_bottle' || it.fill) return true;
  if (it.throwable || it.name === 'oak_boat' || it.name === 'dragon_egg' || it.name === 'worldheart_keystone') return true;
  if (it.tool) {
    const ty = it.tool.type;
    if (RANGED.includes(ty) || ty === 'shield') return true;
    if (t && t.type === 'block' && t.face === 2) {
      if (ty === 'hoe' && [B.grass, B.dirt, B.dirt_path, B.snowy_grass].includes(t.id)) return true;
      if (ty === 'shovel' && [B.grass, B.dirt, B.snowy_grass].includes(t.id)) return true;
    }
    if (ty === 'axe' && t && t.type === 'block' && t.id === B.oak_log) return true;
  }
  return false;
}

// how much light an item gives off when held (0..1)
export function heldLightOf(stack) {
  if (!stack) return 0;
  const it = ITEMS[stack.id];
  if (!it) return 0;
  if (it.block >= 0 && LIGHT_EMIT[it.block]) return LIGHT_EMIT[it.block] / 15;
  if (it.name === 'lava_bucket') return 0.8;
  return 0;
}

export function installOffhand(game) {
  const ui = game.ui;
  // swap the selected hotbar slot with the off-hand (no change events: used mid-update)
  game.swapHandsRaw = () => {
    const p = game.player, i = p.selected;
    const a = p.inventory.slots[i];
    p.inventory.slots[i] = p.offhand.slots[0];
    p.offhand.slots[0] = a;
  };
  game.swapHands = () => {
    game.swapHandsRaw();
    game.player.inventory.changed(); game.player.offhand.changed();
    game.audio.play('click');
    if (game.hands) { game.hands.equip = 0.4; game.hands.equipOff = 0; }
  };

  // should the off-hand act on this right click?
  game.offhandTurn = (t, input) => {
    const p = game.player;
    if (!input.btn(2)) return false;
    const off = p.offhand.slots[0];
    if (!off) return false;
    if (t && t.type === 'entity' && t.e.interact) return false;      // villagers, animals, boats: main hand
    if (hasUse(p.held(), t, p)) return false;
    const it = ITEMS[off.id];
    return hasUse(off, t, p) && !(it.tool && RANGED.includes(it.tool.type));
  };

  // shields
  const isShield = (s) => s && ITEMS[s.id] && ITEMS[s.id].tool && ITEMS[s.id].tool.type === 'shield';
  game.tryBlock = (amount, cause, source) => {
    const p = game.player;
    if (!p.blocking || p.blockT < 0.12) return false;                // a shield takes a moment to come up
    if (cause !== 'mob' && cause !== 'explosion' && cause !== 'projectile') return false;
    if (source && source.x !== undefined) {
      const dx = source.x - p.x, dz = source.z - p.z, l = Math.hypot(dx, dz) || 1;
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      if ((dx * fx + dz * fz) / l < 0.15) return false;               // came from the side or behind
      if (cause === 'mob' && source.hurt && !source.isBoss) { source.vx = (source.vx || 0) + dx / l * 6; source.vz = (source.vz || 0) + dz / l * 6; }
    } else if (cause !== 'explosion') return false;
    // wear the shield
    const inMain = isShield(p.held());
    const inv = inMain ? p.inventory : p.offhand, slot = inMain ? p.selected : 0, s = inv.slots[slot];
    if (s) {
      s.dmg = (s.dmg || 0) + Math.max(1, Math.round(amount / 3));
      if (s.dmg >= ITEMS[s.id].tool.dur) { inv.slots[slot] = null; game.audio.play('break_tool'); }
      inv.changed();
    }
    game.audio.play('shield_block', p);
    p.knockX = (p.knockX || 0) + Math.sin(p.yaw) * 2.5; p.knockZ = (p.knockZ || 0) + Math.cos(p.yaw) * 2.5;
    if (game.hands) game.hands.kickOff = 1;
    game.camShake = Math.max(game.camShake || 0, 0.12);
    return true;
  };

  const prevExt = game.extUpdate;
  game.extUpdate = (dt) => {
    if (prevExt) prevExt(dt);
    const p = game.player, input = game.input, ia = game.interaction;
    const active = game.state === 'playing' && !ui.isOpen && !ui.chatOpen && !p.dead && (input.locked || game.debugActive);
    const t = ia.target;
    const main = p.held(), off = p.offhand.slots[0];
    const wantBlock = active && input.btn(2) && (isShield(main) || (isShield(off) && !hasUse(main, t, p))) && !p.riding;
    p.blocking = wantBlock;
    p.blockT = wantBlock ? (p.blockT || 0) + dt : 0;
    if (p.swingOff > 0) p.swingOff = Math.max(0, p.swingOff - dt * 3.4);
    // a torch or lantern in either hand lights the way (with a gentle flicker)
    const L = Math.max(heldLightOf(main), heldLightOf(off));
    const flick = L > 0 ? 0.94 + Math.sin(game.time * 13) * 0.025 + Math.sin(game.time * 31.7) * 0.02 : 0;
    game.heldLight = p.dead ? 0 : L * flick;
  };
}
