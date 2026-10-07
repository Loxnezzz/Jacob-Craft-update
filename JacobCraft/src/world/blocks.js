// Block registry. IDs are assigned by order — only ever APPEND new blocks to keep saves compatible.

export const SHAPE = {
  NONE: 0, CUBE: 1, CROSS: 2, SLAB: 3, STAIRS: 4, FENCE: 5, DOOR: 6, TORCH: 7,
  LIQUID: 8, BED: 9, LADDER: 10, SNOW_LAYER: 11, FARMLAND: 12, CACTUS: 13,
  CROP: 14, FLAT: 15, LANTERN: 16, WATER_PLANT: 17, PATH: 18, MODEL: 19,
};

export const LAYER = { OPAQUE: 0, CUTOUT: 1, TRANSLUCENT: 2 };
export const TINT = { NONE: 0, GRASS: 1, FOLIAGE: 2, BIRCH: 3, PINE: 4, WATER: 5 };

const DEFAULTS = {
  shape: SHAPE.CUBE,
  layer: LAYER.OPAQUE,
  solid: true,
  opaque: true,
  lightFilter: 15,
  light: 0,
  emissive: 0,       // 0..1 shader emissive strength
  emissiveMode: 0,   // 0 = whole texture, 1 = only bright pixels
  hardness: 1,
  tool: null,
  tier: -1,          // minimum tool tier to get drops (-1 = any / hand)
  drop: undefined,   // undefined = itself, null = nothing, string = block/item name, fn
  sound: 'stone',
  tint: TINT.NONE,
  wave: 0,           // 1 = leaves sway, 2 = plant sway (bottom pinned)
  replaceable: false,
  gravity: false,
  flammable: false,
  climbable: false,
  slippery: 0,
  reflect: 0,        // extra reflectivity for SSR
  material: 0,       // shader material id (1 water, 2 lava, 3 ice, 4 glass)
};

const list = [];
const byName = Object.create(null);

function def(name, label, props) {
  const b = Object.assign({}, DEFAULTS, props, { id: list.length, name, label });
  if (typeof b.tex === 'string') b.tex = { all: b.tex };
  list.push(b);
  byName[name] = b;
  return b;
}

// convenience presets
const plant = (tex, extra = {}) => Object.assign({
  tex, shape: SHAPE.CROSS, layer: LAYER.CUTOUT, solid: false, opaque: false, lightFilter: 0,
  hardness: 0, sound: 'grass', replaceable: false, wave: 2, flammable: true,
}, extra);

const leaves = (tex, tint) => ({
  tex, layer: LAYER.CUTOUT, opaque: false, lightFilter: 1, hardness: 0.2, tool: 'shears',
  sound: 'grass', tint, wave: 1, flammable: true,
});

const log = (side, top) => ({ tex: { side, top, bottom: top }, hardness: 2, tool: 'axe', sound: 'wood', flammable: true, log: true });
const planks = (t) => ({ tex: t, hardness: 2, tool: 'axe', sound: 'wood', flammable: true });
const ore = (t, tier, drop, extra = {}) => Object.assign({ tex: t, hardness: 3, tool: 'pickaxe', tier, drop }, extra);
const stoneLike = (t, h = 1.5, extra = {}) => Object.assign({ tex: t, hardness: h, tool: 'pickaxe', tier: 0 }, extra);

