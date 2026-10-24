// Turbo Karts tracks: five themed circuits with hills, jump crests, a bridge and tunnels.
// buildTrack() turns a track definition into 3D meshes plus helpers to find where a kart is.
import { makeScenery, makeItemBox, makeCoin } from './karts-models.js';
import { CAR, cloneOf, fit } from './karts-assets.js';
import { decorate } from './karts-decor.js';
import { roadMaterial } from './karts-materials.js';
import { trackPath, ROAD_HALF as ROAD_HALF0, WALL as WALL0, SAMPLES, SHORTCUT_HALF, SHORTCUT_ARC } from './kart-path.js';

// Track data and the center line live in kart-path.js (no graphics, testable)
export { ROAD_HALF, WALL, TRACKS } from './kart-path.js';

// Where the sun is (a direction): the sky draws its disc here and turbo-karts.js puts the
// shadow-casting light here, so shadows always point away from the sun you can see.
export const SUN_DIR = [0.62, 0.42, 0.66];

// A tiling grey noise texture (multiplied with the surface color): asphalt grit or grass
// clumps, so big surfaces aren't flat color. size = pixels, specks = how many dots.
function noiseTexture(THREE, { size = 256, base = 225, spread = 30, specks = 2500, speckSize = 2, repeat = [1, 1] }) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  const img = x.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = base + (Math.random() - 0.5) * spread;
    img.data.set([v, v, v, 255], i * 4);
  }
  x.putImageData(img, 0, 0);
  for (let i = 0; i < specks; i++) {
    const v = base + (Math.random() - 0.5) * spread * 3;
    x.fillStyle = `rgb(${v},${v},${v})`;
    x.fillRect(Math.random() * size, Math.random() * size, speckSize * (0.5 + Math.random()), speckSize * (0.5 + Math.random()));
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// assets (optional): loaded models (Map path -> glTF) for item boxes, coins and trackside decor
// opts.path: a ready-made center line (the ported kart rules' track model: see ow-kart/render-path.js),
// which also sets the road and barrier width; opts.noPickups: leave out item boxes and coins (that game draws its own)
export function buildTrack(THREE, def, assets = null, opts = {}) {
  const path = opts.path || trackPath(THREE, def);
  const ROAD_HALF = path.roadHalf ?? ROAD_HALF0, WALL = path.wallHalf ?? WALL0;
  const { pts, tan, nor, length, at, locate } = path;
  const edge = (i, off, dy = 0) => pts[i].clone().addScaledVector(nor[i], off).add(new THREE.Vector3(0, dy, 0));
  const group = new THREE.Group();
  const C = (hex) => new THREE.Color(hex);

  // A strip along the track between two side offsets (road surface, curbs, lines, walls)
  function strip(offA, offB, dyA, dyB, colorFn, opts = {}) {
    const pos = [], col = [], idx = [], uv = [];
    const stretch = length / SAMPLES / Math.abs(offA - offB || 1); // keeps texture pixels square
    for (let i = 0; i <= SAMPLES; i++) {
      const k = i % SAMPLES, a = edge(k, offA, dyA), b = edge(k, offB, dyB), c = colorFn(i);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      uv.push(0, i * stretch, 1, i * stretch);
      if (i < SAMPLES) { const v = i * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, opts.material || new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: opts.rough ?? 0.85, ...opts.mat }));
    m.receiveShadow = true;
    group.add(m);
    return m;
  }

  // Sky dome: a vertical gradient with the sun (a disc and a soft halo; a moon-like glow at
  // night) and stars at night. The two #includes give it the same color handling as
  // everything else, with or without the screen effects.
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: C(def.sky[0]) }, bottom: { value: C(def.sky[1]) },
      sunDir: { value: new THREE.Vector3(...SUN_DIR).normalize() },
      sunColor: { value: C(def.night ? '#9FB4FF' : '#FFF1C9') }, sunSize: { value: def.night ? 3000 : 900 },
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top, bottom, sunDir, sunColor; uniform float sunSize; varying vec3 vDir;
      void main(){
        vec3 col = mix(bottom, top, smoothstep(-0.05, 0.5, vDir.y));
        float d = max(dot(normalize(vDir), sunDir), 0.0);
        col += sunColor * (pow(d, sunSize) * 4.0 + pow(d, 12.0) * 0.35);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  sky.userData.isSky = true; // (hidden when a real HDRI sky is available, see karts-polyhaven.js)
  group.add(sky);
  if (def.night) {
    const stars = new THREE.BufferGeometry(), sp = [];
    for (let i = 0; i < 600; i++) { const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2 + 0.15; sp.push(Math.cos(a) * Math.cos(e) * 800, Math.sin(e) * 800, Math.sin(a) * Math.cos(e) * 800); }
    stars.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    group.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, fog: false })));
  }

  // Ground. Water tracks get a round sandy island in the middle of the sea.
  let island = null;
  if (def.water) {
    const cx = pts.reduce((a, p) => a + p.x, 0) / SAMPLES, cz = pts.reduce((a, p) => a + p.z, 0) / SAMPLES;
    island = { x: cx, z: cz, r: Math.max(...pts.map((p) => Math.hypot(p.x - cx, p.z - cz))) + 45 };
    const sea = new THREE.Mesh(new THREE.CircleGeometry(900, 64), new THREE.MeshStandardMaterial({ color: def.water, roughness: 0.15, metalness: 0.2 }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -0.6; sea.receiveShadow = true;
    group.add(sea);
  }
  const groundR = island ? island.r : 800;
  const groundTex = noiseTexture(THREE, { base: 222, spread: 16, specks: 1800, speckSize: 2, repeat: [groundR / 6, groundR / 6] });
  const groundMat = new THREE.MeshStandardMaterial({ color: def.ground, map: groundTex, roughness: 1 });
  // Mowed stripes: wide bands of lighter and darker grass, like a groomed race venue
  groundMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vGround;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGround = (modelMatrix * vec4(position, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vGround;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float band = smoothstep(-0.15, 0.15, sin((vGround.x * 0.72 + vGround.y * 0.69) * 0.32));
        diffuseColor.rgb *= ${def.theme === 'city' ? '1.0' : 'mix(0.86, 1.08, band)'};`);
  };
  const ground = new THREE.Mesh(new THREE.CircleGeometry(groundR, 64), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.set(island?.x ?? 0, -0.05, island?.z ?? 0); ground.receiveShadow = true;
  group.add(ground);

  // Road, center dashes, curbs, side slab (thickness) and barriers
  const roadCol = C(def.road);
  // Asphalt: little stones with bumps and tyre-worn lanes (karts-materials.js)
  strip(ROAD_HALF, -ROAD_HALF, 0.02, 0.02, (i) => roadCol.clone().offsetHSL(0, 0, (i % 40 < 20 ? 0.01 : -0.01)),
    { material: roadMaterial(THREE, { night: def.night }) });
  strip(0.3, -0.3, 0.03, 0.03, (i) => (Math.floor(i / 8) % 2 ? roadCol : C('#F4F7FB')));
  for (const s of [1, -1]) {
    strip(s * ROAD_HALF, s * (ROAD_HALF + 1.6), 0.05, 0.05, (i) => C(def.curb[Math.floor(i / 5) % 2]),
      { mat: def.night ? { emissive: '#ffffff', emissiveIntensity: 0.25 } : {} });
    strip(s * (ROAD_HALF + 1.6), s * (ROAD_HALF + 1.6), 0.05, -0.8, () => C('#3B3F4A'));       // slab edge
    strip(s * WALL, s * WALL, 0, 1.2, (i) => C(def.wall[Math.floor(i / 10) % 2]),
      { mat: def.night ? { emissive: def.wall[0], emissiveIntensity: 3.5 } : {} });       // barrier (glows at night)
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
  const archMat = new THREE.MeshStandardMaterial({ color: def.wall[0], emissive: def.night ? def.wall[0] : '#000', emissiveIntensity: def.night ? 3.5 : 0 });
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
    const tMat = new THREE.MeshStandardMaterial({ color: { snow: '#DEE2E6', pirate: '#8D7B68' }[def.theme] || '#A0522D', roughness: 0.9, side: THREE.DoubleSide });
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
  for (const { i, side } of path.pads) {
    const pad = new THREE.Group();
    const base = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 6.5), new THREE.MeshBasicMaterial({ color: '#FF922B' }));
    base.rotation.x = -Math.PI / 2;
    const arr = new THREE.Mesh(new THREE.ShapeGeometry(arrow), new THREE.MeshBasicMaterial({ color: '#FFF3BF' }));
    arr.rotation.x = -Math.PI / 2; arr.position.y = 0.01;
    pad.add(base, arr);
    pad.position.copy(edge(i, side, 0.08));
    pad.rotation.y = Math.atan2(tan[i].x, tan[i].z);
    group.add(pad);
  }

  // Glide ramps: a blue pad with white chevrons across the whole road, between two glowing posts
  if (path.glides.length) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#1C7ED6'; x.fillRect(0, 0, 256, 128);
    x.strokeStyle = '#fff'; x.lineWidth = 10; x.lineJoin = 'round';
    for (const cx of [48, 128, 208]) for (const cy of [44, 84]) {
      x.beginPath(); x.moveTo(cx - 22, cy + 14); x.lineTo(cx, cy - 8); x.lineTo(cx + 22, cy + 14); x.stroke();
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const padMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, emissive: '#1C7ED6', emissiveIntensity: def.night ? 0.8 : 0.25 });
    const postMat = new THREE.MeshStandardMaterial({ color: '#E7F5FF', roughness: 0.3 });
    const ringMat = new THREE.MeshStandardMaterial({ color: '#4DABF7', emissive: '#4DABF7', emissiveIntensity: 3 });
    const hoopMat = new THREE.MeshStandardMaterial({ color: '#FFD8A8', emissive: '#FFA94D', emissiveIntensity: 2.5 });
    for (const glide of path.glides) {
      const { i } = glide, half = glide.side == null ? ROAD_HALF : SHORTCUT_HALF, mid = glide.side ?? 0;
      const g = new THREE.Group();
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, 7), padMat);
      pad.rotation.x = -Math.PI / 2; pad.position.set(-mid, 0.09, 0); pad.receiveShadow = true;
      g.add(pad);
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 6, 12), postMat);
        post.position.set(-mid + s * (half + 0.8), 3, 0); post.castShadow = true;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.16, 10, 24), glide.to == null ? ringMat : hoopMat);
        ring.position.set(-mid + s * (half + 0.8), 6.4, 0);
        g.add(post, ring);
      }
      g.position.copy(pts[i]);
      g.rotation.y = Math.atan2(tan[i].x, tan[i].z);
      group.add(g);
      // A shortcut: glowing hoops show the way across the gap, over a bank of clouds
      if (glide.to != null) {
        const A = glide.from, B = glide.land, dir = Math.atan2(B.x - A.x, B.z - A.z);
        for (const f of [0.25, 0.5, 0.75]) {
          const hoop = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.35, 10, 36), hoopMat);
          hoop.position.set(A.x + (B.x - A.x) * f, A.y + (B.y - A.y) * f + SHORTCUT_ARC * Math.sin(Math.PI * f) + 2.5, A.z + (B.z - A.z) * f);
          hoop.rotation.y = dir;
          group.add(hoop);
        }
        const puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 1 }), 14);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
        for (let n = 0; n < 14; n++) {
          const f = 0.15 + (n / 13) * 0.7, s = 4 + ((n * 7) % 5);
          m4.compose(new THREE.Vector3(A.x + (B.x - A.x) * f + ((n % 3) - 1) * 6, -1 + (n % 2) * 1.5, A.z + (B.z - A.z) * f + ((n % 4) - 1.5) * 5),
            q, new THREE.Vector3(s, s * 0.55, s));
          puffs.setMatrixAt(n, m4);
        }
        group.add(puffs);
      }
    }
  }

  // Item boxes: a row of 4 across the road; coins: lines of 6 along the road.
  // Uses the Toy Car Kit models when they're loaded.
  const model = (file, size, fallback) => {
    const c = cloneOf(assets?.get(file));
    if (!c) return fallback();
    const g = fit(THREE, c.object, size);
    const box = new THREE.Box3().setFromObject(g);
    g.children[0].position.y -= (box.min.y + box.max.y) / 2; // spin around the middle
    return g;
  };
  const boxes = opts.noPickups ? [] : def.boxes.flatMap((t) => [-6, -2, 2, 6].map((side) => {
    const i = at(t * SAMPLES), mesh = model(CAR('item-box'), 1.6, makeItemBox), p = edge(i, side, 1.4);
    mesh.position.copy(p); group.add(mesh);
    return { i, side, mesh, p, respawn: 0 };
  }));
  const coins = opts.noPickups ? [] : def.coins.flatMap((t, n) => Array.from({ length: 6 }, (_, j) => {
    const i = at(t * SAMPLES + j * 5), side = (n % 2 ? -3 : 3), mesh = model(CAR('item-coin-gold'), 1.1, makeCoin), p = edge(i, side, 1.1);
    mesh.position.copy(p); group.add(mesh);
    return { i, side, mesh, p, respawn: 0 };
  }));

  // Scenery, kept away from the road
  const spots = [];
  for (let tries = 0; spots.length < 260 && tries < 6000; tries++) {
    const x = (Math.random() - 0.5) * 600, z = (Math.random() - 0.5) * 520 + 50;
    let minD = Infinity;
    for (let i = 0; i < SAMPLES; i += 4) minD = Math.min(minD, (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2);
    const onIsland = !island || Math.hypot(x - island.x, z - island.z) < island.r - 8;
    if (onIsland && minD > (WALL + (def.theme === 'city' ? 12 : 6)) ** 2) spots.push([x, z, 0.7 + Math.random() * 0.8]);
  }
  // Real models (grandstands, trees, palms...) when loaded; simple shapes otherwise.
  // The city keeps its glowing code-built towers and Cloud Gardens its clouds either way.
  let mixers = [];
  if (assets) {
    const decor = decorate(THREE, { pts, tan, nor, SAMPLES, def, island }, assets, spots);
    group.add(decor.group);
    mixers = decor.mixers;
  }
  if (!assets || def.theme === 'city' || def.theme === 'sky') group.add(makeScenery(def.theme === 'pirate' ? 'park' : def.theme, spots));

  return { ...path, group, boxes, coins, mixers };
}
