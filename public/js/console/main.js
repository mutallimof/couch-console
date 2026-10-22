// Console (laptop) entry point: pairing screen, cursors, and (for now) an input log.
import { EV, colorFor } from '../shared/protocol.js';
import { players } from './players.js';
import { createPointers } from './pointer.js';

const $ = (id) => document.getElementById(id);
const socket = io(); // global from /socket.io/socket.io.js
const DEBUG = new URLSearchParams(location.search).has('debug');
const pointers = createPointers($('cursors'));

// ---------- Pairing ----------

// A new room is created on every (re)connect, e.g. after the server restarts.
socket.on('connect', () => {
  $('status').textContent = '';
  players.clear();
  socket.emit(EV.CONSOLE_CREATE, ({ room }) => showRoom(room));
});

socket.on('disconnect', () => {
  $('status').textContent = 'Lost connection to the server. Is `npm start` still running?';
  players.clear();
});

socket.on(EV.PLAYER_JOINED, ({ playerId, color }) => {
  players.join(playerId, color);
  log(`P${playerId} joined`);
});
socket.on(EV.PLAYER_LEFT, ({ playerId }) => {
  players.leave(playerId);
  pointers.remove(playerId);
  log(`P${playerId} left`);
});

async function showRoom(room) {
  $('room-code').textContent = room;
  $('qr').hidden = true;
  $('qr-loading').hidden = false;
  try {
    const res = await fetch(`/qr?room=${room}`);
    const { url, dataUrl } = await res.json();
    $('qr').src = dataUrl;
    $('qr').hidden = false;
    $('qr-loading').hidden = true;
    $('join-url').textContent = url;
  } catch (err) {
    $('qr-loading').textContent = 'Could not load the QR code.';
    console.error(err);
  }
}

function renderSlots() {
  $('slots').innerHTML = players.slots().map((s) => `
    <div class="slot ${s.connected ? 'connected' : ''}" style="--player:${s.color}">
      <div class="slot-badge">P${s.playerId}</div>
      <div class="slot-state">${s.connected ? 'Connected' : 'Waiting…'}</div>
    </div>`).join('');
}

players.onChange(renderSlots);
renderSlots();

// ---------- Input ----------

const msgCount = new Map(); // playerId -> messages this second (debug)
const count = (playerId) => msgCount.set(playerId, (msgCount.get(playerId) || 0) + 1);

socket.on(EV.INPUT_POINTER, ({ playerId, x, y }) => {
  count(playerId);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  pointers.move(playerId, x, y, colorFor(playerId));
  $('log-pointer').textContent = `P${playerId} pointer  x ${x.toFixed(2)}  y ${y.toFixed(2)}`;
});

socket.on(EV.INPUT_BUTTON, ({ playerId, button, state }) => {
  count(playerId);
  log(`P${playerId}  ${button} ${state}`);
});

socket.on(EV.INPUT_RECENTER, ({ playerId }) => {
  count(playerId);
  log(`P${playerId}  recenter`);
});

// ---------- Temporary input log (Phase 2/3; replaced by the menu in Phase 4) ----------

function log(text) {
  const li = document.createElement('li');
  const t = new Date().toLocaleTimeString([], { hour12: false });
  li.textContent = `${t}  ${text}`;
  $('log-list').prepend(li);
  while ($('log-list').children.length > 12) $('log-list').lastChild.remove();
}

// ---------- Debug readout (?debug=1) ----------

if (DEBUG) {
  const box = $('debug');
  box.hidden = false;
  let pingMs = '…';
  // Round trip laptop -> server -> laptop (through the tunnel if opened via it).
  // The phone's debug view shows its own ping; total input delay ≈ both added up.
  setInterval(async () => {
    const t0 = performance.now();
    try {
      await fetch('/ping', { cache: 'no-store' });
      pingMs = Math.round(performance.now() - t0);
    } catch { pingMs = 'err'; }
  }, 2000);
  setInterval(() => {
    const rates = players.list().map((p) => `P${p.playerId} ${msgCount.get(p.playerId) || 0} msgs/s`);
    msgCount.clear();
    box.textContent = `latency (ping) ${pingMs} ms\n${rates.join('\n') || 'no players'}`;
  }, 1000);
}
