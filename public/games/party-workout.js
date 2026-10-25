// Party Workout: short rounds of squats, jumping jacks, arm circles and high knees. The webcam counts every person's moves, there is a
// timer and a leaderboard. Fun, not strict: it counts honest tries (body tracking by MediaPipe on this laptop; nothing is recorded).
//   A = start / next · B = back to the menu. Stand back so the camera sees you from the head to the knees (the feet help for jacks).
import { party } from '../console/party.js';
import { confetti } from '../console/results.js';
import { createCameraKit } from './camera/camera-kit.js';
import { EXERCISES, createPeopleTracker } from './camera/pose-math.js';
import { createLabeler, drawBody, tagSpot, leaderboardHtml, esc } from './camera/cg-shared.js';

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="10" r="4.5" fill="#fff"/><path d="M24 16v13M10 17l14 3 14-3M24 29l-8 12M24 29l8 12"/></svg>`;
const INTRO_S = 4.5, COUNT_S = 3, ROUND_S = 25, RECAP_S = 3.5;

let api, kit, people, labeler, raf = 0, alive = 0, el, st, lastBodies = [], msgTimer = 0;
const go = (phase, now) => { st.phase = phase; st.t0 = now; };
function reset() { st = { phase: 'lobby', round: 0, t0: 0, reps: new Map(), counters: new Map(), cursor: 0 }; }

function startGame(now) {
  if (!lastBodies.length) { flashMsg('Step in front of the camera first: I cannot see anybody yet.'); return; }
  labeler.reset(); st.reps.clear();
  labeler.assign(lastBodies.map((p) => p.id));
  for (const p of lastBodies) st.reps.set(p.id, EXERCISES.map(() => 0));
  st.round = 0;
  intro(now);
}
function intro(now) { st.counters.clear(); go('intro', now); api.sound.play('select'); }
function flashMsg(text) { const m = el.querySelector('.cg-flash'); m.textContent = text; m.hidden = !text; clearTimeout(msgTimer); msgTimer = setTimeout(() => { m.hidden = true; }, 2800); }

function frame(nowMs) {
  raf = requestAnimationFrame(frame);
  const now = nowMs / 1000, view = kit.drawMirror();
  if (!view) return;
  const { ctx, W, H } = view, aspect = kit.aspect();
  lastBodies = people.update(kit.bodies(nowMs), nowMs);
  const ex = EXERCISES[st.round], t = now - st.t0, tags = new Map();
  for (const p of lastBodies) {
    const lab = labeler.of(p.id);
    if (!st.reps.has(p.id)) st.reps.set(p.id, EXERCISES.map(() => 0)); // (someone joins late: they start at zero)
    drawBody(ctx, p.body, aspect, W, H, lab.color, st.phase === 'work' ? 0.95 : 0.7);
    const spot = tagSpot(p.body, aspect);
    if (spot) tags.set(p.id, { spot, lab });
  }
  if (st.phase === 'intro' && t > INTRO_S) go('count', now);
  else if (st.phase === 'count') {
    setCount(t >= COUNT_S ? '' : String(COUNT_S - Math.floor(t)));
    if (t >= COUNT_S) { for (const p of lastBodies) st.counters.set(p.id, ex.make()); go('work', now); setCount('Go!'); api.sound.play('start'); }
  } else if (st.phase === 'work') {
    for (const p of lastBodies) {
      let c = st.counters.get(p.id); if (!c) { c = ex.make(); st.counters.set(p.id, c); }
      const before = c.reps, n = c.update(p.body, nowMs);
      if (n > before) { st.reps.get(p.id)[st.round] = n; api.sound.play('tick'); bump(p.id); }
    }
    setCount(t > 1 ? '' : 'Go!');
    if (t >= ROUND_S) { go('recap', now); api.sound.play('end'); setCount(''); }
  } else if (st.phase === 'recap' && t > RECAP_S) {
    st.round += 1;
    if (st.round >= EXERCISES.length) finish(now); else intro(now);
  }
  updateTags(tags);
  renderHud(now);
}
function finish(now) {
  go('final', now);
  const rows = totals();
  if (rows[0]?.playerId) api.reportWin?.(rows[0].playerId);
  api.sound.play('end');
  const mine = alive; setTimeout(() => { if (mine === alive && el && st.phase === 'final') confetti(el); }, 400);
}
const totals = () => [...st.reps.entries()].map(([id, list]) => ({ id, ...labeler.of(id), total: list.reduce((a, b) => a + b, 0), list })).sort((a, b) => b.total - a.total);

const tagEls = new Map();
function updateTags(tags) {
  const host = el.querySelector('.cg-tags');
  for (const [id, e] of tagEls) if (!tags.has(id)) { e.remove(); tagEls.delete(id); }
  for (const [id, { spot, lab }] of tags) {
    let e = tagEls.get(id);
    if (!e) { e = document.createElement('div'); e.className = 'cg-tag'; e.innerHTML = '<b></b><small></small>'; host.append(e); tagEls.set(id, e); }
    e.style.left = `${spot.x * 100}%`; e.style.top = `${spot.y * 100}%`; e.style.setProperty('--c', lab.color);
    e.firstChild.textContent = lab.name;
    e.lastChild.textContent = st.phase === 'work' ? String(st.reps.get(id)?.[st.round] ?? 0) : '';
  }
}
function bump(id) { const e = tagEls.get(id); if (e) { e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); } }
function setCount(text) { const c = el.querySelector('.cg-count'); if (c.textContent !== text) { c.textContent = text; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); if (/^\d$/.test(text)) api.sound.play('tick'); } }

let hudKey = '';
function renderHud(now) {
  const ex = EXERCISES[Math.min(st.round, EXERCISES.length - 1)], t = now - st.t0;
  const left = st.phase === 'work' ? Math.max(0, Math.ceil(ROUND_S - t)) : null;
  const rows = totals();
  const key = `${st.phase}|${st.round}|${left}|${rows.map((r) => `${r.id}:${r.total}`).join(',')}|${lastBodies.length}|${kit.tracking}`;
  if (key === hudKey) return;
  hudKey = key;
  el.querySelector('.cg-round').textContent = st.phase === 'lobby' || st.phase === 'final' ? '' : `Round ${st.round + 1} / ${EXERCISES.length} · ${ex.name}`;
  const timer = el.querySelector('.pw-timer');
  timer.hidden = left === null; timer.textContent = left ?? '';
  timer.classList.toggle('low', left !== null && left <= 5);
  const over = el.querySelector('.cg-over'), bar = el.querySelector('.cg-scorebar');
  bar.hidden = !rows.length || st.phase === 'lobby' || st.phase === 'final';
  bar.innerHTML = rows.sort((a, b) => a.name.localeCompare(b.name)).map((r) => `<div class="cg-chip" style="--c:${r.color}"><b>${esc(r.name)}</b><span>${st.phase === 'recap' || st.phase === 'work' ? (r.list[st.round] ?? 0) : r.total}</span><em>${r.total} in all</em></div>`).join('');
  if (st.phase === 'lobby') {
    over.hidden = false;
    over.innerHTML = `<div class="cg-card"><h1>Party Workout</h1><p>${EXERCISES.length} short rounds: ${EXERCISES.map((e) => e.name.toLowerCase()).join(', ')}. The camera counts your moves. Have fun, nobody is judging!</p>
      <p class="cg-seen">${lastBodies.length ? `I can see <b>${lastBodies.length}</b> ${lastBodies.length === 1 ? 'person' : 'people'}. Stand back so the camera sees you from head to knees.` : kit.tracking ? 'Step in front of the camera: I cannot see anybody yet.' : ''}</p>
      <div class="ui-cta"><button type="button" class="ui-btn primary" data-key="A">Start</button><button type="button" class="ui-btn ghost" data-key="B">‹ Back</button></div></div>`;
  } else if (st.phase === 'intro' || st.phase === 'count') {
    over.hidden = st.phase === 'count';
    over.innerHTML = `<div class="cg-card pw-intro"><div class="pw-icon">${ex.icon}</div><h1>${esc(ex.name)}</h1><p>${esc(ex.how)}</p><small>${ROUND_S} seconds</small></div>`;
  } else if (st.phase === 'recap') {
    over.hidden = false;
    const best = rows.slice().sort((a, b) => (b.list[st.round] ?? 0) - (a.list[st.round] ?? 0))[0];
    over.innerHTML = `<div class="cg-card"><h1>Time!</h1><p>${best ? `${esc(best.name)} did the most ${esc(ex.unit)}: <b>${best.list[st.round] ?? 0}</b>` : ''}</p></div>`;
  } else if (st.phase === 'final') {
    over.hidden = false;
    const board = rows.map((r) => ({ ...r, detail: EXERCISES.map((e, i) => `${r.list[i] ?? 0} ${e.unit}`).join(' · ') }));
    over.innerHTML = `<div class="cg-card"><h1>${board[0] ? `${esc(board[0].name)} wins!` : 'Done!'}</h1>${leaderboardHtml(board, 'moves')}
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
  id: 'party-workout',
  title: 'Party Workout',
  color: '#2F9E44',
  icon: ICON,
  minPlayers: 1,
  maxPlayers: 4,
  mount(container, gameApi) {
    api = gameApi; ++alive;
    el = document.createElement('div');
    el.className = 'cg pw';
    el.innerHTML = `<div class="cg-top"><span class="cg-round"></span></div><div class="pw-timer" hidden></div>
      <div class="cg-tags"></div><div class="cg-count"></div><p class="cg-flash" hidden></p>
      <div class="cg-scorebar" hidden></div><div class="cg-over" hidden></div>`;
    container.append(el);
    kit = createCameraKit({ root: el });
    for (const c of [...el.children]) if (c !== kit.stage) kit.stage.append(c); // (the labels, counts and cards sit on the picture, in its box)
    el.prepend(kit.stage);
    people = createPeopleTracker(); labeler = createLabeler(api, party);
    reset(); hudKey = '';
    api.onButton(onButton);
    api.actions([{ key: 'B', label: '‹ Back' }, { key: 'A', label: 'Start / again' }]);
    kit.start();
    raf = requestAnimationFrame(frame);
  },
  unmount() {
    alive++; cancelAnimationFrame(raf); clearTimeout(msgTimer);
    kit?.destroy(); kit = null;
    tagEls.clear();
    el?.remove(); el = null;
  },
};
