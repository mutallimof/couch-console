// Photos: the party album on the TV (Phase 44). Everyone's photos, live.
//   Wall (default): a calm slideshow, one photo at a time; a new photo jumps the queue (a soft chime, 6 s).
//   Grid: PLUS switches; D-pad or pointer to choose · A = full screen · B = back to the wall
//   MINUS = hide the photo for everyone (asks first). With "approve first" on, waiting photos come first: A = show, MINUS = hide.
// Pictures from the laptop's photos/ folder join the album too.
import { createFocusGrid } from './focus-grid.js';
import { party } from '../party.js';

const SLIDE_SECONDS = 7, NEW_SECONDS = 6;

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true">
  <rect x="6" y="10" width="36" height="28" rx="5" fill="none" stroke="#fff" stroke-width="3.5"/>
  <circle cx="17" cy="19" r="4" fill="#fff"/><path d="M9 35l11-11 7 7 5-5 8 9z" fill="#fff"/>
</svg>`;

let api, root, photos = [], grid, mode = 'wall', index = 0, timer, frame, unlisten, confirmHide = null;
let jumpUntil = 0;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const auth = () => `room=${party.room}&h=${encodeURIComponent(party.headers()['x-couch-host'])}`;
const src = (p, kind) => (p.local ? p.url : `/api/party/photos/${p.id}/${kind}?${auth()}`);
const shown = () => photos.filter((p) => !p.hidden && !p.pending);
const waiting = () => photos.filter((p) => p.pending);

function say(text) { // a short message on the TV (e.g. "Hidden")
  const el = root?.querySelector('.photo-note');
  if (el) { el.textContent = text; el.hidden = !text; }
}

// ---------- Wall ----------
function showWall(i = index, fresh = false) {
  const list = shown();
  mode = 'wall';
  root.querySelector('.photo-view')?.remove();
  root.querySelector('.photo-grid')?.setAttribute('hidden', '');
  root.querySelector('.channel-head')?.setAttribute('hidden', '');
  clearTimeout(timer);
  if (!list.length) return showEmpty();
  index = ((i % list.length) + list.length) % list.length;
  const p = list[index];
  const el = document.createElement('div');
  el.className = `photo-view wall${fresh ? ' fresh' : ''}`;
  el.innerHTML = `<div class="photo-bg" style="background-image:url('${src(p, 'thumb').replace(/'/g, '%27')}')"></div>
    <img class="photo-full" src="${src(p, 'full')}" alt="">
    <div class="photo-by" style="background:${p.byColor || '#5B6577'}">${p.local ? '🖼️' : esc(p.byEmoji)} ${esc(p.byName || 'Laptop')}</div>
    <div class="photo-help">PLUS = all photos · B = menu</div>`;
  root.append(el);
  timer = setTimeout(() => showWall(index + 1), (fresh ? NEW_SECONDS : SLIDE_SECONDS) * 1000);
}
function showEmpty() {
  mode = 'empty';
  root.querySelector('.photo-view')?.remove();
  const qr = document.querySelector('#qr')?.src || '';
  const el = document.createElement('div');
  el.className = 'photo-view empty';
  el.innerHTML = `<div class="photo-empty"><h1>No photos yet</h1><p>Scan the code and add the first one!</p>${qr ? `<img src="${qr}" alt="QR code to join">` : ''}<p class="muted">Room ${esc(party.room)} · B = menu</p></div>`;
  root.append(el);
}

// ---------- Grid ----------
function showGrid() {
  mode = 'grid';
  clearTimeout(timer);
  root.querySelector('.photo-view')?.remove();
  const queue = waiting(), list = [...queue, ...shown()];
  let el = root.querySelector('.photo-grid');
  if (!el) { el = document.createElement('div'); el.className = 'photo-grid'; root.append(el); }
  el.hidden = false;
  const head = root.querySelector('.channel-head');
  head.hidden = false;
  head.innerHTML = `<h1>Photos</h1><span>${shown().length} photos${queue.length ? ` · <b>${queue.length} waiting for you</b>` : ''} · A = full screen · MINUS = hide · PLUS = wall · B = back</span>`;
  el.innerHTML = list.map((p, i) => `<div class="photo-tile${p.pending ? ' pending' : ''}" data-index="${i}">
      <img src="${src(p, 'thumb')}" alt="" loading="lazy"><span class="photo-by sm" style="background:${p.byColor || '#5B6577'}">${p.local ? '🖼️' : esc(p.byEmoji)} ${esc(p.byName || 'Laptop')}</span>
      ${p.pending ? '<span class="photo-pending">Waiting: A = show</span>' : ''}</div>`).join('');
  grid = list.length ? createFocusGrid({ items: [...el.querySelectorAll('.photo-tile')], columns: 5, onChange: () => api.sound.play('hover') }) : null;
  grid?.setIndex(Math.min(index, list.length - 1), true);
  gridList = list;
  if (!list.length) showEmpty();
}
let gridList = [];

function showFull(p) {
  mode = 'full';
  root.querySelector('.photo-view')?.remove();
  const el = document.createElement('div');
  el.className = 'photo-view';
  el.innerHTML = `<div class="photo-bg" style="background-image:url('${src(p, 'thumb').replace(/'/g, '%27')}')"></div>
    <img class="photo-full" src="${src(p, 'full')}" alt="">
    <div class="photo-by" style="background:${p.byColor || '#5B6577'}">${p.local ? '🖼️' : esc(p.byEmoji)} ${esc(p.byName || 'Laptop')}</div>
    <div class="photo-help">◀ ▶ browse · MINUS hide · B back</div>`;
  root.append(el);
}

// ---------- Moderation ----------
async function hide(p) {
  if (p.local) return say('Laptop pictures: remove them from the photos folder');
  try {
    await party.call('POST', `/photos/${p.id}/hide`, { hidden: true });
    p.hidden = true;
    say('Hidden for everyone');
  } catch { say('Could not hide it'); }
}
async function approve(p) {
  try { await party.call('POST', `/photos/${p.id}/approve`, {}); p.pending = false; say('Shown'); } catch { say('Could not approve'); }
}

function currentPhoto() {
  if (mode === 'wall') return shown()[index];
  if (mode === 'grid') return gridList[grid?.index ?? 0];
  if (mode === 'full') return shown()[index];
  return null;
}

function onButton({ playerId, button, state }) {
  if (state !== 'down') return;
  if (button !== 'MINUS') confirmHide = null;
  if (button === 'B') {
    if (mode === 'grid' || mode === 'full') { mode === 'full' ? showGrid() : showWall(); api.sound.play('back'); return; }
    return api.exit();
  }
  if (button === 'PLUS') { if (mode === 'wall' || mode === 'empty' || mode === 'full') showGrid(); else showWall(); api.sound.play('select'); return; }
  if (button === 'MINUS') {
    const p = currentPhoto();
    if (!p) return;
    if (p.pending) { hide(p).then(() => (mode === 'grid' ? showGrid() : null)); return; }
    if (confirmHide !== p.id) { confirmHide = p.id; say('Hide this photo for everyone? Press MINUS again'); setTimeout(() => { if (confirmHide === p.id) { confirmHide = null; say(''); } }, 4000); return; }
    confirmHide = null;
    hide(p).then(() => { mode === 'grid' ? showGrid() : showWall(index); });
    return;
  }
  if (mode === 'grid') {
    if (button === 'A') {
      const p = gridList[grid.index];
      if (!p) return;
      if (p.pending) { approve(p).then(showGrid); return; }
      index = shown().indexOf(p); showFull(p); api.sound.play('select');
    } else grid?.move(button);
    return;
  }
  if (mode === 'full' || mode === 'wall') {
    const d = button === 'LEFT' || button === 'UP' ? -1 : button === 'RIGHT' || button === 'DOWN' ? 1 : 0;
    if (!d) return;
    const n = shown().length;
    index = (index + d + n) % n;
    mode === 'full' ? showFull(shown()[index]) : showWall(index);
    api.sound.play('hover');
  }
}

function hoverLoop() {
  if (mode === 'grid' && grid && api) grid.hover(api.pointer(api.players[0]?.playerId));
  frame = requestAnimationFrame(hoverLoop);
}

// A photo arrived, was hidden, or was removed
function onPhoto({ kind, photo }) {
  if (kind === 'added' || kind === 'shown') {
    if (!photos.some((p) => p.id === photo.id)) photos.unshift(photo); else Object.assign(photos.find((p) => p.id === photo.id), photo);
    photos.sort((a, b) => (b.at || 0) - (a.at || 0));
    if (photo.pending) { if (mode === 'grid') showGrid(); say(`📸 ${photo.byName} sent a photo that waits for your OK`); return; }
    api.sound.play('join');
    if (mode === 'wall' || mode === 'empty') { jumpUntil = Date.now() + NEW_SECONDS * 1000; showWall(shown().findIndex((p) => p.id === photo.id), true); } // jump the queue
    else if (mode === 'grid') showGrid();
  } else { // removed / hidden
    photos = kind === 'removed' ? photos.filter((p) => p.id !== photo.id) : photos.map((p) => (p.id === photo.id ? { ...p, hidden: true } : p));
    if (mode === 'wall') showWall(index);
    else if (mode === 'grid') showGrid();
  }
}

async function load() {
  let mineList = [];
  try { mineList = (await (await fetch('/api/party/photos', { headers: party.headers() })).json()).photos; } catch { /* offline: empty */ }
  let local = [];
  try { local = (await (await fetch('/api/photos')).json()).map((p) => ({ id: `local-${p.name}`, local: true, url: p.url, byName: 'Laptop', byColor: '#5B6577', at: 0 })); } catch { /* none */ }
  if (!root) return; // closed meanwhile
  photos = [...mineList, ...local].sort((a, b) => (b.at || 0) - (a.at || 0));
  if (waiting().length) showGrid(); else showWall(0);
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
    root.innerHTML = '<div class="channel-head" hidden></div><p class="photo-note" hidden></p><div class="channel-empty"><p>Loading…</p></div>';
    container.append(root);
    photos = []; grid = null; mode = 'wall'; index = 0; confirmHide = null;
    party.photosOpen = true;
    unlisten = party.onPhoto(onPhoto);
    api.onButton(onButton);
    load().then(() => root?.querySelector('.channel-empty')?.remove());
    frame = requestAnimationFrame(hoverLoop);
  },
  unmount() {
    party.photosOpen = false;
    unlisten?.();
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    root?.remove();
    api = root = grid = null;
  },
};
