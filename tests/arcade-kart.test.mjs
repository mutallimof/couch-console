// The arcade kart controller (sphere physics, drift tiers, boost): npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { Race, topSpeed } from '../public/js/console/games/turbo-karts/ow-kart/rules.js';
import { ARCADE_DEFAULTS as P, accelAt, driftTier, chargeRate, boostSpec, speedCap, turnFactor, arcadeVertical } from '../public/js/console/games/turbo-karts/ow-kart/arcade.js';
import { createTrackModel, angle, wrap } from '../public/js/console/games/turbo-karts/ow-kart/track-model.js';
import { TRACKS as KART_TRACKS } from '../public/js/console/games/turbo-karts/kart-path.js';
import { STADIUM } from '../public/js/console/games/turbo-karts/ow-kart/stadium/stadium-def.js';
import { GP_CHARACTERS as CHARACTERS } from '../public/js/console/games/turbo-karts/ow-kart/characters.js';

const TRACKS = [...KART_TRACKS, STADIUM];
const T = createTrackModel(KART_TRACKS.find((t) => t.id === 'park'));
// (a wide-open copy of the track for tests that drift in circles: no walls, no grass)
const OPEN = createTrackModel(KART_TRACKS.find((t) => t.id === 'park'), { roadHalf: 1e4, wallHalf: 1e4 });
const make = (o = {}) => new Race({ track: T, characters: CHARACTERS.slice(0, 8), handling: 'arcade', seed: 5, ...o });
const step = (race, t, input = {}) => { for (let i = 0; i < Math.round(t * 120); i++) race.update(1 / 120, input); };
function place(r, s, l = 0, track = T) {
  const p = track.surfaceAt(s, l);
  Object.assign(r, { s: wrap(s, track.length), progress: s, x: p.x, y: p.y, z: p.z, heading: p.heading, dir: p.heading, lateral: l });
}
// One human alone on the road (the others have finished), already past the countdown
function solo(s = 50, track = T) {
  const race = make({ track });
  race.start();
  step(race, 3.1);
  race.coins = []; race.boxes = [];
  place(race.player, s, 0, track);
  for (const r of race.racers.slice(1)) { place(r, 700 + r.id * 20, 0, track); r.finishTime = 1000 + r.id; }
  return race;
}
const TOP = topSpeed(0); // 36 (the kart stats of the default kart are neutral)

// ---- acceleration curve ----
test('acceleration is strongest at low speed and tapers off toward the top speed', () => {
  let last = Infinity;
  for (let v = 0; v < TOP; v += 0.5) {
    const a = accelAt(v, TOP);
    assert.ok(a <= last + 1e-9, `acceleration never grows with speed (at ${v})`);
    last = a;
  }
  assert.ok(accelAt(2, TOP) > 2.5 * accelAt(0.9 * TOP, TOP), 'much stronger at the start than near the top');
  assert.ok(accelAt(0.97 * TOP, TOP) > 0, 'there is always a little push left, so the top speed is reached');
  assert.equal(accelAt(TOP, TOP), 0);
  assert.equal(accelAt(TOP + 5, TOP), 0);
});

test('flat out, speed rises quickly then flattens and ends at the top speed', () => {
  const race = solo();
  const r = race.player, speeds = [];
  for (let i = 1; i <= 8; i++) { step(race, 0.5, { gas: true }); speeds.push(r.speed); }
  const gains = speeds.map((v, i) => v - (speeds[i - 1] ?? 0));
  assert.ok(gains[0] > gains[3] && gains[1] > gains[5], `gains shrink: ${gains.map((g) => g.toFixed(1))}`);
  assert.ok(speeds[1] > 0.45 * TOP, 'half the top speed within a second');
  assert.ok(speeds.at(-1) > 0.97 * TOP && speeds.at(-1) <= TOP + 1e-6, `top speed reached, not exceeded: ${speeds.at(-1)}`);
});

// ---- drift tiers ----
test('drift tiers: blue, orange, purple at the configured charge times', () => {
  assert.equal(driftTier(0), 0);
  assert.equal(driftTier(P.charge1 - 0.01), 0);
  assert.equal(driftTier(P.charge1), 1);
  assert.equal(driftTier(P.charge2 - 0.01), 1);
  assert.equal(driftTier(P.charge2), 2);
  assert.equal(driftTier(P.charge3 - 0.01), 2);
  assert.equal(driftTier(P.charge3), 3);
  assert.equal(driftTier(99), 3);
  assert.ok(P.charge1 < P.charge2 && P.charge2 < P.charge3);
  assert.ok(chargeRate(1) > chargeRate(0) && chargeRate(-1) === chargeRate(0), 'steering into the turn charges faster');
});

