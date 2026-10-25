// Bowling (1–2 players, taking turns). Top-down lane, 10 pins, simple circle physics.
//   Point left/right to aim · hold B and swing the phone to throw (power = speed, tilt = curve)
//   · or press A to throw at medium power. 10 frames, standard scoring. Rumble on a strike.
import { colorFor } from '../../shared/protocol.js';

const BEST_KEY = 'couch.bowling.best';
const BALL_MASS = 4;   // the ball is 4x heavier than a pin
const BOUNCE = 0.8;    // how bouncy collisions are
const PIN_FRICTION = 2.2;

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" fill="#fff">
  <circle cx="17" cy="30" r="11"/>
  <circle cx="14" cy="26" r="1.8" fill="#F2994A"/><circle cx="19" cy="25" r="1.8" fill="#F2994A"/><circle cx="17" cy="30" r="1.8" fill="#F2994A"/>
  <path d="M35 8c3 0 4 3 3 6-1 2-1 3 0 6 2 5 2 10 0 16-1 3-5 3-6 0-2-6-2-11 0-16 1-3 1-4 0-6-1-3 0-6 3-6z"/>
</svg>`;

let api, canvas, ctx, frame, resizeObserver, lastT, paused = false;
let W = 0, H = 0, scale = 1;
let lane;          // { x, y, w, h } on screen
let pins, ball;    // physics objects, in lane coordinates (0,0 = top-left of the lane)
let state;         // 'aim' | 'rolling' | 'result' | 'turn' | 'over'
let players;       // [{ playerId, color, frames: [[rolls...] x10] }]
let turn;          // { p: index into players, f: frame 0..9 }
let standingBefore, message, timer, overAt;
const bHeld = new Map(); // playerId -> B is held down

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const getBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } };
const setBest = (v) => { try { localStorage.setItem(BEST_KEY, String(v)); } catch { /* ignore */ } };

// ---------- Layout ----------

function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scale = Math.min(W, H) / 720;
  const w = Math.min(250 * scale, W * 0.28), h = H - 70 * scale;
  const old = lane;
  lane = { x: W * 0.25 - w / 2, y: 35 * scale, w, h };
  // The window changed size mid-game (e.g. F11): scale the pins and ball with the lane.
  if (old && pins) {
    const fx = w / old.w, fy = h / old.h;
    for (const p of pins) { p.x *= fx; p.y *= fx; p.sx *= fx; p.sy *= fx; }
    ball.x *= fx; ball.y *= fy;
  }
}

const ballR = () => lane.w * 0.1;
const pinR = () => lane.w * 0.06;

// The 10 pin spots: a triangle with the head pin nearest the bowler.
function pinSpots() {
  const gap = lane.w * 0.24, rowGap = gap * 0.866, head = 3 * rowGap + 34 * scale;
  const spots = [];
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i <= row; i++) spots.push({ x: lane.w / 2 + (i - row / 2) * gap, y: head - row * rowGap });
  }
  return spots;
}

function rackPins() {
  pins = pinSpots().map((s) => ({ ...s, sx: s.x, sy: s.y, vx: 0, vy: 0, down: false, gone: false }));
}

function standing() { return pins.filter((p) => !p.down).length; }

// ---------- Game flow ----------

function newGame() {
  const list = api.players;
  players = list.map((p) => ({ playerId: p.playerId, color: p.color, frames: Array.from({ length: 10 }, () => []) }));
  turn = { p: 0, f: 0 };
  rackPins();
  startAim();
}

const active = () => players[turn.p];

function startAim() {
  state = 'aim';
  ball = { x: lane.w / 2, y: lane.h - ballR() - 24 * scale, vx: 0, vy: 0, ax: 0, gutter: false };
  standingBefore = standing();
}

function throwBall(power, tilt) {
  if (state !== 'aim') return;
  state = 'rolling';
  timer = 0;
  ball.vy = -lane.h * (0.6 + 1.1 * power);     // faster with more power
  ball.ax = tilt * lane.w * 0.9;               // tilt the phone to curve the ball
  api.sound.play('roll');
}

// After a roll has settled: count pins, record the roll, decide what's next.
function finishRoll() {
  const knocked = standingBefore - standing();
  const rolls = active().frames[turn.f];
  rolls.push(knocked);
  const tenth = turn.f === 9;
  const first = rolls.length === 1;

  // Message for this roll
  const fresh = standingBefore === 10;
  if (knocked === 10 && fresh) {
    message = { text: 'STRIKE!', color: active().color };
    api.rumble(active().playerId, 300);
    api.sound.play('strike');
  } else if (standing() === 0) {
    message = { text: 'SPARE!', color: active().color };
    api.sound.play('golden');
  } else if (ball.gutter && knocked === 0) {
    message = { text: 'Gutter ball', color: '#5B6577' };
  } else {
    message = { text: knocked === 1 ? '1 pin' : `${knocked} pins`, color: '#2B3445' };
  }
  if (knocked > 0) api.sound.play('pins');

  // Is this player's frame over? (Frame 10 allows a bonus roll after a strike or spare.)
  let frameDone, rerack = false;
  if (!tenth) {
    frameDone = !first || knocked === 10;
  } else {
    const [r1, r2] = rolls;
    if (rolls.length === 1) { frameDone = false; rerack = r1 === 10; }
    else if (rolls.length === 2) {
      frameDone = r1 + r2 < 10;
      rerack = !frameDone && standing() === 0;
    } else frameDone = true;
  }
  state = 'result';
  timer = 0;
  pending = { frameDone, rerack };
}
let pending = null;

function afterResult() {
  const { frameDone, rerack } = pending;
  if (!frameDone) {
    if (rerack) rackPins();
    else pins.forEach((p) => { if (p.down) p.gone = true; }); // sweep the fallen pins
    return startAim();
  }
  // Next player's turn, or next frame, or game over.
  rackPins();
  if (turn.p < players.length - 1) turn.p++;
  else { turn.p = 0; turn.f++; }
  if (turn.f > 9) return endGame();
  if (players.length > 1) { state = 'turn'; timer = 0; api.sound.play('select'); }
  else startAim();
}

function endGame() {
  state = 'over';
  overAt = performance.now();
  api.sound.play('end');
  if (players.length === 1) {
    const total = totals(players[0].frames).at(-1) ?? 0;
    if (total > getBest()) setBest(total);
  }
}

// ---------- Scoring ----------

// Running totals for each finished frame (standard 10-pin scoring).
function totals(frames) {
  const rolls = frames.flat();
  const out = [];
  let i = 0, total = 0;
  for (let f = 0; f < 10 && i < rolls.length; f++) {
    if (rolls[i] === 10) {
      if (rolls[i + 2] === undefined) break;
      total += 10 + rolls[i + 1] + rolls[i + 2];
      i += 1;
    } else {
      if (rolls[i + 1] === undefined) break;
      const two = rolls[i] + rolls[i + 1];
      if (two === 10) {
        if (rolls[i + 2] === undefined) break;
        total += 10 + rolls[i + 2];
      } else total += two;
      i += 2;
    }
    out.push(total);
  }
  return out;
}

// The little marks in a frame box: X = strike, / = spare, - = zero.
function marks(rolls, tenth) {
  if (!tenth) {
    const [a, b] = rolls;
    if (a === 10) return ['', 'X'];
    return [a, b].filter((v) => v !== undefined)
      .map((v, i) => (i === 1 && a + v === 10 ? '/' : v === 0 ? '-' : String(v)));
  }
  // Frame 10: the pins are reset after a strike or a spare.
  const out = [];
  let left = 10;
  for (const r of rolls) {
    if (r === 10 && left === 10) out.push('X');
    else if (left < 10 && r === left) out.push('/');
    else out.push(r === 0 ? '-' : String(r));
    left -= r;
    if (left === 0) left = 10;
  }
  return out;
}

// ---------- Physics ----------

function collide(a, b, ra, rb, ma, mb) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy), min = ra + rb;
  if (dist >= min || dist === 0) return false;
  const nx = dx / dist, ny = dy / dist;
  // push apart
  const overlap = min - dist, total = ma + mb;
  a.x -= nx * overlap * (mb / total); a.y -= ny * overlap * (mb / total);
  b.x += nx * overlap * (ma / total); b.y += ny * overlap * (ma / total);
  // bounce along the line between the centers
  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rel > 0) return true;
  const j = (-(1 + BOUNCE) * rel) / (1 / ma + 1 / mb);
  a.vx -= (j / ma) * nx; a.vy -= (j / ma) * ny;
  b.vx += (j / mb) * nx; b.vy += (j / mb) * ny;
  return true;
}

function physicsStep(dt) {
  const br = ballR(), pr = pinR();
  // ball
  if (ball.y > -br * 3) {
    ball.vx += ball.ax * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    if (!ball.gutter && (ball.x < 0 || ball.x > lane.w)) {
      // Into the gutter: it rolls straight to the end and can't hit pins.
      ball.gutter = true;
      ball.x = ball.x < 0 ? -br * 0.75 : lane.w + br * 0.75;
      ball.vx = 0; ball.ax = 0;
    }
  }
  // pins
  const live = pins.filter((p) => !p.gone);
  for (const p of live) {
    const damp = Math.exp(-PIN_FRICTION * dt);
    p.vx *= damp; p.vy *= damp;
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
  if (!ball.gutter) for (const p of live) collide(ball, p, br, pr, BALL_MASS, 1);
  for (let i = 0; i < live.length; i++) {
    for (let k = i + 1; k < live.length; k++) collide(live[i], live[k], pr, pr, 1, 1);
  }
  // A pin is down once it's knocked off its spot or out of the lane.
  for (const p of live) {
    const moved = Math.hypot(p.x - p.sx, p.y - p.sy) > pr * 0.6;
    const out = p.x < -pr || p.x > lane.w + pr || p.y < -pr;
    if (moved || out) p.down = true;
    if (out) p.gone = true;
  }
}

function update(dt) {
  if (state === 'aim') {
    const p = api.pointer(active().playerId);
    // Point anywhere across the screen: left edge = left side of the lane.
    if (p) ball.x = clamp((p.x / W) * lane.w, ballR(), lane.w - ballR());
  } else if (state === 'rolling') {
    const steps = 8;
    for (let i = 0; i < steps; i++) physicsStep(dt / steps);
    // Done when the ball has left the lane and the pins have (nearly) stopped.
    if (ball.y < -ballR() * 2) timer += dt;
    const still = pins.every((p) => p.gone || Math.hypot(p.vx, p.vy) < 6 * scale);
    if ((timer > 0.4 && still) || timer > 2.5) finishRoll();
  } else if (state === 'result') {
    timer += dt;
    if (timer > 1.4) afterResult();
  } else if (state === 'turn') {
    timer += dt;
    if (timer > 1.3) startAim();
  }
}

// ---------- Drawing ----------

function text(str, x, y, size, color, align = 'center') {
  ctx.font = `900 ${size * scale}px Nunito, sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}

