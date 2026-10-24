// The party music queue (Phase 45): the fair order, the rules, and the HTTP side with a pretend YouTube. npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { EV } from '../public/js/shared/protocol.js';
import { parseVideoId, orderQueue, createMusicState, addSong, advance, vote, skipVote, removeSong, moveSong, skipNeeded, MAX_WAITING_PER_PERSON } from '../server/music.js';

const person = (id) => ({ id, name: id, emoji: '🙂', color: '#000' });
const video = (n) => ({ videoId: `vid${String(n).padStart(8, '0')}`.slice(0, 11), title: `Song ${n}`, channel: 'Ch', thumb: '' });

test('links: every common YouTube form gives the 11-character id, other text gives nothing', () => {
  const id = 'dQw4w9WgXcQ';
  for (const link of [`https://www.youtube.com/watch?v=${id}`, `https://youtu.be/${id}?si=abc`, `https://m.youtube.com/watch?feature=share&v=${id}&t=10`,
    `https://www.youtube.com/shorts/${id}`, `https://www.youtube.com/embed/${id}`, `https://music.youtube.com/watch?v=${id}&list=RDAMVM${id}`, id, `  ${id}  `]) {
    assert.equal(parseVideoId(link), id, link);
  }
  for (const bad of ['', 'hello', 'https://example.com/watch?v=short', 'https://www.youtube.com/', null]) assert.equal(parseVideoId(bad), null, String(bad));
});

test('fair order: round-robin by person, so nobody takes over', () => {
  const s = createMusicState();
  // Ana adds 3, then Ben 1, then Cem 2 (the first song starts playing at once)
  for (const [who, n] of [['ana', 1], ['ana', 2], ['ana', 3], ['ben', 4], ['cem', 5], ['cem', 6]]) {
    assert.ok(addSong(s, person(who), video(n)).item, `${who} ${n}`);
    s.queue.at(-1) && (s.queue.at(-1).addedAt = n * 1000); // (stable times)
  }
  assert.equal(s.now.title, 'Song 1', 'the first song starts straight away');
  const order = orderQueue(s.queue).map((q) => q.title);
  assert.deepEqual(order, ['Song 2', 'Song 4', 'Song 5', 'Song 3', 'Song 6'], 'Ana, Ben, Cem, then the second round: Ana, Cem');
});

test('votes reorder inside a round only; you cannot vote for your own song; a second tap takes the vote back', () => {
  const s = createMusicState();
  addSong(s, person('ana'), video(1)); // plays
  addSong(s, person('ana'), video(2)); s.queue[0].addedAt = 1000;
  addSong(s, person('ben'), video(3)); s.queue[1].addedAt = 2000;
  addSong(s, person('cem'), video(4)); s.queue[2].addedAt = 3000;
  assert.deepEqual(orderQueue(s.queue).map((q) => q.title), ['Song 2', 'Song 3', 'Song 4']);
  const cems = s.queue.find((q) => q.title === 'Song 4');
  assert.equal(vote(s, person('cem'), cems.id).error, 'OWN_SONG');
  vote(s, person('dan'), cems.id); vote(s, person('eve'), cems.id);
  assert.deepEqual(orderQueue(s.queue).map((q) => q.title), ['Song 4', 'Song 2', 'Song 3'], 'two votes put Cem first in round one');
  vote(s, person('dan'), cems.id);
  assert.equal(cems.votes.length, 1, 'taking a vote back');
  assert.equal(vote(s, person('dan'), 'nope').error, 'NO_SONG');
});

test('limits: 3 waiting songs each, no duplicates, and the next song starts when one ends', () => {
  const s = createMusicState();
  addSong(s, person('ana'), video(0)); // plays now (does not count as waiting)
  for (let n = 1; n <= MAX_WAITING_PER_PERSON; n++) assert.ok(addSong(s, person('ana'), video(n)).item);
  assert.equal(addSong(s, person('ana'), video(9)).error, 'TOO_MANY');
  assert.equal(addSong(s, person('ben'), video(1)).error, 'ALREADY', 'the same video twice');
  assert.equal(advance(s).title, 'Song 1');
  assert.equal(s.history.length, 1);
  assert.ok(addSong(s, person('ana'), video(9)).item, 'a place opened up');
  advance(s); advance(s); advance(s); advance(s);
  assert.equal(s.now, null, 'queue empty: nothing playing');
});

