// Every Kenney sound the game asks for exists, and every synth fallback has a name. npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { KENNEY, HOVER_RATES } from '../public/js/console/sound-map.js';

test('every mapped sound file exists and is a sound the game plays', () => {
  const src = readFileSync(new URL('../public/js/console/sound.js', import.meta.url), 'utf8');
  for (const [name, spec] of Object.entries(KENNEY)) {
    assert.ok(existsSync(new URL(`../public/assets/sounds/kenney/${spec.file}`, import.meta.url)), `${name}: ${spec.file}`);
    assert.ok(spec.vol > 0 && spec.vol <= 1, `${name}: volume`);
    assert.match(src, new RegExp(`\\b${name}:`), `${name} also has a synth fallback`);
  }
  assert.equal(HOVER_RATES.length, 5);
});
test('the packs keep their license files', () => {
  for (const d of ['ui', 'interface', 'impact', 'jingles']) assert.ok(existsSync(new URL(`../public/assets/sounds/kenney/${d}/License.txt`, import.meta.url)), d);
});
