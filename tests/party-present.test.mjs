// Slides (Phase 46) through the real server: uploads, export help for PowerPoint, the presenter rules, the laser relay. npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { EV } from '../public/shared/protocol.js';
import { exportHelp, isPdf } from '../server/present.js';

const require = createRequire(import.meta.url);
globalThis.WebSocket ??= require('ws').WebSocket;
const io = require('../node_modules/socket.io/client-dist/socket.io.js');

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const jpeg = (n) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]), Buffer.from('JFIF\0', 'latin1'), Buffer.alloc(30, n), Buffer.from([0xff, 0xd9])]);

test('export help names the steps for PowerPoint, Keynote and others, and PDFs are recognised by their first bytes', () => {
  assert.match(exportHelp('talk.pptx'), /File → Export → PDF/);
  assert.match(exportHelp('Talk.KEY'), /Keynote/);
  assert.match(exportHelp('x.pptx'), /Google Slides/);
  assert.equal(exportHelp('talk.pdf'), null);
  assert.equal(isPdf(PDF), true);
  assert.equal(isPdf(Buffer.from('MZ not a pdf at all')), false);
});

const PORT = 5950 + Math.floor(Math.random() * 100);
const base = `http://localhost:${PORT}`;
let server;
test.before(async () => {
  server = spawn(process.execPath, ['server/index.js'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(PORT), HTTPS_PORT: String(PORT + 1), DATA_DIR: mkdtempSync(join(tmpdir(), 'couch-present-')) }, stdio: 'pipe',
  });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (d) => { if (String(d).includes('running at')) resolve(); });
    server.on('exit', (code) => reject(new Error(`server stopped (${code})`)));
  });
});
test.after(() => server?.kill());
const sockets = [];
test.afterEach(() => { for (const s of sockets.splice(0)) s.close(); });
const connect = () => new Promise((resolve) => { const s = io(base, { transports: ['websocket'], forceNew: true }); sockets.push(s); s.on('connect', () => resolve(s)); });
const ask = (s, ev, payload) => new Promise((resolve) => s.emit(ev, payload, resolve));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function party() {
  const tv = await connect();
  const { room, hostToken } = await new Promise((r) => tv.emit(EV.CONSOLE_CREATE, r));
  const host = { 'x-couch-room': room, 'x-couch-host': hostToken, 'content-type': 'application/json' };
  await fetch(`${base}/api/party/event/new`, { method: 'POST', headers: host, body: '{}' });
  const join = async (name, id) => { const s = await connect(); await ask(s, EV.REMOTE_JOIN, { room, clientId: id, name, role: 'guest' }); return { s, h: { 'x-couch-room': room, 'x-couch-client': id, 'content-type': 'application/json' }, hf: { 'x-couch-room': room, 'x-couch-client': id } }; };
  const states = []; tv.on(EV.PRESENT_STATE, (s) => states.push(s));
  const motion = []; tv.on(EV.PRESENT_MOTION, (m) => motion.push(m));
  return { tv, room, host, join, states, motion };
}
const upload = (headers, files, fields = {}, thumbs = []) => {
  const fd = new FormData();
  for (const [name, buf, fname] of files) fd.append('files', new Blob([buf]), fname);
  for (const t of thumbs) fd.append('thumbs', new Blob([t]), 't.jpg');
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fetch(`${base}/api/party/decks`, { method: 'POST', headers, body: fd });
};
const post = (headers, path, body = {}) => fetch(`${base}/api/party${path}`, { method: 'POST', headers, body: JSON.stringify(body) });

test('uploads: a PDF and a picture deck are listed; PowerPoint and non-slides are refused with help', { timeout: 30000 }, async () => {
  const p = await party(), ana = await p.join('Ana', 'ana-p1');
  assert.equal((await upload({}, [['files', PDF, 'a.pdf']])).status, 401);
  const ppt = await upload(ana.hf, [['files', Buffer.from('PK\x03\x04 pretend pptx'), 'My talk.pptx']]);
  assert.equal(ppt.status, 415);
  assert.match((await ppt.json()).message, /File → Export → PDF/);
  assert.equal((await upload(ana.hf, [['files', Buffer.from('hello world, not a slide'), 'x.pdf']])).status, 415, 'a text file called .pdf');
  const pdf = (await (await upload(ana.hf, [['files', PDF, 'Quarterly review.pdf']])).json()).deck;
  assert.deepEqual([pdf.name, pdf.kind, pdf.byName], ['Quarterly review', 'pdf', 'Ana']);
  const imgs = (await (await upload(ana.hf, [['files', jpeg(1), '1.jpg'], ['files', jpeg(2), '2.jpg'], ['files', jpeg(3), '3.jpg']], { name: 'Holiday' }, [jpeg(9), jpeg(8), jpeg(7)])).json()).deck;
  assert.deepEqual([imgs.kind, imgs.pages, imgs.thumbs], ['images', 3, 3]);
  const list = await (await fetch(`${base}/api/party/decks`, { headers: ana.h })).json();
  assert.equal(list.length, 2);
  assert.equal((await fetch(`${base}/api/party/decks/${pdf.id}/file`)).headers.get('content-type'), 'application/pdf');
  assert.equal(Buffer.from(await (await fetch(`${base}/api/party/decks/${imgs.id}/page/2`)).arrayBuffer()).equals(jpeg(2)), true);
  assert.equal(Buffer.from(await (await fetch(`${base}/api/party/decks/${imgs.id}/thumb/1`)).arrayBuffer()).equals(jpeg(9)), true);
  assert.equal((await fetch(`${base}/api/party/decks/${imgs.id}/page/9`)).status, 404);
  assert.equal((await fetch(`${base}/api/party/decks/../../etc/file`)).status, 404, 'ids are checked');
});

