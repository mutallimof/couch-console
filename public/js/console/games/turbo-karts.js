// Turbo Karts: a 3D kart race. Phones become steering wheels (hold sideways, turn to steer).
//   A = gas · B = brake · hold B while turning fast = drift → let go for a mini-turbo
//   D-pad ◀ ▶ also steers (for phones without motion sensors).
// Modes: solo (you + 5 CPU) · versus (2 players, split screen) · co-op (team points vs the 2 best CPUs)
import { colorFor } from '../../shared/protocol.js';
import { buildTrack, ROAD_HALF, WALL } from './kart-track.js';

const LAPS = 3;
const CPU = [['Comet', '#27AE60'], ['Volt', '#F2C94C'], ['Nova', '#9B51E0'], ['Blaze', '#F2994A'], ['Frost', '#56CCF2']];
const POINTS = [10, 8, 6, 5, 4, 3]; // co-op points by finishing place
const KART_SIZE = 3.2; // karts closer than this bump apart
const ACCEL = 20, COAST = 6, BRAKE = 30, MAX_V = 30, OFFROAD_V = 13, BOOST_V = 42, TURN = 1.9;

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" fill="#fff">
  <path d="M10 30h28l-3-9H19l-4-5h-4z"/><circle cx="15" cy="33" r="5"/><circle cx="34" cy="33" r="5"/>
  <circle cx="15" cy="33" r="2" fill="#2F80ED"/><circle cx="34" cy="33" r="2" fill="#2F80ED"/>
</svg>`;

let THREE = null;          // loaded on first use (big library)
let api, root, renderer, scene, track, frame, lastT, resizeObserver, minimap, mctx;
let karts, humans, state, timer, raceTime, overAt, paused = false, alive = 0;
const input = new Map();   // playerId -> { steer, gas, brake, left, right }

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n % 10 > 3 || Math.floor(n / 10) === 1 ? 0 : n % 10]}`;
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// ---------- Kart model ----------

function makeKartMesh(color) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: '#2B3445' });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.45, 2.6), paint);
  body.position.y = 0.55;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.9), paint);
  nose.position.set(0, 0.5, 1.6);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.5), dark);
  seat.position.set(0, 0.95, -0.6);
  const driver = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.7, 10), new THREE.MeshLambertMaterial({ color: '#F4F7FB' }));
  driver.position.set(0, 1.15, -0.25);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 10), paint);
  helmet.position.set(0, 1.7, -0.25);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.12), dark);
  visor.position.set(0, 1.72, 0.08);
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.4), dark);
  spoiler.position.set(0, 1.15, -1.35);
  g.add(body, nose, seat, driver, helmet, visor, spoiler);
  const wheels = [];
  for (const [x, z] of [[-0.95, 0.95], [0.95, 0.95], [-0.95, -0.95], [0.95, -0.95]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.4, 12), dark);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.42, z);
    g.add(w);
    wheels.push(w);
  }
  // Drift sparks (behind the back wheels) and the boost flame
  const sparkMat = new THREE.MeshBasicMaterial({ color: '#56CCF2' });
  const sparks = [-0.95, 0.95].map((x) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), sparkMat);
    s.position.set(x, 0.25, -1.35);
    g.add(s);
    return s;
  });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 10), new THREE.MeshBasicMaterial({ color: '#FF922B' }));
  flame.rotation.x = -Math.PI / 2;
  flame.position.set(0, 0.6, -1.9);
  g.add(flame);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.7, 20), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.25 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.06;
  shadow.scale.set(0.75, 1.15, 1);
  g.add(shadow);
  return { group: g, wheels, sparks, sparkMat, flame };
}

// ---------- Race setup ----------

