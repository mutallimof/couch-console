// The Party Games' shared TV side: the lobby (rules in 3 lines, a Ready per phone, P1 starts), talking to the phones, the clock,
// a steady "tick" for the rules, and the results screen. Each game (quick-draw.js, hot-potato.js, steady-hands.js) plugs its
// rules and its screen into this. Phone side: public/js/remote/party-game.js.
import { party } from '../../party.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const nowSec = () => performance.now() / 1000;

export function createKit({ api, root, id, title, rules, min = 2, blurb = '' }) {
  const up = new Set();
  let lobbyHandler = null, view = null, timers = [], repeat = 0, alive = true, stage = 'lobby';
  const ready = {};
  const roster = () => api.players.map((p) => ({ id: p.playerId, color: p.color, name: party.personOfPlayer(p.playerId)?.name || `Player ${p.playerId}`, emoji: party.personOfPlayer(p.playerId)?.emoji || '' }));
  const kit = {
    api, root, roster, esc,
    get stage() { return stage; },
    byId: (pid) => roster().find((p) => p.id === pid),
    // phone -> TV
    onUp(fn) { up.add(fn); },
    // TV -> phones (one or all). The last screen is repeated every 1.5 s so a phone that joins or wakes up catches up.
    show(v) { view = { title, ...v }; api.partySend(view); },
    // a steady heartbeat for the game's rules
    every(ms, fn) { const t = setInterval(() => alive && fn(), ms); timers.push(t); return t; },
    stop() { timers.forEach(clearInterval); timers = []; },
    // ----- lobby -----
    lobby({ onStart, modes, startText = 'Start now', canStart = false }) {
      stage = 'lobby';
      let mode = 0;
      const ids = () => roster().map((p) => p.id);
      const allReady = () => ids().length >= min && ids().every((i) => ready[i]);
      const draw = () => {
        const ps = roster();
        root.innerHTML = `<div class="pg-lobby"><h1>${esc(title)}</h1><p class="pg-blurb">${esc(blurb)}</p>
          <ol class="pg-rules">${rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>
          ${modes ? `<div class="pg-modes">${modes.map((m, i) => `<span class="ui-chip ${i === mode ? 'on' : ''}" style="--player:var(--c-accent)">${esc(m.label)}</span>`).join('')}<small><kbd>◀▶</kbd> Change</small></div>` : ''}
          <ul class="pg-who">${ps.map((p) => `<li class="${ready[p.id] ? 'ready' : ''}" style="--player:${p.color}"><i></i><b>${esc(p.emoji)} ${esc(p.name)}</b><span>${ready[p.id] ? 'Ready' : 'Not ready'}</span></li>`).join('')}</ul>
          <p class="pg-wait">${ps.length < min ? `Needs ${min} players: join with your phones` : allReady() ? 'Everyone is ready!' : 'Press Ready on your phone. P1 can press A to start now.'}</p>
          <p class="ui-hints"><span><kbd>A</kbd> ${esc(startText)}</span><span><kbd>B</kbd> Back</span></p></div>`;
        kit.show({ view: 'lobby', rules, ready: { ...ready }, startText, canStart: canStart && (modes ? modes[mode].group : false), waiting: ps.length < min ? `Needs ${min} players` : '' });
      };
      const start = () => { if (roster().length >= min || (modes && modes[mode].group)) { stage = 'play'; onStart(modes ? modes[mode] : null, roster()); } };
      lobbyHandler = (m) => {
        if (stage !== 'lobby') return;
        if (m.t === 'ready' && m.playerId) { ready[m.playerId] = !!m.on; api.sound.play('hover'); draw(); if (allReady()) setTimeout(() => stage === 'lobby' && allReady() && start(), 900); }
        else if (m.t === 'start' && (m.playerId === 1 || (modes && modes[mode].group))) { kit.starter = m; start(); }
      };
      kit.lobbyKey = (button) => {
        if (stage !== 'lobby') return false;
        if (button === 'A') { start(); return true; }
        if (modes && (button === 'LEFT' || button === 'RIGHT')) { mode = (mode + (button === 'RIGHT' ? 1 : modes.length - 1)) % modes.length; draw(); return true; }
        return false;
      };
      draw();
      clearInterval(repeat);
      repeat = setInterval(() => { if (alive && view) api.partySend(view); }, 1500);
      kit.redrawLobby = draw;
    },
    // ----- results -----
    results({ headline, sub = '', rows = [], winnerId = null, again }) {
      stage = 'results';
      kit.stop();
      const w = winnerId ? kit.byId(winnerId) : null;
      root.innerHTML = `<div class="pg-results"><p class="pg-kicker">${esc(title)}</p><h1 style="${w ? `color:${w.color}` : ''}">${esc(headline)}</h1><p class="pg-blurb">${esc(sub)}</p>
        <ul class="pg-rank">${rows.map((r, i) => `<li style="--player:${r.color || 'var(--c-muted)'}"><b>${i + 1}</b><span>${esc(r.name)}</span><em>${esc(r.value ?? '')}</em></li>`).join('')}</ul>
        <p class="ui-hints"><span><kbd>A</kbd> Play again</span><span><kbd>B</kbd> Back to Party Games</span></p></div>`;
      kit.show({ view: 'done', headline: w ? `${w.name} wins!` : headline, text: sub });
      if (w) { api.reportWin(w.id); api.sound.play('end'); import('../../results.js').then((m) => m.confetti?.(root)); }
      kit.resultsKey = (button) => { if (stage !== 'results') return false; if (button === 'A') { again(); return true; } return false; };
    },
    // phone messages, the A / B buttons
    handleUp(m) { lobbyHandler?.(m); up.forEach((fn) => fn(m)); },
    handleButton(b) {
      if (b.state !== 'down') return;
      if (b.button === 'B') return api.exit();
      if (kit.lobbyKey?.(b.button)) return;
      kit.resultsKey?.(b.button);
    },
    destroy() { alive = false; kit.stop(); clearInterval(repeat); up.clear(); },
    resetReady() { for (const k of Object.keys(ready)) delete ready[k]; },
  };
  api.onParty((m) => kit.handleUp(m));
  api.onButton((b) => kit.handleButton(b));
  api.setController('party');
  return kit;
}
