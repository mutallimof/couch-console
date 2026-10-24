// Present tab on the phone (Phase 46): upload slides (a PDF, or pictures you can put in order), start a
// deck, and then this phone is the remote: Prev / Next (or swipe), the current and next slide, a timer,
// a laser pointer you hold, a black screen, and your notes. Someone else presenting? You see where they are.
import { EV } from '../shared/protocol.js';

const THUMB = 240, SLIDE_SIDE = 2000;
const PPT = /\.(pptx?|key|odp)$/i;
const HELP = 'PowerPoint: File → Export → PDF · Keynote: File → Export To → PDF · Google Slides: File → Download → PDF. Then upload the PDF here.';

let ctx, el, decks = [], st = { active: false }, staged = null, timerStart = null, timerId = null, laserHeld = false, notesTimer = null;
const me = () => ctx.me()?.id;
const presenting = () => st.active && st.presenter?.id === me();
const api = (path, method = 'GET', body) => fetch(`/api/party${path}`, { method, headers: { ...ctx.headers(), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }));
const thumb = (d, n = 1) => `/api/party/decks/${d.id}/thumb/${n}`;

// ---- pictures -> slides (made smaller on the phone, with a small thumbnail each) ----
async function toJpeg(file, side, quality) {
  let source;
  try { source = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {
    source = await new Promise((resolve, reject) => { const i = new Image(), u = URL.createObjectURL(file); i.onload = () => resolve(i); i.onerror = reject; i.src = u; });
  }
  const w0 = source.width || source.naturalWidth, h0 = source.height || source.naturalHeight, k = Math.min(1, side / Math.max(w0, h0));
  const c = document.createElement('canvas'); c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
}

async function uploadStaged() {
  const s = staged; if (!s) return;
  const msg = el.querySelector('.pr-msg'); msg.hidden = false; msg.style.color = ''; msg.textContent = 'Sending…';
  const fd = new FormData();
  fd.append('name', el.querySelector('#pr-name').value.trim() || s.name);
  try {
    if (s.kind === 'pdf') fd.append('files', s.files[0], s.files[0].name);
    else for (const f of s.files) { fd.append('files', await toJpeg(f, SLIDE_SIDE, 0.85), 'slide.jpg'); fd.append('thumbs', await toJpeg(f, THUMB, 0.7), 't.jpg'); }
    const res = await fetch('/api/party/decks', { method: 'POST', headers: ctx.headers(), body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { msg.style.color = '#c0392b'; msg.textContent = data.message || ({ TOO_BIG: 'That file is too big (60 MB at most).', NOT_AN_IMAGE: 'Slides must be a PDF or pictures.' }[data.error] || 'Upload failed.'); return; }
    staged = null; await refresh(); ctx.toast('Slides added');
  } catch { msg.style.color = '#c0392b'; msg.textContent = 'No connection to the TV. Is the laptop on? Try again.'; }
}

function stage(files) {
  const list = [...files];
  if (!list.length) return;
  if (list.some((f) => PPT.test(f.name))) { staged = { help: true }; return render(); } // PowerPoint / Keynote: how to make a PDF
  const pdf = list.find((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  if (pdf) staged = { kind: 'pdf', files: [pdf], name: pdf.name.replace(/\.pdf$/i, '') };
  else {
    const pics = list.filter((f) => f.type.startsWith('image/'));
    if (!pics.length) return ctx.toast('Choose a PDF or pictures');
    staged = { kind: 'images', files: pics, name: 'Pictures' };
  }
  render();
}

// ---- the views ----
function render() {
  if (!el) return;
  if (presenting()) return renderRemote();
  clearInterval(timerId); timerId = null;
  const busy = st.active && st.presenter && st.presenter.id !== me();
  el.innerHTML = `
    <h2>Present</h2>
    ${busy ? `<p class="pr-busy">▶ <b>${ctx.esc(st.presenter.name)}</b> is presenting${st.deck ? ` “${ctx.esc(st.deck.name)}”: slide ${st.page}${st.deck.pages ? ` / ${st.deck.pages}` : ''}` : ''}</p>` : ''}
    ${staged?.help ? `<div class="pr-help"><b>A browser can't show PowerPoint or Keynote files.</b><p>${HELP}</p><button type="button" class="join-btn ghost" data-act="dismiss">OK</button></div>` : ''}
    ${staged && !staged.help ? `<div class="pr-stage">
        <label class="muted" for="pr-name">Name</label><input id="pr-name" class="room-input w-name" maxlength="60" value="${ctx.esc(staged.name)}">
        ${staged.kind === 'images' ? `<ol class="pr-order">${staged.files.map((f, i) => `<li><img src="${URL.createObjectURL(f)}" alt=""><span>${i + 1}</span>
            <button type="button" data-up="${i}" aria-label="Move up">▲</button><button type="button" data-down="${i}" aria-label="Move down">▼</button><button type="button" data-drop="${i}" aria-label="Remove">✕</button></li>`).join('')}</ol>`
        : `<p>📄 ${ctx.esc(staged.files[0].name)}</p>`}
        <button type="button" class="join-btn" data-act="upload">⬆ Upload slides</button><button type="button" class="join-btn ghost" data-act="dismiss">Cancel</button>
        <p class="pr-msg" hidden></p></div>` : ''}
    ${!staged ? `<label class="add-photos">＋ Upload slides<input id="pr-file" type="file" accept="application/pdf,image/*,.pdf,.pptx,.ppt,.key,.odp" multiple hidden></label>
      <p class="muted pr-how">A <b>PDF</b> works best (PowerPoint: File → Export → PDF). Or choose several pictures.</p>` : ''}
    <div class="pr-decks">${decks.length ? decks.map((d) => `
      <div class="pr-deck" data-id="${d.id}"><img src="${thumb(d)}" alt="" onerror="this.style.visibility='hidden'">
        <div class="pr-t"><b>${ctx.esc(d.name)}</b><span>${d.pages ? `${d.pages} slides · ` : ''}${ctx.esc(d.byName)}</span></div>
        <button type="button" class="mp-up" data-present="${d.id}" ${busy ? 'disabled' : ''}>▶</button>
        ${d.by === me() ? `<button type="button" class="mp-x" data-del="${d.id}" aria-label="Delete">🗑</button>` : ''}</div>`).join('')
      : '<p class="muted ph-empty">No slides yet.</p>'}</div>`;
}

function renderRemote() {
  const d = st.deck, n = d?.pages || 0;
  const next = Math.min(st.page + 1, n || st.page);
  el.innerHTML = `
    <div class="pr-remote">
      <div class="pr-top"><b>Slide ${st.page}${n ? ` / ${n}` : ''}</b><button type="button" class="pr-timer" data-act="timer" id="pr-timer">0:00</button></div>
      <div class="pr-thumbs">
        <figure><img src="${thumb(d, st.page)}" alt="Now" onerror="this.style.visibility='hidden'"><figcaption>Now</figcaption></figure>
        ${st.page < n ? `<figure><img src="${thumb(d, next)}" alt="Next" onerror="this.style.visibility='hidden'"><figcaption>Next</figcaption></figure>` : '<figure class="pr-end">The end</figure>'}
      </div>
      <div class="pr-swipe" id="pr-swipe">
        <button type="button" class="pr-nav" data-nav="-1" aria-label="Previous">◀ Prev</button>
        <button type="button" class="pr-nav next" data-nav="1" aria-label="Next">Next ▶</button>
      </div>
      <div class="pr-row">
        <button type="button" class="pr-laser" id="pr-laser">🔴 Hold for laser</button>
        <button type="button" class="pr-black ${st.black ? 'on' : ''}" data-act="black">${st.black ? 'Show screen' : 'Black screen'}</button>
      </div>
      <textarea id="pr-notes" class="pr-notes" placeholder="Notes for this slide (only you see them)" ${d?.by === me() ? '' : 'readonly'}>${ctx.esc(st.notes || '')}</textarea>
      <button type="button" class="join-btn ghost" data-act="end">End presentation</button>
    </div>`;
  startTimer();
  bindRemote();
}

function startTimer() {
  timerStart ??= Date.now();
  clearInterval(timerId);
  const tick = () => { const t = el.querySelector('#pr-timer'); if (t) { const s = Math.floor((Date.now() - timerStart) / 1000); t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; } };
  tick(); timerId = setInterval(tick, 1000);
}

function bindRemote() {
  // Prev / Next fire on pointerdown (fast, and two quick taps both count)
  el.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); api('/present/goto', 'POST', { delta: Number(b.dataset.nav) }); navigator.vibrate?.(8); }));
  // Swipe left/right anywhere on the big area
  const area = el.querySelector('#pr-swipe'); let sx = null;
  area.addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) sx = e.clientX; });
  area.addEventListener('pointerup', (e) => { if (sx !== null && Math.abs(e.clientX - sx) > 50) api('/present/goto', 'POST', { delta: e.clientX < sx ? 1 : -1 }); sx = null; });
  // The laser: hold to show, let go to hide. The first press asks for motion permission (guests too).
  const laser = el.querySelector('#pr-laser');
  const on = async (e) => {
    e.preventDefault(); if (laserHeld) return; laserHeld = true; laser.classList.add('on');
    const r = await ctx.laser.start();
    if (!r.ok) { laserHeld = false; laser.classList.remove('on'); return ctx.toast(r.reason === 'insecure' ? 'The laser needs the https link (see the README)' : 'The laser needs motion access'); }
    ctx.laser.emit(true); api('/present/laser', 'POST', { on: true });
  };
  const off = () => { if (!laserHeld) return; laserHeld = false; laser.classList.remove('on'); ctx.laser.emit(false); api('/present/laser', 'POST', { on: false }); };
  laser.addEventListener('pointerdown', on);
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) laser.addEventListener(t, off);
  el.querySelector('#pr-notes').addEventListener('input', (e) => { clearTimeout(notesTimer); notesTimer = setTimeout(() => api(`/decks/${st.deck.id}/notes`, 'PUT', { page: st.page, text: e.target.value }), 600); });
}

async function refresh() {
  const [d, s] = await Promise.all([api('/decks'), api('/present')]);
  if (d.ok) decks = d.data;
  if (s.ok) st = s.data;
  render();
}

export function mount(root, context) {
  ctx = context; el = root;
  el.addEventListener('change', (e) => { if (e.target.id === 'pr-file') { stage(e.target.files); e.target.value = ''; } });
  el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'dismiss') { staged = null; render(); }
    else if (a === 'upload') await uploadStaged();
    else if (a === 'black') api('/present/black', 'POST', {});
    else if (a === 'end') { await api('/present/end', 'POST', {}); timerStart = null; }
    else if (a === 'timer') { timerStart = Date.now(); startTimer(); }
    const up = e.target.closest('[data-up]'), down = e.target.closest('[data-down]'), drop = e.target.closest('[data-drop]');
    if (staged && (up || down || drop)) {
      const f = staged.files, i = Number((up || down || drop).dataset.up ?? (up || down || drop).dataset.down ?? (up || down || drop).dataset.drop);
      if (up && i > 0) [f[i - 1], f[i]] = [f[i], f[i - 1]];
      if (down && i < f.length - 1) [f[i + 1], f[i]] = [f[i], f[i + 1]];
      if (drop) f.splice(i, 1);
      if (!f.length) staged = null;
      render();
    }
    const go = e.target.closest('[data-present]');
    if (go) { timerStart = null; const r = await api('/present/start', 'POST', { deckId: go.dataset.present }); if (!r.ok) ctx.toast(r.data.message || 'Could not start'); }
    const del = e.target.closest('[data-del]');
    if (del && confirm('Delete these slides for everyone?')) { await api(`/decks/${del.dataset.del}`, 'DELETE'); refresh(); }
  });
  ctx.socket.on(EV.PRESENT_STATE, (s) => {
    const was = presenting(); st = s;
    if (presenting() && !was) timerStart = null;
    // While someone types notes or orders pictures, don't rebuild the page under their fingers
    if (document.activeElement?.id === 'pr-notes' && presenting()) { el.querySelector('.pr-top b').textContent = `Slide ${s.page}${s.deck?.pages ? ` / ${s.deck.pages}` : ''}`; return; }
    if (!staged) render();
  });
  ctx.socket.on(EV.PRESENT_DECK, () => { if (!staged) refresh(); });
  refresh();
}
export function show() { if (ctx && !staged) refresh(); }