function newRace() {
  // Remove old karts and their engine sounds
  karts?.forEach((k) => scene.remove(k.mesh.group));
  humans?.forEach((h) => h.engine?.stop());
  lastCount = null;
  const humanIds = api.players.map((p) => p.playerId).slice(0, api.mode === 'solo' ? 1 : 2);
  const list = [
    ...humanIds.map((id) => ({ playerId: id, name: `P${id}`, color: colorFor(id) })),
    ...CPU.slice(0, 6 - humanIds.length).map(([name, color]) => ({ playerId: null, name, color })),
  ];
  // Grid: two columns behind the start line, humans at the back (like a real start)
  const order = [...list.filter((k) => !k.playerId), ...list.filter((k) => k.playerId)];
  karts = order.map((k, n) => {
    const i = track.at(-6 - Math.floor(n / 2) * 8);
    const side = n % 2 ? -3.5 : 3.5;
    const p = track.pts[i], nr = track.nor[i], t = track.tan[i];
    const mesh = makeKartMesh(k.color);
    scene.add(mesh.group);
    return {
      ...k, mesh,
      x: p.x + nr.x * side, z: p.z + nr.z * side,
      heading: Math.atan2(t.x, t.z), v: 0,
      idx: i, lateral: side, lap: 0, half: true, finished: null,
      drifting: false, driftDir: 0, charge: 0, boost: 0, wallCooldown: 0, roll: 0,
      skill: 0.86 + Math.random() * 0.1, lane: (Math.random() - 0.5) * 8, laneTimer: 0,
    };
  });
  humans = karts.filter((k) => k.playerId);
  humans.sort((a, b) => a.playerId - b.playerId);
  humans.forEach((h) => {
    h.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 900);
    h.camPos = null;
    h.engine = api.sound.loop('sawtooth');
  });
  input.clear();
  state = 'countdown';
  timer = 0;
  raceTime = 0;
  buildHud();
  resize();
}

// ---------- Physics ----------

function controls(k) {
  if (!k.playerId) return cpuControls(k);
  const c = input.get(k.playerId) || {};
  const digital = (c.right ? 1 : 0) - (c.left ? 1 : 0);
  return { steer: digital || c.steer || 0, gas: !!c.gas, brake: !!c.brake };
}

// CPU drivers aim at a point a little further down the track, in their own lane.
function cpuControls(k) {
  k.laneTimer -= 1 / 60;
  if (k.laneTimer < 0) { k.lane = (Math.random() - 0.5) * 9; k.laneTimer = 2 + Math.random() * 3; }
  const i = track.at(k.idx + 14), p = track.pts[i], n = track.nor[i];
  const tx = p.x + n.x * k.lane, tz = p.z + n.z * k.lane;
  const want = Math.atan2(tx - k.x, tz - k.z);
  return { steer: clamp(angleDiff(want, k.heading) * -2.2, -1, 1), gas: true, brake: false };
}

