// Villagers with daily schedules, jobs, homes, trading and dialogue; wizards with quests.
import { Mob, MOB_CLASSES } from './mobs.js';
import { MOBS } from './defs.js';
import { villagerModel, box, part, PAT } from './models.js';
import { personModel } from './people.js';
import { findPath } from './path.js';
import { ITEMS, I } from '../game/items.js';
import { B, BLOCKS, SHAPE } from '../world/blocks.js';
import { RNG } from '../core/noise.js';
import { el } from '../ui/ui.js';
import { escapeHtml } from '../ui/menus.js';

const SKINS = ['#f0c8a0', '#d8a878', '#b07a50', '#8a5a3a', '#e8b890', '#6a4428'];
const HAIRS = ['#3a2418', '#6a4428', '#c8a040', '#1a1414', '#8a3a1a', '#d8d0c8', '#4a3020'];
const OUTFIT = {
  farmer: { shirt: '#c8a050', trim: '#a88040', pants: '#5a4a3a', apron: '#8a6a3a', hat: (h) => [box([-5, 7.5, -5], [10, 1, 10], '#e0c070', PAT.cloth), box([-3.5, 8.5, -3.5], [7, 2, 7], '#e0c070', PAT.cloth)] },
  blacksmith: { shirt: '#4a4a4a', trim: '#3a3a3a', pants: '#2a2a2a', apron: '#3a2a1a', tool: '#8a8a90' },
  fisher: { shirt: '#3a6a8a', trim: '#2a5a7a', pants: '#4a4a3a', hat: () => [box([-4.5, 7.5, -4.5], [9, 2.5, 9], '#3a5a7a', PAT.cloth)] },
  merchant: { shirt: '#7a2a4a', trim: '#e0b040', pants: '#3a2a3a', belt: '#e0b040', stripe: 4 },
  builder: { shirt: '#c86a2a', trim: '#a85a20', pants: '#4a5a6a', belt: '#5a4a3a', hat: () => [box([-4.5, 7.5, -4.5], [9, 2.5, 9], '#e0c020', PAT.noise)] },
  hunter: { shirt: '#4a5a2a', trim: '#3a4a20', pants: '#5a4a2a', belt: '#3a2a1a', hat: () => [box([-4.5, 7.5, -4.5], [9, 2, 9], '#6a4a2a', PAT.fur)] },
  librarian: { shirt: '#3a4a7a', trim: '#c8b070', pants: '#2a3050', robe: true, stripe: 5 },
  healer: { shirt: '#e8e8e0', trim: '#c83030', pants: '#d0d0c8', robe: true, stripe: 4 },
  apprentice: { shirt: '#5a2a8a', trim: '#e0c040', pants: '#3a1a5a', robe: true, hat: () => [box([-4.5, 7.5, -4.5], [9, 1, 9], '#4a1a7a', PAT.cloth), box([-3, 8.5, -3], [6, 3, 6], '#4a1a7a', PAT.cloth), box([-1.5, 11.5, -1.5], [3, 3, 3], '#4a1a7a', PAT.cloth)] },
  wizard: { shirt: '#24184a', trim: '#e0c040', pants: '#1a1236', robe: true, stripe: 3, hat: () => [box([-5.5, 7.5, -5.5], [11, 1, 11], '#24184a', PAT.cloth), box([-3.5, 8.5, -3.5], [7, 4, 7], '#24184a', PAT.cloth, '#e0c040', 3), box([-2, 12.5, -2], [4, 4, 4], '#24184a', PAT.cloth), box([-1, 16.5, -1], [2, 3, 2], '#24184a'), box([-0.5, 19, -0.5], [1, 1, 1], '#ffe070', PAT.glow)], beard: '#e8e8e8' },
};

