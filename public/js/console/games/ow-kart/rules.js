// The kart race rules: handling, drifting with three turbo levels, boosts, coins, item boxes and
// the items themselves, glide ramps, kart-to-kart bumping, the computer drivers and laps.
// No graphics or DOM: fixed 120 Hz steps, seeded, tested in Node (tests/ow-kart-*.test.mjs).
// Ported from OpenWii's games/mario-kart/logic.js (MIT, Copyright (c) 2026 Patrick Sun; see
// THIRD_PARTY_NOTICES.md). Physics numbers and formulas are unchanged. Changes:
//   - the track is an object passed in (this.track), not module globals;
//   - several human players (split screen), not exactly one;
//   - our own item and character names (the same six items by behavior);
//   - the imported-course, anti-gravity and ramp-jump branches are removed.
import { contactResponse, kartContact } from './contact.js';
import { roadFrame } from './frame.js';
import { wrap, clamp, angle } from './track-model.js';

// The six items, by behavior: slick (dropped behind you), orb (rolls ahead, bounces off walls),
// seeker (homes in on the kart ahead), turbo (a boost), star (invincible for a while), comet (hits the leader)
export const ITEMS = ['slick', 'orb', 'seeker', 'turbo', 'star', 'comet'];
export const FIXED_DT = 1 / 120;
// Computer drivers' skill: how close they get to the top speed (the human players ignore it)
export const SKILLS = [0.96, 0.94, 0.93, 0.99, 0.92, 1.01, 0.97, 0.91];
export const EVENT_TYPES = [
  'countdown', 'go', 'rocket', 'burnout', 'hop', 'drift', 'turbo', 'boost', 'coin', 'box', 'itemReady',
  'useItem', 'hit', 'wall', 'glider', 'land', 'lap', 'finalLap', 'finish', 'results', 'bump', 'contact',
];

export function seeded(seed = 381) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function topSpeed(coins = 0) { return 36 + clamp(coins, 0, 10) * 0.55; }
export function turboTier(charge) { return charge >= 3.4 ? 3 : charge >= 2 ? 2 : charge >= 0.8 ? 1 : 0; }

export function rollItem(position, rng = Math.random) {
  const rear = clamp((position - 1) / 7, 0, 1);
  // order: slick, orb, seeker, turbo, star, comet (more helpful items the further back you are)
  const weights = [0.42 * (1 - rear) + 0.04, 0.36 * (1 - rear) + 0.07, 0.16, 0.04 + 0.29 * rear, 0.01 + 0.26 * rear, 0.01 + 0.16 * rear];
  let n = clamp(rng(), 0, 0.999999) * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    n -= weights[i];
    if (n < 0) return ITEMS[i];
  }
  return 'turbo';
}

function makeRacer(T, character, i, humans) {
  // Grid: two columns behind the line, the human players at the back
  const grid = i < humans ? 7 - i : i - humans;
  const progress = -8 - Math.floor(grid / 2) * 6 - (grid % 2) * 0.5, side = grid % 2 ? 3 : -3;
  const p = T.surfaceAt(progress, side);
  return {
    id: i, character, skill: character.skill ?? SKILLS[i % SKILLS.length], progress, s: wrap(progress, T.length),
    x: p.x, z: p.z, y: p.y, heading: p.heading, lateral: side,
    speed: 0, sideVelocity: 0, contactCooldown: 0, contactAnimation: 0, steer: 0, coins: 0, lap: 1,
    nextCheckpoint: T.length / 8, checkpoints: 0, finishTime: null,
    drift: 0, charge: 0, tier: 0, hop: 0, boost: 0, star: 0, spin: 0, invulnerable: 0,
    gliding: false, flight: 0, flightY: 0, flightV: 0, item: null, roulette: 0, gasDownAt: null,
    lastInput: {}, itemDelay: 3 + i * 0.37, wallCooldown: 0, bumpCooldown: 0,
  };
}

