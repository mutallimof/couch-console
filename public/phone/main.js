// Remote (phone) entry point: join a room, buttons, player badge, motion pointer.
import { EV, ROOM_LETTERS, ROOM_CODE_LENGTH } from '../shared/protocol.js';
import { createMotion } from './motion.js';
import { createSwing } from './swing.js';
import { createWheel } from './wheel.js';
import { createKartPad } from './kart-pad.js';
import { createHaptics } from './haptics.js';
import { createBoothPad } from './booth.js';
import { createPartyPad } from './party-game.js';
import { createClock } from '../shared/clock.js';
import { createParty } from './party.js';
import './no-zoom.js';

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
let myPlayerId = 0;
let role = 'player'; // 'player' (has a controller) or 'guest' (photos, music, slides only)

// Party: the welcome card, the tabs and the "me" sheet (party.js)
const party = createParty({
  socket,
  getRoom: () => room,
  getClientId: () => clientId,
  getViewer: () => viewerState,
  onRoleRequest: (info) => {
    if (info.changedTo) return afterRoleChange(info.res); // changed from the "me" sheet
    join(); // from the welcome card
  },
  onTab: () => applyMode(),
  // The laser pointer of the Present tab: motion sensors, sent for the laser dot only while the finger is held
  laser: {
    async start() {
      if (motionOk) return { ok: true };
      if (started) return { ok: false, reason: 'unavailable' }; // the player's own start already failed
      const r = await motion.start(); // (must be called from the tap: iPhone asks for permission then)
      motionOk = r.ok; started = true;
      return r;
    },
    emit(on) { laserEmit = on; },
  },
});
let motionOk = false, laserEmit = false;
import * as photosPane from './photos.js';
import * as musicPane from './music.js';
import * as presentPane from './present.js';
import * as activityPane from './activity.js';
import { applyTheme, systemPrefersDark } from '../shared/theme.js';

// Theme: the TV decides (Settings -> Theme) and sends 'light' or 'dark'. Before that arrives we
// use the last one we saw, or this phone's own setting, so the join screen is never a bright flash.
function followTheme(theme) {
  if (theme !== 'light' && theme !== 'dark') return;
  applyTheme(theme);
  try { localStorage.setItem('couch.tvTheme', theme); } catch { /* ignore */ }
}
{
  let saved = null;
  try { saved = localStorage.getItem('couch.tvTheme'); } catch { /* ignore */ }
  applyTheme(saved || (systemPrefersDark() ? 'dark' : 'light'));
}
party.registerPane('photos', 'Photos', '📸', photosPane);
party.registerPane('music', 'Music', '🎵', musicPane);
party.registerPane('present', 'Present', '🖥️', presentPane);
party.registerPane('activity', 'Activity', '🔔', activityPane);

// on: true = joined (green), false = connection lost (red), 'wait' = not joined yet (amber)
function setConnected(on, text) {
  $('dot').classList.toggle('on', on === true);
  $('dot').classList.toggle('wait', on === 'wait');
  document.body.classList.toggle('is-joined', on === true);
  $('conn-text').textContent = text;
}

function setPlayer(playerId, color) {
  myPlayerId = playerId || 0;
  document.documentElement.style.setProperty('--player', color || '');
  $('badge').textContent = playerId ? `P${playerId}` : role === 'guest' && joined ? '👀' : '–';
  $('kp-badge').textContent = $('badge').textContent;
}

