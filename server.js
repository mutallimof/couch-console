// Couch Console server: serves the web pages and relays input between
// phones (remotes) and the laptop (console). All game logic runs in the browser.
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import QRCode from 'qrcode';
import { createParty } from './server/party.js';
import { createActivity } from './server/activity.js';
import { createPhotos } from './server/photos.js';
import { createMusic } from './server/music.js';
import { createPresent } from './server/present.js';
import { randomBytes } from 'node:crypto';
import { upsertPerson, colorOf, freeSlot, roster, canAddGuest, cleanName } from './server/people.js';
import {
  MAX_PLAYERS, colorFor, ROOM_LETTERS, ROOM_CODE_LENGTH,
  RECONNECT_GRACE_MS, EV, INPUT_EVENTS,
} from './public/js/shared/protocol.js';

const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
const file = (path) => fileURLToPath(new URL(path, import.meta.url));

// Local HTTPS (Phase 16): if `npm run certs` made a certificate, also serve https on port 3443,
// so phones on the same Wi-Fi can connect directly (no tunnel).
const CERT = file('./certs/cert.pem'), KEY = file('./certs/key.pem'), ROOT_CA = file('./certs/rootCA.crt');
const httpsReady = existsSync(CERT) && existsSync(KEY);

// This laptop's address on the Wi-Fi (e.g. 192.168.1.23).
// Skips virtual adapters (WSL, Hyper-V, VirtualBox, VMware, Docker), which phones can't reach.
// Set LAN_IP=192.168.x.y to choose the address yourself.
const VIRTUAL = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|VMnet|Docker|Loopback|Bluetooth|Tailscale|ZeroTier|vboxnet|docker|br-|veth/i;
function lanAddresses() {
  return Object.entries(networkInterfaces()).flatMap(([name, list]) =>
    (list || []).filter((a) => a.family === 'IPv4' && !a.internal).map((a) => ({ name, address: a.address })));
}
function lanIp() {
  if (process.env.LAN_IP) return process.env.LAN_IP;
  const all = lanAddresses(), real = all.filter((a) => !VIRTUAL.test(a.name));
  const isPrivate = (a) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address);
  const wifi = real.find((a) => /Wi-?Fi|Wireless|WLAN|wlan/i.test(a.name) && isPrivate(a));
  return (wifi || real.find(isPrivate) || real[0] || all[0])?.address;
}

const app = express();
const server = createServer(app);
const io = new Server(server);
const httpsServer = httpsReady ? createHttpsServer({ cert: readFileSync(CERT), key: readFileSync(KEY) }, app) : null;
if (httpsServer) io.attach(httpsServer); // same rooms on both

// Browsers must check for a newer version of every file on each load (unchanged files come
// back as a tiny "not modified"), so a plain refresh after `git pull` always runs the new code.
// The big 3D model files rarely change, so the browser may keep those for a day.
app.use(express.static(fileURLToPath(new URL('./public', import.meta.url)), {
  setHeaders: (res, path) => res.set('Cache-Control', /[\\/]assets[\\/]/.test(path) ? 'public, max-age=86400' : 'no-cache'),
}));
// Which Poly Haven files (CC0 skies and textures, see docs/kart-art-options.md) are on disk, so the
// kart game can use them when they are there (and not ask for files that don't exist)
app.get('/api/polyhaven', (req, res) => {
  const base = fileURLToPath(new URL('./public/assets/polyhaven', import.meta.url));
  const ls = (dir) => { try { return readdirSync(`${base}/${dir}`); } catch { return []; } };
  // textures/<group>/textures/<name>_diff_1k.jpg (+ _nor_gl_1k.jpg, _arm_1k.jpg): one entry per material found
  const textures = {};
  for (const group of ls('textures')) {
    const files = ls(`textures/${group}/textures`);
    for (const f of files.filter((x) => x.endsWith('_diff_1k.jpg'))) {
      const name = f.replace('_diff_1k.jpg', ''), url = (suffix) => (files.includes(`${name}_${suffix}_1k.jpg`) ? `/assets/polyhaven/textures/${group}/textures/${name}_${suffix}_1k.jpg` : null);
      (textures[group] ||= []).push({ name, diff: url('diff'), nor: url('nor_gl'), arm: url('arm') });
    }
  }
  res.json({ hdri: ls('hdri').filter((f) => f.endsWith('.hdr')).map((f) => f.replace(/\.hdr$/, '')), textures });
});
// Three.js (3D games) is served from node_modules, so it works without internet.
app.get('/vendor/three.module.js', (req, res) =>
  res.sendFile(fileURLToPath(new URL('./node_modules/three/build/three.module.js', import.meta.url))));
