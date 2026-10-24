// Turbo Karts GP racers: every character's model file exists and has the clips the game plays. npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { GP_CHARACTERS } from '../public/js/console/games/ow-kart/characters.js';

test('every GP racer has a Quaternius model with Idle and Victory (and a hit) animation', () => {
  assert.equal(new Set(GP_CHARACTERS.map((c) => c.id)).size, GP_CHARACTERS.length, 'unique ids');
  assert.ok(GP_CHARACTERS.length >= 8, 'enough racers for a full grid');
  for (const c of GP_CHARACTERS) {
    const file = new URL(`../public/assets/${c.path}`, import.meta.url);
    assert.ok(existsSync(file), `${c.name}: ${c.path} exists`);
    const names = JSON.parse(readFileSync(file, 'utf8')).animations.map((a) => a.name);
    for (const clip of ['Idle', 'Victory', 'RecieveHit']) assert.ok(names.includes(clip), `${c.name} has ${clip}`);
  }
});

test('the license file is shipped with the characters', () => {
  assert.match(readFileSync(new URL('../public/assets/quaternius-characters/License.txt', import.meta.url), 'utf8'), /CC0/);
});