export class Race {
  /**
   * track: a track model (track-model.js). characters: the 8 racers' characters, the human players
   * first (humans = how many). laps: 1 or 3.
   */
  constructor({ track, characters, humans = 1, seed = 381, laps = 3, burnout = true, onEvent = () => {} }) {
    this.track = track;
    this.burnout = burnout; // holding GAS far too early at the start spins you out (OpenWii). Off in our game: Auto-gas holds GAS.
    this.laps = laps === 1 ? 1 : 3;
    this.finishedAt = null;
    this.seed = seed;
    this.rng = seeded(seed);
    this.onEvent = onEvent;
    this.state = 'ready';
    this.time = 0;
    this.raceTime = 0;
    this.accumulator = 0;
    this.racers = characters.slice(0, 8).map((c, i) => makeRacer(track, c, i, humans));
    this.humans = this.racers.slice(0, humans);
    this.player = this.racers[0];
    this.objects = [];
    this.nextId = 1;
    this.finishOrder = [];
    this.boxes = track.itemRows.map((p, id) => ({ ...p, id, respawn: 0 }));
    this.coins = track.coinSpots.map((p, id) => ({ ...p, id, respawn: 0 }));
    this.count = 3;
    this.pendingItem = this.humans.map(() => false);
  }
  emit(type, racer = this.player, extra = {}) {
    this.onEvent({ type, racer: racer.id, time: this.time, ...extra });
  }
  start() {
    if (this.state !== 'ready') return;
    this.state = 'countdown';
    this.time = 0;
    this.emit('countdown', this.player, { count: 3 });
  }
  get standings() {
    return [...this.racers].sort((a, b) => (a.finishTime !== null
      ? (b.finishTime !== null ? a.finishTime - b.finishTime : -1)
      : (b.finishTime !== null ? 1 : b.progress - a.progress)));
  }
  position(r) { return this.standings.indexOf(r) + 1; }

  /** inputs: one { gas, brake, drift, item, steer } per human player (an array), or a single object for one player */
  update(dt, inputs = []) {
    if (!Number.isFinite(dt) || dt <= 0 || this.state === 'ready') return;
    const list = Array.isArray(inputs) ? inputs : [inputs];
    // A long background stall pauses instead of running a race without the drivers.
    this.accumulator += Math.min(dt, 0.25);
    list.forEach((inp, i) => { if (inp?.item) this.pendingItem[i] = true; });
    while (this.accumulator + 1e-10 >= FIXED_DT) {
      this.step(FIXED_DT, this.humans.map((_, i) => ({ ...(list[i] || {}), item: this.pendingItem[i] })));
      this.pendingItem = this.humans.map(() => false);
      this.accumulator -= FIXED_DT;
    }
  }

  step(dt, inputs) {
    this.time += dt;
    if (this.state === 'countdown') {
      this.humans.forEach((h, i) => {
        const input = inputs[i] || {};
        if (input.gas && !h.lastInput.gas) h.gasDownAt = this.time;
        if (!input.gas) h.gasDownAt = null;
        h.lastInput = { ...input };
      });
      const n = Math.max(0, 3 - Math.floor(this.time));
      if (n !== this.count) {
        this.count = n;
        if (n) this.emit('countdown', this.player, { count: n });
      }
      if (this.time + 1e-9 < 3) return;
      this.state = 'racing';
      this.count = 0;
      this.emit('go');
      for (const h of this.humans) {
        // Rocket start: press GAS in the second-light window; hold it too early and the tyres burn out
        const held = h.gasDownAt === null ? 0 : 3 - h.gasDownAt;
        if (held >= 0.7 && held <= 1.5) { h.boost = 1.8; h.speed = 24; this.emit('rocket', h); }
        else if (held > 1.8 && this.burnout) { h.spin = 1.05; this.emit('burnout', h); }
      }
    }
    this.raceTime += dt;
    for (const p of [...this.boxes, ...this.coins]) p.respawn = Math.max(0, p.respawn - dt);
    const oldProgress = new Map(this.racers.map((r) => [r.id, r.progress]));
    for (const r of this.racers) {
      const hi = this.humans.indexOf(r), auto = hi < 0 || r.finishTime !== null;
      this.move(r, auto ? this.cpuInput(r) : inputs[hi], dt, auto);
    }
    this.collisions(dt);
    this.updateObjects(dt, oldProgress);
    // Same-step finishes are ordered by their interpolated line-crossing time, not array order
    this.finishOrder = this.racers.filter((r) => r.finishTime !== null).sort((a, b) => a.finishTime - b.finishTime).map((r) => r.id);
    for (const h of this.humans) {
      if (h.finishTime !== null && !h.finishAnnounced) { h.finishAnnounced = true; this.emit('finish', h); }
    }
    if (this.state === 'racing' && this.humans.every((h) => h.finishTime !== null)) {
      this.state = 'finishing';
      this.finishedAt = this.time;
    }
    if (this.state === 'finishing' && this.finishOrder.length === this.racers.length) this.showResults();
  }
  showResults() {
    if (this.state !== 'finishing') return;
    this.state = 'results';
    this.emit('results');
  }

