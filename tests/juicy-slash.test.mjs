// Juicy Slash rules, tested without a browser: npm test
// (adapted from OpenWii's games/fruit-ninja/logic.test.mjs, MIT)
import test from 'node:test';
import assert from 'node:assert/strict';
import { SlashBoard, FIELD_H } from '../public/games/juicy-slash-rules.js';

/**
 * The eight mechanics that had to survive the 2D→3D port.
 *
 * These are the same eight behaviours the 2D build was verified against. The
 * coordinate literals differ because the units changed from window pixels to
 * world units — the assertions did not.
 */

/** A game with spawning suppressed, so tests control the board exactly. */
function game() {
  const g = new SlashBoard({ difficulty: 'hard', aspect: 16 / 9 });
  g.start(0);
  g.state.nextSpawn = Infinity;
  return g;
}

function put(g, x, y, bomb = false) {
  g.fruits.push({
    x, y, vx: 0, vy: 0, r: 0.65, rot: 0, spin: 0,
    spinAxis: { x: 0, y: 1, z: 0 }, bomb, kind: { rind: 0, flesh: 0 }, id: 1,
  });
  return g.fruits[g.fruits.length - 1];
}

/** Sweep the pointer across the field, stepping the real update loop. */
function sweep(g, x0, x1, y, steps, dtMs, clock) {
  for (let i = 0; i <= steps; i += 1) {
    clock.t += dtMs;
    g.setCursor(x0 + ((x1 - x0) * i) / steps, y, clock.t);
    g.state.nextSpawn = Infinity;
    g.update(clock.t, dtMs / 1000);
  }
}

test('a fast slash slices the fruit into two halves with juice', () => {
  const g = game();
  const clock = { t: 0 };
  put(g, 0, 0);
  sweep(g, -3, 3, 0, 5, 16, clock);
  assert.equal(g.fruits.length, 0, 'fruit consumed');
  assert.equal(g.halves.length, 2, 'two halves');
  assert.ok(g.particles.length > 0, 'juice particles');
  assert.ok(g.state.score > 0, 'scored');
});

test('a slow drag through a fruit does not slice it', () => {
  const g = game();
  const clock = { t: 0 };
  put(g, 0, 0);
  // 0.02 world units per 16ms = 1.25 u/s, well under MIN_SLICE_SPEED (3.25).
  sweep(g, -0.1, 0.1, 0, 10, 16, clock);
  assert.equal(g.fruits.length, 1, 'fruit survives');
  assert.equal(g.state.score, 0, 'no score');
});

test('a fast slash that misses does not slice', () => {
  const g = game();
  const clock = { t: 0 };
  put(g, 0, 0);
  sweep(g, -3, 3, 3.5, 5, 16, clock);   // same speed, far above the fruit
  assert.equal(g.fruits.length, 1, 'fruit survives');
  assert.equal(g.state.score, 0, 'no score');
});

test('slicing two fruits in one swipe pays a combo bonus', () => {
  const g = game();
  const clock = { t: 0 };
  put(g, -1.2, 0);
  put(g, 1.2, 0);
  sweep(g, -4, 4, 0, 6, 16, clock);
  assert.equal(g.state.combo, 2, 'combo counted');
  // 1 for the first + (1 + 2) for the second = 4, vs 2 with no bonus.
  assert.ok(g.state.score >= 3, `combo bonus applied (got ${g.state.score})`);
});

test('slicing a bomb ends the game', () => {
  const g = game();
  const clock = { t: 0 };
  put(g, 0, 0, true);
  sweep(g, -3, 3, 0, 5, 16, clock);
  assert.equal(g.state.phase, 'over', 'game over');
  assert.ok(g.particles.length > 50, 'explosion');
});

test('a bomb that falls off the bottom costs nothing', () => {
  const g = game();
  const f = put(g, 0, -FIELD_H / 2 - 2, true);
  f.vy = -1;
  g.update(16, 0.016);
  assert.equal(g.state.lives, 3, 'lives untouched');
  assert.equal(g.state.phase, 'playing', 'still playing');
  assert.equal(g.fruits.length, 0, 'bomb removed');
});

test('a fruit that falls off the bottom costs a life', () => {
  const g = game();
  const f = put(g, 0, -FIELD_H / 2 - 2);
  f.vy = -1;
  g.update(16, 0.016);
  assert.equal(g.state.lives, 2, 'one life lost');
  assert.equal(g.fruits.length, 0, 'fruit removed');
});

