// Game sounds: Kenney's CC0 sound packs through howler (see sound-map.js), with the little synth
// sounds below as the fallback (no howler, a missing file, or a sound the map doesn't have).
// Browsers only allow sound after the user clicks the page once, so the console
// calls sound.unlock() on the first click or key press.
import { KENNEY, HOVER_RATES } from './sound-map.js';

const howls = new Map(); // name -> Howl (null: its file would not load)
function getHowl(name) {
  const spec = KENNEY[name];
  if (!spec || typeof Howl === 'undefined') return null; // (Howl: the global from /vendor/howler)
  if (!howls.has(name)) {
    const h = new Howl({ src: [`/assets/sounds/kenney/${spec.file.split('/').map(encodeURIComponent).join('/')}`], volume: spec.vol, preload: true, onloaderror: () => { howls.set(name, null); } });
    howls.set(name, h);
  }
  return howls.get(name);
}
function kenney(name, opts) {
  const h = getHowl(name);
  if (!h || h.state() !== 'loaded') return false; // missing, or still loading the first time: the synth sound covers it
  h.rate(name === 'hover' ? HOVER_RATES[(opts?.step ?? 0) % HOVER_RATES.length] : KENNEY[name].rate ?? 1);
  h.play();
  return true;
}

let ctx = null;
let muted = false;
try { muted = localStorage.getItem('couch.muted') === '1'; } catch { /* ignore */ }

function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

// One oscillator note: frequency slides from f0 to f1 over `dur` seconds.
function tone({ f0, f1 = f0, dur = 0.1, type = 'sine', vol = 0.2, delay = 0 }) {
  const a = audio();
  const t = a.currentTime + delay;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// A short burst of filtered white noise (pops, whooshes, booms).
function noise({ dur = 0.1, freq = 2000, q = 1, vol = 0.3, delay = 0 }) {
  const a = audio();
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = a.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(gain).connect(a.destination);
  src.start(t);
}

// A major pentatonic scale, so neighbouring menu columns always sound good together
const PENTA = [1047, 1175, 1319, 1568, 1760];

const SOUNDS = {
  // hover is heard all the time in the menu: short and quiet. step = which column.
  hover: ({ step = 0 } = {}) => tone({ f0: PENTA[step % PENTA.length], dur: 0.035, type: 'triangle', vol: 0.05 }),
  join: () => [784, 1047, 1319].forEach((f, i) => tone({ f0: f, dur: 0.12, type: 'triangle', vol: 0.12, delay: i * 0.06 })),
  leave: () => [1047, 784].forEach((f, i) => tone({ f0: f, dur: 0.12, type: 'triangle', vol: 0.1, delay: i * 0.08 })),
  select: () => {
    tone({ f0: 660, dur: 0.08, type: 'triangle', vol: 0.15 });
    tone({ f0: 990, dur: 0.12, type: 'triangle', vol: 0.15, delay: 0.07 });
  },
  back: () => {
    tone({ f0: 760, dur: 0.08, type: 'triangle', vol: 0.15 });
    tone({ f0: 500, dur: 0.12, type: 'triangle', vol: 0.15, delay: 0.07 });
  },
  pop: () => {
    noise({ dur: 0.08, freq: 1800, q: 0.8, vol: 0.5 });
    tone({ f0: 500, f1: 120, dur: 0.1, vol: 0.25 });
  },
  golden: () => {
    noise({ dur: 0.06, freq: 2500, vol: 0.4 });
    [880, 1100, 1320, 1760].forEach((f, i) => tone({ f0: f, dur: 0.1, type: 'triangle', vol: 0.12, delay: i * 0.05 }));
  },
  bomb: () => {
    noise({ dur: 0.4, freq: 200, q: 0.5, vol: 0.8 });
    tone({ f0: 150, f1: 40, dur: 0.4, type: 'sawtooth', vol: 0.25 });
  },
  hit: () => tone({ f0: 520, f1: 780, dur: 0.07, type: 'square', vol: 0.08 }),
  wall: () => tone({ f0: 300, dur: 0.05, type: 'square', vol: 0.05 }),
  point: () => tone({ f0: 440, f1: 160, dur: 0.35, type: 'sawtooth', vol: 0.12 }),
  strike: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ f0: f, dur: 0.16, type: 'triangle', vol: 0.15, delay: i * 0.07 })),
  roll: () => noise({ dur: 0.6, freq: 250, q: 0.7, vol: 0.18 }),
  pins: () => { noise({ dur: 0.25, freq: 1400, q: 1.5, vol: 0.35 }); noise({ dur: 0.18, freq: 700, q: 2, vol: 0.3, delay: 0.05 }); },
  shot: () => { noise({ dur: 0.09, freq: 2600, q: 0.6, vol: 0.35 }); tone({ f0: 220, f1: 90, dur: 0.08, type: 'square', vol: 0.08 }); },
  clink: () => [1568, 2093].forEach((f, i) => tone({ f0: f, dur: 0.12, type: 'triangle', vol: 0.1, delay: i * 0.04 })),
  clear: () => noise({ dur: 0.25, freq: 900, q: 0.4, vol: 0.25 }),
  tick: () => tone({ f0: 1000, dur: 0.05, type: 'square', vol: 0.05 }),
  start: () => [523, 659, 784].forEach((f, i) => tone({ f0: f, dur: 0.14, type: 'triangle', vol: 0.15, delay: i * 0.1 })),
  end: () => [784, 659, 523, 1046].forEach((f, i) => tone({ f0: f, dur: 0.18, type: 'triangle', vol: 0.15, delay: i * 0.12 })),
};

export const sound = {
  play(name, opts) {
    if (muted || !ctx || ctx.state !== 'running') return;
    if (!kenney(name, opts)) SOUNDS[name]?.(opts);
  },
  // A continuous tone, e.g. an engine hum. Returns { set(freq, volume), stop() }.
  loop(type = 'sawtooth') {
    if (!ctx || ctx.state !== 'running') return { set() {}, stop() {} };
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = type;
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    gain.gain.value = 0;
    osc.connect(filter).connect(gain).connect(ctx.destination);
    osc.start();
    return {
      set(freq, volume) {
        osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.05);
        gain.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.05);
      },
      stop() {
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        osc.stop(ctx.currentTime + 0.3);
      },
    };
  },
  // Call from a real click/key press on the laptop.
  unlock() {
    audio().resume();
    if (typeof Howler !== 'undefined') { Howler.mute(muted); for (const name of Object.keys(KENNEY)) getHowl(name); } // (load them all now)
  },
  get unlocked() { return ctx?.state === 'running'; },
  get muted() { return muted; },
  setMuted(value) {
    muted = value;
    if (typeof Howler !== 'undefined') Howler.mute(value);
    try { localStorage.setItem('couch.muted', value ? '1' : '0'); } catch { /* ignore */ }
  },
};
