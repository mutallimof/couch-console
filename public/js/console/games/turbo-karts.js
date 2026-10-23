// Turbo Karts: a 3D kart race. Phones become a kart pad (remote/kart-pad.js), held sideways:
//   steering strip (input:wheel steer) or tilt · GAS (A) · DRIFT (R; hold while turning fast,
//   let go for a mini-turbo) · ITEM (UP) · BRAKE (B). DRIFT and ITEM keep accelerating.
//   D-pad ◀ ▶ also steers (keyboard mode, and phones in the normal remote layout).
// Flow: pick characters & karts → P1 picks a track → 3 laps with items and coins → results.
// Modes: solo (you + 7 CPU) · versus (2 players, split screen) · co-op (team points vs the best 2 CPUs)
import { colorFor } from '../../shared/protocol.js';
import { buildTrack, TRACKS, SUN_DIR } from './kart-track.js';
import { createLook } from './karts-look.js';
import { CHARACTERS, KARTS, ITEM_ICONS, kartPhysics, rollItem } from './karts-data.js';
import { setThree, makeRacer, makeItemMesh, makePortraits } from './karts-models.js';
import { createSelect } from './karts-select.js';
import { HOP_TIME, kartInput, stepKart as driveKart, giveBoost as boostKart, bumpKarts, progress as raceProgress, LAPS } from './karts-rules.js';
import { CAR, PIRATE, loadAll } from './karts-assets.js';
import { THEME_MODELS } from './karts-decor.js';

const RACERS = 8;
const POINTS = [15, 12, 10, 8, 6, 4, 2, 1]; // co-op points by finishing place
const ORB_SPEED = 62;

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" fill="#fff">
  <path d="M10 30h28l-3-9H19l-4-5h-4z"/><circle cx="15" cy="33" r="5"/><circle cx="34" cy="33" r="5"/>
  <circle cx="15" cy="33" r="2" fill="#2F80ED"/><circle cx="34" cy="33" r="2" fill="#2F80ED"/>
</svg>`;

let THREE = null;
let api, root, renderer, scene, sun, track, frame, lastT, resizeObserver, minimap, mctx, mapBox;
let karts = [], humans = [], orbs = [], slicks = [], state, timer, raceTime, overAt, paused = false, alive = 0;
let portraits, select, selection, lastCount, look;
const assets = new Map(); // loaded 3D models: path -> glTF (missing = use the code-built ones)
const input = new Map(); // playerId -> { steer, gas, brake, left, right }

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n % 10 > 3 || Math.floor(n / 10) === 1 ? 0 : n % 10]}`;
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

// ---------- Select screen ----------

function showSelect() {
  state = 'select';
  overAt = null;
  api.setController('pointer'); // D-pad and buttons for menus
  clearRace();
  root.querySelectorAll('.kart-hud, .kart-results').forEach((e) => e.remove());
  minimap.hidden = true;
  const ids = api.players.map((p) => p.playerId).slice(0, api.mode === 'solo' ? 1 : 2);
  select = createSelect({
    root, portraits, previous: selection, sound: api.sound,
    players: ids.map((id) => ({ playerId: id, color: colorFor(id) })),
    onDone: (sel) => { selection = sel; select = null; startRace(); },
    onExit: () => api.exit(),
  });
}

// ---------- Race setup ----------

function clearRace() {
  karts.forEach((k) => scene.remove(k.mesh.root, k.mesh.shadow));
  humans.forEach((h) => h.engine?.stop());
  [...orbs, ...slicks].forEach((o) => scene.remove(o.mesh));
  karts = []; humans = []; orbs = []; slicks = [];
}

// Load models with a progress bar. Resolves false if the game was closed meanwhile.
async function loadModels(paths) {
  const token = alive, todo = paths.filter((p) => !assets.has(p));
  if (!todo.length) return true;
  const el = document.createElement('div');
  el.className = 'kart-loading';
  el.innerHTML = '<div><div>Loading…</div><div class="kart-progress"><i></i></div></div>';
  root.append(el);
  const bar = el.querySelector('i');
  const models = await loadAll(todo, (f) => { bar.style.width = `${Math.round(f * 100)}%`; });
  if (token !== alive) return false;
  todo.forEach((p, i) => { if (models[i]) assets.set(p, models[i]); });
  el.remove();
  return true;
}

