// Weather channel: today's weather and the next 5 days, from the free Open-Meteo service
// (needs internet, no account or key).
//   ◀ ▶ = change city · + / − = °C / °F · A = refresh · B = back to the menu

const CITIES = [
  { name: 'My location', here: true },
  { name: 'London', lat: 51.51, lon: -0.13 }, { name: 'Baku', lat: 40.41, lon: 49.87 },
  { name: 'New York', lat: 40.71, lon: -74.01 }, { name: 'Istanbul', lat: 41.01, lon: 28.98 },
  { name: 'Paris', lat: 48.86, lon: 2.35 }, { name: 'Berlin', lat: 52.52, lon: 13.41 },
  { name: 'Dubai', lat: 25.2, lon: 55.27 }, { name: 'Tokyo', lat: 35.68, lon: 139.69 },
  { name: 'Sydney', lat: -33.87, lon: 151.21 }, { name: 'Toronto', lat: 43.65, lon: -79.38 },
  { name: 'São Paulo', lat: -23.55, lon: -46.63 },
];
const KEY = 'couch.weather';

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" fill="#fff">
  <circle cx="18" cy="18" r="8"/><path d="M14 40a9 9 0 0 1 1-18 11 11 0 0 1 21 3 7.5 7.5 0 0 1-1 15z" stroke="#56CCF2" stroke-width="2"/>
</svg>`;

let api, root, cityIndex, unit, data, error, loading, token = 0;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ city: cityIndex, unit })); } catch { /* ignore */ }
}

// WMO weather codes -> our icon kinds and words
function kindOf(code) {
  if (code === 0) return ['clear', 'Clear sky'];
  if (code <= 2) return ['partly', 'Partly cloudy'];
  if (code === 3) return ['cloudy', 'Cloudy'];
  if (code === 45 || code === 48) return ['fog', 'Fog'];
  if (code >= 51 && code <= 57) return ['rain', 'Drizzle'];
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return ['rain', 'Rain'];
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ['snow', 'Snow'];
  if (code >= 95) return ['storm', 'Thunderstorm'];
  return ['cloudy', 'Cloudy'];
}

// Original animated icons (inline SVG + CSS animations in console.css)
function icon(kind, night = false, size = 220) {
  const sun = night
    ? '<path class="wx-moon" d="M70 30a34 34 0 1 0 30 50 28 28 0 0 1-30-50z" fill="#F2E8C9"/>'
    : `<g class="wx-sun"><circle cx="60" cy="50" r="22" fill="#FFD43B"/>${Array.from({ length: 8 }, (_, i) =>
      `<rect x="57" y="12" width="6" height="12" rx="3" fill="#FFD43B" transform="rotate(${i * 45} 60 50)"/>`).join('')}</g>`;
  const cloud = (cls, x, y, s, color = '#fff') =>
    `<g class="${cls}" transform="translate(${x} ${y}) scale(${s})"><path d="M20 60a18 18 0 0 1 4-35 24 24 0 0 1 45 6 15 15 0 0 1 1 29z" fill="${color}"/></g>`;
  const drops = (sym) => [30, 50, 70, 90].map((x, i) =>
    `<text class="wx-drop" style="--d:${i * 0.25}s" x="${x}" y="108" font-size="22" fill="${sym === '❄' ? '#fff' : '#56CCF2'}">${sym}</text>`).join('');
  const parts = {
    clear: sun,
    partly: sun + cloud('wx-cloud', 30, 40, 1, '#F4F7FB'),
    cloudy: cloud('wx-cloud slow', 5, 25, 1.05, '#D5DBE3') + cloud('wx-cloud', 30, 40, 1, '#F4F7FB'),
    fog: cloud('wx-cloud', 18, 20, 1.05, '#E6EEF7') + [72, 86, 100].map((y, i) => `<rect class="wx-fog" style="--d:${i * 0.4}s" x="15" y="${y}" width="90" height="6" rx="3" fill="#E6EEF7"/>`).join(''),
    rain: cloud('wx-cloud', 18, 15, 1.05, '#C9D2DE') + drops('│'),
    snow: cloud('wx-cloud', 18, 15, 1.05, '#E6EEF7') + drops('❄'),
    storm: cloud('wx-cloud', 18, 15, 1.05, '#8A94A6') + '<path class="wx-bolt" d="M62 70l-14 24h12l-6 22 20-30H62l8-16z" fill="#FFD43B"/>',
  };
  return `<svg class="wx-icon" viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true">${parts[kind]}</svg>`;
}

