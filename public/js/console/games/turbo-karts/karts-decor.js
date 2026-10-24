// Turbo Karts trackside decoration from the model packs: grandstands, banners, light posts,
// tents, trees, rocks, palm trees, pirate props. Repeated things (trees, rocks) are drawn as
// one InstancedMesh per part, so hundreds of them stay fast.
import { CAR, RACE, PIRATE, cloneOf } from './karts-assets.js';

// Height in meters we want each model to end up (they come in different sizes)
const SIZES = {
  [RACE('grandStandCovered')]: 8, [RACE('bannerTowerRed')]: 9, [RACE('bannerTowerGreen')]: 9,
  [RACE('lightPostLarge')]: 8, [RACE('billboard')]: 7, [RACE('flagGreen')]: 5, [RACE('flagRed')]: 5, [RACE('pylon')]: 1.1, [RACE('tentLong')]: 4, [RACE('flagCheckers')]: 5, [RACE('tent')]: 4,
  [CAR('tree')]: 8, [CAR('tree-pine')]: 9,
  [PIRATE('Environment_PalmTree_1')]: 11, [PIRATE('Environment_PalmTree_2')]: 10, [PIRATE('Environment_PalmTree_3')]: 12,
  [PIRATE('Environment_Rock_1')]: 4, [PIRATE('Environment_Rock_2')]: 5, [PIRATE('Environment_Rock_3')]: 3.5,
  [PIRATE('Environment_House1')]: 12, [PIRATE('Environment_House2')]: 11, [PIRATE('Environment_Dock')]: 3,
  [PIRATE('Ship_Large')]: 22, [PIRATE('Ship_Small')]: 12, [PIRATE('Prop_Barrel')]: 1.6, [PIRATE('Prop_Chest_Gold')]: 1.4,
  [PIRATE('Characters_Tentacle')]: 22, [PIRATE('Environment_Cliff1')]: 18, [PIRATE('Environment_Cliff3')]: 16,
};

// Which models each theme uses
export const THEME_MODELS = {
  common: [RACE('grandStandCovered'), RACE('bannerTowerRed'), RACE('bannerTowerGreen'), RACE('lightPostLarge'), RACE('flagCheckers'),
    RACE('billboard'), RACE('flagGreen'), RACE('flagRed'), RACE('pylon')],
  park: [CAR('tree'), RACE('tentLong'), RACE('tent')],
  desert: [PIRATE('Environment_Rock_1'), PIRATE('Environment_Rock_2'), PIRATE('Environment_Rock_3'), RACE('tent')],
  snow: [CAR('tree-pine')],
  city: [],
  sky: [CAR('tree')],
  pirate: [PIRATE('Environment_PalmTree_1'), PIRATE('Environment_PalmTree_2'), PIRATE('Environment_PalmTree_3'),
    PIRATE('Environment_Rock_1'), PIRATE('Environment_Rock_2'), PIRATE('Environment_House1'), PIRATE('Environment_House2'),
    PIRATE('Ship_Large'), PIRATE('Ship_Small'), PIRATE('Prop_Barrel'), PIRATE('Prop_Chest_Gold'), PIRATE('Characters_Tentacle'),
    PIRATE('Environment_Cliff1'), PIRATE('Environment_Cliff3')],
};

// The scale that makes this model `SIZES[path]` tall, and the point to stand it on:
// its lowest point, centered (some models have their origin off in a corner)
function measure(THREE, gltf, path) {
  gltf.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const h = Math.max(0.001, box.max.y - box.min.y);
  return { k: (SIZES[path] || 5) / h, minY: box.min.y, cx: (box.min.x + box.max.x) / 2, cz: (box.min.z + box.max.z) / 2 };
}

