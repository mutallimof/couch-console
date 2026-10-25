// Graphics settings (cartoon look, soft shadows): defaults, saving and change notices. npm test
import test from 'node:test';
import assert from 'node:assert/strict';

// A tiny localStorage so the module can save like it does in the browser
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
const { graphics } = await import('../public/console/graphics-prefs.js');

test('both graphics options are on by default', () => {
  assert.equal(graphics.cartoon, true);
  assert.equal(graphics.ao, true);
});

test('changes are saved and announced, and listening can be stopped', () => {
  const seen = [];
  const stop = graphics.onChange((name, on) => seen.push([name, on]));
  graphics.set('cartoon', false);
  assert.equal(graphics.cartoon, false);
  assert.equal(graphics.ao, true, 'the other option is untouched');
  assert.deepEqual(seen, [['cartoon', false]]);
  stop();
  graphics.set('ao', false);
  assert.equal(seen.length, 1, 'no notice after stopping');
  assert.equal(graphics.ao, false);
});
