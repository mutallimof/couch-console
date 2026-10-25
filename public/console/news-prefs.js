// News settings (Settings -> News): which sources to show and in which language. Kept in this browser.
const KEY = 'couch.news';
export const NEWS_SOURCES = [['bbc', 'BBC News', 'en'], ['dw', 'DW', 'en · de'], ['tagesschau', 'Tagesschau', 'de']];
const DEFAULT = { sources: ['bbc', 'dw', 'tagesschau'], lang: 'en' };

export function getNewsPrefs() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && Array.isArray(v.sources) && (v.lang === 'en' || v.lang === 'de')) return { sources: v.sources.filter((s) => NEWS_SOURCES.some(([id]) => id === s)), lang: v.lang };
  } catch { /* use the defaults */ }
  return { ...DEFAULT, sources: [...DEFAULT.sources] };
}
export function setNewsPrefs(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode: not remembered */ } }
