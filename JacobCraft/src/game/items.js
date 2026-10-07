// Item registry. Block items share ids with blocks (0..255); other items start at 256.
// Only APPEND new items to keep save files valid.
import { BLOCKS, B, SHAPE } from '../world/blocks.js';

export const ITEMS = [];
export const I = {};
const byName = Object.create(null);

// Tool tiers: harvest level, speed, durability, base damage
export const TIERS = {
  wood: { level: 0, speed: 2, dur: 59, dmg: 0, color: 'wood', label: 'Wooden' },
  stone: { level: 1, speed: 4, dur: 131, dmg: 1, color: 'stone', label: 'Stone' },
  copper: { level: 2, speed: 5, dur: 190, dmg: 1.5, color: 'copper', label: 'Copper' },
  iron: { level: 3, speed: 6, dur: 250, dmg: 2, color: 'iron', label: 'Iron' },
  gold: { level: 0, speed: 12, dur: 32, dmg: 0, color: 'gold', label: 'Golden' },
  diamond: { level: 4, speed: 8, dur: 1561, dmg: 3, color: 'diamond', label: 'Diamond' },
  emberite: { level: 5, speed: 10, dur: 2500, dmg: 4.5, color: 'emberite', label: 'Emberite' },
};
export const ARMOR_TIERS = {
  leather: { pts: [1, 3, 2, 1], dur: 5, label: 'Leather', color: 'leather' },
  copper: { pts: [2, 4, 3, 1], dur: 11, label: 'Copper', color: 'copper' },
  iron: { pts: [2, 6, 5, 2], dur: 15, label: 'Iron', color: 'iron' },
  gold: { pts: [2, 5, 3, 1], dur: 7, label: 'Golden', color: 'gold' },
  diamond: { pts: [3, 8, 6, 3], dur: 33, label: 'Diamond', color: 'diamond', tough: 2 },
  emberite: { pts: [3, 8, 6, 3], dur: 40, label: 'Emberite', color: 'emberite', tough: 3, fireRes: true },
};
const ARMOR_SLOTS = ['helmet', 'chestplate', 'leggings', 'boots'];
const ARMOR_DUR_BASE = [11, 16, 15, 13];

function reg(id, name, label, props = {}) {
  const it = Object.assign({ id, name, label, stack: 64, block: -1 }, props);
  ITEMS[id] = it; I[name] = id; byName[name] = it;
  return it;
}

// ---- block items ----
const NOT_ITEMS = new Set(['air', 'water', 'lava', 'fire', 'wheat', 'carrots', 'snowy_pine_leaves']);
for (const b of BLOCKS) {
  if (NOT_ITEMS.has(b.name)) continue;
  const flat = [SHAPE.CROSS, SHAPE.TORCH, SHAPE.LADDER, SHAPE.DOOR, SHAPE.FLAT, SHAPE.LANTERN, SHAPE.WATER_PLANT, SHAPE.CROP, SHAPE.BED].includes(b.shape);
  reg(b.id, b.name, b.label, { block: b.id, flatIcon: flat, stack: b.name === 'bed' ? 1 : 64 });
}

// ---- other items ----
let nid = 256;
function item(name, label, props) { return reg(nid++, name, label, props); }

