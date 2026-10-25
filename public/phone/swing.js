// Swing detection from the devicemotion event (see .claude/docs/PLAN.md, section 6).
// A swing starts when the acceleration goes above 18, we follow it to its peak,
// and it ends when it drops below 8. Then we report power (0..1) and tilt (-1..1).

const START = 18;
const END = 8;
const COOLDOWN_MS = 500;
const GRAVITY = 9.81;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// onSwing({ power, tilt }); getGamma() returns the phone's left/right tilt in degrees.
export function createSwing({ onSwing, getGamma }) {
  let inSwing = false;
  let peak = 0;
  let lastSwing = 0;
  const stats = { mag: null, swings: 0, lastPower: null };

  function onMotion(e) {
    let mag;
    if (e.acceleration?.x != null) {
      mag = Math.hypot(e.acceleration.x, e.acceleration.y, e.acceleration.z);
    } else if (e.accelerationIncludingGravity?.x != null) {
      // Some phones only give acceleration with gravity in it: take gravity out (roughly).
      const g = e.accelerationIncludingGravity;
      mag = Math.abs(Math.hypot(g.x, g.y, g.z) - GRAVITY);
    } else {
      return;
    }
    stats.mag = mag;
    const now = performance.now();

    if (!inSwing) {
      if (mag > START && now - lastSwing > COOLDOWN_MS) { inSwing = true; peak = mag; }
      return;
    }
    peak = Math.max(peak, mag);
    if (mag < END) {
      inSwing = false;
      lastSwing = now;
      const power = clamp((peak - START) / 22, 0, 1);
      const tilt = clamp((getGamma() || 0) / 45, -1, 1);
      stats.swings++;
      stats.lastPower = power;
      onSwing({ power, tilt });
    }
  }

  return {
    start() { window.addEventListener('devicemotion', onMotion); },
    stats,
  };
}