function stepKart(k, dt) {
  // Before GO nobody moves; after the finish line everyone cruises on like a CPU.
  const { steer, gas, brake } = state === 'countdown' ? { steer: 0, gas: false, brake: false }
    : k.finished != null ? cpuControls(k) : controls(k);
  const offroad = Math.abs(k.lateral) > ROAD_HALF + 0.6;
  // CPUs: a bit slower or faster depending on how the humans are doing (keeps races close)
  let top = k.boost > 0 ? BOOST_V : offroad ? OFFROAD_V : MAX_V;
  if (!k.playerId) top *= k.skill + rubberBand(k);

  if (gas) k.v = Math.min(k.v + ACCEL * dt, Math.max(top, k.v - 25 * dt));
  else k.v -= Math.sign(k.v) * Math.min(Math.abs(k.v), COAST * dt);
  if (k.v > top) k.v = Math.max(top, k.v - 25 * dt);

  // Drift: hold brake while turning at speed. Charge builds; letting go gives a boost.
  if (k.playerId) {
    if (!k.drifting && brake && Math.abs(steer) > 0.3 && k.v > 15) {
      k.drifting = true; k.driftDir = Math.sign(steer); k.charge = 0;
    }
    if (k.drifting && (!brake || k.v < 10)) {
      if (k.charge > 2.2) giveBoost(k, 1.6);
      else if (k.charge > 1.0) giveBoost(k, 1.0);
      k.drifting = false;
    }
  }
  if (brake && !k.drifting) k.v = Math.max(k.v - BRAKE * dt, -8);

  let turn;
  if (k.drifting) {
    turn = (k.driftDir * 0.65 + steer * 0.45) * TURN * 1.25;
    k.charge += dt * (0.8 + Math.abs(steer));
  } else {
    turn = steer * TURN * clamp(Math.abs(k.v) / 12, 0, 1) * Math.sign(k.v || 1);
  }
  // Positive steer = right = turning clockwise seen from above
  k.heading -= turn * dt;
  const slide = k.drifting ? k.driftDir * 0.35 : 0; // drifting karts slide outwards a little
  k.x += Math.sin(k.heading + slide) * k.v * dt;
  k.z += Math.cos(k.heading + slide) * k.v * dt;
  k.roll += (turn * 0.06 - k.roll) * Math.min(1, dt * 8);

  // Where are we on the track?
  const prev = k.idx;
  const loc = track.locate(k.x, k.z, k.idx);
  k.idx = loc.i; k.lateral = loc.lateral;
  lapCheck(k, prev);

  // Barriers: bounce back in, lose speed
  k.wallCooldown -= dt;
  if (Math.abs(k.lateral) > WALL - 1.1) {
    const n = track.nor[k.idx], push = Math.sign(k.lateral) * (Math.abs(k.lateral) - (WALL - 1.1));
    k.x -= n.x * push; k.z -= n.z * push;
    // Turn the kart a little to slide along the wall instead of sticking to it.
    const t = track.tan[k.idx], along = Math.atan2(t.x, t.z);
    k.heading += angleDiff(along, k.heading) * 0.3;
    if (k.wallCooldown < 0) {
      // A real hit: lose speed, buzz. Scraping along afterwards only slows a little.
      k.wallCooldown = 0.4;
      k.v *= 0.6;
      if (k.playerId) { api.rumble(k.playerId, 120); api.sound.play('wall'); }
    } else {
      k.v *= 1 - 1.5 * dt;
    }
  }
  // Boost pads
  for (const pad of track.pads) {
    const di = Math.abs(((k.idx - pad.i + track.SAMPLES * 1.5) % track.SAMPLES) - track.SAMPLES / 2);
    if (di < 3 && Math.abs(k.lateral - pad.side) < 2.6 && k.boost < 0.8) giveBoost(k, 1.2);
  }
  k.boost = Math.max(0, k.boost - dt);
}

function giveBoost(k, seconds) {
  k.boost = Math.max(k.boost, seconds);
  k.v = Math.max(k.v, MAX_V + 4);
  if (k.playerId) { api.sound.play('golden'); api.rumble(k.playerId, 80); }
}

function rubberBand(k) {
  if (!humans.length) return 0;
  const best = Math.max(...humans.map(progress));
  const gap = (best - progress(k)) / track.SAMPLES; // laps behind the leading human
  return clamp(gap * 0.25, -0.08, 0.08);
}

function lapCheck(k, prev) {
  const N = track.SAMPLES;
  if (k.idx > N * 0.4 && k.idx < N * 0.6) k.half = true;
  if (prev > N * 0.8 && k.idx < N * 0.2 && k.half) {          // crossed the line going forward
    k.lap++; k.half = false;
    if (k.lap > LAPS && !k.finished) {
      k.finished = raceTime;
      if (k.playerId) {
        api.sound.play(place(k) === 1 ? 'strike' : 'end');
        api.rumble(k.playerId, 250);
      }
    } else if (k.playerId && k.lap === LAPS) { k.finalLapAt = raceTime; api.sound.play('start'); }
  } else if (prev < N * 0.2 && k.idx > N * 0.8) {             // went back over the line
    k.lap = Math.max(0, k.lap - 1); k.half = true;
  }
}

