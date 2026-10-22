// Draw: hold A to paint at the pointer. B clears, D-pad changes color, +/− changes brush size.

const PALETTE = ['#2B3445', '#EB5757', '#F2994A', '#F2C94C', '#27AE60', '#2F80ED', '#9B51E0', '#FFFFFF'];
const SIZES = [4, 8, 14, 22, 34, 50];

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true">
  <path d="M34 6l8 8-20 20-10 2 2-10z" fill="#fff"/>
  <path d="M8 42c4-2 6-6 10-5" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`;

let api, root, paint, pctx, overlay, octx, toolbar, frame, resizeObserver;
let colorIdx, sizeIdx;
const strokes = new Map(); // playerId -> last point while A is held (null = not drawing)

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
  toolbar.innerHTML = `
    <div class="swatches">${PALETTE.map((c, i) => `<span class="swatch ${i === colorIdx ? 'on' : ''}" style="background:${c}"></span>`).join('')}</div>
    <div class="size"><span class="size-dot" style="width:${SIZES[sizeIdx]}px;height:${SIZES[sizeIdx]}px;background:${PALETTE[colorIdx]}"></span></div>
    <div class="draw-hint">Hold A draw · D-pad color · +/− size · B clear · HOME menu</div>`;
}

function loop() {
  const color = PALETTE[colorIdx], size = SIZES[sizeIdx];
  // Paint a line from where the cursor was last frame to where it is now.
  for (const [playerId, last] of strokes) {
    if (!last) continue;
    const p = api.pointer(playerId);
    if (!p) continue;
    pctx.strokeStyle = color; pctx.lineWidth = size; pctx.lineCap = 'round'; pctx.lineJoin = 'round';
    pctx.beginPath(); pctx.moveTo(last.x, last.y); pctx.lineTo(p.x, p.y); pctx.stroke();
    strokes.set(playerId, p);
  }
  // Brush preview ring under each cursor.
  octx.clearRect(0, 0, overlay.width, overlay.height);
  for (const pl of api.players) {
    const p = api.pointer(pl.playerId);
    if (!p) continue;
    octx.strokeStyle = 'rgba(0,0,0,0.35)'; octx.lineWidth = 1.5;
    octx.beginPath(); octx.arc(p.x, p.y, size / 2 + 1, 0, Math.PI * 2); octx.stroke();
  }
  frame = requestAnimationFrame(loop);
}

function onButton({ playerId, button, state }) {
  if (button === 'A') {
    // Start a stroke with a single dot, so a quick tap leaves a mark.
    const p = state === 'down' ? api.pointer(playerId) : null;
    if (p) {
      pctx.fillStyle = PALETTE[colorIdx];
      pctx.beginPath(); pctx.arc(p.x, p.y, SIZES[sizeIdx] / 2, 0, Math.PI * 2); pctx.fill();
    }
    strokes.set(playerId, p);
    return;
  }
  if (state !== 'down') return;
  if (button === 'B') { clear(); api.sound.play('clear'); return; }
  if (button === 'RIGHT' || button === 'UP') colorIdx = (colorIdx + 1) % PALETTE.length;
  else if (button === 'LEFT' || button === 'DOWN') colorIdx = (colorIdx + PALETTE.length - 1) % PALETTE.length;
  else if (button === 'PLUS') sizeIdx = Math.min(SIZES.length - 1, sizeIdx + 1);
  else if (button === 'MINUS') sizeIdx = Math.max(0, sizeIdx - 1);
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
  maxPlayers: 1,
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
    colorIdx = 0; sizeIdx = 1;
    strokes.clear();
    resize();
    clear();
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(root);
    renderToolbar();
    api.onButton(onButton);
    frame = requestAnimationFrame(loop);
  },
  unmount() {
    cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    root?.remove();
    strokes.clear();
    api = root = paint = pctx = overlay = octx = toolbar = resizeObserver = null;
  },
};
