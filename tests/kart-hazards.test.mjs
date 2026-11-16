// Track hazards in the kart rules (patch, mover, gust), tested without a browser. npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { Race, EVENT_TYPES } from '../public/games/turbo-karts/ow-kart/rules.js';
import { createTrackModel, wrap, angle } from '../public/games/turbo-karts/ow-kart/track-model.js';
import { TRACKS } from '../public/games/turbo-karts/kart-path.js';
import { STADIUM } from '../public/games/turbo-karts/ow-kart/stadium/stadium-def.js';
import { GP_CHARACTERS as CHARACTERS } from '../public/games/turbo-karts/ow-kart/characters.js';

const park = TRACKS.find((t) => t.id === 'park');
const modelWith = (hazards) => createTrackModel({ ...park, hazards });
function soloOn(T, events = []) {
  const race = new Race({ track: T, characters: CHARACTERS.slice(0, 8), seed: 5, onEvent: (e) => events.push(e) });
  race.start();
  for (let i = 0; i < 372; i++) race.update(1 / 120, {});
  race.coins = []; race.boxes = [];
  race.racers.slice(1).forEach((r, i) => place(T, r, T.length * 0.5 + i * 12, 0)); // (the others out of the way)
  return race;
}
function place(T, r, s, l = 0) {
  const p = T.surfaceAt(s, l);
  Object.assign(r, { s: wrap(s, T.length), progress: s, x: p.x, y: p.y, z: p.z, heading: p.heading, lateral: l });
}
const run = (race, t, input = {}) => { for (let i = 0; i < Math.round(t * 120); i++) race.update(1 / 120, input); };

test('a track without hazards has none, and "hazard" is a known event', () => {
  assert.deepEqual(createTrackModel({ ...park, hazards: undefined }).hazards, []);
  assert.ok(EVENT_TYPES.includes('hazard'));
});

test('hazards get a place on the lap and sensible defaults', () => {
  const T = modelWith([{ type: 'patch', at: 0.25, look: 'ice', turn: 0.4 }, { type: 'mover', at: 0.5, span: 7, look: 'ball' }, { type: 'gust', at: 0.75 }]);
  assert.equal(T.hazards.length, 3);
  for (const h of T.hazards) assert.ok(h.s >= 0 && h.s < T.length);
  assert.ok(Math.abs(T.hazards[1].s / T.length - 0.5) < 0.08);
  assert.equal(T.hazards[0].width, T.roadHalf * 2);
  assert.equal(T.hazards[1].effect, 'spin');
  assert.ok(T.hazards[2].force > 0);
});

test('a mover crosses the road as a pure function of the race time', () => {
  const T = modelWith([{ type: 'mover', at: 0.3, span: 7, period: 6 }]);
  const race = soloOn(T), h = race.hazards[0];
  assert.equal(race.hazardLateral(h, 0), 0);
  assert.ok(Math.abs(race.hazardLateral(h, 1.5) - 7) < 1e-9, 'a quarter period: fully to one side');
  assert.ok(Math.abs(race.hazardLateral(h, 4.5) + 7) < 1e-9);
  assert.ok(Math.abs(race.hazardLateral(h, 6)) < 1e-9);
});

test('driving into a mover spins the kart once (a lighter hit than an item)', () => {
  const T = modelWith([{ type: 'mover', at: 0.3, span: 0, lateral: 0, radius: 1.5 }]);
  const events = [], race = soloOn(T, events), r = race.player, h = race.hazards[0];
  r.coins = 5; r.speed = 30;
  place(T, r, h.s - 6, 0);
  run(race, 0.5, { gas: true });
  assert.ok(r.spin > 0, 'spinning');
  assert.equal(r.coins, 4, 'one coin lost');
  assert.equal(events.filter((e) => e.type === 'hazard').length, 1);
  assert.equal(events.filter((e) => e.type === 'hit' && e.cause === 'hazard').length, 1);
  assert.notEqual(h.hitAt, null);
});

test('a kart in another lane, in the air or with a star is not hit', () => {
  const T = modelWith([{ type: 'mover', at: 0.3, span: 0, lateral: 6, radius: 1.5 }]);
  for (const setup of ['lane', 'air', 'star']) {
    const events = [], race = soloOn(T, events), r = race.player, h = race.hazards[0];
    r.speed = 30;
    place(T, r, h.s - 6, setup === 'lane' ? -4 : 6);
    if (setup === 'air') { r.gliding = true; r.glide = { start: h.s - 10, end: h.s + 40 }; r.flightY = r.y + 6; r.flightV = 0; r.flight = 0; }
    if (setup === 'star') r.star = 5;
    run(race, 0.4, { gas: true });
    assert.equal(r.spin, 0, `${setup}: no spin`);
    assert.equal(events.filter((e) => e.type === 'hit').length, 0, `${setup}: no hit`);
  }
});

