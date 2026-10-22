// Co-op Dungeon (3D). Point at the floor to walk there, press A to swing your sword.
// Collect every gem to open the exit, then get everyone to it. 3 levels.
// Watch out for spike traps and slimes. Hearts are shared. Pressure plates open gates:
// in co-op a gate stays open only while someone stands on its plate (help each other!).
import { colorFor } from '../../shared/protocol.js';
import { createStage } from './three-stage.js';

// # wall · . floor · G gem · S spikes · P plate · D gate · M slime · E exit · 1/2 hero starts · T wall with a torch
const LEVELS = [
  [
    '###T#####T###',
    '#1....G.....#',
    '#.2.........#',
    '#....###..G.#',
    '#.G..#.#....#',
    '#....#S#..S.#',
    'T..S......G.T',
    '#........S..#',
    '#.G.......E.#',
    '######T######',
  ],
  [
    '####T####T#####',
    '#1.....#.....G#',
    '#2.....#.PM...#',
    '#..G...D......#',
    '#......#####.##',
    'T.P....S...#..T',
    '#..........#G.#',
    '#..M...G...D..#',
    '#....S.....#.E#',
    '#####T###T#####',
  ],
  [
    '###T#####T#####',
    '#1..S..G#....G#',
    '#2......#..M..#',
    '#...M...D.....#',
    'T.......####S.T',
    '#..G.S..P.....#',
    '#.......#...M.#',
    '##D######.S...#',
    '#..G.M..#..G..#',
    '#..P....#.S..E#',
    '###T#####T#####',
  ],
];
const HEARTS = 6;
const HERO_R = 0.3, SPEED = 3.4;
const SPIKE_PERIOD = 2.6, SPIKE_UP = 1.0;

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" fill="#fff">
  <path d="M24 4l10 12-10 26L14 16z"/><path d="M24 4v38" stroke="#7B61FF" stroke-width="2"/>
  <path d="M14 16h20" stroke="#7B61FF" stroke-width="2"/>
