// Turbo Karts picture quality (no graphics, so it can be tested): the three levels, what each one draws, how many real
// screen pixels the game renders, and the automatic step-down when the laptop can't hold the frame rate.
// The rule: effects are dropped before resolution. The picture is never rendered below the screen's own pixels.

export const LEVELS = ['high', 'medium', 'low'];
export const CHOICES = ['auto', ...LEVELS]; // what Settings offers
export const LABELS = { auto: 'Auto', high: 'High', medium: 'Medium', low: 'Low' };

// What a level draws. views = how many split-screen views share the laptop.
//   high: 4x-quality edges (multisampling), soft contact shadows, outlines, glow · medium: outlines and glow, smoothed edges · low: the plain picture
export function featuresFor(level, views = 1) {
  if (level === 'low') return { post: false, ao: false, msaa: 0, outline: false, bloom: false };
  if (level === 'medium') return { post: true, ao: false, msaa: 0, outline: true, bloom: true };
  return { post: true, ao: views <= 2, msaa: views >= 3 ? 0 : 2, outline: true, bloom: true };
}

// How many drawn pixels per CSS pixel. Real pixels (so nothing is blurred), up to 2x; on a very large high-density
// screen the 2x is trimmed so the picture stays under `budget` pixels, but never under 1x.
export function pixelRatioFor(dpr, cssW, cssH, { max = 2, budget = 6.3e6 } = {}) {
  const want = Math.min(Math.max(1, dpr || 1), max);
  const area = Math.max(1, cssW * cssH);
  const fit = Math.sqrt(budget / area);
  return Math.max(1, Math.min(want, fit));
}

// Auto: start at High; a few seconds under the target frame rate step one level down. It never steps back up in a race
// (a picture that keeps changing is worse than a steady one).
export function createAutoLevel({ start = 'high', lowFps = 50, seconds = 3 } = {}) {
  let level = start, low = 0;
  return {
    get level() { return level; },
    // call once per frame; returns the new level when it changes, otherwise null
    tick(fps, dt) {
      low = fps < lowFps ? low + dt : 0;
      const i = LEVELS.indexOf(level);
      if (low <= seconds || i >= LEVELS.length - 1) return null;
      low = 0; level = LEVELS[i + 1];
      return level;
    },
    reset(to = start) { level = to; low = 0; },
  };
}
