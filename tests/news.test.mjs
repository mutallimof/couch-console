// The News channel's back end, tested with pretend feeds (no internet needed): npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRss, parseTagesschau, createNews, imageAllowed, upgradeImage, decode, CATEGORIES, SOURCES } from '../server/news.js';

const BBC = `<?xml version="1.0" encoding="UTF-8"?><rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/" version="2.0"><channel><title>BBC News - World</title>
<item><title><![CDATA[Floods hit the coast &amp; thousands leave]]></title><description><![CDATA[Rescue teams say the water is still rising in several towns.]]></description><link>https://www.bbc.com/news/articles/c123?at_medium=RSS&amp;at_campaign=rss</link><guid isPermaLink="false">https://www.bbc.com/news/articles/c123#0</guid><pubDate>Sat, 25 Oct 2026 10:30:00 GMT</pubDate><media:thumbnail width="240" height="135" url="https://ichef.bbci.co.uk/ace/standard/240/cpsprodpb/aaa/live/pic.jpg"/></item>
<item><title>No picture here</title><description>Plain text only.</description><link>https://www.bbc.com/news/articles/c124</link><pubDate>Sat, 25 Oct 2026 09:00:00 GMT</pubDate></item>
<item><title>Broken: no link</title><description>x</description></item></channel></rss>`;
const DW = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>DW</title>
<item><title>Talks resume in Geneva</title><link>https://www.dw.com/en/talks-resume/a-1234</link><description>&lt;p&gt;Delegates met again on Saturday.&lt;/p&gt;&lt;img src="https://static.dw.com/image/555_302.jpg"/&gt;</description><pubDate>Sat, 25 Oct 2026 08:00:00 +0200</pubDate></item></channel></rss>`;
const TS = JSON.stringify({ news: [
  { type: 'story', title: 'Bundestag debattiert Haushalt', firstSentence: 'Die Abgeordneten diskutieren den Etat.', shareURL: 'https://www.tagesschau.de/inland/haushalt-100.html', date: '2026-10-25T09:00:00.000+02:00', teaserImage: { imageVariants: { '16x9-960': 'https://images.tagesschau.de/image/abc/16x9-960.jpg' } } },
  { type: 'video', title: 'Ein Video', shareURL: 'https://www.tagesschau.de/video.html' },
  { type: 'story', title: 'Ohne Bild', shareURL: 'https://www.tagesschau.de/x.html', date: '2026-10-25T08:00:00.000+02:00' },
] });

test('BBC feed: headline, short summary, link, a big picture; items without a link are skipped', () => {
  const items = parseRss(BBC);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Floods hit the coast & thousands leave');
  assert.match(items[0].summary, /^Rescue teams say/);
  assert.ok(items[0].url.startsWith('https://www.bbc.com/news/articles/c123'));
  assert.equal(items[0].image, 'https://ichef.bbci.co.uk/ace/standard/976/cpsprodpb/aaa/live/pic.jpg', 'the 976 px version');
  assert.equal(items[1].image, '');
  assert.ok(items[0].at > items[1].at);
});

test('DW feed: the picture inside the description is found, html is stripped from the summary', () => {
  const [it] = parseRss(DW);
  assert.equal(it.image, 'https://static.dw.com/image/555_302.jpg');
  assert.equal(it.summary, 'Delegates met again on Saturday.');
});

test('Tagesschau JSON: stories only, the 16:9 picture, the first sentence', () => {
  const items = parseTagesschau(JSON.parse(TS));
  assert.deepEqual(items.map((i) => i.title), ['Bundestag debattiert Haushalt', 'Ohne Bild']);
  assert.equal(items[0].image, 'https://images.tagesschau.de/image/abc/16x9-960.jpg');
  assert.equal(items[0].summary, 'Die Abgeordneten diskutieren den Etat.');
});

test('summaries are only a teaser, never an article', () => {
  const long = `<rss><channel><item><title>T</title><link>https://x.test/a</link><description>${'word '.repeat(500)}</description></item></channel></rss>`;
  assert.ok(parseRss(long)[0].summary.length <= 241);
});

test('entities and numbers are decoded', () => {
  assert.equal(decode('Tom &amp; Jerry &#8217;s &#x41; &unknown;'), 'Tom & Jerry ’s A &unknown;');
});

