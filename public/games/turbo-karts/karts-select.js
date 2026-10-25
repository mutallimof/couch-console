// Turbo Karts select screen: each player picks a character, then a kart; then P1 picks the track.
//   D-pad = choose · A = confirm · B = go back
// Each player's panel has a 3D preview box (.ks-stage) that turbo-karts.js draws the showroom
// into (karts-showroom.js). The panels are built once and then only updated, so the stat bars
// can slide to their new values.
import { KARTS } from './karts-data.js';
import { GP_CHARACTERS } from './ow-kart/characters.js';
import { TRACKS } from './kart-track.js';
import { createTrackModel } from './ow-kart/track-model.js';
import { worldOf } from './karts-themes.js';

const STATS = [['speed', 'Speed'], ['accel', 'Acceleration'], ['handling', 'Handling'], ['weight', 'Weight']];
const HINTS = { char: 'D-pad: choose a racer · A = pick', kart: '◀ ▶ choose a kart · A = ready · B = back', ready: 'Ready! · B = change' };

// onCelebrate(playerId, 'pick' | 'ready'): a character was picked / a player is ready
export function createSelect({ root, players, portraits, previous, sound, onDone, onExit, onCelebrate = () => {}, tracks = TRACKS, characters: CHARACTERS = GP_CHARACTERS }) {
  // One "seat" per human player: what they're choosing and what they picked
  const seats = players.map((p, n) => ({
    playerId: p.playerId, color: p.color,
    step: 'char',
    char: previous?.picks?.[n]?.char ?? n * 3,
    kart: previous?.picks?.[n]?.kart ?? 1,
  }));
  let track = previous?.track ?? 0;
  let stage = 'pick'; // 'pick' (characters & karts) → 'track'
  const el = document.createElement('div');
  el.className = 'kart-select';
  root.append(el);

  function buildPick() {
    const taken = new Set(seats.filter((s) => s.step !== 'char').map((s) => s.char));
    el.innerHTML = `<h1 class="ks-title">Choose your racer</h1><div class="ks-seats n${seats.length}">${seats.map((s) => `
      <section class="ks-seat" data-player="${s.playerId}" style="--c:${s.color}">
        <header class="ks-top"><span class="ks-tag">P${s.playerId}</span><div class="ks-who"><b class="ks-name"></b><small class="ks-tagline"></small></div><span class="ks-kart-name"></span></header>
        <div class="ks-stage"></div>
        <div class="ks-choices">
          <div class="ks-chars">${CHARACTERS.map((ch, i) => `<figure data-ui data-i="${i}" title="${ch.name}"><img src="${portraits[ch.id]}" alt="${ch.name}"></figure>`).join('')}</div>
          <div class="ks-karts">${KARTS.map((kk, i) => `<div class="ks-kart" data-ui data-i="${i}">${kk.name}</div>`).join('')}</div>
          <div class="ks-stats">${STATS.map(([, label]) => `<span>${label}</span><div class="ks-bar"><i></i></div>`).join('')}</div>
        </div>
        <p class="ks-hint"></p>
        <button type="button" class="ui-btn ghost ks-back" data-key="B">‹ Back</button>
      </section>`).join('')}</div>`;
    void taken;
    update();
  }

  // Update the panels in place (no rebuild)
  function update() {
    for (const s of seats) {
      const p = el.querySelector(`.ks-seat[data-player="${s.playerId}"]`);
      const c = CHARACTERS[s.char], k = KARTS[s.kart];
      p.className = `ks-seat is-${s.step}`; // (prefixed: a bare "kart" class would clash with the game screen's .kart)
      p.querySelector('.ks-name').textContent = c.name;
      p.querySelector('.ks-tagline').textContent = c.tag || '';
      p.querySelector('.ks-kart-name').textContent = `${k.name} kart`;
      p.style.setProperty('--char', c.color);
      p.querySelectorAll('.ks-chars figure').forEach((fig, i) => fig.classList.toggle('focused', i === s.char));
      p.querySelectorAll('.ks-kart').forEach((d, i) => d.classList.toggle('focused', i === s.kart));
      p.querySelector('.ks-chars').classList.toggle('active', s.step === 'char');
      p.querySelector('.ks-karts').classList.toggle('active', s.step === 'kart');
      p.querySelectorAll('.ks-bar i').forEach((bar, i) => bar.style.setProperty('--v', k[STATS[i][0]] / 5));
      p.querySelector('.ks-hint').textContent = HINTS[s.step];
    }
  }

  function buildTrack() {
    el.innerHTML = `<h1 class="ks-title">Choose a track</h1><div class="ks-tracks">${tracks.map((t, i) => `
      <div class="ks-track ui-focus ${i === track ? 'focused' : ''}" data-ui data-i="${i}"><canvas width="520" height="300"></canvas><div class="ks-info"><b>${t.name}</b><span>${t.blurb}</span></div></div>`).join('')}</div>
      <p class="ks-hint">P${seats[0].playerId}: ◀ ▶ ▲ ▼ choose · A = race! · B = back</p>
      <button type="button" class="ui-btn ghost ks-back" data-key="B">‹ Back</button>`;
    el.querySelectorAll('.ks-track canvas').forEach((c, i) => drawTrackCard(c, tracks[i]));
  }

  function onButton({ playerId, button, state }) {
    if (state !== 'down') return;
    if (stage === 'track') {
      if (playerId !== seats[0].playerId) return;
      const n = tracks.length;
      if (button === 'LEFT') { track = (track + n - 1) % n; sound.play('hover'); }
      else if (button === 'RIGHT') { track = (track + 1) % n; sound.play('hover'); }
      else if (button === 'UP' || button === 'DOWN') { track = (track + (button === 'DOWN' ? 4 : n - 4)) % n; sound.play('hover'); }
      else if (button === 'A') { sound.play('start'); return finish(); }
      else if (button === 'B') { stage = 'pick'; seats.forEach((s) => { s.step = 'kart'; }); sound.play('back'); return buildPick(); }
      el.querySelectorAll('.ks-track').forEach((t, i) => t.classList.toggle('focused', i === track));
      return;
    }
    const s = seats.find((x) => x.playerId === playerId);
    if (!s) return;
    if (s.step === 'char') {
      const cols = 4, n = CHARACTERS.length; // two rows of 4 characters
      const d = { LEFT: -1, RIGHT: 1, UP: -cols, DOWN: cols }[button];
      if (d) { s.char = (s.char + d + n) % n; sound.play('hover'); }
      else if (button === 'A') { s.step = 'kart'; sound.play('select'); onCelebrate(s.playerId, 'pick'); }
      else if (button === 'B' && s === seats[0]) return onExit();
    } else if (s.step === 'kart') {
      const d = { LEFT: -1, UP: -1, RIGHT: 1, DOWN: 1 }[button];
      if (d) { s.kart = (s.kart + d + KARTS.length) % KARTS.length; sound.play('hover'); }
      else if (button === 'A') { s.step = 'ready'; sound.play('select'); onCelebrate(s.playerId, 'ready'); }
      else if (button === 'B') { s.step = 'char'; sound.play('back'); }
    } else if (s.step === 'ready' && button === 'B') {
      s.step = 'kart'; sound.play('back');
    }
    if (seats.every((x) => x.step === 'ready')) { stage = 'track'; sound.play('select'); return buildTrack(); }
    update();
  }

  function finish() {
    el.remove();
    onDone({ picks: seats.map((s) => ({ playerId: s.playerId, char: s.char, kart: s.kart })), track });
  }

  // Pointer: hovering a racer / kart / track selects it (a tap or A then confirms it, exactly like the D-pad would)
  el.addEventListener('ui-hover', (ev) => {
    const { playerId } = ev.detail;
    const t = ev.target.closest?.('[data-i]');
    if (!t) return;
    const i = Number(t.dataset.i);
    if (stage === 'track') {
      if (playerId !== seats[0].playerId || !t.classList.contains('ks-track') || i === track) return;
      track = i; sound.play('hover');
      el.querySelectorAll('.ks-track').forEach((x, n) => x.classList.toggle('focused', n === track));
      return;
    }
    const s = seats.find((x) => x.playerId === playerId);
    if (!s || !t.closest(`.ks-seat[data-player="${playerId}"]`)) return;
    if (s.step === 'char' && t.tagName === 'FIGURE' && s.char !== i) { s.char = i; sound.play('hover'); update(); }
    else if (s.step === 'kart' && t.classList.contains('ks-kart') && s.kart !== i) { s.kart = i; sound.play('hover'); update(); }
  });
  buildPick();
  return {
    onButton,
    destroy: () => el.remove(),
    // For the showrooms: what each player has chosen, and where their preview box is
    seats: () => seats.map((s) => ({ ...s, character: CHARACTERS[s.char], kartDef: KARTS[s.kart],
      stage: stage === 'pick' ? el.querySelector(`.ks-seat[data-player="${s.playerId}"] .ks-stage`) : null })),
  };
}

