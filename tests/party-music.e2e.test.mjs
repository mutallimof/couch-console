// The party music in real (headless) browsers (Phase 45), with a pretend YouTube: phones add songs, the TV plays them in
// a fair order (the TV player is a 5 second pretend one: ?fakeyt=1), skip votes, blocked links, the Music screen. npm test
import test from 'node:test';
import { focusOn } from './helpers-home.mjs';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
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
const PORT = 9100 + Math.floor(Math.random() * 300), FAKE = PORT + 400;

test('three phones queue songs; the TV plays them fairly; skip and blocked links work', { skip: !pw && 'Playwright is not installed', timeout: 240000 }, async () => {
  const fake = createServer((req, res) => {
    const id = decodeURIComponent(new URL(req.url, 'http://x').searchParams.get('url')).split('v=')[1];
    if (id.startsWith('blocked')) { res.statusCode = 401; return res.end('no'); }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ title: `Song ${id}`, author_name: 'Channel', thumbnail_url: '' }));
  });
  await new Promise((r) => fake.listen(FAKE, r));
  const server = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(PORT), HTTPS_PORT: String(PORT + 1), DATA_DIR: `${tmpdir()}/couch-test-${PORT}`, YOUTUBE_OEMBED_URL: `http://localhost:${FAKE}/oembed` }, stdio: 'pipe',
  });
  await new Promise((resolve) => server.stdout.on('data', (d) => { if (String(d).includes('running at')) resolve(); }));
  const browser = await pw.chromium.launch();
  try {
    const B = `http://localhost:${PORT}`, errors = [];
    const tv = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    tv.on('pageerror', (e) => errors.push(e.message));
    await tv.goto(`${B}/console.html?noboot=1&fx=off&fakeyt=1`);
    await tv.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('room-code').textContent));
    const room = await tv.textContent('#room-code');
    const phone = async (name, role) => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      await ctx.addInitScript((p) => localStorage.setItem('couch.profile', JSON.stringify(p)), { name, emoji: '🦊', role });
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
      await p.goto(`${B}/remote.html?room=${room}`);
      if (role === 'player') { await p.waitForSelector('#start:not([hidden])'); await p.tap('#start-btn'); await p.waitForSelector('#start', { state: 'hidden' }); await p.evaluate(() => { document.getElementById('motion-msg').hidden = true; }); }
      await p.waitForSelector('.tab[data-tab="music"]');
      await p.tap('.tab[data-tab="music"]');
      await p.waitForSelector('[data-view="add"]');
      return p;
    };
    const ana = await phone('Ana', 'guest'), ben = await phone('Ben', 'guest'), cem = await phone('Cem', 'player');
    const add = async (p, link) => {
      await p.tap('[data-view="add"]');
      await p.fill('#mp-link', link);
      await p.waitForTimeout(450);
      await p.tap('[data-add] button[type="submit"]');
      await p.waitForFunction(() => { const m = document.getElementById('mp-msg'); return m && !m.hidden && !/Checking/.test(m.textContent); });
      return p.textContent('#mp-msg');
    };
    assert.match(await add(ana, 'not a link'), /does not look like/);
    assert.match(await add(ana, 'https://youtu.be/blockedvid1'), /can't play on the TV/);
    assert.match(await add(ana, 'https://youtu.be/aaaaaaaaaa1'), /Added/);
    assert.match(await add(ana, 'https://youtu.be/aaaaaaaaaa2'), /Added/);
    assert.match(await add(ben, 'https://youtu.be/bbbbbbbbbb1'), /Added/);

    // The TV card plays the first song (a pretend one), small in the corner, at least 200 x 200
    await tv.waitForFunction(() => document.querySelector('#music-dock .md-title')?.textContent.includes('aaaaaaaaaa1'));
    const box = await tv.$eval('#music-dock', (e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, hidden: e.hidden }; });
    assert.ok(!box.hidden && box.w >= 200 && box.h >= 200, `the player card is visible and at least 200x200 (${box.w}x${box.h})`);

    // Ben's queue view shows Ana's waiting song first, then his own (fair order puts one song each first)
    await ben.tap('[data-view="queue"]');
    await ben.waitForSelector('.mp-list li');
    assert.equal(await ben.locator('.mp-list li').count(), 2);

    // Skip vote from Ben: 1 of 2; then Cem's second vote moves on to the next song
    await ben.tap('[data-view="now"]');
    await ben.tap('[data-skip]');
    await cem.tap('.tab[data-tab="music"]'); // (Cem is a player: this opens his Music tab)
    await cem.waitForSelector('[data-skip]');
    await cem.tap('[data-skip]');
    await tv.waitForFunction(() => document.querySelector('#music-dock .md-title')?.textContent.includes('aaaaaaaaaa2'), null, { timeout: 15000 });

    // The Music screen on the TV (P1 = Cem's D-pad): the queue is listed and the card moves onto the screen
    await cem.tap('.tab[data-tab="remote"]');
    await tv.waitForSelector('.tile:not(.empty)');
    const press = (b) => cem.evaluate((x) => { const el = document.querySelector(`#controller [data-button="${x}"]`); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); }, b).then(() => tv.waitForTimeout(350));
    await focusOn(tv, press, 'dock:music');
    await press('A');
    await tv.waitForSelector('.channel.music .mu-queue');
    assert.match(await tv.textContent('.mu-queue'), /bbbbbbbbbb1/);
    await tv.waitForTimeout(500);
    const full = await tv.$eval('#music-dock', (e) => e.getBoundingClientRect().width);
    assert.ok(full > 500, `the card is big on the Music screen (${full}px)`);
    // The 5 second pretend song ends by itself and the next one starts
    await tv.waitForFunction(() => document.querySelector('#music-dock .md-title')?.textContent.includes('bbbbbbbbbb1'), null, { timeout: 20000 });
    assert.deepEqual(errors, [], 'no page errors');
  } finally {
    await browser.close();
    server.kill();
    fake.close();
  }
});
