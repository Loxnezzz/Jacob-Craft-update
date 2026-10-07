// Dynamic weather: global state machine + biome/altitude-aware local manifestation + lightning.
import { BIOMES, SNOWY_BIOMES } from '../world/biomes.js';
import { SEA } from '../world/constants.js';

export const STATES = {
  clear: { cover: 0.36, rain: 0, storm: 0, fog: 0, wind: 0.3, overcast: 0.0, dur: [300, 720], next: { cloudy: 45, rain: 22, fog: 12, clear: 21 } },
  cloudy: { cover: 0.66, rain: 0, storm: 0, fog: 0.05, wind: 0.55, overcast: 0.35, dur: [180, 420], next: { clear: 40, rain: 38, heavy: 8, fog: 14 } },
  rain: { cover: 0.84, rain: 0.55, storm: 0, fog: 0.15, wind: 0.75, overcast: 0.75, dur: [180, 400], next: { cloudy: 40, heavy: 30, storm: 20, clear: 10 } },
  heavy: { cover: 0.93, rain: 1.0, storm: 0.15, fog: 0.25, wind: 1.05, overcast: 0.9, dur: [120, 300], next: { rain: 50, storm: 40, cloudy: 10 } },
  storm: { cover: 0.98, rain: 1.0, storm: 1.0, fog: 0.2, wind: 1.45, overcast: 1.0, dur: [120, 300], next: { heavy: 50, rain: 40, cloudy: 10 } },
  fog: { cover: 0.55, rain: 0, storm: 0, fog: 1.0, wind: 0.08, overcast: 0.45, dur: [120, 300], next: { clear: 60, cloudy: 40 } },
};

function approach(v, t, dt, tau) { return v + (t - v) * (1 - Math.exp(-dt / tau)); }

export class Weather {
  constructor(game) {
    this.game = game;
    this.state = 'clear';
    this.timer = 240;
    this.cover = 0.36; this.rain = 0; this.storm = 0; this.fogW = 0; this.wind = 0.3; this.overcast = 0;
    this.localRain = 0; this.localSnow = 0; this.wetness = 0; this.flash = 0; this.rainAudio = 0;
    this.fogDensity = 0.002;
    this.bolts = [];
    this.lightningTimer = 8;
    this.biomeMul = { rain: 1, fog: 1, storm: 1, precip: 'rain', ambientFog: 0, overcastMul: 1 };
    this.biomeTimer = 0;
    this.cold = 0;
    this.windDir = Math.random() * Math.PI * 2;
    this.cloudWind = [0, 0];
  }

  set(state, duration) {
    if (!STATES[state]) return false;
    this.state = state;
    this.timer = duration || (STATES[state].dur[0] + Math.random() * (STATES[state].dur[1] - STATES[state].dur[0]));
    return true;
  }

  pickNext() {
    const nx = STATES[this.state].next;
    let total = 0; for (const k in nx) total += nx[k];
    let r = Math.random() * total;
    for (const k in nx) { if (r < nx[k]) { this.set(k); return; } r -= nx[k]; }
  }

