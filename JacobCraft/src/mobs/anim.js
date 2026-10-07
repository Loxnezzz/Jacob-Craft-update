// Procedural animation: fills pose[partIndex] = [rx, ry, rz, tx, ty, tz] from mob state.

function set(m, P, name, rx = 0, ry = 0, rz = 0, tx = 0, ty = 0, tz = 0) {
  const i = m.model.index[name];
  if (i === undefined) return;
  const p = P[i];
  p[0] += rx; p[1] += ry; p[2] += rz; p[3] += tx; p[4] += ty; p[5] += tz;
}

export const ANIMS = {
  quad(m, P, t) {
    const s = Math.sin(m.walkPhase) * m.walkAmt * 0.75;
    let fold = m.sleeping ? 1 : (m.sitting ? 0.6 : 0);
    if (fold) {
      const lh = m.model.parts[m.model.index.legFL].pivot[1];
      set(m, P, 'body', 0, 0, 0, 0, -lh * 0.7 * fold, 0);
      set(m, P, 'head', m.sleeping ? 0.4 : 0, 0, 0, 0, -lh * 0.7 * fold, 0);
      set(m, P, 'tail', 0, 0, 0, 0, -lh * 0.7 * fold, 0);
      for (const n of ['legFL', 'legFR']) set(m, P, n, -1.45 * fold, 0, 0, 0, -lh * 0.5 * fold, 0);
      for (const n of ['legBL', 'legBR']) set(m, P, n, 1.45 * fold, 0, 0, 0, -lh * 0.5 * fold, 0);
    } else {
      set(m, P, 'legFL', s); set(m, P, 'legBR', s); set(m, P, 'legFR', -s); set(m, P, 'legBL', -s);
    }
    const graze = m.grazeT > 0 ? Math.min(1, m.grazeT * 3, (m.grazeMax - m.grazeT) * 3) : 0;
    set(m, P, 'head', m.headPitch + graze * 1.1 + Math.sin(t * 9) * graze * 0.08 + (m.attackAnim ? -m.attackAnim * 0.5 : 0), m.headYaw * (1 - graze));
    set(m, P, 'tail', Math.sin(t * 2.3 + m.id) * 0.12 + (m.tamed && m.def.id === 'wolf' ? -0.6 : 0), Math.sin(t * (m.happy ? 12 : 1.7) + m.id) * (m.happy ? 0.5 : 0.25));
    set(m, P, 'body', 0, 0, 0, 0, Math.abs(Math.sin(m.walkPhase)) * m.walkAmt * (m.def.gallop ? 0.8 : 0.3));
    if (m.rearing) { set(m, P, 'body', -0.7 * m.rearing, 0, 0, 0, 3 * m.rearing); set(m, P, 'head', -0.5 * m.rearing, 0, 0, 0, 6 * m.rearing); set(m, P, 'legFL', -1 * m.rearing, 0, 0, 0, 5 * m.rearing); set(m, P, 'legFR', -0.8 * m.rearing, 0, 0, 0, 5 * m.rearing); }
  },
  // Detailed quadruped (Phase 6): walk/trot/gallop gaits with knee bends, smooth lying down, grazing with chewing,
  // idle look-around, head-leading turns, alert/flee posture, ear twitches, tail swish, breathing and blinking.
  beast(m, P, t) {
    const idx = m.model.index;
    const def = m.def;
    const spd = Math.hypot(m.vx, m.vz);
    const now = t, id = m.mid || 0;
    const dt = Math.min(0.1, Math.max(0, now - (m._animT ?? now))); m._animT = now;
    const k = (r) => 1 - Math.exp(-dt * r);
    // posture targets
    const foldT = m.deathT >= 0 ? 0 : m.sleeping ? 1 : (m.sitting && !def.sits) ? 0.7 : 0;
    m._fold = (m._fold ?? foldT) + (foldT - (m._fold ?? foldT)) * k(2.5);
    const f = m._fold;
    const alertT = (m.fleeT > 0 || m.angryT > 0) ? 1 : 0;
    m._alert = (m._alert ?? 0) + (alertT - (m._alert ?? 0)) * k(4);
    const al = m._alert;
    const graze = m.grazeT > 0 ? Math.min(1, m.grazeT * 3, (m.grazeMax - m.grazeT) * 3) : 0;
    // turning: the head leads the body into turns
    let dy = (m.yaw - (m._pYaw ?? m.yaw)); while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    m._pYaw = m.yaw;
    m._turn = (m._turn ?? 0) + (Math.max(-0.6, Math.min(0.6, dt > 0 ? dy / dt * 0.25 : 0)) - (m._turn ?? 0)) * k(6);
    // gait
    const gallop = def.gallop && spd > 4 ? Math.min(1, (spd - 4) / 1.5) : 0;
    const ph = m.walkPhase;
    const amp = m.walkAmt * (0.5 + gallop * 0.4) * (1 - f);
    const offs = gallop > 0.5 ? { FL: 0, FR: 0.45, BL: Math.PI + 0.25, BR: Math.PI + 0.7 } : { FL: 0, BR: 0.15, FR: Math.PI, BL: Math.PI + 0.15 };
    const legTop = idx.legFL !== undefined ? m.model.parts[idx.legFL].pivot[1] : 8;
    const drop = legTop * 0.62 * f;
    for (const key of ['FL', 'FR', 'BL', 'BR']) {
      const front = key[0] === 'F';
      const a = Math.sin(ph + offs[key]);
      const lift = Math.max(0, Math.cos(ph + offs[key]));
      const fold = front ? [-1.25 * f, 2.1 * f] : [1.25 * f, -2.1 * f];
      set(m, P, 'leg' + key, a * amp + fold[0], 0, 0, 0, -drop * 0.55, 0);
      set(m, P, 'shin' + key, (front ? -1 : 1) * lift * m.walkAmt * (0.7 + gallop * 0.4) * (1 - f) + fold[1]);
    }
    // body: bob, breathing, gallop rock, lying down
    const breath = Math.sin(now * (m.sleeping ? 1.3 : 2.4) + id) * (m.sleeping ? 0.22 : 0.12);
    const bob = Math.abs(Math.sin(ph)) * m.walkAmt * (gallop ? 1.1 : 0.35) * (1 - f);
    set(m, P, 'body', Math.sin(ph * 2) * 0.05 * gallop - al * 0.04, 0, 0, 0, bob + breath - drop, 0);
    // head & neck
    const idle = (1 - Math.min(1, m.walkAmt * 3)) * (1 - graze) * (1 - f) * (m.lookAt ? 0 : 1);
    const lookYaw = Math.sin(now * 0.31 + id * 1.7) * 0.45 * Math.max(0, Math.sin(now * 0.13 + id)) * idle;
    const lookPitch = Math.sin(now * 0.23 + id * 2.3) * 0.12 * idle;
    const yawAll = m.headYaw * (1 - graze) + lookYaw + m._turn * 0.6;
    const pitchAll = m.headPitch + lookPitch - al * 0.3 + (m.attackAnim ? -m.attackAnim * 0.6 : 0);
    const chew = graze * Math.sin(now * 9) * 0.07;
    const sleepTurn = f * Math.sin(id) * 0.45;
    if (idx.neck !== undefined) {
      set(m, P, 'neck', pitchAll * 0.4 + graze * 1.15 + f * 0.6 + Math.sin(ph * 2) * 0.06 * gallop, yawAll * 0.5 + sleepTurn * 0.5);
      set(m, P, 'head', pitchAll * 0.6 + graze * 0.35 + chew + f * 0.25, yawAll * 0.5 + sleepTurn * 0.5);
    } else {
      set(m, P, 'head', pitchAll + graze * 0.9 + chew + f * 0.3, yawAll + sleepTurn, 0, 0, -drop * 0.8);
    }
    // ears: twitch now and then, pinned back when alarmed
    const tw = (o) => Math.pow(Math.max(0, Math.sin(now * 1.3 + id * 2.1 + o)), 40) * 0.6;
    set(m, P, 'earL', al * 0.7 + m.walkAmt * Math.sin(ph * 2) * 0.08, 0, -tw(0));
    set(m, P, 'earR', al * 0.7 + m.walkAmt * Math.sin(ph * 2 + 1) * 0.08, 0, tw(1.7));
    // tail: lazy sway, occasional fly-swat, raised when fleeing, wag when happy
    const swat = Math.pow(Math.max(0, Math.sin(now * 0.45 + id)), 10);
    const wag = m.happy ? Math.sin(now * 13) * 0.55 : 0;
    const tailYaw = Math.sin(now * 1.6 + id) * 0.22 + Math.sin(now * 8) * 0.45 * swat + wag;
    set(m, P, 'tail', -al * 0.55 + Math.sin(ph) * 0.1 * m.walkAmt - (m.tamed && def.id === 'wolf' ? 0.5 : 0), tailYaw);
    set(m, P, 'tail2', Math.sin(now * 1.3 + id) * 0.08, Math.sin(now * 1.6 + id - 0.7) * 0.3 + Math.sin(now * 8 - 0.8) * 0.4 * swat + wag * 0.6);
    // blink
    m.blink = ((now * 0.31 + id * 0.137) % 1) < 0.035;
    // jumping (horses, deer and friends): gather, leap with the forelegs tucked, stretch out, land heavily
    const airT = (!m.onGround && m.deathT < 0 && !(m.liquid && m.liquid.inWater) && (Math.abs(m.vy) > 1.5 || (m._air || 0) > 0.5)) ? 1 : 0;   // stays tucked through the top of the arc
    m._air = (m._air ?? 0) + (airT - (m._air ?? 0)) * k(10);
    const air = m._air;
    if (air > 0.01) {
      const up = Math.max(-1, Math.min(1, m.vy / 9));
      set(m, P, 'body', -0.22 * up * air, 0, 0, 0, 0.6 * air);
      set(m, P, 'legFL', -0.95 * air); set(m, P, 'legFR', -0.8 * air);
      set(m, P, 'shinFL', -1.5 * air); set(m, P, 'shinFR', -1.35 * air);
      set(m, P, 'legBL', (0.55 + 0.3 * up) * air); set(m, P, 'legBR', (0.45 + 0.3 * up) * air);
      set(m, P, 'shinBL', 0.35 * air); set(m, P, 'shinBR', 0.4 * air);
      set(m, P, 'neck', 0.2 * up * air); set(m, P, 'tail', -0.5 * air);
    }
    const gather = m.jumpCharge || 0;
    if (gather > 0) {
      set(m, P, 'body', -0.08 * gather, 0, 0, 0, -1.6 * gather);
      set(m, P, 'legBL', -0.35 * gather); set(m, P, 'legBR', -0.35 * gather); set(m, P, 'shinBL', 0.7 * gather); set(m, P, 'shinBR', 0.7 * gather);
      set(m, P, 'shinFL', -0.4 * gather); set(m, P, 'shinFR', -0.4 * gather); set(m, P, 'neck', -0.15 * gather);
    }
    const land = m.landT || 0;
    if (land > 0) {
      const s = Math.sin(land * Math.PI);
      set(m, P, 'body', 0.12 * s, 0, 0, 0, -2.2 * s);
      set(m, P, 'shinFL', -0.6 * s); set(m, P, 'shinFR', -0.6 * s); set(m, P, 'shinBL', 0.7 * s); set(m, P, 'shinBR', 0.7 * s);
      set(m, P, 'neck', 0.25 * s);
    }
    // sitting up (cats and foxes): haunches down, forelegs straight, head level, tail curled round the feet
    const sitT = def.sits && (m.sitting || m.loungeT > 0) && !m.sleeping && m.deathT < 0 ? 1 : 0;
    m._sit = (m._sit ?? 0) + (sitT - (m._sit ?? 0)) * k(5);
    const st = m._sit;
    if (st > 0.01) {
      set(m, P, 'body', -0.5 * st, 0, 0, 0, -1.0 * st, 0.6 * st);
      set(m, P, 'head', 0.42 * st);
      set(m, P, 'legFL', 0, 0, 0, 0, 1.4 * st, 1.0 * st); set(m, P, 'legFR', 0, 0, 0, 0, 1.4 * st, 1.0 * st);
      set(m, P, 'legBL', -1.3 * st, 0, 0, 0, -2.6 * st, 0); set(m, P, 'legBR', -1.3 * st, 0, 0, 0, -2.6 * st, 0);
      set(m, P, 'shinBL', 2.2 * st); set(m, P, 'shinBR', 2.2 * st);
      set(m, P, 'tail', 0.7 * st, 0.6 * st); set(m, P, 'tail2', 0.2 * st, 0.8 * st);
      // washing: a forepaw comes up to the face, the head dips to meet it
      const gr = m.groomT > 0 ? Math.min(1, m.groomT * 3, 1) * st : 0;
      if (gr > 0) {
        set(m, P, 'legFR', -1.25 * gr + Math.sin(now * 6) * 0.12 * gr, 0, 0.15 * gr, 0, 0.6 * gr, -0.4 * gr); set(m, P, 'shinFR', -1.35 * gr);
        set(m, P, 'head', 0.35 * gr + Math.sin(now * 12) * 0.07 * gr, 0.35 * gr, 0.2 * gr);
      }
    }
    // curled up asleep with the tail wrapped round
    if (def.sits && f > 0.3) { set(m, P, 'tail', 0, 1.3 * f); set(m, P, 'tail2', 0, 1.1 * f); }
    // a fox comes down nose-first out of a pounce
    if (m.pounceT > 0 && air > 0.1) { set(m, P, 'body', 0.6 * air * (m.vy < 0 ? 1 : -0.3)); set(m, P, 'legFL', -0.5 * air); set(m, P, 'legFR', -0.5 * air); }
    // lean into turns at speed
    if (def.gallop) set(m, P, 'body', 0, 0, -m._turn * Math.min(1, spd / 7) * 0.35);
    // a horse at rest paws the ground now and then and tosses its head
    if (def.gallop && m.walkAmt < 0.05 && f < 0.05 && !m.rider && !air) {
      const paw = Math.pow(Math.max(0, Math.sin(now * 0.37 + id * 1.3)), 24);
      if (paw > 0.01) { const s = Math.sin(now * 9) * 0.5 + 0.5; set(m, P, 'legFR', -0.6 * paw * s); set(m, P, 'shinFR', -1.0 * paw * s); }
      const toss = Math.pow(Math.max(0, Math.sin(now * 0.29 + id * 2.1)), 30);
      set(m, P, 'neck', -0.35 * toss); set(m, P, 'head', 0.2 * toss);
    }
    // rearing (taming)
    if (m.rearing) {
      set(m, P, 'body', -0.65 * m.rearing, 0, 0, 0, 3.5 * m.rearing);
      set(m, P, 'legFL', -1.3 * m.rearing, 0, 0, 0, 6 * m.rearing, -2 * m.rearing); set(m, P, 'shinFL', 1.2 * m.rearing);
      set(m, P, 'legFR', -1.0 * m.rearing, 0, 0, 0, 6 * m.rearing, -2 * m.rearing); set(m, P, 'shinFR', 1.5 * m.rearing);
    }
  },
  // Detailed people (Phase 6): breathing, weight shift, idle look-around, talking gestures, job work motions, waving.
  person(m, P, t) {
    const id = m.mid || 0;
    const s = Math.sin(m.walkPhase) * m.walkAmt * 0.75;
    const breath = Math.sin(t * 2.2 + id) * 0.12;
    const idle = 1 - Math.min(1, m.walkAmt * 3);
    set(m, P, 'legL', s); set(m, P, 'legR', -s);
    set(m, P, 'armL', -s * 0.8 + Math.sin(t * 1.3 + id) * 0.04 * idle, 0, -0.05);
    set(m, P, 'armR', s * 0.8 - Math.sin(t * 1.3 + id) * 0.04 * idle, 0, 0.05);
    set(m, P, 'body', m.walkAmt * 0.06, 0, Math.sin(t * 0.45 + id) * 0.025 * idle, 0, breath * 0.3, 0);
    const look = idle * (m.lookAt ? 0 : 1);
    set(m, P, 'head', m.headPitch + Math.sin(t * 0.27 + id) * 0.08 * look, m.headYaw + Math.sin(t * 0.33 + id * 1.3) * 0.5 * look * Math.max(0, Math.sin(t * 0.15 + id)));
    if (m.talking) {
      set(m, P, 'armR', -0.55 + Math.sin(t * 4.2 + id) * 0.3, 0.2, 0.15 + Math.sin(t * 3.1) * 0.1);
      set(m, P, 'armL', -0.25 + Math.sin(t * 3.4 + id) * 0.2, -0.15, -0.12);
      set(m, P, 'head', Math.sin(t * 6) * 0.05);
    } else if (m.working) {
      const job = m.data ? m.data.job : '';
      if (job === 'blacksmith' || job === 'builder') set(m, P, 'armR', -1.3 + Math.abs(Math.sin(t * 5)) * 1.0);
      else if (job === 'farmer') { set(m, P, 'armR', -0.7 + Math.sin(t * 3) * 0.5); set(m, P, 'armL', -0.6 + Math.sin(t * 3) * 0.4); set(m, P, 'body', 0.3); }
      else if (job === 'librarian' || job === 'healer' || job === 'apprentice') { set(m, P, 'armR', -0.9, 0.3); set(m, P, 'armL', -0.9, -0.3); set(m, P, 'head', 0.35); }
      else set(m, P, 'armR', -0.9 + Math.sin(t * 7) * 0.5);
    }
    if (m.waveT > 0) set(m, P, 'armR', -2.7, 0, 0.3 + Math.sin(t * 14) * 0.35);
    if (m.windAnim) set(m, P, 'armR', -2.4 * m.windAnim);
    if (m.attackAnim) set(m, P, 'armR', -1.6 * m.attackAnim);
    if (m.sleeping) { set(m, P, 'body', 1.57, 0, 0, 0, -8, 4); set(m, P, 'legL', 1.57, 0, 0, 0, -8, 4); set(m, P, 'legR', 1.57, 0, 0, 0, -8, 4); } // (pitch mirrored at render)
  },
  biped(m, P, t) {
    const s = Math.sin(m.walkPhase) * m.walkAmt * 0.8;
    set(m, P, 'legL', s); set(m, P, 'legR', -s);
    set(m, P, 'armL', -s * 0.8 + Math.sin(t * 1.3) * 0.04); set(m, P, 'armR', s * 0.8 - Math.sin(t * 1.3) * 0.04);
    if (m.windAnim) set(m, P, 'armR', -2.4 * m.windAnim);
    if (m.attackAnim) set(m, P, 'armR', -1.6 * m.attackAnim);
    if (m.aiming) { set(m, P, 'armR', -1.5); set(m, P, 'armL', -1.3, 0.4); }
    set(m, P, 'head', m.headPitch, m.headYaw);
  },
  villager(m, P, t) {
    ANIMS.biped(m, P, t);
    if (m.working) { set(m, P, 'armR', -0.9 + Math.sin(t * 7) * 0.5); }
    if (m.talking) set(m, P, 'head', Math.sin(t * 6) * 0.06, 0, 0);
    if (m.sleeping) { set(m, P, 'body', 1.57, 0, 0, 0, -8, 4); set(m, P, 'legL', 1.57, 0, 0, 0, -8, 4); set(m, P, 'legR', 1.57, 0, 0, 0, -8, 4); } // (pitch mirrored at render)
  },
  shambler(m, P, t) {
    const s = Math.sin(m.walkPhase) * m.walkAmt * 0.6;
    set(m, P, 'legL', s); set(m, P, 'legR', -s);
    set(m, P, 'body', 0.28, 0, Math.sin(m.walkPhase * 0.5) * 0.06);
    const reach = -1.25 + Math.sin(t * 2 + m.id) * 0.08;
    const wu = m.windAnim || 0;
    set(m, P, 'armL', reach - (m.attackAnim || 0) * 0.6 - wu * 0.9, 0.1, 0.05);
    set(m, P, 'armR', reach + 0.1 - (m.attackAnim || 0) * 0.6 - wu * 0.9, -0.1, -0.05);
    set(m, P, 'body', -wu * 0.25);
    set(m, P, 'head', m.headPitch - 0.3, m.headYaw, Math.sin(t * 1.1 + m.id) * 0.12);
    set(m, P, 'jaw', 0.25 + Math.abs(Math.sin(t * 1.7 + m.id)) * 0.25 + (m.attackAnim || 0) * 0.4);
  },
  stalker(m, P, t) {
    const s = Math.sin(m.walkPhase) * m.walkAmt * 0.55;
    set(m, P, 'legL', s); set(m, P, 'legR', -s);
    const wu = m.windAnim || 0;
    set(m, P, 'armL', -s * 0.4 + Math.sin(t * 0.9) * 0.1 - (m.attackAnim || 0) * 1.4 + wu * 0.9, 0, 0.12 + wu * 0.5);
    set(m, P, 'armR', s * 0.4 - Math.sin(t * 0.9) * 0.1 - (m.attackAnim || 0) * 1.4 + wu * 0.9, 0, -0.12 - wu * 0.5);
    set(m, P, 'head', m.headPitch, m.headYaw, Math.sin(t * 0.7 + m.id) * 0.2);
    set(m, P, 'body', 0.12);
  },
  golem(m, P, t) {
    const s = Math.sin(m.walkPhase * 0.7) * m.walkAmt * 0.5;
    set(m, P, 'legL', s); set(m, P, 'legR', -s);
    const wu = m.windAnim || 0;
    set(m, P, 'armL', -s * 0.7 - (m.attackAnim || 0) * 2.0 - wu * 2.4); set(m, P, 'armR', s * 0.7 - (m.attackAnim || 0) * 2.0 - wu * 2.4);
    set(m, P, 'body', 0, 0, Math.sin(m.walkPhase * 0.7) * 0.05 * m.walkAmt);
    set(m, P, 'head', m.headPitch, m.headYaw);
  },
  monkey(m, P, t) {
    ANIMS.biped(m, P, t);
    set(m, P, 'tail', Math.sin(t * 2) * 0.3, Math.sin(t * 1.5) * 0.4);
    set(m, P, 'armL', -0.3); set(m, P, 'armR', -0.3);
  },
  bird(m, P, t) {
    const s = Math.sin(m.walkPhase * 1.6) * m.walkAmt * 1.0;
    set(m, P, 'legL', s); set(m, P, 'legR', -s);
    const flap = (!m.onGround || m.flying) ? Math.sin(t * 22) * 0.9 + 0.4 : 0;
    set(m, P, 'wingL', 0, 0, flap); set(m, P, 'wingR', 0, 0, -flap);
    const peck = m.grazeT > 0 ? Math.abs(Math.sin(t * 9)) * 0.9 : 0;
    set(m, P, 'head', m.headPitch + peck, m.headYaw, 0, 0, Math.sin(m.walkPhase * 1.6) * m.walkAmt * 0.4);
  },
  waddle(m, P, t) {
    const s = Math.sin(m.walkPhase * 1.4) * m.walkAmt;
    set(m, P, 'legL', s * 0.6); set(m, P, 'legR', -s * 0.6);
    set(m, P, 'body', 0, 0, s * 0.18);
    set(m, P, 'wingL', 0, 0, 0.2 + Math.abs(s) * 0.3); set(m, P, 'wingR', 0, 0, -0.2 - Math.abs(s) * 0.3);
    set(m, P, 'head', m.headPitch, m.headYaw);
  },
  hop(m, P, t) {
    const hop = m.onGround ? 0 : 1;
    const s = Math.sin(m.walkPhase * 1.2) * m.walkAmt;
    set(m, P, 'body', -hop * 0.3 + s * 0.05);
    set(m, P, 'legBL', hop * 1.0); set(m, P, 'legBR', hop * 1.0);
    set(m, P, 'legFL', -hop * 0.6); set(m, P, 'legFR', -hop * 0.6);
    set(m, P, 'head', m.headPitch + hop * 0.2, m.headYaw);
    set(m, P, 'tail', 0, 0, 0, 0, Math.sin(t * 6) * 0.2);
  },
  fish(m, P, t) {
    set(m, P, 'tail', 0, Math.sin(t * (6 + m.walkAmt * 8)) * 0.5);
    set(m, P, 'body', m.flop ? Math.sin(t * 20) * 0.3 : 0, Math.sin(t * 3) * 0.08, m.flop ? 1.4 : 0);
  },
  bat(m, P, t) {
    const f = Math.sin(t * 28) * 1.0;
    set(m, P, 'wingL', 0, f * 0.3, f); set(m, P, 'wingR', 0, -f * 0.3, -f);
  },
  arthropod(m, P, t) {
    const n = m.model.legs || 4;
    for (let i = 0; i < n; i++) {
      const ph = m.walkPhase * 1.8 + i * 1.7;
      const s = Math.sin(ph) * m.walkAmt * 0.4;
      set(m, P, 'legL' + i, 0, s, Math.max(0, Math.cos(ph)) * m.walkAmt * 0.3);
      set(m, P, 'legR' + i, 0, -s, -Math.max(0, Math.cos(ph + Math.PI)) * m.walkAmt * 0.3);
    }
    const wu = m.windAnim || 0;
    set(m, P, 'head', m.headPitch * 0.3 - (m.attackAnim || 0) * 0.3 - wu * 0.4, m.headYaw * 0.5);
    set(m, P, 'body', -wu * 0.15, 0, 0, 0, wu * 0.8, wu * 1.2);
    const strike = m.attackAnim || 0;
    set(m, P, 'tail0', -0.4 - strike * 0.3); set(m, P, 'tail1', -0.2 - strike * 0.6); set(m, P, 'tail2', 0.3 + Math.sin(t * 3) * 0.1 - strike * 0.9);
  },
  float(m, P, t) {
    const b = Math.sin(t * 1.6 + m.id) * 1.2;
    set(m, P, 'body', 0, 0, 0, 0, b); set(m, P, 'head', m.headPitch, m.headYaw, 0, 0, b);
    set(m, P, 'armL', -0.3 + Math.sin(t * 1.2) * 0.15 - (m.attackAnim || 0) * 1.2, 0, 0.15, 0, b);
    set(m, P, 'armR', -0.3 - Math.sin(t * 1.2) * 0.15 - (m.attackAnim || 0) * 1.2, 0, -0.15, 0, b);
    set(m, P, 'shard0', 0, t * 2.2, 0, 0, b); set(m, P, 'shard1', 0, t * 2.2 + 3, 0, 0, b);
    set(m, P, 'tail', Math.sin(t * 2) * 0.3, Math.sin(t * 1.4) * 0.5);
  },
  fiend(m, P, t) {
    ANIMS.biped(m, P, t);
    const f = Math.sin(t * 16) * 0.7;
    set(m, P, 'wingL', 0, 0.3 + f * 0.6, 0); set(m, P, 'wingR', 0, -0.3 - f * 0.6, 0);
    const b = Math.sin(t * 2) * 1;
    for (const n of ['body', 'legL', 'legR']) set(m, P, n, 0, 0, 0, 0, b);
  },
};
