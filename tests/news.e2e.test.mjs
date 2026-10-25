// The News channel in a real (headless) browser, with pretend headlines (no internet needed): the first story, auto-advance,
// the D-pad, tabs, the ticker, the QR code, the offline state, the settings and the "Today in History" tab. npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { findPlaywright, startServer } from './helpers-e2e.mjs';

const pw = findPlaywright();
const PORT = 5500 + Math.floor(Math.random() * 150);
const cats = [['top', 'Top'], ['world', 'World'], ['tech', 'Tech']].map(([id, label]) => ({ id, label }));
const story = (n, category = 'top') => ({ id: `bbc:${category}${n}`, source: 'bbc', sourceName: 'BBC News', category, title: `Headline number ${n} in ${category}`, summary: `A short summary of story ${n}.`, url: `https://www.bbc.com/news/articles/c${n}`, image: `https://ichef.bbci.co.uk/news/976/p${n}.jpg`, at: Date.now() - n * 60000 });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test('News: stories, tabs, ticker, QR, offline, settings and history', { skip: !pw && 'Playwright is not installed', timeout: 240000 }, async () => {
  const server = await startServer(PORT);
  const browser = await pw.chromium.launch();
  try {
    const B = `http://localhost:${PORT}`, errors = [], asked = [];
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    let online = true;
    await ctx.route('**/api/news?**', async (route) => {
      const u = new URL(route.request().url()); asked.push(u.searchParams.toString());
      const category = u.searchParams.get('category') || 'top';
      await route.fulfill({ json: online ? { items: [1, 2, 3].map((n) => story(n, category)), errors: [], categories: cats, sources: ['bbc'], lang: u.searchParams.get('lang') } : { items: [], errors: [{ source: 'bbc', error: 'offline' }], categories: cats } });
    });
    await ctx.route('**/api/news/image**', (route) => route.fulfill({ contentType: 'image/png', body: PNG }));
    await ctx.route('https://en.wikipedia.org/**', (route) => route.abort());
    await ctx.route('**/models/**', (route) => route.abort());
    const tv = await ctx.newPage();
    tv.on('pageerror', (e) => errors.push(e.message));
    await tv.goto(`${B}/console.html?noboot=1&fx=off`);
    await tv.waitForFunction(() => /^[A-Z]{4}$/.test(document.getElementById('room-code').textContent));
    await tv.click('#use-mouse');
    await tv.waitForFunction(() => document.querySelector('.menu [data-focus="folder:channels"]'));
    const click = async (sel) => { const p = await tv.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel); await tv.mouse.move(p.x - 5, p.y - 5); await tv.mouse.move(p.x, p.y, { steps: 3 }); await tv.mouse.click(p.x, p.y); await tv.waitForTimeout(700); };
    await click('.menu [data-focus="folder:channels"]');
    await tv.waitForSelector('.menu [data-focus="channels:news"]');
    await click('.menu [data-focus="channels:news"]');

    // the first story: headline, summary, source, a QR code for the article, the ticker
    await tv.waitForSelector('.nw-story h2', { timeout: 20000 });
    assert.equal(await tv.textContent('.nw-story h2'), 'Headline number 1 in top');
    assert.match(await tv.textContent('.nw-story p'), /short summary of story 1/);
    assert.match(await tv.textContent('.nw-source'), /BBC News/);
    assert.match(await tv.getAttribute('.nw-qr img', 'src'), /^\/api\/qr\.svg\?text=https%3A%2F%2Fwww\.bbc\.com%2Fnews%2Farticles%2Fc1$/);
    assert.match(await tv.textContent('.nw-ticker-track'), /Headline number 3 in top/);
    assert.ok(await tv.$('.nw-tab.on'), 'the current tab is marked');
    // the D-pad: RIGHT = next story, LEFT = back, A = pause
    await tv.keyboard.press('ArrowRight'); await tv.waitForFunction(() => /number 2/.test(document.querySelector('.nw-story h2')?.textContent || ''));
    await tv.keyboard.press('ArrowLeft'); await tv.waitForFunction(() => /number 1/.test(document.querySelector('.nw-story h2')?.textContent || ''));
    await tv.keyboard.press('Enter'); await tv.waitForSelector('.nw-body.paused');
    await tv.keyboard.press('Enter'); await tv.waitForFunction(() => !document.querySelector('.nw-body.paused'));
    // a tab (pointer): the other category is asked for
    await click('.nw-tab[data-tab="world"]');
    await tv.waitForFunction(() => /in world/.test(document.querySelector('.nw-story h2')?.textContent || ''));
    assert.ok(asked.some((q) => /category=world/.test(q)), 'the world feed was asked for');
    // UP goes to the tabs, LEFT / RIGHT change the tab there
    await tv.keyboard.press('ArrowUp'); await tv.keyboard.press('ArrowRight');
    await tv.waitForFunction(() => /in tech/.test(document.querySelector('.nw-story h2')?.textContent || ''), null, { timeout: 15000 });
    // Today in History is the last tab (Wikipedia is unreachable here: a friendly message, no crash)
    await click('.nw-tab[data-tab="history"]');
    await tv.waitForSelector('.nw-history');
    await tv.waitForFunction(() => /Could not reach Wikipedia/.test(document.querySelector('.nw-history')?.textContent || ''), null, { timeout: 15000 });
    // offline: the channel says so calmly
    online = false;
    await click('.nw-tab[data-tab="top"]');
    await tv.waitForSelector('.nw-empty h2');
    assert.match(await tv.textContent('.nw-empty h2'), /No news right now/);
    // the settings (language and sources) are what the channel asks for
    await tv.evaluate(() => localStorage.setItem('couch.news', JSON.stringify({ lang: 'de', sources: ['dw', 'tagesschau'] })));
    online = true; asked.length = 0;
    await click('.nw-tab[data-tab="world"]');
    await tv.waitForFunction(() => document.querySelector('.nw-story h2'));
    assert.ok(asked.some((q) => /lang=de/.test(q) && /sources=dw%2Ctagesschau/.test(q)), `asked with the settings (${asked})`);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.kill(); }
});
