import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTheme, nextChoice, normalizeChoice } from '../public/js/shared/theme.js';

test('auto follows the device, light and dark ignore it', () => {
  assert.equal(resolveTheme('auto', true), 'dark');
  assert.equal(resolveTheme('auto', false), 'light');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});

test('unknown saved values fall back to auto', () => {
  assert.equal(normalizeChoice('purple'), 'auto');
  assert.equal(normalizeChoice(null), 'auto');
  assert.equal(resolveTheme(undefined, true), 'dark');
});

test('the Settings button cycles Light -> Dark -> Auto', () => {
  assert.equal(nextChoice('light'), 'dark');
  assert.equal(nextChoice('dark'), 'auto');
  assert.equal(nextChoice('auto'), 'light');
});
