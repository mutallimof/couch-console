// Turbo Karts GP: the kart race on the ported OpenWii engine (ow-kart/rules.js: handling, three
// drift turbo levels, items, bumping, computer drivers) with its chase camera (ow-kart/frame.js).
// What you see is ours: the select screen, models, tracks, effects, HUD and results.
// Phones become the kart pad (remote/kart-pad.js, held sideways): ◀ LEFT / ▶ RIGHT (or tilt),
//   GAS (A) · DRIFT (R) · ITEM (UP) · BRAKE (B). DRIFT and ITEM keep accelerating.
// Flow: pick characters & karts → P1 picks a track → 3 laps with items and coins → results.
// Modes: solo (you + 7 CPU) · versus (2 players, split screen) · co-op (team points vs the best 2 CPUs)
// Race rules adapted from OpenWii's games/mario-kart (MIT, Copyright (c) 2026 Patrick Sun; see
// THIRD_PARTY_NOTICES.md).
import { colorFor } from '../../shared/protocol.js';
import { buildTrack, TRACKS, SUN_DIR } from './kart-track.js';
import { STADIUM } from './ow-kart/stadium/stadium-def.js';
import * as stadiumTrack from './ow-kart/stadium/track.js';

const ALL_TRACKS = [...TRACKS, STADIUM]; // (the stadium is only in this game; the old Turbo Karts keeps its own list)
import { createLook } from './karts-look.js';
import { CHARACTERS, KARTS, ITEM_ICONS } from './karts-data.js';
import { setThree, makeRacer, makeItemMesh, makePortraits } from './karts-models.js';
import { createSelect } from './karts-select.js';
import { createShowroom, setShowroomThree } from './karts-showroom.js';
import { kartInput } from './karts-rules.js';
import { createRaceFx, makeExhaust, updateExhaust } from './karts-fx.js';
import { CAR, PIRATE, loadAll } from './karts-assets.js';
import { THEME_MODELS } from './karts-decor.js';
import { Race, ITEMS, ordinal, formatTime } from './ow-kart/rules.js';
import { createTrackModel } from './ow-kart/track-model.js';
import { renderPath } from './ow-kart/render-path.js';
import { chasePose } from './ow-kart/frame.js';

const RACERS = 8;
const POINTS = [15, 12, 10, 8, 6, 4, 2, 1]; // co-op points by finishing place
const LAPS = 3;

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" fill="#fff">
  <path d="M10 30h28l-3-9H19l-4-5h-4z"/><circle cx="15" cy="33" r="5"/><circle cx="34" cy="33" r="5"/>
  <circle cx="15" cy="33" r="2" fill="#E8590C"/><circle cx="34" cy="33" r="2" fill="#E8590C"/>
