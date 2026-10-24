// The party in real (headless) browsers (Phase 43): the welcome card, players and guests with their
// tabs, "Ana joined" on the TV, and the home folders opening and closing. Skipped without Playwright. npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
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
const PORT = 5100 + Math.floor(Math.random() * 300);

test('welcome card, player and guest tabs, joined notes, folders', { skip: !pw && 'Playwright is not installed', timeout: 240000 }, async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(PORT), HTTPS_PORT: String(PORT + 1), DATA_DIR: `${tmpdir()}/couch-test-${PORT}` }, stdio: 'pipe',
  });
  await new Promise((resolve) => server.stdout.on('data', (d) => { if (String(d).includes('running at')) resolve(); }));
  const browser = await pw.chromium.launch();
  try {
    const B = `http://localhost:${PORT}`;
    const errors = [];
    const tv = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    tv.on('pageerror', (e) => errors.push(e.message));
    await tv.goto(`${B}/console.html?noboot=1&fx=off`);
    await tv.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('room-code').textContent));
    const room = await tv.textContent('#room-code');

    const phone = async () => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errors.push(e.message));
      await p.goto(`${B}/remote.html?room=${room}`);
      return p;
    };
    const tabs = (p) => p.$$eval('.tab', (t) => t.map((x) => x.dataset.tab));

    // A new phone sees the welcome card first, and an empty name is not accepted
    const ana = await phone();
    await ana.waitForSelector('#welcome:not([hidden])');
    await ana.waitForTimeout(500);
    await ana.tap('#w-play');
    assert.match(await ana.textContent('#w-note'), /name/i);
    await ana.fill('#w-name', 'Ana');
    await ana.waitForTimeout(500); // (the double-tap guard swallows two taps on the same spot)
    await ana.tap('#w-play');
    await ana.waitForSelector('#start:not([hidden])');
    assert.deepEqual(await tabs(ana), ['remote', 'photos', 'music', 'present'], 'a player has the remote and the three tabs');
    assert.equal(await ana.textContent('#badge'), 'P1');
    await tv.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('Ana joined'), null, { timeout: 8000 });

    // A guest has no remote
    const ben = await phone();
    await ben.waitForSelector('#welcome:not([hidden])');
    await ben.fill('#w-name', 'Ben');
    await ben.waitForTimeout(500);
    await ben.tap('#w-guest');
    await ben.waitForSelector('#tabs:not([hidden])');
    assert.deepEqual(await tabs(ben), ['photos', 'music', 'present']);
    assert.equal(await ben.isVisible('#controller'), false, 'no controller for a guest');
    await ben.tap('.tab[data-tab="music"]');
    assert.equal(await ben.isVisible('#pane-music'), true);

    // A guest becomes a player from the "me" sheet
    await ben.tap('#me-btn');
    await ben.waitForSelector('#sheet:not([hidden])');
    assert.match(await ben.textContent('#s-role'), /Join as player/);
    await ben.tap('#s-role');
    await ben.waitForSelector('#start:not([hidden])');
    assert.equal(await ben.textContent('#badge'), 'P2');
    assert.ok((await tabs(ben)).includes('remote'));

    // The TV's home: folders open (the D-pad on phone 1) and close again
    await tv.waitForSelector('.tile:not(.empty)');
    const titles = () => tv.$$eval('.tile:not(.empty) .tile-title', (t) => t.map((x) => x.textContent));
    assert.ok((await titles()).includes('Arcade') && (await titles()).includes('Turbo Karts'));
    await ana.tap('#start-btn');
    const press = (btn) => ana.evaluate((b) => { const el = document.querySelector(`#controller [data-button="${b}"]`); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); }, btn).then(() => tv.waitForTimeout(350));
    await press('RIGHT'); await press('A');
    await tv.waitForFunction(() => !document.getElementById('crumb').hidden);
    assert.match(await tv.textContent('#crumb'), /Arcade/);
    assert.ok((await titles()).includes('Back') && (await titles()).includes('Bowling'));
    await press('B');
    await tv.waitForFunction(() => document.getElementById('crumb').hidden);
    assert.deepEqual(errors, [], 'no page errors');
  } finally {
    await browser.close();
    server.kill();
  }
});
