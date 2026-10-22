// Console (laptop) entry point: socket, pairing/lobby, and the router menu <-> apps.
import { EV, colorFor } from '../shared/protocol.js';
import { players } from './players.js';
import { createPointers } from './pointer.js';
import { createMenu } from './menu.js';
import { createSettings } from './settings.js';
import { sound } from './sound.js';
import balloonPop from './games/balloon-pop.js';
import draw from './games/draw.js';
import paddleDuel from './games/paddle-duel.js';
import bowling from './games/bowling.js';

const $ = (id) => document.getElementById(id);
const socket = io(); // global from /socket.io/socket.io.js
const DEBUG = new URLSearchParams(location.search).has('debug');
const pointers = createPointers($('cursors'));
const ZOOM_MS = 300;
const MODE_LABELS = { solo: 'Solo', versus: 'Versus', coop: 'Co-op' };

// The "driver" controls the menu: P1, or the lowest-numbered player if P1 is away.
const driverId = () => players.list().reduce((min, p) => Math.min(min, p.playerId), Infinity);

// ---------- Pointer sensitivity (1 = slow ... 10 = fast) ----------
// Sent to the phones as the tilt (in degrees) needed to sweep the whole screen.

let sensitivity = 5;
try { sensitivity = Number(localStorage.getItem('couch.sensitivity')) || 5; } catch { /* ignore */ }

function sendSettings() {
  const f = 1.2 ** (5 - sensitivity); // level 5 = PLAN defaults (25° x 18°)
  socket.emit(EV.FEEDBACK_SETTINGS, { rangeX: 25 * f, rangeY: 18 * f });
}

const prefs = {
  getSensitivity: () => sensitivity,
  setSensitivity(n) {
    sensitivity = n;
    try { localStorage.setItem('couch.sensitivity', String(n)); } catch { /* ignore */ }
    sendSettings();
  },
  showQR: () => setPairing(true),
};

// ---------- Menu ----------

const apps = [balloonPop, draw, paddleDuel, bowling, createSettings(prefs)];
const menu = createMenu({
  grid: $('tiles'), clock: $('clock'), date: $('date'), apps,
  onFocusChange: () => sound.play('hover'),
});

// ---------- Pairing / lobby ----------
// The big pairing screen shows when no phone is connected (or from Settings -> Show QR).
// While someone is playing, a small QR in the menu bar lets another phone join.

let pairingForced = false;
function setPairing(forced = pairingForced) {
  pairingForced = forced;
  const none = players.list().length === 0;
  $('pairing').hidden = !(forced || (none && !current?.mounted)); // a running game shows its own pause screen
  $('pairing-close').hidden = !(forced && !none);
  const full = players.slots().every((s) => s.connected);
  $('mini-join').hidden = full || none;
}

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
  sendSettings(); // so the new phone uses the current pointer speed
  playerReturned(playerId);
  // A new phone joining a running multi-player game (not solo) gets let in, if there's room.
  if (current?.mounted && current.mode !== 'solo' && current.app.maxPlayers > current.allowed.size) {
    current.allowed.add(playerId);
  }
});
socket.on(EV.PLAYER_LEFT, ({ playerId }) => {
  players.leave(playerId);
  pointers.remove(playerId);
  playerLost(playerId);
});

async function showRoom(room) {
  $('room-code').textContent = room;
  $('mini-room').textContent = room;
  $('qr').hidden = true;
  $('qr-loading').hidden = false;
  try {
    const res = await fetch(`/qr?room=${room}`);
    const { url, dataUrl } = await res.json();
    for (const img of document.querySelectorAll('.qr-img')) img.src = dataUrl;
    $('qr').hidden = false;
    $('qr-loading').hidden = true;
    $('join-url').textContent = url;
  } catch (err) {
    $('qr-loading').textContent = 'Could not load the QR code.';
    console.error(err);
  }
}

function renderSlots() {
  const html = players.slots().map((s) => `
    <div class="slot ${s.connected ? 'connected' : ''}" style="--player:${s.color}">
      <div class="slot-badge">P${s.playerId}</div>
      <div class="slot-state">${s.connected ? 'Connected' : 'Waiting…'}</div>
    </div>`).join('');
  $('slots').innerHTML = html;
  $('bar-players').innerHTML = players.slots().map((s) => `
    <span class="chip ${s.connected ? 'on' : ''}" style="--player:${s.color}">P${s.playerId}</span>`).join('');
}

players.onChange(() => { renderSlots(); setPairing(); });

