// Gesture helpers for the Party Games, from the phone's motion sensors. Pure functions (no sensors, no DOM), so they are tested
// with recorded samples. A reading is the phone's accelerationIncludingGravity { x, y, z } in m/s²: y runs along the phone's top
// edge. (iPhones report the opposite sign to Android, so every check below uses |pitch| and works for both.)
const G = 9.81;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const len = (a) => Math.hypot(a.x, a.y, a.z) || 1;

// How far the phone's top edge points above the horizon, in degrees: 0 = level (like pointing a finger gun), ±90 = up or down
export const pitch = (a) => (Math.asin(clamp(a.y / len(a), -1, 1)) * 180) / Math.PI;

// Pointing at the floor (or the ceiling): the phone is "in the holster"
export const holstered = (a) => Math.abs(pitch(a)) > 55;
// Raised to about level: ready to fire
export const raisedLevel = (a) => Math.abs(pitch(a)) < 30;

// How far from lying flat (screen up), 0..1 (0 = flat, 1 = 45° or more)
export const flatness = (a) => clamp((Math.acos(clamp(Math.abs(a.z) / len(a), 0, 1)) * 180) / Math.PI / 45, 0, 1);

// A throwing swing: a spike of acceleration beyond gravity inside the last samples. samples: [{ t (ms), a: { x, y, z } }]
export function swing(samples, { threshold = 13, windowMs = 350 } = {}) {
  if (!samples.length) return false;
  const end = samples[samples.length - 1].t;
  let peak = 0;
  for (const s of samples) if (end - s.t <= windowMs) peak = Math.max(peak, Math.abs(len(s.a) - G));
  return peak >= threshold;
}

// How shaky the hand is, 0..1: the spread of the acceleration over the recent samples (a still phone is ~0, a jolt is ~1)
export function wobble(samples, { windowMs = 400 } = {}) {
  if (samples.length < 2) return 0;
  const end = samples[samples.length - 1].t, recent = samples.filter((s) => end - s.t <= windowMs);
  if (recent.length < 2) return 0;
  const mags = recent.map((s) => len(s.a));
  const mean = mags.reduce((x, y) => x + y, 0) / mags.length;
  const rms = Math.sqrt(mags.reduce((x, y) => x + (y - mean) ** 2, 0) / mags.length);
  const peak = Math.max(...mags.map((m) => Math.abs(m - G)));
  return clamp(Math.max(rms / 3, peak / 9), 0, 1);
}
