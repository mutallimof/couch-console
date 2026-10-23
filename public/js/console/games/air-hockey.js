// Air Hockey (3D). Your mallet follows your pointer on your half of the table.
// Knock the puck into the other goal. First to 7. Rumble on hits and when you concede.
// Modes: versus (P1 left, P2 right) · solo (vs the computer)
import { colorFor } from '../../shared/protocol.js';
import { createStage } from './three-stage.js';

const HALF_L = 2, HALF_W = 1.1, GOAL_HALF = 0.36, TOP = 0.8;
const PUCK_R = 0.1, MALLET_R = 0.16;
const MAX_PUCK = 9, MALLET_SPEED = 14, FRICTION = 0.35;
const WIN = 7;
const CPU_COLOR = '#5B6577';

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" fill="#fff">
  <rect x="6" y="10" width="36" height="28" rx="6" fill="none" stroke="#fff" stroke-width="3"/>
  <circle cx="16" cy="24" r="5"/><circle cx="30" cy="20" r="3"/><path d="M24 10v28" stroke="#fff" stroke-width="2"/>
</svg>`;

let api, stage, frame, lastT, alive = 0, paused = false;
let sides, puck, state, overAt, msg, msgTimer, hud, objs, raycaster, ndc, plane, hitPoint, wallSoundAt = 0;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------- Scene ----------

function buildScene() {
  const { THREE, scene, camera } = stage;
  const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
  const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); return mesh; };
  // Arcade room: dark floor with a colorful rug
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), mat('#232B3A'));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const rug = new THREE.Mesh(new THREE.CircleGeometry(4, 40), mat('#3B4A8C'));
  rug.rotation.x = -Math.PI / 2; rug.position.y = 0.01; rug.receiveShadow = true; scene.add(rug);
  // Table body, white playing surface and lines
  add(new THREE.Mesh(new THREE.BoxGeometry(HALF_L * 2 + 0.3, TOP - 0.05, HALF_W * 2 + 0.3), mat('#2B3445')), 0, (TOP - 0.05) / 2, 0);
  const surface = add(new THREE.Mesh(new THREE.BoxGeometry(HALF_L * 2, 0.04, HALF_W * 2), mat('#F4F7FB')), 0, TOP - 0.02, 0);
  surface.castShadow = false;
  const line = (w, d, x, z, color) => add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.005, d), mat(color)), x, TOP + 0.001, z);
  line(0.03, HALF_W * 2, 0, 0, '#E03131');
  line(0.02, HALF_W * 2, -HALF_L * 0.5, 0, '#2F80ED');
  line(0.02, HALF_W * 2, HALF_L * 0.5, 0, '#2F80ED');
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.33, 0.36, 40), mat('#E03131'));
  ring.rotation.x = -Math.PI / 2; ring.position.y = TOP + 0.002; scene.add(ring);
  // Rails (with a gap for each goal) in the player colors at each end
  const railH = 0.1, railY = TOP + railH / 2;
  add(new THREE.Mesh(new THREE.BoxGeometry(HALF_L * 2 + 0.3, railH, 0.15), mat('#E6EEF7')), 0, railY, -HALF_W - 0.075);
  add(new THREE.Mesh(new THREE.BoxGeometry(HALF_L * 2 + 0.3, railH, 0.15), mat('#E6EEF7')), 0, railY, HALF_W + 0.075);
  sides.forEach((s, i) => {
    const x = (i === 0 ? -1 : 1) * (HALF_L + 0.075);
    const len = HALF_W - GOAL_HALF;
    for (const zs of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry(0.15, railH, len), mat(s.color)), x, railY, zs * (GOAL_HALF + len / 2));
    // dark goal slot
    add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, GOAL_HALF * 2), mat('#111827')), x, TOP - 0.005, 0);
  });
  // Mallets: a disc with a knob, in each player's color
  const mallets = sides.map((s) => {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(MALLET_R, MALLET_R, 0.06, 32), mat(s.color));
    base.position.y = 0.03; base.castShadow = true;
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.12, 20), mat(s.color));
    knob.position.y = 0.12; knob.castShadow = true;
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 10), mat('#ffffff'));
    top.position.y = 0.19;
    g.add(base, knob, top);
    g.position.y = TOP;
    scene.add(g);
    return g;
  });
  const puckMesh = add(new THREE.Mesh(new THREE.CylinderGeometry(PUCK_R, PUCK_R, 0.03, 32), mat('#E03131', { emissive: '#3a0a0a' })), 0, TOP + 0.015, 0);
  // Spotlight-ish lighting for the arcade feel
  stage.sun.position.set(0, 9, 3);
  Object.assign(stage.sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 });
  // Camera from the side, so P1 is on the left and P2 on the right
  camera.position.set(0, 3.7, 3.4);
  camera.lookAt(0, 0.55, 0.15);
  return { mallets, puckMesh };
}

// ---------- Game ----------

function newMatch() {
  sides.forEach((s) => { s.score = 0; });
  overAt = null;
  resetPuck(Math.random() < 0.5 ? 0 : 1);
  state = 'play';
}

// Puck waits in the middle of the given side's half (the side that just conceded)
function resetPuck(side) {
  puck = { x: (side === 0 ? -1 : 1) * HALF_L * 0.45, z: 0, vx: 0, vz: 0 };
  sides.forEach((s, i) => {
    s.x = (i === 0 ? -1 : 1) * HALF_L * 0.8; s.z = 0; s.vx = 0; s.vz = 0; s.tx = s.x; s.tz = s.z;
  });
}

function say(text) { msg = text; msgTimer = 0; }

// Where on the table is this player pointing? (raycast onto the table surface)
function pointerTarget(s) {
  const p = api.pointer(s.playerId);
  if (!p) return;
  const r = stage.root.getBoundingClientRect();
  ndc.set(((p.x - r.left) / r.width) * 2 - 1, -((p.y - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, stage.camera);
  if (raycaster.ray.intersectPlane(plane, hitPoint)) { s.tx = hitPoint.x; s.tz = hitPoint.z; }
}

function cpuTarget(s) {
  // Attack the puck when it's on our half, otherwise guard the goal
  if (puck.x > 0) {
    s.tx = puck.x + 0.15; s.tz = puck.z;
  } else {
    s.tx = HALF_L * 0.8; s.tz = puck.z * 0.45;
  }
}

function moveMallets(dt) {
  if (dt <= 0) return;
  sides.forEach((s, i) => {
    if (s.playerId) pointerTarget(s); else cpuTarget(s);
    // stay on your own half and inside the rails
    const sign = i === 0 ? -1 : 1;
    // (mallets reach just past the center line, so a puck resting there can always be hit)
    const minX = sign < 0 ? -HALF_L + MALLET_R : MALLET_R * 0.5;
    const maxX = sign < 0 ? -MALLET_R * 0.5 : HALF_L - MALLET_R;
    const tx = clamp(s.tx, minX, maxX), tz = clamp(s.tz, -HALF_W + MALLET_R, HALF_W - MALLET_R);
    const speed = s.playerId ? MALLET_SPEED : 3.4;
    const dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz), step = Math.min(d, speed * dt);
    const nx = d ? (dx / d) * step : 0, nz = d ? (dz / d) * step : 0;
    s.vx = nx / dt; s.vz = nz / dt;
    s.x += nx; s.z += nz;
  });
}

function stepPuck(dt) {
  const p = puck;
  p.x += p.vx * dt; p.z += p.vz * dt;
  const damp = Math.exp(-FRICTION * dt);
  p.vx *= damp; p.vz *= damp;
  // side rails
  if (Math.abs(p.z) > HALF_W - PUCK_R) {
    p.z = Math.sign(p.z) * (HALF_W - PUCK_R); p.vz = -p.vz * 0.9; wallSound();
  }
  // ends: goal if inside the slot, else bounce
  if (Math.abs(p.x) > HALF_L - PUCK_R) {
    if (Math.abs(p.z) < GOAL_HALF - PUCK_R * 0.3) {
      if (Math.abs(p.x) > HALF_L + PUCK_R) return goal(p.x < 0 ? 1 : 0);
    } else {
      p.x = Math.sign(p.x) * (HALF_L - PUCK_R); p.vx = -p.vx * 0.9; wallSound();
    }
  }
  // mallets: bounce off, plus the mallet's own speed
  sides.forEach((s) => {
    const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz), min = PUCK_R + MALLET_R;
    if (d >= min || d === 0) return;
    const nx = dx / d, nz = dz / d;
    p.x = s.x + nx * min; p.z = s.z + nz * min;
    const rel = (p.vx - s.vx) * nx + (p.vz - s.vz) * nz;
    if (rel < 0) {
      p.vx -= 1.9 * rel * nx; p.vz -= 1.9 * rel * nz;
      const sp = Math.hypot(p.vx, p.vz);
      if (sp > MAX_PUCK) { p.vx *= MAX_PUCK / sp; p.vz *= MAX_PUCK / sp; }
      api.sound.play('hit');
      if (s.playerId) api.rumble(s.playerId, 30);
    }
  });
}

function wallSound() {
  const now = performance.now();
  if (now - wallSoundAt > 60) { wallSoundAt = now; api.sound.play('wall'); }
}

function goal(scorer) {
  const s = sides[scorer], other = sides[1 - scorer];
  s.score++;
  api.sound.play('point');
  if (other.playerId) api.rumble(other.playerId, 250);
  if (s.score >= WIN) {
    state = 'over'; overAt = performance.now(); api.sound.play('end');
    resetPuck(1 - scorer);
    say('');
    return;
  }
  say(`Goal ${s.playerId ? `P${s.playerId}` : 'CPU'}!`);
  state = 'goal';
  msgTimer = 0;
  resetPuck(1 - scorer);
}

function update(dt) {
  msgTimer += dt;
  if (state === 'goal' && msgTimer > 1.2) state = 'play';
  moveMallets(dt);
  if (state === 'play') {
    // A puck that has stopped for 3 s gets a little nudge
    puck.still = Math.hypot(puck.vx, puck.vz) < 0.05 ? (puck.still || 0) + dt : 0;
    if (puck.still > 3) { puck.vx = (Math.random() - 0.5) * 2; puck.vz = (Math.random() - 0.5) * 2; puck.still = 0; }
    const steps = 6;
    for (let i = 0; i < steps && state === 'play'; i++) stepPuck(dt / steps);
  }
}

function sync() {
  objs.puckMesh.position.set(puck.x, TOP + 0.015, puck.z);
  sides.forEach((s, i) => objs.mallets[i].position.set(s.x, TOP, s.z));
}

function renderHud() {
  const [a, b] = sides;
  const name = (s) => (s.playerId ? `P${s.playerId}` : 'CPU');
  let html = `<div class="score"><span style="--c:${a.color}">${name(a)} ${a.score}</span><small>to ${WIN}</small><span style="--c:${b.color}">${b.score} ${name(b)}</span></div>`;
  if (msg && msgTimer < 1.2) html += `<div class="msg">${msg}</div>`;
  if (state === 'over') {
    const w = a.score > b.score ? a : b;
    html += `<div class="panel" style="--c:${w.color}"><h1>${name(w)} wins!</h1><p>${a.score} – ${b.score}</p><p>A = rematch · B = menu</p></div>`;
  } else {
    html += '<div class="hint">Point to move your mallet · knock the puck into the other goal</div>';
  }
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
  if (st !== 'down' || state !== 'over') return;
  if (button === 'A' && performance.now() - overAt > 1500) { newMatch(); api.sound.play('start'); }
  else if (button === 'B' && playerId === sides[0].playerId) api.exit();
}

async function init(token, container) {
  const ids = api.players.map((p) => p.playerId);
  const right = api.mode === 'solo' ? null : (ids[1] ?? null);
  sides = [
    { playerId: ids[0], color: colorFor(ids[0]), score: 0 },
    { playerId: right, color: right ? colorFor(right) : CPU_COLOR, score: 0 },
  ];
  stage = await createStage(container, { sky: '#1E2A3A', fov: 50, isAlive: () => token === alive });
  if (!stage) return;
  const { THREE } = stage;
  raycaster = new THREE.Raycaster();
  ndc = new THREE.Vector2();
  plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TOP);
  hitPoint = new THREE.Vector3();
  objs = buildScene();
  hud = document.createElement('div');
  hud.className = 'hud3d';
  stage.root.append(hud);
  newMatch();
  api.setCursor('crosshair');
  api.onButton(onButton);
  lastT = null;
  frame = requestAnimationFrame(loop);
}

export default {
  id: 'air-hockey',
  title: 'Air Hockey',
  color: '#1C9BC8',
  icon: ICON,
  minPlayers: 1,
  maxPlayers: 2,
  modes: ['versus', 'solo'],
  mount(container, gameApi) {
    api = gameApi;
    paused = false;
    init(++alive, container);
  },
  pause() { paused = true; },
  resume() { paused = false; lastT = null; },
  unmount() {
    alive++;
    cancelAnimationFrame(frame);
    stage?.dispose();
    api = stage = hud = objs = null;
  },
};
