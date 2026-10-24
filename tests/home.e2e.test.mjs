// The home screen (Phase 55): status bar, side buttons, recently played, the panel with the open folder,
// folder tiles, the dock, tooltips, and moving around with the keyboard (no phone). Skipped without Playwright. npm test
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
const PORT = 8800 + Math.floor(Math.random() * 300);

test('home: layout, keyboard focus, folders, tooltip, sleep and the info panels', { skip: !pw && 'Playwright is not installed', timeout: 240000 }, async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(PORT), HTTPS_PORT: String(PORT + 1), DATA_DIR: `${tmpdir()}/couch-test-${PORT}` }, stdio: 'pipe',
  });
  await new Promise((resolve) => server.stdout.on('data', (d) => { if (String(d).includes('running at')) resolve(); }));
  const browser = await pw.chromium.launch();
  try {
    const errors = [];
    const tv = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
    tv.on('pageerror', (e) => errors.push(e.message));
    await tv.goto(`http://localhost:${PORT}/console.html?noboot=1&fx=off`);
    await tv.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('room-code').textContent));
    await tv.click('#use-mouse');
    await tv.waitForSelector('.menu .tile');
    await tv.waitForTimeout(800);
    const focused = () => tv.evaluate(() => document.querySelector('.menu .focused')?.dataset.focus);
    const key = async (k) => { await tv.keyboard.press(k); await tv.waitForTimeout(250); };
    const count = (sel) => tv.locator(sel).count();

    // The pieces are all there
    assert.equal(await count('.side .round-btn'), 6, 'six round side buttons');
    assert.ok(await count('#hero .tile') >= 4, 'recently played tiles');
    assert.equal(await tv.textContent('#hero .tile .tile-title'), 'Turbo Karts', 'Turbo Karts is the first big tile');
    assert.equal(await count('#folders .folder'), 4, 'four folder tiles');
    assert.ok((await count('#folders .folder .mini-grid span')) >= 8, 'folders preview their games');
    assert.deepEqual(await tv.$$eval('#dock .tile-title', (t) => t.map((x) => x.textContent)), ['Photos', 'Music', 'Present', 'Party Games', 'Camera', 'Join']);
    assert.match(await tv.textContent('#clock'), /\d/);
    assert.equal(await tv.textContent('#phones-n'), '1', 'the desk stand-in counts as one phone');
    assert.ok(await count('#panel, .panel') >= 1);

    // The D-pad moves by position, the focused tile has a tooltip, only one tile is focused
    const first = await focused();
    assert.match(first, /^panel:/);
    await key('ArrowUp');
    assert.match(await focused(), /^hero:/, 'UP goes to recently played');
    await key('ArrowLeft');
    assert.match(await focused(), /^side:|^status:/, 'LEFT from the first tile reaches the side buttons');
    await key('ArrowDown'); await key('ArrowDown');
    assert.equal(await count('.menu .focused'), 1);
    assert.equal(await tv.isVisible('#tooltip'), true, 'tooltip bubble');

    // A folder tile shows its games in the panel; B comes back to the folder tile
    for (let i = 0; i < 20 && !(await focused())?.startsWith('folder:arcade'); i++) await key('ArrowRight');
    await tv.keyboard.press('Enter');
    await tv.waitForTimeout(300);
    assert.equal(await tv.textContent('#crumb'), 'Arcade');
    assert.match(await focused(), /^panel:/, 'A on a folder moves into its games');
    await key('Escape');
    assert.equal(await focused(), 'folder:arcade', 'B goes back to the folder tile');
    assert.ok((await tv.$$eval('#tiles .tile-title', (t) => t.map((x) => x.textContent))).includes('Bowling'));

    // Info panels and sleep (A or B closes / wakes)
    for (let i = 0; i < 20 && (await focused()) !== 'side:activity'; i++) await key(i < 8 ? 'ArrowLeft' : 'ArrowUp');
    assert.equal(await focused(), 'side:activity');
    await key('Enter');
    assert.equal(await tv.isVisible('#overlay'), true);
    await key('Escape');
    assert.equal(await tv.isVisible('#overlay'), false);
    await key('ArrowDown'); await key('ArrowDown'); await key('ArrowDown'); await key('ArrowDown');
    assert.equal(await focused(), 'side:sleep');
    await key('Enter');
    assert.equal(await tv.isVisible('#sleep'), true);
    await key('Enter');
    assert.equal(await tv.isVisible('#sleep'), false);

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.kill();
  }
});
