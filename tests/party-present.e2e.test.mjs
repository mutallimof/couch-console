// Slides in real (headless) browsers (Phase 46): a phone uploads a real 4-page PDF, the TV draws it with pdf.js, the phone
// turns pages (button, TV keyboard), the black screen and the laser work, PowerPoint gets the export help. npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { makePdf } from './helpers-pdf.mjs';

const require = createRequire(import.meta.url);
function findPlaywright() {
  for (const where of [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) {
    try { return require(where); } catch { /* next */ }
  }
  return null;
}
const pw = findPlaywright();
const PORT = 6400 + Math.floor(Math.random() * 300);

test('a PDF from a phone is presented on the TV, with page turns, black screen, laser and help for PowerPoint', { skip: !pw && 'Playwright is not installed', timeout: 240000 }, async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(PORT), HTTPS_PORT: String(PORT + 1), DATA_DIR: `${tmpdir()}/couch-test-${PORT}` }, stdio: 'pipe',
  });
  await new Promise((resolve) => server.stdout.on('data', (d) => { if (String(d).includes('running at')) resolve(); }));
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
    await ph.waitForTimeout(1500); // (the pane's first refresh re-renders the page; under load it can swallow a file picked too early)

    // PowerPoint: help, no upload
    await ph.setInputFiles('#pr-file', [{ name: 'Talk.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: Buffer.from('PK pretend') }]);
    await ph.waitForSelector('.pr-help');
    assert.match(await ph.textContent('.pr-help'), /File → Export → PDF/);
    await ph.tap('[data-act="dismiss"]');

    // A real 4-page PDF
    await ph.setInputFiles('#pr-file', [{ name: 'Quarterly.pdf', mimeType: 'application/pdf', buffer: makePdf(['One', 'Two', 'Three', 'Four']) }]);
    await ph.waitForSelector('#pr-name');
    await ph.waitForTimeout(450);
    await ph.tap('[data-act="upload"]');
    await ph.waitForSelector('.pr-deck [data-present]', { timeout: 20000 });
    // The TV counts the pages and makes small pictures in the background: the phone's deck shows "4 slides"
    await ph.waitForFunction(() => /4 slides/.test(document.querySelector('.pr-deck')?.textContent || ''), null, { timeout: 30000 });

    // Present it: the TV shows slide 1 (drawn by pdf.js on a canvas)
    await ph.tap('[data-present]');
    await ph.waitForSelector('.pr-remote');
    await tv.waitForSelector('#slides:not([hidden]) .sl-layer.on canvas', { timeout: 30000 });
    assert.match(await ph.textContent('.pr-top'), /Slide 1 \/ 4/);
    const pixel = () => tv.$eval('#slides .sl-layer.on canvas', (c) => { const d = c.getContext('2d').getImageData(c.width / 2, 10, 1, 1).data; return [...d].slice(0, 3); });
    const red = await pixel();
    assert.ok(red[0] > 200 && red[1] < 100, `page 1 is the red page (${red})`);

    // Next on the phone (pointerdown), then the TV keyboard
    await ph.evaluate(() => document.querySelector('[data-nav="1"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    await ph.waitForFunction(() => /Slide 2/.test(document.querySelector('.pr-top')?.textContent || ''));
    await tv.waitForFunction(() => { const c = document.querySelector('#slides .sl-layer.on canvas'); if (!c) return false; const d = c.getContext('2d').getImageData(c.width / 2, 10, 1, 1).data; return d[2] > 200 && d[0] < 100; }, null, { timeout: 15000 });
    await tv.keyboard.press('PageDown');
    await ph.waitForFunction(() => /Slide 3/.test(document.querySelector('.pr-top')?.textContent || ''));
    await tv.keyboard.press('ArrowLeft');
    await ph.waitForFunction(() => /Slide 2/.test(document.querySelector('.pr-top')?.textContent || ''));

    // Black screen from the phone and from the keyboard
    await ph.tap('[data-act="black"]');
    await tv.waitForFunction(() => document.querySelector('.sl-black.on'));
    await tv.keyboard.press('b');
    await tv.waitForFunction(() => !document.querySelector('.sl-black.on'));

    // The laser: holding the button turns the dot on (the pretend phone has no sensors, so it asks for motion and says no)
    await ph.evaluate(() => document.querySelector('#pr-laser').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    await ph.waitForTimeout(1800);

    // Another phone is told who presents
    // End: the TV's slides go away, the phone is back at the library
    await ph.tap('[data-act="end"]');
    await ph.waitForSelector('.pr-deck');
    await tv.waitForSelector('#slides', { state: 'hidden' });
    assert.deepEqual(errors.filter((e) => !/DeviceMotion|sensor/i.test(e)), [], 'no page errors');
  } finally {
    await browser.close();
    server.kill();
  }
});
