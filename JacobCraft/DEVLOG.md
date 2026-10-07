# Jacob Craft — development log

## Architecture notes
- Custom WebGL2 engine, ES modules, no build step. Dev server: `python serve.py` (forces JS MIME types, no-cache).
- World: 16x16x192 chunk columns, sea level 63. Block ids are Uint8 (order in `world/blocks.js` = save format; only append).
- Generation runs in `workers/genWorker.js` (terrain/caves/ores/trees/plants/snow + local light).
  Cross-chunk light merge + edits use BFS in `world/world.js`.
- Meshing runs in `workers/meshWorker.js` on padded 18x18 copies; vertex = 20 bytes
  (int16 pos/128, uv/32, uint16 layer, sky/block light, AO, emissive, tint rgb, material|reflect<<3).
- Renderer passes: shadow (distorted ortho) → sky LUT → env map → clouds (low-res raymarch) → sky →
  opaque chunks + entities (MRT color+normal/reflectivity) → SSR (wet/polished) → water (refraction+SSR) →
  particles/precip/overlays/hand → volumetric light → bloom → auto exposure → ACES composite → FXAA.
- Textures: 32x32 procedural (`gfx/texgen.js`), albedo SRGB array + normal/tintmask/smoothness array.
  NOTE: no anisotropic filtering (it forces linear filtering on ANGLE → blurry pixel art).
- Entities: instanced box models with procedural pixel patterns (`gfx/entityRenderer.js`), extruded item meshes.
- Items: ids 0-255 = blocks, 256+ = items (`game/items.js`, append only).
- Saves: IndexedDB `jacobcraft` (worlds store + RLE chunks store).
- Hidden preview panes throttle rAF → main loop has a setInterval fallback.
- `jc` (window) = App debug handle; `jc.game.debugActive = true` lets scripts drive the player without pointer lock.
- Phase 6 systems install as hook chains from `game/extensions.js` (`installExtensions`): each wraps the previous
  `game.extUpdate`, `ui.updateHUD`, `game.onPlayerHurt`, `game.restoreSpecial`, `game.onPickup`. New systems should
  follow the same pattern instead of editing the core loop.
- Item stacks are `{id, count, dmg}` plus optional extras (`ench`, `loaded`, `name`) — always copy them with
  `stackExtra()` when moving/dropping stacks.
- World generation ends with a cleanup pass (`world/worldgen.js`): lone terrain/leaf voxels and detached clumps of up
  to 12 natural blocks are removed; anything touching a log, a structure block, liquid below, or the chunk border is
  kept. Tree generators must stay face-connected (step one axis at a time) (to verify a new type:
  grow it in an empty grid and flood-fill from the base; nothing may be left over).
- Player saves remember a persistent mount (dragon/horse/boat); on load the player is held in place until the mount's
  chunk restores it, then remounted (or set down on the ground if it is gone).

## Status
- Phase 1: DONE (movement, mining/tool tiers, placement, inventory, crafting + recipe book, furnace, chest, save/load, menus).
- Phase 2: DONE (health/hunger/air/damage/death/respawn, day/night, sleeping, animals, monsters, AI, spawning,
  taming wolves/cats/horses, horse riding, breeding, shearing, bows/arrows, projectiles).
- Phase 3: DONE (weather system + lightning + snow + wetness, SSR water, villages in 6 biome styles with villagers on
  daily schedules, A* pathing, doors, farming, trading, dialogue/lore hints; ruins, wizard towers, shipwrecks,
  mineshafts, loot chests; rowable boats).
- Phase 4: DONE. Five bosses (Woolly Mammoth, Forest Warden, Desert Titan, Frost Wyrm, Volcanic Behemoth) with lairs,
  wake-up, attack sets, phase 2, boss bar; wizard quests.
- Phase 5: DONE. Dragons at roosts: befriend with Dragonfruit Treats (trust 3 = friend, 6 = tamed), saddle, ride, fly,
  boost, fire breath.
- Phase 6 ("The Frontier Update"): DONE. First-person hands/swing keyframes and 3D held models; player model ("Jacob")
  with armor; reworked animals/monsters/villagers (person models, hats, props, greeting wave); swords, daggers, spears
  (thrown), maces, crossbows, Emberlock Pistol, Thunder Blunderbuss, gunpowder, TNT; brewing (Alchemy Table) and
  enchanting (Runic Altar, Runic Tomes, XP); 56 new blocks (building, decor, ores, stations) incl. sit-able furniture, campfire cooking;
  stylised damage feedback (splats, vignette, flinch, hit-stop, captions); birds/butterflies/fireflies; biome fog
  tints, dawn mist, sun glare; display modes, UI/render scale, key rebinding, accessibility toggles; title screen
  redesign; boss intros, per-boss music, loot fountains with beams, Boss Blessings and boss-forged gear.
- Phase 7 (QA + polish): DONE — see below.

## Phase 7 QA log (2026-10)
- Core loop harness (punch tree, craft, place, eat, melee kill, die/respawn, swim, bow, potion, trade): pass.
- Save/quit/reload keeps position, inventory extras (enchantments, loaded crossbow), XP, blessings, and now the mount.
- Worldgen: 20 spots across 4 fresh seeds (all major biomes) scanned for floating blocks — 0 after fixes. Fixed:
  trunk vines punching holes in canopies, detached willow strands, diagonal palm trunks/fronds, diagonal elder roots,
  a cleanup bookkeeping bug that deleted attached fronds, lone border terrain voxels. Tree unit check: all 15 types
  fully face-connected.