// ---------------------------------------------------------------- Phase 6 appearance: clothing, hair, faces, job props
const EYES = ['#3a5a8a', '#4a6a2a', '#5a3a22', '#2a2a2a', '#6a5a2a', '#4a7a8a'];
const LIP = ['#8a4a44', '#9a5248', '#7a3e3a', '#a85a50'];
const HAT = {
  straw: [box([-6, 7.6, -6], [12, 0.8, 12], '#e0c070', PAT.cloth, '#c8a850', 1), box([-3.8, 8.3, -3.8], [7.6, 2.6, 7.6], '#e0c070', PAT.cloth, '#c8a850', 1), box([-3.9, 8.4, -3.9], [7.8, 0.9, 7.8], '#a83a2a', PAT.flat)],
  souwester: [box([-5, 7.2, -5.6], [10, 0.9, 11.6], '#e8c020', PAT.noise), box([-4.2, 7.9, -4.2], [8.4, 2.6, 8.4], '#e8c020', PAT.noise)],
  cap: [box([-4.4, 7.2, -4.4], [8.8, 2.4, 8.8], '#7a2a4a', PAT.cloth), box([-4.4, 7.2, -6], [8.8, 0.7, 1.8], '#5a1a34', PAT.flat), box([2.6, 9, 0.6], [0.7, 3.6, 2], '#f0ece0', PAT.feathers)],
  hardhat: [box([-4.6, 6.8, -4.6], [9.2, 3, 9.2], '#e8c020', PAT.metal), box([-4.6, 6.8, -6.2], [9.2, 0.8, 1.7], '#d8b018', PAT.metal), box([-0.6, 9.7, -4.7], [1.2, 0.4, 9.4], '#c8a010', PAT.flat)],
  hood: [box([-4.7, 7.8, -4.7], [9.4, 1.3, 9.4], '#3e5a24', PAT.cloth), box([-4.7, -0.5, -4.3], [0.7, 8.4, 8.9], '#3e5a24', PAT.cloth), box([4, -0.5, -4.3], [0.7, 8.4, 8.9], '#3e5a24', PAT.cloth), box([-4.7, -0.5, 3.6], [9.4, 8.4, 1.1], '#3e5a24', PAT.cloth), box([-1.5, 2, 4.4], [3, 4, 1.6], '#3e5a24', PAT.cloth)],
  kerchief: [box([-4.4, 6.2, -4.4], [8.8, 2.4, 8.8], '#f0ece4', PAT.cloth), box([-1, 4.5, 3.9], [2, 2, 1], '#f0ece4', PAT.cloth)],
  headband: [box([-4.2, 5.4, -4.25], [8.4, 1.1, 8.5], '#7a2a1a', PAT.cloth)],
  pointy: (c, c2) => [box([-6, 7.4, -6], [12, 0.8, 12], c, PAT.cloth), box([-4, 8.2, -4], [8, 3.4, 8], c, PAT.cloth, c2, 3), box([-3, 11.6, -2.6], [6, 3, 6], c, PAT.cloth), box([-2, 14.6, -1.4], [4, 3, 4], c, PAT.cloth), box([-1, 17.6, -0.2], [2, 2.6, 2], c, PAT.cloth),
    box([-0.5, 20, 0.6], [1, 1, 1], '#ffe070', PAT.glow), box([-3.4, 9.4, -4.1], [0.8, 0.8, 0.1], '#ffe070', PAT.glow), box([2, 12.6, -3.1], [0.7, 0.7, 0.1], '#ffe070', PAT.glow), box([0.6, 15.4, -1.5], [0.6, 0.6, 0.1], '#ffe070', PAT.glow)],
};
const PROPS = {
  hoe: [box([-0.45, -11.6, -7.5], [0.9, 0.9, 9.5], '#8a6236', PAT.bark), box([-0.5, -14, -7.9], [1, 3, 1.2], '#b8bcc4', PAT.metal)],
  hammer: [box([-0.4, -11.6, -5], [0.8, 0.8, 6.4], '#6a4a2a', PAT.bark), box([-1.3, -12.9, -6.2], [2.6, 3, 1.9], '#5a5e66', PAT.metal)],
  rod: [box([-0.35, -11.5, -13], [0.7, 0.7, 14], '#9a7044', PAT.bark), box([-0.1, -16, -13], [0.2, 4.5, 0.2], '#e8e8e8', PAT.flat)],
  book: [box([-1.7, -13.6, -2.8], [3.4, 4.2, 1.4], '#8a2a1e', PAT.noise), box([-1.5, -13.4, -1.45], [3, 3.8, 0.2], '#f0e8d0', PAT.flat)],
  satchel: [box([-1.4, -13, -1.5], [2.8, 3, 3], '#c8c0b0', PAT.cloth), box([-0.5, -11.6, -1.7], [1, 1, 0.3], '#c83030', PAT.flat)],
  wand: [box([-0.35, -11.5, -6], [0.7, 0.7, 6], '#5a3a22', PAT.bark), box([-0.6, -11.8, -6.8], [1.2, 1.2, 1.2], '#b080ff', PAT.glow)],
  staff: [box([-0.55, -18, -2.2], [1.1, 24, 1.1], '#5a3a22', PAT.bark), box([-1.4, 5.8, -3], [2.8, 2.8, 2.8], '#7ad8ff', PAT.glow), box([-1.8, 5.2, -3.4], [3.6, 0.8, 3.6], '#c8a040', PAT.metal)],
  plank: [box([-0.6, -14, -6], [1.2, 3, 8], '#b8955e', PAT.bark)],
};
const BACKS = {
  pack: [box([-3, 1.5, 2.2], [6, 7.5, 2.8], '#6a4a2a', PAT.noise), box([-3.4, 9, 2.6], [6.8, 1.6, 1.8], '#8a5a3a', PAT.cloth), box([-2.6, 4, 4.9], [5.2, 2.5, 0.3], '#4a3020', PAT.flat)],
  quiver: [box([-1.3, 3, 2.2], [2.6, 8, 2.2], '#6a4026', PAT.noise), box([-1.1, 10.6, 2.4], [0.6, 1.8, 0.6], '#f0ece0', PAT.feathers), box([0.3, 10.8, 2.6], [0.6, 1.8, 0.6], '#d04040', PAT.feathers)],
};
function villagerLook(job, r, gender, kind) {
  const skin = SKINS[r.irange(0, SKINS.length - 1)];
  const elder = r.next() < 0.18;
  let hair = elder ? r.pick(['#d8d0c8', '#a8a49c', '#e8e4dc']) : HAIRS[r.irange(0, HAIRS.length - 1)];
  const styles = gender === 1 ? ['long', 'ponytail', 'bun', 'braids', 'curly', 'short'] : ['short', 'short', 'messy', 'curly', 'bald', 'long'];
  let hairStyle = r.pick(styles);
  if (elder && gender === 0 && r.next() < 0.5) hairStyle = 'bald';
  const o = {
    skin, skinDark: shade(skin, 0.86), hair, hair2: shade(hair, 0.82), hairStyle, eye: r.pick(EYES), lip: r.pick(LIP), brow: shade(hair, 0.75),
    blush: gender === 1 && r.next() < 0.6 ? '#e8988a' : null, freckles: r.next() < 0.15 ? shade(skin, 0.75) : null,
    beard: gender === 0 && r.next() < (elder ? 0.7 : 0.35) ? hair : null, beardStyle: r.pick(['full', 'mustache', 'goatee', 'stubble']),
    wide: gender === 0 ? 1 + (r.next() - 0.3) * 0.12 : 0.94, earring: gender === 1 && r.next() < 0.3 ? '#e0c040' : null,
    glasses: elder && r.next() < 0.5 ? '#5a4a3a' : null,
  };
  const pick = (a) => a[r.irange(0, a.length - 1)];
  switch (job) {
    case 'farmer': Object.assign(o, { shirt: pick(['#c8a050', '#d8c8a0', '#b86a4a']), pants: '#4a5a7a', pants2: '#3a4a6a', rolled: true, vest: '#4a5a7a', boots: '#4a3a2a', hat: HAT.straw, handR: PROPS.hoe, kneePatch: '#6a7a9a' }); break;
    case 'blacksmith': Object.assign(o, { shirt: '#4a4a4a', pants: '#2a2a2a', rolled: true, apron: '#5a3a20', apronPocket: '#4a2e18', boots: '#2a1e16', handR: PROPS.hammer, hat: r.next() < 0.5 ? HAT.headband : null, freckles: '#4a3a32' }); if (gender === 0) o.beard = o.beard || hair; break;
    case 'fisher': Object.assign(o, { shirt: '#3a6a8a', shirt2: '#e8e8e0', stripe: 3, pants: '#4a4a3a', boots: '#2a3a2a', hat: HAT.souwester, handR: PROPS.rod, scarf: '#c84030' }); break;
    case 'merchant': Object.assign(o, { shirt: '#7a2a4a', shirt2: '#e0b040', vest: '#e0b040', pants: '#3a2a3a', belt: '#4a3020', pouch: '#e0b040', hat: HAT.cap, back: BACKS.pack, cuff: '#e0b040' }); break;
    case 'builder': Object.assign(o, { shirt: '#c86a2a', pants: '#4a5a6a', belt: '#5a4a3a', pouch: '#6a5a4a', rolled: true, hat: HAT.hardhat, handR: PROPS.plank }); break;
    case 'hunter': Object.assign(o, { shirt: '#4a5a2a', vest: '#6a4a2a', pants: '#5a4a2a', belt: '#3a2a1a', hat: HAT.hood, back: BACKS.quiver, cape: '#3e5a24' }); break;
    case 'librarian': Object.assign(o, { shirt: '#3a4a7a', cuff: '#c8b070', pants: '#2a3050', robe: '#3a4a7a', robeTrim: '#c8b070', glasses: '#5a4a3a', handR: PROPS.book, collar: '#c8b070' }); break;
    case 'healer': Object.assign(o, { shirt: '#e8e8e0', cuff: '#c83030', pants: '#d0d0c8', robe: '#e8e8e0', robeTrim: '#c83030', hat: HAT.kerchief, handR: PROPS.satchel, collar: '#c83030' }); break;
    case 'apprentice': Object.assign(o, { shirt: '#5a2a8a', cuff: '#e0c040', pants: '#3a1a5a', robe: '#5a2a8a', robeTrim: '#e0c040', hat: HAT.pointy('#4a1a7a', '#e0c040').slice(0, 4), handR: PROPS.wand }); break;
    case 'wizard': Object.assign(o, { shirt: '#24184a', shirt2: '#3a2a6a', cuff: '#e0c040', pants: '#1a1236', robe: '#24184a', robeTrim: '#e0c040', hat: HAT.pointy('#24184a', '#e0c040'), hair: '#e8e8e8', hair2: '#c8c8c8', brow: '#e8e8e8', beard: '#e8e8e8', beardStyle: 'long', hairStyle: 'long', handR: PROPS.staff, cape: '#3a2a6a', capeTrim: '#e0c040' }); break;
    default: Object.assign(o, { shirt: pick(['#7a5a3a', '#5a7a4a', '#4a5a8a', '#8a4a3a']), pants: '#3a2a1a' });
  }
  if (o.beard) o.beard = o.hair === '#e8e8e8' ? o.beard : o.hair;
  return o;
}

