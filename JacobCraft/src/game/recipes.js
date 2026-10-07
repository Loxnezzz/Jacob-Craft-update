// Crafting (shaped / shapeless) and smelting recipes.
import { I, ITEMS, itemByName } from './items.js';

const TAGS = {
  '#planks': (n) => n.endsWith('_planks'),
  '#log': (n) => n.endsWith('_log'),
  '#cobble': (n) => n === 'cobblestone' || n === 'darkstone' || n === 'scorched_stone' || n === 'mossy_cobblestone',
  '#wool': (n) => n.startsWith('wool_'),
  '#coal': (n) => n === 'coal' || n === 'charcoal',
  '#sand': (n) => n === 'sand' || n === 'red_sand',
  '#leaves': (n) => n.endsWith('_leaves'),
};

function matches(ing, id) {
  if (!id) return false;
  const it = ITEMS[id];
  if (!it) return false;
  if (ing.startsWith('#')) return TAGS[ing](it.name);
  return it.name === ing;
}

export const RECIPES = [];

function shaped(pattern, key, result, count = 1, group = 'misc') {
  const res = itemByName(result);
  if (!res) { console.warn('bad recipe result', result); return; }
  RECIPES.push({ type: 'shaped', pattern, key, result: res.id, count, w: pattern[0].length, h: pattern.length, group });
}
function shapeless(ings, result, count = 1, group = 'misc') {
  const res = itemByName(result);
  if (!res) { console.warn('bad recipe result', result); return; }
  RECIPES.push({ type: 'shapeless', ings, result: res.id, count, group });
}