async function startRace() {
  clearRace();
  // Build the chosen track (reuse it if it's the same one)
  const def = TRACKS[selection.track];
  if (track?.def !== def) {
    if (track) {
      scene.remove(track.group);
      track.group.traverse((o) => { o.geometry?.dispose(); [].concat(o.material || []).forEach((m) => { m.map?.dispose(); m.dispose(); }); });
      track = null;
    }
    state = 'loading';
    if (!(await loadModels([...THEME_MODELS.common, ...(THEME_MODELS[def.theme] || [])]))) return;
    track = buildTrack(THREE, def, assets);
    scene.add(track.group);
    scene.fog = new THREE.Fog(def.sky[1], def.fog[0], def.fog[1]);
    look.setTrack(def); // (also sets the reflections, which add soft light: hence the dimmer hemi light)
    sun.intensity = def.night ? 0.6 : 2.2;
    // With reflections on, the environment already adds soft light from all around
    scene.userData.hemi.intensity = (def.night ? 0.7 : 1.1) * 0.6;
    mapBox = null;
  }
  // Humans use their picks; CPUs take the other characters and random karts
  const taken = new Set(selection.picks.map((p) => p.char));
  const cpuChars = shuffle(CHARACTERS.map((_, i) => i).filter((i) => !taken.has(i)));
  const list = [
    ...selection.picks.map((p) => ({ playerId: p.playerId, char: CHARACTERS[p.char], kart: KARTS[p.kart], color: colorFor(p.playerId) })),
    ...cpuChars.slice(0, RACERS - selection.picks.length).map((ci) => ({ playerId: null, char: CHARACTERS[ci], kart: KARTS[Math.floor(Math.random() * KARTS.length)] })),
  ];
  // Grid: two columns behind the start line, players at the back
  const order = [...shuffle(list.filter((k) => !k.playerId)), ...list.filter((k) => k.playerId)];
  karts = order.map((k, n) => {
    const i = track.at(-8 - Math.floor(n / 2) * 9);
    const side = n % 2 ? -3.5 : 3.5;
    const p = track.pts[i], nr = track.nor[i], t = track.tan[i];
    const color = k.color || k.char.color;
    const mesh = makeRacer(k.char, k.kart, k.playerId ? color : k.char.accent === '#FFFFFF' ? k.char.color : k.char.accent, assets);
    mesh.marker.visible = !!k.playerId; // a colored arrow over each player's kart
    scene.add(mesh.root, mesh.shadow);
    return {
      ...k, name: k.playerId ? `P${k.playerId}` : k.char.name, color, mesh, phys: kartPhysics(k.kart),
      x: p.x + nr.x * side, y: p.y, z: p.z + nr.z * side, vy: 0, air: false,
      heading: Math.atan2(t.x, t.z), v: 0, idx: i, lateral: side, lap: 0, half: true, finished: null,
      drifting: false, driftDir: 0, charge: 0, boost: 0, wallCooldown: 0, roll: 0,
      spin: 0, shield: 0, item: null, roulette: 0, coins: 0, useItemAt: 0,
      skill: 0.9 + Math.random() * 0.08, lane: (Math.random() - 0.5) * 8, laneTimer: 0,
    };
  });
  humans = karts.filter((k) => k.playerId).sort((a, b) => a.playerId - b.playerId);
  humans.forEach((h) => {
    h.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1500);
    h.camPos = null;
    h.engine = api.sound.loop('sawtooth');
  });
  track.boxes.forEach((b) => { b.respawn = 0; b.mesh.visible = true; });
  track.coins.forEach((c) => { c.respawn = 0; c.mesh.visible = true; });
  input.clear();
  state = 'countdown'; timer = 0; raceTime = 0; lastCount = null; overAt = null;
  api.setController('wheel');
  minimap.hidden = false;
  buildHud();
  resize();
}

// ---------- Driving ----------

