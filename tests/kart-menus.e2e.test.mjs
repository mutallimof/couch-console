// Turbo Karts menus and tuning, with a real browser (mouse & keyboard mode): select screens, pause, results, and the
// T tuning panel. Skipped without Playwright. npm test
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
const PORT = 9500 + Math.floor(Math.random() * 300);

test('kart menus: focus + press, pause, results, and the tuning sliders (T)', { skip: !pw && 'Playwright is not installed', timeout: 400000 }, async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(PORT), HTTPS_PORT: String(PORT + 1), DATA_DIR: `${tmpdir()}/couch-test-${PORT}` }, stdio: 'pipe',
  });
  await new Promise((resolve) => server.stdout.on('data', (d) => { if (String(d).includes('running at')) resolve(); }));
  const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const errors = [];
    const tv = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
    tv.on('pageerror', (e) => errors.push(e.message));
    await tv.goto(`http://localhost:${PORT}/console.html?noboot=1&fx=off&ao=off&quarks=off`);
    await tv.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('room-code').textContent));
    await tv.click('#use-mouse');
    await tv.waitForSelector('.menu .tile');
    await tv.waitForTimeout(800);
    const key = (k, ms = 300) => tv.keyboard.press(k).then(() => tv.waitForTimeout(ms));
    const state = () => tv.evaluate(() => window.__tk?.state());

    await key('Enter', 500); // Turbo Karts
    await tv.waitForFunction(() => window.__tk?.state() === 'select', null, { timeout: 180000 });
    await tv.waitForSelector('.ks-char');
    await tv.waitForTimeout(1500);

    // Titles use Lilita One, with a dark outline; one racer is clearly selected (scaled up, ringed)
    const title = await tv.evaluate(() => { const c = getComputedStyle(document.querySelector('.kk-title')); return { font: c.fontFamily, stroke: c.webkitTextStrokeWidth }; });
    assert.match(title.font, /Lilita One/);
    assert.notEqual(title.stroke, '0px');
    assert.equal(await tv.locator('.ks-char.kk-focus').count(), 1, 'exactly one racer is selected');
    const grown = () => tv.evaluate(() => Number(window.gsap?.getProperty?.(document.querySelector('.ks-char.kk-focus'), 'scale')) || new DOMMatrix(getComputedStyle(document.querySelector('.ks-char.kk-focus')).transform).a);
    assert.ok((await grown()) > 1.05, 'the selected racer is bigger');
    const before = await tv.textContent('.ks-name');
    await key('ArrowRight', 700);
    assert.notEqual(await tv.textContent('.ks-name'), before, 'the arrow keys move the selection');
    assert.equal(await tv.locator('.ks-char.kk-focus').count(), 1);

    // racer -> kart -> ready -> track carousel (three in view, the middle one chosen)
    await key('Enter', 900);
    assert.equal(await tv.isVisible('.ks-karts'), true, 'step 2 shows the karts');
    await key('Enter', 900);
    await tv.waitForSelector('.ks-tracks', { timeout: 20000 });
    await tv.waitForFunction(() => !document.querySelector('.kk-wipe'), null, { timeout: 30000 });
    await tv.waitForTimeout(900);
    assert.equal(await tv.locator('.ks-track.kk-focus').count(), 1);
    const visible = await tv.evaluate(() => [...document.querySelectorAll('.ks-track')].filter((c) => Number(getComputedStyle(c).opacity) > 0.5).length);
    assert.equal(visible, 3, 'three tracks in view');
    await key('ArrowRight', 800);
    await key('Enter', 400);
    await tv.waitForFunction(() => ['countdown', 'race'].includes(window.__tk?.state()), null, { timeout: 240000 });

    // The tuning panel: T opens it, a slider changes the live number and is saved; Copy values has every number
    await tv.waitForFunction(() => window.__tk.race()?.handling === 'arcade', null, { timeout: 30000 });
    assert.equal(await tv.isVisible('.kart-tuning'), false);
    await key('t', 700);
    assert.equal(await tv.isVisible('.kart-tuning'), true);
    const set = await tv.evaluate(() => { const i = document.querySelector('.kt-row[data-key="grip"] input'); i.value = '20'; i.dispatchEvent(new Event('input', { bubbles: true })); return window.__tk.tuning().grip; });
    assert.equal(set, 20, 'the live number follows the slider');
    assert.equal(await tv.evaluate(() => window.__tk.race().tune.grip), 20, 'and the race uses it right away');
    assert.equal(JSON.parse(await tv.evaluate(() => localStorage.getItem('couch.kartTuning'))).grip, 20, 'saved in this browser');
    await tv.evaluate(() => { navigator.clipboard.writeText = async (t) => { window.__copied = t; }; });
    await tv.evaluate(() => document.querySelector('.kart-tuning [data-do="copy"]').click()); // (a plain click: the panel may still be sliding in on a slow machine)
    const copied = JSON.parse(await tv.evaluate(() => window.__copied));
    assert.equal(copied.grip, 20);
    for (const k of ['accel', 'driftAngle', 'charge1', 'charge2', 'charge3', 'boostStrength', 'camFollow', 'fovBase', 'shakeLand']) assert.ok(k in copied, `${k} is in the copied values`);
    await key('t', 500);
    assert.equal(await tv.isVisible('.kart-tuning'), false);

    // Pause (P / PLUS): the race stops; B resumes it
    await tv.waitForFunction(() => window.__tk.state() === 'race', null, { timeout: 120000 });
    await key('p', 1500);
    assert.equal(await tv.isVisible('.kart-pause'), true, 'the pause menu opens');
    assert.equal(await tv.locator('.kart-pause .kk-btn').count(), 4);
    const t0 = await tv.evaluate(() => window.__tk.race().raceTime);
    await tv.waitForTimeout(1500);
    assert.equal(await tv.evaluate(() => window.__tk.race().raceTime), t0, 'the race is frozen while paused');
    await key('Escape', 300);
    await tv.waitForFunction(() => !document.querySelector('.kart-pause'), null, { timeout: 20000 }); // (B resumes)
    await tv.waitForFunction((t) => window.__tk.race().raceTime > t, t0, { timeout: 30000 });

    // Results: three big buttons; Enter on "Race again" starts a new countdown
    await tv.evaluate(() => window.__tk.results());
    await tv.waitForSelector('.kart-results .kk-btn', { timeout: 20000 });
    await tv.waitForTimeout(2200);
    assert.equal(await tv.locator('.kart-results .kk-btn').count(), 3);
    assert.equal(await tv.locator('.kart-results .kk-btn.kk-focus').count(), 1, 'one button is clearly selected');
    await key('Enter', 400);
    await tv.waitForFunction(() => window.__tk.state() === 'countdown' && !document.querySelector('.kart-results'), null, { timeout: 240000 });
    assert.deepEqual(errors, [], 'no page errors');
  } finally {
    await browser.close();
    server.kill();
  }
});