// ---- basics ----
for (const w of ['oak', 'birch', 'pine', 'willow', 'teak', 'elder', 'palm']) shapeless([w + '_log'], w + '_planks', 4, 'basic');
shapeless(['stripped_oak_log'], 'oak_planks', 4, 'basic');
shaped(['P', 'P'], { P: '#planks' }, 'stick', 4, 'basic');
shaped(['PP', 'PP'], { P: '#planks' }, 'crafting_table', 1, 'basic');
shaped(['CCC', 'C.C', 'CCC'], { C: '#cobble' }, 'furnace', 1, 'basic');
shaped(['PPP', 'P.P', 'PPP'], { P: '#planks' }, 'chest', 1, 'basic');
shaped(['C', 'S'], { C: '#coal', S: 'stick' }, 'torch', 4, 'basic');
shaped(['C', 'S'], { C: 'sunstone_shard', S: 'stick' }, 'torch', 6, 'basic');
shaped(['S.S', 'SSS', 'S.S'], { S: 'stick' }, 'ladder', 3, 'building');
shaped(['PP', 'PP', 'PP'], { P: '#planks' }, 'oak_door', 3, 'building');
shaped(['PSP', 'PSP'], { P: '#planks', S: 'stick' }, 'oak_fence', 3, 'building');
shaped(['WWW', 'PPP'], { W: '#wool', P: '#planks' }, 'bed', 1, 'basic');
shaped(['PPP', 'BBB', 'PPP'], { P: '#planks', B: 'book' }, 'bookshelf', 1, 'building');
shaped(['RRR'], { R: 'reeds' }, 'paper', 3, 'misc');
shapeless(['paper', 'paper', 'paper', 'leather'], 'book', 1, 'misc');
shaped(['XXX'], { X: 'oak_planks' }, 'oak_slab', 6, 'building');
shaped(['XXX'], { X: 'cobblestone' }, 'cobblestone_slab', 6, 'building');
shaped(['XXX'], { X: 'stone_bricks' }, 'stone_brick_slab', 6, 'building');
shaped(['X..', 'XX.', 'XXX'], { X: '#planks' }, 'oak_stairs', 4, 'building');
shaped(['X..', 'XX.', 'XXX'], { X: 'cobblestone' }, 'cobblestone_stairs', 4, 'building');
shaped(['X..', 'XX.', 'XXX'], { X: 'stone_bricks' }, 'stone_brick_stairs', 4, 'building');
shaped(['XX', 'XX'], { X: 'stone' }, 'stone_bricks', 4, 'building');
shapeless(['stone_bricks', 'vines'], 'mossy_stone_bricks', 1, 'building');
shapeless(['cobblestone', 'vines'], 'mossy_cobblestone', 1, 'building');
shapeless(['stone_bricks', 'moss_block'], 'mossy_stone_bricks', 1, 'building');
shaped(['XX', 'XX'], { X: 'brick' }, 'bricks', 1, 'building');
shaped(['XX', 'XX'], { X: 'sand' }, 'sandstone', 1, 'building');
shaped(['X', 'X'], { X: 'sandstone' }, 'carved_sandstone', 1, 'building');
shaped(['XX', 'XX'], { X: 'marble' }, 'marble_bricks', 4, 'building');
shaped(['XX', 'XX'], { X: 'frost_ice' }, 'frost_bricks', 4, 'building');
shaped(['XX', 'XX'], { X: 'basalt' }, 'volcanic_bricks', 4, 'building');
shaped(['XX', 'XX'], { X: 'snowball' }, 'snow_block', 1, 'building');
shaped(['XX', 'XX'], { X: 'clay_ball' }, 'clay', 1, 'building');
shaped(['XX', 'XX'], { X: 'ancient_bricks' }, 'mossy_ancient_bricks', 4, 'building');
shaped(['XX', 'XX'], { X: 'sunstone_shard' }, 'sunstone_block', 1, 'basic');
shaped(['.I.', 'ITI', '.I.'], { I: 'iron_ingot', T: 'torch' }, 'lantern', 1, 'basic');
shaped(['.I.', 'IFI', '.I.'], { I: 'iron_ingot', F: 'frostite_shard' }, 'glow_lantern', 1, 'basic');
shaped(['WWW', 'WWW', 'WWW'], { W: 'wheat_item' }, 'hay_bale', 1, 'building');
shapeless(['hay_bale'], 'wheat_item', 9, 'misc');
shaped(['SS', 'SS'], { S: 'string' }, 'wool_white', 1, 'building');
const DYES = [['flower_rosebell', 'red'], ['flower_sunpetal', 'yellow'], ['flower_skybloom', 'blue'], ['flower_duskviolet', 'purple'], ['flower_pinkmallow', 'red'], ['pumpkin', 'orange'], ['fern', 'green'], ['coal', 'black'], ['mud', 'brown'], ['flint', 'gray']];
for (const [d, c] of DYES) shapeless(['wool_white', d], 'wool_' + c, 1, 'building');
shaped(['TTT', 'TTT', 'TTT'], { T: 'tall_grass' }, 'hay_bale', 1, 'building');
shaped(['XX', 'XX'], { X: 'mud' }, 'bricks', 1, 'building');

// storage blocks
const STORE = [['coal', 'coal_block'], ['copper_ingot', 'copper_block'], ['iron_ingot', 'iron_block'], ['gold_ingot', 'gold_block'], ['diamond', 'diamond_block'], ['emerald', 'emerald_block'], ['emberite_ingot', 'emberite_block'], ['frostite_shard', 'frostite_block']];
for (const [a, b] of STORE) {
  shaped(['XXX', 'XXX', 'XXX'], { X: a }, b, 1, 'storage');
  shapeless([b], a, 9, 'storage');
}

