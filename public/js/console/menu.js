// Home menu: a 4-column grid of tiles, with a focused tile, plus a clock bar.
// The router (main.js) feeds it pointer hovers and D-pad moves, and asks which tile to open.

const COLUMNS = 4;

export function createMenu({ grid, clock, date, apps, onFocusChange }) {
  let focus = 0;
  // Real apps first, then faint empty tiles to fill the last row (at least 3 rows)
  const TOTAL_TILES = Math.max(12, Math.ceil(apps.length / COLUMNS) * COLUMNS);
  grid.style.setProperty('--rows', TOTAL_TILES / COLUMNS);

  // ---- Tiles ----
  grid.innerHTML = '';
  const tiles = [];
  for (let i = 0; i < TOTAL_TILES; i++) {
    const app = apps[i];
    const el = document.createElement('div');
    el.className = app ? 'tile' : 'tile empty';
    el.style.setProperty('--i', i); // entrance stagger order
    if (app) {
      el.dataset.tile = i;
      el.style.setProperty('--tile', app.color);
      el.innerHTML = `<div class="tile-icon">${app.icon}</div><div class="tile-title">${app.title}</div>`;
    }
    grid.append(el);
    tiles.push(el);
  }

  function setFocus(i, silent = false) {
    if (i === focus || !apps[i]) return;
    focus = i;
    tiles.forEach((t, j) => t.classList.toggle('focused', j === i));
    if (!silent) onFocusChange?.(i % COLUMNS); // the column, so each one can sound a bit different
  }
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
      const rows = TOTAL_TILES / COLUMNS;
      for (;;) {
        col += dx; row += dy;
        if (col < 0 || col >= COLUMNS || row < 0 || row >= rows) return;
        const i = row * COLUMNS + col;
        if (apps[i]) return setFocus(i);
      }
    },
    focusedApp: () => apps[focus],
    focusedTile: () => tiles[focus],
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
