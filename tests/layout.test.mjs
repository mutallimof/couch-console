// Phone layouts through the real server (no browser needed): when a game asks for the kart pad,
// every phone must get it, also one that joins or comes back in the middle of a race. npm test
import test from 'node:test';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { EV } from '../public/js/shared/protocol.js';

const require = createRequire(import.meta.url);
// The same socket.io client the phone page uses. It needs WebSocket (built into Node 22+;
// on older Node, the `ws` package that comes with socket.io).
globalThis.WebSocket ??= require('ws').WebSocket;
const io = require('../node_modules/socket.io/client-dist/socket.io.js'); // (the file /socket.io/socket.io.js serves)

const PORT = 3600 + Math.floor(Math.random() * 300);
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

// Every socket a test opens is closed afterwards, even when the test fails (or it would hang)
const sockets = [];
test.afterEach(() => { for (const s of sockets.splice(0)) s.close(); });
const connect = () => new Promise((resolve) => {
  const s = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true });
  sockets.push(s);
  s.on('connect', () => resolve(s));
});
const ask = (s, ev, payload) => new Promise((resolve) => (payload === undefined ? s.emit(ev, resolve) : s.emit(ev, payload, resolve)));
const next = (s, ev) => new Promise((resolve) => s.once(ev, resolve));

test('a phone already in the room is told to show the kart pad', { timeout: 10000 }, async () => {
  const lap = await connect(), phone = await connect();
  const { room } = await ask(lap, EV.CONSOLE_CREATE);
  const joined = await ask(phone, EV.REMOTE_JOIN, { room, clientId: 'a' });
  assert.ok(joined.ok);
  assert.equal(joined.layout?.mode, 'pointer', 'the menu uses the normal remote');
  const got = next(phone, EV.FEEDBACK_MODE);
  lap.emit(EV.FEEDBACK_MODE, { mode: 'wheel' });
  assert.equal((await got).mode, 'wheel');
});

test('a phone that joins (or comes back) mid-race gets the kart pad in its join answer', { timeout: 10000 }, async () => {
  const lap = await connect(), phone = await connect();
  const { room } = await ask(lap, EV.CONSOLE_CREATE);
  lap.emit(EV.FEEDBACK_MODE, { mode: 'wheel' });
  await new Promise((r) => setTimeout(r, 100));
  const joined = await ask(phone, EV.REMOTE_JOIN, { room, clientId: 'b' });
  assert.equal(joined.layout?.mode, 'wheel');
  // back on the menu: the normal remote again
  lap.emit(EV.FEEDBACK_MODE, { mode: 'pointer' });
  await new Promise((r) => setTimeout(r, 100));
  const again = await connect();
  assert.equal((await ask(again, EV.REMOTE_JOIN, { room, clientId: 'c' })).layout?.mode, 'pointer');
});

test('only the console can change the layout', { timeout: 10000 }, async () => {
  const lap = await connect(), phone = await connect(), other = await connect();
  const { room } = await ask(lap, EV.CONSOLE_CREATE);
  await ask(phone, EV.REMOTE_JOIN, { room, clientId: 'd' });
  phone.emit(EV.FEEDBACK_MODE, { mode: 'keyboard' }); // a phone trying it is ignored
  await new Promise((r) => setTimeout(r, 100));
  assert.equal((await ask(other, EV.REMOTE_JOIN, { room, clientId: 'e' })).layout?.mode, 'pointer');
});

// The phone page must keep its zoom guards (iPhone Safari ignores the viewport tag)
import { readFileSync } from 'node:fs';
test('the phone page loads the no-zoom guards', () => {
  const main = readFileSync(new URL('../public/js/remote/main.js', import.meta.url), 'utf8');
  const guard = readFileSync(new URL('../public/js/remote/no-zoom.js', import.meta.url), 'utf8');
  assert.match(main, /import '\.\/no-zoom\.js'/);
  for (const part of ['gesturestart', 'touchend', 'visualViewport']) assert.ok(guard.includes(part), `no-zoom.js handles ${part}`);
});
