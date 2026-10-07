// Creature definitions: stats, behaviour flags, drops, sounds and spawning.
import { MODELS } from './models.js';
import { BIOME } from '../world/biomes.js';

export const MOBS = {};
function def(id, o) {
  MOBS[id] = Object.assign({
    id, name: id, type: 'animal', hp: 10, speed: 1.6, runSpeed: 3.2, size: [0.8, 1.2], model: MODELS[id],
    drops: [], sounds: {}, idleSound: 0.08, food: [], scale: 1, sleeps: false, swims: false, aquatic: false, fly: false,
    xp: 2, knockRes: 0, attack: null, follow: 16,
  }, o);
}

// --------------------------------------------------------------- animals
def('cow', { name: 'Cow', hp: 10, speed: 1.4, size: [0.9, 1.4], drops: [['raw_beef', 1, 3], ['leather', 0, 2]], sounds: { idle: 'moo', hurt: 'moo', death: 'moo' }, food: ['wheat_item'], sleeps: true, milk: true });
def('pig', { name: 'Pig', hp: 10, speed: 1.4, size: [0.9, 0.9], drops: [['raw_pork', 1, 3]], sounds: { idle: 'oink', hurt: 'oink', death: 'oink' }, food: ['carrot', 'berries', 'apple'], sleeps: true });
def('boar', { name: 'Forest Boar', type: 'neutral', hp: 14, speed: 1.6, runSpeed: 3.6, size: [0.9, 0.95], drops: [['raw_pork', 2, 3], ['leather', 0, 1]], sounds: { idle: 'oink', hurt: 'growl', death: 'oink' }, food: ['berries', 'apple', 'mushroom_brown'], attack: { dmg: 4, reach: 1.5, cd: 1.2 }, sleeps: true });
def('sheep', { name: 'Sheep', hp: 8, speed: 1.4, size: [0.9, 1.3], drops: [['raw_mutton', 1, 2]], sounds: { idle: 'baa', hurt: 'baa', death: 'baa' }, food: ['wheat_item'], sleeps: true, wool: true });
def('chicken', { name: 'Chicken', hp: 4, speed: 1.3, runSpeed: 2.8, size: [0.4, 0.7], drops: [['raw_chicken', 1, 1], ['feather', 0, 2]], sounds: { idle: 'cluck', hurt: 'cluck', death: 'cluck' }, food: ['seeds', 'wheat_item'], slowFall: true, lays: true });
def('horse', { name: 'Horse', hp: 22, speed: 1.8, runSpeed: 4.2, size: [1.3, 1.6], drops: [['leather', 0, 2]], sounds: { idle: 'neigh', hurt: 'neigh', death: 'neigh' }, food: ['apple', 'wheat_item', 'carrot'], rideable: true, gallop: true, tame: { item: null, chance: 0.25 } });
def('rabbit', { name: 'Rabbit', hp: 3, speed: 2.2, runSpeed: 4.6, size: [0.4, 0.5], drops: [['leather', 0, 1]], sounds: { idle: 'squeak', hurt: 'squeak', death: 'squeak' }, food: ['carrot', 'flower_sunpetal'], hopper: true, idleSound: 0.02 });
def('deer', { name: 'Deer', hp: 12, speed: 1.8, runSpeed: 5.0, size: [0.9, 1.6], drops: [['raw_venison', 1, 3], ['leather', 0, 2]], sounds: { idle: 'squeak', hurt: 'squeak', death: 'squeak' }, food: ['apple', 'berries'], skittish: 10, idleSound: 0.02, sleeps: true });
def('wolf', { name: 'Wolf', type: 'neutral', hp: 12, speed: 1.8, runSpeed: 4.0, size: [0.6, 0.85], drops: [['bone', 0, 1]], sounds: { idle: 'bark', hurt: 'bark', death: 'howl' }, food: ['raw_beef', 'steak', 'raw_pork', 'cooked_pork', 'raw_venison', 'cooked_venison', 'raw_mutton'], attack: { dmg: 4, reach: 1.4, cd: 1 }, tame: { item: 'bone', chance: 0.33 }, pack: true, howls: true });
def('cat', { name: 'Cat', hp: 10, speed: 1.8, runSpeed: 4.0, size: [0.5, 0.65], drops: [['string', 0, 1]], sounds: { idle: 'meow', hurt: 'meow', death: 'meow' }, food: ['raw_fish', 'cooked_fish'], tame: { item: 'raw_fish', chance: 0.33 }, sleeps: true });
def('arctic_fox', { name: 'Arctic Fox', hp: 10, speed: 1.9, runSpeed: 4.2, size: [0.55, 0.65], drops: [['leather', 0, 1]], sounds: { idle: 'squeak', hurt: 'bark', death: 'squeak' }, food: ['berries', 'raw_chicken'], skittish: 8, sleeps: true });
def('snow_yak', { name: 'Snow Yak', hp: 24, speed: 1.1, runSpeed: 2.6, size: [1.3, 1.7], drops: [['raw_beef', 2, 4], ['leather', 1, 3], ['wool_white', 0, 2]], sounds: { idle: 'moo', hurt: 'moo', death: 'moo' }, food: ['wheat_item'], scaleSound: 0.7, sleeps: true });
def('capybara', { name: 'Capybara', hp: 12, speed: 1.1, size: [0.9, 0.95], drops: [['leather', 0, 2]], sounds: { idle: 'squeak', hurt: 'squeak', death: 'squeak' }, food: ['reeds', 'apple', 'carrot'], swims: true, chill: true });
def('chicken_jungle', { name: 'Jungle Fowl', model: MODELS.chicken });
def('toucan', { name: 'Toucan', hp: 6, speed: 1.6, size: [0.45, 0.8], drops: [['feather', 1, 2]], sounds: { idle: 'chirp', hurt: 'squeak', death: 'squeak' }, food: ['berries', 'apple', 'seeds'], flutter: true, idleSound: 0.15 });
def('penguin', { name: 'Penguin', hp: 8, speed: 1.0, size: [0.5, 1.0], drops: [['feather', 0, 2], ['raw_fish', 0, 1]], sounds: { idle: 'squeak', hurt: 'squeak', death: 'squeak' }, food: ['raw_fish'], swims: true, swimFast: true });
def('monkey', { name: 'Monkey', hp: 8, speed: 2.0, runSpeed: 4.2, size: [0.5, 1.0], drops: [], sounds: { idle: 'chirp', hurt: 'squeak', death: 'squeak' }, food: ['apple', 'berries'], idleSound: 0.12, jumpy: true });
def('frog', { name: 'Frog', hp: 6, speed: 1.6, size: [0.5, 0.45], drops: [], sounds: { idle: 'croak', hurt: 'croak', death: 'croak' }, food: ['seeds'], hopper: true, swims: true });
def('fish', { name: 'Fish', type: 'water', hp: 3, speed: 2.2, size: [0.4, 0.35], drops: [['raw_fish', 1, 1]], aquatic: true, xp: 1 });
def('bat', { name: 'Gloom Bat', type: 'ambient', hp: 4, speed: 3.5, size: [0.5, 0.6], drops: [], sounds: { idle: 'squeak', hurt: 'squeak', death: 'squeak' }, fly: true, idleSound: 0.05, xp: 0 });

