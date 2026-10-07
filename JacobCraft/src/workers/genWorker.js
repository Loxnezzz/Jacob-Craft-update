import { WorldGen, computeLocalLight, computeHeightmap } from '../world/worldgen.js';

let gen = null;

self.onmessage = (e) => {
  try { handle(e.data); } catch (err) {
    const m = e.data;
    self.postMessage({ type: 'error', cx: m.cx, cz: m.cz, error: String(err && err.stack || err) });
  }
};

function handle(m) {
  if (m.type === 'init') {
    gen = new WorldGen(m.seed);
    return;
  }
  if (m.type === 'gen') {
    const r = gen.generate(m.cx, m.cz);
    self.postMessage({ type: 'chunk', cx: m.cx, cz: m.cz, blocks: r.blocks, meta: r.meta, light: r.light, biomes: r.biomes, tints: r.tints, heightmap: r.heightmap, structures: r.structures },
      [r.blocks.buffer, r.meta.buffer, r.light.buffer, r.biomes.buffer, r.tints.buffer, r.heightmap.buffer]);
    return;
  }
  if (m.type === 'restore') {
    // saved chunk: regenerate biome/tint data, keep saved blocks, recompute light
    const r = gen.generate(m.cx, m.cz);
    const light = computeLocalLight(m.blocks);
    const heightmap = computeHeightmap(m.blocks);
    self.postMessage({ type: 'chunk', cx: m.cx, cz: m.cz, blocks: m.blocks, meta: m.meta, light, biomes: r.biomes, tints: r.tints, heightmap, structures: [], restored: true },
      [m.blocks.buffer, m.meta.buffer, light.buffer, r.biomes.buffer, r.tints.buffer, heightmap.buffer]);
  }
}
