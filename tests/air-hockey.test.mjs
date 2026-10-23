// Air Hockey rules, tested without a browser: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, HALF_L, HALF_W, MALLET_R, WIN } from '../public/js/console/games/air-hockey-rules.js';

const STEP = 1 / 60;
const run = (m, secs, each = () => {}) => { for (let t = 0; t < secs; t += STEP) { each(); m.update(STEP); } };
function match(opts = {}) {
  const events = [];
  const m = createMatch({ players: [{ playerId: 1 }, { playerId: 2 }], onEvent: (e) => events.push(e), rng: () => 0.25, ...opts });
  m.newMatch();
  return { m, events };
}

test('a puck sliding into the right goal scores for the left player', () => {
  const { m, events } = match();
  Object.assign(m.puck, { x: 1, z: 0, vx: 6, vz: 0 });
  m.sides[1].z = m.sides[1].tz = 0.9; // right mallet out of the way
  run(m, 1, () => m.setTarget(1, HALF_L, 0.9));
  assert.equal(m.sides[0].score, 1);
  assert.deepEqual(events.find((e) => e.type === 'goal'), { type: 'goal', scorer: 0 });
  assert.equal(m.state, 'goal');
});

test('a puck hitting the end wall beside the goal bounces back', () => {
  const { m } = match();
  Object.assign(m.puck, { x: 1, z: 0.8, vx: 5, vz: 0 });
  m.sides[1].z = m.sides[1].tz = -0.9;
  run(m, 0.5, () => m.setTarget(1, HALF_L, -0.9));
  assert.equal(m.sides[0].score + m.sides[1].score, 0);
  assert.ok(m.puck.vx < 0, 'moving back toward the left');
});

test('the puck never leaves the table through the side rails', () => {
  const { m } = match();
  Object.assign(m.puck, { x: 0, z: 0, vx: 0.5, vz: 8 });
  run(m, 3);
  assert.ok(Math.abs(m.puck.z) <= HALF_W);
});

test('a mallet hitting the puck sends it away and reports the hit', () => {
  const { m, events } = match();
  Object.assign(m.puck, { x: -0.6, z: 0, vx: 0, vz: 0 });
  m.sides[0].x = -1.6; m.sides[0].z = 0;
  run(m, 0.4, () => m.setTarget(0, 0, 0)); // swing the left mallet through the puck
  assert.ok(events.some((e) => e.type === 'hit' && e.side === 0));
  assert.ok(m.puck.vx > 1, `puck flies right (vx=${m.puck.vx.toFixed(2)})`);
});

test('mallets stay on their own half', () => {
  const { m } = match();
  run(m, 1, () => { m.setTarget(0, 5, 0); m.setTarget(1, -5, 0); });
  assert.ok(m.sides[0].x <= -MALLET_R * 0.5 + 1e-9);
  assert.ok(m.sides[1].x >= MALLET_R * 0.5 - 1e-9);
});

test(`first to ${WIN} wins and the match stops`, () => {
  const { m, events } = match();
  m.sides[0].score = WIN - 1;
  Object.assign(m.puck, { x: 1.5, z: 0, vx: 6, vz: 0 });
  m.sides[1].z = m.sides[1].tz = 0.9;
  run(m, 1, () => m.setTarget(1, HALF_L, 0.9));
  assert.equal(m.state, 'over');
  assert.equal(m.winner, 0);
  assert.ok(events.some((e) => e.type === 'win' && e.scorer === 0));
});

test('the computer defends its goal', () => {
  const { m } = match({ players: [{ playerId: 1 }, { playerId: null }] });
  Object.assign(m.puck, { x: -1, z: 0.3, vx: 0, vz: 0 });
  run(m, 2);
  assert.ok(m.sides[1].x > HALF_L * 0.6, 'stays back near its goal');
  assert.ok(Math.abs(m.sides[1].z - 0.3 * 0.45) < 0.05, 'and lines up with the puck');
});
