// Hot Potato rules (no graphics, testable). Mode A: a bomb with a hidden fuse is passed between phones, the holder loses a heart when
// it explodes, the last player with hearts wins. Mode B: ONE phone is the bomb and people pass it around the room; whoever holds it
// when it explodes is out. Time is passed in as `now` (seconds).
export const POTATO = { fuse: [15, 40], hearts: 3, afterBoom: 3 };

// How fast the bomb ticks (seconds between ticks): slow at first, frantic at the end
export const tickInterval = (remaining) => Math.max(0.12, Math.min(1, remaining / 12));

export function createPotato({ players, hearts = POTATO.hearts, rng = Math.random, now = 0, fuse = POTATO.fuse } = {}) {
  const ids = players.map((p) => p.id), left = Object.fromEntries(ids.map((id) => [id, hearts]));
  let holder = ids[Math.floor(rng() * ids.length)], phase = 'play', fuseAt = now + fuse[0] + rng() * (fuse[1] - fuse[0]), nextAt = 0, winner = null;
  const alive = () => ids.filter((id) => left[id] > 0);
  const newFuse = (t) => { fuseAt = t + fuse[0] + rng() * (fuse[1] - fuse[0]); };
  return {
    get state() { return { holder, hearts: { ...left }, phase, winner, remaining: fuseAt - now }; },
    // The holder throws the bomb to a random other player who is still in (after solving the mini task on the phone)
    throwBomb(id) {
      if (phase !== 'play' || id !== holder) return null;
      const others = alive().filter((x) => x !== holder);
      if (!others.length) return null;
      const to = others[Math.floor(rng() * others.length)];
      holder = to;
      return { type: 'thrown', from: id, to };
    },
    update(t) {
      now = t;
      const events = [];
      if (phase === 'play' && t >= fuseAt) {
        left[holder] -= 1;
        events.push({ type: 'boom', id: holder, hearts: left[holder] });
        if (alive().length <= 1) { phase = 'over'; winner = alive()[0] || holder; events.push({ type: 'over', winner }); } else { phase = 'boom'; nextAt = t + POTATO.afterBoom; }
      } else if (phase === 'boom' && t >= nextAt) {
        if (left[holder] <= 0) holder = alive()[Math.floor(rng() * alive().length)];
        newFuse(t); phase = 'play';
        events.push({ type: 'bomb', holder });
      }
      return events;
    },
  };
}

// Mode B: one phone, any number of people
export function createGroupPotato({ rng = Math.random, now = 0, fuse = POTATO.fuse } = {}) {
  let fuseAt = now + fuse[0] + rng() * (fuse[1] - fuse[0]), phase = 'play', nextAt = 0;
  const out = [];
  return {
    get state() { return { phase, out: [...out], remaining: fuseAt - now }; },
    // After the bang the phone asks who was holding it
    nameOut(name) { const n = String(name || '').trim().slice(0, 24); if (n) out.push(n); return [...out]; },
    update(t) {
      now = t;
      const events = [];
      if (phase === 'play' && t >= fuseAt) { phase = 'boom'; nextAt = t + POTATO.afterBoom; events.push({ type: 'boom' }); }
      return events;
    },
    // A new bomb (the next round)
    again(t) { fuseAt = t + fuse[0] + rng() * (fuse[1] - fuse[0]); phase = 'play'; return { type: 'bomb' }; },
  };
}

// The phone's mini tasks: pick a random one. A task is solved when the player's answer equals `answer`.
export const TASK_TIME = 1.5; // seconds to solve it (a new task appears if you are too slow)
export function randomTask(rng = Math.random) {
  const kind = ['swipe', 'dots', 'red'][Math.floor(rng() * 3)];
  if (kind === 'swipe') { const dir = ['left', 'up', 'right'][Math.floor(rng() * 3)]; return { kind, text: `Swipe ${dir}`, answer: dir }; }
  if (kind === 'dots') return { kind, text: 'Tap the 3 dots', answer: 3 };
  return { kind, text: 'Tap the red one', answer: Math.floor(rng() * 4) }; // the index (0..3) of the red button
}