MOBS.villager = Object.assign({}, MOBS.cow, { id: 'villager', name: 'Villager', type: 'villager', hp: 20, speed: 1.5, runSpeed: 3.2, size: [0.6, 1.95], drops: [], sounds: { idle: 'hmm', hurt: 'hurt', death: 'death' }, food: [], idleSound: 0.06, sleeps: false, model: null, xp: 0, attack: null, tame: null });
MOBS.wizard = Object.assign({}, MOBS.villager, { id: 'wizard', name: 'Wizard', hp: 40, speed: 1.2 });

const TRADES = {
  farmer: [[[['wheat_item', 20]], ['emerald', 1]], [[['carrot', 18]], ['emerald', 1]], [[['emerald', 1]], ['bread', 6]], [[['emerald', 1]], ['apple', 4]], [[['emerald', 1]], ['seeds', 16]], [[['emerald', 2]], ['hay_bale', 3]]],
  blacksmith: [[[['coal', 15]], ['emerald', 1]], [[['iron_ingot', 4]], ['emerald', 1]], [[['emerald', 3]], ['iron_pickaxe', 1]], [[['emerald', 3]], ['iron_axe', 1]], [[['emerald', 4]], ['iron_sword', 1]], [[['emerald', 6]], ['iron_chestplate', 1]], [[['emerald', 12], ['diamond', 1]], ['diamond_pickaxe', 1]], [[['emerald', 2]], ['shears', 1]]],
  fisher: [[[['raw_fish', 10]], ['emerald', 1]], [[['emerald', 1]], ['cooked_fish', 6]], [[['emerald', 2]], ['fishing_rod', 1]], [[['emerald', 3]], ['oak_boat', 1]], [[['string', 12]], ['emerald', 1]]],
  merchant: [[[['emerald', 1]], ['glass', 8]], [[['emerald', 2]], ['wool_red', 6]], [[['emerald', 5]], ['saddle', 1]], [[['gold_ingot', 3]], ['emerald', 1]], [[['emerald', 1]], ['lantern', 2]], [[['emerald', 8]], ['compass', 1]], [[['emerald', 2]], ['bed', 1]]],
  builder: [[[['emerald', 1]], ['stone_bricks', 16]], [[['emerald', 1]], ['bricks', 12]], [[['emerald', 1]], ['oak_planks', 24]], [[['oak_log', 16]], ['emerald', 1]], [[['emerald', 2]], ['marble', 12]], [[['emerald', 1]], ['glass', 10]], [[['emerald', 3]], ['sunstone_block', 2]]],
  hunter: [[[['leather', 6]], ['emerald', 1]], [[['emerald', 1]], ['arrow', 16]], [[['emerald', 3]], ['bow', 1]], [[['raw_venison', 8]], ['emerald', 1]], [[['emerald', 4]], ['leather_chestplate', 1]], [[['feather', 16]], ['emerald', 1]]],
  librarian: [[[['paper', 20]], ['emerald', 1]], [[['emerald', 1]], ['book', 2]], [[['emerald', 2]], ['bookshelf', 1]], [[['emerald', 4]], ['spyglass', 1]], [[['book', 4]], ['emerald', 1]]],
  healer: [[[['emerald', 3]], ['healing_potion', 1]], [[['emerald', 3]], ['swift_potion', 1]], [[['emerald', 2]], ['night_potion', 1]], [[['berries', 16]], ['emerald', 1]], [[['mushroom_red', 6]], ['emerald', 1]]],
  apprentice: [[[['emerald', 6]], ['magic_wand', 1]], [[['frostite_shard', 2]], ['emerald', 1]], [[['emerald', 2]], ['glowdust', 6]], [[['sunstone_shard', 4]], ['emerald', 1]], [[['emerald', 3]], ['healing_potion', 1]]],
  wizard: [[[['emerald', 4]], ['healing_potion', 2]], [[['emerald', 5]], ['night_potion', 2]], [[['emerald', 8], ['frostite_shard', 4]], ['frost_staff', 1]], [[['emerald', 8], ['emberite_ingot', 2]], ['ember_staff', 1]], [[['emerald', 3]], ['dragon_treat', 1]]],
};

