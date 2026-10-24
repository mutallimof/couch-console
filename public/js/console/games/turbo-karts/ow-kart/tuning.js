// Every number of the arcade handling, the camera and the juice, in one place: the defaults, the
// range of each slider in the T panel (karts-tuning-panel.js), and saving / loading / copying.
// No DOM here, so tests/arcade-kart.test.mjs can check it. To make tuned values the new defaults,
// paste the "Copy values" text back into the code: the numbers go into ARCADE_DEFAULTS /
// CAMERA_DEFAULTS.
import { ARCADE_DEFAULTS } from './arcade.js';

export const CAMERA_DEFAULTS = {
  camFollow: 9,       // 1/s: how tightly the camera follows (lower = it lags behind more)
  camUpFollow: 6,     // 1/s: how quickly the camera's "up" follows slopes
  camBack: 9.6,       // m behind the kart
  camHeight: 3.65,    // m above the kart
  driftSwing: 0.45,   // 0..1: how far the camera swings outward in a drift (0 = stays behind the travel direction)
  swingSpeed: 5,      // 1/s: how quickly it swings out and back
  fovBase: 60,        // degrees
  fovSpeed: 5,        // extra degrees at the top speed
  fovBoost: 14,       // extra degrees while boosting
  fovDrift: 2,        // extra degrees while drifting
  fovEase: 5,         // 1/s: how quickly the FOV changes
  shakeLand: 1.0,     // camera shake when landing
  shakeHit: 1.4,      // ... when hit by an item
  shakeWall: 0.7,     // ... when scraping a wall or bumping a kart
  shakeBoost: 0.5,    // ... when a boost fires
  shakeDecay: 7,      // 1/s: how quickly a shake dies down
  leanAmount: 0.22,   // rad: how far the kart leans into turns
  bounceAmount: 0.28, // how much the kart squashes when it lands
  speedLines: 1,      // amount of speed lines while boosting (0 = none)
};

// [key, label, min, max, step] per group, for the slider panel
export const TUNING_SCHEMA = [
  ['Movement', [
    ['accel', 'Acceleration (m/s²)', 8, 50, 0.5], ['taper', 'Acceleration taper', 0.5, 5, 0.1], ['accelFloor', 'Acceleration at top', 0, 8, 0.25],
    ['brake', 'Brake', 10, 60, 1], ['drag', 'Coasting drag', 1, 15, 0.5],
    ['turnRate', 'Steering (rad/s)', 0.6, 3, 0.05], ['turnSpeed', 'Full steering from (m/s)', 6, 36, 1], ['highSpeedTurn', 'Less steering at top speed', 0, 0.8, 0.02],
    ['grip', 'Grip', 1, 30, 0.5],
  ]],
  ['Drift', [
    ['driftMinSpeed', 'Drift from speed (m/s)', 4, 24, 1], ['driftAngle', 'Drift angle (rad)', 0.1, 1, 0.02], ['driftArc', 'Drift arc (rad/s)', 0.3, 2, 0.02],
    ['driftSteer', 'Steering widens/tightens arc', 0, 1, 0.02], ['driftBlend', 'Nose swing speed', 2, 30, 0.5], ['driftExit', 'Straighten after drift', 2, 30, 0.5],
    ['charge1', 'Blue sparks after (s)', 0.2, 2, 0.05], ['charge2', 'Orange sparks after (s)', 0.6, 4, 0.05], ['charge3', 'Purple sparks after (s)', 1, 6, 0.05],
    ['chargeSteer', 'Charge bonus when steering in', 0, 1.5, 0.05],
  ]],
  ['Boost', [
    ['boost1Time', 'Blue boost (s)', 0.2, 2, 0.05], ['boost2Time', 'Orange boost (s)', 0.4, 3, 0.05], ['boost3Time', 'Purple boost (s)', 0.6, 4, 0.05],
    ['boostStrength', 'Boost strength (over top speed)', 0.1, 1, 0.02], ['boostTierGain', 'Extra strength per tier', 0, 0.6, 0.02],
    ['boostKick', 'Boost kick', 0, 0.4, 0.01], ['boostAccel', 'Boost acceleration', 10, 90, 1], ['overspeedDecay', 'Boost fade-out', 2, 40, 1],
  ]],
  ['Body', [
    ['gravity', 'Gravity', 10, 60, 1], ['landBounce', 'Landing counts from (m/s)', 1, 12, 0.5],
    ['leanAmount', 'Lean into turns', 0, 0.6, 0.01], ['bounceAmount', 'Landing squash', 0, 0.8, 0.02],
  ]],
  ['Camera', [
    ['camFollow', 'Camera follow (low = lag)', 2, 30, 0.5], ['camUpFollow', 'Camera up follow', 1, 20, 0.5], ['camBack', 'Distance behind', 5, 16, 0.2], ['camHeight', 'Height', 1.5, 8, 0.1],
    ['driftSwing', 'Swing out in drifts', 0, 1, 0.02], ['swingSpeed', 'Swing speed', 1, 15, 0.5],
    ['fovBase', 'FOV', 40, 90, 1], ['fovSpeed', 'FOV at top speed', 0, 20, 0.5], ['fovBoost', 'FOV in a boost', 0, 30, 0.5], ['fovDrift', 'FOV in a drift', 0, 12, 0.5], ['fovEase', 'FOV change speed', 1, 15, 0.5],
  ]],
  ['Shake & juice', [
    ['shakeLand', 'Shake: landing', 0, 3, 0.05], ['shakeHit', 'Shake: hit', 0, 3, 0.05], ['shakeWall', 'Shake: wall / bump', 0, 3, 0.05], ['shakeBoost', 'Shake: boost', 0, 3, 0.05],
    ['shakeDecay', 'Shake fade-out', 2, 20, 0.5], ['speedLines', 'Speed lines', 0, 2, 0.05],
  ]],
];