test('holding DRIFT while turning locks in a drift that charges through three tiers and fires a boost scaled by the tier', () => {
  const race = solo(50, OPEN), r = race.player, events = [];
  race.onEvent = (e) => events.push(e);
  r.speed = 30;
  step(race, 0.05, { gas: true, drift: true, steer: 0.6 });
  assert.equal(r.drift, 1, 'the drift started (turning right)');
  assert.ok(r.hop > 0, 'with a little hop');
  const tiers = [];
  const boosts = [];
  for (let t = 0; t < 4; t += 0.01) {
    step(race, 0.01, { gas: true, drift: true, steer: 0.6 });
    if (!tiers.includes(r.tier)) tiers.push(r.tier);
    if (race.player.finishTime) break;
  }
  assert.deepEqual(tiers, [0, 1, 2, 3], 'blue, then orange, then purple');
  assert.deepEqual(events.filter((e) => e.type === 'drift').map((e) => e.tier), [1, 2, 3]);
  assert.ok(r.charge >= P.charge3);
  // release: boost fires, scaled by the charge tier
  const fired = {};
  for (const charge of [P.charge1 + 0.05, P.charge2 + 0.05, P.charge3 + 0.05]) {
    const a = solo(50, OPEN), q = a.player, ev = [];
    a.onEvent = (e) => ev.push(e);
    q.speed = 30; q.drift = 1; q.charge = charge; q.lastInput = { drift: true };
    step(a, 0.01, { gas: true });
    const tier = ev.find((e) => e.type === 'turbo')?.tier;
    let peak = 0;
    for (let t = 0; t < 3; t += 0.01) { step(a, 0.01, { gas: true }); peak = Math.max(peak, q.speed); }
    fired[tier] = { time: q.boost, peak, drift: q.drift };
    boosts.push(tier);
    assert.equal(q.drift, 0, 'letting go ends the drift');
  }
  assert.deepEqual(boosts, [1, 2, 3]);
  assert.ok(fired[1].peak > TOP * 1.05, 'even the blue boost goes over the top speed');
  assert.ok(fired[2].peak > fired[1].peak && fired[3].peak > fired[2].peak, `bigger tier, faster: ${fired[1].peak.toFixed(1)} < ${fired[2].peak.toFixed(1)} < ${fired[3].peak.toFixed(1)}`);
  assert.ok(boostSpec(3).time > boostSpec(2).time && boostSpec(2).time > boostSpec(1).time, 'and longer');
  assert.equal(boostSpec(0).time, 0);
});

test('a drift that is let go before the first tier fires no boost', () => {
  const race = solo(50, OPEN), r = race.player, events = [];
  race.onEvent = (e) => events.push(e.type);
  r.speed = 30;
  step(race, 0.3, { gas: true, drift: true, steer: 0.6 });
  step(race, 0.1, { gas: true, steer: 0.6 });
  assert.equal(r.drift, 0);
  assert.ok(!events.includes('turbo'));
  assert.equal(r.boost, 0);
});

test('in a drift the travel direction is locked: steering toward the turn tightens the arc, away widens it', () => {
  const turned = (steer) => {
    const race = solo(50, OPEN), r = race.player;
    r.speed = 32;
    step(race, 0.05, { gas: true, drift: true, steer: 0.6 }); // start the drift to the right
    const d0 = r.dir;
    step(race, 0.6, { gas: true, drift: true, steer });
    return angle(r.dir - d0);
  };
  const tight = turned(1), mid = turned(0), wide = turned(-1);
  assert.ok(tight > mid && mid > wide && wide > 0.1, `arc: tight ${tight.toFixed(2)} > ${mid.toFixed(2)} > wide ${wide.toFixed(2)} (still turning the same way)`);
  // the kart points further into the turn than it travels
  const race = solo(50, OPEN), r = race.player;
  r.speed = 32;
  step(race, 0.5, { gas: true, drift: true, steer: 0.6 });
  assert.ok(angle(r.heading - r.dir) > P.driftAngle * 0.8, 'nose points into the turn');
});

test('the boost may exceed the top speed, then fades back to it', () => {
  const race = solo(), r = race.player;
  r.speed = TOP;
  r.boost = 1.2;
  let peak = 0;
  const drive = (t) => { for (let i = 0; i < Math.round(t * 120); i++) race.update(1 / 120, pilot(race, r)); };
  drive(1);
  peak = r.speed;
  assert.ok(peak > TOP * 1.2, `over the top speed while boosting: ${peak.toFixed(1)}`);
  assert.ok(peak <= speedCap(TOP, true, 1.25) + 1e-6);
  drive(3);
  assert.ok(r.speed <= TOP + 1e-6 && r.speed > TOP - 1, `back at the top speed: ${r.speed}`);
});

