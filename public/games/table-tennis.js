// Table Tennis (3D). Paddles move by themselves; you SWING the phone to hit (or press A).
//   Timing aims the shot (early = one way, late = the other), swing power = speed,
//   tilting the phone also pushes the ball left/right.
// Modes: versus (P1 near side, P2 far side, to 11 by 2) · co-op rally (keep it going together)
//        · solo (you vs the computer)
import { colorFor } from '../shared/protocol.js';
import { createStage } from './three-stage.js';

const TABLE_Y = 0.76, HALF_W = 0.7625, HALF_L = 1.37, NET_H = 0.1525, BALL_R = 0.025;
const PLANE = 1.55;   // where each player hits the ball (just behind their end of the table)
const G = -5;         // slowed-down gravity so rallies are playable
const WIN = 11;
const BEST_KEY = 'couch.tableTennis.bestRally';
const CPU_COLOR = '#5B6577';

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" fill="#fff">
  <circle cx="20" cy="20" r="12"/><rect x="27" y="27" width="6" height="15" rx="3" transform="rotate(-45 30 34)"/>
  <circle cx="37" cy="11" r="4"/>
</svg>`;

let api, stage, frame, lastT, alive = 0, paused = false;
let sides, ball, state, server, serves, msg, msgTimer, overAt, rally, best, hud, objs;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const getBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } };
const setBest = (v) => { try { localStorage.setItem(BEST_KEY, String(v)); } catch { /* ignore */ } };
const plane = (s) => sides[s].dir * PLANE; // sides[0] is the near side (dir +1)

// ---------- Scene ----------

function buildScene() {
  const { THREE, scene, camera } = stage;
  const mat = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });
  const box = (w, h, d, m, x, y, z) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true;
    scene.add(b); return b;
  };
  // Room: wooden floor, a soft back wall
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), mat('#C49A6C'));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const court = new THREE.Mesh(new THREE.PlaneGeometry(5, 8), mat('#3E7CB1'));
  court.rotation.x = -Math.PI / 2; court.position.y = 0.002; court.receiveShadow = true; scene.add(court);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 8), mat('#E6EEF7'));
  wall.position.set(0, 4, -7); scene.add(wall);
  box(30, 0.6, 0.1, mat('#2F80ED'), 0, 1.2, -6.95);
  // Table
  box(HALF_W * 2, 0.05, HALF_L * 2, mat('#1F5FAF'), 0, TABLE_Y - 0.025, 0);
  const white = mat('#FFFFFF');
  box(0.02, 0.052, HALF_L * 2, white, -HALF_W + 0.01, TABLE_Y - 0.024, 0);
  box(0.02, 0.052, HALF_L * 2, white, HALF_W - 0.01, TABLE_Y - 0.024, 0);
  box(HALF_W * 2, 0.052, 0.02, white, 0, TABLE_Y - 0.024, HALF_L - 0.01);
  box(HALF_W * 2, 0.052, 0.02, white, 0, TABLE_Y - 0.024, -HALF_L + 0.01);
  box(0.006, 0.052, HALF_L * 2, white, 0, TABLE_Y - 0.024, 0);
  for (const [x, z] of [[-0.65, -1.2], [0.65, -1.2], [-0.65, 1.2], [0.65, 1.2]]) box(0.06, TABLE_Y - 0.05, 0.06, mat('#2B3445'), x, (TABLE_Y - 0.05) / 2, z);
  // Net
  const net = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2 + 0.3, NET_H), new THREE.MeshLambertMaterial({ color: '#F4F7FB', transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
  net.position.set(0, TABLE_Y + NET_H / 2, 0); scene.add(net);
  box(HALF_W * 2 + 0.3, 0.015, 0.01, white, 0, TABLE_Y + NET_H, 0);
  // Paddles: a round blade in the player's color with a wooden handle
  const paddles = sides.map((s) => {
    const g = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.012, 24), mat(s.color));
    blade.rotation.x = Math.PI / 2; blade.castShadow = true;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.025), mat('#A0723E'));
    handle.position.y = -0.12; handle.castShadow = true;
    g.add(blade, handle);
    g.position.set(0, 1, plane(sides.indexOf(s)));
    scene.add(g);
    return g;
  });
  // A simple figure for the far player (the near player is "you", behind the camera)
  const far = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.6, 6, 12), mat(sides[1].color));
  body.position.y = 0.95; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), mat('#F2D0A9'));
  head.position.y = 1.62; head.castShadow = true;
  for (const x of [-0.12, 0.12]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.45, 4, 8), mat('#2B3445'));
    leg.position.set(x, 0.32, 0); leg.castShadow = true; far.add(leg);
  }
  far.add(body, head);
  far.position.set(0, 0, -PLANE - 0.9);
  far.scale.setScalar(0.85);
  scene.add(far);
  // Ball and its shadow
  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R * 1.3, 16, 12), new THREE.MeshLambertMaterial({ color: '#FFF8E7', emissive: '#332a18' }));
  ballMesh.castShadow = true; scene.add(ballMesh);
  // Camera: behind and above the near player
  camera.position.set(0, 1.95, 2.95);
  camera.lookAt(0, 0.7, -0.55);
  return { paddles, ballMesh, far };
}

// ---------- Rules & ball ----------

function newMatch() {
  sides.forEach((s) => { s.score = 0; });
  server = 0; serves = 0; rally = 0; overAt = null;
  readyServe();
}

function readyServe() {
  state = 'serve';
  const s = server;
  ball = { p: { x: (Math.random() - 0.5) * 0.4, y: 1.05, z: plane(s) - sides[s].dir * 0.05 }, v: { x: 0, y: 0, z: 0 },
    receiver: 1 - s, bounced: false, whiffed: false };
  sides.forEach((x) => { x.swing = 0; x.decided = false; });
  sides[s].waited = 0;
}

// Send the ball from where it is now to a landing spot on the receiver's half.
function hitBall(by, power, aimX) {
  const r = 1 - by, p = ball.p;
  const xt = clamp(aimX, -0.62, 0.62), yt = TABLE_Y + BALL_R;
  const zt = sides[r].dir * (0.3 + 0.8 * clamp(power, 0, 1));
  let T = 1.15 - 0.5 * power, v;
  // Make sure the arc clears the net: if not, take a slightly slower, higher shot.
  for (let i = 0; i < 25; i++) {
    v = { x: (xt - p.x) / T, y: (yt - p.y - 0.5 * G * T * T) / T, z: (zt - p.z) / T };
    const tn = -p.z / v.z, yn = p.y + v.y * tn + 0.5 * G * tn * tn;
    if (yn > TABLE_Y + NET_H + 0.05) break;
    T += 0.05;
  }
  ball.v = v; ball.receiver = r; ball.bounced = false; ball.whiffed = false;
  sides[by].swing = 1;
  rally++;
  api.sound.play('hit');
  if (sides[by].playerId) api.rumble(sides[by].playerId, 40);
}

// Seconds until the ball reaches the receiver's hitting spot (negative = already past it).
const timeToPlane = () => (plane(ball.receiver) - ball.p.z) / (ball.v.z || 1e-6);

function pointTo(winner, text) {
  const loser = 1 - winner;
  state = 'point';
  msgTimer = 0;
  if (api.mode === 'coop') {
    const r = Math.max(0, rally - 1);
    if (r > best) { best = r; setBest(r); }
    say(r > 0 ? `Rally of ${r}!` : text);
  } else {
    sides[winner].score++;
    say(text);
  }
  api.sound.play('point');
  if (sides[loser].playerId) api.rumble(sides[loser].playerId, 250);
}

function afterPoint() {
  const [a, b] = sides.map((s) => s.score);
  if (api.mode !== 'coop' && Math.max(a, b) >= WIN && Math.abs(a - b) >= 2) {
    state = 'over'; overAt = performance.now(); api.sound.play('end');
    return;
  }
  // The serve changes every 2 points
  serves++;
  if (serves % 2 === 0) server = 1 - server;
  rally = 0;
  readyServe();
}

function say(text) { msg = text; msgTimer = 0; }

// A swing (or A press) from the player on side s.
function trySwing(s, power, tilt) {
  const side = sides[s];
  side.swing = 1;
  if (state === 'serve' && s === server) {
    hitBall(s, Math.min(power, 0.5) * 0.6 + 0.15, (Math.random() - 0.5) * 0.8 + tilt * 0.4);
    state = 'rally';
    rally = 0;
    return;
  }
  if (state !== 'rally' || ball.receiver !== s || ball.whiffed) return;
  const t = timeToPlane();
  if (!ball.bounced && t > 0.6) return;            // ball still far away: ignore
  if (!ball.bounced || t > 0.35) { ball.whiffed = true; say('Too early!'); return; }
  if (t < -0.25) return;                            // too late; the miss is handled in update
  // Early = pull to one side, late = push to the other. Tilt adds to it.
  const aim = side.dir * (t - 0.05) * 2.4 + tilt * 0.55;
  if (Math.abs(t - 0.05) < 0.1) say('Perfect!');
  hitBall(s, power, aim);
}

function cpuThink(s, dt) {
  const side = sides[s];
  if (state === 'serve' && server === s) {
    side.waited += dt;
    if (side.waited > 1.1) trySwing(s, 0.3, 0);
    return;
  }
  if (state !== 'rally' || ball.receiver !== s || !ball.bounced) return;
  if (timeToPlane() > 0.03 || side.decided) return;
  side.decided = true;
  // Faster and wider balls are harder for the CPU
  const speed = Math.hypot(ball.v.x, ball.v.z);
  const missChance = 0.06 + clamp((speed - 2.2) * 0.12, 0, 0.35) + Math.abs(ball.p.x) * 0.15;
  if (Math.random() < missChance) { ball.whiffed = true; return; }
  hitBall(s, 0.25 + Math.random() * 0.5, (Math.random() - 0.5) * 1.2);
}

function update(dt) {
  msgTimer += dt;
  for (const s of [0, 1]) if (!sides[s].playerId) cpuThink(s, dt);
  if (state === 'rally') {
    const steps = 4;
    for (let i = 0; i < steps && state === 'rally'; i++) {
      const h = dt / steps, b = ball;
      b.v.y += G * h;
      b.p.x += b.v.x * h; b.p.y += b.v.y * h; b.p.z += b.v.z * h;
      // Bounce on the table
      if (b.p.y <= TABLE_Y + BALL_R && b.v.y < 0 && Math.abs(b.p.x) <= HALF_W && Math.abs(b.p.z) <= HALF_L) {
        b.p.y = TABLE_Y + BALL_R;
        b.v.y = -b.v.y * 0.8;
        if (Math.sign(b.p.z) === sides[b.receiver].dir) b.bounced = true;
        api.sound.play('wall');
      }
      if (b.p.y < BALL_R) { b.p.y = BALL_R; b.v.y = -b.v.y * 0.5; b.v.x *= 0.7; b.v.z *= 0.7; }
      // The receiver didn't return it
      if (timeToPlane() < -0.3) {
        const r = b.receiver, by = 1 - r;
        sides[r].decided = false;
        pointTo(by, !sides[r].playerId ? 'CPU missed!' : b.whiffed ? 'Missed!' : 'Too late!');
      }
    }
    if (ball.receiver !== undefined) sides[1 - ball.receiver].decided = false;
  } else if (state === 'serve') {
    ball.p.y = 1.05 + Math.abs(Math.sin(performance.now() / 300)) * 0.12; // little bounce in the hand
  } else if (state === 'point' && msgTimer > 1.4) {
    afterPoint();
  }
  sides.forEach((s) => { s.swing = Math.max(0, s.swing - dt * 4); });
}

// ---------- Drawing ----------

function syncScene() {
  objs.ballMesh.position.set(ball.p.x, ball.p.y, ball.p.z);
  sides.forEach((s, i) => {
    const g = objs.paddles[i];
    // Paddles drift toward where the ball will arrive
    let tx = 0, ty = 1.0;
    if (state === 'rally' && ball.receiver === i) {
      const t = Math.max(0, timeToPlane());
      tx = ball.p.x + ball.v.x * t;
      ty = clamp(ball.p.y + ball.v.y * t + 0.5 * G * t * t, 0.85, 1.4);
    } else if (state === 'serve' && server === i) { tx = ball.p.x + 0.12; ty = 0.95; }
    g.position.x += (tx - g.position.x) * 0.15;
    g.position.y += (ty - g.position.y) * 0.15;
    g.position.z = plane(i) + s.dir * 0.08;
    g.rotation.y = s.dir * -s.swing * 1.2;
    g.rotation.z = s.dir * 0.3;
  });
  // The far player's figure follows their paddle sideways
  objs.far.position.x += (objs.paddles[1].position.x - 0.45 - objs.far.position.x) * 0.1;
}

function renderHud() {
  const [a, b] = sides;
  const name = (s) => (s.playerId ? `P${s.playerId}` : 'CPU');
  let html;
  if (api.mode === 'coop') {
    html = `<div class="score" style="--c:#2F80ED">Rally <span>${state === 'rally' ? rally : 0}</span><small>Best ${best}</small></div>`;
  } else {
    html = `<div class="score"><span style="--c:${a.color}">${name(a)} ${a.score}</span><small>to ${WIN}</small><span style="--c:${b.color}">${b.score} ${name(b)}</span></div>`;
  }
  if (msg && msgTimer < 1.2) html += `<div class="msg">${msg}</div>`;
  if (state === 'serve' && sides[server].playerId) html += `<div class="hint">P${sides[server].playerId}: swing to serve (or press A)</div>`;
  else if (state === 'rally') html += '<div class="hint">Swing when the ball reaches you · early/late or tilt to aim</div>';
  if (state === 'over') {
    const w = a.score > b.score ? a : b;
    html += `<div class="panel" style="--c:${w.color}"><h1>${name(w)} wins!</h1><p>${a.score} – ${b.score}</p><p>A = rematch · B = menu</p></div>`;
  }
  if (hud.innerHTML !== html) hud.innerHTML = html;
}

function loop(t) {
  const dt = Math.min(0.05, (t - (lastT ?? t)) / 1000);
  lastT = t;
  if (!paused) update(dt);
  syncScene();
  stage.render();
  renderHud();
  frame = requestAnimationFrame(loop);
}

// ---------- Input ----------

const sideOf = (playerId) => sides.findIndex((s) => s.playerId === playerId);

function onSwing({ playerId, power, tilt }) {
  const s = sideOf(playerId);
  if (s >= 0 && !paused) trySwing(s, clamp(power, 0.1, 1), tilt || 0);
}

function onButton({ playerId, button, state: st }) {
  if (st !== 'down') return;
  if (state === 'over') {
    if (button === 'A' && performance.now() - overAt > 1500) { newMatch(); api.sound.play('start'); }
    else if (button === 'B' && playerId === sides[0].playerId) api.exit();
    return;
  }
  if (button === 'A') onSwing({ playerId, power: 0.45, tilt: 0 }); // for phones that can't detect swings
  else if (button === 'B' && playerId === sides[0].playerId && api.mode === 'coop' && state !== 'rally') api.exit();
}

async function init(token, container) {
  const ids = api.players.map((p) => p.playerId);
  const far = api.mode === 'solo' ? null : (ids[1] ?? null);
  sides = [
    { dir: 1, playerId: ids[0], color: colorFor(ids[0]), score: 0, swing: 0 },
    { dir: -1, playerId: far, color: far ? colorFor(far) : CPU_COLOR, score: 0, swing: 0 },
  ];
  best = getBest();
  stage = await createStage(container, { sky: '#E6EEF7', fov: 50, isAlive: () => token === alive });
  if (!stage) return;
  objs = buildScene();
  hud = document.createElement('div');
  hud.className = 'hud3d';
  stage.root.append(hud);
  newMatch();
  api.onSwing(onSwing);
  api.onButton(onButton);
  lastT = null;
  frame = requestAnimationFrame(loop);
}

export default {
  id: 'table-tennis',
  title: 'Table Tennis',
  color: '#EB5757',
  icon: ICON,
  minPlayers: 1,
  maxPlayers: 2,
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
    api = stage = hud = objs = null;
  },
};
