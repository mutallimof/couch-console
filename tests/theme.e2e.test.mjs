// Theme (Light / Dark / Auto): Settings changes the TV, the pairing screen and the phones follow,
// and the choice is remembered. Skipped without Playwright. SHOTS=<folder> also saves screenshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { focusOn } from './helpers-home.mjs';

const require = createRequire(import.meta.url);
function findPlaywright() {
  for (const where of [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) {
    try { return require(where); } catch { /* next */ }
  }
  return null;
}
const pw = findPlaywright();
const PORT = 9100 + Math.floor(Math.random() * 300);
const SHOTS = process.env.SHOTS;

test('theme: Settings -> Theme restyles the TV and the phones, and is remembered', { skip: !pw && 'Playwright is not installed', timeout: 180000 }, async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(PORT), HTTPS_PORT: String(PORT + 1), DATA_DIR: `${tmpdir()}/couch-test-${PORT}` }, stdio: 'pipe',
  });
  await new Promise((resolve) => server.stdout.on('data', (d) => { if (String(d).includes('running at')) resolve(); }));
  const browser = await pw.chromium.launch();
  try {
    const B = `http://localhost:${PORT}`;
    const shot = (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });
    const themeOf = (page) => page.evaluate(() => document.documentElement.dataset.theme);
    const bg = (page, sel) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).backgroundImage, sel);

    // The laptop prefers dark, so Auto must give dark
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, colorScheme: 'dark' });
    const tv = await ctx.newPage();
    await tv.goto(`${B}/console.html?noboot=1&fx=off`);
    await tv.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('room-code').textContent));
    assert.equal(await themeOf(tv), 'dark', 'Auto follows the laptop');
    await shot(tv, 'theme-pairing-dark');
    const room = await tv.textContent('#room-code');

    // A phone joins and follows the TV
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: 'light' });
    await pctx.addInitScript(() => localStorage.setItem('couch.profile', JSON.stringify({ name: 'Tester', emoji: '🦊', role: 'player' })));
    const ph = await pctx.newPage();
    await ph.goto(`${B}/remote.html?room=${room}`);
    await ph.waitForFunction(() => document.getElementById('badge').textContent.startsWith('P'));
    await ph.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await shot(ph, 'theme-phone-dark');
    const darkPhoneBg = await bg(ph, 'html');
    assert.notEqual(await ph.evaluate(() => getComputedStyle(document.querySelector('.btn')).backgroundColor), 'rgb(255, 255, 255)');

    await ph.locator('#start-btn').tap();
    await ph.evaluate(() => { document.getElementById('motion-msg').hidden = true; });
    const press = (bt) => ph.evaluate((bt) => {
      const el = document.querySelector(`#controller [data-button="${bt}"]`);
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    }, bt).then(() => tv.waitForTimeout(300));
    await tv.waitForSelector('.menu .tile');
    await tv.waitForTimeout(600);
    await shot(tv, 'theme-home-dark');

    // Settings: the Theme row is first; pressing it goes Auto -> Light
    await focusOn(tv, press, 'settings');
    await press('A');
    await tv.waitForSelector('.settings');
    await shot(tv, 'theme-settings-dark');
    assert.match(await tv.textContent('.set-row[data-row="0"]'), /Theme\s*Auto/);
    await press('A');
    assert.equal(await themeOf(tv), 'light');
    await ph.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    assert.notEqual(await bg(ph, 'html'), darkPhoneBg);
    await shot(tv, 'theme-settings-light');
    await shot(ph, 'theme-phone-light');
    await press('A');
    assert.equal(await themeOf(tv), 'dark');
    await ph.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await press('A'); // -> Auto
    assert.equal(await themeOf(tv), 'dark');
    await press('A'); // -> Light
    assert.equal(await themeOf(tv), 'light');

    // Remembered: reload keeps Light even though the laptop prefers dark
    await tv.reload();
    await tv.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('room-code').textContent));
    assert.equal(await themeOf(tv), 'light');
    await shot(tv, 'theme-pairing-light');

    // A phone that joins later gets the theme with its join answer
    const late = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: 'dark' })).newPage();
    await late.addInitScript(() => localStorage.setItem('couch.profile', JSON.stringify({ name: 'Late', emoji: '🐼', role: 'guest' })));
    const room2 = await tv.textContent('#room-code');
    await late.goto(`${B}/remote.html?room=${room2}`);
    await late.waitForFunction(() => document.getElementById('dot')?.classList.contains('on'));
    assert.equal(await themeOf(late), 'light');
  } finally {
    await browser.close();
    server.kill();
  }
});
