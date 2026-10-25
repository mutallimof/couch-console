// Quick Draw Duel rules (no graphics, testable): holster, a hidden wait, DRAW!, the fastest shot wins the round, best of 5.
// Time is passed in as `now` (seconds). Reaction times are measured on each PHONE (so the network cannot decide who wins) and
// arrive as milliseconds. update(now) returns the events that happened: { type: 'wait' | 'draw' | 'result' | 'next' | 'over', ... }.
export const DUEL = { rounds: 5, minWait: 2, maxWait: 7, fireWindow: 3.5, minReactionMs: 90, resultPause: 3.2 };

export function createDuel({ players, rounds = DUEL.rounds, rng = Math.random } = {}) {
  const ids = players.map((p) => p.id);
  const wins = Object.fromEntries(ids.map((id) => [id, 0]));
  let round = 1, phase = 'holster', holstered = new Set(), early = new Set(), shots = new Map(), drawAt = 0, resultAt = 0, last = null;
  const history = [];

  const reset = () => { holstered = new Set(); early = new Set(); shots = new Map(); phase = 'holster'; last = null; };
  function finishRound(now, events) {
    const fired = [...shots].filter(([id]) => !early.has(id)).sort((a, b) => a[1] - b[1]);
    const winner = fired.length ? fired[0][0] : null;
    if (winner) wins[winner] += 1;
    last = { round, winner, times: Object.fromEntries(shots), early: [...early] };
    history.push(last);
    phase = 'result'; resultAt = now + DUEL.resultPause;
    events.push({ type: 'result', ...last });
  }
  const need = Math.floor(rounds / 2) + 1;

  return {
    get state() { return { round, rounds, phase, wins: { ...wins }, holstered: [...holstered], early: [...early], shots: Object.fromEntries(shots), drawAt, last }; },
    history,
    // A phone says it is holstered (pointing at the floor). When all are, the wait starts.
    holster(id, now) {
      const events = [];
      if (phase !== 'holster' || !ids.includes(id)) return events;
      holstered.add(id);
      if (holstered.size === ids.length) {
        drawAt = now + DUEL.minWait + rng() * (DUEL.maxWait - DUEL.minWait);
        phase = 'wait';
        events.push({ type: 'wait', drawAt });
      }
      return events;
    },
    // A phone lifted out of the holster before DRAW: out for this round
    tooEarly(id, now) {
      const events = [];
      if (!['holster', 'wait'].includes(phase) || early.has(id) || !ids.includes(id)) return events;
      early.add(id);
      events.push({ type: 'early', id });
      if (phase === 'wait' && early.size === ids.length) finishRound(now, events); // everyone jumped the gun: nobody wins
      return events;
    },
    // A shot: reaction time in milliseconds after DRAW, measured on the phone
    fire(id, ms, now) {
      const events = [];
      if (phase !== 'draw' || shots.has(id) || early.has(id) || !ids.includes(id)) return events;
      if (ms < DUEL.minReactionMs) { early.add(id); events.push({ type: 'early', id }); } else shots.set(id, ms);
      if (shots.size + [...early].filter((e) => !shots.has(e)).length >= ids.length) finishRound(now, events);
      return events;
    },
    update(now) {
      const events = [];
      if (phase === 'wait' && now >= drawAt) { phase = 'draw'; events.push({ type: 'draw', at: drawAt }); }
      else if (phase === 'draw' && now >= drawAt + DUEL.fireWindow) finishRound(now, events);
      else if (phase === 'result' && now >= resultAt) {
        const lead = Math.max(...Object.values(wins));
        if (lead >= need || round >= rounds) {
          phase = 'over';
          const top = Object.entries(wins).filter(([, n]) => n === lead).map(([id]) => id);
          events.push({ type: 'over', wins: { ...wins }, winners: top });
        } else { round += 1; reset(); events.push({ type: 'next', round }); }
      }
      return events;
    },
  };
}
