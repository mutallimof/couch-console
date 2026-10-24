// Photos tab on the phone (Phase 44): add photos (made smaller and stripped of location data before they leave
// the phone), watch the upload queue, browse the shared album live, and save photos to the phone.
import { EV } from '../shared/protocol.js';

const MAX_SIDE = 3000, THUMB_SIDE = 480, CONCURRENT = 2;
const ERRORS = {
  TOO_BIG: 'That photo is too big (15 MB at most).',
  NOT_AN_IMAGE: 'That file is not a picture.',
  DISK_FULL: "The laptop's storage is nearly full. Tell the host.",
  LIMIT: "The party's photo limit is reached. Tell the host.",
  SLOW_DOWN: 'Too many at once: wait a moment, then tap Retry.',
  NOT_JOINED: 'You are not in this party any more. Reload the page.',
};

let ctx, el, ui = {};
let photos = [];            // the album (what this phone may see)
let filter = 'all';         // 'all' | 'mine'
let selecting = false, selected = new Set();
let viewerIndex = -1;
const queue = [];           // { id, file, state: 'waiting'|'uploading'|'done'|'failed'|'duplicate', pct, message, preview }
const previews = new Map(); // photo id -> object URL of the picture this phone sent (so a waiting photo still shows)
let running = 0, seq = 0;

const url = (p, kind) => `/api/party/photos/${p.id}/${kind}`;
const mine = (p) => p.by === ctx.me()?.id;
const shown = () => (filter === 'mine' ? photos.filter(mine) : photos);

// ---------- Making the picture smaller (and removing GPS) ----------

async function decode(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* older Safari: fall back */ }
  return new Promise((resolve, reject) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(u); resolve(img); }; // (browsers turn the picture upright when they draw it)
    img.onerror = () => { URL.revokeObjectURL(u); reject(new Error('cannot decode')); };
    img.src = u;
  });
}
function draw(source, side, quality) {
  const w0 = source.naturalWidth || source.width, h0 = source.naturalHeight || source.height;
  const k = Math.min(1, side / Math.max(w0, h0)), w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(source, 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve({ blob, w, h }), 'image/jpeg', quality));
}
// -> { full, thumb, w, h }. If the phone can't read the picture (e.g. a HEIC on Chrome), the original goes up as it is.
export async function prepare(file) {
  try {
    const source = await decode(file);
    const full = await draw(source, MAX_SIDE, 0.88), thumb = await draw(source, THUMB_SIDE, 0.8);
    source.close?.();
    if (!full.blob) throw new Error('no blob');
    return { full: full.blob, thumb: thumb.blob, w: full.w, h: full.h };
  } catch {
    return { full: file, thumb: null, w: 0, h: 0 };
  }
}

// ---------- Upload queue ----------

function send(item, prepared) {
  return new Promise((resolve) => {
    const fd = new FormData();
    fd.append('photo', prepared.full, 'photo.jpg');
    if (prepared.thumb) fd.append('thumb', prepared.thumb, 'thumb.jpg');
    fd.append('w', String(prepared.w)); fd.append('h', String(prepared.h));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/party/photos');
    for (const [k, v] of Object.entries(ctx.headers())) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) { item.pct = Math.round((e.loaded / e.total) * 100); renderQueue(); } };
    xhr.onload = () => {
      let body = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* no json */ }
      if (xhr.status === 200 && body.duplicate) { item.state = 'duplicate'; item.message = 'Already in the album'; }
      else if (xhr.status === 200) { item.state = 'done'; item.photoId = body.photo?.id; if (item.preview && body.photo) previews.set(body.photo.id, item.preview); addPhoto(body.photo); }
      else { item.state = 'failed'; item.message = ERRORS[body.error] || `Upload failed (${xhr.status}).`; }
      resolve();
    };
    xhr.onerror = () => { item.state = 'failed'; item.message = 'No connection to the TV. Is the laptop on? Tap Retry.'; resolve(); };
    xhr.send(fd);
  });
}

async function pump() {
  while (running < CONCURRENT) {
    const item = queue.find((q) => q.state === 'waiting');
    if (!item) break;
    running++;
    item.state = 'uploading'; item.pct = 0; item.message = '';
    renderQueue();
    (async () => {
      try {
        item.prepared ??= await prepare(item.file);
        await send(item, item.prepared);
      } finally { running--; renderQueue(); pump(); }
    })();
  }
  window.onbeforeunload = queue.some((q) => ['waiting', 'uploading'].includes(q.state)) ? (e) => { e.preventDefault(); return ''; } : null;
}