// tools
const TOOL_MATS = [['wooden', '#planks'], ['stone', '#cobble'], ['copper', 'copper_ingot'], ['iron', 'iron_ingot'], ['golden', 'gold_ingot'], ['diamond', 'diamond'], ['emberite', 'emberite_ingot']];
for (const [m, mat] of TOOL_MATS) {
  shaped(['MMM', '.S.', '.S.'], { M: mat, S: 'stick' }, m + '_pickaxe', 1, 'tools');
  shaped(['MM', 'MS', '.S'], { M: mat, S: 'stick' }, m + '_axe', 1, 'tools');
  shaped(['M', 'S', 'S'], { M: mat, S: 'stick' }, m + '_shovel', 1, 'tools');
  shaped(['MM', '.S', '.S'], { M: mat, S: 'stick' }, m + '_hoe', 1, 'tools');
  shaped(['M', 'M', 'S'], { M: mat, S: 'stick' }, m + '_sword', 1, 'combat');
}
// armor
const ARMOR_MATS = [['leather', 'leather'], ['copper', 'copper_ingot'], ['iron', 'iron_ingot'], ['gold', 'gold_ingot'], ['diamond', 'diamond'], ['emberite', 'emberite_ingot']];
for (const [m, mat] of ARMOR_MATS) {
  shaped(['MMM', 'M.M'], { M: mat }, m + '_helmet', 1, 'combat');
  shaped(['M.M', 'MMM', 'MMM'], { M: mat }, m + '_chestplate', 1, 'combat');
  shaped(['MMM', 'M.M', 'M.M'], { M: mat }, m + '_leggings', 1, 'combat');
  shaped(['M.M', 'M.M'], { M: mat }, m + '_boots', 1, 'combat');
}
shaped(['I.I', '.I.'], { I: 'iron_ingot' }, 'bucket', 1, 'tools');
shaped(['I.I', '.I.'], { I: 'copper_ingot' }, 'bucket', 1, 'tools');
shaped(['.I', 'I.'], { I: 'iron_ingot' }, 'shears', 1, 'tools');
shapeless(['iron_ingot', 'flint'], 'flint_and_steel', 1, 'tools');
shaped(['.TS', 'T.S', '.TS'], { T: 'stick', S: 'string' }, 'bow', 1, 'combat');
shaped(['F', 'S', 'E'], { F: 'flint', S: 'stick', E: 'feather' }, 'arrow', 4, 'combat');
shaped(['..T', '.TS', 'T.S'], { T: 'stick', S: 'string' }, 'fishing_rod', 1, 'tools');
shaped(['P.P', 'PPP'], { P: '#planks' }, 'oak_boat', 1, 'tools');
shaped(['P.P', '.P.'], { P: '#planks' }, 'bowl', 4, 'misc');
shapeless(['mushroom_red', 'mushroom_brown', 'bowl'], 'mushroom_stew', 1, 'food');
shaped(['WWW'], { W: 'wheat_item' }, 'bread', 1, 'food');
shaped(['LLL', 'L.L', 'I.I'], { L: 'leather', I: 'iron_ingot' }, 'saddle', 1, 'tools');
shaped(['.I.', 'ISI', '.I.'], { I: 'iron_ingot', S: 'sunstone_shard' }, 'compass', 1, 'tools');
shaped(['F', 'C', 'C'], { F: 'frostite_shard', C: 'copper_ingot' }, 'spyglass', 1, 'tools');
shaped(['..F', '.S.', 'S..'], { F: 'frostite_shard', S: 'stick' }, 'magic_wand', 1, 'magic');
shapeless(['berries', 'apple', 'sunstone_shard'], 'dragon_treat', 2, 'magic');
shapeless(['sunstone_shard'], 'glowdust', 2, 'magic');
shaped(['G', 'S'], { G: 'glowdust', S: 'stick' }, 'torch', 8, 'basic');