test('a "bump" mover (cone, tyres) only knocks the speed off', () => {
  const T = modelWith([{ type: 'mover', at: 0.3, effect: 'bump', look: 'cone' }]);
  const events = [], race = soloOn(T, events), r = race.player, h = race.hazards[0];
  r.speed = 30; r.coins = 3;
  place(T, r, h.s - 5, 0);
  run(race, 0.35, { gas: true });
  assert.equal(r.spin, 0);
  assert.equal(r.coins, 3);
  assert.ok(r.speed < 24, `slowed (${r.speed.toFixed(1)})`);
  assert.equal(events.filter((e) => e.type === 'hazard' && e.effect === 'bump').length, 1);
});

test('an ice patch dulls the steering only while the kart is on it', () => {
  const sRef = modelWith([{ type: 'patch', at: 0.3 }]).hazards[0].s; // (the same spot of the road every time)
  const turned = (hazards) => {
    const T = modelWith(hazards), race = soloOn(T), r = race.player;
    r.speed = 30;
    place(T, r, sRef - 5, 0);
    const h0 = r.heading;
    run(race, 0.5, { gas: true, steer: 1 });
    return { turn: Math.abs(angle(r.heading - h0)), patch: r.patch };
  };
  const ice = turned([{ type: 'patch', at: 0.3, length: 60, turn: 0.4, look: 'ice' }]);
  const clear = turned([]);
  const beside = turned([{ type: 'patch', at: 0.3, length: 60, turn: 0.4, lateral: 8, width: 3, look: 'ice' }]);
  assert.equal(ice.patch, 'ice');
  assert.equal(clear.patch, null);
  assert.ok(ice.turn < clear.turn * 0.6, `less turning on ice (${ice.turn.toFixed(3)} vs ${clear.turn.toFixed(3)})`);
  assert.ok(Math.abs(beside.turn - clear.turn) < 1e-9, 'a patch in another lane changes nothing');
});

test('a gust pushes a kart sideways, in both directions over time', () => {
  const T = modelWith([{ type: 'gust', at: 0.3, length: 400, force: 8, period: 4, phase: 0.25 }]);
  const race = soloOn(T), r = race.player, g = race.hazards[0];
  assert.ok(race.gustPush(g, 0) > 7.9, 'phase 0.25: full push at the start');
  assert.ok(race.gustPush(g, 2) < -7.9, 'half a period later it blows the other way');
  place(T, r, g.s - 20, 0); r.speed = 20;
  const before = r.lateral;
  // (race time is ~0.1 s here: the push is still close to full strength to one side)
  run(race, 0.4, { gas: true });
  assert.ok(Math.abs(r.lateral - before) > 1.5, `moved sideways (${(r.lateral - before).toFixed(2)} m)`);
  assert.notEqual(r.gust, 0);
});

test('computer drivers pick a lane beside a standing mover', () => {
  const T = modelWith([{ type: 'mover', at: 0.3, span: 0, lateral: 0, radius: 1.5 }]);
  const race = soloOn(T), cpu = race.racers[3], h = race.hazards[0];
  place(T, cpu, h.s - 20, 0);
  assert.ok(Math.abs(race.avoidLane(cpu, 0.5)) >= h.radius + 2.9, 'moves out of the way');
  place(T, cpu, h.s + 5, 0);
  assert.equal(race.avoidLane(cpu, 0.5), 0.5, 'a mover behind is ignored');
});

test('every real track builds its hazards and a full race still finishes', () => {
  for (const def of [...TRACKS, STADIUM]) {
    const T = createTrackModel(def);
    for (const h of T.hazards) assert.ok(['patch', 'mover', 'gust'].includes(h.type), `${def.id}: ${h.type}`);
    const race = new Race({ track: T, characters: CHARACTERS.slice(0, 8), seed: 11, humans: 1 });
    race.start();
    for (let i = 0; i < 120 * 400 && race.state !== 'results'; i++) race.update(1 / 120, race.cpuInput(race.player));
    assert.equal(race.state, 'results', `${def.id}: the race ends`);
  }
});
