// Timer channel: a big clock, a countdown timer and a stopwatch, readable from the couch.
// Works offline. Handy for turn timers, board games, cooking or a break between races.
//   ◀ ▶ = Clock / Timer / Stopwatch · A = start / pause · B = back to the menu
//   Timer: ▲ ▼ = ±1 minute · + / − = ±10 seconds (once started: − = reset)
//   Stopwatch: + = lap · − = reset
// When the timer runs out, the screen flashes, it chimes and every phone buzzes.
import { formatTime, createCountdown, createStopwatch } from './timer-logic.js';

const MODES = ['Clock', 'Timer', 'Stopwatch'];
const KEY = 'couch.timer';
const RING = 2 * Math.PI * 180; // the progress ring's length (radius 180)

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round">
  <path d="M19 4h10M24 4v5"/><circle cx="24" cy="27" r="16"/><path d="M24 27l7-7"/>
</svg>`;

let api, root, mode, timer, watch, frame, alarm, alarmEnd;
const now = () => performance.now();
const started = () => timer.running || timer.remaining() < timer.length; // running, paused or done

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ mode, length: timer.length })); } catch { /* ignore */ }
}

function hint() {
  if (mode === 0) return '◀ ▶ mode · B menu';
  if (mode === 1) {
    if (timer.done) return 'A stop · B menu';
    return started() ? `A ${timer.running ? 'pause' : 'go on'} · − reset · ◀ ▶ mode · B menu` : 'A start · ▲ ▼ minutes · + − seconds · ◀ ▶ mode · B menu';
  }
  return `A ${watch.running ? 'pause' : 'start'} · + lap · − reset · ◀ ▶ mode · B menu`;
}

// The screen is built once per mode; draw() only updates the numbers every frame
function build() {
  root.dataset.mode = MODES[mode].toLowerCase();
  const tabs = MODES.map((m, i) => `<span class="tm-tab${i === mode ? ' on' : ''}">${m}</span>`).join('');
  let body = '';
  if (mode === 0) body = '<div class="tm-big tm-clock"></div><div class="tm-date"></div>';
  else if (mode === 1) {
    body = `<div class="tm-dial"><svg viewBox="0 0 400 400" aria-hidden="true">
        <circle cx="200" cy="200" r="180" class="tm-track"/><circle cx="200" cy="200" r="180" class="tm-ring" stroke-dasharray="${RING}"/></svg>
      <div class="tm-big tm-left"></div><div class="tm-state"></div></div>`;
  } else body = '<div class="tm-big tm-watch"></div><ol class="tm-laps"></ol>';
  root.innerHTML = `<div class="channel-head"><h1>Timer</h1><div class="tm-tabs">${tabs}</div><span class="tm-hint"></span></div>
    <div class="tm-body">${body}</div>`;
  draw();
}

function draw() {
  if (!root) return;
  root.querySelector('.tm-hint').textContent = hint();
  if (mode === 0) {
    const d = new Date();
    root.querySelector('.tm-clock').textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    root.querySelector('.tm-date').textContent = d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } else if (mode === 1) {
    const left = timer.remaining();
    root.querySelector('.tm-left').textContent = formatTime(left);
    root.querySelector('.tm-ring').style.strokeDashoffset = String(RING * (1 - left / timer.length));
    root.querySelector('.tm-state').textContent = timer.done ? "Time's up!" : timer.running ? 'Running' : left < timer.length ? 'Paused' : 'Ready';
    root.classList.toggle('tm-done', timer.done);
  } else {
    root.querySelector('.tm-watch').textContent = formatTime(watch.elapsed(), { tenths: true });
    const laps = root.querySelector('.tm-laps');
    const html = watch.laps.map((t, i) => `<li><span>Lap ${watch.laps.length - i}</span>${formatTime(t, { tenths: true })}</li>`).join('');
    if (laps.innerHTML !== html) laps.innerHTML = html;
  }
}

function tick() {
  frame = requestAnimationFrame(tick);
  if (timer.done && alarm == null && alarmEnd !== timer.length) ring();
  draw();
}

// Time's up: chime every 1.5 s for 12 s (or until A or −), buzz every phone, flash the screen
function ring() {
  alarmEnd = timer.length;
  let n = 0;
  const once = () => {
    api.sound.play('end');
    for (const p of api.players) api.rumble(p.playerId, 400);
    if (++n >= 8) stopAlarm();
  };
  once();
  alarm = setInterval(once, 1500);
}
function stopAlarm() { clearInterval(alarm); alarm = null; }

function onButton({ button, state }) {
  if (state !== 'down') return;
  if (button === 'B') return api.exit();
  if (button === 'LEFT' || button === 'RIGHT') {
    mode = (mode + (button === 'RIGHT' ? 1 : MODES.length - 1)) % MODES.length;
    api.sound.play('hover'); save(); return build();
  }
  if (mode === 1) {
    if (button === 'A') {
      if (timer.done) { stopAlarm(); timer.reset(); alarmEnd = null; }
      else if (timer.running) timer.pause();
      else timer.start();
      api.sound.play('select');
    } else if (button === 'MINUS' && started()) { stopAlarm(); timer.reset(); alarmEnd = null; api.sound.play('back'); }
    else if (!started()) {
      const step = { UP: 60000, DOWN: -60000, PLUS: 10000, MINUS: -10000 }[button];
      if (step) { timer.add(step); api.sound.play('tick'); save(); }
    }
  } else if (mode === 2) {
    if (button === 'A') { if (watch.running) watch.pause(); else watch.start(); api.sound.play('select'); }
    else if (button === 'PLUS' && watch.running) { watch.lap(); api.sound.play('tick'); }
    else if (button === 'MINUS') { watch.reset(); api.sound.play('back'); }
  }
  draw();
}

export default {
  id: 'timer',
  title: 'Timer',
  color: '#E8590C',
  icon: ICON,
  minPlayers: 1,
  maxPlayers: 1,
  mount(container, gameApi) {
    api = gameApi;
    const saved = load();
    mode = Number.isInteger(saved.mode) && MODES[saved.mode] ? saved.mode : 1;
    // (the timer and stopwatch keep running while you're on the menu)
    timer ??= createCountdown(now, Number(saved.length) || 5 * 60 * 1000);
    watch ??= createStopwatch(now);
    root = document.createElement('div');
    root.className = 'channel timer';
    container.append(root);
    api.onButton(onButton);
    api.actions([{ key: 'B', label: '‹ Back' }, { key: 'LEFT', label: '‹ Mode' }, { key: 'RIGHT', label: 'Mode ›' }, { key: 'A', label: 'Start / Pause' }, { key: 'MINUS', label: 'Reset' }, { key: 'UP', label: '+1 min' }, { key: 'DOWN', label: '−1 min' }, { key: 'PLUS', label: 'Lap' }]); // (on-screen keys, so the pointer can do everything the D-pad can)
    build();
    tick();
  },
  unmount() {
    cancelAnimationFrame(frame);
    stopAlarm();
    root?.remove();
    api = root = null;
  },
};
