// Turbo Karts racers: every character's model file exists, is small, has no weapons left on it and has the clips the game plays. npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { GP_CHARACTERS, CLIPS } from '../public/games/turbo-karts/ow-kart/characters.js';

// The JSON part of a .glb file
const glbJson = (file) => {
  const b = readFileSync(file);
  assert.equal(b.toString('utf8', 0, 4), 'glTF', 'a binary glTF');
  return JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12)));
};

test('the roster: 8 racers with unique ids, names and colors', () => {
  assert.equal(GP_CHARACTERS.length, 8);
  for (const key of ['id', 'name', 'color']) assert.equal(new Set(GP_CHARACTERS.map((c) => c[key])).size, 8, `unique ${key}`);
});

test('every racer has an optimized model with all the clips (idle, sit, cheer, defeat, hit, wave) and no weapons', () => {
  for (const c of GP_CHARACTERS) {
    const file = new URL(`../public/assets/${c.path}`, import.meta.url);
    assert.ok(existsSync(file), `${c.name}: ${c.path} exists`);
    assert.ok(statSync(file).size < 1.5e6, `${c.name} is under 1.5 MB`);
    const j = glbJson(file), names = (j.animations || []).map((a) => a.name);
    for (const clip of CLIPS) assert.ok(names.includes(clip), `${c.name} has ${clip}`);
    assert.equal(names.length, CLIPS.length, `${c.name} carries only the clips we use`);
    const nodes = (j.nodes || []).map((n) => n.name || '');
    assert.ok(!nodes.some((n) => /sword|axe|shield|staff|wand|crossbow|knife|dagger|mug|spellbook/i.test(n)), `${c.name} holds nothing`);
  }
});

test('the license file is shipped with the characters', () => {
  assert.match(readFileSync(new URL('../public/assets/cast/LICENSE.txt', import.meta.url), 'utf8'), /CC0/);
});
