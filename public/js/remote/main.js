// Remote (phone) entry point: join a room, buttons, player badge, motion pointer.
import { EV, ROOM_LETTERS, ROOM_CODE_LENGTH } from '../shared/protocol.js';
import { createMotion } from './motion.js';

const $ = (id) => document.getElementById(id);
const socket = io(); // global from /socket.io/socket.io.js
const DEBUG = new URLSearchParams(location.search).has('debug');

const ERRORS = {
  NO_ROOM: 'Room not found. Scan the QR code on the laptop again.',
  FULL: 'This console is full.',
};

// ---------- Joining ----------

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
let joined = false;

function setConnected(on, text) {
  $('dot').classList.toggle('on', on);
  $('conn-text').textContent = text;
}

function setPlayer(playerId, color) {
  document.documentElement.style.setProperty('--player', color || '');
  $('badge').textContent = playerId ? `P${playerId}` : '–';
}

function showJoinForm(message = '') {
  joined = false;
  setPlayer(null, '');
  $('controller').hidden = true;
  $('start').hidden = true;
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
    joined = true;
    navigator.vibrate?.(150); // "you're in!" (Android; iPhone ignores it)
    setPlayer(res.playerId, res.color);
    setConnected(true, `Room ${room}`);
    $('join-form').hidden = true;
    $('controller').hidden = false;
    if (!started) $('start').hidden = false;
    // Keep the room (and debug flag) in the URL so a refresh rejoins the same room.
    history.replaceState(null, '', `?room=${room}${DEBUG ? '&debug=1' : ''}`);
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
  history.replaceState(null, '', location.pathname + (DEBUG ? '?debug=1' : ''));
  showJoinForm('The console closed. Scan the new QR code on the laptop.');
});

// ---------- Buttons ----------

let sentCount = 0; // for the debug "messages per second"

function emit(event, payload) {
  if (!joined) return;
  sentCount++;
  socket.emit(event, payload);
}

for (const el of document.querySelectorAll('[data-button]')) {
  const button = el.dataset.button;
  let isDown = false;
  const press = (e) => {
    e.preventDefault();
    if (isDown) return;
    isDown = true;
    el.classList.add('pressed');
    navigator.vibrate?.(10);
    emit(EV.INPUT_BUTTON, { button, state: 'down' });
  };
  const release = () => {
    if (!isDown) return;
    isDown = false;
    el.classList.remove('pressed');
    emit(EV.INPUT_BUTTON, { button, state: 'up' });
  };
  el.addEventListener('pointerdown', press);
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('pointerleave', release); // finger slid off the button
}

// No long-press menu anywhere.
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- Motion pointer ----------

const motion = createMotion({
  onPointer: (x, y) => {
    if (!joined) return;
    sentCount++;
    socket.volatile.emit(EV.INPUT_POINTER, { x, y });
  },
});
let started = false;

function showTouchpad(message) {
  $('touchpad').hidden = false;
  if (message) {
    $('motion-msg').textContent = message;
    $('motion-msg').hidden = false;
  }
  motion.attachTouchpad($('touchpad'));
}

$('start-btn').addEventListener('click', async () => {
  $('start-btn').disabled = true;
  $('start-btn').textContent = 'Starting…';
  const result = await motion.start();
  started = true;
  $('start').hidden = true;
  requestWakeLock();
  if (result.reason === 'denied') {
    showTouchpad('Motion access was denied. To fix it: Settings → Apps → Safari → '
      + 'Clear History and Website Data, then reload this page. For now, use the touchpad.');
  } else if (result.reason === 'unsupported') {
    showTouchpad('This phone/browser has no motion sensors here. Use the touchpad instead.');
  } else if (DEBUG) {
    showTouchpad(); // handy for testing even when motion works
  }
});

$('recenter').addEventListener('click', () => {
  motion.recenter();
  emit(EV.INPUT_RECENTER);
});

socket.on(EV.FEEDBACK_SETTINGS, (s) => motion.setRanges(s));
socket.on(EV.FEEDBACK_RUMBLE, ({ ms }) => navigator.vibrate?.(Math.min(Number(ms) || 0, 1000)));

// ---------- Keep the screen awake ----------

let wakeLock = null;
async function requestWakeLock() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch { /* not supported or not allowed: fine */ }
}
// The lock is released when the page is hidden; take it again when we're back.
document.addEventListener('visibilitychange', () => {
  if (started && document.visibilityState === 'visible' && (!wakeLock || wakeLock.released)) {
    requestWakeLock();
  }
});

// ---------- Debug readout (?debug=1) ----------

if (DEBUG) {
  const box = $('debug');
  box.hidden = false;
  let rate = 0;
  let pingMs = '…';
  const fmt = (v) => (v == null ? '–' : v.toFixed(1));
  setInterval(() => { rate = sentCount; sentCount = 0; }, 1000);
  // Round trip phone -> server -> phone, through the tunnel.
  setInterval(async () => {
    const t0 = performance.now();
    try {
      await fetch('/ping', { cache: 'no-store' });
      pingMs = Math.round(performance.now() - t0);
    } catch { pingMs = 'err'; }
  }, 2000);
  setInterval(() => {
    const s = motion.stats;
    box.textContent = `alpha ${fmt(s.alpha)}  beta ${fmt(s.beta)}  gamma ${fmt(s.gamma)}\n`
      + `mag ${fmt(s.mag)}  msgs/s ${rate}  ping ${pingMs} ms`;
  }, 100);
}