function enqueue(files) {
  for (const file of files) {
    if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) { ctx.toast(`${file.name || 'That file'} is not a picture`); continue; }
    queue.push({ id: ++seq, file, state: 'waiting', pct: 0, message: '', preview: URL.createObjectURL(file) });
  }
  renderQueue();
  pump();
}

function renderQueue() {
  const now = Date.now();
  for (const q of queue) if ((q.state === 'done' || q.state === 'duplicate') && now - (q.doneAt ||= now) > 3000) q.hide = true;
  const open = queue.filter((q) => !['done', 'duplicate'].includes(q.state));
  const finished = queue.filter((q) => ['done', 'duplicate'].includes(q.state) && !q.hide);
  ui.queue.hidden = !open.length && !finished.length;
  ui.keep.hidden = !queue.some((q) => ['waiting', 'uploading'].includes(q.state));
  // Waiting, sending and failed photos each get a row; the ones that are done fold into one line
  ui.queue.innerHTML = open.slice(0, 6).map((q) => `
    <div class="up ${q.state}" data-q="${q.id}">
      <img src="${q.preview}" alt="">
      <div class="up-info"><b>${ctx.esc(q.file.name || 'photo')}</b>
        <span>${{ waiting: 'Waiting…', uploading: `Sending ${q.pct}%`, failed: q.message }[q.state]}</span>
        <i style="width:${q.pct}%"></i></div>
      ${q.state === 'failed' ? '<button class="up-retry" type="button" data-retry>Retry</button>' : ''}
    </div>`).join('')
    + (open.length > 6 ? `<p class="muted">…and ${open.length - 6} more</p>` : '')
    + (finished.length ? `<div class="up done"><div class="up-info"><b>✓ ${finished.length} sent${finished.some((q) => q.state === 'duplicate') ? ' (some were already there)' : ''}</b></div></div>` : '');
  clearTimeout(renderQueue.timer);
  if (finished.length) renderQueue.timer = setTimeout(renderQueue, 3200);
}

// ---------- The album ----------

function addPhoto(p) {
  if (!p || photos.some((x) => x.id === p.id)) return;
  photos.unshift(p); // newest first
  photos.sort((a, b) => b.at - a.at);
  renderGrid();
}
function removePhoto(p) {
  photos = photos.filter((x) => x.id !== p.id);
  if (viewerIndex >= 0 && !shown()[viewerIndex]) closeViewer();
  renderGrid();
}

async function refresh() {
  try {
    const res = await fetch('/api/party/photos', { headers: ctx.headers() });
    if (!res.ok) throw new Error(res.status);
    photos = (await res.json()).photos.sort((a, b) => b.at - a.at);
    ui.error.hidden = true;
  } catch {
    ui.error.hidden = false;
    ui.error.textContent = 'No connection to the TV. Is the laptop on? Pull down or tap here to retry.';
  }
  renderGrid();
}

function renderGrid() {
  const list = shown();
  ui.count.textContent = `${list.length} photo${list.length === 1 ? '' : 's'}`;
  ui.empty.hidden = !!list.length;
  ui.empty.textContent = filter === 'mine' ? 'You have not added any photos yet.' : 'No photos yet. Add the first one!';
  ui.grid.innerHTML = list.map((p, i) => `
    <button class="ph ${selected.has(p.id) ? 'sel' : ''}" type="button" data-i="${i}" aria-label="Photo by ${ctx.esc(p.byName)}">
      ${p.noPreview ? '<span class="ph-none">📷<br>No preview</span>' : `<img src="${previews.get(p.id) || url(p, 'thumb')}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ph-none',textContent:'⏳ waiting'}))">`}
      <span class="ph-by" style="background:${p.byColor}">${ctx.esc(p.byEmoji)}</span>
      ${p.pending ? '<span class="ph-wait">Waiting for OK</span>' : ''}
      ${selecting ? `<span class="ph-tick">${selected.has(p.id) ? '✓' : ''}</span>` : ''}
    </button>`).join('');
  ui.saveSel.hidden = !selecting;
  ui.saveSel.disabled = !selected.size;
  ui.saveSel.textContent = selected.size ? `Save ${selected.size} selected` : 'Tick photos to save';
  ui.select.textContent = selecting ? 'Done' : 'Select';
}

// ---------- Saving ----------

