// Every 3D model the code asks for is really in public/assets (and the textures those models load).
// This catches a model that was deleted or renamed by mistake. npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';

const pub = new URL('../public/', import.meta.url).pathname;
const code = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p); else if (/\.(js|json)$/.test(f)) code.push(readFileSync(p, 'utf8'));
  }
})(join(pub, 'js'));
const all = code.join('\n');

function wanted() {
  const out = new Set();
  for (const m of all.matchAll(/\b(CAR|RACE|PIRATE)\('([^']+)'\)/g)) out.add(m[1] === 'CAR' ? `car-kit/Models/GLB format/${m[2]}.glb` : m[1] === 'RACE' ? `racing-kit/Models/GLTF format/${m[2]}.glb` : `pirate-kit/glTF/${m[2]}.gltf`);
  for (const m of all.matchAll(/model: '(vehicle-[\w-]+)'/g)) out.add(`car-kit/Models/GLB format/${m[1]}.glb`);
  for (const m of all.matchAll(/\bQ\('([^']+)'\)/g)) out.add(`quaternius-characters/glTF/${m[1]}.gltf`);
  return [...out];
}

// The files a model points to (textures, buffers) inside its own JSON
function pointsTo(path) {
  const file = join(pub, 'assets', path);
  let json;
  if (path.endsWith('.glb')) { const b = readFileSync(file); json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8')); } else json = JSON.parse(readFileSync(file, 'utf8'));
  return [...(json.images || []), ...(json.buffers || [])].filter((x) => x.uri && !x.uri.startsWith('data:')).map((x) => normalize(join(dirname(path), decodeURIComponent(x.uri))));
}

test('the code asks for a sensible number of models (the search itself works)', () => {
  assert.ok(wanted().length >= 45, `found ${wanted().length}`);
});

test('every model the code asks for exists, and so does everything it loads', () => {
  const missing = [];
  for (const p of wanted()) {
    if (!existsSync(join(pub, 'assets', p))) { missing.push(p); continue; }
    for (const dep of pointsTo(p)) if (!existsSync(join(pub, 'assets', dep))) missing.push(`${dep} (needed by ${p})`);
  }
  assert.deepEqual(missing, []);
});

test('each asset pack keeps its license file', () => {
  for (const f of ['car-kit/License.txt', 'racing-kit/License.txt', 'quaternius-characters/License.txt']) assert.ok(existsSync(join(pub, 'assets', f)), f);
});