- Bosses: all five fought in sequence — intro card + letterbox, 2–4 attack types each, phase 2, death sequence,
  loot fountain, blessing; no errors. Fixed: summoned rootlings/scorpions now crumble with their boss; a pending
  blessing subtitle no longer overlaps the next boss card.
- Weather: storm, lightning bolts, rain, heavy rain, snow transition in tundra, fog — visually checked.
- Dragon: tame (6 treats), saddle gate, mount, take-off, ~13 b/s cruise, ~23 b/s boost, fire breath.
- Boats: float, paddle, steer. Crossbow/pistol/blunderbuss load+ammo+damage, TNT crater and falloff damage.
- Brewing (water → tonic → healing, fuel charges) and enchanting (offers, XP + dust cost) end to end; wizard quest.
- UI at 375×812, 700×500, 1280×600, 1920×1080: title (splash no longer covers the tagline), all settings tabs (key
  binds go single-column when narrow), HUD, inventory (auto UI scale now also follows window width). Inventory
  preview box now draws a live portrait of Jacob with his armor, head following the mouse.
- Sky: below-horizon haze no longer darkens into khaki when seen from the air.
- New worlds now face the player toward the most open view (scored raycasts in 16 directions) instead of
  whatever wall or trunk happened to be in front of the spawn point.
- Performance (hidden-pane measurements): ~1.4 ms update + ~2.4 ms render submit per frame on CPU; chunk generation
  ~5 ms per chunk in the worker.

## v1.1 "The Worldheart Update" — finishing the game (2026-10)
- Spec gap closed: **mini-bosses** (`mobs/minibosses.js`). Six champions built on the regular monsters (crowned,
  recoloured, scaled models; 140–170 hp; enrage at half health; health bar; two abilities each from a shared kit:
  summon/brood, ground slam, tongue pull, burrow-and-erupt, ice volley, frost nova, fireball barrage, fire ring).
  At most one alive; rare rolls (5% every 20 s, 4-minute cooldown after a kill) in their home biome at night, or the
  Broodmother when deep underground. Drops: Wayfinder Shards, emeralds, glow dust, sometimes a diamond.
- **Ending** (`game/journey.js`): Worldheart Keystone used on a Runic Altar (gated on all five Boss Blessings) plays a
  ritual cinematic (five coloured beams, a pillar of light), then an ending text, credits, and the player's journey
  statistics. Esc skips to the credits; "Continue your adventure" returns to a new dawn with a Dragon Egg on the altar.
- **Journal** (J / pause menu): 21 milestones, the five great beasts with lair hints, the Worldheart steps.
  Journey data and stats (mined, placed, killed, deaths, distance, time) are saved with the player.
- Placeholder items made real: the compass points home (bed or world spawn), the spyglass zooms (hold use), the
  Dragon Egg hatches a tamed hatchling that grows up in ~10 minutes (treats speed it up; too young to saddle).
- New: Wayfinder Shard, Lair Compass (points to the nearest undefeated great beast's lair via the structure locator),
  Worldheart Keystone.
- Fixes found along the way: blood splats could float mid-air (they formed when a drop hit a wall sideways) or
  underwater; large melee mobs walked into the player instead of stopping at arm's length; respawning at a destroyed
  bed; a held Esc could close two screens at once; the burrow eruption almost never connected.

## Hands, tools and animation fixes (2026-10)
- **First-person rig rebuilt** (`game/hands.js`): Jacob's fist (knuckles, curled fingers, thumb) on a straight forearm
  with a rolled cream cuff and his blue sleeve running back to a shoulder off screen. Tools are real 3D models now
  (`toolModel()` in `gfx/heldModels.js`: pickaxe, axe, shovel, hoe, sword, dagger, mace in every tier's colours),
  held with the head facing the target — the old sprite axe was mirrored twice and showed its blade to the player.
- **Swings** use smooth strike curves (`swingPose`): a chop that brings the tool head forward and down onto the
  crosshair, a diagonal sword slash, a straight punch. No wind-up backwards and no sideways sweep.
- **Shadows**: the entity shadow pass used to draw whatever was left in the box buffer — the first-person arm — so the
  arm shadowed itself (jagged black triangles) and creatures barely cast shadows. Entity boxes are now snapshotted
  after drawing (`snapshotShadow` / `drawShadowSnapshot`), and the hand and held item ignore world shadows.
- **Animation convention**: models face -Z, where a positive pitch swings a limb forward / raises a head, but every
  creature animation had been written the other way round (grazing heads went up, shambler arms reached behind their
  backs, attacks wound backwards, mobs looked away from targets). `Mob.render` now mirrors the animated part of each
  pitch (rest poses untouched). Jacob's third-person poses (swing, aiming, eating, riding, sneaking) were corrected
  by hand in `game/playerModel.js`; tools there ride on the arm, pointing forward.
- **Breaking**: crack overlay is one fracture network that spreads across the face stage by stage, sampled at full
  resolution so it stays visible at a distance. **Stone** (and the ores set in it) and **cobblestone** are darker.
- **Hunger** drains faster: a small steady drain, walking costs a little, mining costs more (a full bar lasts roughly
  20–30 minutes of ordinary play).
- **Fewer pop-ups**: minor milestones are recorded silently in the Journal; rare-item cards only on the first pickup;
  new one-time discovery cards for ruins, ancient ruins, abandoned mineshafts (from inside), shipwrecks, wizard towers
  and dragon roosts (counted as "Places discovered" in the end stats).
