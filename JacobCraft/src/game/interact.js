// Player <-> world interaction: targeting, mining, placing, using items, attacking.
import { BLOCKS, B, SHAPE, IS_LIQUID, IS_WATERLOGGED } from '../world/blocks.js';
import { selectionBoxes, collisionBoxes } from '../world/shapes.js';
import { rayBox } from './physics.js';
import { ITEMS, I, blockDrops, breakTime, enchLevel } from './items.js';
import { HEIGHT } from '../world/constants.js';

const ORE_XP = { coal_ore: [0, 2], diamond_ore: [3, 7], emerald_ore: [3, 7], sunstone_ore: [1, 3], frostite_ore: [2, 5], brimstone_ore: [1, 3], niter_ore: [0, 2], emberite_ore: [4, 8] };
const SLAB_FULL = (id) => ({ [B.oak_slab]: B.oak_planks, [B.cobblestone_slab]: B.cobblestone, [B.stone_brick_slab]: B.stone_bricks, [B.pine_slab]: B.pine_planks, [B.teak_slab]: B.teak_planks, [B.sandstone_slab]: B.sandstone }[id] || (BLOCKS[id].fullBlock ? B[BLOCKS[id].fullBlock] : 0));
const FACE_N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const FACE_TO_FACING = [1, 3, -1, -1, 2, 0]; // horizontal facing index of a face normal

function lookFacing(yaw) {
  const lx = -Math.sin(yaw), lz = -Math.cos(yaw);
  if (Math.abs(lx) > Math.abs(lz)) return lx > 0 ? 1 : 3;
  return lz > 0 ? 2 : 0;
}

export class Interaction {
  constructor(game) {
    this.game = game;
    this.target = null;
    this.mining = null;
    this.useCooldown = 0;
    this.breakCooldown = 0;
    this.eating = null;
    this.bowDraw = 0;
  }

