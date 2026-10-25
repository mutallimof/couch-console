// The ported kart rules, tested without a browser: npm test
// Adapted from OpenWii's games/mario-kart/logic.test.mjs (MIT, Copyright (c) 2026 Patrick Sun; see
// THIRD_PARTY_NOTICES.md): the same checks, run on one of our tracks with our item names.
import test from "node:test";
import assert from "node:assert/strict";
import { Race as BaseRace, topSpeed, turboTier, rollItem, seeded, EVENT_TYPES } from "../public/games/turbo-karts/ow-kart/rules.js";
import { createTrackModel, wrap, angle } from "../public/games/turbo-karts/ow-kart/track-model.js";
import { TRACKS as KART_TRACKS } from "../public/games/turbo-karts/kart-path.js";
import { STADIUM } from "../public/games/turbo-karts/ow-kart/stadium/stadium-def.js";
const TRACKS = [...KART_TRACKS, STADIUM]; // our six courses plus the Grand Stadium
import { GP_CHARACTERS as CHARACTERS } from "../public/games/turbo-karts/ow-kart/characters.js";

const T = createTrackModel(TRACKS.find((t) => t.id === "park"));
const L = T.length, TRACK_SAMPLES = T.samples, BOOST_PADS = T.boostPads;
const { trackAt, surfaceAt, project } = T;
const SECTIONS = { glideStart: T.glides[0].start, glideEnd: T.glides[0].end };
class Race extends BaseRace {
  constructor(o = {}) { super({ track: T, characters: CHARACTERS.slice(0, 8), ...o }); }
}
const step = (race, t, input = {}) => {
  for (let i = 0; i < Math.round(t * 120); i++) race.update(1 / 120, input);
};
function place(r, s, l = 0) {
  const p = surfaceAt(s, l);
  Object.assign(r, {
    s: wrap(s, L),
    progress: s,
    x: p.x,
    y: p.y,
    z: p.z,
    heading: p.heading,
    lateral: l,
  });
}
function solo(s = 50) {
  const race = new Race({ seed: 5 });
  race.start();
  step(race, 3.1);
  race.coins = [];
  race.boxes = [];
  place(race.player, s);
  for (const r of race.racers.slice(1)) {
    place(r, 700 + r.id * 20);
    r.finishTime = 1000 + r.id;
  }
  return race;
}
function finite(r) {
  for (const k of ["x", "y", "z", "heading", "speed", "progress", "lateral"])
    assert.ok(Number.isFinite(r[k]), k);
}
test("course length independently equals the polyline perimeter and projection closes at seam", () => {
  let sum = 0;
  for (let i = 0; i < TRACK_SAMPLES.length; i++) {
    const a = TRACK_SAMPLES[i],
      b = TRACK_SAMPLES[(i + 1) % TRACK_SAMPLES.length];
    sum += Math.hypot(a.x - b.x, a.z - b.z);
  }
  assert.ok(Math.abs(sum - L) < 1e-8);
  for (const s of [0, L / 3, L - 0.1, -0.1]) {
    const p = trackAt(s),
      q = project(p.x, p.z, s);
    assert.ok(Math.abs(angle(((q.s - wrap(s, L)) / L) * Math.PI * 2)) < 1e-6);
  }
});
test("track offset is perpendicular to tangent; banked elevation follows geometry", () => {
  for (const s of [50, 200, 400]) {
    const a = surfaceAt(s, 0),
      b = surfaceAt(s, 5);
    assert.ok(Math.abs((b.x - a.x) * a.tx + (b.z - a.z) * a.tz) < 1e-8);
    assert.ok(Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - 5) < 1e-8);
    assert.ok(Math.abs(b.y - a.y) < 1e-8); // (our roads are not banked)
  }
});
test("zero steering is a straight world-space line; no uncommanded yaw", () => {
  const race = solo(),
    r = race.player,
    h = r.heading,
    x = r.x,
    z = r.z;
  r.speed = 20;
  step(race, 1, { gas: true });
  const cross = (r.x - x) * -Math.cos(h) - (r.z - z) * Math.sin(h);
  assert.ok(Math.abs(cross) < 1e-8);
  assert.ok(Math.abs(angle(r.heading - h)) < 1e-10);
  assert.ok(Math.hypot(r.x - x, r.z - z) > 20);
});
test("acceleration, coasting, brake and controlled reverse have distinct effects", () => {
  const race = solo(),
    r = race.player;
  step(race, 1, { gas: true });
  assert.ok(r.speed > 10);
  const fast = r.speed;
  step(race, 0.5);
  assert.ok(r.speed < fast && r.speed > 0);
  step(race, 1.5, { brake: true });
  assert.ok(r.speed < 0 && r.speed >= -12);
  const reverse = r.speed;
  step(race, 0.3, { gas: true });
  assert.ok(r.speed > reverse);
});
test("coins monotonically improve top speed and cap at ten", () => {
  for (let i = 0; i < 10; i++) assert.ok(topSpeed(i + 1) > topSpeed(i));
  assert.equal(topSpeed(100), topSpeed(10));
  assert.equal(topSpeed(-5), topSpeed(0));
  const race = solo(),
    r = race.player;
  r.coins = 9;
  race.coins = [
    { s: r.s, lateral: r.lateral, respawn: 0 },
    { s: r.s, lateral: r.lateral, respawn: 0 },
  ];
  step(race, 0.02);
  assert.equal(r.coins, 10);
});
test("off-road loses speed, mushroom crosses grass at racing speed", () => {
  const road = solo(70),
    grass = solo(70),
    boosted = solo(70);
  place(grass.player, 70, 12);
  place(boosted.player, 70, 12);
  boosted.player.boost = 2;
  for (const a of [road, grass, boosted]) {
    a.player.speed = 30;
    step(a, 0.35, { gas: true });
  }
  assert.ok(grass.player.speed < road.player.speed);
  assert.ok(boosted.player.speed > grass.player.speed * 1.5);
});
test("walls contain the kart without reversing its heading or creating NaN", () => {
  const race = solo(),
    r = race.player;
  place(r, 60, 14);
  r.speed = 25;
  r.heading += 0.3;
  step(race, 0.4, { gas: true, steer: 1 });
  assert.ok(Math.abs(r.lateral) < 14.6);
  assert.ok(Math.abs(angle(r.heading - trackAt(r.s).heading)) < Math.PI / 2);
  finite(r);
});
test("boost pads activate spatially, unrelated center lane does not", () => {
  const pad = BOOST_PADS[0],
    race = solo(pad.s);
  place(race.player, pad.s, pad.lateral);
  step(race, 0.02, { gas: true });
  assert.ok(race.player.boost > 0);
  const miss = solo(pad.s);
  place(miss.player, pad.s, 0);
  step(miss, 0.02);
  assert.equal(miss.player.boost, 0);
});
test("fixed step yields same physical result for 30, 60, 144 Hz presentation", () => {
  const results = [30, 60, 144].map((hz) => {
    const r = solo();
    r.player.speed = 17;
    for (let i = 0; i < hz; i++) r.update(1 / hz, { gas: true, steer: 0.12 });
    return r.player;
  });
  for (const r of results.slice(1))
    for (const k of ["x", "z", "speed", "heading"])
      assert.ok(Math.abs(r[k] - results[0][k]) < 1e-8, `${k} ${r[k]}`);
});
test("NaN/infinity steering and dropped frame are bounded", () => {
  const race = solo();
  race.update(NaN, { steer: NaN });
  race.update(99, { gas: true, steer: Infinity });
  finite(race.player);
  assert.ok(race.player.speed < 10);
  assert.ok(Math.abs(race.player.heading - trackAt(50).heading) < 1e-5);
});
test("rocket start rewards the second-light window and burns out early holding", () => {
  const early = new Race(),
    timed = new Race(),
    late = new Race();
  for (const r of [early, timed, late]) r.start();
  step(early, 3.1, { gas: true });
  step(timed, 1.7);
  step(timed, 1.4, { gas: true });
  step(late, 2.9);
  step(late, 0.2, { gas: true });
  assert.ok(early.player.spin > 0);
  assert.ok(timed.player.boost > 1);
  assert.equal(late.player.boost, 0);
  assert.ok(timed.player.speed > late.player.speed * 3);
});
test("hop only starts on a fresh press; held drift charges three increasing tiers", () => {
  const race = solo(),
    r = race.player;
  r.speed = 25;
  step(race, 0.05, { gas: true, drift: true, steer: 0.3 });
  assert.ok(r.hop > 0);
  assert.equal(r.drift, 1);
  // Sweep the public tier classifier rather than assuming its implementation thresholds.
  const found = [];
  for (let t = 0; t <= 5; t += 0.01) {
    const tier = turboTier(t);
    if (!found.includes(tier)) found.push(tier);
  }
  assert.deepEqual(found, [0, 1, 2, 3]);
  const durations = [];
  for (const charge of [1, 2.5, 4]) {
    const a = solo();
    a.player.speed = 25;
    a.player.drift = 1;
    a.player.charge = charge;
    a.player.lastInput = { drift: true };
    step(a, 0.01, { gas: true });
    durations.push(a.player.boost);
    assert.equal(a.player.drift, 0);
  }
  assert.ok(
    durations[0] > 0 &&
      durations[1] > durations[0] &&
      durations[2] > durations[1],
  );
});
test("item roulette is delayed, contains only supported items and favors recovery at back", () => {
  const race = solo(),
    r = race.player;
  race.boxes = [{ s: r.s, lateral: 0, respawn: 0 }];
  step(race, 0.02);
  assert.ok(r.roulette > 1);
  assert.equal(r.item, null);
  step(race, 2);
  assert.ok(
    ["slick", "orb", "seeker", "turbo", "star", "comet"].includes(r.item),
  );
  const front = {},
    back = {},
    a = seeded(74),
    b = seeded(74);
  for (let i = 0; i < 12000; i++) {
    const x = rollItem(1, a),
      y = rollItem(8, b);
    front[x] = (front[x] || 0) + 1;
    back[y] = (back[y] || 0) + 1;
  }
  for (const key of ["turbo", "star", "comet"])
    assert.ok(back[key] > front[key] * 2);
  assert.ok(front.slick > back.slick * 3);
});
test("every usable item is consumed and produces its own mechanical effect", () => {
  for (const item of ["slick", "orb", "seeker", "turbo", "star", "comet"]) {
    const race = solo(),
      r = race.player;
    r.item = item;
    assert.equal(race.useItem(), true);
    assert.equal(r.item, null);
    if (item === "turbo") assert.ok(r.boost > 2);
    else if (item === "star") assert.ok(r.star > 5);
    else assert.equal(race.objects[0].type, item);
    assert.equal(race.useItem(), false);
  }
});
test("banana placement is behind its owner and collides with an approaching racer", () => {
  const race = solo(100),
    r = race.player;
  r.item = "slick";
  race.useItem();
  const o = race.objects[0];
  assert.ok(o.s < r.s);
  assert.equal(o.speed, 0);
  const victim = race.racers[1];
  victim.finishTime = null;
  place(victim, o.s - 1);
  victim.speed = 25;
  step(race, 0.12);
  assert.ok(victim.spin > 0);
});
test("green shell ricochets and swept collision catches a crossing", () => {
  const race = solo(100),
    r = race.player;
  r.item = "orb";
  race.useItem();
  const o = race.objects[0];
  o.lateral = 14;
  o.lateralVelocity = 40;
  step(race, 0.05);
  assert.ok(o.lateralVelocity < 0);
  place(r, 150);
  r.speed = 0;
  o.s = 149.5;
  o.lateral = r.lateral;
  o.lateralVelocity = 0;
  o.age = 2;
  o.speed = 200;
  step(race, 0.01);
  assert.ok(r.spin > 0);
});
test("red shell homes toward the nearest opponent ahead; blue targets leader", () => {
  const race = solo(100);
  for (let i = 1; i < 8; i++) {
    race.racers[i].finishTime = null;
    place(race.racers[i], 100 + i * 20, i % 2 ? 5 : -5);
  }
  race.player.item = "seeker";
  race.useItem();
  let o = race.objects[0];
  assert.equal(o.target, 1);
  const before = o.lateral;
  step(race, 0.2);
  assert.ok(o.lateral > before);
  race.player.item = "comet";
  race.useItem();
  o = race.objects.at(-1);
  assert.equal(o.target, 7);
});
test("star prevents spin and collision immunity prevents repeat punishment", () => {
  const race = solo(),
    r = race.player;
  r.coins = 7;
  r.star = 1;
  assert.equal(race.hit(r), false);
  r.star = 0;
  assert.equal(race.hit(r), true);
  assert.ok(r.spin > 0 && r.coins < 7);
  const coins = r.coins;
  assert.equal(race.hit(r), false);
  assert.equal(r.coins, coins);
  step(race, 3);
  assert.equal(r.spin, 0);
});
test("a glide ramp launches the kart and it lands again on the road beyond the ramp", () => {
  const race = solo(SECTIONS.glideStart - 0.2),
    r = race.player;
  r.speed = 36;
  step(race, 0.03, { gas: true });
  assert.ok(r.gliding);
  const launchY = r.y;
  step(race, 0.5, { gas: true });
  assert.ok(r.y > launchY);
  for (let i = 0; i < 800 && r.gliding; i++)
    race.update(1 / 120, race.cpuInput(r));
  assert.equal(r.gliding, false);
  assert.ok(r.s > SECTIONS.glideEnd);
});
test("finish line oscillation and reverse driving cannot manufacture laps", () => {
  const race = solo(-1),
    r = race.player;
  for (let i = 0; i < 20; i++) {
    place(r, -1);
    r.speed = 10;
    step(race, 0.2);
    place(r, 1);
    r.speed = -10;
    step(race, 0.2);
  }
  assert.equal(r.lap, 1);
  assert.equal(r.checkpoints, 0);
  assert.equal(r.finishTime, null);
});
test("eight distinct racers finish three laps through all gates with deterministic standings", () => {
  const race = new Race({ seed: 90 });
  race.start();
  for (let i = 0; i < 24000 && race.state !== "results"; i++)
    race.update(1 / 120, race.cpuInput(race.player));
  assert.equal(race.state, "results");
  assert.equal(new Set(race.racers.map((r) => r.character.id)).size, 8);
  assert.equal(new Set(race.racers.map((r) => r.skill)).size, 8);
  assert.equal(race.finishOrder.length, 8);
  for (const r of race.racers) {
    assert.equal(r.checkpoints, 24);
    assert.ok(r.finishTime > 60 && r.finishTime < 200);
    finite(r);
  }
  for (let i = 1; i < 8; i++)
    assert.ok(race.standings[i].finishTime >= race.standings[i - 1].finishTime);
});
test("CPU rubber band is bounded and does not teleport or finish without driving", () => {
  const a = solo(),
    b = solo();
  a.player.progress = 1500;
  b.player.progress = -1500;
  const ra = a.racers[1],
    rb = b.racers[1];
  ra.finishTime = rb.finishTime = null;
  place(ra, 300);
  place(rb, 300);
  ra.speed = rb.speed = 40;
  a.move(ra, { gas: true }, 1 / 120, true);
  b.move(rb, { gas: true }, 1 / 120, true);
  assert.ok(ra.speed > rb.speed);
  assert.ok(ra.progress < 301 && rb.progress < 301);
  assert.ok(ra.speed / rb.speed < 1.3);
});
test("red and blue shells actually reach and spin their intended targets", () => {
  for (const type of ["seeker", "comet"]) {
    const race = solo(100),
      target = race.racers[1];
    target.finishTime = null;
    place(target, 115, 4);
    race.player.item = type;
    race.useItem();
    let hit = false;
    const original = race.onEvent;
    race.onEvent = (e) => {
      if (e.type === "hit" && e.racer === target.id) hit = true;
      original(e);
    };
    for (let i = 0; i < 1000 && !hit; i++) race.update(1 / 120, { gas: true });
    assert.ok(hit, type + " must connect");
  }
});
test("race completion remains viable across different item and AI seeds", () => {
  for (const seed of [1, 7, 19, 31, 83, 101]) {
    const race = new Race({ seed });
    race.start();
    for (let i = 0; i < 23000 && race.state !== "results"; i++)
      race.update(1 / 120, race.cpuInput(race.player));
    assert.equal(race.state, "results", "seed " + seed);
    assert.equal(race.finishOrder.length, 8);
  }
});
test("a slow launch still deploys the glider; a novice cannot fall through the gap", () => {
  const race = solo(SECTIONS.glideStart - 0.01),
    r = race.player;
  r.speed = 2;
  step(race, 0.02, { gas: true });
  assert.ok(r.gliding);
  assert.ok(r.speed > 20);
});
test("player starts eighth and malformed character choice retains all eight unique racers", () => {
  for (const character of ["mario", "peach", "not-a-racer"]) {
    const race = new Race({ character });
    assert.equal(race.position(race.player), 8);
    assert.equal(new Set(race.racers.map((r) => r.character.id)).size, 8);
  }
});

