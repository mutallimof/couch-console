// Console (laptop) entry point: socket, pairing/lobby, and the router menu <-> apps.
import { EV, colorFor } from '../shared/protocol.js';
import { players } from './players.js';
import { party } from './party.js';
import { socket } from './socket.js';
import { musicPlayer } from './music-hub.js';
import { createSlides } from './slides.js';
import { createPointers } from './pointer.js';
import { createGyroPointers } from './pointer/engine.js';
import { createMenu } from './menu.js';
import { createSettings } from './settings.js';
import { sound } from './sound.js';
import { playBoot } from './boot.js';
import { loadApps } from './apps.js';
import { applyTheme, normalizeChoice, resolveTheme, systemPrefersDark } from '../shared/theme.js';

const $ = (id) => document.getElementById(id);
// (The TV's debug readout is never turned on by the link: only by F3 or Settings on the TV itself, see below.)
// Boot animation (skip it with ?noboot=1)
const boot = new URLSearchParams(location.search).has('noboot') ? null : playBoot({ sound });
// Games and channels, from their .game.json files (each loads on its own; see apps.js).
// Loaded before connecting, so no server message can arrive before we're listening.
const gameApps = await loadApps();
const slides = createSlides({ socket, party });
const folders = await fetch('/js/console/folders.json').then((r) => r.json()).catch(() => ({}));
const icons = await fetch('/api/icons').then((r) => r.json()).catch(() => []);
const pointers = createPointers($('cursors'));
const gyro = createGyroPointers(); // phones' raw sensors -> cursor positions
const ZOOM_MS = 320;       // opening a game: the one big motion in the menu
const ZOOM_BACK_MS = 220;  // going back is quicker than opening
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MODE_LABELS = { solo: 'Solo', versus: 'Versus', coop: 'Co-op' };

// The "driver" controls the menu: P1, or the lowest-numbered player if P1 is away.
const driverId = () => players.list().reduce((min, p) => Math.min(min, p.playerId), Infinity);

// ---------- Pointer sensitivity (1 = slow ... 10 = fast) ----------
// How far you turn the phone to cross the screen (applied here, in pointer/engine.js).

let sensitivity = 5;
try { sensitivity = Number(localStorage.getItem('couch.sensitivity')) || 5; } catch { /* ignore */ }
gyro.setSpeed(sensitivity);
// Steady cursor: orientation only, for phones whose gyro makes the cursor wander
let steady = false;
try { steady = localStorage.getItem('couch.steadyCursor') === '1'; } catch { /* ignore */ }
gyro.setSteady(steady);

// Phone sounds: each phone plays a small sound when its own game feedback (rumble) arrives
let phoneSounds = true;
try { phoneSounds = localStorage.getItem('couch.phoneSounds') !== '0'; } catch { /* ignore */ }
const sendSettings = () => socket.emit(EV.FEEDBACK_SETTINGS, { phoneSounds, theme: resolvedTheme });

// Theme: Light / Dark / Auto (follows the laptop), remembered in this browser ("per console").
// ?theme=light|dark|auto forces a choice for this visit. The phones get the resolved value.
let themeChoice = 'auto';
try { themeChoice = normalizeChoice(new URLSearchParams(location.search).get('theme') || localStorage.getItem('couch.theme')); } catch { /* ignore */ }
let resolvedTheme = 'light';
function refreshTheme() {
  const next = applyTheme(resolveTheme(themeChoice, systemPrefersDark()));
  resolvedTheme = next;
  if (socket.connected) sendSettings();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => themeChoice === 'auto' && refreshTheme());
refreshTheme();

const prefs = {
  getSensitivity: () => sensitivity,
  setSensitivity(n) {
    sensitivity = n;
    try { localStorage.setItem('couch.sensitivity', String(n)); } catch { /* ignore */ }
    gyro.setSpeed(n);
  },
  getSteady: () => steady,
  setSteady(on) {
    steady = on;
    try { localStorage.setItem('couch.steadyCursor', on ? '1' : '0'); } catch { /* ignore */ }
    gyro.setSteady(on);
  },
  getTheme: () => themeChoice,
  setTheme(choice) {
    themeChoice = normalizeChoice(choice);
    try { localStorage.setItem('couch.theme', themeChoice); } catch { /* ignore */ }
    refreshTheme();
  },
  getPhoneSounds: () => phoneSounds,
  setPhoneSounds(on) {
    phoneSounds = on;
    try { localStorage.setItem('couch.phoneSounds', on ? '1' : '0'); } catch { /* ignore */ }
    sendSettings();
  },
  getDebug: () => debugOn,
  setDebug: (on) => setDebug(on),
  showQR: () => setPairing(true),
};

