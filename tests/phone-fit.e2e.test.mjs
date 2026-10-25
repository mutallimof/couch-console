// Every phone screen must fit small phones (Part 1): the Join button is visible and clickable at 375x667, nothing is wider than the
// screen, and the red/amber/green dot says what it means. WebKit when installed, Chromium otherwise. Skipped without Playwright. npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { findPlaywright, startServer, launchPhoneBrowser, PHONES } from './helpers-e2e.mjs';

const pw = findPlaywright();
const PORT = 5400 + Math.floor(Math.random() * 300);

test('phone screens fit 375x667, 393x852 and 430x932 in both themes', { skip: !pw && 'Playwright is not installed', timeout: 300000 }, async () => {
  const server = await startServer(PORT);
  const { browser } = await launchPhoneBrowser(pw);
  try {
    const B = `http://localhost:${PORT}`;
    const tv = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    await tv.goto(`${B}/console.html?noboot=1&fx=off`);
    await tv.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('room-code').textContent));
    const room = await tv.textContent('#room-code');

    for (const [w, h] of PHONES) for (const scheme of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, colorScheme: scheme });
      const p = await ctx.newPage();
      await p.goto(`${B}/remote.html?room=${room}`);
      await p.waitForSelector('#welcome:not([hidden])');
      // The red dot means "not joined yet" here (amber), never green
      assert.match(await p.getAttribute('#dot', 'class'), /wait/);
      // The main button is on screen and is what a finger would hit
      const hit = await p.evaluate(() => {
        const b = document.getElementById('w-play').getBoundingClientRect();
        const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return { bottom: b.bottom, top: b.top, ok: el?.closest('#w-play') != null, vh: innerHeight };
      });
      assert.ok(hit.ok && hit.top >= 0 && hit.bottom <= hit.vh, `Join button reachable at ${w}x${h} ${scheme}: ${JSON.stringify(hit)}`);
      // Return in the name field joins, with the default avatar
      await p.fill('#w-name', `Pia${w}`);
      await p.press('#w-name', 'Enter');
      await p.waitForFunction(() => document.getElementById('dot').classList.contains('on'));
      assert.match(await p.getAttribute('#dot', 'class'), /on/);
      // No tab is wider than the screen
      for (const tab of await p.$$eval('#tabs button', (bs) => bs.map((b) => b.dataset.tab || b.textContent))) {
        await p.evaluate((t) => document.querySelector(`#tabs button[data-tab="${t}"]`)?.click(), tab);
        const wide = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        assert.ok(wide <= 1, `${tab} is ${wide}px too wide at ${w}x${h}`);
      }
      await ctx.close();
    }

    // The click works on the real button at the smallest phone
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    await p.goto(`${B}/remote.html?room=${room}`);
    await p.fill('#w-name', 'Tap');
    await p.tap('#w-play');
    await p.waitForFunction(() => document.getElementById('dot').classList.contains('on'));
  } finally { await browser.close(); server.kill(); }
});
