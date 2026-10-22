// Remote (phone) entry point. Phase 1: join a room and show the player badge.
import { EV, ROOM_LETTERS, ROOM_CODE_LENGTH } from '../shared/protocol.js';

const $ = (id) => document.getElementById(id);
const socket = io(); // global from /socket.io/socket.io.js

const ERRORS = {
  NO_ROOM: 'Room not found. Scan the QR code on the laptop again.',
  FULL: 'This console is full.',
};

// A random id kept on this phone, so a refresh gets the same player slot back.
function getClientId() {
  const make = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  try {
    let id = localStorage.getItem('couch.clientId');
    if (!id) localStorage.setItem('couch.clientId', (id = make()));
    return id;
  } catch {
    return make(); // private mode etc.: works, but no slot reuse across refreshes
  }
}

const clientId = getClientId();
const isValidRoom = (code) => new RegExp(`^[${ROOM_LETTERS}]{${ROOM_CODE_LENGTH}}$`).test(code);
let room = (new URLSearchParams(location.search).get('room') || '').toUpperCase();

function setConnected(on, text) {
  $('dot').classList.toggle('on', on);
  $('conn-text').textContent = text;
}

function setPlayer(playerId, color) {
  document.documentElement.style.setProperty('--player', color || '');
  $('badge').textContent = playerId ? `P${playerId}` : '–';
  $('player-name').textContent = `P${playerId}`;
}

function showJoinForm(message = '') {
  setPlayer(null, '');
  $('joined').hidden = true;
  $('join-form').hidden = false;
  $('message').textContent = message;
  $('room-input').value = room;
}

function join() {
  if (!isValidRoom(room)) return showJoinForm(room ? 'That code doesn\'t look right.' : '');
  setConnected(false, 'Joining…');
  socket.emit(EV.REMOTE_JOIN, { room, clientId }, (res) => {
    if (!res?.ok) {
      setConnected(false, 'Not joined');
      return showJoinForm(ERRORS[res?.error] || 'Could not join.');
    }
    setPlayer(res.playerId, res.color);
    setConnected(true, `Room ${room}`);
    $('join-form').hidden = true;
    $('joined').hidden = false;
    // Keep the room in the URL so a refresh rejoins the same room.
    history.replaceState(null, '', `?room=${room}`);
  });
}

$('join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  room = $('room-input').value.trim().toUpperCase();
  $('room-input').blur();
  join();
});

// (Re)join on every connect, e.g. after Wi-Fi drops or the phone wakes up.
socket.on('connect', join);
socket.on('disconnect', () => setConnected(false, 'Reconnecting…'));

socket.on(EV.CONSOLE_DISCONNECTED, () => {
  setConnected(false, 'Not joined');
  room = '';
  history.replaceState(null, '', location.pathname);
  showJoinForm('The console closed. Scan the new QR code on the laptop.');
});
