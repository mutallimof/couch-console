// Home menu (Phase 55): a status bar, round side buttons, "Recently played" hero tiles, a frosted
// panel that shows the open folder's games, folder tiles with a 2x2 preview, and a dock.
// Everything focusable carries data-focus; the D-pad moves between them by position (spatial
// navigation), the pointer focuses what it hovers, A opens the focused thing (main.js decides what A does).
// Games sit in folders: a game's .game.json says `"folder": "arcade"`, folders.json says how the folder looks.

const PAGE_SIZE = 12;                            // games per page in the panel (6 x 2)
const HUBS = ['photos', 'music', 'present'];     // live in the dock
const PINNED = 'turbo-karts';                    // always the first hero tile
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
let gsap = null; // loaded on the side: the menu must work even if the animation library doesn't
import('gsap').then((m) => { gsap = m.gsap; }).catch(() => {});

const SIDE = [
  { action: 'profile', title: 'Profile', icon: '👤' }, { action: 'activity', title: 'Activity', icon: '🔔' },
  { app: 'photos', title: 'Photos', icon: '📷' }, { action: 'players', title: 'Players', icon: '👥' },
  { app: 'settings', title: 'Settings', icon: '⚙️' }, { action: 'sleep', title: 'Sleep', icon: '🌙' },
];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function createMenu({ grid, clock, date, crumb, apps, folders = {}, icons = [], onFocusChange, els = {} }) {
  const $ = (id) => document.getElementById(id);
  const hero = els.hero || $('hero'), side = els.side || $('side'), folderBox = els.folders || $('folders');
  const dock = els.dock || $('dock'), pager = els.pager || $('pager'), tooltip = els.tooltip || $('tooltip');
  const byId = (id) => apps.find((a) => a.id === id);
  const inFolder = (id) => apps.filter((a) => a.folder === id);
  const folderIds = () => Object.keys(folders).sort((a, b) => (folders[a].order ?? 50) - (folders[b].order ?? 50));

  let openId = folderIds().find((id) => inFolder(id).length) || folderIds()[0] || null;
  let page = 0;
  let focusEl = null;
  let recent = [];
  try { recent = JSON.parse(localStorage.getItem('couch.recent') || '[]'); } catch { /* ignore */ }

  // ---- building the pieces ----
  // One focusable thing. `entry` is what A means (see focusedApp()); `zone` says where it lives.
  function make(tag, cls, zone, entry, html, key) {
    const el = document.createElement(tag);
    el.className = cls;
    el.dataset.focus = `${zone}:${key}`;
    el.dataset.zone = zone;
    el._entry = entry;
    if (html) el.innerHTML = html;
    return el;
  }
  // A game's icon: its rendered diorama if there is one (public/assets/icons), else its own little SVG
  const have = new Set(icons);
  const iconOf = (app) => {
    const id = app.isFolder ? `folder-${app.id}` : app.id;
    if (have.has(id)) return `<img src="/assets/icons/${id}.png" alt="" draggable="false">`;
    return /^(\/|https?:)/.test(app.icon || '') ? `<img src="${app.icon}" alt="">` : app.icon || '';
  };

  function appTile(app, zone, big = false) {
    const el = make('div', `tile gloss${big ? ' big' : ''}`, zone, app, `<div class="tile-icon">${iconOf(app)}</div><div class="tile-title">${esc(app.title)}</div>`, app.id);
    el.dataset.tile = '';
    el.style.setProperty('--tile', app.color);
    return el;
  }

  function heroList() {
    const out = [];
    const add = (a) => { if (a && !out.includes(a) && out.length < 5) out.push(a); };
    add(byId(PINNED));
    for (const id of recent) { const a = byId(id); if (a && a.id !== 'settings') add(a); }
    for (const a of [...apps].sort((x, y) => (x.order ?? 99) - (y.order ?? 99))) if (!HUBS.includes(a.id) && a.id !== 'settings') add(a);
    return out;
  }
  function renderHero() {
    hero.replaceChildren(...heroList().map((a, i) => appTile(a, 'hero', i === 0)));
  }
  function renderSide() {
    side.replaceChildren(...SIDE.map((s) => {
      const app = s.app && byId(s.app);
      if (s.app && !app) return '';
      const entry = app || { isAction: true, action: s.action, title: s.title };
      const el = make('button', 'round-btn', 'side', entry, `<span aria-hidden="true">${s.icon}</span>`, s.app || s.action);
      el.type = 'button';
      el.setAttribute('aria-label', s.title);
      el.dataset.title = s.title;
      if (app) el.style.setProperty('--tile', app.color);
      return el;
    }).filter(Boolean));
  }
  function renderFolders() {
    folderBox.replaceChildren(...folderIds().map((id) => {
      const f = folders[id], list = inFolder(id);
      const mini = [0, 1, 2, 3].map((i) => `<span>${list[i] ? iconOf(list[i]) : ''}</span>`).join('');
      const el = make('div', `tile gloss folder${id === openId ? ' open' : ''}`, 'folder', { isFolder: true, id, title: f.title, color: f.color }, `<div class="mini-grid">${mini}</div><div class="tile-title">${esc(f.title)}</div>`, id);
      el.dataset.tile = '';
      el.style.setProperty('--tile', f.color);
      return el;
    }));
  }
  function renderDock() {
    const items = [
      ...HUBS.map((id) => byId(id)).filter(Boolean),
      ...['party', 'camera'].filter((id) => folders[id]).map((id) => ({ isFolder: true, id, title: folders[id].title, color: folders[id].color, icon: folders[id].icon })),
      { isAction: true, action: 'join', title: 'Join', color: '#3FA9FF', icon: '<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="14" height="14" rx="3"/><rect x="28" y="6" width="14" height="14" rx="3"/><rect x="6" y="28" width="14" height="14" rx="3"/><path d="M28 28h6v6M42 28v14h-8M28 42v-2"/></svg>' },
    ];
    dock.replaceChildren(...items.map((it) => {
      const el = make('div', 'tile dock-item gloss', 'dock', it, `<div class="tile-icon">${iconOf(it)}</div><div class="tile-title">${esc(it.title)}</div>`, it.id || it.action);
      el.dataset.tile = '';
      el.style.setProperty('--tile', it.color || '#5B6577');
      return el;
    }));
  }
  function renderPanel() {
    const list = openId ? inFolder(openId) : [];
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    page = Math.min(page, pages - 1);
    crumb.textContent = openId ? folders[openId].title : '';
    crumb.hidden = !openId;
    const els = list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((a) => appTile(a, 'panel'));
    if (!els.length) {
      const empty = document.createElement('p');
      empty.className = 'panel-empty';
      empty.textContent = openId ? `${folders[openId].title} is empty for now.` : '';
      grid.replaceChildren(empty);
    } else grid.replaceChildren(...els);
    pager.replaceChildren();
    if (pages > 1) {
      for (let i = 0; i < pages; i++) { const d = document.createElement('i'); d.className = i === page ? 'on' : ''; pager.append(d); }
      const mk = (dir, label) => { const b = make('button', 'round-btn page-btn', 'panel', { isPage: true, dir }, label, `page${dir}`); b.type = 'button'; b.dataset.dir = dir; b.setAttribute('aria-label', dir < 0 ? 'Previous page' : 'Next page'); return b; };
      pager.append(mk(-1, '‹'), mk(1, '›'));
    }
    folderBox.querySelectorAll('.folder').forEach((f) => f.classList.toggle('open', f._entry.id === openId));
  }
  function renderAll() { renderHero(); renderSide(); renderFolders(); renderDock(); renderPanel(); }

  // ---- focus ----
  const visible = () => [...document.querySelectorAll('.menu [data-focus]')].filter((el) => el.offsetParent !== null);
  function setFocus(el, silent = false) {
    if (!el || el === focusEl) return;
    focusEl?.classList.remove('focused', 'is-focus');
    focusEl = el;
    el.classList.add('focused', 'is-focus');
    showTooltip(el);
    if (!silent) onFocusChange?.(Math.max(0, visible().indexOf(el)) % 4); // the column: each one sounds a bit different
  }
  function showTooltip(el) {
    const e = el._entry, title = e?.title || el.dataset.title;
    if (!title || el.dataset.zone === 'panel' && e?.isPage) { tooltip.hidden = true; return; }
    tooltip.textContent = title;
    tooltip.hidden = false;
    const r = el.getBoundingClientRect(), t = tooltip.getBoundingClientRect();
    const x = Math.min(innerWidth - t.width - 12, Math.max(12, r.left + r.width / 2 - t.width / 2));
    const below = r.top < t.height + 24; // no room above (the status bar): go under
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${below ? r.bottom + 14 : r.top - t.height - 14}px`;
    tooltip.classList.toggle('below', below);
    if (gsap && !REDUCED) gsap.fromTo(tooltip, { opacity: 0, y: below ? -6 : 6, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.22, ease: 'back.out(2)', overwrite: true });
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

  renderAll();
  const who = $('who');
  if (who) { who._entry = { isAction: true, action: 'profile', title: 'Profile' }; who.dataset.zone = 'status'; }
  setFocus(grid.querySelector('[data-focus]') || hero.querySelector('[data-focus]'), true);

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
    gsap.fromTo(nodes, { opacity: 0, y: 22, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.6)', stagger: 0.025, clearProps: 'transform,opacity', overwrite: true });
  }

  return {
    hover(el) {
      const t = el?.closest?.('[data-focus]');
      if (t && t.closest('.menu')) setFocus(t);
    },
    move(dir) {
      const next = nearest(dir);
      if (next) return setFocus(next);
      // Past the edge of a paged panel: turn the page
      if (focusEl?.dataset.zone === 'panel' && (dir === 'LEFT' || dir === 'RIGHT')) this.turnPage(dir === 'RIGHT' ? 1 : -1);
    },
    // A: a game, { isFolder }, { isAction } or { isPage }
    focusedApp: () => focusEl?._entry,
    focusedTile: () => focusEl,
    inFolder: () => false, // (kept for older callers: the panel always shows a folder)
    // A on a folder tile: show its games in the panel and move there
    openFolder(id) {
      openId = id; page = 0;
      renderFolders(); renderPanel();
      const first = grid.querySelector('[data-focus]');
      setFocus(first || folderBox.querySelector(`[data-focus$=":${id}"]`), true);
      animateIn([...grid.children]);
    },
    turnPage(dir) {
      const pages = Math.ceil(inFolder(openId).length / PAGE_SIZE);
      if (pages < 2) return;
      page = (page + dir + pages) % pages;
      renderPanel();
      setFocus(grid.querySelector('[data-focus]') || pager.querySelector('[data-focus]'), true);
      animateIn([...grid.children]);
    },
    // B: from the panel, hop to its folder tile (true = handled)
    back() {
      if (focusEl?.dataset.zone === 'panel' || focusEl?.dataset.zone === 'hero') {
        const f = folderBox.querySelector(`[data-focus$=":${openId}"]`);
        if (f && f !== focusEl) { setFocus(f); return true; }
      }
      return false;
    },
    // A landed: the tile squashes briefly (the game then zooms out of it)
    press() {
      if (!focusEl) return;
      if (gsap && !REDUCED) gsap.fromTo(focusEl, { scale: 1.04 }, { scale: 0.95, duration: 0.09, yoyo: true, repeat: 1, ease: 'power2.out', clearProps: 'transform' });
      else { focusEl.classList.add('pressed'); const el = focusEl; setTimeout(() => el.classList.remove('pressed'), 110); }
    },
    recordPlay(app) {
      if (!app?.id || app.id === 'settings') return;
      recent = [app.id, ...recent.filter((id) => id !== app.id)].slice(0, 8);
      try { localStorage.setItem('couch.recent', JSON.stringify(recent)); } catch { /* ignore */ }
      const key = focusEl?.dataset.focus;
      renderHero();
      if (key) setFocus(document.querySelector(`.menu [data-focus="${CSS.escape(key)}"]`) || hero.firstChild, true);
    },
    // The menu appears (after pairing / coming back): everything rises in
    enter() { animateIn(visible()); },
    // Status bar bits
    setStatus({ phones, online } = {}) {
      if (phones !== undefined) { $('phones-n').textContent = String(phones); $('phones').classList.toggle('on', phones > 0); }
      if (online !== undefined) $('wifi').classList.toggle('off', !online);
    },
    setProfile({ name, faceHtml } = {}) {
      if (name) $('who-name').textContent = name;
      if (faceHtml) $('who-face').innerHTML = faceHtml;
    },
    refresh() { renderAll(); },
  };
}
