// Turbo Karts art tokens: every track is painted from the style palette. npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, TRACK_PAIRS, ROLES, LIGHTS, lightOf, trackPaint } from '../public/games/turbo-karts/karts-tokens.js';
import { TRACKS } from '../public/games/turbo-karts/kart-path.js';
import { STADIUM } from '../public/games/turbo-karts/ow-kart/stadium/stadium-def.js';

const FIVE = ['cushion', 'sky', 'pop', 'mint', 'butter'];

test('every track has its own pair of the five style colors', () => {
  const seen = new Set();
  for (const t of [...TRACKS, STADIUM]) {
    const pair = TRACK_PAIRS[t.theme];
    assert.ok(pair, `${t.id} has a pair`);
    assert.ok(pair.every((c) => FIVE.includes(c)) && pair[0] !== pair[1], `${t.id}: two different style colors`);
    assert.ok(!seen.has(pair.join()), `${t.id}: no other track has the same pair`);
    seen.add(pair.join());
  }
});

test('track paint comes from the palette: cream stripes, slate road (wood on the boardwalk)', () => {
  for (const t of TRACKS) {
    assert.deepEqual({ road: t.road, curb: t.curb, wall: t.wall }, trackPaint(t.theme));
    assert.equal(t.curb[1], PALETTE.cream);
    assert.equal(t.wall[1], PALETTE.cream);
    assert.equal(t.road, t.theme === 'pirate' ? PALETTE.wood : PALETTE.slate);
  }
});

test('no pure black in the palette, and the three roles are distinct', () => {
  for (const hex of Object.values(PALETTE)) assert.notEqual(hex.toLowerCase(), '#000000');
  assert.ok(ROLES.plastic.roughness < ROLES.rubber.roughness);
  assert.equal(ROLES.glow.toneMapped, false);
});

test('light presets: day by default, dusk on Sunset Avenue, night for night tracks', () => {
  assert.equal(lightOf({}), LIGHTS.day);
  assert.equal(lightOf(TRACKS.find((t) => t.id === 'avenue')), LIGHTS.dusk);
  assert.equal(lightOf({ night: true, light: 'dusk' }), LIGHTS.night);
  for (const p of Object.values(LIGHTS)) assert.ok(p.key > 0 && p.hemi > 0 && p.fill > 0);
});
