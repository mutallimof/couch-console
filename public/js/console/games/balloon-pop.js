// Balloon Pop (solo): aim with the pointer, press A to pop balloons. 60-second rounds.
//   normal +1 · golden (rare, fast) +3 · spiky bomb −2 and a rumble

const ROUND_SECONDS = 60;
const BEST_KEY = 'couch.balloonPop.best';
const COLORS = ['#FF6B6B', '#4DABF7', '#51CF66', '#FFA94D', '#CC5DE8', '#22B8CF', '#F783AC'];

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true">
  <ellipse cx="24" cy="19" rx="12" ry="14" fill="#fff"/>
  <path d="M21 33h6l-3 3z" fill="#fff"/>
  <path d="M24 36c-3 4 3 6 0 10" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>
  <ellipse cx="19.5" cy="13" rx="3" ry="4.5" fill="rgba(0,0,0,0.12)"/>
</svg>`;

let api, canvas, ctx, frame, resizeObserver;
let W = 0, H = 0, scale = 1;
let state, balloons, particles, floaters, clouds, score, timeLeft, spawnIn, lastT, shake, lastTick, overAt;
let paused = false; // set by the console when a phone disconnects

const rand = (a, b) => a + Math.random() * (b - a);
const getBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } };
const setBest = (v) => { try { localStorage.setItem(BEST_KEY, String(v)); } catch { /* ignore */ } };

function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scale = Math.min(W, H) / 720;
}

function reset(newState) {
  state = newState;
  balloons = []; particles = []; floaters = [];
  score = 0; timeLeft = ROUND_SECONDS; spawnIn = 0.3; shake = 0; lastTick = null;
}

function spawn() {
  const roll = Math.random();
  const type = roll < 0.07 ? 'golden' : roll < 0.2 ? 'bomb' : 'normal';
  const r = (type === 'golden' ? rand(30, 36) : rand(38, 52)) * scale;
  const speed = rand(80, 160) * scale * (type === 'golden' ? 2 : 1)
    * (1 + 0.5 * (1 - timeLeft / ROUND_SECONDS)); // a bit faster as the round goes on
  balloons.push({
    type, r, x: rand(r + 20, W - r - 20), y: H + r * 1.5, vy: speed,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    phase: Math.random() * Math.PI * 2,
  });
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, s = rand(120, 420) * scale;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.4, 0.8), color, size: rand(3, 7) * scale });
  }
}

// A pressed: pop the top-most balloon under that player's cursor.
function tryPop(playerId) {
  const p = api.pointer(playerId);
  if (!p) return;
  for (let i = balloons.length - 1; i >= 0; i--) {
    const b = balloons[i];
    const dx = (p.x - b.x) / (b.r * 1.15), dy = (p.y - b.y) / (b.r * 1.3);
    if (dx * dx + dy * dy > 1) continue;
    balloons.splice(i, 1);
    if (b.type === 'bomb') {
      score -= 2;
      burst(b.x, b.y, '#333', 30); burst(b.x, b.y, '#FF922B', 20);
      floaters.push({ x: b.x, y: b.y, text: '−2', color: '#E03131', life: 1 });
      api.sound.play('bomb');
      api.rumble(playerId, 200);
      shake = 0.3;
    } else {
      const pts = b.type === 'golden' ? 3 : 1;
      score += pts;
      burst(b.x, b.y, b.type === 'golden' ? '#FFD43B' : b.color, b.type === 'golden' ? 34 : 18);
      floaters.push({ x: b.x, y: b.y, text: `+${pts}`, color: b.type === 'golden' ? '#E8A400' : '#2b3445', life: 1 });
      api.sound.play(b.type === 'golden' ? 'golden' : 'pop');
    }
    return;
  }
}

function update(dt) {
  if (state === 'playing') {
    timeLeft -= dt;
    // Tick for the last 5 seconds
    const sec = Math.ceil(timeLeft);
    if (sec <= 5 && sec > 0 && sec !== lastTick) { lastTick = sec; api.sound.play('tick'); }
    if (timeLeft <= 0) {
      timeLeft = 0;
      state = 'over';
      overAt = performance.now();
      api.sound.play('end');
      if (score > getBest()) setBest(score);
    }
    spawnIn -= dt;
    if (spawnIn <= 0) { spawn(); spawnIn = rand(0.35, 0.75) * (1 - 0.35 * (1 - timeLeft / ROUND_SECONDS)); }
  }
  for (const b of balloons) { b.y -= b.vy * dt; b.phase += dt * 2; }
  balloons = balloons.filter((b) => b.y > -b.r * 3);
  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * scale * dt; p.life -= dt; }
  particles = particles.filter((p) => p.life > 0);
  for (const f of floaters) { f.y -= 60 * scale * dt; f.life -= dt; }
  floaters = floaters.filter((f) => f.life > 0);
  for (const c of clouds) { c.x += c.v * dt; if (c.x > 1.2) c.x = -0.2; }
  shake = Math.max(0, shake - dt);
}

// ---------- Drawing ----------

function drawBalloon(b) {
  const x = b.x + Math.sin(b.phase) * 6 * scale, y = b.y, r = b.r;
  // string
  ctx.strokeStyle = 'rgba(60,70,90,0.5)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, y + r * 1.25);
  ctx.quadraticCurveTo(x + 8 * scale, y + r * 1.7, x, y + r * 2.2); ctx.stroke();
  // body
  const fill = b.type === 'golden' ? '#FCC419' : b.type === 'bomb' ? '#3B3F4A' : b.color;
  ctx.fillStyle = fill;
  if (b.type === 'bomb') {
    // spiky outline
    ctx.beginPath();
    const spikes = 14;
    for (let i = 0; i <= spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const rr = i % 2 ? 1 : 1.18;
      ctx.lineTo(x + Math.cos(a) * r * rr, y + Math.sin(a) * r * 1.2 * rr);
    }
    ctx.fill();
  } else {
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 1.2, 0, 0, Math.PI * 2); ctx.fill();
  }
  // knot
  ctx.beginPath(); ctx.moveTo(x - 5 * scale, y + r * 1.28); ctx.lineTo(x + 5 * scale, y + r * 1.28); ctx.lineTo(x, y + r * 1.15); ctx.fill();
  // shine
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.45, r * 0.18, r * 0.3, -0.4, 0, Math.PI * 2); ctx.fill();
  if (b.type === 'bomb') {
    ctx.fillStyle = '#FF6B6B'; ctx.font = `900 ${r * 0.8}px Nunito, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', x, y + 2);
  }
  if (b.type === 'golden') {
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.12, r * 1.32, 0, 0, Math.PI * 2); ctx.stroke();
  }
}

