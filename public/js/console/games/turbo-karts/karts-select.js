// Turbo Karts select screen: each player picks a character, then a kart; then P1 picks the track.
//   D-pad = choose · A = confirm · B = go back
// Each player's panel has a 3D preview box (.ks-stage) that turbo-karts.js draws the showroom
// into (karts-showroom.js). The panels are built once and then only updated, so the stat bars
// can slide to their new values.
import { KARTS } from './karts-data.js';
import { GP_CHARACTERS } from './ow-kart/characters.js';
import { TRACKS } from './kart-track.js';

const STATS = [['speed', 'Speed'], ['accel', 'Acceleration'], ['handling', 'Handling'], ['weight', 'Weight']];
const HINTS = { char: 'D-pad: character · A = pick', kart: '◀ ▶ kart · A = ready · B = back', ready: 'Ready! · B = change' };

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
    el.innerHTML = `<h1>Choose your racer</h1><div class="ks-seats">${seats.map((s) => `
      <section class="ks-seat" data-player="${s.playerId}" style="--c:${s.color}">
        <header class="ks-top"><span class="ks-tag">P${s.playerId}</span><b class="ks-name"></b><span class="ks-kart-name"></span></header>
        <div class="ks-stage"></div>
        <div class="ks-chars">${CHARACTERS.map((ch) => `<img src="${portraits[ch.id]}" alt="${ch.name}">`).join('')}</div>
        <div class="ks-karts">${KARTS.map((kk) => `<div class="ks-kart"><b>${kk.name}</b></div>`).join('')}</div>
        <div class="ks-stats">${STATS.map(([, label]) => `<span>${label}</span><div class="ks-bar"><i></i></div>`).join('')}</div>
        <p class="ks-hint"></p>
      </section>`).join('')}</div>`;
    update();
  }

  // Update the panels in place (no rebuild)
  function update() {
    for (const s of seats) {
      const p = el.querySelector(`.ks-seat[data-player="${s.playerId}"]`);
      const c = CHARACTERS[s.char], k = KARTS[s.kart];
      p.className = `ks-seat is-${s.step}`; // (prefixed: a bare "kart" class would clash with the game screen's .kart)
      p.querySelector('.ks-name').textContent = c.name;
      p.querySelector('.ks-kart-name').textContent = k.name;
      p.querySelectorAll('.ks-chars img').forEach((img, i) => img.classList.toggle('focused', i === s.char));
      p.querySelectorAll('.ks-kart').forEach((d, i) => d.classList.toggle('focused', i === s.kart));
      p.querySelector('.ks-chars').classList.toggle('active', s.step === 'char');
      p.querySelector('.ks-karts').classList.toggle('active', s.step === 'kart');
      p.querySelectorAll('.ks-bar i').forEach((bar, i) => bar.style.setProperty('--v', k[STATS[i][0]] / 5));
      p.querySelector('.ks-hint').textContent = HINTS[s.step];
    }
  }

  function buildTrack() {
    el.innerHTML = `<h1>Choose a track</h1><div class="ks-tracks">${tracks.map((t, i) => `
      <div class="ks-track ${i === track ? 'focused' : ''}" style="--a:${t.sky[0]};--b:${t.ground}">
        <b>${t.name}</b><span>${t.blurb}</span></div>`).join('')}</div>
      <p class="ks-hint">P${seats[0].playerId}: ◀ ▶ choose · A = race! · B = back</p>`;
  }

  function onButton({ playerId, button, state }) {
    if (state !== 'down') return;
    if (stage === 'track') {
      if (playerId !== seats[0].playerId) return;
      const n = tracks.length;
      if (button === 'LEFT' || button === 'UP') { track = (track + n - 1) % n; sound.play('hover'); }
      else if (button === 'RIGHT' || button === 'DOWN') { track = (track + 1) % n; sound.play('hover'); }
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

  buildPick();
  return {
    onButton,
    destroy: () => el.remove(),
    // For the showrooms: what each player has chosen, and where their preview box is
    seats: () => seats.map((s) => ({ ...s, character: CHARACTERS[s.char], kartDef: KARTS[s.kart],
      stage: stage === 'pick' ? el.querySelector(`.ks-seat[data-player="${s.playerId}"] .ks-stage`) : null })),
  };
}