item('stick', 'Stick', { art: 'stick', fuel: 5 });
item('coal', 'Coal', { art: 'coal', fuel: 80 });
item('charcoal', 'Charcoal', { art: 'charcoal', fuel: 80 });
item('raw_copper', 'Raw Copper', { art: 'raw', pal: 'copper' });
item('raw_iron', 'Raw Iron', { art: 'raw', pal: 'iron_raw' });
item('raw_gold', 'Raw Gold', { art: 'raw', pal: 'gold' });
item('raw_emberite', 'Raw Emberite', { art: 'raw', pal: 'emberite' });
item('copper_ingot', 'Copper Ingot', { art: 'ingot', pal: 'copper' });
item('iron_ingot', 'Iron Ingot', { art: 'ingot', pal: 'iron' });
item('gold_ingot', 'Gold Ingot', { art: 'ingot', pal: 'gold' });
item('emberite_ingot', 'Emberite Ingot', { art: 'ingot', pal: 'emberite' });
item('diamond', 'Diamond', { art: 'gem', pal: 'diamond' });
item('emerald', 'Emerald', { art: 'emerald', pal: 'emerald' });
item('sunstone_shard', 'Sunstone Shard', { art: 'shard', pal: 'sunstone', glow: true });
item('frostite_shard', 'Frostite Shard', { art: 'shard', pal: 'frostite', glow: true });
item('clay_ball', 'Clay Ball', { art: 'ball', pal: 'clay' });
item('brick', 'Brick', { art: 'brick' });
item('flint', 'Flint', { art: 'flint' });
item('string', 'String', { art: 'string' });
item('feather', 'Feather', { art: 'feather' });
item('leather', 'Leather', { art: 'leather' });
item('bone', 'Bone', { art: 'bone' });
item('wheat_item', 'Wheat', { art: 'wheat' });
item('seeds', 'Seeds', { art: 'seeds', places: 'wheat' });
item('carrot', 'Carrot', { art: 'carrot', food: [3, 3.6], places: 'carrots' });
item('snowball', 'Snowball', { art: 'ball', pal: 'snow', stack: 16, throwable: true });
item('apple', 'Apple', { art: 'apple', food: [4, 2.4] });
item('berries', 'Wild Berries', { art: 'berries', food: [2, 1.2] });
item('bread', 'Bread', { art: 'bread', food: [5, 6] });
item('raw_beef', 'Raw Beef', { art: 'meat', pal: 'raw_red', food: [3, 1.8] });
item('steak', 'Steak', { art: 'meat', pal: 'cooked', food: [8, 12.8] });
item('raw_pork', 'Raw Pork', { art: 'chop', pal: 'raw_pink', food: [3, 1.8] });
item('cooked_pork', 'Cooked Pork', { art: 'chop', pal: 'cooked', food: [8, 12.8] });
item('raw_mutton', 'Raw Mutton', { art: 'meat', pal: 'raw_red', food: [2, 1.2] });
item('cooked_mutton', 'Cooked Mutton', { art: 'meat', pal: 'cooked', food: [6, 9.6] });
item('raw_chicken', 'Raw Chicken', { art: 'drumstick', pal: 'raw_pink', food: [2, 1.2], poison: 0.3 });
item('cooked_chicken', 'Cooked Chicken', { art: 'drumstick', pal: 'cooked', food: [6, 7.2] });
item('raw_fish', 'Raw Fish', { art: 'fish', pal: 'fish_raw', food: [2, 0.4] });
item('cooked_fish', 'Cooked Fish', { art: 'fish', pal: 'fish_cooked', food: [5, 6] });
item('raw_venison', 'Raw Venison', { art: 'meat', pal: 'raw_red', food: [3, 1.8] });
item('cooked_venison', 'Cooked Venison', { art: 'meat', pal: 'cooked', food: [8, 12] });
item('mushroom_stew', 'Mushroom Stew', { art: 'stew', food: [6, 7.2], stack: 1, returns: 'bowl' });
item('bowl', 'Bowl', { art: 'bowl', fuel: 5 });
item('bucket', 'Bucket', { art: 'bucket', stack: 16 });
item('water_bucket', 'Water Bucket', { art: 'bucket', fill: 'water', stack: 1 });
item('lava_bucket', 'Lava Bucket', { art: 'bucket', fill: 'lava', stack: 1, fuel: 1000 });
item('milk_bucket', 'Milk Bucket', { art: 'bucket', fill: 'milk', stack: 1, drink: true });
item('bow', 'Bow', { art: 'bow', stack: 1, tool: { type: 'bow', dur: 384 } });
item('arrow', 'Arrow', { art: 'arrow' });
item('fishing_rod', 'Fishing Rod', { art: 'rod', stack: 1, tool: { type: 'rod', dur: 64 } });
item('shears', 'Shears', { art: 'shears', stack: 1, tool: { type: 'shears', dur: 238, speed: 6, level: 0 } });
item('flint_and_steel', 'Flint and Steel', { art: 'flint_steel', stack: 1, tool: { type: 'igniter', dur: 64 } });
item('oak_boat', 'Boat', { art: 'boat', stack: 1 });
item('saddle', 'Saddle', { art: 'saddle', stack: 1 });
item('paper', 'Paper', { art: 'paper' });
item('book', 'Book', { art: 'book' });
item('sugar_reed', 'Reed Fiber', { art: 'fiber' });
item('gunpowder', 'Gunpowder', { art: 'gunpowder' });
item('glowdust', 'Glow Dust', { art: 'dust', pal: 'sunstone', glow: true });
item('mammoth_tusk', 'Mammoth Tusk', { art: 'tusk', rare: true });
item('warden_heart', 'Heartwood Core', { art: 'core', pal: 'elder', rare: true });
item('titan_shard', 'Titan Sandstone Shard', { art: 'shard', pal: 'sand', rare: true });
item('wyrm_scale', 'Frost Wyrm Scale', { art: 'scale', pal: 'frostite', rare: true });
item('behemoth_horn', 'Behemoth Horn', { art: 'tusk', pal: 'emberite', rare: true });
item('dragon_egg', 'Dragon Egg', { art: 'egg', rare: true, glow: true, stack: 1, desc: 'Place it on the ground and keep it company. Something stirs inside.' });
item('magic_wand', 'Apprentice Wand', { art: 'wand', stack: 1, tool: { type: 'wand', dur: 200 } });
item('frost_staff', 'Frost Staff', { art: 'staff', pal: 'frostite', stack: 1, tool: { type: 'wand', dur: 400, spell: 'frost' } });
item('ember_staff', 'Ember Staff', { art: 'staff', pal: 'emberite', stack: 1, tool: { type: 'wand', dur: 400, spell: 'fire' } });
item('healing_potion', 'Healing Draught', { art: 'potion', pal: 'heal', stack: 1, drink: true, potion: 'healing' });
item('swift_potion', 'Swiftness Draught', { art: 'potion', pal: 'swift', stack: 1, drink: true, potion: 'swift' });
item('night_potion', 'Owl-Eye Draught', { art: 'potion', pal: 'night', stack: 1, drink: true, potion: 'night' });
item('dragon_treat', 'Dragonfruit Treat', { art: 'treat', stack: 16 });
item('compass', 'Compass', { art: 'compass', stack: 1, desc: 'Hold it to find your way home (your bed, or where you first arrived).' });
item('spyglass', 'Spyglass', { art: 'spyglass', stack: 1, tool: { type: 'spyglass', dur: 0 }, desc: 'Hold use to look far away.' });

