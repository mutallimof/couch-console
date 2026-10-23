// Photos channel: a slideshow of the pictures in the laptop's photos/ folder.
//   Grid: point or D-pad to choose, A = open, B = back to the menu
//   Photo: ◀ ▶ = previous / next, A = start/stop the slideshow, B = back to the grid
import { createFocusGrid } from './focus-grid.js';

const SLIDE_SECONDS = 6;

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true">
  <rect x="6" y="10" width="36" height="28" rx="5" fill="none" stroke="#fff" stroke-width="3.5"/>
  <circle cx="17" cy="19" r="4" fill="#fff"/><path d="M9 35l11-11 7 7 5-5 8 9z" fill="#fff"/>
</svg>`;

let api, root, photos, grid, view, slideTimer, frame, playing;

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function showGrid() {
  view = null;
  stopSlideshow();
  root.querySelector('.photo-view')?.remove();
}

function open(i) {
  view = { i };
  let el = root.querySelector('.photo-view');
  if (!el) {
    el = document.createElement('div');
    el.className = 'photo-view';
    root.append(el);
  }
  const p = photos[i];
  // A soft blurred copy fills the screen behind the photo; the photo slowly zooms (Ken Burns)
  el.innerHTML = `<div class="photo-bg" style="background-image:url('${p.url.replace(/'/g, '%27')}')"></div>
    <img class="photo-full" src="${p.url}" alt="">
    <div class="photo-caption">${esc(p.name)} · ${i + 1} / ${photos.length}${playing ? ' · ▶ Slideshow' : ''}</div>
    <div class="photo-help">◀ ▶ browse · A ${playing ? 'stop' : 'start'} slideshow · B back</div>`;
  grid.setIndex(i, true);
}

function step(d) {
  if (!view) return;
  open((view.i + d + photos.length) % photos.length);
  api.sound.play('hover');
}

function startSlideshow() {
  playing = true;
  slideTimer = setInterval(() => step(1), SLIDE_SECONDS * 1000);
  open(view.i);
}
function stopSlideshow() {
  playing = false;
  clearInterval(slideTimer);
  slideTimer = null;
}

function onButton({ playerId, button, state }) {
  if (state !== 'down') return;
  if (view) {
    if (button === 'LEFT' || button === 'UP') { if (playing) { stopSlideshow(); } step(-1); }
    else if (button === 'RIGHT' || button === 'DOWN') { if (playing) { stopSlideshow(); } step(1); }
    else if (button === 'A') { if (playing) { stopSlideshow(); open(view.i); } else startSlideshow(); api.sound.play('select'); }
    else if (button === 'B') { showGrid(); api.sound.play('back'); }
    return;
  }
  if (button === 'B') return api.exit();
  if (!photos.length) return;
  if (button === 'A') { open(grid.index); api.sound.play('select'); }
  else grid.move(button);
}

function hoverLoop() {
  if (!view && grid && api) grid.hover(api.pointer(api.players[0]?.playerId));
  frame = requestAnimationFrame(hoverLoop);
}

async function load() {
  try {
    photos = await (await fetch('/api/photos')).json();
  } catch {
    photos = [];
  }
  if (!root) return; // closed meanwhile
  if (!photos.length) {
    root.innerHTML = `<div class="channel-empty"><h1>Photos</h1>
      <p>No pictures yet.</p>
      <p>Put .jpg or .png files in the <b>photos</b> folder inside <b>couch-console</b> on your laptop,<br>then open this channel again.</p>
      <p class="muted">B = back</p></div>`;
    return;
  }
  root.innerHTML = `<div class="channel-head"><h1>Photos</h1><span>${photos.length} pictures · A = open · B = menu</span></div>
    <div class="photo-grid">${photos.map((p, i) =>
      `<div class="photo-tile" data-index="${i}"><img src="${p.url}" alt="" loading="lazy"></div>`).join('')}</div>`;
  const items = [...root.querySelectorAll('.photo-tile')];
  grid = createFocusGrid({ items, columns: 5, onChange: () => api.sound.play('hover') });
}

export default {
  id: 'photos',
  title: 'Photos',
  color: '#1F9E83',
  icon: ICON,
  minPlayers: 1,
  maxPlayers: 1,
  mount(container, gameApi) {
    api = gameApi;
    root = document.createElement('div');
    root.className = 'channel photos';
    root.innerHTML = '<div class="channel-empty"><p>Loading…</p></div>';
    container.append(root);
    photos = []; grid = null; view = null; playing = false;
    api.onButton(onButton);
    load();
    frame = requestAnimationFrame(hoverLoop);
  },
  unmount() {
    stopSlideshow();
    cancelAnimationFrame(frame);
    root?.remove();
    api = root = grid = view = null;
  },
};
