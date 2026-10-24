// The party's music player on the TV (Phase 45): one YouTube player that keeps playing while you move between
// the menu, Photos and Music. YouTube's rules say the player must stay visible and at least 200 x 200 px, so
// it is a card that is big inside the Music screen and small (still 200+ px) in the corner elsewhere.
// It plays what the server's queue says (server/music.js); when a song ends or fails it tells the server.
// ?fakeyt=1 uses a pretend player (a 5 second "song"), for tests without internet.
import { EV } from '../shared/protocol.js';

const MINI = { w: 200, h: 200 };
const FAKE = new URLSearchParams(location.search).has('fakeyt');

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => reject(new Error('YouTube could not be loaded (is the laptop online?)'));
    document.head.append(s);
  });
}

// A stand-in player with the same few methods
class FakePlayer {
  constructor(host, events) {
    this.events = events; this.el = document.createElement('div'); this.el.className = 'fake-yt'; host.append(this.el);
    queueMicrotask(() => events.onReady?.());
  }
  loadVideoById(id) { clearTimeout(this.t); this.id = id; this.playing = true; this.el.textContent = `▶ ${id}`; this.t = setTimeout(() => this.events.onEnded?.(), 5000); }
  pauseVideo() { this.playing = false; this.el.textContent = `⏸ ${this.id}`; }
  playVideo() { this.playing = true; this.el.textContent = `▶ ${this.id}`; }
  stopVideo() { clearTimeout(this.t); this.playing = false; this.el.textContent = ''; }
}

export function createMusicPlayer({ socket, party }) {
  const dock = document.createElement('div');
  dock.id = 'music-dock';
  dock.hidden = true;
  dock.innerHTML = '<div class="md-video"><div class="md-slot"></div></div><div class="md-title"></div><button class="md-unlock" type="button" hidden>🔊 Click once to enable sound</button>';
  document.body.append(dock);
  const slot = dock.querySelector('.md-slot'), titleEl = dock.querySelector('.md-title'), unlock = dock.querySelector('.md-unlock');

  let state = { now: null, queue: [], paused: false };
  let player = null, ready = null, loadedId = null, mode = 'mini', placeholder = null, gameActive = false, errTimer = null;
  let unlocked = !!navigator.userActivation?.hasBeenActive;

  async function ensurePlayer() {
    if (ready) return ready;
    ready = new Promise((resolve, reject) => {
      const events = {
        onReady: () => resolve(player),
        onEnded: () => ended(), onError: (code) => failed(code),
      };
      if (FAKE) { player = new FakePlayer(slot, events); return; }
      loadYouTubeApi().then(() => {
        player = new window.YT.Player(slot, {
          width: '100%', height: '100%',
          playerVars: { autoplay: 1, controls: 0, rel: 0, playsinline: 1, modestbranding: 1, origin: location.origin },
          events: {
            onReady: () => resolve(player),
            onStateChange: (e) => { if (e.data === 0) ended(); },
            onError: (e) => failed(e.data),
            onAutoplayBlocked: () => { unlocked = false; render(); },
          },
        });
      }).catch((err) => { console.warn(err.message); reject(err); });
    });
    ready.catch(() => { titleEl.textContent = 'Music needs the internet (YouTube).'; });
    return ready;
  }

  const ended = () => { if (state.now) socket.emit(EV.MUSIC_ENDED, { videoId: state.now.videoId }); };
  // YouTube error 101/150 = this video may not be played on other websites; also network errors. Skip after 3 s.
  const failed = (code) => {
    const id = state.now?.videoId;
    if (!id) return;
    titleEl.textContent = 'This song cannot play here. Skipping…';
    clearTimeout(errTimer);
    errTimer = setTimeout(() => socket.emit(EV.MUSIC_ERROR, { videoId: id, code }), 3000);
  };

  function wantPlaying() { return !!state.now && !state.paused && !gameActive; }

  async function sync() {
    render();
    if (!state.now) { loadedId = null; if (player) { try { player.stopVideo(); } catch { /* not ready */ } } return; }
    let p;
    try { p = await ensurePlayer(); } catch { return; }
    if (state.now.videoId !== loadedId) {
      loadedId = state.now.videoId;
      clearTimeout(errTimer);
      p.loadVideoById(state.now.videoId);
    }
    if (wantPlaying()) p.playVideo?.(); else p.pauseVideo?.();
  }

  function render() {
    const show = !!state.now && (!gameActive || mode === 'full');
    dock.hidden = !show;
    dock.classList.toggle('full', mode === 'full');
    dock.classList.toggle('paused', state.paused || gameActive);
    if (state.now && !errTimer) titleEl.textContent = `${state.paused ? '⏸ ' : '♪ '}${state.now.title}`;
    unlock.hidden = unlocked || !state.now;
    place();
  }

  // Put the card where the Music screen's placeholder is (big), or in the corner (small)
  function place() {
    if (dock.hidden) return;
    if (mode === 'full' && placeholder?.isConnected) {
      const r = placeholder.getBoundingClientRect();
      Object.assign(dock.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    } else {
      Object.assign(dock.style, { left: 'auto', top: 'auto', right: '24px', bottom: '100px', width: `${MINI.w}px`, height: `${MINI.h + 28}px` });
    }
    if (mode === 'full') dock.style.right = 'auto';
  }
  window.addEventListener('resize', place);

  // The first click or key press on the TV page lets the browser play sound
  const unlockNow = () => { unlocked = true; render(); if (wantPlaying()) player?.playVideo?.(); };
  for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, unlockNow, { once: false, capture: true });
  unlock.addEventListener('click', unlockNow);

  return {
    el: dock,
    get state() { return state; },
    get unlocked() { return unlocked; },
    onState(next) {
      const wasError = next.error;
      state = { now: next.now, queue: next.queue, paused: next.paused, skips: next.skips, skipNeeded: next.skipNeeded };
      if (wasError) party.toast(`⚠️ ${wasError.byName}'s song "${wasError.title}" can't play here`);
      if (next.added) party.toast(`🎵 ${next.added.byName} added a song`);
      sync();
      listeners.forEach((fn) => fn(state, next));
    },
    // The Music screen shows the card big where its placeholder is; elsewhere it is small in the corner
    setFull(el) { mode = el ? 'full' : 'mini'; placeholder = el; render(); },
    // Games pause the music (a Settings option); closing them resumes it
    setGameActive(on) {
      const pause = party.event?.settings?.pauseMusicInGames !== false;
      gameActive = on && pause;
      sync();
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    place,
  };
}
const listeners = new Set();