function controls(k) {
  if (!k.playerId || k.finished != null) return cpuControls(k);
  const c = input.get(k.playerId) || {};
  const digital = (c.right ? 1 : 0) - (c.left ? 1 : 0);
  return kartInput({ ...c, steer: digital || c.steer || 0 });
}

// CPUs aim at a point further down the track, in their own lane, and dodge slicks a little
function cpuControls(k) {
  k.laneTimer -= 1 / 60;
  if (k.laneTimer < 0) { k.lane = (Math.random() - 0.5) * 10; k.laneTimer = 2 + Math.random() * 3; }
  const i = track.at(k.idx + 16), p = track.pts[i], n = track.nor[i];
  let lane = k.lane;
  for (const s of slicks) {
    const ahead = (s.idx - k.idx + track.SAMPLES) % track.SAMPLES; // samples between us and the slick
    if (ahead > 0 && ahead < 40 && Math.abs(s.lateral - lane) < 3) lane += lane > s.lateral ? 3 : -3;
  }
  const want = Math.atan2(p.x + n.x * lane - k.x, p.z + n.z * lane - k.z);
  return { steer: clamp(angleDiff(want, k.heading) * -2.2, -1, 1), gas: true, brake: false };
}

// The driving rules are in karts-rules.js; here we feed them input and react to their events.
function stepKart(k, dt) {
  const input = state === 'countdown' ? { steer: 0, gas: false, brake: false } : controls(k);
  driveKart(k, dt, input, { track, raceTime, topScale: k.playerId ? 1 : k.skill + rubberBand(k), onEvent: kartEvent });
}

// Rule events -> sounds, rumble and driver animations
function kartEvent(type, k) {
  if (type === 'finish') k.mesh.anim?.play(place(k) <= 3 ? 'Wave' : 'Yes', true);
  if (!k.playerId) return;
  if (type === 'boost') { api.sound.play('golden'); api.rumble(k.playerId, 80); }
  else if (type === 'wall') { api.rumble(k.playerId, 120); api.sound.play('wall'); }
  else if (type === 'land') { api.sound.play('wall'); api.rumble(k.playerId, 60); }
  else if (type === 'final-lap') api.sound.play('start');
  else if (type === 'finish') { api.sound.play(place(k) === 1 ? 'strike' : 'end'); api.rumble(k.playerId, 250); }
}

function rubberBand(k) {
  if (!humans.length) return 0;
  const best = Math.max(...humans.map(progress));
  return clamp(((best - progress(k)) / track.SAMPLES) * 0.25, -0.08, 0.08);
}

const progress = (k) => raceProgress(k, track.SAMPLES);
function standings() { return [...karts].sort((a, b) => progress(b) - progress(a)); }
const place = (k) => standings().indexOf(k) + 1;

// ---------- Items & coins ----------

function spinOut(k) {
  if (k.shield > 0) { k.shield = 0; api.sound.play('pop'); return; }
  k.spin = 1.1; k.v *= 0.35; k.drifting = false;
  k.coins = Math.max(0, k.coins - 3);
  k.mesh.anim?.play('HitReact');
  if (k.playerId) { api.rumble(k.playerId, 300); api.sound.play('bomb'); }
}

function useItem(k) {
  const item = k.item;
  if (!item || k.roulette > 0 || k.spin > 0) return;
  k.item = null;
  if (item === 'turbo') boostKart(k, 1.5, kartEvent);
  else if (item === 'shield') { k.shield = 8; if (k.playerId) api.sound.play('select'); }
  else if (item === 'slick') {
    const s = { x: k.x - Math.sin(k.heading) * 3.5, z: k.z - Math.cos(k.heading) * 3.5, mesh: makeItemMesh('slick'), owner: k, age: 0 };
    const loc = track.locate(s.x, s.z, k.idx, k.y);
    Object.assign(s, { idx: loc.i, lateral: loc.lateral, y: loc.height });
    s.mesh.position.set(s.x, s.y + 0.08, s.z);
    scene.add(s.mesh); slicks.push(s);
    if (k.playerId) api.sound.play('clear');
  } else if (item === 'orb') {
    const order = standings(), p = order.indexOf(k);
    const target = p > 0 ? order[p - 1] : null; // the kart just ahead
    const o = { idx: k.idx, lateral: k.lateral, y: k.y + 1, owner: k, target, life: 6, mesh: makeItemMesh('orb') };
    scene.add(o.mesh); orbs.push(o);
    if (k.playerId) api.sound.play('shot');
  }
}