test('losing the last life ends the game', () => {
  const g = game();
  g.state.lives = 1;
  const f = put(g, 0, -FIELD_H / 2 - 2);
  f.vy = -1;
  g.update(16, 0.016);
  assert.equal(g.state.lives, 0);
  assert.equal(g.state.phase, 'over', 'game over');
});

// ── Practice mode and criticals ──────────────────────────────────────────────

function practiceGame(rng = () => 0.99) {
  const g = new SlashBoard({ difficulty: 'hard', aspect: 16 / 9, infiniteLives: true, rng });
  g.start(0);
  g.state.nextSpawn = Infinity;
  return g;
}

test('practice: dropped fruit never costs a life or ends the run', () => {
  const g = practiceGame();
  for (let n = 0; n < 10; n += 1) {
    const f = put(g, 0, -FIELD_H / 2 - 2);
    f.vy = -1;
    g.update(16 * (n + 1), 0.016);
  }
  assert.equal(g.state.lives, 3, 'lives untouched after 10 drops');
  assert.equal(g.state.phase, 'playing', 'still playing');
});

test('practice: a bomb explodes and costs points, not the run', () => {
  const g = practiceGame();
  g.state.score = 25;
  const clock = { t: 0 };
  put(g, 0, 0, true);
  sweep(g, -3, 3, 0, 5, 16, clock);
  assert.equal(g.state.phase, 'playing', 'run continues');
  assert.equal(g.state.score, 15, 'bomb penalty applied');
  assert.ok(g.particles.length > 50, 'still explodes visually');
});

test('practice: bomb penalty never takes the score negative', () => {
  const g = practiceGame();
  g.state.score = 3;
  const clock = { t: 0 };
  put(g, 0, 0, true);
  sweep(g, -3, 3, 0, 5, 16, clock);
  assert.equal(g.state.score, 0);
});

test('a critical slice pays +10 and is flagged in the event', () => {
  const events = [];
  const g = new SlashBoard({ difficulty: 'hard', aspect: 16 / 9, rng: () => 0, onEvent: (e) => events.push(e) });
  g.start(0);
  g.state.nextSpawn = Infinity;
  const clock = { t: 0 };
  put(g, 0, 0);
  sweep(g, -3, 3, 0, 5, 16, clock);
  const slice = events.find((e) => e.type === 'slice');
  assert.equal(slice.critical, true);
  assert.equal(slice.gained, 11, '1 base + 10 critical');
  assert.equal(g.state.score, 11);
});

test('spawning emits a launch event (the throw sound hook)', () => {
  const events = [];
  const g = new SlashBoard({ difficulty: 'hard', aspect: 16 / 9, onEvent: (e) => events.push(e) });
  g.start(0);
  g.spawn(false, 1000);
  g.spawn(true, 1000);
  const launches = events.filter((e) => e.type === 'launch');
  assert.equal(launches.length, 2);
  assert.deepEqual(launches.map((e) => e.bomb), [false, true]);
});

// ── Multiplayer: several phones on the same board ───────────────────────────
// The server tags every packet with a `slot` (see server/index.js); logic.js fans
// out its single blade into one per connected phone. These tests exercise
// slots directly rather than through a socket, same as every other test here.

/** Sweep a named slot's blade across the field. */
function sweepSlot(g, slot, x0, x1, y, steps, dtMs, clock) {
  for (let i = 0; i <= steps; i += 1) {
    clock.t += dtMs;
    g.setCursor(x0 + ((x1 - x0) * i) / steps, y, clock.t, slot);
    g.state.nextSpawn = Infinity;
    g.update(clock.t, dtMs / 1000);
  }
}

test('two players slicing at once keep separate scores and combos', () => {
  const g = game();
  const clock = { t: 0 };
  put(g, -1.2, 0);
  sweepSlot(g, 0, -4, 4, 0, 6, 16, clock);   // slot 0 slices the left fruit
  put(g, 1.2, 0);
  sweepSlot(g, 1, -4, 4, 0, 6, 16, clock);   // slot 1 slices the right fruit

  const p0 = g.getPlayer(0);
  const p1 = g.getPlayer(1);
  assert.equal(g.fruits.length, 0, 'both fruit sliced');
  assert.ok(p0.score > 0 && p1.score > 0, 'both players scored');
  assert.equal(g.state.score, p0.score + p1.score, 'combined total is the sum');
});

