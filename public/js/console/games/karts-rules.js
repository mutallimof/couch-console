// Turbo Karts driving rules: speed, steering, drifting, boosts, walls, jumps, laps and
// bumping. No graphics and no sound, so they can be tested in Node (tests/karts.test.mjs).
// turbo-karts.js calls these and turns the events into sounds, rumble and animations.
//   events (onEvent(type, kart)): 'boost' · 'wall' · 'land' (hard landing) · 'final-lap' · 'finish'
//   · 'glide' (a glide ramp launched the kart) · 'trick' (landed a trick: a boost follows)
import { ROAD_HALF, WALL } from './kart-path.js';
import { SHRINK_TOP, SHRINK_WEIGHT, tickItemEffects } from './karts-items.js';

export const LAPS = 3;
export const HOP_TIME = 0.25; // seconds of the little hop that starts a drift (just for show)
// Glide ramps launch the kart and open a glider: it falls slowly and steers freely until it lands.
export const GLIDE_LAUNCH = 9, GLIDE_GRAVITY = 0.28, GLIDE_SINK = 4.5;
// Tricks: tap DRIFT in the air for a barrel roll; land it for a short boost.
export const TRICK_TIME = 0.45, TRICK_BOOST = 0.8;
export const COAST = 6, BRAKE = 30, OFFROAD = 0.5, BOOST_BONUS = 12, GRAVITY = 26, KART_SIZE = 3.2;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// What the buttons a player holds mean for the kart. DRIFT and ITEM keep accelerating
// (your thumb has moved off GAS to press them); BRAKE always wins over gas.
//   held: { steer, gas, brake, drift, item, tapped } -> input for stepKart
//   (tapped = DRIFT was pressed since the last step, even if already let go: a quick tap counts)
export function kartInput(held) {
  return {
    steer: held.steer || 0,
    gas: !!(held.gas || held.drift || held.item) && !held.brake,
    brake: !!held.brake,
    drift: !!held.drift,
    tapped: !!held.tapped,
  };
}

