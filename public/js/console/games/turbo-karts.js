// Turbo Karts: the kart race on the ported OpenWii engine (ow-kart/rules.js: handling, three
// drift turbo levels, items, bumping, computer drivers) with its chase camera (ow-kart/frame.js).
// What you see is ours: the select screen, models, tracks, effects, HUD and results.
// Phones become the kart pad (remote/kart-pad.js, held sideways): ◀ LEFT / ▶ RIGHT (or tilt),
//   GAS (A) · DRIFT (R) · ITEM (UP) · BRAKE (B). DRIFT and ITEM keep accelerating.
// Flow: pick characters & karts → P1 picks a track → 3 laps with items and coins → results.
// Modes: solo (you + 7 CPU) · versus (2 players, split screen) · co-op (team points vs the best 2 CPUs)
// Race rules adapted from OpenWii's games/mario-kart (MIT, Copyright (c) 2026 Patrick Sun; see
// THIRD_PARTY_NOTICES.md).
import { colorFor } from '../../shared/protocol.js';
import { party } from '../party.js';
import { avatarSvg } from '../../shared/avatar.js';
import { graphics } from '../graphics-prefs.js';
import { skyFor, skyDome, SKY_GAIN, roadTextures, stadiumRoadTextures, groundTextures } from './turbo-karts/karts-polyhaven.js';
import { setStadiumPavement } from './turbo-karts/ow-kart/stadium/materials.js';
import { setPavementOverride } from './turbo-karts/karts-materials.js';
import { buildTrack, TRACKS, SUN_DIR } from './turbo-karts/kart-track.js';
import { STADIUM } from './turbo-karts/ow-kart/stadium/stadium-def.js';
import * as stadiumTrack from './turbo-karts/ow-kart/stadium/track.js';

const ALL_TRACKS = [...TRACKS, STADIUM]; // our six courses plus the Grand Stadium
import { createLook } from './turbo-karts/karts-look.js';
import { KARTS, ITEM_ICONS } from './turbo-karts/karts-data.js';
import { GP_CHARACTERS as CHARACTERS } from './turbo-karts/ow-kart/characters.js';
import { setThree, makeRacer, makeItemMesh, makePortraits } from './turbo-karts/karts-models.js';
import { createSelect } from './turbo-karts/karts-select.js';
import { createShowroom, setShowroomThree } from './turbo-karts/karts-showroom.js';
import { kartInput } from './turbo-karts/ow-kart/input.js';
import { createRaceFx, makeExhaust, updateExhaust, TIER_COLORS } from './turbo-karts/karts-fx.js';
import { createQuarks } from './turbo-karts/karts-quarks.js';
import { podiumHtml, playPodium } from '../results.js';
import { CAR, loadAll } from './turbo-karts/karts-assets.js';
import { THEME_MODELS } from './turbo-karts/karts-decor.js';
import { Race, ITEMS, ordinal, formatTime } from './turbo-karts/ow-kart/rules.js';
import { createTrackModel } from './turbo-karts/ow-kart/track-model.js';
import { renderPath } from './turbo-karts/ow-kart/render-path.js';
import { chasePose } from './turbo-karts/ow-kart/frame.js';
import { angle } from './turbo-karts/ow-kart/track-model.js';
import { loadTuning, saveTuning } from './turbo-karts/ow-kart/tuning.js';
import { createGovernor, TARGET_1P, TARGET_2P } from './turbo-karts/karts-quality.js';
import { createTuningPanel } from './turbo-karts/karts-tuning-panel.js';
import { createPauseMenu, createResultsMenu } from './turbo-karts/karts-menus.js';
import { wipe } from './turbo-karts/karts-ui.js';

const RACERS = 8;
const POINTS = [15, 12, 10, 8, 6, 4, 2, 1]; // co-op points by finishing place
const LAPS = 3;

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" fill="#fff">
  <path d="M10 30h28l-3-9H19l-4-5h-4z"/><circle cx="15" cy="33" r="5"/><circle cx="34" cy="33" r="5"/>
  <circle cx="15" cy="33" r="2" fill="#E8590C"/><circle cx="34" cy="33" r="2" fill="#E8590C"/>