test('grip: a kart with low grip slides, a high-grip kart goes where its nose points', () => {
  const drift = (grip) => {
    const race = make({ tuning: { ...P, grip } }); race.start(); step(race, 3.1);
    for (const r of race.racers.slice(1)) r.finishTime = 1000;
    const r = race.player; place(r, 50);
    r.speed = 30;
    step(race, 0.4, { gas: true, steer: 1 });
    return Math.abs(angle(r.heading - r.dir));
  };
  assert.ok(drift(2) > drift(14) * 2, 'low grip leaves the travel direction behind the nose');
});

test('steering has no effect at a standstill and is a little weaker at the top speed', () => {
  assert.equal(turnFactor(0, TOP), 0);
  assert.ok(turnFactor(P.turnSpeed, TOP) > turnFactor(TOP, TOP));
  assert.ok(turnFactor(TOP, TOP) > 0.7);
});

// ---- bounce on landing / crests ----
test('the sphere lands with an impact and a bounce event after a fall', () => {
  const r = { y: 6, vy: 0, air: true };
  const events = [];
  let steps = 0;
  while (r.air && steps++ < 1000) arcadeVertical(r, 2, 1 / 120, P, (type, e) => events.push({ type, ...e }));
  assert.equal(r.y, 2);
  const land = events.find((e) => e.type === 'land');
  assert.ok(land && land.impact > P.landBounce, `landing impact ${land?.impact}`);
  assert.equal(r.vy, 0);
  // a tiny drop is just rolling: no event
  const s = { y: 2.05, vy: 0, air: true }, ev2 = [];
  while (s.air) arcadeVertical(s, 2, 1 / 120, P, (type) => ev2.push(type));
  assert.deepEqual(ev2, []);
});

test('the sphere follows a slope but flies off a crest where the road falls away faster than gravity', () => {
  const dt = 1 / 120, v = 36;
  const run = (profile) => {
    const r = { y: profile(0), vy: 0, air: false };
    let airborne = 0;
    for (let i = 1; i < 480; i++) { arcadeVertical(r, profile(i * dt * v), dt, P, () => {}); if (r.air) airborne++; }
    return airborne;
  };
  assert.equal(run((x) => -0.1 * x + 30), 0, 'a steady downhill is followed');
  assert.equal(run((x) => 5 + 0.2 * x), 0, 'uphill is followed');
  assert.ok(run((x) => (x < 60 ? 0.2 * x : 12 - 0.8 * (x - 60))) > 20, 'a sharp crest launches the kart');
});

// ---- the whole race ----
function pilot(race, r) {
  const q = race.track.surfaceAt(r.s + 12, 0), want = Math.atan2(q.x - r.x, -(q.z - r.z));
  return { gas: true, steer: Math.max(-1, Math.min(1, angle(want - (r.dir ?? r.heading)) * 2.8)) };
}
test('classic stays the default handling; arcade has to be asked for', () => {
  assert.equal(new Race({ track: T, characters: CHARACTERS.slice(0, 8) }).handling, 'classic');
  assert.equal(make().handling, 'arcade');
  const classic = new Race({ track: T, characters: CHARACTERS.slice(0, 8), seed: 5 });
  classic.start();
  step(classic, 4, { gas: true });
  assert.equal(classic.player.arcade, undefined, 'the classic model never touches the arcade fields');
});

test('every track can be raced for three laps by eight arcade karts, and the computer drivers stay on the road', { timeout: 280000 }, () => {
  let turbos = 0;
  for (const def of TRACKS) {
    const track = createTrackModel(def);
    const events = [];
    const race = new Race({ track, characters: CHARACTERS.slice(0, 8), humans: 1, seed: 3, handling: 'arcade', onEvent: (e) => events.push(e.type) });
    race.start();
    let guard = 0, stalled = 0, worstStall = 0;
    while (race.state !== 'results' && guard++ < 60 * 320) {
      race.update(1 / 60, pilot(race, race.player));
      for (const r of race.racers) { // a kart that is not spinning must not stand still for long
        r.stall = r.finishTime === null && race.time > 8 && r.speed < 1 ? (r.stall || 0) + 1 / 60 : 0;
        worstStall = Math.max(worstStall, r.stall);
      }
    }
    assert.equal(race.state, 'results', `${def.id}: the race finished`);
    assert.equal(race.finishOrder.length, 8, `${def.id}: all eight finished`);
    for (const r of race.racers) assert.ok(r.finishTime > 40 && r.finishTime < 220, `${def.id}: racer ${r.id} finished in ${r.finishTime?.toFixed(0)} s`);
    assert.ok(worstStall < 3, `${def.id}: a kart stood still for ${worstStall.toFixed(1)} s`);
    assert.ok(events.filter((e) => e === 'wall').length <= 60, `${def.id}: ${events.filter((e) => e === 'wall').length} wall touches`);
    turbos += events.filter((e) => e === 'turbo').length;
    assert.ok(race.racers.every((r) => [r.x, r.y, r.z, r.speed, r.dir].every(Number.isFinite)), `${def.id}: all numbers are finite`);
  }
  assert.ok(turbos > 0, 'the computer drivers drift and fire boosts too');
});

