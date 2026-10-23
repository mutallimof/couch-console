// Turbo Karts driving rules on the real tracks, tested without a browser: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { trackPath, TRACKS, WALL } from '../public/js/console/games/kart-path.js';
import { stepKart, bumpKarts, LAPS } from '../public/js/console/games/karts-rules.js';
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
function drive(track, k, secs, { gas = true, brake = false, steer = null, events = [], raceTime = { t: 0 } } = {}) {
  const world = { track, topScale: 1, onEvent: (type) => events.push(type) };
  for (let t = 0; t < secs; t += DT) {
    raceTime.t += DT;
    world.raceTime = raceTime.t;
    const s = steer ? steer(k) : followRoad(track, k);
    stepKart(k, DT, { steer: s, gas, brake: typeof brake === 'function' ? brake(k) : brake }, world);
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

test('a long drift gives a turbo when you let go of brake', () => {
  const k = kart(park, { i: 300 });
  drive(park, k, 3);
  const events = [];
  // hold brake + steer for ~2 s (orange charge), then release
  drive(park, k, 2, { brake: true, steer: () => 0.8, events });
  assert.ok(k.drifting, 'drifting while brake is held');
  drive(park, k, DT * 2, { brake: false, events });
  assert.ok(!k.drifting && k.boost > 0, 'boost after letting go');
  assert.ok(events.includes('boost'));
});

test('computer karts do not drift', () => {
  const k = kart(park, { i: 300, playerId: null });
  drive(park, k, 3);
  drive(park, k, 1, { brake: true, steer: () => 0.8 });
  assert.ok(!k.drifting);
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
  const k = kart(park, { i: park.at(at - 120), kartId: 'speedster' });
  let flew = false, landed = false;
  const world = { track: park, topScale: 1, raceTime: 0, onEvent: () => {} };
  for (let t = 0; t < 5; t += DT) {
    stepKart(k, DT, { steer: followRoad(park, k), gas: true, brake: false }, world);
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