test('skip vote: max(2, 40% of the people there); the host can skip alone', () => {
  assert.deepEqual([1, 2, 4, 5, 10].map(skipNeeded), [2, 2, 2, 2, 4]);
  const s = createMusicState();
  addSong(s, person('ana'), video(1)); addSong(s, person('ana'), video(2));
  assert.equal(skipVote(s, person('ben'), 5).skipped, false);
  assert.equal(skipVote(s, person('ben'), 5).votes, 1, 'the same person twice is one vote');
  const out = skipVote(s, person('cem'), 5);
  assert.equal(out.skipped, true);
  assert.equal(s.now.title, 'Song 2');
  assert.equal(s.skips.size, 0, 'votes start again for the next song');
});

test('removing: your own song, or any song for the host; and the host can move a song', () => {
  const s = createMusicState();
  addSong(s, person('ana'), video(1)); addSong(s, person('ana'), video(2)); addSong(s, person('ben'), video(3)); addSong(s, person('cem'), video(4));
  const [two, three, four] = [...s.queue];
  s.queue.forEach((q, i) => { q.addedAt = 1000 * (i + 1); });
  assert.equal(removeSong(s, person('ben'), two.id, false).error, 'NOT_YOURS');
  assert.ok(removeSong(s, person('ana'), two.id, false).ok);
  assert.ok(removeSong(s, person('x'), four.id, true).ok, 'host removes any');
  addSong(s, person('dan'), video(5)); s.queue.at(-1).addedAt = 9000;
  assert.deepEqual(orderQueue(s.queue, s.manual).map((q) => q.title), ['Song 3', 'Song 5']);
  moveSong(s, s.queue.find((q) => q.title === 'Song 5').id, -1);
  assert.deepEqual(orderQueue(s.queue, s.manual).map((q) => q.title), ['Song 5', 'Song 3'], 'moved up by hand');
  assert.equal(moveSong(s, three.id, 1).error, 'EDGE');
});

