// The Party Games' rules (Quick Draw Duel, Hot Potato, Steady Hands) and the phone's gesture helpers, driven with a fake clock. npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDuel, DUEL } from '../public/js/console/games/party/duel-rules.js';
import { createPotato, createGroupPotato, tickInterval, randomTask, POTATO } from '../public/js/console/games/party/potato-rules.js';
import { createEggs, limits, ACTIONS } from '../public/js/console/games/party/eggs-rules.js';

const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
const P = (...ids) => ids.map((id) => ({ id, name: id }));

test('duel: nobody draws until everybody is holstered, then DRAW comes after the hidden wait', () => {
  const d = createDuel({ players: P('a', 'b'), rng: seq(0.5) });
  assert.deepEqual(d.holster('a', 0), []);
  assert.equal(d.state.phase, 'holster');
  const ev = d.holster('b', 1);
  assert.equal(ev[0].type, 'wait');
  const wait = ev[0].drawAt - 1;
  assert.ok(wait >= DUEL.minWait && wait <= DUEL.maxWait, 'a 2 to 7 second wait');
  assert.deepEqual(d.update(ev[0].drawAt - 0.01), []);
  assert.equal(d.update(ev[0].drawAt)[0].type, 'draw');
});

test('duel: the fastest phone-measured time wins the round; a false start is out for the round', () => {
  const d = createDuel({ players: P('a', 'b', 'c'), rng: seq(0) });
  d.holster('a', 0); d.holster('b', 0); d.holster('c', 0);
  assert.equal(d.tooEarly('c', 1)[0].type, 'early', 'too early');
  const at = d.state.drawAt; d.update(at);
  d.fire('b', 410, at + 0.4);
  const ev = d.fire('a', 312, at + 0.5);
  assert.equal(ev.at(-1).type, 'result');
  assert.equal(ev.at(-1).winner, 'a');
  assert.deepEqual(d.state.early, ['c']);
  assert.equal(d.state.wins.a, 1);
  // a late "shot" from the one who jumped does not count
  assert.deepEqual(d.fire('c', 100, at + 0.6), []);
});

test('duel: a shot faster than a human can react counts as a false start; slow shooters time out', () => {
  const d = createDuel({ players: P('a', 'b'), rng: seq(0) });
  d.holster('a', 0); d.holster('b', 0);
  const at = d.state.drawAt; d.update(at);
  assert.equal(d.fire('a', 20, at + 0.1)[0].type, 'early');
  const ev = d.update(at + DUEL.fireWindow + 0.1);
  assert.equal(ev[0].type, 'result');
  assert.equal(ev[0].winner, null, 'nobody fired in time');
});

test('duel: first to 3 wins the best of 5', () => {
  const d = createDuel({ players: P('a', 'b'), rng: seq(0) });
  let t = 0, over = null;
  for (let round = 0; round < 5 && !over; round++) {
    d.holster('a', t); d.holster('b', t);
    t = d.state.drawAt; d.update(t);
    d.fire('a', 300, t); d.fire('b', 500, t);
    t += DUEL.resultPause + 0.1;
    over = d.update(t).find((e) => e.type === 'over');
  }
  assert.ok(over, 'the duel ended');
  assert.equal(d.state.round, 3, 'after 3 straight wins');
  assert.deepEqual(over.winners, ['a']);
});

test('hot potato: the bomb goes to somebody else, explodes on the holder, the last player with hearts wins', () => {
  const p = createPotato({ players: P('a', 'b', 'c'), rng: seq(0, 0.5, 0), hearts: 1, now: 0 });
  const first = p.state.holder;
  assert.equal(p.throwBomb('nobody'), null, 'only the holder can throw');
  const th = p.throwBomb(first);
  assert.notEqual(th.to, first);
  const holder = p.state.holder;
  assert.ok(p.state.remaining >= POTATO.fuse[0] && p.state.remaining <= POTATO.fuse[1], 'a hidden fuse of 15 to 40 s');
  const boom = p.update(100);
  assert.equal(boom[0].type, 'boom');
  assert.equal(boom[0].id, holder);
  assert.equal(p.update(100 + POTATO.afterBoom)[0].type, 'bomb');
  let over = null, t = 100 + POTATO.afterBoom;
  for (let i = 0; i < 6 && !over; i++) { t += 100; over = p.update(t).find((e) => e.type === 'over') || p.update(t + POTATO.afterBoom).find((e) => e.type === 'over'); t += POTATO.afterBoom; }
  assert.ok(over, 'a winner after the hearts run out');
});

test('hot potato: the tick speeds up, group mode keeps a tally, tasks are all solvable', () => {
  assert.ok(tickInterval(30) > tickInterval(5) && tickInterval(5) > tickInterval(0.5));
  assert.ok(tickInterval(0) >= 0.1);
  const g = createGroupPotato({ rng: seq(0), now: 0 });
  assert.deepEqual(g.update(10), []);
  assert.equal(g.update(15)[0].type, 'boom');
  assert.deepEqual(g.nameOut('Ana'), ['Ana']);
  assert.deepEqual(g.nameOut('  '), ['Ana'], 'blank names are ignored');
  assert.equal(g.again(20).type, 'bomb');
  for (let i = 0; i < 30; i++) { const t = randomTask(seq(i / 30, (i * 7 % 30) / 30)); assert.ok(t.text && t.answer !== undefined, t.kind); }
});

