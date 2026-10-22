// Couch Console server: serves the web pages and relays input between
// phones (remotes) and the laptop (console). All game logic runs in the browser.
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import QRCode from 'qrcode';
import {
  MAX_PLAYERS, colorFor, ROOM_LETTERS, ROOM_CODE_LENGTH,
  RECONNECT_GRACE_MS, EV, INPUT_EVENTS,
} from './public/js/shared/protocol.js';

const PORT = process.env.PORT || 3000;

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.static(fileURLToPath(new URL('./public', import.meta.url))));

// ---------- Rooms ----------
// rooms: code -> { consoleId, slots: Map<playerId, { clientId, socketId, leaveTimer }> }
// A slot with socketId = null is "reserved": the phone left and has 30 s to come back.
const rooms = new Map();

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
  const host = (req.get('x-forwarded-host') || req.get('host')).split(',')[0].trim();
  // Phones need https for motion sensors; only plain localhost uses http.
  const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const url = `${isLocal ? 'http' : 'https'}://${host}/remote.html?room=${room}`;
  const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 512 });
  res.json({ url, dataUrl });
});

// ---------- Sockets ----------
io.on('connection', (socket) => {
  // --- Console (laptop) ---
  socket.on(EV.CONSOLE_CREATE, (ack) => {
    if (socket.data.role === 'console') deleteRoom(socket.data.room);
    const code = newRoomCode();
    rooms.set(code, { consoleId: socket.id, slots: new Map() });
    socket.data = { role: 'console', room: code };
    if (typeof ack === 'function') ack({ room: code });
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
    io.to(remotesChannel(socket.data.room)).emit(EV.FEEDBACK_SETTINGS, payload);
  });

  // --- Remote (phone) ---
  socket.on(EV.REMOTE_JOIN, (payload, ack) => {
    if (typeof ack !== 'function') return;
    const code = String(payload?.room || '').toUpperCase();
    const clientId = String(payload?.clientId || '');
    const room = rooms.get(code);
    if (!room) return ack({ ok: false, error: 'NO_ROOM' });

    // Same phone coming back (refresh / reconnect)? Give it its old slot.
    let playerId = [...room.slots].find(([, s]) => clientId && s.clientId === clientId)?.[0];
    // Otherwise take the lowest free slot.
    if (!playerId) {
      for (let id = 1; id <= MAX_PLAYERS; id++) {
        if (!room.slots.has(id)) { playerId = id; break; }
      }
    }
    if (!playerId) return ack({ ok: false, error: 'FULL' });

    const old = room.slots.get(playerId);
    if (old) clearTimeout(old.leaveTimer);
    room.slots.set(playerId, { clientId, socketId: socket.id, leaveTimer: null });

    socket.data = { role: 'remote', room: code, playerId };
    socket.join(remotesChannel(code));
    const color = colorFor(playerId);
    io.to(room.consoleId).emit(EV.PLAYER_JOINED, { playerId, color });
    ack({ ok: true, playerId, color });
    console.log(`Room ${code}: P${playerId} joined`);
  });

  // Relay every input event to the console, stamped with the sender's playerId.
  for (const event of INPUT_EVENTS) {
    socket.on(event, (payload) => {
      if (socket.data.role !== 'remote') return;
      const room = rooms.get(socket.data.room);
      if (!room) return;
      const data = { ...(payload && typeof payload === 'object' ? payload : {}), playerId: socket.data.playerId };
      // Pointer updates are frequent; it's fine to drop one if the network is busy.
      const target = event === EV.INPUT_POINTER ? io.volatile : io;
      target.to(room.consoleId).emit(event, data);
    });
  }

  // --- Disconnects ---
  socket.on('disconnect', () => {
    const { role, room: code, playerId } = socket.data;
    if (role === 'console') {
      deleteRoom(code);
      console.log(`Room ${code} closed`);
      return;
    }
    if (role !== 'remote') return;
    const room = rooms.get(code);
    const slot = room?.slots.get(playerId);
    // Ignore if this socket was already replaced by a newer one (phone refreshed).
    if (!slot || slot.socketId !== socket.id) return;
    slot.socketId = null;
    io.to(room.consoleId).emit(EV.PLAYER_LEFT, { playerId });
    console.log(`Room ${code}: P${playerId} left (slot kept for ${RECONNECT_GRACE_MS / 1000} s)`);
    slot.leaveTimer = setTimeout(() => {
      if (room.slots.get(playerId) === slot) room.slots.delete(playerId);
    }, RECONNECT_GRACE_MS);
  });
});

server.listen(PORT, () => {
  console.log(`Couch Console running at http://localhost:${PORT}`);
  console.log(`For phones, start the tunnel in a second terminal:`);
  console.log(`  cloudflared tunnel --url http://localhost:${PORT}`);
});
