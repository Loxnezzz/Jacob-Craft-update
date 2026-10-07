// Biome definitions: visuals, weather tendencies, vegetation.

export const BIOME = {
  OCEAN: 0, DEEP_OCEAN: 1, FROZEN_OCEAN: 2, BEACH: 3, SNOWY_BEACH: 4, RIVER: 5, FROZEN_RIVER: 6,
  PLAINS: 7, FOREST: 8, BIRCH_FOREST: 9, ANCIENT_FOREST: 10, TAIGA: 11, SNOWY_TAIGA: 12, TUNDRA: 13,
  MOUNTAINS: 14, SNOWY_PEAKS: 15, DESERT: 16, BADLANDS: 17, SAVANNA: 18, JUNGLE: 19, SWAMP: 20, VOLCANIC: 21,
};

// precip: 'rain' | 'snow' | 'none'  ; rainChance scales how often weather events manifest here
// fog: base fog density multiplier; stormy: storm intensity multiplier
const def = (id, label, o) => Object.assign({
  id, label,
  precip: 'rain', rainMul: 1, fog: 1, stormMul: 1,
  water: [0.16, 0.33, 0.62],
  sky: null,
  grass: null, foliage: null,
  ambientFog: 0,
}, o);

export const BIOMES = [];
const add = (k, label, o) => { BIOMES[BIOME[k]] = def(BIOME[k], label, Object.assign({ key: k }, o)); };

add('OCEAN', 'Ocean', { water: [0.10, 0.30, 0.62] });
add('DEEP_OCEAN', 'Deep Ocean', { water: [0.06, 0.22, 0.52], stormMul: 1.3 });
add('FROZEN_OCEAN', 'Frozen Ocean', { precip: 'snow', water: [0.18, 0.32, 0.66] });
add('BEACH', 'Beach', { water: [0.10, 0.45, 0.62] });
add('SNOWY_BEACH', 'Snowy Beach', { precip: 'snow', water: [0.18, 0.32, 0.66] });
add('RIVER', 'River', { water: [0.14, 0.36, 0.62] });
add('FROZEN_RIVER', 'Frozen River', { precip: 'snow', water: [0.18, 0.32, 0.66] });
add('PLAINS', 'Plains', {});
add('FOREST', 'Forest', { fog: 1.3, ambientFog: 0.15 });
add('BIRCH_FOREST', 'Birch Forest', { fog: 1.2, ambientFog: 0.1 });
add('ANCIENT_FOREST', 'Ancient Forest', { fog: 2.6, ambientFog: 0.65, grass: [0.30, 0.55, 0.33], foliage: [0.20, 0.45, 0.28], water: [0.10, 0.34, 0.40] });
add('TAIGA', 'Taiga', { fog: 1.4, ambientFog: 0.2 });
add('SNOWY_TAIGA', 'Snowy Taiga', { precip: 'snow', fog: 1.5, ambientFog: 0.25, water: [0.18, 0.32, 0.66] });
add('TUNDRA', 'Tundra', { precip: 'snow', fog: 1.2, ambientFog: 0.1, water: [0.18, 0.32, 0.66] });
add('MOUNTAINS', 'Mountains', { fog: 1.6, ambientFog: 0.2, stormMul: 1.3 });
add('SNOWY_PEAKS', 'Snowy Peaks', { precip: 'snow', fog: 1.8, ambientFog: 0.3, stormMul: 1.5, water: [0.18, 0.32, 0.66] });
add('DESERT', 'Desert', { precip: 'none', rainMul: 0.15, fog: 0.6, water: [0.12, 0.55, 0.62] });
add('BADLANDS', 'Badlands', { precip: 'none', rainMul: 0.25, fog: 0.7, grass: [0.56, 0.51, 0.30], foliage: [0.62, 0.51, 0.30] });
add('SAVANNA', 'Savanna', { rainMul: 0.4, fog: 0.8 });
add('JUNGLE', 'Jungle', { rainMul: 1.6, fog: 1.6, ambientFog: 0.35, water: [0.08, 0.48, 0.48] });
add('SWAMP', 'Swamp', { rainMul: 1.3, fog: 2.4, ambientFog: 0.6, grass: [0.42, 0.44, 0.22], foliage: [0.36, 0.42, 0.18], water: [0.24, 0.32, 0.20] });
add('VOLCANIC', 'Volcanic Wastes', { precip: 'none', rainMul: 0.3, fog: 2.2, ambientFog: 0.5, grass: [0.38, 0.33, 0.24], foliage: [0.35, 0.30, 0.22], water: [0.20, 0.25, 0.30] });

export const SNOWY_BIOMES = new Set([BIOME.FROZEN_OCEAN, BIOME.SNOWY_BEACH, BIOME.FROZEN_RIVER, BIOME.SNOWY_TAIGA, BIOME.TUNDRA, BIOME.SNOWY_PEAKS]);

// Climate-driven grass/foliage colours (bilinear over temperature/humidity), MC-style colormap but original values.
const GC = {
  coldDry: [0.50, 0.62, 0.52], coldWet: [0.38, 0.58, 0.48],
  warmDry: [0.64, 0.74, 0.36], warmWet: [0.36, 0.66, 0.24],
  hotDry: [0.76, 0.72, 0.34], hotWet: [0.22, 0.74, 0.16],
};
function lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function cl(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

export function grassColor(temp, hum, biome) {
  const b = BIOMES[biome];
  if (b && b.grass) return b.grass;
  const h = cl((hum + 0.8) / 1.6);
  const t = cl((temp + 0.8) / 1.6);
  let c;
  if (t < 0.5) c = lerp3(lerp3(GC.coldDry, GC.coldWet, h), lerp3(GC.warmDry, GC.warmWet, h), t * 2);
  else c = lerp3(lerp3(GC.warmDry, GC.warmWet, h), lerp3(GC.hotDry, GC.hotWet, h), (t - 0.5) * 2);
  return c;
}
export function foliageColor(temp, hum, biome) {
  const b = BIOMES[biome];
  if (b && b.foliage) return b.foliage;
  const g = grassColor(temp, hum, biome);
  return [g[0] * 0.82, g[1] * 0.9, g[2] * 0.78];
}
export const BIRCH_TINT = [0.50, 0.66, 0.34];
export const PINE_TINT = [0.30, 0.46, 0.34];
