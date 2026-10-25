// Design QA sweep: walks the TV home screen with a phone, opens every folder, game and channel, and saves a screenshot of the TV
// and of the phone for each (in one theme). Used to look at every screen in light and dark.
//   node scripts/qa-shots.mjs light out/qa      node scripts/qa-shots.mjs dark out/qa
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { focusOn } from '../tests/helpers-home.mjs';

const require = createRequire(import.meta.url);
let pw;
for (const where of [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) { try { pw = require(where); break; } catch { /* next */ } }
if (!pw) { console.error('Playwright is needed (npm i -D playwright).'); process.exit(1); }
const [theme = 'light', outDir = 'out/qa'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const root = fileURLToPath(new URL('..', import.meta.url));
const PORT = 9300 + Math.floor(Math.random() * 300);
const server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), HTTPS_PORT: String(PORT + 1), PING_TIMEOUT_MS: '300000', DATA_DIR: `${tmpdir()}/couch-qa-${PORT}` }, stdio: 'pipe' });
await new Promise((resolve) => server.stdout.on('data', (d) => { if (String(d).includes('running at')) resolve(); }));
const browser = await pw.chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
try {
  const B = `http://localhost:${PORT}`;
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, permissions: ['camera'], colorScheme: theme === 'dark' ? 'dark' : 'light' });
  const tv = await ctx.newPage();
  tv.on('pageerror', (e) => console.log('TV page error:', String(e).slice(0, 200)));
  await tv.goto(`${B}/console.html?noboot=1&fx=off&theme=${theme}`);
  await tv.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('room-code').textContent));
  const room = await tv.textContent('#room-code');
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, });
  await pctx.addInitScript(() => localStorage.setItem('couch.profile', JSON.stringify({ name: 'Ana', emoji: '🦊', role: 'player' })));
  const ph = await pctx.newPage();
  ph.on('pageerror', (e) => console.log('Phone page error:', String(e).slice(0, 200)));
  await ph.goto(`${B}/remote.html?room=${room}`);
  await ph.waitForFunction(() => document.getElementById('badge').textContent.startsWith('P'));
  await ph.locator('#start-btn').tap();
  await ph.evaluate(() => { document.getElementById('motion-msg').hidden = true; });
  const press = (b) => ph.evaluate((bt) => {
    const el = document.querySelector(`#controller [data-button="${bt}"]`) || document.querySelector(`[data-button="${bt}"]`);
    el?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); el?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  }, b).then(() => tv.waitForTimeout(400));
  const name = (s) => `${outDir}/${theme}-${s.replace(/[^a-z0-9-]+/gi, '_')}`;
  const snap = async (s, wait = 600) => { await tv.waitForTimeout(wait); await tv.screenshot({ path: `${name(s)}-tv.png`, timeout: 90000 }); await ph.screenshot({ path: `${name(s)}-phone.png`, timeout: 90000 }); console.log('shot', s); };
  const keys = () => tv.$$eval('.menu [data-focus]', (els) => els.filter((e) => e.offsetParent).map((e) => e.dataset.focus));
  const atHome = () => tv.evaluate(() => !!document.querySelector('.menu [data-focus^="folder:"]') && document.getElementById('stage').hidden);
  const home = async () => { for (let i = 0; i < 4 && !(await atHome()); i++) { await press('HOME'); await tv.waitForTimeout(900); } };

  await snap('home');
  const homeKeys = await keys();
  const folders = homeKeys.filter((k) => k.startsWith('folder:')), apps = homeKeys.filter((k) => !k.startsWith('folder:') && !k.startsWith('dock:') && !process.env.QA_SKIP?.split(',').includes(k));
  const dock = homeKeys.filter((k) => k.startsWith('dock:'));
  const only = process.env.QA_ONLY?.split(',');
  const open = async (k) => { await home(); await focusOn(tv, press, k); await press('A'); await tv.waitForTimeout(2200); };
  for (const k of only || [...apps, ...dock]) {
    try { await open(k); if (await tv.$('.picker:not([hidden])')) { await snap(`${k}-picker`, 200); await press('A'); await tv.waitForTimeout(8000); } await snap(k, 3000); } catch (e) { console.log('skip', k, String(e).slice(0, 100)); }
  }
  for (const f of only ? [] : folders) {
    await home(); await focusOn(tv, press, f); await press('A'); await tv.waitForTimeout(900);
    await snap(f);
    const kids = (await keys()).filter((k) => !k.startsWith('folder:') && !k.startsWith('dock:') && k.includes(':'));
    for (const k of kids) {
      try {
        await home(); await focusOn(tv, press, f); await press('A'); await tv.waitForTimeout(700);
        await focusOn(tv, press, k); await press('A'); await tv.waitForTimeout(2600);
        // a mode picker (Solo / Versus) may be showing: pick the first
        if (await tv.$('.picker:not([hidden])')) { await snap(`${k}-picker`, 200); await press('A'); await tv.waitForTimeout(2600); }
        await snap(k, 1500);
      } catch (e) { console.log('skip', k, String(e).slice(0, 100)); }
    }
  }
  await home();
} finally {
  await browser.close();
  server.kill();
}
