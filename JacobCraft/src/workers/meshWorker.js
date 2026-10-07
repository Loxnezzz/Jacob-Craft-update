import { meshChunk } from '../world/mesher.js';

self.onmessage = (e) => {
  const m = e.data;
  let r;
  try {
    r = meshChunk(m.pb, m.pm, m.pl, m.pt);
  } catch (err) {
    // report instead of dying silently so the chunk can be retried and the bug is visible
    self.postMessage({ key: m.key, ver: m.ver, error: String(err && err.stack || err) });
    return;
  }
  self.postMessage({ key: m.key, ver: m.ver, opaque: r.opaque, opaqueCount: r.opaqueCount, trans: r.trans, transCount: r.transCount, minY: r.minY, maxY: r.maxY },
    [r.opaque, r.trans]);
};
