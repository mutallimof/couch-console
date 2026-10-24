// End to end, in a real (headless) browser: open Turbo Karts from a phone, pick, race, and check
// that every phone really SHOWS the kart pad and can steer with it. Fails if the pad doesn't appear.
// Needs Playwright (not part of this project). Without it this test is skipped. To run it:
//   npm install --no-save playwright && npx playwright install chromium && npm test
import test from 'node:test';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
function findPlaywright() {
  for (const where of [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) {
    try { return require(where); } catch { /* try the next place */ }
  }
  return null;
}
const pw = findPlaywright();
const PORT = 3900 + Math.floor(Math.random() * 300);

test('the kart pad appears on every phone during a race, and steers', { skip: !pw && 'Playwright is not installed', timeout: 300000 }, async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(PORT), HTTPS_PORT: String(PORT + 1), DATA_DIR: `${tmpdir()}/couch-test-${PORT}` }, stdio: 'pipe',
  });
  await new Promise((resolve) => server.stdout.on('data', (d) => { if (String(d).includes('running at')) resolve(); }));
  const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const B = `http://localhost:${PORT}`;
    // Console: remember the last steering value that arrived, and expose the game state
    const lctx = await browser.newContext({ viewport: { width: 1000, height: 560 } });
    await lctx.route('**/js/console/main.js', async (route) => {
      const r = await route.fetch();
      const body = (await r.text()).replace('socket.on(EV.INPUT_WHEEL, (e) => {', 'socket.on(EV.INPUT_WHEEL, (e) => {\n  window.__steer = e.steer;');
      route.fulfill({ response: r, body });
    });
    await lctx.route('**/games/turbo-karts.js', async (route) => {
      const r = await route.fetch();
      route.fulfill({ response: r, body: (await r.text()).replace('let state, shown,', 'window.__tk = { state: () => state };\nlet state, shown,') });
    });
    const lap = await lctx.newPage();
    await lap.goto(`${B}/console.html?noboot=1&fx=off`);
    await lap.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('room-code').textContent));
    const room = await lap.textContent('#room-code');

    // Two phones: one held sideways, one upright (like a phone with rotation lock on).
    // The second one "misses" the layout message once, like a phone on bad Wi-Fi.
    const phones = [];
    for (const [w, h, drop] of [[844, 390, false], [390, 844, true]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
      if (drop) {
        await ctx.addInitScript(() => {
          let real;
          Object.defineProperty(window, 'io', { configurable: true, get: () => real, set(v) {
            real = (...a) => {
              const s = v(...a), on = s.onevent.bind(s);
              s.onevent = (p) => { if (p.data?.[0] === 'feedback:mode' && p.data[1]?.mode === 'wheel' && !window.__dropped) { window.__dropped = true; return; } on(p); };
              return s;
            };
          } });
        });
      }
      await ctx.addInitScript(() => localStorage.setItem('couch.profile', JSON.stringify({ name: 'Tester', emoji: '🦊', role: 'player' }))); // (skips the welcome card)
      const ph = await ctx.newPage();
      await ph.goto(`${B}/remote.html?room=${room}`);
      await ph.locator('#start-btn').tap();
      await ph.waitForTimeout(800);
      await ph.evaluate(() => { document.getElementById('motion-msg').hidden = true; });
      phones.push(ph);
    }
    const press = (ph, bt) => ph.evaluate((bt) => {
      const el = document.querySelector(`#controller [data-button="${bt}"]`);
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    }, bt).then(() => lap.waitForTimeout(250));
    // What a phone really shows: which layouts are on screen, and is each kart button inside the screen?
    const shows = (ph) => ph.evaluate(() => {
      const seen = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const inside = [...document.querySelectorAll('[data-kart], [data-steer]')].every((el) => {
        const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        return r.width > 40 && x > 0 && y > 0 && x < innerWidth && y < innerHeight && el.contains(document.elementFromPoint(x, y));
      });
      return { controller: seen('controller'), kart: seen('kart-pad'), inside };
    });

    // Menu -> Turbo Karts (Versus) -> each picks a character and a kart -> P1 picks the track
    const [p1, p2] = phones;
    await press(p1, 'A');
    await lap.waitForSelector('.picker', { timeout: 30000 });
    await press(p1, 'A');
    await lap.waitForFunction(() => window.__tk?.state() === 'select', null, { timeout: 120000 });
    for (const ph of phones) assert.deepEqual({ ...(await shows(ph)), inside: undefined }, { controller: true, kart: false, inside: undefined }, 'menus use the normal remote');
    for (const ph of phones) { await press(ph, 'A'); await press(ph, 'A'); }
    await lap.waitForSelector('.ks-tracks', { timeout: 20000 });
    await press(p1, 'A');
    await lap.waitForFunction(() => ['countdown', 'race'].includes(window.__tk?.state()), null, { timeout: 240000 });

    // Both phones must show the kart pad (the one that missed the message within a few seconds)
    for (const [n, ph] of phones.entries()) {
      await ph.waitForFunction(() => document.getElementById('kart-pad').getBoundingClientRect().width > 0, null, { timeout: 6000 })
        .catch(() => {});
      assert.deepEqual(await shows(ph), { controller: false, kart: true, inside: true }, `phone ${n + 1} shows the kart pad`);
    }
    assert.ok(await p2.evaluate(() => window.__dropped), 'phone 2 really missed the first message');

    // Steering: hold LEFT on the upright phone (its pad is turned sideways) -> the console gets a left turn
    const sessions = new Map();
    const touch = async (ph, sel, type) => {
      const r = await ph.locator(sel).boundingBox();
      if (!sessions.has(ph)) sessions.set(ph, await ph.context().newCDPSession(ph));
      const cdp = sessions.get(ph);
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: r.x + r.width / 2, y: r.y + r.height / 2, id: 1 }] });
    };
    for (const [ph, sel, sign] of [[p2, '[data-steer="-1"]', -1], [p1, '[data-steer="1"]', 1]]) {
      await touch(ph, sel, 'touchStart');
      await lap.waitForFunction((sign) => window.__steer * sign > 0.9, sign, { timeout: 5000 });
      await touch(ph, sel, 'touchEnd');
      await lap.waitForFunction(() => window.__steer === 0, null, { timeout: 5000 });
    }
  } finally {
    await browser.close();
    server.kill();
  }
});
