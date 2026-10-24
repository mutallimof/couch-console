// Keeps the frame rate up: when the laptop can't keep up, the screen effects are lowered one step at a
// time (and never raised again by themselves, so the picture does not flicker between looks).
//   level 3 = everything · 2 = no ambient occlusion · 1 = no bloom/anti-aliasing library, pixel ratio 1,
//   fewer particles, smaller shadows · 0 = no screen effects at all
// Targets: 60 fps with one player, 45 with split screen. No DOM, so it is tested in Node.
export const LEVELS = ['minimal', 'low', 'medium', 'high'];
export const TARGET_1P = 58; // a little under 60: vsync jitter should not count as "slow"
export const TARGET_2P = 43; // (the goal is 45+)

export function createGovernor({ target = TARGET_1P, slowFor = 2, settleFor = 3, level = 3, onChange = () => {} } = {}) {
  let low = 0, settle = settleFor;
  return {
    get level() { return level; },
    get target() { return target; },
    setTarget(t) { target = t; low = 0; },
    setLevel(l) { level = Math.max(0, Math.min(3, l)); low = 0; settle = settleFor; onChange(level); },
    // call every frame with the measured frames per second and the frame time in seconds
    tick(fps, dt) {
      settle = Math.max(0, settle - dt); // (after a change the new look gets a few seconds to show its frame rate)
      if (settle > 0 || level <= 0 || !fps) { low = 0; return level; }
      low = fps < target ? low + dt : 0;
      if (low >= slowFor) { level--; low = 0; settle = settleFor; onChange(level); }
      return level;
    },
  };
}