const temp = (c) => `${Math.round(unit === 'F' ? c * 9 / 5 + 32 : c)}°${unit}`;
const dayName = (iso, i) => (i === 0 ? 'Today' : new Date(`${iso}T12:00`).toLocaleDateString([], { weekday: 'short' }));

function where() {
  const c = CITIES[cityIndex];
  if (!c.here) return Promise.resolve(c);
  // The laptop's browser asks once for permission to share its location
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('no geolocation'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ ...c, lat: p.coords.latitude, lon: p.coords.longitude }),
      () => reject(new Error('Location not allowed. Choose a city with ◀ ▶.')),
      { timeout: 8000, maximumAge: 30 * 60 * 1000 },
    );
  });
}

async function fetchWeather() {
  const my = ++token;
  loading = true; error = null; render();
  try {
    const c = await where();
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}`
      + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day'
      + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=6';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`The weather service answered ${res.status}`);
    const json = await res.json();
    if (my !== token) return;
    data = json;
  } catch (err) {
    if (my !== token) return;
    error = err.message.startsWith('Location') ? err.message : 'Could not get the weather. Is the laptop online?';
    data = null;
  }
  loading = false;
  render();
}

function render() {
  if (!root) return;
  const city = CITIES[cityIndex].name;
  let body;
  if (loading && !data) body = '<div class="wx-status">Loading…</div>';
  else if (error) body = `<div class="wx-status">${error}</div>`;
  else {
    const cur = data.current, d = data.daily;
    const [kind, words] = kindOf(cur.weather_code);
    root.dataset.kind = cur.is_day ? kind : 'night';
    body = `<div class="wx-now">
        ${icon(kind, !cur.is_day && (kind === 'clear' || kind === 'partly'))}
        <div><div class="wx-temp">${temp(cur.temperature_2m)}</div><div class="wx-words">${words}</div>
          <div class="wx-details">Feels like ${temp(cur.apparent_temperature)} · Humidity ${cur.relative_humidity_2m}% · Wind ${Math.round(cur.wind_speed_10m)} km/h</div></div>
      </div>
      <div class="wx-days">${d.time.slice(0, 6).map((t, i) => `<div class="wx-day">
        <b>${dayName(t, i)}</b>${icon(kindOf(d.weather_code[i])[0], false, 70)}
        <span>${temp(d.temperature_2m_max[i])} <small>${temp(d.temperature_2m_min[i])}</small></span>
        <small>💧 ${d.precipitation_probability_max[i] ?? 0}%</small></div>`).join('')}</div>`;
  }
  root.innerHTML = `<div class="channel-head"><h1>◀ ${city} ▶</h1><span>${loading ? 'Updating…' : '◀ ▶ city · + / − °C/°F · A refresh · B menu'}</span></div>${body}`;
}

function onButton({ button, state }) {
  if (state !== 'down') return;
  if (button === 'B') return api.exit();
  if (button === 'LEFT' || button === 'RIGHT') {
    cityIndex = (cityIndex + (button === 'RIGHT' ? 1 : CITIES.length - 1)) % CITIES.length;
    data = null; save(); api.sound.play('hover'); fetchWeather();
  } else if (button === 'PLUS' || button === 'MINUS') {
    unit = unit === 'C' ? 'F' : 'C'; save(); api.sound.play('tick'); render();
  } else if (button === 'A') {
    api.sound.play('select'); fetchWeather();
  }
}

export default {
  id: 'weather',
  title: 'Weather',
  color: '#56A0D3',
  icon: ICON,
  minPlayers: 1,
  maxPlayers: 1,
  mount(container, gameApi) {
    api = gameApi;
    const saved = load();
    cityIndex = Number.isInteger(saved.city) && CITIES[saved.city] ? saved.city : 0;
    unit = saved.unit === 'F' ? 'F' : 'C';
    data = null;
    root = document.createElement('div');
    root.className = 'channel weather';
    container.append(root);
    api.onButton(onButton);
    fetchWeather();
  },
  unmount() {
    token++;
    root?.remove();
    api = root = null;
  },
};
