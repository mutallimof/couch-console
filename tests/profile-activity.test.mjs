// Avatars (profiles) and the activity feed through the real server (Phase 55). npm test
import test from 'node:test';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { EV } from '../public/js/shared/protocol.js';
import { cleanAvatar, randomAvatar, avatarSvg, LIMITS } from '../public/js/shared/avatar.js';

const require = createRequire(import.meta.url);
globalThis.WebSocket ??= require('ws').WebSocket;
const io = require('../node_modules/socket.io/client-dist/socket.io.js');

const PORT = 7950 + Math.floor(Math.random() * 100);
let server;
test.before(async () => {
  server = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(PORT), HTTPS_PORT: String(PORT + 1), DATA_DIR: `${tmpdir()}/couch-test-${PORT}` }, stdio: 'pipe',
  });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (d) => { if (String(d).includes('running at')) resolve(); });
    server.on('exit', (code) => reject(new Error(`server stopped (${code})`)));
  });
});
test.after(() => server?.kill());

const sockets = [];
test.afterEach(() => { for (const s of sockets.splice(0)) s.close(); });
const connect = () => new Promise((resolve) => { const s = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true }); sockets.push(s); s.on('connect', () => resolve(s)); });
const ask = (s, ev, payload) => new Promise((resolve) => (payload === undefined ? s.emit(ev, resolve) : s.emit(ev, payload, resolve)));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('avatars are always valid, whatever a phone sends', () => {
  const a = cleanAvatar({ face: 99, skin: -1, hair: 'x', hairColor: 2.5, eyes: 4, mouth: null, acc: 5, bg: 7, evil: '<script>' });
  assert.deepEqual(Object.keys(a).sort(), Object.keys(LIMITS).sort(), 'only the known parts');
  for (const [k, max] of Object.entries(LIMITS)) assert.ok(Number.isInteger(a[k]) && a[k] >= 0 && a[k] < max, k);
  assert.equal(a.eyes, 4);
  assert.deepEqual(cleanAvatar('nonsense'), cleanAvatar(undefined));
  const svg = avatarSvg(randomAvatar(), 40);
  assert.match(svg, /^<svg[^>]+width="40"/);
  assert.ok(!/script|onerror/i.test(avatarSvg({ face: '<script>' })), 'no markup can sneak in');
  for (let i = 0; i < 50; i++) assert.match(avatarSvg(randomAvatar()), /<\/svg>$/);
});

test('a phone shows its avatar to the TV, changes it, and a bad one is cleaned', { timeout: 15000 }, async () => {
  const tv = await connect();
  const { room } = await ask(tv, EV.CONSOLE_CREATE);
  const rosters = [];
  tv.on(EV.PARTY_ROSTER, (r) => rosters.push(r));
  const p = await connect();
  const res = await ask(p, EV.REMOTE_JOIN, { room, clientId: 'avatar-phone', name: 'Ana', avatar: { face: 1, skin: 3, hair: 4, hairColor: 5, eyes: 2, mouth: 1, acc: 3, bg: 6 } });
  assert.equal(res.person.avatar.hair, 4);
  await wait(150);
  assert.equal(rosters.at(-1).people[0].avatar.skin, 3, 'the TV sees the avatar');
  const r2 = await ask(p, EV.REMOTE_PROFILE, { name: 'Ana', avatar: { face: 77, skin: 1 } });
  assert.equal(r2.ok, true);
  assert.equal(r2.avatar.skin, 1);
  assert.ok(r2.avatar.face < LIMITS.face, 'out-of-range parts are fixed');
});

test('the activity feed: joins, merged photo lines, songs, and "won" from the TV', { timeout: 20000 }, async () => {
  const tv = await connect();
  const { room, hostToken } = await ask(tv, EV.CONSOLE_CREATE);
  const lines = [];
  tv.on(EV.PARTY_ACTIVITY, ({ entry }) => lines.push(entry));
  const ana = await connect();
  const phoneEvents = [];
  ana.on(EV.PARTY_ACTIVITY, ({ entry }) => phoneEvents.push(entry));
  await ask(ana, EV.REMOTE_JOIN, { room, clientId: 'ana-1', name: 'Ana', role: 'player' });
  await wait(150);
  assert.equal(lines.at(-1).text, 'Ana joined');

  // Three photos in a row become ONE line that counts up
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64');
  const upload = async (n) => {
    const form = new FormData();
    form.append('photo', new Blob([Buffer.concat([png, Buffer.from([n, n, n, n, n, n, n, n])])]), 'p.png');
    const r = await fetch(`http://localhost:${PORT}/api/party/photos`, { method: 'POST', headers: { 'x-couch-room': room, 'x-couch-client': 'ana-1' }, body: form });
    assert.equal(r.status, 200, `upload ${n}`);
  };
  for (const n of [1, 2, 3]) await upload(n);
  await wait(200);
  const photoLines = lines.filter((l) => l.kind === 'photos');
  assert.equal(new Set(photoLines.map((l) => l.id)).size, 1, 'merged into one line');
  assert.equal(photoLines.at(-1).text, 'Ana added 3 photos');

  // The TV reports a winner
  tv.emit(EV.ACTIVITY_GAME, { playerId: 1, game: 'Turbo Karts', what: 'won' });
  await wait(200);
  assert.equal(lines.at(-1).text, 'Ana won Turbo Karts');
  assert.ok(phoneEvents.some((e) => e.text === 'Ana won Turbo Karts'), 'phones get the feed too');
  // A phone cannot claim a win
  ana.emit(EV.ACTIVITY_GAME, { playerId: 1, game: 'Cheating', what: 'won' });
  await wait(200);
  assert.ok(!lines.some((l) => /Cheating/.test(l.text)));

  // The list for a screen that just opened (newest first), only for people in the room
  const ok = await (await fetch(`http://localhost:${PORT}/api/party/activity`, { headers: { 'x-couch-room': room, 'x-couch-host': hostToken } })).json();
  assert.equal(ok.entries[0].text, 'Ana won Turbo Karts');
  const no = await fetch(`http://localhost:${PORT}/api/party/activity`, { headers: { 'x-couch-room': room } });
  assert.equal(no.status, 401);
});