function fakeFetch(map, log = []) {
  return async (url) => {
    log.push(url);
    const v = map[url] ?? map['*'];
    if (v instanceof Error || !v) throw v || new Error('offline');
    return { ok: v.status ? v.status < 400 : true, status: v.status || 200, text: async () => v.body, headers: { get: () => v.type || 'text/xml' }, arrayBuffer: async () => Buffer.from(v.body || '') };
  };
}

test('headlines from several sources are mixed, newest first, with the source named', async () => {
  const log = [];
  const clock = { t: 1_000_000 };
  const news = createNews({ now: () => clock.t, fetchImpl: fakeFetch({ [SOURCES.bbc.feeds.top]: { body: BBC }, [SOURCES.dw.feeds.en.top]: { body: DW } }, log) });
  const r = await news.headlines({ sources: ['bbc', 'dw', 'tagesschau'], lang: 'en', category: 'top' });
  assert.deepEqual(r.sources, ['bbc', 'dw'], 'Tagesschau is German: not in the English mix');
  assert.equal(r.items.length, 3);
  assert.ok(r.items.every((i) => i.sourceName && i.id && i.url && i.title));
  assert.ok(r.items[0].at >= r.items[1].at && r.items[1].at >= r.items[2].at);
  assert.equal(r.errors.length, 0);
  // the second call comes from the cache: no new request for 10 minutes
  const before = log.length;
  await news.headlines({ sources: ['bbc', 'dw'], lang: 'en', category: 'top' });
  assert.equal(log.length, before);
  clock.t += 11 * 60 * 1000;
  await news.headlines({ sources: ['bbc', 'dw'], lang: 'en', category: 'top' });
  assert.equal(log.length, before + 2);
});

test('offline: the last headlines are kept and the failure is reported; with nothing kept the list is empty (a calm state, not a crash)', async () => {
  const clock = { t: 1_000_000 };
  let online = true;
  const fetchImpl = async (url) => { if (!online) throw new Error('getaddrinfo ENOTFOUND'); return fakeFetch({ '*': { body: BBC } })(url); };
  const news = createNews({ now: () => clock.t, fetchImpl });
  const ok = await news.headlines({ sources: ['bbc'], category: 'top' });
  assert.equal(ok.items.length, 2);
  online = false; clock.t += 11 * 60 * 1000;
  const off = await news.headlines({ sources: ['bbc'], category: 'top' });
  assert.equal(off.items.length, 2, 'still shows what it had');
  assert.equal(off.errors[0].stale, true);
  const fresh = createNews({ now: () => clock.t, fetchImpl });
  const none = await fresh.headlines({ sources: ['bbc'], category: 'world' });
  assert.deepEqual(none.items, []);
  assert.equal(none.errors.length, 1);
});

test('German picks DW German and Tagesschau; categories follow what the sources have', async () => {
  const news = createNews({ fetchImpl: fakeFetch({ '*': { body: '<rss/>' } }) });
  const r = await news.headlines({ sources: ['bbc', 'dw', 'tagesschau'], lang: 'de', category: 'top' });
  assert.deepEqual(r.sources, ['dw', 'tagesschau']);
  const cats = news.categories(['bbc'], 'en').map((c) => c.id);
  assert.ok(cats.includes('top') && cats.includes('tech'));
  assert.ok(!news.categories(['tagesschau'], 'de').some((c) => c.id === 'tech'));
  assert.equal(CATEGORIES[0][0], 'top');
});

test('only pictures from news sites are fetched for the TV', () => {
  assert.ok(imageAllowed('https://ichef.bbci.co.uk/a.jpg'));
  assert.ok(imageAllowed('https://static.dw.com/image/1.jpg'));
  assert.ok(!imageAllowed('http://ichef.bbci.co.uk/a.jpg'), 'https only');
  assert.ok(!imageAllowed('https://evil.example/a.jpg'));
  assert.ok(!imageAllowed('https://localhost/a.jpg'));
  assert.equal(upgradeImage('https://ichef.bbci.co.uk/news/240/cpsprodpb/x.jpg'), 'https://ichef.bbci.co.uk/news/976/cpsprodpb/x.jpg');
});