const PERSONALITIES = ['cheerful', 'grumpy', 'shy', 'curious', 'wise'];
const GREET = {
  cheerful: ['Well met, traveler!', 'What a lovely day!', 'Welcome, welcome! Make yourself at home.', 'Oh, a visitor! How exciting!'],
  grumpy: ['Hmph. Mind the crops.', "Don't track mud in.", 'Buy something or move along.', 'Another adventurer. Wonderful.'],
  shy: ['Oh... h-hello.', "I didn't see you there.", 'Um. Can I help you?', '...hi.'],
  curious: ['Where did you come from? Tell me everything!', 'Is that a real sword? Can I hold it?', 'Have you been past the mountains?'],
  wise: ['The world is older than it looks, friend.', 'Patience is a tool sharper than iron.', 'Every storm passes. Every one.'],
};
const JOB_LINE = {
  farmer: ['The wheat grows best with water close by.', 'Feed a cow some wheat and you might get a calf.'],
  blacksmith: ['Iron needs a stone pickaxe, diamonds need iron. That is the way.', 'Bring me coal and I will keep the forge warm.'],
  fisher: ['The fish bite best in the rain.', 'A boat will carry you to the far islands.'],
  merchant: ['Emeralds talk, friend.', 'I travel the roads between villages. Strange things out there.'],
  builder: ['A good roof keeps out storms and Shamblers alike.', 'Stone bricks: four stone in a square. Easy.'],
  hunter: ['Deer startle easily. Sneak up on them.', 'Wolves can be tamed with a bone, if you are patient.'],
  librarian: ['I collect stories of the old giants.', 'Books are made from paper and leather.'],
  healer: ['Berries and rest heal most wounds.', 'A Healing Draught is worth its weight in emeralds.'],
  apprentice: ['My master lives in a tower somewhere in the woods.', 'Frostite hums when you hold it... can you hear it?'],
};

