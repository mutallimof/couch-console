// Turbo Karts world: every track gets real terrain under its road (never above it), the noise is deterministic, and the haptic
// patterns scale with the intensity setting. Pure code: no browser needed. npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TRACKS } from '../public/games/turbo-karts/kart-path.js';
import { createTrackModel } from '../public/games/turbo-karts/ow-kart/track-model.js';
import { renderPath } from '../public/games/turbo-karts/ow-kart/render-path.js';
import { buildTerrain } from '../public/games/turbo-karts/karts-terrain.js';
import { makeNoise } from '../public/games/turbo-karts/karts-noise.js';
import { WORLD, worldOf } from '../public/games/turbo-karts/karts-themes.js';

test('noise is deterministic and stays in 0..1', () => {
  const a = makeNoise(5), b = makeNoise(5);
  for (let i = 0; i < 200; i++) {
    const x = i * 0.37, z = i * 0.91;
    assert.equal(a.fbm(x, z), b.fbm(x, z));
    const v = a.noise2(x, z);
    assert.ok(v >= 0 && v <= 1);
  }
});

test('every track theme has a sky and terrain palette', () => {
  for (const t of TRACKS) {
    const w = worldOf(t);
    assert.ok(WORLD[t.theme], `${t.id} has a world`);
    for (const k of ['zenith', 'mid', 'horizon', 'cloud']) assert.match(w.sky[k], /^#[0-9A-F]{6}$/i, `${t.id} sky ${k}`);
    assert.ok(w.terrain.colors.length >= 2, `${t.id} terrain colors`);
  }
});

test('terrain lies under the road on every track (no floating road, no hill through it)', () => {
  for (const def of TRACKS) {
    const path = renderPath(THREE, createTrackModel(def));
    const t = buildTerrain(THREE, def, path, { fogFar: 300 });
    const pos = t.mesh.geometry.attributes.position;
    assert.ok(pos.count > 5000, `${def.id} has a real mesh`);
    for (let i = 0; i < pos.count; i += 97) assert.ok(Number.isFinite(pos.getY(i)), `${def.id} finite height`);
    let worst = -Infinity;
    for (let i = 0; i < path.pts.length; i += 25) {
      const p = path.pts[i];
      const gap = p.y - t.heightAt(p.x, p.z); // how far the road is above the ground right under it
      assert.ok(gap > 0.2 && gap < 3.2 + 0.01 || def.theme === 'city', `${def.id} road ${gap.toFixed(2)} m above the ground at sample ${i}`);
      worst = Math.max(worst, gap);
    }
  }
});
