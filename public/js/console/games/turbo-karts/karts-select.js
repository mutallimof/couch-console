// Turbo Karts select screens, in the kart-game look (karts-menu.css): big Lilita One titles, three bright
// colors, a moving background, GSAP bounces and a sound on every move and press.
//   Step 1  each player picks a racer (8 big tiles)        D-pad / keyboard arrows = move · A = pick
//   Step 2  ... and a kart (4 cards with stat pips)         ◀ ▶ = move · A = ready · B = back
//   Step 3  P1 picks a track from a carousel (3 in view)   ◀ ▶ = move · A = race! · B = back
// Each player's panel has a 3D preview box (.ks-stage) that turbo-karts.js draws the showroom into
// (karts-showroom.js). The panels are built once and then only updated, so nothing flashes.
import { KARTS } from './karts-data.js';
import { GP_CHARACTERS } from './ow-kart/characters.js';
import { TRACKS } from './kart-track.js';
import { createTrackModel } from './ow-kart/track-model.js';
import { gsap } from 'gsap';
import { menuSounds, menuBackground, title, killTitle, popIn, popOut, focusOn, focusOff, pressSquash, wipe, shakeNo } from './karts-ui.js';

const STATS = [['speed', 'Speed'], ['accel', 'Pickup'], ['handling', 'Turning'], ['weight', 'Weight']];
const HINTS = { char: 'Pick a racer · A', kart: '◀ ▶ pick a kart · A ready · B back', ready: 'Ready! · B to change' };
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// The track's outline as a small SVG path (drawn from the real road, so every track looks like itself)
const mapCache = new Map();
function trackMap(def) {
  if (mapCache.has(def.id)) return mapCache.get(def.id);
  const pts = createTrackModel(def).samples.filter((_, i) => i % 6 === 0);
  const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const k = 100 / Math.max(x1 - x0, z1 - z0), ox = (100 - (x1 - x0) * k) / 2, oz = (100 - (z1 - z0) * k) / 2;
  const at = (p) => `${(ox + (p.x - x0) * k).toFixed(1)},${(oz + (p.z - z0) * k).toFixed(1)}`;
  const svg = `<svg viewBox="-6 -6 112 112" aria-hidden="true"><path class="ks-map-back" d="M${pts.map(at).join('L')}Z"/><path class="ks-map-line" d="M${pts.map(at).join('L')}Z"/><circle class="ks-map-start" cx="${at(pts[0]).split(',')[0]}" cy="${at(pts[0]).split(',')[1]}" r="4.5"/></svg>`;
  mapCache.set(def.id, svg);
  return svg;
}

