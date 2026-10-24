// The home screen (Phase 55): a top bar and ONE grid of big tiles; folders open as their own screen; keyboard focus
// by position; every item reachable one way. Skipped without Playwright. npm test
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

test('home: one grid, hero tile, folders open as screens, nothing is reachable two ways', { skip: !pw && 'Playwright is not installed', timeout: 240000 }, async () => {
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
    const titles = () => tv.$$eval('#tiles .tile-title', (t) => t.map((x) => x.textContent));

    // The top bar: clock and date, the four player chips, the small QR with the room code; nothing else
    assert.match(await tv.textContent('#clock'), /\d/);
    assert.equal(await tv.locator('.bar-players .chip').count(), 4);
    assert.equal(await tv.isVisible('#mini-join'), true);
    assert.equal(await tv.locator('.side, .dock, #hero, #who, #phones').count(), 0, 'no sidebar, dock, recently played, Guest chip');

    // One grid, in order, each item once; folders without games are not shown
    assert.deepEqual(await titles(), ['Turbo Karts', 'Arcade', 'Channels', 'Photos', 'Music', 'Present', 'Settings']);
    assert.equal(await tv.locator('#tiles .tile.hero').count(), 1);
    const [hero, small] = await tv.evaluate(() => [...document.querySelectorAll('#tiles .tile')].slice(0, 2).map((t) => t.getBoundingClientRect().width * t.getBoundingClientRect().height));
    assert.ok(hero > small * 3, 'Turbo Karts is the big tile');
    assert.equal(await focused(), 'turbo-karts');

    // Keyboard focus by position; exactly one focused tile
    await key('ArrowRight');
    assert.notEqual(await focused(), 'turbo-karts');
    assert.equal(await tv.locator('.menu .focused').count(), 1);

    // A folder opens as its own screen; B comes back to the home grid with the folder tile focused
    for (let i = 0; i < 10 && (await focused()) !== 'folder:arcade'; i++) await key(['ArrowUp', 'ArrowRight', 'ArrowLeft', 'ArrowDown'][i % 2 ? 1 : 0]);
    assert.equal(await focused(), 'folder:arcade');
    await key('Enter');
    assert.equal(await tv.textContent('#crumb'), 'Arcade');
    assert.ok((await titles()).includes('Bowling') && !(await titles()).includes('Turbo Karts'));
    await key('Escape');
    assert.equal(await tv.isHidden('#crumb'), true);
    assert.equal(await focused(), 'folder:arcade');

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.kill();
  }
});
