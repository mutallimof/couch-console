// Neon Avenue: a night street with glowing shop signs (all names made up), towers with lit windows,
// a big start/finish arch with chaser lights, painted starting boxes, crosswalks, street lamps,
// striped barriers and traffic cones. Built from simple shapes and canvas pictures, no downloads.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { wrap } from './ow-kart/track-model.js';

const SIGNS = [
  ['NOVA NOODLES', '#FF4D9D', '#FFE14D'], ['PIXEL PIZZA', '#FFB020', '#FF4D4D'], ['ZAP ARCADE', '#38E8FF', '#B26BFF'], ['MOON MART', '#B26BFF', '#7DF9C1'],
  ['TURBO TEA', '#7DF9C1', '#FFE14D'], ['BEEP CAFE', '#FF7A45', '#38E8FF'], ['COUCH CINEMA', '#FF4D9D', '#38E8FF'], ['SPARK BAKERY', '#FFE14D', '#FF4D9D'],
  ['GLOW GYM', '#7DF9C1', '#B26BFF'], ['JELLY JUICE', '#FF4D9D', '#7DF9C1'],
];
const rnd = (a, b) => a + Math.random() * (b - a);

export function buildAvenue(THREE, def, path, group) {
  const { pts, tan, nor, SAMPLES, model } = path;
  const ROAD_HALF = path.roadHalf, WALL = path.wallHalf;
  const C = (hex) => new THREE.Color(hex);
  const at = (s, lat = 0) => model.surfaceAt(wrap(s, model.length), lat); // { x, y, z, tx, tz, rx, rz }
  const yawOf = (p) => Math.atan2(p.tx, p.tz);
  const bright = (hex, k = 1.8) => C(hex).multiplyScalar(k); // (above 1: it glows through the bloom)
  const root = new THREE.Group();
  group.add(root);
  const animated = [];

  // ---- canvases ----
  const canvas = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const rounded = (x, X, Y, W, H, r) => { x.beginPath(); x.roundRect(X, Y, W, H, r); };
  const signTexture = ([text, a, b]) => canvas(512, 192, (x, w, h) => {
    x.fillStyle = '#12102A'; rounded(x, 6, 6, w - 12, h - 12, 34); x.fill();
    x.lineWidth = 12; x.strokeStyle = a; x.shadowColor = a; x.shadowBlur = 22; rounded(x, 14, 14, w - 28, h - 28, 28); x.stroke();
    x.font = '900 82px Fredoka, Nunito, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const words = text.split(' ');
    words.forEach((word, i) => { x.fillStyle = i ? b : '#ffffff'; x.shadowColor = i ? b : a; x.shadowBlur = 20; x.fillText(word, w / 2, h / 2 + (i - (words.length - 1) / 2) * 76 * (words.length > 1 ? 0.95 : 0), w - 60); });
  });
  const windowTexture = (tint) => canvas(128, 256, (x, w, h) => {
    x.fillStyle = '#0E1130'; x.fillRect(0, 0, w, h);
    for (let y = 8; y < h - 8; y += 20) for (let xx = 8; xx < w - 8; xx += 20) {
      x.fillStyle = Math.random() < 0.6 ? tint[Math.floor(Math.random() * tint.length)] : '#1B1F4D';
      x.fillRect(xx, y, 12, 12);
    }
  });

  // ---- buildings along both sides ----
  const TINTS = [['#FFE14D', '#FFB020', '#FFF3B0'], ['#38E8FF', '#8EEBFF', '#FFE14D'], ['#FF4D9D', '#FFB0D5', '#FFE14D'], ['#B26BFF', '#D9B8FF', '#7DF9C1'], ['#7DF9C1', '#FFE14D', '#38E8FF']];
  const variants = TINTS.map((t) => ({ tex: windowTexture(t), geos: [] }));
  const near = (x, z, d) => { for (let i = 0; i < SAMPLES; i += 3) if ((pts[i].x - x) ** 2 + (pts[i].z - z) ** 2 < d * d) return true; return false; };
  const lots = [];
  for (let i = 0; i < SAMPLES; i += 11) {
    for (const side of [-1, 1]) {
      const w = rnd(16, 26), d = rnd(16, 26), h = rnd(22, 70), off = WALL + 8 + d / 2 + rnd(0, 5);
      const x = pts[i].x + nor[i].x * side * off, z = pts[i].z + nor[i].z * side * off;
      if (near(x, z, WALL + 6 + Math.min(w, d) * 0.6)) continue;
      if (lots.some((l) => (l.x - x) ** 2 + (l.z - z) ** 2 < ((l.r + Math.max(w, d) * 0.62)) ** 2)) continue;
      lots.push({ x, z, r: Math.max(w, d) * 0.62, w, d, h, side, i });
    }
  }
  for (const [n, l] of lots.entries()) {
    const g = new THREE.BoxGeometry(l.w, l.h, l.d);
    // windows keep their size on any wall: the texture repeats by the wall's real size
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) { const face = Math.floor(k / 4); const sx = face < 2 ? l.d : l.w, sy = face >= 2 && face < 4 ? l.d : l.h; uv.setXY(k, uv.getX(k) * sx / 6, uv.getY(k) * (face >= 2 && face < 4 ? sx : sy) / 11); }
    g.rotateY(yawOf({ tx: tan[l.i].x, tz: tan[l.i].z }));
    g.translate(l.x, l.h / 2, l.z);
    variants[n % variants.length].geos.push(g);
  }
  for (const v of variants) {
    if (!v.geos.length) continue;
    v.tex.wrapS = v.tex.wrapT = THREE.RepeatWrapping;
    const m = new THREE.Mesh(mergeGeometries(v.geos), new THREE.MeshStandardMaterial({ map: v.tex, emissive: '#ffffff', emissiveMap: v.tex, emissiveIntensity: 1.1, roughness: 0.9, color: '#9AA0D0' }));
    root.add(m);
  }
  // roof lights: little red beacons
  const beacons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.7, 8, 6), new THREE.MeshBasicMaterial({ color: bright('#FF3B3B', 2.5) }), lots.length);
  lots.forEach((l, i) => beacons.setMatrixAt(i, new THREE.Matrix4().makeTranslation(l.x, l.h + 0.8, l.z)));
  root.add(beacons);

  // ---- neon signs on the walls facing the street ----
  const signMats = SIGNS.map((s) => new THREE.MeshBasicMaterial({ map: signTexture(s), color: bright('#ffffff', 1.35), toneMapped: false, side: THREE.DoubleSide }));
  lots.filter((_, i) => i % 2 === 0).forEach((l, n) => {
    const k = n % SIGNS.length, w = rnd(11, 15);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.375), signMats[k]);
    const toRoad = new THREE.Vector3(-nor[l.i].x * l.side, 0, -nor[l.i].z * l.side); // the wall that faces the road
    sign.position.set(l.x + toRoad.x * (l.d / 2 + 0.3), rnd(7, Math.min(24, l.h - 4)), l.z + toRoad.z * (l.d / 2 + 0.3));
    sign.lookAt(sign.position.clone().add(toRoad));
    root.add(sign);
    animated.push({ mat: signMats[k], flicker: Math.random() * 10 });
  });

  // ---- start / finish: a big lit arch with chaser lights, the checkered line, painted starting boxes ----
  const start = at(0), yaw = yawOf(start);
  const arch = new THREE.Group();
  arch.position.set(start.x, start.y, start.z); arch.rotation.y = yaw;
  const steel = new THREE.MeshStandardMaterial({ color: '#2E3F9E', roughness: 0.4, metalness: 0.3 });
  const half = ROAD_HALF + 3, top = 11;
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.8, top, 1.8), steel); post.position.set(s * half, top / 2, 0); arch.add(post);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 3), steel); foot.position.set(s * half, 0.6, 0); arch.add(foot);
  }
  const board = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 3, 4.6, 1.4), steel); board.position.set(0, top - 1, 0); arch.add(board);
  const bannerTex = canvas(1024, 224, (x, w, h) => {
    x.fillStyle = '#12102A'; x.fillRect(0, 0, w, h);
    x.font = '900 150px Fredoka, Nunito, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = '#FF4D9D'; x.shadowBlur = 40; x.fillStyle = '#FF7AB8'; x.fillText('NEON AVENUE', w / 2, h / 2 + 6);
    x.shadowBlur = 0; x.fillStyle = '#fff'; x.fillText('NEON AVENUE', w / 2, h / 2 + 6);
  });
  for (const side of [1, -1]) {
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 + 1, 3.6), new THREE.MeshBasicMaterial({ map: bannerTex, toneMapped: false, color: bright('#ffffff', 1.4) }));
    banner.position.set(0, top - 1, side * 0.75); if (side < 0) banner.rotation.y = Math.PI; arch.add(banner);
  }
  // chaser bulbs round the board's frame
  const bulbPos = [];
  const W = half * 2 + 3, H = 4.6, step = 1.35;
  for (let x = -W / 2; x <= W / 2; x += step) { bulbPos.push([x, top - 1 + H / 2 + 0.2], [x, top - 1 - H / 2 - 0.2]); }
  for (let y = -H / 2 + step; y < H / 2; y += step) { bulbPos.push([-W / 2 - 0.2, top - 1 + y], [W / 2 + 0.2, top - 1 + y]); }
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), bulbPos.length * 2);
  bulbs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const m4 = new THREE.Matrix4();
  bulbPos.forEach(([x, y], i) => { for (const side of [0, 1]) { m4.makeTranslation(x, y, side ? -0.85 : 0.85); bulbs.setMatrixAt(i * 2 + side, m4); } });
  bulbs.setColorAt(0, C('#fff'));
  arch.add(bulbs);
  // order the bulbs round the frame so the chase runs along it
  const order = bulbPos.map((p, i) => ({ i, a: Math.atan2(p[1] - (top - 1), p[0] / (W / H)) })).sort((a, b) => a.a - b.a);
  const rank = new Array(bulbPos.length);
  order.forEach((o, n) => { rank[o.i] = n; });
  const warm = C('#FFD54A').multiplyScalar(3), dim = C('#5A4A1A'), col = new THREE.Color();
  animated.push({
    update(t) {
      bulbPos.forEach((_, i) => { const lit = ((rank[i] - t * 14) % 6 + 6) % 6 < 2.2; col.copy(lit ? warm : dim); bulbs.setColorAt(i * 2, col); bulbs.setColorAt(i * 2 + 1, col); });
      bulbs.instanceColor.needsUpdate = true;
    },
  });
  // the checkered line
  const checker = canvas(256, 32, (x) => { for (let i = 0; i < 32; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#14142B' : '#F7F4FF'; x.fillRect(i * 8, j * 8, 8, 8); } });
  checker.magFilter = THREE.NearestFilter;
  const line = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 2.6), new THREE.MeshStandardMaterial({ map: checker, roughness: 0.6 }));
  line.rotation.x = -Math.PI / 2; line.position.set(0, 0.09, 0); arch.add(line);
  root.add(arch);

  // painted starting boxes, where the karts line up (two columns, a row every 6 m behind the line)
  const boxTex = canvas(128, 192, (x, w, h) => { x.strokeStyle = '#F6E7B8'; x.lineWidth = 12; x.lineCap = 'square'; x.beginPath(); x.moveTo(12, h); x.lineTo(12, 18); x.lineTo(w - 12, 18); x.lineTo(w - 12, h); x.stroke(); });
  const boxMat = new THREE.MeshStandardMaterial({ map: boxTex, transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  for (let row = 0; row < 4; row++) for (const lat of [-3, 3]) {
    const p = at(-8 - row * 6 - (lat > 0 ? 0.5 : 0) - 1, lat);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 5.4), boxMat);
    b.rotation.set(-Math.PI / 2, 0, 0); b.rotation.order = 'YXZ'; b.rotation.y = yawOf(p);
    b.position.set(p.x, p.y + 0.1, p.z); root.add(b);
  }

  // crosswalks: white stripes across the road
  const zebra = canvas(256, 64, (x, w, h) => { x.fillStyle = 'rgba(0,0,0,0)'; x.clearRect(0, 0, w, h); x.fillStyle = '#EEEAF8'; for (let i = 0; i < 12; i++) x.fillRect(i * 22 + 4, 0, 12, h); });
  const zebraMat = new THREE.MeshStandardMaterial({ map: zebra, transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const f of [0.14, 0.47, 0.72]) {
    const p = at(f * model.length);
    const z = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2 - 1, 4), zebraMat);
    z.rotation.order = 'YXZ'; z.rotation.set(-Math.PI / 2, yawOf(p), 0); z.position.set(p.x, p.y + 0.1, p.z); root.add(z);
  }

  // ---- street lamps (poles with a warm light and a glow on the road) ----
  const lampSpots = [];
  for (let i = 0; i < SAMPLES; i += 26) for (const side of [-1, 1]) {
    const p = pts[i].clone().addScaledVector(nor[i], side * (WALL + 2.2)); lampSpots.push({ p, side, i });
  }
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.3, 9, 8), new THREE.MeshStandardMaterial({ color: '#39406A', roughness: 0.6 }), lampSpots.length);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.85, 12, 8), new THREE.MeshBasicMaterial({ color: bright('#FFE2A0', 3), toneMapped: false }), lampSpots.length);
  const glow = new THREE.InstancedMesh(new THREE.CircleGeometry(5.5, 20), new THREE.MeshBasicMaterial({ color: C('#FFC27A'), transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending }), lampSpots.length);
  lampSpots.forEach(({ p, side, i }, n) => {
    pole.setMatrixAt(n, new THREE.Matrix4().makeTranslation(p.x, p.y + 4.5, p.z));
    head.setMatrixAt(n, new THREE.Matrix4().makeTranslation(p.x - nor[i].x * side * 0.7, p.y + 9.2, p.z - nor[i].z * side * 0.7));
    const g = new THREE.Matrix4().makeRotationX(-Math.PI / 2); g.setPosition(p.x - nor[i].x * side * 9, p.y + 0.14, p.z - nor[i].z * side * 9);
    glow.setMatrixAt(n, g);
  });
  pole.castShadow = true;
  root.add(pole, head, glow);

  // ---- striped barriers and traffic cones ----
  const stripe = canvas(64, 32, (x, w, h) => { for (let i = -2; i < 6; i++) { x.fillStyle = i % 2 ? '#F4F0FF' : '#FF3D6E'; x.beginPath(); x.moveTo(i * 16, h); x.lineTo(i * 16 + 16, 0); x.lineTo(i * 16 + 32, 0); x.lineTo(i * 16 + 16, h); x.fill(); } });
  const barrierSpots = [];
  for (const [f, len] of [[0.04, 6], [0.3, 4], [0.52, 8], [0.8, 5]]) for (let k = 0; k < len; k++) {
    for (const side of [-1, 1]) if ((k + (side > 0 ? 1 : 0)) % 2 === 0 || f > 0.5) barrierSpots.push({ s: f * model.length + k * 3.4, side });
  }
  const barriers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 1.0, 3.2), new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.6 }), barrierSpots.length);
  barrierSpots.forEach(({ s, side }, n) => {
    const p = at(s, side * (ROAD_HALF - 0.9)), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawOf(p));
    barriers.setMatrixAt(n, new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y + 0.5, p.z), q, new THREE.Vector3(1, 1, 1)));
  });
  barriers.castShadow = true;
  root.add(barriers);
  const conePoints = [];
  for (const [f, side] of [[0.0, -6.5], [0.01, 6.5], [-0.012, -6.5], [0.2, 5.5], [0.205, 5.5], [0.21, 5.5], [0.4, -6], [0.405, -6], [0.6, 6], [0.605, 6], [0.76, -5.5], [0.765, -5.5], [0.77, -5.5], [0.9, 5.8]]) conePoints.push(at(f * model.length, side));
  const cones = new THREE.InstancedMesh(new THREE.ConeGeometry(0.45, 1.1, 14), new THREE.MeshStandardMaterial({ color: '#FF7A1A', roughness: 0.5, emissive: '#FF4A00', emissiveIntensity: 0.25 }), conePoints.length);
  const bases = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.1, 1), new THREE.MeshStandardMaterial({ color: '#FF7A1A', roughness: 0.6 }), conePoints.length);
  conePoints.forEach((p, n) => { cones.setMatrixAt(n, new THREE.Matrix4().makeTranslation(p.x, p.y + 0.65, p.z)); bases.setMatrixAt(n, new THREE.Matrix4().makeTranslation(p.x, p.y + 0.1, p.z)); });
  cones.castShadow = true;
  root.add(cones, bases);

  return {
    root,
    update(t) {
      for (const a of animated) {
        if (a.update) a.update(t);
        else if (a.mat) a.mat.color.setScalar(1.25 + 0.2 * Math.sin(t * 2 + a.flicker) + (Math.sin(t * 17 + a.flicker * 3) > 0.985 ? -0.6 : 0)); // a sign now and then flickers
      }
    },
  };
}
