// Target Range (3D shooting gallery). Aim with the pointer (a crosshair), press A to shoot.
//   Bullseye targets pop up: center 3 · middle 2 · edge 1. Gold movers +5. Red "X" signs −5 (don't shoot!).
// Modes: versus (same targets, whoever hits first scores) · co-op (team goal) · solo (beat your best)
import { colorFor } from '../shared/protocol.js';
import { createStage } from './three-stage.js';

const ROUND = 45;          // seconds
const COOP_GOAL = 120;
const BEST_KEY = 'couch.targetRange.best';
const ROWS = [{ z: -7, cols: 5, y: 0.9 }, { z: -11.5, cols: 6, y: 1.4 }, { z: -16, cols: 7, y: 1.9 }];
const FACE_R = 0.8; // target radius (meters)
const COOLDOWN = 0.18;     // seconds between shots per player

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" fill="none" stroke="#fff" stroke-width="4">
  <circle cx="24" cy="24" r="16"/><circle cx="24" cy="24" r="8"/><circle cx="24" cy="24" r="2" fill="#fff"/>
  <path d="M24 2v8M24 38v8M2 24h8M38 24h8"/>
</svg>`;

let api, stage, frame, lastT, alive = 0, paused = false;
let targets, raycaster, state, timeLeft, spawnIn, moverIn, scores, team, overAt, hud, pops, lastShot, ndc, lastTick;

const rand = (a, b) => a + Math.random() * (b - a);
const getBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } };
const setBest = (v) => { try { localStorage.setItem(BEST_KEY, String(v)); } catch { /* ignore */ } };

// ---------- Scene ----------

function faceTexture(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const ring = (r, color) => { g.fillStyle = color; g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.fill(); };
  if (kind === 'bomb') {
    ring(124, '#fff'); ring(112, '#E03131');
    g.strokeStyle = '#fff'; g.lineWidth = 30; g.lineCap = 'round';
    g.beginPath(); g.moveTo(75, 75); g.lineTo(181, 181); g.moveTo(181, 75); g.lineTo(75, 181); g.stroke();
  } else if (kind === 'gold') {
    ring(124, '#fff'); ring(112, '#F2C94C'); ring(74, '#fff'); ring(62, '#F2994A'); ring(28, '#fff');
  } else {
    // three scoring zones: outer (1), middle (2), center (3)
    ring(124, '#fff'); ring(116, '#2F80ED'); ring(84, '#fff'); ring(76, '#E03131'); ring(40, '#fff'); ring(32, '#E03131');
  }
  const t = new stage.THREE.CanvasTexture(c);
  t.colorSpace = stage.THREE.SRGBColorSpace;
  return t;
}

function buildScene() {
  const { THREE, scene, camera } = stage;
  const mat = (color) => new THREE.MeshLambertMaterial({ color });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), mat('#86C56F'));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  // dirt lanes and a wooden counter in front of you
  const dirt = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), mat('#D9B98A'));
  dirt.rotation.x = -Math.PI / 2; dirt.position.set(0, 0.01, -11); dirt.receiveShadow = true; scene.add(dirt);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(6, 0.25, 0.6), mat('#9C6B3C'));
  counter.position.set(0, 0.45, -1.6); counter.castShadow = true; scene.add(counter);
  // a wooden backstop and side fences
  for (let i = -6; i <= 6; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.9, 4.5, 0.3), mat(i % 2 ? '#B07A45' : '#A06B3A'));
    plank.position.set(i * 2, 2.25, -21); plank.castShadow = true; plank.receiveShadow = true; scene.add(plank);
  }
  for (const x of [-11, 11]) {
    const fence = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 20), mat('#B07A45'));
    fence.position.set(x, 0.6, -11); fence.castShadow = true; scene.add(fence);
  }
  // hay bales in front of each row (targets pop up from behind them)
  for (const row of ROWS) {
    const bale = new THREE.Mesh(new THREE.BoxGeometry(20, row.y * 0.55, 0.8), mat('#E5C46B'));
    bale.position.set(0, row.y * 0.275, row.z + 0.6); bale.castShadow = true; bale.receiveShadow = true; scene.add(bale);
  }
  // hills and a few trees behind the range
  for (let i = 0; i < 9; i++) {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(rand(12, 22), 16, 10), mat(i % 2 ? '#7DBD66' : '#94CC7C'));
    hill.position.set(-48 + i * 12, -6, rand(-60, -45)); hill.scale.y = 0.6; scene.add(hill);
  }
  for (let i = 0; i < 16; i++) {
    const x = (i % 2 ? 1 : -1) * rand(14, 30), z = rand(-40, -4);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 2, 6), mat('#8B5E3C'));
    trunk.position.set(x, 1, z);
    const top = new THREE.Mesh(new THREE.SphereGeometry(rand(1.4, 2.2), 10, 8), mat('#3E9B56'));
    top.position.set(x, 2.8, z); top.castShadow = true;
    scene.add(trunk, top);
  }
  stage.sun.position.set(-6, 14, 6);
  Object.assign(stage.sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, far: 60 });
  camera.position.set(0, 1.6, 0);
  camera.lookAt(0, 1.5, -11);

  // One target per spot in each row. It pops up (rotates upright) when active.
  const tex = { normal: faceTexture('normal'), gold: faceTexture('gold'), bomb: faceTexture('bomb') };
  targets = [];
  ROWS.forEach((row, ri) => {
    for (let c = 0; c < row.cols; c++) {
      const x = (c - (row.cols - 1) / 2) * (16 / row.cols);
      const pivot = new THREE.Group();
      pivot.position.set(x, row.y * 0.55, row.z);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), mat('#6B4A2B'));
      post.position.y = 0.45; post.castShadow = true;
      const faceMat = new THREE.MeshLambertMaterial({ map: tex.normal });
      const face = new THREE.Mesh(new THREE.CylinderGeometry(FACE_R, FACE_R, 0.08, 32), [mat('#EEE'), faceMat, faceMat]);
      face.rotation.x = Math.PI / 2; face.position.y = 1.35; face.castShadow = true;
      pivot.add(post, face);
      scene.add(pivot);
      // base = height when fully up; hidden targets sink below the ground behind the hay
      targets.push({ pivot, face, faceMat, row: ri, x, base: row.y * 0.55 - 0.3, kind: 'normal', up: 0, active: false, life: 0, speed: 0, hit: false });
    }
  });
  return tex;
}

let tex;

// ---------- Game ----------

function newRound() {
  state = 'ready';
  timeLeft = ROUND;
  spawnIn = 0.4; moverIn = 4;
  team = 0;
  scores = new Map(api.players.map((p) => [p.playerId, 0]));
  lastShot = new Map();
  overAt = null; lastTick = null;
  targets.forEach((t) => { t.active = false; t.up = 0; t.hit = false; });
}

function popUp(t, kind, life, speed = 0) {
  t.kind = kind;
  t.faceMat.map = tex[kind];
  t.faceMat.needsUpdate = true;
  t.face.scale.setScalar(kind === 'gold' ? 0.7 : 1);
  t.active = true; t.hit = false; t.life = life; t.speed = speed;
  t.pivot.position.x = t.x;
}

function spawn() {
  const free = targets.filter((t) => !t.active && t.up < 0.05);
  if (!free.length) return;
  const t = free[Math.floor(Math.random() * free.length)];
  const hurry = 1 - timeLeft / ROUND; // targets stay up for less time as the round goes on
  popUp(t, Math.random() < 0.18 ? 'bomb' : 'normal', rand(1.6, 2.8) * (1 - 0.35 * hurry));
}

function spawnMover() {
  // A gold target slides across the back row
  const back = targets.filter((t) => t.row === 2 && !t.active && t.up < 0.05);
  if (!back.length) return;
  const t = back[0];
  popUp(t, 'gold', 4, (Math.random() < 0.5 ? -1 : 1) * rand(3, 5));
  t.pivot.position.x = -Math.sign(t.speed) * 8;
}

function addScore(playerId, pts) {
  if (api.mode === 'versus') scores.set(playerId, (scores.get(playerId) || 0) + pts);
  else team += pts;
}

function shoot(playerId) {
  const p = api.pointer(playerId);
  const now = performance.now() / 1000;
  if (!p || now - (lastShot.get(playerId) || 0) < COOLDOWN) return;
  lastShot.set(playerId, now);
  api.sound.play('shot');
  api.rumble(playerId, 25);
  // Ray from the camera through the crosshair
  const r = stage.root.getBoundingClientRect();
  ndc.set(((p.x - r.left) / r.width) * 2 - 1, -((p.y - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, stage.camera);
  const faces = targets.filter((t) => t.active && !t.hit && t.up > 0.6).map((t) => t.face);
  const hit = raycaster.intersectObjects(faces, false)[0];
  if (!hit) return;
  const t = targets.find((x) => x.face === hit.object);
  t.hit = true; t.active = false;
  // How far from the center did we hit? (0 = bullseye, 1 = edge)
  const local = t.face.worldToLocal(hit.point.clone());
  const d = Math.hypot(local.x, local.z) / FACE_R;
  let pts, color = colorFor(playerId);
  if (t.kind === 'bomb') { pts = -5; color = '#E03131'; api.rumble(playerId, 250); api.sound.play('bomb'); }
  else if (t.kind === 'gold') { pts = 5; api.sound.play('golden'); }
  else { pts = d < 0.32 ? 3 : d < 0.68 ? 2 : 1; api.sound.play(pts === 3 ? 'clink' : 'pop'); }
  addScore(playerId, pts);
  popText(p.x - r.left, p.y - r.top, `${pts > 0 ? '+' : ''}${pts}${pts === 3 ? ' Bullseye!' : ''}`, color);
  if (api.mode === 'coop' && team >= COOP_GOAL) endRound();
}

function popText(x, y, text, color) {
  const el = document.createElement('div');
  el.className = 'range-pop';
  el.textContent = text;
  el.style.left = `${x}px`; el.style.top = `${y}px`; el.style.color = color;
  pops.append(el);
  setTimeout(() => el.remove(), 900);
}

function endRound() {
  state = 'over';
  overAt = performance.now();
  api.sound.play('end');
  if (api.mode === 'solo' && team > getBest()) setBest(team);
  targets.forEach((t) => { t.active = false; });
}

function update(dt) {
  if (state === 'playing') {
    timeLeft -= dt;
    const sec = Math.ceil(timeLeft);
    if (sec <= 5 && sec > 0 && sec !== lastTick) { lastTick = sec; api.sound.play('tick'); }
    if (timeLeft <= 0) { timeLeft = 0; endRound(); }
    spawnIn -= dt; moverIn -= dt;
    const crowd = api.players.length > 1 && api.mode !== 'solo' ? 0.7 : 1;
    if (spawnIn <= 0) { spawn(); spawnIn = rand(0.45, 0.9) * crowd; }
    if (moverIn <= 0) { spawnMover(); moverIn = rand(4, 7); }
  }
  for (const t of targets) {
    if (t.active) {
      t.life -= dt;
      if (t.speed) {
        t.pivot.position.x += t.speed * dt;
        if (Math.abs(t.pivot.position.x) > 8.5) t.active = false;
      }
      if (t.life <= 0) t.active = false;
    }
    // rise up / sink down (a hit target also tips backwards as it falls)
    const want = t.active ? 1 : 0;
    t.up += (want - t.up) * Math.min(1, dt * (t.hit ? 5 : 9));
    t.pivot.position.y = t.base - (1 - t.up) * 2.6;
    t.pivot.rotation.x = t.hit ? -(1 - t.up) * 1.4 : 0;
  }
}

function renderHud() {
  const name = (id) => `P${id}`;
  let html = '';
  if (api.mode === 'versus') {
    html += `<div class="score">${[...scores].map(([id, s]) => `<span style="--c:${colorFor(id)}">${name(id)} ${s}</span>`).join(`<small>${Math.ceil(timeLeft)}s</small>`)}</div>`;
  } else {
    const goal = api.mode === 'coop' ? ` / ${COOP_GOAL}` : '';
    html += `<div class="score"><span style="--c:#2B3445">${api.mode === 'coop' ? 'Team' : 'Score'} ${team}${goal}</span><small>${Math.ceil(timeLeft)}s</small></div>`;
  }
  if (state === 'ready') {
    const goal = { versus: 'Hit the most targets!', coop: `Team goal: ${COOP_GOAL} points`, solo: `Best: ${getBest()}` }[api.mode];
    html += `<div class="panel" style="--c:#9C6B3C"><h1>Target Range</h1><p>Aim and press A to shoot</p>
      <p>Center 3 · Middle 2 · Edge 1</p><p>Gold movers +5 · Red X −5</p><p>${goal}</p><p>A = start · B = menu</p></div>`;
  } else if (state === 'over') {
    let title, c = '#5B6577', line;
    if (api.mode === 'versus') {
      // Highest score wins; a shared top score is a tie
      const ranked = [...scores].sort((x, y) => y[1] - x[1]);
      const w = ranked.length > 1 && ranked[0][1] === ranked[1][1] ? null : ranked[0]?.[0];
      title = w ? `${name(w)} wins!` : 'It\'s a tie!';
      if (w) c = colorFor(w);
      line = [...scores].map(([id, s]) => `${name(id)} ${s}`).join(' · ');
    } else if (api.mode === 'coop') {
      title = team >= COOP_GOAL ? 'Team goal reached!' : 'So close!';
      if (team >= COOP_GOAL) c = '#27AE60';
      line = `Team ${team} / ${COOP_GOAL}`;
    } else {
      title = 'Time\'s up!'; line = `Score ${team} · Best ${getBest()}`;
    }
    html += `<div class="panel" style="--c:${c}"><h1>${title}</h1><p>${line}</p><p>A = play again · B = menu</p></div>`;
  }
  if (hud.innerHTML !== html) hud.innerHTML = html;
}

function loop(t) {
  const dt = Math.min(0.05, (t - (lastT ?? t)) / 1000);
  lastT = t;
  if (!paused) update(dt);
  stage.render();
  renderHud();
  frame = requestAnimationFrame(loop);
}

function onButton({ playerId, button, state: s }) {
  if (s !== 'down') return;
  const isP1 = playerId === api.players[0]?.playerId;
  if (state === 'playing') {
    if (button === 'A') shoot(playerId);
  } else if (button === 'A' && (state === 'ready' || performance.now() - overAt > 1500)) {
    newRound(); state = 'playing'; api.sound.play('start');
  } else if (button === 'B' && isP1) {
    api.exit();
  }
}

async function init(token, container) {
  stage = await createStage(container, { sky: '#A8DAFF', fog: [40, 90], fov: 55, isAlive: () => token === alive });
  if (!stage) return;
  tex = buildScene();
  raycaster = new stage.THREE.Raycaster();
  ndc = new stage.THREE.Vector2();
  hud = document.createElement('div');
  hud.className = 'hud3d';
  pops = document.createElement('div');
  pops.className = 'hud3d';
  stage.root.append(hud, pops);
  newRound();
  api.setCursor('crosshair');
  api.onButton(onButton);
  lastT = null;
  frame = requestAnimationFrame(loop);
}

export default {
  id: 'target-range',
  title: 'Target Range',
  color: '#9C6B3C',
  icon: ICON,
  minPlayers: 1,
  maxPlayers: 4,
  modes: ['versus', 'coop', 'solo'],
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
    api = stage = hud = pops = targets = null;
  },
};