test("results continue automatic driving without changing finish times or accepting player braking", () => {
  const race=solo(50);race.state='results';race.player.finishTime=90;
  for(const r of race.racers)r.speed=30;
  const before=race.racers.map(r=>({x:r.x,z:r.z,finishTime:r.finishTime}));
  step(race,1,{brake:true,steer:1,item:true});
  for(const [i,r] of race.racers.entries()){
    assert.equal(r.finishTime,before[i].finishTime);
    assert.ok(Math.hypot(r.x-before[i].x,r.z-before[i].z)>20);
  }
  assert.equal(race.state,'results');
});
test("same mystery box becomes collectible again after one second", () => {
  const race=solo(50),r=race.player;
  race.boxes=[{s:r.s,lateral:0,respawn:0}];step(race,1/120);
  assert.equal(race.boxes[0].respawn,1);
  place(r,80);step(race,.9);assert.ok(race.boxes[0].respawn>0);
  step(race,.1+1/120);assert.equal(race.boxes[0].respawn,0);
});
test("shell launch events identify the exact projectile, including consecutive throws", () => {
  const events=[],race=solo(50);race.onEvent=e=>events.push(e);
  for(const item of ['orb','seeker','comet']){race.player.item=item;race.useItem();}
  assert.deepEqual(events.filter(e=>e.type==='useItem').map(e=>e.projectile),race.objects.map(o=>o.id));
  assert.equal(new Set(race.objects.map(o=>o.id)).size,3);
});


