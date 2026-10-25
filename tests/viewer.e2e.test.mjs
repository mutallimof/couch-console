// Part 3: the shared viewer. Wide and tall PDF pages are shown whole (fit), the phone's zoom keys zoom and pan the TV's slide,
// "fit width" shows a tall page at the screen's width, and the page never leaves the screen. Skipped without Playwright. npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { findPlaywright, startServer } from './helpers-e2e.mjs';
import { makePdfSized } from './helpers-pdf.mjs';

const pw = findPlaywright();
const PORT = 5200 + Math.floor(Math.random() * 150);

test('slides are always fully visible; zoom, pan and fit width work from the phone', { skip: !pw && 'Playwright is not installed', timeout: 240000 }, async () => {
  const server = await startServer(PORT);
  const browser = await pw.chromium.launch();
  try {
    const B = `http://localhost:${PORT}`, errors = [];
    const tv = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    tv.on('pageerror', (e) => errors.push(`tv: ${e.message}`));
    await tv.goto(`${B}/console.html?noboot=1&fx=off`);
    await tv.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('room-code').textContent));
    const room = await tv.textContent('#room-code');
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await ctx.addInitScript((p) => localStorage.setItem('couch.profile', JSON.stringify(p)), { name: 'Sara', emoji: '🦄', role: 'guest' });
    const ph = await ctx.newPage();
    ph.on('pageerror', (e) => errors.push(`phone: ${e.message}`));
    await ph.goto(`${B}/remote.html?room=${room}`);
    await ph.waitForSelector('.tab[data-tab="present"]'); await ph.tap('.tab[data-tab="present"]');
    await ph.waitForSelector('#pr-file', { state: 'attached' });
    await ph.waitForTimeout(1500);
    // page 1: very wide (3:1), page 2: tall portrait (A4-ish), page 3: normal
    await ph.setInputFiles('#pr-file', [{ name: 'Shapes.pdf', mimeType: 'application/pdf', buffer: makePdfSized([[1800, 600], [595, 842], [800, 450]]) }]);
    await ph.waitForSelector('#pr-name'); await ph.waitForTimeout(450);
    await ph.tap('[data-act="upload"]');
    await ph.waitForSelector('.pr-deck [data-present]', { timeout: 20000 });
    await ph.waitForFunction(() => /3 slides/.test(document.querySelector('.pr-deck')?.textContent || ''), null, { timeout: 30000 });
    await ph.tap('[data-present]');
    await ph.waitForSelector('.pr-remote');
    await tv.waitForSelector('#slides .sl-layer.on canvas.vw-content', { timeout: 30000 });

    const shape = () => tv.$eval('#slides .sl-layer.on canvas.vw-content', (c) => { const r = c.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight }; });
    const inside = (s) => s.l >= -1 && s.t >= -1 && s.r <= s.vw + 1 && s.b <= s.vh + 1;
    await tv.waitForTimeout(600);
    let s = await shape();
    assert.ok(inside(s), `wide page fits on screen ${JSON.stringify(s)}`);
    assert.ok(Math.abs(s.w / s.h - 3) < 0.05, `wide page keeps its 3:1 shape (${s.w / s.h})`);

    // the phone's next key -> the tall page is whole too
    await ph.evaluate(() => document.querySelector('[data-nav="1"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    await tv.waitForFunction(() => { const c = document.querySelector('#slides .sl-layer.on canvas.vw-content'); if (!c) return false; const r = c.getBoundingClientRect(); return r.height > r.width; }, null, { timeout: 15000 });
    await tv.waitForTimeout(400);
    s = await shape();
    assert.ok(inside(s), `tall page fits on screen ${JSON.stringify(s)}`);
    assert.ok(Math.abs(s.w / s.h - 595 / 842) < 0.03, 'tall page keeps its shape');

    // zoom keys on the phone (shown while the TV has a viewer open)
    await ph.waitForSelector('#viewer-bar:not([hidden])', { timeout: 10000 });
    await ph.tap('#viewer-bar [data-vop="in"]'); await ph.tap('#viewer-bar [data-vop="in"]');
    await tv.waitForTimeout(500);
    const z = await shape();
    assert.ok(z.h > s.h * 1.7, `the page zoomed in (${s.h} -> ${z.h})`);
    // reset
    await ph.tap('#viewer-bar [data-vop="reset"]'); await tv.waitForTimeout(500);
    assert.ok(Math.abs((await shape()).h - s.h) < 2, 'reset goes back to fit');
    // fit width: the tall page fills the screen's width and runs past the bottom (you scroll down it)
    await ph.tap('#viewer-bar [data-vop="fit"]'); await tv.waitForTimeout(500);
    const fw = await shape();
    assert.ok(Math.abs(fw.w - fw.vw) < 3 && fw.h > fw.vh, `fit width (${JSON.stringify(fw)})`);
    await ph.tap('#viewer-bar [data-vop="fit"]'); await tv.waitForTimeout(400);
    // full screen from the laptop: the F key is a real key press
    await tv.keyboard.press('f'); await tv.waitForTimeout(500);
    assert.ok(await tv.evaluate(() => !!document.fullscreenElement), 'F makes the TV full screen');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.kill(); }
});
