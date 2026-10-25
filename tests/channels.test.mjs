// Timer channel rules (countdown, stopwatch, time format), tested without a browser: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTime, createCountdown, createStopwatch, MAX_TIMER } from '../public/apps/timer-logic.js';

// A fake clock we can move by hand
function clock() { let t = 1000; return { now: () => t, wait: (ms) => { t += ms; } }; }

test('times are written like a kitchen timer', () => {
  assert.equal(formatTime(75500), '1:16'); // a countdown rounds up: it says 0:01 until it's over
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(3723000), '1:02:03');
  assert.equal(formatTime(75540, { tenths: true }), '1:15.5');
  assert.equal(formatTime(-50), '0:00');
});

test('the countdown runs, pauses and runs out', () => {
  const c = clock(), t = createCountdown(c.now, 60000);
  t.start(); c.wait(20000);
  assert.equal(t.remaining(), 40000);
  t.pause(); c.wait(30000);
  assert.equal(t.remaining(), 40000, 'paused: no time passes');
  assert.ok(!t.running);
  t.start(); c.wait(45000);
  assert.ok(t.done && !t.running);
  assert.equal(t.remaining(), 0);
  t.reset();
  assert.equal(t.remaining(), 60000, 'reset goes back to the set time');
});

test('the countdown time can only change while stopped, between 0:10 and 99:59', () => {
  const c = clock(), t = createCountdown(c.now, 60000);
  t.add(-120000); assert.equal(t.length, 10000);
  t.add(200 * 60000); assert.equal(t.length, MAX_TIMER);
  t.start(); t.add(-60000);
  assert.equal(t.length, MAX_TIMER, 'running: the time stays');
});

test('the stopwatch counts, pauses and keeps the last laps', () => {
  const c = clock(), s = createStopwatch(c.now, 3);
  s.start(); c.wait(1500);
  for (let i = 0; i < 4; i++) { s.lap(); c.wait(1000); }
  assert.deepEqual(s.laps, [4500, 3500, 2500], 'newest first, at most 3');
  s.pause(); c.wait(9999);
  assert.equal(s.elapsed(), 5500);
  s.reset();
  assert.equal(s.elapsed(), 0); assert.equal(s.laps.length, 0);
});
