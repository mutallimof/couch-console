// Present: the slide library on the TV (Phase 46). Slides come from phones (Present tab) or by dropping a PDF or
// pictures onto this screen. A starts a deck (the slides then fill the screen: A / ◀ ▶ turn pages, B black screen, HOME ends it).
//   D-pad or pointer to choose · A = present · MINUS = delete (asks first) · B = back
import { createFocusGrid } from './focus-grid.js';
import { party } from '../console/party.js';

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
  <rect x="6" y="8" width="36" height="24" rx="3"/><path d="M24 32v8M16 40h16"/><path d="M15 24l6-6 5 5 7-8"/>
</svg>`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let api, root, decks = [], grid, frame, off, confirmDel = null, note = '';

function render() {
  if (!root) return;
  const head = root.querySelector('.channel-head'), box = root.querySelector('.deck-area');
  if (!decks.length) {
    head.innerHTML = '<h1>Present</h1>';
    const qr = document.querySelector('#qr')?.src || '';
    box.innerHTML = `<div class="photo-empty"><h1>No slides yet</h1><p>On your phone: <b>Present → Upload slides</b></p><p>or drop a PDF or pictures onto this screen.</p>${qr ? `<img src="${qr}" alt="QR code to join">` : ''}<p class="muted"><b>Already joined?</b> Open the Present tab on your phone.</p><p class="muted">B = menu</p></div>`;
    grid = null;
    return;
  }
  head.innerHTML = `<h1>Present</h1><span>${esc(note) || `${decks.length} deck${decks.length === 1 ? '' : 's'} · A = present · MINUS = delete · B = menu · or drop a PDF here`}</span>`;
  const keep = grid?.index ?? 0;
  box.innerHTML = `<div class="deck-grid">${decks.map((d, i) => `<div class="deck-tile" data-index="${i}">
      <div class="thumb"><img src="/api/party/decks/${d.id}/thumb/1" alt="" onerror="this.style.visibility='hidden'"></div>
      <b>${esc(d.name)}</b><span>${d.pages ? `${d.pages} slides · ` : ''}${esc(d.byName)}</span></div>`).join('')}</div>`;
  grid = createFocusGrid({ items: [...box.querySelectorAll('.deck-tile')], columns: 4, onChange: () => api.sound.play('hover') });
  grid.setIndex(Math.min(keep, decks.length - 1), true);
  box.querySelectorAll('.deck-tile')[grid.index]?.classList.add('focused');
}

async function load() {
  try { decks = await party.call('GET', '/decks'); } catch { decks = []; }
  render();
}

async function onFiles(files) {
  const list = [...files];
  if (!list.length) return;
  const form = new FormData();
  const pdf = list.find((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  if (pdf) form.append('files', pdf, pdf.name);
  else for (const f of list.filter((x) => x.type.startsWith('image/'))) form.append('files', f, f.name); // (pictures as they are; phones shrink theirs)
  note = 'Uploading…'; render();
  const res = await party.upload('/decks', form);
  note = res.ok ? 'Added!' : (res.data.message || 'That file could not be added.');
  await load();
}

function onButton({ button, state }) {
  if (state !== 'down') return;
  if (button !== 'MINUS') confirmDel = null;
  if (button === 'B') return api.exit();
  if (!decks.length) return;
  if (button === 'A') {
    const d = decks[grid.index];
    api.sound.play('select');
    party.call('POST', '/present/start', { deckId: d.id }).catch(() => { note = 'Could not start'; render(); });
    return;
  }
  if (button === 'MINUS') {
    const d = decks[grid.index];
    if (confirmDel !== d.id) { confirmDel = d.id; note = `Delete “${d.name}” for everyone? Press MINUS again`; render(); setTimeout(() => { if (confirmDel === d.id) { confirmDel = null; note = ''; render(); } }, 4000); return; }
    confirmDel = null; note = '';
    party.call('DELETE', `/decks/${d.id}`).then(load);
    return;
  }
  grid?.move(button);
}

export default {
  id: 'present',
  title: 'Present',
  color: '#3B5BDB',
  icon: ICON,
  minPlayers: 1,
  maxPlayers: 1,
  mount(container, gameApi) {
    api = gameApi;
    root = document.createElement('div');
    root.className = 'channel present';
    root.innerHTML = '<div class="channel-head"></div><div class="deck-area"></div>';
    container.append(root);
    decks = []; grid = null; note = ''; confirmDel = null;
    api.onButton(onButton);
    off = party.onDeck(() => load());
    // drag and drop from the laptop
    root.addEventListener('dragover', (e) => { e.preventDefault(); root.classList.add('drop'); });
    root.addEventListener('dragleave', () => root.classList.remove('drop'));
    root.addEventListener('drop', (e) => { e.preventDefault(); root.classList.remove('drop'); onFiles(e.dataTransfer.files); });
    load();
    const loop = () => { if (grid && api) grid.hover(api.pointer(api.players[0]?.playerId)); frame = requestAnimationFrame(loop); };
    frame = requestAnimationFrame(loop);
  },
  unmount() {
    off?.();
    cancelAnimationFrame(frame);
    root?.remove();
    api = root = grid = null;
  },
};
