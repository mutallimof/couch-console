// The arcade kart controller (Task 2): an original "sphere kart" model.
//
//   A physics SPHERE does the moving: it has a travel direction (dir), a speed and a height with
//   gravity. The kart model only FOLLOWS it for show: it faces `heading` (which can differ from
//   `dir` while drifting), leans into turns and bounces when the sphere lands.
//
//   - Acceleration is fast at low speed and tapers off near the top speed (accelAt).
//   - Grip: the travel direction chases where the kart points; low grip = a slidey kart.
//   - Drift: hold DRIFT while turning and the travel direction locks into a fixed arc; steering
//     toward the turn tightens it, away widens it. Sparks charge three tiers (blue, orange,
//     purple); letting go fires a boost scaled by the tier, which can exceed the top speed.
//   - Vertical: the sphere sticks to the road until the road falls away faster than gravity
//     (crests) and then flies; landing gives a bounce (the 'land' event carries the impact).
//
// No graphics or DOM, so tests/arcade-kart.test.mjs can run it in Node. Every number lives in
// ARCADE_DEFAULTS (ow-kart/tuning.js lists them for the T slider panel).
import { clamp, angle } from './track-model.js';

export const ARCADE_DEFAULTS = {
  // movement
  accel: 24,          // m/s² at a standstill
  taper: 2.2,         // how sharply acceleration fades toward the top speed (higher = stays strong longer)
  accelFloor: 2.0,    // m/s² left when almost at the top speed (so you do reach it)
  brake: 30,          // m/s²
  drag: 5.5,          // m/s² when you let go of GAS
  turnRate: 1.55,     // rad/s of steering at full lock
  turnSpeed: 18,      // m/s at which steering reaches full strength (slower = less turning)
  highSpeedTurn: 0.22, // how much steering is reduced at the top speed (0..1)
  grip: 9,            // 1/s: how fast travel direction follows the nose (low = slidey)
  // drift
  driftMinSpeed: 12,  // m/s needed to start a drift
  driftAngle: 0.5,    // rad: how far the nose points into the turn while drifting
  driftArc: 0.95,     // rad/s: the locked turn rate of a drift
  driftSteer: 0.55,   // 0..1: how much steering widens (away) or tightens (toward) the arc
  driftBlend: 10,     // 1/s: how fast the nose swings to the drift angle
  driftExit: 8,       // 1/s: how fast the nose straightens after a drift
  charge1: 0.8,       // seconds of drifting for the blue sparks (tier 1)
  charge2: 1.8,       // ... orange (tier 2)
  charge3: 3.0,       // ... purple (tier 3)
  chargeSteer: 0.5,   // extra charge speed when steering into the turn
  // boost
  boost1Time: 0.7,    // seconds of boost fired by each tier
  boost2Time: 1.3,
  boost3Time: 2.0,
  boostStrength: 0.4, // top speed gain while boosting (0.4 = 40% over the top speed)
  boostTierGain: 0.25, // extra strength per tier above 1
  boostKick: 0.12,    // instant speed gain (fraction of top speed) when the boost fires
  boostAccel: 42,     // m/s² while boosting
  overspeedDecay: 14, // m/s² lost when above the allowed speed (boost running out)
  // body
  gravity: 30,        // m/s²
  landBounce: 4,      // m/s of falling speed that counts as a landing
};

// ---- the small pure rules (each one has a test) ----

/** Acceleration (m/s²) at speed v when the allowed top speed is `top`: strong from standstill, fading to a floor. */
export function accelAt(v, top, p = ARCADE_DEFAULTS) {
  if (v >= top) return 0;
  const x = clamp(v / top, 0, 1);
  return Math.max(p.accelFloor, p.accel * (1 - Math.pow(x, p.taper)));
}

/** Drift tier from the drift charge in seconds: 0 none, 1 blue, 2 orange, 3 purple. */
export function driftTier(charge, p = ARCADE_DEFAULTS) {
  return charge >= p.charge3 ? 3 : charge >= p.charge2 ? 2 : charge >= p.charge1 ? 1 : 0;
}