const isDark = () => document.documentElement.dataset.theme === 'dark'; // (the room and the scoreboard follow the Light / Dark theme)

function drawLane() {
  const { x, y, w, h } = lane, gw = ballR() * 1.5;
  // gutters
  ctx.fillStyle = isDark() ? '#2E3446' : '#C9D2DE';
  ctx.beginPath(); ctx.roundRect(x - gw, y, w + gw * 2, h, 10 * scale); ctx.fill();
  // wood
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, '#E7C38E'); g.addColorStop(0.5, '#F1D3A4'); g.addColorStop(1, '#E7C38E');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  // boards
  ctx.strokeStyle = 'rgba(150,100,40,0.12)'; ctx.lineWidth = 1;
  for (let i = 1; i < 12; i++) { ctx.beginPath(); ctx.moveTo(x + (w * i) / 12, y); ctx.lineTo(x + (w * i) / 12, y + h); ctx.stroke(); }
  // aiming arrows and foul line
  ctx.fillStyle = 'rgba(150,90,30,0.45)';
  for (let i = 1; i <= 5; i++) {
    const ax = x + (w * i) / 6, ay = y + h * 0.66 - Math.abs(3 - i) * 12 * scale;
    ctx.beginPath(); ctx.moveTo(ax, ay - 9 * scale); ctx.lineTo(ax - 5 * scale, ay + 6 * scale); ctx.lineTo(ax + 5 * scale, ay + 6 * scale); ctx.fill();
  }
  ctx.fillStyle = 'rgba(200,60,60,0.6)'; ctx.fillRect(x, y + h - 12 * scale, w, 3 * scale);
}