  update(dt, ctx) {
    this.timer -= dt;
    if (this.timer <= 0 && !this.locked) this.pickNext();
    const S = STATES[this.state];
    // biome influence (smoothed)
    this.biomeTimer -= dt;
    if (this.biomeTimer <= 0 && ctx.biome !== undefined) {
      this.biomeTimer = 0.5;
      const b = BIOMES[ctx.biome];
      this._bt = b;
    }
    const b = this._bt || BIOMES[7];
    const bm = this.biomeMul;
    bm.rain = approach(bm.rain, b.rainMul, dt, 6);
    bm.fog = approach(bm.fog, b.fog, dt, 6);
    bm.storm = approach(bm.storm, b.stormMul, dt, 6);
    bm.ambientFog = approach(bm.ambientFog, b.ambientFog, dt, 6);
    bm.overcastMul = approach(bm.overcastMul, b.precip === 'none' ? 0.55 : 1, dt, 8);
    const snowyHere = SNOWY_BIOMES.has(b.id) || (ctx.y > SEA + 90);
    this.cold = approach(this.cold, snowyHere ? 1 : 0, dt, 4);

    this.cover = approach(this.cover, S.cover, dt, 25);
    this.overcast = approach(this.overcast, S.overcast * bm.overcastMul, dt, 20);
    this.rain = approach(this.rain, S.rain, dt, 10);
    this.storm = approach(this.storm, S.storm * Math.min(1.3, bm.storm), dt, 12);
    this.fogW = approach(this.fogW, S.fog, dt, 20);
    this.wind = approach(this.wind, S.wind * (b.id === 15 ? 1.4 : 1), dt, 10);
    this.windDir += (Math.random() - 0.5) * dt * 0.02;
    const ws = 0.0016 + this.wind * 0.0035;
    this.cloudWind[0] += Math.cos(this.windDir) * ws * dt;
    this.cloudWind[1] += Math.sin(this.windDir) * ws * dt;

    // local precipitation
    const precipAllowed = b.precip !== 'none' || this.cold > 0.5;
    const p = this.rain * bm.rain * (precipAllowed ? 1 : 0.12);
    this.localSnow = p * this.cold;
    this.localRain = p * (1 - this.cold);
    this.rainAudio = this.localRain;
    // wetness of exposed surfaces
    const wetT = this.localRain > 0.05 ? Math.min(1, 0.4 + this.localRain) : 0;
    this.wetness = approach(this.wetness, wetT, dt, wetT > this.wetness ? 25 : 70);

    // fog density: weather + biome + morning mist + altitude
    const tod = ctx.timeOfDay; // 0..1, 0.25 = sunrise
    const morning = Math.max(0, 1 - Math.abs(tod - 0.27) / 0.06) * 0.8 + Math.max(0, 1 - Math.abs(tod - 0.75) / 0.04) * 0.25;
    const mountain = Math.max(0, (ctx.y - (SEA + 50)) / 60) * 0.5;
    let fog = 0.0016 + this.fogW * 0.024 + this.rain * 0.006 + this.storm * 0.006 + morning * 0.008 * bm.fog + bm.ambientFog * 0.008 + mountain * 0.004 * this.overcast;
    fog *= 0.5 + 0.5 * bm.fog;
    if (ctx.underwater) fog = 0.06;
    this.fogDensity = approach(this.fogDensity, fog, dt, 4);
    this.volDensity = 0.0012 + this.fogW * 0.006 + morning * 0.006 * bm.fog + bm.ambientFog * 0.004 + this.rain * 0.002;

    // lightning
    this.flash = Math.max(0, this.flash - dt * 3.2);
    for (const bo of this.bolts) bo.life -= dt;
    this.bolts = this.bolts.filter(bo => bo.life > 0);
    if (this.storm > 0.55 && precipAllowed) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = 2.5 + Math.random() * 12 / Math.max(0.5, this.storm);
        this.strike(ctx);
      }
    }
  }

  strike(ctx, forced) {
    const g = this.game;
    const a = Math.random() * Math.PI * 2;
    const d = forced ? forced.d : (Math.random() < 0.15 ? 12 + Math.random() * 30 : 40 + Math.random() * 140);
    const x = forced ? forced.x : ctx.x + Math.cos(a) * d, z = forced ? forced.z : ctx.z + Math.sin(a) * d;
    const gy = g.world.isLoaded(x, z) ? g.world.heightAt(x, z) : 70;
    const bolt = { x, z, y0: 235, y1: gy, life: 0.35, seed: Math.random() * 1000, segs: null };
    bolt.segs = this.makeBolt(x, 235, z, gy, bolt.seed);
    this.bolts.push(bolt);
    const dist = Math.hypot(x - ctx.x, z - ctx.z);
    this.flash = Math.min(1.6, 0.6 + 1.0 * Math.max(0, 1 - dist / 260));
    g.audio && g.audio.thunder(dist);
    g.onLightning && g.onLightning(x, gy, z, dist);
  }

  makeBolt(x, y0, z, y1, seed) {
    let s = seed;
    const rnd = () => { s = (s * 16807 + 11) % 2147483647; return (s % 10000) / 10000; };
    const segs = [];
    const branch = (px, py, pz, ey, w, depth) => {
      let x = px, y = py, z = pz;
      while (y > ey) {
        const ny = y - (3 + rnd() * 6);
        const nx = x + (rnd() - 0.5) * 7, nz = z + (rnd() - 0.5) * 7;
        segs.push([x, y, z, nx, Math.max(ny, ey), nz, w]);
        if (depth < 2 && rnd() < 0.12) branch(nx, ny, nz, ny - 15 - rnd() * 30, w * 0.5, depth + 1);
        x = nx; y = ny; z = nz;
      }
    };
    branch(x, y0, z, y1, 0.5, 0);
    return segs;
  }

  serialize() { return { state: this.state, timer: this.timer, locked: !!this.locked }; }
  load(d) {
    if (!d) return;
    this.set(d.state || 'clear', d.timer);
    this.locked = !!d.locked;
    const S = STATES[this.state];
    this.cover = S.cover; this.rain = S.rain; this.storm = S.storm; this.fogW = S.fog; this.overcast = S.overcast;
  }
}
