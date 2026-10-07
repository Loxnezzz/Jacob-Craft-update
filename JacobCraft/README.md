# Jacob Craft

An original voxel survival sandbox in the spirit of classic block games, rendered with a custom WebGL2 engine aimed at an "RTX / shader-pack" look: sun shadows, volumetric clouds, god rays, screen-space reflections on water and wet ground, bloom, sun glare, auto-exposure, biome-tinted fog and dynamic weather.

No external assets — every texture, item sprite, creature model and sound is generated procedurally in code.

Current version: **v1.1 "The Worldheart Update"** — the complete game, with an ending (see `DEVLOG.md`).

## Running

You need Python 3 and a modern Chromium/Firefox browser with WebGL2.

```
python serve.py
```

Then open **http://localhost:8765** in your browser. (Opening `index.html` directly from disk won't work because browsers block ES modules / workers on `file://`.)

## The goal

Jacob Craft is a sandbox you can play forever, but it also has an ending. Press **J** to open your Journal, which tracks
your milestones and the road to the end:

1. Defeat crowned **champions** (rare named monsters) for **Wayfinder Shards**.
2. Craft a **Lair Compass** (Compass + 2 Wayfinder Shards). It points to the nearest great beast you have not beaten.
3. Defeat the **five great beasts**. Each grants a permanent Boss Blessing.
4. Forge the **Worldheart Keystone** (frostite, sunstone, emberite, a diamond, glow dust and a Wayfinder Shard).
5. Use it on a **Runic Altar**: the Worldheart ritual, the ending and credits — and a Dragon Egg to hatch your own dragon.

The world carries on after the credits.

## What's in the world

- **Survival**: mining with tool tiers, crafting with a searchable recipe book, smelting, farming, hunger, health, drowning, fall damage, day/night, sleeping, difficulty levels (Peaceful–Hard).
- **Biomes**: plains, forests (oak, birch, ancient elder groves), taiga and snowy taiga, tundra, snowy peaks, mountains, jungle, swamp, savanna, desert, badlands, volcanic wastes, beaches, rivers, oceans and frozen oceans.
- **Weather**: clouds, rain, heavy rain, thunderstorms with lightning, snow in cold biomes, fog and dawn valley mist; ground gets wet and reflective.
- **Life**: farm animals (with coat variants), wildlife, birds, butterflies and fireflies, night monsters, villages in six regional styles with villagers who work, trade and greet you, and wizards who give quests.
- **Combat**: swords, daggers, axes, maces, spears (melee or thrown), bows, crossbows and two fictional flintlocks (Emberlock Pistol, Thunder Blunderbuss) that use Iron Shot and Gunpowder; TNT; hit feedback, stylised (non-graphic) damage effects that can be turned off.
- **Magic**: brewing at the Alchemy Table (healing, swiftness, night vision, strength, fire resistance, water breathing), enchanting at the Runic Altar with XP and Glow Dust, Runic Tomes.
- **Bosses** (each with an intro, two phases, unique loot, a permanent Boss Blessing and boss-forged gear): the Woolly Mammoth, the Ancient Forest Warden, the Desert Titan, the Frost Wyrm and the Volcanic Behemoth.
- **Champions**: six crowned mini-bosses — Grave Lord, Broodmother, Mire Matriarch, Sandstalker Alpha, Wraith Queen, Cinder Tyrant — each with two special abilities.
- **Dragons**: find one at a roost, win its trust with Dragonfruit Treats, tame it, saddle it, then ride and fly it (Space rises, Shift descends, W flies, sprint boosts, attack breathes fire). Dragon Eggs hatch hatchlings that grow up into your own mount.
- **Tools for explorers**: a compass that points home, a spyglass that zooms, and the Lair Compass.
- **Boats**, horses, furniture you can sit on, campfires you can cook on, and many decorative blocks.

## Controls

| Action | Key |
| --- | --- |
| Move | W A S D |
| Jump / swim up / rise (dragon) | Space (double-tap in Creative to fly) |
| Sneak / descend / dismount | Shift |
| Sprint | Ctrl or double-tap W |
| Mine / attack / fire breath | Left mouse (hold) |
| Place / use / interact / eat / draw bow / load crossbow or flintlock | Right mouse (hold to draw or load, click again to fire) |
| Hotbar | 1–9 or mouse wheel |
| Inventory + recipe book | E |
| Journal | J |
| Drop item | Q (Ctrl+Q drops the stack) |
| Chat / commands | T  or  / |
| Debug info | F3 |
| Camera view | F5 |
| Hide HUD | F1 |
| Pause | Esc |

Every key can be rebound in **Settings → Controls**. Settings also cover display mode (windowed / borderless / fullscreen), UI scale, render scale, brightness, graphics quality, audio volumes, difficulty, captions, screen shake, flashes and damage effects.

Useful commands: `/help`, `/time set day|night|sunset`, `/weather clear|cloudy|rain|heavy|thunder|fog`, `/gamemode creative|survival`, `/give <item> [count]`, `/tp x y z`, `/locate <biome or structure>`, `/heal`, `/feed`, `/seed`.

## Code layout

```
src/
  core/      math + seeded noise
  world/     blocks, biomes, terrain model, world generation, trees, structures,
             chunk mesher (runs in workers), world/chunk streaming + lighting + fluids
  workers/   generation and meshing workers
  gfx/       WebGL2 renderer + GLSL, procedural textures and item art, sky model, entities, held models
  game/      game loop, player + player model, physics, interaction, combat, magic, items, recipes,
             inventory, weather, boats, furniture, wildlife, boss milestones, journey (journal, compasses,
             ending), feedback, saves
  mobs/      creature, champion and boss definitions, models, animation, AI, villagers, dragons
  ui/        HUD, inventory/crafting screens, menus, settings, icons
  audio/     procedural WebAudio sound + generative music
```

Saves are stored in the browser's IndexedDB (per browser profile).