// tools for each tier
const TOOL_TYPES = [
  ['pickaxe', 'Pickaxe', 1, 1.2],
  ['axe', 'Axe', 5, 0.9],
  ['shovel', 'Shovel', 1.5, 1.0],
  ['hoe', 'Hoe', 0, 2.0],
  ['sword', 'Sword', 3, 1.6],
];
for (const tn in TIERS) {
  const t = TIERS[tn];
  for (const [type, lab, dmgBase, atkSpeed] of TOOL_TYPES) {
    const mat = tn === 'wood' ? 'wooden' : tn === 'gold' ? 'golden' : tn;
    item(mat + '_' + type, t.label + ' ' + lab, {
      art: type, pal: tn, stack: 1,
      tool: { type, tier: tn, level: t.level, speed: t.speed, dur: t.dur, dmg: 1 + dmgBase + t.dmg, atkSpeed },
      fuel: tn === 'wood' ? 10 : 0,
    });
  }
}
// armor
for (const an in ARMOR_TIERS) {
  const a = ARMOR_TIERS[an];
  ARMOR_SLOTS.forEach((slot, si) => {
    item(an + '_' + slot, a.label + ' ' + slot[0].toUpperCase() + slot.slice(1), {
      art: slot, pal: an, stack: 1,
      armor: { slot: si, pts: a.pts[si], dur: ARMOR_DUR_BASE[si] * a.dur, tough: a.tough || 0, fireRes: !!a.fireRes },
    });
  });
}