// ---- phase 6: weapons, gunpowder, alchemy, enchanting ----
shaped(['SIS', 'T.T', '.S.'], { S: 'stick', I: 'iron_ingot', T: 'string' }, 'crossbow', 1, 'combat');
shaped(['..F', '.S.', 'S..'], { F: 'flint', S: 'stick' }, 'flint_spear', 1, 'combat');
shaped(['..I', '.S.', 'S..'], { I: 'iron_ingot', S: 'stick' }, 'iron_spear', 1, 'combat');
shaped(['I', 'S'], { I: 'iron_ingot', S: 'stick' }, 'iron_dagger', 1, 'combat');
shaped(['.II', '.II', 'S..'], { I: 'iron_ingot', S: 'stick' }, 'iron_mace', 1, 'combat');
shapeless(['iron_ingot'], 'iron_nugget', 9, 'misc');
shaped(['NNN', 'NNN', 'NNN'], { N: 'iron_nugget' }, 'iron_ingot', 1, 'misc');
shaped(['NN', 'NN'], { N: 'iron_nugget' }, 'iron_shot', 4, 'combat');
shapeless(['brimstone', 'niter', '#coal'], 'gunpowder', 2, 'combat');
shaped(['GII', 'WFP', 'W..'], { G: 'gold_ingot', I: 'iron_ingot', W: '#planks', F: 'flint', P: 'gunpowder' }, 'emberlock_pistol', 1, 'combat');
shaped(['GGD', 'WFP', 'W..'], { G: 'gold_ingot', D: 'diamond', W: '#planks', F: 'flint', P: 'gunpowder' }, 'thunder_blunderbuss', 1, 'combat');
shaped(['III', 'FTI', 'W..'], { I: 'iron_ingot', F: 'flint', T: 'tnt', W: '#planks' }, 'tnt_launcher', 1, 'combat');
// ---- blocks that were only found in the world until now
shaped(['S..', 'SS.', 'SSS'], { S: 'sandstone' }, 'sandstone_stairs', 4, 'building');
shaped(['SSS'], { S: 'sandstone' }, 'sandstone_slab', 6, 'building');
shaped(['B..', 'BB.', 'BBB'], { B: 'bricks' }, 'brick_stairs', 4, 'building');
shaped(['PP', 'PP', 'PP'], { P: 'pine_planks' }, 'spruce_door', 3, 'building');
shaped(['III', '.N.', 'NNN'], { I: 'iron_block', N: 'iron_ingot' }, 'anvil', 1, 'tools');
shaped(['PSP', 'P.P', 'PSP'], { P: '#planks', S: 'oak_slab' }, 'barrel', 1, 'storage');
shaped(['WWW', 'WWW'], { W: 'wool_purple' }, 'purple_wool_roof', 6, 'building');
shaped(['BBB', 'BBB', 'BBB'], { B: 'bone' }, 'bone_block', 1, 'building');
shapeless(['bone_block'], 'bone', 9, 'misc');
shaped(['BB', 'BB'], { B: 'basalt' }, 'polished_basalt', 4, 'building');
shaped(['SS', 'SS'], { S: 'stone' }, 'smooth_stone', 4, 'building');
shaped(['G', 'S'], { G: 'glowcap', S: 'stick' }, 'torch', 2, 'basic');
// lights, furnishings and traps
shaped(['ICI', '.I.', '.I.'], { I: 'iron_ingot', C: '#coal' }, 'brazier', 1, 'basic');
shaped(['I', 'T', 'I'], { I: 'iron_nugget', T: 'torch' }, 'wall_sconce', 2, 'basic');
shaped(['.S.', 'PTP', 'PPP'], { S: 'string', P: 'paper', T: 'torch' }, 'paper_lantern', 2, 'basic');
shaped(['.I.', 'GWG', '.I.'], { I: 'iron_nugget', G: 'glass', W: 'pale_wick' }, 'moth_lantern', 2, 'basic');
shaped(['G', 'T', 'N'], { G: 'glass', T: 'torch', N: 'gold_ingot' }, 'oil_lamp', 2, 'basic');
shaped(['PPP', 'B.B'], { P: '#planks', B: 'book' }, 'wall_shelf', 2, 'building');
shaped(['PPP', 'PPP', '.S.'], { P: '#planks', S: 'stick' }, 'wooden_sign', 3, 'building');
shaped(['BBB', 'B.B', 'BCB'], { B: 'stone_bricks', C: 'campfire' }, 'hearth', 1, 'building');
shaped(['B.B', 'B.B', 'BBB'], { B: 'bricks' }, 'chimney', 2, 'building');
shaped(['C.C', 'C.C', '.C.'], { C: 'clay_ball' }, 'clay_urn', 1, 'building');
shaped(['SS'], { S: 'sandstone' }, 'sandstone_plate', 1, 'building');
shaped(['PSP', 'SPS', 'PSP'], { P: 'gunpowder', S: '#sand' }, 'tnt', 1, 'combat');
shaped(['G.G', '.G.'], { G: 'glass' }, 'glass_bottle', 3, 'magic');
shaped(['BSB', 'PPP'], { B: 'glass_bottle', S: 'sunstone_shard', P: '#planks' }, 'alchemy_table', 1, 'magic');
shaped(['.K.', 'DOD', 'OOO'], { K: 'book', D: 'diamond', O: 'obsidian' }, 'runic_altar', 1, 'magic');

