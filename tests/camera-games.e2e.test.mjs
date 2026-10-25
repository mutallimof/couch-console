// Mirror Match and Party Workout in a real (headless) browser, without a real person: ?posetest=1 lets the test feed pretend bodies.
// Also the privacy rule with a fake camera: the badge shows while the camera is on and every camera track is stopped on leaving. npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { findPlaywright, startServer } from './helpers-e2e.mjs';

const pw = findPlaywright();
const PORT = 5600 + Math.floor(Math.random() * 90);

async function openGame(tv, id) {
  const click = async (sel) => { const p = await tv.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel); await tv.mouse.move(p.x - 5, p.y - 5); await tv.mouse.move(p.x, p.y, { steps: 3 }); await tv.mouse.click(p.x, p.y); await tv.waitForTimeout(700); };
  await tv.waitForFunction(() => document.querySelector('.menu [data-focus="folder:camera"]') || document.querySelector('.menu [data-focus^="camera:"]'));
  if (!(await tv.$('.menu [data-focus^="camera:"]'))) await click('.menu [data-focus="folder:camera"]'); // (after leaving a game the folder is still open)
  await tv.waitForSelector(`.menu [data-focus="camera:${id}"]`);
  await click(`.menu [data-focus="camera:${id}"]`);
  await tv.mouse.move(5, 5);
}

test('Mirror Match: copy the pose, the best match wins; Party Workout counts squats', { skip: !pw && 'Playwright is not installed', timeout: 300000 }, async () => {
  const server = await startServer(PORT);
  const browser = await pw.chromium.launch();
  try {
    const B = `http://localhost:${PORT}`, errors = [];
    const tv = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    tv.on('pageerror', (e) => errors.push(e.message));
    await tv.goto(`${B}/console.html?noboot=1&fx=off&posetest=1`);
    await tv.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('room-code').textContent));
    await tv.click('#use-mouse');

    await openGame(tv, 'mirror-match');
    await tv.waitForSelector('.cg-card h1');
    assert.match(await tv.textContent('.cg-card h1'), /Mirror Match/);
    // two people: the left one copies every pose perfectly, the right one just stands there
    await tv.evaluate(async () => {
      const m = await import('/games/camera/pose-math.js');
      const STAND = { Lua: -92, Lfa: -92, Rua: -92, Rfa: -92, Lth: -92, Lsh: -92, Rth: -92, Rsh: -92 };
      const body = (pose, cx) => { const f = m.figureOf(pose), b = Array.from({ length: 33 }, () => ({ x: 0, y: 0, v: 0, vis: false })), put = (i, p) => { b[i] = { x: p.x - 0.5 + cx, y: p.y, v: 1, vis: true }; };
        put(m.LM.nose, f.head); put(m.LM.lSh, f.lS); put(m.LM.lEl, f.lE); put(m.LM.lWr, f.lW); put(m.LM.rSh, f.rS); put(m.LM.rEl, f.rE); put(m.LM.rWr, f.rW); put(m.LM.lHip, f.lH); put(m.LM.rHip, f.rH);
        put(m.LM.lKnee, f.lK); put(m.LM.lAnk, f.lA); put(m.LM.rKnee, f.rK); put(m.LM.rAnk, f.rA); return b; };
      window.__feed = setInterval(() => { const name = document.querySelector('.mm-name')?.textContent; const pose = m.POSES.find((p) => p.name === name) || STAND; window.__pose.set([body(pose, 0.55), body(STAND, 1.25)]); }, 40);
    });
    await tv.waitForFunction(() => /I can see/.test(document.querySelector('.cg-seen')?.textContent || ''), null, { timeout: 15000 });
    assert.match(await tv.textContent('.cg-seen'), /2<\/b>|2 people/);
    await tv.keyboard.press('Enter');
    await tv.waitForFunction(() => document.querySelector('.mm-target:not([hidden])'), null, { timeout: 15000 });
    assert.ok((await tv.textContent('.mm-name')).length > 2, 'a pose is shown');
    await tv.waitForFunction(() => /\+\d+/.test(document.querySelector('.cg-scorebar')?.textContent || ''), null, { timeout: 30000 }); // the round recap: "+score" per person
    const chips = await tv.$$eval('.cg-chip', (cs) => cs.map((c) => ({ name: c.querySelector('b').textContent, total: Number(c.querySelector('span').textContent) })));
    assert.equal(chips.length, 2);
    const a = chips.find((c) => c.name === 'P1'), g = chips.find((c) => /Guest/.test(c.name));
    assert.ok(a && g, `names ${JSON.stringify(chips)}`);
    assert.ok(a.total >= 90, `the copycat scores high (${a.total})`);
    assert.ok(g.total < a.total - 20, `the person standing still scores less (${g.total})`);
    // all five rounds, then the leaderboard with the copycat on top
    await tv.waitForSelector('.cg-board', { timeout: 90000 });
    assert.match(await tv.textContent('.cg-board li'), /P1/);
    await tv.evaluate(() => clearInterval(window.__feed));
    await tv.mouse.click(5, 5, { button: 'right' });
    await tv.waitForFunction(() => document.getElementById('stage').hidden, null, { timeout: 15000 });
    assert.ok(await tv.evaluate(() => window.__pose === undefined), 'the camera kit is gone after leaving');

    // Party Workout: a squatting person
    await openGame(tv, 'party-workout');
    await tv.waitForSelector('.cg-card h1');
    await tv.evaluate(async () => {
      const m = await import('/games/camera/pose-math.js');
      const STAND = { Lua: -92, Lfa: -92, Rua: -92, Rfa: -92, Lth: -92, Lsh: -92, Rth: -92, Rsh: -92 };
      const body = (dy) => { const f = m.figureOf(STAND), b = Array.from({ length: 33 }, () => ({ x: 0, y: 0, v: 0, vis: false })), put = (i, p, d = dy) => { b[i] = { x: p.x - 0.5 + 0.9, y: p.y + d, v: 1, vis: true }; };
        put(m.LM.nose, f.head); put(m.LM.lSh, f.lS); put(m.LM.lEl, f.lE); put(m.LM.lWr, f.lW); put(m.LM.rSh, f.rS); put(m.LM.rEl, f.rE); put(m.LM.rWr, f.rW); put(m.LM.lHip, f.lH, dy * 0.6); put(m.LM.rHip, f.rH, dy * 0.6);
        put(m.LM.lKnee, f.lK, 0); put(m.LM.lAnk, f.lA, 0); put(m.LM.rKnee, f.rK, 0); put(m.LM.rAnk, f.rA, 0); return b; };
      const t0 = performance.now();
      window.__feed = setInterval(() => { const t = (performance.now() - t0) / 1000; window.__pose.set([body(0.2 * (0.5 - 0.5 * Math.cos(2 * Math.PI * t / 1.6)))]); }, 33);
    });
    await tv.waitForFunction(() => /I can see/.test(document.querySelector('.cg-seen')?.textContent || ''), null, { timeout: 15000 });
    await tv.keyboard.press('Enter');
    await tv.waitForFunction(() => /Squats/.test(document.querySelector('.cg-round')?.textContent || ''));
    await tv.waitForFunction(() => document.querySelector('.pw-timer:not([hidden])'), null, { timeout: 20000 });
    await tv.waitForFunction(() => Number(document.querySelector('.cg-chip span')?.textContent) >= 3, null, { timeout: 30000 });
    assert.ok(Number(await tv.textContent('.cg-chip span')) >= 3, 'squats were counted');
    await tv.evaluate(() => clearInterval(window.__feed));
    await tv.mouse.click(5, 5, { button: 'right' });
    await tv.waitForFunction(() => document.getElementById('stage').hidden, null, { timeout: 15000 });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.kill(); }
});

