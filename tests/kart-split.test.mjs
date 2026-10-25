// Turbo Karts split screen and cups, tested without a browser: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { viewRects, fovFor, hudZoom } from '../public/games/turbo-karts/karts-layout.js';
import { CUPS, CUP_POINTS, addRace } from '../public/games/turbo-karts/karts-cups.js';
import { TRACKS } from '../public/games/turbo-karts/kart-path.js';
import { GP_CHARACTERS } from '../public/games/turbo-karts/ow-kart/characters.js';

for (const n of [1, 2, 3, 4]) {
  test(`${n} player(s): the views fit the screen, never overlap and each is big enough to play`, () => {
    const W = 1280, H = 720, rects = viewRects(n, W, H);
    assert.equal(rects.length, n);
    for (const r of rects) {
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= W + 0.01 && r.y + r.h <= H + 0.01, 'inside the screen');
      assert.ok(r.w >= W / 2 - 3 && r.h >= H / 2 - 3, 'at least a quarter of the screen');
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = rects[i], b = rects[j];
      assert.ok(a.x + a.w <= b.x + 0.01 || b.x + b.w <= a.x + 0.01 || a.y + a.h <= b.y + 0.01 || b.y + b.h <= a.y + 0.01, `views ${i} and ${j} do not overlap`);
    }
  });
}

test('narrow views get a wider field of view, the full screen keeps its own, and the HUD shrinks with the number of views', () => {
  assert.equal(fovFor(57, 16 / 9), 57);
  assert.ok(fovFor(57, 0.89) > 57 && fovFor(57, 0.89) <= 57 * 1.35 + 0.001);
  assert.ok(hudZoom(1) > hudZoom(2) && hudZoom(2) > hudZoom(4));
});

test('four phones can race: a fourth pilot exists for every seat and every cup track exists', () => {
  assert.ok(GP_CHARACTERS.length >= 8);
  const ids = new Set(TRACKS.map((t) => t.id).concat('stadium'));
  for (const c of CUPS) { assert.equal(c.tracks.length, 4); for (const t of c.tracks) assert.ok(ids.has(t), `${c.id}: track ${t}`); }
  assert.equal(new Set(CUPS.flatMap((c) => c.tracks)).size, 8, 'the two cups together cover all eight tracks once');
});

test('a cup adds up points by place over the races, wins break ties', () => {
  const a = { playerId: 1, color: '#2F80ED', char: { id: 'dash', name: 'Dash' } };
  const b = { playerId: null, color: '#999', char: { id: 'rex', name: 'Rex' } };
  const table = new Map();
  addRace(table, [a, b]);                        // a 1st, b 2nd
  let totals = addRace(table, [b, a]);           // b 1st, a 2nd
  assert.equal(totals[0].points, CUP_POINTS[0] + CUP_POINTS[1]);
  assert.equal(totals[1].points, CUP_POINTS[0] + CUP_POINTS[1]);
  assert.equal(totals[0].wins, 1);
  totals = addRace(table, [a, b]);
  assert.equal(totals[0].name, 'P1', 'P1 leads after winning twice');
  assert.equal(totals[0].points, CUP_POINTS[0] * 2 + CUP_POINTS[1]);
});
