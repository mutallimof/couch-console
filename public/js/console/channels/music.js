// Music: the party's queue on the TV (Phase 45). Friends add YouTube songs from their phones; they play in a fair
// order (everybody gets a turn). The player itself lives in music-player.js and keeps playing when you leave this screen.
//   A = pause / play · PLUS = skip · UP / DOWN = choose a waiting song · MINUS = remove it · LEFT / RIGHT = move it up / down · B = back
import { party } from '../party.js';
import { musicPlayer } from '../music-hub.js';

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
  <path d="M18 34V10l22-4v24"/><circle cx="12" cy="34" r="6" fill="#fff"/><circle cx="34" cy="30" r="6" fill="#fff"/>
</svg>`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let api, root, sel = 0, off, note = '';

function render() {
  if (!root) return;
  const { now, queue, paused, skips, skipNeeded } = musicPlayer.state;
  sel = Math.max(0, Math.min(sel, queue.length - 1));
  const qr = document.querySelector('#qr')?.src || '';
  root.querySelector('.mu-side').innerHTML = `
    <div class="mu-now">${now ? `<p class="mu-label">${paused ? 'Paused' : 'Now playing'}</p>
        <h2>${esc(now.title)}</h2>
        <p class="mu-by"><span style="background:${now.byColor}">${esc(now.byEmoji)} ${esc(now.byName)}</span> added this${skips ? ` · skip ${skips}/${skipNeeded}` : ''}</p>`
      : '<p class="mu-label">Nothing playing</p><h2>Add the first song from your phone</h2>'}</div>
    <p class="mu-label">Up next</p>
    <ol class="mu-queue">${queue.length ? queue.slice(0, 6).map((q, i) => `<li class="${i === sel ? 'focused' : ''}">
        <img src="${esc(q.thumb || '')}" alt=""><span class="mu-t">${esc(q.title)}</span>
        <span class="mu-who" style="background:${q.byColor}">${esc(q.byEmoji)} ${esc(q.byName)}</span>${q.votes.length ? `<span class="mu-votes">👍 ${q.votes.length}</span>` : ''}</li>`).join('')
      : '<li class="mu-none">The queue is empty</li>'}</ol>
    ${queue.length > 6 ? `<p class="muted">…and ${queue.length - 6} more</p>` : ''}
    <div class="mu-join">${qr ? `<img src="${qr}" alt="">` : ''}<span>Scan to add songs<br><b>${esc(party.room)}</b><br><small>Already joined? Open the Music tab on your phone.</small></span></div>
    <p class="mu-help">${esc(note) || 'A = pause · PLUS = skip · ▲▼ choose · MINUS = remove · ◀ ▶ move · B = back'}</p>`;
}

async function call(path, body) {
  try { await party.call('POST', path, body); note = ''; } catch { note = 'That did not work. Is the laptop online?'; }
  render();
}

function onButton({ button, state }) {
  if (state !== 'down') return;
  const { queue, paused } = musicPlayer.state;
  if (button === 'B') return api.exit();
  if (button === 'A') { api.sound.play('select'); return call('/music/pause', { paused: !paused }); }
  if (button === 'PLUS') { api.sound.play('select'); return call('/music/skip', {}); }
  if (button === 'UP') { sel = Math.max(0, sel - 1); api.sound.play('hover'); return render(); }
  if (button === 'DOWN') { sel = Math.min(queue.length - 1, sel + 1); api.sound.play('hover'); return render(); }
  const q = queue[sel];
  if (!q) return;
  if (button === 'MINUS') return call('/music/remove', { id: q.id });
  if (button === 'LEFT') { sel = Math.max(0, sel - 1); return call('/music/move', { id: q.id, dir: 'up' }); }
  if (button === 'RIGHT') { sel = Math.min(queue.length - 1, sel + 1); return call('/music/move', { id: q.id, dir: 'down' }); }
}

export default {
  id: 'music',
  title: 'Music',
  color: '#E8590C',
  icon: ICON,
  minPlayers: 1,
  maxPlayers: 1,
  mount(container, gameApi) {
    api = gameApi;
    root = document.createElement('div');
    root.className = 'channel music';
    root.innerHTML = '<div class="mu-stage"><div class="mu-player"></div></div><div class="mu-side"></div>';
    container.append(root);
    sel = 0; note = '';
    off = musicPlayer.onChange(render);
    api.onButton(onButton);
    render();
    requestAnimationFrame(() => musicPlayer.setFull(root.querySelector('.mu-player'))); // the player card moves onto this screen
  },
  unmount() {
    off?.();
    musicPlayer.setFull(null);
    root?.remove();
    api = root = null;
  },
};