test('presenting: one presenter at a time, only they turn the pages, the last page is remembered, the host can take over', { timeout: 30000 }, async () => {
  const p = await party(), ana = await p.join('Ana', 'ana-p2'), ben = await p.join('Ben', 'ben-p2');
  const deck = (await (await upload(ana.hf, [['files', PDF, 'Deck.pdf']], { pages: '5' })).json()).deck;
  await post(p.host, `/decks/${deck.id}/meta`, { pages: 5 });
  assert.equal((await post(ben.h, '/present/goto', { delta: 1 })).status, 403, 'nobody presents yet');
  const start = await (await post(ana.h, '/present/start', { deckId: deck.id })).json();
  assert.deepEqual([start.active, start.page, start.presenter.name], [true, 1, 'Ana']);
  assert.equal((await post(ben.h, '/present/start', { deckId: deck.id })).status, 409, 'Ana is presenting');
  assert.equal((await post(ben.h, '/present/goto', { delta: 1 })).status, 403, 'Ben cannot turn the page');
  await post(ana.h, '/present/goto', { delta: 1 }); await post(ana.h, '/present/goto', { delta: 1 });
  assert.equal((await (await post(ana.h, '/present/goto', { page: 99 })).json()).page, 5, 'clamped to the last page');
  await post(ana.h, '/present/goto', { page: 4 });
  assert.equal((await (await post(ana.h, '/present/black', {})).json()).black, true);
  assert.equal((await (await post(ana.h, '/present/goto', { delta: -1 })).json()).page, 3);
  await wait(100);
  assert.deepEqual([p.states.at(-1).page, p.states.at(-1).black], [3, false], 'turning a page clears the black screen');
  assert.equal((await post(p.host, '/present/takeover')).status, 200);
  assert.equal((await post(ana.h, '/present/goto', { delta: 1 })).status, 403, 'after the host took over');
  await post(p.host, '/present/end');
  const again = await (await post(ben.h, '/present/start', { deckId: deck.id })).json();
  assert.equal(again.page, 3, 'the deck remembers where it stopped');
  await post(ben.h, '/present/end');
  assert.equal((await (await fetch(`${base}/api/party/present`, { headers: ana.h })).json()).active, false);
});

test('the laser: motion from the presenter reaches the TV only while the laser is on; notes belong to the deck owner', { timeout: 30000 }, async () => {
  const p = await party(), ana = await p.join('Ana', 'ana-p3'), ben = await p.join('Ben', 'ben-p3');
  const deck = (await (await upload(ana.hf, [['files', PDF, 'L.pdf']], { pages: '3' })).json()).deck;
  await post(p.host, `/decks/${deck.id}/meta`, { pages: 3 });
  await post(ana.h, '/present/start', { deckId: deck.id });
  const sample = { alpha: 1, beta: 2, gamma: 3 };
  ana.s.emit(EV.PRESENT_MOTION, sample); await wait(100);
  assert.equal(p.motion.length, 0, 'laser still off');
  await post(ana.h, '/present/laser', { on: true });
  ana.s.emit(EV.PRESENT_MOTION, sample); ben.s.emit(EV.PRESENT_MOTION, sample); await wait(150);
  assert.equal(p.motion.length, 1, "only the presenter's motion gets through");
  assert.equal((await fetch(`${base}/api/party/decks/${deck.id}/notes`, { method: 'PUT', headers: ben.h, body: JSON.stringify({ page: 1, text: 'hi' }) })).status, 403);
  assert.equal((await fetch(`${base}/api/party/decks/${deck.id}/notes`, { method: 'PUT', headers: ana.h, body: JSON.stringify({ page: 1, text: 'Say hello' }) })).status, 200);
  await wait(100);
  assert.equal(p.states.at(-1).notes, 'Say hello', 'the presenter sees the notes of the current page');
  assert.equal((await fetch(`${base}/api/party/decks/${deck.id}`, { method: 'DELETE', headers: ben.h })).status, 403);
  assert.equal((await fetch(`${base}/api/party/decks/${deck.id}`, { method: 'DELETE', headers: ana.h })).status, 200);
  await wait(150);
  assert.equal(p.states.at(-1).active, false, 'deleting the deck that is on stage stops the show');
});
