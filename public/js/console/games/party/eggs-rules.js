// Steady Hands rules (no graphics, testable): every phone holds an egg on a spoon; the TV calls out actions; too much tilt or a sudden
// jolt drops the egg. Each phone sends readings { w: wobble 0..1, tilt: 0..1 (how far from flat) } about 10 times a second.
// Time is passed in as `now` (seconds). Thresholds get stricter as the game goes on.
export const ACTIONS = ['Turn around!', 'Stand on one leg!', 'Sit down and stand up!', 'Switch hands!', 'Touch your knee!', 'Wave at someone!', 'Take a step back!', 'Spin once!'];
export const EGG = { tiltLimit: 0.62, joltLimit: 0.97, tiltHold: 0.35, harder: 90 };

// How strict things are, 0 (relaxed) .. 1 (hard), after `elapsed` seconds
export const difficulty = (elapsed) => Math.min(1, Math.max(0, elapsed / EGG.harder));
export const limits = (elapsed) => ({ tilt: EGG.tiltLimit - 0.2 * difficulty(elapsed), jolt: EGG.joltLimit - 0.22 * difficulty(elapsed) });

export function createEggs({ players, rng = Math.random, now = 0 } = {}) {
  const ids = players.map((p) => p.id), start = now;
  const eggs = Object.fromEntries(ids.map((id) => [id, { alive: true, sum: 0, n: 0, over: 0, last: now, droppedAt: null, cause: null }]));
  let nextAt = now + 4 + rng() * 2, action = null, phase = 'play';
  const alive = () => ids.filter((id) => eggs[id].alive);
  const avg = (id) => (eggs[id].n ? eggs[id].sum / eggs[id].n : 0);
  function checkEnd(t, events) {
    if (alive().length <= 1 && phase === 'play') {
      phase = 'over';
      const rest = alive();
      // the last one holding an egg wins; if the last two dropped together, the lowest average wobble does
      const pool = rest.length ? rest : ids.filter((id) => eggs[id].droppedAt === Math.max(...ids.map((x) => eggs[x].droppedAt ?? -1)));
      const winner = [...pool].sort((a, b) => avg(a) - avg(b))[0];
      events.push({ type: 'over', winner, averages: Object.fromEntries(ids.map((id) => [id, avg(id)])) });
    }
  }
  return {
    get state() { return { phase, action, alive: alive(), eggs: Object.fromEntries(ids.map((id) => [id, { alive: eggs[id].alive, avg: avg(id), cause: eggs[id].cause }])) }; },
    // A reading from a phone. Returns events (an egg drop).
    report(id, { w = 0, tilt = 0 }, t) {
      const e = eggs[id], events = [];
      if (!e || !e.alive || phase !== 'play') return events;
      const dt = Math.min(0.5, Math.max(0, t - e.last)); e.last = t;
      e.sum += w; e.n += 1;
      const lim = limits(t - start);
      if (w > lim.jolt) { e.alive = false; e.droppedAt = t; e.cause = 'jolt'; }
      else if (tilt > lim.tilt) { e.over += dt; if (e.over >= EGG.tiltHold) { e.alive = false; e.droppedAt = t; e.cause = 'tilt'; } } else e.over = Math.max(0, e.over - dt * 2);
      if (!e.alive) { events.push({ type: 'drop', id, cause: e.cause }); checkEnd(t, events); }
      return events;
    },
    // A phone lost its connection: the egg is dropped
    dropped(id, t) { const e = eggs[id]; if (!e?.alive) return []; e.alive = false; e.droppedAt = t; e.cause = 'gone'; const ev = [{ type: 'drop', id, cause: 'gone' }]; checkEnd(t, ev); return ev; },
    update(t) {
      const events = [];
      if (phase === 'play' && t >= nextAt) {
        action = ACTIONS[Math.floor(rng() * ACTIONS.length)];
        const gap = Math.max(3.2, 8 - (t - start) / 18);
        nextAt = t + gap + rng() * 1.5;
        events.push({ type: 'action', text: action });
      }
      return events;
    },
  };
}
