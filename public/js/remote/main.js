// Remote (phone) entry point: join a room, buttons, player badge, motion pointer.
import { EV, ROOM_LETTERS, ROOM_CODE_LENGTH } from '../shared/protocol.js';
import { createMotion } from './motion.js';
import { createSwing } from './swing.js';
import { createWheel } from './wheel.js';
import { createKartPad } from './kart-pad.js';

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
  $('kp-badge').textContent = $('badge').textContent;
}

function showJoinForm(message = '') {
  joined = false;
  setPlayer(null, '');
  $('controller').hidden = true;
  $('kart-pad').hidden = true;
  $('keyboard-pad').hidden = true;
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
    applyMode();
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
  // Raw sensors -> the console turns them into this player's cursor
  onSample: (sample) => {
    if (!joined || mode === 'wheel') return; // no cursor while driving
    sentCount++;
    socket.volatile.emit(EV.INPUT_MOTION, sample);
  },
  // Touchpad (phones without motion sensors)
  onPointer: (x, y) => {
    if (!joined || mode === 'wheel') return;
    sentCount++;
    socket.volatile.emit(EV.INPUT_POINTER, { x, y });
  },
});
let touchpad = null;
let started = false;

// Swings (for Bowling): sent to the console, which decides what to do with them.
const swing = createSwing({
  onSwing: ({ power, tilt }) => emit(EV.INPUT_SWING, { power, tilt }),
  getGamma: () => motion.stats.gamma,
});

// ---------- Kart pad (Turbo Karts) ----------
// The console switches us between the normal remote ('pointer'), the kart pad ('wheel')
// and a text box ('keyboard'). The kart pad steers with its strip, or by tilting (wheel.js).

let mode = 'pointer';
const sendSteer = (steer) => {
  if (!joined) return;
  sentCount++;
  socket.volatile.emit(EV.INPUT_WHEEL, { steer });
};
const wheel = createWheel({ onSteer: (steer) => { if (kartPad.tilt) sendSteer(steer); } });
const kartPad = createKartPad({
  root: $('kart-pad'),
  onButton: (button, state) => emit(EV.INPUT_BUTTON, { button, state }),
  onSteer: (steer) => { if (!kartPad.tilt) sendSteer(steer); },
  onTilt: (on) => { sendSteer(0); if (on && started) wheel.start(); else wheel.stop(); },
  onRecenter: () => { wheel.recenter(); emit(EV.INPUT_RECENTER); },
});

function applyMode() {
  if (!joined) return;
  const isKart = mode === 'wheel', isKeys = mode === 'keyboard';
  const wasKart = !$('kart-pad').hidden;
  $('controller').hidden = isKart || isKeys;
  $('kart-pad').hidden = !isKart;
  document.body.classList.toggle('kart-mode', isKart); // hides the top bar: the pad has its own
  $('keyboard-pad').hidden = !isKeys;
  if (isKeys) { $('keyboard-input').value = ''; $('keyboard-input').focus(); }
  if (isKart && !wasKart) kartPad.show();
  if (!isKart && wasKart) kartPad.hide();
  if (isKart && started && kartPad.tilt) wheel.start();
  else wheel.stop();
}

socket.on(EV.FEEDBACK_MODE, ({ mode: m, prompt } = {}) => {
  mode = ['wheel', 'keyboard'].includes(m) ? m : 'pointer';
  $('keyboard-prompt').textContent = prompt || 'Type here';
  applyMode();
});

// Keyboard layout: send the text (or '' to cancel)
$('keyboard-pad').addEventListener('submit', (e) => {
  e.preventDefault();
  $('keyboard-input').blur();
  emit(EV.INPUT_TEXT, { text: $('keyboard-input').value.trim().slice(0, 100) });
});
$('keyboard-cancel').addEventListener('click', () => emit(EV.INPUT_TEXT, { text: '' }));

$('motion-msg').addEventListener('click', () => { $('motion-msg').hidden = true; });