function dirName(dx, dz) {
  const a = Math.atan2(dx, -dz);
  const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  return names[(Math.round(a / (Math.PI / 4)) + 8) % 8];
}

export class Villager extends Mob {
  constructor(game, kind, x, y, z, opts = {}) {
    super(game, kind, x, y, z, Object.assign({ persistent: true }, opts));
    this.isVillager = true;
    this.hittable = true;
    const d = opts.data || {};
    const r = new RNG((d.look || (Math.random() * 1e9)) >>> 0);
    this.data = Object.assign({
      name: d.name || 'Villager', job: d.job || 'merchant', bed: d.bed || null, door: d.door || null, work: d.work || null, meet: d.meet || null,
      village: d.village || null, look: d.look || r.nextInt(), personality: d.personality || r.pick(PERSONALITIES), gender: d.gender ?? (r.next() < 0.5 ? 0 : 1),
      quest: d.quest || 0,
    }, d);
    this.home = this.data.bed;
    this.path = null; this.pathIdx = 0; this.pathT = 0; this.goalKind = null;
    this.openDoors = [];
    this.scheduleT = 0;
    this.setModel();
    this.pose = this.model.parts.map(() => [0, 0, 0, 0, 0, 0]);
  }
  get name() { return this.data ? this.data.name : 'Villager'; }
  setModel() {
    if (!this.data) { this.model = personModel({ skin: '#e0b890', hair: '#3a2418', shirt: '#7a5a3a', pants: '#3a2a1a' }); return; }
    const job = this.kind === 'wizard' ? 'wizard' : this.data.job;
    const key = job + ':' + (this.data.look >>> 0) + ':' + this.data.gender;
    this.model = MODEL_CACHE.get(key) || (() => {
      const r = new RNG(this.data.look >>> 0);
      const m = personModel(villagerLook(job, r, this.data.gender, this.kind));
      MODEL_CACHE.set(key, m);
      return m;
    })();
  }

  extraData() { return this.data; }
  loadExtra(d) { this.data = Object.assign(this.data || {}, d); this.home = this.data.bed; this.setModel(); this.pose = this.model.parts.map(() => [0, 0, 0, 0, 0, 0]); }

  phase() {
    const t = this.game.dayTime;
    const wet = this.game.weather.rain > 0.5;
    if (t > 0.78 || t < 0.24) return 'sleep';
    if (wet && this.kind !== 'wizard') return 'home';
    if (t < 0.3) return 'wake';
    if (t < 0.68) return 'work';
    return 'social';
  }