// pdf.js (PDF slides in the browser) with its fonts and character maps
app.use('/vendor/pdfjs-dist', express.static(file('./node_modules/pdfjs-dist')));
// three.module.js imports ./three.core.js (three >= 0.18x)
app.get('/vendor/three.core.js', (req, res) =>
  res.sendFile(fileURLToPath(new URL('./node_modules/three/build/three.core.js', import.meta.url))));
// Three.js add-ons (model loader etc.), imported as "three/addons/..."
app.use('/vendor/three-addons', express.static(file('./node_modules/three/examples/jsm')));

// Which isometric icons exist (public/assets/icons/<id>.png, made by scripts/render-icons.mjs)
app.get('/api/icons', (req, res) => {
  try { res.json(readdirSync(fileURLToPath(new URL('./public/assets/icons', import.meta.url))).filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, ''))); } catch { res.json([]); }
});
// Libraries for the visual upgrade (Phase 55): effects, tweening, 2D engine, sound, animations.
// Imported by name through the importmap in console.html / remote.html.
app.use('/vendor/postprocessing', express.static(file('./node_modules/postprocessing/build')));
app.use('/vendor/three.quarks', express.static(file('./node_modules/three.quarks/dist')));
app.use('/vendor/quarks.core', express.static(file('./node_modules/quarks.core/dist'))); // (three.quarks 0.17 imports it)
app.use('/vendor/gsap', express.static(file('./node_modules/gsap')));
app.use('/vendor/pixi.js', express.static(file('./node_modules/pixi.js/dist')));
app.use('/vendor/pixi-filters', express.static(file('./node_modules/pixi-filters/dist')));
app.use('/vendor/howler', express.static(file('./node_modules/howler/dist')));
app.use('/vendor/lottie-web', express.static(file('./node_modules/lottie-web/build/player')));

// ---------- Games and channels on the menu (Phase 21e) ----------
// Any games/<name>.js or channels/<name>.js with a <name>.game.json next to it is on the menu.
// game.json: { title, color, order (lower = first), players, hidden (true = not on the menu) }
const APP_DIRS = ['games', 'channels'];
app.get('/api/apps', (req, res) => {
  const list = [];
  for (const dir of APP_DIRS) {
    const folder = file(`./public/js/console/${dir}`);
    for (const f of existsSync(folder) ? readdirSync(folder) : []) {
      if (!f.endsWith('.game.json')) continue;
      const name = f.slice(0, -'.game.json'.length);
      let meta = {};
      try { meta = JSON.parse(readFileSync(`${folder}/${f}`, 'utf8')); } catch { meta = { broken: 'game.json is not valid JSON' }; }
      if (meta.hidden) continue;
      list.push({ title: name, color: '#8A94A6', order: 99, ...meta, id: name, module: `/js/console/${dir}/${name}.js` });
    }
  }
  list.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  res.json(list);
});

// ---------- Channels (Phase 17) ----------
// Photos: any pictures you put in the photos/ folder.
const PHOTOS = file('./photos');
app.use('/photos', express.static(PHOTOS));
app.get('/api/photos', (req, res) => {
  const list = existsSync(PHOTOS)
    ? readdirSync(PHOTOS).filter((f) => /\.(jpe?g|png|gif|webp)$/i.test(f)).sort((a, b) => a.localeCompare(b))
    : [];
  res.json(list.map((name) => ({ name, url: `/photos/${encodeURIComponent(name)}` })));
});