def('air', 'Air', { shape: SHAPE.NONE, solid: false, opaque: false, lightFilter: 0, hardness: 0, drop: null, tex: 'stone' });
def('grass', 'Grass Block', { tex: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' }, hardness: 0.6, tool: 'shovel', sound: 'grass', drop: 'dirt', tint: TINT.GRASS });
def('dirt', 'Dirt', { tex: 'dirt', hardness: 0.5, tool: 'shovel', sound: 'gravel' });
def('stone', 'Stone', stoneLike('stone', 1.5, { drop: 'cobblestone' }));
def('cobblestone', 'Cobblestone', stoneLike('cobblestone', 2));
def('bedrock', 'Bedrock', { tex: 'bedrock', hardness: -1 });
def('sand', 'Sand', { tex: 'sand', hardness: 0.5, tool: 'shovel', sound: 'sand', gravity: true });
def('red_sand', 'Red Sand', { tex: 'red_sand', hardness: 0.5, tool: 'shovel', sound: 'sand', gravity: true });
def('gravel', 'Gravel', { tex: 'gravel', hardness: 0.6, tool: 'shovel', sound: 'gravel', gravity: true });
def('clay', 'Clay', { tex: 'clay', hardness: 0.6, tool: 'shovel', sound: 'gravel', drop: 'clay_ball' });
def('sandstone', 'Sandstone', stoneLike({ top: 'sandstone_top', side: 'sandstone_side', bottom: 'sandstone_bottom' }, 0.8));
def('snow_block', 'Snow Block', { tex: 'snow', hardness: 0.2, tool: 'shovel', sound: 'snow', drop: 'snowball' });
def('snow_layer', 'Snow', { tex: 'snow', shape: SHAPE.SNOW_LAYER, opaque: false, lightFilter: 0, hardness: 0.1, tool: 'shovel', sound: 'snow', replaceable: true, drop: 'snowball', solid: false });
def('snowy_grass', 'Snowy Grass', { tex: { top: 'snow', side: 'grass_snow_side', bottom: 'dirt' }, hardness: 0.6, tool: 'shovel', sound: 'snow', drop: 'dirt' });
def('ice', 'Ice', { tex: 'ice', layer: LAYER.TRANSLUCENT, opaque: false, lightFilter: 2, hardness: 0.5, tool: 'pickaxe', sound: 'glass', slippery: 0.98, drop: null, material: 3, reflect: 0.6 });
def('frost_ice', 'Frost Ice', { tex: 'frost_ice', hardness: 0.5, tool: 'pickaxe', sound: 'glass', slippery: 0.98, reflect: 0.35 });
def('water', 'Water', { tex: 'water', shape: SHAPE.LIQUID, layer: LAYER.TRANSLUCENT, solid: false, opaque: false, lightFilter: 2, hardness: 100, drop: null, replaceable: true, material: 1, tint: TINT.WATER, liquid: 'water' });
def('lava', 'Lava', { tex: 'lava', shape: SHAPE.LIQUID, layer: LAYER.OPAQUE, solid: false, opaque: false, lightFilter: 1, light: 15, emissive: 1, hardness: 100, drop: null, replaceable: true, material: 2, liquid: 'lava' });
def('mud', 'Mud', { tex: 'mud', hardness: 0.5, tool: 'shovel', sound: 'mud' });
def('moss_block', 'Moss Block', { tex: 'moss', hardness: 0.3, tool: 'hoe', sound: 'grass' });
def('forest_floor', 'Forest Floor', { tex: { top: 'forest_floor_top', side: 'forest_floor_side', bottom: 'dirt' }, hardness: 0.5, tool: 'shovel', sound: 'grass', drop: 'dirt' });
def('coal_ore', 'Coal Ore', ore('coal_ore', 0, 'coal'));
def('copper_ore', 'Copper Ore', ore('copper_ore', 1, 'raw_copper'));
def('iron_ore', 'Iron Ore', ore('iron_ore', 1, 'raw_iron'));
def('gold_ore', 'Gold Ore', ore('gold_ore', 3, 'raw_gold'));
def('emerald_ore', 'Emerald Ore', ore('emerald_ore', 3, 'emerald'));
def('diamond_ore', 'Diamond Ore', ore('diamond_ore', 3, 'diamond'));
def('sunstone_ore', 'Sunstone Ore', ore('sunstone_ore', 1, 'sunstone_shard', { light: 7, emissive: 1.4, emissiveMode: 1 }));
def('frostite_ore', 'Frostite Ore', ore('frostite_ore', 3, 'frostite_shard', { light: 3, emissive: 0.6, emissiveMode: 1 }));
def('emberite_ore', 'Emberite Ore', ore('emberite_ore', 4, 'raw_emberite', { hardness: 6, light: 5, emissive: 1.6, emissiveMode: 1 }));

const WOODS = ['oak', 'birch', 'pine', 'willow', 'teak', 'elder', 'palm'];
const WOOD_LABEL = { oak: 'Oak', birch: 'Birch', pine: 'Pine', willow: 'Willow', teak: 'Teak', elder: 'Elder', palm: 'Palm' };
const LEAF_TINT = { oak: TINT.FOLIAGE, birch: TINT.BIRCH, pine: TINT.PINE, willow: TINT.FOLIAGE, teak: TINT.FOLIAGE, elder: TINT.FOLIAGE, palm: TINT.FOLIAGE };
for (const w of WOODS) {
  def(w + '_log', WOOD_LABEL[w] + ' Log', log(w + '_log', w + '_log_top'));
  def(w + '_planks', WOOD_LABEL[w] + ' Planks', planks(w + '_planks'));
  def(w + '_leaves', WOOD_LABEL[w] + ' Leaves', Object.assign(leaves(w + '_leaves', LEAF_TINT[w]), { drop: w === 'oak' || w === 'birch' || w === 'pine' ? 'leafdrop_' + w : null }));
}

def('glass', 'Glass', { tex: 'glass', layer: LAYER.CUTOUT, opaque: false, lightFilter: 0, hardness: 0.3, sound: 'glass', drop: null, material: 4, reflect: 0.3 });
def('bricks', 'Bricks', stoneLike('bricks', 2));
def('stone_bricks', 'Stone Bricks', stoneLike('stone_bricks'));
def('mossy_stone_bricks', 'Mossy Stone Bricks', stoneLike('mossy_stone_bricks'));
def('cracked_stone_bricks', 'Cracked Stone Bricks', stoneLike('cracked_stone_bricks'));
def('mossy_cobblestone', 'Mossy Cobblestone', stoneLike('mossy_cobblestone', 2));
def('smooth_stone', 'Smooth Stone', stoneLike('smooth_stone', 2, { reflect: 0.15 }));
def('darkstone', 'Darkstone', stoneLike('darkstone', 3, { drop: 'darkstone' }));
def('granite', 'Granite', stoneLike('granite'));
def('marble', 'Marble', stoneLike('marble', 1.5, { reflect: 0.25 }));
def('basalt', 'Basalt', stoneLike({ top: 'basalt_top', side: 'basalt_side', bottom: 'basalt_top' }, 1.25));
def('ash', 'Ash', { tex: 'ash', hardness: 0.5, tool: 'shovel', sound: 'sand' });
def('obsidian', 'Obsidian', stoneLike('obsidian', 50, { tier: 4, reflect: 0.3 }));
def('magma', 'Magma Block', stoneLike('magma', 0.5, { light: 3, emissive: 1.0, emissiveMode: 1 }));
def('scorched_stone', 'Scorched Stone', stoneLike('scorched_stone', 1.5));
for (const c of ['red', 'orange', 'yellow', 'white', 'brown', 'gray']) {
  def('baked_clay_' + c, c[0].toUpperCase() + c.slice(1) + ' Baked Clay', stoneLike('baked_clay_' + c, 1.25));
}
def('coal_block', 'Block of Coal', stoneLike('coal_block', 5));
def('copper_block', 'Block of Copper', stoneLike('copper_block', 3, { tier: 1, sound: 'metal', reflect: 0.45 }));
def('iron_block', 'Block of Iron', stoneLike('iron_block', 5, { tier: 1, sound: 'metal', reflect: 0.5 }));
def('gold_block', 'Block of Gold', stoneLike('gold_block', 3, { tier: 3, sound: 'metal', reflect: 0.6 }));
def('diamond_block', 'Block of Diamond', stoneLike('diamond_block', 5, { tier: 3, sound: 'metal', reflect: 0.6 }));
def('emerald_block', 'Block of Emerald', stoneLike('emerald_block', 5, { tier: 3, sound: 'metal', reflect: 0.5 }));
def('emberite_block', 'Block of Emberite', stoneLike('emberite_block', 8, { tier: 4, sound: 'metal', light: 6, emissive: 0.8, emissiveMode: 1, reflect: 0.4 }));
def('sunstone_block', 'Sunstone Lamp', stoneLike('sunstone_block', 0.3, { light: 15, emissive: 1.2, sound: 'glass' }));
def('frostite_block', 'Block of Frostite', stoneLike('frostite_block', 4, { tier: 3, light: 6, emissive: 0.5, emissiveMode: 1, sound: 'glass', reflect: 0.6 }));

def('tall_grass', 'Tall Grass', plant('tall_grass', { tint: TINT.GRASS, replaceable: true, drop: 'seeds_chance' }));
def('fern', 'Fern', plant('fern', { tint: TINT.GRASS, replaceable: true, drop: 'seeds_chance' }));
def('flower_rosebell', 'Rosebell', plant('flower_rosebell'));
def('flower_sunpetal', 'Sunpetal', plant('flower_sunpetal'));
def('flower_skybloom', 'Skybloom', plant('flower_skybloom'));
def('flower_frostlily', 'Frostlily', plant('flower_frostlily'));
def('flower_duskviolet', 'Duskviolet', plant('flower_duskviolet'));
def('flower_pinkmallow', 'Pinkmallow', plant('flower_pinkmallow'));
def('dead_bush', 'Dead Bush', plant('dead_bush', { replaceable: true, drop: 'stick' }));
def('cactus', 'Cactus', { tex: { side: 'cactus_side', top: 'cactus_top', bottom: 'cactus_top' }, shape: SHAPE.CACTUS, layer: LAYER.CUTOUT, opaque: false, lightFilter: 0, hardness: 0.4, sound: 'cloth', damage: 1 });
def('reeds', 'Reeds', plant('reeds', { wave: 0 }));
def('mushroom_red', 'Red Mushroom', plant('mushroom_red', { wave: 0 }));
def('mushroom_brown', 'Brown Mushroom', plant('mushroom_brown', { wave: 0 }));
def('glowcap', 'Glowcap', plant('glowcap', { wave: 0, light: 8, emissive: 1.0, emissiveMode: 1 }));
def('berry_bush', 'Berry Bush', plant('berry_bush', { drop: 'berries', hardness: 0.1 }));
def('lily_pad', 'Lily Pad', { tex: 'lily_pad', shape: SHAPE.FLAT, layer: LAYER.CUTOUT, opaque: false, lightFilter: 0, solid: true, hardness: 0, sound: 'grass', tint: TINT.FOLIAGE });
def('vines', 'Vines', { tex: 'vines', shape: SHAPE.LADDER, layer: LAYER.CUTOUT, opaque: false, lightFilter: 0, solid: false, hardness: 0.2, tool: 'shears', sound: 'grass', climbable: true, tint: TINT.FOLIAGE, replaceable: true, wave: 1, drop: null });
def('sapling_oak', 'Oak Sapling', plant('sapling_oak', { sapling: 'oak' }));
def('sapling_birch', 'Birch Sapling', plant('sapling_birch', { sapling: 'birch' }));
def('sapling_pine', 'Pine Sapling', plant('sapling_pine', { sapling: 'pine' }));
def('wheat', 'Wheat Crop', { tex: 'wheat_0', shape: SHAPE.CROP, layer: LAYER.CUTOUT, solid: false, opaque: false, lightFilter: 0, hardness: 0, sound: 'grass', wave: 2, drop: 'wheat_crop', crop: true });
def('farmland', 'Farmland', { tex: { top: 'farmland', side: 'dirt', bottom: 'dirt' }, shape: SHAPE.FARMLAND, opaque: false, lightFilter: 15, hardness: 0.6, tool: 'shovel', sound: 'gravel', drop: 'dirt' });
def('crafting_table', 'Crafting Table', { tex: { top: 'crafting_table_top', side: 'crafting_table_side', front: 'crafting_table_front', bottom: 'oak_planks' }, hardness: 2.5, tool: 'axe', sound: 'wood', interact: 'crafting', flammable: true });
def('furnace', 'Furnace', { tex: { top: 'furnace_top', side: 'furnace_side', front: 'furnace_front', bottom: 'furnace_top' }, texLit: 'furnace_front_lit', hardness: 3.5, tool: 'pickaxe', tier: 0, interact: 'furnace', oriented: true });
def('chest', 'Chest', { tex: { top: 'chest_top', side: 'chest_side', front: 'chest_front', bottom: 'chest_top' }, hardness: 2.5, tool: 'axe', sound: 'wood', interact: 'chest', oriented: true, flammable: true });
def('torch', 'Torch', { tex: 'torch', shape: SHAPE.TORCH, layer: LAYER.CUTOUT, solid: false, opaque: false, lightFilter: 0, light: 14, emissive: 1.0, emissiveMode: 1, hardness: 0, sound: 'wood' });
def('ladder', 'Ladder', { tex: 'ladder', shape: SHAPE.LADDER, layer: LAYER.CUTOUT, solid: false, opaque: false, lightFilter: 0, hardness: 0.4, tool: 'axe', sound: 'wood', climbable: true });
def('oak_door', 'Oak Door', { tex: { top: 'door_top', bottom: 'door_bottom' }, shape: SHAPE.DOOR, layer: LAYER.CUTOUT, opaque: false, lightFilter: 0, hardness: 3, tool: 'axe', sound: 'wood', interact: 'door', drop: 'oak_door' });
def('oak_fence', 'Oak Fence', { tex: 'oak_planks', shape: SHAPE.FENCE, opaque: false, lightFilter: 0, hardness: 2, tool: 'axe', sound: 'wood', fence: true });
def('bed', 'Bed', { tex: { top: 'bed_head_top', side: 'bed_side', bottom: 'oak_planks', foot: 'bed_foot_top', end: 'bed_end' }, shape: SHAPE.BED, opaque: false, lightFilter: 0, hardness: 0.2, sound: 'cloth', interact: 'bed', drop: 'bed' });
def('bookshelf', 'Bookshelf', { tex: { side: 'bookshelf', top: 'oak_planks', bottom: 'oak_planks' }, hardness: 1.5, tool: 'axe', sound: 'wood', flammable: true });
def('hay_bale', 'Hay Bale', { tex: { side: 'hay_side', top: 'hay_top', bottom: 'hay_top' }, hardness: 0.5, tool: 'hoe', sound: 'grass' });
for (const c of ['white', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'black', 'brown', 'gray']) {
  def('wool_' + c, c[0].toUpperCase() + c.slice(1) + ' Wool', { tex: 'wool_' + c, hardness: 0.8, tool: 'shears', sound: 'cloth', flammable: true });
}
def('dirt_path', 'Dirt Path', { tex: { top: 'path_top', side: 'path_side', bottom: 'dirt' }, shape: SHAPE.PATH, opaque: false, lightFilter: 15, hardness: 0.65, tool: 'shovel', sound: 'gravel', drop: 'dirt' });
def('oak_slab', 'Oak Slab', { tex: 'oak_planks', shape: SHAPE.SLAB, opaque: false, lightFilter: 0, hardness: 2, tool: 'axe', sound: 'wood', flammable: true });
def('cobblestone_slab', 'Cobblestone Slab', stoneLike('cobblestone', 2, { shape: SHAPE.SLAB, opaque: false, lightFilter: 0 }));
def('stone_brick_slab', 'Stone Brick Slab', stoneLike('stone_bricks', 1.5, { shape: SHAPE.SLAB, opaque: false, lightFilter: 0 }));
def('oak_stairs', 'Oak Stairs', { tex: 'oak_planks', shape: SHAPE.STAIRS, opaque: false, lightFilter: 0, hardness: 2, tool: 'axe', sound: 'wood', flammable: true });
def('cobblestone_stairs', 'Cobblestone Stairs', stoneLike('cobblestone', 2, { shape: SHAPE.STAIRS, opaque: false, lightFilter: 0 }));
def('stone_brick_stairs', 'Stone Brick Stairs', stoneLike('stone_bricks', 1.5, { shape: SHAPE.STAIRS, opaque: false, lightFilter: 0 }));
def('lantern', 'Lantern', { tex: 'lantern', shape: SHAPE.LANTERN, layer: LAYER.CUTOUT, solid: false, opaque: false, lightFilter: 0, light: 15, emissive: 1.0, emissiveMode: 1, hardness: 0.5, tool: 'pickaxe', sound: 'metal' });
def('cobweb', 'Cobweb', plant('cobweb', { wave: 0, hardness: 4, tool: 'shears', drop: 'string', sound: 'cloth', slow: 0.25 }));
def('ancient_bricks', 'Ancient Bricks', stoneLike('ancient_bricks', 2));
def('rune_stone', 'Rune Stone', stoneLike('rune_stone', 3, { light: 9, emissive: 1.0, emissiveMode: 1 }));
def('marble_bricks', 'Marble Bricks', stoneLike('marble_bricks', 1.5, { reflect: 0.2 }));
def('frost_bricks', 'Frost Bricks', stoneLike('frost_bricks', 2, { reflect: 0.25 }));
def('volcanic_bricks', 'Volcanic Bricks', stoneLike('volcanic_bricks', 2.5));
def('seagrass', 'Seagrass', plant('seagrass', { shape: SHAPE.WATER_PLANT, tint: TINT.NONE, drop: null, waterlogged: true, replaceable: true, wave: 2 }));
def('kelp', 'Kelp', plant('kelp', { shape: SHAPE.WATER_PLANT, drop: 'kelp', waterlogged: true, wave: 2 }));
def('reef_pink', 'Pink Reef Stone', stoneLike('reef_pink', 1.2));
def('reef_blue', 'Blue Reef Stone', stoneLike('reef_blue', 1.2));
def('reef_yellow', 'Yellow Reef Stone', stoneLike('reef_yellow', 1.2));
def('carved_sandstone', 'Carved Sandstone', stoneLike({ top: 'sandstone_top', side: 'carved_sandstone', bottom: 'sandstone_bottom' }, 0.8));
def('stripped_oak_log', 'Stripped Oak Log', log('stripped_oak_log', 'oak_log_top'));
def('mossy_ancient_bricks', 'Mossy Ancient Bricks', stoneLike('mossy_ancient_bricks', 2));
def('pumpkin', 'Gourd', { tex: { side: 'gourd_side', top: 'gourd_top', bottom: 'gourd_top' }, hardness: 1, tool: 'axe', sound: 'wood' });
def('glow_lantern', 'Frost Lantern', { tex: 'frost_lantern', shape: SHAPE.LANTERN, layer: LAYER.CUTOUT, solid: false, opaque: false, lightFilter: 0, light: 13, emissive: 1.0, emissiveMode: 1, hardness: 0.5, tool: 'pickaxe', sound: 'metal' });
def('carrots', 'Carrot Crop', { tex: 'carrots_0', shape: SHAPE.CROP, layer: LAYER.CUTOUT, solid: false, opaque: false, lightFilter: 0, hardness: 0, sound: 'grass', wave: 2, drop: 'carrot_crop', crop: true });
def('fire', 'Fire', plant('fire', { wave: 0, light: 15, emissive: 1.5, drop: null, damage: 1, replaceable: true, fire: true }));
def('snowy_pine_leaves', 'Snowy Pine Leaves', Object.assign(leaves('snowy_pine_leaves', TINT.NONE), { drop: 'leafdrop_pine' }));
// --- appended in phase 3 (keep order!) ---
def('pine_stairs', 'Pine Stairs', { tex: 'pine_planks', shape: SHAPE.STAIRS, opaque: false, lightFilter: 0, hardness: 2, tool: 'axe', sound: 'wood', flammable: true });
def('pine_slab', 'Pine Slab', { tex: 'pine_planks', shape: SHAPE.SLAB, opaque: false, lightFilter: 0, hardness: 2, tool: 'axe', sound: 'wood', flammable: true });
def('teak_stairs', 'Teak Stairs', { tex: 'teak_planks', shape: SHAPE.STAIRS, opaque: false, lightFilter: 0, hardness: 2, tool: 'axe', sound: 'wood', flammable: true });
def('teak_slab', 'Teak Slab', { tex: 'teak_planks', shape: SHAPE.SLAB, opaque: false, lightFilter: 0, hardness: 2, tool: 'axe', sound: 'wood', flammable: true });
def('sandstone_stairs', 'Sandstone Stairs', stoneLike('sandstone_top', 0.8, { shape: SHAPE.STAIRS, opaque: false, lightFilter: 0 }));
def('sandstone_slab', 'Sandstone Slab', stoneLike('sandstone_top', 0.8, { shape: SHAPE.SLAB, opaque: false, lightFilter: 0 }));
def('brick_stairs', 'Brick Stairs', stoneLike('bricks', 2, { shape: SHAPE.STAIRS, opaque: false, lightFilter: 0 }));
def('spruce_door', 'Pine Door', { tex: { top: 'door_top', bottom: 'door_bottom' }, shape: SHAPE.DOOR, layer: LAYER.CUTOUT, opaque: false, lightFilter: 0, hardness: 3, tool: 'axe', sound: 'wood', interact: 'door', drop: 'oak_door' });
def('anvil', 'Anvil', stoneLike({ side: 'iron_block', top: 'iron_block', bottom: 'iron_block' }, 5, { tier: 0, sound: 'metal', reflect: 0.4 }));
def('barrel', 'Barrel', { tex: { side: 'barrel_side', top: 'barrel_top', bottom: 'barrel_top' }, hardness: 2.5, tool: 'axe', sound: 'wood', interact: 'chest', flammable: true });
def('purple_wool_roof', 'Mystic Wool', { tex: 'wool_purple', hardness: 0.8, tool: 'shears', sound: 'cloth', flammable: true });
def('bone_block', 'Bone Block', stoneLike({ side: 'bone_side', top: 'bone_top', bottom: 'bone_top' }, 2));
def('mammoth_trail', 'Packed Snow Print', { tex: { top: 'snow_print', side: 'grass_snow_side', bottom: 'dirt' }, hardness: 0.6, tool: 'shovel', sound: 'snow', drop: 'dirt' });
def('gold_ore_sand', 'Desert Gold Ore', ore('gold_ore', 3, 'raw_gold'));
def('cursed_sandstone', 'Glyph Sandstone', stoneLike({ top: 'sandstone_top', side: 'glyph_sandstone', bottom: 'sandstone_bottom' }, 1.5, { light: 6, emissive: 1.0, emissiveMode: 1 }));
def('ice_spike', 'Ice Spire', { tex: 'frost_ice', hardness: 0.6, tool: 'pickaxe', sound: 'glass', slippery: 0.98, reflect: 0.4 });
def('heartwood', 'Heartwood', { tex: { side: 'heartwood_side', top: 'elder_log_top', bottom: 'elder_log_top' }, hardness: 3, tool: 'axe', sound: 'wood', light: 7, emissive: 1.0, emissiveMode: 1, log: true });
def('dragon_nest', 'Dragon Nest', stoneLike({ side: 'scorched_stone', top: 'dragon_nest_top', bottom: 'scorched_stone' }, 3, { light: 5, emissive: 0.6, emissiveMode: 1 }));

// --- appended in phase 6 (keep order!) ---
def('tnt', 'TNT', { tex: { side: 'tnt_side', top: 'tnt_top', bottom: 'tnt_bottom' }, hardness: 0, sound: 'grass', flammable: true, explosive: true });
def('brimstone_ore', 'Brimstone Ore', ore('brimstone_ore', 1, 'brimstone', { light: 2, emissive: 0.35, emissiveMode: 1 }));
def('niter_ore', 'Niter Deposit', ore('niter_ore', 0, 'niter', { hardness: 1.2, sound: 'sand' }));
def('alchemy_table', 'Alchemy Table', { tex: { top: 'alchemy_top', side: 'alchemy_side', bottom: 'oak_planks' }, hardness: 2.5, tool: 'axe', sound: 'wood', interact: 'brewing', light: 6, emissive: 0.8, emissiveMode: 1 });
def('runic_altar', 'Runic Altar', stoneLike({ top: 'runic_altar_top', side: 'runic_altar_side', bottom: 'obsidian' }, 5, { interact: 'enchanting', light: 8, emissive: 1.0, emissiveMode: 1 }));

// --- phase 6 building blocks (keep order!) ---
// model boxes are in 1/16ths, defined facing north (meta facing 0) and rotated by the placement facing
const MODELS = {
  table: [[0, 13, 0, 16, 16, 16], [1, 0, 1, 3, 13, 3], [13, 0, 1, 15, 13, 3], [1, 0, 13, 3, 13, 15], [13, 0, 13, 15, 13, 15]],
  chair: [[2, 7, 2, 14, 9, 14], [2, 0, 2, 4, 7, 4], [12, 0, 2, 14, 7, 4], [2, 0, 12, 4, 7, 14], [12, 0, 12, 14, 7, 14], [2, 9, 12, 14, 18, 14], [3, 9, 12, 4, 17, 13]],
  bench: [[0, 6, 3, 16, 8, 13], [1, 0, 4, 3, 6, 12], [13, 0, 4, 15, 6, 12]],
  stool: [[3, 8, 3, 13, 10, 13], [4, 0, 4, 6, 8, 6], [10, 0, 4, 12, 8, 6], [4, 0, 10, 6, 8, 12], [10, 0, 10, 12, 8, 12]],
  candle: [[7, 0, 7, 9, 6, 9], [7.5, 6, 7.5, 8.5, 8, 8.5]],
  flower_pot: [[5, 0, 5, 11, 6, 11]],
  carpet: [[0, 0, 0, 16, 1, 16]],
  lamp_post: [[7, 0, 7, 9, 10, 9], [5, 10, 5, 11, 16, 11]],
  campfire: [[1, 0, 3, 15, 3, 6], [1, 0, 10, 15, 3, 13], [3, 2, 1, 6, 5, 15], [10, 2, 1, 13, 5, 15], [0, 0, 0, 16, 1, 16]],
};
const furn = (tex, model, extra = {}) => Object.assign({ tex, shape: SHAPE.MODEL, model: MODELS[model], opaque: false, lightFilter: 0, hardness: 1.5, tool: 'axe', sound: 'wood', oriented: true, flammable: true }, extra);
const roofStairs = (tex, h = 1.5) => stoneLike(tex, h, { shape: SHAPE.STAIRS, opaque: false, lightFilter: 0 });
const woodStairs = (tex) => ({ tex, shape: SHAPE.STAIRS, opaque: false, lightFilter: 0, hardness: 2, tool: 'axe', sound: 'wood', flammable: true });
const woodSlab = (tex, full) => ({ tex, shape: SHAPE.SLAB, opaque: false, lightFilter: 0, hardness: 2, tool: 'axe', sound: 'wood', flammable: true, fullBlock: full });
def('polished_granite', 'Polished Granite', stoneLike('polished_granite', 1.5, { reflect: 0.3 }));
def('polished_basalt', 'Polished Basalt', stoneLike({ top: 'polished_basalt_top', side: 'polished_basalt_side', bottom: 'polished_basalt_top' }, 1.25, { reflect: 0.25 }));
def('polished_darkstone', 'Polished Darkstone', stoneLike('polished_darkstone', 3, { reflect: 0.35 }));
def('darkstone_bricks', 'Darkstone Bricks', stoneLike('darkstone_bricks', 3));
def('chiseled_stone_bricks', 'Chiseled Stone Bricks', stoneLike('chiseled_stone_bricks', 1.5));
def('sandstone_bricks', 'Sandstone Bricks', stoneLike('sandstone_bricks', 0.8));
def('mud_bricks', 'Mud Bricks', stoneLike('mud_bricks', 1.5, { sound: 'mud' }));
def('stone_tiles', 'Stone Tiles', stoneLike('stone_tiles', 1.5, { reflect: 0.2 }));
def('clay_shingles', 'Clay Roof Shingles', stoneLike('clay_shingles', 1.5));
def('slate_shingles', 'Slate Roof Shingles', stoneLike('slate_shingles', 1.5));
def('thatch', 'Thatch', { tex: 'thatch', hardness: 0.5, tool: 'hoe', sound: 'grass', flammable: true });
def('timber_frame', 'Timber Frame Wall', { tex: 'timber_frame', hardness: 1.5, tool: 'axe', sound: 'wood', flammable: true });
for (const [c, l] of [['white', 'White'], ['cream', 'Cream'], ['terracotta', 'Terracotta'], ['sage', 'Sage'], ['slate', 'Slate']]) def('plaster_' + c, l + ' Plaster', stoneLike('plaster_' + c, 1));
def('blue_tiles', 'Azure Glazed Tiles', stoneLike('blue_tiles', 1.4, { reflect: 0.45 }));
def('teal_tiles', 'Jade Glazed Tiles', stoneLike('teal_tiles', 1.4, { reflect: 0.45 }));
def('birch_stairs', 'Birch Stairs', woodStairs('birch_planks'));
def('birch_slab', 'Birch Slab', woodSlab('birch_planks', 'birch_planks'));
def('palm_stairs', 'Palm Stairs', woodStairs('palm_planks'));
def('palm_slab', 'Palm Slab', woodSlab('palm_planks', 'palm_planks'));
def('elder_stairs', 'Elder Stairs', woodStairs('elder_planks'));
def('elder_slab', 'Elder Slab', woodSlab('elder_planks', 'elder_planks'));
def('birch_fence', 'Birch Fence', { tex: 'birch_planks', shape: SHAPE.FENCE, opaque: false, lightFilter: 0, hardness: 2, tool: 'axe', sound: 'wood', fence: true });
def('pine_fence', 'Pine Fence', { tex: 'pine_planks', shape: SHAPE.FENCE, opaque: false, lightFilter: 0, hardness: 2, tool: 'axe', sound: 'wood', fence: true });
def('stone_tile_slab', 'Stone Tile Slab', stoneLike('stone_tiles', 1.5, { shape: SHAPE.SLAB, opaque: false, lightFilter: 0, fullBlock: 'stone_tiles' }));
def('clay_shingle_stairs', 'Clay Shingle Stairs', roofStairs('clay_shingles'));
def('slate_shingle_stairs', 'Slate Shingle Stairs', roofStairs('slate_shingles'));
def('darkstone_brick_stairs', 'Darkstone Brick Stairs', roofStairs('darkstone_bricks', 3));
for (const [c, l] of [['red', 'Red'], ['orange', 'Amber'], ['yellow', 'Yellow'], ['green', 'Green'], ['blue', 'Blue'], ['purple', 'Violet']]) {
  def('stained_glass_' + c, l + ' Stained Glass', { tex: 'stained_glass_' + c, layer: LAYER.TRANSLUCENT, opaque: false, lightFilter: 0, hardness: 0.3, sound: 'glass', drop: null, material: 7, reflect: 0.3 });
}
def('oak_table', 'Oak Table', furn('oak_planks', 'table'));
def('oak_chair', 'Oak Chair', furn('oak_planks', 'chair', { seat: 0.55 }));
def('oak_bench', 'Oak Bench', furn('oak_planks', 'bench', { seat: 0.5 }));
def('oak_stool', 'Oak Stool', furn('oak_planks', 'stool', { seat: 0.62 }));
def('crate', 'Storage Crate', { tex: { side: 'crate_side', top: 'crate_top', bottom: 'crate_top' }, hardness: 2.5, tool: 'axe', sound: 'wood', interact: 'chest', flammable: true });
def('cupboard', 'Cupboard', { tex: { side: 'cupboard_side', top: 'oak_planks', bottom: 'oak_planks', front: 'cupboard_front' }, hardness: 2.5, tool: 'axe', sound: 'wood', interact: 'chest', oriented: true, flammable: true });
def('candle', 'Candle', furn({ all: 'candle', flame: 'candle_flame' }, 'candle', { light: 11, emissive: 1.0, emissiveMode: 1, hardness: 0.1, tool: null, sound: 'cloth', solid: false, oriented: false, boxTex: [null, 'flame'] }));
def('flower_pot', 'Flower Pot', furn('baked_clay_orange', 'flower_pot', { hardness: 0.2, tool: null, sound: 'stone', flammable: false }));
for (const c of ['red', 'blue', 'green', 'white']) def('carpet_' + c, c[0].toUpperCase() + c.slice(1) + ' Carpet', furn('wool_' + c, 'carpet', { hardness: 0.1, tool: 'shears', sound: 'cloth', oriented: false, carpet: true }));
def('lamp_post', 'Lamp Post', furn({ all: 'iron_block', lamp: 'lantern_glass' }, 'lamp_post', { light: 15, emissive: 1.0, emissiveMode: 1, hardness: 1.5, tool: 'pickaxe', sound: 'metal', flammable: false, boxTex: [null, 'lamp'] }));
def('campfire', 'Campfire', furn({ all: 'oak_log', coals: 'campfire_coals' }, 'campfire', { light: 14, emissive: 1.0, emissiveMode: 1, hardness: 1, sound: 'wood', damage: 1, interact: 'campfire', boxTex: [null, null, null, null, 'coals'], flame: [0.5, 0.15, 0.5], cross: 'fire', solid: true }));

// --- final update: lights, furnishings and traps (keep order!) ---
Object.assign(MODELS, {
  plate: [[1, 0, 1, 15, 1, 15]],
  brazier: [[6, 0, 6, 10, 2, 10], [7, 2, 7, 9, 8, 9], [3, 8, 3, 13, 9, 13], [3, 9, 3, 4, 12, 13], [12, 9, 3, 13, 12, 13], [4, 9, 3, 12, 12, 4], [4, 9, 12, 12, 12, 13], [4, 9, 4, 12, 11, 12]],
  urn: [[5, 0, 5, 11, 2, 11], [4, 2, 4, 12, 9, 12], [5, 9, 5, 11, 11, 11], [6, 11, 6, 10, 13, 10], [5, 13, 5, 11, 14, 11]],
  sconce: [[6, 3, 14, 10, 9, 16], [7, 5, 10, 9, 6, 14], [6, 6, 8, 10, 7, 12], [6.5, 7, 8.5, 9.5, 11, 11.5], [6, 11, 8, 10, 12, 12], [7.5, 12, 9.5, 8.5, 13, 10.5]],
  hanging_lamp: [[7.5, 13, 7.5, 8.5, 16, 8.5], [5, 12, 5, 11, 13, 11], [4, 4, 4, 12, 12, 12], [5, 3, 5, 11, 4, 11]],
  oil_lamp: [[5, 0, 5, 11, 1, 11], [7, 1, 7, 9, 3, 9], [5, 3, 5, 11, 5, 11], [6, 5, 6, 10, 9, 10], [6.5, 9, 6.5, 9.5, 10, 9.5]],
  shelf: [[0, 6, 10, 16, 7, 16], [0, 12, 10, 16, 13, 16], [1, 0, 15, 2, 13, 16], [14, 0, 15, 15, 13, 16], [2, 7, 12, 4, 11, 15], [4.5, 7, 13, 6.5, 10, 15], [9, 7, 12, 10.5, 11.5, 15], [11, 13, 12, 14, 15, 15]],
  sign: [[1, 6, 7, 15, 14, 9], [7, 0, 7.5, 9, 6, 8.5]],
  hearth: [[0, 0, 12, 16, 16, 16], [0, 0, 0, 3, 13, 12], [13, 0, 0, 16, 13, 12], [0, 13, 0, 16, 16, 12], [3, 0, 0, 13, 1, 12], [4, 1, 3, 12, 3, 10]],
  chimney: [[2, 0, 2, 14, 15, 14], [1, 13, 1, 15, 16, 15]],
});
def('sandstone_plate', 'Sandstone Pressure Plate', furn('sandstone_top', 'plate', { hardness: 0.6, tool: 'pickaxe', sound: 'stone', oriented: false, solid: false, flammable: false }));
def('brazier', 'Brazier', furn({ all: 'dark_iron', coals: 'campfire_coals' }, 'brazier', { light: 15, emissive: 1.0, emissiveMode: 1, hardness: 2, tool: 'pickaxe', sound: 'metal', oriented: false, flammable: false, boxTex: [null, null, null, null, null, null, null, 'coals'], cross: 'fire', crossY: 0.69, crossH: 0.62, crossS: 0.5, fx: 'brazier', solid: true }));
def('clay_urn', 'Clay Urn', furn('urn', 'urn', { hardness: 0.4, tool: null, sound: 'stone', oriented: false, flammable: false }));
def('wall_sconce', 'Wall Sconce', furn({ all: 'dark_iron', glass: 'lantern_glass' }, 'sconce', { light: 14, emissive: 1.0, emissiveMode: 1, hardness: 1.5, tool: 'pickaxe', sound: 'metal', flammable: false, solid: false, boxTex: [null, null, null, 'glass', null, null] }));
def('paper_lantern', 'Paper Lantern', furn({ all: 'dark_iron', paper: 'paper_lantern' }, 'hanging_lamp', { light: 13, emissive: 1.0, emissiveMode: 1, hardness: 0.3, tool: null, sound: 'cloth', oriented: false, solid: false, boxTex: [null, null, 'paper', null] }));
def('moth_lantern', 'Moth Lantern', furn({ all: 'dark_iron', glass: 'moth_glass' }, 'hanging_lamp', { light: 12, emissive: 1.0, emissiveMode: 1, hardness: 0.5, tool: null, sound: 'metal', oriented: false, solid: false, boxTex: [null, null, 'glass', null], fx: 'moths' }));
def('oil_lamp', 'Oil Lamp', furn({ all: 'brass', glass: 'lantern_glass' }, 'oil_lamp', { light: 13, emissive: 1.0, emissiveMode: 1, hardness: 0.5, tool: null, sound: 'metal', oriented: false, solid: false, flammable: false, boxTex: [null, null, null, 'glass', null] }));
def('wall_shelf', 'Wall Shelf', furn({ all: 'oak_planks', goods: 'shelf_goods' }, 'shelf', { hardness: 1.5, solid: false, boxTex: [null, null, null, null, 'goods', 'goods', 'goods', 'goods'] }));
def('wooden_sign', 'Wooden Sign', furn('oak_planks', 'sign', { hardness: 1, solid: false, interact: 'sign' }));
def('hearth', 'Stone Hearth', furn({ all: 'stone_bricks', coals: 'campfire_coals', mantel: 'oak_planks' }, 'hearth', { light: 15, emissive: 1.0, emissiveMode: 1, hardness: 2.5, tool: 'pickaxe', sound: 'stone', flammable: false, boxTex: [null, null, null, 'mantel', null, 'coals'], cross: 'fire', crossY: 0.1, crossH: 0.7, crossS: 0.6, fx: 'hearth', solid: true }));
def('chimney', 'Brick Chimney', furn({ all: 'bricks' }, 'chimney', { hardness: 2, tool: 'pickaxe', sound: 'stone', oriented: false, flammable: false, fx: 'chimney', solid: true }));

export const BLOCKS = list;
export const B = {};
for (const b of list) B[b.name] = b.id;
export const NUM_BLOCKS = list.length;
export function blockByName(n) { return byName[n]; }

// ---------- texture name registry (deterministic, shared with workers) ----------
const extraTextures = [
  'destroy_0', 'destroy_1', 'destroy_2', 'destroy_3', 'destroy_4', 'destroy_5', 'destroy_6', 'destroy_7', 'destroy_8', 'destroy_9',
  'wheat_1', 'wheat_2', 'wheat_3', 'carrots_1', 'carrots_2', 'carrots_3', 'water_flow',
];
export const TEXTURE_NAMES = [];
const texIndex = Object.create(null);
function addTex(n) {
  if (n && texIndex[n] === undefined) { texIndex[n] = TEXTURE_NAMES.length; TEXTURE_NAMES.push(n); }
}
for (const b of list) {
  for (const k in b.tex) addTex(b.tex[k]);
  if (b.texLit) addTex(b.texLit);
}
for (const n of extraTextures) addTex(n);
export function texLayer(name) {
  const i = texIndex[name];
  if (i === undefined) throw new Error('unknown texture ' + name);
  return i;
}

// Resolve per-face texture layers: faces 0:+X 1:-X 2:+Y 3:-Y 4:+Z 5:-Z.
// Stored as BLOCK_FACE_TEX[id*6 + face]; oriented blocks use 'front' on the facing side at runtime.
export const BLOCK_FACE_TEX = new Uint16Array(NUM_BLOCKS * 6);
export const BLOCK_FRONT_TEX = new Int16Array(NUM_BLOCKS).fill(-1);
export const BLOCK_LIT_TEX = new Int16Array(NUM_BLOCKS).fill(-1);
for (const b of list) {
  const t = b.tex;
  const side = t.side || t.all || t.top;
  const top = t.top || t.all || side;
  const bottom = t.bottom || t.all || top;
  const faces = [side, side, top, bottom, side, side];
  for (let f = 0; f < 6; f++) BLOCK_FACE_TEX[b.id * 6 + f] = texLayer(faces[f]);
  if (t.front) BLOCK_FRONT_TEX[b.id] = texLayer(t.front);
  if (b.texLit) BLOCK_LIT_TEX[b.id] = texLayer(b.texLit);
  if (b.model) b.modelBoxes = b.model.map((m, i) => ({
    lo: [m[0] / 16, m[1] / 16, m[2] / 16], hi: [m[3] / 16, m[4] / 16, m[5] / 16],
    tex: b.boxTex && b.boxTex[i] ? texLayer(t[b.boxTex[i]]) : -1,
  }));
  if (b.cross) b.crossTex = texLayer(b.cross);
}

// rotate a block-local box around the vertical axis by a facing (0..3)
export function rotateBox(lo, hi, facing) {
  if (!facing) return [lo, hi];
  const r = (x, z) => facing === 1 ? [1 - z, x] : facing === 2 ? [1 - x, 1 - z] : [z, 1 - x];
  const a = r(lo[0], lo[2]), b = r(hi[0], hi[2]);
  return [[Math.min(a[0], b[0]), lo[1], Math.min(a[1], b[1])], [Math.max(a[0], b[0]), hi[1], Math.max(a[1], b[1])]];
}

// Fast property tables for hot loops
export const IS_OPAQUE = new Uint8Array(NUM_BLOCKS);
export const IS_SOLID = new Uint8Array(NUM_BLOCKS);
export const LIGHT_FILTER = new Uint8Array(NUM_BLOCKS);
export const LIGHT_EMIT = new Uint8Array(NUM_BLOCKS);
export const BLOCK_SHAPE = new Uint8Array(NUM_BLOCKS);
export const BLOCK_LAYER = new Uint8Array(NUM_BLOCKS);
export const IS_LIQUID = new Uint8Array(NUM_BLOCKS); // 1 water, 2 lava
export const IS_WATERLOGGED = new Uint8Array(NUM_BLOCKS);
for (const b of list) {
  IS_OPAQUE[b.id] = b.opaque ? 1 : 0;
  IS_SOLID[b.id] = b.solid ? 1 : 0;
  LIGHT_FILTER[b.id] = b.lightFilter;
  LIGHT_EMIT[b.id] = b.light;
  BLOCK_SHAPE[b.id] = b.shape;
  BLOCK_LAYER[b.id] = b.layer;
  IS_LIQUID[b.id] = b.liquid === 'water' ? 1 : b.liquid === 'lava' ? 2 : 0;
  IS_WATERLOGGED[b.id] = b.waterlogged ? 1 : 0;
}
// Ensure only full cubes are treated as opaque occluders
for (const b of list) if (b.shape !== SHAPE.CUBE) IS_OPAQUE[b.id] = 0;