  // villagers use brainAnimal slot: override
  brainAnimal(dt) {
    const g = this.game, p = g.player;
    this.sleeping = false; this.working = false;
    if (this.talking) { this.lookAt = p; return; }
    // greet the player with a wave when they come close (once in a while)
    if (this.waveT > 0) { this.waveT -= dt; this.lookAt = p; }
    this.waveCD = (this.waveCD ?? 5) - dt;
    if (this.waveCD <= 0 && g.isDay && !p.dead && this.distTo(p.x, p.y, p.z) < 6 && (this.data.grudge || 0) < 2) {
      this.waveCD = 40 + Math.random() * 40; this.waveT = 1.6;
      g.audio.mob('hmm', this, 1 + (this.data.gender ? 0.25 : 0));
    }
    if (this.kind === 'wizard') { this.wizardBrain(dt); return; }
    // danger
    if ((this.age * 2 | 0) !== ((this.age - dt) * 2 | 0)) {
      this._danger = null;
      for (const e of g.entities.list) if (e.type === 'mob' && e.isHostile && e.deathT < 0 && e.distTo(this.x, this.y, this.z) < 9) { this._danger = e; break; }
    }
    if (this._danger) {
      const f = this._danger;
      const dx = this.x - f.x, dz = this.z - f.z, l = Math.hypot(dx, dz) || 1;
      this.mx = dx / l; this.mz = dz / l; this.wantSpeed = this.def.runSpeed;
      this.path = null;
      return;
    }
    const ph = this.phase();
    let goal = null, goalKind = ph;
    const D = this.data;
    if (ph === 'sleep' || ph === 'home') goal = D.bed;
    else if (ph === 'work') goal = D.work || D.bed;
    else if (ph === 'social') goal = D.meet;
    else goal = D.door || D.bed;
    // arrived?
    if (goal) {
      const dist = Math.hypot(goal[0] + 0.5 - this.x, goal[2] + 0.5 - this.z);
      if (dist < 1.4 && Math.abs(goal[1] - this.y) < 2.5) {
        this.path = null;
        if (ph === 'sleep') { this.sleeping = true; this.x += (goal[0] + 0.5 - this.x) * 0.2; this.z += (goal[2] + 0.5 - this.z) * 0.2; this.vx = this.vz = 0; return; }
        if (ph === 'work') { this.working = true; this.workTick(dt); if (Math.random() < dt * 0.1) this.wanderNear(goal, 3); return; }
        if (ph === 'social' || ph === 'wake') {
          // look at nearby villagers, small wanders
          if (!this._socialGoal || Math.random() < dt * 0.15) this._socialGoal = [goal[0] + (Math.random() - 0.5) * 8, goal[1], goal[2] + (Math.random() - 0.5) * 8];
          const sg = this._socialGoal;
          const sd = Math.hypot(sg[0] - this.x, sg[2] - this.z);
          if (sd > 1) { this.mx = (sg[0] - this.x) / sd; this.mz = (sg[2] - this.z) / sd; this.wantSpeed = this.def.speed * 0.7; if (!this.safeAhead()) this._socialGoal = null; }
          for (const e of g.entities.list) if (e !== this && e.isVillager && e.distTo(this.x, this.y, this.z) < 4) { this.lookAt = e; break; }
          if (p.distTo ? false : Math.hypot(p.x - this.x, p.z - this.z) < 4) this.lookAt = p;
          return;
        }
        return;
      }
      if (this.goalKind !== goalKind || !this.path) {
        this.pathT -= dt;
        if (this.pathT <= 0) {
          this.pathT = 2 + Math.random();
          const res = findPath(g.world, this.x, this.y, this.z, goal[0], goal[1], goal[2], 3000);
          this.path = res.path.length > 1 ? res.path : null; this.pathIdx = 1; this.goalKind = goalKind;
          if (!this.path) this.wanderNear(goal, 6);
        }
      }
      if (this.path) this.followPath(dt);
    } else this.wander(dt, this.def.speed * 0.7);
    if (Math.hypot(p.x - this.x, p.z - this.z) < 3.5) this.lookAt = p;
    this.closeDoors();
  }

  wanderNear(c, r) {
    const a = Math.random() * Math.PI * 2;
    this.goal = [c[0] + Math.cos(a) * r, c[2] + Math.sin(a) * r];
    this.state = 'walk'; this.stateT = 4;
  }

  followPath(dt) {
    const w = this.game.world;
    const wp = this.path[this.pathIdx];
    if (!wp) { this.path = null; return; }
    const dx = wp[0] - this.x, dz = wp[2] - this.z, d = Math.hypot(dx, dz);
    // open doors on the way
    for (const yy of [0, 1]) {
      const id = w.getBlock(Math.floor(wp[0]), Math.floor(wp[1]) + yy, Math.floor(wp[2]));
      if (id && BLOCKS[id].shape === SHAPE.DOOR) {
        const m = w.getMeta(Math.floor(wp[0]), Math.floor(wp[1]) + yy, Math.floor(wp[2]));
        if (!(m & 4) && d < 2.2) {
          const bx = Math.floor(wp[0]), bz = Math.floor(wp[2]);
          const by = (m & 8) ? Math.floor(wp[1]) + yy - 1 : Math.floor(wp[1]) + yy;
          w.setBlock(bx, by, bz, id, w.getMeta(bx, by, bz) | 4, { noUpdate: true });
          w.setBlock(bx, by + 1, bz, id, w.getMeta(bx, by + 1, bz) | 4, { noUpdate: true });
          this.openDoors.push([bx, by, bz, this.age]);
          this.game.audio.play('door_open', this);
        }
      }
    }
    if (d < 0.45) { this.pathIdx++; if (this.pathIdx >= this.path.length) this.path = null; return; }
    this.mx = dx / d; this.mz = dz / d; this.wantSpeed = this.def.speed;
    if (wp[1] > this.y + 0.5 && this.onGround) this.vy = 8.4;
  }

  closeDoors() {
    if (!this.openDoors.length) return;
    const w = this.game.world;
    this.openDoors = this.openDoors.filter(([x, y, z, t]) => {
      if (this.age - t < 1.5 || Math.hypot(x + 0.5 - this.x, z + 0.5 - this.z) < 1.6) return true;
      const id = w.getBlock(x, y, z);
      if (id && BLOCKS[id].shape === SHAPE.DOOR) {
        w.setBlock(x, y, z, id, w.getMeta(x, y, z) & ~4, { noUpdate: true });
        w.setBlock(x, y + 1, z, id, w.getMeta(x, y + 1, z) & ~4, { noUpdate: true });
        this.game.audio.play('door_close', this);
      }
      return false;
    });
  }