/** How fast the charge grows: steering into the turn charges faster. */
export function chargeRate(steerIntoTurn, p = ARCADE_DEFAULTS) {
  return 1 + p.chargeSteer * clamp(steerIntoTurn, 0, 1);
}

/** The boost a tier fires: its duration and how far over the top speed it may go. */
export function boostSpec(tier, p = ARCADE_DEFAULTS) {
  if (!tier) return { time: 0, scale: 0, strength: 0 };
  const time = [0, p.boost1Time, p.boost2Time, p.boost3Time][tier];
  const scale = 1 + p.boostTierGain * (tier - 1);
  return { time, scale, strength: p.boostStrength * scale };
}

/** Boosts that do not come from a drift (pads, items, rocket start) act like a tier-2 boost. */
export const DEFAULT_BOOST_SCALE = 1.25;

/** Highest speed allowed right now. `top` is the normal top speed (coins and kart stats included). */
export function speedCap(top, boosting, boostScale, p = ARCADE_DEFAULTS) {
  return boosting ? top * (1 + p.boostStrength * (boostScale || DEFAULT_BOOST_SCALE)) : top;
}

/** Turn-rate factor from speed: no turning at standstill, full from turnSpeed, a bit less at the top. */
export function turnFactor(speed, top, p = ARCADE_DEFAULTS) {
  const base = clamp(speed / p.turnSpeed, -0.5, 1);
  const fast = clamp((Math.abs(speed) - top * 0.6) / (top * 0.6), 0, 1);
  return base * (1 - p.highSpeedTurn * fast);
}

/**
 * One step of horizontal driving for racer r (before the track position is worked out).
 * ctx: { dt, p, top, input, steer, spinning, offroad, emit(type, extra) }
 *   top = normal top speed with coins / kart stats / computer skill; offroad slows the cap.
 */
