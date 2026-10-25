// Video channel: YouTube videos from the list in videos.txt (or videos.example.txt), or found with
// "Search YouTube" (typed on the phone; needs a free API key, see README). Needs internet.
//   List:  point or D-pad to choose · A = play · B = back (to your list, then to the menu)
//   Video: A = play/pause · ◀ ▶ = −10 s / +10 s · + / − = volume · ▲ ▼ = previous / next · B = list
import { createFocusGrid } from './focus-grid.js';

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true">
  <rect x="5" y="10" width="38" height="28" rx="8" fill="#fff"/><path d="M20 17l12 7-12 7z" fill="#E03131"/>
</svg>`;

let api, root, videos, grid, player, playing, frame, osdTimer, startCheck, ytReady;
let myList = [], canSearch = false, searchTerm = null, typing = false;

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Load YouTube's player script once (it calls window.onYouTubeIframeAPIReady when ready)
function loadYouTube() {
  ytReady ??= new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { ytReady = null; reject(new Error('offline')); };
    document.head.append(s);
  });
  return ytReady;
}

function osd(text) {
  const el = root?.querySelector('.video-osd');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(osdTimer);
  osdTimer = setTimeout(() => el.classList.remove('show'), 1400);
}

async function play(i) {
  playing = { i };
  grid.setIndex(i + 1, true);
  let el = root.querySelector('.video-view');
  if (!el) {
    el = document.createElement('div');
    el.className = 'video-view';
    root.append(el);
  }
  el.innerHTML = `<div class="video-frame"><div id="yt-player"></div></div><div class="video-osd"></div>
    <div class="video-title">${esc(videos[i].title)}</div>`;
  try {
    const YT = await loadYouTube();
    if (!playing || playing.i !== i) return;
    player?.destroy?.();
    player = new YT.Player('yt-player', {
      videoId: videos[i].id,
      width: '100%', height: '100%',
      playerVars: { autoplay: 1, controls: 0, rel: 0, playsinline: 1, modestbranding: 1 },
      events: {
        onReady: (e) => e.target.playVideo(),
        onStateChange: (e) => { if (e.data === YT.PlayerState.ENDED) step(1); },
        onError: () => osd('This video can\'t be played here'),
      },
    });
    // Browsers may block autoplay with sound until the laptop page was clicked
    clearTimeout(startCheck);
    startCheck = setTimeout(() => {
      if (player?.getPlayerState?.() !== 1) osd('Press A to play');
    }, 2500);
  } catch {
    el.innerHTML = '<div class="channel-empty"><h1>No internet?</h1><p>The video player could not load.</p><p class="muted">B = back</p></div>';
  }
}

function closeVideo() {
  playing = null;
  clearTimeout(startCheck);
  player?.destroy?.();
  player = null;
  root.querySelector('.video-view')?.remove();
}

function step(d) {
  if (!playing) return;
  play((playing.i + d + videos.length) % videos.length);
}

function onButton({ button, state }) {
  if (state !== 'down') return;
  if (playing) {
    const p = player;
    if (button === 'B') { closeVideo(); api.sound.play('back'); return; }
    if (button === 'UP') return step(-1);
    if (button === 'DOWN') return step(1);
    if (!p?.getPlayerState) return;
    if (button === 'A') {
      if (p.getPlayerState() === 1) { p.pauseVideo(); osd('❚❚ Paused'); } else { p.playVideo(); osd('▶ Play'); }
    } else if (button === 'LEFT' || button === 'RIGHT') {
      const t = p.getCurrentTime() + (button === 'RIGHT' ? 10 : -10);
      p.seekTo(Math.max(0, t), true);
      osd(button === 'RIGHT' ? '+10 s ▶▶' : '◀◀ −10 s');
    } else if (button === 'PLUS' || button === 'MINUS') {
      const v = Math.max(0, Math.min(100, p.getVolume() + (button === 'PLUS' ? 10 : -10)));
      p.unMute(); p.setVolume(v);
      osd(`Volume ${v}`);
    }
    return;
  }
  if (typing) {
    if (button === 'B') { typing = false; api.setController('pointer'); closeBox(); }
    return;
  }
  if (root.querySelector('.video-box')) { if (button === 'B' || button === 'A') closeBox(); return; }
  if (button === 'B') {
    if (searchTerm) { searchTerm = null; videos = myList; renderList(); api.sound.play('back'); return; }
    return api.exit();
  }
  if (!grid) return;
  if (button === 'A') {
    api.sound.play('select');
    if (grid.index === 0) startSearch(); else play(grid.index - 1);
  } else grid.move(button);
}

function hoverLoop() {
  if (!playing && grid && api) grid.hover(api.pointer(api.players[0]?.playerId));
  frame = requestAnimationFrame(hoverLoop);
}

// The grid: a "Search YouTube" tile first, then the videos (your list or search results)
function renderList() {
  grid = null;
  const head = searchTerm ? `Results for “${esc(searchTerm)}”` : 'Video';
  const help = searchTerm ? 'A = play · B = back to your list' : 'A = play · B = menu';
  const searchTile = `<div class="video-tile search-tile" data-index="0"><div class="thumb"><span>🔍</span></div>
    <b>${canSearch ? (searchTerm ? 'Search again' : 'Search YouTube') : 'Search (needs a key)'}</b></div>`;
  root.innerHTML = `<div class="channel-head"><h1>${head}</h1><span>${help}</span></div>
    <div class="video-grid">${searchTile}${videos.map((v, i) => `<div class="video-tile" data-index="${i + 1}">
      <div class="thumb"><span style="grid-area:1/1">▶</span><img src="${v.thumb || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`}" alt="" loading="lazy"
        onerror="this.classList.add('broken')"></div><b>${esc(v.title)}</b>${v.channel ? `<small>${esc(v.channel)}</small>` : ''}</div>`).join('')}</div>
    ${!videos.length && !searchTerm ? '<p class="video-empty">Your list is empty: add links to videos.txt (see videos.example.txt), or search.</p>' : ''}`;
  grid = createFocusGrid({ items: [...root.querySelectorAll('.video-tile')], columns: 3, onChange: () => api.sound.play('hover') });
  if (videos.length) grid.setIndex(1, true);
}