// Videos: one YouTube link per line in videos.txt ("Title | link"), or the example list.
app.get('/api/videos', (req, res) => {
  const path = existsSync(file('./videos.txt')) ? file('./videos.txt') : file('./videos.example.txt');
  const lines = existsSync(path) ? readFileSync(path, 'utf8').split(/\r?\n/) : [];
  const videos = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [a, b] = line.includes('|') ? line.split('|').map((x) => x.trim()) : [null, line];
    // youtu.be/ID, watch?v=ID, embed/ID, shorts/ID or just the 11-character ID
    const id = (b.match(/(?:youtu\.be\/|[?&]v=|embed\/|shorts\/)([\w-]{11})/) || b.match(/^([\w-]{11})$/) || [])[1];
    if (id) videos.push({ id, title: a || `Video ${videos.length + 1}` });
  }
  res.json(videos);
});

// YouTube search (optional): needs a free YouTube Data API key in config.json
// ({ "youtubeApiKey": "..." }) or the YOUTUBE_API_KEY environment variable.
// The server asks YouTube, so the key never reaches the browser.
function youtubeKey() {
  if (process.env.YOUTUBE_API_KEY) return process.env.YOUTUBE_API_KEY;
  try { return JSON.parse(readFileSync(file('./config.json'), 'utf8')).youtubeApiKey || null; } catch { return null; }
}
app.get('/api/youtube/status', (req, res) => res.json({ search: !!youtubeKey() }));
app.get('/api/youtube/search', async (req, res) => {
  const key = youtubeKey();
  if (!key) return res.status(501).json({ error: 'NO_KEY' });
  const q = String(req.query.q || '').slice(0, 100).trim();
  if (!q) return res.json([]);
  const base = process.env.YOUTUBE_API_URL || 'https://www.googleapis.com/youtube/v3/search'; // (overridable for testing)
  const url = `${base}?part=snippet&type=video&videoEmbeddable=true`
    + `&safeSearch=moderate&maxResults=12&q=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`;
  try {
    const r = await fetch(url);
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data?.error?.message || `YouTube answered ${r.status}` });
    res.json((data.items || []).map((it) => ({
      id: it.id.videoId, title: it.snippet.title, channel: it.snippet.channelTitle,
      thumb: it.snippet.thumbnails?.medium?.url,
    })).filter((v) => v.id));
  } catch {
    res.status(502).json({ error: 'Could not reach YouTube. Is the laptop online?' });
  }
});

// The local certificate authority, so a phone can trust our https (public part only, never the key)
app.get('/rootCA.crt', (req, res) => {
  if (!existsSync(ROOT_CA)) return res.status(404).send('No certificate yet. Run `npm run certs` on the laptop.');
  res.type('application/x-x509-ca-cert').sendFile(ROOT_CA);
});

// Tiny endpoint the phone's debug view uses to measure round-trip time.
app.get('/ping', (req, res) => res.set('Cache-Control', 'no-store').send('pong'));

// ---------- Rooms ----------
// rooms: code -> { consoleId, slots: Map<playerId, { clientId, socketId, leaveTimer }> }
// A slot with socketId = null is "reserved": the phone left and has 30 s to come back.
const rooms = new Map();

// Party data (events, photos...) lives in data/ (git-ignored); DATA_DIR changes where (tests use a temp folder)
const party = createParty({ app, rooms, dataDir: process.env.DATA_DIR || file('./data') });
const activity = createActivity({ io, rooms, party });
const photos = createPhotos({ app, io, rooms, party, activity });
const music = createMusic({ app, io, rooms, party, activity });
const present = createPresent({ app, io, rooms, party, activity });

function newRoomCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_LETTERS[Math.floor(Math.random() * ROOM_LETTERS.length)];
    }
  } while (rooms.has(code));
  return code;
}

const remotesChannel = (code) => `remotes:${code}`;

// Tell the TV and every phone who is here (names, roles, who is online)
function broadcastRoster(room, code) {
  const r = roster(room);
  io.to(room.consoleId).emit(EV.PARTY_ROSTER, r);
  io.to(remotesChannel(code)).emit(EV.PARTY_ROSTER, r);
}