function drawPin(p) {
  const x = lane.x + p.x, y = lane.y + p.y, r = pinR();
  ctx.globalAlpha = p.down ? 0.45 : 1;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#E03131'; ctx.lineWidth = r * 0.3;
  ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawBall() {
  if (state === 'result' && ball.y < -ballR()) return;
  const x = lane.x + ball.x, y = lane.y + ball.y, r = ballR();
  ctx.fillStyle = active().color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (const [dx, dy] of [[-0.25, -0.3], [0.2, -0.32], [0, 0.05]]) {
    ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, r * 0.12, 0, Math.PI * 2); ctx.fill();
  }
  if (state === 'aim') {
    // aiming line
    ctx.strokeStyle = 'rgba(43,52,69,0.25)'; ctx.lineWidth = 3 * scale; ctx.setLineDash([10 * scale, 10 * scale]);
    ctx.beginPath(); ctx.moveTo(x, y - r - 6 * scale); ctx.lineTo(x, lane.y + 20 * scale); ctx.stroke(); ctx.setLineDash([]);
  }
}

function drawScoreboard() {
  const left = W * 0.47, right = W - 30 * scale;
  const label = 64 * scale, totalW = 76 * scale;
  const box = (right - left - label - totalW) / 10;
  const rowH = 76 * scale;
  let y = 60 * scale;
  text('Bowling', left, y - 20 * scale, 34, '#2B3445', 'left');
  y += 20 * scale;
  players.forEach((pl, pi) => {
    const sums = totals(pl.frames);
    const isTurn = pi === turn.p && state !== 'over';
    // player badge
    ctx.fillStyle = pl.color;
    ctx.beginPath(); ctx.roundRect(left, y, label - 10 * scale, rowH, 10 * scale); ctx.fill();
    text(`P${pl.playerId}`, left + (label - 10 * scale) / 2, y + rowH / 2, 24, '#fff');
    for (let f = 0; f < 10; f++) {
      const bx = left + label + f * box;
      const dk = isDark(); ctx.fillStyle = isTurn && f === turn.f ? (dk ? '#4A4020' : '#FFF6D6') : (dk ? '#1A1E28' : '#fff');
      ctx.fillRect(bx, y, box, rowH);
      ctx.strokeStyle = dk ? '#2F3547' : '#C9D2DE'; ctx.lineWidth = 1.5; ctx.strokeRect(bx, y, box, rowH);
      const slots = f === 9 ? [0.2, 0.5, 0.8] : [0.3, 0.72];
      marks(pl.frames[f], f === 9).forEach((mk, i) => text(mk, bx + box * slots[i], y + 18 * scale, 17, dk ? '#F1F3F9' : '#2B3445'));
      if (sums[f] !== undefined) text(String(sums[f]), bx + box / 2, y + rowH - 22 * scale, 22, dk ? '#F1F3F9' : '#2B3445');
    }
    const tx = left + label + 10 * box;
    ctx.fillStyle = isDark() ? '#232837' : '#EEF2F7'; ctx.fillRect(tx, y, totalW, rowH);
    ctx.strokeRect(tx, y, totalW, rowH);
    text(String(sums.at(-1) ?? 0), tx + totalW / 2, y + rowH / 2, 28, pl.color);
    y += rowH + 14 * scale;
  });
  // hints
  y += 20 * scale;
  if (state === 'aim' || state === 'rolling') {
    text(players.length > 1 ? `P${active().playerId}'s turn · Frame ${turn.f + 1}` : `Frame ${turn.f + 1}`, left, y, 30, active().color, 'left');
    text('Point left/right to aim', left, y + 46 * scale, 22, '#5B6577', 'left');
    text('Hold B and swing your phone to throw', left, y + 80 * scale, 22, '#5B6577', 'left');
    text('(tilt it to curve) · or press A for a medium throw', left, y + 112 * scale, 20, '#5F6B80', 'left');
  }
}

