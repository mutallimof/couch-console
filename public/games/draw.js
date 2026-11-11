// Draw: hold A to paint at the pointer. B clears, D-pad changes color, +/− changes brush size.
// With 2 phones, both draw at once; each player has their own color and brush size.

const PALETTE = ['#2B3445', '#EB5757', '#F2994A', '#F2C94C', '#27AE60', '#2F80ED', '#9B51E0', '#FFFFFF'];
const SIZES = [4, 8, 14, 22, 34, 50];
const SMOOTH = 0.45;      // 1 = follow the pointer exactly, lower = smoother
const CONFIRM_MS = 3000;  // B must be pressed twice within this time to clear the canvas

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true">
  <path d="M34 6l8 8-20 20-10 2 2-10z" fill="#fff"/>
  <path d="M8 42c4-2 6-6 10-5" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`;

let confirmTimer = 0;
let confirmUntil = 0; // when set, the next B press clears the canvas
let api, root, paint, pctx, overlay, octx, toolbar, frame, resizeObserver;
const brushes = new Map(); // playerId -> { color (palette index), size (SIZES index), last (point while A is held) }

function brush(playerId) {
  if (!brushes.has(playerId)) {
    // P1 starts with dark ink, P2 with red, ...
    brushes.set(playerId, { color: (playerId - 1) % PALETTE.length, size: 1, last: null });
  }
  return brushes.get(playerId);
}

function sizeCanvas(c, keep) {
  const dpr = window.devicePixelRatio || 1;
  const w = root.clientWidth, h = root.clientHeight;
  // Keep what was already painted when the window changes size.
  const copy = keep && c.width ? (() => { const t = document.createElement('canvas'); t.width = c.width; t.height = c.height; t.getContext('2d').drawImage(c, 0, 0); return t; })() : null;
  c.width = w * dpr; c.height = h * dpr;
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (keep) {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    if (copy) g.drawImage(copy, 0, 0, copy.width / dpr, copy.height / dpr);
  }
}

function resize() {
  sizeCanvas(paint, true);
  sizeCanvas(overlay, false);
}

function clear() {
  pctx.fillStyle = '#fff';
  pctx.fillRect(0, 0, paint.width, paint.height);
}

function renderToolbar() {
  const rows = api.players.map(({ playerId, color }) => {
    const b = brush(playerId);
    const swatches = PALETTE.map((c, i) => `<span class="swatch ${i === b.color ? 'on' : ''}" style="background:${c}"></span>`).join('');
    return `<div class="draw-row" style="--player:${color}">
      <span class="draw-badge">P${playerId}</span>
      <div class="swatches">${swatches}</div>
      <div class="size"><span class="size-dot" style="width:${SIZES[b.size]}px;height:${SIZES[b.size]}px;background:${PALETTE[b.color]}"></span></div>
    </div>`;
  }).join('');
  const asking = performance.now() < confirmUntil;
  toolbar.innerHTML = `${rows}<div class="draw-hint${asking ? ' warn' : ''}">${asking ? 'Clear the whole drawing? Press B again to clear · any other button cancels' : 'Hold A draw · D-pad color · +/− size · B clear · HOME menu'}</div>`;
}

function loop() {
  // Paint a line from where each cursor was last frame to where it is now.
  for (const [playerId, b] of brushes) {
    if (!b.last) continue;
    const p = api.pointer(playerId);
    if (!p) continue;
    pctx.strokeStyle = PALETTE[b.color]; pctx.lineWidth = SIZES[b.size];
    pctx.lineCap = 'round'; pctx.lineJoin = 'round';
    // Smooth: the brush eases toward the pointer, and each piece is a curve between midpoints (no jagged corners).
    const s = { x: b.last.x + (p.x - b.last.x) * SMOOTH, y: b.last.y + (p.y - b.last.y) * SMOOTH };
    const m = { x: (b.last.x + s.x) / 2, y: (b.last.y + s.y) / 2 };
    pctx.beginPath(); pctx.moveTo(b.mid.x, b.mid.y); pctx.quadraticCurveTo(b.last.x, b.last.y, m.x, m.y); pctx.stroke();
    b.last = s; b.mid = m;
  }
  // Brush preview ring under each cursor.
  octx.clearRect(0, 0, overlay.width, overlay.height);
  for (const { playerId } of api.players) {
    const p = api.pointer(playerId);
    if (!p) continue;
    octx.strokeStyle = 'rgba(0,0,0,0.35)'; octx.lineWidth = 1.5;
    octx.beginPath(); octx.arc(p.x, p.y, SIZES[brush(playerId).size] / 2 + 1, 0, Math.PI * 2); octx.stroke();
  }
  frame = requestAnimationFrame(loop);
}

function onButton({ playerId, button, state }) {
  const b = brush(playerId);
  if (button === 'A') {
    // Start a stroke with a single dot, so a quick tap leaves a mark.
    const p = state === 'down' ? api.pointer(playerId) : null;
    if (p) {
      pctx.fillStyle = PALETTE[b.color];
      pctx.beginPath(); pctx.arc(p.x, p.y, SIZES[b.size] / 2, 0, Math.PI * 2); pctx.fill();
    }
    if (!p && b.last) { // stroke ends: finish the tail up to the last smoothed point
      pctx.strokeStyle = PALETTE[b.color]; pctx.lineWidth = SIZES[b.size]; pctx.lineCap = 'round';
      pctx.beginPath(); pctx.moveTo(b.mid.x, b.mid.y); pctx.lineTo(b.last.x, b.last.y); pctx.stroke();
    }
    b.last = p; b.mid = p;
    return;
  }
  if (state !== 'down') return;
  if (button === 'B') {
    // Asking first: one press shows a prompt, a second press within 3 s clears.
    if (performance.now() < confirmUntil) { confirmUntil = 0; clear(); api.sound.play('clear'); }
    else { confirmUntil = performance.now() + CONFIRM_MS; api.sound.play('tick'); }
    renderToolbar();
    clearTimeout(confirmTimer); confirmTimer = setTimeout(renderToolbar, CONFIRM_MS + 50);
    return;
  }
  if (confirmUntil) { confirmUntil = 0; renderToolbar(); } // any other button cancels the question
  if (button === 'RIGHT' || button === 'UP') b.color = (b.color + 1) % PALETTE.length;
  else if (button === 'LEFT' || button === 'DOWN') b.color = (b.color + PALETTE.length - 1) % PALETTE.length;
  else if (button === 'PLUS') b.size = Math.min(SIZES.length - 1, b.size + 1);
  else if (button === 'MINUS') b.size = Math.max(0, b.size - 1);
  else return;
  api.sound.play('tick');
  renderToolbar();
}

export default {
  id: 'draw',
  title: 'Draw',
  color: '#7B61FF',
  icon: ICON,
  minPlayers: 1,
  maxPlayers: 4,
  mount(container, gameApi) {
    api = gameApi;
    root = document.createElement('div');
    root.className = 'draw';
    root.innerHTML = '<canvas class="game-canvas"></canvas><canvas class="game-canvas"></canvas><div class="draw-toolbar"></div>';
    container.append(root);
    [paint, overlay] = root.querySelectorAll('canvas');
    toolbar = root.querySelector('.draw-toolbar');
    pctx = paint.getContext('2d');
    octx = overlay.getContext('2d');
    brushes.clear();
    resize();
    clear();
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(root);
    renderToolbar();
    api.onButton(onButton);
    frame = requestAnimationFrame(loop);
  },
  // A player dropped: stop their stroke so it doesn't leave a long line when they're back.
  pause() {
    for (const b of brushes.values()) b.last = null;
  },
  resume() {
    renderToolbar();
  },
  unmount() {
    cancelAnimationFrame(frame);
    clearTimeout(confirmTimer); confirmUntil = 0;
    resizeObserver?.disconnect();
    root?.remove();
    brushes.clear();
    api = root = paint = pctx = overlay = octx = toolbar = resizeObserver = null;
  },
};
