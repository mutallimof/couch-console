// Screenshots of Turbo Karts (select, track select, race, drift, boost, results) for before/after pictures.
//   node scripts/kart-shots.mjs <out-folder> <prefix> [--two]     (needs Playwright, e.g. /opt/node22/lib/node_modules/playwright)
// Drives the real game with the keyboard (mouse & keyboard mode): Enter = GAS, arrows = steer, R = DRIFT.
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const pw = [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean).map((p) => { try { return require(p); } catch { return null; } }).find(Boolean);
if (!pw) throw new Error('Playwright not found');
const [out, prefix = 'kart'] = process.argv.slice(2);
const TWO = process.argv.includes('--two');
const TRACK = Number(process.argv.find((a) => a.startsWith('--track='))?.slice(8) || 0);
mkdirSync(out, { recursive: true });
const PORT = 8500 + Math.floor(Math.random() * 300);
const server = spawn(process.execPath, ['server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(PORT), HTTPS_PORT: String(PORT + 1), DATA_DIR: `${tmpdir()}/couch-shots-${PORT}` }, stdio: 'pipe' });
await new Promise((r) => server.stdout.on('data', (d) => String(d).includes('running at') && r()));
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 576 } });
  await ctx.route('**/games/turbo-karts.js', async (route) => { // (older versions have no window.__tk of their own)
    const r = await route.fetch(), body = await r.text();
    route.fulfill({ response: r, body: body.includes('window.__tk') ? body : body.replace('let state, shown,', 'window.__tk = { state: () => state, race: () => race, results: () => showResults(), humans: () => humans };\nlet state, shown,') });
  });
  const tv = await ctx.newPage();
  tv.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  tv.on('console', (m) => { if (['error'].includes(m.type())) console.log('CONSOLE', m.text().slice(0, 300)); });
  await tv.goto(`http://localhost:${PORT}/console.html?noboot=1${process.argv.includes('--debug') ? '&debug=1' : ''}&ao=off`);
  await tv.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('room-code').textContent));
  await tv.click('#use-mouse');
  await tv.waitForSelector('.menu .tile');
  const shot = async (n) => { await tv.waitForFunction(() => !document.querySelector('.kk-wipe'), null, { timeout: 60000 }).catch(() => {}); await tv.waitForTimeout(1200); return tv.screenshot({ path: `${out}/${prefix}-${n}.png`, timeout: 180000 }); };
  const key = (k, ms = 350) => tv.keyboard.press(k).then(() => tv.waitForTimeout(ms));
  await tv.waitForTimeout(800);
  await key('Enter', 800); // the hero tile: Turbo Karts
  if (TWO) { /* versus needs two players: only solo is scripted here */ }
  await tv.waitForFunction(() => window.__tk?.state() === 'select', null, { timeout: 180000 });
  await tv.waitForTimeout(2500);
  await shot('01-select-character');
  await key('ArrowRight'); await key('Enter', 600); await tv.waitForTimeout(1800);
  await shot('02-select-kart');
  await key('Enter', 600); await tv.waitForTimeout(800);
  await shot('03-select-track');
  console.log('track DOM:', await tv.evaluate(() => ({ tracks: document.querySelectorAll('.ks-track').length, wipe: document.querySelectorAll('.kk-wipe').length, cls: document.querySelector('.kart-select')?.innerHTML.slice(0, 200) })));
  for (let i = 0; i < TRACK; i++) await key('ArrowRight');
  await key('Enter', 300);
  await tv.waitForFunction(() => ['countdown', 'race'].includes(window.__tk?.state()), null, { timeout: 240000 });
  await tv.waitForTimeout(500);
  await shot('04-countdown');
  await tv.waitForFunction(() => window.__tk.state() === 'race', null, { timeout: 120000 });
  // The headless browser draws only a frame or two per second, so the race is fast-forwarded in the page: the
  // player is driven by the computer-driver logic (it drifts through corners and fires boosts), then we look.
  const drive = (until, seconds = 90) => tv.evaluate(([until, seconds]) => {
    const race = window.__tk.race(), p = race.player, stop = new Function('p', `return ${until}`);
    let n = 0;
    for (; n < seconds * 60 && !stop(p); n++) race.update(1 / 60, [race.cpuInput(p)]);
    window.__tk.humans().forEach((h) => { h.cam = null; }); // (the camera jumps to the new place instead of flying there)
    return `${until}: ${n / 60}s sim, lap ${p.lap}, speed ${p.speed.toFixed(0)}, drift ${p.drift} tier ${p.tier} boost ${p.boost.toFixed(2)}, state ${race.state}`;
  }, [until, seconds]).then((r) => console.log(r));
  await drive('p.speed > 30 && p.progress > 40');
  await tv.waitForTimeout(500);
  await shot('05-racing');
  await drive('p.drift && p.tier >= 1', 45);
  await tv.evaluate(() => { const r = window.__tk.race(); r.player.charge = 3.05; r.update(1 / 60, [r.cpuInput(r.player)]); window.__tk.humans().forEach((h) => { h.cam = null; }); }); // (the drift charge is fast-forwarded to purple for the picture)
  await tv.waitForTimeout(500);
  await shot('06-drift');
  await drive('p.boost > 0.5 && !p.drift', 20);
  await tv.waitForTimeout(500);
  await shot('07-after-drift-boost');
  console.log('state before pause', await tv.evaluate(() => window.__tk.state()), await tv.evaluate(() => !!window.__tk.race()));
  await key('p', 5000); // pause menu
  await shot('08-pause');
  console.log('pause open?', await tv.evaluate(() => !!document.querySelector('.kart-pause')), 'race?', await tv.evaluate(() => !!window.__tk.race()));
  await key('Escape', 1500); // B = resume
  console.log('after resume: race?', await tv.evaluate(() => !!window.__tk.race()), await tv.evaluate(() => window.__tk.state()));
  await tv.evaluate(() => window.__tk.results());
  await tv.waitForTimeout(3000);
  await shot('09-results');
  console.log('shots saved in', out);
} finally {
  await browser.close();
  server.kill();
}
