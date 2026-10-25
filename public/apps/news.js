// News: a little TV news channel. Big photo, headline and a short summary, one story after another every few seconds, tabs for the
// categories, a ticker of headlines along the bottom and a QR code to read the full story on your phone. The server fetches the free
// public feeds (BBC News, DW, Tagesschau; set the sources and the language in Settings -> News); this screen only shows the headline,
// a teaser and the link, never a full article. A "Today in History" tab (Wikipedia) is the last tab.
//   ◀ ▶ = previous / next story · ▲ = tabs (then ◀ ▶ change the tab) · A = pause / go on · B = back to the menu
import { getNewsPrefs } from '../console/news-prefs.js';
import { createHistory } from './on-this-day.js';
import { smartCover } from '../shared/smart-crop.js';

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">
  <rect x="6" y="8" width="30" height="32" rx="4"/><path d="M36 16h6v20a4 4 0 0 1-4 4H12M13 16h16M13 23h16M13 30h9"/></svg>`;
const ADVANCE_MS = 9000;     // each story stays this long
const REFRESH_MS = 5 * 60 * 1000; // the screen asks the server again (the server itself asks the sources every 10 minutes)

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ago = (at) => {
  if (!at) return '';
  const m = Math.max(0, Math.round((Date.now() - at) / 60000));
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const img = (u) => (u ? `/api/news/image?u=${encodeURIComponent(u)}` : '');

let api, root, tab = 'top', cats = [], items = [], index = 0, paused = false, area = 'content', errors = [], loaded = false, history = null;
let timer = 0, refresh = 0, fetchToken = 0, started = 0, lang = 'en';

const allTabs = () => [...cats.map((c) => [c.id, c.label]), ['history', 'Today in History']];

async function load() {
  const my = ++fetchToken, p = getNewsPrefs();
  lang = p.lang;
  if (tab === 'history') return;
  try {
    const res = await fetch(`/api/news?sources=${p.sources.join(',')}&lang=${p.lang}&category=${tab}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (my !== fetchToken || !root) return;
    cats = data.categories?.length ? data.categories : cats;
    const keep = items[index]?.id;
    items = data.items || []; errors = data.errors || [];
    index = Math.max(0, items.findIndex((i) => i.id === keep));
  } catch {
    if (my !== fetchToken || !root) return;
    errors = [{ error: 'offline' }];
  }
  loaded = true;
  render(true);
}

function setTab(id, silent = false) {
  if (id === tab) return;
  tab = id; index = 0; items = []; loaded = false; errors = [];
  if (!silent) api.sound.play('hover');
  history?.destroy(); history = null;
  if (tab === 'history') { render(); history = createHistory({ api, container: root.querySelector('.nw-body') }); stop(); return; }
  render();
  load();
}

function start() {
  stop();
  if (paused || tab === 'history' || items.length < 2) return;
  started = performance.now();
  const bar = root?.querySelector('.nw-progress i');
  if (bar) { bar.style.transition = 'none'; bar.style.transform = 'scaleX(0)'; void bar.offsetWidth; bar.style.transition = `transform ${ADVANCE_MS}ms linear`; bar.style.transform = 'scaleX(1)'; }
  timer = setTimeout(() => step(1), ADVANCE_MS);
}
const stop = () => { clearTimeout(timer); const bar = root?.querySelector('.nw-progress i'); if (bar) { bar.style.transition = 'none'; bar.style.transform = 'scaleX(0)'; } };

function step(d) {
  if (!items.length) return;
  index = (index + d + items.length) % items.length;
  api.sound.play('hover');
  show();
}

// Show the current story (the page is built once, only the story changes, so the ticker keeps scrolling)
function show() {
  const it = items[index], stage = root.querySelector('.nw-story');
  if (!stage) return render();
  if (!it) return;
  const cat = allTabs().find(([id]) => id === it.category)?.[1] || '';
  stage.classList.remove('in'); void stage.offsetWidth;
  stage.innerHTML = `<figure class="nw-photo">${it.image ? `<img src="${esc(img(it.image))}" alt="" data-smart>` : '<div class="nw-nophoto">📰</div>'}<figcaption class="nw-source">${esc(it.sourceName)}</figcaption></figure>
    <section class="nw-text"><div class="nw-meta"><span class="nw-chip">${esc(cat)}</span><span>${esc(ago(it.at))}</span>${errors.some((e) => e.stale) ? '<span class="nw-offline">offline: older stories</span>' : ''}</div>
      <h2>${esc(it.title)}</h2>${it.summary ? `<p>${esc(it.summary)}</p>` : ''}
      <div class="nw-qr"><img src="/api/qr.svg?text=${encodeURIComponent(it.url)}" alt="QR code for the full story"><span><b>Read it on your phone</b>Scan the code to open the full story.</span></div></section>`;
  stage.classList.add('in');
  smartCover(stage);
  root.querySelector('.nw-count').textContent = `${index + 1} / ${items.length}`;
  start();
}