test('one-lap race finishes at eight gates and keeps driving after early results',()=>{
 const events=[],race=new Race({seed:90,laps:1,onEvent:e=>events.push(e)});
 race.start();
 for(let i=0;i<16000 && race.player.finishTime===null;i++)race.update(1/120,race.cpuInput(race.player));
 assert.ok(race.player.finishTime>15 && race.player.finishTime<80);
 assert.equal(race.player.checkpoints,8);
 assert.equal(race.player.lap,1);
 assert.equal(events.filter(e=>e.type==='finish').length,1);
 assert.equal(events.filter(e=>e.type==='finalLap'&&e.racer===0).length,0);
 // An unfinished trailing rival must never gate the presentation or gain a fake time.
 const rival=race.racers[1];rival.finishTime=null;place(rival,100);rival.checkpoints=0;rival.nextCheckpoint=L/8;
 race.state='finishing';race.showResults();
 assert.equal(race.state,'results');assert.equal(rival.finishTime,null);
 const finishTime=race.player.finishTime,progress=race.player.progress;
 step(race,1,{brake:true});
 assert.ok(race.player.progress>progress);
 assert.equal(race.player.finishTime,finishTime);
});

// ---- Our additions: several human players, and all six of our tracks ----
function pilot(race, r) {
  const q = race.track.surfaceAt(r.s + 12, 0), want = Math.atan2(q.x - r.x, -(q.z - r.z));
  return { gas: true, steer: Math.max(-1, Math.min(1, angle(want - r.heading) * 2.8)) };
}
test("two human players: each starts at the back, is driven by their own input, and the race waits for both", () => {
  const race = new Race({ humans: 2, seed: 11 });
  assert.equal(race.humans.length, 2);
  assert.deepEqual(race.humans.map((h) => h.id), [0, 1]);
  // the two humans start behind all computer drivers
  const behind = Math.max(...race.racers.slice(2).map((r) => r.progress));
  for (const h of race.humans) assert.ok(h.progress <= behind, `human ${h.id} starts at the back`);
  race.start();
  step(race, 3.1);
  // player 1 steers hard right, player 2 hard left
  for (let i = 0; i < 120; i++) race.update(1 / 120, [{ gas: true, steer: 1 }, { gas: true, steer: -1 }]);
  assert.ok(race.humans[0].steer > 0.5 && race.humans[1].steer < -0.5, "each human has their own steering");
  // both drive to the end
  let finishedOne = null, guard = 0;
  while (race.state !== "results" && guard++ < 60 * 400) {
    race.update(1 / 60, race.humans.map((h) => pilot(race, h)));
    if (finishedOne === null && race.humans.some((h) => h.finishTime !== null)) finishedOne = race.state;
  }
  assert.equal(race.state, "results");
  assert.equal(finishedOne, "racing", "the race keeps going until every human has finished");
  assert.ok(race.humans.every((h) => h.checkpoints === 24));
});
test("every one of our tracks (six courses plus the Grand Stadium) can be raced for three laps by eight racers", () => {
  for (const def of TRACKS) {
    const track = createTrackModel(def), events = [];
    const race = new BaseRace({ track, characters: CHARACTERS.slice(0, 8), humans: 1, seed: 3, onEvent: (e) => events.push(e.type) });
    race.start();
    let guard = 0;
    while (race.state !== "results" && guard++ < 60 * 300) race.update(1 / 60, pilot(race, race.player));
    assert.equal(race.state, "results", `${def.id}: the race finished`);
    assert.equal(race.finishOrder.length, 8, `${def.id}: all eight finished`);
    for (const r of race.racers) assert.ok(r.finishTime > 40 && r.finishTime < 200, `${def.id}: racer ${r.id} finished in ${r.finishTime?.toFixed(0)} s`);
    assert.ok(events.includes("glider") && events.includes("land"), `${def.id}: the glide ramp was used`);
    assert.ok(race.racers.every((r) => Number.isFinite(r.x) && Number.isFinite(r.z) && Number.isFinite(r.y)), `${def.id}: nobody went off to infinity`);
  }
});
test("computer drivers stay on the road on every track (no wall-hugging, no getting stuck)", () => {
  for (const def of TRACKS) {
    const track = createTrackModel(def);
    const race = new BaseRace({ track, characters: CHARACTERS.slice(0, 8), humans: 1, seed: 5 });
    race.start();
    let walls = 0, minSpeed = 99, steps = 0;
    for (const r of race.racers) r.finishTime = null;
    const countWalls = (e) => { if (e.type === "wall") walls++; };
    race.onEvent = countWalls;
    for (let t = 0; t < 30 * 60; t += 1 / 60) {
      race.update(1 / 60, pilot(race, race.player));
      if (race.time > 8) for (const r of race.racers) if (r.finishTime === null && r.spin <= 0) minSpeed = Math.min(minSpeed, r.speed);
      steps++;
    }
    assert.ok(walls <= 20, `${def.id}: ${walls} wall touches in 30 seconds with 8 racers`);
    assert.ok(minSpeed > 0, `${def.id}: a racer came to a standstill`);
  }
});

