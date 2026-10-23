// On-screen cursors: one per player, in the player's color, labeled "P1", "P2", ...
// Positions are x, y in -1..1. Touchpad positions are smoothed every frame; gyro positions
// (pointer/engine.js) arrive every frame already filtered, so they're drawn as they are.

const SMOOTHING = 0.5;   // pos += (target - pos) * SMOOTHING each frame (PLAN says 0.35; raised for a snappier feel)
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
      c = { el, x: cx, y: cy, tx: cx, ty: cy, lastMove: 0, direct: false };
      cursors.set(playerId, c);
    }
    if (color) c.el.style.setProperty('--player', color);
    return c;
  }

  function loop() {
    const now = performance.now();
    for (const c of cursors.values()) {
      const k = c.direct ? 1 : SMOOTHING;
      c.x += (c.tx - c.x) * k;
      c.y += (c.ty - c.y) * k;
      c.el.style.transform = `translate(${c.x}px, ${c.y}px)`;
      c.el.classList.toggle('idle', now - c.lastMove > HIDE_AFTER_MS);
    }
    frame = requestAnimationFrame(loop);
  }
  frame = requestAnimationFrame(loop);

  return {
    // x, y in -1..1 -> screen pixels. direct = no extra smoothing (already filtered).
    move(playerId, x, y, color, direct = false) {
      const c = get(playerId, color);
      const tx = ((x + 1) / 2) * innerWidth, ty = ((y + 1) / 2) * innerHeight;
      if (Math.abs(tx - c.tx) > 0.5 || Math.abs(ty - c.ty) > 0.5) c.lastMove = performance.now();
      c.tx = tx;
      c.ty = ty;
      c.direct = direct;
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
    // 'arrow' (default) or 'crosshair' (for aiming games)
    setStyle(style) {
      layer.classList.toggle('crosshair', style === 'crosshair');
    },
    destroy() {
      cancelAnimationFrame(frame);
      for (const id of [...cursors.keys()]) this.remove(id);
    },
  };
}