export const TUNING_DEFAULTS = Object.freeze({ ...ARCADE_DEFAULTS, ...CAMERA_DEFAULTS });
export const TUNING_STORAGE_KEY = 'couch.kartTuning';
const RANGES = new Map(TUNING_SCHEMA.flatMap(([, rows]) => rows.map(([key, , min, max]) => [key, [min, max]])));

/** Unknown keys are dropped, missing ones filled from the defaults, numbers kept inside their slider range. */
export function normalizeTuning(values) {
  const out = { ...TUNING_DEFAULTS };
  for (const key of Object.keys(TUNING_DEFAULTS)) {
    const v = Number(values?.[key]);
    if (values && key in values && Number.isFinite(v)) {
      const [min, max] = RANGES.get(key) || [-Infinity, Infinity];
      out[key] = Math.min(max, Math.max(min, v));
    }
  }
  return out;
}

export function loadTuning(storage = globalThis.localStorage) {
  try { return normalizeTuning(JSON.parse(storage.getItem(TUNING_STORAGE_KEY))); } catch { return normalizeTuning(null); }
}
export function saveTuning(values, storage = globalThis.localStorage) {
  try { storage.setItem(TUNING_STORAGE_KEY, JSON.stringify(changedOnly(values))); } catch { /* private mode: it just isn't saved */ }
}
export function clearTuning(storage = globalThis.localStorage) {
  try { storage.removeItem(TUNING_STORAGE_KEY); } catch { /* ignore */ }
}

/** Only the numbers that differ from the defaults (a short list is easier to paste and read) */
export function changedOnly(values) {
  return Object.fromEntries(Object.entries(values).filter(([k, v]) => k in TUNING_DEFAULTS && v !== TUNING_DEFAULTS[k]));
}

/** The text of "Copy values": ALL the numbers as JSON, so they can be pasted back to become the defaults */
export function tuningText(values) {
  return JSON.stringify(normalizeTuning(values), null, 2);
}