</svg>`;

let api, stage, frame, lastT, alive = 0, paused = false;
let level, grid, heroes, slimes, gems, spikes, plates, gates, exit, hearts, state, timer, hud, msg, msgTimer;
let levelGroup, raycaster, ndc, floorPlane, hit, clock, torchLights;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------- Level building ----------

function cell(x, z) { return grid[z]?.[x] ?? '#'; }
// Is the tile at world position (x, z) solid? (walls, and gates that are closed)
function solid(x, z) {
  const cx = Math.floor(x + 0.5), cz = Math.floor(z + 0.5), c = cell(cx, cz);
  if (c === '#' || c === 'T') return true;
  if (c === 'D') return !gates.find((g) => g.x === cx && g.z === cz).open;
  return false;
}

function buildLevel(n) {
  const { THREE, scene, camera } = stage;
  if (levelGroup) {
    scene.remove(levelGroup);
    levelGroup.traverse((o) => { o.geometry?.dispose(); [].concat(o.material || []).forEach((m) => m.dispose()); });
  }
  levelGroup = new THREE.Group();
  scene.add(levelGroup);
  level = n;
  grid = LEVELS[n].map((row) => row.split(''));
  const W = grid[0].length, H = grid.length;
  const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
  const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; levelGroup.add(mesh); return mesh; };

  // Floor and walls (instanced: one draw call each)
  const floorTiles = [], wallTiles = [];
  grid.forEach((row, z) => row.forEach((c, x) => ((c === '#' || c === 'T') ? wallTiles : floorTiles).push([x, z])));
  const floor = new THREE.InstancedMesh(new THREE.BoxGeometry(0.98, 0.2, 0.98), mat('#ffffff'), floorTiles.length);
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1.3, 1), mat('#ffffff'), wallTiles.length);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  floorTiles.forEach(([x, z], i) => {
    m4.makeTranslation(x, -0.1, z); floor.setMatrixAt(i, m4);
    floor.setColorAt(i, col.set((x + z) % 2 ? '#6B6F7E' : '#737888').offsetHSL(0, 0, (Math.random() - 0.5) * 0.04));
  });
  wallTiles.forEach(([x, z], i) => {
    m4.makeTranslation(x, 0.65, z); walls.setMatrixAt(i, m4);
    walls.setColorAt(i, col.set('#4A4E5C').offsetHSL(0, 0, (Math.random() - 0.5) * 0.06));
  });
  floor.receiveShadow = true; walls.castShadow = true; walls.receiveShadow = true;
  levelGroup.add(floor, walls);

  // Things on the map
  gems = []; spikes = []; plates = []; gates = []; slimes = []; exit = null;
  const starts = {};
  const gemColors = ['#56CCF2', '#BB6BD9', '#6FCF97', '#F2C94C'];
  torchLights.forEach((l) => { l.visible = false; });
  let torchN = 0;
  grid.forEach((row, z) => row.forEach((c, x) => {
    if (c === 'G') {
      const g = add(new THREE.Mesh(new THREE.OctahedronGeometry(0.22), mat(gemColors[gems.length % 4], { emissive: gemColors[gems.length % 4], emissiveIntensity: 0.4 })), x, 0.45, z);
      gems.push({ x, z, mesh: g, taken: false });
    } else if (c === 'S') {
      const s = new THREE.Group();
      for (const [dx, dz] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25], [0, 0]]) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 8), mat('#C9D2DE'));
        cone.position.set(dx, 0.22, dz); cone.castShadow = true; s.add(cone);
      }
      const base = add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.9), mat('#3B3F4A')), x, 0.02, z);
      s.position.set(x, 0, z); levelGroup.add(s);
      spikes.push({ x, z, mesh: s, base, offset: (x * 0.37 + z * 0.61) % 1 });
    } else if (c === 'P') {
      const p = add(new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.06, 0.75), mat('#9C6B3C', { emissive: '#000' })), x, 0.03, z);
      plates.push({ x, z, mesh: p, pressed: false, openTimer: 0 });
    } else if (c === 'D') {
      const bars = new THREE.Group();
      for (let i = -2; i <= 2; i++) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8), mat('#8A94A6'));
        bar.position.set(i * 0.18, 0.6, 0); bar.castShadow = true; bars.add(bar);
      }
      // bars run across the corridor: if the walls are above and below, the corridor runs left-right
      const wallsAboveBelow = cell(x, z - 1) === '#' && cell(x, z + 1) === '#';
      bars.rotation.y = wallsAboveBelow ? Math.PI / 2 : 0;
      bars.position.set(x, 0, z); levelGroup.add(bars);
      gates.push({ x, z, mesh: bars, open: false, lift: 0 });
    } else if (c === 'E') {
      const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.07, 10, 32), mat('#7B61FF', { emissive: '#7B61FF', emissiveIntensity: 0.2 })), x, 0.55, z);
      const pad = add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 32), mat('#2B2F3A', { emissive: '#7B61FF', emissiveIntensity: 0.1 })), x, 0.03, z);
      exit = { x, z, ring, pad, open: false };
    } else if (c === 'M') {
      const body = add(new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), mat('#6FCF97', { transparent: true, opacity: 0.9 })), x, 0.3, z);
      const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.05), mat('#1B1F2A'));
      eyes.position.set(0, 0.08, 0.28); body.add(eyes);
      slimes.push({ x, z, mesh: body, alive: true, dirX: 0, dirZ: 0, think: 0, hop: Math.random() * 6 });
    } else if (c === 'T') {
      const flame = add(new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.25, 8), mat('#FFB347', { emissive: '#FF8C1A', emissiveIntensity: 1 })), x, 1.45, z);
      flame.castShadow = false;
      const light = torchLights[torchN++];
      if (light) { light.position.set(x, 1.6, z); light.visible = true; }
    } else if (c === '1' || c === '2') starts[c] = [x, z];
  }));

  // Heroes go to their start spots
  heroes.forEach((h, i) => {
    const [x, z] = starts[String(i + 1)] || starts['1'];
    Object.assign(h, { x, z, tx: x, tz: z, hurt: 0, swing: 0, cooldown: 0, done: false, facing: 0 });
    h.mesh.visible = true;
  });

  // Camera sees the whole level from above at an angle
  const cx = (W - 1) / 2, cz = (H - 1) / 2;
  const dist = Math.max(W * 0.62, H * 1.05);
  camera.position.set(cx, dist * 0.95, cz + dist * 0.62);
  camera.lookAt(cx, 0, cz + 0.4);
  stage.sun.position.set(cx - 4, 14, cz + 6);
  stage.sun.target.position.set(cx, 0, cz);
  stage.sun.target.updateMatrixWorld();
  Object.assign(stage.sun.shadow.camera, { left: -W, right: W, top: H, bottom: -H, far: 40 });
  stage.sun.shadow.camera.updateProjectionMatrix();
  floorPlane.constant = 0;
  state = 'intro'; timer = 0;
  say(`Level ${n + 1}`);
}

function makeHero(color) {
  const { THREE, scene } = stage;
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.32, 6, 12), mat(color));
  body.position.y = 0.4; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), mat('#F2D0A9'));
  head.position.y = 0.82; head.castShadow = true;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(color));
  helmet.position.y = 0.86;
  const sword = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.55), mat('#E6EEF7'));
  blade.position.z = 0.35; blade.castShadow = true;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), mat('#C49A6C'));
  sword.add(blade, guard);
  sword.position.set(0.25, 0.45, 0.05);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.33, 0.4, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
  g.add(body, head, helmet, sword, ring);
  scene.add(g);
  return { mesh: g, sword };
}

// ---------- Game ----------

function newGame() {
  hearts = HEARTS;
  clock = 0;
  buildLevel(0);
}

function say(text) { msg = text; msgTimer = 0; }

function hurt(h) {
  if (h.hurt > 0 || state !== 'play') return;
  hearts--;
  h.hurt = 1.2; // a moment of safety after a hit
  api.rumble(h.playerId, 220);
  api.sound.play('bomb');
  if (hearts <= 0) { state = 'lost'; timer = 0; api.sound.play('end'); }
}

function pointerTarget(h) {
  const p = api.pointer(h.playerId);
  if (!p) return;
  const r = stage.root.getBoundingClientRect();
  ndc.set(((p.x - r.left) / r.width) * 2 - 1, -((p.y - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, stage.camera);
  if (raycaster.ray.intersectPlane(floorPlane, hit)) { h.tx = hit.x; h.tz = hit.z; }
}

function moveHero(h, dt) {
  pointerTarget(h);
  const dx = h.tx - h.x, dz = h.tz - h.z, d = Math.hypot(dx, dz);
  if (d < 0.2) return;
  const step = Math.min(d, SPEED * dt), nx = (dx / d) * step, nz = (dz / d) * step;
  h.facing = Math.atan2(dx, dz);
  // Slide along walls: try each axis separately
  const free = (x, z) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].every(([sx, sz]) => !solid(x + sx * HERO_R, z + sz * HERO_R));
  if (free(h.x + nx, h.z)) h.x += nx;
  if (free(h.x, h.z + nz)) h.z += nz;
}

function swing(h) {
  if (h.cooldown > 0 || state !== 'play') return;
  h.cooldown = 0.45; h.swing = 1;
  api.sound.play('hit');
  for (const s of slimes) {
    if (!s.alive) continue;
    const dx = s.x - h.x, dz = s.z - h.z, d = Math.hypot(dx, dz);
    const facingDiff = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - h.facing), Math.cos(Math.atan2(dx, dz) - h.facing)));
    if (d < 1.15 && (facingDiff < 1.3 || d < 0.6)) {
      s.alive = false;
      api.sound.play('pop');
      api.rumble(h.playerId, 60);
    }
  }
}

function update(dt) {
  timer += dt; msgTimer += dt;
  if (state === 'intro' && timer > 1.2) { state = 'play'; say('Collect all the gems!'); }
  if (state !== 'play') return;
  clock += dt;
  const t = performance.now() / 1000;

  // Heroes
  for (const h of heroes) {
    h.hurt = Math.max(0, h.hurt - dt); h.cooldown = Math.max(0, h.cooldown - dt); h.swing = Math.max(0, h.swing - dt * 4);
    if (!h.done) moveHero(h, dt);
  }
  // Gems
  for (const g of gems) {
    if (g.taken) continue;
    if (heroes.some((h) => Math.hypot(h.x - g.x, h.z - g.z) < 0.5)) {
      g.taken = true; g.mesh.visible = false;
      api.sound.play('golden');
      if (gems.every((x) => x.taken)) { exit.open = true; say('The exit is open!'); api.sound.play('start'); }
    }
  }
  // Spikes go up and down; standing on raised spikes hurts
  for (const s of spikes) {
    const phase = ((t / SPIKE_PERIOD + s.offset) % 1) * SPIKE_PERIOD;
    s.up = phase < SPIKE_UP;
    s.mesh.position.y += ((s.up ? 0 : -0.45) - s.mesh.position.y) * Math.min(1, dt * 14);
    if (s.up) for (const h of heroes) if (!h.done && Math.abs(h.x - s.x) < 0.45 && Math.abs(h.z - s.z) < 0.45) hurt(h);
  }
  // Plates open gates. Co-op: only while pressed. Solo: stays open a few seconds.
  const holdTime = api.mode === 'solo' || heroes.length < 2 ? 5 : 0.4;
  for (const p of plates) {
    p.pressed = heroes.some((h) => !h.done && Math.abs(h.x - p.x) < 0.45 && Math.abs(h.z - p.z) < 0.45);
    p.openTimer = p.pressed ? holdTime : Math.max(0, p.openTimer - dt);
    p.mesh.position.y = p.pressed ? 0.005 : 0.03;
    p.mesh.material.emissive.set(p.openTimer > 0 ? '#F2C94C' : '#000000');
  }
  const anyOpen = plates.some((p) => p.openTimer > 0);
  for (const g of gates) {
    // don't close on top of someone
    const blocked = heroes.some((h) => Math.abs(h.x - g.x) < 0.8 && Math.abs(h.z - g.z) < 0.8);
    if (anyOpen !== g.open && (anyOpen || !blocked)) { g.open = anyOpen; api.sound.play('wall'); }
    g.lift += ((g.open ? -1.15 : 0) - g.lift) * Math.min(1, dt * 8);
    g.mesh.position.y = g.lift;
  }
  // Slimes hop toward the nearest hero they can sense, otherwise wander
  for (const s of slimes) {
    if (!s.alive) { s.mesh.scale.multiplyScalar(0.85); if (s.mesh.scale.x < 0.05) s.mesh.visible = false; continue; }
    s.think -= dt;
    const near = heroes.filter((h) => !h.done).map((h) => [h, Math.hypot(h.x - s.x, h.z - s.z)]).sort((a, b) => a[1] - b[1])[0];
    if (s.think <= 0) {
      s.think = 0.6 + Math.random() * 0.6;
      if (near && near[1] < 4.5) { s.dirX = (near[0].x - s.x) / near[1]; s.dirZ = (near[0].z - s.z) / near[1]; }
      else { const a = Math.random() * Math.PI * 2; s.dirX = Math.cos(a); s.dirZ = Math.sin(a); }
    }
    const sp = 1.5 * dt, nx = s.x + s.dirX * sp, nz = s.z + s.dirZ * sp;
    if (!solid(nx + Math.sign(s.dirX) * 0.3, s.z)) s.x = nx; else s.dirX = -s.dirX;
    if (!solid(s.x, nz + Math.sign(s.dirZ) * 0.3)) s.z = nz; else s.dirZ = -s.dirZ;
    if (near && near[1] < 0.55) hurt(near[0]);
  }
  // Exit: everyone who reaches the open portal is safe; all safe = level done
  if (exit.open) {
    for (const h of heroes) {
      if (!h.done && Math.hypot(h.x - exit.x, h.z - exit.z) < 0.5) { h.done = true; h.mesh.visible = false; api.sound.play('select'); api.rumble(h.playerId, 80); }
    }
    if (heroes.every((h) => h.done)) {
      state = level + 1 < LEVELS.length ? 'cleared' : 'won';
      timer = 0;
      api.sound.play(state === 'won' ? 'strike' : 'start');
    }
  }
}

// ---------- Drawing ----------

function sync() {
  const t = performance.now() / 1000;
  for (const h of heroes) {
    h.mesh.position.set(h.x, 0, h.z);
    h.mesh.rotation.y = h.facing;
    h.sword.rotation.y = -h.swing * 2.2 + 0.4;
    h.mesh.visible = !h.done && (h.hurt === 0 || Math.floor(t * 12) % 2 === 0); // blink when hurt
  }
  for (const g of gems) { g.mesh.rotation.y = t * 2; g.mesh.position.y = 0.45 + Math.sin(t * 3 + g.x) * 0.06; }
  for (const s of slimes) {
    if (!s.alive) continue;
    const hop = Math.abs(Math.sin(t * 6 + s.hop));
    s.mesh.position.set(s.x, 0.28 + hop * 0.15, s.z);
    s.mesh.scale.set(1 + (1 - hop) * 0.15, 0.85 + hop * 0.2, 1 + (1 - hop) * 0.15);
    s.mesh.rotation.y = Math.atan2(s.dirX, s.dirZ);
  }
  if (exit) {
    exit.ring.rotation.y = t * (exit.open ? 2.5 : 0.4);
    exit.ring.material.emissiveIntensity = exit.open ? 1.2 + Math.sin(t * 6) * 0.3 : 0.15;
    exit.pad.material.emissiveIntensity = exit.open ? 0.8 : 0.1;
  }
  torchLights.forEach((l, i) => { l.intensity = 6 + Math.sin(t * 9 + i) * 1.2; });
}

function renderHud() {
  const hp = Array.from({ length: HEARTS }, (_, i) => `<span class="heart ${i < hearts ? 'on' : ''}">♥</span>`).join('');
  const got = gems.filter((g) => g.taken).length;
  let html = `<div class="dungeon-bar"><span>Level ${level + 1}/${LEVELS.length}</span><span class="hearts">${hp}</span><span>💎 ${got}/${gems.length}</span></div>`;
  if (msg && msgTimer < 2) html += `<div class="msg">${msg}</div>`;
  if (state === 'play' && plates.length && api.mode !== 'solo' && heroes.length > 1 && msgTimer > 2) {
    html += '<div class="hint">Gates stay open only while someone stands on the plate: help each other!</div>';
  }
  const panel = (title, line, c, buttons) => `<div class="panel" style="--c:${c}"><h1>${title}</h1><p>${line}</p><p>${buttons}</p></div>`;
  const time = `${Math.floor(clock / 60)}:${String(Math.floor(clock % 60)).padStart(2, '0')}`;
  if (state === 'cleared') html += panel(`Level ${level + 1} cleared!`, `Time ${time}`, '#27AE60', 'A = next level · B = menu');
  if (state === 'lost') html += panel('Out of hearts!', `You reached level ${level + 1}`, '#E03131', 'A = try this level again · B = menu');
  if (state === 'won') html += panel('Dungeon cleared!', `All ${LEVELS.length} levels in ${time}`, '#7B61FF', 'A = play again · B = menu');
  if (hud.innerHTML !== html) hud.innerHTML = html;
}

function loop(t) {
  const dt = Math.min(0.05, (t - (lastT ?? t)) / 1000);
  lastT = t;
  if (!paused) update(dt);
  sync();
  stage.render();
  renderHud();
  frame = requestAnimationFrame(loop);
}

function onButton({ playerId, button, state: st }) {
  if (st !== 'down') return;
  const h = heroes.find((x) => x.playerId === playerId);
  if (state === 'play') { if (button === 'A' && h) swing(h); return; }
  const ready = timer > 1;
  if (button === 'A' && ready) {
    if (state === 'cleared') buildLevel(level + 1);
    else if (state === 'lost') { hearts = HEARTS; buildLevel(level); }
    else if (state === 'won') newGame();
  } else if (button === 'B' && playerId === heroes[0].playerId && state !== 'intro') {
    api.exit();
  }
}

async function init(token, container) {
  stage = await createStage(container, { sky: '#151923', fov: 45, isAlive: () => token === alive });
  if (!stage) return;
  const { THREE } = stage;
  stage.scene.children.filter((o) => o.isHemisphereLight).forEach((l) => { l.intensity = 0.7; });
  stage.sun.intensity = 1.1;
  stage.scene.add(stage.sun.target);
  raycaster = new THREE.Raycaster();
  ndc = new THREE.Vector2();
  floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  hit = new THREE.Vector3();
  // A few warm torch lights (reused between levels)
  torchLights = Array.from({ length: 6 }, () => {
    const l = new THREE.PointLight('#FFB347', 6, 7, 1.6);
    stage.scene.add(l);
    return l;
  });
  const ids = api.players.map((p) => p.playerId).slice(0, api.mode === 'solo' ? 1 : 2);
  heroes = ids.map((id) => ({ playerId: id, ...makeHero(colorFor(id)) }));
  hud = document.createElement('div');
  hud.className = 'hud3d';
  stage.root.append(hud);
  newGame();
  api.onButton(onButton);
  lastT = null;
  frame = requestAnimationFrame(loop);
}

export default {
  id: 'dungeon',
  title: 'Gem Dungeon',
  color: '#4B3F9E',
  icon: ICON,
  minPlayers: 1,
  maxPlayers: 2,
  modes: ['coop', 'solo'],
  mount(container, gameApi) {
    api = gameApi;
    paused = false;
    levelGroup = null;
    init(++alive, container);
  },
  pause() { paused = true; },
  resume() { paused = false; lastT = null; },
  unmount() {
    alive++;
    cancelAnimationFrame(frame);
    stage?.dispose();
    api = stage = hud = heroes = levelGroup = null;
  },
};
