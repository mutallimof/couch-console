// On This Day channel: what happened on today's date in history, who was born, and today's
// holidays, from Wikipedia's free "On this day" feed (needs internet, no account or key).
//   ◀ ▶ = section · ▲ ▼ = browse · + / − = next / previous day · A = surprise me · B = back to the menu

const SECTIONS = [['selected', 'Highlights'], ['events', 'Events'], ['births', 'Born today'], ['holidays', 'Holidays']];
const VISIBLE = 9; // years shown in the timeline at once

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round">
  <rect x="7" y="10" width="34" height="31" rx="5"/><path d="M7 19h34M16 6v8M32 6v8" stroke-linecap="round"/>
  <path d="M19 29l4 4 8-8" stroke-linecap="round"/>
</svg>`;

let api, root, day, section, index, data, error, loading, token = 0;
const cache = new Map(); // "MM/DD" -> feed

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const mmdd = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;

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
function items() {
  const list = data?.[SECTIONS[section][0]] || [];
  return [...list].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
}

function card(item) {
  const page = item.pages?.[0];
  const img = page?.thumbnail?.source;
  const year = item.year == null ? '' : item.year < 0 ? `${-item.year} BC` : item.year;
  return `<article class="otd-card">
      ${img ? `<img class="otd-img" src="${esc(img)}" alt="">` : ''}
      <div class="otd-text">
        ${year !== '' ? `<div class="otd-year">${esc(year)}</div>` : ''}
        <p>${esc(item.text)}</p>
        ${page?.extract ? `<p class="otd-extract">${esc(page.extract.slice(0, 260))}${page.extract.length > 260 ? '…' : ''}</p>` : ''}
      </div>
    </article>`;
}

function render() {
  if (!root) return;
  const date = day.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  const tabs = SECTIONS.map(([, name], i) => `<span class="tm-tab${i === section ? ' on' : ''}">${name}</span>`).join('');
  let body;
  if (loading) body = '<div class="wx-status">Loading…</div>';
  else if (error) body = `<div class="wx-status">${esc(error)}</div>`;
  else {
    const list = items();
    if (!list.length) body = '<div class="wx-status">Nothing here for this day.</div>';
    else {
      index = Math.min(index, list.length - 1);
      const from = Math.max(0, Math.min(index - Math.floor(VISIBLE / 2), list.length - VISIBLE));
      const rows = list.slice(from, from + VISIBLE).map((it, n) => `<li class="${from + n === index ? 'on' : ''}">
        <b>${it.year == null ? '•' : esc(it.year < 0 ? `${-it.year} BC` : it.year)}</b><span>${esc(it.text)}</span></li>`).join('');
      body = `<div class="otd-main">${card(list[index])}
        <ol class="otd-list">${rows}</ol></div>
        <p class="otd-count">${index + 1} of ${list.length}</p>`;
    }
  }
  root.innerHTML = `<div class="channel-head"><h1>On This Day · ${esc(date)}</h1><div class="tm-tabs">${tabs}</div></div>
    ${body}
    <footer class="otd-foot"><span>◀ ▶ section · ▲ ▼ browse · + − change day · A surprise me · B menu</span>
      <span>From Wikipedia, the free encyclopedia (CC BY-SA)</span></footer>`;
}

function onButton({ button, state }) {
  if (state !== 'down') return;
  if (button === 'B') return api.exit();
  const n = items().length;
  if (button === 'LEFT' || button === 'RIGHT') {
    section = (section + (button === 'RIGHT' ? 1 : SECTIONS.length - 1)) % SECTIONS.length;
    index = 0; api.sound.play('hover');
  } else if ((button === 'UP' || button === 'DOWN') && n) {
    index = Math.max(0, Math.min(n - 1, index + (button === 'DOWN' ? 1 : -1)));
    api.sound.play('hover');
  } else if (button === 'A' && n > 1) {
    let next = index;
    while (next === index) next = Math.floor(Math.random() * n);
    index = next; api.sound.play('select');
  } else if (button === 'PLUS' || button === 'MINUS') {
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + (button === 'PLUS' ? 1 : -1));
    index = 0; api.sound.play('tick');
    return fetchDay();
  } else return;
  render();
}

export default {
  id: 'on-this-day',
  title: 'On This Day',
  color: '#7048E8',
  icon: ICON,
  minPlayers: 1,
  maxPlayers: 1,
  mount(container, gameApi) {
    api = gameApi;
    day = new Date();
    section = 0; index = 0; data = null;
    root = document.createElement('div');
    root.className = 'channel otd';
    container.append(root);
    api.onButton(onButton);
    fetchDay();
  },
  unmount() {
    token++;
    root?.remove();
    api = root = null;
  },
};
