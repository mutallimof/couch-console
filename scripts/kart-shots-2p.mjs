// Two-player (split screen) screenshots of Turbo Karts, driven through two real phone pages.
//   node scripts/kart-shots-2p.mjs <out-folder> <prefix>
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { focusOn } from '../tests/helpers-home.mjs';

const require = createRequire(import.meta.url);
const pw = [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean).map((p) => { try { return require(p); } catch { return null; } }).find(Boolean);
const [out, prefix = 'kart2p'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const PORT = 8800 + Math.floor(Math.random() * 300);
const server = spawn(process.execPath, ['server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(PORT), HTTPS_PORT: String(PORT + 1), DATA_DIR: `${tmpdir()}/couch-shots2-${PORT}` }, stdio: 'pipe' });
await new Promise((r) => server.stdout.on('data', (d) => String(d).includes('running at') && r()));
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const B = `http://localhost:${PORT}`;
  const lctx = await browser.newContext({ viewport: { width: 1024, height: 576 } });
  const lap = await lctx.newPage();
  lap.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await lap.goto(`${B}/console.html?noboot=1&ao=off`);
  await lap.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('room-code').textContent));
  const room = await lap.textContent('#room-code');
  const phones = [];
  for (const n of [1, 2]) {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
    await ctx.addInitScript((n) => localStorage.setItem('couch.profile', JSON.stringify({ name: `Racer ${n}`, emoji: '🦊', role: 'player' })), n);
    const ph = await ctx.newPage();
    await ph.goto(`${B}/remote.html?room=${room}`);
    await ph.locator('#start-btn').tap();
    await ph.evaluate(() => { document.getElementById('motion-msg').hidden = true; });
    phones.push(ph);
  }
  const press = (ph, bt) => ph.evaluate((bt) => {
    const el = document.querySelector(`#controller [data-button="${bt}"]`);
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  }, bt).then(() => lap.waitForTimeout(350));
  const shot = async (n) => { await lap.waitForFunction(() => !document.querySelector('.kk-wipe'), null, { timeout: 60000 }).catch(() => {}); await lap.waitForTimeout(1500); await lap.screenshot({ path: `${out}/${prefix}-${n}.png`, timeout: 180000 }); };
  const [p1, p2] = phones;
  await focusOn(lap, (b) => press(p1, b), 'turbo-karts');
  await press(p1, 'A');
  await lap.waitForSelector('.picker', { timeout: 30000 });
  await shot('00-mode');
  await press(p1, 'A');
  await lap.waitForFunction(() => window.__tk?.state() === 'select', null, { timeout: 180000 });
  await lap.waitForTimeout(2500);
  await press(p2, 'RIGHT'); await press(p2, 'RIGHT');
  await shot('01-select');
  for (const ph of phones) { await press(ph, 'A'); }
  await press(p2, 'RIGHT');
  await shot('02-kart');
  for (const ph of phones) { await press(ph, 'A'); }
  await lap.waitForSelector('.ks-tracks', { timeout: 20000 });
  await shot('03-track');
  await press(p1, 'RIGHT'); await press(p1, 'RIGHT');
  await press(p1, 'A');
  await lap.waitForFunction(() => window.__tk?.state() === 'race', null, { timeout: 300000 });
  await lap.evaluate(() => { window.__tk.input(1, { gas: true, steer: 0 }); window.__tk.input(2, { gas: true, steer: 0 }); });
  await lap.waitForTimeout(6000);
  await lap.evaluate(() => { window.__tk.input(1, { gas: true, drift: true, steer: 0.7 }); });
  await lap.waitForTimeout(3000);
  await shot('04-split-drift');
  await lap.evaluate(() => window.__tk.results());
  await shot('05-results');
  console.log('shots saved in', out);
} finally {
  await browser.close();
  server.kill();
}
