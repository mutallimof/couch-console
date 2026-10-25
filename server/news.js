// The News channel's back end: headlines with photos from free public feeds (no key, no account). Our server fetches them (one
// request per feed every 10 minutes at most, however many screens watch), keeps what it got so the channel still works offline
// for a while, and hands the TV only what a TV channel shows: a headline, a short summary, a photo and a link to the article.
// Never a full article. Sources: BBC News (English), DW (English / German), Tagesschau (German).
import { URL } from 'node:url';

export const TTL_MS = 10 * 60 * 1000;      // a feed is fetched at most this often
export const STALE_MS = 6 * 60 * 60 * 1000; // after this long without a fresh copy, what we kept is dropped
const MAX_ITEMS = 40;                       // per feed
const SUMMARY_MAX = 240;                    // characters of a summary: a teaser, not an article

// Categories the channel shows, and which feed of each source gives them. `top` must always exist.
export const CATEGORIES = [['top', 'Top'], ['world', 'World'], ['business', 'Business'], ['tech', 'Tech'], ['science', 'Science'], ['health', 'Health'], ['sport', 'Sport'], ['culture', 'Culture']];
const bbc = (p) => `https://feeds.bbci.co.uk/${p}/rss.xml`;
const dw = (code) => `https://rss.dw.com/xml/${code}`;
const tagesschau = (ressort) => `https://www.tagesschau.de/api2u/news/?ressort=${ressort}`;
export const SOURCES = {
  bbc: { name: 'BBC News', lang: 'en', kind: 'rss', feeds: { top: bbc('news'), world: bbc('news/world'), business: bbc('news/business'), tech: bbc('news/technology'), science: bbc('news/science_and_environment'), health: bbc('news/health'), sport: bbc('sport'), culture: bbc('news/entertainment_and_arts') } },
  dw: { name: 'DW', lang: 'en', langs: ['en', 'de'], kind: 'rss', feeds: { en: { top: dw('rss-en-all'), world: dw('rss-en-world'), business: dw('rss-en-bus'), science: dw('rss-en-sci'), culture: dw('rss-en-cul'), sport: dw('rss-en-sports') }, de: { top: dw('rss-de-all'), world: dw('rss-de-welt'), business: dw('rss-de-wirtschaft'), science: dw('rss-de-wissenschaft'), culture: dw('rss-de-kultur'), sport: dw('rss-de-sport') } } },
  tagesschau: { name: 'Tagesschau', lang: 'de', kind: 'tagesschau', feeds: { top: 'https://www.tagesschau.de/api2u/homepage/', world: tagesschau('ausland'), business: tagesschau('wirtschaft'), science: tagesschau('wissen'), sport: tagesschau('sport') } },
};

// Which images the server will fetch for the TV (so the page can't be used to fetch just anything)
const IMAGE_HOSTS = [/(^|\.)bbci\.co\.uk$/, /(^|\.)bbc\.co\.uk$/, /(^|\.)dw\.com$/, /(^|\.)tagesschau\.de$/, /(^|\.)ndr\.de$/];
export const imageAllowed = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && IMAGE_HOSTS.some((r) => r.test(x.hostname)); } catch { return false; } };