function text(str, x, y, size, color, align = 'center') {
  ctx.font = `900 ${size * scale}px Nunito, sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}

function panel(lines) {
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  const w = 560 * scale, h = 340 * scale;
  ctx.beginPath(); ctx.roundRect(W / 2 - w / 2, H / 2 - h / 2, w, h, 24 * scale); ctx.fill();
  lines.forEach(([str, size, color], i) => text(str, W / 2, H / 2 - h / 2 + 70 * scale + i * 62 * scale, size, color));
}

function draw() {
  ctx.save();
  if (shake > 0) ctx.translate(rand(-8, 8) * shake * 3, rand(-8, 8) * shake * 3);
  // sky
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#BDE0FE'); g.addColorStop(1, '#F1F8FF');
  ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, H + 40);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (const c of clouds) {
    const cx = c.x * W, cy = c.y * H, s = c.s * scale;
    ctx.beginPath();
    ctx.arc(cx, cy, 40 * s, 0, 7); ctx.arc(cx + 45 * s, cy + 8 * s, 32 * s, 0, 7); ctx.arc(cx - 45 * s, cy + 10 * s, 28 * s, 0, 7);
    ctx.fill();
  }
  balloons.forEach(drawBalloon);
  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const f of floaters) { ctx.globalAlpha = Math.min(1, f.life * 1.5); text(f.text, f.x, f.y, 40, f.color); }
  ctx.globalAlpha = 1;
  ctx.restore();

  // HUD
  if (state !== 'ready') {
    text(`Score ${score}`, 32 * scale, 44 * scale, 40, '#2b3445', 'left');
    text(`${Math.ceil(timeLeft)}`, W - 32 * scale, 44 * scale, 48, timeLeft <= 10 ? '#E03131' : '#2b3445', 'right');
  }
  if (state === 'ready') {
    panel([['Balloon Pop', 52, '#2b3445'], ['Point and press A to pop!', 26, '#5c677a'],
      ['Golden +3 · Spiky −2', 24, '#8a94a6'], ['A = start   ·   B = menu', 28, '#2F80ED']]);
  } else if (state === 'over') {
    const best = getBest();
    panel([['Time\'s up!', 52, '#2b3445'], [`Score: ${score}`, 40, '#2b3445'],
      [`Best: ${best}${score >= best && score > 0 ? '  ★ New best!' : ''}`, 28, '#E8A400'],
      ['A = play again   ·   B = menu', 28, '#2F80ED']]);
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
  if (state === 'playing') {
    if (button === 'A') tryPop(playerId);
  } else if (button === 'A') {
    // Ignore A right after time's up, so frantic popping doesn't restart the round.
    if (state === 'over' && performance.now() - overAt < 1500) return;
    reset('playing');
    api.sound.play('start');
  } else if (button === 'B') {
    api.exit();
  }
}

export default {
  id: 'balloon-pop',
  title: 'Balloon Pop',
  color: '#FF6B6B',
  icon: ICON,
  minPlayers: 1,
  maxPlayers: 1,
  mount(container, gameApi) {
    api = gameApi;
    canvas = document.createElement('canvas');
    canvas.className = 'game-canvas';
    container.append(canvas);
    ctx = canvas.getContext('2d');
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();
    clouds = Array.from({ length: 5 }, () => ({ x: Math.random(), y: rand(0.08, 0.6), s: rand(0.7, 1.4), v: rand(0.005, 0.02) }));
    reset('ready');
    lastT = null;
    api.onButton(onButton);
    frame = requestAnimationFrame(loop);
  },
  pause() { paused = true; },
  resume() { paused = false; },
  unmount() {
    paused = false;
    cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    canvas?.remove();
    api = canvas = ctx = resizeObserver = null;
  },
};
