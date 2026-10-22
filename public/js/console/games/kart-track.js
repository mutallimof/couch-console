// Turbo Karts track: the 3D road, curbs, barriers, trees and boost pads, plus helpers
// to find where a kart is on the track. Everything is built from code (no model files).

export const ROAD_HALF = 8;        // half the road width (meters)
export const WALL = ROAD_HALF + 5; // barriers this far from the center line
const SAMPLES = 800;

// The circuit's shape, seen from above (x, z). The start line is at the first point.
const LAYOUT = [
  [0, 0], [60, 0], [110, 8], [140, 40], [138, 85], [110, 110], [70, 108], [50, 80],
  [20, 70], [-10, 95], [-50, 110], [-95, 95], [-115, 55], [-100, 15], [-60, 0],
].map(([x, z]) => [x * 1.3, z * 1.3]);

// Boost pads: where they are along the lap (0..1) and across the road (meters from center).
const PADS = [{ t: 0.16, side: -3 }, { t: 0.47, side: 3 }, { t: 0.78, side: 0 }];

export function buildTrack(THREE) {
  const curve = new THREE.CatmullRomCurve3(LAYOUT.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const length = curve.getLength();

  // Sample the center line once: position, direction and the "left" normal at each point.
  const pts = [], tan = [], nor = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t = i / SAMPLES;
    const p = curve.getPointAt(t), d = curve.getTangentAt(t);
    pts.push(p);
    tan.push(d);
    nor.push(new THREE.Vector3(-d.z, 0, d.x)); // sideways (to the driver's right)
  }

  const group = new THREE.Group();
  const at = (i) => (i + SAMPLES) % SAMPLES;
  const edge = (i, off, y = 0) => pts[i].clone().addScaledVector(nor[i], off).setY(y);

  // A flat ribbon along the track between two side offsets (road, curbs, lines).
  function ribbon(offA, offB, y, colorFn) {
    const pos = [], col = [], idx = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const k = at(i), a = edge(k, offA, y), b = edge(k, offB, y);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      const c = colorFn(i);
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      if (i < SAMPLES) { const v = i * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  }
  const C = (hex) => new THREE.Color(hex);

  // Ground and distant hills
  const ground = new THREE.Mesh(new THREE.CircleGeometry(600, 48), new THREE.MeshLambertMaterial({ color: '#7CC36B' }));
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, r = 380 + Math.random() * 60;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(60 + Math.random() * 50, 16, 10),
      new THREE.MeshLambertMaterial({ color: i % 2 ? '#8FCF7E' : '#A2D98F' }));
    hill.position.set(Math.cos(a) * r, -20, Math.sin(a) * r);
    hill.scale.y = 0.6;
    group.add(hill);
  }

  // Road, center dashes, red/white curbs, start line
  group.add(ribbon(ROAD_HALF, -ROAD_HALF, 0.02, () => C('#5A606B')));
  const dash = ribbon(0.25, -0.25, 0.03, (i) => (Math.floor(i / 6) % 2 ? C('#5A606B') : C('#F2F4F7')));
  group.add(dash);
  for (const s of [1, -1]) {
    group.add(ribbon(s * ROAD_HALF, s * (ROAD_HALF + 1.4), 0.04, (i) => (Math.floor(i / 4) % 2 ? C('#E03131') : C('#FFFFFF'))));
  }
  const checker = document.createElement('canvas');
  checker.width = 64; checker.height = 8;
  const cx = checker.getContext('2d');
  for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { cx.fillStyle = (x + y) % 2 ? '#111' : '#fff'; cx.fillRect(x * 4, y * 4, 4, 4); }
  const tex = new THREE.CanvasTexture(checker);
  tex.magFilter = THREE.NearestFilter;
  const lineMesh = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 2.5), new THREE.MeshLambertMaterial({ map: tex }));
  lineMesh.rotation.x = -Math.PI / 2;
  const line = new THREE.Group(); // turned to face along the road
  line.add(lineMesh);
  line.rotation.y = Math.atan2(tan[0].x, tan[0].z);
  line.position.copy(pts[0]).setY(0.05);
  group.add(line);

  // Barriers: low walls on both sides, blue and white blocks
  for (const s of [1, -1]) {
    const pos = [], col = [], idx = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const k = at(i), b = edge(k, s * WALL, 0), t = edge(k, s * WALL, 1.1);
      pos.push(b.x, b.y, b.z, t.x, t.y, t.z);
      const c = Math.floor(i / 8) % 2 ? C('#2F80ED') : C('#F4F7FB');
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      if (i < SAMPLES) { const v = i * 2; idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    group.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  }

  // Trees (instanced, so hundreds cost little), kept away from the road
  const spots = [];
  for (let tries = 0; spots.length < 220 && tries < 4000; tries++) {
    const x = (Math.random() - 0.5) * 520, z = (Math.random() - 0.5) * 420 + 60;
    const minD = pts.reduce((m, p) => Math.min(m, (p.x - x) ** 2 + (p.z - z) ** 2), Infinity);
    if (minD > (WALL + 6) ** 2) spots.push([x, z, 0.7 + Math.random() * 0.8]);
  }
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.45, 2.4, 6), new THREE.MeshLambertMaterial({ color: '#8B5E3C' }), spots.length);
  const tops = new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, 5.5, 7), new THREE.MeshLambertMaterial({ color: '#2E8B57' }), spots.length);
  const m = new THREE.Matrix4();
  spots.forEach(([x, z, s], i) => {
    m.compose(new THREE.Vector3(x, 1.2 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    trunks.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(x, 4.6 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    tops.setMatrixAt(i, m);
    tops.setColorAt(i, new THREE.Color().setHSL(0.3 + Math.random() * 0.06, 0.5, 0.3 + Math.random() * 0.1));
  });
  group.add(trunks, tops);

  // Boost pads: glowing orange arrows on the road
  const arrow = new THREE.Shape();
  arrow.moveTo(0, 2.2); arrow.lineTo(1.8, 0); arrow.lineTo(0.8, 0); arrow.lineTo(0.8, -2);
  arrow.lineTo(-0.8, -2); arrow.lineTo(-0.8, 0); arrow.lineTo(-1.8, 0); arrow.closePath();
  const pads = PADS.map(({ t, side }) => {
    const i = Math.round(t * SAMPLES) % SAMPLES;
    const pad = new THREE.Group();
    const base = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 6), new THREE.MeshBasicMaterial({ color: '#FF922B' }));
    base.rotation.x = -Math.PI / 2;
    const arr = new THREE.Mesh(new THREE.ShapeGeometry(arrow), new THREE.MeshBasicMaterial({ color: '#FFF3BF' }));
    arr.rotation.x = -Math.PI / 2;
    arr.position.y = 0.01;
    pad.add(base, arr);
    pad.position.copy(edge(i, side, 0.06));
    pad.rotation.y = Math.atan2(tan[i].x, tan[i].z);
    group.add(pad);
    return { i, side };
  });

  // ---- Queries ----

  // Nearest center-line sample to (x, z), searching near the last known one.
  function locate(x, z, hint) {
    let best = hint ?? 0, bestD = Infinity;
    const range = hint == null ? SAMPLES : 40;
    for (let k = -range; k <= range; k++) {
      const i = at((hint ?? 0) + k), p = pts[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    const p = pts[best], n = nor[best];
    const lateral = (x - p.x) * n.x + (z - p.z) * n.z; // meters from the center line (+ = right)
    return { i: best, lateral };
  }

  return { group, pts, tan, nor, SAMPLES, length, pads, locate, at };
}