// ---- tuning values and the frame-rate governor ----
import { TUNING_DEFAULTS, TUNING_SCHEMA, normalizeTuning, changedOnly, tuningText, loadTuning, saveTuning, clearTuning } from '../public/js/console/games/turbo-karts/ow-kart/tuning.js';
import { createGovernor, TARGET_1P, TARGET_2P } from '../public/js/console/games/turbo-karts/karts-quality.js';

test('every tuning number has a slider, and every slider a default inside its own range', () => {
  const sliders = TUNING_SCHEMA.flatMap(([, rows]) => rows);
  const keys = sliders.map(([k]) => k);
  assert.equal(new Set(keys).size, keys.length, 'no slider twice');
  for (const k of Object.keys(TUNING_DEFAULTS)) assert.ok(keys.includes(k), `${k} has a slider`);
  for (const [k, , min, max] of sliders) {
    assert.ok(k in TUNING_DEFAULTS, `${k} has a default`);
    assert.ok(TUNING_DEFAULTS[k] >= min && TUNING_DEFAULTS[k] <= max, `${k}: ${TUNING_DEFAULTS[k]} is inside ${min}..${max}`);
  }
  for (const k of ['grip', 'driftAngle', 'charge1', 'charge2', 'charge3', 'boostStrength', 'camFollow', 'fovBase', 'shakeLand']) assert.ok(keys.includes(k), `the list in the task: ${k}`);
});

test('tuning values are cleaned, saved to localStorage, restored, and copied as text', () => {
  const clean = normalizeTuning({ grip: 99, charge1: 'x', nonsense: 1, accel: 30 });
  assert.equal(clean.grip, 30, 'clamped to the slider range');
  assert.equal(clean.charge1, TUNING_DEFAULTS.charge1, 'not a number: default');
  assert.equal(clean.accel, 30);
  assert.ok(!('nonsense' in clean));
  assert.deepEqual(changedOnly(clean), { grip: 30, accel: 30 });
  const store = new Map(), storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  assert.deepEqual(loadTuning(storage), { ...TUNING_DEFAULTS });
  saveTuning({ ...TUNING_DEFAULTS, accel: 31, camFollow: 5 }, storage);
  assert.equal(loadTuning(storage).accel, 31);
  assert.equal(loadTuning(storage).camFollow, 5);
  assert.equal(loadTuning(storage).grip, TUNING_DEFAULTS.grip);
  clearTuning(storage);
  assert.equal(loadTuning(storage).accel, TUNING_DEFAULTS.accel);
  const text = JSON.parse(tuningText({ accel: 31 }));
  assert.equal(text.accel, 31);
  assert.equal(Object.keys(text).length, Object.keys(TUNING_DEFAULTS).length, '"Copy values" has every number');
  assert.equal(loadTuning({ getItem: () => '{broken' }).accel, TUNING_DEFAULTS.accel, 'broken saved text is ignored');
});

test('the frame-rate governor lowers the effects one step at a time, only when slow for a while', () => {
  const changes = [];
  const g = createGovernor({ target: TARGET_1P, onChange: (l) => changes.push(l) });
  for (let t = 0; t < 10; t += 0.1) g.tick(60, 0.1);
  assert.equal(g.level, 3, 'fast: nothing changes');
  for (let t = 0; t < 1; t += 0.1) g.tick(30, 0.1);
  assert.equal(g.level, 3, 'one slow second is not enough');
  for (let t = 0; t < 10; t += 0.1) g.tick(30, 0.1);
  assert.deepEqual(changes, [2, 1, 0].slice(0, changes.length));
  assert.ok(g.level < 3, 'stays slow: the effects go down');
  for (let t = 0; t < 60; t += 0.1) g.tick(10, 0.1);
  assert.equal(g.level, 0);
  for (let t = 0; t < 30; t += 0.1) g.tick(120, 0.1);
  assert.equal(g.level, 0, 'never raised again by itself');
  assert.ok(TARGET_2P < TARGET_1P && TARGET_2P >= 40, 'split screen asks for less');
  g.setLevel(3);
  assert.equal(g.level, 3);
});
