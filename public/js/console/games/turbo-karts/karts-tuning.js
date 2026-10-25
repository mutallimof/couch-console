// Live tuning values for the race feel (camera, body, effects). F4 opens a lil-gui panel; "Copy values" puts the numbers on the
// clipboard so good settings can be pasted back into the code. Values are remembered in this browser while you tune.
// The numbers below ARE the shipped defaults.
export const DEFAULTS = {
  camera: { back: 9.6, height: 3.65, fov: 57, fovSpeed: 9, fovBoost: 6, driftOffset: 1.5, boostPull: 1.8, follow: 13, shakeHit: 0.75, shakeLand: 0.4, shakeWall: 0.22, shakeBoost: 0.18 },
  body: { rollAmount: 0.16, rollSpring: 70, rollDamp: 9, slipAmount: 0.38, slipSpring: 55, slipDamp: 8.5, pitchBoost: 0.12 },
  effects: { skidMarks: 1, skidOpacity: 0.6, dust: 1, sparks: 1 },
  road: { gloss: 0.9 },
};
const KEY = 'couch.kartTuning';
export const TUNE = JSON.parse(JSON.stringify(DEFAULTS));
try { const saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved) for (const g of Object.keys(DEFAULTS)) Object.assign(TUNE[g], saved[g] || {}); } catch { /* ignore */ }

const save = () => { try { localStorage.setItem(KEY, JSON.stringify(TUNE)); } catch { /* ignore */ } };
let gui = null;

// F4 shows / hides the panel (loaded on first use: it is a developer tool)
export async function toggleTuningPanel(onChange = () => {}) {
  if (gui) { gui.destroy(); gui = null; return; }
  const { default: GUI } = await import('three/addons/libs/lil-gui.module.min.js');
  gui = new GUI({ title: 'Kart tuning (F4)' });
  gui.domElement.style.cssText += ';position:fixed;top:12px;left:12px;z-index:400';
  const ranges = {
    camera: { back: [5, 16, 0.1], height: [1.5, 7, 0.05], fov: [45, 75, 1], fovSpeed: [0, 20, 0.5], fovBoost: [0, 14, 0.5], driftOffset: [0, 4, 0.1], boostPull: [0, 5, 0.1], follow: [4, 30, 0.5], shakeHit: [0, 2, 0.05], shakeLand: [0, 2, 0.05], shakeWall: [0, 1, 0.02], shakeBoost: [0, 1, 0.02] },
    body: { rollAmount: [0, 0.5, 0.01], rollSpring: [10, 200, 1], rollDamp: [1, 30, 0.5], slipAmount: [0, 0.8, 0.01], slipSpring: [10, 200, 1], slipDamp: [1, 30, 0.5], pitchBoost: [0, 0.4, 0.01] },
    effects: { skidMarks: [0, 1, 1], skidOpacity: [0, 1, 0.05], dust: [0, 2, 0.1], sparks: [0, 2, 0.1] },
    road: { gloss: [0.2, 1, 0.02] },
  };
  for (const group of Object.keys(ranges)) {
    const f = gui.addFolder(group);
    for (const [k, [lo, hi, step]] of Object.entries(ranges[group])) f.add(TUNE[group], k, lo, hi, step).onChange(() => { save(); onChange(group, k); });
  }
  gui.add({
    'Copy values'() {
      const text = JSON.stringify(TUNE, null, 2);
      (navigator.clipboard?.writeText(text) || Promise.reject()).catch(() => window.prompt('Copy these values:', text));
    },
  }, 'Copy values');
  gui.add({ 'Reset'() { for (const g of Object.keys(DEFAULTS)) Object.assign(TUNE[g], DEFAULTS[g]); save(); gui.controllersRecursive().forEach((c) => c.updateDisplay()); onChange('all'); } }, 'Reset');
}
export const tuningPanelOpen = () => !!gui;
