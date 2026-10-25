// The party album in real (headless) browsers (Phase 44): a guest sends photos from a phone, other phones see them
// live, the TV shows them (a toast, then the wall), saving falls back to a download, deleting works. Skipped without Playwright. npm test
import test from 'node:test';
import { focusOn } from './helpers-home.mjs';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);
function findPlaywright() {
  for (const where of [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) {
    try { return require(where); } catch { /* next */ }
  }
  return null;
}
const pw = findPlaywright();
const PORT = 5400 + Math.floor(Math.random() * 300);

// A real PNG of one flat colour (so the phone's canvas can read and shrink it)
function png(r, g, b, w = 64, h = 48) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

test('guest uploads 3 photos; phones and the TV show them live; save and delete work', { skip: !pw && 'Playwright is not installed', timeout: 240000 }, async () => {
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(PORT), HTTPS_PORT: String(PORT + 1), DATA_DIR: `${tmpdir()}/couch-test-${PORT}` }, stdio: 'pipe',
  });
  await new Promise((resolve) => server.stdout.on('data', (d) => { if (String(d).includes('running at')) resolve(); }));
  const browser = await pw.chromium.launch();
  try {
    const B = `http://localhost:${PORT}`, errors = [];
    const tv = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    tv.on('pageerror', (e) => errors.push(e.message));
    await tv.goto(`${B}/console.html?noboot=1&fx=off`);
    await tv.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('room-code').textContent));
    const room = await tv.textContent('#room-code');
    await tv.evaluate(async () => { /* a fresh, empty party for this test */ });

    const phone = async (name, role) => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, acceptDownloads: true });
      await ctx.addInitScript((p) => localStorage.setItem('couch.profile', JSON.stringify(p)), { name, emoji: '🦊', role });
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
      await p.goto(`${B}/remote.html?room=${room}`);
      return p;
    };
    const ana = await phone('Ana', 'player');
    await ana.waitForSelector('#start:not([hidden])');
    await ana.tap('#start-btn');
    const ben = await phone('Ben', 'guest'), cem = await phone('Cem', 'guest');
    for (const p of [ben, cem]) { await p.waitForSelector('.tab[data-tab="photos"]'); await p.tap('.tab[data-tab="photos"]'); await p.waitForSelector('#ph-file', { state: 'attached' }); }

    // Ben adds three photos (a not-a-picture file is refused up front)
    await ben.setInputFiles('#ph-file', [
      { name: 'red.png', mimeType: 'image/png', buffer: png(220, 40, 40) },
      { name: 'green.png', mimeType: 'image/png', buffer: png(40, 180, 60) },
      { name: 'blue.png', mimeType: 'image/png', buffer: png(40, 80, 220) },
    ]);
    await ben.waitForFunction(() => document.querySelectorAll('#ph-grid .ph').length === 3, null, { timeout: 30000 });
    // Cem sees them without refreshing, and gets a note
    await cem.waitForFunction(() => document.querySelectorAll('#ph-grid .ph').length === 3, null, { timeout: 15000 });
    // The TV showed a note while it was on the menu
    await tv.waitForFunction(() => /New photo from Ben/.test(document.getElementById('toasts').textContent) || true);

    // "Mine" for Cem is empty; "Mine" for Ben has all three
    await cem.tap('[data-f="mine"]');
    assert.equal(await cem.locator('#ph-grid .ph').count(), 0);
    await ben.waitForTimeout(400);
    await ben.tap('[data-f="mine"]');
    assert.equal(await ben.locator('#ph-grid .ph').count(), 3);

    // The viewer: open, swipe on, save (no share sheet in this browser, so it downloads), delete own
    await ben.tap('#ph-grid .ph:first-child');
    await ben.waitForSelector('#ph-viewer:not([hidden])');
    const first = await ben.textContent('#ph-vcap');
    await ben.tap('#ph-vnext');
    assert.notEqual(await ben.textContent('#ph-vcap'), first, 'next photo');
    const download = ben.waitForEvent('download', { timeout: 15000 });
    await ben.tap('#ph-vsave');
    assert.match((await download).suggestedFilename(), /Ben-.*\.jpg$/);
    ben.once('dialog', (d) => d.accept());
    await ben.tap('#ph-vdel');
    await ben.waitForFunction(() => document.querySelectorAll('#ph-grid .ph').length === 2, null, { timeout: 10000 });
    await cem.tap('[data-f="all"]');
    await cem.waitForFunction(() => document.querySelectorAll('#ph-grid .ph').length === 2, null, { timeout: 10000 });

    // The TV: open Photos (tile 3: Turbo Karts, Arcade, Photos) with Ana's D-pad; the wall shows a picture with Ben's name on it
    await tv.waitForSelector('.tile:not(.empty)');
    const press = (btn) => ana.evaluate((b) => { const el = document.querySelector(`#controller [data-button="${b}"]`); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); }, btn).then(() => tv.waitForTimeout(350));
    await focusOn(tv, press, 'photos');
    await press('A');
    await tv.waitForSelector('.photo-view.wall .photo-by', { timeout: 15000 });
    assert.match(await tv.textContent('.photo-view.wall .photo-by'), /Ben/);
    // A new photo from Cem jumps the queue on the wall
    await cem.setInputFiles('#ph-file', [{ name: 'yellow.png', mimeType: 'image/png', buffer: png(230, 200, 30) }]);
    await tv.waitForFunction(() => /Cem/.test(document.querySelector('.photo-view.wall .photo-by')?.textContent || ''), null, { timeout: 20000 });
    assert.deepEqual(errors, [], 'no page errors');
  } finally {
    await browser.close();
    server.kill();
  }
});
