// Turbo Karts pilots: eight racers, each with a helmet design of their own (made in code, no model files). npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { GP_CHARACTERS, CLIPS } from '../public/games/turbo-karts/ow-kart/characters.js';
import { HELMETS } from '../public/games/turbo-karts/karts-pilot.js';
import { KARTS } from '../public/games/turbo-karts/karts-data.js';

test('the roster: 8 racers with unique ids, names and colors', () => {
  assert.equal(GP_CHARACTERS.length, 8);
  for (const key of ['id', 'name', 'color']) assert.equal(new Set(GP_CHARACTERS.map((c) => c[key])).size, 8, `unique ${key}`);
  for (const c of GP_CHARACTERS) {
    assert.match(c.color, /^#[0-9A-F]{6}$/i); assert.match(c.accent, /^#[0-9A-F]{6}$/i);
    assert.ok(c.tag && c.name, `${c.id} has a name and a tagline`);
  }
});

test('every racer has a helmet design of its own (unique base color and visor tint)', () => {
  for (const c of GP_CHARACTERS) assert.ok(HELMETS[c.id], `${c.name} has a helmet`);
  assert.equal(new Set(GP_CHARACTERS.map((c) => HELMETS[c.id].base)).size, 8, 'unique helmet colors');
  assert.equal(new Set(GP_CHARACTERS.map((c) => HELMETS[c.id].visor)).size, 8, 'unique visors');
});

test('the pilots can drive, idle, wave, cheer, defeat and flinch; four distinct karts', () => {
  assert.deepEqual(CLIPS, ['drive', 'idle', 'wave', 'cheer', 'defeat', 'hit']);
  assert.equal(new Set(KARTS.map((k) => k.id)).size, 4);
  for (const k of KARTS) for (const s of ['speed', 'accel', 'handling', 'weight']) assert.ok(k[s] >= 1 && k[s] <= 5);
});
