// Photo Booth on a computer WITHOUT a (usable) camera: it says so in plain words, the shutter stays off (on the TV and on the phone),
// pressing the shutter does nothing bad, and B still leaves. Skipped without Playwright.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { focusOn } from './helpers-home.mjs';

const require = createRequire(import.meta.url);
function findPlaywright() {
  for (const where of [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) { try { return require(where); } catch { /* next */ } }
  return null;
}
const pw = findPlaywright();
const PORT = 7400 + Math.floor(Math.random() * 200);

test('photo booth without a camera: a clear message, no shutter, no crash, B leaves', { skip: !pw && 'Playwright is not installed', timeout: 120000 }, async () => {
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(PORT), HTTPS_PORT: String(PORT + 1), DATA_DIR: `${tmpdir()}/couch-nocam-${PORT}` }, stdio: 'pipe',
  });
  await new Promise((resolve) => server.stdout.on('data', (d) => { if (String(d).includes('running at')) resolve(); }));
  const browser = await pw.chromium.launch(); // (no fake camera, no camera permission)
  try {
    const B = `http://localhost:${PORT}`;
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    // a laptop with no camera at all: getUserMedia says NotFoundError
    await ctx.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('none'), { name: 'NotFoundError' })); });
    const tv = await ctx.newPage();
    const errors = [];
    tv.on('pageerror', (e) => errors.push(String(e)));
    await tv.goto(`${B}/console.html?noboot=1&fx=off`);
    await tv.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('room-code').textContent));
    const room = await tv.textContent('#room-code');
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await pctx.addInitScript(() => localStorage.setItem('couch.profile', JSON.stringify({ name: 'Ana', emoji: '🦊', role: 'player' })));
    const ph = await pctx.newPage();
    ph.on('pageerror', (e) => errors.push(`phone: ${e}`));
    await ph.goto(`${B}/remote.html?room=${room}`);
    await ph.waitForFunction(() => document.getElementById('badge').textContent.startsWith('P'));
    await ph.locator('#start-btn').tap();
    await ph.evaluate(() => { document.getElementById('motion-msg').hidden = true; });
    const press = (b) => ph.evaluate((bt) => {
      const el = document.querySelector(`#controller [data-button="${bt}"]`);
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    }, b).then(() => tv.waitForTimeout(350));

    await tv.waitForSelector('.menu .tile');
    await focusOn(tv, press, 'folder:camera');
    await press('A');
    await tv.waitForSelector('.menu [data-focus="camera:photo-booth"]');
    await press('A');
    await tv.waitForSelector('.booth');
    await tv.waitForSelector('.booth-msg:not([hidden])', { timeout: 10000 });
    assert.match(await tv.textContent('.booth-msg'), /No camera found/, 'says what is wrong');
    assert.ok(await tv.$eval('.booth-cam', (e) => e.hidden), 'no "Camera is on" badge');
    assert.ok(await tv.$eval('.booth-shutter', (e) => e.disabled), 'the TV shutter is off');
    // the phone shows the booth pad, with the shutter off and the reason
    await ph.waitForSelector('#booth-pad:not([hidden])');
    await ph.waitForFunction(() => /not on yet/.test(document.getElementById('bp-status').textContent));
    assert.ok(await ph.$eval('#bp-shutter', (e) => e.disabled), 'the phone shutter is off');
    // A (the shutter) does nothing; the countdown never starts
    await press('A');
    await tv.waitForTimeout(500);
    assert.equal(await tv.$eval('.booth-stage', (e) => e.dataset.status), 'idle');
    assert.equal(await tv.$eval('.booth-count', (e) => e.textContent), '');
    // B leaves
    await press('B');
    await tv.waitForSelector('.menu .tile');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.kill();
  }
});
