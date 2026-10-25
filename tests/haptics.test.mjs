// Phone haptics: patterns scale with the intensity setting and "off" is silent. npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { patternFor } from '../public/phone/haptics.js';

test('haptic patterns scale with the intensity and "off" is silent', () => {
  assert.equal(patternFor('hit', 'off'), null);
  const low = patternFor('tier3', 'low'), high = patternFor('tier3', 'high');
  assert.ok(high[0] > low[0], 'stronger buzz at high');
  assert.equal(high[1], low[1], 'the pauses stay the same');
  assert.deepEqual(patternFor('nothing-known', 'medium', 90), [90], 'an unknown kind falls back to the old millisecond length');
  assert.equal(patternFor('nothing-known', 'medium'), null);
});