// ---- appended in phase 6 (keep order!) ----
// ranged & melee weapons
item('crossbow', 'Crossbow', { art: 'crossbow', stack: 1, tool: { type: 'crossbow', dur: 465, dmg: 1 }, desc: 'Hold use to crank a bolt, then use to loose it. Hits hard and flat.' });
item('flint_spear', 'Flint Spear', { art: 'spear', pal: 'stone', stack: 1, tool: { type: 'spear', dur: 131, dmg: 5, atkSpeed: 1.2, reach: 5.2 }, desc: 'Long reach. Hold use to throw.' });
item('iron_spear', 'Iron Spear', { art: 'spear', pal: 'iron', stack: 1, tool: { type: 'spear', dur: 280, dmg: 7, atkSpeed: 1.2, reach: 5.2 }, desc: 'Long reach. Hold use to throw.' });
item('iron_dagger', 'Iron Dagger', { art: 'dagger', pal: 'iron', stack: 1, tool: { type: 'dagger', dur: 220, dmg: 4, atkSpeed: 3.2 }, desc: 'Very fast. Double damage from behind.' });
item('iron_mace', 'Iron Mace', { art: 'mace', pal: 'iron', stack: 1, tool: { type: 'mace', dur: 320, dmg: 10, atkSpeed: 0.75 }, desc: 'Slow, crushing blows. Pierces armor and staggers.' });
item('emberlock_pistol', 'Emberlock Pistol', { art: 'pistol', stack: 1, tool: { type: 'gun', gun: 'pistol', dur: 160, dmg: 16 }, desc: 'Hold use to load (Iron Shot + Gunpowder). Use to fire.' });
item('thunder_blunderbuss', 'Thunder Blunderbuss', { art: 'blunderbuss', stack: 1, tool: { type: 'gun', gun: 'blunderbuss', dur: 120, dmg: 5 }, desc: 'Fires a wide spray of shot. Devastating up close.' });
item('iron_shot', 'Iron Shot', { art: 'shot' });
item('brimstone', 'Brimstone', { art: 'brimstone' });
item('niter', 'Niter Crystals', { art: 'niter' });
item('iron_nugget', 'Iron Nugget', { art: 'nugget', pal: 'iron' });
// alchemy
item('glass_bottle', 'Glass Bottle', { art: 'bottle', stack: 16 });
item('water_bottle', 'Water Bottle', { art: 'potion', pal: 'water', stack: 1, drink: true, potion: 'water' });
item('base_tonic', 'Murky Tonic', { art: 'potion', pal: 'murky', stack: 1, drink: true, potion: 'base', desc: 'A base for stronger draughts.' });
item('strength_potion', 'Ogre Strength Draught', { art: 'potion', pal: 'strength', stack: 1, drink: true, potion: 'strength' });
item('fireward_potion', 'Emberward Draught', { art: 'potion', pal: 'fireward', stack: 1, drink: true, potion: 'fireward' });
item('gill_potion', 'Gillweed Draught', { art: 'potion', pal: 'gill', stack: 1, drink: true, potion: 'gill' });
// enchanting
item('runic_tome', 'Runic Tome', { art: 'tome', stack: 1, desc: 'Holds a rune. Combine with gear on the Runic Altar.' });
// boss milestone gear (each needs the boss's trophy)
item('tuskbreaker', 'Tuskbreaker', { art: 'mace', pal: 'bone', stack: 1, rare: true, tool: { type: 'mace', dur: 900, dmg: 13, atkSpeed: 0.8, frost: true }, desc: 'Carved from a mammoth tusk. Crushing blows chill and stagger.' });
item('mammoth_cloak', 'Mammoth Fur Cloak', { art: 'chestplate', pal: 'leather', stack: 1, rare: true, armor: { slot: 1, pts: 7, dur: 600, tough: 2, fireRes: false, warm: true }, desc: 'Warm as a hearth. Immune to chilling slowness.' });
item('heartwood_bow', 'Heartwood Bow', { art: 'bow', stack: 1, rare: true, glow: true, tool: { type: 'bow', dur: 900, draw: 1.5, root: true }, desc: 'Draws fast. Its arrows root what they strike.' });
item('verdant_crown', 'Verdant Crown', { art: 'helmet', pal: 'elder', stack: 1, rare: true, glow: true, armor: { slot: 0, pts: 3, dur: 500, tough: 1, regen: true }, desc: 'Living leaves slowly mend your wounds.' });
item('sunforged_blade', 'Sunforged Blade', { art: 'sword', pal: 'sunstone', stack: 1, rare: true, glow: true, tool: { type: 'sword', dur: 1200, dmg: 10, atkSpeed: 1.6, ignite: true }, desc: 'Forged in the Titan\'s heat. Sets foes ablaze.' });
item('sandwalker_boots', 'Sandwalker Boots', { art: 'boots', pal: 'sand', stack: 1, rare: true, armor: { slot: 3, pts: 3, dur: 600, tough: 1, swift: true }, desc: 'Light as the desert wind. Move faster, fastest on sand.' });
item('glacier_spear', 'Glacier Spear', { art: 'spear', pal: 'frostite', stack: 1, rare: true, glow: true, tool: { type: 'spear', dur: 1000, dmg: 10, atkSpeed: 1.2, reach: 5.6, frost: true }, desc: 'Freezes whatever it pierces.' });
item('wyrmscale_chestplate', 'Wyrmscale Chestplate', { art: 'chestplate', pal: 'frostite', stack: 1, rare: true, armor: { slot: 1, pts: 9, dur: 800, tough: 3, warm: true }, desc: 'Scales of the Frost Wyrm. Nearly impenetrable.' });
item('inferno_crossbow', 'Inferno Crossbow', { art: 'crossbow', stack: 1, rare: true, glow: true, tool: { type: 'crossbow', dur: 1000, dmg: 1, infernal: true }, desc: 'Bolts burst into flame on impact.' });
item('behemoth_helm', 'Behemoth Helm', { art: 'helmet', pal: 'emberite', stack: 1, rare: true, armor: { slot: 0, pts: 4, dur: 800, tough: 3, fireRes: true, emberHalf: true }, desc: 'Halves all fire and lava damage.' });
// the road to the ending
item('wayfinder_shard', 'Wayfinder Shard', { art: 'shard', pal: 'wayfinder', glow: true, rare: true, desc: 'Dropped by champion monsters. It hums when turned toward something ancient.' });
item('lair_compass', 'Lair Compass', { art: 'lair_compass', stack: 1, rare: true, glow: true, desc: 'Points to the nearest great beast you have not yet defeated.' });
item('worldheart_keystone', 'Worldheart Keystone', { art: 'keystone', stack: 1, rare: true, glow: true, desc: 'Use it on a Runic Altar once all five great beasts have fallen.' });
// off-hand
item('shield', 'Shield', { art: 'shield', stack: 1, tool: { type: 'shield', dur: 336 }, desc: 'Hold it in your off-hand (F to swap) and hold use to block attacks from the front.' });
// render-only helpers (never obtainable)
item('bow_pulling', 'Bow', { art: 'bow_nostring', stack: 1, hidden: true });
// final completion update (keep order!)
item('pale_wick', 'Pale Wick', { art: 'wick', stack: 16, rare: true, glow: true, desc: 'Left behind where the Wickwalker stood. Still faintly warm, though nothing burns it.' });
item('tnt_launcher', 'TNT Launcher', { art: 'launcher', stack: 1, tool: { type: 'gun', gun: 'launcher', dur: 90, dmg: 0 }, desc: 'Hold use to load a TNT, then use to lob it. It bursts on impact.' });
item('gilded_khopesh', 'Gilded Khopesh', { art: 'khopesh', pal: 'gold', stack: 1, rare: true, glow: true, tool: { type: 'sword', dur: 1100, dmg: 9, atkSpeed: 1.7, sand: true }, desc: "Ankhuret's curved blade. Its strikes clog foes with sand, slowing them." });
item('husk_crown', "Husk-King's Nemes", { art: 'nemes', stack: 1, rare: true, armor: { slot: 0, pts: 3, dur: 600, tough: 1, nightsight: true }, desc: 'The striped headdress of a buried king. Its wearer sees in the dark.' });

