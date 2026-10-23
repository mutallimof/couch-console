// Timer channel rules: a countdown and a stopwatch, with no screen code, so they can be tested
// in Node (tests/channels.test.mjs). `now` is a clock in milliseconds (performance.now in the browser).

export const MAX_TIMER = 99 * 60 * 1000 + 59 * 1000; // 99:59

// 75500 -> "1:15", 3723000 -> "1:02:03"; tenths: 75500 -> "1:15.5"
export function formatTime(ms, { tenths = false } = {}) {
  const t = Math.max(0, ms);
  const total = tenths ? Math.floor(t / 100) : Math.ceil(t / 1000); // a countdown shows 0:01 until it's really over
  const secs = tenths ? Math.floor(total / 10) : total;
  const h = Math.floor(secs / 3600), m = Math.floor(secs / 60) % 60, s = secs % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}${tenths ? `.${total % 10}` : ''}`;
}

// Countdown: set a time, start, pause, and it reports when it has run out.
export function createCountdown(now, length = 5 * 60 * 1000) {
  let left = length, startedAt = null;
  const remaining = () => Math.max(0, startedAt == null ? left : left - (now() - startedAt));
  return {
    get length() { return length; },
    get running() { return startedAt != null && remaining() > 0; },
    get done() { return remaining() === 0; },
    remaining,
    // Change the time (only while stopped): adds `ms` (can be negative), between 0:10 and 99:59
    add(ms) {
      if (startedAt != null) return;
      length = Math.min(MAX_TIMER, Math.max(10000, length + ms));
      left = length;
    },
    start() { if (startedAt == null && left > 0) startedAt = now(); },
    pause() { if (startedAt != null) { left = remaining(); startedAt = null; } },
    reset() { left = length; startedAt = null; },
  };
}

// Stopwatch with laps (newest first, at most `maxLaps`)
export function createStopwatch(now, maxLaps = 5) {
  let base = 0, startedAt = null;
  const laps = [];
  const elapsed = () => base + (startedAt == null ? 0 : now() - startedAt);
  return {
    get running() { return startedAt != null; },
    laps,
    elapsed,
    start() { if (startedAt == null) startedAt = now(); },
    pause() { if (startedAt != null) { base = elapsed(); startedAt = null; } },
    reset() { base = 0; startedAt = null; laps.length = 0; },
    lap() {
      if (startedAt == null) return;
      laps.unshift(elapsed());
      laps.length = Math.min(laps.length, maxLaps);
    },
  };
}
