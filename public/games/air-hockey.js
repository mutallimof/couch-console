// Air Hockey (3D). Your mallet follows your pointer on your half of the table.
// Knock the puck into the other goal. First to 7. Rumble on hits and when you concede.
// Modes: versus (P1 left, P2 right) · solo (vs the computer)
import { colorFor } from '../shared/protocol.js';
import { createStage } from './three-stage.js';
import { createMatch, HALF_L, HALF_W, GOAL_HALF, PUCK_R, MALLET_R, WIN } from './air-hockey-rules.js';

const TOP = 0.8; // table height (the rules are in 2D, on the table top)
const CPU_COLOR = '#5B6577';

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" fill="#fff">
  <rect x="6" y="10" width="36" height="28" rx="6" fill="none" stroke="#fff" stroke-width="3"/>
  <circle cx="16" cy="24" r="5"/><circle cx="30" cy="20" r="3"/><path d="M24 10v28" stroke="#fff" stroke-width="2"/>
</svg>`;

let api, stage, frame, lastT, alive = 0, paused = false;
let sides, match, overAt, msg, hud, objs, raycaster, ndc, plane, hitPoint, wallSoundAt = 0;

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

// ---------- Game (the rules live in air-hockey-rules.js) ----------

function newMatch() {
  overAt = null;
  msg = '';
  match.newMatch();
}

// Where on the table is this player pointing? (raycast onto the table surface)
function pointerTarget(side) {
  const p = api.pointer(sides[side].playerId);
  if (!p) return;
  const r = stage.root.getBoundingClientRect();
  ndc.set(((p.x - r.left) / r.width) * 2 - 1, -((p.y - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, stage.camera);
  if (raycaster.ray.intersectPlane(plane, hitPoint)) match.setTarget(side, hitPoint.x, hitPoint.z);
}

// Rule events -> sounds, rumble and messages
function onEvent(e) {
  const name = (side) => (sides[side].playerId ? `P${sides[side].playerId}` : 'CPU');
  if (e.type === 'hit') {
    api.sound.play('hit');
    if (sides[e.side].playerId) api.rumble(sides[e.side].playerId, 30);
  } else if (e.type === 'wall') {
    const now = performance.now();
    if (now - wallSoundAt > 60) { wallSoundAt = now; api.sound.play('wall'); }
  } else if (e.type === 'goal' || e.type === 'win') {
    api.sound.play('point');
    const conceded = sides[1 - e.scorer].playerId;
    if (conceded) api.rumble(conceded, 250);
    if (e.type === 'win') { overAt = performance.now(); api.sound.play('end'); msg = ''; } else msg = `Goal ${name(e.scorer)}!`;
  }
}

function update(dt) {
  sides.forEach((s, i) => { if (s.playerId) pointerTarget(i); });
  match.update(dt);
}

function sync() {
  objs.puckMesh.position.set(match.puck.x, TOP + 0.015, match.puck.z);
  match.sides.forEach((s, i) => objs.mallets[i].position.set(s.x, TOP, s.z));
}

function renderHud() {
  const [a, b] = sides, [ra, rb] = match.sides;
  const name = (s) => (s.playerId ? `P${s.playerId}` : 'CPU');
  let html = `<div class="score"><span style="--c:${a.color}">${name(a)} ${ra.score}</span><small>to ${WIN}</small><span style="--c:${b.color}">${rb.score} ${name(b)}</span></div>`;
  if (msg && match.state === 'goal') html += `<div class="msg">${msg}</div>`;
  if (match.state === 'over') {
    const w = sides[match.winner];
    html += `<div class="panel" style="--c:${w.color}"><h1>${name(w)} wins!</h1><p>${ra.score} – ${rb.score}</p><p>A = rematch · B = menu</p></div>`;
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
  if (st !== 'down' || match.state !== 'over') return;
  if (button === 'A' && performance.now() - overAt > 1500) { newMatch(); api.sound.play('start'); }
  else if (button === 'B' && playerId === sides[0].playerId) api.exit();
}

async function init(token, container) {
  const ids = api.players.map((p) => p.playerId);
  const right = api.mode === 'solo' ? null : (ids[1] ?? null);
  sides = [
    { playerId: ids[0], color: colorFor(ids[0]) },
    { playerId: right, color: right ? colorFor(right) : CPU_COLOR },
  ];
  match = createMatch({ players: sides, onEvent });
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
