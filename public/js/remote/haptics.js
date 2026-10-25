// Haptics: vibration patterns for the moments in a game (drift tiers, boost, hits, item use), with an intensity setting.
// Where the browser can't vibrate (iPhones) every call does nothing, silently. The TV says what happened
// ({ kind: 'tier1' | 'tier2' | 'tier3' | 'boost' | 'hit' | 'item' | 'wall' | 'land' }); the phone decides how it feels.
export const LEVELS = ['off', 'low', 'medium', 'high'];
const SCALE = { off: 0, low: 0.5, medium: 1, high: 1.7 };
// [vibrate, pause, vibrate, ...] in milliseconds, at "medium"
const PATTERNS = {
  tap: [8],
  tier1: [12],
  tier2: [14, 28, 14],
  tier3: [18, 24, 18, 24, 34],
  boost: [34, 36, 70],
  hit: [190],
  wall: [45],
  land: [36],
  item: [18, 22, 18],
};
const KEY = 'couch.haptics';

export const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' && !/iPhone|iPad|iPod/.test(navigator.userAgent);

export function patternFor(kind, level, ms = 0) {
  const k = SCALE[level] ?? 1;
  if (!k) return null;
  const base = PATTERNS[kind] || (ms ? [Math.min(ms, 400)] : null);
  if (!base) return null;
  return base.map((v, i) => (i % 2 ? v : Math.max(4, Math.round(v * k)))); // (strength = length of each buzz; the pauses stay)
}

export function createHaptics() {
  let level = 'medium';
  try { const saved = localStorage.getItem(KEY); if (LEVELS.includes(saved)) level = saved; } catch { /* ignore */ }
  return {
    get level() { return level; },
    get supported() { return canVibrate(); },
    set(next) { level = LEVELS.includes(next) ? next : 'medium'; try { localStorage.setItem(KEY, level); } catch { /* ignore */ } },
    cycle() { this.set(LEVELS[(LEVELS.indexOf(level) + 1) % LEVELS.length]); this.play('tier2'); return level; },
    // kind: a name from PATTERNS; ms: the old-style length, used when there is no kind
    play(kind, ms = 0) {
      if (!canVibrate()) return;
      const p = patternFor(kind, level, ms);
      if (p) navigator.vibrate(p);
    },
  };
}