</svg>`;

let THREE = null;
let api, root, renderer, scene, sun, frame, lastT, resizeObserver, minimap, mctx, mapBox;
let track = null;      // { group, model, pts... } the drawn track
let race = null;       // the ported rules (ow-kart/rules.js)
let views = [];        // one per racer: { racer, mesh, kart, char, color, playerId, ... }
let humans = [];       // the views of the human players
let objectMeshes = new Map(); // item projectiles/slicks on the road: race object id -> mesh
let boxMeshes = [], coinMeshes = [];
let state, shown, overAt, paused = false, alive = 0, lastCount = 0;
let portraits, select, selection, look, fx;
const showrooms = new Map(); // playerId -> 3D preview on the select screen (karts-showroom.js)
const assets = new Map();    // loaded 3D models: path -> glTF (missing = use the code-built ones)
const input = new Map();     // playerId -> { steer, gas, brake, left, right, drift, item }

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
// Our models face +z; the rules' heading has forward = (sin h, -cos h)
const yawOf = (heading) => Math.PI - heading;

// ---------- Select screen ----------

function showSelect() {
  state = 'select';
  overAt = null;
  api.setController('pointer'); // D-pad and buttons for menus
  clearRace();
  root.querySelectorAll('.kart-hud, .kart-results').forEach((e) => e.remove());
  minimap.hidden = true;
  const ids = api.players.map((p) => p.playerId).slice(0, api.mode === 'solo' ? 1 : 2);
  root.classList.add('selecting');
  select = createSelect({
    root, portraits, previous: selection, sound: api.sound, tracks: ALL_TRACKS,
    players: ids.map((id) => ({ playerId: id, color: colorFor(id) })),
    onDone: (sel) => { selection = sel; select = null; root.classList.remove('selecting'); startRace(); },
    onExit: () => api.exit(),
    onCelebrate: (playerId, kind) => showrooms.get(playerId)?.celebrate(kind),
  });
}

// ---------- Race setup ----------

function clearRace() {
  for (const v of views) scene.remove(v.mesh.root, v.mesh.shadow);
  for (const m of objectMeshes.values()) scene.remove(m);
  objectMeshes.clear();
  for (const m of [...boxMeshes, ...coinMeshes]) scene.remove(m);
  boxMeshes = []; coinMeshes = [];
  fx?.clear();
  humans.forEach((h) => h.engine?.stop());
  views = []; humans = []; race = null;
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
  const models = await loadAll(todo, (f) => { bar.style.setProperty('--p', f); });
  if (token !== alive) return false;
  todo.forEach((p, i) => { if (models[i]) assets.set(p, models[i]); });
  el.remove();
  return true;
}

async function startRace() {
  clearRace();
  const def = ALL_TRACKS[selection.track];
  if (track?.def !== def) {
    if (track) {
      scene.remove(track.group);
      track.group.traverse((o) => { o.geometry?.dispose(); [].concat(o.material || []).forEach((m) => { m.map?.dispose(); m.dispose(); }); });
      track = null;
    }
    state = 'loading';
    if (!(await loadModels([...THEME_MODELS.common, ...(THEME_MODELS[def.theme] || [])]))) return;
    if (def.stadium) {
      // The Grand Stadium: OpenWii's procedural world, collected in one group so it can be removed again
      const model = stadiumTrack.model, before = new Set(scene.children);
      const [{ buildWorld }, { addAtmosphere }] = await Promise.all([import('./ow-kart/stadium/world.js'), import('./ow-kart/stadium/atmosphere.js')]);
      const world = buildWorld(scene);
      addAtmosphere(scene);
      const group = new THREE.Group();
      for (const c of [...scene.children]) if (!before.has(c)) group.add(c);
      scene.add(group);
      track = { def, group, model, world, mixers: [], pts: model.samples };
      scene.fog = new THREE.Fog(def.sky[1], 220, 1100);
    } else {
      const model = createTrackModel(def);
      const path = renderPath(THREE, model);
      track = buildTrack(THREE, def, assets, { path, noPickups: true });
      track.model = model;
      scene.add(track.group);
      scene.fog = new THREE.Fog(def.sky[1], def.fog[0] * 1.3, def.fog[1] * 1.3);
    }
    look.setTrack(def);
    sun.intensity = def.night ? 0.6 : 2.2;
    scene.userData.hemi.intensity = (def.night ? 0.7 : 1.1) * 0.6;
    mapBox = null;
  }
  const T = track.model;
  // Humans use their picks; the computer drivers take other characters and random karts
  const taken = new Set(selection.picks.map((p) => p.char));
  const cpuChars = shuffle(CHARACTERS.map((_, i) => i).filter((i) => !taken.has(i)));
  const list = [
    ...selection.picks.map((p) => ({ playerId: p.playerId, char: CHARACTERS[p.char], kart: KARTS[p.kart], color: colorFor(p.playerId) })),
    ...cpuChars.slice(0, RACERS - selection.picks.length).map((ci) => ({ playerId: null, char: CHARACTERS[ci], kart: KARTS[Math.floor(Math.random() * KARTS.length)] })),
  ];
  race = new Race({ track: T, characters: list.map((k) => k.char), humans: selection.picks.length, laps: LAPS, burnout: false, seed: (Math.random() * 1e9) | 0, onEvent: onRaceEvent });
  views = race.racers.map((racer, i) => {
    const k = list[i], color = k.color || (k.char.accent === '#FFFFFF' ? k.char.color : k.char.accent);
    const mesh = makeRacer(k.char, k.kart, k.playerId ? k.color : color, assets);
    mesh.marker.visible = !!k.playerId;
    mesh.flame.visible = false; mesh.sparks.forEach((sp) => { sp.visible = false; });
    mesh.exhaust = makeExhaust(THREE);
    mesh.body.add(mesh.exhaust);
    scene.add(mesh.root, mesh.shadow);
    return { racer, mesh, kart: k.kart, char: k.char, playerId: k.playerId, color: k.color || color, fxKart: {}, bounce: null };
  });
  humans = views.filter((v) => v.playerId);
  humans.forEach((h) => {
    h.camera = new THREE.PerspectiveCamera(57, 1, 0.1, 1800);
    h.cam = null;
    h.engine = api.sound.loop('sawtooth');
  });
  // Item boxes and coins: drawn here, collected by the rules (race.boxes / race.coins)
  const boxModel = () => makeBoxMesh(), coinModel = () => makeCoinMesh();
  race.boxes.forEach((b) => { const m = boxModel(); placeOnRoad(m, T, b.s, b.lateral, 1.4); scene.add(m); boxMeshes.push(m); });
  race.coins.forEach((c) => { const m = coinModel(); placeOnRoad(m, T, c.s, c.lateral, 1.1); scene.add(m); coinMeshes.push(m); });
  input.clear();
  state = 'countdown'; shown = 0; overAt = null; lastCount = 4;
  race.start();
  api.setController('wheel');
  minimap.hidden = false;
  buildHud();
  resize();
}

function placeOnRoad(mesh, T, s, lateral, lift) {
  const p = T.surfaceAt(s, lateral);
  mesh.position.set(p.x, p.y + lift, p.z);
}
// Item boxes and coins use the Toy Car Kit models when loaded (as the classic game does)
function modelMesh(file, size, fallback) {
  const loaded = assets.get(file);
  if (!loaded) return fallback();
  const g = loaded.scene.clone(true);
  const box = new THREE.Box3().setFromObject(g), s = box.getSize(new THREE.Vector3()), k = size / Math.max(s.x, s.y, s.z);
  const holder = new THREE.Group();
  g.scale.setScalar(k);
  const b2 = new THREE.Box3().setFromObject(g);
  g.position.y -= (b2.min.y + b2.max.y) / 2;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  holder.add(g);
  return holder;
}
const makeBoxMesh = () => modelMesh(CAR('item-box'), 1.6, () => makeItemMesh('orb'));
const makeCoinMesh = () => modelMesh(CAR('item-coin-gold'), 1.1, () => makeItemMesh('orb'));

// ---------- Rule events: sounds, rumble, effects ----------

const viewOf = (id) => views[id];
function onRaceEvent(e) {
  const v = viewOf(e.racer);
  if (!v) return;
  const mine = !!v.playerId;
  const sfx = (name) => { if (mine) api.sound.play(name); };
  const rumble = (ms) => { if (mine) api.rumble(v.playerId, ms); };
  switch (e.type) {
    case 'box': {
      const b = race.boxes[e.box];
      fx.burst(b.x ?? track.model.surfaceAt(b.s, b.lateral).x, track.model.surfaceAt(b.s, b.lateral).y + 1.4, track.model.surfaceAt(b.s, b.lateral).z);
      sfx('pop'); break;
    }
    case 'coin': sfx('clink'); break;
    case 'turbo': case 'boost': v.kick = 0; sfx('golden'); rumble(80); break;
    case 'rocket': v.kick = 0; sfx('golden'); rumble(150); break;
    case 'burnout': sfx('bomb'); rumble(300); break;
    case 'drift': if (mine && e.tier) { api.sound.play('tick'); } break;
    case 'hit': v.mesh.anim?.play('HitReact'); sfx('bomb'); rumble(300); break;
    case 'wall': sfx('wall'); rumble(120); break;
    case 'land': v.bounce = 0; sfx('wall'); rumble(60); break;
    case 'glider': sfx('clear'); rumble(60); break;
    case 'contact': rumble(40); break;
    case 'useItem': sfx(e.item === 'turbo' || e.item === 'star' ? 'select' : 'shot'); break;
    case 'itemReady': break;
    case 'finalLap': v.finalLapAt = race.raceTime; sfx('start'); break;
    case 'finish':
      v.mesh.anim?.play(race.position(v.racer) <= 3 ? 'Wave' : 'Yes', true);
      sfx(race.position(v.racer) === 1 ? 'strike' : 'end'); rumble(250); break;
    default: break;
  }
}

// ---------- Driving input ----------

function controls(h) {
  const c = input.get(h.playerId) || {};
  const digital = (c.right ? 1 : 0) - (c.left ? 1 : 0);
  const held = kartInput({ ...c, steer: digital || c.steer || 0 });
  c.tapped = false;
  return { gas: held.gas, brake: held.brake, drift: held.drift, item: !!c.item, steer: held.steer };
}

// ---------- Update ----------

function update(dt) {
  if (state === 'select' || state === 'loading' || !race) return;
  race.update(dt, humans.map((h) => controls(h))); // (ITEM is used on the press: the rules look for the edge)
  shown += dt;
  if (state === 'countdown') {
    const n = race.count;
    if (n !== lastCount) { lastCount = n; api.sound.play(n > 0 ? 'tick' : 'start'); }
    if (race.state === 'racing') { state = 'race'; shown = 0; }
  }
  if (state === 'race' && race.state === 'finishing') { state = 'done'; shown = 0; }
  // The results card comes 4 s after the humans finish (or when everyone has); the karts keep racing behind it
  if ((state === 'done' && shown > 4) || race.state === 'results') { if (!overAt) showResults(); }
}

// ---------- Drawing ----------

function syncMeshes(t, dt) {
  const T = track.model;
  if (!paused) track.mixers.forEach((mx) => mx.update(dt));
  for (const v of views) {
    const r = v.racer, m = v.mesh;
    if (!paused) m.anim?.mixer.update(dt);
    m.root.position.set(r.x, r.y, r.z);
    // a hit makes a kart spin; otherwise it faces along the road, turned into a drift
    const spinAngle = r.spin > 0 ? (1.1 - r.spin) * 12 : 0;
    m.root.rotation.set(0, yawOf(r.heading) + (r.drift ? -r.drift * 0.35 : 0) + spinAngle, 0);
    m.root.visible = !(r.invulnerable > 0 && r.spin <= 0 && Math.floor(t / 90) % 2 === 0 && r.star <= 0);
    // tilt with the road slope, lean into turns, bob when airborne
    const slope = r.gliding ? 0 : Math.atan2(T.surfaceAt(r.s + 3, r.lateral).y - T.surfaceAt(r.s - 3, r.lateral).y, 6);
    m.body.rotation.x = r.gliding ? -clamp(r.flightV * 0.03, -0.3, 0.3) : -slope;
    m.body.position.y = r.hop > 0 ? Math.sin((r.hop / 0.36) * Math.PI) * 0.45 : 0;
    m.body.rotation.z = -r.steer * 0.1 * clamp(r.speed / 30, 0, 1);
    // Bouncy: a landing squashes the kart and it springs back; a turbo lifts the nose for a moment
    if (v.bounce != null) {
      v.bounce += dt;
      const sq = Math.exp(-v.bounce * 7) * Math.cos(v.bounce * 22) * 0.2;
      m.body.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6);
      if (v.bounce > 1) { v.bounce = null; m.body.scale.set(1, 1, 1); }
    }
    if (v.kick != null) {
      v.kick += dt;
      m.body.rotation.x -= Math.sin(Math.min(1, v.kick / 0.35) * Math.PI) * 0.12;
      if (v.kick > 0.35) v.kick = null;
    }
    const open = r.gliding ? 1 : 0;
    m.glider.userData.open = (m.glider.userData.open ?? 0) + (open - (m.glider.userData.open ?? 0)) * Math.min(1, dt * 8);
    m.glider.visible = m.glider.userData.open > 0.02;
    m.glider.scale.set(m.glider.userData.open, 1, 0.4 + 0.6 * m.glider.userData.open);
    m.wheels.forEach((w) => { w.rotation.x += (m.flipWheels ? -1 : 1) * r.speed * 0.016; });
    m.marker.position.y = 3.1 + Math.sin(t * 0.005) * 0.15;
    m.driver.rotation.y = -r.steer * 0.3;
    // Drift sparks from the rear wheels (blue → orange → purple) and the boost flame (karts-fx.js)
    if (!paused) {
      Object.assign(v.fxKart, { x: r.x, y: r.y, z: r.z, heading: yawOf(r.heading), drifting: !!r.drift, air: r.gliding, v: r.speed });
      fx.drift(v.fxKart, r.drift ? r.tier : 0, dt);
    }
    updateExhaust(m.exhaust, r.boost, t / 1000);
    m.shield.visible = r.star > 0;
    m.shadow.position.set(r.x, r.y + 0.07, r.z);
    m.shadow.rotation.z = -yawOf(r.heading);
    m.shadow.material.opacity = 0.28 * clamp(1 - (r.gliding ? (r.flightY - T.surfaceAt(r.s, r.lateral).y) / 8 : 0), 0.2, 1);
  }
  // item boxes and coins: spin, and vanish while they're waiting to come back
  race.boxes.forEach((b, i) => { const m = boxMeshes[i]; m.visible = b.respawn <= 0; m.rotation.set(t * 0.0008, t * 0.0012, 0); });
  race.coins.forEach((c, i) => { const m = coinMeshes[i]; m.visible = c.respawn <= 0; m.rotation.y = t * 0.003; });
  // thrown items and slicks on the road
  const live = new Set();
  for (const o of race.objects) {
    live.add(o.id);
    let m = objectMeshes.get(o.id);
    if (!m) { m = makeItemMesh(o.type === 'slick' ? 'slick' : 'orb'); if (o.type === 'comet') m.scale.setScalar(1.6); scene.add(m); objectMeshes.set(o.id, m); }
    const p = T.surfaceAt(o.s, o.lateral);
    m.position.set(p.x, p.y + (o.type === 'slick' ? 0.1 : 1), p.z);
    if (o.type !== 'slick') m.rotation.y += dt * 8;
  }
  for (const [id, m] of objectMeshes) if (!live.has(id)) { scene.remove(m); objectMeshes.delete(id); }
}

// OpenWii's camera smoothing: eye and aim follow quickly, the "up" direction a little slower
const V3 = (o) => new THREE.Vector3(o.x, o.y, o.z);
function moveCamera(h, dt) {
  const r = h.racer, d = chasePose(track.model, r);
  const eye = V3(d.eye), aim = V3(d.aim), up = V3(d.up);
  if (!h.cam) h.cam = { eye: eye.clone(), aim: aim.clone(), up: up.clone() };
  h.cam.eye.lerp(eye, 1 - Math.exp(-dt * 13));
  h.cam.aim.lerp(aim, 1 - Math.exp(-dt * 13));
  h.cam.up.lerp(up, 1 - Math.exp(-dt * 7)).normalize();
  h.camera.position.copy(h.cam.eye);
  h.camera.up.copy(h.cam.up);
  h.camera.lookAt(h.cam.aim);
  const boost = Math.min(1, r.boost / 0.12);
  const fov = 57 + boost * 5 + (r.gliding ? 3 : 0) + (r.boost > 0 ? 2 : 0);
  h.camera.fov += (fov - h.camera.fov) * (1 - Math.exp(-dt * 6));
  h.camera.updateProjectionMatrix();
  h.engine?.set(55 + Math.abs(r.speed) * 4.5, state === 'countdown' ? 0.02 : 0.035);
}

function render() {
  const W = root.clientWidth, H = root.clientHeight;
  if (state === 'select' || !humans.length) {
    renderer.setClearColor(0x000000, 0);
    renderer.setViewport(0, 0, W, H); renderer.setScissor(0, 0, W, H);
    renderer.clear();
    if (state === 'select' && select) renderShowrooms(W, H);
    return;
  }
  renderer.setClearColor(0x000000, 1);
  humans.forEach((h, i) => {
    const r = h.racer, vh = H / humans.length, y = H - vh * (i + 1);
    sun.position.set(r.x + SUN_DIR[0] * 80, r.y + SUN_DIR[1] * 80, r.z + SUN_DIR[2] * 80);
    sun.target.position.set(r.x, r.y, r.z);
    sun.target.updateMatrixWorld();
    h.camera.aspect = W / vh;
    fx.setViewport(vh * renderer.getPixelRatio());
    look.render(i, h.camera, 0, y, W, vh);
  });
}

function renderShowrooms(W, H) {
  const box = root.getBoundingClientRect();
  for (const s of select.seats()) {
    if (!s.stage) continue;
    let room = showrooms.get(s.playerId);
    if (!room) showrooms.set(s.playerId, (room = createShowroom(assets)));
    room.set(s.character, s.kartDef, s.color);
    const r = s.stage.getBoundingClientRect();
    const x = r.left - box.left, y = H - (r.top - box.top) - r.height;
    if (r.width < 10 || r.height < 10) continue;
    room.camera.aspect = r.width / r.height;
    room.camera.updateProjectionMatrix();
    renderer.setViewport(x, y, r.width, r.height);
    renderer.setScissor(x, y, r.width, r.height);
    renderer.render(room.scene, room.camera);
  }
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
  for (const v of [...views].reverse()) {
    const [x, y] = map(v.racer.x, v.racer.z);
    mctx.fillStyle = v.color;
    mctx.beginPath(); mctx.arc(x, y, v.playerId ? 6 : 4, 0, Math.PI * 2); mctx.fill();
    if (v.playerId) { mctx.strokeStyle = '#fff'; mctx.lineWidth = 2; mctx.stroke(); }
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

const TIER_TEXT = ['Drift…', 'Boost ready', 'Super boost!', 'ULTRA TURBO!'];
function updateHud() {
  if (state === 'select' || !race) return;
  const names = ITEMS;
  for (const h of humans) {
    const r = h.racer;
    const q = (s) => h.hud.querySelector(s);
    const set = (s, v) => { const e = q(s); if (e.innerHTML !== v) e.innerHTML = v; };
    set('.kart-place', ordinal(race.position(r)));
    set('.kart-lap', `Lap ${clamp(r.lap, 1, LAPS)}/${LAPS}`);
    set('.kart-coins', `<span class="coin"></span>${r.coins}`);
    const icon = r.roulette > 0 ? ITEM_ICONS[names[Math.floor(performance.now() / 90) % names.length]] : r.item ? ITEM_ICONS[r.item] : '';
    set('.kart-item', icon || '');
    q('.kart-itembox').classList.toggle('ready', !!r.item && r.roulette <= 0);
    h.hud.classList.toggle('boosting', r.boost > 0);
    set('.kart-drift', race.state === 'countdown' ? (race.count === 2 ? 'Press GAS now: rocket start!' : 'Get ready…') : r.spin > 0 ? 'Spin out!' : r.gliding ? 'Gliding!' : r.drift ? TIER_TEXT[r.tier] : r.star > 0 ? 'Star power!' : '');
    let msg = '';
    if (race.state === 'countdown') msg = race.count > 0 ? String(race.count) : '';
    else if (race.state === 'racing' && race.raceTime < 1) msg = 'GO!';
    else if (r.finishTime !== null) msg = `Finished ${ordinal(race.position(r))}!`;
    else if (h.finalLapAt != null && race.raceTime - h.finalLapAt < 2) msg = 'Final lap!';
    set('.kart-msg', msg);
  }
}

function showResults() {
  overAt = performance.now();
  humans.forEach((h) => h.engine?.set(0, 0));
  const order = race.standings.map((r) => views[r.id]);
  let banner, color = '#5B6577';
  if (api.mode === 'coop') {
    const pts = (v) => POINTS[order.indexOf(v)];
    const team = humans.reduce((s, h) => s + pts(h), 0);
    const rivals = order.filter((v) => !v.playerId).slice(0, 2).reduce((s, v) => s + pts(v), 0);
    banner = team > rivals ? `Team wins! ${team} – ${rivals}` : team === rivals ? `Tie! ${team} – ${rivals}` : `Rivals win ${rivals} – ${team}`;
    if (team > rivals) color = '#27AE60';
  } else {
    const w = order[0];
    banner = `${w.playerId ? `P${w.playerId}` : w.char.name} wins!`;
    if (w.playerId) color = w.color;
  }
  const rows = order.map((v, i) => `<tr><td>${ordinal(i + 1)}</td><td><img src="${portraits[v.char.id]}" alt="">${v.playerId ? `<b style="color:${v.color}">P${v.playerId}</b> ` : ''}${v.char.name}</td>
    <td>${v.kart.name}</td><td>${formatTime(v.racer.finishTime)}</td>${api.mode === 'coop' ? `<td>${POINTS[i]} pts</td>` : ''}</tr>`).join('');
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
  if (!paused) { update(dt); fx?.update(dt); }
  if (state === 'select') showrooms.forEach((room) => room.update(dt));
  if (race && views.length) {
    syncMeshes(t, dt);
    humans.forEach((h) => moveCamera(h, dt));
  }
  render();
  if (state === 'race' || state === 'countdown') look.tick(dt);
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
  if (button === 'R') { c.drift = down; if (down) c.tapped = true; }
  if (button === 'UP') c.item = down;
  if (button === 'LEFT') c.left = down;
  if (button === 'RIGHT') c.right = down;
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
  if (token !== alive) return;
  setThree(THREE);
  setShowroomThree(THREE);
  root.querySelector('.kart-loading').remove();
  const ok = await loadModels([...KARTS.map((k) => CAR(k.model)), ...CHARACTERS.filter((c) => c.model).map((c) => PIRATE(c.model)),
    CAR('item-box'), CAR('item-coin-gold')]);
  if (!ok) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setScissorTest(true);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'game-canvas';
  root.prepend(renderer.domElement);
  scene = new THREE.Scene();
  scene.userData.hemi = new THREE.HemisphereLight('#CFE6FF', '#5A6A4A', 1.1);
  scene.add(scene.userData.hemi);
  const fill = new THREE.DirectionalLight('#77BAFF', 0.35);
  fill.position.set(-80, 70, -20);
  scene.add(fill);
  sun = new THREE.DirectionalLight('#fff4e0', 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 160 });
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.025;
  sun.shadow.camera.far = 220;
  scene.add(sun, sun.target);
  look = await createLook(THREE, renderer, scene, new URLSearchParams(location.search).get('fx'));
  fx = createRaceFx(THREE, scene);
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
  id: 'ow-kart',
  title: 'Turbo Karts GP',
  color: '#E8590C',
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
    paused = false; state = 'loading'; selection = null; track = null; race = null;
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
    showrooms.forEach((room) => room.dispose());
    showrooms.clear();
    look?.dispose();
    fx?.dispose();
    renderer?.dispose();
    root?.remove();
    api = root = renderer = look = scene = track = resizeObserver = select = fx = race = null;
    views = []; humans = [];
  },
};
