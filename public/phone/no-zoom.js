// Keeps the phone page from ever zooming. The viewport tag says "no zoom", but iPhone Safari
// ignores it, so a double tap or a pinch would zoom in and stay zoomed (and then the buttons
// are off screen). Three layers: stop the gestures, stop double-tap, and if the page somehow
// ends up zoomed anyway, reset it by itself.
const noop = (e) => e.preventDefault();

// 1. Pinch (Safari's own gesture events) and two-finger moves
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, noop, { passive: false });
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

// 2. Double tap: a second quick tap on the same spot (not in a text box) is swallowed.
// (Two quick taps on different buttons are fine. Buttons that must repeat fast listen to pointerdown.)
let lastEnd = 0, lastX = -999, lastY = -999;
document.addEventListener('touchend', (e) => {
  const now = Date.now(), t = e.changedTouches[0];
  const near = t && Math.hypot(t.clientX - lastX, t.clientY - lastY) < 40;
  if (now - lastEnd < 400 && near && !e.target.closest?.('input, textarea')) e.preventDefault();
  lastEnd = now;
  if (t) { lastX = t.clientX; lastY = t.clientY; }
}, { passive: false });
document.addEventListener('dblclick', noop);

// 3. Zoomed anyway (e.g. a browser accessibility setting)? Re-apply the viewport to snap back.
const meta = document.querySelector('meta[name="viewport"]');
const FIXED = meta?.content || 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
function resetZoom() {
  if (!meta || !window.visualViewport || window.visualViewport.scale <= 1.02) return;
  meta.content = 'width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes';
  requestAnimationFrame(() => { meta.content = FIXED; });
}
window.visualViewport?.addEventListener('resize', resetZoom);
setInterval(resetZoom, 1000);