// ---------- Menu ----------

const apps = [...gameApps, createSettings(prefs)]; // Settings is built in, always last
const menu = createMenu({
  grid: $('tiles'), clock: $('clock'), date: $('date'), crumb: $('crumb'), apps, folders, icons,
  onFocusChange: (column) => sound.play('hover', { step: column }),
});

// ---------- Pairing / lobby ----------
// The big pairing screen shows when no phone is connected (or from Settings -> Show QR).
// While someone is playing, a small QR in the menu bar lets another phone join.

let pairingForced = false;
function setPairing(forced = pairingForced) {
  pairingForced = forced;
  const none = players.list().length === 0;
  const wasShown = !$('pairing').hidden;
  $('pairing').hidden = !(forced || (none && !current?.mounted)); // a running game shows its own pause screen
  if (wasShown && $('pairing').hidden && !current) menu.enter(); // the menu appears: tiles rise in
  $('pairing-close').hidden = !(forced && !none);
  $('mini-join').hidden = none; // (guests are unlimited, so the QR stays: the next person can always join)
}

// Who is here besides the players (shown on the pairing screen)
function renderGuests() {
  const guests = party.people.filter((p) => p.online && p.role === 'guest');
  $('guest-list').hidden = !guests.length;
  $('guest-list').textContent = guests.length ? `Also here: ${guests.map((g) => `${g.emoji} ${g.name}`).join('  ·  ')}` : '';
}

// A new room is created on every (re)connect, e.g. after the server restarts.
function onConnect() {
  $('status').textContent = '';
  players.clear();
  if (desk.active) players.join(desk.id, colorFor(desk.id)); // still playing with the mouse
  socket.emit(EV.CONSOLE_CREATE, (res) => {
    party.setRoom(res);
    showRoom(res.room);
    sendSettings(); // (the phones' theme, for those who join later it is also in their join answer)
    party.call('GET', '/music').then((s) => musicPlayer.onState(s)).catch(() => {}); // (a song may already be queued)
    slides.init(); // (a presentation may already be running)
  });
}
socket.on('connect', onConnect);

socket.on('disconnect', () => {
  $('status').textContent = 'Lost connection to the server. Is `npm start` still running?';
  players.clear();
});