export function arcadeDrive(r, ctx) {
  const { dt, p, input, steer, spinning, emit } = ctx;
  r.arcade = true;
  if (r.dir === undefined) { r.dir = r.heading; r.lean = 0; r.vy = 0; r.air = false; }
  const air = !!r.air, gliding = !!r.gliding;
  const drifting = () => r.drift !== 0;

  // --- drift: hop on a fresh press, lock in when steering, release = boost ---
  if (input.drift && !r.lastInput.drift && r.speed > 8 && !gliding && !spinning) {
    r.hop = 0.36;
    emit('hop');
  }
  if (input.drift && !drifting() && Math.abs(steer) > 0.14 && r.speed > p.driftMinSpeed && !gliding && !spinning) {
    r.drift = Math.sign(steer);
    r.charge = 0;
    r.tier = 0;
  }
  if (drifting() && (!input.drift || r.speed < 8 || spinning || gliding)) {
    const tier = driftTier(r.charge, p), spec = boostSpec(tier, p);
    if (tier && !spinning) {
      r.boost = Math.max(r.boost, spec.time);
      r.boostScale = spec.scale;
      r.boostTier = tier;
      r.speed = Math.max(r.speed, ctx.top * (1 + p.boostKick * spec.scale)); // the kick when it fires
      emit('turbo', { tier });
    }
    r.drift = 0; r.charge = 0; r.tier = 0;
  }
  if (drifting() && !air) {
    r.charge += dt * chargeRate(steer * r.drift, p);
    const tier = driftTier(r.charge, p);
    if (tier > r.tier) { r.tier = tier; emit('drift', { tier }); }
  }

  // --- speed: strong at first, tapering; a boost may exceed the top speed ---
  const boosting = r.boost > 0 || r.star > 0;
  let cap = ctx.top;
  if (r.boost > 0) cap = speedCap(ctx.top, true, r.boostScale, p);
  if (r.star > 0) cap = Math.max(cap, ctx.top * 1.45);
  if (ctx.offroad && !boosting) cap *= 0.43;
  let v = r.speed;
  if (spinning) v *= Math.exp(-5 * dt);
  else if (air) { /* no pushing in the air: the sphere keeps its speed */ }
  else if (input.brake) v = Math.max(-10, v - p.brake * dt);
  else if (input.gas) {
    if (v < cap) v = Math.min(cap, v + (boosting ? p.boostAccel : accelAt(v, cap, p) * r.kit.accel) * dt);
  } else v = Math.sign(v) * Math.max(0, Math.abs(v) - p.drag * dt);
  if (v > cap) v = Math.max(cap, v - p.overspeedDecay * dt);
  r.speed = v;
  if (r.boost <= 0) { r.boostScale = undefined; r.boostTier = 0; }

  // --- direction: the nose steers, the sphere's travel direction follows (or is locked in a drift) ---
  const turnK = turnFactor(r.speed, ctx.top, p) * (air ? 0.4 : 1) * (gliding ? 0.52 : 1) * r.kit.turn;
  if (drifting()) {
    const arc = r.drift * p.driftArc * (1 + p.driftSteer * steer * r.drift) * clamp(r.speed / 20, 0, 1) * (air ? 0.5 : 1);
    r.dir = angle(r.dir + arc * dt * r.kit.turn);
    const target = angle(r.dir + r.drift * p.driftAngle * (1 + 0.25 * steer * r.drift));
    r.heading = angle(r.heading + angle(target - r.heading) * (1 - Math.exp(-p.driftBlend * dt)));
  } else {
    r.heading = angle(r.heading + steer * p.turnRate * turnK * dt);
    if (!air) { // the nose and the travel direction meet in the middle (grip), e.g. after a drift
      const off = angle(r.heading - r.dir);
      r.dir = angle(r.dir + off * (1 - Math.exp(-p.grip * dt)));
      r.heading = angle(r.heading - off * (1 - Math.exp(-p.driftExit * dt)) * 0.5);
    }
  }

  // --- lean into the turn (visual) ---
  const leanTarget = clamp(steer * 0.55 + r.drift * 0.7, -1, 1) * clamp(r.speed / 25, 0, 1);
  r.lean += (leanTarget - r.lean) * (1 - Math.exp(-10 * dt));

  // --- move the sphere sideways (contacts add a sideways push relative to the nose) ---
  const side = gliding ? 0 : (r.sideVelocity || 0);
  r.x += (Math.sin(r.dir) * r.speed + Math.cos(r.heading) * side) * dt;
  r.z += (-Math.cos(r.dir) * r.speed + Math.sin(r.heading) * side) * dt;
}

/**
 * After a wall touch: the sphere slides along the wall instead of bouncing back.
 * tangent = the road's heading there, side = which wall (-1 left / +1 right).
 */
export function arcadeWall(r, tangent, side) {
  if (r.dir === undefined) return;
  const error = angle(r.dir - tangent);
  if (Math.sign(error) === side && Math.abs(error) > 0.01) {
    const next = angle(tangent + error * 0.6), delta = angle(next - r.dir);
    r.dir = next;
    r.heading = angle(r.heading + delta);
    r.speed *= 0.86;
    if (r.drift) r.charge *= 0.5; // scraping a wall loses some of the charge
  }
}

/**
 * The sphere's height. groundY = the road's height under it now. It stays on the road until the
 * road falls away faster than gravity can pull (a crest) and then flies; landing reports its impact.
 */
export function arcadeVertical(r, groundY, dt, p, emit) {
  if (r.vy === undefined) { r.vy = 0; r.air = false; }
  if (!r.air) {
    const free = r.y + r.vy * dt - 0.5 * p.gravity * dt * dt; // where gravity alone would put the sphere
    if (free > groundY + 0.03) {
      r.air = true;
      r.vy -= p.gravity * dt;
      r.y = free;
    } else {
      r.vy = clamp((groundY - r.y) / dt, -40, 40);
      r.y = groundY;
    }
    return;
  }
  r.vy -= p.gravity * dt;
  r.y += r.vy * dt;
  if (r.y <= groundY) {
    const impact = Math.max(0, -r.vy);
    r.y = groundY;
    r.vy = 0;
    r.air = false;
    r.landed = impact;
    if (impact >= p.landBounce) emit('land', { impact });
  }
}
