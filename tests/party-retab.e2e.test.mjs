// One phone, one player, Photos and Music from its own tabs; scanning the QR again on the same phone,
// and two tabs on one phone (the newest takes over, never a disconnect). Skipped without Playwright. npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
function findPlaywright() {
  for (const where of [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) {
    try { return require(where); } catch { /* next */ }
  }
  return null;
}
const pw = findPlaywright();
const PORT = 5500 + Math.floor(Math.random() * 300);

test('a joined phone reaches Photos and Music; a re-scan or a second tab takes over cleanly', { skip: !pw && 'Playwright is not installed', timeout: 240000 }, async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(PORT), HTTPS_PORT: String(PORT + 1), DATA_DIR: `${tmpdir()}/couch-test-${PORT}` }, stdio: 'pipe',
  });
  await new Promise((resolve) => server.stdout.on('data', (d) => { if (String(d).includes('running at')) resolve(); }));
  const browser = await pw.chromium.launch();
  try {
    const B = `http://localhost:${PORT}`;
    const errors = [];
    const tv = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    tv.on('pageerror', (e) => errors.push(e.message));
    await tv.goto(`${B}/console.html?noboot=1&fx=off`);
    await tv.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('room-code').textContent));
    const room = await tv.textContent('#room-code');

    // One phone = one browser context (shared localStorage, so the same clientId)
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const open = async () => {
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errors.push(e.message));
      await p.goto(`${B}/remote.html?room=${room}`);
      return p;
    };
    const a = await open();
    await a.waitForSelector('#welcome:not([hidden])');
    await a.fill('#w-name', 'Solo');
    await a.waitForTimeout(500);
    await a.tap('#w-play');
    await a.waitForSelector('#tabs:not([hidden])');
    assert.equal(await a.textContent('#badge'), 'P1');

    // Alone as a player: Photos and Music are one tap away, no second scan
    await a.waitForTimeout(500); // (the double-tap guard)
    await a.tap('.tab[data-tab="photos"]');
    assert.equal(await a.isVisible('#pane-photos'), true, 'Photos pane');
    await a.waitForTimeout(500); // (the double-tap guard)
    await a.tap('.tab[data-tab="music"]');
    assert.equal(await a.isVisible('#pane-music'), true, 'Music pane');
    await a.waitForTimeout(500); // (the double-tap guard)
    await a.tap('.tab[data-tab="present"]');
    await a.waitForFunction(() => document.getElementById('pane-present').innerHTML.length > 20, null, { timeout: 8000 });
    assert.equal(await a.isVisible('#pane-present'), true, 'Present pane');
    assert.ok((await a.locator('.tab').first().boundingBox()).height >= 56, 'tabs are big');

    // Scanning the QR again on the same phone: a second tab, same clientId
    const b = await open();
    await b.waitForSelector('#tabs:not([hidden])', { timeout: 8000 });
    assert.equal(await b.textContent('#badge'), 'P1', 'the re-scan keeps the same player');
    assert.equal(await b.isHidden('#welcome'), true, 'no new welcome card');
    await a.waitForSelector('#replaced:not([hidden])', { timeout: 8000 });
    assert.match(await a.textContent('#replaced'), /another tab/i);
    // ...and the player never left: P1 is still P1 on the TV and the new tab still works
    await b.waitForTimeout(500); // (the double-tap guard)
    await b.tap('.tab[data-tab="music"]');
    assert.equal(await b.isVisible('#pane-music'), true);

    // Two tabs: the old one takes over again with one tap, and the other steps aside
    await a.tap('#replaced-btn');
    await a.waitForSelector('#replaced', { state: 'hidden' });
    await b.waitForSelector('#replaced:not([hidden])', { timeout: 8000 });
    assert.equal(await a.textContent('#badge'), 'P1', 'still the same player');
    await a.waitForTimeout(500); // (the double-tap guard)
    await a.tap('.tab[data-tab="photos"]');
    assert.equal(await a.isVisible('#pane-photos'), true);

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.kill();
  }
});