export const NUM_ITEMS = nid;
export function itemByName(n) { return byName[n]; }
export function enchLevel(s, key) { return s && s.ench ? (s.ench[key] || 0) : 0; }
export function itemDef(id) { return ITEMS[id]; }
export function isBlockItem(id) { return id < 256 && ITEMS[id] && ITEMS[id].block >= 0; }
export function maxStack(id) { const it = ITEMS[id]; return it ? it.stack : 64; }

// Fuel values in "items smelted * 10" units (MC: coal = 8 items)
export function fuelValue(id) {
  const it = ITEMS[id];
  if (!it) return 0;
  if (it.fuel) return it.fuel;
  if (id < 256) {
    const b = BLOCKS[id];
    if (b.name.endsWith('_planks') || b.name.endsWith('_slab') && b.sound === 'wood') return 15;
    if (b.name.endsWith('_log')) return 15;
    if (b.name === 'coal_block') return 800;
    if (b.name.startsWith('sapling')) return 5;
    if (b.sound === 'wood' && b.flammable) return 15;
    if (b.name.startsWith('wool')) return 5;
  }
  return 0;
}

// Drops for breaking block `id` with `toolItem` (stack or null). Returns array of [itemId, count].
export function blockDrops(id, meta, toolStack, rng = Math.random) {
  const b = BLOCKS[id];
  const tool = toolStack ? ITEMS[toolStack.id].tool : null;
  if (b.tier >= 0 && b.tool === 'pickaxe') {
    if (!tool || tool.type !== 'pickaxe' || tool.level < b.tier) return [];
  }
  if (b.tool === 'pickaxe' && b.tier >= 0 && !tool) return [];
  if (tool && tool.type === 'shears' && (b.name.endsWith('_leaves') || b.name === 'vines' || b.name === 'cobweb' || b.name === 'tall_grass' || b.name === 'fern')) {
    return [[id === B.snowy_pine_leaves ? B.pine_leaves : id, 1]];
  }
  const d = b.drop;
  if (d === null) return [];
  if (d === undefined) {
    if (id === B.bed) return [[I.bed, 1]];
    return [[id, 1]];
  }
  if (typeof d === 'string') {
    if (d.startsWith('leafdrop_')) {
      const w = d.slice(9);
      const out = [];
      if (rng() < 0.05) out.push([I['sapling_' + w], 1]);
      if (w === 'oak' && rng() < 0.012) out.push([I.apple, 1]);
      if (rng() < 0.02) out.push([I.stick, 1 + (rng() < 0.5 ? 1 : 0)]);
      return out;
    }
    if (d === 'seeds_chance') return rng() < 0.125 ? [[I.seeds, 1]] : [];
    if (d === 'clay_ball') return [[I.clay_ball, 4]];
    if (d === 'snowball') return [[I.snowball, id === B.snow_block ? 4 : 1]];
    if (d === 'berries') return [[I.berries, 1 + Math.floor(rng() * 3)]];
    if (d === 'wheat_crop') return (meta & 7) >= 7 ? [[I.wheat_item, 1], [I.seeds, 1 + Math.floor(rng() * 3)]] : [[I.seeds, 1]];
    if (d === 'carrot_crop') return (meta & 7) >= 7 ? [[I.carrot, 2 + Math.floor(rng() * 3)]] : [[I.carrot, 1]];
    if (d === 'coal') return [[I.coal, 1]];
    if (d === 'diamond' || d === 'emerald') return [[I[d], 1]];
    if (d === 'sunstone_shard') return [[I.sunstone_shard, 2 + Math.floor(rng() * 3)]];
    if (d === 'frostite_shard') return [[I.frostite_shard, 1 + Math.floor(rng() * 2)]];
    if (d === 'string') return [[I.string, 1]];
    if (d === 'kelp') return [[B.kelp, 1]];
    if (d === 'oak_door') return [[B.oak_door, 1]];
    const it = byName[d];
    if (it) return [[it.id, 1]];
  }
  return [];
}

