// Proves that a fresh clone works: clones this repository (what is committed) into a temp folder, runs `npm ci`, `npm test`, starts the
// server and loads the console page. Works the same on Windows, macOS and Linux.
//   node scripts/check-fresh-clone.mjs [--skip-tests]
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'couch-clone-'));
const win = process.platform === 'win32';
const run = (cmd, args, opts = {}) => { console.log(`\n$ ${cmd} ${args.join(' ')}`); const r = spawnSync(cmd, args, { stdio: 'inherit', shell: win, ...opts }); if (r.status !== 0) { console.error(`FAILED: ${cmd} ${args.join(' ')}`); process.exit(1); } };
try {
  run('git', ['clone', '--quiet', root, join(dir, 'couch-console')]);
  const cwd = join(dir, 'couch-console');
  run('npm', ['ci', '--no-audit', '--no-fund'], { cwd });
  if (!process.argv.includes('--skip-tests')) run('npm', ['test'], { cwd });
  // start it and load the pages
  const PORT = String(9100 + Math.floor(Math.random() * 500));
  const server = spawn(process.execPath, ['server/index.js'], { cwd, env: { ...process.env, PORT, HTTPS_PORT: String(Number(PORT) + 1), DATA_DIR: join(dir, 'data') }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error('the server did not start')), 20000); server.stdout.on('data', (d) => { process.stdout.write(d); if (String(d).includes('running at')) { clearTimeout(t); resolve(); } }); });
  for (const path of ['/console.html', '/remote.html', '/api/apps']) {
    const res = await fetch(`http://localhost:${PORT}${path}`);
    if (!res.ok) { console.error(`${path} answered ${res.status}`); server.kill(); process.exit(1); }
    console.log(`GET ${path} -> ${res.status}`);
  }
  server.kill();
  console.log('\nA fresh clone works: npm ci, npm test and npm start all passed.');
} finally { rmSync(dir, { recursive: true, force: true }); }