  workTick(dt) {
    // farmers harvest ripe crops and replant
    if (this.data.job !== 'farmer' || Math.random() > dt * 0.5) return;
    const w = this.game.world;
    for (let k = 0; k < 6; k++) {
      const x = Math.floor(this.x + (Math.random() - 0.5) * 8), z = Math.floor(this.z + (Math.random() - 0.5) * 8), y = Math.floor(this.y);
      for (const yy of [y, y - 1, y + 1]) {
        const id = w.getBlock(x, yy, z);
        if ((id === B.wheat || id === B.carrots) && (w.getMeta(x, yy, z) & 7) === 7) {
          w.setBlock(x, yy, z, id, 0, { noUpdate: true });
          this.game.particles.blockBreak(x, yy, z, id);
          this.lookAt = { x: x + 0.5, y: yy, z: z + 0.5 };
          return;
        }
      }
    }
  }

  wizardBrain(dt) {
    const p = this.game.player;
    if (Math.hypot(p.x - this.x, p.z - this.z) < 8) this.lookAt = p;
    this.stateT -= dt;
    if (this.stateT <= 0) {
      this.stateT = 3 + Math.random() * 5;
      if (Math.random() < 0.3) this.game.particles.sparkle(this.x, this.y + 2.2, this.z, [0.7, 0.6, 1], 6);
    }
    if (!this.homePos) this.homePos = [this.x, this.y, this.z];
    const d = Math.hypot(this.homePos[0] - this.x, this.homePos[2] - this.z);
    if (d > 2) { this.mx = (this.homePos[0] - this.x) / d; this.mz = (this.homePos[2] - this.z) / d; this.wantSpeed = 1; }
  }

  hurt(amount, src = {}) {
    const r = super.hurt(amount, src);
    if (r && src.entity === this.game.player) {
      this.game.ui.chat(`<${this.name}> Ow! What was that for?!`, '#fc8');
      this.data.grudge = (this.data.grudge || 0) + 1;
    }
    this.fleeT = 0;
    return r;
  }

  // ---------------------------------------------------------------- dialogue & trade UI
  interact(player) {
    const g = this.game;
    if (this.deathT >= 0) return false;
    g.ui.openVillager(this);
    return true;
  }

  greeting() {
    const g = this.game, D = this.data;
    const r = Math.random;
    const pick = (a) => a[Math.floor(r() * a.length)];
    if (D.grudge > 2) return "I'm not talking to you after what you did.";
    const lines = [];
    if (this.sleeping) return 'Zzz... five more minutes...';
    const W = g.weather;
    if (W.state === 'storm') lines.push('Stay away from tall trees in this storm!');
    else if (W.localSnow > 0.3) lines.push("Brr! The snow's thick this year.");
    else if (W.localRain > 0.3) lines.push('Rain is good for the crops, bad for my knees.');
    if (!g.isDay) lines.push("It's dark! Shamblers walk at night, you know.");
    lines.push(pick(GREET[D.personality] || GREET.cheerful));
    if (JOB_LINE[D.job] && r() < 0.5) lines.push(pick(JOB_LINE[D.job]));
    const hint = this.loreHint();
    if (hint && (['librarian', 'apprentice', 'hunter', 'fisher', 'merchant'].includes(D.job) || this.kind === 'wizard') && r() < 0.6) lines.push(hint);
    return lines.slice(-2).join(' ');
  }

  loreHint() {
    const g = this.game;
    if (!g.locate) return null;
    const near = g.locate(this.x, this.z, 1400);
    const p = { x: this.x, z: this.z };
    const pickNear = (type) => {
      let best = null, bd = 1e9;
      for (const s of near) if (s.type === type) { const d = Math.hypot(s.x - p.x, s.z - p.z); if (d < bd) { bd = d; best = s; } }
      return best ? [best, bd] : null;
    };
    const cands = [
      ['mammoth_valley', (dir, d) => `Travelers speak of enormous footprints in the snow, about ${Math.round(d / 100) * 100} blocks ${dir} of here.`],
      ['desert_temple', (dir) => `The sands to the ${dir} hide a buried temple. Something ancient sleeps beneath it.`],
      ['frost_spire', (dir) => `High on the frozen peaks to the ${dir}, the air sings with frost. A wyrm nests there.`],
      ['warden_grove', (dir) => `The ancient forest ${dir} of here has a guardian. Do not anger it lightly.`],
      ['caldera', (dir) => `Fire and ash to the ${dir}... they say a Behemoth stirs in a caldera there.`],
      ['wizard_tower', (dir) => `A wizard keeps a tower ${dir} of here. Bring gifts.`],
      ['dragon_roost', (dir) => `I once saw a dragon circling the heights to the ${dir}. Nobody believes me.`],
      ['shipwreck', (dir) => `An old ship sank off the coast to the ${dir}. Treasure, maybe?`],
    ].sort(() => Math.random() - 0.5);
    for (const [type, fn] of cands) {
      const f = pickNear(type);
      if (f) return fn(dirName(f[0].x - p.x, f[0].z - p.z), f[1]);
    }
    return null;
  }

  trades() { return TRADES[this.kind === 'wizard' ? 'wizard' : this.data.job] || []; }
}

const MODEL_CACHE = new Map();
function shade(h, f) { const v = parseInt(h.slice(1), 16); const r = Math.round(((v >> 16) & 255) * f), g = Math.round(((v >> 8) & 255) * f), b = Math.round((v & 255) * f); return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1); }

MOB_CLASSES.villager = Villager;
MOB_CLASSES.wizard = Villager;