// onCelebrate(playerId, 'pick' | 'ready'): a character was picked / a player is ready
export function createSelect({ root, players, portraits, previous, sound, onDone, onExit, onCelebrate = () => {}, tracks = TRACKS, characters: CHARACTERS = GP_CHARACTERS }) {
  const sfx = menuSounds(sound);
  // One "seat" per human player: what they're choosing and what they picked
  const seats = players.map((p, n) => ({
    playerId: p.playerId, color: p.color,
    step: 'char',
    char: previous?.picks?.[n]?.char ?? n * 3,
    kart: previous?.picks?.[n]?.kart ?? 1,
    shown: null, // which panel is on screen (so a step change animates once)
  }));
  let track = previous?.track ?? 0;
  let stage = 'pick'; // 'pick' (racers & karts) → 'track'
  let heading = null;
  const bg = menuBackground(root, 'select');
  const el = document.createElement('div');
  el.className = 'kart-select';
  root.append(el);
  const seatEl = (s) => el.querySelector(`.ks-seat[data-player="${s.playerId}"]`);

  function buildPick(animate = true) {
    killTitle(heading);
    el.innerHTML = '';
    heading = title(el, 'Choose your racer');
    const wrap = document.createElement('div');
    wrap.className = `ks-seats ${seats.length === 1 ? 'solo' : 'duo'}`;
    wrap.innerHTML = seats.map((s) => `
      <section class="ks-seat" data-player="${s.playerId}" style="--c:${s.color}">
        <header class="ks-top"><span class="ks-tag">P${s.playerId}</span><b class="ks-name"></b><span class="ks-kart-name"></span></header>
        <div class="ks-stage"></div>
        <div class="ks-panel">
          <div class="ks-chars">${CHARACTERS.map((ch) => `<button type="button" class="ks-char" tabindex="-1"><img src="${portraits[ch.id]}" alt=""><span>${esc(ch.name)}</span></button>`).join('')}</div>
          <div class="ks-karts">${KARTS.map((kk) => `<button type="button" class="ks-kart" tabindex="-1"><b>${esc(kk.name)}</b>
            ${STATS.map(([key, label]) => `<span class="ks-stat"><em>${label}</em><i class="ks-pips">${Array.from({ length: 5 }, (_, n) => `<u class="${n < kk[key] ? 'on' : ''}"></u>`).join('')}</i></span>`).join('')}</button>`).join('')}</div>
          <div class="ks-ready"><b>READY!</b></div>
        </div>
        <p class="ks-hint"></p>
      </section>`).join('');
    el.append(wrap);
    for (const s of seats) s.shown = null;
    update(true);
    if (animate) {
      popIn(el.querySelectorAll('.ks-seat'), { from: 'up', stagger: 0.12, delay: 0.25, ease: 'back.out(1.4)', duration: 0.7 });
      sfx.pop();
    }
  }

  // The panel of a seat shows the current step; changing step slides the old one out and the new one in
  function showPanel(s, step, instant) {
    const p = seatEl(s), panels = { char: '.ks-chars', kart: '.ks-karts', ready: '.ks-ready' };
    if (s.shown === step) return;
    const old = s.shown && p.querySelector(panels[s.shown]);
    const next = p.querySelector(panels[step]);
    s.shown = step;
    p.querySelectorAll('.ks-panel > *').forEach((n) => { if (n !== next && n !== old) n.style.display = 'none'; });
    if (old) { popOut(old, { to: 'down', duration: 0.15 }).then(() => { if (s.shown !== step || old !== next) old.style.display = 'none'; }); }
    next.style.display = '';
    gsap.killTweensOf(next);
    if (instant || !old) { gsap.set(next, { opacity: 1, y: 0, scale: 1, clearProps: 'transform' }); } else popIn(next, { from: 'up', delay: 0.12, ease: 'back.out(1.6)', duration: 0.5 });
    if (step === 'ready') gsap.fromTo(p.querySelector('.ks-ready b'), { scale: 0.3, rotation: -12 }, { scale: 1, rotation: -4, duration: 0.8, ease: 'elastic.out(1.1, 0.4)' });
  }

  // Update the panels in place (no rebuild)
  function update(instant = false) {
    for (const s of seats) {
      const p = seatEl(s);
      const c = CHARACTERS[s.char], k = KARTS[s.kart];
      p.className = `ks-seat is-${s.step}`; // (prefixed: a bare "kart" class would clash with the game screen's .kart)
      p.querySelector('.ks-name').textContent = c.name;
      p.querySelector('.ks-kart-name').textContent = s.step === 'char' ? '' : k.name;
      const chars = [...p.querySelectorAll('.ks-char')], karts = [...p.querySelectorAll('.ks-kart')];
      chars.forEach((b, i) => { const on = i === s.char && s.step === 'char'; b.classList.toggle('picked', i === s.char); if (on && !b.classList.contains('kk-focus')) focusOn(b); else if (!on && b.classList.contains('kk-focus')) focusOff(b); });
      karts.forEach((b, i) => { const on = i === s.kart && s.step === 'kart'; b.classList.toggle('picked', i === s.kart); if (on && !b.classList.contains('kk-focus')) focusOn(b); else if (!on && b.classList.contains('kk-focus')) focusOff(b); });
      p.querySelector('.ks-hint').textContent = HINTS[s.step];
      showPanel(s, s.step, instant);
    }
  }

  // ---- track carousel ----
  function buildTrack() {
    killTitle(heading);
    el.innerHTML = '';
    heading = title(el, 'Choose a track', { color: 'white' });
    const box = document.createElement('div');
    box.className = 'ks-tracks';
    box.innerHTML = tracks.map((t, i) => `
      <div class="ks-track kk-c${i % 3}" data-i="${i}">
        <div class="ks-map">${trackMap(t)}</div>
        <b>${esc(t.name)}</b><span>${esc(t.blurb)}</span>
      </div>`).join('');
    el.append(box);
    const dots = document.createElement('div');
    dots.className = 'ks-dots';
    dots.innerHTML = tracks.map(() => '<i></i>').join('');
    el.append(dots);
    const hint = document.createElement('p');
    hint.className = 'ks-hint ks-track-hint';
    hint.innerHTML = `<kbd>◀</kbd> <kbd>▶</kbd> choose · <kbd>A</kbd> race! · <kbd>B</kbd> back`;
    el.append(hint);
    layoutTracks(true);
    if (!REDUCED) gsap.from(box.querySelectorAll('.ks-track'), { y: 120, duration: 0.7, delay: 0.15, ease: 'back.out(1.6)', stagger: 0.08 }); // (y only: the carousel owns x, scale and opacity)
    sfx.pop();
  }
  function layoutTracks(instant) {
    const cards = [...el.querySelectorAll('.ks-track')], n = cards.length;
    cards.forEach((c, i) => {
      let o = i - track; // -n/2 .. n/2: where this card is relative to the chosen one
      if (o > n / 2) o -= n; if (o < -n / 2) o += n;
      const at = o === 0 ? { x: 0, scale: 1.1, opacity: 1, z: 3, rot: 0 } : Math.abs(o) === 1 ? { x: o * 36, scale: 0.8, opacity: 0.92, z: 2, rot: o * 4 } : { x: o * 36, scale: 0.6, opacity: 0, z: 1, rot: 0 };
      c.classList.toggle('kk-focus', o === 0);
      c.style.zIndex = at.z;
      c.style.pointerEvents = Math.abs(o) <= 1 ? 'auto' : 'none';
      gsap.to(c, { xPercent: 0, yPercent: -50, x: `${at.x}vw`, scale: at.scale, rotation: at.rot, opacity: at.opacity, duration: instant || REDUCED ? 0 : 0.6, ease: instant ? 'none' : 'elastic.out(1, 0.55)', overwrite: 'auto' });
    });
    el.querySelectorAll('.ks-dots i').forEach((d, i) => d.classList.toggle('on', i === track));
  }

  async function goToTrack() {
    stage = 'track';
    await wipe(root, () => buildTrack());
  }
  async function backToPick() {
    stage = 'pick';
    seats.forEach((s) => { s.step = 'kart'; });
    sfx.back();
    await wipe(root, () => buildPick(false));
    popIn(el.querySelectorAll('.ks-seat'), { from: 'up', stagger: 0.1, duration: 0.55 });
  }

  function onButton({ playerId, button, state }) {
    if (state !== 'down') return;
    if (stage === 'track') {
      if (playerId !== seats[0].playerId) return;
      const n = tracks.length;
      if (button === 'LEFT' || button === 'UP') { track = (track + n - 1) % n; sfx.focus(track); }
      else if (button === 'RIGHT' || button === 'DOWN') { track = (track + 1) % n; sfx.focus(track); }
      else if (button === 'A') {
        sfx.press(); sfx.go();
        const card = el.querySelector('.ks-track.kk-focus');
        return pressSquash(card, 1.1).then(() => wipe(root, () => finish(), { duration: 0.36 }));
      } else if (button === 'B') return backToPick();
      return layoutTracks(false);
    }
    const s = seats.find((x) => x.playerId === playerId);
    if (!s) return;
    if (s.step === 'char') {
      const cols = 4, n = CHARACTERS.length; // two rows of 4 racers
      const d = { LEFT: -1, RIGHT: 1, UP: -cols, DOWN: cols }[button];
      if (d) { s.char = (s.char + d + n) % n; sfx.focus(s.char % cols); }
      else if (button === 'A') { s.step = 'kart'; sfx.press(); pressSquash(seatEl(s).querySelectorAll('.ks-char')[s.char]); onCelebrate(s.playerId, 'pick'); }
      else if (button === 'B' && s === seats[0]) { sfx.back(); return onExit(); }
    } else if (s.step === 'kart') {
      const d = { LEFT: -1, UP: -1, RIGHT: 1, DOWN: 1 }[button];
      if (d) { s.kart = (s.kart + d + KARTS.length) % KARTS.length; sfx.focus(s.kart); }
      else if (button === 'A') { s.step = 'ready'; sfx.press(); sfx.win(); onCelebrate(s.playerId, 'ready'); }
      else if (button === 'B') { s.step = 'char'; sfx.back(); }
    } else if (s.step === 'ready' && button === 'B') {
      s.step = 'kart'; sfx.back();
    } else if (s.step === 'ready' && button) { shakeNo(seatEl(s).querySelector('.ks-ready')); } // (waiting for the other player)
    if (seats.every((x) => x.step === 'ready')) { setTimeout(() => { if (seats.every((x) => x.step === 'ready') && stage === 'pick') goToTrack(); }, 650); }
    update();
  }

  function finish() {
    killTitle(heading);
    bg.kill();
    el.remove();
    onDone({ picks: seats.map((s) => ({ playerId: s.playerId, char: s.char, kart: s.kart })), track });
  }

  buildPick();
  return {
    onButton,
    destroy: () => { killTitle(heading); bg.kill(); el.remove(); },
    // For the showrooms: what each player has chosen, and where their preview box is
    seats: () => seats.map((s) => ({ ...s, character: CHARACTERS[s.char], kartDef: KARTS[s.kart],
      stage: stage === 'pick' ? el.querySelector(`.ks-seat[data-player="${s.playerId}"] .ks-stage`) : null })),
  };
}
