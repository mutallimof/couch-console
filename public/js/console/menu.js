// Home menu: a 4-column grid of tiles, with a focused tile, plus a clock bar.
// The router (main.js) feeds it pointer hovers and D-pad moves, and asks which tile to open.
// Games can sit in folders (Phase 43): a game's .game.json says `"folder": "arcade"` and
// folders.json says how the folder looks. A folder tile opens a sub-grid; B or the Back tile returns.

const COLUMNS = 4;
const BACK_ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M30 10 16 24l14 14"/></svg>`;

export function createMenu({ grid, clock, date, crumb, apps, folders = {}, onFocusChange }) {
  let focus = 0;
  let view = null; // null = home, or a folder id
  let tiles = [], entries = [], total = 12;

  // Folder tiles (only folders that have games), then the games that aren't in a folder.
  const inFolder = (id) => apps.filter((a) => a.folder === id);
  const rootEntries = () => {
    const items = apps.filter((a) => !a.folder || !folders[a.folder]).map((app) => ({ sort: app.order ?? 99, entry: app }));
    for (const [id, f] of Object.entries(folders)) {
      const list = inFolder(id);
      if (!list.length) continue;
      items.push({ sort: f.order ?? 50, entry: { isFolder: true, id, title: f.title, color: f.color, icon: miniGrid(f, list), apps: list } });
    }
    return items.sort((a, b) => a.sort - b.sort).map((x) => x.entry);
  };
  // A folder's tile: its own icon is hidden behind a 2x2 preview of the games inside
  const miniGrid = (f, list) => `<div class="mini-grid">${list.slice(0, 4).map((a) => `<span>${a.icon}</span>`).join('')}</div>`;

  function render() {
    entries = view
      ? [{ isBack: true, title: 'Back', color: '#5B6577', icon: BACK_ICON }, ...inFolder(view)]
      : rootEntries();
    total = Math.max(12, Math.ceil(entries.length / COLUMNS) * COLUMNS);
    grid.style.setProperty('--rows', total / COLUMNS);
    grid.innerHTML = '';
    tiles = [];
    for (let i = 0; i < total; i++) {
      const app = entries[i];
      const el = document.createElement('div');
      el.className = app ? `tile${app.isFolder ? ' folder' : ''}` : 'tile empty';
      el.style.setProperty('--i', i); // entrance stagger order
      if (app) {
        el.dataset.tile = i;
        el.style.setProperty('--tile', app.color);
        el.innerHTML = `<div class="tile-icon">${app.icon}</div><div class="tile-title">${app.title}</div>`;
      }
      grid.append(el);
      tiles.push(el);
    }
    if (crumb) {
      crumb.hidden = !view;
      crumb.textContent = view ? `Home › ${folders[view]?.title || view}` : '';
    }
  }

  function setFocus(i, silent = false) {
    if (i === focus && tiles[i]?.classList.contains('focused')) return;
    if (!entries[i]) return;
    focus = i;
    tiles.forEach((t, j) => t.classList.toggle('focused', j === i));
    if (!silent) onFocusChange?.(i % COLUMNS); // the column, so each one can sound a bit different
  }

  render();
  tiles[0].classList.add('focused');

  // ---- Clock ----
  function tickClock() {
    const now = new Date();
    clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    date.textContent = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  }
  tickClock();
  setInterval(tickClock, 1000);

  return {
    // The cursor is over this element: focus the tile it belongs to (if any).
    hover(el) {
      const tile = el?.closest?.('[data-tile]');
      if (tile) setFocus(Number(tile.dataset.tile));
    },
    // D-pad: walk in a direction until we land on a real tile (or hit the edge).
    move(dir) {
      const [dx, dy] = { UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0] }[dir] || [0, 0];
      let col = focus % COLUMNS;
      let row = Math.floor(focus / COLUMNS);
      const rows = total / COLUMNS;
      for (;;) {
        col += dx; row += dy;
        if (col < 0 || col >= COLUMNS || row < 0 || row >= rows) return;
        const i = row * COLUMNS + col;
        if (entries[i]) return setFocus(i);
      }
    },
    // A game, or a folder ({ isFolder }) or the Back tile ({ isBack }): main.js decides what A does
    focusedApp: () => entries[focus],
    focusedTile: () => tiles[focus],
    inFolder: () => !!view,
    openFolder(id) {
      view = id;
      render();
      setFocus(entries.length > 1 ? 1 : 0, true);
      tiles[focus].classList.add('focused');
      this.enter();
    },
    // Back to the home grid (returns true if it was in a folder), focusing the folder we left
    back() {
      if (!view) return false;
      const left = view;
      view = null;
      render();
      const i = entries.findIndex((e) => e.isFolder && e.id === left);
      focus = Math.max(0, i);
      tiles[focus].classList.add('focused');
      this.enter();
      return true;
    },
    // Feedback that A landed: the tile sinks in briefly (the game then zooms out of it)
    press() {
      const t = tiles[focus];
      t.classList.add('pressed');
      setTimeout(() => t.classList.remove('pressed'), 110);
    },
    // Play the tiles' entrance (when the menu appears after pairing)
    enter() {
      grid.classList.remove('enter');
      void grid.offsetWidth; // restart the CSS animation
      grid.classList.add('enter');
    },
  };
}
