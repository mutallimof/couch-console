// Screenshots of Turbo Karts for design review: every track at the start and mid-race, or the split-screen views.
//   node scripts/kart-shots.mjs <outDir> [tracks=all|park,city] [players=1] [fx=auto]
// (headless browsers draw in software: each picture can take a few seconds)
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
for (const where of [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) { try { pw = require(where); break; } catch { /* next */ } }
if (!pw) { console.error('Playwright is needed (npm i -D playwright).'); process.exit(1); }
const [outDir = 'out/kart', which = 'all', players = '1', fx = 'auto'] = process.argv.slice(2);
const ALL = ['park', 'desert', 'snow', 'city', 'avenue', 'pirate', 'sky', 'stadium'];
const tracks = which === 'all' ? ALL : which.split(',');
mkdirSync(outDir, { recursive: true });
const root = fileURLToPath(new URL('..', import.meta.url));
const PORT = 9400 + Math.floor(Math.random() * 200);
const server = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), HTTPS_PORT: String(PORT + 1), PING_TIMEOUT_MS: '600000', DATA_DIR: `${tmpdir()}/couch-shots-${PORT}` }, stdio: 'pipe' });
await new Promise((resolve) => server.stdout.on('data', (d) => { if (String(d).includes('running at')) resolve(); }));
const browser = await pw.chromium.launch();
try {
  const B = `http://localhost:${PORT}`;
  for (const track of tracks) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const tv = await ctx.newPage();
    tv.on('pageerror', (e) => console.log('page error:', String(e).slice(0, 200)));
    await tv.goto(`${B}/console.html?noboot=1&fx=${fx}&kartdebug=1&track=${track}`);
    await tv.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('room-code').textContent));
    const multi = Number(players) > 1;
    if (!multi) await tv.click('#use-mouse'); // (one player: the mouse stands in for a phone; more players use real phones)
    const room = await tv.textContent('#room-code');
    const phones = [];
    for (let i = multi ? 0 : 1; i < Number(players); i++) {
      const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
      await p.addInitScript((n) => localStorage.setItem('couch.profile', JSON.stringify({ name: `Player ${n}`, emoji: '🦊', role: 'player' })), i + 1);
      await p.goto(`${B}/remote.html?room=${room}`);
      await p.waitForFunction(() => document.getElementById('badge').textContent.startsWith('P'));
      phones.push(p);
    }
    await tv.waitForFunction(() => document.querySelector('.menu [data-focus="turbo-karts"]'));
    const press = (b) => phones[0].evaluate((bt) => { const el = document.querySelector(`[data-button="${bt}"]`); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); }, b);
    if (multi) { await phones[0].locator('#start-btn').tap().catch(() => {}); await phones[0].evaluate(() => { document.getElementById('motion-msg').hidden = true; }); await press('A'); await tv.waitForTimeout(1500); if (await tv.waitForSelector('.picker:not([hidden])', { timeout: 8000 }).then(() => true, () => false)) await press('A'); } else {
    const hero = await tv.evaluate(() => { const r = document.querySelector('.menu [data-focus="turbo-karts"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await tv.mouse.move(hero.x - 4, hero.y - 4); await tv.mouse.move(hero.x, hero.y, { steps: 3 }); await tv.mouse.click(hero.x, hero.y);
    if (await tv.waitForSelector('.picker:not([hidden])', { timeout: 5000 }).then(() => true, () => false)) {
      const m = await tv.evaluate((i) => { const r = document.querySelectorAll('.picker [data-mode]')[i].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, Number(players) > 1 ? 0 : 2);
      await tv.mouse.move(m.x, m.y); await tv.mouse.click(m.x, m.y);
    }
    }
    await tv.waitForFunction(() => window.__kart?.race?.state === 'countdown' || window.__kart?.race?.state === 'racing', null, { timeout: 240000 });
    await tv.mouse.move(5, 5); // (the cursor out of the corner)
    await tv.waitForTimeout(2500);
    await tv.screenshot({ path: `${outDir}/${track}-${players}p-start.jpg`, type: 'jpeg', quality: 85, timeout: 120000 });
    await tv.evaluate((n) => { window.__KS_SECONDS = n; window.__kart.skip(9); window.__kart.skip(0); }, process.env.KS_SECONDS || 24);
    await tv.waitForFunction(() => window.__kart.race.state === 'racing', null, { timeout: 60000 });
    await tv.evaluate(() => { window.__kart.skip(Number(window.__KS_SECONDS || 24)); window.__kart.humans.forEach((h) => { h.cam = null; }); }); // (the camera snaps to the new place)
    await tv.waitForTimeout(3500);
    await tv.screenshot({ path: `${outDir}/${track}-${players}p-mid.jpg`, type: 'jpeg', quality: 85, timeout: 120000 });
    console.log('shot', track);
    await ctx.close(); for (const p of phones) await p.context().close();
  }
} finally { await browser.close(); server.kill(); }