function render(keepStory = false) {
  if (!root) return;
  const tabs = allTabs().map(([id, label]) => `<button type="button" class="nw-tab ui-focus${id === tab ? ' on' : ''}${id === tab && area === 'tabs' ? ' focused' : ''}" data-ui data-tab="${id}">${esc(label)}</button>`).join('');
  const offline = loaded && !items.length;
  const body = tab === 'history' ? '<div class="nw-body"></div>'
    : !loaded ? '<div class="nw-body"><div class="nw-empty"><div class="nw-spinner"></div><p>Getting the latest news…</p></div></div>'
    : offline ? `<div class="nw-body"><div class="nw-empty"><div class="nw-big">📡</div><h2>${errors.length ? 'No news right now' : 'Nothing here yet'}</h2><p>${errors.length ? 'The internet seems to be away. We keep trying: the headlines come back by themselves.' : 'There are no stories in this category. Try another tab.'}</p></div></div>`
    : '<div class="nw-body"><article class="nw-story"></article><div class="nw-progress"><i></i></div><span class="nw-count"></span></div>';
  const ticker = items.slice(0, 20).map((i) => `<span><b>${esc(i.sourceName)}</b> ${esc(i.title)}</span>`).join('');
  if (keepStory && root.querySelector('.nw-story') && items.length) { // (a refresh: keep the story on screen, update the tabs and the ticker)
    root.querySelector('.nw-tabs').innerHTML = tabs;
    root.querySelector('.nw-ticker-track').innerHTML = ticker + ticker;
    show();
    return;
  }
  root.innerHTML = `<header class="nw-top"><h1>News</h1><nav class="nw-tabs" aria-label="News categories">${tabs}</nav></header>${body}
    <footer class="nw-ticker" aria-hidden="true"><div class="nw-ticker-track">${ticker}${ticker}</div></footer>`;
  const track = root.querySelector('.nw-ticker-track');
  if (track) track.style.animationDuration = `${Math.max(40, items.length * 9)}s`;
  if (tab !== 'history' && items.length) show();
  root.querySelector('.nw-tab.on')?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
}

function onButton({ button, state }) {
  if (state !== 'down') return;
  if (button === 'B') return api.exit();
  const tabs = allTabs(), at = Math.max(0, tabs.findIndex(([id]) => id === tab));
  if (area === 'tabs') {
    if (button === 'LEFT' || button === 'RIGHT') { setTab(tabs[(at + (button === 'RIGHT' ? 1 : tabs.length - 1)) % tabs.length][0]); }
    else if (button === 'DOWN' || button === 'A') { area = 'content'; render(true); }
    return;
  }
  if (tab === 'history') {
    if (!history?.onButton(button) && button === 'UP') { area = 'tabs'; render(); }
    return;
  }
  if (button === 'LEFT') step(-1);
  else if (button === 'RIGHT' || button === 'DOWN') step(1);
  else if (button === 'UP') { area = 'tabs'; render(true); }
  else if (button === 'A') { paused = !paused; api.sound.play('select'); if (paused) stop(); else start(); root.querySelector('.nw-body')?.classList.toggle('paused', paused); }
  else if (button === 'PLUS') { const t = tabs[(at + 1) % tabs.length][0]; setTab(t); }
  else if (button === 'MINUS') { const t = tabs[(at + tabs.length - 1) % tabs.length][0]; setTab(t); }
}

export default {
  id: 'news',
  title: 'News',
  color: '#C92A2A',
  icon: ICON,
  minPlayers: 1,
  maxPlayers: 1,
  mount(container, gameApi) {
    api = gameApi;
    tab = 'top'; index = 0; items = []; cats = [{ id: 'top', label: 'Top' }]; paused = false; area = 'content'; errors = []; loaded = false; history = null;
    root = document.createElement('div');
    root.className = 'channel news';
    container.append(root);
    root.addEventListener('click', (ev) => { const b = ev.target.closest?.('[data-tab]'); if (b) { area = 'content'; setTab(b.dataset.tab); } });
    api.onButton(onButton);
    api.actions([{ key: 'B', label: '‹ Back' }, { key: 'LEFT', label: '‹ Previous' }, { key: 'RIGHT', label: 'Next ›' }, { key: 'A', label: 'Pause / go on' }]);
    render();
    load();
    refresh = setInterval(() => { if (tab !== 'history') load(); }, REFRESH_MS);
  },
  unmount() {
    clearTimeout(timer); clearInterval(refresh); fetchToken++;
    history?.destroy(); history = null;
    root?.remove();
    api = root = null;
  },
};