  selectFn(includeLiquids) {
    const world = this.game.world;
    return (id, meta, x, y, z, ox, oy, oz, dx, dy, dz) => {
      let boxes;
      if (IS_LIQUID[id]) {
        if (!includeLiquids || (meta & 15) !== 0) return null;
        boxes = [[0, 0, 0, 1, 0.875, 1]];
      } else boxes = selectionBoxes(id, meta, world, x, y, z);
      let best = null;
      for (const b of boxes) {
        const h = rayBox(ox, oy, oz, dx, dy, dz, x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]);
        if (h && (!best || h.t < best.t)) best = h;
      }
      return best;
    };
  }

  raycastBlock(maxD, liquids = false) {
    const p = this.game.player;
    const d = p.lookDir();
    return this.game.world.raycast(p.x, p.eyeY, p.z, d[0], d[1], d[2], maxD, this.selectFn(liquids));
  }

  updateTarget() {
    const p = this.game.player;
    const reach = p.creative ? 5 : 4.5;
    const hit = this.raycastBlock(reach);
    const d = p.lookDir();
    const hs = p.held(), ht = hs && ITEMS[hs.id].tool;
    const eReach = ht && ht.reach ? ht.reach : Math.min(reach, p.creative ? 5 : 3.6);
    const eh = this.game.entities.raycast(p.x, p.eyeY, p.z, d[0], d[1], d[2], eReach, (e) => e !== p.riding);
    if (eh && (!hit || eh.t < hit.dist)) this.target = { type: 'entity', e: eh.e, t: eh.t };
    else if (hit) this.target = Object.assign({ type: 'block' }, hit);
    else this.target = null;
  }

  update(dt, input, active) {
    const g = this.game, p = g.player;
    this.useCooldown -= dt;
    this.breakCooldown -= dt;
    if (!active || p.dead) { this.mining = null; this.eating = null; this.bowDraw = 0; this.target = null; if (g.weaponRelease) g.weaponRelease(); return; }
    this.updateTarget();
    const t = this.target;

    // ---- left button: attack / mine ----
    if (p.riding && p.riding.isDragon) { this.mining = null; }
    else if (input.btn(0)) {
      if (t && t.type === 'entity') {
        if (input.btnPressed(0)) this.attack(t.e);
        this.mining = null;
      } else if (t && t.type === 'block') {
        this.mine(dt, t);
      } else {
        if (input.btnPressed(0) && this.attackReady() > 0.5) { p.swing = 1; this.lastAttack = performance.now(); }   // swinging at air resets the charge
        this.mining = null;
      }
    } else this.mining = null;

    // ---- right button: use / place / interact ----
    // the off-hand acts when the main hand has nothing to do (eat, place a torch, raise a shield...): it is swapped into
    // the selected slot for the length of this block so every existing use path works unchanged
    const offUse = !!(g.offhandTurn && g.offhandTurn(t, input));
    const swing0 = p.swing;
    if (offUse) g.swapHandsRaw();
    try {
      const held = p.held();
      const heldIt = held ? ITEMS[held.id] : null;
      if (this.bowDraw > 0 && (!heldIt || !heldIt.tool || heldIt.tool.type !== this.drawKind)) this.bowDraw = 0;
      g.zoom = false;
      if (input.btn(2)) {
        if (heldIt && heldIt.tool && heldIt.tool.type === 'spyglass') { g.zoom = true; return; }
        // continuous actions
        if (heldIt && (heldIt.food || heldIt.drink) && (p.food < 20 || p.creative || heldIt.drink || heldIt.id === I.golden_apple)) {
          if (!this.eating || this.eating.slot !== p.selected) this.eating = { slot: p.selected, t: 0, id: held.id };
          this.eating.t += dt;
          if (Math.random() < dt * 6) g.audio && g.audio.play(heldIt.drink ? 'drink' : 'eat');
          if (this.eating.t >= 1.6) {
            this.finishEating(held);
            this.eating = null;
            this.useCooldown = 0.3;
          }
          return;
        }
        const wt = heldIt && heldIt.tool ? heldIt.tool.type : null;
        if (wt === 'crossbow' || wt === 'gun') {
          if (t && t.type === 'entity' && t.e.interact && input.btnPressed(2) && !held.loaded && t.e.interact(p, held)) { this._lastUseWasInteract = true; return; }
          if (g.weaponHold) g.weaponHold(dt, held, heldIt, input.btnPressed(2));
          return;
        }
        if ((wt === 'bow' || wt === 'spear') && !(t && t.type === 'entity' && t.e.interact && input.btnPressed(2) && t.e.interact(p, held))) {
          if (this.bowDraw === 0) { this.drawKind = wt; g.audio && g.audio.play(wt === 'bow' ? 'bow_draw' : 'swing'); }
          this.bowDraw = Math.min(1.2, this.bowDraw + dt * (1 + 0.25 * enchLevel(held, 'quickload')) * (heldIt.tool.draw || 1));
          return;
        }
        if (this.useCooldown <= 0) {
          this.useCooldown = input.btnPressed(2) ? 0.22 : 0.2;
          if (!input.btnPressed(2) && this._lastUseWasInteract) return;
          this._lastUseWasInteract = false;
          this.useRight(t, held, input.is('sneak'));
        }
      } else {
        this.eating = null;
        if (this.bowDraw > 0) {
          const wt = heldIt && heldIt.tool ? heldIt.tool.type : null;
          if (wt === this.drawKind) { if (wt === 'spear') g.throwSpear && g.throwSpear(this.bowDraw); else if (g.fireArrow) g.fireArrow(this.bowDraw); }
          this.bowDraw = 0;
        }
        if (g.weaponRelease) g.weaponRelease();
        this.useCooldown = Math.min(this.useCooldown, 0);
      }
    } finally {
      if (offUse) {
        if (p.swing > swing0) { p.swingOff = 1; p.swing = swing0; }   // it was the left hand that moved
        g.swapHandsRaw();
      }
      this.eatingOff = !!(offUse && this.eating);
    }
    // middle click: pick block (creative)
    if (input.btnPressed(1) && t && t.type === 'block' && p.creative) {
      const id = t.id === B.grass ? B.grass : t.id;
      if (ITEMS[id] && ITEMS[id].block >= 0) {
        const slot = p.inventory.slots.findIndex((s, i) => i < 9 && s && s.id === id);
        if (slot >= 0) p.selected = slot;
        else p.inventory.set(p.selected, { id, count: 64, dmg: 0 });
      }
    }
  }

  finishEating(held) {
    const g = this.game, p = g.player;
    const it = ITEMS[held.id];
    if (it.food) p.eat(held.id);
    if (it.drink) {
      if (it.potion && g.drinkPotion) g.drinkPotion(it.potion);
      if (it.name === 'milk_bucket') p.effects = {};
    }
    if (!it.drink) g.audio && g.audio.play('burp');
    if (!p.creative) {
      held.count--;
      if (it.returns) { const back = I[it.returns]; if (held.count <= 0) p.inventory.set(p.selected, { id: back, count: 1, dmg: 0 }); else g.giveItem(back, 1); }
      else if (it.name === 'milk_bucket') p.inventory.set(p.selected, { id: I.bucket, count: 1, dmg: 0 });
      else if (held.count <= 0) p.inventory.set(p.selected, null);
      p.inventory.changed();
    }
  }

  damageHeld(n = 1) {
    const p = this.game.player;
    const s = p.held();
    if (!s || p.creative) return;
    const tool = ITEMS[s.id].tool;
    if (!tool || !tool.dur) return;
    const unb = enchLevel(s, 'unbreaking');
    if (unb && Math.random() < unb / (unb + 1)) return;
    s.dmg = (s.dmg || 0) + n;
    if (s.dmg >= tool.dur) {
      p.inventory.set(p.selected, null);
      this.game.audio && this.game.audio.play('break_tool');
      this.game.particles.sparkle(p.x, p.eyeY - 0.4, p.z, [0.8, 0.8, 0.8], 6);
    } else p.inventory.changed();
  }

  attackReady() {
    const s = this.game.player.held(), tool = s ? ITEMS[s.id].tool : null;
    const atkSpeed = tool && tool.atkSpeed ? tool.atkSpeed : 4;
    return Math.min(1, (performance.now() - (this.lastAttack || 0)) / 1000 * atkSpeed);
  }

  attack(e) {
    const g = this.game, p = g.player;
    if (p.attackCooldown > 0.05) return;
    const s = p.held();
    const tool = s ? ITEMS[s.id].tool : null;
    const type = tool ? tool.type : 'hand';
    const ranged = type === 'bow' || type === 'crossbow' || type === 'gun';
    const atkSpeed = tool && tool.atkSpeed ? tool.atkSpeed : 4;
    // deliberate, not sluggish: you cannot attack again until half of this weapon's cycle has passed
    if ((performance.now() - (this.lastAttack || 0)) / 1000 < 0.6 / atkSpeed) return;
    let dmg = tool && tool.dmg && !ranged ? tool.dmg : ranged && type === 'gun' ? 2 : 1;
    dmg += enchLevel(s, 'sharpness') * 1.25;
    if (p.effects.strength) dmg += 3;
    if (p.blessings && p.blessings.includes('desert_titan')) dmg += 1;
    const charge = Math.min(1, (performance.now() - (this.lastAttack || 0)) / 1000 * atkSpeed);
    dmg *= 0.2 + 0.8 * charge * charge;   // well-timed swings hit hardest
    const crit = !p.onGround && p.vy < 0 && charge > 0.9 && !p.liquid.inWater && type !== 'mace';
    if (crit) dmg *= 1.5;
    // daggers strike twice as hard from behind
    let backstab = false;
    if (type === 'dagger' && e.yaw !== undefined && !e.isBoss) {
      const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);
      const tx = p.x - e.x, tz = p.z - e.z, l = Math.hypot(tx, tz) || 1;
      if ((fx * tx + fz * tz) / l < -0.3) { dmg *= 2; backstab = true; }
    }
    this.lastAttack = performance.now();
    p.swing = 1;
    p.exhaust(0.1);
    let kb = (p.sprinting ? 1.6 : 1) * (charge > 0.9 ? 1 : 0.5) + enchLevel(s, 'knockback') * 0.6;
    if (type === 'mace') kb *= 1.6;
    if (e.hurt && e.hurt(dmg, { type: 'player', entity: p, knock: kb, dir: p.lookDir(), weapon: type, crit })) {
      if (crit) { g.particles.crit(e.x, e.y + e.h * 0.7, e.z); g.audio && g.audio.play('crit', e); }
      if (g.hitStop) { if (e.deathT >= 0 || e.dead) g.hitStop(0.085); else if (crit || dmg >= 6 || type === 'mace') g.hitStop(0.05); else if (dmg >= 3) g.hitStop(0.025); }
      g.onMeleeHit && g.onMeleeHit(e, { type, dmg, crit, backstab, charge, stack: s });
      if (tool) this.damageHeld(type === 'sword' || type === 'dagger' || type === 'spear' || type === 'mace' ? 1 : 2);
      if (p.sprinting) p.sprinting = false;
    }
  }

  mine(dt, t) {
    const g = this.game, p = g.player;
    const id = t.id;
    const bd = BLOCKS[id];
    if (p.swing <= 0.02) p.swing = 1; // continuous mining swings
    if (p.creative) {
      if (this.breakCooldown > 0) return;
      this.breakCooldown = 0.2;
      this.breakAt(t.x, t.y, t.z, false);
      return;
    }
    if (bd.hardness < 0) { this.mining = null; return; }
    const m = this.mining;
    if (!m || m.x !== t.x || m.y !== t.y || m.z !== t.z || m.id !== id) {
      this.mining = { x: t.x, y: t.y, z: t.z, id, progress: 0, sound: 0, face: t.face };
      return;
    }
    if (this.breakCooldown > 0) return;
    const haste = (p.effects.haste ? 1.4 : 1) * (p.blessings && p.blessings.includes('desert_titan') ? 1.15 : 1);
    const bt = breakTime(id, p.held(), { underwater: p.liquid.eyeInWater, airborne: !p.onGround && !p.flying && !p.liquid.inWater && !p.climbing, haste: haste > 1 ? haste : 0 });
    m.progress += dt / bt;
    // impact: the tool meets the block about a quarter of the way through each swing
    const u = 1 - p.swing, pu = this._swingU ?? 0;
    this._swingU = u;
    if (pu < 0.24 && u >= 0.24) {
      g.audio && g.audio.blockSound(id, 'hit', t.x, t.y, t.z);
      g.particles.blockHit(t.x, t.y, t.z, id, t.face);
      g.particles.blockHit(t.x, t.y, t.z, id, t.face);
      const tool = p.held() ? ITEMS[p.held().id].tool : null;
      if (tool && (tool.type === 'axe' || tool.type === 'mace')) g.camShake = Math.max(g.camShake || 0, 0.06);
    }
    if (m.progress >= 1) {
      this.breakAt(t.x, t.y, t.z, true);
      this.mining = null;
      this.breakCooldown = 0.25;
    }
  }

  breakAt(x, y, z, survival) {
    const g = this.game, p = g.player, w = g.world;
    const id = w.getBlock(x, y, z);
    if (!id) return;
    const meta = w.getMeta(x, y, z);
    const held = p.held();
    g.particles.blockBreak(x, y, z, id);
    g.audio && g.audio.blockSound(id, 'break', x, y, z);
    g.onBlockBreak && g.onBlockBreak(x, y, z, id, meta);
    // containers drop contents
    g.dropTileContents && g.dropTileContents(x, y, z);
    w.breakBlock(x, y, z, false);
    if (survival) {
      const drops = blockDrops(id, meta, held);
      const fortune = enchLevel(held, 'fortune');
      const oreXP = ORE_XP[BLOCKS[id].name];
      for (const [did, n] of drops) {
        let cnt = n;
        // Prospector: extra yield for ores and crops that drop something other than themselves
        if (fortune && did !== id && (oreXP || BLOCKS[id].crop)) cnt += Math.floor(Math.random() * (fortune + 1));
        g.entities.dropItem(x + 0.5, y + 0.4, z + 0.5, did, cnt);
      }
      if (oreXP && drops.length && g.dropXP) g.dropXP(x + 0.5, y + 0.5, z + 0.5, oreXP[0] + Math.floor(Math.random() * (oreXP[1] - oreXP[0] + 1)));
      if (BLOCKS[id].hardness > 0) { this.damageHeld(1); p.exhaust(0.025); }
      // ice turns to water when broken over something
      if (id === B.ice) { const below = w.getBlock(x, y - 1, z); if (below && below !== B.air) w.setBlock(x, y, z, B.water, 0); }
    }
  }

  // ---- right click ----
  useRight(t, held, sneaking) {
    const g = this.game, p = g.player, w = g.world;
    const it = held ? ITEMS[held.id] : null;
    // entity interaction
    if (t && t.type === 'entity' && t.e.interact) {
      if (t.e.interact(p, held)) { p.swing = 1; this._lastUseWasInteract = true; return; }
    }
    // special items (Worldheart Keystone on an altar, dragon eggs)
    if (it && g.useSpecial && g.useSpecial(t, held, it)) { p.swing = 1; this._lastUseWasInteract = true; return; }
    // block interaction
    if (t && t.type === 'block' && !sneaking) {
      if (this.interactBlock(t)) { p.swing = 1; this._lastUseWasInteract = true; return; }
    }
    if (!it) return;
    // item uses that target blocks
    if (it.name === 'bucket') return this.useBucket();
    if (it.name === 'glass_bottle') return this.fillBottle();
    if (it.fill === 'water' || it.fill === 'lava') return this.placeLiquid(t, it.fill === 'water' ? B.water : B.lava, held);
    if (it.tool && it.tool.type === 'wand') { g.castSpell && g.castSpell(held); return; }
    if (it.throwable) { g.throwItem && g.throwItem(held); return; }
    if (it.name === 'oak_boat') { g.placeBoat && g.placeBoat(t, held); return; }
    if (!t || t.type !== 'block') return;
    const tid = t.id;
    if (it.tool) {
      const type = it.tool.type;
      if (type === 'hoe' && t.face === 2 && (tid === B.grass || tid === B.dirt || tid === B.dirt_path || tid === B.snowy_grass) && !w.getBlock(t.x, t.y + 1, t.z)) {
        w.setBlock(t.x, t.y, t.z, B.farmland, 0);
        g.audio && g.audio.blockSound(B.dirt, 'place', t.x, t.y, t.z);
        this.damageHeld(1); p.swing = 1; return;
      }
      if (type === 'shovel' && t.face !== 3 && (tid === B.grass || tid === B.dirt || tid === B.snowy_grass) && !w.getBlock(t.x, t.y + 1, t.z)) {
        w.setBlock(t.x, t.y, t.z, B.dirt_path, 0);
        g.audio && g.audio.blockSound(B.dirt, 'place', t.x, t.y, t.z);
        this.damageHeld(1); p.swing = 1; return;
      }
      if (type === 'axe' && tid === B.oak_log) {
        w.setBlock(t.x, t.y, t.z, B.stripped_oak_log, t.meta);
        g.audio && g.audio.blockSound(B.oak_log, 'place', t.x, t.y, t.z);
        this.damageHeld(1); p.swing = 1; return;
      }
      if (type === 'igniter' && tid === B.tnt) {
        g.primeTNT && g.primeTNT(t.x, t.y, t.z);
        g.audio && g.audio.play('ignite', { x: t.x, y: t.y, z: t.z });
        this.damageHeld(1); p.swing = 1; return;
      }
      if (type === 'igniter') {
        const n = FACE_N[t.face];
        const fx = t.x + n[0], fy = t.y + n[1], fz = t.z + n[2];
        if (!w.getBlock(fx, fy, fz)) {
          w.setBlock(fx, fy, fz, B.fire, 0);
          g.audio && g.audio.play('ignite', { x: fx, y: fy, z: fz });
          this.damageHeld(1); p.swing = 1;
        }
        return;
      }
      return;
    }
    if (it.places) {
      if (t.face === 2 && tid === B.farmland && !w.getBlock(t.x, t.y + 1, t.z)) {
        w.setBlock(t.x, t.y + 1, t.z, B[it.places], 0);
        g.audio && g.audio.blockSound(B.grass, 'place', t.x, t.y + 1, t.z);
        this.consumeHeld(); p.swing = 1;
      }
      return;
    }
    if (it.block >= 0) this.placeBlock(t, held);
  }

  consumeHeld(n = 1) {
    const p = this.game.player;
    if (p.creative) return;
    const s = p.held();
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) p.inventory.set(p.selected, null); else p.inventory.changed();
  }

  interactBlock(t) {
    const g = this.game, w = g.world, p = g.player;
    const bd = BLOCKS[t.id];
    if (bd.interact === 'crafting') { g.ui.openCrafting(); return true; }
    if (bd.interact === 'furnace') { g.ui.openFurnace(t.x, t.y, t.z); return true; }
    if (bd.interact === 'chest') { g.ui.openChest(t.x, t.y, t.z); return true; }
    if (bd.interact === 'door') {
      const m = t.meta;
      const otherY = (m & 8) ? t.y - 1 : t.y + 1;
      const nm = m ^ 4;
      w.setBlock(t.x, t.y, t.z, t.id, nm, { noUpdate: true });
      const om = w.getMeta(t.x, otherY, t.z);
      if (w.getBlock(t.x, otherY, t.z) === t.id) w.setBlock(t.x, otherY, t.z, t.id, om ^ 4, { noUpdate: true });
      g.audio && g.audio.play(nm & 4 ? 'door_open' : 'door_close', { x: t.x, y: t.y, z: t.z });
      return true;
    }
    if (bd.interact === 'sign' && g.editSign) { g.editSign(t.x, t.y, t.z); return true; }
    if (bd.interact === 'bed') { g.trySleep && g.trySleep(t.x, t.y, t.z); return true; }
    if (bd.interact === 'brewing' && g.ui.openBrewing) { g.ui.openBrewing(t.x, t.y, t.z); return true; }
    if (bd.interact === 'campfire' && g.useCampfire) return g.useCampfire(t.x, t.y, t.z, p.held());
    if (bd.seat && g.sitOn) return g.sitOn(t.x, t.y, t.z);
    if (bd.interact === 'enchanting' && g.ui.openEnchanting) { g.ui.openEnchanting(t.x, t.y, t.z); return true; }
    if (t.id === B.berry_bush) {
      g.entities.dropItem(t.x + 0.5, t.y + 0.6, t.z + 0.5, I.berries, 1 + Math.floor(Math.random() * 2));
      g.audio && g.audio.blockSound(B.grass, 'break', t.x, t.y, t.z);
      return true;
    }
    if (t.id === B.cake) return true;
    void p;
    return false;
  }

  fillBottle() {
    const g = this.game, p = g.player;
    const hit = this.raycastBlock(5, true);
    if (!hit || IS_LIQUID[hit.id] !== 1) return;
    g.audio && g.audio.play('bucket_fill', { x: hit.x, y: hit.y, z: hit.z });
    p.swing = 1;
    if (p.creative) { g.giveItem(I.water_bottle, 1); return; }
    this.consumeHeld();
    g.giveItem(I.water_bottle, 1);
  }

  useBucket() {
    const g = this.game, p = g.player, w = g.world;
    const hit = this.raycastBlock(5, true);
    if (!hit || !IS_LIQUID[hit.id] || (hit.meta & 15) !== 0) return;
    const kind = IS_LIQUID[hit.id];
    w.setBlock(hit.x, hit.y, hit.z, 0, 0);
    g.audio && g.audio.play(kind === 1 ? 'bucket_fill' : 'bucket_lava', { x: hit.x, y: hit.y, z: hit.z });
    const full = kind === 1 ? I.water_bucket : I.lava_bucket;
    if (p.creative) return;
    const s = p.held();
    if (s.count === 1) p.inventory.set(p.selected, { id: full, count: 1, dmg: 0 });
    else { s.count--; p.inventory.changed(); g.giveItem(full, 1); }
    p.swing = 1;
  }

  placeLiquid(t, liquid, held) {
    const g = this.game, p = g.player, w = g.world;
    if (!t || t.type !== 'block') return;
    let x = t.x, y = t.y, z = t.z;
    if (!BLOCKS[t.id].replaceable || IS_LIQUID[t.id]) { const n = FACE_N[t.face]; x += n[0]; y += n[1]; z += n[2]; }
    const cur = w.getBlock(x, y, z);
    if (cur && !BLOCKS[cur].replaceable) return;
    if (cur && !IS_LIQUID[cur]) w.breakBlock(x, y, z, true);
    w.setBlock(x, y, z, liquid, 0);
    w.schedule(x, y, z, liquid === B.water ? 5 : 30);
    g.audio && g.audio.play(liquid === B.water ? 'bucket_empty' : 'bucket_empty_lava', { x, y, z });
    p.swing = 1;
    if (!p.creative) p.inventory.set(p.selected, { id: I.bucket, count: 1, dmg: 0 });
    void held;
  }

  placeBlock(t, held) {
    const g = this.game, p = g.player, w = g.world;
    const blockId = ITEMS[held.id].block;
    const bd = BLOCKS[blockId];
    const tb = BLOCKS[t.id];
    let x = t.x, y = t.y, z = t.z;
    const n = FACE_N[t.face];
    const fracY = t.py - t.y;
    // slab merging
    if (bd.shape === SHAPE.SLAB && t.id === blockId) {
      const top = t.meta & 1;
      if ((t.face === 2 && !top) || (t.face === 3 && top)) {
        const full = SLAB_FULL(blockId);
        if (full) {
          w.setBlock(x, y, z, full, 0);
          g.audio && g.audio.blockSound(full, 'place', x, y, z);
          this.consumeHeld(); p.swing = 1;
          return;
        }
      }
    }
    if (!(tb.replaceable && t.id !== blockId) || IS_LIQUID[t.id] && false) { x += n[0]; y += n[1]; z += n[2]; }
    if (y < 0 || y >= HEIGHT) return;
    const cur = w.getBlock(x, y, z);
    if (cur && !BLOCKS[cur].replaceable) {
      // slab into the other half of an existing slab cell
      if (bd.shape === SHAPE.SLAB && cur === blockId) {
        const full = SLAB_FULL(blockId);
        if (full) { w.setBlock(x, y, z, full, 0); this.consumeHeld(); p.swing = 1; }
      }
      return;
    }
    let meta = 0;
    const lf = lookFacing(p.yaw);
    const shape = bd.shape;
    // placement rules
    if (bd.log) meta = t.face <= 1 ? 1 : t.face >= 4 ? 2 : 0;
    if (bd.oriented || bd.interact === 'crafting') meta = (lf + 2) & 3;
    if (shape === SHAPE.SLAB) meta = (t.face === 3 || (t.face !== 2 && fracY > 0.5)) ? 1 : 0;
    if (shape === SHAPE.STAIRS) meta = lf | ((t.face === 3 || (t.face !== 2 && fracY > 0.5)) ? 4 : 0);
    if (shape === SHAPE.TORCH) {
      if (t.face === 3) return;
      if (t.face !== 2) {
        if (!BLOCKS[t.id].opaque) return;
        meta = 1 + ((FACE_TO_FACING[t.face] + 2) & 3);
      } else {
        const below = w.getBlock(x, y - 1, z);
        if (!BLOCKS[below].solid && !BLOCKS[below].fence) return;
      }
    }
    if (shape === SHAPE.LADDER) {
      if (t.face === 2 || t.face === 3) return;
      if (!BLOCKS[t.id].opaque) return;
      meta = (FACE_TO_FACING[t.face] + 2) & 3;
    }
    if (shape === SHAPE.LANTERN) meta = t.face === 3 ? 1 : 0;
    if (shape === SHAPE.CROSS || shape === SHAPE.CROP || shape === SHAPE.WATER_PLANT) {
      const below = w.getBlock(x, y - 1, z);
      const okSoil = [B.grass, B.dirt, B.snowy_grass, B.forest_floor, B.moss_block, B.mud, B.farmland, B.podzol].includes(below);
      if (blockId === B.cactus) { if (below !== B.sand && below !== B.red_sand && below !== B.cactus) return; }
      else if (blockId === B.reeds) { if (!(okSoil || below === B.sand || below === B.reeds)) return; }
      else if (blockId === B.dead_bush) { if (!(below === B.sand || below === B.red_sand || okSoil)) return; }
      else if (blockId === B.mushroom_red || blockId === B.mushroom_brown || blockId === B.glowcap) { if (!BLOCKS[below].solid) return; }
      else if (bd.waterlogged) { if (!IS_LIQUID[cur]) return; }
      else if (blockId === B.cobweb) { /* anywhere */ }
      else if (!okSoil) return;
    }
    if (blockId === B.lily_pad && IS_LIQUID[w.getBlock(x, y - 1, z)] !== 1) return;
    if (shape === SHAPE.SNOW_LAYER) { const below = w.getBlock(x, y - 1, z); if (!BLOCKS[below].opaque) return; }
    // collision with player / entities
    if (bd.solid) {
      const boxes = collisionBoxes(blockId, meta, w, x, y, z);
      for (const b of boxes) {
        const bx0 = x + b[0], by0 = y + b[1], bz0 = z + b[2], bx1 = x + b[3], by1 = y + b[4], bz1 = z + b[5];
        const hits = (e) => bx1 > e.x - e.hw && bx0 < e.x + e.hw && by1 > e.y && by0 < e.y + e.h && bz1 > e.z - e.hw && bz0 < e.z + e.hw;
        if (hits(p)) return;
        for (const e of g.entities.list) if (!e.dead && e.solidBody && hits(e)) return;
      }
    }
    // multi-block structures
    if (shape === SHAPE.DOOR) {
      if (w.getBlock(x, y + 1, z) && !BLOCKS[w.getBlock(x, y + 1, z)].replaceable) return;
      if (!BLOCKS[w.getBlock(x, y - 1, z)].solid) return;
      w.setBlock(x, y, z, blockId, lf, { noUpdate: true });
      w.setBlock(x, y + 1, z, blockId, lf | 8, { noUpdate: true });
    } else if (shape === SHAPE.BED) {
      const [dx, dz] = [[0, -1], [1, 0], [0, 1], [-1, 0]][lf];
      const hx = x + dx, hz = z + dz;
      const hc = w.getBlock(hx, y, hz);
      if (hc && !BLOCKS[hc].replaceable) return;
      if (!BLOCKS[w.getBlock(x, y - 1, z)].solid || !BLOCKS[w.getBlock(hx, y - 1, hz)].solid) return;
      w.setBlock(x, y, z, blockId, lf, { noUpdate: true });
      w.setBlock(hx, y, hz, blockId, lf | 4, { noUpdate: true });
    } else {
      if (cur && IS_LIQUID[cur] && !bd.waterlogged && cur !== B.water) { /* replacing lava etc */ }
      if (cur && !IS_LIQUID[cur] && BLOCKS[cur].replaceable) w.breakBlock(x, y, z, false);
      w.setBlock(x, y, z, blockId, meta);
      if (bd.gravity) w.schedule(x, y, z, 2);
    }
    g.audio && g.audio.blockSound(blockId, 'place', x, y, z);
    g.onBlockPlaced && g.onBlockPlaced(x, y, z, blockId);
    this.consumeHeld();
    p.swing = 1;
  }
}

export { lookFacing, IS_WATERLOGGED };
