// Music tab on the phone (Phase 45): see what is playing, vote songs up or to skip, and add songs by
// pasting a YouTube link (or searching, if the host set up a YouTube key). Songs play on the TV.
import { EV } from '../shared/protocol.js';

let ctx, el, state = { now: null, queue: [], skips: 0, skipNeeded: 2, paused: false }, view = 'now', canSearch = false;

const mine = (it) => it.by === ctx.me()?.id;
const voted = (it) => it.votes.includes(ctx.me()?.id);

async function api(path, body) {
  const res = await fetch(`/api/party${path}`, { method: body ? 'POST' : 'GET', headers: { ...ctx.headers(), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function render() {
  if (!el) return;
  const { now, queue } = state;
  el.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === view)));
  const box = el.querySelector('.mu-body');
  if (view === 'now') {
    box.innerHTML = now ? `
      <div class="mp-card">
        <img src="${ctx.esc(now.thumb || '')}" alt="">
        <h3>${ctx.esc(now.title)}</h3>
        <p><span class="mp-by" style="background:${now.byColor}">${ctx.esc(now.byEmoji)} ${ctx.esc(now.byName)}</span>${state.paused ? ' · ⏸ paused' : ''}</p>
        <button class="join-btn" type="button" data-skip>⏭ Vote to skip (${state.skips}/${state.skipNeeded})</button>
      </div>
      <p class="muted">${queue.length ? `Up next: ${ctx.esc(queue[0].title)}` : 'Nothing is waiting. Add a song!'}</p>`
      : '<p class="muted mp-empty">Nothing is playing yet.<br>Tap <b>Add</b> and paste a YouTube link.</p>';
  } else if (view === 'queue') {
    box.innerHTML = queue.length ? `<ol class="mp-list">${queue.map((q, i) => `
      <li><span class="mp-n">${i + 1}</span><img src="${ctx.esc(q.thumb || '')}" alt="">
        <div class="mp-t"><b>${ctx.esc(q.title)}</b><span style="color:${q.byColor}">${ctx.esc(q.byEmoji)} ${ctx.esc(q.byName)}</span></div>
        ${mine(q) ? `<button type="button" class="mp-x" data-remove="${q.id}" aria-label="Remove">✕</button>`
          : `<button type="button" class="mp-up ${voted(q) ? 'on' : ''}" data-vote="${q.id}" aria-label="Vote up">👍 ${q.votes.length || ''}</button>`}
      </li>`).join('')}</ol>` : '<p class="muted mp-empty">The queue is empty.</p>';
  } else {
    box.innerHTML = `
      <form class="mp-add" data-add>
        <label class="muted" for="mp-link">Paste a YouTube link</label>
        <input id="mp-link" class="room-input w-name" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://youtu.be/…">
        <button class="join-btn" type="submit">＋ Add song</button>
        <p class="muted mp-how">In the YouTube app: <b>Share → Copy link</b>, then paste it here.</p>
        <p class="mp-msg" id="mp-msg" hidden></p>
      </form>
      ${canSearch ? `<form class="mp-add" data-search><label class="muted" for="mp-q">Or search</label>
        <input id="mp-q" class="room-input w-name" autocomplete="off" placeholder="Song or artist"><button class="join-btn ghost" type="submit">Search</button>
        <div id="mp-results" class="mp-list"></div></form>` : ''}`;
  }
}

function say(text, bad = true) {
  const m = el.querySelector('#mp-msg');
  if (!m) return ctx.toast(text);
  m.hidden = !text; m.textContent = text; m.style.color = bad ? '#c0392b' : '#1e8449';
}

async function add(link) {
  const { ok, data } = await api('/music/add', { link });
  if (ok) { say(`Added: ${data.song}`, false); const i = el.querySelector('#mp-link'); if (i) i.value = ''; }
  else say(data.message || 'Could not add that song.');
}

export function mount(root, context) {
  ctx = context; el = root;
  el.innerHTML = `
    <h2>Music</h2>
    <div class="ph-chips mp-views" role="tablist">
      <button type="button" data-view="now" aria-selected="true">Now playing</button>
      <button type="button" data-view="queue" aria-selected="false">Queue</button>
      <button type="button" data-view="add" aria-selected="false">＋ Add</button>
    </div>
    <div class="mu-body"></div>`;
  el.addEventListener('click', async (e) => {
    const v = e.target.closest('[data-view]');
    if (v) { view = v.dataset.view; return render(); }
    if (e.target.closest('[data-skip]')) {
      const { ok, data } = await api('/music/skip', {});
      ctx.toast(ok ? (data.skipped ? 'Skipped' : `Skip vote ${data.votes}/${data.needed}`) : 'Nothing to skip');
    }
    const rm = e.target.closest('[data-remove]'); if (rm) await api('/music/remove', { id: rm.dataset.remove });
    const up = e.target.closest('[data-vote]'); if (up) await api('/music/vote', { id: up.dataset.vote });
    const pick = e.target.closest('[data-pick]'); if (pick) { view = 'add'; render(); await add(`https://youtu.be/${pick.dataset.pick}`); }
  });
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (e.target.matches('[data-add]')) { const link = e.target.querySelector('input').value.trim(); if (link) { say('Checking…', false); await add(link); } }
    if (e.target.matches('[data-search]')) {
      const q = e.target.querySelector('input').value.trim(); if (!q) return;
      const box = e.target.querySelector('#mp-results'); box.textContent = 'Searching…';
      try {
        const list = await (await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}`)).json();
        box.innerHTML = Array.isArray(list) && list.length ? list.map((v) => `<li><img src="${ctx.esc(v.thumb || '')}" alt=""><div class="mp-t"><b>${ctx.esc(v.title)}</b><span>${ctx.esc(v.channel || '')}</span></div><button type="button" class="mp-up" data-pick="${ctx.esc(v.id)}">＋</button></li>`).join('') : '<li class="muted">No results</li>';
      } catch { box.textContent = 'Search did not work.'; }
    }
  });
  ctx.socket.on(EV.MUSIC_STATE, (s) => {
    state = { now: s.now, queue: s.queue, skips: s.skips, skipNeeded: s.skipNeeded, paused: s.paused };
    if (s.error && s.error.by === ctx.me()?.id) ctx.toast(`Your song "${s.error.title}" can't play on the TV`, 4000);
    if (view !== 'add') render(); // (don't wipe what someone is typing)
  });
  fetch('/api/youtube/status').then((r) => r.json()).then((j) => { canSearch = !!j.search; if (view === 'add') render(); }).catch(() => {});
  render();
  show();
}

export function show() {
  if (!ctx) return;
  api('/music').then(({ ok, data }) => { if (ok) { state = { now: data.now, queue: data.queue, skips: data.skips, skipNeeded: data.skipNeeded, paused: data.paused }; if (view !== 'add') render(); } });
}