// ---- phase 6: building blocks & furniture ----
// wood-specific stairs/slabs/fences must win over the generic '#planks' recipes, so they go to the front
function shapedFirst(pattern, key, result, count = 1, group = 'misc') { shaped(pattern, key, result, count, group); RECIPES.unshift(RECIPES.pop()); }
for (const w of ['pine', 'teak', 'birch', 'palm', 'elder']) {
  if (itemByName(w + '_stairs')) shapedFirst(['X..', 'XX.', 'XXX'], { X: w + '_planks' }, w + '_stairs', 4, 'building');
  if (itemByName(w + '_slab')) shapedFirst(['XXX'], { X: w + '_planks' }, w + '_slab', 6, 'building');
  if (itemByName(w + '_fence')) shapedFirst(['PSP', 'PSP'], { P: w + '_planks', S: 'stick' }, w + '_fence', 3, 'building');
}
shaped(['XX', 'XX'], { X: 'granite' }, 'polished_granite', 4, 'building');
shaped(['XX', 'XX'], { X: 'darkstone' }, 'polished_darkstone', 4, 'building');
shaped(['XX', 'XX'], { X: 'polished_darkstone' }, 'darkstone_bricks', 4, 'building');
shaped(['X', 'X'], { X: 'stone_brick_slab' }, 'chiseled_stone_bricks', 1, 'building');
shaped(['XX', 'XX'], { X: 'sandstone' }, 'sandstone_bricks', 4, 'building');
shaped(['MW', 'WM'], { M: 'mud', W: 'wheat_item' }, 'mud_bricks', 4, 'building');
shaped(['XX', 'XX'], { X: 'smooth_stone' }, 'stone_tiles', 4, 'building');
shaped(['BBB'], { B: 'brick' }, 'clay_shingles', 2, 'building');
shaped(['DDD'], { D: 'darkstone' }, 'slate_shingles', 3, 'building');
shaped(['WW', 'WW'], { W: 'wheat_item' }, 'thatch', 1, 'building');
shaped(['S.S', '.C.', 'S.S'], { S: 'stick', C: 'clay_ball' }, 'timber_frame', 2, 'building');
shapeless(['#sand', 'clay_ball', 'bone'], 'plaster_white', 4, 'building');
shapeless(['plaster_white', 'flower_sunpetal'], 'plaster_cream', 1, 'building');
shapeless(['plaster_white', 'baked_clay_orange'], 'plaster_terracotta', 1, 'building');
shapeless(['plaster_white', 'moss_block'], 'plaster_sage', 1, 'building');
shapeless(['plaster_white', '#coal'], 'plaster_slate', 1, 'building');
shapeless(['stone_tiles', 'flower_skybloom'], 'blue_tiles', 1, 'building');
shapeless(['stone_tiles', 'kelp'], 'teal_tiles', 1, 'building');
shaped(['XXX'], { X: 'stone_tiles' }, 'stone_tile_slab', 6, 'building');
shaped(['X..', 'XX.', 'XXX'], { X: 'clay_shingles' }, 'clay_shingle_stairs', 4, 'building');
shaped(['X..', 'XX.', 'XXX'], { X: 'slate_shingles' }, 'slate_shingle_stairs', 4, 'building');
shaped(['X..', 'XX.', 'XXX'], { X: 'darkstone_bricks' }, 'darkstone_brick_stairs', 4, 'building');
for (const [c, dye] of [['red', 'flower_rosebell'], ['orange', 'baked_clay_orange'], ['yellow', 'flower_sunpetal'], ['green', 'moss_block'], ['blue', 'flower_skybloom'], ['purple', 'flower_duskviolet']]) {
  shaped(['GGG', 'GDG', 'GGG'], { G: 'glass', D: dye }, 'stained_glass_' + c, 8, 'building');
}
shaped(['PPP', 'S.S', 'S.S'], { P: '#planks', S: 'stick' }, 'oak_table', 1, 'building');
shaped(['S..', 'PPP', 'S.S'], { P: '#planks', S: 'stick' }, 'oak_chair', 2, 'building');
shaped(['PPP', 'S.S'], { P: '#planks', S: 'stick' }, 'oak_bench', 2, 'building');
shaped(['P', 'S'], { P: 'oak_slab', S: 'stick' }, 'oak_stool', 1, 'building');
shaped(['SPS', 'P.P', 'SPS'], { S: 'stick', P: '#planks' }, 'crate', 1, 'storage');
shaped(['PPP', 'PCP', 'PPP'], { P: '#planks', C: 'chest' }, 'cupboard', 1, 'storage');
shapeless(['string', 'raw_mutton'], 'candle', 3, 'basic');
shapeless(['string', 'raw_pork'], 'candle', 3, 'basic');
shaped(['B.B', '.B.'], { B: 'brick' }, 'flower_pot', 1, 'building');
for (const c of ['red', 'blue', 'green', 'white']) shaped(['WW'], { W: 'wool_' + c }, 'carpet_' + c, 3, 'building');
shaped(['L', 'I', 'I'], { L: 'lantern', I: 'iron_ingot' }, 'lamp_post', 1, 'building');
shaped(['.S.', 'SCS', 'LLL'], { S: 'stick', C: '#coal', L: '#log' }, 'campfire', 1, 'basic');