function showJoinForm(message = '') {
  joined = false;
  $('welcome').hidden = true;
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
  // First time on this phone: ask for a name (then this runs again)
  if (party.needsWelcome()) {
    $('join-form').hidden = true;
    setConnected('wait', 'Not joined yet');
    return party.showWelcome();
  }
  setConnected('wait', 'Joining…');
  const p = party.profile;
  socket.emit(EV.REMOTE_JOIN, { room, clientId, name: p.name, emoji: p.emoji, avatar: p.avatar, role: p.role === 'guest' ? 'guest' : 'player' }, (res) => {
    if (!res?.ok) {
      setConnected('wait', 'Not joined yet');
      return showJoinForm(ERRORS[res?.error] || 'Could not join.');
    }
    joined = true;
    role = res.role === 'guest' ? 'guest' : 'player';
    navigator.vibrate?.(150); // "you're in!" (Android; iPhone ignores it)
    setPlayer(res.playerId, res.color);
    setConnected(true, `Room ${room}`);
    $('join-form').hidden = true;
    $('welcome').hidden = true;
    followTheme(res.theme);
    setLayout(res.layout, 'join'); // the layout the console wants right now (e.g. the kart pad mid-race)
    if (res.booth) booth.update(res.booth); // (the Photo Booth may already be running)
    showViewerBar(res.viewer);
    party.onJoined(res);
    applyMode();
    if (!started && role === 'player') $('start').hidden = false;
    else $('start').hidden = true;
    // Keep the room (and debug flag) in the URL so a refresh rejoins the same room.
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
socket.on(EV.PARTY_ROSTER, (r) => party.onRoster(r));

// The "me" sheet changed this phone between player and guest
function afterRoleChange(res) {
  role = res.role === 'guest' ? 'guest' : 'player';
  setPlayer(res.playerId, res.color);
  party.onJoined({ role, person: undefined, slotsFree: undefined });
  if (role === 'player') party.setTab('remote'); // a new player lands on the controller
  applyMode();
}
socket.on('disconnect', () => setConnected(false, 'Reconnecting…'));

// Another tab of this phone joined (e.g. the QR was scanned again): that tab is now the live one.
// This tab stops reconnecting by itself and offers to take over again.
let replaced = false;
socket.on(EV.REMOTE_REPLACED, () => {
  replaced = true;
  joined = false;
  socket.io.opts.reconnection = false;
  socket.disconnect();
  setConnected(false, 'Open in another tab');
  $('replaced').hidden = false;
});
$('replaced-btn').addEventListener('click', () => {
  replaced = false;
  $('replaced').hidden = true;
  socket.io.opts.reconnection = true;
  socket.connect(); // 'connect' joins again, and this tab is the newest
});

socket.on(EV.CONSOLE_DISCONNECTED, () => {
  setConnected('wait', 'Not joined yet');
  room = '';
  history.replaceState(null, '', location.pathname);
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
    if (laserEmit) socket.volatile.emit(EV.PRESENT_MOTION, sample); // (the presenter's laser: any role)
    if (!joined || mode === 'wheel' || role !== 'player' || party.tab !== 'remote') return; // no cursor while driving or on another tab
    sentCount++;
    socket.volatile.emit(EV.INPUT_MOTION, sample);
  },
  // Touchpad (phones without motion sensors)
  onPointer: (x, y) => {
    if (!joined || mode === 'wheel' || role !== 'player' || party.tab !== 'remote') return;
    sentCount++;
    socket.volatile.emit(EV.INPUT_POINTER, { x, y });
  },
  // A tap on the touchpad clicks, like A
  onTap: () => {
    if (!joined || role !== 'player') return;
    emit(EV.INPUT_BUTTON, { button: 'A', state: 'down' });
    setTimeout(() => emit(EV.INPUT_BUTTON, { button: 'A', state: 'up' }), 60);
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
// and a text box ('keyboard'). The kart pad steers with LEFT / RIGHT, or by tilting (wheel.js).

let mode = 'pointer';
const sendSteer = (steer) => {
  if (!joined) return;
  sentCount++;
  socket.emit(EV.INPUT_WHEEL, { steer }); // (not volatile: "straight again" must never get lost)
};
const haptics = createHaptics();
const booth = createBoothPad({ root: $('booth-pad'), send: (cmd) => socket.emit(EV.BOOTH_CMD, cmd), onHome: () => emit(EV.INPUT_BUTTON, { button: 'HOME', state: 'down' }), haptics });
socket.on(EV.BOOTH_STATE, (st) => booth.update(st));

// The TV has a photo or slide open in the shared viewer: show the zoom keys (they act on the TV's viewer)
let viewerState = { active: false };
function showViewerBar(st) { viewerState = st || { active: false }; $('viewer-bar').hidden = !(joined && viewerState.active); }
socket.on(EV.VIEWER_STATE, showViewerBar);
$('viewer-bar').addEventListener('pointerdown', (e) => { // (pointerdown: quick repeated taps on + / - all count)
  const b = e.target.closest('[data-vop]'); if (!b) return;
  e.preventDefault();
  const op = b.dataset.vop;
  emit(EV.VIEWER_CMD, op === 'in' ? { op: 'zoom', f: 1.4 } : op === 'out' ? { op: 'zoom', f: 1 / 1.4 } : { op });
  haptics?.play('tap');
});
const clock = createClock(socket, EV.PG_TIME);
const partyPad = createPartyPad({ root: $('party-pad'), send: (m) => socket.emit(EV.PG_UP, m), clock, haptics, getPlayerId: () => myPlayerId, onHome: () => emit(EV.INPUT_BUTTON, { button: 'HOME', state: 'down' }) });
socket.on(EV.PG_DOWN, (m) => { if (!m.to || m.to === myPlayerId) partyPad.update(m); });
window.__partyPad = partyPad; // (for the tests)
const wheel = createWheel({ onSteer: (steer) => { if (kartPad.tilt) { sendSteer(steer); kartPad.setWheelVisual(steer); } } });
const kartPad = createKartPad({
  haptics,
  root: $('kart-pad'),
  onButton: (button, state) => emit(EV.INPUT_BUTTON, { button, state }),
  onSteer: (steer) => { if (!kartPad.tilt) sendSteer(steer); },
  onTilt: (on) => { sendSteer(0); if (on && started) wheel.start(); else wheel.stop(); },
  onRecenter: () => { wheel.recenter(); emit(EV.INPUT_RECENTER); },
});

// The phone's screen turned (portrait <-> landscape): ask the console to learn the gyro axes again
const onTurned = () => { if (joined && started) emit(EV.INPUT_RECENTER, { relearn: true }); };
screen.orientation?.addEventListener('change', onTurned);
window.addEventListener('orientationchange', onTurned);

function applyMode() {
  if (!joined) return;
  // "Tap to start" belongs to the Remote tab: Photos, Music and Present stay reachable without it
  $('start').hidden = started || role !== 'player' || party.tab !== 'remote';
  // Guests have no controller: the kart pad and the keyboard are for players. Tabs other than Remote hide the controller.
  const isPlayer = role === 'player';
  const isKart = isPlayer && mode === 'wheel', isKeys = isPlayer && mode === 'keyboard', isBooth = mode === 'booth', isParty = mode === 'party'; // (the booth is for everyone, guests too)
  const wasKart = !$('kart-pad').hidden;
  party.setMode(isKart || isKeys ? mode : 'pointer');
  $('controller').hidden = isKart || isKeys || isBooth || isParty || !isPlayer || party.tab !== 'remote';
  $('booth-pad').hidden = !isBooth;
  $('party-pad').hidden = !isParty;
  if (!isParty) partyPad.reset();
  else clock.sync();
  $('bp-home').hidden = !isPlayer; // (guests have no buttons to press)
  $('kart-pad').hidden = !isKart;
  document.body.classList.toggle('kart-mode', isKart); // hides the top bar: the pad has its own
  $('keyboard-pad').hidden = !isKeys;
  if (isKeys) { $('keyboard-input').value = ''; $('keyboard-input').focus(); }
  if (isKart || isBooth || isParty) $('motion-msg').hidden = true; // (the kart pad, the booth and the party screen need no motion note: it would cover their buttons)
  if (isKart && !wasKart) kartPad.show();
  if (!isKart && wasKart) kartPad.hide();
  if (isKart && started && kartPad.tilt) wheel.start();
  else wheel.stop();
}

// The console says which layout to show. It repeats this every 2 s during a race, so only a
// real change does anything (repeating 'keyboard' must not wipe what you're typing).
let layoutInfo = { from: 'none', at: 0 }; // for the ?debug=1 readout
function setLayout({ mode: m, prompt } = {}, from = 'console') {
  const next = ['wheel', 'keyboard', 'booth', 'party'].includes(m) ? m : 'pointer';
  layoutInfo = { from, at: Date.now() };
  if (next === mode && (prompt || 'Type here') === $('keyboard-prompt').textContent) return;
  mode = next;
  $('keyboard-prompt').textContent = prompt || 'Type here';
  applyMode();
}
socket.on(EV.FEEDBACK_MODE, (layout) => setLayout(layout));

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
    $('motion-msg').hidden = mode === 'wheel'; // not over the kart pad
  }
  touchpad = motion.attachTouchpad($('touchpad'));
}

$('start-btn').addEventListener('click', async () => {
  unlockPhoneAudio(); // sound needs a tap to start, like motion
  $('start-btn').disabled = true;
  $('start-btn').textContent = 'Starting…';
  const result = await motion.start();
  started = true;
  motionOk = result.ok;
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
socket.on(EV.FEEDBACK_SETTINGS, (s) => {
  if (typeof s?.phoneSounds === 'boolean') phoneSounds = s.phoneSounds;
  followTheme(s?.theme);
});
socket.on(EV.FEEDBACK_RUMBLE, ({ ms, kind }) => {
  ms = Math.min(Number(ms) || 0, 1000);
  haptics.play(typeof kind === 'string' ? kind : '', ms); // (a named moment, or just a length; iPhones: nothing, silently)
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
      + `mode ${mode}  steer ${(kartPad.tilt ? wheel.stats.steer : kartPad.steer).toFixed(2)}${kartPad.tilt ? ' (tilt)' : ''}\n`
      + `layout from ${layoutInfo.from} ${layoutInfo.at ? `${((Date.now() - layoutInfo.at) / 1000).toFixed(0)} s ago` : '(never)'}  `
      + `showing ${['controller', 'kart-pad', 'keyboard-pad'].filter((id) => $(id).offsetParent).join(',') || 'none'}  ${screen.orientation?.type || ''}`;
  }, 100);
}