</svg>`;

let THREE = null;
// (for tests and screenshots)
window.__tk = { state: () => state, race: () => race, humans: () => humans, results: () => showResults(), tuning: () => tuning, quality: () => governor?.level, input: (id, patch) => Object.assign(inputFor(id), patch) };
let api, root, renderer, scene, sun, frame, lastT, resizeObserver, minimap, mctx, mapBox;
let track = null;      // { group, model, pts... } the drawn track
let race = null;       // the ported rules (ow-kart/rules.js)
let views = [];        // one per racer: { racer, mesh, kart, char, color, playerId, ... }
let humans = [];       // the views of the human players
let objectMeshes = new Map(); // item projectiles/slicks on the road: race object id -> mesh
let boxMeshes = [], coinMeshes = [];
let stopGraphics = null;
let state, shown, overAt, paused = false, alive = 0, lastCount = 0;
let pauseMenu = null, resultsMenu = null, menuPaused = false; // the pause menu and the results menu (karts-menus.js)
let tuning = loadTuning(), tuningPanel = null, governor = null, onTuningKey = null, debugBox = null; // tuning: every number of the handling, camera and juice (T opens the sliders)
let portraits, select, selection, look, fx, qfx; // qfx: the three.quarks particles (null if the library can't load)
const showrooms = new Map(); // playerId -> 3D preview on the select screen (karts-showroom.js)
const assets = new Map();    // loaded 3D models: path -> glTF (missing = use the code-built ones)
const input = new Map();     // playerId -> { steer, gas, brake, left, right, drift, item }

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
// Our models face +z; the rules' heading has forward = (sin h, -cos h)
const yawOf = (heading) => Math.PI - heading;

function closeMenus() {
  pauseMenu?.destroy(); resultsMenu?.destroy(); resultsMenu = null;
  menuPaused = false;
}
const goSelect = () => wipe(root, () => showSelect());
const goRestart = () => wipe(root, () => { closeMenus(); startRace(); });

// ---------- Select screen ----------

function showSelect() {
  state = 'select';
  overAt = null;
  api.setController('pointer'); // D-pad and buttons for menus
  clearRace();
  root.querySelectorAll('.kart-hud').forEach((e) => e.remove());
  closeMenus();
  minimap.hidden = true;
  const ids = api.players.map((p) => p.playerId).slice(0, api.mode === 'solo' ? 1 : 2);
  root.classList.add('selecting');
  select = createSelect({
    root, portraits, previous: selection, sound: api.sound, tracks: ALL_TRACKS, characters: CHARACTERS,
    players: ids.map((id) => ({ playerId: id, color: colorFor(id) })),
    onDone: (sel) => { selection = sel; select = null; root.classList.remove('selecting'); startRace(); },
    onExit: () => api.exit(),
    onCelebrate: (playerId, kind) => showrooms.get(playerId)?.celebrate(kind),
  });
}

// ---------- Race setup ----------

function clearRace() {
  for (const v of views) { scene.remove(v.mesh.root, v.mesh.shadow); if (v.mesh.q) qfx?.detach(v.mesh.q); }
  for (const m of objectMeshes.values()) scene.remove(m);
  objectMeshes.clear();
  for (const m of [...boxMeshes, ...coinMeshes]) scene.remove(m);
  boxMeshes = []; coinMeshes = [];
  fx?.clear();
  humans.forEach((h) => { h.engine?.stop(); if (h.lines) qfx?.detachCamera(h.lines); if (h.camera) scene.remove(h.camera); });
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

// The light rig for a track: the stadium takes OpenWii's numbers, the others the daylight/night defaults
function applyLighting(def) {
  const L = def.lighting, hemi = scene.userData.hemi, fill = scene.userData.fill;
  sun.color.set(L?.keyColor || '#fff4e0');
  sun.intensity = L ? L.key : def.night ? 0.6 : 2.2;
  hemi.color.set(L?.hemiSky || '#CFE6FF'); hemi.groundColor.set(L?.hemiGround || '#5A6A4A');
  hemi.intensity = L ? L.hemi : (def.night ? 0.7 : 1.1) * 0.6;
  fill.intensity = L ? L.fill : 0.35;
}

async function startRace() {
  clearRace();
  const def = ALL_TRACKS[selection.track];
  if (track?.def !== def) {
    if (track) {
      track.floodlights?.remove();
      scene.remove(track.group);
      track.group.traverse((o) => { o.geometry?.dispose(); [].concat(o.material || []).forEach((m) => { m.map?.dispose(); m.dispose(); }); });
      track = null;
    }
    state = 'loading';
    if (!(await loadModels([...THEME_MODELS.common, ...(THEME_MODELS[def.theme] || [])]))) return;
    // Real asphalt, concrete and ground pictures (Poly Haven) if the files are there; otherwise the generated ones
    setPavementOverride(await roadTextures(THREE));
    setStadiumPavement(await stadiumRoadTextures(THREE));
    const groundMaps = await groundTextures(THREE, def.theme, 1);
    if (def.stadium) {
      // The Grand Stadium: OpenWii's procedural world, collected in one group so it can be removed again
      const model = stadiumTrack.model, before = new Set(scene.children);
      const [{ buildWorld }, { addAtmosphere }] = await Promise.all([import('./turbo-karts/ow-kart/stadium/world.js'), import('./turbo-karts/ow-kart/stadium/atmosphere.js')]);
      const world = buildWorld(scene);
      addAtmosphere(scene);
      const group = new THREE.Group();
      for (const c of [...scene.children]) if (!before.has(c)) group.add(c);
      scene.add(group);
      track = { def, group, model, world, mixers: [], pts: model.samples };
      scene.fog = new THREE.FogExp2(...def.lighting.fog);
      const { createStadiumLights } = await import('./turbo-karts/ow-kart/stadium/lighting.js');
      track.floodlights = createStadiumLights(THREE, scene);
    } else {
      const model = createTrackModel(def);
      const path = renderPath(THREE, model);
      track = buildTrack(THREE, def, assets, { path, noPickups: true, groundMaps });
      track.model = model;
      scene.add(track.group);
      scene.fog = new THREE.Fog(def.sky[1], def.fog[0] * 1.3, def.fog[1] * 1.3);
    }
    look.setTrack(def);
    applyLighting(def);
    // A real sky picture (Poly Haven HDRI) if there is one for this track; otherwise the generated sky stays
    const sky = await skyFor(THREE, def.theme);
    scene.background = null;
    track.group.traverse((o) => { if (o.userData.isSky) o.visible = !sky; });
    if (sky) { track.group.add(skyDome(THREE, sky, SKY_GAIN[def.theme] ?? 1)); look.setSkyTexture(sky); }
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
  race = new Race({ track: T, characters: list.map((k) => k.char), karts: list.map((k) => k.kart), humans: selection.picks.length, laps: LAPS, burnout: false, seed: (Math.random() * 1e9) | 0, onEvent: onRaceEvent,
    handling: graphics.classic ? 'classic' : 'arcade', tuning }); // (tuning is read live: the T sliders change the next frame)
  views = race.racers.map((racer, i) => {
    const k = list[i], color = k.color || (k.char.accent === '#FFFFFF' ? k.char.color : k.char.accent);
    const mesh = makeRacer(k.char, k.kart, k.playerId ? k.color : color, assets);
    mesh.marker.visible = !!k.playerId;
    mesh.flame.visible = false; mesh.sparks.forEach((sp) => { sp.visible = false; });
    mesh.exhaust = makeExhaust(THREE);
    mesh.body.add(mesh.exhaust);
    mesh.q = qfx?.attach(mesh.body) || null;
    scene.add(mesh.root, mesh.shadow);
    return { racer, mesh, kart: k.kart, char: k.char, playerId: k.playerId, color: k.color || color, fxKart: {}, bounce: null, bounceAmp: 1, shake: 0, swing: 0, boostEase: 0, seed: Math.random() * 100 };
  });
  humans = views.filter((v) => v.playerId);
  governor?.setTarget(humans.length > 1 ? TARGET_2P : TARGET_1P);
  humans.forEach((h) => {
    h.camera = new THREE.PerspectiveCamera(tuning.fovBase, 1, 0.1, 1800);
    h.cam = null;
    scene.add(h.camera); // (in the scene, so the speed-lines emitter can ride on it)
    h.lines = qfx?.attachCamera(h.camera) || null;
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

// A camera shake: humans only (the computer drivers have no camera)
function shake(v, amount) { if (v.playerId) v.shake = Math.max(v.shake, amount); }

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
    case 'turbo': v.kick = 0; sfx('golden'); rumble(60 + 30 * (e.tier || 1)); shake(v, tuning.shakeBoost * ((e.tier || 1) / 3 + 0.4)); break;
    case 'boost': v.kick = 0; sfx('golden'); rumble(80); shake(v, tuning.shakeBoost * 0.6); break;
    case 'rocket': v.kick = 0; sfx('golden'); rumble(150); shake(v, tuning.shakeBoost); break;
    case 'burnout': sfx('bomb'); rumble(300); break;
    case 'drift': if (mine && e.tier) { api.sound.play('tick'); } break;
    case 'hit': v.mesh.anim?.play('HitReact'); sfx('bomb'); rumble(300); shake(v, tuning.shakeHit);
      fx.burst(v.racer.x, v.racer.y + 1.1, v.racer.z, ['#FFE066', '#FFD43B', '#FFF3BF', '#FFA94D']); break; // gold stars, like OpenWii
    case 'wall': sfx('wall'); rumble(120); shake(v, tuning.shakeWall * 0.7); if (v.mesh.q) qfx.puffDust(v.mesh.q, performance.now() / 1000, 0.2); break;
    case 'land': {
      const hard = clamp((e.impact ?? 10) / 14, 0.25, 1); // how hard the sphere came down (a glider landing has no impact number: a medium bounce)
      v.bounce = 0; v.bounceAmp = hard; sfx('wall'); rumble(40 + 60 * hard); shake(v, tuning.shakeLand * hard);
      if (v.mesh.q) qfx.puffDust(v.mesh.q, performance.now() / 1000, 0.2 + 0.3 * hard);
      break;
    }
    case 'glider': sfx('clear'); rumble(60); break;
    case 'contact': rumble(40); shake(v, tuning.shakeWall * clamp((e.impact ?? 3) / 8, 0.2, 1) * 0.6); break;
    case 'useItem': sfx(e.item === 'turbo' || e.item === 'star' ? 'select' : 'shot'); break;
    case 'itemReady': break;
    case 'finalLap': v.finalLapAt = race.raceTime; sfx('start'); break;
    case 'finish':
      v.mesh.anim?.play(race.position(v.racer) <= 3 ? 'Wave' : 'Yes', true);
      sfx(race.position(v.racer) === 1 ? 'strike' : 'end'); rumble(250);
      if (mine && qfx) qfx.confetti(v.racer.x, v.racer.y + 1.2, v.racer.z); // confetti where a human crosses the line
      break;
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
  if (state === 'select' || state === 'loading' || !race || menuPaused) return;
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
  track.update?.(performance.now() / 1000); // (Neon Avenue's chaser lights and flickering signs)
  for (const v of views) {
    const r = v.racer, m = v.mesh;
    if (!paused) m.anim?.mixer.update(dt);
    m.root.position.set(r.x, r.y, r.z);
    // a hit makes a kart spin; otherwise it faces along the road, turned into a drift
    const spinAngle = r.spin > 0 ? (1.1 - r.spin) * 12 : 0;
    // (arcade: the heading already points into the drift; classic adds a visual turn)
    m.root.rotation.set(0, yawOf(r.heading) + (r.drift && !r.arcade ? -r.drift * 0.35 : 0) + spinAngle, 0);
    m.root.visible = !(r.invulnerable > 0 && r.spin <= 0 && Math.floor(t / 90) % 2 === 0 && r.star <= 0);
    // tilt with the road slope, lean into turns, bob when airborne
    const slope = r.gliding ? 0 : Math.atan2(T.surfaceAt(r.s + 3, r.lateral).y - T.surfaceAt(r.s - 3, r.lateral).y, 6);
    m.body.rotation.x = r.gliding ? -clamp(r.flightV * 0.03, -0.3, 0.3) : -slope;
    m.body.position.y = r.hop > 0 ? Math.sin((r.hop / 0.36) * Math.PI) * 0.45 : 0;
    m.body.rotation.z = r.arcade ? -r.lean * tuning.leanAmount * 4.5 : -r.steer * 0.1 * clamp(r.speed / 30, 0, 1); // leans into turns
    // Bouncy: a landing squashes the kart and it springs back; a turbo lifts the nose for a moment
    if (v.bounce != null) {
      v.bounce += dt;
      const sq = Math.exp(-v.bounce * 7) * Math.cos(v.bounce * 22) * tuning.bounceAmount * v.bounceAmp;
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
      if (m.q) qfx.state(m.q, { speed: r.speed, boost: r.boost, boostTier: r.boostTier, drift: r.drift ? r.tier : -1, air: r.gliding || r.air, offroad: !r.gliding && !r.air && Math.abs(r.lateral) > T.roadHalf + 0.2, color: tierColor }, t / 1000);
      else fx.drift(v.fxKart, r.drift ? r.tier : 0, dt);
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

// The chase camera: it lags a little behind the kart, swings outward in drifts (the view turns toward the
// kart's nose, so the camera ends up on the outside of the turn), widens the FOV in boosts and shakes on
// landings and collisions. Every number is in `tuning` (the T sliders).
const V3 = (o) => new THREE.Vector3(o.x, o.y, o.z);
function moveCamera(h, dt, t) {
  const r = h.racer, tn = tuning;
  const dir = r.arcade ? r.dir : r.heading, off = r.arcade ? angle(r.heading - r.dir) : 0;
  h.swing += (off - h.swing) * (1 - Math.exp(-tn.swingSpeed * dt));
  h.camRacer ??= {};
  Object.assign(h.camRacer, r, { heading: dir + h.swing * tn.driftSwing });
  const d = chasePose(track.model, h.camRacer, { back: tn.camBack, height: tn.camHeight });
  const eye = V3(d.eye), aim = V3(d.aim), up = V3(d.up);
  if (!h.cam) h.cam = { eye: eye.clone(), aim: aim.clone(), up: up.clone() };
  h.cam.eye.lerp(eye, 1 - Math.exp(-dt * tn.camFollow));
  h.cam.aim.lerp(aim, 1 - Math.exp(-dt * tn.camFollow));
  h.cam.up.lerp(up, 1 - Math.exp(-dt * tn.camUpFollow)).normalize();
  h.camera.position.copy(h.cam.eye);
  h.camera.up.copy(h.cam.up);
  h.camera.lookAt(h.cam.aim);
  // shake: a quick wobble that dies down; boosts rumble a little all the time
  h.boostEase += ((r.boost > 0 ? 1 : 0) - h.boostEase) * (1 - Math.exp(-6 * dt));
  h.shake *= Math.exp(-tn.shakeDecay * dt);
  const amp = h.shake + tn.shakeBoost * 0.12 * h.boostEase * clamp(r.speed / 40, 0, 1);
  if (amp > 0.001) {
    const n = (k) => Math.sin(t * 0.001 * k + h.seed) * Math.cos(t * 0.0013 * k * 0.7 + h.seed * 2);
    h.camera.position.x += amp * 0.28 * n(61); h.camera.position.y += amp * 0.22 * n(83); h.camera.position.z += amp * 0.28 * n(47);
    h.camera.rotateZ(amp * 0.012 * n(71));
  }
  const fov = tn.fovBase + tn.fovSpeed * clamp(Math.abs(r.speed) / 36, 0, 1.4) + tn.fovBoost * h.boostEase + (r.drift ? tn.fovDrift : 0) + (r.gliding ? 3 : 0);
  h.camera.fov += (fov - h.camera.fov) * (1 - Math.exp(-dt * tn.fovEase));
  h.camera.updateProjectionMatrix();
  if (h.lines) qfx.cameraState(h.lines, { boost: h.boostEase * tn.speedLines, speed: Math.abs(r.speed) });
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
    const off = track.def.lighting?.keyOffset || SUN_DIR.map((d) => d * 80);
    sun.position.set(r.x + off[0], r.y + off[1], r.z + off[2]);
    track.floodlights?.update(r.s);
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
  root.querySelectorAll('.kart-hud').forEach((e) => e.remove());
  closeMenus();
  humans.forEach((h, i) => {
    const el = document.createElement('div');
    el.className = 'kart-hud';
    el.style.top = `${(i * 100) / humans.length}%`;
    el.style.height = `${100 / humans.length}%`;
    el.style.setProperty('--player', h.color);
    el.innerHTML = `<div class="kart-itembox"><div class="kart-item"></div></div><div class="kart-coins"></div>
      <div class="kart-lap"></div><div class="kart-place-wrap"><img class="kart-face" src="${portraits[h.char.id]}" alt=""><div class="kart-place"></div></div>
      <div class="kart-drift"></div><div class="kart-msg"></div>
      <div class="kart-charge"><i></i><i></i><i></i></div>`;
    root.append(el);
    h.hud = el;
  });
}

const TIER_TEXT = ['Drift…', 'Blue boost', 'Orange boost!', 'PURPLE BOOST!'];
function updateHud() {
  if (state === 'select' || !race) return;
  const names = ITEMS;
  for (const h of humans) {
    const r = h.racer;
    const q = (s) => h.hud.querySelector(s);
    const set = (s, v) => { const e = q(s); if (e.innerHTML !== v) e.innerHTML = v; };
    set('.kart-place', ordinal(race.position(r)).replace(/(\D+)$/, '<small>$1</small>'));
    set('.kart-lap', `Lap ${clamp(r.lap, 1, LAPS)}/${LAPS}`);
    set('.kart-coins', `<span class="coin"></span>${r.coins}`);
    const icon = r.roulette > 0 ? ITEM_ICONS[names[Math.floor(performance.now() / 90) % names.length]] : r.item ? ITEM_ICONS[r.item] : '';
    set('.kart-item', icon || '');
    q('.kart-itembox').classList.toggle('ready', !!r.item && r.roulette <= 0);
    h.hud.classList.toggle('boosting', r.boost > 0);
    // the drift charge: three pips fill blue, orange, purple at the tuned charge times
    const meter = q('.kart-charge');
    meter.classList.toggle('on', !!r.drift);
    if (r.drift) {
      const edges = [0, tuning.charge1, tuning.charge2, tuning.charge3];
      meter.querySelectorAll('i').forEach((pip, k) => pip.style.setProperty('--f', clamp((r.charge - edges[k]) / (edges[k + 1] - edges[k]), 0, 1).toFixed(3)));
    }
    meter.dataset.tier = r.drift ? r.tier : 0;
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
  let banner, color = '#FF3D8B';
  if (api.mode === 'coop') {
    const pts = (v) => POINTS[order.indexOf(v)];
    const team = humans.reduce((s, h) => s + pts(h), 0);
    const rivals = order.filter((v) => !v.playerId).slice(0, 2).reduce((s, v) => s + pts(v), 0);
    banner = team > rivals ? `Team wins! ${team} – ${rivals}` : team === rivals ? `Tie! ${team} – ${rivals}` : `Rivals win ${rivals} – ${team}`;
    if (team > rivals) color = '#2F6BFF';
  } else {
    const w = order[0];
    banner = `${w.playerId ? `P${w.playerId}` : w.char.name} wins!`;
    if (w.playerId) { color = '#2F6BFF'; api.reportWin?.(w.playerId); }
  }
  const row = (v, i) => `<tr class="${v.playerId ? 'me' : ''}" style="--c:${v.color}"><td>${ordinal(i + 1)}</td><td><img src="${portraits[v.char.id]}" alt="">${v.playerId ? `<b>P${v.playerId}</b> ${personFace(v.playerId)}` : ''}${v.char.name}</td>
    <td>${api.mode === 'coop' ? `${POINTS[i]} pts` : formatTime(v.racer.finishTime)}</td></tr>`;
  const rows = `<div class="kk-tables"><table class="kk-table">${order.slice(0, 4).map((v, i) => row(v, i)).join('')}</table><table class="kk-table">${order.slice(4).map((v, i) => row(v, i + 4)).join('')}</table></div>`;
  const podium = podiumHtml(order.slice(0, 3).map((v) => ({
    face: v.playerId && party.personOfPlayer(v.playerId)?.avatar ? avatarSvg(party.personOfPlayer(v.playerId).avatar, 84) : `<img src="${portraits[v.char.id]}" alt="">`,
    name: v.playerId ? `P${v.playerId} ${party.personOfPlayer(v.playerId)?.name || ''}`.trim() : v.char.name, sub: formatTime(v.racer.finishTime), color: v.playerId ? v.color : '#8E99B3',
  })));
  resultsMenu = createResultsMenu({
    root, sound: api.sound, content: { banner, color, podium, rows },
    onAgain: goRestart, onRacers: goSelect, onQuit: () => api.exit(),
    afterPodium: (card) => playPodium(card), // the podium rises and confetti falls (GSAP)
  });
}

// A drift tier's spark color for three.quarks (above 1 so it glows)
const tierColor = (tier, gain = 2.6) => { const c = new THREE.Color(TIER_COLORS[tier]); return new THREE.Vector4(c.r * gain, c.g * gain, c.b * gain, 1); };

// A player's little face (their avatar) for the results table
function personFace(playerId) {
  const p = party.personOfPlayer(playerId);
  return p?.avatar ? `<span class="res-face">${avatarSvg(p.avatar, 30)}</span>` : '';
}

// ---------- Loop & input ----------

function loop(t) {
  const dt = Math.min(0.05, (t - (lastT ?? t)) / 1000);
  lastT = t;
  if (!paused && !menuPaused) { update(dt); fx?.update(dt); qfx?.update(dt); }
  if (state === 'select') showrooms.forEach((room) => room.update(dt));
  if (race && views.length) {
    syncMeshes(t, dt);
    humans.forEach((h) => moveCamera(h, dt, t));
  }
  render();
  if (state === 'race' || state === 'countdown') { look.tick(dt); if (look.force !== 'on') governor?.tick(look.fps, dt); }
  if (debugBox) updateDebug();
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
  // the pause menu and the results menu take the buttons while they are open
  if (down && pauseMenu?.isOpen) return void pauseMenu.handle(button);
  if (down && resultsMenu) { if (!overAt || performance.now() - overAt > 900) resultsMenu.handle(button); return; }
  if (down && button === 'PLUS' && race && ['countdown', 'race', 'done'].includes(state)) { openPause(); return; }
  if (resultsMenu) return;
  if (button === 'A') c.gas = down;
  if (button === 'B') c.brake = down;
  if (button === 'R') { c.drift = down; if (down) c.tapped = true; }
  if (button === 'UP') c.item = down;
  if (button === 'LEFT') c.left = down;
  if (button === 'RIGHT') c.right = down;
}

function openPause() {
  menuPaused = true;
  humans.forEach((h) => h.engine?.set(0, 0));
  for (const c of input.values()) Object.assign(c, { gas: false, brake: false, drift: false, item: false, left: false, right: false }); // (no stuck buttons while the menu has the pad)
  pauseMenu ??= createPauseMenu({
    root, sound: api.sound,
    onResume: () => { menuPaused = false; lastT = null; },
    onRestart: goRestart,
    onRacers: goSelect,
    onQuit: () => api.exit(),
  });
  pauseMenu.open();
}

function resize() {
  if (renderer) renderer.setSize(root.clientWidth, root.clientHeight, false);
}

// ---------- Frame rate: lower the effects step by step when the laptop is struggling ----------
// 60 fps is the goal with one player, 45+ with split screen (karts-quality.js)
function applyQuality(level) {
  look?.setQuality(level);
  qfx?.setQuality(level);
  if (sun) {
    const size = level >= 2 ? 2048 : 1024;
    if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  }
  if (renderer) { renderer.setPixelRatio(level >= 2 ? Math.min(window.devicePixelRatio || 1, 1.5) : 1); resize(); }
}

// ?debug=1: frames per second, the effect level and the handling, in a corner of the game
function updateDebug() {
  const now = performance.now();
  if (now - (debugBox.at || 0) < 250) return;
  debugBox.at = now;
  const h = humans[0]?.racer;
  debugBox.textContent = `${look?.fps ?? '–'} fps · effects ${['minimal', 'low', 'medium', 'high'][governor?.level ?? 3]} (target ${governor?.target ?? '–'})`
    + ` · ${race?.handling ?? '–'} handling${h ? ` · ${h.speed.toFixed(1)} m/s${h.drift ? ` · drift tier ${h.tier} charge ${h.charge.toFixed(1)}` : ''}${h.boost > 0 ? ` · boost ${h.boost.toFixed(1)}` : ''}${h.air ? ' · air' : ''}` : ''}`;
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
  const ok = await loadModels([...KARTS.map((k) => CAR(k.model)), ...CHARACTERS.map((c) => c.path),
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
  scene.userData.fill = fill;
  sun = new THREE.DirectionalLight('#fff4e0', 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 160 });
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.025;
  sun.shadow.camera.far = 220;
  scene.add(sun, sun.target);
  look = await createLook(THREE, renderer, scene, new URLSearchParams(location.search).get('fx'));
  // Settings: the cartoon look and ambient occlusion (?ao=off / ?cartoon=off in the link win, for testing)
  const q = new URLSearchParams(location.search);
  const applyGraphics = () => {
    look.setAO(q.get('ao') ? q.get('ao') !== 'off' : graphics.ao);
    look.setCartoon(q.get('cartoon') ? q.get('cartoon') !== 'off' : graphics.cartoon);
  };
  applyGraphics();
  stopGraphics = graphics.onChange(applyGraphics);
  fx = createRaceFx(THREE, scene);
  qfx = new URLSearchParams(location.search).get('quarks') === 'off' ? null : await createQuarks(THREE, scene);
  if (token !== alive) return;
  root.classList.toggle('has-quarks', !!qfx);
  governor = createGovernor({ target: TARGET_1P, onChange: applyQuality });
  if (new URLSearchParams(location.search).has('debug')) {
    debugBox = document.createElement('pre');
    debugBox.className = 'kart-fps';
    root.append(debugBox);
  }
  // T opens the tuning sliders (laptop keyboard); changes are used at once and saved in this browser
  tuningPanel = createTuningPanel({ root, tuning, save: () => saveTuning(tuning) });
  onTuningKey = (e) => { if ((e.key === 't' || e.key === 'T') && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) tuningPanel.toggle(); };
  addEventListener('keydown', onTuningKey);
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
    paused = false; menuPaused = false; state = 'loading'; selection = null; track = null; race = null;
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
    stopGraphics?.(); stopGraphics = null;
    removeEventListener('keydown', onTuningKey); onTuningKey = null;
    closeMenus(); pauseMenu = null;
    tuningPanel?.destroy(); tuningPanel = null; governor = null; debugBox = null;
    look?.dispose();
    fx?.dispose();
    qfx?.dispose(); qfx = null;
    renderer?.dispose();
    root?.remove();
    api = root = renderer = look = scene = track = resizeObserver = select = fx = race = null;
    views = []; humans = [];
  },
};
