// Hot Potato. Mode A (phones): the bomb sits on one phone with a hidden fuse (15 to 40 s). The holder solves a tiny task in
// about 1.5 s, then swings the phone to throw it to someone else. Whoever holds it at the bang loses a heart; 3 hearts each, the
// last one standing wins. Mode B (one phone is the bomb): people pass the real phone around the room, and the TV tallies who is out.
// Rules: party/potato-rules.js · lobby / results: party/party-kit.js · phone side: remote/party-game.js
import { createKit, esc, nowSec } from './party/party-kit.js';
import { createPotato, createGroupPotato, tickInterval } from './party/potato-rules.js';

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" fill="#fff"><circle cx="22" cy="28" r="14"/><path d="M30 12l6-6M34 6h6v6" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;
let kit, game, root, api, mode, tickAt = 0, lastBeat = 0;

const hearts = (n) => '<span>' + '♥'.repeat(Math.max(0, n)) + '</span>' + '<span class="gone">' + '♥'.repeat(Math.max(0, 3 - n)) + '</span>';

function drawPotato(roster, st, note = '') {
  root.innerHTML = `<div class="hp"><header><h1>${st.phase === 'boom' ? '💥 BOOM!' : 'Hot Potato'}</h1><p>${esc(note)}</p></header>
    <ul class="hp-players">${roster.map((p) => `<li style="--player:${p.color}" class="${st.holder === p.id && st.phase !== 'over' ? 'has' : ''} ${st.hearts[p.id] <= 0 ? 'out' : ''}"><div class="hp-bomb">💣</div><b>${esc(p.emoji)} ${esc(p.name)}</b><div class="hp-hearts">${hearts(st.hearts[p.id])}</div></li>`).join('')}</ul></div>`;
}

function playPhones(_m, roster) {
  const rng = Math.random;
  game = createPotato({ players: roster, now: nowSec(), rng });
  const nameOf = (id) => roster.find((p) => p.id === id)?.name || '';
  const send = () => { const st = game.state; kit.show({ view: 'potato', players: roster.map((p) => p.id), holder: st.holder, holderName: nameOf(st.holder), phase: st.phase, hearts: st.hearts, tick: 1, remaining: Math.round(Math.min(20, st.remaining) * 10) / 10 }); };
  const redraw = (note) => { const st = game.state; drawPotato(roster, st, note ?? `${nameOf(st.holder)} has the bomb`); send(); };
  const handle = (events) => {
    for (const e of events) {
      if (e.type === 'boom') { api.sound.play('bomb'); api.rumble(e.id, 0, 'hit'); redraw(`${nameOf(e.id)} lost a heart`); }
      else if (e.type === 'bomb') { redraw(); }
      else if (e.type === 'thrown') { api.sound.play('hit'); redraw(); }
      else if (e.type === 'over') {
        const st = game.state;
        const rows = roster.map((p) => ({ name: p.name, color: p.color, value: `${st.hearts[p.id]} ♥`, n: st.hearts[p.id] })).sort((a, b) => b.n - a.n);
        return kit.results({ headline: `${nameOf(e.winner)} wins!`, sub: 'Last one standing', rows, winnerId: e.winner, again: () => { kit.resetReady(); kit.lobby({ onStart: start, modes: MODES }); } });
      }
    }
  };
  gameUp = (m) => { if (m.t === 'throw') handle([game.throwBomb(m.playerId)].filter(Boolean)); };
  redraw();
  kit.every(100, () => { if (kit.stage !== 'play') return; handle(game.update(nowSec())); const st = game.state; // the TV ticks too, faster as the bang gets close
    if (st.phase === 'play' && nowSec() - lastBeat > tickInterval(st.remaining)) { lastBeat = nowSec(); api.sound.play('tick'); } });
  kit.every(1000, () => kit.stage === 'play' && send());
}

function playGroup() {
  game = createGroupPotato({ now: nowSec() });
  const bombMe = kit.starter?.me;
  const send = () => { const st = game.state; kit.show({ view: 'group', bombMe, phase: st.phase, out: st.out, remaining: Math.round(Math.min(20, st.remaining) * 10) / 10 }); };
  const redraw = () => {
    const st = game.state;
    root.innerHTML = `<div class="hp hp-group"><header><h1>${st.phase === 'boom' ? '💥 BOOM!' : 'Pass the bomb!'}</h1><p>${st.phase === 'boom' ? 'Whoever was holding the phone is out. Enter their name on the bomb phone.' : 'The bomb is a real phone: hand it around the room.'}</p></header>
      <div class="hp-bomb big ${st.phase}">💣</div><ul class="hp-out">${st.out.map((n) => `<li>${esc(n)}</li>`).join('') || '<li class="none">Nobody is out yet</li>'}</ul>
      <p class="ui-hints"><span><kbd>A</kbd> New bomb</span><span><kbd>B</kbd> Back</span></p></div>`;
    send();
  };
  gameUp = (m) => {
    if (m.me !== bombMe) return;
    if (m.t === 'out') { game.nameOut(m.name); redraw(); }
    else if (m.t === 'again') { game.again(nowSec()); redraw(); }
  };
  groupAgain = () => { if (game.state.phase === 'boom') { game.again(nowSec()); redraw(); } };
  redraw();
  kit.every(100, () => { const ev = game.update(nowSec()); if (ev.length) { api.sound.play('bomb'); redraw(); } else if (game.state.phase === 'play' && nowSec() - lastBeat > tickInterval(game.state.remaining)) { lastBeat = nowSec(); api.sound.play('tick'); } });
  kit.every(1000, send);
}

let gameUp, groupAgain;
const MODES = [{ label: 'With phones', group: false }, { label: 'One phone is the bomb', group: true }];
function start(m, roster) { return m?.group ? playGroup() : playPhones(m, roster); }

export default {
  id: 'hot-potato', title: 'Hot Potato', color: '#E03131', icon: ICON, minPlayers: 1, maxPlayers: 4,
  mount(container, gameApi) {
    api = gameApi;
    root = document.createElement('div');
    root.className = 'party-game';
    container.append(root);
    kit = createKit({ api, root, id: 'hot-potato', title: 'Hot Potato', blurb: 'Do not be holding it when it goes off.', min: 2,
      rules: ['The bomb has a hidden fuse. Solve the little task on your phone.', 'Then swing the phone to throw the bomb to someone else.', 'Holding it at the bang costs a heart. Last one standing wins.'] });
    kit.onUp((m) => { if (kit.stage === 'play') gameUp?.(m); });
    api.onButton((b) => { if (b.state === 'down' && b.button === 'A' && kit.stage === 'play') groupAgain?.(); });
    kit.lobby({ onStart: start, modes: MODES, canStart: true, startText: 'Start now' });
  },
  unmount() { kit?.destroy(); root?.remove(); kit = game = root = api = gameUp = groupAgain = null; },
};
