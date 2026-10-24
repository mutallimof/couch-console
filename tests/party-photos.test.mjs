// The party album through the real server (Phase 44): uploads, safety checks, who may hide or delete, the ZIP. npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { EV } from '../public/js/shared/protocol.js';
import { sniff } from '../server/photos.js';

const require = createRequire(import.meta.url);
globalThis.WebSocket ??= require('ws').WebSocket;
const io = require('../node_modules/socket.io/client-dist/socket.io.js');

// Tiny real pictures: a 1x1 PNG, and a JPEG header (the server only needs the first bytes to be a JPEG)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const jpeg = (seed) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]), Buffer.from('JFIF\0', 'latin1'), Buffer.alloc(40, seed), Buffer.from([0xff, 0xd9])]);

test('sniff: the first bytes decide, not the name', () => {
  assert.equal(sniff(PNG).ext, 'png');
  assert.equal(sniff(jpeg(1)).ext, 'jpg');
  assert.equal(sniff(Buffer.from('<html><script>alert(1)</script></html>')), null);
  assert.equal(sniff(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1')).ext, 'webp');
  assert.equal(sniff(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypheic', 'latin1'), Buffer.alloc(8)])).preview, false, 'HEIC is kept but has no preview');
  assert.equal(sniff(Buffer.alloc(3)), null);
});

const PORT = 4950 + Math.floor(Math.random() * 200);
const base = `http://localhost:${PORT}`;
let server;
test.before(async () => {
  server = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(PORT), HTTPS_PORT: String(PORT + 1), DATA_DIR: mkdtempSync(join(tmpdir(), 'couch-photos-')) }, stdio: 'pipe',
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
  const s = io(base, { transports: ['websocket'], forceNew: true });
  sockets.push(s);
  s.on('connect', () => resolve(s));
});
const ask = (s, ev, payload) => new Promise((resolve) => s.emit(ev, payload, resolve));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function party() {
  const tv = await connect();
  const { room, hostToken } = await new Promise((r) => tv.emit(EV.CONSOLE_CREATE, r));
  const host = { 'x-couch-room': room, 'x-couch-host': hostToken };
  await fetch(`${base}/api/party/event/new`, { method: 'POST', headers: { ...host, 'content-type': 'application/json' }, body: '{}' }); // (each test gets a fresh, empty party)
  const join = async (name, id) => {
    const s = await connect();
    const res = await ask(s, EV.REMOTE_JOIN, { room, clientId: id, name, role: 'guest' });
    return { s, id, person: res.person, h: { 'x-couch-room': room, 'x-couch-client': id } };
  };
  const events = { tv: [], phone: [] };
  tv.on(EV.PARTY_PHOTO, (e) => events.tv.push(e));
  return { tv, room, hostToken, host, join, events };
}
const upload = (headers, buf, extra = {}) => {
  const fd = new FormData();
  fd.append('photo', new Blob([buf]), extra.name || 'x.jpg');
  if (extra.thumb) fd.append('thumb', new Blob([extra.thumb]), 't.jpg');
  fd.append('w', '640'); fd.append('h', '480');
  return fetch(`${base}/api/party/photos`, { method: 'POST', headers, body: fd });
};
const list = async (headers) => (await (await fetch(`${base}/api/party/photos`, { headers })).json()).photos;

test('a joined phone uploads; strangers, wrong files and duplicates are handled', { timeout: 30000 }, async () => {
  const p = await party();
  const ana = await p.join('Ana', 'ana-1');
  const saw = [];
  ana.s.on(EV.PARTY_PHOTO, (e) => saw.push(e));
  assert.equal((await upload({}, jpeg(1))).status, 401, 'a stranger cannot upload');
  assert.equal((await upload({ 'x-couch-room': p.room, 'x-couch-client': 'nobody' }, jpeg(1))).status, 401);
  const bad = await upload(ana.h, Buffer.from('<html>not a picture</html>'), { name: 'evil.jpg' });
  assert.equal(bad.status, 415, 'a web page renamed .jpg is refused');
  const ok = await upload(ana.h, jpeg(1), { thumb: jpeg(2) });
  assert.equal(ok.status, 200);
  const photo = (await ok.json()).photo;
  assert.equal(photo.byName, 'Ana');
  assert.equal(photo.ext, 'jpg');
  assert.equal(photo.hidden, false);
  const dup = await (await upload(ana.h, jpeg(1))).json();
  assert.equal(dup.duplicate, true, 'the same picture twice is skipped');
  assert.equal(dup.photo.id, photo.id);
  assert.equal((await list(ana.h)).length, 1);

  // served with the right type, and the thumbnail is the small one
  const full = await fetch(`${base}/api/party/photos/${photo.id}/full`);
  assert.equal(full.headers.get('content-type'), 'image/jpeg');
  assert.equal(full.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(Buffer.from(await full.arrayBuffer()).equals(jpeg(1)), true);
  const thumb = await fetch(`${base}/api/party/photos/${photo.id}/thumb`);
  assert.equal(Buffer.from(await thumb.arrayBuffer()).equals(jpeg(2)), true);
  await wait(150);
  assert.deepEqual(p.events.tv.map((e) => e.kind), ['added'], 'the TV was told');
  assert.deepEqual(saw.map((e) => e.kind), ['added'], 'other phones were told');
});

test('too-big files, and too many uploads in a minute, are refused', { timeout: 60000 }, async () => {
  const p = await party();
  const ana = await p.join('Ana', 'ana-2');
  const huge = Buffer.concat([jpeg(3), Buffer.alloc(16 * 1024 * 1024)]);
  assert.equal((await upload(ana.h, huge)).status, 413);
  let slow = 0;
  for (let i = 0; i < 45; i++) if ((await upload(ana.h, jpeg(10 + i))).status === 429) slow++;
  assert.ok(slow >= 4, `rate limit kicked in (${slow})`);
});

test('hiding is for the host, deleting is for the owner or the host, hidden photos disappear', { timeout: 30000 }, async () => {
  const p = await party();
  const ana = await p.join('Ana', 'ana-3'), ben = await p.join('Ben', 'ben-3');
  const mine = (await (await upload(ana.h, jpeg(50))).json()).photo;
  const other = (await (await upload(ben.h, jpeg(51))).json()).photo;
  const post = (headers, path, body = {}) => fetch(`${base}/api/party${path}`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) });

  assert.equal((await post(ben.h, `/photos/${mine.id}/hide`)).status, 403, 'a phone cannot hide');
  assert.equal((await post(p.host, `/photos/${mine.id}/hide`)).status, 200);
  assert.deepEqual((await list(ben.h)).map((x) => x.id), [other.id], 'hidden photos vanish for phones');
  assert.equal((await list(p.host)).length, 2, 'the host still sees it');
  assert.equal((await fetch(`${base}/api/party/photos/${mine.id}/full`)).status, 404, 'and nobody can fetch it by address');
  assert.equal((await fetch(`${base}/api/party/photos/${mine.id}/full?room=${p.room}&h=${p.hostToken}`)).status, 200, 'except the host');

  assert.equal((await fetch(`${base}/api/party/photos/${other.id}`, { method: 'DELETE', headers: ana.h })).status, 403, "not someone else's");
  assert.equal((await fetch(`${base}/api/party/photos/${other.id}`, { method: 'DELETE', headers: ben.h })).status, 200, 'your own, yes');
  assert.equal((await fetch(`${base}/api/party/photos/${mine.id}`, { method: 'DELETE', headers: p.host })).status, 200, 'the host, any');
  assert.equal((await list(p.host)).length, 0);
});

test('with "approve first" on, new photos wait for the host', { timeout: 30000 }, async () => {
  const p = await party();
  const ana = await p.join('Ana', 'ana-4'), ben = await p.join('Ben', 'ben-4');
  await fetch(`${base}/api/party/event/settings`, { method: 'PATCH', headers: { ...p.host, 'content-type': 'application/json' }, body: JSON.stringify({ approvePhotos: true }) });
  const shot = (await (await upload(ana.h, jpeg(60))).json()).photo;
  assert.equal(shot.pending, true);
  assert.equal((await list(ana.h)).length, 1, 'the sender sees their waiting photo');
  assert.equal((await list(ben.h)).length, 0, 'others do not');
  assert.equal((await fetch(`${base}/api/party/photos/${shot.id}/thumb`)).status, 404);
  await fetch(`${base}/api/party/photos/${shot.id}/approve`, { method: 'POST', headers: { ...p.host, 'content-type': 'application/json' }, body: '{}' });
  assert.equal((await list(ben.h)).length, 1, 'approved: everyone sees it');
});

test('the ZIP holds every shown photo and needs a joined phone', { timeout: 30000 }, async () => {
  const p = await party();
  const ana = await p.join('Ana', 'ana-5');
  for (let i = 0; i < 3; i++) await upload(ana.h, jpeg(70 + i));
  assert.equal((await fetch(`${base}/api/party/photos.zip?room=${p.room}&client=stranger`)).status, 401);
  const zip = Buffer.from(await (await fetch(`${base}/api/party/photos.zip?room=${p.room}&client=ana-5`)).arrayBuffer());
  assert.equal(zip.subarray(0, 2).toString('latin1'), 'PK', 'a zip file');
  const names = (zip.toString('latin1').match(/\d{3} Ana\.jpg/g) || []);
  assert.ok(new Set(names).size === 3, `three photos in the zip (${[...new Set(names)]})`);
  const size = await (await fetch(`${base}/api/party/photos-size`, { headers: ana.h })).json();
  assert.equal(size.count, 3);
});
