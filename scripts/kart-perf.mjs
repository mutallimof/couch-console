// Frame-time check for Turbo Karts: starts a throw-away server, plays a race with the human kart driving itself, and prints
// how long frames take (median, 95th percentile, worst, how many were slow) and whether shaders were compiled mid-race.
//   node scripts/kart-perf.mjs [track=park] [players=1] [seconds=25] [fx=auto]
// In a headless browser the graphics are software-drawn, so use the numbers to compare before / after, not as real fps.
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
for (const where of [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) { try { pw = require(where); break; } catch { /* next */ } }
if (!pw) { console.error('Playwright is needed (npm i -D playwright).'); process.exit(1); }
const [track = 'park', players = '1', seconds = '25', fx = 'auto'] = process.argv.slice(2);
const root = fileURLToPath(new URL('..', import.meta.url));
const PORT = 9700 + Math.floor(Math.random() * 200);
const server = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), HTTPS_PORT: String(PORT + 1), PING_TIMEOUT_MS: '300000', DATA_DIR: `${tmpdir()}/couch-perf-${PORT}` }, stdio: 'pipe' });
await new Promise((resolve) => server.stdout.on('data', (d) => { if (String(d).includes('running at')) resolve(); }));
const browser = await pw.chromium.launch();
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0; };
const r1 = (v) => Math.round(v * 10) / 10;
try {
  const B = `http://localhost:${PORT}`;
  const tv = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  tv.on('pageerror', (e) => console.log('page error:', String(e).slice(0, 160)));
  await tv.goto(`${B}/console.html?noboot=1&fx=${fx}&kartdebug=1&perf=1&track=${track}`);
  await tv.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('room-code').textContent));
  await tv.click('#use-mouse');
  // more phones when asked: the extra players join through the console's own test hook (real sockets, no UI)
  const room = await tv.textContent('#room-code');
  const phones = [];
  for (let i = 1; i < Number(players); i++) {
    const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
    await p.addInitScript((n) => localStorage.setItem('couch.profile', JSON.stringify({ name: `P${n}`, emoji: '🦊', role: 'player' })), i + 1);
    await p.goto(`${B}/remote.html?room=${room}`);
    await p.waitForFunction(() => document.getElementById('badge').textContent.startsWith('P'));
    phones.push(p);
  }
  await tv.waitForFunction(() => document.querySelector('.menu [data-focus="turbo-karts"]'));
  const hero = await tv.evaluate(() => { const r = document.querySelector('.menu [data-focus="turbo-karts"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await tv.mouse.move(hero.x - 4, hero.y - 4); await tv.mouse.move(hero.x, hero.y, { steps: 3 }); await tv.mouse.click(hero.x, hero.y);
  // (with one phone there is no mode picker: the game starts as "solo" by itself)
  if (await tv.waitForSelector('.picker:not([hidden])', { timeout: 5000 }).then(() => true, () => false)) {
    const modeIdx = Number(players) > 1 ? 0 : 2; // versus / solo (the order in turbo-karts.js: versus, coop, solo)
    const m = await tv.evaluate((i) => { const r = document.querySelectorAll('.picker [data-mode]')[i].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, modeIdx);
    await tv.mouse.move(m.x, m.y); await tv.mouse.click(m.x, m.y);
  }
  await tv.waitForFunction(() => window.__kart?.race, null, { timeout: 180000 });
  await tv.evaluate(() => { window.__kart.auto = true; });
  await tv.waitForTimeout(Number(seconds) * 1000);
  const d = await tv.evaluate(() => window.__kartPerf);
  const n = d.raf.length;
  const first = d.states.indexOf('race');
  const total = d.upd.map((v, i) => v + d.sync[i] + d.render[i] + d.hud[i]);
  const compiled = d.programs.length ? d.programs[d.programs.length - 1] - d.programs[Math.max(0, first)] : 0;
  const out = {
    track, players: Number(players), frames: n,
    'frame ms (median / p95 / worst)': [r1(pct(d.raf, 0.5)), r1(pct(d.raf, 0.95)), r1(Math.max(...d.raf.slice(2)))],
    'JS ms per frame (median / p95 / worst)': [r1(pct(total, 0.5)), r1(pct(total, 0.95)), r1(Math.max(...total))],
    'parts median ms (update / sync / render / hud)': [r1(pct(d.upd, 0.5)), r1(pct(d.sync, 0.5)), r1(pct(d.render, 0.5)), r1(pct(d.hud, 0.5))],
    'frames over 2x median': d.raf.filter((v) => v > pct(d.raf, 0.5) * 2).length,
    'shader programs compiled after the green light': compiled,
    'geometries / textures at the end': [d.geometries.at(-1), d.textures.at(-1)],
  };
  console.log(JSON.stringify(out, null, 1));
} finally { await browser.close(); server.kill(); }