// Kart-to-kart bumps
function bumpKarts() {
  for (let a = 0; a < karts.length; a++) {
    for (let b = a + 1; b < karts.length; b++) {
      const A = karts[a], B = karts[b];
      const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz);
      if (d > 0 && d < KART_SIZE) {
        const push = (KART_SIZE - d) / 2, nx = dx / d, nz = dz / d;
        A.x -= nx * push; A.z -= nz * push; B.x += nx * push; B.z += nz * push;
        const avg = (A.v + B.v) / 2;
        A.v = A.v * 0.7 + avg * 0.3; B.v = B.v * 0.7 + avg * 0.3;
      }
    }
  }
}

const progress = (k) => (k.finished != null ? 1e9 - k.finished * 1000 : k.lap * track.SAMPLES + k.idx);
function standings() { return [...karts].sort((a, b) => progress(b) - progress(a)); }
const place = (k) => standings().indexOf(k) + 1;

// ---------- Update ----------

function update(dt) {
  timer += dt;
  if (state === 'countdown') {
    const n = 3 - Math.floor(timer);
    if (n !== lastCount) { lastCount = n; api.sound.play(n > 0 ? 'tick' : 'start'); }
    if (timer >= 3) { state = 'race'; timer = 0; }
  }
  if (state === 'race' || state === 'done') raceTime += state === 'race' ? dt : 0;
  const steps = 2;
  for (let s = 0; s < steps; s++) {
    for (const k of karts) stepKart(k, dt / steps);
    bumpKarts();
  }
  // Race over when every human has finished (CPUs that are still driving keep their place)
  if (state === 'race' && humans.every((h) => h.finished != null)) {
    state = 'done';
    timer = 0;
  }
  if (state === 'done' && timer > 1.5 && !overAt) showResults();
}
let lastCount = null;

// ---------- Rendering ----------

function syncMeshes(t) {
  for (const k of karts) {
    const m = k.mesh;
    m.group.position.set(k.x, 0, k.z);
    m.group.rotation.set(0, k.heading + (k.drifting ? k.driftDir * -0.35 : 0), 0);
    m.group.rotation.z = k.roll;
    m.wheels.forEach((w) => { w.rotation.x += k.v * 0.016; });
    const showSparks = k.drifting && k.charge > 0.3;
    m.sparks.forEach((s) => { s.visible = showSparks; s.scale.setScalar(0.6 + Math.random() * 0.8); });
    m.sparkMat.color.set(k.charge > 2.2 ? '#FF922B' : k.charge > 1.0 ? '#56CCF2' : '#F4F7FB');
    m.flame.visible = k.boost > 0;
    m.flame.scale.set(1, 0.8 + Math.sin(t * 0.05) * 0.3, 1);
  }
}

function moveCamera(h, dt) {
  const fx = Math.sin(h.heading), fz = Math.cos(h.heading);
  const want = new THREE.Vector3(h.x - fx * 7.5, 3.4, h.z - fz * 7.5);
  if (!h.camPos) h.camPos = want.clone();
  h.camPos.lerp(want, 1 - Math.exp(-6 * dt));
  h.camera.position.copy(h.camPos);
  h.camera.lookAt(h.x + fx * 6, 1, h.z + fz * 6);
  // A wider view while boosting feels faster
  const fov = 68 + (h.boost > 0 ? 10 : 0) + Math.max(0, h.v - 20) * 0.3;
  h.camera.fov += (fov - h.camera.fov) * Math.min(1, dt * 5);
  h.camera.updateProjectionMatrix();
  h.engine?.set(55 + Math.abs(h.v) * 4.5, state === 'countdown' ? 0.02 : 0.035);
}

function render() {
  const W = root.clientWidth, H = root.clientHeight;
  const n = humans.length;
  humans.forEach((h, i) => {
    // Split screen: P1 on top, P2 at the bottom
    const vh = H / n, y = H - vh * (i + 1);
    renderer.setViewport(0, y, W, vh);
    renderer.setScissor(0, y, W, vh);
    h.camera.aspect = W / vh;
    renderer.render(scene, h.camera);
  });
}

