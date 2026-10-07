// Living details for the new furnishings: flames and smoke over braziers and hearths, chimney smoke, moths round a
// moth lantern, and wooden signs you can write on (the words show when you look at the sign).
import { B, BLOCKS } from '../world/blocks.js';

export function installDecor(game) {
  const ui = game.ui;
  const rnd = (a, b) => a + Math.random() * (b - a);

  game.blockFx = (fx, x, y, z) => {
    const P = game.particles;
    if (fx === 'brazier') {
      P.flame(x + 0.5 + rnd(-0.18, 0.18), y + 0.82, z + 0.5 + rnd(-0.18, 0.18));
      if (Math.random() < 0.6) P.ember(x + 0.5, y + 0.9, z + 0.5, 0.35);
      if (Math.random() < 0.5) P.smoke(x + 0.5, y + 1.3, z + 0.5, 1, 0.3);
    } else if (fx === 'hearth') {
      P.flame(x + 0.5 + rnd(-0.2, 0.2), y + 0.25, z + 0.45 + rnd(-0.1, 0.1));
      if (Math.random() < 0.4) P.ember(x + 0.5, y + 0.4, z + 0.45, 0.25);
    } else if (fx === 'chimney') {
      // only when there is a fire somewhere below (a hearth within a few blocks)
      let lit = false;
      for (let d = 1; d <= 8 && !lit; d++) for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (game.world.getBlock(x + dx, y - d, z + dz) === B.hearth) { lit = true; break; }
      if (lit || Math.random() < 0.15) for (let s = 0; s < 2; s++) P.smoke(x + 0.5 + rnd(-0.15, 0.15), y + 1.1 + s * 0.4, z + 0.5 + rnd(-0.15, 0.15), 1, 0.5);
    } else if (fx === 'moths') {
      if (Math.random() < 0.7) {
        const a = Math.random() * Math.PI * 2;
        P.add({ x: x + 0.5 + Math.cos(a) * 0.4, y: y + 0.5 + rnd(-0.2, 0.3), z: z + 0.5 + Math.sin(a) * 0.4, vx: -Math.sin(a) * 0.6, vy: rnd(-0.1, 0.2), vz: Math.cos(a) * 0.6, size: 0.04, r: 0.86, g: 0.9, b: 0.78, a: 0.9, a0: 0.9, fade: true, layer: -2, life: 1.6, drag: 0.5, emis: 1, light: 1 });
      }
    }
  };

  // ------------------------------------------------------------ signs
  const signEl = document.createElement('div'); signEl.id = 'signText'; ui.hud.appendChild(signEl);
  let shownKey = null;
  game.editSign = (x, y, z) => {
    const tile = game.getTile(x, y, z, 'sign');
    ui.openScreen('sign', (root) => {
      const panel = document.createElement('div'); panel.className = 'panel signEdit'; root.appendChild(panel);
      const h = document.createElement('h3'); h.textContent = 'Write on the sign'; panel.appendChild(h);
      const ta = document.createElement('textarea'); ta.maxLength = 90; ta.rows = 3; ta.value = tile.text || ''; ta.placeholder = 'Home sweet home…';
      panel.appendChild(ta);
      const done = document.createElement('button'); done.className = 'btn'; done.textContent = 'Done'; panel.appendChild(done);
      ta.addEventListener('focus', () => { game.input.textFocus = true; });
      ta.addEventListener('blur', () => { game.input.textFocus = false; });
      ta.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); done.click(); } if (e.key === 'Escape') done.click(); });
      done.addEventListener('mousedown', (e) => e.stopPropagation());
      done.onclick = () => { tile.text = ta.value.trim().slice(0, 90); game.input.textFocus = false; ui.closeScreen(); shownKey = null; };
      setTimeout(() => ta.focus(), 30);
    });
  };
  const prevPlaced = game.onBlockPlaced;
  game.onBlockPlaced = (...a) => {
    prevPlaced && prevPlaced(...a);
    const [x, y, z, id] = a;
    if (id === B.wooden_sign && typeof x === 'number') setTimeout(() => game.editSign(x, y, z), 60);
  };
  const prevHud = ui.updateHUD.bind(ui);
  ui.updateHUD = (dt) => {
    prevHud(dt);
    const t = game.interaction && game.interaction.target;
    let key = null, text = '';
    if (t && t.type === 'block' && t.id === B.wooden_sign && !ui.screen) {
      const tile = game.tiles.get(t.x + ',' + t.y + ',' + t.z);
      if (tile && tile.text) { key = t.x + ',' + t.y + ',' + t.z; text = tile.text; }
    }
    if (key !== shownKey) {
      shownKey = key;
      signEl.textContent = text;
      signEl.classList.toggle('on', !!key);
    }
  };
  void BLOCKS;
}