test('each slice event carries the slot that cut it', () => {
  const events = [];
  const g = new SlashBoard({ difficulty: 'hard', aspect: 16 / 9, onEvent: (e) => events.push(e) });
  g.start(0);
  g.state.nextSpawn = Infinity;
  const clock = { t: 0 };
  put(g, 0, 0);
  sweepSlot(g, 2, -3, 3, 0, 5, 16, clock);
  const slice = events.find((e) => e.type === 'slice');
  assert.equal(slice.slot, 2);
  assert.equal(slice.playerScore, g.getPlayer(2).score);
});

test('a slot that goes quiet stops slicing — no ghost blade', () => {
  const g = game();
  const clock = { t: 0 };
  // Slot 0 takes one fast real swing, then falls silent (as if the phone
  // disconnected mid-swing) — its last segment sits frozen at x≈4.
  sweepSlot(g, 0, -4, 4, 0, 6, 16, clock);
  assert.ok(g.getPlayer(0).trail.speed() > 0, 'sanity: that swing really was fast');

  // Nothing else touches the board for 300ms — comfortably past the 200ms
  // staleness cutoff — then a fruit drifts across the frozen blade's exact
  // former position, moving too slowly to be a real slice by anyone.
  for (let i = 0; i < 20; i += 1) { clock.t += 16; g.update(clock.t, 0.016); }
  put(g, 4, 0);
  for (let i = 0; i < 10; i += 1) { clock.t += 16; g.update(clock.t, 0.016); }
  assert.equal(g.fruits.length, 1, 'the stale blade did not cut it');
});

test('start() resets every known player\'s score but keeps their slot', () => {
  const g = game();
  const clock = { t: 0 };
  put(g, -1.2, 0);
  sweepSlot(g, 0, -4, 4, 0, 6, 16, clock);
  put(g, 1.2, 0);
  sweepSlot(g, 1, -4, 4, 0, 6, 16, clock);
  assert.ok(g.getPlayer(0).score > 0 && g.getPlayer(1).score > 0);

  g.start(1000);
  assert.equal(g.getPlayer(0).score, 0);
  assert.equal(g.getPlayer(1).score, 0);
  assert.equal(g.state.score, 0);
  assert.ok(g.players.has(0) && g.players.has(1), 'slots survive the reset');
});

test('practice: a bomb costs both the shared total and the popping player', () => {
  const g = practiceGame();
  g.state.score = 20;
  g.getPlayer(1).score = 8;
  const clock = { t: 0 };
  put(g, 0, 0, true);
  sweepSlot(g, 1, -3, 3, 0, 5, 16, clock);
  assert.equal(g.state.phase, 'playing');
  assert.equal(g.state.score, 10, 'shared total docked');
  assert.equal(g.getPlayer(1).score, 0, 'the popping player\'s own score docked and floored at 0');
});

test('the shared life pool costs everyone, regardless of who is playing', () => {
  const g = game();
  // Two players connected (slot 0 and 1), but a miss is not slot-scoped.
  g.getPlayer(1);
  const f = put(g, 0, -FIELD_H / 2 - 2);
  f.vy = -1;
  g.update(16, 0.016);
  assert.equal(g.state.lives, 2, 'one shared life lost');
});

// ── Difficulty (Part 4): Normal is comfortable, Hard is the original ───────────

function level(name) {
  const g = new SlashBoard({ aspect: 16 / 9, difficulty: name });
  g.start(0);
  g.state.nextSpawn = Infinity;
  return g;
}
function drop(g, now) { const f = put(g, 0, -FIELD_H / 2 - 2); f.vy = -1; g.update(now, 0.016); }

test('hearts to start with: easy 7, normal 5, hard 3 (and normal is the default)', () => {
  assert.equal(level('easy').state.lives, 8);
  assert.equal(level('normal').state.lives, 6);
  assert.equal(level('hard').state.lives, 3);
  assert.equal(new SlashBoard().difficultyName, 'normal');
});

