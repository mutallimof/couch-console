// The maths of the two camera games (Mirror Match and Party Workout), with no camera and no browser in it, so it can be tested:
// target poses and how well a body matches one, a stick-figure to draw them, and the rep counters (squats, jumping jacks, arm
// circles, high knees). Input: the 33 body landmarks MediaPipe gives per person, { x, y, visibility } with x and y in 0..1 of the
// picture. Everything here works in the MIRRORED picture (what the player sees on the TV): the arm on the screen's left is the
// one a mirror would show on the left.
export const LM = { nose: 0, lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16, lHip: 23, rHip: 24, lKnee: 25, rKnee: 26, lAnk: 27, rAnk: 28 };
const DEG = 180 / Math.PI;
const wrap = (a) => { a = ((a + 180) % 360 + 360) % 360 - 180; return a; };
const seen = (p, min = 0.4) => !!p && (p.visibility ?? 1) >= min && p.x > -0.05 && p.x < 1.05 && p.y > -0.05 && p.y < 1.05;

// A body in display space: x mirrored (a mirror), with the image's aspect ratio applied so angles are true angles
export function toDisplay(landmarks, aspect = 16 / 9) {
  return landmarks.map((p) => ({ x: (1 - p.x) * aspect, y: p.y, v: p.visibility ?? 1, vis: seen(p) }));
}

// The limbs: [joint A, joint B] of each bone. "L" = the person's left arm / leg, which a mirror shows on the screen's left.
const BONES = {
  Lua: [LM.lSh, LM.lEl], Lfa: [LM.lEl, LM.lWr], Rua: [LM.rSh, LM.rEl], Rfa: [LM.rEl, LM.rWr],
  Lth: [LM.lHip, LM.lKnee], Lsh: [LM.lKnee, LM.lAnk], Rth: [LM.rHip, LM.rKnee], Rsh: [LM.rKnee, LM.rAnk],
};
export const BONE_NAMES = Object.keys(BONES);
const WEIGHT = { Lua: 1, Lfa: 1, Rua: 1, Rfa: 1, Lth: 0.5, Lsh: 0.35, Rth: 0.5, Rsh: 0.35 };

// Direction of a bone in degrees: 0 = to the right, 90 = up, 180 = to the left, -90 = down (on the screen)
export function boneAngles(body) {
  const out = {};
  for (const [name, [a, b]] of Object.entries(BONES)) {
    const A = body[a], B = body[b];
    out[name] = A?.vis && B?.vis ? Math.atan2(-(B.y - A.y), B.x - A.x) * DEG : null;
  }
  return out;
}

// ---------- the poses to copy ----------
// Angles are for the screen's left (L) and right (R) bones, as the figure on the TV shows them (like a mirror).
const P = (name, ua, fa, th = [-92, -92], sh = [-92, -92]) => ({
  name, Lua: ua[0], Lfa: fa[0], Rua: ua[1], Rfa: fa[1], Lth: th[0], Lsh: sh[0], Rth: th[1], Rsh: sh[1],
});
export const POSES = [
  P('Tall T', [180, 0], [180, 0]),
  P('Victory V', [135, 45], [135, 45]),
  P('Hands up high', [95, 85], [95, 85]),
  P('Flex!', [180, 0], [90, 90]),
  P('Hands on hips', [-120, -60], [-40, -140]),
  P('Hello!', [-95, 60], [-95, 100]),
  P('Superhero', [90, -45], [90, -45]),
  P('Star jump', [140, 40], [140, 40], [-115, -65], [-115, -65]),
  P('Tree', [100, 80], [95, 85], [-92, 12], [-92, -88]),
  P('Left reach', [180, -60], [180, -60]),
  P('Right reach', [-120, 0], [-120, 0]),
  P('Big stretch', [120, 60], [60, 120], [-100, -80], [-100, -80]),
];

// How close is a body to a pose, 0..100. Arms count most; legs only count when they are in the picture. null = cannot see enough.
// Generous on purpose (it is a party): about 25 degrees off still scores around 75.
export function scorePose(body, pose) {
  const got = boneAngles(body);
  let sum = 0, weight = 0, armsSeen = 0;
  for (const name of BONE_NAMES) {
    if (got[name] === null) continue;
    if (name.endsWith('ua') || name.endsWith('fa')) armsSeen += 1;
    const err = Math.abs(wrap(got[name] - pose[name]));
    sum += WEIGHT[name] * Math.max(0, Math.min(1, 1.25 * (1 - err / 65)));
    weight += WEIGHT[name];
  }
  if (armsSeen < 3) return null;
  return Math.round((100 * sum) / weight);
}

