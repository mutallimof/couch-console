// Party Games end to end with two phones: the Party Games folder is on the home screen; Quick Draw runs lobby -> holster -> DRAW -> a phone
// measures its own reaction time -> the TV shows the winner; Hot Potato and Steady Hands start from their lobbies. Skipped without Playwright.
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
const PORT = 7700 + Math.floor(Math.random() * 200);
const SHOTS = process.env.PARTY_SHOTS; // a folder: save screenshots there

test('party games: lobby, a duel measured on the phones, and the other two games start', { skip: !pw && 'Playwright is not installed', timeout: 240000 }, async () => {
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(PORT), HTTPS_PORT: String(PORT + 1), DATA_DIR: `${tmpdir()}/couch-party-${PORT}` }, stdio: 'pipe',
  });
  await new Promise((resolve) => server.stdout.on('data', (d) => { if (String(d).includes('running at')) resolve(); }));
  const browser = await pw.chromium.launch();
  try {
    const B = `http://localhost:${PORT}`;
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const tv = await ctx.newPage();
    const errors = [];
    tv.on('pageerror', (e) => errors.push(`tv: ${e}`));
    await tv.goto(`${B}/console.html?noboot=1&fx=off`);
    await tv.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('room-code').textContent));
    const room = await tv.textContent('#room-code');

    const phones = [];
    for (const [i, name] of ['Ana', 'Ben'].entries()) {
      const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      await pctx.addInitScript((n) => localStorage.setItem('couch.profile', JSON.stringify({ name: n, emoji: '🦊', role: 'player' })), name);
      const ph = await pctx.newPage();
      ph.on('pageerror', (e) => errors.push(`phone ${i + 1}: ${e}`));
      await ph.goto(`${B}/remote.html?room=${room}`);
      await ph.waitForFunction(() => document.getElementById('badge').textContent.startsWith('P'));
      await ph.locator('#start-btn').tap();
      await ph.evaluate(() => { document.getElementById('motion-msg').hidden = true; });
      phones.push(ph);
    }
    const [p1, p2] = phones;
    const press = (ph, b) => ph.evaluate((bt) => {
      const el = document.querySelector(`#controller [data-button="${bt}"]`);
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    }, b).then(() => tv.waitForTimeout(350));
    const shot = async (name) => { if (SHOTS) { await tv.screenshot({ path: `${SHOTS}/${name}-tv.png` }); await p1.screenshot({ path: `${SHOTS}/${name}-phone.png` }); } };

    // The Party Games folder is on the home screen
    await tv.waitForSelector('.menu .tile');
    await focusOn(tv, (b) => press(p1, b), 'folder:party');
    await press(p1, 'A');
    await tv.waitForSelector('.menu [data-focus="party:quick-draw"]');
    assert.ok(await tv.$('.menu [data-focus="party:hot-potato"]') && await tv.$('.menu [data-focus="party:steady-hands"]'), 'all three games are in the folder');
    await shot('folder');

    // Quick Draw: both phones press Ready
    await press(p1, 'A');
    await tv.waitForSelector('.pg-lobby');
    await p1.waitForSelector('#party-pad:not([hidden]) .pg-ready');
    await shot('lobby');
    await p1.tap('.pg-ready'); await p2.tap('.pg-ready');
    await tv.waitForSelector('.qd', { timeout: 8000 });
    // Holster (the tap fallback: a test browser has no motion sensors), then wait for DRAW!
    await p1.tap('.pg-tap'); await p2.tap('.pg-tap');
    await shot('holster');
    await p1.waitForSelector('.pg-big.is-draw', { timeout: 12000 });
    await p2.waitForSelector('.pg-big.is-draw', { timeout: 12000 });
    await tv.waitForTimeout(500);
    await shot('draw');
    await p1.tap('#party-pad'); // Ana fires first
    await tv.waitForTimeout(300);
    await p2.tap('#party-pad');
    await tv.waitForSelector('.qd-replay:not([hidden])', { timeout: 8000 });
    const times = await tv.$$eval('.qd-players li span', (els) => els.map((e) => e.textContent));
    assert.ok(times.every((t) => /\d+ ms/.test(t)), `both reaction times shown: ${times}`);
    const won = await tv.textContent('.qd-players li.won b');
    assert.match(won, /Ana/, 'the phone that fired first wins the round');
    await shot('result');
    await press(p1, 'B');
    await tv.waitForSelector('.menu .tile');

    // Hot Potato and Steady Hands show their lobbies with the rules, and a phone can press Ready
    for (const [id, cls] of [['hot-potato', '.hp'], ['steady-hands', '.sh']]) {
      await tv.waitForSelector(`.menu [data-focus="party:${id}"]`);
      await focusOn(tv, (b) => press(p1, b), `party:${id}`);
      await press(p1, 'A');
      await tv.waitForSelector('.pg-lobby');
      assert.equal((await tv.$$('.pg-rules li')).length, 3, 'rules in 3 lines');
      await p1.waitForSelector('.pg-ready');
      await p1.tap('.pg-ready'); await p2.tap('.pg-ready');
      await tv.waitForSelector(cls, { timeout: 8000 });
      await p1.waitForSelector('#party-pad:not([hidden])');
      await shot(id);
      await press(p1, 'B');
      await tv.waitForSelector('.menu .tile');
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.kill();
  }
});