  cpuInput(r) {
    // Pure pursuit: aim at a point ahead on the road, in a lane that wanders a little
    const T = this.track;
    const lead = clamp(9 + Math.abs(r.speed) * 0.32, 9, 23), lane = Math.sin(this.raceTime * 0.19 + r.id * 2.1) * 3.5;
    const p = T.surfaceAt(r.s + lead, lane), desired = Math.atan2(p.x - r.x, -(p.z - r.z));
    const steer = clamp(angle(desired - r.heading) * 2.8, -1, 1);
    r.itemDelay -= FIXED_DT;
    return { gas: true, steer, drift: Math.abs(steer) > 0.22 && r.speed > 22 && !r.gliding, item: !!r.item && r.itemDelay < 0 };
  }

  move(r, raw, dt, auto = false) {
    const T = this.track, L = T.length;
    const input = {
      gas: !!raw.gas, brake: !!raw.brake, drift: !!raw.drift, item: !!raw.item,
      steer: Number.isFinite(raw.steer) ? clamp(raw.steer, -1, 1) : 0,
    };
    for (const k of ['hop', 'boost', 'star', 'spin', 'invulnerable', 'wallCooldown', 'bumpCooldown', 'contactCooldown', 'contactAnimation']) {
      r[k] = Math.max(0, (r[k] || 0) - dt);
    }
    r.sideVelocity = (r.sideVelocity || 0) * Math.exp(-dt * 2.5);
    if (r.itemUse) r.itemUse.age += dt;
    if (r.roulette > 0) {
      r.roulette -= dt;
      if (r.roulette <= 0) {
        r.item = rollItem(this.position(r), this.rng);
        this.emit('itemReady', r, { item: r.item });
      }
    }
    if (input.item && !r.lastInput.item) this.useItem(r);
    const spinning = r.spin > 0;
    const steer = spinning ? 0 : input.steer;
    r.steer += (steer - r.steer) * (1 - Math.exp(-dt * 20));
    if (input.drift && !r.lastInput.drift && r.speed > 8 && !r.gliding && !spinning) {
      r.hop = 0.36;
      this.emit('hop', r);
    }
    if (input.drift && !r.drift && Math.abs(steer) > 0.14 && r.speed > 12 && !r.gliding && !spinning) {
      r.drift = Math.sign(steer);
      r.charge = 0;
    }
    if (r.drift && (!input.drift || r.speed < 8 || spinning || r.gliding)) {
      const tier = turboTier(r.charge);
      if (tier && !spinning) {
        r.boost = Math.max(r.boost, [0, 0.65, 1.35, 2.15][tier]);
        this.emit('turbo', r, { tier });
      }
      r.drift = 0; r.charge = 0; r.tier = 0;
    }
    if (r.drift) {
      r.charge += dt * (0.7 + 0.7 * Math.abs(steer));
      const tier = turboTier(r.charge);
      if (tier > r.tier) { r.tier = tier; this.emit('drift', r, { tier }); }
    }
    const offroad = !r.gliding && Math.abs(r.lateral) > T.roadHalf + 0.2;
    let max = topSpeed(r.coins);
    if (auto) {
      // computer drivers: a skill factor and a gentle rubber band toward the leading human
      const lead = Math.max(...this.humans.map((h) => h.progress));
      max *= r.skill * clamp(1 + (lead - r.progress) / 1400, 0.93, 1.09);
    }
    if (r.boost > 0) max = 55;
    if (r.star > 0) max = 53;
    if (offroad && r.boost <= 0 && r.star <= 0) max *= 0.43;
    if (spinning) r.speed *= Math.exp(-5 * dt);
    else if (input.brake) r.speed = Math.max(-10, r.speed - 28 * dt);
    else if (input.gas) {
      r.speed += (r.boost > 0 || r.star > 0 ? 35 : 15) * dt;
      r.speed = Math.min(r.speed, max);
    } else r.speed = Math.sign(r.speed) * Math.max(0, Math.abs(r.speed) - 5.5 * dt);
    if (r.speed > max) r.speed = Math.max(max, r.speed - 36 * dt);
    // No yaw momentum or centrifugal term: zero wheel means exactly straight. Turn rate is bounded at every speed.
    const turn = (r.drift ? r.drift * 0.12 + r.steer * 0.92 : r.steer) * 1.48;
    const turnAngle = turn * clamp(r.speed / 20, -0.5, 1) * dt * (r.gliding ? 0.52 : 1);
    const previousS = r.s, previousProgress = r.progress;
    r.heading = angle(r.heading + turnAngle);
    r.x += (Math.sin(r.heading) * r.speed + (!r.gliding ? Math.cos(r.heading) * r.sideVelocity : 0)) * dt;
    r.z += (-Math.cos(r.heading) * r.speed + (!r.gliding ? Math.sin(r.heading) * r.sideVelocity : 0)) * dt;
    const near = T.project(r.x, r.z, r.s);
    r.s = near.s;
    r.lateral = near.lateral;
    const wall = T.wallHalf;
    if (r.lateral < -wall || r.lateral > wall) {
      const side = r.lateral < -wall ? -1 : 1, edge = clamp(r.lateral, -wall, wall), p = T.surfaceAt(r.s, edge);
      r.x = p.x;
      r.z = p.z;
      r.lateral = edge;
      // Wall glancing is a slide, never a forced 180-degree bounce
      const tangent = T.trackAt(r.s).heading, error = angle(r.heading - tangent);
      if (Math.sign(error) === side && Math.abs(error) > 0.01) {
        r.heading = angle(tangent + error * 0.6);
        r.speed *= 0.86;
      }
      if (r.wallCooldown <= 0) { this.emit('wall', r); r.wallCooldown = 0.5; }
    }
    let advance = wrap(r.s - previousS + L / 2, L) - L / 2;
    advance = clamp(advance, -Math.abs(r.speed) * dt * 2 - 1, Math.abs(r.speed) * dt * 2 + 1);
    r.progress += advance;
    // Sequential eighth-lap gates: line oscillation, reversing or a crossing between overlapping roads can't award a lap
    while (r.finishTime === null && r.progress >= r.nextCheckpoint && previousProgress < r.nextCheckpoint) {
      r.checkpoints++;
      r.nextCheckpoint += L / 8;
      if (r.checkpoints % 8 === 0) {
        if (r.checkpoints === this.laps * 8 && r.finishTime === null) {
          const f = clamp((this.laps * L - previousProgress) / Math.max(1e-9, r.progress - previousProgress), 0, 1);
          r.finishTime = this.raceTime - dt + f * dt;
        } else if (r.checkpoints < this.laps * 8) {
          r.lap = r.checkpoints / 8 + 1;
          this.emit(r.lap === this.laps ? 'finalLap' : 'lap', r);
        }
      }
    }
    // Glide ramps: crossing a ramp's start at speed launches the glider
    for (const g of T.glides) {
      if (!r.gliding && wrap(previousS - g.start + L / 2, L) - L / 2 < 0 && wrap(r.s - g.start + L / 2, L) - L / 2 >= 0 && advance > 0 && r.speed > 0) {
        r.speed = Math.max(r.speed, 26);
        r.boost = Math.max(r.boost, 0.5);
        r.gliding = true;
        r.glide = g;
        r.flight = 0;
        r.flightY = T.surfaceAt(g.start, r.lateral).y + 1;
        r.flightV = 6;
        this.emit('glider', r);
      }
    }
    if (r.gliding) {
      r.flight += dt;
      r.flightV -= 9 * dt;
      r.flightY += r.flightV * dt;
      const ground = T.surfaceAt(r.s, r.lateral);
      r.flightY = Math.max(r.flightY, ground.y + 0.2);
      r.y = r.flightY;
      const past = wrap(r.s - r.glide.start, L) >= r.glide.end - r.glide.start && wrap(r.s - r.glide.start, L) < L / 2;
      if ((past && r.flightY <= ground.y + 1) || r.flight > 6) {
        r.gliding = false;
        r.y = ground.y;
        r.boost = Math.max(r.boost, 0.3);
        this.emit('land', r);
      }
    } else r.y = T.surfaceAt(r.s, r.lateral).y;
    for (const pad of T.boostPads) {
      if (Math.abs(wrap(r.s - pad.s + L / 2, L) - L / 2) < pad.length / 2 && Math.abs(r.lateral - pad.lateral) < pad.width / 2 && !r.gliding) {
        if (r.boost < 0.2) this.emit('boost', r);
        r.boost = Math.max(r.boost, 0.65);
      }
    }
    if (r.finishTime === null && !spinning) {
      for (const c of this.coins) {
        if (!c.respawn && this.touches(r, c, 2.1)) {
          r.coins = Math.min(10, r.coins + 1);
          c.respawn = 5;
          this.emit('coin', r);
        }
      }
      for (const b of this.boxes) {
        if (!b.respawn && !r.item && r.roulette <= 0 && this.touches(r, b, 2.5)) {
          b.respawn = 1;
          r.roulette = 1.65;
          this.emit('box', r, { box: this.boxes.indexOf(b) });
        }
      }
    }
    r.lastInput = input;
  }
  touches(r, p, radius) {
    const L = this.track.length;
    return Math.abs(wrap(r.s - p.s + L / 2, L) - L / 2) < radius && Math.abs(r.lateral - p.lateral) < radius;
  }

