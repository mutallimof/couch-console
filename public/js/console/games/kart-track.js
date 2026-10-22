// Turbo Karts tracks: four themed circuits with hills, jump crests, a bridge and a tunnel.
// buildTrack() turns a track definition into 3D meshes plus helpers to find where a kart is.
import { makeScenery, makeItemBox, makeCoin } from './karts-models.js';

export const ROAD_HALF = 8;          // half the road width (meters)
export const WALL = ROAD_HALF + 4.5; // barriers this far from the center line
const SAMPLES = 1000;

// Each track: a closed loop of [x, height, z] points (the start line is at the first point),
// a theme, where the extras go (0..1 along the lap), and how grippy the road is.
export const TRACKS = [
  {
    id: 'park', name: 'Sunny Park', theme: 'park', blurb: 'Gentle hills and a big jump. Great for starters.',
    sky: ['#5AA9F0', '#CFE9FF'], fog: [160, 520], ground: '#7CC36B', road: '#5A606B', curb: ['#E03131', '#FFFFFF'], wall: ['#2F80ED', '#F4F7FB'],
    grip: 1, scale: 1.35,
    points: [[0, 0, 0], [60, 0, 0], [105, 3, 10], [138, 8, 45], [135, 9, 90], [105, 4, 112], [65, 0, 106], [40, 0, 80], [10, 5, 70],
      [-12, 0, 92], [-50, 0, 110], [-95, 4, 95], [-115, 6, 55], [-100, 2, 15], [-60, 0, 0]],
    pads: [0.18, 0.62], boxes: [0.1, 0.42, 0.75], coins: [0.27, 0.53, 0.88], tunnel: null,
  },
  {
    id: 'desert', name: 'Dune Canyon', theme: 'desert', blurb: 'Long sweeping turns between red rocks. Hit the crests for air!',
    sky: ['#F2A65A', '#FBE3B5'], fog: [150, 480], ground: '#E3B778', road: '#8A6A4D', curb: ['#C2410C', '#FFF4E6'], wall: ['#C97B4A', '#FFE8CC'],
    grip: 0.95, scale: 1.5,
    points: [[0, 0, 0], [70, 0, -5], [120, 6, 20], [130, 12, 70], [95, 5, 100], [60, 12, 90], [30, 2, 120], [-20, 0, 125], [-75, 8, 100],
      [-110, 0, 60], [-95, 10, 20], [-55, 2, -10]],
    pads: [0.08, 0.5], boxes: [0.2, 0.55, 0.82], coins: [0.33, 0.66, 0.92], tunnel: [0.36, 0.44],
  },
  {
    id: 'snow', name: 'Frosty Peaks', theme: 'snow', blurb: 'Climb the mountain, fly down the other side. The road is icy!',
    sky: ['#8DB8E8', '#EEF5FC'], fog: [120, 420], ground: '#F1F3F5', road: '#6C7A89', curb: ['#1C7ED6', '#FFFFFF'], wall: ['#E7F5FF', '#74C0FC'],
    grip: 0.78, scale: 1.4,
    points: [[0, 0, 0], [55, 2, -8], [100, 9, 10], [118, 16, 50], [95, 22, 85], [50, 24, 95], [10, 18, 80], [-25, 10, 100],
      [-70, 4, 95], [-100, 0, 55], [-90, 0, 15], [-45, 0, -5]],
    pads: [0.12, 0.7], boxes: [0.06, 0.4, 0.78], coins: [0.25, 0.5, 0.9], tunnel: [0.58, 0.68],
  },
  {
    id: 'city', name: 'Neon City', theme: 'city', blurb: 'A night race through glowing towers, over a bridge and under it.',
    sky: ['#0B1026', '#3B2A6B'], fog: [120, 420], ground: '#1B1F3A', road: '#2A2F45', curb: ['#E64980', '#22B8CF'], wall: ['#7048E8', '#22B8CF'],
    grip: 1, scale: 1.45, night: true,
    // a figure-8: the second crossing goes over a bridge
    points: [[0, 0, 0], [45, 0, 35], [90, 0, 60], [120, 0, 30], [100, 0, -15], [50, 4, -25], [0, 12, 0], [-45, 4, 30],
      [-95, 0, 55], [-120, 0, 20], [-95, 0, -20], [-50, 0, -30]],
    pads: [0.15, 0.55], boxes: [0.08, 0.36, 0.72], coins: [0.24, 0.46, 0.86], tunnel: null,
  },
];

