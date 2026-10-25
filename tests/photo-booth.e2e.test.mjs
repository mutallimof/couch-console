// Photo Booth end to end with a fake camera: the Camera folder shows it, the camera light comes on, a phone sees the booth pad and
// presses the shutter, the 3-2-1 runs, the photo lands in the party album, and leaving turns the camera off. Skipped without Playwright.
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
const PORT = 7000 + Math.floor(Math.random() * 300);

test('photo booth: camera on, a phone takes the photo, it reaches the album, the camera turns off', { skip: !pw && 'Playwright is not installed', timeout: 240000 }, async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(PORT), HTTPS_PORT: String(PORT + 1), DATA_DIR: `${tmpdir()}/couch-booth-${PORT}` }, stdio: 'pipe',
  });
  await new Promise((resolve) => server.stdout.on('data', (d) => { if (String(d).includes('running at')) resolve(); }));
  const browser = await pw.chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  try {
    const B = `http://localhost:${PORT}`;
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, permissions: ['camera'] });
    const tv = await ctx.newPage();
    const errors = [];
    tv.on('pageerror', (e) => errors.push(String(e)));
    await tv.goto(`${B}/console.html?noboot=1&fx=off`);
    await tv.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('room-code').textContent));
    const room = await tv.textContent('#room-code');

    // A phone joins as a player
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await pctx.addInitScript(() => localStorage.setItem('couch.profile', JSON.stringify({ name: 'Ana', emoji: '🦊', role: 'player' })));
    const ph = await pctx.newPage();
    await ph.goto(`${B}/remote.html?room=${room}`);
    await ph.waitForFunction(() => document.getElementById('badge').textContent.startsWith('P'));
    await ph.locator('#start-btn').tap();
    await ph.evaluate(() => { document.getElementById('motion-msg').hidden = true; });
    const press = (b) => ph.evaluate((bt) => {
      const el = document.querySelector(`#controller [data-button="${bt}"]`);
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    }, b).then(() => tv.waitForTimeout(350));

    // The Camera folder is on the home screen and holds Photo Booth
    await tv.waitForSelector('.menu .tile');
    await focusOn(tv, press, 'folder:camera');
    await press('A');
    await tv.waitForSelector('.menu [data-focus="camera:photo-booth"]');
    await press('A');
    await tv.waitForSelector('.booth .booth-cam:not([hidden])', { timeout: 20000 }); // "Camera is on"
    assert.match(await tv.textContent('.booth-priv'), /stay on this laptop/);
    const live = () => tv.evaluate(() => document.querySelector('.booth-video')?.srcObject?.getTracks().map((t) => t.readyState).join());
    assert.equal(await live(), 'live');
    await tv.evaluate(() => { window.__camTracks = document.querySelector('.booth-video').srcObject.getTracks(); });
    // The face model and its WebAssembly load from this server (nothing from the internet), and the tracker runs on the fake camera (no face in it)
    const tracking = await tv.evaluate(async () => {
      const { createFaceTracker } = await import('/js/console/games/photo-booth/booth-faces.js');
      const t = await createFaceTracker();
      if (!t) return 'no tracker';
      const faces = t.detect(document.querySelector('.booth-video'), performance.now());
      t.close();
      return Array.isArray(faces) ? 'ok' : 'bad answer';
    });
    assert.equal(tracking, 'ok');

    // The phone shows the booth pad with the frames; it picks a frame and presses the shutter
    await ph.waitForSelector('#booth-pad:not([hidden]) #bp-frames button', { timeout: 15000 });
    assert.ok((await ph.locator('#bp-frames button').count()) >= 5, 'frames to pick');
    await ph.locator('#bp-frames button', { hasText: 'Polaroid' }).tap();
    await tv.waitForFunction(() => document.querySelector('.b-frame')?.textContent === 'Polaroid');
    await ph.waitForFunction(() => !document.getElementById('bp-shutter').disabled);
    await ph.locator('#bp-shutter').tap();
    await tv.waitForFunction(() => /^[123]$/.test(document.querySelector('.booth-count')?.textContent || ''), null, { timeout: 8000 }); // the 3-2-1
    await ph.waitForFunction(() => document.getElementById('bp-shutter').dataset.status === 'saved', null, { timeout: 20000 });

    // The photo is in the party album
    const headers = await tv.evaluate(() => { const h = { 'x-couch-room': document.getElementById('room-code').textContent }; return h; });
    const album = await tv.evaluate(async () => {
      const mod = await import('/js/console/party.js');
      return (await mod.party.call('GET', '/photos')).photos;
    });
    void headers;
    assert.equal(album.length, 1);
    assert.equal(album[0].byName, 'Photo Booth');
    assert.ok(album[0].w >= 320, 'a real picture size');

    // B leaves: the camera is off
    await press('B');
    await tv.waitForFunction(() => !document.querySelector('.booth'), null, { timeout: 8000 });
    await ph.waitForFunction(() => document.getElementById('booth-pad').hidden, null, { timeout: 8000 });
    assert.equal(await tv.evaluate(() => window.__camTracks.map((t) => t.readyState).join()), 'ended', 'the camera is switched off');
    assert.deepEqual(errors, [], 'no page errors');
  } finally {
    await browser.close();
    server.kill();
  }
});