function draw() {
  ctx.fillStyle = isDark() ? '#101319' : '#F4F7FB'; ctx.fillRect(0, 0, W, H);
  drawLane();
  pins.filter((p) => !p.gone).forEach(drawPin);
  drawBall();
  drawScoreboard();

  if (state === 'result' && message) text(message.text, lane.x + lane.w / 2, H / 2, 54, message.color);
  if (state === 'turn') {
    const w = 460 * scale, h = 140 * scale;
    ctx.fillStyle = active().color;
    ctx.beginPath(); ctx.roundRect(W / 2 - w / 2, H / 2 - h / 2, w, h, 24 * scale); ctx.fill();
    text(`P${active().playerId}'s turn`, W / 2, H / 2, 54, '#fff');
  }
  if (state === 'over') drawOver();
}

function drawOver() {
  const sums = players.map((p) => totals(p.frames).at(-1) ?? 0);
  const best = Math.max(...sums);
  const winners = players.filter((_, i) => sums[i] === best);
  const solo = players.length === 1;
  const color = solo || winners.length > 1 ? '#5B6577' : winners[0].color;
  const w = 600 * scale, h = 300 * scale;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect(W / 2 - w / 2, H / 2 - h / 2, w, h, 24 * scale); ctx.fill();
  const title = solo ? 'Game over!' : winners.length > 1 ? 'It\'s a tie!' : `P${winners[0].playerId} wins!`;
  text(title, W / 2, H / 2 - 85 * scale, 54, '#fff');
  const line = solo ? `Score ${sums[0]}  ·  Best ${getBest()}` : players.map((p, i) => `P${p.playerId} ${sums[i]}`).join('   ·   ');
  text(line, W / 2, H / 2 - 10 * scale, 36, '#fff');
  text('A = play again   ·   B = menu', W / 2, H / 2 + 80 * scale, 28, '#fff');
}

