// Mirror Match and Party Workout without a camera: poses, scores and rep counters fed with pretend bodies. npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { LM, POSES, figureOf, scorePose, boneAngles, toDisplay, createPeopleTracker, createSquatCounter, createJackCounter, createCircleCounter, createKneeCounter, EXERCISES } from '../public/games/camera/pose-math.js';

// A display-space body (what the games work with) standing at centre x, built from a pose's stick figure
const blank = () => Array.from({ length: 33 }, () => ({ x: 0, y: 0, v: 0, vis: false }));
function bodyOf(pose, { cx = 0.9, dx = 0, dy = 0, legs = true } = {}) {
  const f = figureOf(pose), b = blank();
  const put = (i, p) => { b[i] = { x: p.x - 0.5 + cx + dx, y: p.y + dy, v: 1, vis: true }; };
  put(LM.nose, { x: f.head.x, y: f.head.y });
  put(LM.lSh, f.lS); put(LM.lEl, f.lE); put(LM.lWr, f.lW); put(LM.rSh, f.rS); put(LM.rEl, f.rE); put(LM.rWr, f.rW); // (a mirror shows the person's left arm on the screen's left)
  put(LM.lHip, f.lH); put(LM.rHip, f.rH);
  if (legs) { put(LM.lKnee, f.lK); put(LM.lAnk, f.lA); put(LM.rKnee, f.rK); put(LM.rAnk, f.rA); }
  return b;
}
const STAND = { name: 'Stand', Lua: -92, Lfa: -92, Rua: -92, Rfa: -92, Lth: -92, Lsh: -92, Rth: -92, Rsh: -92 }, by = (n) => POSES.find((p) => p.name === n);

test('there are plenty of poses and each has all eight bones', () => {
  assert.ok(POSES.length >= 10);
  for (const p of POSES) for (const k of ['Lua', 'Lfa', 'Rua', 'Rfa', 'Lth', 'Lsh', 'Rth', 'Rsh']) assert.equal(typeof p[k], 'number', `${p.name}.${k}`);
  assert.equal(new Set(POSES.map((p) => p.name)).size, POSES.length, 'names are different');
});

test('a body in the pose scores (nearly) full marks, a different pose scores low', () => {
  for (const p of POSES) assert.ok(scorePose(bodyOf(p), p) >= 97, `${p.name} matches itself`);
  const t = by('Tall T'), v = by('Victory V');
  assert.ok(scorePose(bodyOf(t), v) < 60, 'T vs V');
  assert.ok(scorePose(bodyOf(by('Hands on hips')), by('Hands up high')) < 35, 'hips vs hands up');
});

test('a pose that is a bit off still scores well (it is a party), and the score falls as it gets worse', () => {
  const t = by('Tall T');
  const off = (deg) => ({ ...t, Lua: t.Lua - deg, Lfa: t.Lfa - deg, Rua: t.Rua + deg, Rfa: t.Rfa + deg });
  const s = [0, 15, 30, 60, 90].map((d) => scorePose(bodyOf(off(d)), t));
  assert.ok(s[1] >= 85 && s[2] >= 60 && s[2] < s[1] && s[3] < s[2] && s[4] < 35, `scores ${s}`);
});

test('legs out of the picture do not hurt; not seeing the arms gives no score', () => {
  const p = by('Victory V');
  assert.ok(scorePose(bodyOf(p, { legs: false }), p) >= 97);
  const b = bodyOf(p); for (const i of [LM.lEl, LM.lWr, LM.rEl, LM.rWr]) b[i].vis = false;
  assert.equal(scorePose(b, p), null);
});

test('real landmarks (mirrored picture, wide screen) become display space with true angles', () => {
  // a person holding both arms straight out to the sides, in the raw camera picture
  const raw = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  Object.assign(raw[LM.lSh], { x: 0.55, y: 0.3 }); Object.assign(raw[LM.rSh], { x: 0.45, y: 0.3 });
  Object.assign(raw[LM.lEl], { x: 0.65, y: 0.3 }); Object.assign(raw[LM.rEl], { x: 0.35, y: 0.3 });
  Object.assign(raw[LM.lWr], { x: 0.75, y: 0.3 }); Object.assign(raw[LM.rWr], { x: 0.25, y: 0.3 });
  const a = boneAngles(toDisplay(raw, 16 / 9));
  assert.ok(Math.abs(Math.abs(a.Lua) - 180) < 1 && Math.abs(a.Rua) < 1, `T-pose angles ${a.Lua} ${a.Rua}`);
});