function stepItems(dt) {
  const segLen = track.length / track.SAMPLES;
  for (const o of [...orbs]) {
    o.life -= dt;
    o.idx = (o.idx + (ORB_SPEED * dt) / segLen) % track.SAMPLES;
    if (o.target) o.lateral += (o.target.lateral - o.lateral) * Math.min(1, dt * 3);
    const i = Math.floor(o.idx), p = track.pts[i], n = track.nor[i];
    o.x = p.x + n.x * o.lateral; o.z = p.z + n.z * o.lateral; o.y = p.y + 1;
    o.mesh.position.set(o.x, o.y, o.z);
    o.mesh.rotation.y += dt * 8;
    const hit = karts.find((k) => k !== o.owner && Math.hypot(k.x - o.x, k.z - o.z) < 2.2 && Math.abs(k.y + 0.8 - o.y) < 2.5);
    if (hit || o.life <= 0) {
      if (hit) spinOut(hit);
      scene.remove(o.mesh); orbs.splice(orbs.indexOf(o), 1);
    }
  }
  for (const s of [...slicks]) {
    s.age += dt;
    const hit = karts.find((k) => (k !== s.owner || s.age > 1.2) && !k.air && Math.hypot(k.x - s.x, k.z - s.z) < 1.9);
    if (hit || s.age > 40) {
      if (hit) spinOut(hit);
      scene.remove(s.mesh); slicks.splice(slicks.indexOf(s), 1);
    }
  }
  // Item boxes and coins (they come back after a few seconds)
  for (const b of track.boxes) {
    if (b.respawn > 0) { b.respawn -= dt; b.mesh.visible = b.respawn <= 0; continue; }
    for (const k of karts) {
      if (Math.hypot(k.x - b.p.x, k.z - b.p.z) < 2.2 && Math.abs(k.y + 1 - b.p.y) < 2.5) {
        b.respawn = 2.5; b.mesh.visible = false;
        if (!k.item && k.roulette <= 0) {
          k.roulette = 1.1; k.pending = rollItem(place(k), karts.length);
          if (k.playerId) api.sound.play('pop');
        }
        break;
      }
    }
  }
  for (const c of track.coins) {
    if (c.respawn > 0) { c.respawn -= dt; c.mesh.visible = c.respawn <= 0; continue; }
    const k = karts.find((x) => Math.hypot(x.x - c.p.x, x.z - c.p.z) < 1.9 && Math.abs(x.y + 1 - c.p.y) < 2);
    if (k) {
      c.respawn = 6; c.mesh.visible = false;
      k.coins = Math.min(10, k.coins + 1);
      if (k.playerId) api.sound.play('clink');
    }
  }
  for (const k of karts) {
    if (k.roulette > 0) {
      k.roulette -= dt;
      if (k.roulette <= 0) { k.item = k.pending; k.useItemAt = 1 + Math.random() * 4; }
    } else if (!k.playerId && k.item && state === 'race') {
      k.useItemAt -= dt;
      if (k.useItemAt <= 0) useItem(k);
    }
  }
}

// ---------- Update ----------

function update(dt) {
  if (state === 'select' || state === 'loading') return;
  timer += dt;
  if (state === 'countdown') {
    const n = 3 - Math.floor(timer);
    if (n !== lastCount) { lastCount = n; api.sound.play(n > 0 ? 'tick' : 'start'); }
    if (timer >= 3) { state = 'race'; timer = 0; }
  }
  if (state === 'race') raceTime += dt;
  const steps = 3;
  for (let s = 0; s < steps; s++) {
    for (const k of karts) stepKart(k, dt / steps);
    bumpKarts(karts);
  }
  stepItems(dt);
  for (const b of track.boxes) b.mesh.rotation.set(timer * 0.8, timer * 1.2, 0);
  for (const c of track.coins) c.mesh.rotation.y = timer * 3;
  if (state === 'race' && humans.every((h) => h.finished != null)) { state = 'done'; timer = 0; }
  if (state === 'done' && timer > 1.5 && !overAt) showResults();
}