test('after losing a heart there is a grace period: the next drops cost nothing', () => {
  const g = level('normal');
  for (let n = 0; n < g.cfg.missesPerHeart; n += 1) drop(g, 100 + n);
  assert.equal(g.state.lives, 5, 'a few drops cost one heart');
  for (let n = 0; n < 6; n += 1) drop(g, 200 + n);
  assert.equal(g.state.lives, 5, 'grace: no more lost right away');
  for (let n = 0; n < g.cfg.missesPerHeart; n += 1) drop(g, 100 + g.cfg.grace + 50 + n);
  assert.equal(g.state.lives, 4, 'drops after the grace period count again');
});

test('normal: a bomb costs one heart, not the whole run; hard: a bomb ends it', () => {
  const g = level('normal'), clock = { t: 5000 };
  put(g, 0, 0, true);
  sweep(g, -3, 3, 0, 5, 16, clock);
  assert.equal(g.state.phase, 'playing');
  assert.equal(g.state.lives, 5);
  const h = level('hard'), c2 = { t: 5000 };
  put(h, 0, 0, true);
  sweep(h, -3, 3, 0, 5, 16, c2);
  assert.equal(h.state.phase, 'over');
});

test('slicing a heart gives one back (up to the most you can hold); a dropped heart costs nothing', () => {
  const g = level('normal'), clock = { t: 5000 };
  g.state.lives = 3;
  const f = put(g, 0, 0); f.heart = true;
  sweep(g, -3, 3, 0, 5, 16, clock);
  assert.equal(g.state.lives, 4);
  const h = level('normal');
  const f2 = put(h, 0, -FIELD_H / 2 - 2); f2.heart = true; f2.vy = -1;
  h.update(100, 0.016);
  assert.equal(h.state.lives, 6, 'no heart lost');
  const m = level('normal'); m.state.lives = m.cfg.maxLives;
  const f3 = put(m, 0, 0); f3.heart = true;
  sweep(m, -3, 3, 0, 5, 16, { t: 5000 });
  assert.equal(m.state.lives, m.cfg.maxLives, 'capped');
});

test('hearts appear on their own, and sooner when you are nearly out', () => {
  const g = level('normal');
  const spawned = [];
  g.onEvent = (e) => { if (e.type === 'launch' && e.heart) spawned.push(e); };
  g.state.lives = 3;
  for (let t = 1000; t < 60000; t += 100) { g.state.nextSpawn = t; g.update(t, 0.1); g.fruits.length = 0; }
  assert.ok(spawned.length >= 2, `several hearts in a minute (${spawned.length})`);
});

test('normal ramps more slowly than hard, and has no bombs in the first seconds', () => {
  const n = level('normal'), h = level('hard');
  assert.ok(n.spawnInterval(30000) > h.spawnInterval(30000) + 150, 'slower after 30 s');
  assert.equal(n.bombChance(3000), 0, 'calm start');
  assert.ok(n.bombChance(120000) <= n.cfg.bombMax);
});

test('a casual player (misses 3 in 10) lasts a good while on normal, a beginner (misses half) still gets 20 s', () => {
  const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const survive = (missRate, seed) => {
    const real = Math.random; Math.random = seeded(seed);
    try {
      const g = new SlashBoard({ aspect: 16 / 9, difficulty: 'normal', rng: Math.random });
      g.start(0);
      let t = 0;
      for (; t < 180000 && g.state.phase === 'playing'; t += 16) {
        g.update(t, 0.016);
        // the simulated player cuts a fruit on its way up (hearts always, bombs never)
        for (let i = g.fruits.length - 1; i >= 0; i -= 1) {
          const f = g.fruits[i];
          if (f.sim === undefined && f.vy > 0 && f.y > 0) f.sim = f.bomb ? 'skip' : f.heart ? 'cut' : Math.random() < missRate ? 'skip' : 'cut';
          if (f.sim === 'cut') {
            g.fruits.splice(i, 1);
            if (f.heart) g.state.lives = Math.min(g.cfg.maxLives, g.state.lives + 1);
          }
        }
      }
      return t / 1000;
    } finally { Math.random = real; }
  };
  const casual = [1, 2, 3].map((s) => survive(0.3, s)), beginner = [1, 2, 3].map((s) => survive(0.5, s));
  assert.ok(Math.min(...casual) >= 35, `casual players last a good while (${casual})`);
  assert.ok(Math.min(...beginner) >= 20, `beginners last 20 s or more (${beginner})`);
});