export function buildTrack(THREE, def) {
  const P = def.points.map(([x, y, z]) => new THREE.Vector3(x * def.scale, y, z * def.scale));
  const curve = new THREE.CatmullRomCurve3(P, true, 'centripetal');
  const length = curve.getLength();

  // Sample the center line once: position, direction and the sideways normal at each point
  const pts = [], tan = [], nor = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t = i / SAMPLES;
    pts.push(curve.getPointAt(t));
    const d = curve.getTangentAt(t);
    tan.push(d);
    nor.push(new THREE.Vector3(-d.z, 0, d.x).normalize()); // to the driver's right
  }
  const at = (i) => ((Math.round(i) % SAMPLES) + SAMPLES) % SAMPLES;
  const edge = (i, off, dy = 0) => pts[i].clone().addScaledVector(nor[i], off).add(new THREE.Vector3(0, dy, 0));
  const group = new THREE.Group();
  const C = (hex) => new THREE.Color(hex);

  // A strip along the track between two side offsets (road surface, curbs, lines, walls)
  function strip(offA, offB, dyA, dyB, colorFn, opts = {}) {
    const pos = [], col = [], idx = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const k = i % SAMPLES, a = edge(k, offA, dyA), b = edge(k, offB, dyB), c = colorFn(i);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      if (i < SAMPLES) { const v = i * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: opts.rough ?? 0.85, ...opts.mat }));
    m.receiveShadow = true;
    group.add(m);
    return m;
  }

  // Sky dome with a vertical gradient (and stars at night)
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: C(def.sky[0]) }, bottom: { value: C(def.sky[1]) } },
    vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying float h; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.05, 0.5, h)), 1.0); }',
  }));
  group.add(sky);
  if (def.night) {
    const stars = new THREE.BufferGeometry(), sp = [];
    for (let i = 0; i < 600; i++) { const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2 + 0.15; sp.push(Math.cos(a) * Math.cos(e) * 800, Math.sin(e) * 800, Math.sin(a) * Math.cos(e) * 800); }
    stars.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    group.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, fog: false })));
  }

  // Ground
  const ground = new THREE.Mesh(new THREE.CircleGeometry(800, 64), new THREE.MeshStandardMaterial({ color: def.ground, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.receiveShadow = true;
  group.add(ground);

  // Road, center dashes, curbs, side slab (thickness) and barriers
  const roadCol = C(def.road);
  strip(ROAD_HALF, -ROAD_HALF, 0.02, 0.02, (i) => roadCol.clone().offsetHSL(0, 0, (i % 40 < 20 ? 0.01 : -0.01)), { mat: def.night ? { emissive: '#14182c' } : {} });
  strip(0.3, -0.3, 0.03, 0.03, (i) => (Math.floor(i / 8) % 2 ? roadCol : C('#F4F7FB')));
  for (const s of [1, -1]) {
    strip(s * ROAD_HALF, s * (ROAD_HALF + 1.6), 0.05, 0.05, (i) => C(def.curb[Math.floor(i / 5) % 2]),
      { mat: def.night ? { emissive: '#ffffff', emissiveIntensity: 0.25 } : {} });
    strip(s * (ROAD_HALF + 1.6), s * (ROAD_HALF + 1.6), 0.05, -0.8, () => C('#3B3F4A'));       // slab edge
    strip(s * WALL, s * WALL, 0, 1.2, (i) => C(def.wall[Math.floor(i / 10) % 2]),
      { mat: def.night ? { emissive: def.wall[0], emissiveIntensity: 0.6 } : {} });         // barrier
    strip(s * (ROAD_HALF + 1.6), s * WALL, 0.04, 0.04, () => C(def.ground).offsetHSL(0, 0, -0.06)); // shoulder
  }

  // Pillars under raised road
  const pillars = [];
  for (let i = 0; i < SAMPLES; i += 14) if (pts[i].y > 1.2) pillars.push(i);
  if (pillars.length) {
    const inst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.9, 1.1, 1, 10), new THREE.MeshStandardMaterial({ color: def.night ? '#3B3F5C' : '#ADB5BD', roughness: 0.8 }), pillars.length * 2);
    const m4 = new THREE.Matrix4();
    pillars.forEach((i, n) => [-1, 1].forEach((s, j) => {
      const p = edge(i, s * (ROAD_HALF - 2));
      m4.compose(new THREE.Vector3(p.x, p.y / 2 - 0.4, p.z), new THREE.Quaternion(), new THREE.Vector3(1, p.y, 1));
      inst.setMatrixAt(n * 2 + j, m4);
    }));
    inst.castShadow = true;
    group.add(inst);
  }

  // Start line (checkered) with an arch over it
  const checker = document.createElement('canvas'); checker.width = 64; checker.height = 8;
  const cx = checker.getContext('2d');
  for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { cx.fillStyle = (x + y) % 2 ? '#111' : '#fff'; cx.fillRect(x * 4, y * 4, 4, 4); }
  const ctex = new THREE.CanvasTexture(checker); ctex.magFilter = THREE.NearestFilter;
  const startG = new THREE.Group();
  const line = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 2.5), new THREE.MeshStandardMaterial({ map: ctex }));
  line.rotation.x = -Math.PI / 2; line.position.y = 0.07; startG.add(line);
  const archMat = new THREE.MeshStandardMaterial({ color: def.wall[0], emissive: def.night ? def.wall[0] : '#000', emissiveIntensity: 0.6 });
  for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 1), archMat); post.position.set(s * (ROAD_HALF + 2), 4, 0); post.castShadow = true; startG.add(post); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 + 5, 1.8, 1), archMat); beam.position.y = 8.5; startG.add(beam);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2 + 4, 1.4), new THREE.MeshBasicMaterial({ map: ctex }));
  banner.position.set(0, 8.5, -0.52); banner.rotation.y = Math.PI; startG.add(banner);
  startG.position.copy(pts[0]);
  startG.rotation.y = Math.atan2(tan[0].x, tan[0].z);
  group.add(startG);

  // Tunnel: a row of arches over part of the track
  if (def.tunnel) {
    const [a, b] = def.tunnel.map((t) => Math.round(t * SAMPLES));
    const tMat = new THREE.MeshStandardMaterial({ color: def.theme === 'snow' ? '#DEE2E6' : '#A0522D', roughness: 0.9, side: THREE.DoubleSide });
    const lights = new THREE.MeshBasicMaterial({ color: '#FFE066' });
    for (let i = a; i <= b; i += 3) {
      const k = at(i);
      const arch = new THREE.Mesh(new THREE.CylinderGeometry(WALL + 1, WALL + 1, 3.6, 20, 1, true, -Math.PI / 2, Math.PI), tMat);
      arch.rotation.z = Math.PI / 2;
      const holder = new THREE.Group();
      holder.add(arch);
      if ((i - a) % 9 === 0) { const l = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 0.6), lights); l.position.y = WALL + 0.6; holder.add(l); }
      holder.position.copy(pts[k]);
      holder.rotation.y = Math.atan2(tan[k].x, tan[k].z) + Math.PI / 2;
      arch.receiveShadow = true;
      group.add(holder);
    }
  }

  // Boost pads (glowing arrows on the road)
  const arrow = new THREE.Shape();
  arrow.moveTo(0, 2.2); arrow.lineTo(1.8, 0); arrow.lineTo(0.8, 0); arrow.lineTo(0.8, -2); arrow.lineTo(-0.8, -2); arrow.lineTo(-0.8, 0); arrow.lineTo(-1.8, 0); arrow.closePath();
  const pads = def.pads.flatMap((t) => [-3.5, 3.5].map((side) => {
    const i = at(t * SAMPLES);
    const pad = new THREE.Group();
    const base = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 6.5), new THREE.MeshBasicMaterial({ color: '#FF922B' }));
    base.rotation.x = -Math.PI / 2;
    const arr = new THREE.Mesh(new THREE.ShapeGeometry(arrow), new THREE.MeshBasicMaterial({ color: '#FFF3BF' }));
    arr.rotation.x = -Math.PI / 2; arr.position.y = 0.01;
    pad.add(base, arr);
    pad.position.copy(edge(i, side, 0.08));
    pad.rotation.y = Math.atan2(tan[i].x, tan[i].z);
    group.add(pad);
    return { i, side };
  }));

  // Item boxes: a row of 4 across the road; coins: lines of 6 along the road
  const boxes = def.boxes.flatMap((t) => [-6, -2, 2, 6].map((side) => {
    const i = at(t * SAMPLES), mesh = makeItemBox(), p = edge(i, side, 1.4);
    mesh.position.copy(p); group.add(mesh);
    return { i, side, mesh, p, respawn: 0 };
  }));
  const coins = def.coins.flatMap((t, n) => Array.from({ length: 6 }, (_, j) => {
    const i = at(t * SAMPLES + j * 5), side = (n % 2 ? -3 : 3), mesh = makeCoin(), p = edge(i, side, 1.1);
    mesh.position.copy(p); group.add(mesh);
    return { i, side, mesh, p, respawn: 0 };
  }));

  // Scenery, kept away from the road
  const spots = [];
  for (let tries = 0; spots.length < 260 && tries < 6000; tries++) {
    const x = (Math.random() - 0.5) * 600, z = (Math.random() - 0.5) * 520 + 50;
    let minD = Infinity;
    for (let i = 0; i < SAMPLES; i += 4) minD = Math.min(minD, (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2);
    if (minD > (WALL + (def.theme === 'city' ? 12 : 6)) ** 2) spots.push([x, z, 0.7 + Math.random() * 0.8]);
  }
  group.add(makeScenery(def.theme, spots));

  // ---- Queries ----

  // Nearest center-line sample to (x, z), searching near the last known one.
  // Uses the height too, so the two levels of a bridge never get mixed up.
  function locate(x, z, hint, y = null) {
    let best = hint ?? 0, bestD = Infinity;
    const range = hint == null ? SAMPLES : 50;
    for (let k = -range; k <= range; k++) {
      const i = at((hint ?? 0) + k), p = pts[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2 + (y == null ? 0 : ((p.y - y) * 3) ** 2);
      if (d < bestD) { bestD = d; best = i; }
    }
    const p = pts[best], n = nor[best], t = tan[best];
    const lateral = (x - p.x) * n.x + (z - p.z) * n.z;
    // road height right here: between this sample and its neighbor
    const along = (x - p.x) * t.x + (z - p.z) * t.z;
    const j = at(best + Math.sign(along || 1)), f = Math.min(1, Math.abs(along) / (length / SAMPLES));
    const height = p.y + (pts[j].y - p.y) * f;
    return { i: best, lateral, height };
  }

  return { group, pts, tan, nor, SAMPLES, length, pads, boxes, coins, locate, at, def };
}