// ---------- Opening and closing apps (tile zoom) ----------
// current = { app, handlers, allowed: Set<playerId>, missing: Set<playerId>, mounted }

let current = null;
let busy = false;    // true during the zoom animation
let picker = null;   // { modes, index } while the mode picker is showing

// clip-path that matches a tile's rectangle (used to zoom from/to it).
function tileClip(tile) {
  const r = tile.getBoundingClientRect();
  return `inset(${r.top}px ${innerWidth - r.right}px ${innerHeight - r.bottom}px ${r.left}px round 16px)`;
}

function openApp(app) {
  if (busy || current) return;
  busy = true;
  sound.play('select');
  const stage = $('stage');
  current = { app, handlers: { button: new Set(), pointer: new Set(), swing: new Set() }, allowed: new Set(), missing: new Set(), mounted: false };
  stage.style.setProperty('--tile', app.color);
  stage.hidden = false;
  const anim = stage.animate(
    [{ clipPath: tileClip(menu.focusedTile()) }, { clipPath: 'inset(0px 0px 0px 0px round 0px)' }],
    { duration: ZOOM_MS, easing: 'cubic-bezier(.2,.8,.2,1)' },
  );
  anim.onfinish = () => {
    busy = false;
    // A 2-player game with 2 phones connected: ask which mode first.
    const modes = app.modes || [];
    if (modes.length > 1 && app.maxPlayers >= 2 && players.list().length >= 2) showPicker(modes);
    // No picker: 'solo' if only one phone is here, else the game's first mode,
    // or 'free' (everyone plays) for multi-player apps without modes, like Draw.
    else if (modes.includes('solo') && players.list().length < 2) startApp('solo');
    else startApp(modes[0] || (app.maxPlayers > 1 ? 'free' : 'solo'));
  };
}

function startApp(mode) {
  const { app } = current;
  // Solo / 1-player apps only listen to the driver; others take everyone (up to maxPlayers).
  const ids = players.list().map((p) => p.playerId).sort((a, b) => a - b);
  const allowed = mode === 'solo' || app.maxPlayers === 1 ? [driverId()] : ids.slice(0, app.maxPlayers);
  current.allowed = new Set(allowed);
  current.mode = mode;
  current.mounted = true;
  app.mount($('stage-content'), makeApi(current, mode));
}

function closeApp() {
  if (busy || !current) return;
  busy = true;
  sound.play('back');
  if (current.mounted) current.app.unmount();
  hidePicker();
  hidePause();
  $('stage-content').innerHTML = '';
  current = null;
  const stage = $('stage');
  const anim = stage.animate(
    [{ clipPath: 'inset(0px 0px 0px 0px round 0px)' }, { clipPath: tileClip(menu.focusedTile()) }],
    { duration: ZOOM_MS, easing: 'cubic-bezier(.2,.8,.2,1)' },
  );
  anim.onfinish = () => { stage.hidden = true; busy = false; setPairing(); };
}

// The `api` object every game gets in mount(). See PLAN.md, Phase 4.
function makeApi(cur, mode) {
  const { handlers, allowed } = cur;
  return {
    mode, // 'solo' | 'versus' | 'coop' | 'free'
    // The players taking part in this game (connected ones only).
    get players() { return players.list().filter((p) => allowed.has(p.playerId)); },
    onButton: (fn) => handlers.button.add(fn),
    onPointer: (fn) => handlers.pointer.add(fn),
    onSwing: (fn) => handlers.swing.add(fn),
    // Smoothed cursor position in screen pixels (the stage fills the screen).
    pointer: (playerId) => pointers.position(playerId),
    rumble: (playerId, ms) => socket.emit(EV.FEEDBACK_RUMBLE, { playerId, ms }),
    sound,
    exit: closeApp,
  };
}

// ---------- Mode picker (Solo / Versus / Co-op) ----------

function showPicker(modes) {
  picker = { modes, index: 0 };
  $('picker').hidden = false;
  $('picker-title').textContent = current.app.title;
  $('picker-modes').innerHTML = modes.map((m, i) =>
    `<div class="mode" data-mode="${i}">${MODE_LABELS[m] || m}</div>`).join('');
  renderPicker();
}
function renderPicker() {
  $('picker-modes').querySelectorAll('.mode').forEach((el, i) => el.classList.toggle('focused', i === picker.index));
}
function hidePicker() {
  picker = null;
  $('picker').hidden = true;
}
function pickerButton(button) {
  if (button === 'LEFT' || button === 'UP') picker.index = (picker.index + picker.modes.length - 1) % picker.modes.length;
  else if (button === 'RIGHT' || button === 'DOWN') picker.index = (picker.index + 1) % picker.modes.length;
  else if (button === 'A') {
    const mode = picker.modes[picker.index];
    hidePicker();
    sound.play('select');
    return startApp(mode);
  } else if (button === 'B') return closeApp();
  else return;
  sound.play('hover');
  renderPicker();
}

