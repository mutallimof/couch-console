// Phone motion: permission, calibration, and tilt -> pointer (x, y in -1..1).
// Also a touchpad fallback for phones/browsers without motion sensors.

const SEND_INTERVAL_MS = 15;   // ~60 Hz max
const MIN_CHANGE = 0.002;      // don't send tiny changes

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wrapTo180 = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;

// onPointer(x, y) is called at most ~60 times per second, only when the value changed.
export function createMotion({ onPointer }) {
  const ranges = { rangeX: 25, rangeY: 18 };   // degrees for a full-screen sweep
  const stats = { alpha: null, beta: null, gamma: null, mag: null };
  let calib = null;          // { alpha0, beta0 }; null = calibrate on next reading
  let target = { x: 0, y: 0 };
  let sent = { x: NaN, y: NaN, at: 0 };
  let running = false;

  function onOrientation(e) {
    if (e.alpha == null || e.beta == null) return;
    stats.alpha = e.alpha; stats.beta = e.beta; stats.gamma = e.gamma;
    if (!calib) calib = { alpha0: e.alpha, beta0: e.beta };
    const dYaw = wrapTo180(e.alpha - calib.alpha0);
    const dPitch = e.beta - calib.beta0;
    // Signs: turning left / tilting down moves the cursor left / down.
    target = {
      x: clamp(-dYaw / ranges.rangeX, -1, 1),
      y: clamp(-dPitch / ranges.rangeY, -1, 1),
    };
  }

  // Only used for the debug readout for now (swing detection comes later).
  function onMotion(e) {
    const a = (e.acceleration?.x != null) ? e.acceleration : e.accelerationIncludingGravity;
    if (a?.x == null) return;
    stats.mag = Math.hypot(a.x, a.y, a.z);
  }

  // Send loop: runs every animation frame, rate-limited and change-filtered.
  function tick(now) {
    if (!running) return;
    const changed = Math.abs(target.x - sent.x) > MIN_CHANGE || Math.abs(target.y - sent.y) > MIN_CHANGE
      || Number.isNaN(sent.x);
    if (changed && now - sent.at >= SEND_INTERVAL_MS) {
      sent = { ...target, at: now };
      onPointer(target.x, target.y);
    }
    requestAnimationFrame(tick);
  }

  function startLoop() {
    if (running) return;
    running = true;
    requestAnimationFrame(tick);
  }

  // Must be called from a tap (iPhone only shows the permission prompt then).
  // Resolves to { ok: true } or { ok: false, reason: 'denied' | 'unsupported' }.
  async function start() {
    // Both requests are made right away, inside the tap, before any await.
    const asks = [globalThis.DeviceOrientationEvent, globalThis.DeviceMotionEvent]
      .filter((E) => typeof E?.requestPermission === 'function')
      .map((E) => E.requestPermission());
    const answers = await Promise.allSettled(asks);
    if (answers.some((a) => a.status === 'rejected' || a.value !== 'granted')) {
      return { ok: false, reason: 'denied' };
    }
    if (!('DeviceOrientationEvent' in window) || !window.isSecureContext) {
      return { ok: false, reason: 'unsupported' };
    }

    window.addEventListener('deviceorientation', onOrientation);
    window.addEventListener('devicemotion', onMotion);
    startLoop();

    // Desktops fire no events (or empty ones). Give the sensors 1.5 s to report.
    const t0 = performance.now();
    while (stats.alpha == null && performance.now() - t0 < 1500) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return stats.alpha == null ? { ok: false, reason: 'unsupported' } : { ok: true };
  }

  // Touchpad: drag to move the pointer (relative, like a laptop trackpad).
  function attachTouchpad(el) {
    let last = null;
    const GAIN = 2.5; // a drag across the full pad width moves 2.5 screen-halves
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      last = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener('pointermove', (e) => {
      if (!last) return;
      const r = el.getBoundingClientRect();
      target = {
        x: clamp(target.x + ((e.clientX - last.x) / r.width) * GAIN, -1, 1),
        y: clamp(target.y + ((e.clientY - last.y) / r.height) * GAIN, -1, 1),
      };
      last = { x: e.clientX, y: e.clientY };
    });
    const end = () => { last = null; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    startLoop();
  }

  return {
    start,
    attachTouchpad,
    stats,
    // Next sensor reading becomes the new "center"; the touchpad snaps to center.
    recenter() {
      calib = null;
      target = { x: 0, y: 0 };
    },
    setRanges({ rangeX, rangeY } = {}) {
      if (rangeX > 0) ranges.rangeX = rangeX;
      if (rangeY > 0) ranges.rangeY = rangeY;
    },
  };
}
