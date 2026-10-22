// Console (laptop) entry point. Phase 1: create a room and show the pairing screen.
import { EV } from '../shared/protocol.js';
import { players } from './players.js';

const $ = (id) => document.getElementById(id);
const socket = io(); // global from /socket.io/socket.io.js

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

socket.on(EV.PLAYER_JOINED, ({ playerId, color }) => players.join(playerId, color));
socket.on(EV.PLAYER_LEFT, ({ playerId }) => players.leave(playerId));

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