// ---- Turbo Karts additions: the kart pad's input and the kart stats ----
import { kartInput } from "../public/games/turbo-karts/ow-kart/input.js";
test("holding DRIFT or ITEM keeps accelerating; BRAKE wins over everything", () => {
  assert.equal(kartInput({ gas: false, drift: true }).gas, true);
  assert.equal(kartInput({ item: true }).gas, true);
  assert.equal(kartInput({ gas: true, brake: true }).gas, false);
  assert.equal(kartInput({ gas: true, brake: true }).brake, true);
  assert.equal(kartInput({ steer: -1 }).steer, -1);
  assert.equal(kartInput({ tapped: true }).tapped, true);
});
test("kart stats nudge top speed, acceleration and turning (a 5-5-5 kart beats a 1-1-1 kart, 3-3-3 is OpenWii exactly)", () => {
  const run = (kart) => {
    const race = new BaseRace({ track: T, characters: CHARACTERS.slice(0, 8), karts: [kart], humans: 1, seed: 3 });
    race.start();
    for (let i = 0; i < 60 * 14; i++) race.update(1 / 60, pilot(race, race.player));
    return race.player;
  };
  const fast = run({ speed: 5, accel: 5, handling: 5 }), slow = run({ speed: 1, accel: 1, handling: 1 }), plain = run({ speed: 3, accel: 3, handling: 3 }), none = run(undefined);
  assert.ok(fast.progress > plain.progress && plain.progress > slow.progress, `${fast.progress} ${plain.progress} ${slow.progress}`);
  assert.equal(plain.progress, none.progress);
});