// ---------- Rendering ----------

function syncMeshes(t, dt) {
  if (!paused) track.mixers.forEach((mx) => mx.update(dt));
  for (const k of karts) {
    const m = k.mesh;
    if (!paused) m.anim?.mixer.update(dt);
    m.root.position.set(k.x, k.y, k.z);
    m.root.rotation.set(0, k.heading + (k.drifting ? k.driftDir * -0.35 : 0), 0);
    // tilt with the road slope, lean into turns, bob a little in the air
    const ahead = track.pts[track.at(k.idx + 3)], behind = track.pts[track.at(k.idx - 3)];
    const slope = Math.atan2(ahead.y - behind.y, Math.hypot(ahead.x - behind.x, ahead.z - behind.z));
    m.body.rotation.x = k.air ? -k.vy * 0.02 : -slope;
    m.body.position.y = k.hop > 0 ? Math.sin((k.hop / HOP_TIME) * Math.PI) * 0.45 : 0; // the drift hop
    m.body.rotation.z = k.roll;
    // (model cars are turned around, so their wheels spin the other way)
    m.wheels.forEach((w) => { w.rotation.x += (m.flipWheels ? -1 : 1) * k.v * 0.016; });
    m.marker.position.y = 3.1 + Math.sin(t * 0.005) * 0.15;
    m.driver.rotation.y = -((input.get(k.playerId)?.steer) || 0) * 0.3;
    const sparks = k.drifting && k.charge > 0.3;
    m.sparks.forEach((s) => { s.visible = sparks; s.scale.setScalar(0.5 + Math.random() * 0.9); s.rotation.set(Math.random() * 6, Math.random() * 6, 0); });
    // (brighter than white on purpose: only very bright things glow with the screen effects on)
    m.sparkMat.color.set(k.charge > 2.2 ? '#FF922B' : k.charge > 1.0 ? '#56CCF2' : '#F4F7FB').multiplyScalar(5);
    m.flame.visible = k.boost > 0;
    m.flame.scale.set(1, 0.7 + Math.sin(t * 0.05) * 0.3, 1);
    m.shield.visible = k.shield > 0;
    // blob shadow stays on the road under the kart
    const loc = track.locate(k.x, k.z, k.idx, k.y);
    m.shadow.position.set(k.x, loc.height + 0.07, k.z);
    m.shadow.rotation.z = -k.heading;
    m.shadow.material.opacity = 0.28 * clamp(1 - (k.y - loc.height) / 8, 0.2, 1);
  }
}

function moveCamera(h, dt) {
  const fx = Math.sin(h.heading), fz = Math.cos(h.heading);
  const want = new THREE.Vector3(h.x - fx * 8, h.y + 3.6, h.z - fz * 8);
  if (!h.camPos) h.camPos = want.clone();
  h.camPos.lerp(want, 1 - Math.exp(-7 * dt));
  h.camera.position.copy(h.camPos);
  h.camera.lookAt(h.x + fx * 6, h.y + 1.2, h.z + fz * 6);
  const fov = 68 + (h.boost > 0 ? 12 : 0) + Math.max(0, h.v - 22) * 0.35;
  h.camera.fov += (fov - h.camera.fov) * Math.min(1, dt * 5);
  h.camera.updateProjectionMatrix();
  h.engine?.set(55 + Math.abs(h.v) * 4.5, state === 'countdown' ? 0.02 : 0.035);
}

function render() {
  const W = root.clientWidth, H = root.clientHeight;
  if (state === 'select' || !humans.length) {
    renderer.setViewport(0, 0, W, H); renderer.setScissor(0, 0, W, H);
    renderer.clear();
    return;
  }
  humans.forEach((h, i) => {
    // Split screen: P1 on top, P2 at the bottom. The sun (and its shadows) follow each player,
    // always from the same direction as the sun drawn in the sky.
    const vh = H / humans.length, y = H - vh * (i + 1);
    sun.position.set(h.x + SUN_DIR[0] * 80, h.y + SUN_DIR[1] * 80, h.z + SUN_DIR[2] * 80);
    sun.target.position.set(h.x, h.y, h.z);
    sun.target.updateMatrixWorld();
    h.camera.aspect = W / vh;
    look.render(i, h.camera, 0, y, W, vh);
  });
}

