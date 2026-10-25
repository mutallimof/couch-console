// Mirror Match: the TV shows a pose, everybody in front of the webcam copies it, and each person gets a score. Five rounds, then a
// leaderboard. Up to 4 people at once (body tracking by MediaPipe on this laptop; nothing is recorded or sent anywhere).
//   A = start / next · B = back to the menu. Stand back so the camera sees you from the hips up (all of you is even better).
import { party } from '../console/party.js';
import { confetti } from '../console/results.js';
import { createCameraKit } from './camera/camera-kit.js';
import { POSES, figureOf, scorePose, createPeopleTracker } from './camera/pose-math.js';
import { createLabeler, drawBody, tagSpot, leaderboardHtml, esc } from './camera/cg-shared.js';

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="11" r="4.5" fill="#fff"/><path d="M16 17v12M8 22l8-3 8 3M16 29l-5 12M16 29l5 12"/><circle cx="34" cy="11" r="4.5" fill="#fff" opacity=".55"/><path d="M34 17v12M26 20l8 2 8-2M34 29l-5 12M34 29l5 12" opacity=".55"/></svg>`;
const ROUNDS = 5, SHOW_S = 2.2, COUNT_S = 3, HOLD_S = 2.0, RECAP_S = 3.4;

let api, root, kit, people, labeler, raf = 0, alive = 0, el, st, lastBodies = [];
const lerp = (a, b, t) => a + (b - a) * t;

function reset() {
  st = { phase: 'lobby', round: 0, pose: null, poses: [], t0: 0, scores: new Map(), counted: 0 };
}
const row = (id) => st.scores.get(id) || (st.scores.set(id, { total: 0, round: 0, best: 0, buf: [], live: null }), st.scores.get(id));
const go = (phase, now) => { st.phase = phase; st.t0 = now; };

function startGame(now) {
  if (!lastBodies.length) { flashMsg('Step in front of the camera first: I cannot see anybody yet.'); return; }
  labeler.reset(); st.scores.clear();
  labeler.assign(lastBodies.map((p) => p.id)); // (left to right: the first phone is the left-most person)
  st.poses = [...POSES].sort(() => Math.random() - 0.5).slice(0, ROUNDS);
  st.round = 0;
  nextRound(now);
}
function nextRound(now) {
  st.pose = st.poses[st.round];
  for (const r of st.scores.values()) { r.round = 0; r.best = 0; r.buf = []; r.live = null; }
  drawFigure();
  go('show', now);
  api.sound.play('select');
}

function drawFigure() {
  const c = el.querySelector('.mm-figure'), x = c.getContext('2d'), W = c.width, H = c.height;
  x.clearRect(0, 0, W, H);
  if (!st.pose) return;
  const f = figureOf(st.pose), P = (p) => [p.x * W, p.y * (H / 1.3)];
  const limb = (pts, w, col) => { x.strokeStyle = col; x.lineWidth = w; x.lineCap = x.lineJoin = 'round'; x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(...P(p)) : x.moveTo(...P(p)))); x.stroke(); };
  for (const [w, col] of [[W * 0.085, '#1E3A6B'], [W * 0.058, '#FFB020']]) {
    limb([f.lW, f.lE, f.lS, f.rS, f.rE, f.rW], w, col);
    limb([f.neck, f.mid], w * 1.5, col);
    limb([f.lA, f.lK, f.lH, f.rH, f.rK, f.rA], w, col);
  }
  const [hx, hy] = P(f.head); x.fillStyle = '#FFE3C2'; x.strokeStyle = '#1E3A6B'; x.lineWidth = W * 0.02; x.beginPath(); x.arc(hx, hy, f.head.r * W * 1.1, 0, Math.PI * 2); x.fill(); x.stroke();
  x.fillStyle = '#1E3A6B'; x.beginPath(); x.arc(hx - W * 0.03, hy - W * 0.005, W * 0.012, 0, 7); x.arc(hx + W * 0.03, hy - W * 0.005, W * 0.012, 0, 7); x.fill();
  x.strokeStyle = '#1E3A6B'; x.lineWidth = W * 0.012; x.beginPath(); x.arc(hx, hy + W * 0.012, W * 0.03, 0.2, Math.PI - 0.2); x.stroke();
}

let msgTimer = 0;
function flashMsg(text) { const m = el.querySelector('.cg-flash'); m.textContent = text; m.hidden = !text; clearTimeout(msgTimer); msgTimer = setTimeout(() => { m.hidden = true; }, 2800); }

// ---------- one frame ----------
function frame(nowMs) {
  raf = requestAnimationFrame(frame);
  const now = nowMs / 1000, view = kit.drawMirror();
  if (!view) return;
  const { ctx, W, H } = view, aspect = kit.aspect();
  lastBodies = people.update(kit.bodies(nowMs), nowMs);
  // names for the people in the picture and the lines on their bodies
  const tags = new Map();
  for (const p of lastBodies) {
    const lab = labeler.of(p.id);
    drawBody(ctx, p.body, aspect, W, H, lab.color, st.phase === 'capture' ? 0.95 : 0.7);
    const spot = tagSpot(p.body, aspect);
    if (spot) tags.set(p.id, { spot, lab });
  }
  updateTags(tags);
  const t = now - st.t0;

  if (st.phase === 'show' && t > SHOW_S) go('count', now);
  else if (st.phase === 'count') {
    const n = COUNT_S - Math.floor(t);
    setCount(t >= COUNT_S ? '' : String(n));
    if (t >= COUNT_S) { go('capture', now); setCount('Hold it!'); api.sound.play('start'); }
  } else if (st.phase === 'capture') {
    for (const p of lastBodies) {
      const r = row(p.id), s = scorePose(p.body, st.pose);
      if (s === null) { r.live = null; continue; }
      r.buf.push(s); if (r.buf.length > 5) r.buf.shift();
      r.live = Math.round(r.buf.reduce((a, b) => a + b, 0) / r.buf.length);
      if (r.buf.length >= 3) r.best = Math.max(r.best, r.live);
    }
    if (t > HOLD_S) finishRound(now);
  } else if (st.phase === 'recap' && t > RECAP_S) {
    st.round += 1;
    if (st.round >= ROUNDS) finish(now); else nextRound(now);
  }
  renderHud();
}

function finishRound(now) {
  for (const r of st.scores.values()) { r.round = r.best; r.total += r.best; }
  go('recap', now); setCount('');
  api.sound.play('end');
}
function finish(now) {
  go('final', now);
  const rows = [...st.scores.entries()].map(([id, r]) => ({ id, ...labeler.of(id), total: r.total })).sort((a, b) => b.total - a.total);
  const win = rows[0];
  if (win?.playerId) api.reportWin?.(win.playerId);
  api.sound.play('end');
  const mine = alive; setTimeout(() => { if (mine === alive && el && st.phase === 'final') confetti(el); }, 400);
}

// ---------- drawing the HUD ----------
const tagEls = new Map();
function updateTags(tags) {
  const host = el.querySelector('.cg-tags');
  for (const [id, e] of tagEls) if (!tags.has(id)) { e.remove(); tagEls.delete(id); }
  for (const [id, { spot, lab }] of tags) {
    let e = tagEls.get(id);
    if (!e) { e = document.createElement('div'); e.className = 'cg-tag'; e.innerHTML = '<b></b><small></small>'; host.append(e); tagEls.set(id, e); }
    e.style.left = `${spot.x * 100}%`; e.style.top = `${spot.y * 100}%`; e.style.setProperty('--c', lab.color);
    e.firstChild.textContent = lab.name;
    const r = st.scores.get(id);
    e.lastChild.textContent = st.phase === 'capture' && r?.live != null ? `${r.live}%` : '';
  }
}
function setCount(text) { const c = el.querySelector('.cg-count'); if (c.textContent !== text) { c.textContent = text; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); if (/^\d$/.test(text)) api.sound.play('tick'); } }

let hudKey = '';
function renderHud() {
  const key = `${st.phase}|${st.round}|${[...st.scores.entries()].map(([k, r]) => `${k}:${r.total}:${r.round}`).join(',')}|${lastBodies.length}|${kit.tracking}`;
  const target = el.querySelector('.mm-target'), over = el.querySelector('.cg-over'), bar = el.querySelector('.cg-scorebar');
  target.hidden = !(st.pose && ['show', 'count', 'capture', 'recap'].includes(st.phase));
  if (key === hudKey && st.phase !== 'capture') return;
  hudKey = key;
  el.querySelector('.cg-round').textContent = st.phase === 'lobby' || st.phase === 'final' ? '' : `Round ${st.round + 1} / ${ROUNDS}`;
  el.querySelector('.mm-name').textContent = st.pose?.name || '';
  el.querySelector('.mm-hint').textContent = st.phase === 'show' ? 'Get ready to copy this!' : st.phase === 'count' ? 'Strike the pose…' : st.phase === 'capture' ? 'Hold it!' : st.phase === 'recap' ? 'Scores this round' : '';
  // the score chips along the bottom
  const rows = [...st.scores.entries()].map(([id, r]) => ({ lab: labeler.of(id), r })).sort((a, b) => a.lab.name.localeCompare(b.lab.name));
  bar.hidden = !rows.length || st.phase === 'lobby';
  bar.innerHTML = rows.map(({ lab, r }) => `<div class="cg-chip" style="--c:${lab.color}"><b>${esc(lab.name)}</b><span>${r.total}</span>${st.phase === 'recap' ? `<em>+${r.round}</em>` : ''}</div>`).join('');
  if (st.phase === 'lobby') {
    over.hidden = false;
    over.innerHTML = `<div class="cg-card"><h1>Mirror Match</h1><p>Copy the pose on the screen. The closer you match it, the more points you get. ${ROUNDS} rounds.</p>
      <p class="cg-seen">${lastBodies.length ? `I can see <b>${lastBodies.length}</b> ${lastBodies.length === 1 ? 'person' : 'people'}. ${lastBodies.length === 1 ? 'Wave!' : 'Hello!'}` : kit.tracking ? 'Step in front of the camera: I cannot see anybody yet.' : ''}</p>
      <div class="ui-cta"><button type="button" class="ui-btn primary" data-key="A">Start</button><button type="button" class="ui-btn ghost" data-key="B">‹ Back</button></div></div>`;
  } else if (st.phase === 'final') {
    const rows2 = [...st.scores.entries()].map(([id, r]) => ({ ...labeler.of(id), total: r.total })).sort((a, b) => b.total - a.total);
    over.hidden = false;
    over.innerHTML = `<div class="cg-card"><h1>${rows2[0] ? `${esc(rows2[0].name)} wins!` : 'Done!'}</h1>${leaderboardHtml(rows2, 'pts')}
      <div class="ui-cta"><button type="button" class="ui-btn primary" data-key="A">Play again</button><button type="button" class="ui-btn ghost" data-key="B">‹ Back</button></div></div>`;
  } else over.hidden = true;
}

function onButton({ button, state }) {
  if (state !== 'down') return;
  if (button === 'B') return api.exit();
  if (button === 'A') {
    if (st.phase === 'lobby') startGame(performance.now() / 1000);
    else if (st.phase === 'final') { reset(); hudKey = ''; people.reset(); }
  }
}

export default {
  id: 'mirror-match',
  title: 'Mirror Match',
  color: '#E64980',
  icon: ICON,
  minPlayers: 1,
  maxPlayers: 4,
  mount(container, gameApi) {
    api = gameApi;
    const token = ++alive;
    root = container;
    el = document.createElement('div');
    el.className = 'cg mm';
    el.innerHTML = `<div class="cg-top"><span class="cg-round"></span></div>
      <div class="cg-tags"></div><div class="cg-count"></div><p class="cg-flash" hidden></p>
      <aside class="mm-target" hidden><canvas class="mm-figure" width="320" height="416"></canvas><b class="mm-name"></b><small class="mm-hint"></small></aside>
      <div class="cg-scorebar" hidden></div><div class="cg-over" hidden></div>`;
    container.append(el);
    kit = createCameraKit({ root: el });
    for (const c of [...el.children]) if (c !== kit.stage) kit.stage.append(c); // (the labels, counts and cards sit on the picture, in its box)
    el.prepend(kit.stage);
    people = createPeopleTracker(); labeler = createLabeler(api, party);
    reset(); hudKey = '';
    api.onButton(onButton);
    api.actions([{ key: 'B', label: '‹ Back' }, { key: 'A', label: 'Start / next' }]);
    kit.start();
    raf = requestAnimationFrame(frame);
    void token;
  },
  unmount() {
    alive++; cancelAnimationFrame(raf); clearTimeout(msgTimer);
    kit?.destroy(); kit = null;
    tagEls.clear();
    el?.remove(); el = null;
  },
};