// ---------- parsing ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };
export function decode(s = '') {
  return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
    return ENT[e.toLowerCase()] ?? m;
  });
}
const strip = (s) => decode(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')); return m ? m[1] : ''; };
const attr = (xml, name, a) => { const m = xml.match(new RegExp(`<${name}\\b[^>]*\\b${a}="([^"]+)"`, 'i')); return m ? decode(m[1]) : ''; };
const clip = (s, n) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…`);

// BBC gives 240 px thumbnails; the same picture exists at 976 px (the TV shows it big). If that size is missing the server
// falls back to the original (see image() below).
export const upgradeImage = (u) => u.replace(/(ichef\.bbci\.co\.uk\/(?:ace\/standard|news|ace\/ws|images\/ic))\/(\d{2,4})\//, (m, p) => `${p}/976/`);

// RSS 2.0 and RDF feeds: BBC (media:thumbnail), DW (enclosure / media:content, RDF), anything alike
export function parseRss(xml) {
  const out = [];
  for (const m of String(xml).matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const it = m[0];
    const title = strip(tag(it, 'title'));
    let link = strip(tag(it, 'link')) || attr(it, 'link', 'href') || attr(it, 'link', 'rdf:resource');
    if (!title || !/^https?:\/\//i.test(link)) continue;
    let image = attr(it, 'media:thumbnail', 'url') || attr(it, 'media:content', 'url') || (/image/i.test(attr(it, 'enclosure', 'type')) ? attr(it, 'enclosure', 'url') : '');
    if (!image) { const html = decode(tag(it, 'description') + tag(it, 'content:encoded')); const g = html.match(/<img[^>]+src=["']([^"']+)["']/i); if (g) image = g[1]; }
    const when = Date.parse(strip(tag(it, 'pubDate')) || strip(tag(it, 'dc:date')) || '') || 0;
    out.push({ title, summary: clip(strip(tag(it, 'description')), SUMMARY_MAX), url: link, image: /^https:\/\//i.test(image) ? upgradeImage(image) : '', at: when });
  }
  return out.slice(0, MAX_ITEMS);
}

// Tagesschau's public JSON (homepage and ressort lists)
export function parseTagesschau(json) {
  const list = Array.isArray(json?.news) ? json.news : [];
  const out = [];
  for (const n of list) {
    const title = strip(n.title || ''), url = n.shareURL || n.detailsweb || '';
    if (!title || !/^https?:\/\//i.test(url) || (n.type && !/^(story|webview)$/i.test(n.type))) continue;
    const v = n.teaserImage?.imageVariants || {};
    const image = v['16x9-960'] || v['16x9-640'] || v['16x9-1280'] || v['1x1-840'] || Object.values(v)[0] || '';
    const at = Date.parse(n.date || '') || 0;
    out.push({ title, summary: clip(strip(n.firstSentence || n.topline || ''), SUMMARY_MAX), url, image: /^https:\/\//i.test(image) ? image : '', at });
  }
  return out.slice(0, MAX_ITEMS);
}

// ---------- the cache ----------
// get(url) -> items; errors stay inside: a feed that fails keeps its last items (up to STALE_MS) and says so.
export function createNews({ fetchImpl = fetch, now = Date.now } = {}) {
  const cache = new Map(); // url -> { at, items, error }
  const pending = new Map();
  const images = new Map(); // url -> { type, buf, at }
  let imageBytes = 0;
  const IMAGE_LIMIT = 40 * 1024 * 1024;

  async function load(url, kind) {
    const c = cache.get(url);
    if (c && now() < c.expires) return c;
    if (pending.has(url)) return pending.get(url);
    const job = (async () => {
      try {
        const res = await fetchImpl(url, { headers: { 'user-agent': 'CouchConsole/1.0 (home TV news channel)', accept: 'application/rss+xml, application/xml, application/json, text/xml, */*' }, signal: AbortSignal.timeout(12000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const items = kind === 'tagesschau' ? parseTagesschau(JSON.parse(text)) : parseRss(text);
        const entry = { at: now(), expires: now() + TTL_MS, items, error: null };
        cache.set(url, entry);
        return entry;
      } catch (err) {
        // keep what we had (up to STALE_MS old) and try again in 30 seconds
        const old = cache.get(url);
        const keep = old && now() - old.at < STALE_MS ? old.items : [];
        const entry = { at: old?.at ?? 0, expires: now() + 30000, items: keep, error: String(err.message || err), stale: keep.length > 0 };
        cache.set(url, entry);
        return entry;
      } finally { pending.delete(url); }
    })();
    pending.set(url, job);
    return job;
  }

  const feedFor = (source, category, lang) => {
    const s = SOURCES[source];
    if (!s) return null;
    const feeds = s.langs ? (s.feeds[lang] || s.feeds[s.lang]) : s.feeds;
    return feeds[category] || null;
  };

  return {
    // { sources: ['bbc', ...], lang: 'en' | 'de', category } -> { items, errors, categories }
    async headlines({ sources = Object.keys(SOURCES), lang = 'en', category = 'top' } = {}) {
      const wanted = sources.filter((s) => SOURCES[s] && (SOURCES[s].langs ? SOURCES[s].langs.includes(lang) : SOURCES[s].lang === lang));
      const errors = [], items = [];
      await Promise.all(wanted.map(async (id) => {
        const url = feedFor(id, category, lang);
        if (!url) return;
        const got = await load(url, SOURCES[id].kind);
        if (got.error) errors.push({ source: id, error: got.error, stale: !!got.stale });
        for (const it of got.items) items.push({ ...it, id: `${id}:${Buffer.from(it.url).toString('base64url').slice(-24)}`, source: id, sourceName: SOURCES[id].name, category });
      }));
      // newest first, mixed across sources; the same story twice (same link) once
      const seen = new Set();
      const mixed = items.sort((a, b) => b.at - a.at).filter((i) => !seen.has(i.url) && seen.add(i.url));
      return { items: mixed.slice(0, 60), errors, sources: wanted, lang, category, categories: this.categories(wanted, lang), at: now() };
    },
    // The categories a language / source mix has feeds for
    categories(sources = Object.keys(SOURCES), lang = 'en') {
      return CATEGORIES.filter(([c]) => sources.some((s) => SOURCES[s] && (SOURCES[s].langs ? SOURCES[s].langs.includes(lang) : SOURCES[s].lang === lang) && feedFor(s, c, lang))).map(([id, label]) => ({ id, label }));
    },
    // A photo, fetched once and kept (so the channel still shows pictures when the internet is gone for a while)
    async image(u) {
      if (!imageAllowed(u)) return null;
      const hit = images.get(u);
      if (hit) { images.delete(u); images.set(u, hit); return hit; } // (most recently used last)
      let res = await fetchImpl(u, { headers: { 'user-agent': 'CouchConsole/1.0' }, signal: AbortSignal.timeout(12000) });
      if (!res.ok && /\/976\//.test(u)) res = await fetchImpl(u.replace('/976/', '/240/'), { headers: { 'user-agent': 'CouchConsole/1.0' }, signal: AbortSignal.timeout(12000) }); // (no big version: the small one)
      if (!res.ok || !/^image\//i.test(res.headers.get('content-type') || '')) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 3 * 1024 * 1024) return null;
      const entry = { type: res.headers.get('content-type'), buf, at: now() };
      images.set(u, entry); imageBytes += buf.length;
      while (imageBytes > IMAGE_LIMIT && images.size > 1) { const [k, v] = images.entries().next().value; images.delete(k); imageBytes -= v.buf.length; }
      return entry;
    },
  };
}
