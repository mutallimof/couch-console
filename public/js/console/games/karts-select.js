// Turbo Karts select screen: each player picks a character, then a kart; then P1 picks the track.
//   D-pad = choose · A = confirm · B = go back
import { CHARACTERS, KARTS } from './karts-data.js';
import { TRACKS } from './kart-track.js';

const bars = (n) => Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');

export function createSelect({ root, players, portraits, previous, sound, onDone, onExit }) {
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

  function render() {
    if (stage === 'track') {
      el.innerHTML = `<h1>Choose a track</h1><div class="ks-tracks">${TRACKS.map((t, i) => `
        <div class="ks-track ${i === track ? 'focused' : ''}" style="--a:${t.sky[0]};--b:${t.ground}">
          <b>${t.name}</b><span>${t.blurb}</span></div>`).join('')}</div>
        <p class="ks-hint">P${seats[0].playerId}: ◀ ▶ choose · A = race! · B = back</p>`;
      return;
    }
    el.innerHTML = `<h1>Choose your racer</h1><div class="ks-seats">${seats.map((s) => {
      const c = CHARACTERS[s.char], k = KARTS[s.kart];
      return `<div class="ks-seat ${s.step}" style="--c:${s.color}">
        <div class="ks-top"><span class="ks-tag">P${s.playerId}</span>
          <img class="ks-big" src="${portraits[c.id]}" alt=""><div><b class="ks-name">${c.name}</b>
          <div class="ks-kart-name">Kart: ${k.name}</div></div></div>
        <div class="ks-chars ${s.step === 'char' ? 'active' : ''}">${CHARACTERS.map((ch, i) =>
          `<img class="${i === s.char ? 'focused' : ''}" src="${portraits[ch.id]}" alt="">`).join('')}</div>
        <div class="ks-karts ${s.step === 'kart' ? 'active' : ''}">${KARTS.map((kk, i) => `
          <div class="ks-kart ${i === s.kart ? 'focused' : ''}"><b>${kk.name}</b></div>`).join('')}</div>
        <div class="ks-stats"><span>Speed</span><em>${bars(k.speed)}</em><span>Accel</span><em>${bars(k.accel)}</em>
          <span>Handling</span><em>${bars(k.handling)}</em><span>Weight</span><em>${bars(k.weight)}</em></div>
        <p class="ks-hint">${{ char: 'D-pad: character · A = next', kart: '◀ ▶ kart · A = ready · B = back', ready: 'Ready! (B = change)' }[s.step]}</p>
      </div>`;
    }).join('')}</div>`;
  }

  function onButton({ playerId, button, state }) {
    if (state !== 'down') return;
    if (stage === 'track') {
      if (playerId !== seats[0].playerId) return;
      if (button === 'LEFT' || button === 'UP') { track = (track + TRACKS.length - 1) % TRACKS.length; sound.play('hover'); }
      else if (button === 'RIGHT' || button === 'DOWN') { track = (track + 1) % TRACKS.length; sound.play('hover'); }
      else if (button === 'A') { sound.play('start'); return finish(); }
      else if (button === 'B') { stage = 'pick'; seats.forEach((s) => { s.step = 'kart'; }); sound.play('back'); }
      return render();
    }
    const s = seats.find((x) => x.playerId === playerId);
    if (!s) return;
    if (s.step === 'char') {
      const cols = 7, n = CHARACTERS.length; // two rows of 7 characters
      const d = { LEFT: -1, RIGHT: 1, UP: -cols, DOWN: cols }[button];
      if (d) { s.char = (s.char + d + n) % n; sound.play('hover'); }
      else if (button === 'A') { s.step = 'kart'; sound.play('select'); }
      else if (button === 'B' && s === seats[0]) return onExit();
    } else if (s.step === 'kart') {
      const d = { LEFT: -1, UP: -1, RIGHT: 1, DOWN: 1 }[button];
      if (d) { s.kart = (s.kart + d + KARTS.length) % KARTS.length; sound.play('hover'); }
      else if (button === 'A') { s.step = 'ready'; sound.play('select'); }
      else if (button === 'B') { s.step = 'char'; sound.play('back'); }
    } else if (s.step === 'ready' && button === 'B') {
      s.step = 'kart'; sound.play('back');
    }
    if (seats.every((x) => x.step === 'ready')) { stage = 'track'; sound.play('select'); }
    render();
  }

  function finish() {
    el.remove();
    onDone({ picks: seats.map((s) => ({ playerId: s.playerId, char: s.char, kart: s.kart })), track });
  }

  render();
  return { onButton, destroy: () => el.remove() };
}