// ---- boss milestone gear ----
shapeless(['compass', 'wayfinder_shard', 'wayfinder_shard'], 'lair_compass', 1, 'magic');
shaped(['PIP', 'PPP', '.P.'], { P: '#planks', I: 'iron_ingot' }, 'shield', 1, 'combat');
shaped(['FSF', 'EDE', 'GWG'], { F: 'frostite_shard', S: 'sunstone_shard', E: 'emberite_ingot', D: 'diamond', G: 'glowdust', W: 'wayfinder_shard' }, 'worldheart_keystone', 1, 'magic');
shaped(['.TI', '.ST', 'S..'], { T: 'mammoth_tusk', I: 'iron_block', S: 'stick' }, 'tuskbreaker', 1, 'combat');
shaped(['L.L', 'LTL', 'LWL'], { L: 'leather', T: 'mammoth_tusk', W: 'wool_white' }, 'mammoth_cloak', 1, 'combat');
shaped(['.EH', 'E.S', '.ES'], { E: 'elder_log', H: 'warden_heart', S: 'string' }, 'heartwood_bow', 1, 'combat');
shaped(['GHG', 'L.L'], { G: 'glowcap', H: 'warden_heart', L: 'elder_leaves' }, 'verdant_crown', 1, 'combat');
shaped(['T', 'T', 'G'], { T: 'titan_shard', G: 'gold_block' }, 'sunforged_blade', 1, 'combat');
shaped(['T.T', 'S.S'], { T: 'titan_shard', S: 'sandstone' }, 'sandwalker_boots', 1, 'combat');
shaped(['..W', '.F.', 'S..'], { W: 'wyrm_scale', F: 'frostite_block', S: 'stick' }, 'glacier_spear', 1, 'combat');
shaped(['W.W', 'IWI', 'III'], { W: 'wyrm_scale', I: 'frostite_block' }, 'wyrmscale_chestplate', 1, 'combat');
shaped(['EHE', 'S.S', '.E.'], { E: 'emberite_ingot', H: 'behemoth_horn', S: 'string' }, 'inferno_crossbow', 1, 'combat');
shaped(['HEH', 'E.E'], { H: 'behemoth_horn', E: 'emberite_ingot' }, 'behemoth_helm', 1, 'combat');