// The stick figure of a pose (to draw on the TV): joints in a box 0..1 wide and 0..1.3 tall, head on top
export function figureOf(pose) {
  const sh = 0.13, torso = 0.42, ua = 0.2, fa = 0.18, th = 0.26, shin = 0.26;
  const cx = 0.5, shY = 0.3;
  const at = (p, deg, len) => ({ x: p.x + Math.cos(deg / DEG) * len, y: p.y - Math.sin(deg / DEG) * len });
  const neck = { x: cx, y: shY }, lS = { x: cx - sh, y: shY }, rS = { x: cx + sh, y: shY };
  const hipY = shY + torso, lH = { x: cx - 0.07, y: hipY }, rH = { x: cx + 0.07, y: hipY };
  const lE = at(lS, pose.Lua, ua), lW = at(lE, pose.Lfa, fa), rE = at(rS, pose.Rua, ua), rW = at(rE, pose.Rfa, fa);
  const lK = at(lH, pose.Lth, th), lA = at(lK, pose.Lsh, shin), rK = at(rH, pose.Rth, th), rA = at(rK, pose.Rsh, shin);
  return { head: { x: cx, y: 0.14, r: 0.085 }, neck, lS, rS, lH, rH, lE, lW, rE, rW, lK, lA, rK, rA, mid: { x: cx, y: hipY } };
}

// ---------- who is who: keep each person's number from frame to frame ----------
export function createPeopleTracker({ max = 4, lostAfterMs = 1500 } = {}) {
  let people = []; // { id, x, last }
  let nextId = 1;
  const centre = (b) => { const hips = [b[LM.lHip], b[LM.rHip]].filter((p) => p?.vis), sh = [b[LM.lSh], b[LM.rSh]].filter((p) => p?.vis), use = hips.length ? hips : sh; return use.length ? use.reduce((s, p) => s + p.x, 0) / use.length : null; };
  return {
    // bodies: display-space bodies. Returns [{ id, body }] (a person keeps their id while they are in the picture)
    update(bodies, now) {
      const todo = bodies.map((body) => ({ body, x: centre(body) })).filter((b) => b.x !== null);
      const out = [];
      const free = [...people];
      for (const b of todo.sort((a, c) => a.x - c.x)) {
        let best = null, bd = 0.45;
        for (const p of free) { const d = Math.abs(p.x - b.x); if (d < bd) { bd = d; best = p; } }
        if (best) { free.splice(free.indexOf(best), 1); best.x = b.x; best.last = now; out.push({ id: best.id, body: b.body }); }
        else if (people.length < max || people.some((p) => now - p.last > lostAfterMs)) {
          people = people.filter((p) => now - p.last <= lostAfterMs || free.indexOf(p) < 0);
          const p = { id: nextId++, x: b.x, last: now }; people.push(p); out.push({ id: p.id, body: b.body });
        }
      }
      people = people.filter((p) => now - p.last <= lostAfterMs);
      return out.sort((a, c) => centre(a.body) - centre(c.body));
    },
    reset() { people = []; nextId = 1; },
  };
}

// ---------- rep counters ----------
// Each takes a display-space body per frame: counter.update(body, nowMs) -> reps so far. They smooth the landmarks a little and
// use thresholds with a gap between "down" and "up" (so jitter does not count twice). Easy on purpose: this is a party, not a gym.
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function smoother(alpha = 0.55) {
  let prev = null;
  return (body) => {
    prev = prev ? body.map((p, i) => ({ ...p, x: prev[i].x + (p.x - prev[i].x) * alpha, y: prev[i].y + (p.y - prev[i].y) * alpha })) : body;
    return prev;
  };
}

export function createSquatCounter() {
  const smooth = smoother();
  let reps = 0, down = false, base = null, torsoLen = 0.3;
  return {
    get reps() { return reps; },
    update(raw) {
      const b = smooth(raw);
      if (!(b[LM.lSh].vis && b[LM.rSh].vis && b[LM.lHip].vis && b[LM.rHip].vis)) return reps;
      const sh = mid(b[LM.lSh], b[LM.rSh]), hip = mid(b[LM.lHip], b[LM.rHip]);
      torsoLen = Math.max(0.12, torsoLen * 0.9 + dist(sh, hip) * 0.1);
      // how far the shoulders are below where they were when standing tall (the highest they have been lately)
      base = base === null ? sh.y : Math.min(sh.y, base + 0.0006); // (the baseline creeps down slowly, jumps up at once)
      const drop = (sh.y - base) / torsoLen;
      if (!down && drop > 0.38) down = true;
      else if (down && drop < 0.16) { down = false; reps += 1; }
      return reps;
    },
    reset() { reps = 0; down = false; base = null; },
  };
}