  useItem(r = this.player) {
    if (!r.item || r.roulette > 0 || r.finishTime !== null || r.spin > 0) return false;
    const T = this.track, L = T.length;
    const type = r.item;
    r.item = null;
    r.itemUse = { type, age: 0 };
    r.itemDelay = 2 + this.rng() * 3;
    this.emit('useItem', r, { item: type, projectile: ['orb', 'seeker', 'comet'].includes(type) ? this.nextId : null });
    if (type === 'turbo') r.boost = Math.max(r.boost, 2.3);
    else if (type === 'star') { r.star = 7; r.spin = 0; }
    else {
      const ordered = this.standings.filter((k) => k.id !== r.id && k.finishTime === null);
      const target = type === 'comet' ? ordered[0] : ordered.filter((k) => k.progress > r.progress).at(-1);
      const direction = type === 'slick' ? -1 : 1;
      this.objects.push({
        id: this.nextId++, type, owner: r.id, s: wrap(r.s + direction * 3.5, L), lateral: r.lateral,
        speed: type === 'slick' ? 0 : type === 'comet' ? 77 : type === 'seeker' ? 62 : 58,
        age: 0, life: type === 'slick' ? 40 : 12, target: target?.id,
        lateralVelocity: type === 'orb' ? Math.sin(angle(r.heading - T.trackAt(r.s).heading)) * 30 : 0,
      });
    }
    return true;
  }
  hit(r, cause = 'orb', attacker = null) {
    if (r.star > 0 || r.invulnerable > 0 || r.finishTime !== null) return false;
    r.spin = cause === 'comet' ? 1.65 : 1.1;
    r.invulnerable = 2.3;
    r.speed *= 0.35;
    r.coins = Math.max(0, r.coins - 3);
    r.drift = 0; r.charge = 0; r.tier = 0; r.boost = 0;
    this.emit('hit', r, { cause, attacker });
    return true;
  }