// ---- over HTTP with a pretend YouTube (oEmbed) ----
const require = createRequire(import.meta.url);
globalThis.WebSocket ??= require('ws').WebSocket;
const io = require('../node_modules/socket.io/client-dist/socket.io.js');
const PORT = 5700 + Math.floor(Math.random() * 200), FAKE = PORT + 500;
let server, fake;
test.before(async () => {
  fake = createServer((req, res) => { // the pretend oEmbed: "blocked..." ids are not embeddable, "offline..." fails
    const id = decodeURIComponent(new URL(req.url, 'http://x').searchParams.get('url')).split('v=')[1];
    if (id.startsWith('blocked')) { res.statusCode = 401; return res.end('no'); }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ title: `Title of ${id}`, author_name: 'Some Channel', thumbnail_url: 'https://example.com/t.jpg' }));
  });
  await new Promise((r) => fake.listen(FAKE, r));
  server = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(PORT), HTTPS_PORT: String(PORT + 1), DATA_DIR: mkdtempSync(join(tmpdir(), 'couch-music-')), YOUTUBE_OEMBED_URL: `http://localhost:${FAKE}/oembed` }, stdio: 'pipe',
  });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (d) => { if (String(d).includes('running at')) resolve(); });
    server.on('exit', (code) => reject(new Error(`server stopped (${code})`)));
  });
});
test.after(() => { server?.kill(); fake?.close(); });
const sockets = [];
test.afterEach(() => { for (const s of sockets.splice(0)) s.close(); });
const connect = () => new Promise((resolve) => { const s = io(`http://localhost:${PORT}`, { transports: ['websocket'], forceNew: true }); sockets.push(s); s.on('connect', () => resolve(s)); });
const ask = (s, ev, payload) => new Promise((resolve) => s.emit(ev, payload, resolve));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('over HTTP: add, reject blocked and bad links, 3-song limit, skip votes, and the TV moves on when a song ends or fails', { timeout: 40000 }, async () => {
  const tv = await connect();
  const { room, hostToken } = await new Promise((r) => tv.emit(EV.CONSOLE_CREATE, r));
  const states = [];
  tv.on(EV.MUSIC_STATE, (s) => states.push(s));
  const host = { 'x-couch-room': room, 'x-couch-host': hostToken, 'content-type': 'application/json' };
  await fetch(`http://localhost:${PORT}/api/party/event/new`, { method: 'POST', headers: host, body: '{}' });
  const phones = [];
  for (const [name, id] of [['Ana', 'a1'], ['Ben', 'b1'], ['Cem', 'c1']]) {
    const s = await connect();
    await ask(s, EV.REMOTE_JOIN, { room, clientId: id, name, role: 'guest' });
    phones.push({ name, h: { 'x-couch-room': room, 'x-couch-client': id, 'content-type': 'application/json' } });
  }
  const [ana, ben, cem] = phones;
  const post = (h, path, body) => fetch(`http://localhost:${PORT}/api/party${path}`, { method: 'POST', headers: h, body: JSON.stringify(body) });
  const add = (p, link) => post(p.h, '/music/add', { link });

  assert.equal((await add(ana, 'not a link')).status, 400);
  const blocked = await add(ana, 'https://youtu.be/blockedvid1');
  assert.equal(blocked.status, 422);
  assert.match((await blocked.json()).message, /can't play on the TV/);
  assert.equal((await add(ana, 'https://youtu.be/aaaaaaaaaa1')).status, 200);
  assert.equal((await add(ana, 'https://youtu.be/aaaaaaaaaa2')).status, 200);
  assert.equal((await add(ben, 'https://youtu.be/bbbbbbbbbb1')).status, 200);
  assert.equal((await add(cem, 'https://youtu.be/cccccccccc1')).status, 200);
  assert.equal((await add(ana, 'https://youtu.be/aaaaaaaaaa2')).status, 409, 'duplicate');
  await add(ana, 'https://youtu.be/aaaaaaaaaa3'); await add(ana, 'https://youtu.be/aaaaaaaaaa4');
  assert.equal((await add(ana, 'https://youtu.be/aaaaaaaaaa5')).status, 429, 'fourth waiting song');
  await wait(200);
  let s = states.at(-1);
  assert.equal(s.now.title, 'Title of aaaaaaaaaa1', 'the first song plays');
  assert.deepEqual(s.queue.slice(0, 3).map((q) => q.byName), ['Ana', 'Ben', 'Cem'], 'fair order after the one playing: one song each first');

  assert.equal((await post(ben.h, '/music/pause', { paused: true })).status, 403, 'phones cannot pause');
  const first = await (await post(ben.h, '/music/skip', {})).json();
  assert.deepEqual([first.skipped, first.votes, first.needed], [false, 1, 2]);
  const second = await (await post(cem.h, '/music/skip', {})).json();
  assert.equal(second.skipped, true);
  await wait(200);
  assert.equal(states.at(-1).now.title, 'Title of aaaaaaaaaa2');

  // the TV says it ended, and an old notice is ignored
  tv.emit(EV.MUSIC_ENDED, { videoId: 'zzzzzzzzzzz' });
  await wait(150);
  assert.equal(states.at(-1).now.title, 'Title of aaaaaaaaaa2');
  tv.emit(EV.MUSIC_ENDED, { videoId: 'aaaaaaaaaa2' });
  await wait(150);
  assert.equal(states.at(-1).now.title, 'Title of bbbbbbbbbb1');
  tv.emit(EV.MUSIC_ERROR, { videoId: 'bbbbbbbbbb1', code: 150 });
  await wait(150);
  s = states.at(-1);
  assert.equal(s.now.title, 'Title of cccccccccc1');
  assert.equal(s.error.byName, 'Ben', 'the person who added the failed song is named');
});
