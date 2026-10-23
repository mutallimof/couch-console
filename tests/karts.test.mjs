// Turbo Karts driving rules on the real tracks, tested without a browser: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { trackPath, TRACKS, WALL } from '../public/js/console/games/kart-path.js';
import { stepKart, bumpKarts, kartInput, LAPS } from '../public/js/console/games/karts-rules.js';
import { KARTS, kartPhysics } from '../public/js/console/games/karts-data.js';

const DT = 1 / 180; // the game runs 3 physics steps per 60 Hz frame
const park = trackPath(THREE, TRACKS.find((t) => t.id === 'park'));

// A kart like startRace() makes, placed at sample i, `side` meters right of the center line
function kart(track, { i = 0, side = 0, kartId = 'racer', playerId = 1 } = {}) {
  const p = track.pts[i], n = track.nor[i], t = track.tan[i], def = KARTS.find((k) => k.id === kartId);
  return {
    playerId, kart: def, phys: kartPhysics(def),
    x: p.x + n.x * side, y: p.y, z: p.z + n.z * side, vy: 0, air: false,
    heading: Math.atan2(t.x, t.z), v: 0, idx: i, lateral: side, lap: 0, half: true, finished: null,
    drifting: false, driftDir: 0, charge: 0, boost: 0, wallCooldown: 0, roll: 0, spin: 0, shield: 0, coins: 0,
  };
}

// Drive for `secs` seconds. steerFn(k) -> -1..1 (default: follow the road like a CPU)
function drive(track, k, secs, { gas = true, brake = false, drift = false, steer = null, events = [], raceTime = { t: 0 } } = {}) {
  const world = { track, topScale: 1, onEvent: (type) => events.push(type) };
  for (let t = 0; t < secs; t += DT) {
    raceTime.t += DT;
    world.raceTime = raceTime.t;
    const s = steer ? steer(k) : followRoad(track, k);
    stepKart(k, DT, { steer: s, gas, brake: typeof brake === 'function' ? brake(k) : brake, drift }, world);
  }
  return events;
}
function followRoad(track, k) {
  const i = track.at(k.idx + 16), p = track.pts[i];
  const want = Math.atan2(p.x - k.x, p.z - k.z);
  return Math.max(-1, Math.min(1, Math.atan2(Math.sin(want - k.heading), Math.cos(want - k.heading)) * -2.2));
}

test('full gas reaches top speed and no more', () => {
  const k = kart(park);
  drive(park, k, 8);
  const top = k.phys.top;
  assert.ok(k.v > top * 0.95 && k.v <= top + 0.01, `speed ${k.v.toFixed(1)} vs top ${top.toFixed(1)}`);
});

test('braking stops the kart, and holding it reverses slowly', () => {
  const k = kart(park);
  drive(park, k, 3);
  const before = k.v;
  drive(park, k, 0.5, { gas: false, brake: true });
  assert.ok(k.v < before - 15, `half a second of brake: ${before.toFixed(1)} -> ${k.v.toFixed(1)} m/s`);
  drive(park, k, 2, { gas: false, brake: true });
  assert.equal(k.v, -8, 'reverse is capped at 8 m/s');
});

test('driving straight into the barrier stops at the wall and costs speed', () => {
  const k = kart(park, { i: 0 });
  drive(park, k, 3);
  const before = k.v;
  const events = drive(park, k, 1.5, { steer: () => 1 }); // hard right into the wall
  assert.ok(Math.abs(k.lateral) <= WALL, `lateral ${k.lateral.toFixed(2)} stays inside ${WALL}`);
  assert.ok(events.includes('wall'));
  assert.ok(k.v < before, 'slower after the hit');
});

test('grass is slow', () => {
  const road = kart(park), grass = kart(park, { side: 11 });
  drive(park, road, 4, { steer: () => 0 });
  drive(park, grass, 4, { steer: () => 0 });
  assert.ok(grass.v < road.v * 0.7, `grass ${grass.v.toFixed(1)} vs road ${road.v.toFixed(1)}`);
});

test('a long drift gives a turbo when you let go of DRIFT', () => {
  const k = kart(park, { i: 300 });
  drive(park, k, 3);
  const events = [];
  // hold DRIFT + steer for ~2 s (orange charge), then let go
  drive(park, k, 2, { drift: true, steer: () => 0.8, events });
  assert.ok(k.drifting, 'drifting while DRIFT is held');
  drive(park, k, DT * 2, { drift: false, events });
  assert.ok(!k.drifting && k.boost > 0, 'boost after letting go');
  assert.ok(events.includes('boost'));
});

