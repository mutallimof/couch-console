// Graphics preferences (Settings): the cartoon look, ambient occlusion and the picture quality for 3D games.
// Saved in the laptop browser; games read them when they start and listen for changes.
const KEYS = { cartoon: 'couch.cartoonLook', ao: 'couch.ambientOcclusion' };
const DEFAULTS = { cartoon: true, ao: true };
const QUALITY_KEY = 'couch.kartQuality', QUALITIES = ['auto', 'high', 'medium', 'low'];
const listeners = new Set();

function read(name) {
  try {
    const v = localStorage.getItem(KEYS[name]);
    return v === null ? DEFAULTS[name] : v === '1';
  } catch { return DEFAULTS[name]; }
}

export const graphics = {
  get cartoon() { return read('cartoon'); },
  get ao() { return read('ao'); },
  // 'auto' (steps down by itself when the laptop is slow) · 'high' · 'medium' · 'low'
  get quality() { try { const v = localStorage.getItem(QUALITY_KEY); return QUALITIES.includes(v) ? v : 'auto'; } catch { return 'auto'; } },
  set(name, on) {
    try { if (name === 'quality') localStorage.setItem(QUALITY_KEY, QUALITIES.includes(on) ? on : 'auto'); else localStorage.setItem(KEYS[name], on ? '1' : '0'); } catch { /* ignore */ }
    for (const fn of listeners) fn(name, on);
  },
  // fn(name, on) is called when a setting changes; returns a function that stops listening
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