test('steady hands: careful movement is fine, a jolt or a long tilt drops the egg, and it gets stricter', () => {
  const e = createEggs({ players: P('a', 'b', 'c'), rng: seq(0), now: 0 });
  for (let t = 0; t < 10; t += 0.1) { e.report('a', { w: 0.3, tilt: 0.3 }, t); e.report('b', { w: 0.45, tilt: 0.5 }, t); }
  assert.deepEqual(e.state.alive, ['a', 'b', 'c'], 'careful: nobody drops');
  assert.equal(e.report('c', { w: 0.99, tilt: 0.1 }, 10.1)[0].cause, 'jolt');
  let drop = null;
  for (let t = 10.2; t < 12 && !drop; t += 0.1) drop = e.report('b', { w: 0.2, tilt: 0.9 }, t)[0];
  assert.equal(drop?.cause, 'tilt', 'held too tilted');
  const end = e.report('b', { w: 0.2, tilt: 0.9 }, 12.5);
  void end;
  assert.ok(limits(80).tilt < limits(1).tilt && limits(80).jolt < limits(1).jolt);
  const act = e.update(30);
  assert.ok(act.length === 0 || ACTIONS.includes(act[0].text));
});

test('steady hands: the last egg wins; if the last two drop together the lowest wobble wins', () => {
  const e = createEggs({ players: P('a', 'b'), rng: seq(0), now: 0 });
  for (let t = 0; t < 5; t += 0.1) { e.report('a', { w: 0.5, tilt: 0.1 }, t); e.report('b', { w: 0.1, tilt: 0.1 }, t); }
  const ev = e.report('a', { w: 1, tilt: 0 }, 5.1);
  assert.equal(ev.at(-1).type, 'over');
  assert.equal(ev.at(-1).winner, 'b');
});

// ---------- the phone's gesture helpers and the shared clock, with recorded (made-up but realistic) samples ----------
import { holstered, raisedLevel, pitch, swing, wobble, flatness } from '../public/js/remote/gestures.js';
import { estimateOffset } from '../public/js/shared/clock.js';

test('gestures: pointing at the floor is holstered, level is raised (either sign convention)', () => {
  const floor = { x: 0.3, y: -9.7, z: 1.1 }, floorIOS = { x: -0.3, y: 9.7, z: -1.1 }, level = { x: 0.2, y: 0.9, z: 9.7 }, upright = { x: 0, y: 9.8, z: 0.4 };
  assert.ok(holstered(floor) && holstered(floorIOS));
  assert.ok(!holstered(level) && raisedLevel(level));
  assert.ok(Math.abs(pitch(level)) < 10);
  assert.ok(!raisedLevel(floor));
  assert.ok(holstered(upright), 'straight up counts as out of the level zone');
});

test('gestures: a throw swing is a spike, a gentle move is not', () => {
  const still = Array.from({ length: 20 }, (_, i) => ({ t: i * 16, a: { x: 0.1, y: 0.2, z: 9.8 } }));
  assert.equal(swing(still), false);
  const thrown = [...still, { t: 330, a: { x: 14, y: 6, z: 18 } }, { t: 346, a: { x: 20, y: 3, z: 22 } }];
  assert.equal(swing(thrown), true);
  const old = [{ t: 0, a: { x: 25, y: 5, z: 20 } }, ...Array.from({ length: 30 }, (_, i) => ({ t: 1000 + i * 16, a: { x: 0, y: 0, z: 9.8 } }))];
  assert.equal(swing(old), false, 'a spike long ago does not count');
});

test('gestures: wobble is ~0 when steady, grows with a shaky hand, and tops out on a jolt; flatness tells tilt', () => {
  const steady = Array.from({ length: 30 }, (_, i) => ({ t: i * 16, a: { x: 0, y: 0.1, z: 9.81 } }));
  const shaky = steady.map((s, i) => ({ ...s, a: { x: 0, y: 0, z: 9.81 + (i % 2 ? 2.2 : -2.2) } }));
  const jolt = [...steady, { t: 500, a: { x: 0, y: 12, z: 16 } }];
  assert.ok(wobble(steady) < 0.05);
  assert.ok(wobble(shaky) > 0.4 && wobble(shaky) < wobble(jolt) + 1e-9);
  assert.ok(wobble(jolt) > 0.7);
  assert.ok(flatness({ x: 0, y: 0, z: 9.8 }) < 0.05);
  assert.ok(flatness({ x: 0, y: 7, z: 7 }) >= 1);
});

test('clock: the median offset of the fastest round trips, ignoring a slow outlier', () => {
  // the server is 5000 ms ahead; most trips take ~40 ms, one takes 900 ms (and would be wrong by ~450 ms)
  const s = (sent, rtt, skew = 0) => ({ sent, got: sent + rtt, server: sent + rtt / 2 + 5000 + skew });
  const est = estimateOffset([s(0, 40), s(100, 36), s(200, 900, 400), s(300, 44), s(400, 38)]);
  assert.ok(Math.abs(est.offset - 5000) < 3, `offset ${est.offset}`);
  assert.equal(est.rtt, 36);
  assert.equal(estimateOffset([]), null);
});