// Break time in seconds for block with given tool stack (null = hand)
export function breakTime(id, toolStack, ctx = {}) {
  const b = BLOCKS[id];
  if (b.hardness < 0) return Infinity;
  if (b.hardness === 0) return 0.05;
  const tool = toolStack ? ITEMS[toolStack.id].tool : null;
  let speed = 1;
  const correct = tool && b.tool && (tool.type === b.tool || (b.tool === 'shears' && tool.type === 'sword' && b.name === 'cobweb'));
  if (correct) speed = (tool.speed || 1) * (1 + enchLevel(toolStack, 'efficiency') * 0.35);
  if (tool && tool.type === 'shears' && (b.name.endsWith('_leaves') || b.name === 'cobweb' || b.name.startsWith('wool'))) speed = b.name === 'cobweb' ? 15 : 5;
  if (tool && tool.type === 'sword' && b.name === 'cobweb') speed = 15;
  const canHarvest = !(b.tier >= 0 && b.tool === 'pickaxe') || (tool && tool.type === 'pickaxe' && tool.level >= b.tier);
  let t = b.hardness * (canHarvest ? 1.5 : 5) / speed;
  if (ctx.underwater) t *= 5;
  if (ctx.airborne) t *= 5;
  if (ctx.haste) t /= ctx.haste;
  return Math.max(0.05, t);
}
