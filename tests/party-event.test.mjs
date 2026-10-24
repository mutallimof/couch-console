// The party's event (Phase 43): saved data, who may change it, and ending a party. npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { EV } from '../public/js/shared/protocol.js';
import { createEvents, cleanEventName } from '../server/events.js';

const require = createRequire(import.meta.url);
globalThis.WebSocket ??= require('ws').WebSocket;
const io = require('../node_modules/socket.io/client-dist/socket.io.js');

test('events are saved on disk: the last one is continued, a new one can start, deleting removes the folder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'couch-events-'));
  const a = createEvents(dir);
  const first = a.current();
  assert.match(first.id, /^e-/);
  assert.ok(existsSync(join(dir, 'events', first.id, 'photos')));
  const again = createEvents(dir).current(); // "restart the laptop"
  assert.equal(again.id, first.id, 'continues the last party');
  const second = a.startNew('Birthday <b>bash</b>');
  assert.ok(!/[<>]/.test(second.name) && second.name.startsWith('Birthday'), 'angle brackets removed from the name');
  assert.equal(a.current().id, second.id);
  assert.equal(a.list().length, 2);
  assert.equal(a.rename(second.id, '  Sara & friends  ').name, 'Sara & friends');
  assert.equal(a.remove(second.id), true);
  assert.equal(existsSync(join(dir, 'events', second.id)), false);
  assert.equal(a.current().id, first.id, 'falls back to the older party');
  assert.equal(a.get('../../etc'), null, 'ids are checked');
  assert.equal(cleanEventName('x'.repeat(200)).length, 60);
  rmSync(dir, { recursive: true, force: true });
});

const PORT = 4700 + Math.floor(Math.random() * 200);
let server, base;
test.before(async () => {
  server = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(PORT), HTTPS_PORT: String(PORT + 1), DATA_DIR: mkdtempSync(join(tmpdir(), 'couch-api-')) }, stdio: 'pipe',
  });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (d) => { if (String(d).includes('running at')) resolve(); });
    server.on('exit', (code) => reject(new Error(`server stopped (${code})`)));
  });
  base = `http://localhost:${PORT}`;
});
test.after(() => server?.kill());

const sockets = [];
test.afterEach(() => { for (const s of sockets.splice(0)) s.close(); });
const connect = () => new Promise((resolve) => {
  const s = io(base, { transports: ['websocket'], forceNew: true });
  sockets.push(s);
  s.on('connect', () => resolve(s));
});
const ask = (s, ev, payload) => new Promise((resolve) => (payload === undefined ? s.emit(ev, resolve) : s.emit(ev, payload, resolve)));

test('only the TV (host token) changes the event; a joined phone may read it; strangers get nothing', { timeout: 20000 }, async () => {
  const tv = await connect();
  const { room, hostToken, event } = await ask(tv, EV.CONSOLE_CREATE);
  assert.ok(hostToken && event.id);
  const host = { 'x-couch-room': room, 'x-couch-host': hostToken, 'content-type': 'application/json' };
  const phoneSocket = await connect();
  await ask(phoneSocket, EV.REMOTE_JOIN, { room, clientId: 'phone-1', name: 'Ana', role: 'guest' });
  const phone = { 'x-couch-room': room, 'x-couch-client': 'phone-1', 'content-type': 'application/json' };

  assert.equal((await fetch(`${base}/api/party/event`, { headers: phone })).status, 200, 'phone may read');
  assert.equal((await fetch(`${base}/api/party/event`)).status, 401, 'stranger refused');
  assert.equal((await fetch(`${base}/api/party/event`, { headers: { ...phone, 'x-couch-client': 'nobody' } })).status, 401, 'unknown phone refused');
  assert.equal((await fetch(`${base}/api/party/event`, { headers: { ...host, 'x-couch-host': 'wrong-token-wrong-token-wrong-to' } })).status, 401, 'bad token refused');

  assert.equal((await fetch(`${base}/api/party/event/new`, { method: 'POST', headers: phone, body: '{}' })).status, 403, 'phone cannot start a new party');
  const made = await (await fetch(`${base}/api/party/event/new`, { method: 'POST', headers: host, body: JSON.stringify({ name: 'Sara 30' }) })).json();
  assert.equal(made.name, 'Sara 30');
  assert.equal((await (await fetch(`${base}/api/party/event`, { headers: phone })).json()).id, made.id);

  const wrong = await fetch(`${base}/api/party/event`, { method: 'DELETE', headers: host, body: JSON.stringify({ confirm: 'nope' }) });
  assert.equal(wrong.status, 400, 'ending a party needs the id as confirmation');
  const ok = await fetch(`${base}/api/party/event`, { method: 'DELETE', headers: host, body: JSON.stringify({ confirm: made.id }) });
  assert.equal(ok.status, 200);
  assert.notEqual((await (await fetch(`${base}/api/party/event`, { headers: phone })).json()).id, made.id, 'a fresh event replaces it');
});