async function fileOf(p) {
  const res = await fetch(url(p, 'full'));
  const blob = await res.blob();
  return new File([blob], `${p.byName}-${p.id.slice(0, 6)}.${p.ext}`, { type: blob.type || 'image/jpeg' });
}
function downloadLink(p) {
  const a = document.createElement('a');
  a.href = `${url(p, 'full')}?download=1`;
  a.download = '';
  document.body.append(a); a.click(); a.remove();
}
// The share sheet can save straight into the iPhone's Photos ("Save Image"). Without it (plain http, old browsers) we download.
async function savePhotos(list) {
  if (!list.length) return;
  try {
    const files = [];
    for (const p of list) files.push(await fileOf(p));
    if (navigator.canShare?.({ files })) {
      for (let i = 0; i < files.length; i += 10) { // 10 at a time, so the iPhone share sheet does not choke
        await navigator.share({ files: files.slice(i, i + 10) });
      }
      return;
    }
  } catch (err) {
    if (err?.name === 'AbortError') return; // the person closed the share sheet
  }
  list.forEach((p, i) => setTimeout(() => downloadLink(p), i * 400));
  ctx.toast('Saved to your downloads');
}

async function downloadZip() {
  let info = { count: 0, bytes: 0 };
  try { info = await (await fetch('/api/party/photos-size', { headers: ctx.headers() })).json(); } catch { /* ignore */ }
  const mb = Math.max(1, Math.round(info.bytes / 1048576));
  if (!info.count) return ctx.toast('No photos to download yet');
  const ok = confirm(`Download all ${info.count} photos as one ZIP (${mb} MB)?\n\nOn an iPhone it goes to the Files app. "Select" → "Save selected" puts photos straight into Photos instead.`);
  if (!ok) return;
  const a = document.createElement('a');
  a.href = `/api/party/photos.zip?room=${ctx.getRoom()}&client=${encodeURIComponent(ctx.getClientId())}`;
  a.download = '';
  document.body.append(a); a.click(); a.remove();
}

// ---------- Full-screen viewer (swipe, pinch to zoom) ----------