// Many copies of one model as InstancedMeshes. places: [{ x, y, z, rot, s }]
export function scatter(THREE, gltf, path, places) {
  const group = new THREE.Group();
  if (!gltf || !places.length) return group;
  const { k, minY, cx, cz } = measure(THREE, gltf, path);
  const m4 = new THREE.Matrix4(), base = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const center = new THREE.Matrix4().makeTranslation(-cx, -minY, -cz);
  gltf.scene.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh) return;
    const inst = new THREE.InstancedMesh(o.geometry, o.material, places.length);
    places.forEach((p, i) => {
      const s = k * (p.s || 1);
      e.set(0, p.rot || 0, 0); q.setFromEuler(e);
      // place · turn · scale · (centered model part)
      base.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(s, s, s)).multiply(center);
      m4.multiplyMatrices(base, o.matrixWorld);
      inst.setMatrixAt(i, m4);
    });
    inst.castShadow = true; inst.receiveShadow = true;
    group.add(inst);
  });
  return group;
}

// Decorate a built track. `assets` = Map path -> glTF; missing models are just skipped.
// Returns the decor group and the animation mixers to update every frame.
export function decorate(THREE, track, assets, spots) {
  const { pts, tan, nor, SAMPLES, def, island } = track;
  const group = new THREE.Group(), mixers = [];
  const get = (p) => assets.get(p);
  const at = (i) => ((i % SAMPLES) + SAMPLES) % SAMPLES;
  // A place beside the track: sample i, `side` meters from the center (+ = right), facing the road
  const beside = (i, side, s = 1) => {
    const k = at(i), p = pts[k], n = nor[k], t = tan[k];
    const facing = Math.atan2(t.x, t.z) + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
    return { x: p.x + n.x * side, y: 0, z: p.z + n.z * side, rot: facing, s };
  };
  // Never put anything on the road (on the figure-8, "beside" one part can be on the other part)
  const offRoad = (q) => {
    for (let i = 0; i < SAMPLES; i += 3) if ((pts[i].x - q.x) ** 2 + (pts[i].z - q.z) ** 2 < 14 ** 2) return false;
    return true;
  };
  const add = (path, places) => group.add(scatter(THREE, get(path), path, places.filter(offRoad)));

  // Start area: grandstands on both sides, banner towers and a checkered flag
  const turned = (p) => ({ ...p, rot: p.rot + Math.PI }); // the stands' seats are on their back side
  add(RACE('grandStandCovered'), [beside(30, 24), beside(-30, 24), beside(30, -24), beside(-30, -24)].map(turned));
  add(RACE('bannerTowerRed'), [beside(60, 17), beside(-60, -17)]);
  add(RACE('bannerTowerGreen'), [beside(60, -17), beside(-60, 17)]);
  add(RACE('flagCheckers'), [beside(8, 15), beside(8, -15)]);
  // Light posts all around the lap, alternating sides
  const posts = [];
  for (let i = 90; i < SAMPLES - 40; i += 70) posts.push(beside(i, (Math.floor(i / 70) % 2 ? 1 : -1) * 15.5));
  add(RACE('lightPostLarge'), posts);
  // More life along the lap: billboards facing the drivers, flags on both sides, cones at the corners
  const boards = [], flags = [[], []], cones = [];
  for (let i = 140; i < SAMPLES - 60; i += 110) boards.push(beside(i, (Math.floor(i / 110) % 2 ? -1 : 1) * 19, 1.1));
  for (let i = 60; i < SAMPLES - 30; i += 45) flags[Math.floor(i / 45) % 2].push(beside(i, (i % 2 ? 1 : -1) * 14.2));
  for (let i = 0; i < SAMPLES; i += 6) {
    // a corner: the road turns a lot between here and a bit further on -> a row of cones on the outside
    const a = tan[at(i)], b = tan[at(i + 20)], turn = a.x * b.z - a.z * b.x;
    if (Math.abs(turn) > 0.25 && i % 18 === 0) cones.push(beside(i, (turn > 0 ? -1 : 1) * 13.4));
  }
  add(RACE('billboard'), boards);
  add(RACE('flagGreen'), flags[0]);
  add(RACE('flagRed'), flags[1]);
  add(RACE('pylon'), cones);

  // Theme scenery at the free spots ([x, z, scale])
  const sp = (s, i) => ({ x: s[0], y: 0, z: s[1], rot: (i * 2.39) % 6.28, s: s[2] });
  if (def.theme === 'park') {
    add(CAR('tree'), spots.filter((_, i) => i % 9).map(sp));
    add(RACE('tentLong'), [beside(160, 22), beside(520, -22)]);
    add(RACE('tent'), [beside(170, 24), beside(530, -25), beside(780, 24)]);
  } else if (def.theme === 'sky') {
    add(CAR('tree'), spots.filter((_, i) => i % 3 === 0).map(sp));
    add(RACE('tent'), [beside(150, 22), beside(560, -24)]);
  } else if (def.theme === 'snow') {
    add(CAR('tree-pine'), spots.map(sp));
  } else if (def.theme === 'desert') {
    const rocks = [PIRATE('Environment_Rock_1'), PIRATE('Environment_Rock_2'), PIRATE('Environment_Rock_3')];
    rocks.forEach((r, n) => add(r, spots.filter((_, i) => i % 3 === n && i % 2).map(sp)));
    add(RACE('tent'), [beside(200, 22), beside(640, -22)]);
  } else if (def.theme === 'pirate') {
    const palms = [PIRATE('Environment_PalmTree_1'), PIRATE('Environment_PalmTree_2'), PIRATE('Environment_PalmTree_3')];
    palms.forEach((r, n) => add(r, spots.filter((_, i) => i % 4 === n).map(sp)));
    add(PIRATE('Environment_Rock_1'), spots.filter((_, i) => i % 4 === 3 && i % 8 === 3).map(sp));
    add(PIRATE('Environment_Rock_2'), spots.filter((_, i) => i % 8 === 7).map(sp));
    add(PIRATE('Environment_House1'), [beside(240, 30), beside(250, -32)]);
    add(PIRATE('Environment_House2'), [beside(700, 30), beside(150, -34)]);
    add(PIRATE('Prop_Barrel'), [beside(100, 12.5), beside(103, 12.8), beside(420, -12.5), beside(640, 12.6), beside(642, 13.5)]);
    add(PIRATE('Prop_Chest_Gold'), [beside(330, -13), beside(860, 13)]);
    // Out at sea (angle around the island, meters past the beach): ships, cliffs and a sea monster
    const sea = (angle, out, s = 1) => ({
      x: island.x + Math.cos(angle) * (island.r + out), y: -1.2, z: island.z + Math.sin(angle) * (island.r + out), rot: -angle, s });
    add(PIRATE('Ship_Large'), [sea(0.3, 45), sea(3.5, 60)]);
    add(PIRATE('Ship_Small'), [sea(1.6, 35), sea(4.6, 40), sea(2.4, 70)]);
    add(PIRATE('Environment_Cliff1'), [sea(0.9, 70), sea(5.4, 80, 1.3)]);
    add(PIRATE('Environment_Cliff3'), [sea(2.0, 90, 1.2)]);
    const monster = cloneOf(get(PIRATE('Characters_Tentacle')));
    if (monster) {
      const p = sea(5.0, 28), { k, minY } = measure(THREE, get(PIRATE('Characters_Tentacle')), PIRATE('Characters_Tentacle'));
      monster.object.scale.setScalar(k);
      monster.object.position.set(p.x, p.y - minY * k - 3, p.z);
      monster.object.rotation.y = Math.atan2(island.x - p.x, island.z - p.z); // faces the island
      const mixer = new THREE.AnimationMixer(monster.object);
      const clip = monster.animations.find((a) => /idle/i.test(a.name)) || monster.animations[0];
      if (clip) mixer.clipAction(clip).play();
      mixers.push(mixer);
      group.add(monster.object);
    }
  }
  return { group, mixers };
}
