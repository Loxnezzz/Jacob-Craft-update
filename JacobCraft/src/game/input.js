// Keyboard / mouse input with pointer lock and per-frame edge detection.

export const DEFAULT_BINDS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', sneak: 'ShiftLeft', sprint: 'ControlLeft',
  inventory: 'KeyE', drop: 'KeyQ', chat: 'KeyT', command: 'Slash',
  debug: 'F3', perspective: 'F5', hideHud: 'F1', screenshot: 'F2',
  recipes: 'KeyR', map: 'KeyM', journal: 'KeyJ', swap: 'KeyF',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0, buttons: 0, pressed: 0, released: 0, x: 0, y: 0 };
    this.binds = Object.assign({}, DEFAULT_BINDS);
    this.locked = false;
    this.sensitivity = 1;
    this.invertY = false;
    this.textFocus = false;
    this.onLockChange = null;
    this.typed = [];

    addEventListener('keydown', (e) => {
      if (this.textFocus) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab', 'F1', 'F3', 'F5', 'Slash'].includes(e.code) || (e.ctrlKey && ['KeyW', 'KeyS', 'KeyD'].includes(e.code))) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      this.typed.push(e);
    });
    addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    addEventListener('blur', () => { this.down.clear(); this.mouse.buttons = 0; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('contextmenu', (e) => { if (this.locked) e.preventDefault(); });
    addEventListener('mousedown', (e) => {
      const bit = 1 << e.button;
      this.mouse.buttons |= bit;
      this.mouse.pressed |= bit;
    });
    addEventListener('mouseup', (e) => {
      const bit = 1 << e.button;
      this.mouse.buttons &= ~bit;
      this.mouse.released |= bit;
    });
    addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (!this.locked) return;
      // ignore absurd spikes that some browsers emit on lock
      if (Math.abs(e.movementX) > 600 || Math.abs(e.movementY) > 600) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });
    addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.mouse.buttons = 0;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  lock() {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.canvas.requestPointerLock(); } catch (e) { /* ignore */ } });
    } catch (e) { try { this.canvas.requestPointerLock(); } catch (e2) { /* ignore */ } }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  is(action) { return this.down.has(this.binds[action]) || (action === 'sneak' && this.down.has('ShiftRight')) || (action === 'sprint' && this.down.has('ControlRight')); }
  was(action) { return this.pressed.has(this.binds[action]); }
  key(code) { return this.down.has(code); }
  keyPressed(code) { return this.pressed.has(code); }
  btn(i) { return (this.mouse.buttons >> i) & 1; }
  btnPressed(i) { return (this.mouse.pressed >> i) & 1; }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
    this.mouse.pressed = 0; this.mouse.released = 0;
    this.typed.length = 0;
  }
}
