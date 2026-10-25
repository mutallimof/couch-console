// Renders the isometric toy-diorama icons to public/assets/icons/<id>.png (Phase 55).
//   node scripts/render-icons.mjs            all icons
//   node scripts/render-icons.mjs bowling    just one
// Starts the console server on a spare port, opens /icons.html?id=... in headless Chromium and saves the canvas.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { SCENES_IDS } from './icon-ids.mjs';

const require = createRequire(import.meta.url);
let pw;
for (const where of [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) { try { pw = require(where); break; } catch { /* next */ } }
if (!pw) { console.error('Playwright is needed to render the icons (npm i -D playwright, or set PLAYWRIGHT_PATH).'); process.exit(1); }

const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}public/assets/icons`;
mkdirSync(out, { recursive: true });
const PORT = 9300 + Math.floor(Math.random() * 300);
const server = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), HTTPS_PORT: String(PORT + 1), DATA_DIR: `${tmpdir()}/couch-icons-${PORT}` }, stdio: 'pipe' });
await new Promise((resolve) => server.stdout.on('data', (d) => { if (String(d).includes('running at')) resolve(); }));
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const ids = process.argv.length > 2 ? process.argv.slice(2) : SCENES_IDS;
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  for (const id of ids) {
    await page.goto(`http://localhost:${PORT}/icons.html?id=${id}`);
    await page.waitForFunction((i) => window.__rendered === i, id, { timeout: 60000 });
    const clip = await page.evaluate(() => window.__bbox); // (the picture without its empty margins)
    const png = await page.screenshot({ omitBackground: true, clip });
    writeFileSync(`${out}/${id}.png`, png);
    console.log('icon', id);
  }
} finally {
  await browser.close();
  server.kill();
}