test('people keep their number while they move, and new people get new numbers (up to four)', () => {
  const t = createPeopleTracker();
  const at = (cx) => bodyOf(STAND, { cx });
  let r = t.update([at(0.4), at(1.4)], 0);
  assert.deepEqual(r.map((p) => p.id), [1, 2]);
  r = t.update([at(0.45), at(1.35)], 100);
  assert.deepEqual(r.map((p) => p.id), [1, 2], 'small moves: same people');
  r = t.update([at(1.35)], 200);
  assert.deepEqual(r.map((p) => p.id), [2]);
  r = t.update([at(0.4), at(0.9), at(1.35)], 300);
  assert.deepEqual(r.map((p) => p.id).sort(), [1, 2, 3].sort());
});

// ---- the counters ----
const fps = 30;
function run(counter, frames) { let n = 0; frames.forEach((b, i) => { n = counter.update(b, i * (1000 / fps)); }); return n; }
const wave = (period, secs) => Array.from({ length: Math.round(secs * fps) }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (period * fps))); // 0..1..0

test('squats: each sit-down and stand-up is one; standing still or swaying is none', () => {
  const frames = wave(2, 10).map((w) => bodyOf(STAND, { dy: w * 0.2, dx: 0 })); // shoulders drop 0.2 (a torso is 0.42)
  assert.equal(run(createSquatCounter(), frames), 5, '10 s at one squat per 2 s');
  const still = wave(2, 10).map((w) => bodyOf(STAND, { dy: w * 0.015 }));
  assert.equal(run(createSquatCounter(), still), 0, 'a small sway is not a squat');
  const jump = wave(1, 6).map((w) => bodyOf(STAND, { dy: -w * 0.1 }));
  assert.equal(run(createSquatCounter(), jump), 0, 'jumping up is not a squat');
});

test('jumping jacks: arms up with the feet apart, then back together, is one', () => {
  const closed = by('Tall T');
  const down = { ...STAND };
  const up = { ...by('Star jump') };
  const frames = wave(1.4, 14).map((w) => bodyOf(w > 0.5 ? up : down));
  const n = run(createJackCounter(), frames);
  assert.ok(n >= 9 && n <= 10, `about 10 jacks in 14 s (${n})`);
  assert.equal(run(createJackCounter(), wave(1.4, 8).map(() => bodyOf(down))), 0, 'standing still is none');
  assert.equal(closed.name, 'Tall T');
});

test('jumping jacks still count when the feet are out of the picture (the arms decide)', () => {
  const frames = wave(1.4, 14).map((w) => bodyOf(w > 0.5 ? by('Victory V') : STAND, { legs: false }));
  assert.ok(run(createJackCounter(), frames) >= 9);
});

test('arm circles: each full turn of the arms is one', () => {
  const frames = Array.from({ length: 10 * fps }, (_, i) => {
    const a = (2 * Math.PI * i) / (1.0 * fps); // one turn per second, both arms
    const b = bodyOf(by('Tall T'));
    for (const [sh, wr, side] of [[LM.lSh, LM.lWr, -1], [LM.rSh, LM.rWr, 1]]) { b[wr] = { ...b[wr], x: b[sh].x + Math.cos(a + (side < 0 ? Math.PI : 0) * 0) * 0.3 * side, y: b[sh].y + Math.sin(a) * 0.3 }; }
    return b;
  });
  const n = run(createCircleCounter(), frames);
  assert.ok(n >= 8 && n <= 10, `about 10 circles (${n})`);
  assert.equal(run(createCircleCounter(), wave(1, 6).map(() => bodyOf(by('Tall T')))), 0, 'arms held out is none');
});

test('high knees: every knee that is lifted to the hip is one', () => {
  const lifted = { ...STAND, Lth: -5, Lsh: -90 }; // the screen-left thigh sideways: the knee at hip height
  const frames = [];
  for (let i = 0; i < 8 * fps; i++) { const s = Math.floor(i / (fps / 3)) % 2; frames.push(bodyOf(i % (fps / 1.5) < fps / 3 ? (s ? { ...lifted, Lth: -92, Rth: -5, Rsh: -90 } : lifted) : STAND)); }
  const n = run(createKneeCounter(), frames);
  assert.ok(n >= 8, `knees counted (${n})`);
  assert.equal(run(createKneeCounter(), wave(1, 6).map(() => bodyOf(STAND))), 0, 'standing is none');
});

test('every exercise has a counter that starts at zero and resets', () => {
  assert.equal(EXERCISES.length, 4);
  for (const e of EXERCISES) { const c = e.make(); assert.equal(c.reps, 0); c.reset(); assert.equal(c.reps, 0); assert.ok(e.name && e.how && e.icon); }
});