function drawMinimap() {
  const size = minimap.width, pad = 10;
  mctx.clearRect(0, 0, size, size);
  const xs = track.pts.map((p) => p.x), zs = track.pts.map((p) => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const sc = (size - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
  // centered in the box
  const ox = (size - (maxX - minX) * sc) / 2, oz = (size - (maxZ - minZ) * sc) / 2;
  const map = (x, z) => [ox + (x - minX) * sc, oz + (z - minZ) * sc];
  mctx.strokeStyle = 'rgba(255,255,255,0.9)'; mctx.lineWidth = 6; mctx.lineJoin = 'round';
  mctx.beginPath();
  track.pts.forEach((p, i) => { const [x, y] = map(p.x, p.z); i ? mctx.lineTo(x, y) : mctx.moveTo(x, y); });
  mctx.closePath(); mctx.stroke();
  for (const k of [...karts].reverse()) {
    const [x, y] = map(k.x, k.z);
    mctx.fillStyle = k.color;
    mctx.beginPath(); mctx.arc(x, y, k.playerId ? 6 : 4, 0, Math.PI * 2); mctx.fill();
    if (k.playerId) { mctx.strokeStyle = '#fff'; mctx.lineWidth = 2; mctx.stroke(); }
  }
}

// ---------- HUD (HTML on top of the 3D view) ----------

function buildHud() {
  root.querySelectorAll('.kart-hud, .kart-results').forEach((e) => e.remove());
  overAt = null;
  humans.forEach((h, i) => {
    const el = document.createElement('div');
    el.className = 'kart-hud';
    el.style.top = `${(i * 100) / humans.length}%`;
    el.style.height = `${100 / humans.length}%`;
    el.style.setProperty('--player', h.color);
    el.innerHTML = `<div class="kart-place"></div><div class="kart-lap"></div><div class="kart-tag">P${h.playerId}</div>
      <div class="kart-drift"></div><div class="kart-msg"></div>`;
    root.append(el);
    h.hud = el;
  });
}

function updateHud() {
  const order = standings();
  for (const h of humans) {
    const q = (s) => h.hud.querySelector(s);
    q('.kart-place').textContent = ordinal(order.indexOf(h) + 1);
    q('.kart-lap').textContent = `Lap ${clamp(h.lap, 1, LAPS)}/${LAPS}`;
    q('.kart-drift').textContent = h.drifting ? (h.charge > 2.2 ? 'TURBO!' : h.charge > 1 ? 'Boost ready' : 'Drift…') : '';
    let msg = '';
    if (state === 'countdown') msg = timer < 3 ? String(3 - Math.floor(timer)) : '';
    else if (state === 'race' && timer < 1) msg = 'GO!';
    else if (h.finished != null) msg = `Finished ${ordinal(order.indexOf(h) + 1)}!`;
    else if (h.finalLapAt != null && raceTime - h.finalLapAt < 2) msg = 'Final lap!';
    q('.kart-msg').textContent = msg;
  }
}

function showResults() {
  overAt = performance.now();
  humans.forEach((h) => h.engine?.set(0, 0));
  const order = standings();
  const fmt = (t) => (t == null ? '—' : `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`);
  let banner, color = '#5B6577';
  if (api.mode === 'coop') {
    const pts = (k) => POINTS[order.indexOf(k)];
    const team = humans.reduce((s, h) => s + pts(h), 0);
    const rivals = order.filter((k) => !k.playerId).slice(0, 2).reduce((s, k) => s + pts(k), 0);
    banner = team > rivals ? `Team wins! ${team} – ${rivals}` : team === rivals ? `Tie! ${team} – ${rivals}` : `Rivals win ${rivals} – ${team}`;
    if (team > rivals) color = '#27AE60';
  } else {
    const winner = order[0];
    banner = winner.playerId ? `P${winner.playerId} wins!` : `${winner.name} wins!`;
    if (winner.playerId) color = winner.color;
  }
  const rows = order.map((k, i) => `<tr style="--c:${k.color}"><td>${ordinal(i + 1)}</td><td><span class="dot"></span>${k.name}</td>
    <td>${fmt(k.finished)}</td>${api.mode === 'coop' ? `<td>${POINTS[i]} pts</td>` : ''}</tr>`).join('');
  const el = document.createElement('div');
  el.className = 'kart-results';
  el.innerHTML = `<div class="kart-card"><h1 style="background:${color}">${banner}</h1><table>${rows}</table>
    <p>A = race again · B = menu</p></div>`;
  root.append(el);
}

// ---------- Loop & input ----------

function loop(t) {
  const dt = Math.min(0.05, (t - (lastT ?? t)) / 1000);
  lastT = t;
  if (!paused) update(dt);
  syncMeshes(t);
  humans.forEach((h) => moveCamera(h, dt));
  render();
  updateHud();
  drawMinimap();
  frame = requestAnimationFrame(loop);
}

function inputFor(playerId) {
  if (!input.has(playerId)) input.set(playerId, { steer: 0 });
  return input.get(playerId);
}

function onButton({ playerId, button, state: s }) {
  const c = inputFor(playerId), down = s === 'down';
  if (button === 'A') c.gas = down;
  if (button === 'B') c.brake = down;
  if (button === 'LEFT') c.left = down;
  if (button === 'RIGHT') c.right = down;
  if (!down || !overAt) return;
  if (button === 'A' && performance.now() - overAt > 1500) { newRace(); api.sound.play('select'); }
  else if (button === 'B' && playerId === humans[0]?.playerId) api.exit();
}

function resize() {
  if (!renderer) return;
  renderer.setSize(root.clientWidth, root.clientHeight, false);
}

async function init(token) {
  try {
    THREE ??= await import('three');
  } catch (err) {
    root.querySelector('.kart-loading').textContent = 'Could not load the 3D engine. Did you run `npm install`?';
    console.error(err);
    return;
  }
  if (token !== alive) return; // closed while loading
  root.querySelector('.kart-loading').remove();
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setScissorTest(true);
  renderer.domElement.className = 'game-canvas';
  root.prepend(renderer.domElement);
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#9FD3FF');
  scene.fog = new THREE.Fog('#9FD3FF', 140, 420);
  scene.add(new THREE.HemisphereLight('#ffffff', '#5a8f4e', 1.1));
  const sun = new THREE.DirectionalLight('#ffffff', 1.4);
  sun.position.set(60, 100, 40);
  scene.add(sun);
  track = buildTrack(THREE);
  scene.add(track.group);
  newRace();
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(root);
  api.onButton(onButton);
  api.onWheel(({ playerId, steer }) => { inputFor(playerId).steer = steer; });
  lastT = null;
  frame = requestAnimationFrame(loop);
}

export default {
  id: 'turbo-karts',
  title: 'Turbo Karts',
  color: '#2F80ED',
  icon: ICON,
  minPlayers: 1,
  maxPlayers: 2,
  modes: ['versus', 'coop', 'solo'],
  mount(container, gameApi) {
    api = gameApi;
    api.setController('wheel'); // phones turn into steering wheels
    root = document.createElement('div');
    root.className = 'kart';
    root.innerHTML = '<div class="kart-loading">Loading track…</div><canvas class="kart-minimap" width="180" height="180"></canvas>';
    container.append(root);
    minimap = root.querySelector('.kart-minimap');
    mctx = minimap.getContext('2d');
    paused = false;
    init(++alive);
  },
  pause() { paused = true; },
  resume() { paused = false; lastT = null; },
  unmount() {
    alive++;
    cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    humans?.forEach((h) => h.engine?.stop());
    if (scene) {
      scene.traverse((o) => { o.geometry?.dispose(); [].concat(o.material || []).forEach((m) => { m.map?.dispose(); m.dispose(); }); });
    }
    renderer?.dispose();
    root?.remove();
    api = root = renderer = scene = track = resizeObserver = karts = humans = null;
    overAt = null;
    input.clear();
  },
};
