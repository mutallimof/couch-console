// The guest page: opened by the "Scan to add photos / a song" QR on the TV. A guest is not a player: no slot, no controller,
// no avatar. It joins the room as a guest (unlimited at once, up to MAX_GUESTS), then only sends photos or a YouTube link,
// through the same server routes (and so the same moderation and fair-queue rules) as every other phone.
import { EV, ROOM_LETTERS, ROOM_CODE_LENGTH } from '../shared/protocol.js';
import { applyTheme, systemPrefersDark } from '../shared/theme.js';
import { prepare } from './photos.js';
import './no-zoom.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const room = (params.get('room') || '').toUpperCase();
const mode = params.get('for') === 'music' ? 'music' : 'photos';
const socket = io();

const ERRORS = {
  TOO_BIG: 'Too big (15 MB at most).', NOT_AN_IMAGE: 'Not a picture.', DISK_FULL: "The laptop's storage is nearly full. Tell the host.",
  LIMIT: "The party's photo limit is reached. Tell the host.", SLOW_DOWN: 'Too many at once: wait a moment, then tap Add photos.',
  NOT_JOINED: 'You are not in this party any more. Reload the page.',
};

// A random id kept on this phone (the same one the remote page uses)
function getClientId() {
  const make = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  try { let id = localStorage.getItem('couch.clientId'); if (!id) localStorage.setItem('couch.clientId', (id = make())); return id; } catch { return make(); }
}
const clientId = getClientId();
const remembered = (() => { try { return localStorage.getItem('couch.guestName') || ''; } catch { return ''; } })();
let joined = false, name = remembered;
try { applyTheme(localStorage.getItem('couch.tvTheme') || (systemPrefersDark() ? 'dark' : 'light')); } catch { applyTheme('light'); }

const headers = () => ({ 'x-couch-room': room, 'x-couch-client': clientId });
const setConn = (state, text) => { $('dot').className = `dot ${state}`; $('conn-text').textContent = text; };

// ---------- Joining (as a guest, always) ----------
function join() {
  if (!new RegExp(`^[${ROOM_LETTERS}]{${ROOM_CODE_LENGTH}}$`).test(room)) { setConn('wait', 'This link is not complete. Scan the code on the TV again.'); return; }
  setConn('wait', 'Joining…');
  socket.emit(EV.REMOTE_JOIN, { room, clientId, name: name || undefined, role: 'guest' }, (res) => {
    if (!res?.ok) { setConn('wait', res?.error === 'NO_ROOM' ? 'The TV is not showing this party any more. Scan the code again.' : 'Could not join. Try again.'); return; }
    joined = true;
    if (res.theme === 'light' || res.theme === 'dark') { applyTheme(res.theme); try { localStorage.setItem('couch.tvTheme', res.theme); } catch { /* ignore */ } }
    setConn('on', `Room ${room}`);
    $('g-add').disabled = false;
  });
}
socket.on('connect', () => { if (room) join(); });
socket.on('disconnect', () => { joined = false; setConn('', 'Connection lost. Reconnecting…'); });
socket.on(EV.REMOTE_REPLACED, () => { /* another tab of this phone took over: nothing to do, uploads still work */ });

// The name is optional; it goes to the server just before something is sent
const nameBox = $('g-name');
nameBox.value = remembered;
nameBox.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameBox.blur(); });
function syncName() {
  const v = nameBox.value.trim();
  if (v === name) return;
  name = v;
  try { localStorage.setItem('couch.guestName', v); } catch { /* ignore */ }
  if (joined) socket.emit(EV.REMOTE_PROFILE, { name: v || 'Guest' });
}
nameBox.addEventListener('change', syncName);