test('a drift starts with a little hop', () => {
  const k = kart(park, { i: 300 });
  drive(park, k, 3);
  drive(park, k, DT * 3, { drift: true, steer: () => 0.8 });
  assert.ok(k.drifting && k.hop > 0);
});

test('braking ends a drift without a turbo', () => {
  const k = kart(park, { i: 300 });
  drive(park, k, 3);
  drive(park, k, 1, { drift: true, steer: () => 0.5 });
  assert.ok(k.drifting && k.charge > 1, 'a charged drift');
  const events = [];
  drive(park, k, DT * 2, { drift: true, brake: true, events });
  drive(park, k, DT * 2, { drift: false, events }); // and letting go of DRIFT afterwards
  assert.ok(!k.drifting);
  assert.ok(!events.includes('boost'), 'no turbo');
});

test('BRAKE alone does not drift any more (DRIFT does)', () => {
  const k = kart(park, { i: 300 });
  drive(park, k, 3);
  drive(park, k, 0.5, { brake: true, steer: () => 0.8 });
  assert.ok(!k.drifting);
});

test('computer karts do not drift', () => {
  const k = kart(park, { i: 300, playerId: null });
  drive(park, k, 3);
  drive(park, k, 1, { drift: true, steer: () => 0.8 });
  assert.ok(!k.drifting);
});

test('holding DRIFT or ITEM keeps accelerating; BRAKE wins over everything', () => {
  assert.equal(kartInput({ gas: true }).gas, true);
  assert.equal(kartInput({ drift: true }).gas, true, 'thumb slid from GAS to DRIFT');
  assert.equal(kartInput({ item: true }).gas, true, 'thumb on ITEM');
  assert.equal(kartInput({ gas: true, brake: true }).gas, false);
  assert.equal(kartInput({}).gas, false);
  // and on the track: DRIFT held without GAS still reaches speed
  const k = kart(park);
  drive(park, k, 4, { gas: kartInput({ drift: true }).gas, steer: () => 0 });
  assert.ok(k.v > 25, `speed ${k.v.toFixed(1)}`);
});

test(`${LAPS} laps around the park finishes the race, with a final-lap warning`, () => {
  const k = kart(park, { kartId: 'speedster' });
  k.lap = 1; k.half = false; // as at the start: crossing the line starts lap 1
  const events = drive(park, k, 200, { raceTime: { t: 0 } });
  assert.ok(events.includes('final-lap'));
  assert.ok(events.includes('finish'), `laps done: ${k.lap}`);
  assert.ok(k.finished > 30 && k.finished < 120, `race time ${k.finished?.toFixed(1)} s`);
});

test('driving backwards over the line takes a lap away', () => {
  const k = kart(park, { i: 5 });
  k.lap = 1; k.half = false;
  k.heading += Math.PI; // facing backwards
  drive(park, k, 1.5, { steer: () => 0 });
  assert.equal(k.lap, 0);
});

test('the park jump launches a fast kart into the air, and it lands', () => {
  // find the steepest drop on the park track and drive into it at full speed
  let drop = 0, at = 0;
  for (let i = 0; i < park.SAMPLES; i++) {
    const d = park.pts[i].y - park.pts[park.at(i + 10)].y;
    if (d > drop) { drop = d; at = i; }
  }
  const noRamp = { ...park, glides: [] }; // (a glide ramp sits before this crest; test the plain jump)
  const k = kart(noRamp, { i: park.at(at - 120), kartId: 'speedster' });
  let flew = false, landed = false;
  const world = { track: noRamp, topScale: 1, raceTime: 0, onEvent: () => {} };
  for (let t = 0; t < 5; t += DT) {
    stepKart(k, DT, { steer: followRoad(noRamp, k), gas: true, brake: false }, world);
    if (k.air) flew = true;
    else if (flew) landed = true;
  }
  assert.ok(flew, 'went airborne over the crest');
  assert.ok(landed, 'landed again');
});

test('a heavy kart pushes a light one further than the other way round', () => {
  const heavy = kart(park, { kartId: 'monster' }), light = kart(park, { kartId: 'roadster' });
  heavy.x = 0; heavy.z = 0; light.x = 2; light.z = 0;
  bumpKarts([heavy, light]);
  assert.ok(light.x - 2 > -heavy.x, `light moved ${(light.x - 2).toFixed(2)}, heavy moved ${(-heavy.x).toFixed(2)}`);
});

