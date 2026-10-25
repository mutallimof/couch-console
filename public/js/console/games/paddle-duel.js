// Paddle Duel: Pong-style. P1 = left paddle, P2 = right paddle (or the computer in Solo).
// Your paddle follows your pointer's height. A serves. The ball speeds up 5% per hit.
// First to 7 wins. Rumble on a hit and when you lose a point.
import { colorFor } from '../../shared/protocol.js';

const WIN_SCORE = 7;
const SPEEDUP = 1.05;
const MAX_SPEED_FACTOR = 2.6; // the ball never gets faster than 2.6x its serve speed
const CPU_COLOR = '#5B6577';

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" fill="#fff">
  <rect x="6" y="12" width="6" height="22" rx="3"/><rect x="36" y="16" width="6" height="22" rx="3"/>
  <circle cx="25" cy="22" r="4"/>
  <path d="M24 4v6M24 16v4M24 28v4M24 38v6" stroke="#fff" stroke-width="2" opacity="0.6"/>
</svg>`;

let api, canvas, ctx, frame, resizeObserver, lastT;
let W = 0, H = 0, scale = 1;
let state, sides, ball, server, winner, overAt, paused = false;
let cpuError = 0; // px; how far off the CPU aims this rally
// sides: [left, right], each { playerId (null = CPU), y, score, color }

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const paddleH = () => H * 0.2;
const paddleW = () => 18 * scale;
const paddleX = (i) => (i === 0 ? 40 * scale : W - 40 * scale - paddleW());
const ballR = () => 12 * scale;
const baseSpeed = () => W * 0.5; // px per second at the start of each rally

function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scale = Math.min(W, H) / 720;
}

function newMatch() {
  const ids = api.players.map((p) => p.playerId);
  const right = api.mode === 'solo' ? null : (ids[1] ?? null);
  sides = [
    { playerId: ids[0], y: H / 2, score: 0, color: colorFor(ids[0]) },
    { playerId: right, y: H / 2, score: 0, color: right ? colorFor(right) : CPU_COLOR },
  ];
  winner = null;
  server = 0;
  readyServe();
}

function readyServe() {
  state = 'serve';
  ball = { x: 0, y: 0, vx: 0, vy: 0, speed: baseSpeed() };
}

function serve() {
  const dir = server === 0 ? 1 : -1;
  const angle = (Math.random() * 0.6 - 0.3);
  ball.speed = baseSpeed();
  ball.vx = Math.cos(angle) * ball.speed * dir;
  ball.vy = Math.sin(angle) * ball.speed;
  state = 'play';
  api.sound.play('hit');
}

function rumble(side, ms) {
  if (sides[side].playerId) api.rumble(sides[side].playerId, ms);
}

function scorePoint(scorer) {
  const loser = 1 - scorer;
  sides[scorer].score++;
  rumble(loser, 300);
  api.sound.play('point');
  if (sides[scorer].score >= WIN_SCORE) {
    winner = scorer;
    state = 'over';
    overAt = performance.now();
    api.sound.play('end');
    return;
  }
  server = loser; // whoever lost the point serves next
  readyServe();
}

function movePaddles(dt) {
  sides.forEach((s, i) => {
    if (s.playerId) {
      const p = api.pointer(s.playerId);
      if (p) s.y = p.y;
    } else {
      // CPU: chase the ball when it's coming, drift to the middle otherwise. Limited speed.
      // It aims a little off (cpuError, re-rolled on every hit) so it can miss.
      const coming = (i === 1 && ball.vx > 0) || (i === 0 && ball.vx < 0);
      const target = state === 'play' && coming ? ball.y + cpuError : H / 2;
      const maxMove = H * 0.55 * dt;
      s.y += clamp(target - s.y, -maxMove, maxMove);
    }
    s.y = clamp(s.y, paddleH() / 2, H - paddleH() / 2);
  });
}

function stepBall(dt) {
  const r = ballR();
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  // top / bottom walls
  if (ball.y < r) { ball.y = r; ball.vy = Math.abs(ball.vy); api.sound.play('wall'); }
  if (ball.y > H - r) { ball.y = H - r; ball.vy = -Math.abs(ball.vy); api.sound.play('wall'); }
  // paddles
  for (const i of [0, 1]) {
    const px = paddleX(i), s = sides[i];
    const movingIn = i === 0 ? ball.vx < 0 : ball.vx > 0;
    const faceX = i === 0 ? px + paddleW() : px;
    const touching = i === 0 ? ball.x - r <= faceX && ball.x > px - r : ball.x + r >= faceX && ball.x < px + paddleW() + r;
    if (movingIn && touching && Math.abs(ball.y - s.y) <= paddleH() / 2 + r) {
      // Hit: bounce back, angle depends on where it hit the paddle, 5% faster.
      const offset = clamp((ball.y - s.y) / (paddleH() / 2), -1, 1);
      ball.speed = Math.min(ball.speed * SPEEDUP, baseSpeed() * MAX_SPEED_FACTOR);
      cpuError = (Math.random() * 2 - 1) * paddleH() * 0.7;
      const angle = offset * 0.9; // up to ~50°
      const dir = i === 0 ? 1 : -1;
      ball.vx = Math.cos(angle) * ball.speed * dir;
      ball.vy = Math.sin(angle) * ball.speed;
      ball.x = i === 0 ? faceX + r : faceX - r;
      rumble(i, 40);
      api.sound.play('hit');
    }
  }
  // out on the left or right
  if (ball.x < -r * 2) scorePoint(1);
  else if (ball.x > W + r * 2) scorePoint(0);
}

function update(dt) {
  movePaddles(dt);
  if (state === 'serve') {
    // The ball waits in front of the server's paddle.
    const s = sides[server];
    ball.x = server === 0 ? paddleX(0) + paddleW() + ballR() + 4 : paddleX(1) - ballR() - 4;
    ball.y = s.y;
    // The CPU serves by itself after a moment.
    if (!s.playerId) {
      ball.wait = (ball.wait || 0) + dt;
      if (ball.wait > 1) serve();
    }
  } else if (state === 'play') {
    // Small steps so a fast ball can't jump through a paddle.
    const steps = Math.ceil((ball.speed * dt) / (ballR() * 0.8));
    for (let i = 0; i < steps && state === 'play'; i++) stepBall(dt / steps);
  }
}

// ---------- Drawing ----------

function text(str, x, y, size, color, align = 'center') {
  ctx.font = `900 ${size * scale}px Nunito, sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}

