// Guests (Part: easy photo and song adding): the "Scan to add ..." QR on the TV opens an upload-only page; a guest takes no player
// slot, works while 4 players are connected, and the page's button is on screen at 375x667. Skipped without Playwright. npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { findPlaywright, startServer, launchPhoneBrowser } from './helpers-e2e.mjs';
import { focusOn } from './helpers-home.mjs';

const pw = findPlaywright();
const PORT = 5700 + Math.floor(Math.random() * 200);

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

test('a guest adds photos and a song while 4 players are connected, without taking a slot', { skip: !pw && 'Playwright is not installed', timeout: 240000 }, async () => {
  const server = await startServer(PORT);
  const { browser } = await launchPhoneBrowser(pw);
  try {
    const B = `http://localhost:${PORT}`;
    const tv = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    await tv.goto(`${B}/console.html?noboot=1&fx=off`);
    await tv.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('room-code').textContent));
    const room = await tv.textContent('#room-code');
    const roster = () => tv.evaluate(async () => (await import('/console/party.js')).party.roster);

    // The QR endpoint: the guest links, and nothing else
    const qr = await (await fetch(`${B}/qr?room=${room}&for=photos`)).json();
    assert.match(qr.url, new RegExp(`/guest\\.html\\?room=${room}&for=photos$`));
    assert.match((await (await fetch(`${B}/qr?room=${room}&for=music`)).json()).url, /for=music$/);
    assert.equal((await fetch(`${B}/qr?room=${room}&for=evil`)).status, 400);

    // 4 players are connected
    let ana;
    for (let i = 1; i <= 4; i++) {
      const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
      await p.goto(`${B}/remote.html?room=${room}`);
      await p.fill('#w-name', `Player${i}`);
      await p.press('#w-name', 'Enter');
      await p.waitForFunction(() => document.getElementById('dot').classList.contains('on'));
      ana ??= p;
    }
    assert.equal((await roster()).slotsFree, 0);
    const press = (btn) => ana.evaluate((b) => { const el = document.querySelector(`#controller [data-button="${b}"]`); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); }, btn);
    await ana.locator('#start-btn').tap();
    await ana.evaluate(() => { document.getElementById('motion-msg').hidden = true; });

    // Photos: the TV shows the corner QR; the guest page's button is visible and works at 375x667
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });
    const g = await ctx.newPage();
    const errors = [];
    g.on('pageerror', (e) => errors.push(String(e)));
    await g.goto(`${B}/guest.html?room=${room}&for=photos`);
    await g.waitForFunction(() => document.getElementById('dot').classList.contains('on'));
    const hit = await g.evaluate(() => {
      const b = document.getElementById('g-add'), r = b.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { ok: el?.closest('#g-add') != null, top: r.top, bottom: r.bottom, vh: innerHeight, disabled: b.disabled, wide: document.documentElement.scrollWidth - innerWidth };
    });
    assert.ok(hit.ok && hit.top >= 0 && hit.bottom <= hit.vh && !hit.disabled && hit.wide <= 1, `Add photos button reachable: ${JSON.stringify(hit)}`);
    await g.fill('#g-name', 'Grandma');
    await g.setInputFiles('#g-file', [
      { name: 'a.png', mimeType: 'image/png', buffer: png(220, 40, 40) },
      { name: 'b.png', mimeType: 'image/png', buffer: png(40, 180, 60) },
    ]);
    await g.waitForSelector('.g-sent', { timeout: 30000 });
    assert.match(await g.textContent('#g-status'), /2 photos sent/);

    // A guest is a guest: no slot, still 4 players, listed by name
    const r = await roster();
    assert.equal(r.slotsFree, 0);
    const grandma = r.people.find((p) => p.name === 'Grandma');
    assert.ok(grandma && grandma.role === 'guest' && grandma.playerId === null, 'the guest is in the roster without a player slot');
    assert.equal(r.people.filter((p) => p.role === 'player').length, 4);
    // The photos are in the album, under the guest's name (the TV can hide them like any other)
    const album = await (await fetch(`${B}/api/party/photos`, { headers: { 'x-couch-room': room, 'x-couch-client': await g.evaluate(() => localStorage.getItem('couch.clientId')) } })).json();
    assert.equal(album.photos.length, 2);
    assert.ok(album.photos.every((p) => p.byName === 'Grandma'));

    // The TV: Photos shows the small corner QR (not over the middle of the picture); Music shows its own
    await tv.waitForSelector('.tile:not(.empty)');
    await focusOn(tv, press, 'photos');
    await press('A');
    await tv.waitForSelector('.guest-qr:not([hidden]) img[src^="data:image"]', { timeout: 15000 });
    const box = await tv.evaluate(() => { const r = document.querySelector('.guest-qr').getBoundingClientRect(); return { x: r.left / innerWidth, y: r.top / innerHeight, w: r.width / innerWidth, h: r.height / innerHeight }; });
    assert.ok(box.x > 0.6 && box.y > 0.6 && box.w < 0.25 && box.h < 0.25, `the QR is a small badge in the bottom-right corner: ${JSON.stringify(box)}`);
    await press('B');
    await tv.waitForFunction(() => !document.querySelector('.channel.photos') && document.querySelector('.menu .focused'));
    await tv.waitForTimeout(1200);
    await focusOn(tv, press, 'music');
    await press('A');
    await tv.waitForSelector('.mu-join img[src^="data:image"]', { timeout: 15000 });
    assert.match(await tv.textContent('.mu-join'), /Scan to add a song/);

    // More guests at the same time (a second phone, no stored id)
    const g2 = await (await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true })).newPage();
    await g2.goto(`${B}/guest.html?room=${room}&for=music`);
    await g2.waitForFunction(() => document.getElementById('dot').classList.contains('on'));
    assert.equal((await roster()).people.filter((p) => p.role === 'guest' && p.online).length, 2);
    assert.equal((await roster()).slotsFree, 0);

    // Music: a guest pastes a link; the page answers politely (no internet here: a clear message, not a crash)
    assert.equal(await g2.isVisible('#g-add'), true);
    await g2.fill('#g-link', 'not a link');
    await g2.tap('#g-add');
    await g2.waitForFunction(() => { const m = document.getElementById('g-msg'); return !m.hidden && m.textContent.length > 3 && !/Checking/.test(m.textContent); });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.kill(); }
});
