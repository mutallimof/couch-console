// Console (laptop) entry point: socket, pairing overlay, and the router menu <-> apps.
import { EV, colorFor } from '../shared/protocol.js';
import { players } from './players.js';
import { createPointers } from './pointer.js';
import { createMenu } from './menu.js';
import { createSettings } from './settings.js';
import { sound } from './sound.js';
import balloonPop from './games/balloon-pop.js';
import draw from './games/draw.js';

const $ = (id) => document.getElementById(id);
const socket = io(); // global from /socket.io/socket.io.js
const DEBUG = new URLSearchParams(location.search).has('debug');
const pointers = createPointers($('cursors'));
const ZOOM_MS = 300;

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

const apps = [balloonPop, draw, createSettings(prefs)];
const menu = createMenu({
  grid: $('tiles'), clock: $('clock'), date: $('date'), apps,
  onFocusChange: () => sound.play('hover'),
});

// ---------- Pairing overlay ----------
// Shown when no phone is connected, or when "Show QR" is chosen in Settings.

let pairingForced = false;
function setPairing(forced = pairingForced) {
  pairingForced = forced;
  const show = forced || players.list().length === 0;
  $('pairing').hidden = !show;
  $('pairing-close').hidden = !(forced && players.list().length > 0);
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
});
socket.on(EV.PLAYER_LEFT, ({ playerId }) => {
  players.leave(playerId);
  pointers.remove(playerId);
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

players.onChange(() => { renderSlots(); setPairing(); });
renderSlots();
setPairing();

// ---------- Opening and closing apps (tile zoom) ----------

let current = null;   // { app, handlers } while an app is open
let busy = false;     // true during the zoom animation

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
  const handlers = { button: new Set(), pointer: new Set(), swing: new Set() };
  current = { app, handlers };
  stage.style.setProperty('--tile', app.color);
  stage.hidden = false;
  const anim = stage.animate(
    [{ clipPath: tileClip(menu.focusedTile()) }, { clipPath: 'inset(0px 0px 0px 0px round 0px)' }],
    { duration: ZOOM_MS, easing: 'cubic-bezier(.2,.8,.2,1)' },
  );
  anim.onfinish = () => {
    busy = false;
    app.mount($('stage-content'), makeApi(handlers));
  };
}

function closeApp() {
  if (busy || !current) return;
  busy = true;
  sound.play('back');
  current.app.unmount();
  $('stage-content').innerHTML = '';
  current = null;
  const stage = $('stage');
  const anim = stage.animate(
    [{ clipPath: 'inset(0px 0px 0px 0px round 0px)' }, { clipPath: tileClip(menu.focusedTile()) }],
    { duration: ZOOM_MS, easing: 'cubic-bezier(.2,.8,.2,1)' },
  );
  anim.onfinish = () => { stage.hidden = true; busy = false; };
}

// The `api` object every game gets in mount(). See PLAN.md, Phase 4.
function makeApi(handlers) {
  return {
    get players() { return players.list(); },
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

// ---------- Input routing ----------

const msgCount = new Map(); // playerId -> messages this second (debug)
const count = (playerId) => msgCount.set(playerId, (msgCount.get(playerId) || 0) + 1);

socket.on(EV.INPUT_POINTER, (e) => {
  count(e.playerId);
  if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) return;
  pointers.move(e.playerId, e.x, e.y, colorFor(e.playerId));
  current?.handlers.pointer.forEach((fn) => fn(e));
});

socket.on(EV.INPUT_SWING, (e) => {
  count(e.playerId);
  current?.handlers.swing.forEach((fn) => fn(e));
});

socket.on(EV.INPUT_RECENTER, (e) => count(e.playerId));

socket.on(EV.INPUT_BUTTON, (e) => {
  count(e.playerId);
  const { button, state } = e;
  const down = state === 'down';

  // The QR overlay opened from Settings: A, B or HOME closes it.
  if (pairingForced) {
    if (down && ['A', 'B', 'HOME'].includes(button)) { setPairing(false); sound.play('back'); }
    return;
  }
  // HOME always goes back to the menu.
  if (button === 'HOME') {
    if (down) closeApp();
    return;
  }
  if (busy) return;
  if (current) {
    current.handlers.button.forEach((fn) => fn(e));
    return;
  }
  // In the menu
  if (!down) return;
  if (['UP', 'DOWN', 'LEFT', 'RIGHT'].includes(button)) menu.move(button);
  // Open the focused tile (moving the cursor over a tile focuses it, see below).
  else if (button === 'A') openApp(menu.focusedApp());
});

// While the menu is showing, hovering a tile with the cursor focuses it.
// Only when the cursor actually moves, so it doesn't fight with the D-pad.
const lastHover = new Map();
(function hoverLoop() {
  if (!current && !busy && $('pairing').hidden) {
    for (const p of players.list()) {
      const pos = pointers.position(p.playerId);
      const prev = lastHover.get(p.playerId);
      if (pos && (!prev || Math.hypot(pos.x - prev.x, pos.y - prev.y) > 1)) {
        lastHover.set(p.playerId, pos);
        menu.hover(pointers.elementAt(p.playerId));
      }
    }
  }
  requestAnimationFrame(hoverLoop);
})();

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