function startSearch() {
  if (!canSearch) {
    osdBox('<h1>YouTube search needs a key</h1><p>Make a free <b>YouTube Data API key</b> and put it in <b>config.json</b><br>in the couch-console folder. See “YouTube search” in README.md.</p><p class="muted">B = back</p>');
    return;
  }
  typing = true;
  api.setController('keyboard', 'Search YouTube');
  osdBox('<h1>Type on your phone…</h1><p>Write what you want to watch and press <b>Send</b>.</p><p class="muted">B or Cancel = back</p>');
}

function osdBox(html) {
  let el = root.querySelector('.video-box');
  if (!el) { el = document.createElement('div'); el.className = 'video-box'; root.append(el); }
  el.innerHTML = html;
}
function closeBox() { root.querySelector('.video-box')?.remove(); }

async function onText({ text }) {
  if (!typing) return;
  typing = false;
  api.setController('pointer');
  if (!text) { closeBox(); return; }
  osdBox(`<h1>Searching for “${esc(text)}”…</h1>`);
  try {
    const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(text)}`);
    const data = await res.json();
    if (!root) return;
    if (!res.ok) throw new Error(data.error === 'NO_KEY' ? 'No YouTube key yet (see README).' : data.error);
    searchTerm = text;
    videos = data;
    closeBox();
    renderList();
    if (!data.length) osdBox('<h1>Nothing found</h1><p>Try other words.</p><p class="muted">B = back</p>');
  } catch (err) {
    osdBox(`<h1>Search didn't work</h1><p>${esc(err.message || 'Unknown error')}</p><p class="muted">B = back</p>`);
  }
}

async function load() {
  try { myList = await (await fetch('/api/videos')).json(); } catch { myList = []; }
  try { canSearch = (await (await fetch('/api/youtube/status')).json()).search; } catch { canSearch = false; }
  if (!root) return;
  videos = myList;
  renderList();
}

export default {
  id: 'video',
  title: 'Video',
  color: '#E03131',
  icon: ICON,
  minPlayers: 1,
  maxPlayers: 1,
  mount(container, gameApi) {
    api = gameApi;
    root = document.createElement('div');
    root.className = 'channel video';
    root.innerHTML = '<div class="channel-empty"><p>Loading…</p></div>';
    container.append(root);
    videos = []; myList = []; grid = null; playing = null; searchTerm = null; typing = false;
    api.onButton(onButton);
    api.actions([{ key: 'B', label: '‹ Back' }, { key: 'A', label: 'Play / Pause' }, { key: 'LEFT', label: '−10 s' }, { key: 'RIGHT', label: '+10 s' }, { key: 'MINUS', label: 'Vol −' }, { key: 'PLUS', label: 'Vol +' }]); // (on-screen keys, so the pointer can do everything the D-pad can)
    api.onText(onText);
    load();
    frame = requestAnimationFrame(hoverLoop);
  },
  unmount() {
    cancelAnimationFrame(frame);
    clearTimeout(osdTimer);
    if (root) closeVideo();
    root?.remove();
    api = root = grid = null;
  },
};
