// Steering wheel: hold the phone sideways (screen facing you) and turn it like a wheel.
// We read which way gravity points in the phone's screen plane; turning the phone rotates it.
// steer = -1 (full left) ... +1 (full right). Calibrated on start and on Recenter.

const FULL_LOCK_DEG = 45;   // turning the phone this far = full steering
const SEND_INTERVAL_MS = 15;
const MIN_CHANGE = 0.01;
// iPhones report acceleration with the opposite sign to Android.
const SIGN = /iPhone|iPad|iPod/.test(navigator.userAgent) ? -1 : 1;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wrapTo180 = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;

export function createWheel({ onSteer }) {
  let zero = null;      // angle that means "straight"
  let steer = 0;
  let sent = { value: NaN, at: 0 };
  let on = false;
  const stats = { angle: null, steer: 0 };

  function onMotion(e) {
    const g = e.accelerationIncludingGravity;
    if (g?.x == null) return;
    // Direction of "up" in the screen plane, in degrees.
    const angle = (Math.atan2(SIGN * g.y, SIGN * g.x) * 180) / Math.PI;
    if (zero == null) zero = angle;
    // Turning clockwise (to the right) increases the angle.
    steer = clamp(wrapTo180(angle - zero) / FULL_LOCK_DEG, -1, 1);
    stats.angle = angle;
    stats.steer = steer;
  }

  function tick(now) {
    if (!on) return;
    if ((Math.abs(steer - sent.value) > MIN_CHANGE || Number.isNaN(sent.value)) && now - sent.at >= SEND_INTERVAL_MS) {
      sent = { value: steer, at: now };
      onSteer(steer);
    }
    requestAnimationFrame(tick);
  }

  window.addEventListener('devicemotion', onMotion);

  return {
    stats,
    start() {
      if (on) return;
      on = true;
      zero = null; // straight = however you hold it right now
      sent = { value: NaN, at: 0 };
      requestAnimationFrame(tick);
    },
    stop() { on = false; },
    recenter() { zero = null; },
  };
}