socket.on(EV.PLAYER_JOINED, ({ playerId, color }) => {
  if (desk.active) desk.stop(); // a real phone takes over from the mouse
  const isNew = !players.isConnected(playerId);
  players.join(playerId, color);
  if (isNew) sound.play('join');
  sendSettings(); // so the new phone knows whether to play sounds
  socket.emit(EV.FEEDBACK_MODE, { mode: controllerMode, prompt: controllerPrompt }); // and the right controller layout
  playerReturned(playerId);
  // A new phone joining a running multi-player game (not solo) gets let in, if there's room.
  if (current?.mounted && current.mode !== 'solo' && current.app.maxPlayers > current.allowed.size) {
    current.allowed.add(playerId);
  }
});
socket.on(EV.PARTY_ROSTER, (r) => { party.onRoster(r); renderGuests(); });
socket.on(EV.PARTY_ACTIVITY, ({ entry }) => party.emitActivity(entry)); // (shown as a note on the TV; the Activity tab is on the phones)
socket.on(EV.PARTY_PHOTO, (e) => party.emitPhoto(e));
socket.on(EV.MUSIC_STATE, (s) => musicPlayer.onState(s));
socket.on(EV.PRESENT_DECK, (e) => { party.emitDeck(e); if (e.kind !== 'removed') slides.processDeck(e.deck); }); // (PDFs: count the pages, make little pictures)
socket.on(EV.PRESENT_MOTION, (e) => { if ([e.alpha, e.beta, e.gamma].every(Number.isFinite)) gyro.feed('laser', { alpha: e.alpha, beta: e.beta, gamma: e.gamma, motion: e.motion && [e.motion.rx, e.motion.ry, e.motion.rz].every(Number.isFinite) ? e.motion : null }); });
socket.on(EV.PLAYER_LEFT, ({ playerId }) => {
  players.leave(playerId);
  sound.play('leave');
  pointers.remove(playerId);
  gyro.remove(playerId);
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
    // A phone can't open "localhost" (that's the phone itself): say what to do instead
    $('join-warning').hidden = !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url);
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
    <span class="ui-chip ${s.connected ? 'on' : 'off'}" style="--player:${s.color}">P${s.playerId}</span>`).join('');
}

players.onChange(() => {
  renderSlots();
  setPairing();
  // The focus ring shows who's driving the menu
  const id = driverId();
  document.documentElement.style.setProperty('--ring', Number.isFinite(id) ? colorFor(id) : 'var(--c-focus)');
});

// ---------- Opening and closing apps (tile zoom) ----------
// current = { app, handlers, allowed: Set<playerId>, missing: Set<playerId>, mounted }

let current = null;
slides.setGameOpen(() => !!current && current.app.id !== 'present'); // (a running game covers the slides)
// Phones show the normal remote ('pointer'), a steering wheel ('wheel') or a text box ('keyboard')
let controllerMode = 'pointer', controllerPrompt = '';
function setController(mode, prompt = '') {
  if (mode !== controllerMode) gyro.relearnAll(); // turning the phone for the kart pad (and back) must not leave a stale gyro map
  controllerMode = mode;
  controllerPrompt = prompt;
  socket.emit(EV.FEEDBACK_MODE, { mode, prompt });
  // No phone to type on? Ask on the laptop instead.
  if (mode === 'keyboard' && desk.active) {
    setTimeout(() => onInputText({ playerId: desk.id, text: (window.prompt(prompt || 'Type here') || '').trim() }), 50);
  }
}
// Say it again every 2 s while a game uses a special layout: a phone that missed the message
// (Wi-Fi hiccup, the browser paused the page for a moment) switches over by itself.
setInterval(() => { if (controllerMode !== 'pointer') socket.emit(EV.FEEDBACK_MODE, { mode: controllerMode, prompt: controllerPrompt }); }, 2000);
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
  current = { app, handlers: { button: new Set(), pointer: new Set(), swing: new Set(), wheel: new Set(), text: new Set() }, allowed: new Set(), missing: new Set(), mounted: false };
  stage.style.setProperty('--tile', app.color);
  // Games (not the hubs and channels) pause the party music, unless Settings -> Party says otherwise
  musicPlayer.setGameActive(!['music', 'photos', 'present', 'settings'].includes(app.id) && app.folder !== 'channels');
  queueMicrotask(() => slides.refresh()); // (a running game covers the slides)
  menu.press();
  stage.hidden = false;
  const anim = REDUCED_MOTION
    ? stage.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'ease' })
    : stage.animate(
      [{ clipPath: tileClip(menu.focusedTile()) }, { clipPath: 'inset(0px 0px 0px 0px round 0px)' }],
      { duration: ZOOM_MS, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' },
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
  if (controllerMode !== 'pointer') setController('pointer');
  musicPlayer.setGameActive(false);
  queueMicrotask(() => slides.refresh());
  pointers.setStyle('arrow');
  hidePicker();
  hidePause();
  $('stage-content').innerHTML = '';
  current = null;
  const stage = $('stage');
  const anim = REDUCED_MOTION
    ? stage.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'ease' })
    : stage.animate(
      [{ clipPath: 'inset(0px 0px 0px 0px round 0px)' }, { clipPath: tileClip(menu.focusedTile()) }],
      { duration: ZOOM_BACK_MS, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
    );
  anim.onfinish = () => { stage.hidden = true; busy = false; setPairing(); };
}

// The `api` object every game gets in mount(). See docs/PLAN.md, Phase 4.
function makeApi(cur, mode) {
  const { handlers, allowed } = cur;
  return {
    mode, // 'solo' | 'versus' | 'coop' | 'free'
    // The players taking part in this game (connected ones only).
    get players() { return players.list().filter((p) => allowed.has(p.playerId)); },
    onButton: (fn) => handlers.button.add(fn),
    onPointer: (fn) => handlers.pointer.add(fn),
    onSwing: (fn) => handlers.swing.add(fn),
    onWheel: (fn) => handlers.wheel.add(fn),          // { playerId, steer: -1..1 }
    onText: (fn) => handlers.text.add(fn),            // { playerId, text } typed on a phone
    setController,                                    // 'wheel' for driving games, 'keyboard' to type
    setCursor: (style) => pointers.setStyle(style),   // 'crosshair' for aiming games
    // Smoothed cursor position in screen pixels (the stage fills the screen).
    pointer: (playerId) => pointers.position(playerId),
    rumble: (playerId, ms) => socket.emit(EV.FEEDBACK_RUMBLE, { playerId, ms }),
    sound,
    // Tell the activity feed a player won ("Cem won Turbo Karts")
    reportWin: (playerId) => socket.emit(EV.ACTIVITY_GAME, { playerId, game: cur.app.title, what: 'won' }),
    exit: closeApp,
  };
}

// ---------- Mode picker (Solo / Versus / Co-op) ----------

function showPicker(modes) {
  picker = { modes, index: 0 };
  $('picker').hidden = false;
  $('picker-title').textContent = current.app.title;
  $('picker-modes').innerHTML = modes.map((m, i) =>
    `<div class="mode ui-focus" data-mode="${i}">${MODE_LABELS[m] || m}</div>`).join('');
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

function onInputPointer(e) {
  count(e.playerId);
  if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) return;
  pointers.move(e.playerId, e.x, e.y, colorFor(e.playerId), e.direct === true);
  if (gameGets(e.playerId)) current.handlers.pointer.forEach((fn) => fn(e));
}
socket.on(EV.INPUT_POINTER, onInputPointer);

// Raw phone sensors: the gyro pointer turns them into a cursor (drawn every frame below)
const finite = (v) => Number.isFinite(v);
socket.on(EV.INPUT_MOTION, (e) => {
  count(e.playerId);
  if (!finite(e.alpha) || !finite(e.beta) || !finite(e.gamma)) return;
  const m = e.motion;
  const motion = m && finite(m.rx) && finite(m.ry) && finite(m.rz) ? { rx: m.rx, ry: m.ry, rz: m.rz } : null;
  gyro.feed(e.playerId, { alpha: e.alpha, beta: e.beta, gamma: e.gamma, motion });
});
(function gyroLoop(now) {
  for (const { playerId, x, y } of gyro.frame(now)) {
    if (playerId === 'laser') { slides.laser(x, y); continue; } // (the presenter's laser dot, not a cursor)
    pointers.move(playerId, x * 2 - 1, y * 2 - 1, colorFor(playerId), true);
  }
  requestAnimationFrame(gyroLoop);
})(performance.now());

socket.on(EV.INPUT_SWING, (e) => {
  count(e.playerId);
  if (gameGets(e.playerId)) current.handlers.swing.forEach((fn) => fn(e));
});

socket.on(EV.INPUT_WHEEL, (e) => {
  count(e.playerId);
  if (!Number.isFinite(e.steer)) return;
  if (gameGets(e.playerId)) current.handlers.wheel.forEach((fn) => fn(e));
});

function onInputText(e) {
  if (typeof e.text !== 'string') return;
  if (gameGets(e.playerId)) current.handlers.text.forEach((fn) => fn({ playerId: e.playerId, text: e.text.slice(0, 100) }));
}
socket.on(EV.INPUT_TEXT, onInputText);

socket.on(EV.INPUT_RECENTER, (e) => { count(e.playerId); gyro.recenter(e.playerId, !!e.relearn); }); // relearn: the phone's screen turned

function onInputButton(e) {
  count(e.playerId);
  if (boot?.playing) { boot.skip(); return; } // any phone button skips the boot animation
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
  // While slides are on screen the remote turns pages: A / RIGHT next, LEFT back, B black screen, HOME ends the show
  if (slides.active && !slides.el.hidden) {
    if (down) {
      if (button === 'HOME') slides.end();
      else if (button === 'A' || button === 'RIGHT' || button === 'DOWN') slides.next();
      else if (button === 'LEFT' || button === 'UP') slides.prev();
      else if (button === 'B') slides.black();
    }
    return;
  }
  // HOME always goes back to the menu (only the driver opens and closes things).
  if (button === 'HOME') {
    if (down && isDriver) { if (!current && menu.back()) sound.play('back'); else closeApp(); }
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
  else if (button === 'A') pressTile();
  else if (button === 'B' && menu.back()) sound.play('back');
}

// A on the focused tile: a game opens, a folder opens as its own screen
function pressTile() {
  const tile = menu.focusedApp();
  if (!tile) return;
  if (tile.isFolder) { menu.press(); menu.openFolder(tile.id); sound.play('select'); return; }
  openApp(tile);
}
socket.on(EV.INPUT_BUTTON, onInputButton);

// Aim assist: only on menu tiles and the mode picker, never inside a game.
pointers.setAssist((x, y) => {
  if (busy || !$('pairing').hidden || (current && !picker)) return null;
  const el = document.elementFromPoint(x, y)?.closest?.(picker ? '[data-mode]' : '.menu [data-focus]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.hypot(r.width, r.height) / 2 };
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

// ---------- Mouse & keyboard (no phone) ----------
// "Use mouse & keyboard" on the pairing screen adds a stand-in P1 that sends exactly what a
// phone would: mouse = pointer, click = A, right-click = B, arrows = D-pad, Enter/Space = A,
// Esc/Backspace = B, H = HOME, + / - = PLUS / MINUS, U = ITEM (UP) and R/Shift = DRIFT for karts.
const KEYS = {
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', Enter: 'A', ' ': 'A',
  Escape: 'B', Backspace: 'B', h: 'HOME', H: 'HOME', '+': 'PLUS', '=': 'PLUS', '-': 'MINUS', u: 'UP', U: 'UP',
  r: 'R', R: 'R', Shift: 'R', // DRIFT in Turbo Karts
};
const desk = {
  active: false,
  id: 1,
  start() {
    this.active = true;
    this.id = 1;
    document.body.classList.add('desk-mode');
    players.join(this.id, colorFor(this.id));
    sound.play('join');
  },
  stop() {
    this.active = false;
    document.body.classList.remove('desk-mode');
    players.leave(this.id);
    pointers.remove(this.id);
  },
};
const deskButton = (button, state) => desk.active && onInputButton({ playerId: desk.id, button, state });
$('use-mouse').addEventListener('click', (e) => { e.stopPropagation(); unlockSound(); desk.start(); });
addEventListener('mousemove', (e) => {
  if (!desk.active) return;
  // direct: a mouse is already precise, so it's drawn without the touchpad smoothing
  onInputPointer({ playerId: desk.id, x: (e.clientX / innerWidth) * 2 - 1, y: (e.clientY / innerHeight) * 2 - 1, direct: true });
});
addEventListener('mousedown', (e) => { if (e.button === 0) deskButton('A', 'down'); else if (e.button === 2) deskButton('B', 'down'); });
addEventListener('mouseup', (e) => { if (e.button === 0) deskButton('A', 'up'); else if (e.button === 2) deskButton('B', 'up'); });
addEventListener('contextmenu', (e) => { if (desk.active) e.preventDefault(); });
addEventListener('keydown', (e) => {
  const button = KEYS[e.key];
  if (!desk.active || !button) return;
  e.preventDefault();
  if (!e.repeat) deskButton(button, 'down');
});
addEventListener('keyup', (e) => { const button = KEYS[e.key]; if (button) deskButton(button, 'up'); });

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

// ---------- Debug readout (F3 or Settings on the TV) ----------

let debugOn = false;
try { debugOn = localStorage.getItem('couch.debugReadout') === '1'; } catch { /* ignore */ }
const debugBox = $('debug');
let debugTimers = [], frameCounter = 0;
function setDebug(on) {
  debugOn = on;
  try { localStorage.setItem('couch.debugReadout', on ? '1' : '0'); } catch { /* ignore */ }
  debugBox.hidden = !on;
  debugTimers.forEach(clearInterval);
  debugTimers = [];
  if (!on) return;
  let pingMs = '…';
  // Round trip laptop -> server -> laptop (through the tunnel if opened via it).
  // The phone's debug view shows its own ping; total input delay ≈ both added up.
  debugTimers.push(setInterval(async () => {
    const t0 = performance.now();
    try {
      await fetch('/ping', { cache: 'no-store' });
      pingMs = Math.round(performance.now() - t0);
    } catch { pingMs = 'err'; }
  }, 2000));
  // Frames per second the laptop actually draws (below ~50 = the laptop is struggling)
  let last = frameCounter;
  debugTimers.push(setInterval(() => {
    const fps = frameCounter - last; last = frameCounter;
    const rates = players.list().map((p) => `P${p.playerId} ${msgCount.get(p.playerId) || 0} msgs/s`);
    msgCount.clear();
    debugBox.textContent = `latency (ping) ${pingMs} ms   screen ${fps} fps${current ? `   in ${current.app.title}` : ''}\n`
      + `${rates.join('\n') || 'no players'}\n`
      + `${gyro.describe().join('\n')}\nL = cursor prediction on/off · G = steady cursor · F3 = hide this`;
  }, 1000));
}
(function countFrames() { frameCounter++; requestAnimationFrame(countFrames); })();
addEventListener('keydown', (e) => {
  if (e.key === 'F3') { e.preventDefault(); setDebug(!debugOn); return; }
  if (!debugOn) return;
  if (e.key === 'l' || e.key === 'L') gyro.toggleLead(); // A/B test the cursor prediction ("display lead")
  if (e.key === 'g' || e.key === 'G') prefs.setSteady(!prefs.getSteady()); // steady cursor on/off
});
setDebug(debugOn);

// The connection may already be up (it starts while the games load): then 'connect' came too early to hear
if (socket.connected) onConnect();
