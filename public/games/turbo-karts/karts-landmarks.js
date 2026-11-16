// Turbo Karts landmarks: one big, readable toy per track that you can spot from anywhere on the lap (a windmill, a
// stone arch, a giant snowman...). Built in code from the art tokens; a few turn slowly. No downloads.
// A track asks for one with `landmark: { look, at, side, off }`: at = where on the lap (0..1), side = -1 left / 1 right
// of the driving direction, off = metres from the center line ('arch' stands over the road instead).
import { Parts, toyMesh, roundBox } from './karts-toykit.js';
import { PALETTE as P, roleMaterial } from './karts-tokens.js';

const cyl = (T, rt, rb, h, s = 14) => new T.CylinderGeometry(rt, rb, h, s);
const ball = (T, r, w = 14, h = 10) => new T.SphereGeometry(r, w, h);

const BUILD = {
  // Sunny Park: a cream windmill with four sails that turn
  windmill(T) {
    const g = new T.Group(), b = new Parts();
    b.add(cyl(T, 3.2, 4.6, 17), P.cream, [0, 8.5, 0]);
    b.add(cyl(T, 4.9, 5.2, 1.2), P.sky, [0, 0.6, 0]);
    b.add(new T.ConeGeometry(4.1, 4.6, 14), P.pop, [0, 19.3, 0]);
    b.add(roundBox(1.9, 3.2, 0.5, 0.25), P.ink, [0, 1.9, 4.45]);
    for (const y of [7, 12]) b.add(roundBox(1.3, 1.6, 0.4, 0.2), P.sky, [0, y, 3.75 - (y - 7) * 0.08]);
    b.add(cyl(T, 0.55, 0.55, 2.2, 10), P.ink, [0, 16.2, 3.6], [Math.PI / 2, 0, 0]);
    g.add(toyMesh(b.merge()));
    const s = new Parts();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2, c = Math.cos(a), n = Math.sin(a);
      s.add(roundBox(0.5, 11, 0.3, 0.12), P.ink, [c * 0, 0, 0].map((v, k) => (k === 0 ? -n * 5.5 : k === 1 ? c * 5.5 : 0)), [0, 0, a]);
      s.add(roundBox(2.6, 8, 0.16, 0.08), i % 2 ? P.butter : P.cream, [-n * 6.5 + c * 1.5, c * 6.5 + n * 1.5, 0], [0, 0, a]);
    }
    s.add(ball(T, 0.9), P.pop);
    const sails = toyMesh(s.merge()); sails.position.set(0, 16.2, 4.8); g.add(sails);
    return { object: g, update: (t) => { sails.rotation.z = t * 0.5; } };
  },
  // Dune Canyon: a red stone arch right over the road
  arch(T, { half }) {
    const b = new Parts(), strata = ['#C65F33', '#D9784B', '#B84C2A', '#E5A06C'], leg = half + 6;
    for (const s of [-1, 1]) for (let i = 0; i < 5; i++) b.add(cyl(T, 4.4 - i * 0.35, 4.9 - i * 0.35, 4.2, 9), strata[i % 4], [s * (leg + (i > 2 ? -s * (i - 2) * 1.2 : 0)), 2.1 + i * 4.1, (i % 2) * 0.5]);
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI, x = Math.cos(a) * (leg - 2.4), y = 20 + Math.sin(a) * 6.5;
      b.add(roundBox(7.4, 4.2, 6.2, 1.2), strata[(i + 1) % 4], [x, y, 0], [0, 0, a + Math.PI / 2 + (i % 2 ? 0.08 : -0.06)]);
    }
    b.add(roundBox(5, 3, 5, 1), strata[3], [0, 29.4, 0.4], [0, 0.4, 0.1]);
    return { object: toyMesh(b.merge()) };
  },
  // Frosty Peaks: a giant snowman with a scarf and a top hat
  snowman(T) {
    const b = new Parts(), snow = '#FFFFFF';
    b.add(ball(T, 6.4, 18, 14), snow, [0, 5.6, 0]); b.add(ball(T, 4.7, 18, 14), '#F4F9FF', [0, 14.2, 0]); b.add(ball(T, 3.4, 18, 14), snow, [0, 20.6, 0]);
    b.add(new T.ConeGeometry(0.6, 3.2, 10), P.cushion, [0, 20.6, 4.6], [Math.PI / 2, 0, 0]);
    for (const x of [-1.2, 1.2]) b.add(ball(T, 0.42, 8, 6), P.ink, [x, 21.7, 2.95]);
    for (let i = 0; i < 5; i++) b.add(ball(T, 0.26, 6, 5), P.ink, [(i - 2) * 0.7, 19.4 - Math.cos((i - 2) * 0.7) * 0.5 + 0.5, 3.05]);
    for (const y of [12.6, 14.6, 16.4]) b.add(ball(T, 0.5, 8, 6), P.ink, [0, y, Math.sqrt(Math.max(0.1, 4.7 * 4.7 - (y - 14.2) ** 2)) - 0.1]);
    b.add(new T.TorusGeometry(3.1, 0.95, 8, 20), P.pop, [0, 18.1, 0], [Math.PI / 2, 0, 0]);
    b.add(roundBox(1.7, 5.4, 0.9, 0.4), P.pop, [2.4, 15.4, 2.9], [0.15, 0, -0.2]);
    b.add(cyl(T, 3.6, 3.6, 0.5, 18), P.ink, [0, 23.5, 0]); b.add(cyl(T, 2.4, 2.5, 3.6, 18), P.ink, [0, 25.4, 0]); b.add(cyl(T, 2.55, 2.55, 0.8, 18), P.sky, [0, 24.2, 0]);
    for (const s of [-1, 1]) { b.add(cyl(T, 0.22, 0.3, 7, 6), '#8B5E3C', [s * 6.6, 16.2, 0], [0, 0, s * -1.0]); b.add(cyl(T, 0.16, 0.2, 2.2, 6), '#8B5E3C', [s * 8.9, 18.6, 0], [0, 0, s * 0.3]); }
    return { object: toyMesh(b.merge()) };
  },
  // Block City: a toy water tower
  watertower(T) {
    const b = new Parts();
    for (const [x, z] of [[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6]]) b.add(cyl(T, 0.45, 0.6, 17, 8), P.ink, [x, 8.5, z], [z * -0.02, 0, x * 0.02]);
    for (const y of [5, 11]) for (const r of [0, Math.PI / 2]) for (const o of [-3.5, 3.5]) b.add(roundBox(7.6, 0.4, 0.4, 0.1), P.ink, r ? [o, y, 0] : [0, y, o], [0, r, 0]);
    b.add(cyl(T, 6.2, 6.2, 0.8, 20), P.ink, [0, 17.2, 0]);
    b.add(cyl(T, 5.8, 5.8, 8.4, 20), P.butter, [0, 21.8, 0]);
    b.add(cyl(T, 5.95, 5.95, 1.3, 20), P.pop, [0, 21.8, 0]);
    b.add(new T.ConeGeometry(6.5, 3.6, 20), P.mint, [0, 27.8, 0]);
    b.add(ball(T, 0.7, 10, 8), P.pop, [0, 29.9, 0]);
    b.add(cyl(T, 0.5, 0.5, 17, 8), P.sky, [0, 8.5, 0]);
    return { object: toyMesh(b.merge()) };
  },
  // Sunset Avenue: a Ferris wheel with eight gondolas in the five style colors, turning slowly, its bulbs glowing at dusk
  ferris(T) {
    const g = new T.Group(), R = 14, hub = 18.5, b = new Parts();
    for (const z of [-1.8, 1.8]) for (const s of [-1, 1]) b.add(roundBox(1, 20.5, 0.9, 0.3), P.cream, [s * 5.2, 9.4, z], [0, 0, s * 0.27]);
    b.add(roundBox(16, 1.2, 6, 0.4), P.ink, [0, 0.6, 0]);
    b.add(cyl(T, 1.1, 1.1, 5, 12), P.pop, [0, hub, 0], [Math.PI / 2, 0, 0]);
    g.add(toyMesh(b.merge()));
    const w = new Parts();
    for (const z of [-1.2, 1.2]) { w.add(new T.TorusGeometry(R, 0.38, 8, 44), P.pop, [0, 0, z]); w.add(new T.TorusGeometry(R * 0.55, 0.22, 6, 32), P.cream, [0, 0, z]); }
    for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; w.add(roundBox(0.34, R, 0.34, 0.1), P.cream, [Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0], [0, 0, a - Math.PI / 2]); w.add(cyl(T, 0.2, 0.2, 2.8, 6), P.ink, [Math.cos(a) * R, Math.sin(a) * R, 0], [Math.PI / 2, 0, 0]); }
    const wheel = new T.Group(); wheel.position.y = hub; wheel.add(toyMesh(w.merge())); g.add(wheel);
    const bulbs = new T.InstancedMesh(ball(T, 0.3, 6, 5), roleMaterial(T, 'glow', new T.Color('#FFE9A8').multiplyScalar(2.4)), 24), m4 = new T.Matrix4();
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; bulbs.setMatrixAt(i, m4.makeTranslation(Math.cos(a) * R, Math.sin(a) * R, 1.75)); }
    wheel.add(bulbs);
    const colors = [P.pop, P.butter, P.sky, P.mint, P.cushion, P.sky, P.pop, P.mint];
    const cabins = colors.map((c, i) => {
      const q = new Parts();
      q.add(roundBox(2.6, 2.1, 2.2, 0.6), c, [0, -1.9, 0]); q.add(roundBox(2.8, 0.4, 2.4, 0.2), P.cream, [0, -0.75, 0]); q.add(cyl(T, 0.1, 0.1, 0.9, 5), P.ink, [0, -0.35, 0]);
      const m = toyMesh(q.merge()); wheel.add(m); return m;
    });
    return { object: g, update: (t) => { const r = t * 0.12; wheel.rotation.z = r; cabins.forEach((m, i) => { const a = (i * Math.PI) / 4; m.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); m.rotation.z = -r; }); } };
  },
  // Pirate Cove: a shipwreck leaning in the sand, broken mast and a torn sail
  shipwreck(T) {
    const b = new Parts(), wood = '#9C5E36', dark = '#7A4526', light = '#C68B5A';
    const hull = new T.CylinderGeometry(4.6, 3.2, 24, 12, 1, false, 0, Math.PI); // half a barrel, open side up
    b.add(hull, wood, [0, 3.4, 0], [Math.PI / 2, Math.PI / 2, 0], [1, 1, 1.25]);
    for (const z of [-11.5, 11.5]) b.add(new T.ConeGeometry(4.3, 7, 12, 1, false, 0, Math.PI), dark, [0, 3.6, z + Math.sign(z) * 3.2], [Math.sign(z) * Math.PI / 2, 0, Math.PI / 2 * 0 ], [1.25, 1, 1]);
    b.add(roundBox(8.8, 0.5, 23, 0.2), light, [0, 3.7, 0]);
    for (let i = -3; i <= 3; i++) b.add(roundBox(9.6, 0.5, 0.5, 0.15), dark, [0, 2.2, i * 3.3]);
    b.add(roundBox(7.4, 4, 5.4, 0.6), wood, [0, 5.9, -9]); b.add(roundBox(7.8, 0.5, 5.8, 0.2), light, [0, 8.1, -9]);
    for (const x of [-2.2, 0, 2.2]) b.add(roundBox(1.2, 1.3, 0.3, 0.15), P.butter, [x, 6.3, -6.25]);
    b.add(cyl(T, 0.55, 0.7, 15, 8), dark, [0, 11, 2]); b.add(cyl(T, 0.3, 0.3, 10, 6), dark, [0, 14.5, 2], [0, 0, Math.PI / 2]);
    b.add(cyl(T, 0.5, 0.6, 6.5, 8), dark, [0.8, 6.6, 8.2], [0.5, 0, -0.35]); // the snapped front mast
    const sail = new T.PlaneGeometry(8.6, 7, 4, 3), sp = sail.attributes.position;
    for (let i = 0; i < sp.count; i++) sp.setZ(i, Math.sin(sp.getX(i) * 0.5) * 0.9 + (sp.getY(i) < -1.5 ? Math.sin(sp.getX(i) * 2.3) * 0.6 : 0));
    sail.computeVertexNormals();
    b.add(sail, P.cream, [0, 10.6, 2.3]); b.add(sail, P.cream, [0, 10.6, 2.25], [0, Math.PI, 0]);
    b.add(roundBox(2.2, 1.6, 0.2, 0.1), P.pop, [0, 17.2, 2], [0, 0, 0.1]);
    const m = toyMesh(b.merge()); m.rotation.set(0.05, 0, 0.3); m.position.y = -1.4;
    const g = new T.Group(); g.add(m);
    return { object: g };
  },
  // Cloud Gardens: a beanstalk that winds up through a cloud, with big leaves and a pod on top
  beanstalk(T) {
    const g = new T.Group(), b = new Parts(), H = 64, N = 34;
    for (let i = 0; i < N; i++) {
      const k = i / (N - 1), a = k * 9, r = 2.6 * (1 - k * 0.55), x = Math.cos(a) * 2.2 * (1 - k * 0.3), z = Math.sin(a) * 2.2 * (1 - k * 0.3);
      b.add(ball(T, r, 9, 7), i % 2 ? '#4FB85A' : '#63C96A', [x, k * H, z], [0, 0, 0], [1, 1.35, 1]);
      if (i % 4 === 2) { const la = a + 1.6; b.add(ball(T, 1, 8, 5), '#8BD47E', [x + Math.cos(la) * (r + 3.4), k * H + 0.6, z + Math.sin(la) * (r + 3.4)], [0.25, -la, 0.3], [4.2, 0.35, 2.3]); }
    }
    b.add(ball(T, 2.6, 10, 8), P.butter, [0.6, H + 2.2, 0.4], [0, 0, 0.5], [0.8, 1.7, 0.8]);
    g.add(toyMesh(b.merge()));
    const c = new Parts();
    for (const [x, y, z, r] of [[0, 0, 0, 7], [6.5, -0.6, 1.5, 5], [-6, -0.4, -1.5, 5.4], [1.5, 0.8, 5, 4.6], [-1, 0.6, -5.2, 4.4], [10.5, -1.2, -1, 3.4], [-10, -1.1, 1.6, 3.6]]) c.add(ball(T, r, 10, 8), '#FFFFFF', [x, y, z], [0, 0, 0], [1, 0.62, 1]);
    const cloud = toyMesh(c.merge(), { outline: false }); cloud.position.y = 40; g.add(cloud);
    return { object: g, update: (t) => { cloud.rotation.y = t * 0.05; } };
  },
};

// path: the drawn track's center line (kart-track.js); terrain: for the ground height. Returns { group, update(t) } or null.
export function buildLandmark(THREE, def, path, terrain, SAMPLES) {
  const L = def.landmark;
  if (!L || !BUILD[L.look]) return null;
  const i = path.at(L.at * SAMPLES), p = path.pts[i], tan = path.tan[i], nor = path.nor[i];
  const made = BUILD[L.look](THREE, { half: path.wallHalf ?? 14.5 });
  const group = new THREE.Group();
  if (L.look === 'arch') { group.position.set(p.x, p.y - 0.5, p.z); group.rotation.y = Math.atan2(tan.x, tan.z); }
  else {
    const off = (L.side || 1) * (L.off || 45), x = p.x + nor.x * off, z = p.z + nor.z * off;
    group.position.set(x, (L.y ?? terrain.heightAt(x, z)) - 0.3, z);
    group.rotation.y = Math.atan2(p.x - x, p.z - z) + (L.turn || 0); // it faces the road
  }
  group.scale.setScalar(L.scale || 1);
  made.object.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.add(made.object);
  made.update?.(0);
  return { group, update: made.update || null };
}