let zoom = { s: 1, x: 0, y: 0 }, pointers = new Map(), swipeStart = null, pinchStart = null;
function openViewer(i) {
  viewerIndex = i;
  renderViewer();
  ui.viewer.hidden = false;
}
function closeViewer() { viewerIndex = -1; ui.viewer.hidden = true; ui.vimg.removeAttribute('src'); }
function renderViewer() {
  const p = shown()[viewerIndex];
  if (!p) return closeViewer();
  zoom = { s: 1, x: 0, y: 0 }; applyZoom();
  ui.vimg.src = p.noPreview ? '' : url(p, 'full');
  ui.vimg.alt = `Photo by ${p.byName}`;
  ui.vcap.innerHTML = `${ctx.esc(p.byEmoji)} ${ctx.esc(p.byName)} · ${viewerIndex + 1}/${shown().length}`;
  ui.vdel.hidden = !mine(p);
  ui.vsave.disabled = false;
}
const applyZoom = () => { ui.vimg.style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})`; };
function step(d) { const n = shown().length; if (n) { viewerIndex = (viewerIndex + d + n) % n; renderViewer(); } }

function viewerPointers() {
  const stage = ui.vstage;
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) swipeStart = { x: e.clientX, y: e.clientY, t: Date.now(), zx: zoom.x, zy: zoom.y };
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), s: zoom.s }; swipeStart = null; }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      zoom.s = Math.min(5, Math.max(1, pinchStart.s * (Math.hypot(a.x - b.x, a.y - b.y) / pinchStart.d)));
      applyZoom();
    } else if (pointers.size === 1 && swipeStart && zoom.s > 1.05) { // zoomed in: dragging moves the picture
      zoom.x = swipeStart.zx + (e.clientX - swipeStart.x); zoom.y = swipeStart.zy + (e.clientY - swipeStart.y);
      applyZoom();
    }
  });
  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    const was = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (swipeStart && zoom.s <= 1.05 && pointers.size === 0) {
      const dx = was.x - swipeStart.x, dy = was.y - swipeStart.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
    }
    if (pointers.size < 2) pinchStart = null;
    if (!pointers.size) swipeStart = null;
    if (zoom.s <= 1.05) { zoom = { s: 1, x: 0, y: 0 }; applyZoom(); }
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
}

// ---------- The tab ----------

export function mount(root, context) {
  ctx = context; el = root;
  el.innerHTML = `
    <h2>Photos</h2>
    <label class="add-photos">＋ Add photos<input id="ph-file" type="file" accept="image/*" multiple hidden></label>
    <p id="ph-keep" class="ph-keep" hidden>Keep this page open until uploads finish.</p>
    <div id="ph-queue" class="ph-queue" hidden></div>
    <p id="ph-error" class="ph-error" hidden></p>
    <div class="ph-bar">
      <div class="ph-chips" role="tablist"><button type="button" data-f="all" aria-pressed="true">All</button><button type="button" data-f="mine" aria-pressed="false">Mine</button></div>
      <span id="ph-count" class="ph-count"></span>
      <button id="ph-select" class="ph-small" type="button">Select</button>
    </div>
    <button id="ph-save-sel" class="join-btn" type="button" hidden></button>
    <p id="ph-empty" class="muted ph-empty"></p>
    <div id="ph-grid" class="ph-grid"></div>
    <button id="ph-zip" class="join-btn ghost" type="button">⬇ Download all photos (ZIP)</button>
    <div id="ph-viewer" class="ph-viewer" hidden>
      <div id="ph-vstage" class="ph-vstage"><img id="ph-vimg" alt=""></div>
      <div class="ph-vbar"><button id="ph-vclose" type="button" aria-label="Close">✕</button><span id="ph-vcap"></span></div>
      <div class="ph-vact"><button id="ph-vprev" type="button" aria-label="Previous">◀</button><button id="ph-vsave" type="button">⬇ Save</button><button id="ph-vdel" type="button">🗑 Delete</button><button id="ph-vnext" type="button" aria-label="Next">▶</button></div>
    </div>`;
  const $ = (id) => el.querySelector(`#${id}`);
  ui = { file: $('ph-file'), queue: $('ph-queue'), keep: $('ph-keep'), error: $('ph-error'), grid: $('ph-grid'), count: $('ph-count'), empty: $('ph-empty'),
    select: $('ph-select'), saveSel: $('ph-save-sel'), viewer: $('ph-viewer'), vimg: $('ph-vimg'), vcap: $('ph-vcap'), vstage: $('ph-vstage'), vdel: $('ph-vdel'), vsave: $('ph-vsave') };

  ui.file.addEventListener('change', () => { enqueue([...ui.file.files]); ui.file.value = ''; });
  ui.queue.addEventListener('click', (e) => {
    if (!e.target.closest('[data-retry]')) return;
    const q = queue.find((x) => x.id === Number(e.target.closest('[data-q]').dataset.q));
    if (q) { q.state = 'waiting'; q.message = ''; renderQueue(); pump(); }
  });
  ui.error.addEventListener('click', refresh);
  el.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.f;
    el.querySelectorAll('[data-f]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderGrid();
  }));
  ui.select.addEventListener('click', () => { selecting = !selecting; selected.clear(); renderGrid(); });
  ui.saveSel.addEventListener('click', async () => { await savePhotos(photos.filter((p) => selected.has(p.id))); selecting = false; selected.clear(); renderGrid(); });
  ui.grid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]'); if (!b) return;
    const p = shown()[Number(b.dataset.i)];
    if (selecting) { selected.has(p.id) ? selected.delete(p.id) : selected.add(p.id); renderGrid(); } else openViewer(Number(b.dataset.i));
  });
  $('ph-zip').addEventListener('click', downloadZip);
  $('ph-vclose').addEventListener('click', closeViewer);
  $('ph-vprev').addEventListener('click', () => step(-1));
  $('ph-vnext').addEventListener('click', () => step(1));
  ui.vsave.addEventListener('click', async () => { ui.vsave.disabled = true; await savePhotos([shown()[viewerIndex]]); ui.vsave.disabled = false; });
  ui.vdel.addEventListener('click', async () => {
    const p = shown()[viewerIndex];
    if (!p || !confirm('Delete this photo for everyone?')) return;
    const res = await fetch(`/api/party/photos/${p.id}`, { method: 'DELETE', headers: ctx.headers() });
    if (res.ok) { removePhoto(p); ctx.toast('Deleted'); } else ctx.toast('Could not delete');
  });
  viewerPointers();

  ctx.socket.on(EV.PARTY_PHOTO, ({ kind, photo }) => {
    if (kind === 'added') {
      const first = !photos.some((x) => x.id === photo.id);
      addPhoto(photo);
      if (first && !mine(photo)) ctx.toast(`📸 New photo from ${photo.byName}`);
    } else removePhoto(photo);
  });
  ctx.socket.on('connect', refresh); // (after the Wi-Fi came back, catch up)
  refresh();
}

export function show() { refresh(); }