// ---------- Photos ----------
const jobs = { total: 0, done: 0, failed: 0, waiting: 0, pending: 0, dupes: 0, pct: 0, running: 0, queue: [] };
function showStatus() {
  const box = $('g-status'), j = jobs;
  const active = j.queue.length + j.running;
  if (!j.total) { box.innerHTML = '<p class="muted">Pick pictures from your gallery, or take one with the camera.</p>'; return; }
  if (active) {
    const n = Math.min(j.total, j.done + j.failed + j.dupes + 1);
    box.innerHTML = `<p class="g-big-text">Sending ${n} of ${j.total}…</p><div class="g-bar"><i style="width:${Math.round(((j.done + j.failed + j.dupes + j.pct / 100) / j.total) * 100)}%"></i></div><p class="muted">Keep this page open until it says Sent.</p>`;
  } else if (j.done || j.dupes) {
    const sent = j.done + j.dupes;
    box.innerHTML = `<p class="g-sent">✓ Sent</p><p class="g-big-text">${sent} photo${sent === 1 ? '' : 's'} sent to the TV${j.pending ? '<br><span class="muted">The host will check them first.</span>' : ''}</p>${j.failed ? `<p class="muted">${j.failed} did not go through (see below).</p>` : ''}`;
  } else box.innerHTML = '<p class="g-big-text">Nothing was sent.</p>';
  window.onbeforeunload = active ? (e) => { e.preventDefault(); return ''; } : null;
}
function fail(file, message) {
  jobs.failed++;
  const li = document.createElement('li'); li.textContent = `${file.name || 'A photo'}: ${message}`;
  $('g-errors').append(li);
}
function send(file, prepared) {
  return new Promise((resolve) => {
    const fd = new FormData();
    fd.append('photo', prepared.full, 'photo.jpg');
    if (prepared.thumb) fd.append('thumb', prepared.thumb, 'thumb.jpg');
    fd.append('w', String(prepared.w)); fd.append('h', String(prepared.h));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/party/photos');
    for (const [k, v] of Object.entries(headers())) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) { jobs.pct = (e.loaded / e.total) * 100; showStatus(); } };
    xhr.onload = () => {
      let body = {}; try { body = JSON.parse(xhr.responseText); } catch { /* no json */ }
      if (xhr.status === 200 && body.duplicate) jobs.dupes++;
      else if (xhr.status === 200) { jobs.done++; if (body.photo?.pending) jobs.pending++; }
      else fail(file, ERRORS[body.error] || `Upload failed (${xhr.status}).`);
      resolve();
    };
    xhr.onerror = () => { fail(file, 'No connection to the TV. Is the laptop on?'); resolve(); };
    xhr.send(fd);
  });
}
async function pump() {
  while (jobs.running < 2 && jobs.queue.length) {
    const file = jobs.queue.shift();
    jobs.running++; jobs.pct = 0;
    (async () => {
      try { await send(file, await prepare(file)); } finally { jobs.running--; jobs.pct = 0; showStatus(); pump(); }
    })();
  }
  showStatus();
}
function addFiles(files) {
  syncName();
  if (!jobs.queue.length && !jobs.running) { Object.assign(jobs, { total: 0, done: 0, failed: 0, pending: 0, dupes: 0 }); $('g-errors').textContent = ''; } // a new batch
  for (const file of files) {
    if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) { jobs.total++; fail(file, 'Not a picture.'); continue; }
    jobs.total++; jobs.queue.push(file);
  }
  pump();
}

// ---------- Music ----------
function say(text, bad = true) { const m = $('g-msg'); m.hidden = !text; m.textContent = text; m.style.color = bad ? 'var(--c-danger)' : 'var(--c-ok)'; }
async function addSong(link) {
  syncName();
  say('Checking…', false);
  $('g-add').disabled = true;
  try {
    const res = await fetch('/api/party/music/add', { method: 'POST', headers: { ...headers(), 'content-type': 'application/json' }, body: JSON.stringify({ link }) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { say(`✓ Added: ${data.song}`, false); $('g-link').value = ''; }
    else say(data.message || 'Could not add that song.');
  } catch { say('No connection to the TV. Is the laptop on?'); }
  $('g-add').disabled = !joined;
}

// ---------- Wire up the page ----------
document.body.dataset.for = mode;
if (mode === 'photos') {
  $('g-photos').hidden = false;
  $('g-sub').textContent = 'Your pictures show up on the TV.';
  $('g-add').textContent = '📷 Add photos';
  $('g-add').addEventListener('click', () => $('g-file').click());
  $('g-file').addEventListener('change', (e) => { const files = [...e.target.files]; e.target.value = ''; if (files.length) addFiles(files); });
  showStatus();
} else {
  document.title = 'Couch Console Guest: add a song';
  $('g-title').textContent = 'Add a song';
  $('g-sub').textContent = 'It joins the queue and plays on the TV.';
  $('g-music').hidden = false;
  $('g-add').textContent = '＋ Add song';
  const submit = () => { const link = $('g-link').value.trim(); if (link) addSong(link); else say('Paste a YouTube link first.'); };
  $('g-add').addEventListener('click', submit);
  $('g-music').addEventListener('submit', (e) => { e.preventDefault(); if (e.submitter?.id !== 'g-search-btn' && document.activeElement?.id !== 'g-q') submit(); });
  fetch('/api/youtube/status').then((r) => r.json()).then((j) => {
    if (!j.search) return;
    $('g-search').hidden = false;
    $('g-q').addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const q = $('g-q').value.trim(); if (!q) return;
      const box = $('g-results'); box.textContent = 'Searching…';
      try {
        const list = await (await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}`)).json();
        box.textContent = '';
        for (const v of Array.isArray(list) ? list : []) {
          const li = document.createElement('li'), img = document.createElement('img'), t = document.createElement('div'), b = document.createElement('button');
          img.src = v.thumb || ''; img.alt = ''; t.className = 'mp-t'; t.textContent = v.title; b.type = 'button'; b.textContent = '＋'; b.className = 'mp-up'; b.setAttribute('aria-label', `Add ${v.title}`);
          b.addEventListener('click', () => addSong(`https://youtu.be/${v.id}`));
          li.append(img, t, b); box.append(li);
        }
        if (!box.children.length) box.textContent = 'Nothing found.';
      } catch { box.textContent = 'Search did not work.'; }
    });
  }).catch(() => {});
}