test('the camera badge shows while the camera is on, and every camera track is stopped when you leave', { skip: !pw && 'Playwright is not installed', timeout: 240000 }, async () => {
  const server = await startServer(PORT + 1);
  const browser = await pw.chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, permissions: ['camera'] });
    await ctx.addInitScript(() => {
      window.__tracks = [];
      const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (c) => { const s = await orig(c); window.__tracks.push(...s.getTracks()); return s; };
    });
    const tv = await ctx.newPage();
    await tv.goto(`http://localhost:${PORT + 1}/console.html?noboot=1&fx=off`);
    await tv.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('room-code').textContent));
    await tv.click('#use-mouse');
    await openGame(tv, 'mirror-match');
    await tv.waitForSelector('.cg-cam:not([hidden])', { timeout: 30000 });
    assert.match(await tv.textContent('.cg-priv'), /Nothing is recorded/);
    assert.ok(await tv.evaluate(() => window.__tracks.length > 0 && window.__tracks.every((t) => t.readyState === 'live')), 'the camera is live');
    await tv.mouse.click(5, 5, { button: 'right' });
    await tv.waitForFunction(() => document.getElementById('stage').hidden, null, { timeout: 15000 });
    assert.ok(await tv.evaluate(() => window.__tracks.every((t) => t.readyState === 'ended')), 'every camera track is stopped');
  } finally { await browser.close(); server.kill(); }
});