function showTouchpad(message) {
  $('touchpad').hidden = false;
  if (message) {
    $('motion-text').textContent = message;
    $('motion-msg').hidden = false;
  }
  touchpad = motion.attachTouchpad($('touchpad'));
}

$('start-btn').addEventListener('click', async () => {
  unlockPhoneAudio(); // sound needs a tap to start, like motion
  $('start-btn').disabled = true;
  $('start-btn').textContent = 'Starting…';
  const result = await motion.start();
  started = true;
  $('start').hidden = true;
  if (result.ok) swing.start();
  applyMode(); // a wheel game may already be running
  requestWakeLock();
  // No motion: say exactly why and how to fix it, and give a touchpad meanwhile
  const WHY = {
    insecure: `Motion needs a secure page, and this one is ${location.protocol}//${location.host}. `
      + 'On the laptop, open the https:// address that `npm start` prints (see "Local setup" in README.md), '
      + 'or use the cloudflared tunnel link, then scan the new QR code. For now, use the touchpad.',
    denied: 'Motion access was denied. To fix it on iPhone: Settings → Apps → Safari → '
      + 'Clear History and Website Data, then reload this page. On Android: Chrome → ⋮ → Settings → '
      + 'Site settings → Motion sensors → Allow. For now, use the touchpad.',
    unsupported: 'This browser has no motion sensors. Use the touchpad instead.',
    silent: 'Motion is allowed, but the sensors send nothing (a computer, or sensors blocked in the browser settings). '
      + 'On Android: Chrome → ⋮ → Settings → Site settings → Motion sensors → Allow. For now, use the touchpad.',
  };
  if (WHY[result.reason]) {
    showTouchpad(WHY[result.reason]);
  } else if (DEBUG) {
    showTouchpad(); // handy for testing even when motion works
  }
});

$('recenter').addEventListener('click', () => {
  touchpad?.recenter();
  wheel.recenter();
  emit(EV.INPUT_RECENTER);
});

// Game feedback for this player: vibrate (Android) and a small sound from the phone itself
// (iPhones can't vibrate from a web page, so there the sound is the feedback).
let phoneSounds = true;
socket.on(EV.FEEDBACK_SETTINGS, (s) => { if (typeof s?.phoneSounds === 'boolean') phoneSounds = s.phoneSounds; });
socket.on(EV.FEEDBACK_RUMBLE, ({ ms }) => {
  ms = Math.min(Number(ms) || 0, 1000);
  navigator.vibrate?.(ms);
  if (phoneSounds) phoneSound(ms);
});

// ---------- Phone sounds (Web Audio, no files) ----------
// The size of the rumble picks the sound: a tap for small things, a hit, or a thud.

let actx = null;
function unlockPhoneAudio() {
  try {
    actx ??= new (window.AudioContext || window.webkitAudioContext)();
    actx.resume();
  } catch { /* no audio: fine */ }
}
function phoneSound(ms) {
  if (!actx || actx.state !== 'running') return;
  const t = actx.currentTime, osc = actx.createOscillator(), gain = actx.createGain();
  const [f0, f1, dur, vol, type] = ms <= 60 ? [1400, 900, 0.05, 0.08, 'triangle']
    : ms <= 150 ? [520, 260, 0.1, 0.14, 'square']
      : [160, 50, 0.28, 0.22, 'sine'];
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(actx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

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
    const w = swing.stats;
    box.textContent = `alpha ${fmt(s.alpha)}  beta ${fmt(s.beta)}  gamma ${fmt(s.gamma)}\n`
      + `gyro ${s.gyro ? 'yes' : 'no'}  mag ${fmt(w.mag ?? s.mag)}  msgs/s ${rate}  ping ${pingMs} ms\n`
      + `swings ${w.swings}  last power ${w.lastPower == null ? '–' : w.lastPower.toFixed(2)}\n`
      + `mode ${mode}  steer ${(kartPad.tilt ? wheel.stats.steer : kartPad.steer).toFixed(2)}${kartPad.tilt ? ' (tilt)' : ''}`;
  }, 100);
}
