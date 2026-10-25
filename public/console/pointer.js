// On-screen cursors: one per player, in the player's color, labeled "P1", "P2", ...
// Positions are x, y in -1..1. Touchpad positions are smoothed every frame; gyro positions
// (pointer/engine.js) arrive every frame already filtered, so they're drawn as they are.
// Two extras for feel: a short fading trail, and aim assist (a gentle pull toward the
// target under a slow-moving cursor; main.js decides where that's allowed, i.e. menus only).

const SMOOTHING = 0.5;   // pos += (target - pos) * SMOOTHING each frame (PLAN says 0.35; raised for a snappier feel)
const HIDE_AFTER_MS = 3000;
const TRAIL_MS = 130;    // how much of the recent path the trail shows
const ASSIST_MAX = 0.35; // strongest pull, as a share of the distance to the target's center
const ASSIST_SPEED = 700; // px/s: moving faster than this = no pull at all (you're swinging past)

export function createPointers(layer) {
  const cursors = new Map(); // playerId -> cursor state (see get())
  let frame = 0;
  let assist = null;         // (x, y) -> { x, y, r } target center + radius, or null
  let trailOn = true;

  const trail = document.createElement('canvas');
  trail.className = 'cursor-trail';
  layer.append(trail);
  const tctx = trail.getContext('2d');

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
      // x, y = where the hand points; ox, oy = aim-assist offset; path = recent drawn points
      c = { el, x: cx, y: cy, tx: cx, ty: cy, ox: 0, oy: 0, lastMove: 0, direct: false, color: '#fff', path: [], speed: 0 };
      cursors.set(playerId, c);
    }
    if (color) { c.el.style.setProperty('--player', color); c.color = color; }
    return c;
  }

  function resizeTrail() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    trail.width = innerWidth * dpr;
    trail.height = innerHeight * dpr;
    tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resizeTrail();
  addEventListener('resize', resizeTrail);

  let lastT = performance.now();
  function loop(now) {
    const dt = Math.max(1, now - lastT) / 1000;
    lastT = now;
    tctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const c of cursors.values()) {
      const px = c.x, py = c.y;
      const k = c.direct ? 1 : SMOOTHING;
      c.x += (c.tx - c.x) * k;
      c.y += (c.ty - c.y) * k;
      c.speed += (Math.hypot(c.x - px, c.y - py) / dt - c.speed) * 0.3;

      // Aim assist: pull toward the target's center, strongest halfway in, fading to zero
      // at its edge (so there's no jump when you leave it) and when you move fast.
      let wx = 0, wy = 0;
      const t = assist?.(c.x, c.y);
      if (t) {
        const dx = t.x - c.x, dy = t.y - c.y, d = Math.hypot(dx, dy);
        const slow = Math.max(0, 1 - c.speed / ASSIST_SPEED);
        const pull = ASSIST_MAX * slow * Math.max(0, 1 - d / t.r);
        wx = dx * pull; wy = dy * pull;
      }
      c.ox += (wx - c.ox) * 0.2;
      c.oy += (wy - c.oy) * 0.2;
      const x = c.x + c.ox, y = c.y + c.oy;
      c.el.style.transform = `translate(${x}px, ${y}px)`;
      const idle = now - c.lastMove > HIDE_AFTER_MS;
      c.el.classList.toggle('idle', idle);

      // Trail: the last TRAIL_MS of the drawn path, tapering and fading out
      c.path.push({ x, y, t: now });
      while (c.path.length && now - c.path[0].t > TRAIL_MS) c.path.shift();
      if (trailOn && !idle && c.path.length > 2) {
        tctx.lineCap = 'butt';
        tctx.lineJoin = 'round';
        tctx.strokeStyle = c.color;
        for (let i = 1; i < c.path.length; i++) {
          const f = i / c.path.length; // 0 = oldest ... 1 = newest
          tctx.globalAlpha = 0.35 * f;
          tctx.lineWidth = 2 + 8 * f;
          tctx.beginPath();
          tctx.moveTo(c.path[i - 1].x, c.path[i - 1].y);
          tctx.lineTo(c.path[i].x, c.path[i].y);
          tctx.stroke();
        }
        tctx.globalAlpha = 1;
      }
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
    ids: () => [...cursors.keys()],
    // Is the cursor showing (moved in the last few seconds)? Taps and A only click what it points at while it is.
    active(playerId) {
      const c = cursors.get(playerId);
      return !!c && performance.now() - c.lastMove < HIDE_AFTER_MS;
    },
    // Screen position of a player's cursor, as drawn (null if none).
    position(playerId) {
      const c = cursors.get(playerId);
      return c ? { x: c.x + c.ox, y: c.y + c.oy } : null;
    },
    // The page element under a player's cursor (cursors themselves ignore the mouse).
    elementAt(playerId) {
      const p = this.position(playerId);
      return p ? document.elementFromPoint(p.x, p.y) : null;
    },
    // 'arrow' (default), 'crosshair' (for aiming games; no trail there, it hides the target)
    // or 'none' (the game draws its own, e.g. Juicy Slash's blades)
    setStyle(style) {
      layer.classList.toggle('crosshair', style === 'crosshair');
      layer.classList.toggle('none', style === 'none');
      trailOn = style === 'arrow' || !style;
    },
    // fn(x, y) -> { x, y, r } (the target under the cursor) or null. null = assist off.
    setAssist(fn) { assist = fn; },
    destroy() {
      cancelAnimationFrame(frame);
      for (const id of [...cursors.keys()]) this.remove(id);
    },
  };
}