// ---------- Pause when a player's phone drops mid-game ----------

function playerLost(playerId) {
  if (!current?.mounted || !current.allowed.has(playerId)) return setPairing();
  current.missing.add(playerId);
  current.app.pause?.();
  const names = [...current.missing].sort().map((id) => `P${id}`).join(' & ');
  $('pause-text').textContent = `${names} disconnected: scan again or press B to quit`;
  $('pause').hidden = false;
}

function playerReturned(playerId) {
  if (!current?.missing.has(playerId)) return;
  current.missing.delete(playerId);
  if (current.missing.size === 0) {
    hidePause();
    current.app.resume?.();
    sound.play('start');
  } else {
    playerLost([...current.missing][0]); // refresh the text
  }
}

function hidePause() { $('pause').hidden = true; }

// ---------- Input routing ----------

const msgCount = new Map(); // playerId -> messages this second (debug)
const count = (playerId) => msgCount.set(playerId, (msgCount.get(playerId) || 0) + 1);
// Only players in the current game get its input (and not while it's paused).
const gameGets = (playerId) => current?.mounted && current.missing.size === 0 && current.allowed.has(playerId);

socket.on(EV.INPUT_POINTER, (e) => {
  count(e.playerId);
  if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) return;
  pointers.move(e.playerId, e.x, e.y, colorFor(e.playerId));
  if (gameGets(e.playerId)) current.handlers.pointer.forEach((fn) => fn(e));
});

socket.on(EV.INPUT_SWING, (e) => {
  count(e.playerId);
  if (gameGets(e.playerId)) current.handlers.swing.forEach((fn) => fn(e));
});

socket.on(EV.INPUT_RECENTER, (e) => count(e.playerId));

socket.on(EV.INPUT_BUTTON, (e) => {
  count(e.playerId);
  const { playerId, button, state } = e;
  const down = state === 'down';
  const isDriver = playerId === driverId();

  // The QR screen opened from Settings: A, B or HOME closes it.
  if (pairingForced) {
    if (down && isDriver && ['A', 'B', 'HOME'].includes(button)) { setPairing(false); sound.play('back'); }
    return;
  }
  // Paused because a phone dropped: anyone still here can press B to quit.
  if (current?.missing.size) {
    if (down && (button === 'B' || button === 'HOME')) closeApp();
    return;
  }
  // HOME always goes back to the menu (only the driver opens and closes things).
  if (button === 'HOME') {
    if (down && isDriver) closeApp();
    return;
  }
  if (busy) return;
  if (picker) {
    if (down && isDriver) pickerButton(button);
    return;
  }
  if (current) {
    if (gameGets(playerId)) current.handlers.button.forEach((fn) => fn(e));
    return;
  }
  // In the menu: only the driver.
  if (!down || !isDriver) return;
  if (['UP', 'DOWN', 'LEFT', 'RIGHT'].includes(button)) menu.move(button);
  // Open the focused tile (moving the cursor over a tile focuses it, see below).
  else if (button === 'A') openApp(menu.focusedApp());
});

// The driver's cursor focuses whatever it hovers (menu tiles, picker modes).
// Only when the cursor actually moves, so it doesn't fight with the D-pad.
let lastHover = null;
(function hoverLoop() {
  const id = driverId();
  const pos = Number.isFinite(id) && pointers.position(id);
  const moved = pos && (!lastHover || Math.hypot(pos.x - lastHover.x, pos.y - lastHover.y) > 1);
  if (moved && !busy && $('pairing').hidden) {
    lastHover = pos;
    const el = pointers.elementAt(id);
    if (picker) {
      const mode = el?.closest?.('[data-mode]');
      if (mode && Number(mode.dataset.mode) !== picker.index) {
        picker.index = Number(mode.dataset.mode);
        sound.play('hover');
        renderPicker();
      }
    } else if (!current) {
      menu.hover(el);
    }
  }
  requestAnimationFrame(hoverLoop);
})();

renderSlots();
setPairing();

// ---------- Sound unlock ----------
// Browsers block sound until the page itself is clicked once.

function unlockSound() {
  sound.unlock();
  $('sound-hint').hidden = true;
}
addEventListener('pointerdown', unlockSound);
addEventListener('keydown', unlockSound);

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