  collisions(dt) {
    const T = this.track;
    const touched = new Set();
    // Several passes resolve a pack together: a later pair must not leave an earlier pair interpenetrating
    for (let pass = 0; pass < 6; pass++) {
      let contacts = 0;
      for (let i = 0; i < this.racers.length; i++) {
        for (let j = i + 1; j < this.racers.length; j++) {
          const a = this.racers[i], b = this.racers[j];
          if (a.finishTime !== null || b.finishTime !== null) continue;
          const contact = kartContact(T, a, b, this.time);
          if (!contact) continue;
          contacts++;
          for (const [r, sign] of [[a, -1], [b, 1]]) {
            r.x += sign * contact.x * 0.5;
            r.z += sign * contact.z * 0.5;
            const near = T.project(r.x, r.z, r.s);
            const lateral = clamp(near.lateral, -T.wallHalf, T.wallHalf), p = T.surfaceAt(near.s, lateral);
            if (lateral !== near.lateral) { r.x = p.x; r.z = p.z; }
            r.lateral = lateral;
            if (!r.gliding) r.y = p.y;
          }
          const pair = i * this.racers.length + j;
          if (touched.has(pair)) continue;
          touched.add(pair);
          if (!a.gliding && !b.gliding) {
            const frame = (r) => roadFrame(T, r.s, r.lateral, r.heading);
            const impact = contactResponse(a, b, frame(a), frame(b), contact);
            if (impact > 1.5) {
              for (const r of [a, b]) {
                if (r.contactCooldown <= 0) {
                  r.contactAnimation = 0.42;
                  r.contactCooldown = 0.3;
                  this.emit('contact', r, { impact, other: r === a ? b.id : a.id });
                }
              }
            }
          }
          if (a.star > 0) this.hit(b, 'star', a.id);
          if (b.star > 0) this.hit(a, 'star', b.id);
        }
      }
      if (!contacts) break;
    }
  }

