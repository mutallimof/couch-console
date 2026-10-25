// Steady Hands: hold your phone flat like a spoon with an egg on it. The TV calls out silly actions ("Turn around!", "Stand on one
// leg!"); tilt too far or jolt the phone and the egg drops. The last egg standing wins; if the last two drop together, the one
// with the calmer hands wins. Rules: party/eggs-rules.js · lobby / results: party/party-kit.js · phone side: remote/party-game.js
import { createKit, esc, nowSec } from './party/party-kit.js';
import { createEggs } from './party/eggs-rules.js';

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" fill="#fff"><ellipse cx="22" cy="20" rx="9" ry="12"/><path d="M6 36h28a6 6 0 0 0 0-4H12z"/><path d="M34 34l10 6" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>`;
let kit, eggs, root, api, seen = {};

function draw(roster, st, note) {
  root.innerHTML = `<div class="sh"><header><p class="sh-call">${esc(note || 'Hold it steady')}</p></header>
    <ul class="sh-players">${roster.map((p) => { const e = st.eggs[p.id]; return `<li style="--player:${p.color}" class="${e.alive ? '' : 'out'}"><div class="sh-egg"><i></i></div><b>${esc(p.emoji)} ${esc(p.name)}</b><span>${e.alive ? 'Holding' : e.cause === 'jolt' ? 'Jolted!' : e.cause === 'gone' ? 'Left' : 'Dropped!'}</span></li>`; }).join('')}</ul>
    <p class="ui-hints"><span><kbd>B</kbd> Back</span></p></div>`;
}

function start(_m, roster) {
  const t0 = nowSec();
  eggs = createEggs({ players: roster, now: t0 });
  seen = Object.fromEntries(roster.map((p) => [p.id, t0]));
  let note = 'Hold it steady';
  const ids = roster.map((p) => p.id);
  const send = () => { const st = eggs.state; kit.show({ view: 'eggs', players: ids, action: note, alive: st.alive }); };
  const handle = (events) => {
    for (const e of events) {
      if (e.type === 'action') { note = e.text; api.sound.play('select'); ids.forEach((id) => api.rumble(id, 0, 'tap')); }
      if (e.type === 'drop') { api.sound.play('pop'); api.rumble(e.id, 0, 'hit'); }
      if (e.type === 'over') {
        const st = eggs.state;
        const rows = roster.map((p) => ({ name: p.name, color: p.color, avg: e.averages[p.id], alive: st.eggs[p.id].alive, value: st.eggs[p.id].alive ? 'Still holding' : `wobble ${Math.round(e.averages[p.id] * 100)}` }))
          .sort((a, b) => (b.alive - a.alive) || (a.name === roster.find((p) => p.id === e.winner)?.name ? -1 : 0) || a.avg - b.avg);
        return kit.results({ headline: `${roster.find((p) => p.id === e.winner)?.name} wins!`, sub: 'Calmest hands in the room', rows, winnerId: e.winner, again: () => { kit.resetReady(); kit.lobby({ onStart: start }); } });
      }
    }
    draw(roster, eggs.state, note); send();
  };
  eggUp = (m) => { if (m.t === 'egg' && m.playerId in seen) { seen[m.playerId] = nowSec(); const ev = eggs.report(m.playerId, { w: Number(m.w) || 0, tilt: Number(m.tilt) || 0 }, nowSec()); if (ev.length) handle(ev); } };
  draw(roster, eggs.state, note); send();
  kit.every(100, () => {
    if (kit.stage !== 'play') return;
    const t = nowSec(), ev = eggs.update(t);
    for (const id of ids) if (eggs.state.eggs[id].alive && t - seen[id] > 3) ev.push(...eggs.dropped(id, t)); // a phone that went quiet (left, locked) drops its egg
    if (ev.length) handle(ev);
  });
  kit.every(1500, () => kit.stage === 'play' && send());
}
let eggUp;

export default {
  id: 'steady-hands', title: 'Steady Hands', color: '#2F9E44', icon: ICON, minPlayers: 2, maxPlayers: 4,
  mount(container, gameApi) {
    api = gameApi;
    root = document.createElement('div');
    root.className = 'party-game';
    container.append(root);
    kit = createKit({ api, root, id: 'steady-hands', title: 'Steady Hands', blurb: 'Do not drop the egg.', min: 2,
      rules: ['Hold your phone flat in front of you: it is a spoon with an egg on it.', 'The TV calls out actions: do them without tipping the egg off.', 'Tilt too far or jolt it and the egg drops. Last egg wins.'] });
    kit.onUp((m) => { if (kit.stage === 'play') eggUp?.(m); });
    kit.lobby({ onStart: start });
  },
  unmount() { kit?.destroy(); root?.remove(); kit = eggs = root = api = eggUp = null; },
};
