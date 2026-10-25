// `npm test`: runs every tests/*.test.mjs with node's test runner. (A small script instead of a shell pattern, so it works the same on
// Windows, macOS and Linux and on every Node version from 20.)
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../tests/', import.meta.url));
const only = process.argv.slice(2); // optional: part of a file name, e.g. `npm test -- kart`
const files = readdirSync(dir).filter((f) => f.endsWith('.test.mjs') && (!only.length || only.some((o) => f.includes(o)))).sort().map((f) => `tests/${f}`);
const res = spawnSync(process.execPath, ['--test', '--test-concurrency=2', ...files], { stdio: 'inherit', cwd: fileURLToPath(new URL('../', import.meta.url)) });
process.exit(res.status ?? 1);