  updateObjects(dt, oldProgress) {
    const T = this.track, L = T.length;
    for (const o of this.objects) {
      o.age += dt;
      o.life -= dt;
      const oldS = o.s;
      const target = this.racers.find((r) => r.id === o.target && r.finishTime === null);
      if (o.type === 'comet' && o.attack != null) {
        if (!target) { o.life = 0; continue; }
        o.attack += dt; o.s = target.s; o.lateral = target.lateral;
        if (o.attack >= 0.85) {
          for (const k of this.racers) if (Math.abs(wrap(k.s - target.s + L / 2, L) - L / 2) < 7) this.hit(k, 'comet', o.owner);
          o.life = 0;
        }
        continue;
      }
      if (target && ['seeker', 'comet'].includes(o.type)) o.lateral += (target.lateral - o.lateral) * (1 - Math.exp(-dt * 7));
      o.s = wrap(o.s + o.speed * dt, L);
      o.lateral += o.lateralVelocity * dt;
      if (o.lateral < -T.wallHalf + 1 || o.lateral > T.wallHalf - 1) {
        o.lateral = clamp(o.lateral, -T.wallHalf + 1, T.wallHalf - 1);
        o.lateralVelocity *= -1;
      }
      for (const r of this.racers) {
        if ((r.id === o.owner && o.age < 0.75) || r.finishTime !== null) continue;
        if (o.type === 'comet' && r.id !== o.target) continue;
        // Swept relative segment, tested independently so fast projectiles can't tunnel through a kart
        const a = wrap(oldS - wrap(oldProgress.get(r.id), L) + L / 2, L) - L / 2;
        const b = a + o.speed * dt - (r.progress - oldProgress.get(r.id));
        const along = Math.min(Math.abs(a), Math.abs(b)) < 2 || a * b <= 0;
        if (along && Math.abs(o.lateral - r.lateral) < 2.3 && (!r.gliding || o.type === 'comet')) {
          if (o.type === 'comet') { o.attack = 0; o.s = r.s; o.lateral = r.lateral; } else { this.hit(r, o.type, o.owner); o.life = 0; }
          break;
        }
      }
    }
    this.objects = this.objects.filter((o) => o.life > 0);
  }
}
export function ordinal(n) { return `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`; }
export function formatTime(s) { return Number.isFinite(s) ? `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}` : '—'; }