test('every track has a usable center line', () => {
  for (const def of TRACKS) {
    const t = trackPath(THREE, def);
    assert.ok(t.length > 500, `${def.id} is ${t.length.toFixed(0)} m long`);
    const l = t.locate(t.pts[500].x + t.nor[500].x * 3, t.pts[500].z + t.nor[500].z * 3, 495);
    assert.ok(Math.abs(l.i - 500) <= 1 && Math.abs(l.lateral - 3) < 0.1, `${def.id}: locate works`);
  }
});

// ---- Phase 24: glide ramps and tricks ----

test('a glide ramp launches the kart into a long, slow glide, and it lands again', () => {
  const g = park.glides[0];
  const k = kart(park, { i: park.at(g.i - 140), kartId: 'speedster' });
  const events = [];
  let glided = 0, landed = false;
  const world = { track: park, topScale: 1, raceTime: 0, onEvent: (type) => events.push(type) };
  for (let t = 0; t < 10; t += DT) {
    stepKart(k, DT, { steer: followRoad(park, k), gas: true, brake: false }, world);
    if (k.gliding) glided += DT;
    else if (glided > 0 && !k.air) { landed = true; break; }
  }
  assert.ok(events.includes('glide'), 'launched');
  assert.ok(glided > 1.5, `glided for ${glided.toFixed(1)} s (a normal jump is well under a second)`);
  assert.ok(landed, 'landed again');
});

test('too slow for the ramp = no take-off', () => {
  const g = park.glides[0];
  const k = kart(park, { i: park.at(g.i - 3) });
  k.v = 8;
  drive(park, k, 0.3, { gas: false, steer: () => 0 });
  assert.ok(!k.gliding);
});

test('tapping DRIFT in the air does a trick, and landing it gives a boost', () => {
  const k = kart(park, { i: 300 });
  drive(park, k, 2);
  k.air = true; k.vy = 6; // as if a crest launched it
  const events = [];
  drive(park, k, DT * 2, { drift: true, events }); // tap
  assert.ok(k.trick > 0, 'doing the trick');
  drive(park, k, 2, { drift: false, events });      // ...and land
  assert.ok(!k.air);
  assert.ok(events.includes('trick') && events.includes('boost'));
});

test('holding DRIFT from before the jump is not a trick (it has to be a fresh tap)', () => {
  const k = kart(park, { i: 300 });
  drive(park, k, 2, { drift: true, steer: () => 0 }); // held on the ground (no turn = no drift)
  k.air = true; k.vy = 6;
  const events = [];
  drive(park, k, 2, { drift: true, steer: () => 0, events });
  assert.ok(!events.includes('trick'));
});

test('computer karts glide but never do tricks', () => {
  const k = kart(park, { i: 300, playerId: null });
  drive(park, k, 2);
  k.air = true; k.vy = 6;
  const events = [];
  drive(park, k, DT * 2, { drift: true, events });
  drive(park, k, 2, { events });
  assert.ok(!events.includes('trick'));
});

test('a kart already hopping slightly off the road still catches the glide ramp', () => {
  const g = park.glides[0];
  const k = kart(park, { i: park.at(g.i - 2), kartId: 'speedster' });
  k.v = 34; k.air = true; k.vy = 1; k.y += 0.8;
  const events = [];
  drive(park, k, 0.2, { steer: () => 0, events });
  assert.ok(events.includes('glide') && k.gliding);
});

test('a glider with no steering follows the bends and lands on the road', () => {
  for (const def of TRACKS) {
    const t = trackPath(THREE, def);
    const k = kart(t, { i: t.at(t.glides[0].i - 3), kartId: 'speedster' });
    k.v = 34;
    const world = { track: t, topScale: 1, raceTime: 0, onEvent: () => {} };
    let glided = false;
    for (let s = 0; s < 12 && !(glided && !k.air); s += DT) {
      stepKart(k, DT, { steer: 0, gas: true, brake: false }, world);
      if (k.gliding) glided = true;
    }
    assert.ok(glided && !k.air, `${def.id}: glided and landed`);
    assert.ok(Math.abs(k.lateral) < 9.6, `${def.id}: landed on the road (lateral ${k.lateral.toFixed(1)} m)`);
  }
});

