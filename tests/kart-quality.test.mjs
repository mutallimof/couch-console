// Turbo Karts picture quality: levels, real-pixel rendering, automatic step-down. npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, CHOICES, featuresFor, pixelRatioFor, createAutoLevel } from '../public/games/turbo-karts/karts-quality.js';

test('three levels: each one drops effects, low is the plain picture', () => {
  assert.deepEqual(LEVELS, ['high', 'medium', 'low']);
  assert.equal(CHOICES[0], 'auto');
  const h = featuresFor('high', 1), m = featuresFor('medium', 1), l = featuresFor('low', 1);
  assert.ok(h.post && h.ao && h.msaa > 0 && h.outline && h.bloom);
  assert.ok(m.post && !m.ao && m.msaa === 0 && m.bloom);
  assert.ok(!l.post && !l.ao && !l.bloom);
  assert.equal(featuresFor('high', 4).ao, false, 'four views: no soft shadows');
});

test('the picture is drawn at the real pixels of the screen, never below 1x', () => {
  assert.equal(pixelRatioFor(1, 1920, 1080), 1);
  assert.equal(pixelRatioFor(2, 1440, 900), 2, 'a laptop retina screen is drawn at its real pixels');
  assert.equal(pixelRatioFor(3, 1280, 720), 2, 'capped at 2x');
  assert.equal(pixelRatioFor(1, 3840, 2160), 1, 'a 4K TV is not drawn below its own pixels');
  const big = pixelRatioFor(2, 2560, 1440);
  assert.ok(big >= 1 && big < 2, 'a very large 2x screen is trimmed to the pixel budget');
  assert.equal(pixelRatioFor(undefined, 800, 600), 1);
});

test('auto steps down one level after a few slow seconds, and never back up', () => {
  const a = createAutoLevel({ lowFps: 50, seconds: 3 });
  for (let t = 0; t < 2.9; t += 0.1) assert.equal(a.tick(30, 0.1), null);
  assert.equal(a.tick(60, 0.1), null, 'a good second resets the count');
  let changed = null;
  for (let t = 0; t < 3.3 && !changed; t += 0.1) changed = a.tick(30, 0.1);
  assert.equal(changed, 'medium');
  for (let t = 0; t < 10; t += 0.1) a.tick(60, 0.1);
  assert.equal(a.level, 'medium');
  for (let t = 0; t < 4; t += 0.1) a.tick(20, 0.1);
  assert.equal(a.level, 'low');
  for (let t = 0; t < 10; t += 0.1) assert.equal(a.tick(5, 0.1), null, 'low is the floor');
});