// --------------------------------------------------------------- monsters
def('shambler', { name: 'Shambler', type: 'hostile', hp: 20, speed: 2.4, size: [0.65, 1.95], drops: [['bone', 0, 2], ['string', 0, 1], ['carrot', 0, 1, 0.05], ['iron_ingot', 0, 1, 0.03]], sounds: { idle: 'groan', hurt: 'groan_hurt', death: 'groan_death' }, attack: { dmg: 3, reach: 1.6, cd: 1.0 }, burnsInDay: true, xp: 5, follow: 24 });
def('gloomstalker', { name: 'Gloomstalker', type: 'hostile', hp: 30, speed: 3.0, size: [0.6, 2.7], drops: [['glowdust', 0, 2], ['flint', 0, 1]], sounds: { idle: 'whisper', hurt: 'shriek', death: 'shriek' }, attack: { dmg: 6, reach: 2.0, cd: 1.1 }, teleports: true, aura: { col: [0.12, 0.05, 0.18], rate: 6 }, burnsInDay: true, xp: 8, follow: 28 });
def('cave_crawler', { name: 'Cave Crawler', type: 'hostile', hp: 16, speed: 3.2, size: [1.1, 0.8], drops: [['string', 0, 2], ['flint', 0, 1]], sounds: { idle: 'skitter', hurt: 'hiss', death: 'clatter' }, attack: { dmg: 3, reach: 1.6, cd: 0.9, poison: 0.25 }, leaps: true, climbs: true, xp: 5 });
def('thornling', { name: 'Thornling', type: 'hostile', hp: 18, speed: 2.2, size: [0.65, 1.85], drops: [['stick', 0, 3], ['arrow', 0, 2], ['seeds', 0, 2]], sounds: { idle: 'rustle', hurt: 'creak', death: 'creak' }, attack: { ranged: true, dmg: 3, cd: 2.2, proj: 'thorn', range: 14, min: 5 }, burnsInDay: false, flees: false, xp: 5 });
def('mire_lurker', { name: 'Mire Lurker', type: 'hostile', hp: 24, speed: 2.4, size: [1.2, 1.0], drops: [['leather', 0, 2], ['clay_ball', 0, 3]], sounds: { idle: 'croak', hurt: 'croak', death: 'croak' }, attack: { dmg: 4, reach: 2.2, cd: 1.4 }, hopper: true, swims: true, xp: 6, scaleSound: 0.5 });
def('dune_scorpion', { name: 'Dune Scorpion', type: 'hostile', hp: 18, speed: 2.8, size: [1.1, 0.75], drops: [['string', 0, 2], ['sunstone_shard', 0, 1, 0.15], ['gunpowder', 1, 1, 0.2]], sounds: { idle: 'chitter', hurt: 'hiss', death: 'clatter' }, attack: { dmg: 3, reach: 1.7, cd: 1.0, poison: 0.5 }, xp: 6 });
def('frost_wraith', { name: 'Frost Wraith', type: 'hostile', hp: 22, speed: 2.2, size: [0.8, 1.9], drops: [['snowball', 0, 3], ['frostite_shard', 0, 1, 0.25]], sounds: { idle: 'wail', hurt: 'shriek', death: 'wail' }, attack: { ranged: true, dmg: 4, cd: 2.4, proj: 'ice', range: 16, min: 4 }, fly: true, hover: 2.5, aura: { col: [0.8, 0.92, 1], rate: 5, glow: true }, xp: 8 });
def('ember_fiend', { name: 'Ember Fiend', type: 'hostile', hp: 20, speed: 2.6, size: [0.6, 1.4], drops: [['gunpowder', 0, 2], ['raw_emberite', 0, 1, 0.08]], sounds: { idle: 'cackle', hurt: 'shriek', death: 'shriek' }, attack: { ranged: true, dmg: 5, cd: 2.6, proj: 'fire', range: 18, min: 5 }, fly: true, hover: 3, aura: { ember: true, rate: 8 }, fireImmune: true, glow: 0.4, xp: 9 });
def('jaguar', { name: 'Shadow Jaguar', type: 'hostile', hp: 20, speed: 3.8, size: [0.7, 0.9], drops: [['leather', 1, 2]], sounds: { idle: 'growl', hurt: 'growl', death: 'growl' }, attack: { dmg: 5, reach: 1.6, cd: 1.0 }, leaps: true, burnsInDay: false, xp: 7 });
def('moss_golem', { name: 'Moss Golem', type: 'neutral', hp: 60, speed: 1.1, size: [1.3, 2.9], drops: [['moss_block', 2, 5], ['mossy_cobblestone', 1, 3], ['emerald', 0, 1, 0.3]], sounds: { idle: 'rumble', hurt: 'creak', death: 'rumble' }, attack: { dmg: 9, reach: 2.6, cd: 1.6, wind: 0.6 }, knockRes: 0.8, xp: 15, scaleSound: 0.5 });
def('rootling', { name: 'Rootling', type: 'hostile', hp: 8, speed: 3.0, size: [0.5, 1.0], drops: [['stick', 0, 2]], sounds: { idle: 'creak', hurt: 'creak', death: 'creak' }, attack: { dmg: 2, reach: 1.3, cd: 0.8 }, xp: 2 });