function deleteRoom(code) {
  const room = rooms.get(code);
  if (!room) return;
  for (const slot of room.slots.values()) clearTimeout(slot.leaveTimer);
  io.to(remotesChannel(code)).emit(EV.CONSOLE_DISCONNECTED);
  rooms.delete(code);
}

// ---------- QR code ----------
// GET /qr?room=ABCD -> { url, dataUrl } where url is the phone's join link.
app.get('/qr', async (req, res) => {
  const room = String(req.query.room || '');
  if (!new RegExp(`^[${ROOM_LETTERS}]{${ROOM_CODE_LENGTH}}$`).test(room)) {
    return res.status(400).json({ error: 'bad room' });
  }
  // Behind the cloudflared tunnel the public host is in x-forwarded-host.
  const forwarded = req.get('x-forwarded-host');
  const host = (forwarded || req.get('host')).split(',')[0].trim();
  const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const isLan = /^(\d+\.){3}\d+(:\d+)?$/.test(host);
  let url;
  if (!forwarded && httpsReady && (isLocal || isLan) && lanIp()) {
    // Local setup: send phones straight to this laptop's https address on the Wi-Fi
    url = `https://${lanIp()}:${HTTPS_PORT}/remote.html?room=${room}`;
  } else {
    // Phones need https for motion sensors; only plain localhost uses http.
    url = `${isLocal ? 'http' : 'https'}://${host}/remote.html?room=${room}`;
  }
  const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 512 });
  res.json({ url, dataUrl });
});

