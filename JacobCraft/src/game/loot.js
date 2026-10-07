// Loot tables for generated chests: [item, min, max, chance]
import { I } from './items.js';

export const LOOT = {
  village: [['bread', 1, 3, 0.6], ['apple', 1, 3, 0.5], ['wheat_item', 2, 6, 0.4], ['iron_ingot', 1, 2, 0.25], ['emerald', 1, 3, 0.35], ['seeds', 2, 5, 0.4], ['torch', 2, 6, 0.4], ['leather', 1, 3, 0.2], ['carrot', 1, 4, 0.3]],
  smithy: [['iron_ingot', 1, 4, 0.7], ['iron_pickaxe', 1, 1, 0.2], ['iron_sword', 1, 1, 0.2], ['iron_helmet', 1, 1, 0.15], ['coal', 2, 6, 0.6], ['gold_ingot', 1, 2, 0.2], ['diamond', 1, 1, 0.06], ['copper_ingot', 2, 6, 0.4], ['emerald', 1, 2, 0.3]],
  ruins: [['gold_ingot', 1, 3, 0.4], ['emerald', 1, 2, 0.3], ['iron_ingot', 1, 3, 0.4], ['bone', 1, 4, 0.5], ['book', 1, 2, 0.3], ['saddle', 1, 1, 0.15], ['diamond', 1, 1, 0.08], ['arrow', 2, 8, 0.4], ['flint', 1, 3, 0.3]],
  ancient: [['emerald', 1, 3, 0.5], ['book', 1, 3, 0.5], ['frostite_shard', 1, 2, 0.3], ['sunstone_shard', 1, 3, 0.4], ['diamond', 1, 2, 0.15], ['healing_potion', 1, 2, 0.4], ['magic_wand', 1, 1, 0.12], ['glowdust', 2, 5, 0.4]],
  wizard: [['magic_wand', 1, 1, 0.3], ['healing_potion', 1, 2, 0.6], ['swift_potion', 1, 2, 0.4], ['night_potion', 1, 1, 0.3], ['frostite_shard', 1, 3, 0.5], ['sunstone_shard', 1, 4, 0.5], ['book', 1, 3, 0.6], ['glowdust', 2, 6, 0.5], ['emerald', 1, 4, 0.4]],
  shipwreck: [['emerald', 1, 3, 0.5], ['gold_ingot', 1, 4, 0.5], ['iron_ingot', 1, 5, 0.6], ['diamond', 1, 2, 0.15], ['compass', 1, 1, 0.3], ['raw_fish', 1, 4, 0.4], ['paper', 1, 4, 0.4], ['saddle', 1, 1, 0.15], ['spyglass', 1, 1, 0.1]],
  mineshaft: [['coal', 2, 8, 0.7], ['iron_ingot', 1, 4, 0.5], ['torch', 4, 12, 0.5], ['bread', 1, 3, 0.4], ['gold_ingot', 1, 2, 0.3], ['diamond', 1, 2, 0.1], ['raw_copper', 2, 6, 0.5], ['iron_pickaxe', 1, 1, 0.08]],
  pyramid: [['gold_ingot', 1, 4, 0.55], ['bone', 2, 5, 0.5], ['emerald', 1, 2, 0.35], ['sunstone_shard', 1, 3, 0.4], ['paper', 1, 3, 0.3], ['bread', 1, 2, 0.25], ['healing_potion', 1, 1, 0.15], ['golden_sword', 1, 1, 0.1], ['diamond', 1, 1, 0.06], ['clay_urn', 1, 2, 0.2]],
  pyramid_secret: [['gold_ingot', 4, 8, 0.9], ['diamond', 1, 3, 0.55], ['emerald', 3, 6, 0.7], ['sunstone_shard', 3, 6, 0.6], ['gold_helmet', 1, 1, 0.3], ['gold_chestplate', 1, 1, 0.25], ['runic_tome', 1, 1, 0.25], ['gold_block', 1, 1, 0.3]],
  pyramid_tomb: [['gold_ingot', 5, 10, 0.95], ['diamond', 2, 4, 0.6], ['emerald', 4, 8, 0.8], ['wayfinder_shard', 1, 1, 0.5], ['runic_tome', 1, 1, 0.35], ['sunstone_shard', 4, 8, 0.6], ['healing_potion', 1, 2, 0.5]],
  temple: [['gold_ingot', 2, 6, 0.7], ['emerald', 2, 5, 0.6], ['diamond', 1, 3, 0.3], ['sunstone_shard', 3, 8, 0.6], ['bone', 2, 6, 0.5], ['golden_sword', 1, 1, 0.3], ['saddle', 1, 1, 0.2], ['healing_potion', 1, 2, 0.3]],
};

export function rollLoot(table, inv) {
  const t = LOOT[table] || LOOT.village;
  const slots = [...Array(inv.size).keys()].sort(() => Math.random() - 0.5);
  let k = 0;
  for (const [name, mn, mx, ch] of t) {
    if (Math.random() > ch) continue;
    const id = I[name];
    if (id === undefined) continue;
    const n = mn + Math.floor(Math.random() * (mx - mn + 1));
    inv.slots[slots[k++ % slots.length]] = { id, count: n, dmg: 0 };
  }
  if (k === 0) inv.slots[slots[0]] = { id: I.bread, count: 2, dmg: 0 };
  inv.changed();
}