export function createJackCounter() {
  const smooth = smoother();
  let reps = 0, open = false;
  return {
    get reps() { return reps; },
    update(raw) {
      const b = smooth(raw);
      if (!(b[LM.lSh].vis && b[LM.rSh].vis && b[LM.lWr].vis && b[LM.rWr].vis)) return reps;
      const shW = Math.max(0.1, dist(b[LM.lSh], b[LM.rSh])), torso = Math.max(0.15, b[LM.lHip].vis ? Math.abs(mid(b[LM.lHip], b[LM.rHip]).y - mid(b[LM.lSh], b[LM.rSh]).y) : shW * 1.6);
      const shY = (b[LM.lSh].y + b[LM.rSh].y) / 2;
      const armsUp = b[LM.lWr].y < shY - 0.1 * torso && b[LM.rWr].y < shY - 0.1 * torso;
      const armsDown = b[LM.lWr].y > shY + 0.45 * torso && b[LM.rWr].y > shY + 0.45 * torso;
      const feet = b[LM.lAnk].vis && b[LM.rAnk].vis ? dist(b[LM.lAnk], b[LM.rAnk]) / shW : null; // (feet out of the picture: the arms decide)
      const wide = feet === null ? true : feet > 1.5, together = feet === null ? true : feet < 1.3;
      if (!open && armsUp && wide) { open = true; }
      else if (open && armsDown && together) { open = false; reps += 1; }
      else if (open && armsDown && feet !== null && feet < 1.45) { open = false; reps += 1; }
      return reps;
    },
    reset() { reps = 0; open = false; },
  };
}

export function createCircleCounter() {
  const smooth = smoother(0.6);
  const arms = [{ sh: LM.lSh, wr: LM.lWr, last: null, total: 0 }, { sh: LM.rSh, wr: LM.rWr, last: null, total: 0 }];
  return {
    get reps() { return Math.floor(Math.min(arms[0].total, arms[1].total) / (2 * Math.PI) + (Math.max(arms[0].total, arms[1].total) - Math.min(arms[0].total, arms[1].total) > 2 * Math.PI ? 0 : 0)); },
    update(raw) {
      const b = smooth(raw);
      const reach = Math.max(0.1, dist(b[LM.lSh], b[LM.rSh]));
      for (const a of arms) {
        const S = b[a.sh], W = b[a.wr];
        if (!S.vis || !W.vis || dist(S, W) < reach * 0.55) { a.last = null; continue; } // (a bent or hanging arm is not a circle)
        const ang = Math.atan2(W.y - S.y, W.x - S.x);
        if (a.last !== null) { let d = ang - a.last; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; if (Math.abs(d) < 1.2) a.total += Math.abs(d); }
        a.last = ang;
      }
      return this.reps;
    },
    reset() { for (const a of arms) { a.last = null; a.total = 0; } },
  };
}

export function createKneeCounter() {
  const smooth = smoother();
  let reps = 0;
  const legs = [{ hip: LM.lHip, knee: LM.lKnee, up: false }, { hip: LM.rHip, knee: LM.rKnee, up: false }];
  return {
    get reps() { return reps; },
    update(raw) {
      const b = smooth(raw);
      for (const l of legs) {
        const H = b[l.hip], K = b[l.knee], A = b[l === legs[0] ? LM.lAnk : LM.rAnk];
        if (!H.vis || !K.vis) continue;
        const thigh = Math.max(0.1, A?.vis ? Math.abs(A.y - K.y) * 0.9 : 0.2);
        const lift = (K.y - H.y) / thigh; // 0 = knee at hip height, 1 = knee a thigh below the hip (standing)
        if (!l.up && lift < 0.42) { l.up = true; reps += 1; }
        else if (l.up && lift > 0.8) l.up = false;
      }
      return reps;
    },
    reset() { reps = 0; for (const l of legs) l.up = false; },
  };
}

export const EXERCISES = [
  { id: 'squats', name: 'Squats', how: 'Bend your knees and sit down, then stand tall', icon: '🏋️', make: createSquatCounter, unit: 'squats' },
  { id: 'jacks', name: 'Jumping jacks', how: 'Jump your feet apart with your arms up, then back together', icon: '🤸', make: createJackCounter, unit: 'jacks' },
  { id: 'circles', name: 'Arm circles', how: 'Arms out wide, draw big circles in the air', icon: '🌀', make: createCircleCounter, unit: 'circles' },
  { id: 'knees', name: 'High knees', how: 'Run on the spot and lift your knees up high', icon: '🏃', make: createKneeCounter, unit: 'knees' },
];
