// Phone motion: permission, then the raw sensors are streamed to the console, which turns
// them into a cursor (console/pointer/gyro-pointer.js). Sending raw data instead of a cursor
// position means no calibration and no drift: the console learns this phone's axes itself.
// Also a touchpad fallback (x, y in -1..1) for phones/browsers without motion sensors.

const SAMPLE_INTERVAL_MS = 12; // sensors: at most ~80 samples per second
const SEND_INTERVAL_MS = 15;   // touchpad: ~60 Hz max
const MIN_CHANGE = 0.002;      // touchpad: don't send tiny changes

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// onSample(sample) gets the raw sensors as soon as they change (rate-capped):
//   { alpha, beta, gamma, motion: { rx, ry, rz } | null }
// onPointer(x, y) is for the touchpad: at most ~60 times per second, only when it changed.
export function createMotion({ onSample, onPointer }) {
  const stats = { alpha: null, beta: null, gamma: null, mag: null, gyro: false };
  let rate = null;          // latest gyroscope reading (rotationRate)
  let lastSample = 0;

  // Send the newest reading right away (the freshest data = the least lag), rate-capped.
  function sendSample() {
    const now = performance.now();
    if (stats.alpha == null || now - lastSample < SAMPLE_INTERVAL_MS) return;
    lastSample = now;
    onSample({ alpha: stats.alpha, beta: stats.beta, gamma: stats.gamma, motion: rate });
  }

  function onOrientation(e) {
    if (e.alpha == null || e.beta == null) return;
    stats.alpha = e.alpha; stats.beta = e.beta; stats.gamma = e.gamma;
    sendSample();
  }

  function onMotion(e) {
    // The raw gyroscope reacts faster than the fused orientation, so it's what makes the
    // cursor feel immediate. Units and axes differ between phones; the console learns them.
    const r = e.rotationRate;
    if (r && (r.alpha != null || r.beta != null)) {
      rate = { rx: r.beta || 0, ry: r.gamma || 0, rz: r.alpha || 0 };
      stats.gyro = true;
      sendSample();
    }
    const a = (e.acceleration?.x != null) ? e.acceleration : e.accelerationIncludingGravity;
    if (a?.x != null) stats.mag = Math.hypot(a.x, a.y, a.z);
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

    // Desktops fire no events (or empty ones). Give the sensors 1.5 s to report.
    const t0 = performance.now();
    while (stats.alpha == null && performance.now() - t0 < 1500) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (stats.alpha == null) {
      window.removeEventListener('deviceorientation', onOrientation);
      return { ok: false, reason: 'unsupported' };
    }
    return { ok: true };
  }

  // Touchpad: drag to move the pointer (relative, like a laptop trackpad).
  function attachTouchpad(el) {
    let target = { x: 0, y: 0 };
    let sent = { x: NaN, y: NaN, at: 0 };
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
    // Send loop: every animation frame, rate-limited and change-filtered.
    (function tick(now) {
      const changed = Math.abs(target.x - sent.x) > MIN_CHANGE || Math.abs(target.y - sent.y) > MIN_CHANGE
        || Number.isNaN(sent.x);
      if (changed && now - sent.at >= SEND_INTERVAL_MS) {
        sent = { ...target, at: now };
        onPointer(target.x, target.y);
      }
      requestAnimationFrame(tick);
    })(performance.now());
    return { recenter() { target = { x: 0, y: 0 }; } };
  }

  return { start, attachTouchpad, stats };
}
