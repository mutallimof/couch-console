// Home menu: ONE grid of big tiles: Turbo Karts as the large hero, then the folders that
// have games (Arcade, Channels...), the hubs (Photos, Music, Present) and Settings. A folder opens as its own
// screen (B = back). Every item is reachable exactly one way.
// Everything focusable carries data-focus; the D-pad moves between them by position (spatial navigation),
// the pointer focuses what it hovers, A opens the focused tile (main.js decides what A does).
// Games sit in folders: a game's .game.json says `"folder": "arcade"`, folders.json says how the folder looks.
// A folder with no games yet is not shown.

const HERO = 'turbo-karts';                       // the large tile
const ORDER = ['arcade', 'party', 'camera', 'channels', 'photos', 'music', 'present', 'settings'];
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
let gsap = null; // loaded on the side: the menu must work even if the animation library doesn't
import('gsap').then((m) => { gsap = m.gsap; }).catch(() => {});

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function createMenu({ grid, clock, date, crumb, apps, folders = {}, icons = [], onFocusChange }) {
  const byId = (id) => apps.find((a) => a.id === id);
  const inFolder = (id) => apps.filter((a) => a.folder === id);
  const liveFolders = () => Object.keys(folders).filter((id) => inFolder(id).length);
  const have = new Set(icons);
  let view = null;     // null = home, or the id of the open folder
  let focusEl = null;
  const homeFocus = {}; // where the focus was on the home screen (restored by B)

  // A game's icon: its rendered diorama if there is one (public/assets/icons), else its own little SVG
  const iconOf = (it) => {
    const id = it.isFolder ? `folder-${it.id}` : it.id;
    if (have.has(id)) return `<img src="/assets/icons/${id}.png" alt="" draggable="false">`;
    return /^(\/|https?:)/.test(it.icon || '') ? `<img src="${it.icon}" alt="">` : it.icon || '';
  };
  const tile = (it, key, cls = '') => {
    const el = document.createElement('div');
    el.className = `tile ui-tile ui-focus ${cls}`;
    el.dataset.focus = key;
    el.dataset.tile = '';
    el._entry = it;
    el.style.setProperty('--tile', it.color);
    el.innerHTML = `<div class="plate">${iconOf(it)}</div><div class="name">${esc(it.title)}</div>`;
    return el;
  };
  const folderEntry = (id) => ({ isFolder: true, id, title: folders[id].title, color: folders[id].color, icon: folders[id].icon });

  // The home grid: hero first, then everything else in a fixed order (unknown folders and games after)
  function homeEntries() {
    const items = [];
    const hero = byId(HERO);
    if (hero) items.push({ it: hero, cls: 'hero', key: hero.id });
    const rest = [];
    for (const id of liveFolders()) rest.push({ it: folderEntry(id), key: `folder:${id}`, rank: ORDER.indexOf(id) < 0 ? 50 : ORDER.indexOf(id) });
    for (const a of apps) if (a.id !== HERO && !a.folder) rest.push({ it: a, key: a.id, rank: ORDER.indexOf(a.id) < 0 ? 60 : ORDER.indexOf(a.id) });
    rest.sort((a, b) => a.rank - b.rank);
    return [...items, ...rest];
  }

  function render() {
    grid.classList.toggle('in-folder', !!view);
    const list = view ? inFolder(view).map((a) => ({ it: a, key: a.id })) : homeEntries();
    grid.replaceChildren(...list.map(({ it, key, cls }) => tile(it, view ? `${view}:${key}` : key, cls || '')));
    crumb.hidden = !view;
    crumb.textContent = view ? folders[view].title : '';
    document.querySelector('.menu')?.classList.toggle('in-folder', !!view);
  }

  // ---- focus ----
  const visible = () => [...grid.querySelectorAll('[data-focus]')].filter((el) => el.offsetParent !== null);
  function setFocus(el, silent = false) {
    if (!el || el === focusEl) return;
    focusEl?.classList.remove('focused', 'is-focus');
    focusEl = el;
    el.classList.add('focused', 'is-focus');
    el.scrollIntoView?.({ block: 'nearest', behavior: 'instant' }); // (a long folder scrolls to the focused tile)
    if (!silent) onFocusChange?.(Math.max(0, visible().indexOf(el)) % 4); // the column: each one sounds a bit different
  }
  const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  function nearest(dir) {
    if (!focusEl) return null;
    const from = focusEl.getBoundingClientRect(), c = center(from);
    let best = null, bestScore = Infinity;
    for (const el of visible()) {
      if (el === focusEl) continue;
      const r = el.getBoundingClientRect(), p = center(r);
      const dx = p.x - c.x, dy = p.y - c.y;
      const ahead = { LEFT: -dx, RIGHT: dx, UP: -dy, DOWN: dy }[dir];
      if (ahead < 8) continue;
      const horizontal = dir === 'LEFT' || dir === 'RIGHT';
      const across = horizontal ? Math.abs(dy) : Math.abs(dx);
      const overlap = horizontal ? Math.min(from.bottom, r.bottom) - Math.max(from.top, r.top) : Math.min(from.right, r.right) - Math.max(from.left, r.left);
      const score = ahead + (overlap > 0 ? across * 0.5 : across * 3);
      if (score < bestScore) { bestScore = score; best = el; }
    }
    return best;
  }

  render();
  setFocus(grid.querySelector('[data-focus]'), true);

  // ---- clock ----
  function tickClock() {
    const now = new Date();
    clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    date.textContent = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  }
  tickClock();
  setInterval(tickClock, 1000);

  function animateIn(nodes) {
    if (!gsap || REDUCED || !nodes.length) return;
    gsap.fromTo(nodes, { opacity: 0, y: 22, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.6)', stagger: 0.03, clearProps: 'transform,opacity', overwrite: true });
  }

  return {
    hover(el) {
      const t = el?.closest?.('[data-focus]');
      if (t && grid.contains(t)) setFocus(t);
    },
    move(dir) { const next = nearest(dir); if (next) setFocus(next); },
    // A: a game, or { isFolder }
    focusedApp: () => focusEl?._entry,
    focusedTile: () => focusEl,
    inFolder: () => !!view,
    // A on a folder: it opens as its own screen
    openFolder(id) {
      homeFocus.key = focusEl?.dataset.focus;
      view = id;
      render();
      setFocus(grid.querySelector('[data-focus]'), true);
      animateIn([...grid.children]);
    },
    // B: close the open folder (true = it was open)
    back() {
      if (!view) return false;
      const left = view;
      view = null;
      render();
      setFocus(grid.querySelector(`[data-focus="${CSS.escape(homeFocus.key || `folder:${left}`)}"]`) || grid.querySelector('[data-focus]'), true);
      animateIn([...grid.children]);
      return true;
    },
    // A landed: the tile squashes briefly (the game then zooms out of it)
    press() {
      if (!focusEl) return;
      if (gsap && !REDUCED) gsap.fromTo(focusEl, { scale: 1.04 }, { scale: 0.95, duration: 0.09, yoyo: true, repeat: 1, ease: 'power2.out', clearProps: 'transform' });
      else { const el = focusEl; el.classList.add('pressed'); setTimeout(() => el.classList.remove('pressed'), 110); }
    },
    // The menu appears (after pairing / coming back): the tiles rise in
    enter() { animateIn(visible()); },
  };
}