// A track's card picture: its sky and ground colors, a little sun, and the road drawn from above
const outlines = new Map();
function drawTrackCard(canvas, def) {
  const W = canvas.width, H = canvas.height, x = canvas.getContext('2d'), w = worldOf(def).sky;
  const sky = x.createLinearGradient(0, 0, 0, H * 0.55);
  sky.addColorStop(0, w.zenith); sky.addColorStop(1, w.horizon);
  x.fillStyle = sky; x.fillRect(0, 0, W, H);
  const ground = x.createLinearGradient(0, H * 0.4, 0, H);
  ground.addColorStop(0, def.ground); ground.addColorStop(1, def.night ? '#0E1230' : '#FFFFFF33');
  x.fillStyle = def.night ? '#161A34' : def.ground; x.fillRect(0, H * 0.42, W, H);
  x.fillStyle = ground; x.globalAlpha = 0.5; x.fillRect(0, H * 0.42, W, H); x.globalAlpha = 1;
  if (!outlines.has(def.id)) outlines.set(def.id, createTrackModel(def).samples.filter((_, i) => i % 6 === 0).map((p) => [p.x, p.z]));
  const pts = outlines.get(def.id), xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const k = Math.min((W * 0.78) / (maxX - minX), (H * 0.72) / (maxZ - minZ)), ox = (W - (maxX - minX) * k) / 2 - minX * k, oz = (H * 0.5 - (maxZ - minZ) * k / 2) + H * 0.1 - minZ * k;
  const trace = () => { x.beginPath(); pts.forEach(([px, pz], i) => (i ? x.lineTo(px * k + ox, pz * k + oz) : x.moveTo(px * k + ox, pz * k + oz))); x.closePath(); x.stroke(); };
  x.lineJoin = 'round'; x.lineCap = 'round';
  x.strokeStyle = 'rgba(10,14,30,0.55)'; x.lineWidth = 17; trace();
  x.strokeStyle = def.curb?.[0] || '#fff'; x.lineWidth = 13; trace();
  x.strokeStyle = def.road; x.lineWidth = 9; trace();
  x.fillStyle = '#fff'; x.fillRect(pts[0][0] * k + ox - 8, pts[0][1] * k + oz - 3, 16, 6); // the start line
}