// ---------- Sockets ----------
io.on('connection', (socket) => {
  // --- Console (laptop) ---
  socket.on(EV.CONSOLE_CREATE, (ack) => {
    if (socket.data.role === 'console') deleteRoom(socket.data.room);
    const code = newRoomCode();
    rooms.set(code, { consoleId: socket.id, slots: new Map(), layout: { mode: 'pointer' }, people: new Map(), nextPersonId: 0, hostToken: randomBytes(16).toString('hex') });
    socket.data = { role: 'console', room: code };
    if (typeof ack === 'function') ack({ room: code, hostToken: rooms.get(code).hostToken, event: party.events.current() });
    console.log(`Room ${code} created`);
  });

  // Rumble one phone: { playerId, ms }
  socket.on(EV.FEEDBACK_RUMBLE, (payload) => {
    const room = socket.data.role === 'console' && rooms.get(socket.data.room);
    const slot = room && room.slots.get(payload?.playerId);
    if (slot?.socketId) io.to(slot.socketId).emit(EV.FEEDBACK_RUMBLE, payload);
  });

  // Settings for all phones: { rangeX, rangeY }
  socket.on(EV.FEEDBACK_SETTINGS, (payload) => {
    if (socket.data.role !== 'console') return;
    // (the room remembers the theme so a phone that joins later gets it with its join answer)
    const room = rooms.get(socket.data.room);
    if (room && (payload?.theme === 'light' || payload?.theme === 'dark')) room.theme = payload.theme;
    io.to(remotesChannel(socket.data.room)).emit(EV.FEEDBACK_SETTINGS, payload);
  });

  // Controller layout for all phones: { mode: 'pointer' | 'wheel' | 'keyboard', prompt? }
  // The room remembers it, so a phone that joins (or comes back) later gets it with its join answer.
  socket.on(EV.FEEDBACK_MODE, (payload) => {
    if (socket.data.role !== 'console') return;
    const room = rooms.get(socket.data.room);
    if (room) room.layout = { mode: payload?.mode, prompt: payload?.prompt };
    io.to(remotesChannel(socket.data.room)).emit(EV.FEEDBACK_MODE, payload);
  });

  // --- Remote (phone) ---
  socket.on(EV.REMOTE_JOIN, (payload, ack) => {
    if (typeof ack !== 'function') return;
    const code = String(payload?.room || '').toUpperCase();
    const clientId = String(payload?.clientId || '');
    const room = rooms.get(code);
    if (!room) return ack({ ok: false, error: 'NO_ROOM' });

    // Who is this phone? (A phone without a stored id counts as new each time.)
    const key = clientId || `anon:${socket.id}`;
    if (!room.people.has(key) && !canAddGuest(room)) return ack({ ok: false, error: 'FULL' });
    const isNew = !room.people.has(key);
    const person = upsertPerson(room, key, { name: payload?.name, emoji: payload?.emoji, avatar: payload?.avatar });
    if (isNew && payload?.name) activity.add(code, person, 'join');
    // Joining as a player (the default, so older phone pages keep working) or as a guest
    const wantPlayer = payload?.role !== 'guest';
    // Same phone coming back (refresh / reconnect)? Give it its old slot.
    let playerId = [...room.slots].find(([, s]) => clientId && s.clientId === clientId)?.[0] || 0;
    if (!playerId && wantPlayer) playerId = freeSlot(room); // otherwise the lowest free slot
    const full = wantPlayer && !playerId; // asked to play, but all 4 slots are taken: join as a guest

    // Same phone, another tab already joined? The newest tab takes over: tell the old one and drop it quietly.
    if (person.socketId && person.socketId !== socket.id) {
      const older = io.sockets.sockets.get(person.socketId);
      if (older) { older.data = {}; older.emit(EV.REMOTE_REPLACED); older.leave(remotesChannel(code)); }
    }

    if (playerId) {
      const old = room.slots.get(playerId);
      if (old) clearTimeout(old.leaveTimer);
      room.slots.set(playerId, { clientId, socketId: socket.id, leaveTimer: null });
    }
    person.playerId = playerId || null;
    person.socketId = socket.id;
    person.online = true;

    socket.data = { role: 'remote', room: code, playerId: playerId || null, personKey: key };
    socket.join(remotesChannel(code));
    const color = colorOf(person);
    if (playerId) io.to(room.consoleId).emit(EV.PLAYER_JOINED, { playerId, color });
    ack({ ok: true, role: playerId ? 'player' : 'guest', playerId: playerId || null, color, layout: room.layout, theme: room.theme,
      person: { id: person.id, name: person.name, emoji: person.emoji, avatar: person.avatar }, full, ...roster(room) });
    broadcastRoster(room, code);
    console.log(`Room ${code}: ${playerId ? `P${playerId}` : `guest ${person.name}`} joined`);
  });

  // The TV says a player won a game: the feed tells everyone
  socket.on(EV.ACTIVITY_GAME, (payload) => {
    if (socket.data.role !== 'console') return;
    const room = rooms.get(socket.data.room);
    const person = [...(room?.people.values() || [])].find((p) => p.playerId === Number(payload?.playerId));
    if (room && person && payload?.what === 'won') activity.add(socket.data.room, person, 'won', { game: String(payload.game || '').slice(0, 40) });
  });

  // A phone changes role (take a free player slot / give it back) or its name and emoji
  socket.on(EV.REMOTE_ROLE, (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const room = rooms.get(socket.data.room), person = room?.people.get(socket.data.personKey);
    if (socket.data.role !== 'remote' || !person) return reply({ ok: false, error: 'NOT_JOINED' });
    if (payload?.to === 'player') {
      if (person.playerId) return reply({ ok: true, role: 'player', playerId: person.playerId, color: colorOf(person) });
      const id = freeSlot(room);
      if (!id) return reply({ ok: false, error: 'FULL' });
      room.slots.set(id, { clientId: person.key.startsWith('anon:') ? '' : person.key, socketId: socket.id, leaveTimer: null });
      person.playerId = id;
      socket.data.playerId = id;
      io.to(room.consoleId).emit(EV.PLAYER_JOINED, { playerId: id, color: colorFor(id) });
      reply({ ok: true, role: 'player', playerId: id, color: colorFor(id) });
    } else if (payload?.to === 'guest') {
      const id = person.playerId;
      if (id) {
        clearTimeout(room.slots.get(id)?.leaveTimer);
        room.slots.delete(id);
        person.playerId = null;
        socket.data.playerId = null;
        io.to(room.consoleId).emit(EV.PLAYER_LEFT, { playerId: id });
      }
      reply({ ok: true, role: 'guest', playerId: null, color: colorOf(person) });
    } else return reply({ ok: false, error: 'BAD_ROLE' });
    broadcastRoster(room, socket.data.room);
  });
  socket.on(EV.REMOTE_PROFILE, (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const room = rooms.get(socket.data.room), person = room?.people.get(socket.data.personKey);
    if (socket.data.role !== 'remote' || !person) return reply({ ok: false });
    upsertPerson(room, person.key, { name: payload?.name, emoji: payload?.emoji, avatar: payload?.avatar });
    broadcastRoster(room, socket.data.room);
    reply({ ok: true, name: person.name, emoji: person.emoji, avatar: person.avatar });
  });

  // Relay every input event to the console, stamped with the sender's playerId.
  for (const event of INPUT_EVENTS) {
    socket.on(event, (payload) => {
      if (socket.data.role !== 'remote' || !socket.data.playerId) return; // (guests have no controller)
      const room = rooms.get(socket.data.room);
      if (!room) return;
      const data = { ...(payload && typeof payload === 'object' ? payload : {}), playerId: socket.data.playerId };
      // Pointer/motion updates are frequent; it's fine to drop one if the network is busy.
      // (Steering is not dropped: the last value, e.g. "straight again" after LEFT, must arrive.)
      const frequent = event === EV.INPUT_POINTER || event === EV.INPUT_MOTION;
      const target = frequent ? io.volatile : io;
      target.to(room.consoleId).emit(event, data);
    });
  }

  // --- Disconnects ---
  socket.on('disconnect', () => {
    const { role, room: code, playerId, personKey } = socket.data;
    if (role === 'console') {
      deleteRoom(code);
      console.log(`Room ${code} closed`);
      return;
    }
    if (role !== 'remote') return;
    const room = rooms.get(code);
    const person = room?.people.get(personKey);
    // A guest who closes the page just goes offline (their name and uploads stay)
    if (person && person.socketId === socket.id) { person.online = false; broadcastRoster(room, code); }
    if (!playerId) return;
    const slot = room?.slots.get(playerId);
    // Ignore if this socket was already replaced by a newer one (phone refreshed).
    if (!slot || slot.socketId !== socket.id) return;
    slot.socketId = null;
    io.to(room.consoleId).emit(EV.PLAYER_LEFT, { playerId });
    console.log(`Room ${code}: P${playerId} left (slot kept for ${RECONNECT_GRACE_MS / 1000} s)`);
    slot.leaveTimer = setTimeout(() => {
      if (room.slots.get(playerId) === slot) {
        room.slots.delete(playerId);
        if (person && person.playerId === playerId) person.playerId = null; // the slot is free again
        broadcastRoster(room, code);
      }
    }, RECONNECT_GRACE_MS);
  });
});

server.listen(PORT, () => {
  console.log(`Couch Console running at http://localhost:${PORT}`);
  if (httpsServer) return;
  console.log(`For phones, start the tunnel in a second terminal:`);
  console.log(`  cloudflared tunnel --url http://localhost:${PORT}`);
  console.log(`(Or set up the faster local mode once: see "Local setup" in README.md)`);
});
httpsServer?.listen(HTTPS_PORT, () => {
  const ip = lanIp();
  console.log(`Local HTTPS is on. Open this on the laptop:  https://${ip || 'localhost'}:${HTTPS_PORT}`);
  console.log(`Phones on the same Wi-Fi just scan the QR code (no tunnel needed).`);
  // Show every network address, so a wrong pick is easy to spot (fix it with LAN_IP=...)
  for (const a of lanAddresses()) console.log(`  network "${a.name}": ${a.address}${a.address === ip ? '   <- used for the QR code' : ''}`);
  console.log(`First time on a phone? Trust the certificate: http://${ip}:${PORT}/rootCA.crt  (see README)`);
});
