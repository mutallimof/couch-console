// Video channel: YouTube videos from the list in videos.txt (or videos.example.txt),
// played with YouTube's embedded player and controlled from the phone. Needs internet.
//   List:  point or D-pad to choose · A = play · B = back to the menu
//   Video: A = play/pause · ◀ ▶ = −10 s / +10 s · + / − = volume · ▲ ▼ = previous / next · B = list
import { createFocusGrid } from './focus-grid.js';

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true">
  <rect x="5" y="10" width="38" height="28" rx="8" fill="#fff"/><path d="M20 17l12 7-12 7z" fill="#E03131"/>
</svg>`;

let api, root, videos, grid, player, playing, frame, osdTimer, startCheck, ytReady;

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
  grid.setIndex(i, true);
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
  if (button === 'B') return api.exit();
  if (!videos.length) return;
  if (button === 'A') { api.sound.play('select'); play(grid.index); }
  else grid.move(button);
}

function hoverLoop() {
  if (!playing && grid && api) grid.hover(api.pointer(api.players[0]?.playerId));
  frame = requestAnimationFrame(hoverLoop);
}

async function load() {
  try {
    videos = await (await fetch('/api/videos')).json();
  } catch {
    videos = [];
  }
  if (!root) return;
  if (!videos.length) {
    root.innerHTML = `<div class="channel-empty"><h1>Video</h1><p>No videos in the list yet.</p>
      <p>Add YouTube links to <b>videos.txt</b> in the <b>couch-console</b> folder (see videos.example.txt).</p><p class="muted">B = back</p></div>`;
    return;
  }
  root.innerHTML = `<div class="channel-head"><h1>Video</h1><span>A = play · B = menu</span></div>
    <div class="video-grid">${videos.map((v, i) => `<div class="video-tile" data-index="${i}">
      <div class="thumb"><span style="grid-area:1/1">▶</span><img src="https://i.ytimg.com/vi/${v.id}/hqdefault.jpg" alt="" loading="lazy"
        onerror="this.classList.add('broken')"></div><b>${esc(v.title)}</b></div>`).join('')}</div>`;
  grid = createFocusGrid({ items: [...root.querySelectorAll('.video-tile')], columns: 3, onChange: () => api.sound.play('hover') });
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
    videos = []; grid = null; playing = null;
    api.onButton(onButton);
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
