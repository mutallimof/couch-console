// The ONE viewer for anything big and flat: slides, photos, pictures from channels (TV), and the phone's own photo viewer.
//   - FIT by default: the whole picture is visible, letterboxed over a soft blurred copy of itself. Never cropped.
//   - "Fit width" shows a tall page at the screen's width and lets you scroll down it. "Fit page" shows all of it.
//   - Zoom (1x - 6x of the fit size) and pan: buttons, wheel, drag and pinch (when `touch: true`), or the commands a phone sends.
//   - Full screen with the Fullscreen API.
// It never changes the picture's shape: the content is drawn at its natural proportions and only moved / scaled by a transform.
//
//   const v = createViewer(host, { touch: true, controls: true })
//   v.setContent(el, logicalWidth, logicalHeight)   // el: <img> or <canvas>; the logical size sets the proportions
//   v.zoomBy(1.25) · v.panBy(dx, dy) (fractions of the screen) · v.toggleFit() · v.reset() · v.fullscreen()
//   v.onSettle = ({ zoom, scale }) => ...           // called shortly after zoom stops: draw a sharper version if you can

export const MIN_ZOOM = 1, MAX_ZOOM = 6;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function createViewer(host, { touch = false, controls = false, onChange = () => {} } = {}) {
  const root = document.createElement('div');
  root.className = 'vw';
  root.innerHTML = '<canvas class="vw-bg" width="32" height="18"></canvas><div class="vw-stage"></div>';
  host.append(root);
  const bg = root.querySelector('.vw-bg'), stage = root.querySelector('.vw-stage');
  let el = null, lw = 1, lh = 1, fit = 'page', zoom = 1, x = 0, y = 0, settleTimer = 0;
  const me = { root, onSettle: null, onFullscreen: null };

  const box = () => ({ cw: root.clientWidth || 1, ch: root.clientHeight || 1 });
  const baseScale = () => { const { cw, ch } = box(); return fit === 'width' ? cw / lw : Math.min(cw / lw, ch / lh); };
  function limits() {
    const { cw, ch } = box(), s = baseScale() * zoom;
    return { mx: Math.max(0, (lw * s - cw) / 2), my: Math.max(0, (lh * s - ch) / 2), s };
  }
  function draw() {
    if (!el) return;
    const { mx, my, s } = limits();
    x = clamp(x, -mx, mx); y = clamp(y, -my, my);
    el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${s})`;
    root.classList.toggle('is-zoomed', zoom > 1.01 || my > 1 && fit === 'width');
    onChange(me.state());
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => me.onSettle?.({ zoom, scale: s, fit }), 220);
  }
  // Page-top first when showing a tall page at its width
  function homePosition() { const { my } = limits(); x = 0; y = fit === 'width' ? my : 0; }

  // A small blurred picture of the content behind it, so the letterbox bars are not dead black (cheap: 32x18 pixels)
  function paintBackdrop() {
    const g = bg.getContext('2d');
    try { g.drawImage(el, 0, 0, bg.width, bg.height); } catch { /* not ready yet */ }
  }

  Object.assign(me, {
    setContent(node, w, h) {
      el?.remove();
      el = node; lw = Math.max(1, w); lh = Math.max(1, h);
      el.classList.add('vw-content');
      el.style.width = `${lw}px`; el.style.height = `${lh}px`;
      stage.append(el);
      zoom = 1; homePosition(); draw();
      const paint = () => { paintBackdrop(); };
      if (el.complete === false) el.addEventListener('load', paint, { once: true }); else paint();
    },
    // Swap the picture for a sharper copy of the same page without moving anything
    swapContent(node) {
      if (!el) return;
      node.className = el.className; node.style.cssText = el.style.cssText;
      el.replaceWith(node); el = node;
    },
    zoomBy(f, cx = 0.5, cy = 0.5) {
      const next = clamp(zoom * f, MIN_ZOOM, MAX_ZOOM);
      if (next === zoom) return;
      // keep the point under (cx, cy) where it is
      const { cw, ch } = box(), k = next / zoom;
      x = (x - (cx - 0.5) * cw) * k + (cx - 0.5) * cw;
      y = (y - (cy - 0.5) * ch) * k + (cy - 0.5) * ch;
      zoom = next;
      if (zoom === 1) homePosition();
      draw();
    },
    setZoom(z) { this.zoomBy(clamp(z, MIN_ZOOM, MAX_ZOOM) / zoom); },
    panBy(dx, dy) { const { cw, ch } = box(); x += dx * cw; y += dy * ch; draw(); },
    panPx(dx, dy) { x += dx; y += dy; draw(); },
    toggleFit() { fit = fit === 'page' ? 'width' : 'page'; zoom = 1; homePosition(); draw(); },
    setFit(f) { if (f !== fit) this.toggleFit(); },
    reset() { fit = 'page'; zoom = 1; homePosition(); draw(); },
    resize() { draw(); },
    state: () => ({ fit, zoom: Math.round(zoom * 100) / 100, zoomed: root.classList.contains('is-zoomed') }),
    get zoomed() { return zoom > 1.01; },
    // Real full screen (needs a click / key press on this page, a phone message alone is not allowed to do it)
    async fullscreen(target = document.documentElement) {
      try {
        if (document.fullscreenElement) { await document.exitFullscreen(); return 'off'; }
        await (target.requestFullscreen || target.webkitRequestFullscreen)?.call(target);
        return document.fullscreenElement ? 'on' : 'unsupported';
      } catch { return 'blocked'; }
    },
    destroy() { clearTimeout(settleTimer); ro.disconnect(); root.remove(); },
  });

  const ro = new ResizeObserver(() => draw());
  ro.observe(root);

  if (touch) {
    // One finger drags (when zoomed or the page is taller than the screen), two fingers pinch, the wheel zooms
    const pts = new Map();
    let pinch = null;
    root.addEventListener('pointerdown', (e) => { root.setPointerCapture?.(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); pinch = null; });
    root.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      const before = { ...p }; p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), r = root.getBoundingClientRect();
        if (pinch) me.zoomBy(d / pinch.d, ((a.x + b.x) / 2 - r.left) / r.width, ((a.y + b.y) / 2 - r.top) / r.height);
        pinch = { d };
      } else if (pts.size === 1) me.panPx(p.x - before.x, p.y - before.y);
    });
    const up = (e) => { pts.delete(e.pointerId); pinch = null; };
    root.addEventListener('pointerup', up); root.addEventListener('pointercancel', up);
    root.addEventListener('wheel', (e) => { e.preventDefault(); const r = root.getBoundingClientRect(); me.zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); }, { passive: false });
    root.style.touchAction = 'none';
  }

  if (controls) {
    if (controls === 'auto') root.classList.add('vw-auto'); // (on the TV: only shown while a cursor is being used)
    const bar = document.createElement('div');
    bar.className = 'vw-controls';
    bar.innerHTML = `<button type="button" data-vw="out" aria-label="Zoom out">−</button><button type="button" data-vw="in" aria-label="Zoom in">+</button>
      <button type="button" data-vw="fit" aria-label="Fit page or width">⤢</button><button type="button" data-vw="fs" aria-label="Full screen">⛶</button>`;
    if (!document.fullscreenEnabled && !document.webkitFullscreenEnabled) bar.querySelector('[data-vw="fs"]').remove(); // (iPhone Safari only does full screen for video)
    root.append(bar);
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-vw]'); if (!b) return;
      const k = b.dataset.vw;
      if (k === 'in') me.zoomBy(1.4); else if (k === 'out') me.zoomBy(1 / 1.4); else if (k === 'fit') me.toggleFit(); else if (k === 'fs') (me.onFullscreen ? me.onFullscreen() : me.fullscreen(host));
    });
  }
  return me;
}
