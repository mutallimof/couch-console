// Light / Dark / Auto theme, shared by the TV (console) and the phone (remote).
// The TV owns the choice ("per console", saved in its browser); phones just follow the
// resolved value ('light' or 'dark') the TV sends them.
export const THEME_CHOICES = ['light', 'dark', 'auto'];

export function normalizeChoice(v) {
  return THEME_CHOICES.includes(v) ? v : 'auto';
}

// 'auto' follows the device's own setting
export function resolveTheme(choice, systemDark) {
  const c = normalizeChoice(choice);
  return c === 'auto' ? (systemDark ? 'dark' : 'light') : c;
}

// Next value for the Settings button (Light -> Dark -> Auto -> Light)
export function nextChoice(choice) {
  return THEME_CHOICES[(THEME_CHOICES.indexOf(normalizeChoice(choice)) + 1) % THEME_CHOICES.length];
}

const META = { light: '#f7f9fc', dark: '#17122e' };

// Put 'light' or 'dark' on <html data-theme> (all CSS keys off that) and tint the browser bar.
export function applyTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META[t]);
  return t;
}

export const systemPrefersDark = () => !!globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches;