const isDark = () => document.documentElement.dataset.theme === 'dark'; // (the table follows the Light / Dark theme)

function draw() {
  const dark = isDark();
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, dark ? '#1A1E28' : '#F4F7FB'); g.addColorStop(1, dark ? '#101319' : '#E3EAF4');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // center line
  ctx.strokeStyle = dark ? 'rgba(241,243,249,0.22)' : 'rgba(43,52,69,0.15)'; ctx.lineWidth = 6 * scale; ctx.setLineDash([18 * scale, 18 * scale]);
  ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke(); ctx.setLineDash([]);
  // scores
  sides.forEach((s, i) => text(String(s.score), W / 2 + (i === 0 ? -90 : 90) * scale, 70 * scale, 80, s.color));
  sides.forEach((s, i) => text(s.playerId ? `P${s.playerId}` : 'CPU', W / 2 + (i === 0 ? -90 : 90) * scale, 125 * scale, 22, s.color));
  // paddles
  sides.forEach((s, i) => {
    ctx.fillStyle = s.color;
    ctx.beginPath(); ctx.roundRect(paddleX(i), s.y - paddleH() / 2, paddleW(), paddleH(), paddleW() / 2); ctx.fill();
  });
  // ball
  ctx.fillStyle = dark ? '#F1F3F9' : '#2B3445';
  ctx.beginPath(); ctx.arc(ball.x, ball.y, ballR(), 0, Math.PI * 2); ctx.fill();

  if (state === 'serve' && sides[server].playerId) {
    text(`P${sides[server].playerId}: press A to serve`, W / 2, H - 50 * scale, 30, sides[server].color);
  }
  if (state === 'over') {
    const s = sides[winner];
    const w = 560 * scale, h = 280 * scale;
    ctx.fillStyle = s.color;
    ctx.beginPath(); ctx.roundRect(W / 2 - w / 2, H / 2 - h / 2, w, h, 24 * scale); ctx.fill();
    text(s.playerId ? `P${s.playerId} wins!` : 'CPU wins!', W / 2, H / 2 - 70 * scale, 56, '#fff');
    text(`${sides[0].score} – ${sides[1].score}`, W / 2, H / 2, 40, '#fff');
    text('A = rematch   ·   B = menu', W / 2, H / 2 + 75 * scale, 28, '#fff');
  }
}

function loop(t) {
  const dt = Math.min(0.05, (t - (lastT ?? t)) / 1000);
  lastT = t;
  if (!paused) update(dt);
  draw();
  frame = requestAnimationFrame(loop);
}

function onButton({ playerId, button, state: s }) {
  if (s !== 'down') return;
  const isP1 = playerId === sides[0].playerId;
  if (button === 'A') {
    if (state === 'serve' && playerId === sides[server].playerId) serve();
    else if (state === 'over' && performance.now() - overAt > 1500) { newMatch(); api.sound.play('start'); }
  } else if (button === 'B' && isP1 && state !== 'play') {
    api.exit();
  }
}

export default {
  id: 'paddle-duel',
  title: 'Paddle Duel',
  color: '#27AE60',
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
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();
    newMatch();
    lastT = null;
    api.onButton(onButton);
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