// One physics step for one kart.
//   input: { steer: -1..1, gas, brake, drift }
//   world: { track, raceTime, topScale (CPU skill and catch-up; 1 for players), bonus (extra top
//   speed in m/s, e.g. the Magnet's slipstream), onEvent(type, kart) }
// Only karts with a playerId can drift (the computer karts don't).
export function stepKart(k, dt, input, world) {
  const { track, onEvent } = world;
  const ph = k.phys, grip = track.def.grip;
  let { steer, gas, brake, drift = false } = input;
  const tap = input.tapped || (drift && !k.driftHeld); // DRIFT pressed this step (not just held)
  k.driftHeld = drift;
  if (k.spin > 0) { k.spin -= dt; steer = 0; gas = false; brake = false; drift = false; k.drifting = false; }
  k.hop = Math.max(0, (k.hop || 0) - dt);
  k.trick = Math.max(0, (k.trick || 0) - dt);
  // A trick: tap DRIFT while airborne (players only; one per jump)
  if (k.playerId && k.air && tap && !k.trickDone && k.spin <= 0) { k.trick = TRICK_TIME; k.trickDone = true; }
  const offroad = Math.abs(k.lateral) > ROAD_HALF + 1.6;
  // top speed: kart stat · coins · boost · grass · CPU skill (and a little catch-up help)
  let top = ph.top * (1 + Math.min(10, k.coins) * 0.012);
  if (k.boost > 0) top += BOOST_BONUS;
  if (offroad && k.boost <= 0) top *= OFFROAD;
  top *= world.topScale ?? 1;
  if (k.shrink > 0) top *= SHRINK_TOP; // struck by lightning: small and slower
  top += world.bonus ?? 0;
  tickItemEffects(k, dt);

  if (!k.air) {
    if (gas) k.v = Math.min(k.v + ph.accel * dt * (k.v < top * 0.4 ? 1.3 : 1), Math.max(top, k.v - 25 * dt));
    else k.v -= Math.sign(k.v) * Math.min(Math.abs(k.v), COAST * dt);
    if (k.v > top) k.v = Math.max(top, k.v - 25 * dt);
  }
  // Drift: hold DRIFT while turning fast (a little hop starts it). The charge builds; letting
  // go gives a mini-turbo (blue sparks = small, orange = big). Braking ends it with no turbo.
  if (k.playerId) {
    if (!k.drifting && drift && Math.abs(steer) > 0.3 && k.v > 15 && !k.air) {
      k.drifting = true; k.driftDir = Math.sign(steer); k.charge = 0; k.hop = HOP_TIME;
    }
    if (k.drifting && brake) k.drifting = false;
    if (k.drifting && (!drift || k.v < 10)) {
      if (k.charge > 2.2) giveBoost(k, 1.6, onEvent); else if (k.charge > 1.0) giveBoost(k, 1.0, onEvent);
      k.drifting = false;
    }
  }
  if (brake && !k.drifting && !k.air) k.v = Math.max(k.v - BRAKE * dt, -8);

  let turn;
  if (k.drifting) {
    turn = (k.driftDir * 0.65 + steer * 0.45) * ph.turn * 1.25;
    k.charge += dt * (0.8 + Math.abs(steer));
  } else {
    turn = steer * ph.turn * clamp(Math.abs(k.v) / 12, 0, 1) * Math.sign(k.v || 1) * (0.6 + 0.4 * grip);
  }
  if (k.air && !k.gliding) turn *= 0.3; // a glider steers freely in the air
  k.heading -= turn * dt; // positive steer = right = clockwise seen from above
  if (k.spin > 0) k.heading += dt * 9; // spinning out
  // drifting karts (and icy roads) slide outwards a little
  const slide = k.drifting ? k.driftDir * (0.35 + (1 - grip) * 0.6) : steer * (1 - grip) * 0.25;
  k.x += Math.sin(k.heading + slide) * k.v * dt;
  k.z += Math.cos(k.heading + slide) * k.v * dt;
  k.roll += (turn * 0.05 - k.roll) * Math.min(1, dt * 8);

  // Where are we on the track, and how high is the road here?
  const prev = k.idx;
  const loc = track.locate(k.x, k.z, k.idx, k.y);
  k.idx = loc.i; k.lateral = loc.lateral;
  lapCheck(k, prev, track.SAMPLES, world.raceTime, onEvent);
  // Height: follow the road, but fly off crests when the road drops away faster than gravity
  if (k.air) {
    k.vy -= GRAVITY * (k.gliding ? GLIDE_GRAVITY : 1) * dt;
    if (k.gliding) k.vy = Math.max(k.vy, -GLIDE_SINK); // floats down gently
    k.y += k.vy * dt;
    if (k.y <= loc.height) {
      k.y = loc.height; k.air = false; k.gliding = false;
      if (k.vy < -8) onEvent('land', k);
      k.vy = 0;
      if (k.trickDone) { k.trickDone = false; onEvent('trick', k); giveBoost(k, TRICK_BOOST, onEvent); }
    }
  } else {
    const vyRoad = (loc.height - k.y) / dt;
    // only real crests launch you into the air
    if (vyRoad < k.vy - GRAVITY * dt * 3 && k.v > 18) { k.air = true; k.vy = Math.max(k.vy, 2); k.y += k.vy * dt; }
    else { k.vy = vyRoad * 0.5 + k.vy * 0.5; k.y = loc.height; }
  }

  // Gliding follows the road's bends by itself (your steering adds to it), so a long glide
  // lands on the track instead of across a bend on the grass.
  if (k.gliding) {
    const ahead = track.pts[track.at(k.idx + 25)]; // aim at the middle of the road a little ahead
    k.heading += angleDiff(Math.atan2(ahead.x - k.x, ahead.z - k.z), k.heading) * Math.min(1, dt * 3);
  }

  // Barriers: bounce back in. A real hit costs speed; scraping only slows a little.
  k.wallCooldown -= dt;
  if (Math.abs(k.lateral) > WALL - 1.1) {
    const n = track.nor[k.idx], push = Math.sign(k.lateral) * (Math.abs(k.lateral) - (WALL - 1.1));
    k.x -= n.x * push; k.z -= n.z * push;
    const t = track.tan[k.idx];
    k.heading += angleDiff(Math.atan2(t.x, t.z), k.heading) * 0.3;
    if (k.wallCooldown < 0) {
      k.wallCooldown = 0.4; k.v *= 0.6;
      onEvent('wall', k);
    } else k.v *= 1 - 1.5 * dt;
  }
  // Glide ramps: full road width; you need a bit of speed to take off. A kart that the hill
  // before the ramp has just lifted off the road (still low) is caught too.
  for (const g of track.glides || []) {
    const di = Math.abs(((k.idx - g.i + track.SAMPLES * 1.5) % track.SAMPLES) - track.SAMPLES / 2);
    if (di < 3 && Math.abs(k.lateral) < ROAD_HALF && !k.gliding && k.y - loc.height < 2 && k.v > 15) {
      k.air = true; k.gliding = true; k.vy = GLIDE_LAUNCH; k.drifting = false;
      onEvent('glide', k);
    }
  }
  // Boost pads
  for (const pad of track.pads) {
    const di = Math.abs(((k.idx - pad.i + track.SAMPLES * 1.5) % track.SAMPLES) - track.SAMPLES / 2);
    if (di < 3 && Math.abs(k.lateral - pad.side) < 2.6 && k.boost < 0.8 && !k.air) giveBoost(k, 1.2, onEvent);
  }
  k.boost = Math.max(0, k.boost - dt);
  k.shield = Math.max(0, k.shield - dt);
}