function drawMinimap() {
  if (minimap.hidden || !track) return;
  const size = minimap.width, pad = 12;
  if (!mapBox) {
    const xs = track.pts.map((p) => p.x), zs = track.pts.map((p) => p.z);
    mapBox = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
  }
  const b = mapBox, sc = (size - pad * 2) / Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
  const ox = (size - (b.maxX - b.minX) * sc) / 2, oz = (size - (b.maxZ - b.minZ) * sc) / 2;
  const map = (x, z) => [ox + (x - b.minX) * sc, oz + (z - b.minZ) * sc];
  mctx.clearRect(0, 0, size, size);
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
  humans.forEach((h, i) => {
    const el = document.createElement('div');
    el.className = 'kart-hud';
    el.style.top = `${(i * 100) / humans.length}%`;
    el.style.height = `${100 / humans.length}%`;
    el.style.setProperty('--player', h.color);
    el.innerHTML = `<div class="kart-itembox"><div class="kart-item"></div></div><div class="kart-coins"></div>
      <div class="kart-lap"></div><div class="kart-place-wrap"><img class="kart-face" src="${portraits[h.char.id]}" alt=""><div class="kart-place"></div></div>
      <div class="kart-drift"></div><div class="kart-msg"></div>`;
    root.append(el);
    h.hud = el;
  });
}

function updateHud() {
  if (state === 'select') return;
  const order = standings();
  const names = Object.keys(ITEM_ICONS);
  for (const h of humans) {
    const q = (s) => h.hud.querySelector(s);
    const set = (s, v) => { const e = q(s); if (e.innerHTML !== v) e.innerHTML = v; };
    set('.kart-place', ordinal(order.indexOf(h) + 1));
    set('.kart-lap', `Lap ${clamp(h.lap, 1, LAPS)}/${LAPS}`);
    set('.kart-coins', `<span class="coin"></span>${h.coins}`);
    // item roulette: flick through icons until the item lands
    const icon = h.roulette > 0 ? ITEM_ICONS[names[Math.floor(performance.now() / 90) % names.length]] : h.item ? ITEM_ICONS[h.item] : '';
    set('.kart-item', icon);
    q('.kart-itembox').classList.toggle('ready', !!h.item && h.roulette <= 0);
    h.hud.classList.toggle('boosting', h.boost > 0); // speed lines at the screen edges
    set('.kart-drift', h.spin > 0 ? 'Spin out!' : h.drifting ? (h.charge > 2.2 ? 'TURBO!' : h.charge > 1 ? 'Boost ready' : 'Drift…') : h.shield > 0 ? 'Shield' : '');
    let msg = '';
    if (state === 'countdown') msg = timer < 3 ? String(3 - Math.floor(timer)) : '';
    else if (state === 'race' && timer < 1) msg = 'GO!';
    else if (h.finished != null) msg = `Finished ${ordinal(order.indexOf(h) + 1)}!`;
    else if (h.finalLapAt != null && raceTime - h.finalLapAt < 2) msg = 'Final lap!';
    set('.kart-msg', msg);
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
    const w = order[0];
    banner = `${w.playerId ? `P${w.playerId}` : w.name} wins!`;
    if (w.playerId) color = w.color;
  }
  const rows = order.map((k, i) => `<tr><td>${ordinal(i + 1)}</td><td><img src="${portraits[k.char.id]}" alt="">${k.playerId ? `<b style="color:${k.color}">P${k.playerId}</b> ` : ''}${k.char.name}</td>
    <td>${k.kart.name}</td><td>${fmt(k.finished)}</td>${api.mode === 'coop' ? `<td>${POINTS[i]} pts</td>` : ''}</tr>`).join('');
  const el = document.createElement('div');
  el.className = 'kart-results';
  el.innerHTML = `<div class="kart-card"><h1 style="background:${color}">${banner}</h1><table>${rows}</table>
    <p>A = race again · B = change racers/track · HOME = menu</p></div>`;
  root.append(el);
}

