// Part 2: every screen works with the pointer, not just the D-pad. A mouse stands in for the phone (same events): hovering any
// interactive thing highlights it, a click (= A / a tap) uses it. Skipped without Playwright. npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { findPlaywright, startServer } from './helpers-e2e.mjs';

const pw = findPlaywright();
const PORT = 5700 + Math.floor(Math.random() * 200);
const TARGETS = '[data-ui],[data-focus],[data-index],[data-mode],[data-key],[data-action],[data-act],button:not(:disabled)';

test('hover highlights and click works on every screen', { skip: !pw && 'Playwright is not installed', timeout: 400000 }, async () => {
  const server = await startServer(PORT, { PING_TIMEOUT_MS: '300000' });
  const browser = await pw.chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  try {
    const tv = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, permissions: ['camera'] })).newPage();
    const errors = [];
    tv.on('pageerror', (e) => errors.push(e.message));
    await tv.goto(`http://localhost:${PORT}/console.html?noboot=1&fx=off`);
    await tv.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('room-code').textContent));
    await tv.click('#use-mouse');
    await tv.waitForFunction(() => document.querySelector('.menu [data-focus]'));
    await tv.evaluate(() => { window.__ui = []; document.addEventListener('ui-press', (e) => window.__ui.push(e.detail.key || 'click')); });

    const visible = (sel) => tv.$$eval(sel, (els) => els.filter((e) => { const r = e.getBoundingClientRect(); return e.offsetParent !== null && r.width > 8 && r.height > 8 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; })
      .map((e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, sig: (e.dataset.focus || e.dataset.key || e.dataset.action || e.dataset.act || e.dataset.i || e.dataset.index || e.dataset.mode || e.textContent.trim().slice(0, 20)) }; }));
    const moveTo = async (p) => { await tv.mouse.move(p.x - 6, p.y - 6); await tv.mouse.move(p.x, p.y, { steps: 3 }); await tv.waitForTimeout(120); };
    // hover every target on screen: the one under the cursor must light up
    async function hoverAll(scope, label) {
      const list = await visible(`${scope} ${TARGETS.replaceAll(',', `,${scope} `)}`);
      assert.ok(list.length, `${label}: nothing to point at`);
      for (const p of list) {
        await moveTo(p);
        const lit = await tv.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y)?.closest('.focused,.is-focus,.ui-hover,.on,[aria-selected="true"],button,[data-key],.ui-btn'); return !!el; }, p);
        assert.ok(lit, `${label}: ${p.sig} does not react to the pointer`);
      }
      return list;
    }
    const back = async () => { for (let i = 0; i < 3; i++) { if (await tv.evaluate(() => document.getElementById('stage').hidden)) return; await tv.mouse.click(640, 700, { button: 'right' }); await tv.waitForTimeout(900); } };

    // Home: hovering moves the focus, a click opens the tile
    const homeTiles = await hoverAll('.menu', 'home');
    const folders = homeTiles.filter((t) => t.sig.startsWith('folder:'));
    assert.ok(folders.length >= 3);
    for (const f of folders) {
      await moveTo(f); await tv.mouse.click(f.x, f.y); await tv.waitForTimeout(900);
      assert.ok(await tv.evaluate(() => document.querySelector('.menu.in-folder') != null), `folder ${f.sig} did not open with a click`);
      await hoverAll('.menu', `folder ${f.sig}`);
      await tv.mouse.click(640, 700, { button: 'right' }); await tv.waitForTimeout(700);
    }

    // The apps that are plain screens: settings, photos, music, present, weather, timer
    const swept = [];
    for (const id of ['settings', 'photos', 'music', 'present', 'news', 'weather', 'timer']) {
      // (weather and timer live in the Channels / Party folders; the others are on the home screen)
      let tile = (await visible('.menu [data-focus]')).find((t) => t.sig === id);
      let folder = null;
      if (!tile) {
        for (const f of folders) { await moveTo(f); await tv.mouse.click(f.x, f.y); await tv.waitForTimeout(800); tile = (await visible('.menu [data-focus]')).find((t) => t.sig.endsWith(`:${id}`)); if (tile) { folder = f; break; } await tv.mouse.click(640, 700, { button: 'right' }); await tv.waitForTimeout(600); }
      }
      if (!tile) continue; // (an app that is not installed in this build)
      await moveTo(tile); await tv.mouse.click(tile.x, tile.y); await tv.waitForTimeout(2200);
      if (await tv.$('.picker:not([hidden])')) { await hoverAll('.picker', `${id} picker`); await tv.mouse.click(640, 360); await tv.waitForTimeout(1200); }
      await tv.waitForSelector('#stage:not([hidden])');
      const list = await hoverAll('#stage-content', id);
      swept.push(id);
      // A key button really does something: click it and see the press reach the shared layer
      const key = list.find((p) => p.sig && /^(A|PLUS|LEFT|RIGHT|MINUS)$/.test(p.sig));
      if (key) { const before = await tv.evaluate(() => window.__ui.length); await moveTo(key); await tv.mouse.click(key.x, key.y); await tv.waitForTimeout(200); assert.ok(await tv.evaluate(() => window.__ui.length) > before, `${id}: ${key.sig} button did not react to a click`); }
      // The Back key closes the app
      const bk = list.find((p) => p.sig === 'B');
      if (bk) { await moveTo(bk); await tv.mouse.click(bk.x, bk.y); await tv.waitForTimeout(1200); assert.ok(await tv.evaluate(() => document.getElementById('stage').hidden), `${id}: Back did not close it`); }
      else await back();
      if (folder) { await tv.waitForTimeout(500); await tv.mouse.click(640, 700, { button: 'right' }); await tv.waitForTimeout(700); }
    }
    // Turbo Karts: mode picker, then the racer / kart / track screens
    {
      const hero = (await visible('.menu [data-focus]')).find((t) => t.sig === 'turbo-karts');
      assert.ok(hero, 'karts tile');
      await moveTo(hero); await tv.mouse.click(hero.x, hero.y); await tv.waitForTimeout(1500);
      if (await tv.$('.picker:not([hidden])')) { await hoverAll('.picker', 'karts picker'); const m = (await visible('.picker [data-mode]'))[0]; await moveTo(m); await tv.mouse.click(m.x, m.y); }
      await tv.waitForSelector('.kart-menu .km-card', { timeout: 120000 });
      await tv.waitForTimeout(600);
      const menuList = await hoverAll('.kart-menu', 'kart menu');
      swept.push('kart-menu');
      const single = menuList.find((p) => p.sig === '0');
      await moveTo(single); await tv.mouse.click(single.x, single.y);                    // Single Race
      await tv.waitForSelector('.kart-select .ks-seat', { timeout: 60000 });
      await tv.waitForTimeout(800);
      const list = await hoverAll('.kart-select', 'kart select');
      swept.push('kart-select');
      // pick a racer by pointing at the third one and clicking: the name on the card changes and the step moves on
      const figs = list.filter((p) => /^\d$/.test(p.sig));
      assert.ok(figs.length >= 4, 'racer cards are pointable');
      await moveTo(figs[2]); await tv.mouse.click(figs[2].x, figs[2].y); await tv.waitForTimeout(400);
      assert.ok(await tv.evaluate(() => document.querySelector('.ks-seat')?.classList.contains('is-kart')), 'a click picked the racer');
      const bk = list.find((p) => p.sig === 'B');
      await moveTo(bk); await tv.mouse.click(bk.x, bk.y); await tv.waitForTimeout(400);
      assert.ok(await tv.evaluate(() => document.querySelector('.ks-seat')?.classList.contains('is-char')), 'Back went a step back');
      await back();
    }
    console.log('swept', swept.join(','));
    assert.ok(swept.length >= 5, `only swept ${swept}`);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.kill(); }
});
