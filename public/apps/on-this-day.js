// Today in History: what happened on today's date, who was born, and today's holidays, from Wikipedia's free "On this day"
// feed (needs internet, no account or key). It lives inside the News channel as its "Today in History" tab (news.js).
//   ▲ ▼ = browse (▲ on the first one goes up to the tabs) · ◀ ▶ = previous / next day · + / − = section · A = surprise me

const SECTIONS = [['selected', 'Highlights'], ['events', 'Events'], ['births', 'Born today'], ['holidays', 'Holidays']];
const VISIBLE = 9; // years shown in the timeline at once

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const mmdd = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
const cache = new Map(); // "MM/DD" -> feed

// api: the app's api (sound) · container: where it draws
export function createHistory({ api, container }) {
  let day = new Date(), section = 0, index = 0, data = null, error = null, loading = false, token = 0, dead = false;
  const root = document.createElement('div');
  root.className = 'nw-history';
  container.append(root);

  async function fetchDay() {
    const my = ++token, key = mmdd(day);
    error = null;
    if (cache.has(key)) { data = cache.get(key); loading = false; return render(); }
    loading = true; data = null; render();
    try {
      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/all/${key}`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Wikipedia answered ${res.status}`);
      const json = await res.json();
      cache.set(key, json);
      if (my !== token) return;
      data = json;
    } catch {
      if (my !== token) return;
      error = 'Could not reach Wikipedia. Is the laptop online?';
    }
    loading = false;
    render();
  }

  // The items of the current section, newest year first (holidays have no year)
  const items = () => [...(data?.[SECTIONS[section][0]] || [])].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

  function card(item) {
    const page = item.pages?.[0];
    const img = page?.thumbnail?.source;
    const year = item.year == null ? '' : item.year < 0 ? `${-item.year} BC` : item.year;
    return `<article class="otd-card">
      ${img ? `<img class="otd-img" src="${esc(img)}" alt="" data-smart>` : ''}
      <div class="otd-text">
        ${year !== '' ? `<div class="otd-year">${esc(year)}</div>` : ''}
        <p>${esc(item.text)}</p>
        ${page?.extract ? `<p class="otd-extract">${esc(page.extract.slice(0, 260))}${page.extract.length > 260 ? '…' : ''}</p>` : ''}
      </div>
    </article>`;
  }

  function render() {
    if (dead) return;
    const date = day.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
    const tabs = SECTIONS.map(([, name], i) => `<button type="button" class="tm-tab${i === section ? ' on' : ''}" data-sec="${i}">${name}</button>`).join('');
    let body;
    if (loading) body = '<div class="wx-status">Loading…</div>';
    else if (error) body = `<div class="wx-status">${esc(error)}</div>`;
    else {
      const list = items();
      if (!list.length) body = '<div class="wx-status">Nothing here for this day.</div>';
      else {
        index = Math.min(index, list.length - 1);
        const from = Math.max(0, Math.min(index - Math.floor(VISIBLE / 2), list.length - VISIBLE));
        const rows = list.slice(from, from + VISIBLE).map((it, n) => `<li class="${from + n === index ? 'on' : ''}" data-ui data-i="${from + n}">
          <b>${it.year == null ? '•' : esc(it.year < 0 ? `${-it.year} BC` : it.year)}</b><span>${esc(it.text)}</span></li>`).join('');
        body = `<div class="otd-main">${card(list[index])}<ol class="otd-list">${rows}</ol></div><p class="otd-count">${index + 1} of ${list.length}</p>`;
      }
    }
    root.innerHTML = `<div class="nw-hist-head"><h2>Today in History · ${esc(date)}</h2><div class="tm-tabs">${tabs}</div>
        <span class="nw-hist-days"><button type="button" class="ui-btn ghost" data-day="-1" aria-label="Day before">‹</button><button type="button" class="ui-btn ghost" data-day="1" aria-label="Next day">›</button></span></div>
      ${body}
      <footer class="otd-foot"><span>▲ ▼ browse · ◀ ▶ day · + − section · A surprise me</span><span>From Wikipedia, the free encyclopedia (CC BY-SA)</span></footer>`;
    import('../shared/smart-crop.js').then((m) => m.smartCover(root)).catch(() => {});
  }

  // Pointer: hovering a year selects it, a tap on a section or the day arrows uses them
  root.addEventListener('ui-hover', (ev) => { const li = ev.target.closest?.('li[data-i]'); if (li && Number(li.dataset.i) !== index) { index = Number(li.dataset.i); render(); } });
  root.addEventListener('click', (ev) => {
    const sec = ev.target.closest?.('[data-sec]'), d = ev.target.closest?.('[data-day]');
    if (sec) { section = Number(sec.dataset.sec); index = 0; api.sound.play('hover'); render(); }
    else if (d) { day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + Number(d.dataset.day)); index = 0; api.sound.play('tick'); fetchDay(); }
  });
  fetchDay();

  return {
    // true when the key was used here. `up` at the first item is for the tab row to take
    onButton(button) {
      const n = items().length;
      if (button === 'UP') { if (index > 0) { index -= 1; api.sound.play('hover'); render(); return true; } return false; }
      if (button === 'DOWN') { if (n) { index = Math.min(n - 1, index + 1); api.sound.play('hover'); render(); } return true; }
      if (button === 'LEFT' || button === 'RIGHT') { day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + (button === 'RIGHT' ? 1 : -1)); index = 0; api.sound.play('tick'); fetchDay(); return true; }
      if (button === 'PLUS' || button === 'MINUS') { section = (section + (button === 'PLUS' ? 1 : SECTIONS.length - 1)) % SECTIONS.length; index = 0; api.sound.play('hover'); render(); return true; }
      if (button === 'A') { if (n > 1) { let next = index; while (next === index) next = Math.floor(Math.random() * n); index = next; api.sound.play('select'); render(); } return true; }
      return false;
    },
    destroy() { dead = true; token++; root.remove(); },
  };
}
