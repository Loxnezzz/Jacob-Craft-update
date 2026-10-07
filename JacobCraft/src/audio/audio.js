// Procedural audio engine. Everything is synthesized at runtime — no external sound files.
import { BLOCKS } from '../world/blocks.js';

const MAT = {
  stone: { f: 2400, q: 1.2, type: 'bandpass', dur: 0.09, tone: 0, gain: 0.7 },
  wood: { f: 700, q: 2.5, type: 'bandpass', dur: 0.12, tone: 180, gain: 0.8 },
  grass: { f: 3200, q: 0.6, type: 'highpass', dur: 0.14, tone: 0, gain: 0.45 },
  gravel: { f: 1300, q: 0.9, type: 'bandpass', dur: 0.13, tone: 0, gain: 0.7, grain: true },
  sand: { f: 2600, q: 0.5, type: 'bandpass', dur: 0.16, tone: 0, gain: 0.4 },
  snow: { f: 1800, q: 1.4, type: 'bandpass', dur: 0.14, tone: 0, gain: 0.5, grain: true },
  glass: { f: 4200, q: 3, type: 'bandpass', dur: 0.12, tone: 1800, gain: 0.5 },
  metal: { f: 3000, q: 4, type: 'bandpass', dur: 0.1, tone: 950, gain: 0.5, ring: true },
  cloth: { f: 900, q: 0.7, type: 'lowpass', dur: 0.12, tone: 0, gain: 0.45 },
  mud: { f: 400, q: 1.5, type: 'lowpass', dur: 0.16, tone: 90, gain: 0.6 },
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = 0.8; this.musicVol = 0.45; this.sfxVol = 1; this.ambVol = 0.8;
    this.listener = [0, 0, 0];
    this.loops = {};
    this.musicTimer = 40 + Math.random() * 60;
    this.ambientTimer = 2;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { this.enabled = false; return; }
    const c = this.ctx;
    this.out = c.createGain(); this.out.gain.value = this.master;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    this.out.connect(comp); comp.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = this.sfxVol; this.sfx.connect(this.out);
    this.amb = c.createGain(); this.amb.gain.value = this.ambVol; this.amb.connect(this.out);
    this.mus = c.createGain(); this.mus.gain.value = this.musicVol; this.mus.connect(this.out);
    // reverb for music / caves
    this.verb = c.createConvolver();
    this.verb.buffer = this.makeImpulse(2.6, 2.2);
    const vg = c.createGain(); vg.gain.value = 0.5;
    this.verb.connect(vg); vg.connect(this.out);
    this.white = this.makeNoise('white');
    this.pink = this.makeNoise('pink');
    this.brown = this.makeNoise('brown');
    // continuous loops
    this.loops.rain = this.makeLoop(this.pink, 'bandpass', 2600, 0.5);
    this.loops.rainHeavy = this.makeLoop(this.brown, 'lowpass', 900, 0.5);
    this.loops.wind = this.makeLoop(this.brown, 'bandpass', 400, 1.2);
    this.loops.water = this.makeLoop(this.pink, 'bandpass', 900, 0.8);
    this.loops.lava = this.makeLoop(this.brown, 'lowpass', 300, 0.7);
    this.loops.fire = this.makeLoop(this.white, 'highpass', 2500, 0.4);
    this.loops.surf = this.makeLoop(this.brown, 'lowpass', 520, 0.7);
    this.loops.leaves = this.makeLoop(this.pink, 'highpass', 2600, 0.5);
    this.loops.insects = this.makeLoop(this.white, 'bandpass', 4700, 9);
    this.loops.cave = this.makeLoop(this.brown, 'lowpass', 95, 0.8);
    this.loops.whistle = this.makeLoop(this.white, 'bandpass', 900, 18);
  }

  setVolumes(master, music, sfx, amb) {
    this.master = master; this.musicVol = music; if (sfx !== undefined) this.sfxVol = sfx; if (amb !== undefined) this.ambVol = amb;
    if (!this.ctx) return;
    this.out.gain.value = master; this.mus.gain.value = music; this.sfx.gain.value = this.sfxVol; this.amb.gain.value = this.ambVol;
  }

  makeNoise(kind) {
    const c = this.ctx, len = c.sampleRate * 3;
    const b = c.createBuffer(1, len, c.sampleRate);
    const d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w * 0.5;
      else if (kind === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
    return b;
  }

  makeImpulse(dur, decay) {
    const c = this.ctx, len = c.sampleRate * dur;
    const b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  makeLoop(buf, ftype, freq, q) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    src.loopStart = Math.random();
    const f = c.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.amb);
    src.start(0, Math.random() * 2);
    return { src, f, g, base: freq };
  }

  setLoop(name, vol, freq) {
    const l = this.loops[name];
    if (!l) return;
    const t = this.ctx.currentTime;
    l.g.gain.setTargetAtTime(vol, t, 0.3);
    if (freq) l.f.frequency.setTargetAtTime(freq, t, 0.3);
  }

  // spatial helper: returns a node chain endpoint for a world position
  spatial(pos, dest, range = 24) {
    const c = this.ctx;
    if (!pos) return dest;
    const dx = pos.x - this.listener[0], dy = pos.y - this.listener[1], dz = pos.z - this.listener[2];
    const dist = Math.hypot(dx, dy, dz);
    const g = c.createGain();
    g.gain.value = Math.max(0, 1 - dist / range) ** 1.5;
    if (g.gain.value <= 0.001) return null;
    const pan = c.createStereoPanner();
    // project onto listener right vector
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    pan.pan.value = Math.max(-1, Math.min(1, (dx * rx + dz * rz) / Math.max(1, dist) * 0.9));
    g.connect(pan); pan.connect(dest);
    return g;
  }

  noise(opts, pos) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, t = c.currentTime + (opts.delay || 0);
    const dest = this.spatial(pos, opts.dest || this.sfx, opts.range);
    if (!dest) return;
    const src = c.createBufferSource();
    src.buffer = opts.buf || this.white;
    src.playbackRate.value = opts.rate || 1;
    const f = c.createBiquadFilter();
    f.type = opts.type || 'bandpass'; f.frequency.value = opts.f || 1000; f.Q.value = opts.q || 1;
    if (opts.fEnd) f.frequency.exponentialRampToValueAtTime(opts.fEnd, t + opts.dur);
    const g = c.createGain();
    const a = opts.attack || 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain || 0.5, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    src.connect(f); f.connect(g); g.connect(dest);
    if (opts.verb) g.connect(this.verb);
    src.start(t, Math.random() * 2, opts.dur + 0.1);
  }

  tone(opts, pos) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, t = c.currentTime + (opts.delay || 0);
    const dest = this.spatial(pos, opts.dest || this.sfx, opts.range);
    if (!dest) return;
    const o = c.createOscillator();
    o.type = opts.wave || 'sine';
    o.frequency.setValueAtTime(opts.f, t);
    if (opts.fEnd) o.frequency.exponentialRampToValueAtTime(opts.fEnd, t + opts.dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain || 0.3, t + (opts.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    o.connect(g);
    if (opts.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lp; g.connect(f); f.connect(dest); }
    else g.connect(dest);
    if (opts.verb) g.connect(this.verb);
    o.start(t); o.stop(t + opts.dur + 0.05);
  }

  matOf(id) { const s = BLOCKS[id] ? BLOCKS[id].sound : 'stone'; return MAT[s] ? s : 'stone'; }

  blockSound(id, kind, x, y, z) {
    if (!this.ctx) return;
    const m = MAT[this.matOf(id)];
    const pos = { x: x + 0.5, y: y + 0.5, z: z + 0.5 };
    const vol = kind === 'break' ? 1 : kind === 'place' ? 0.8 : kind === 'hit' ? 0.35 : 0.25;
    const dur = m.dur * (kind === 'break' ? 1.6 : kind === 'hit' ? 0.7 : 1);
    const pitch = 0.85 + Math.random() * 0.3;
    this.noise({ f: m.f * pitch, q: m.q, type: m.type, dur, gain: m.gain * vol, buf: m.grain ? this.white : this.pink }, pos);
    if (m.grain && kind !== 'hit') this.noise({ f: m.f * 0.7 * pitch, q: m.q, type: m.type, dur: dur * 0.7, gain: m.gain * vol * 0.6, delay: 0.04 }, pos);
    if (m.tone) this.tone({ f: m.tone * pitch, fEnd: m.tone * 0.7, dur: dur * (m.ring ? 3 : 1), gain: 0.18 * vol, wave: m.ring ? 'triangle' : 'sine' }, pos);
    if (kind === 'break' && (BLOCKS[id].sound === 'glass')) {
      for (let i = 0; i < 5; i++) this.tone({ f: 2000 + Math.random() * 3000, dur: 0.15 + Math.random() * 0.2, gain: 0.08, delay: Math.random() * 0.12, wave: 'triangle' }, pos);
    }
  }

  step(player, jump) {
    if (!this.ctx) return;
    const w = player.game.world;
    let id = w.getBlock(Math.floor(player.x), Math.floor(player.y - 0.2), Math.floor(player.z));
    const above = w.getBlock(Math.floor(player.x), Math.floor(player.y), Math.floor(player.z));
    if (above && BLOCKS[above].shape === 11) id = above; // snow layer
    if (!id) return;
    if (player.liquid.inWater) { this.noise({ f: 900, q: 0.8, dur: 0.25, gain: 0.25, buf: this.pink }); return; }
    const m = MAT[this.matOf(id)];
    const sneakVol = player.sneaking ? 0.35 : 1;
    this.noise({ f: m.f * (0.8 + Math.random() * 0.3), q: m.q, type: m.type, dur: m.dur * 0.9, gain: m.gain * 0.32 * sneakVol * (jump ? 1.3 : 1), buf: m.grain ? this.white : this.pink });
    if (m.tone) this.tone({ f: m.tone * (0.9 + Math.random() * 0.2), dur: 0.06, gain: 0.05 * sneakVol });
  }

  cap(name, pos) { if (this.onCaption) this.onCaption(name, pos); }

  play(name, pos, pitch = 1) {
    if (!this.ctx || !this.enabled) return;
    this.cap(name, pos);
    const r = () => (0.9 + Math.random() * 0.2) * pitch;
    switch (name) {
      case 'click': this.tone({ f: 1400, dur: 0.03, gain: 0.08, wave: 'square', lp: 3000 }); break;
      case 'pickup': this.tone({ f: 600 * r(), fEnd: 1300, dur: 0.09, gain: 0.12, wave: 'triangle' }, pos); break;
      case 'craft': this.noise({ f: 1800, q: 1, dur: 0.1, gain: 0.2 }); this.tone({ f: 500, dur: 0.06, gain: 0.08, delay: 0.05 }); break;
      case 'eat': this.noise({ f: 1600 * r(), q: 2, dur: 0.07, gain: 0.25, buf: this.white }); break;
      case 'burp': this.tone({ f: 180, fEnd: 90, dur: 0.25, gain: 0.25, wave: 'sawtooth', lp: 600 }); break;
      case 'hurt': this.tone({ f: 260 * r(), fEnd: 150, dur: 0.18, gain: 0.35, wave: 'sawtooth', lp: 900 }); this.noise({ f: 600, q: 1, dur: 0.12, gain: 0.25 }); break;
      case 'death': this.tone({ f: 300, fEnd: 70, dur: 0.9, gain: 0.35, wave: 'sawtooth', lp: 800 }); break;
      case 'door_open': this.tone({ f: 320, fEnd: 480, dur: 0.25, gain: 0.12, wave: 'sawtooth', lp: 1200 }, pos); this.noise({ f: 600, q: 2, dur: 0.12, gain: 0.3, delay: 0.18 }, pos); break;
      case 'door_close': this.noise({ f: 500, q: 2, dur: 0.15, gain: 0.45 }, pos); this.tone({ f: 140, dur: 0.12, gain: 0.25 }, pos); break;
      case 'chest_open': this.tone({ f: 220, fEnd: 330, dur: 0.35, gain: 0.12, wave: 'sawtooth', lp: 900 }, pos); break;
      case 'bucket_fill': case 'bucket_empty': this.noise({ f: 900, fEnd: name === 'bucket_fill' ? 2000 : 500, q: 1.5, dur: 0.4, gain: 0.4, buf: this.pink }, pos); break;
      case 'bucket_lava': case 'bucket_empty_lava': this.noise({ f: 400, q: 1, dur: 0.5, gain: 0.4, buf: this.brown }, pos); break;
      case 'break_tool': this.noise({ f: 3000, q: 2, dur: 0.25, gain: 0.4, buf: this.white }); this.tone({ f: 900, fEnd: 300, dur: 0.2, gain: 0.15, wave: 'square', lp: 2500 }); break;
      case 'ignite': this.noise({ f: 1500, fEnd: 400, q: 0.7, dur: 0.4, gain: 0.35 }, pos); break;
      case 'fizz': this.noise({ f: 4000, q: 0.5, type: 'highpass', dur: 0.6, gain: 0.3 }, pos); break;
      case 'splash': this.noise({ f: 1200, fEnd: 400, q: 0.8, dur: 0.5, gain: 0.45, buf: this.pink }, pos); break;
      case 'swing': this.noise({ f: 1400, fEnd: 600, q: 0.8, dur: 0.12, gain: 0.08 }); break;
      case 'hit': this.noise({ f: 700, q: 1.2, dur: 0.1, gain: 0.45 }, pos); this.tone({ f: 120, dur: 0.08, gain: 0.25 }, pos); break;
      case 'crit': this.noise({ f: 2400, q: 2, dur: 0.12, gain: 0.35 }, pos); break;
      case 'bow': this.tone({ f: 400, fEnd: 200, dur: 0.18, gain: 0.2, wave: 'triangle' }); this.noise({ f: 2000, q: 1, dur: 0.15, gain: 0.15 }); break;
      case 'arrow_hit': this.noise({ f: 1100, q: 3, dur: 0.08, gain: 0.3 }, pos); break;
      case 'levelup': [523, 659, 784, 1046].forEach((f, i) => this.tone({ f, dur: 0.25, gain: 0.12, wave: 'triangle', delay: i * 0.08 })); break;
      case 'magic': for (let i = 0; i < 6; i++) this.tone({ f: 800 + i * 220, dur: 0.3, gain: 0.07, wave: 'sine', delay: i * 0.03, verb: true }, pos); break;
      case 'explode': {
        const R = 96;
        this.noise({ f: 2600, q: 0.4, type: 'highpass', dur: 0.14, gain: 0.9, buf: this.white, range: R }, pos);
        this.noise({ f: 320, fEnd: 45, q: 0.5, type: 'lowpass', dur: 2.4, gain: 1.0, buf: this.brown, range: R }, pos);
        this.tone({ f: 55, fEnd: 26, dur: 1.4, gain: 0.7, wave: 'sine', range: R }, pos);
        this.noise({ f: 900, fEnd: 200, q: 0.6, type: 'lowpass', dur: 1.8, gain: 0.5, delay: 0.05, buf: this.pink, verb: true, range: R }, pos);
        for (let i = 0; i < 9; i++) this.noise({ f: 1400 + Math.random() * 2400, q: 2.5, dur: 0.05 + Math.random() * 0.05, gain: 0.12, delay: 0.25 + Math.random() * 1.3, range: 40 }, pos);
        break;
      }
      case 'fuse': this.noise({ f: 4800, q: 0.5, type: 'highpass', dur: 1.6, gain: 0.16, attack: 0.05 }, pos); for (let i = 0; i < 6; i++) this.noise({ f: 3000, q: 3, dur: 0.02, gain: 0.12, delay: Math.random() * 1.4 }, pos); break;
      case 'bow_draw': this.tone({ f: 170 * r(), fEnd: 250 * r(), dur: 0.55, gain: 0.05, wave: 'sawtooth', lp: 900, attack: 0.08 }); this.noise({ f: 1200, q: 4, dur: 0.4, gain: 0.04, attack: 0.1 }); break;
      case 'crank': this.noise({ f: 3200 * r(), q: 6, dur: 0.03, gain: 0.22 }); this.tone({ f: 900 * r(), dur: 0.02, gain: 0.05, wave: 'square', lp: 3000, delay: 0.04 }); break;
      case 'crossbow_loaded': this.noise({ f: 1800, q: 3, dur: 0.06, gain: 0.4 }); this.tone({ f: 300, dur: 0.08, gain: 0.15, wave: 'triangle' }); this.noise({ f: 2600, q: 5, dur: 0.04, gain: 0.25, delay: 0.09 }); break;
      case 'crossbow_fire': this.noise({ f: 900, fEnd: 300, q: 1, dur: 0.16, gain: 0.6 }); this.tone({ f: 220, fEnd: 90, dur: 0.15, gain: 0.3, wave: 'triangle' }); this.tone({ f: 520 * r(), dur: 0.3, gain: 0.1, wave: 'triangle' }); break;
      case 'powder_pour': this.noise({ f: 5200, q: 0.6, type: 'highpass', dur: 0.55, gain: 0.12, attack: 0.08, buf: this.white }); break;
      case 'ramrod': for (let i = 0; i < 2; i++) this.noise({ f: 2400 * r(), q: 5, dur: 0.09, gain: 0.25, delay: i * 0.14 }); this.tone({ f: 1300, fEnd: 900, dur: 0.12, gain: 0.04, wave: 'triangle', delay: 0.14 }); break;
      case 'gun_cock': this.noise({ f: 2800, q: 5, dur: 0.035, gain: 0.45 }); this.noise({ f: 2200, q: 5, dur: 0.04, gain: 0.5, delay: 0.11 }); this.tone({ f: 1500, dur: 0.03, gain: 0.06, wave: 'square', lp: 4000, delay: 0.11 }); break;
      case 'gunshot':
        this.noise({ f: 1800, q: 0.4, type: 'highpass', dur: 0.09, gain: 1.0, buf: this.white, range: 80 }, pos);
        this.noise({ f: 520, fEnd: 70, q: 0.5, type: 'lowpass', dur: 1.0, gain: 0.85, buf: this.brown, range: 80 }, pos);
        this.tone({ f: 80, fEnd: 36, dur: 0.45, gain: 0.5, wave: 'sine', range: 80 }, pos);
        this.noise({ f: 700, q: 0.5, type: 'lowpass', dur: 1.6, gain: 0.25, delay: 0.08, buf: this.pink, verb: true, range: 80 }, pos);
        break;
      case 'blunderbuss':
        this.noise({ f: 1400, q: 0.4, type: 'highpass', dur: 0.12, gain: 1.0, buf: this.white, range: 90 }, pos);
        this.noise({ f: 380, fEnd: 50, q: 0.5, type: 'lowpass', dur: 1.5, gain: 1.0, buf: this.brown, range: 90 }, pos);
        this.tone({ f: 62, fEnd: 28, dur: 0.7, gain: 0.65, wave: 'sine', range: 90 }, pos);
        this.noise({ f: 600, q: 0.5, type: 'lowpass', dur: 2.0, gain: 0.3, delay: 0.1, buf: this.pink, verb: true, range: 90 }, pos);
        break;
      case 'ricochet': this.tone({ f: 2600 * r(), fEnd: 1500, dur: 0.2, gain: 0.05, wave: 'sine' }, pos); this.noise({ f: 3000, q: 2, dur: 0.05, gain: 0.25 }, pos); break;
      case 'spear_throw': this.noise({ f: 600, fEnd: 1900, q: 0.8, dur: 0.3, gain: 0.28 }); break;
      case 'sweep': this.noise({ f: 2200, fEnd: 700, q: 0.7, dur: 0.24, gain: 0.3 }, pos); break;
      case 'mace_smash': this.noise({ f: 300, q: 0.7, type: 'lowpass', dur: 0.55, gain: 0.95, buf: this.brown }, pos); this.tone({ f: 62, fEnd: 38, dur: 0.45, gain: 0.55 }, pos); this.noise({ f: 1300, q: 1, dur: 0.35, gain: 0.25, delay: 0.06 }, pos); break;
      case 'backstab': this.noise({ f: 3600, q: 2, dur: 0.08, gain: 0.35 }, pos); this.tone({ f: 1250, fEnd: 600, dur: 0.12, gain: 0.08, wave: 'triangle' }, pos); break;
      case 'hit_blade': this.noise({ f: 3300 * r(), q: 2.2, dur: 0.07, gain: 0.32 }, pos); this.tone({ f: 1900 * r(), dur: 0.05, gain: 0.04, wave: 'triangle' }, pos); break;
      case 'hit_blunt': this.noise({ f: 420, q: 1, type: 'lowpass', dur: 0.16, gain: 0.6, buf: this.brown }, pos); this.tone({ f: 95 * r(), dur: 0.12, gain: 0.35 }, pos); break;
      case 'hit_pierce': this.noise({ f: 1500 * r(), q: 3, dur: 0.06, gain: 0.4 }, pos); this.tone({ f: 420, fEnd: 200, dur: 0.06, gain: 0.12, wave: 'triangle' }, pos); break;
      case 'roar': this.tone({ f: 110, fEnd: 60, dur: 1.2, gain: 0.5, wave: 'sawtooth', lp: 500 }, pos); this.noise({ f: 300, q: 0.7, dur: 1.2, gain: 0.5, buf: this.brown }, pos); break;
      case 'thunder_close': this.thunder(0.15); break;
      case 'xp': this.tone({ f: 1320 * r(), fEnd: 1760 * r(), dur: 0.12, gain: 0.05, wave: 'sine' }); this.tone({ f: 2640 * r(), dur: 0.08, gain: 0.02, wave: 'sine', delay: 0.03 }); break;
      case 'enchant': for (let i = 0; i < 9; i++) this.tone({ f: 600 + Math.random() * 1400, dur: 0.5 + Math.random() * 0.4, gain: 0.05, wave: 'triangle', delay: i * 0.05, verb: true }, pos); this.noise({ f: 6000, q: 0.5, type: 'highpass', dur: 0.8, gain: 0.05, attack: 0.2 }, pos); break;
      case 'brew_done': for (let i = 0; i < 4; i++) this.tone({ f: 420 + i * 160, fEnd: 700 + i * 160, dur: 0.18, gain: 0.06, wave: 'sine', delay: i * 0.07 }, pos); this.noise({ f: 900, q: 2, dur: 0.4, gain: 0.12, buf: this.pink }, pos); break;
      case 'sizzle': this.noise({ f: 5200, q: 0.6, type: 'highpass', dur: 0.7, gain: 0.08, attack: 0.05 }, pos); for (let i = 0; i < 4; i++) this.noise({ f: 3800, q: 4, dur: 0.02, gain: 0.08, delay: Math.random() * 0.6 }, pos); break;
      case 'rumble': this.noise({ f: 140, q: 0.7, type: 'lowpass', dur: 1.4, gain: 0.45, attack: 0.15, buf: this.brown, verb: true }, pos); break;
      case 'husk_rasp': this.noise({ f: 900 * r(), q: 1.4, dur: 0.6, gain: 0.25, attack: 0.08, buf: this.pink, verb: true }, pos); this.tone({ f: 70 * r(), fEnd: 52, dur: 0.6, gain: 0.18, wave: 'sawtooth', lp: 400 }, pos); break;
      case 'husk_roar': for (const [f, d] of [[92, 0], [98, 0.03], [138, 0.06]]) this.tone({ f: f * r(), fEnd: f * 0.7, dur: 1.5, gain: 0.12, wave: 'sawtooth', lp: 900, attack: 0.1, delay: d, verb: true, range: 60 }, pos); this.noise({ f: 600, q: 0.8, dur: 1.4, gain: 0.25, attack: 0.1, buf: this.pink, verb: true, range: 60 }, pos); break;
      case 'tomb_wind': this.noise({ f: 300 + Math.random() * 300, fEnd: 200, q: 3, dur: 3.5, gain: 0.06, attack: 1.2, verb: true, dest: this.amb }); break;
      case 'tomb_hum': this.tone({ f: 55, dur: 4, gain: 0.05, wave: 'sine', attack: 1.5, verb: true, dest: this.amb }); this.tone({ f: 82.4, dur: 4, gain: 0.025, wave: 'sine', attack: 1.8, verb: true, dest: this.amb }); break;
      case 'gloom_tp': this.noise({ f: 300, fEnd: 2400, q: 2, dur: 0.35, gain: 0.22, attack: 0.25, verb: true }, pos); this.tone({ f: 55 * r(), fEnd: 38, dur: 0.6, gain: 0.3, wave: 'sine', attack: 0.05, verb: true }, pos); this.tone({ f: 880 * r(), fEnd: 1760, dur: 0.12, gain: 0.03, wave: 'sine', delay: 0.28 }, pos); break;
      case 'gloom_scream': {
        // two voices a semitone apart sliding down, a breathy rasp and a low rumble under it
        for (const [f, d] of [[410, 0], [434, 0.02], [612, 0.05]]) this.tone({ f: f * r(), fEnd: f * 0.55, dur: 1.1, gain: 0.07, wave: 'sawtooth', lp: 2600, attack: 0.04, delay: d, verb: true, range: 60 }, pos);
        this.noise({ f: 1800, q: 1.2, dur: 1.0, gain: 0.18, attack: 0.05, verb: true, range: 60 }, pos);
        this.tone({ f: 48, fEnd: 36, dur: 1.2, gain: 0.22, wave: 'sine', attack: 0.1, range: 60 }, pos);
        break;
      }
      case 'moth_flutter': for (let i = 0; i < 7; i++) this.noise({ f: 900 + Math.random() * 900, q: 3, dur: 0.05 + Math.random() * 0.05, gain: 0.05, delay: i * 0.045 + Math.random() * 0.03, range: 40 }, pos); break;
      case 'wick_chime': [1046, 1318, 1568, 1244].forEach((f, i) => this.tone({ f: f * (0.995 + Math.random() * 0.01), dur: 1.6, gain: 0.018, wave: 'sine', attack: 0.01, delay: i * 0.42, verb: true, range: 80 }, pos)); break;
      case 'horse_jump': this.noise({ f: 700 * r(), q: 0.8, type: 'lowpass', dur: 0.22, gain: 0.3, buf: this.brown }, pos); this.noise({ f: 1600 * r(), q: 1.5, dur: 0.18, gain: 0.08, delay: 0.04 }, pos); this.tone({ f: 120 * r(), fEnd: 80, dur: 0.1, gain: 0.25, wave: 'sine' }, pos); break;
      case 'horse_land': for (let i = 0; i < 2; i++) { this.noise({ f: 260 * r(), q: 1, type: 'lowpass', dur: 0.12, gain: 0.55, buf: this.brown, delay: i * 0.07 }, pos); this.tone({ f: 85 * r(), fEnd: 50, dur: 0.1, gain: 0.35, wave: 'sine', delay: i * 0.07 }, pos); } break;
      case 'hoof': {
        // clip-clop: a hollow knock, brighter on stone and wood, muffled on grass, dirt and sand
        const sb = pos && pos.surf ? BLOCKS[pos.surf] : null, hard = sb && (sb.sound === 'stone' || sb.sound === 'wood' || sb.sound === 'metal');
        const soft = sb && (sb.sound === 'sand' || sb.sound === 'snow' || sb.sound === 'cloth');
        const gl = pos && pos.gallop ? 1.25 : 1;
        this.tone({ f: (hard ? 520 : 230) * r(), fEnd: hard ? 380 : 150, dur: 0.045, gain: (soft ? 0.08 : 0.16) * gl, wave: 'triangle' }, pos);
        this.noise({ f: hard ? 2400 * r() : 900 * r(), q: hard ? 4 : 1.2, type: hard ? 'bandpass' : 'lowpass', dur: 0.035, gain: (soft ? 0.12 : 0.2) * gl, buf: hard ? undefined : this.brown }, pos);
        break;
      }
      case 'launcher_fire': this.noise({ f: 260 * r(), q: 1.2, type: 'lowpass', dur: 0.32, gain: 0.85, buf: this.brown }, pos); this.tone({ f: 120 * r(), fEnd: 55, dur: 0.22, gain: 0.5, wave: 'sine' }, pos); this.noise({ f: 3200 * r(), q: 2, dur: 0.18, gain: 0.12, delay: 0.05 }, pos); break;
      case 'thud': this.noise({ f: 300 * r(), q: 1, type: 'lowpass', dur: 0.1, gain: 0.35, buf: this.brown }, pos); this.tone({ f: 90 * r(), fEnd: 60, dur: 0.08, gain: 0.25, wave: 'sine' }, pos); break;
      case 'shield_block': this.noise({ f: 420 * r(), q: 1.4, type: 'lowpass', dur: 0.14, gain: 0.5, buf: this.brown }, pos); this.noise({ f: 1900 * r(), q: 3, dur: 0.05, gain: 0.18 }, pos); this.tone({ f: 150 * r(), fEnd: 95, dur: 0.12, gain: 0.22, wave: 'triangle' }, pos); break;
      case 'armor_hit': this.noise({ f: 2600, q: 5, dur: 0.12, gain: 0.25 }); this.tone({ f: 880 * r(), fEnd: 700, dur: 0.18, gain: 0.07, wave: 'triangle' }); break;
      case 'flutter': for (let i = 0; i < 7; i++) this.noise({ f: 900 * r(), q: 1.2, dur: 0.03, gain: 0.1, delay: i * 0.033 }, pos); break;
      case 'legendary': [784, 988, 1175, 1568].forEach((f, i) => this.tone({ f, dur: 0.6, gain: 0.07, wave: 'triangle', delay: i * 0.07, verb: true })); this.noise({ f: 7000, q: 0.5, type: 'highpass', dur: 0.8, gain: 0.04, attack: 0.1 }); break;
      case 'boss_sting': this.tone({ f: 55, fEnd: 41, dur: 2.2, gain: 0.5, wave: 'sawtooth', lp: 400, dest: this.mus }); this.noise({ f: 200, q: 0.6, type: 'lowpass', dur: 1.6, gain: 0.5, buf: this.brown, dest: this.mus }); [110, 131, 165].forEach((f, i) => this.tone({ f, dur: 2.5, gain: 0.06, wave: 'sawtooth', lp: 900, attack: 0.3, delay: 0.1 * i, dest: this.mus, verb: true })); break;
      case 'victory': [[523, 0], [659, 0.18], [784, 0.36], [1046, 0.54]].forEach(([f, d]) => this.tone({ f, dur: 0.5, gain: 0.1, wave: 'triangle', delay: d, dest: this.mus, verb: true })); [523, 659, 784, 1046].forEach(f => this.tone({ f, dur: 2.6, gain: 0.05, wave: 'sine', delay: 0.75, attack: 0.05, dest: this.mus, verb: true })); break;
      case 'drink': this.noise({ f: 600 * r(), q: 3, dur: 0.09, gain: 0.25, buf: this.pink }); this.tone({ f: 300 * r(), fEnd: 220, dur: 0.08, gain: 0.08 }); break;
      default: break;
    }
  }

  thunder(dist) {
    if (!this.ctx) return;
    this.cap('thunder', null);
    const near = Math.max(0, 1 - dist / 220);
    const delay = dist / 340;
    if (near > 0.6) this.noise({ f: 3000, q: 0.4, type: 'highpass', dur: 0.35, gain: 0.8 * near, delay, buf: this.white, dest: this.amb });
    this.noise({ f: 260 + near * 300, fEnd: 50, q: 0.6, type: 'lowpass', dur: 3.5 + Math.random() * 2, gain: 0.55 + near * 0.4, attack: 0.05 + (1 - near) * 0.4, delay, buf: this.brown, dest: this.amb });
    this.noise({ f: 120, q: 0.5, type: 'lowpass', dur: 5, gain: 0.45, attack: 0.6, delay: delay + 0.3, buf: this.brown, dest: this.amb });
  }

  // songbirds and other wild birds
  bird(kind, pos, vol = 1) {
    if (!this.ctx) return;
    this.cap('bird', pos);
    const r = () => 0.92 + Math.random() * 0.16;
    const D = this.amb;
    switch (kind) {
      case 'sparrow': { const n = 2 + (Math.random() * 3 | 0); for (let i = 0; i < n; i++) this.tone({ f: 3200 * r(), fEnd: 4200 * r(), dur: 0.06, gain: 0.045 * vol, delay: i * 0.11, dest: D }, pos); break; }
      case 'robin': { const notes = [2200, 2600, 2900, 3300, 2500, 3100]; let d = 0; const n = 5 + (Math.random() * 3 | 0); for (let i = 0; i < n; i++) { const f = notes[(Math.random() * notes.length) | 0] * r(); const du = 0.08 + Math.random() * 0.08; this.tone({ f, fEnd: f * (0.9 + Math.random() * 0.25), dur: du, gain: 0.04 * vol, delay: d, dest: D }, pos); d += du + 0.03; } break; }
      case 'bluebird': for (let i = 0; i < 3; i++) this.tone({ f: (1600 + i * 280) * r(), fEnd: (2100 + i * 200) * r(), dur: 0.24, gain: 0.035 * vol, delay: i * 0.3, attack: 0.04, dest: D }, pos); break;
      case 'finch': for (let i = 0; i < 10; i++) this.tone({ f: (3800 + Math.random() * 700), dur: 0.035, gain: 0.03 * vol, delay: i * 0.045, dest: D }, pos); this.tone({ f: 4800, fEnd: 3600, dur: 0.12, gain: 0.03 * vol, delay: 0.47, dest: D }, pos); break;
      case 'parrot': for (let i = 0; i < 2; i++) this.tone({ f: 1400 * r(), fEnd: 2200 * r(), dur: 0.16, gain: 0.05 * vol, wave: 'sawtooth', lp: 3500, delay: i * 0.22, dest: D }, pos); break;
      case 'crow': { const n = 2 + (Math.random() * 2 | 0); for (let i = 0; i < n; i++) this.tone({ f: 540 * r(), fEnd: 420 * r(), dur: 0.22, gain: 0.1 * vol, wave: 'sawtooth', lp: 1600, delay: i * 0.36, dest: D }, pos); break; }
      case 'gull': for (let i = 0; i < 3; i++) { this.tone({ f: 1050 * r(), fEnd: 1500 * r(), dur: 0.12, gain: 0.06 * vol, wave: 'sawtooth', lp: 2600, delay: i * 0.3, dest: D }, pos); this.tone({ f: 1500 * r(), fEnd: 900, dur: 0.16, gain: 0.05 * vol, wave: 'sawtooth', lp: 2600, delay: i * 0.3 + 0.12, dest: D }, pos); } break;
      case 'hawk': this.tone({ f: 2700 * r(), fEnd: 1700, dur: 0.95, gain: 0.05 * vol, wave: 'sawtooth', lp: 3300, attack: 0.06, dest: D, verb: true }, pos); break;
      case 'owl': this.tone({ f: 390 * r(), fEnd: 370, dur: 0.38, gain: 0.07 * vol, attack: 0.06, dest: D, verb: true }, pos); this.tone({ f: 350 * r(), fEnd: 330, dur: 0.55, gain: 0.06 * vol, attack: 0.08, delay: 0.62, dest: D, verb: true }, pos); break;
      default: break;
    }
  }

  // mob voices: kind -> synthesized vocalization
  mob(kind, pos, pitch = 1) {
    if (!this.ctx) return;
    this.cap('mob_' + kind, pos);
    const r = (0.92 + Math.random() * 0.16) * pitch;
    switch (kind) {
      case 'husk_rasp': this.play('husk_rasp', pos); break;
      case 'purr': for (let i = 0; i < 6; i++) this.noise({ f: 140 * r, q: 2, dur: 0.16, gain: 0.07, delay: i * 0.2, buf: this.brown }, pos); this.tone({ f: 26, dur: 1.2, gain: 0.08, wave: 'sine', attack: 0.2 }, pos); break;
      case 'yip': for (let i = 0; i < 2; i++) this.tone({ f: 1100 * r, fEnd: 700 * r, dur: 0.08, gain: 0.12, wave: 'sawtooth', lp: 2600, delay: i * 0.13 }, pos); break;
      case 'tweet': this.bird(['sparrow', 'robin', 'bluebird', 'finch'][(Math.random() * 4) | 0], pos, 1.3); break;
      case 'hoot': this.bird('owl', pos, 1.4); break;
      case 'squawk': this.bird('parrot', pos, 1.6); break;
      case 'caw': for (let i = 0; i < 2; i++) this.tone({ f: 380 * r, fEnd: 300 * r, dur: 0.3, gain: 0.08, wave: 'sawtooth', lp: 1300, delay: i * 0.45, verb: true, range: 70 }, pos); break;
      case 'screech': this.bird('hawk', pos, 1.8); break;
      case 'bleat': { const f = 520 * r; for (let i = 0; i < 5; i++) this.tone({ f: f * (1 + (i % 2) * 0.04), dur: 0.09, gain: 0.12, wave: 'sawtooth', lp: 2200, delay: i * 0.075 }, pos); break; }
      case 'snarl': this.noise({ f: 380 * r, q: 2, dur: 0.5, gain: 0.25, buf: this.brown }, pos); this.tone({ f: 110 * r, fEnd: 90 * r, dur: 0.5, gain: 0.12, wave: 'sawtooth', lp: 600 }, pos); break;
      case 'grunt': this.tone({ f: 95 * r, fEnd: 70 * r, dur: 0.7, gain: 0.25, wave: 'sawtooth', lp: 420, attack: 0.05 }, pos); this.noise({ f: 300, q: 1, dur: 0.6, gain: 0.12, buf: this.brown, attack: 0.05 }, pos); break;
      case 'whistle': this.tone({ f: 1800 * r, fEnd: 2300 * r, dur: 0.35, gain: 0.06, wave: 'sine' }, pos); break;
      case 'click': for (let i = 0; i < 9; i++) this.noise({ f: 3500 * r, q: 8, dur: 0.012, gain: 0.12, delay: i * 0.035 }, pos); this.tone({ f: 4200 * r, fEnd: 6400 * r, dur: 0.3, gain: 0.03, wave: 'sine', delay: 0.35 }, pos); break;
      case 'moo': this.tone({ f: 150 * r, fEnd: 120 * r, dur: 0.9, gain: 0.3, wave: 'sawtooth', lp: 700, attack: 0.08 }, pos); break;
      case 'oink': for (let i = 0; i < 2; i++) this.tone({ f: 330 * r, fEnd: 220 * r, dur: 0.12, gain: 0.22, wave: 'square', lp: 1200, delay: i * 0.16 }, pos); break;
      case 'baa': this.tone({ f: 420 * r, dur: 0.6, gain: 0.18, wave: 'sawtooth', lp: 1600, attack: 0.04 }, pos); break;
      case 'cluck': for (let i = 0; i < 3; i++) this.tone({ f: 900 * r, fEnd: 700 * r, dur: 0.06, gain: 0.14, wave: 'square', lp: 2500, delay: i * 0.1 }, pos); break;
      case 'neigh': this.tone({ f: 600 * r, fEnd: 300 * r, dur: 0.8, gain: 0.2, wave: 'sawtooth', lp: 1800 }, pos); break;
      case 'bark': this.tone({ f: 400 * r, fEnd: 250 * r, dur: 0.12, gain: 0.3, wave: 'sawtooth', lp: 1400 }, pos); break;
      case 'howl': this.tone({ f: 380 * r, fEnd: 620 * r, dur: 1.6, gain: 0.18, wave: 'triangle', attack: 0.3, verb: true }, pos); break;
      case 'meow': this.tone({ f: 700 * r, fEnd: 500 * r, dur: 0.45, gain: 0.15, wave: 'sawtooth', lp: 2000 }, pos); break;
      case 'croak': for (let i = 0; i < 2; i++) this.tone({ f: 120 * r, dur: 0.12, gain: 0.25, wave: 'square', lp: 500, delay: i * 0.18 }, pos); break;
      case 'squeak': this.tone({ f: 1800 * r, fEnd: 2400 * r, dur: 0.08, gain: 0.1, wave: 'sine' }, pos); break;
      case 'growl': this.tone({ f: 90 * r, fEnd: 70 * r, dur: 0.9, gain: 0.35, wave: 'sawtooth', lp: 400 }, pos); this.noise({ f: 200, q: 0.8, dur: 0.9, gain: 0.25, buf: this.brown }, pos); break;
      case 'hiss': this.noise({ f: 5000, q: 0.6, type: 'highpass', dur: 0.6, gain: 0.3 }, pos); break;
      case 'shriek': this.tone({ f: 1400 * r, fEnd: 900 * r, dur: 0.5, gain: 0.18, wave: 'sawtooth', lp: 3000 }, pos); break;
      case 'clatter': for (let i = 0; i < 4; i++) this.noise({ f: 2500, q: 4, dur: 0.04, gain: 0.25, delay: i * 0.05 }, pos); break;
      case 'trumpet': this.tone({ f: 260 * r, fEnd: 420 * r, dur: 1.4, gain: 0.45, wave: 'sawtooth', lp: 1500, attack: 0.1 }, pos); this.tone({ f: 130 * r, dur: 1.4, gain: 0.3, wave: 'sawtooth', lp: 600, attack: 0.1 }, pos); break;
      case 'creak': this.tone({ f: 150 * r, fEnd: 90 * r, dur: 1.0, gain: 0.3, wave: 'sawtooth', lp: 500 }, pos); this.noise({ f: 800, q: 4, dur: 1, gain: 0.2 }, pos); break;
      case 'chirp': for (let i = 0; i < 3; i++) this.tone({ f: (2600 + Math.random() * 1600) * r, fEnd: 3800 * r, dur: 0.07, gain: 0.05, delay: i * 0.09 }, pos); break;
      case 'hurt': this.tone({ f: 500 * r, fEnd: 300 * r, dur: 0.15, gain: 0.25, wave: 'sawtooth', lp: 1500 }, pos); break;
      case 'death': this.tone({ f: 400 * r, fEnd: 100 * r, dur: 0.6, gain: 0.25, wave: 'sawtooth', lp: 1200 }, pos); break;
      case 'groan': this.tone({ f: 120 * r, fEnd: 90 * r, dur: 1.1, gain: 0.22, wave: 'sawtooth', lp: 520, attack: 0.25 }, pos); this.tone({ f: 180 * r, fEnd: 130 * r, dur: 0.9, gain: 0.08, wave: 'triangle', lp: 700, attack: 0.3, delay: 0.1 }, pos); break;
      case 'groan_hurt': this.tone({ f: 210 * r, fEnd: 120 * r, dur: 0.35, gain: 0.28, wave: 'sawtooth', lp: 900 }, pos); this.noise({ f: 500, q: 1, dur: 0.2, gain: 0.2, buf: this.brown }, pos); break;
      case 'groan_death': this.tone({ f: 160 * r, fEnd: 50, dur: 1.4, gain: 0.25, wave: 'sawtooth', lp: 600 }, pos); break;
      case 'whisper': for (let i = 0; i < 3; i++) this.noise({ f: 2600 + Math.random() * 2000, q: 6, dur: 0.5 + Math.random() * 0.4, gain: 0.06, attack: 0.2, delay: i * 0.35, verb: true }, pos); this.tone({ f: 96 * r, dur: 1.6, gain: 0.05, wave: 'sine', attack: 0.6, verb: true }, pos); break;
      case 'skitter': for (let i = 0; i < 10; i++) this.noise({ f: 3200 + Math.random() * 1600, q: 5, dur: 0.02, gain: 0.12, delay: i * 0.035 + Math.random() * 0.02 }, pos); break;
      case 'chitter': for (let i = 0; i < 6; i++) this.tone({ f: 2400 * r, fEnd: 1800, dur: 0.03, gain: 0.07, wave: 'square', lp: 4000, delay: i * 0.05 }, pos); break;
      case 'rustle': this.noise({ f: 2800, q: 0.8, dur: 0.6, gain: 0.14, attack: 0.15, buf: this.pink }, pos); this.tone({ f: 140 * r, fEnd: 100, dur: 0.6, gain: 0.08, wave: 'sawtooth', lp: 500 }, pos); break;
      case 'wail': this.tone({ f: 520 * r, fEnd: 780 * r, dur: 1.4, gain: 0.08, wave: 'sine', attack: 0.4, verb: true }, pos); this.tone({ f: 523 * r * 1.5, fEnd: 600 * r, dur: 1.2, gain: 0.04, wave: 'triangle', attack: 0.5, verb: true }, pos); break;
      case 'cackle': for (let i = 0; i < 5; i++) this.tone({ f: (700 - i * 40) * r, fEnd: 500 * r, dur: 0.09, gain: 0.1, wave: 'sawtooth', lp: 2400, delay: i * 0.11 }, pos); break;
      case 'rumble': this.noise({ f: 160, q: 0.8, type: 'lowpass', dur: 1.4, gain: 0.35, attack: 0.3, buf: this.brown }, pos); this.tone({ f: 48 * r, dur: 1.2, gain: 0.25, wave: 'triangle', attack: 0.3 }, pos); break;
      case 'windup': this.tone({ f: 200 * r, fEnd: 320 * r, dur: 0.25, gain: 0.12, wave: 'sawtooth', lp: 1200 }, pos); break;
      case 'hmm': this.tone({ f: 200 * r, fEnd: 240 * r, dur: 0.35, gain: 0.18, wave: 'triangle', lp: 900 }, pos); this.tone({ f: 260 * r, fEnd: 200 * r, dur: 0.25, gain: 0.14, wave: 'triangle', lp: 900, delay: 0.3 }, pos); break;
      default: break;
    }
  }

  // per-frame: listener + ambience + music
  update(dt, g) {
    if (!this.ctx || !g.player) return;
    const p = g.player;
    this.listener = [p.x, p.eyeY, p.z];
    this.yaw = p.yaw;
    const w = g.weather;
    const exposure = g.skyExposure ?? 1;
    const rain = w ? w.rainAudio : 0;
    const indoorLP = 500 + exposure * 3500;
    this.setLoop('rain', rain * 0.32 * (0.35 + 0.65 * exposure), Math.min(2600, indoorLP));
    this.setLoop('rainHeavy', Math.max(0, rain - 0.5) * 0.4 * (0.3 + 0.7 * exposure), Math.min(900, indoorLP));
    const alt = Math.max(0, (p.y - 90) / 80);
    const wind = Math.min(0.5, ((w ? w.wind : 0.3) * 0.12 + alt * 0.12) * (0.25 + 0.75 * exposure));
    this.setLoop('wind', wind, 250 + Math.sin(performance.now() / 3000) * 120 + (w ? w.wind * 200 : 0));
    this.setLoop('water', Math.min(0.12, (g.nearWater || 0) * 0.12), 900);
    this.setLoop('lava', Math.min(0.3, (g.nearLava || 0) * 0.3), 300);
    this.setLoop('fire', Math.min(0.15, (g.nearFire || 0) * 0.15), 2500);
    // ---- biome soundscape loops
    const bio = g.currentBiome;
    const key = bio ? bio.key : '';
    const day = g.isDay;
    const t = performance.now() / 1000;
    const snow = w ? w.localSnow : 0;
    const calm = exposure * (1 - Math.min(1, rain * 1.4)) * (1 - snow * 0.6);
    // ocean surf swells in slow sets
    const swell = 0.35 + 0.65 * Math.pow(Math.max(0, Math.sin(t * 0.52) * 0.5 + 0.5), 2.5);
    this.setLoop('surf', Math.min(0.2, (g.nearOcean || 0) * 0.2 * swell * (0.4 + 0.6 * exposure)), 380 + swell * 420);
    this.setLoop('leaves', Math.min(0.07, (g.nearLeaves || 0) * (0.018 + (w ? w.wind : 0.3) * 0.045) * (0.3 + 0.7 * exposure)), 2400 + Math.sin(t * 0.7) * 500);
    const buggy = /SAVANNA|JUNGLE|PLAINS|SWAMP/.test(key) && day && !snow ? (key === 'JUNGLE' ? 0.03 : 0.016) : 0;
    this.setLoop('insects', buggy * calm * (0.6 + 0.4 * Math.sin(t * 5.3) * Math.sin(t * 0.37)), 4500 + Math.sin(t * 0.9) * 300);
    const deep = exposure < 0.12 && p.y < 56 ? Math.min(1, (56 - p.y) / 30 + 0.3) : 0;
    this.setLoop('cave', deep * 0.09, 95);
    const icy = /SNOWY|TUNDRA|MOUNTAINS|PEAKS/.test(key) || p.y > 120;
    this.setLoop('whistle', icy ? Math.min(0.03, (w ? w.wind : 0.3) * 0.03 + alt * 0.02) * exposure : 0, 700 + Math.sin(t * 0.43) * 260 + Math.sin(t * 1.7) * 80);

    // ---- ambient one-shots
    this.ambientTimer -= dt;
    if (this.ambientTimer <= 0) {
      this.ambientTimer = 1.2 + Math.random() * 3.5;
      const cave = exposure < 0.1 && p.y < 60;
      const R = (a) => a + (Math.random() - 0.5) * 2 * a;
      const pos = { x: p.x + (Math.random() - 0.5) * 24, y: p.y + 2 + Math.random() * 6, z: p.z + (Math.random() - 0.5) * 24 };
      const birdsNear = g.wildlife ? g.wildlife.birds.length : 0;
      if (cave) {
        const r0 = Math.random();
        if (r0 < 0.45) this.tone({ f: 1300 + Math.random() * 1400, fEnd: 800 + Math.random() * 300, dur: 0.22, gain: 0.07, verb: true, dest: this.amb }, pos);          // drip
        else if (r0 < 0.55) this.tone({ f: 50 + Math.random() * 20, dur: 4, gain: 0.08, wave: 'triangle', attack: 1.5, dest: this.amb, verb: true });                     // deep hum
        else if (r0 < 0.62) { for (let i = 0; i < 5; i++) this.noise({ f: 900 + Math.random() * 900, q: 2, dur: 0.06, gain: 0.08, delay: i * 0.09 + Math.random() * 0.05, dest: this.amb, verb: true }, pos); } // pebbles
        else if (r0 < 0.7) this.noise({ f: 300, fEnd: 700, q: 3, dur: 3, gain: 0.05, attack: 1.2, buf: this.pink, dest: this.amb, verb: true }); // wind moan
      } else if (exposure > 0.3) {
        const wet = rain > 0.3 || snow > 0.4;
        if (!wet && day) {
          // distant birdsong when no flock is close (biome flavoured)
          if (birdsNear < 3 && /FOREST|PLAINS|JUNGLE|TAIGA|SAVANNA|RIVER|BIRCH/.test(key) && Math.random() < 0.55) {
            const kinds = key === 'JUNGLE' ? ['finch', 'bluebird', 'parrot'] : /TAIGA/.test(key) ? ['crow', 'sparrow'] : ['robin', 'sparrow', 'bluebird', 'finch'];
            this.bird(kinds[(Math.random() * kinds.length) | 0], { x: p.x + (Math.random() - 0.5) * 40, y: p.y + 6, z: p.z + (Math.random() - 0.5) * 40 }, 0.6);
          }
          if (/DESERT|BADLANDS/.test(key) && Math.random() < 0.25) this.noise({ f: 700, fEnd: 2200, q: 0.7, dur: 2.2, gain: 0.05, attack: 0.9, buf: this.pink, dest: this.amb }); // dry gust
          if (/DESERT|BADLANDS|MOUNTAINS/.test(key) && Math.random() < 0.05) this.bird('hawk', { x: p.x + (Math.random() - 0.5) * 50, y: p.y + 25, z: p.z + (Math.random() - 0.5) * 50 }, 0.5);
          if ((g.nearOcean || 0) > 0.2 && Math.random() < 0.3) this.bird('gull', { x: p.x + (Math.random() - 0.5) * 40, y: p.y + 10, z: p.z + (Math.random() - 0.5) * 40 }, 0.6);
          if ((g.nearVillage || 0) > 0 && Math.random() < 0.18) {
            if (Math.random() < 0.5) for (let i = 0; i < 3; i++) this.noise({ f: 2600, q: 6, dur: 0.05, gain: 0.05, delay: i * 0.55, dest: this.amb }, pos); // smith hammer
            else this.mob('cluck', pos);
          }
        }
        if (!wet && !day) {
          if (Math.random() < 0.55 && !/SNOWY|TUNDRA|PEAKS|DESERT/.test(key)) for (let i = 0; i < 6; i++) this.tone({ f: 4300 + Math.random() * 300, dur: 0.04, gain: 0.022, delay: i * 0.07, dest: this.amb }, pos); // crickets
          if (/FOREST|TAIGA|BIRCH/.test(key) && Math.random() < 0.12) this.bird('owl', pos);
          if (/TAIGA|SNOWY|TUNDRA/.test(key) && Math.random() < 0.03) this.mob('howl', { x: p.x + (Math.random() - 0.5) * 60, y: p.y, z: p.z + (Math.random() - 0.5) * 60 }, 0.9);
        }
        if (/SWAMP|RIVER/.test(key) && Math.random() < (day ? 0.15 : 0.4)) this.mob('croak', pos, R(1));
        if (/SWAMP/.test(key) && Math.random() < 0.15) for (let i = 0; i < 3; i++) this.tone({ f: 300 + Math.random() * 200, fEnd: 600, dur: 0.05, gain: 0.04, delay: i * 0.12, dest: this.amb }, pos); // bubbles
        if ((g.nearOcean || 0) > 0.3 && Math.random() < 0.35) this.noise({ f: 1200, fEnd: 300, q: 0.6, dur: 1.8, gain: 0.08 * exposure, attack: 0.5, buf: this.pink, dest: this.amb }); // wave break
        if (w && w.storm > 0.4 && Math.random() < 0.5) this.noise({ f: 300, fEnd: 900, q: 1, dur: 2.5, gain: 0.06 + w.storm * 0.06, attack: 0.8, buf: this.brown, dest: this.amb }); // storm gust
      }
    }
    // music
    this.musicTimer -= dt;
    if (this.musicTimer <= 0 && this.musicVol > 0) {
      this.playMusic(g);
      this.musicTimer = 160 + Math.random() * 200;
    }
  }

  // Generative ambient piece: soft piano-like notes over a pad, in a pentatonic mode
  playMusic(g) {
    const c = this.ctx;
    if (!c) return;
    const roots = [196, 220, 174.6, 207.6, 233];
    const root = roots[Math.floor(Math.random() * roots.length)];
    const minor = !g.isDay || Math.random() < 0.4;
    const scale = minor ? [0, 3, 5, 7, 10, 12, 15, 17] : [0, 2, 4, 7, 9, 12, 14, 16];
    const t0 = c.currentTime + 0.5;
    const bars = 14 + Math.floor(Math.random() * 10);
    const pad = (f, t, d) => {
      for (const det of [-3, 3]) {
        const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = det;
        const gg = c.createGain(); gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(0.025, t + d * 0.4); gg.gain.exponentialRampToValueAtTime(0.0001, t + d);
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
        o.connect(gg); gg.connect(lp); lp.connect(this.mus); lp.connect(this.verb);
        o.start(t); o.stop(t + d + 0.1);
      }
    };
    const note = (f, t, v) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.01;
      const gg = c.createGain(); gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(0.09 * v, t + 0.01); gg.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      const g2 = c.createGain(); g2.gain.value = 0.25;
      o.connect(gg); o2.connect(g2); g2.connect(gg);
      gg.connect(this.mus); gg.connect(this.verb);
      o.start(t); o2.start(t); o.stop(t + 3.3); o2.stop(t + 3.3);
    };
    const beat = 0.75 + Math.random() * 0.35;
    let deg = Math.floor(Math.random() * 4);
    for (let b = 0; b < bars; b++) {
      const tb = t0 + b * beat * 4;
      if (b % 2 === 0) pad(root / 2 * Math.pow(2, scale[(b * 3) % 5] / 12), tb, beat * 8);
      for (let k = 0; k < 4; k++) {
        if (Math.random() < 0.45) continue;
        deg = Math.max(0, Math.min(scale.length - 1, deg + Math.floor(Math.random() * 5) - 2));
        note(root * Math.pow(2, scale[deg] / 12), tb + k * beat + (Math.random() - 0.5) * 0.04, 0.6 + Math.random() * 0.4);
      }
    }
  }
}
