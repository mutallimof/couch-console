// On-screen cursors: one per player, in the player's color, labeled "P1", "P2", ...
// Phones send x, y in -1..1; we smooth toward that target every frame.

const SMOOTHING = 0.35;  // pos += (target - pos) * SMOOTHING each frame
const HIDE_AFTER_MS = 3000;

export function createPointers(layer) {
  const cursors = new Map(); // playerId -> { el, x, y, tx, ty, lastMove }
  let frame = 0;

  function get(playerId, color) {
    let c = cursors.get(playerId);
    if (!c) {
      const el = document.createElement('div');
      el.className = 'cursor';
      el.innerHTML = `
        <svg viewBox="0 0 32 32" width="40" height="40" aria-hidden="true">
          <path d="M4 3 L27 15 L16 18 L11 29 Z" fill="currentColor" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>
        </svg>
        <span class="cursor-label">P${playerId}</span>`;
      layer.append(el);
      const cx = innerWidth / 2, cy = innerHeight / 2;
      c = { el, x: cx, y: cy, tx: cx, ty: cy, lastMove: 0 };
      cursors.set(playerId, c);
    }
    if (color) c.el.style.setProperty('--player', color);
    return c;
  }

  function loop() {
    const now = performance.now();
    for (const c of cursors.values()) {
      c.x += (c.tx - c.x) * SMOOTHING;
      c.y += (c.ty - c.y) * SMOOTHING;
      c.el.style.transform = `translate(${c.x}px, ${c.y}px)`;
      c.el.classList.toggle('idle', now - c.lastMove > HIDE_AFTER_MS);
    }
    frame = requestAnimationFrame(loop);
  }
  frame = requestAnimationFrame(loop);

  return {
    // x, y in -1..1 (from the phone) -> screen pixels.
    move(playerId, x, y, color) {
      const c = get(playerId, color);
      c.tx = ((x + 1) / 2) * innerWidth;
      c.ty = ((y + 1) / 2) * innerHeight;
      c.lastMove = performance.now();
    },
    remove(playerId) {
      cursors.get(playerId)?.el.remove();
      cursors.delete(playerId);
    },
    // Smoothed screen position of a player's cursor (null if none).
    position(playerId) {
      const c = cursors.get(playerId);
      return c ? { x: c.x, y: c.y } : null;
    },
    // The page element under a player's cursor (cursors themselves ignore the mouse).
    elementAt(playerId) {
      const p = this.position(playerId);
      return p ? document.elementFromPoint(p.x, p.y) : null;
    },
    destroy() {
      cancelAnimationFrame(frame);
      for (const id of [...cursors.keys()]) this.remove(id);
    },
  };
}