function loop(t) {
  const dt = Math.min(0.05, (t - (lastT ?? t)) / 1000);
  lastT = t;
  if (!paused) update(dt);
  draw();
  frame = requestAnimationFrame(loop);
}

// ---------- Input ----------

function onButton({ playerId, button, state: s }) {
  if (button === 'B') bHeld.set(playerId, s === 'down');
  if (s !== 'down') return;
  if (state === 'over') {
    if (button === 'A' && performance.now() - overAt > 1500) { newGame(); api.sound.play('start'); }
    else if (button === 'B' && playerId === players[0].playerId) api.exit();
    return;
  }
  // Only the player whose turn it is can throw.
  if (state === 'aim' && button === 'A' && playerId === active().playerId) throwBall(0.5, 0);
}

function onSwing({ playerId, power, tilt }) {
  if (state === 'aim' && playerId === active().playerId && bHeld.get(playerId)) throwBall(power, tilt);
}

export default {
  id: 'bowling',
  title: 'Bowling',
  color: '#F2994A',
  icon: ICON,
  minPlayers: 1,
  maxPlayers: 2,
  modes: ['versus', 'solo'],
  mount(container, gameApi) {
    api = gameApi;
    canvas = document.createElement('canvas');
    canvas.className = 'game-canvas';
    container.append(canvas);
    ctx = canvas.getContext('2d');
    resizeObserver = new ResizeObserver(() => { resize(); });
    resizeObserver.observe(canvas);
    resize();
    bHeld.clear();
    newGame();
    lastT = null;
    api.onButton(onButton);
    api.onSwing(onSwing);
    frame = requestAnimationFrame(loop);
  },
  pause() { paused = true; },
  resume() { paused = false; lastT = null; },
  unmount() {
    paused = false;
    cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    canvas?.remove();
    api = canvas = ctx = resizeObserver = null;
  },
};
