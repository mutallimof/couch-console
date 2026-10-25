// Screenshots of the Turbo Karts menus (first menu, racer + kart select, track select) for 1-4 players.
//   node scripts/kart-menus.mjs <outDir> [players=1]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
for (const where of [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) { try { pw = require(where); break; } catch { /* next */ } }
if (!pw) { console.error('Playwright is needed (npm i -D playwright).'); process.exit(1); }
const [outDir = 'out/kart', players = '1'] = process.argv.slice(2);
const n = Number(players);
mkdirSync(outDir, { recursive: true });
const root = fileURLToPath(new URL('..', import.meta.url));
const PORT = 9600 + Math.floor(Math.random() * 100);
const server = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), HTTPS_PORT: String(PORT + 1), PING_TIMEOUT_MS: '600000', DATA_DIR: `${tmpdir()}/couch-menus-${PORT}` }, stdio: 'pipe' });
await new Promise((resolve) => server.stdout.on('data', (d) => { if (String(d).includes('running at')) resolve(); }));
const browser = await pw.chromium.launch();
try {
  const B = `http://localhost:${PORT}`;
  const tv = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  tv.on('pageerror', (e) => console.log('page error:', String(e).slice(0, 200)));
  await tv.goto(`${B}/console.html?noboot=1&fx=auto&kartdebug=1`);
  await tv.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('room-code').textContent));
  const room = await tv.textContent('#room-code');
  const phones = [];
  for (let i = 0; i < n; i++) {
    const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
    await p.addInitScript((k) => localStorage.setItem('couch.profile', JSON.stringify({ name: `Player ${k}`, emoji: '🦊', role: 'player' })), i + 1);
    await p.goto(`${B}/remote.html?room=${room}`);
    await p.waitForFunction(() => document.getElementById('badge').textContent.startsWith('P'));
    phones.push(p);
  }
  await phones[0].locator('#start-btn').tap().catch(() => {});
  await phones[0].evaluate(() => { document.getElementById('motion-msg').hidden = true; });
  const press = (i, b) => phones[i].evaluate((bt) => { const el = document.querySelector(`[data-button="${bt}"]`); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); }, b);
  const all = async (b) => { for (let i = 0; i < n; i++) await press(i, b); };
  const shot = async (name) => { await tv.waitForTimeout(1800); await tv.screenshot({ path: `${outDir}/${name}.jpg`, type: 'jpeg', quality: 88, timeout: 120000 }); console.log('shot', name); };
  await tv.waitForFunction(() => document.querySelector('.menu [data-focus="turbo-karts"]'));
  await press(0, 'A'); await tv.waitForTimeout(1500);
  if (await tv.waitForSelector('.picker:not([hidden])', { timeout: 6000 }).then(() => true, () => false)) { await shot(`${n}p-0-picker`); await press(0, 'A'); }
  await tv.waitForSelector('.kart-menu', { timeout: 180000 });
  await shot(`${n}p-1-menu`);
  await press(0, 'A');                         // Single Race
  await tv.waitForSelector('.kart-select .ks-seat');
  await shot(`${n}p-2-racer`);
  await all('A'); await shot(`${n}p-3-kart`);  // racers chosen
  await all('RIGHT'); await all('A'); await shot(`${n}p-4-ready`);
  await tv.waitForSelector('.ks-tracks', { timeout: 20000 });
  await shot(`${n}p-5-track`);
} finally { await browser.close(); server.kill(); }
