// Players and guests through the real server (Phase 43): roles, the roster, no controller for guests. npm test
import test from 'node:test';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { EV, MAX_PLAYERS } from '../public/shared/protocol.js';

const require = createRequire(import.meta.url);
globalThis.WebSocket ??= require('ws').WebSocket;
const io = require('../node_modules/socket.io/client-dist/socket.io.js');

const PORT = 4300 + Math.floor(Math.random() * 300);
let server;
test.before(async () => {
  server = spawn(process.execPath, ['server/index.js'], {
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
const connect = () => new Promise((resolve) => {
  const s = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
  sockets.push(s);
  s.on('connect', () => resolve(s));
});
const ask = (s, ev, payload) => new Promise((resolve) => (payload === undefined ? s.emit(ev, resolve) : s.emit(ev, payload, resolve)));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function newRoom() {
  const tv = await connect();
  const { room } = await ask(tv, EV.CONSOLE_CREATE);
  return { tv, room };
}
async function phone(room, extra = {}) {
  const s = await connect();
  const res = await ask(s, EV.REMOTE_JOIN, { room, clientId: `c${Math.random().toString(36).slice(2)}`, ...extra });
  return { s, res };
}

test('four players fill the slots, the fifth who asks to play joins as a guest, nobody is turned away', { timeout: 15000 }, async () => {
  const { room } = await newRoom();
  const joined = [];
  for (let i = 0; i < MAX_PLAYERS + 1; i++) joined.push(await phone(room, { name: `P${i}`, role: 'player' }));
  assert.deepEqual(joined.slice(0, 4).map((j) => j.res.playerId), [1, 2, 3, 4]);
  assert.equal(joined[4].res.ok, true);
  assert.equal(joined[4].res.role, 'guest');
  assert.equal(joined[4].res.full, true, 'told that the slots were full');
  assert.equal(joined[4].res.playerId, null);
});

test('guests join without a slot and the roster lists everybody with names and roles', { timeout: 15000 }, async () => {
  const { tv, room } = await newRoom();
  const rosters = [];
  tv.on(EV.PARTY_ROSTER, (r) => rosters.push(r));
  await phone(room, { name: 'Ana', emoji: '🦊', role: 'player' });
  await phone(room, { name: '  Ben <b>  ', role: 'guest' });
  await wait(150);
  const last = rosters.at(-1);
  assert.equal(last.people.length, 2);
  const [ana, ben] = last.people;
  assert.deepEqual([ana.name, ana.role, ana.playerId, ana.emoji], ['Ana', 'player', 1, '🦊']);
  assert.deepEqual([ben.name, ben.role, ben.playerId], ['Ben b', 'guest', null], 'names are cleaned');
  assert.ok(ben.color && ben.color !== ana.color);
  assert.equal(last.slotsFree, 3);
});

test('a guest has no controller: their buttons never reach the TV', { timeout: 15000 }, async () => {
  const { tv, room } = await newRoom();
  const seen = [];
  tv.on(EV.INPUT_BUTTON, (e) => seen.push(e));
  const guest = await phone(room, { role: 'guest' });
  const player = await phone(room, { role: 'player' });
  guest.s.emit(EV.INPUT_BUTTON, { button: 'A', state: 'down' });
  player.s.emit(EV.INPUT_BUTTON, { button: 'B', state: 'down' });
  await wait(200);
  assert.deepEqual(seen.map((e) => [e.button, e.playerId]), [['B', 1]]);
});

test('a guest can take a free slot and give it back; a player can be a guest again', { timeout: 15000 }, async () => {
  const { tv, room } = await newRoom();
  const events = [];
  tv.on(EV.PLAYER_JOINED, (e) => events.push(['joined', e.playerId]));
  tv.on(EV.PLAYER_LEFT, (e) => events.push(['left', e.playerId]));
  const g = await phone(room, { role: 'guest' });
  const up = await ask(g.s, EV.REMOTE_ROLE, { to: 'player' });
  assert.deepEqual([up.ok, up.role, up.playerId], [true, 'player', 1]);
  const down = await ask(g.s, EV.REMOTE_ROLE, { to: 'guest' });
  assert.deepEqual([down.ok, down.role, down.playerId], [true, 'guest', null]);
  await wait(150); // (the TV's notices travel separately from the answers)
  assert.deepEqual(events, [['joined', 1], ['left', 1]]);
  assert.equal((await ask(g.s, EV.REMOTE_ROLE, { to: 'nonsense' })).ok, false);
});

test('taking a player slot fails when all four are taken', { timeout: 15000 }, async () => {
  const { room } = await newRoom();
  for (let i = 0; i < MAX_PLAYERS; i++) await phone(room, { role: 'player' });
  const g = await phone(room, { role: 'guest' });
  const res = await ask(g.s, EV.REMOTE_ROLE, { to: 'player' });
  assert.deepEqual([res.ok, res.error], [false, 'FULL']);
});

test('the same phone coming back keeps its slot and its name; a profile change reaches everyone', { timeout: 15000 }, async () => {
  const { tv, room } = await newRoom();
  const rosters = [];
  tv.on(EV.PARTY_ROSTER, (r) => rosters.push(r));
  const first = await connect();
  const a = await ask(first, EV.REMOTE_JOIN, { room, clientId: 'same-phone', name: 'Cem', role: 'player' });
  assert.equal(a.playerId, 1);
  first.close();
  await wait(100);
  const second = await connect();
  const b = await ask(second, EV.REMOTE_JOIN, { room, clientId: 'same-phone', role: 'player' });
  assert.equal(b.playerId, 1, 'same slot');
  assert.equal(b.person.name, 'Cem', 'name remembered');
  const p = await ask(second, EV.REMOTE_PROFILE, { name: 'Cemal', emoji: '🐙' });
  assert.equal(p.name, 'Cemal');
  await wait(100);
  assert.equal(rosters.at(-1).people[0].name, 'Cemal');
  assert.equal(rosters.at(-1).people.length, 1, 'still one person');
});

test('sixty guests can join one room', { timeout: 30000 }, async () => {
  const { tv, room } = await newRoom();
  let last;
  tv.on(EV.PARTY_ROSTER, (r) => { last = r; });
  for (let i = 0; i < 60; i++) {
    const { res } = await phone(room, { role: 'guest', name: `G${i}` });
    assert.equal(res.ok, true);
  }
  await wait(300);
  assert.equal(last.people.length, 60);
  assert.equal(last.guests, 60);
});
