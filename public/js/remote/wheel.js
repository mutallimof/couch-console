// Steering wheel: hold the phone sideways (screen facing you) and turn it like a wheel.
// We read which way gravity points in the phone's screen plane; turning the phone rotates it.
// steer = -1 (full left) ... +1 (full right). Calibrated on start and on Recenter.
// Feel: a small dead zone around straight, a gentle curve (small turns are fine, big turns are quick) and smoothing,
// so the kart doesn't twitch with every shake of the hand. Values are easy to tune here.

const FULL_LOCK_DEG = 40;   // turning the phone this far = full steering
const DEAD_ZONE_DEG = 2.5;  // ...and nothing happens within this much of straight
const CURVE = 1.35;         // > 1: finer control near the middle
const SMOOTHING_PER_S = 16; // how fast the steering follows the phone (higher = snappier)
const SEND_INTERVAL_MS = 15;
const MIN_CHANGE = 0.01;
// iPhones report acceleration with the opposite sign to Android.
const SIGN = /iPhone|iPad|iPod/.test(navigator.userAgent) ? -1 : 1;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wrapTo180 = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;

export function createWheel({ onSteer }) {
  let zero = null;      // angle that means "straight"
  let steer = 0, target = 0, lastTick = 0;
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
    const d = wrapTo180(angle - zero), live = Math.max(0, Math.abs(d) - DEAD_ZONE_DEG) / (FULL_LOCK_DEG - DEAD_ZONE_DEG);
    target = clamp(Math.sign(d) * Math.pow(clamp(live, 0, 1), CURVE), -1, 1);
    stats.angle = angle;
  }

  function tick(now) {
    if (!on) return;
    const dt = Math.min(0.05, (now - (lastTick || now)) / 1000); lastTick = now;
    steer += (target - steer) * (1 - Math.exp(-dt * SMOOTHING_PER_S)); // (smoothing)
    if (Math.abs(target - steer) < 0.004) steer = target;
    stats.steer = steer;
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
      steer = target = 0; lastTick = 0;
      sent = { value: NaN, at: 0 };
      requestAnimationFrame(tick);
    },
    stop() { on = false; },
    recenter() { zero = null; target = 0; },
  };
}