// --------------------------------------------------------------- spawn tables [mob, weight, min, max]
export const ANIMAL_SPAWNS = {
  [BIOME.PLAINS]: [['cow', 8, 2, 4], ['sheep', 8, 2, 4], ['pig', 6, 2, 3], ['chicken', 6, 2, 4], ['horse', 4, 2, 4], ['rabbit', 3, 1, 3]],
  [BIOME.FOREST]: [['pig', 3, 2, 3], ['boar', 4, 1, 3], ['deer', 6, 2, 3], ['wolf', 2, 1, 3], ['chicken', 3, 2, 3], ['rabbit', 2, 1, 2]],
  [BIOME.BIRCH_FOREST]: [['deer', 6, 2, 3], ['rabbit', 4, 1, 3], ['chicken', 3, 2, 3], ['sheep', 3, 2, 3]],
  [BIOME.ANCIENT_FOREST]: [['deer', 4, 1, 2], ['boar', 4, 2, 3], ['wolf', 2, 1, 2]],
  [BIOME.TAIGA]: [['wolf', 5, 2, 4], ['deer', 5, 2, 3], ['rabbit', 3, 1, 2], ['arctic_fox', 2, 1, 2]],
  [BIOME.SNOWY_TAIGA]: [['arctic_fox', 5, 1, 3], ['wolf', 4, 2, 4], ['rabbit', 3, 1, 2], ['snow_yak', 2, 2, 3]],
  [BIOME.TUNDRA]: [['snow_yak', 5, 2, 4], ['arctic_fox', 4, 1, 2], ['rabbit', 3, 1, 3]],
  [BIOME.SNOWY_BEACH]: [['penguin', 8, 3, 6]],
  [BIOME.FROZEN_RIVER]: [['penguin', 2, 2, 3]],
  [BIOME.SNOWY_PEAKS]: [['snow_yak', 2, 1, 2]],
  [BIOME.MOUNTAINS]: [['sheep', 6, 2, 4], ['snow_yak', 1, 1, 2]],
  [BIOME.DESERT]: [['rabbit', 3, 1, 2]],
  [BIOME.SAVANNA]: [['horse', 8, 2, 5], ['cow', 3, 2, 3], ['chicken', 2, 1, 2]],
  [BIOME.JUNGLE]: [['toucan', 6, 1, 3], ['monkey', 6, 2, 4], ['chicken', 3, 2, 3], ['cat', 2, 1, 1]],
  [BIOME.SWAMP]: [['frog', 8, 2, 5], ['capybara', 4, 2, 3]],
  [BIOME.RIVER]: [['capybara', 2, 1, 2]],
  [BIOME.BEACH]: [['chicken', 1, 1, 2]],
};
export const NIGHT_SPAWNS = {
  default: [['shambler', 12, 1, 3], ['gloomstalker', 2, 1, 1], ['cave_crawler', 4, 1, 2]],
  [BIOME.FOREST]: [['shambler', 10, 1, 3], ['thornling', 6, 1, 2], ['cave_crawler', 3, 1, 2], ['gloomstalker', 2, 1, 1]],
  [BIOME.BIRCH_FOREST]: [['shambler', 10, 1, 3], ['thornling', 5, 1, 2], ['gloomstalker', 2, 1, 1]],
  [BIOME.ANCIENT_FOREST]: [['thornling', 8, 1, 3], ['shambler', 6, 1, 2], ['gloomstalker', 3, 1, 1], ['rootling', 6, 2, 4]],
  [BIOME.TAIGA]: [['shambler', 10, 1, 3], ['thornling', 4, 1, 2], ['gloomstalker', 2, 1, 1]],
  [BIOME.SWAMP]: [['mire_lurker', 8, 1, 2], ['shambler', 8, 1, 3]],
  [BIOME.DESERT]: [['dune_scorpion', 10, 1, 2], ['shambler', 6, 1, 2]],
  [BIOME.BADLANDS]: [['dune_scorpion', 10, 1, 2], ['shambler', 5, 1, 2]],
  [BIOME.SNOWY_TAIGA]: [['frost_wraith', 6, 1, 1], ['shambler', 8, 1, 3]],
  [BIOME.TUNDRA]: [['frost_wraith', 6, 1, 1], ['shambler', 8, 1, 3]],
  [BIOME.SNOWY_PEAKS]: [['frost_wraith', 10, 1, 2]],
  [BIOME.JUNGLE]: [['jaguar', 5, 1, 1], ['shambler', 8, 1, 3], ['cave_crawler', 4, 1, 2]],
  [BIOME.VOLCANIC]: [['ember_fiend', 10, 1, 2]],
};
// day spawns in hostile biomes
export const DAY_SPAWNS = {
  [BIOME.DESERT]: [['dune_scorpion', 1, 1, 1]],
  [BIOME.VOLCANIC]: [['ember_fiend', 1, 1, 1]],
  [BIOME.ANCIENT_FOREST]: [['moss_golem', 1, 1, 1]],
};
export const CAVE_SPAWNS = [['shambler', 10, 1, 3], ['cave_crawler', 8, 1, 2], ['gloomstalker', 2, 1, 1]];
export const WATER_BIOMES = new Set([BIOME.OCEAN, BIOME.DEEP_OCEAN, BIOME.RIVER, BIOME.SWAMP, BIOME.BEACH, BIOME.FROZEN_OCEAN, BIOME.FROZEN_RIVER, BIOME.JUNGLE]);
