// Party Games on the phone: ONE screen that shows what the TV's game asks of this phone (the TV decides, this only draws and measures).
// Messages from the TV (EV.PG_DOWN): { view: 'lobby' | 'duel' | 'potato' | 'group' | 'eggs' | 'done', ... }; replies go up with EV.PG_UP.
// The phone measures its own reaction time (so the network cannot decide who wins) and runs its own gestures (gestures.js).
import { holstered, raisedLevel, pitch, swing, wobble, flatness } from './gestures.js';
import { tickInterval, randomTask, TASK_TIME } from '../games/party/potato-rules.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ME = Math.random().toString(36).slice(2, 8); // who I am when I am a guest (a player is known by number)

export function createPartyPad({ root, send, clock, haptics, getPlayerId, onHome }) {
  const $ = (id) => root.querySelector(id);
  const body = $('#pg-body'), title = $('#pg-title'), sub = $('#pg-sub');
  let view = null, samples = [], sensors = false, lastReading = null;
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, Math.max(0, ms)); timers.add(id); return id; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };
  const say = (m) => send({ ...m, me: ME });

  // ----- sensors: gravity (for holster / level / tilt) and acceleration (for the swing) -----
  addEventListener('devicemotion', (e) => {
    const g = e.accelerationIncludingGravity;
    if (g?.x == null) return;
    sensors = true;
    lastReading = { x: g.x, y: g.y, z: g.z };
    samples.push({ t: performance.now(), a: lastReading });
    if (samples.length > 60) samples.shift();
  });

  // ----- a state machine per game; render() redraws the body when the TV sends something new -----
  const st = { ready: false, round: 0, holsterSent: -1, earlySent: -1, fired: -1, task: null, taskAt: 0, solved: false, tickKey: '', lastSend: 0, flash: '' };

  function render() {
    clearTimers();
    if (!view) { title.textContent = 'Party Games'; sub.textContent = 'Waiting for the TV…'; body.innerHTML = ''; return; }
    title.textContent = view.title || 'Party Games';
    sub.textContent = view.sub || '';
    root.dataset.view = view.view;
    const me = getPlayerId();
    const inGame = !view.players || view.players.includes(me) || view.view === 'group' || view.view === 'lobby';
    if (!inGame) { body.innerHTML = `<p class="pg-big">Watch the TV</p><p class="pg-note">This game has room for ${view.players.length} players.</p>`; return; }
    ({ lobby, duel, potato, group, eggs, done })[view.view]?.(me);
  }

  function lobby(me) {
    const mine = !!view.ready?.[me];
    const isPlayer = !!me;
    body.innerHTML = `<ul class="pg-rules">${(view.rules || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      <p class="pg-note">${esc(view.waiting || '')}</p>
      ${isPlayer ? `<button class="join-btn pg-ready" data-on="${mine}" type="button">${mine ? 'Ready ✓' : "I'm ready"}</button>` : '<p class="pg-note">Guests can watch on the TV.</p>'}
      ${me === 1 || view.canStart ? `<button class="join-btn ghost pg-start" type="button">${view.startText || 'Start now'}</button>` : ''}`;
    body.querySelector('.pg-ready')?.addEventListener('click', () => { say({ t: 'ready', on: !mine }); haptics?.play('tap'); });
    body.querySelector('.pg-start')?.addEventListener('click', () => say({ t: 'start' }));
  }

  // ----- Quick Draw -----
  function duel(me) {
    const v = view, round = v.round;
    if (st.round !== round) { st.round = round; st.fired = -1; st.holsterSent = -1; st.earlySent = -1; }
    const done = v.early?.includes(me) || (v.shots && me in v.shots);
    if (v.phase === 'holster') {
      body.innerHTML = `<p class="pg-big">Holster</p><p class="pg-note">Point the phone at the floor.</p><div class="pg-pose" data-ok="false"></div><button class="join-btn ghost pg-tap" type="button">Phone has no motion? Tap here</button>`;
      body.querySelector('.pg-tap').addEventListener('click', () => { if (st.holsterSent !== round) { st.holsterSent = round; say({ t: 'holster', round }); } });
      poll(() => {
        const ok = lastReading ? holstered(lastReading) : false;
        body.querySelector('.pg-pose')?.setAttribute('data-ok', String(ok || v.holstered?.includes(me)));
        if (ok && st.holsterSent !== round) { st.holsterSent = round; say({ t: 'holster', round }); haptics?.play('tap'); }
      });
    } else if (v.phase === 'wait') {
      const msUntil = () => clock.toLocal(v.drawAt) - performance.now();
      body.innerHTML = `<p class="pg-big">Steady…</p><p class="pg-note">Wait for DRAW!</p>`;
      const jump = () => { if (st.earlySent !== round && st.fired !== round) { st.earlySent = round; say({ t: 'early', round }); haptics?.play('hit'); body.innerHTML = '<p class="pg-big bad">Too early!</p>'; } };
      root.onpointerdown = () => { if (msUntil() > 0) jump(); };
      poll(() => { if (msUntil() > 0 && lastReading && pitch(lastReading) !== undefined && !holstered(lastReading) && Math.abs(pitch(lastReading)) < 40) jump(); });
      later(() => { if (view === v) drawNow(v, round); }, msUntil());
    } else if (v.phase === 'draw') {
      drawNow(v, round);
    } else if (v.phase === 'result') {
      const t = v.times?.[me], won = v.winner === me;
      body.innerHTML = `<p class="pg-big ${won ? 'good' : ''}">${v.early?.includes(me) ? 'Too early!' : t ? `${t} ms` : 'Too slow'}</p><p class="pg-note">${won ? 'You won the round!' : v.winner ? 'Not this time.' : 'Nobody scored.'}</p>`;
      if (won) haptics?.play('item');
    } else body.innerHTML = '';
    if (done && v.phase === 'draw') body.innerHTML = `<p class="pg-big">${v.early?.includes(me) ? 'Too early!' : 'Bang!'}</p>`;
  }
  function drawNow(v, round) {
    if (st.fired === round || st.earlySent === round) return;
    body.innerHTML = '<p class="pg-big is-draw">DRAW!</p><p class="pg-note">Raise it and tap!</p>';
    root.dataset.flash = '1';
    haptics?.play('boost');
    root.onpointerdown = () => {
      if (st.fired === round || st.earlySent === round) return;
      const ms = Math.round(clock.now() - v.drawAt);
      if (ms < 0) return;
      if (sensors && lastReading && !raisedLevel(lastReading) && Math.abs(pitch(lastReading)) > 60) { body.querySelector('.pg-note').textContent = 'Raise the phone first!'; return; }
      st.fired = round; say({ t: 'fire', round, ms }); haptics?.play('hit');
      body.innerHTML = `<p class="pg-big">${ms} ms</p>`;
    };
  }

  // ----- Hot Potato (with phones) -----
  function potato(me) {
    const v = view, mine = v.holder === me;
    root.dataset.holder = String(mine);
    if (v.phase === 'boom') { body.innerHTML = `<p class="pg-big bad">💥 BOOM</p><p class="pg-note">${v.holder === me ? 'It blew up on you!' : 'Phew.'}</p><div class="pg-hearts">${hearts(v.hearts?.[me])}</div>`; if (mine) haptics?.play('hit'); return; }
    if (!mine) { body.innerHTML = `<p class="pg-big">Not you!</p><p class="pg-note">${esc(v.holderName || 'Someone')} has the bomb.</p><div class="pg-hearts">${hearts(v.hearts?.[me])}</div>`; return; }
    ticking(v.tick);
    if (!st.task || performance.now() - st.taskAt > TASK_TIME * 1000) { st.task = randomTask(); st.taskAt = performance.now(); st.solved = false; }
    const t = st.task;
    const options = t.kind === 'swipe' ? '<div class="pg-swipe">Swipe here ⟵ ⟶ ⟰</div>'
      : t.kind === 'dots' ? `<div class="pg-dots">${[0, 1, 2, 3, 4].map((i) => `<button type="button" data-n="${i}" class="dot"></button>`).join('')}</div>`
        : `<div class="pg-colors">${[0, 1, 2, 3].map((i) => `<button type="button" data-i="${i}" class="c${i === t.answer ? ' red' : ''}"></button>`).join('')}</div>`;
    body.innerHTML = `<p class="pg-big">${esc(t.text)}</p><div class="pg-timer"><i></i></div>${options}<p class="pg-note">Then swing the phone to throw it!</p><button class="join-btn pg-throw" type="button" ${st.solved ? '' : 'disabled'}>Throw</button><div class="pg-hearts">${hearts(v.hearts?.[me])}</div>`;
    body.querySelector('.pg-timer i').style.animationDuration = `${TASK_TIME}s`;
    const solved = () => { if (st.solved) return; st.solved = true; haptics?.play('tap'); const b = body.querySelector('.pg-throw'); b.disabled = false; body.querySelector('.pg-big').textContent = 'Now THROW!'; };
    let taps = 0;
    body.querySelector('.pg-dots')?.addEventListener('click', (e) => { if (e.target.dataset.n != null && !e.target.dataset.hit) { e.target.dataset.hit = '1'; e.target.classList.add('hit'); if (++taps >= t.answer) solved(); } });
    body.querySelector('.pg-colors')?.addEventListener('click', (e) => { if (e.target.dataset.i != null && Number(e.target.dataset.i) === t.answer) solved(); });
    const sw = body.querySelector('.pg-swipe');
    if (sw) { let sx, sy; sw.onpointerdown = (e) => { sx = e.clientX; sy = e.clientY; }; sw.onpointerup = (e) => { const dx = e.clientX - sx, dy = e.clientY - sy, d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy < 0 ? 'up' : 'down'); if (Math.hypot(dx, dy) > 40 && d === t.answer) solved(); }; }
    body.querySelector('.pg-throw').addEventListener('click', () => throwIt());
    later(() => { if (view === v && !st.solved) render(); }, TASK_TIME * 1000); // too slow: a new task
    poll(() => { if (st.solved && swing(samples)) throwIt(); });
  }
  function throwIt() { if (!st.solved) return; st.solved = false; st.task = null; haptics?.play('item'); say({ t: 'throw' }); body.innerHTML = '<p class="pg-big good">Thrown!</p>'; }
  const hearts = (n) => '❤'.repeat(Math.max(0, n ?? 0)) + '<span class="gone">' + '❤'.repeat(Math.max(0, 3 - (n ?? 0))) + '</span>';
  function ticking(interval) {
    if (!interval) return;
    const run = () => { if (!view || view.view !== 'potato' || view.holder !== getPlayerId() || view.phase !== 'play') return; haptics?.play('tap'); later(run, tickInterval(view.remaining ?? 20) * 1000); };
    later(run, 0);
  }

  // ----- Hot Potato (one phone is the bomb, passed around the room) -----
  function group() {
    const v = view, bomb = v.bombMe === ME;
    if (!bomb) { body.innerHTML = `<p class="pg-big">The bomb is on another phone</p>`; return; }
    if (v.phase === 'play') {
      body.innerHTML = '<p class="pg-big">Pass it on!</p><p class="pg-note">Don\'t be the one holding it when it goes off.</p>';
      const run = () => { if (!view || view.view !== 'group' || view.phase !== 'play') return; haptics?.play('tap'); later(run, tickInterval(view.remaining ?? 20) * 1000); };
      run();
    } else if (v.phase === 'boom') {
      haptics?.play('hit');
      body.innerHTML = `<p class="pg-big bad">💥 BOOM</p><label class="pg-note">Who was holding it?</label><input class="room-input pg-name" maxlength="24" placeholder="Name" autocomplete="off"><button class="join-btn pg-out" type="button">Out!</button><button class="join-btn ghost pg-again" type="button">New bomb</button><p class="pg-note">${esc((v.out || []).join(' · '))}</p>`;
      body.querySelector('.pg-out').addEventListener('click', () => { const i = body.querySelector('.pg-name'); say({ t: 'out', name: i.value }); i.value = ''; });
      body.querySelector('.pg-again').addEventListener('click', () => say({ t: 'again' }));
    }
  }

  // ----- Steady Hands -----
  function eggs(me) {
    const v = view, alive = v.alive?.includes(me);
    body.innerHTML = `<div class="pg-egg ${alive ? '' : 'dropped'}"><i></i></div><p class="pg-big">${alive ? esc(v.action || 'Hold it steady') : 'Egg dropped!'}</p><p class="pg-note">${alive ? 'Keep the phone flat.' : 'Watch the others.'}</p>`;
    if (!alive) { haptics?.play('hit'); return; }
    const egg = body.querySelector('.pg-egg');
    poll(() => {
      if (!lastReading) return;
      const w = wobble(samples), tilt = flatness(lastReading);
      egg.style.setProperty('--tilt', tilt.toFixed(2)); egg.style.setProperty('--w', w.toFixed(2));
      if (performance.now() - st.lastSend > 100) { st.lastSend = performance.now(); say({ t: 'egg', w, tilt }); }
    }, 50);
  }

  function done() {
    body.innerHTML = `<p class="pg-big">${esc(view.headline || 'All done')}</p><p class="pg-note">${esc(view.text || '')}</p>`;
  }

  // a repeating check that stops when the screen changes
  function poll(fn, every = 80) { const run = () => { fn(); later(run, every); }; run(); }

  $('#pg-home')?.addEventListener('click', () => onHome?.());
  return {
    update(msg) {
      if (!msg || typeof msg !== 'object') return;
      const same = view && JSON.stringify({ ...view, remaining: 0, tick: 0 }) === JSON.stringify({ ...msg, remaining: 0, tick: 0 });
      view = msg;
      if (msg.view === 'duel' && msg.phase !== st.phase) root.dataset.flash = '';
      st.phase = msg.phase;
      if (!same) render(); // (the TV repeats its state; only a change redraws)
    },
    reset() { view = null; clearTimers(); root.onpointerdown = null; render(); },
    get sensors() { return sensors; },
    me: ME,
  };
}