// ---------------------------------------------------------------- wizard quests
export const QUESTS = [
  { ask: 'Bring me 5 Frostite Shards from the cold peaks, and I will craft you a staff of winter.', need: [['frostite_shard', 5]], reward: [['frost_staff', 1]], done: 'Splendid! Feel the cold obey you.' },
  { ask: 'My lamps run dim. Bring 8 Sunstone Shards from the deep desert stone.', need: [['sunstone_shard', 8]], reward: [['healing_potion', 3], ['night_potion', 2]], done: 'Ah, warm light again. Take these draughts.' },
  { ask: 'I study the great beasts. Bring me a Mammoth Tusk, if you dare face the giant of the tundra.', need: [['mammoth_tusk', 1]], reward: [['dragon_treat', 4], ['emerald', 12]], done: 'Remarkable! Here — dragons adore these treats. Should you ever find one...' },
  { ask: 'Bring 3 Emberite Ingots from the volcanic wastes and I will forge an Ember Staff.', need: [['emberite_ingot', 3]], reward: [['ember_staff', 1]], done: 'Careful — it bites back.' },
  { ask: 'The forest guardian\'s Heartwood Core holds old magic. Bring it to me.', need: [['warden_heart', 1]], reward: [['emerald', 20], ['swift_potion', 3]], done: 'The forest remembers. Thank you.' },
];

// ---------------------------------------------------------------- UI
export function installVillagerUI(game) {
  const ui = game.ui;
  ui.openVillager = (v) => {
    v.talking = true;
    const p = game.player;
    game.audio.mob('hmm', v);
    ui.openScreen('villager', (root) => {
      const panel = el('div', 'panel', root);
      panel.style.maxWidth = '640px';
      const job = v.kind === 'wizard' ? 'Wizard' : v.data.job[0].toUpperCase() + v.data.job.slice(1);
      const dia = el('div', 'dialogue', panel);
      el('div', 'who', dia, `${escapeHtml(v.name)} — ${job}`);
      el('div', '', dia, escapeHtml(v.greeting()));
      // wizard quest
      if (v.kind === 'wizard') {
        const q = QUESTS[(v.data.quest || 0) % QUESTS.length];
        const qd = el('div', '', panel);
        qd.style.cssText = 'margin:10px 0;padding:8px;background:#b8b0c8;border:2px solid;border-color:#ddd #555 #555 #ddd;font-size:20px;color:#2a1a4a';
        qd.innerHTML = `<b>Quest:</b> ${escapeHtml(q.ask)}`;
        const can = q.need.every(([n, c]) => p.inventory.count(I[n]) >= c);
        const btn = el('button', 'btn small', qd, can ? 'Hand over' : 'Not yet');
        btn.style.marginTop = '6px';
        btn.disabled = !can;
        btn.onclick = () => {
          for (const [n, c] of q.need) p.inventory.remove(I[n], c);
          for (const [n, c] of q.reward) game.giveItem(I[n], c);
          v.data.quest = (v.data.quest || 0) + 1;
          game.onQuestDone && game.onQuestDone();
          game.audio.play('levelup');
          game.particles.sparkle(v.x, v.y + 2, v.z, [0.8, 0.7, 1], 20);
          ui.toast('Quest complete', escapeHtml(q.done));
          ui.closeScreen();
        };
      }
      const list = el('div', 'trade-list', panel);
      const trades = v.trades();
      if (!trades.length) el('div', 'dialogue', list, 'Nothing to trade right now.');
      const render = () => {
        list.innerHTML = '';
        for (const [cost, give] of trades) {
          const ok = cost.every(([n, c]) => p.inventory.count(I[n]) >= c);
          const row = el('div', 'trade' + (ok ? '' : ' no'), list);
          for (const [n, c] of cost) { const s = el('div', 'slot', row); ui.renderStackInto(s, { id: I[n], count: c }); }
          el('span', '', row, '&nbsp;➜&nbsp;').style.cssText = 'font-size:26px;color:#333';
          const s = el('div', 'slot', row); ui.renderStackInto(s, { id: I[give[0]], count: give[1] });
          el('span', '', row, ITEMS[I[give[0]]].label).style.cssText = 'font-size:20px;color:#303030;margin-left:6px';
          row.onmousedown = (e) => {
            e.stopPropagation();
            if (!cost.every(([n, c]) => p.inventory.count(I[n]) >= c)) { game.audio.play('click'); return; }
            for (const [n, c] of cost) p.inventory.remove(I[n], c);
            game.giveItem(I[give[0]], give[1]);
            game.audio.play('pickup');
            v.game.particles.sparkle(v.x, v.y + 2, v.z, [0.4, 1, 0.5], 6);
            p.xp += 1;
            render();
          };
        }
      };
      render();
      el('div', '', panel).style.height = '8px';
      ui.playerSlots(panel);
    });
    const close = ui.onScreenCloseOnce;
    ui._talkingVillager = v;
    void close;
  };
  const origClose = ui.closeScreen.bind(ui);
  ui.closeScreen = (silent) => {
    if (ui._talkingVillager) { ui._talkingVillager.talking = false; ui._talkingVillager = null; }
    origClose(silent);
  };
}
