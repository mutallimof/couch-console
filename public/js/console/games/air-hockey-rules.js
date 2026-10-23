// Air Hockey rules: the table, mallets, puck, goals and score. No 3D, no sound, no DOM,
// so it can be tested in Node (tests/air-hockey.test.mjs). air-hockey.js draws it and
// turns the events below into sounds and rumbles.
//   events: { type: 'hit', side } · { type: 'wall' } · { type: 'goal', scorer } · { type: 'win', scorer }

export const HALF_L = 2, HALF_W = 1.1, GOAL_HALF = 0.36;
export const PUCK_R = 0.1, MALLET_R = 0.16;
export const MAX_PUCK = 9, MALLET_SPEED = 14, CPU_SPEED = 3.4, FRICTION = 0.35;
export const WIN = 7;
const GOAL_PAUSE = 1.2; // seconds the "Goal!" message shows before play continues

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// players: [left, right], each { playerId } (null = the computer)
export function createMatch({ players, onEvent = () => {}, rng = Math.random }) {
  const m = {
    sides: players.map((p) => ({ playerId: p.playerId ?? null, score: 0, x: 0, z: 0, vx: 0, vz: 0, tx: 0, tz: 0 })),
    puck: null,
    state: 'play',   // 'play' | 'goal' (short pause) | 'over'
    timer: 0,        // seconds since the last goal
    winner: null,
  };

  // Puck waits in the middle of the given side's half (the side that just conceded)
  function resetPuck(side) {
    m.puck = { x: (side === 0 ? -1 : 1) * HALF_L * 0.45, z: 0, vx: 0, vz: 0, still: 0 };
    m.sides.forEach((s, i) => {
      s.x = (i === 0 ? -1 : 1) * HALF_L * 0.8; s.z = 0; s.vx = 0; s.vz = 0; s.tx = s.x; s.tz = s.z;
    });
  }

  m.newMatch = () => {
    m.sides.forEach((s) => { s.score = 0; });
    m.winner = null;
    resetPuck(rng() < 0.5 ? 0 : 1);
    m.state = 'play';
  };

  // Where a human player wants their mallet (table coordinates)
  m.setTarget = (side, x, z) => { m.sides[side].tx = x; m.sides[side].tz = z; };

  // The computer attacks the puck on its half, otherwise guards the goal (it always plays right)
  function cpuTarget(s) {
    if (m.puck.x > 0) { s.tx = m.puck.x + 0.15; s.tz = m.puck.z; } else { s.tx = HALF_L * 0.8; s.tz = m.puck.z * 0.45; }
  }

  function moveMallets(dt) {
    m.sides.forEach((s, i) => {
      if (!s.playerId) cpuTarget(s);
      // stay on your own half (reaching just past the center line, so a puck resting
      // there can always be hit) and inside the rails
      const left = i === 0;
      const minX = left ? -HALF_L + MALLET_R : MALLET_R * 0.5;
      const maxX = left ? -MALLET_R * 0.5 : HALF_L - MALLET_R;
      const tx = clamp(s.tx, minX, maxX), tz = clamp(s.tz, -HALF_W + MALLET_R, HALF_W - MALLET_R);
      const speed = s.playerId ? MALLET_SPEED : CPU_SPEED;
      const dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz), step = Math.min(d, speed * dt);
      const nx = d ? (dx / d) * step : 0, nz = d ? (dz / d) * step : 0;
      s.vx = nx / dt; s.vz = nz / dt;
      s.x += nx; s.z += nz;
    });
  }

  function goal(scorer) {
    m.sides[scorer].score++;
    if (m.sides[scorer].score >= WIN) {
      m.state = 'over'; m.winner = scorer;
      onEvent({ type: 'win', scorer });
    } else {
      m.state = 'goal'; m.timer = 0;
      onEvent({ type: 'goal', scorer });
    }
    resetPuck(1 - scorer);
  }

  function stepPuck(dt) {
    const p = m.puck;
    p.x += p.vx * dt; p.z += p.vz * dt;
    const damp = Math.exp(-FRICTION * dt);
    p.vx *= damp; p.vz *= damp;
    // side rails
    if (Math.abs(p.z) > HALF_W - PUCK_R) {
      p.z = Math.sign(p.z) * (HALF_W - PUCK_R); p.vz = -p.vz * 0.9; onEvent({ type: 'wall' });
    }
    // ends: goal if inside the slot, else bounce
    if (Math.abs(p.x) > HALF_L - PUCK_R) {
      if (Math.abs(p.z) < GOAL_HALF - PUCK_R * 0.3) {
        if (Math.abs(p.x) > HALF_L + PUCK_R) return goal(p.x < 0 ? 1 : 0);
      } else {
        p.x = Math.sign(p.x) * (HALF_L - PUCK_R); p.vx = -p.vx * 0.9; onEvent({ type: 'wall' });
      }
    }
    // mallets: bounce off, plus the mallet's own speed
    m.sides.forEach((s, side) => {
      const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz), min = PUCK_R + MALLET_R;
      if (d >= min || d === 0) return;
      const nx = dx / d, nz = dz / d;
      p.x = s.x + nx * min; p.z = s.z + nz * min;
      const rel = (p.vx - s.vx) * nx + (p.vz - s.vz) * nz;
      if (rel < 0) {
        p.vx -= 1.9 * rel * nx; p.vz -= 1.9 * rel * nz;
        const sp = Math.hypot(p.vx, p.vz);
        if (sp > MAX_PUCK) { p.vx *= MAX_PUCK / sp; p.vz *= MAX_PUCK / sp; }
        onEvent({ type: 'hit', side });
      }
    });
  }

  m.update = (dt) => {
    if (dt <= 0) return;
    m.timer += dt;
    if (m.state === 'goal' && m.timer > GOAL_PAUSE) m.state = 'play';
    moveMallets(dt);
    if (m.state !== 'play') return;
    // A puck that has stopped for 3 s gets a little nudge
    const p = m.puck;
    p.still = Math.hypot(p.vx, p.vz) < 0.05 ? p.still + dt : 0;
    if (p.still > 3) { p.vx = (rng() - 0.5) * 2; p.vz = (rng() - 0.5) * 2; p.still = 0; }
    const steps = 6;
    for (let i = 0; i < steps && m.state === 'play'; i++) stepPuck(dt / steps);
  };

  resetPuck(0);
  return m;
}
