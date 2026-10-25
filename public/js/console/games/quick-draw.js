// Quick Draw Duel (2-4 players, best of 5): holster your phone (point it at the floor), wait for DRAW!, raise it and tap. Every phone
// measures its own reaction time, so the network cannot decide who wins. Jump the gun and you are out for the round.
// Rules: party/duel-rules.js · shared lobby / results: party/party-kit.js · phone side: remote/party-game.js
import { createKit, esc, nowSec } from './party/party-kit.js';
import { createDuel, DUEL } from './party/duel-rules.js';

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" fill="#fff"><path d="M8 20h24l8-4v10l-8 2H20l-2 10h-8l2-10H8z"/></svg>`;
let kit, duel, root, api, replayTimer, handleUp;

function board(roster, st, headline, sub = '') {
  const wins = st.wins || {};
  root.innerHTML = `<div class="qd"><header><span>Round ${st.round} of ${st.rounds}</span><h1 class="qd-call ${st.phase === 'draw' ? 'is-draw' : ''}">${esc(headline)}</h1><p>${esc(sub)}</p></header>
    <ul class="qd-players">${roster.map((p) => {
      const t = st.shots?.[p.id], early = st.early?.includes(p.id), hold = st.holstered?.includes(p.id);
      return `<li style="--player:${p.color}" class="${early ? 'out' : ''} ${st.last?.winner === p.id ? 'won' : ''}"><b>${esc(p.emoji)} ${esc(p.name)}</b><div class="qd-pips">${Array.from({ length: Math.ceil(st.rounds / 2) }, (_, i) => `<i class="${i < (wins[p.id] || 0) ? 'on' : ''}"></i>`).join('')}</div>
        <span>${early ? 'Too early!' : t ? `${t} ms` : st.phase === 'holster' ? (hold ? 'Holstered ✓' : 'Holster…') : ''}</span></li>`;
    }).join('')}</ul><div class="qd-replay" hidden></div></div>`;
}

// A slow-motion replay of the round: bars grow at a quarter of the speed, the quickest first to the line
function replay(roster, last) {
  const box = root.querySelector('.qd-replay');
  const times = Object.entries(last.times || {}).map(([id, ms]) => ({ ...roster.find((p) => p.id === Number(id)), ms })).filter((x) => x.name);
  if (!times.length) return;
  const slowest = Math.max(...times.map((x) => x.ms));
  box.hidden = false;
  box.innerHTML = `<small>Slow-motion replay</small>${times.sort((a, b) => a.ms - b.ms).map((x) => `<div style="--player:${x.color}"><span>${esc(x.name)}</span><i style="--w:${(x.ms / slowest) * 100}%;--d:${(x.ms / 1000) * 4}s"></i><em>${x.ms} ms</em></div>`).join('')}`;
}

function play(_mode, roster) {
  const ids = roster.map((p) => p.id);
  duel = createDuel({ players: roster });
  const send = (extra = {}) => {
    const st = duel.state;
    kit.show({ view: 'duel', players: ids, phase: st.phase, round: st.round, rounds: st.rounds, drawAt: st.phase === 'wait' || st.phase === 'draw' ? api.clock.toServer(st.drawAt * 1000) : 0, holstered: st.holstered, early: st.early, shots: st.shots, times: st.last?.times, winner: st.last?.winner ?? null, wins: st.wins, ...extra });
  };
  const draw = () => {
    const st = duel.state;
    const call = { holster: 'Holster your phones', wait: 'Steady…', draw: 'DRAW!', result: st.last?.winner ? `${roster.find((p) => p.id === st.last.winner)?.name} is quickest` : 'Nobody fired in time', over: 'Duel over' }[st.phase];
    board(roster, st, call, st.phase === 'holster' ? 'Point the phone at the floor' : st.phase === 'draw' ? 'Raise it and tap!' : '');
    if (st.phase === 'result' && st.last) replay(roster, st.last);
  };
  const handle = (events) => {
    for (const e of events) {
      if (e.type === 'draw') { api.sound.play('shot'); roster.forEach((p) => api.rumble(p.id, 0, 'boost')); }
      if (e.type === 'early') api.sound.play('point');
      if (e.type === 'result') { api.sound.play(e.winner ? 'strike' : 'wall'); if (e.winner) api.rumble(e.winner, 0, 'item'); }
      if (e.type === 'over') {
        const rows = roster.map((p) => ({ name: p.name, color: p.color, value: `${e.wins[p.id] || 0} won`, n: e.wins[p.id] || 0 })).sort((a, b) => b.n - a.n);
        const tie = e.winners.length > 1;
        return kit.results({ headline: tie ? "It's a tie!" : `${roster.find((p) => p.id === e.winners[0])?.name} wins!`, sub: 'Best of 5', rows, winnerId: tie ? null : e.winners[0], again: () => { kit.resetReady(); kit.lobby({ onStart: play }); } });
      }
    }
    draw(); send();
  };
  handleUp = handle;
  draw(); send();
  kit.every(40, () => { if (kit.stage !== 'play') return; const ev = duel.update(nowSec()); if (ev.length) handle(ev); });
  kit.every(1500, () => kit.stage === 'play' && send());
}

export default {
  id: 'quick-draw', title: 'Quick Draw', color: '#E8590C', icon: ICON, minPlayers: 2, maxPlayers: 4,
  mount(container, gameApi) {
    api = gameApi;
    root = document.createElement('div');
    root.className = 'party-game';
    container.append(root);
    api.clock.sync();
    kit = createKit({ api, root, id: 'quick-draw', title: 'Quick Draw', blurb: 'The fastest hand in the room.', min: 2,
      rules: ['Point your phone at the floor: that is your holster.', 'When the TV says DRAW!, raise the phone and tap the screen.', 'Fire too early and you are out for the round. Best of 5.'] });
    kit.onUp((m) => {
      if (kit.stage !== 'play' || !duel || (m.round !== undefined && m.round !== duel.state.round)) return;
      const now = nowSec();
      if (m.t === 'holster') handleUp(duel.holster(m.playerId, now));
      else if (m.t === 'early') handleUp(duel.tooEarly(m.playerId, now));
      else if (m.t === 'fire') handleUp(duel.fire(m.playerId, Number(m.ms) || 0, now));
    });
    kit.lobby({ onStart: play });
  },
  unmount() { clearTimeout(replayTimer); kit?.destroy(); root?.remove(); kit = duel = root = api = null; },
};