export function giveBoost(k, seconds, onEvent) {
  k.boost = Math.max(k.boost, seconds);
  k.v = Math.max(k.v, k.phys.top + 4);
  onEvent('boost', k);
}

// Laps: crossing the line forward after passing halfway counts; going back over it un-counts.
export function lapCheck(k, prev, N, raceTime, onEvent) {
  if (k.idx > N * 0.4 && k.idx < N * 0.6) k.half = true;
  if (prev > N * 0.8 && k.idx < N * 0.2 && k.half) {          // crossed the line going forward
    k.lap++; k.half = false;
    if (k.lap > LAPS && k.finished == null) {
      k.finished = raceTime;
      onEvent('finish', k);
    } else if (k.lap === LAPS) { k.finalLapAt = raceTime; onEvent('final-lap', k); }
  } else if (prev < N * 0.2 && k.idx > N * 0.8) {             // went back over the line
    k.lap = Math.max(0, k.lap - 1); k.half = true;
  }
}

// Karts that touch push each other apart; heavier karts push lighter ones more.
export function bumpKarts(karts) {
  for (let a = 0; a < karts.length; a++) {
    for (let b = a + 1; b < karts.length; b++) {
      const A = karts[a], B = karts[b];
      const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz);
      if (d > 0 && d < KART_SIZE && Math.abs(A.y - B.y) < 2) {
        // heavier karts push lighter ones more
        const wa = A.phys.weight * (A.shrink > 0 ? SHRINK_WEIGHT : 1), wb = B.phys.weight * (B.shrink > 0 ? SHRINK_WEIGHT : 1), push = KART_SIZE - d, nx = dx / d, nz = dz / d;
        A.x -= nx * push * (wb / (wa + wb)); A.z -= nz * push * (wb / (wa + wb));
        B.x += nx * push * (wa / (wa + wb)); B.z += nz * push * (wa / (wa + wb));
        const avg = (A.v + B.v) / 2;
        A.v = A.v * 0.7 + avg * 0.3; B.v = B.v * 0.7 + avg * 0.3;
      }
    }
  }
}

// Race order: finished karts by finishing time, then by laps and distance
export const progress = (k, samples) => (k.finished != null ? 1e9 - k.finished * 1000 : k.lap * samples + k.idx);
