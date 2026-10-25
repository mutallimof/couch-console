// The slide screen of the TV (Phase 46): a full-screen layer that shows whatever is being presented, on top of the
// menu (but not over a running game). PDFs are drawn with pdf.js; picture decks are plain images. The next and
// previous slides are drawn ahead so a page turn is instant (a 150 ms fade). The server keeps the state; the keyboard
// and any USB clicker also turn pages here.
import { EV } from '../shared/protocol.js';
import { createViewer } from '../shared/viewer.js';

const FADE_MS = 150;
// the "legacy" build also runs on older browsers (the newest one needs very recent JavaScript features)
const PDFJS = '/vendor/pdfjs-dist';

let pdfjsPromise = null;
const loadPdfjs = () => (pdfjsPromise ??= import(`${PDFJS}/legacy/build/pdf.mjs`).then((m) => { m.GlobalWorkerOptions.workerSrc = `${PDFJS}/legacy/build/pdf.worker.mjs`; return m; }));

export function createSlides({ socket, party, hub = null }) {
  const root = document.createElement('div');
  root.id = 'slides';
  root.hidden = true;
  root.innerHTML = `<div class="sl-layer a"></div><div class="sl-layer b"></div><div class="sl-black"></div>
    <div class="sl-tag" hidden></div><div class="sl-laser" hidden></div>`;
  document.body.append(root);
  const layers = [root.querySelector('.a'), root.querySelector('.b')];
  // Each layer holds a shared viewer: the whole page is always visible (fit), with zoom and pan on top
  const viewers = layers.map((l) => { const v = createViewer(l, { controls: 'auto', onChange: () => hub?.changed() }); v.onFullscreen = () => hub?.fullscreen(); return v; });
  const blackEl = root.querySelector('.sl-black');
  const tag = root.querySelector('.sl-tag'), laserEl = root.querySelector('.sl-laser');

  let st = { active: false }, shownDeck = null, front = 0, cache = new Map(), pdf = null, drawing = 0, gameOpen = () => false;
  let tagTimer = null, laserTimer = null;
  const deckUrl = (d, n) => (d.kind === 'pdf' ? `/api/party/decks/${d.id}/file` : `/api/party/decks/${d.id}/page/${n}`);

  // ---- drawing a page ----
  // Returns { node, w, h }: w x h is the page's own shape (the viewer fits it, so nothing is ever cut off)
  async function pageCanvas(deck, n, zoom = 1) {
    const key = `${deck.id}:${n}:${zoom}`;
    if (cache.has(key)) return cache.get(key);
    const job = (async () => {
      if (deck.kind === 'images') {
        const img = new Image(); img.src = deckUrl(deck, n);
        await img.decode().catch(() => {});
        return { node: img, w: img.naturalWidth || 1600, h: img.naturalHeight || 900 };
      }
      const doc = await openPdf(deck);
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 }), dpr = Math.min(window.devicePixelRatio || 1, 2);
      // sharp at the screen's size for either fit mode (and sharper when zoomed in), without a giant canvas
      let scale = Math.max((innerWidth * dpr) / base.width, (innerHeight * dpr) / base.height) * Math.min(zoom, 4);
      scale = Math.min(scale, 4096 / Math.max(base.width, base.height));
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      return { node: canvas, w: base.width, h: base.height };
    })();
    cache.set(key, job);
    job.catch(() => cache.delete(key));
    return job;
  }
  async function openPdf(deck) {
    if (pdf?.id === deck.id) return pdf.doc;
    const lib = await loadPdfjs();
    const doc = await lib.getDocument({ url: deckUrl(deck), cMapUrl: `${PDFJS}/cmaps/`, cMapPacked: true, standardFontDataUrl: `${PDFJS}/standard_fonts/`, wasmUrl: `${PDFJS}/wasm/`, iccUrl: `${PDFJS}/iccs/` }).promise;
    pdf = { id: deck.id, doc };
    if (doc.numPages !== deck.pages) party.call('POST', `/decks/${deck.id}/meta`, { pages: doc.numPages }).catch(() => {}); // (the phones show "5 / 23")
    return doc;
  }

  async function show(deck, n) {
    const token = ++drawing;
    let page;
    try { page = await pageCanvas(deck, n); } catch (err) { console.warn('slide failed', err); return; }
    if (token !== drawing) return; // a newer page was asked for meanwhile
    const next = layers[1 - front], cur = layers[front];
    viewers[1 - front].setContent(copyOf(page.node), page.w, page.h);
    next.classList.add('on'); cur.classList.remove('on');
    front = 1 - front;
    hub?.changed();
    // draw the neighbours ahead
    for (const m of [n + 1, n - 1]) if (m >= 1 && m <= (deck.pages || 9999)) pageCanvas(deck, m).catch(() => {});
    // forget pages far away (memory)
    for (const key of cache.keys()) { const [id, k] = key.split(':'); if (id !== deck.id || Math.abs(Number(k) - n) > 3) cache.delete(key); }
    // zoomed in? draw this page sharper once the zoom settles
    viewers[front].onSettle = async ({ zoom }) => {
      if (zoom < 1.5 || token !== drawing) return;
      const hi = await pageCanvas(deck, n, zoom).catch(() => null);
      if (hi && token === drawing && hi.node instanceof HTMLCanvasElement) viewers[front].swapContent(copyOf(hi.node));
    };
  }
  // A canvas / image can't be in two places: copy it
  function copyOf(el) {
    if (el instanceof HTMLCanvasElement) { const c = document.createElement('canvas'); c.width = el.width; c.height = el.height; c.getContext('2d').drawImage(el, 0, 0); return c; }
    return el.cloneNode();
  }

  function flashTag(text) {
    tag.textContent = text; tag.hidden = false;
    clearTimeout(tagTimer); tagTimer = setTimeout(() => { tag.hidden = true; }, 2500);
  }

  // ---- what the server says ----
  function apply() {
    const visible = st.active && !gameOpen();
    root.hidden = !visible;
    blackEl.classList.toggle('on', !!st.black);
    if (!visible) { if (!st.active) { shownDeck = null; cache.clear(); pdf = null; viewers.forEach((v) => v.setContent(document.createElement('canvas'), 1, 1)); } return; }
    if (st.deck && (shownDeck?.id !== st.deck.id || shownDeck.page !== st.page)) {
      const first = shownDeck?.id !== st.deck.id;
      shownDeck = { id: st.deck.id, page: st.page };
      show(st.deck, st.page);
      flashTag(first ? `▶ ${st.presenter?.name || 'Someone'} is presenting · ${st.deck.name}` : `${st.page}${st.deck.pages ? ` / ${st.deck.pages}` : ''}`);
    }
    laserEl.hidden = !st.laser;
  }

  socket.on(EV.PRESENT_STATE, (s) => { st = s; apply(); });

  // the presenter's laser: motion from the phone, turned into a spot by the same engine as the cursors (main.js feeds this)
  function laser(x, y) {
    if (!st.laser || root.hidden) return;
    laserEl.hidden = false;
    laserEl.style.transform = `translate(${x * innerWidth}px, ${y * innerHeight}px)`;
    clearTimeout(laserTimer); laserTimer = setTimeout(() => { laserEl.hidden = true; }, 700);
  }

  // ---- keyboard and USB clickers (they are keyboards that press PageDown / arrows) ----
  window.addEventListener('keydown', (e) => {
    if (!st.active || root.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key, go = (delta) => { e.preventDefault(); party.call('POST', '/present/goto', { delta }).catch(() => {}); };
    // Zoomed in: the arrows move around the page and Esc zooms back out (PageUp / PageDown still turn pages)
    const v = viewers[front];
    if (v.zoomed && ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(k)) { e.preventDefault(); v.panBy(k === 'ArrowLeft' ? 0.15 : k === 'ArrowRight' ? -0.15 : 0, k === 'ArrowUp' ? 0.15 : k === 'ArrowDown' ? -0.15 : 0); return; }
    if (v.zoomed && k === 'Escape') { e.preventDefault(); v.reset(); return; }
    if (k === '+' || k === '=') { e.preventDefault(); v.zoomBy(1.3); return; }
    if (k === '-') { e.preventDefault(); v.zoomBy(1 / 1.3); return; }
    if (k === 'f' || k === 'F') { e.preventDefault(); hub?.fullscreen(); return; }
    if (['ArrowRight', 'PageDown', ' ', 'Enter', 'ArrowDown'].includes(k)) go(1);
    else if (['ArrowLeft', 'PageUp', 'Backspace', 'ArrowUp'].includes(k)) go(-1);
    else if (k === 'b' || k === 'B' || k === '.') { e.preventDefault(); party.call('POST', '/present/black', {}).catch(() => {}); }
    else if (k === 'Escape') { e.preventDefault(); party.call('POST', '/present/end', {}).catch(() => {}); }
  });

  // PDFs: tell the server the page count, and send small pictures of the pages (for the phones), once, in the background
  const processing = new Set();
  async function processDeck(deck) {
    if (deck.kind !== 'pdf' || processing.has(deck.id) || (deck.pages && deck.thumbs >= deck.pages)) return;
    processing.add(deck.id);
    try {
      const doc = await openPdf(deck);
      for (let n = deck.thumbs + 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n), base = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: 320 / base.width });
        const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.7));
        await fetch(`/api/party/decks/${deck.id}/thumb/${n}`, { method: 'POST', headers: { ...party.headers(), 'content-type': 'image/jpeg' }, body: blob });
      }
    } catch (err) { console.warn('could not prepare slides', err); } finally { processing.delete(deck.id); }
  }

  return {
    el: root,
    get active() { return st.active; },
    get state() { return st; },
    // the viewer a phone's zoom keys are talking to (the TV's remote keys: arrows pan while zoomed in)
    get viewer() { return viewers[front]; },
    // D-pad on the TV: true when a zoomed-in view used the key
    handleKey(button) {
      const v = viewers[front];
      if (!v.zoomed) return false;
      const d = { LEFT: [0.15, 0], RIGHT: [-0.15, 0], UP: [0, 0.15], DOWN: [0, -0.15] }[button];
      if (d) { v.panBy(...d); return true; }
      if (button === 'A' || button === 'B') { v.reset(); return true; }
      return false;
    },
    setGameOpen(fn) { gameOpen = fn; },
    refresh: apply,
    laser,
    processDeck,
    next: () => party.call('POST', '/present/goto', { delta: 1 }).catch(() => {}),
    prev: () => party.call('POST', '/present/goto', { delta: -1 }).catch(() => {}),
    black: () => party.call('POST', '/present/black', {}).catch(() => {}),
    end: () => party.call('POST', '/present/end', {}).catch(() => {}),
    async init() { try { st = await party.call('GET', '/present'); apply(); } catch { /* none */ } },
  };
}