// ---------- Loop & input ----------

function loop(t) {
  const dt = Math.min(0.05, (t - (lastT ?? t)) / 1000);
  lastT = t;
  if (!paused) update(dt);
  if (karts.length) {
    syncMeshes(t, dt);
    humans.forEach((h) => moveCamera(h, dt));
  }
  render();
  if (state === 'race' || state === 'countdown') look.tick(dt); // turns effects off if the laptop is too slow
  updateHud();
  drawMinimap();
  frame = requestAnimationFrame(loop);
}

function inputFor(playerId) {
  if (!input.has(playerId)) input.set(playerId, { steer: 0 });
  return input.get(playerId);
}

function onButton(e) {
  const { playerId, button, state: s } = e;
  if (state === 'select') return select?.onButton(e);
  const c = inputFor(playerId), down = s === 'down';
  if (button === 'A') c.gas = down;
  if (button === 'B') c.brake = down;
  if (button === 'R') c.drift = down;          // DRIFT (also keeps accelerating)
  if (button === 'UP') c.item = down;          // ITEM held also keeps accelerating
  if (button === 'LEFT') c.left = down;
  if (button === 'RIGHT') c.right = down;
  if (button === 'UP' && down && state === 'race') { const k = humans.find((h) => h.playerId === playerId); if (k) useItem(k); }
  if (!down || !overAt || performance.now() - overAt < 1500) return;
  if (button === 'A') { root.querySelector('.kart-results')?.remove(); startRace(); api.sound.play('select'); }
  else if (button === 'B' && playerId === humans[0]?.playerId) { root.querySelector('.kart-results')?.remove(); showSelect(); }
}

function resize() {
  if (renderer) renderer.setSize(root.clientWidth, root.clientHeight, false);
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
  setThree(THREE);
  // The cars, pirates, item boxes and coins (the track scenery loads when a track is picked)
  root.querySelector('.kart-loading').remove();
  const ok = await loadModels([...KARTS.map((k) => CAR(k.model)), ...CHARACTERS.filter((c) => c.model).map((c) => PIRATE(c.model)),
    CAR('item-box'), CAR('item-coin-gold')]);
  if (!ok) return;
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setScissorTest(true);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.className = 'game-canvas';
  root.prepend(renderer.domElement);
  scene = new THREE.Scene();
  scene.userData.hemi = new THREE.HemisphereLight('#ffffff', '#6a7a5a', 1.1);
  scene.add(scene.userData.hemi);
  sun = new THREE.DirectionalLight('#fff4e0', 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 160 });
  sun.shadow.bias = -0.0005;
  sun.shadow.camera.far = 220;
  scene.add(sun, sun.target);
  // reflections + glow + vignette (see karts-look.js); ?fx=on / ?fx=off on the console link
  look = await createLook(THREE, renderer, scene, new URLSearchParams(location.search).get('fx'));
  if (token !== alive) return;
  portraits = makePortraits(renderer, CHARACTERS, assets);
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(root);
  resize();
  api.onButton(onButton);
  api.onWheel(({ playerId, steer }) => { inputFor(playerId).steer = steer; });
  showSelect();
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
    root = document.createElement('div');
    root.className = 'kart';
    root.innerHTML = '<div class="kart-loading">Loading…</div><canvas class="kart-minimap" width="180" height="180" hidden></canvas>';
    container.append(root);
    minimap = root.querySelector('.kart-minimap');
    mctx = minimap.getContext('2d');
    paused = false; state = 'loading'; selection = null; track = null;
    init(++alive);
  },
  pause() { paused = true; },
  resume() { paused = false; lastT = null; },
  unmount() {
    alive++;
    cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    if (scene) {
      clearRace();
      scene.traverse((o) => { o.geometry?.dispose(); [].concat(o.material || []).forEach((m) => { m.map?.dispose(); m.dispose(); }); });
    }
    select?.destroy();
    look?.dispose();
    renderer?.dispose();
    root?.remove();
    api = root = renderer = look = scene = track = resizeObserver = select = null;
    karts = []; humans = [];
    overAt = null;
    input.clear();
  },
};
