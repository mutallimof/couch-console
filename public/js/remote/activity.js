// Activity tab on the phone (Phase 55): what everyone has been up to ("Ana added 5 photos").
import { EV } from '../shared/protocol.js';
import { avatarSvg } from '../shared/avatar.js';

let ctx, el, entries = [];

const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 45 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`; };
function render() {
  if (!el) return;
  el.querySelector('.act-list').innerHTML = entries.length ? entries.map((e) => `
    <li class="act-item"><span class="act-face">${e.who.avatar ? avatarSvg(e.who.avatar, 44) : ctx.esc(e.who.emoji)}</span>
    <span class="act-text">${ctx.esc(e.text)}<small>${ago(e.at)}</small></span></li>`).join('')
    : '<li class="muted act-empty">Nothing yet. Add a photo or a song!</li>';
}
async function refresh() {
  try {
    const r = await fetch('/api/party/activity', { headers: ctx.headers() });
    if (r.ok) { entries = (await r.json()).entries; render(); }
  } catch { /* offline: keep what we have */ }
}
export function mount(root, context) {
  ctx = context; el = root;
  el.innerHTML = '<h2>Activity</h2><ul class="act-list"></ul>';
  ctx.socket.on(EV.PARTY_ACTIVITY, ({ entry }) => {
    const i = entries.findIndex((e) => e.id === entry.id);
    if (i >= 0) entries.splice(i, 1);
    entries.unshift(entry);
    render();
  });
  refresh();
}
export function show() { if (ctx) refresh(); }