// ---------- matching ----------
function trimGrid(grid, w, h) {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (grid[y * w + x]) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX < 0) return null;
  const tw = maxX - minX + 1, th = maxY - minY + 1;
  const t = [];
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) t.push(grid[(y + minY) * w + (x + minX)]);
  return { t, w: tw, h: th };
}

function matchShaped(r, g, mirror) {
  if (r.w !== g.w || r.h !== g.h) return false;
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const ch = r.pattern[y][mirror ? r.w - 1 - x : x];
    const id = g.t[y * g.w + x];
    if (ch === '.' || ch === ' ') { if (id) return false; continue; }
    if (!matches(r.key[ch], id)) return false;
  }
  return true;
}

function matchShapeless(r, grid) {
  const items = grid.filter(Boolean);
  if (items.length !== r.ings.length) return false;
  const used = new Array(items.length).fill(false);
  for (const ing of r.ings) {
    let ok = false;
    for (let i = 0; i < items.length; i++) {
      if (!used[i] && matches(ing, items[i])) { used[i] = true; ok = true; break; }
    }
    if (!ok) return false;
  }
  return true;
}

// grid: array of item ids (0 = empty), w x h
export function matchCrafting(grid, w, h) {
  const g = trimGrid(grid, w, h);
  if (!g) return null;
  for (const r of RECIPES) {
    if (r.type === 'shaped') {
      if (r.w > w || r.h > h) continue;
      if (matchShaped(r, g, false) || matchShaped(r, g, true)) return r;
    } else if (matchShapeless(r, grid)) return r;
  }
  return null;
}

// ---- smelting ----
export const SMELT = {
  raw_copper: 'copper_ingot', raw_iron: 'iron_ingot', raw_gold: 'gold_ingot', raw_emberite: 'emberite_ingot',
  copper_ore: 'copper_ingot', iron_ore: 'iron_ingot', gold_ore: 'gold_ingot', emberite_ore: 'emberite_ingot',
  sand: 'glass', red_sand: 'glass', cobblestone: 'stone', stone: 'smooth_stone', clay_ball: 'brick', clay: 'baked_clay_orange',
  raw_beef: 'steak', raw_pork: 'cooked_pork', raw_mutton: 'cooked_mutton', raw_chicken: 'cooked_chicken', raw_fish: 'cooked_fish', raw_venison: 'cooked_venison',
  stone_bricks: 'cracked_stone_bricks', darkstone: 'smooth_stone', ice: 'frost_ice', cactus: 'fern', basalt: 'polished_basalt',
  sunstone_ore: 'sunstone_shard', frostite_ore: 'frostite_shard', diamond_ore: 'diamond', emerald_ore: 'emerald', coal_ore: 'coal',
};
for (const w of ['oak', 'birch', 'pine', 'willow', 'teak', 'elder', 'palm']) SMELT[w + '_log'] = 'charcoal';

export function smeltResult(id) {
  const it = ITEMS[id];
  if (!it) return 0;
  const out = SMELT[it.name];
  return out ? I[out] : 0;
}

// Recipes the player could make with the given item counts (for the recipe book)
export function recipeIngredients(r) {
  const need = new Map();
  const list = r.type === 'shaped' ? r.pattern.join('').split('').filter(c => c !== '.' && c !== ' ').map(c => r.key[c]) : r.ings;
  for (const ing of list) need.set(ing, (need.get(ing) || 0) + 1);
  return need;
}

export function canCraftWith(r, counts) {
  for (const [ing, n] of recipeIngredients(r)) {
    let have = 0;
    for (const [id, c] of counts) if (matches(ing, id)) have += c;
    if (have < n) return false;
  }
  return true;
}

export { matches as ingredientMatches };