test('a very quick DRIFT tap in the air still counts as a trick', () => {
  const k = kart(park, { i: 300 });
  drive(park, k, 2);
  k.air = true; k.vy = 6;
  const world = { track: park, topScale: 1, raceTime: 0, onEvent: () => {} };
  // pressed and let go between two steps: the step sees drift=false but tapped=true
  stepKart(k, DT, kartInput({ gas: true, tapped: true }), world);
  assert.ok(k.trick > 0);
});

// ---- Phase 27: Lightning Bolt, Triple Slick, Magnet ----
import { strikeLightning, takeItem, coinReach, magnetPull, MAGNET_REACH, COIN_REACH, SHRINK_TIME } from '../public/js/console/games/karts-items.js';
import { rollItem } from '../public/js/console/games/karts-data.js';

test('Lightning Bolt shrinks only the karts ahead, and a Shield blocks it', () => {
  const order = [1, 2, 3, 4, 5].map((n) => ({ name: `k${n}`, v: 30, shield: 0, finished: null }));
  order[1].shield = 5; // 2nd place is shielded
  const user = order[3]; // 4th place uses it
  const { hit, blocked } = strikeLightning(user, order);
  assert.deepEqual(hit.map((k) => k.name), ['k1', 'k3']);
  assert.deepEqual(blocked.map((k) => k.name), ['k2']);
  assert.equal(order[1].shield, 0, 'the shield is used up');
  assert.ok(order[0].shrink === SHRINK_TIME && order[0].v < 30, 'shrunk and slowed');
  assert.ok(!order[3].shrink && !order[4].shrink, 'the user and karts behind are untouched');
});

test('a shrunk kart is slower until it grows back', () => {
  const small = kart(park, { kartId: 'racer' }), normal = kart(park, { i: 6, kartId: 'racer' });
  small.shrink = SHRINK_TIME;
  drive(park, small, 3, { steer: () => 0 });
  drive(park, normal, 3, { steer: () => 0 });
  assert.ok(small.v < normal.v * 0.85, `small ${small.v.toFixed(1)} vs normal ${normal.v.toFixed(1)}`);
  drive(park, small, 2, { steer: () => 0 });
  assert.equal(small.shrink, 0, 'grown back after a few seconds');
});

test('a shrunk kart gets shoved much further in a bump', () => {
  const a = kart(park, { kartId: 'racer' }), b = kart(park, { kartId: 'racer' });
  a.x = 0; a.z = 0; b.x = 2; b.z = 0; b.shrink = 1;
  bumpKarts([a, b]);
  assert.ok(b.x - 2 > -a.x * 2, `small moved ${(b.x - 2).toFixed(2)}, big moved ${(-a.x).toFixed(2)}`);
});

test('Triple Slick drops three slicks, then it is gone', () => {
  const k = { item: 'slick3', charges: 3 };
  assert.equal(takeItem(k), 'slick'); assert.equal(k.item, 'slick3');
  assert.equal(takeItem(k), 'slick'); assert.equal(k.item, 'slick3');
  assert.equal(takeItem(k), 'slick'); assert.equal(k.item, null);
  assert.equal(takeItem(k), null);
});

test('Magnet: far-reaching coin pickup and a slipstream pull toward the kart ahead', () => {
  const k = { x: 0, z: 0, magnet: 3 }, ahead = { x: 0, z: 10 };
  assert.equal(coinReach(k), MAGNET_REACH);
  assert.equal(coinReach({ magnet: 0 }), COIN_REACH);
  assert.ok(magnetPull(k, ahead) > 0);
  assert.equal(magnetPull(k, { x: 0, z: 50 }), 0, 'too far ahead: no pull');
  assert.equal(magnetPull({ ...k, magnet: 0 }, ahead), 0, 'no magnet: no pull');
});

test('new items come from item boxes, and the Lightning Bolt only to the karts at the back', () => {
  const seen = (place) => { const s = new Set(); for (let i = 0; i < 4000; i++) s.add(rollItem(place, 8)); return s; };
  const front = seen(1), back = seen(8);
  assert.ok(front.has('slick3') && front.has('magnet'), 'front gets Triple Slick and Magnet');
  assert.ok(!front.has('bolt'), 'no Lightning for the leader');
  assert.ok(back.has('bolt') && back.has('magnet'), 'back gets Lightning and Magnet');
});
