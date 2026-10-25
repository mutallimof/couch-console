// The isometric toy dioramas: a small tiled island per game or hub, built from simple shapes.
// Used only by scripts/render-icons.mjs (through /icons.html) to make public/assets/icons/*.png.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const mat = (color, rough = 0.5, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
const place = (m, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); return m; };
const box = (w, h, d, c, x, y, z, r = 0.06) => place(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.2, h / 2.2, d / 2.2)), mat(c)), x, y + h / 2, z);
const cyl = (rt, rb, h, c, x, y, z, seg = 28) => place(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(c)), x, y + h / 2, z);
const ball = (r, c, x, y, z, extra) => place(new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), mat(c, 0.45, extra)), x, y + r, z);
const cone = (r, h, c, x, y, z, seg = 24) => place(new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(c)), x, y + h / 2, z);
const ring = (R, t, c, x, y, z) => { const m = place(new THREE.Mesh(new THREE.TorusGeometry(R, t, 14, 40), mat(c)), x, y, z); return m; };
const group = (...kids) => { const g = new THREE.Group(); g.add(...kids); return g; };
const rot = (o, x = 0, y = 0, z = 0) => { o.rotation.set(x, y, z); return o; };
const add = (root, ...objs) => root.add(...objs);

// The tiled base, the same for every icon: a cream slab with a colored top made of 4x4 little tiles
const TOP = {
  'turbo-karts': '#7ED957', 'table-tennis': '#FFD3D3', 'juicy-slash': '#FFE8B8', 'target-range': '#C7E8A0', 'air-hockey': '#BDE3FF', 'alien-strike': '#D9C8FF',
  dungeon: '#CFC6EE', 'balloon-pop': '#FFD6EA', draw: '#E4D9FF', 'paddle-duel': '#BFEFCB', bowling: '#FFD9A8', photos: '#BFEBDD', music: '#FFD9B8', present: '#C9D6FF',
  weather: '#CDEBFF', video: '#FFC9C9', timer: '#FFE0B0', 'on-this-day': '#E1D6FF', 'folder-party': '#FFD9B8', 'folder-arcade': '#D9C8FF', 'folder-camera': '#FFC9DC', 'folder-channels': '#BDE6EE',
};
export function makeBase(T, id) {
  const g = new THREE.Group();
  g.add(box(5.4, 0.55, 5.4, '#FFF4E0', 0, -0.55, 0, 0.18));
  const top = TOP[id] || '#DDE8F7', alt = new THREE.Color(top).offsetHSL(0, 0, -0.045);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) g.add(box(1.22, 0.1, 1.22, (i + j) % 2 ? alt : top, -1.9 + i * 1.27, -0.04, -1.9 + j * 1.27, 0.04));
  return g;
}

export const SCENES = {
  async 'turbo-karts'(T, r) {
    add(r, place(rot(new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.42, 12, 48), mat('#5E6677')), Math.PI / 2), 0, 0.12, 0.2));
    add(r, ring(1.7, 0.05, '#fff', 0, 0.5, 0.2)).children.at(-1).rotation.x = Math.PI / 2;
    const kart = group(box(1.0, 0.35, 1.5, '#FF5C5C', 0, 0.25, 0), box(0.8, 0.28, 0.5, '#FF8A8A', 0, 0.55, 0.45), box(1.3, 0.1, 0.25, '#FFD43B', 0, 0.45, -0.85));
    for (const [x, z] of [[-0.6, 0.55], [0.6, 0.55], [-0.6, -0.55], [0.6, -0.55]]) kart.add(rot(cyl(0.3, 0.3, 0.28, '#2B3345', x, 0.0, z), 0, 0, Math.PI / 2));
    // The driver: a KayKit character (CC0) seated in the kart, in its "sit" pose. Falls back to the old ball and cap if the model is missing.
    try {
      const [{ GLTFLoader }, { clone }] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/utils/SkeletonUtils.js')]);
      const gltf = await new GLTFLoader().loadAsync('/assets/cast/knight.glb'), who = clone(gltf.scene);
      who.updateMatrixWorld(true);
      const h = new THREE.Box3().setFromObject(who, true).getSize(new THREE.Vector3()).y;
      who.scale.setScalar(2.05 / h);
      const mixer = new THREE.AnimationMixer(who);
      mixer.clipAction(gltf.animations.find((a) => a.name === 'sit')).play();
      mixer.update(0.6);
      who.position.set(0, 0.34, -0.2); who.rotation.y = 0;
      kart.add(who);
    } catch { kart.add(ball(0.3, '#FFD1A0', 0, 0.55, -0.05), cone(0.32, 0.3, '#3FA9FF', 0, 1.0, -0.05)); }
    kart.position.set(1.7, 0.1, 0.2); kart.rotation.y = -0.3;
    add(r, kart);
    add(r, cyl(0.08, 0.08, 2.1, '#fff', -1.4, 0, -1.7), cyl(0.08, 0.08, 2.1, '#fff', 0.4, 0, -1.7), box(2.1, 0.45, 0.12, '#3FA9FF', -0.5, 1.7, -1.7));
  },
  'table-tennis'(T, r) {
    add(r, box(3.6, 0.2, 2.4, '#2FB872', 0, 0.9, 0), box(3.6, 0.04, 0.07, '#fff', 0, 1.1, 0), box(0.1, 0.06, 2.4, '#fff', 0, 1.1, 0));
    for (const [x, z] of [[-1.6, -1], [1.6, -1], [-1.6, 1], [1.6, 1]]) add(r, box(0.18, 0.9, 0.18, '#F3F6FB', x, 0, z));
    add(r, box(0.06, 0.4, 2.5, '#fff', 0, 1.1, 0, 0.02));
    const paddle = (x, z, rz, c) => { const p = group(cyl(0.5, 0.5, 0.08, c, 0, 0, 0), cyl(0.09, 0.09, 0.5, '#C98A4B', 0, -0.5, 0)); rot(p, Math.PI / 2 - 0.4, 0, rz); p.position.set(x, 1.65, z); return p; };
    add(r, paddle(-1.9, 1.4, 0.3, '#FF5C5C'), paddle(1.9, -1.4, -0.3, '#3FA9FF'), ball(0.2, '#fff', 0.5, 1.5, 0.4));
  },
  'juicy-slash'(T, r) {
    const half = (x, z, ry) => { const g = group(place(new THREE.Mesh(new THREE.SphereGeometry(0.95, 36, 20, 0, Math.PI * 2, 0, Math.PI / 2), mat('#2FB872')), 0, 0.5, 0),
      place(new THREE.Mesh(new THREE.CircleGeometry(0.95, 36), mat('#FF5C7A')), 0, 0.5, 0), place(new THREE.Mesh(new THREE.CircleGeometry(0.78, 36), mat('#FFE3E8')), 0, 0.51, 0)); g.children[1].rotation.x = -Math.PI / 2; g.children[2].rotation.x = -Math.PI / 2;
      for (let i = 0; i < 6; i++) { const s = ball(0.07, '#2A2A3A', Math.cos(i) * 0.4, 0.52, Math.sin(i) * 0.4); s.scale.y = 0.4; g.add(s); } g.position.set(x, 0, z); g.rotation.y = ry; return g; };
    add(r, half(-0.9, 0.6, 0.3), half(0.9, -0.2, 2.2));
    const sword = group(box(0.22, 0.1, 2.6, '#E8EEF7', 0, 0, 0.3, 0.04), box(0.7, 0.12, 0.16, '#FFC93C', 0, -0.01, -1.0), box(0.14, 0.14, 0.6, '#FF5C8A', 0, -0.02, -1.3));
    sword.position.set(0, 2.2, 0); sword.rotation.set(0.5, 0.7, 0.2); add(r, sword);
    for (const [x, y, z, c] of [[1.9, 1.1, 1.2, '#FF5C7A'], [-1.8, 1.6, -0.8, '#FF8FA3'], [0.3, 2.0, 1.6, '#FF5C7A'], [-0.4, 2.4, -1.2, '#FF8FA3']]) add(r, ball(0.16, c, x, y, z));
  },
  'target-range'(T, r) {
    const t = group(); [['#fff', 1.15], ['#FF5C5C', 0.92], ['#fff', 0.7], ['#FF5C5C', 0.48], ['#FFC93C', 0.24]].forEach(([c, R], i) => t.add(rot(cyl(R, R, 0.12 + i * 0.02, c, 0, 0, 0, 40), Math.PI / 2)));
    t.position.set(0, 1.8, -0.6); t.rotation.y = 0.2; add(r, t, box(0.18, 1.2, 0.18, '#C98A4B', 0, 0, -0.7), box(1.7, 0.14, 0.7, '#C98A4B', 0, 0, -0.7));
    for (const [x, y, ry] of [[0.5, 2.0, 0.1], [-0.4, 1.5, -0.1]]) { const a = group(rot(cyl(0.035, 0.035, 1.4, '#C98A4B', 0, 0, 0), Math.PI / 2), cone(0.08, 0.2, '#3FA9FF', 0, 0, 0.6)); a.children[1].rotation.x = Math.PI / 2; a.position.set(x, y, 0.1); a.rotation.y = ry; add(t.parent, a); }
    add(r, cyl(0.3, 0.3, 0.4, '#3FA9FF', 1.6, 0, 1.6), cyl(0.3, 0.3, 0.4, '#FFC93C', -1.6, 0, 1.4));
  },
  'air-hockey'(T, r) {
    add(r, box(3.8, 0.3, 2.6, '#3FA9FF', 0, 0.8, 0), box(3.4, 0.05, 2.2, '#EAF6FF', 0, 1.1, 0, 0.02), box(3.8, 0.28, 0.18, '#fff', 0, 1.1, 1.3), box(3.8, 0.28, 0.18, '#fff', 0, 1.1, -1.3));
    for (const [x, z] of [[-1.7, 1.1], [1.7, 1.1], [-1.7, -1.1], [1.7, -1.1]]) add(r, box(0.2, 0.8, 0.2, '#F3F6FB', x, 0, z));
    add(r, cyl(0.02, 0.02, 0.01, '#fff', 0, 1.15, 0), cyl(0.5, 0.5, 0.02, '#FF5C8A', 0, 1.14, 0, 40), ring(0.5, 0.03, '#FF5C8A', 0, 1.16, 0).rotateX(Math.PI / 2));
    add(r, cyl(0.28, 0.28, 0.07, '#222B3D', 0.2, 1.12, 0.1), cyl(0.3, 0.3, 0.12, '#FF5C5C', -1.2, 1.12, 0.3), ball(0.18, '#FF9A9A', -1.2, 1.2, 0.3), cyl(0.3, 0.3, 0.12, '#FFC93C', 1.3, 1.12, -0.2), ball(0.18, '#FFE08A', 1.3, 1.2, -0.2));
  },
  'alien-strike'(T, r) {
    const ufo = group(place(new THREE.Mesh(new THREE.SphereGeometry(1.5, 40, 20), mat('#C9D2E6', 0.3, { metalness: 0.3 })), 0, 0, 0), ball(0.75, '#7FE3FF', 0, 0.2, 0, { transparent: true, opacity: 0.85 }), ball(0.2, '#fff', 0, 0, 0));
    ufo.children[0].scale.y = 0.3; ufo.children[1].position.y = 0.45; ufo.position.set(0.2, 3.3, 0); ufo.rotation.z = 0.12;
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; ufo.add(ball(0.12, i % 2 ? '#FF5C8A' : '#FFD93D', Math.cos(a) * 1.25, -0.15, Math.sin(a) * 1.25, { emissive: i % 2 ? '#FF5C8A' : '#FFD93D', emissiveIntensity: 0.4 })); }
    add(r, ufo, place(new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.6, 32, 1, true), mat('#B7FFE0', 0.5, { transparent: true, opacity: 0.35, side: THREE.DoubleSide, emissive: '#7FFFD4', emissiveIntensity: 0.3 })), 0.2, 1.5, 0));
    add(r, cyl(0.45, 0.6, 0.35, '#7B61FF', -1.6, 0, 1.3), rot(cyl(0.12, 0.12, 0.9, '#E8EEF7', -1.3, 0.35, 1.1), 0, 0, -1.0), ball(0.4, '#FFD93D', 1.6, 0, 1.4), ball(0.12, '#222B3D', 1.5, 0.45, 1.65), ball(0.12, '#222B3D', 1.75, 0.45, 1.5));
  },
  dungeon(T, r) {
    const gem = place(new THREE.Mesh(new THREE.OctahedronGeometry(1.0), mat('#B38CFF', 0.2, { emissive: '#7B61FF', emissiveIntensity: 0.35 })), 0, 2.1, 0); gem.scale.y = 1.4; add(r, gem, cyl(1.3, 1.5, 0.5, '#8F88B8', 0, 0, 0, 8), cyl(0.9, 1.1, 0.35, '#A9A2D0', 0, 0.5, 0, 8));
    for (const x of [-1.9, 1.9]) add(r, cyl(0.38, 0.45, 1.7, '#B7B2D6', x, 0, -1.2, 8), box(0.9, 0.2, 0.9, '#8F88B8', x, 1.7, -1.2), ball(0.2, '#FFB020', x, 1.9, -1.2, { emissive: '#FF8A3D', emissiveIntensity: 0.9 }));
    add(r, box(0.6, 0.5, 0.5, '#C98A4B', 1.6, 0, 1.5), box(0.62, 0.12, 0.52, '#FFC93C', 1.6, 0.5, 1.5), ball(0.12, '#6EE7B7', -1.5, 0, 1.6), ball(0.1, '#FF8FB3', -1.2, 0, 1.9));
  },
  'balloon-pop'(T, r) {
    for (const [x, z, c, h] of [[-1.2, 0.2, '#FF5C8A', 2.6], [0.1, -0.5, '#3FA9FF', 3.2], [1.3, 0.4, '#FFC93C', 2.4]]) {
      const b = ball(0.78, c, x, h, z); b.scale.y = 1.18; add(r, b, cone(0.14, 0.2, c, x, h - 0.12, z).rotateX(Math.PI), place(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, h, 6), mat('#8E99B3')), x, h / 2, z));
      add(r, ball(0.14, '#fff', x - 0.3, h + 0.9, z + 0.3, { transparent: true, opacity: 0.5 }));
    }
    add(r, cyl(0.45, 0.55, 0.3, '#fff', 0, 0, 0.2), rot(cyl(0.03, 0.03, 1.5, '#C98A4B', 1.9, 0.5, 1.4), 0, 0, 0.5), cone(0.1, 0.3, '#FF5C5C', 2.3, 1.1, 1.4).rotateZ(-1.05));
  },
  draw(T, r) {
    add(r, box(3.0, 2.2, 0.16, '#fff', 0, 1.1, -0.4), box(3.2, 0.12, 0.3, '#C98A4B', 0, 0.95, -0.35), cyl(0.06, 0.06, 2.3, '#C98A4B', -1.0, 0, -0.9), cyl(0.06, 0.06, 2.3, '#C98A4B', 1.0, 0, -0.9));
    const p = [[-0.8, 1.8, '#FF5C8A', 0.5], [0.2, 1.5, '#3FA9FF', 0.6], [0.9, 2.0, '#FFC93C', 0.45], [-0.2, 2.1, '#2FD6A4', 0.35], [0.7, 1.2, '#7B61FF', 0.4]];
    for (const [x, y, c, s] of p) { const d = ball(s * 0.5, c, x, y - 0.5, -0.28); d.scale.z = 0.4; add(r, d); }
    const pencil = group(cyl(0.14, 0.14, 1.7, '#FFC93C', 0, 0, 0, 6), cone(0.14, 0.4, '#FFD6A5', 0, 1.7, 0, 6), cone(0.05, 0.14, '#333', 0, 2.0, 0, 6), cyl(0.15, 0.15, 0.2, '#FF5C8A', 0, -0.2, 0, 6));
    pencil.position.set(1.7, 0.2, 1.4); pencil.rotation.set(0.2, 0, -0.9); add(r, pencil);
  },
  'paddle-duel'(T, r) {
    add(r, box(3.6, 0.1, 2.8, '#2B8F5A', 0, 0.1, 0, 0.04));
    for (let i = -2; i <= 2; i++) add(r, box(0.08, 0.04, 0.3, '#fff', 0, 0.22, i * 0.5));
    add(r, box(0.3, 0.45, 1.0, '#FF5C8A', -1.6, 0.2, 0.3), box(0.3, 0.45, 1.0, '#3FA9FF', 1.6, 0.2, -0.4), ball(0.28, '#FFD93D', 0.4, 0.2, 0.2));
    add(r, ball(0.14, '#FFE9A3', -0.4, 0.4, 0.2, { transparent: true, opacity: 0.5 }), ball(0.1, '#FFE9A3', -0.9, 0.35, 0.2, { transparent: true, opacity: 0.35 }));
  },
  bowling(T, r) {
    add(r, box(2.4, 0.18, 5.0, '#E9B877', 0, 0.0, 0), box(0.28, 0.2, 5.0, '#7A5230', -1.34, 0, 0), box(0.28, 0.2, 5.0, '#7A5230', 1.34, 0, 0));
    const pin = (x, z) => group(cyl(0.2, 0.28, 0.9, '#fff', x, 0.15, z), ball(0.2, '#fff', x, 1.0, z), cyl(0.205, 0.205, 0.1, '#FF5C5C', x, 0.72, z)); // (a stripe)
    for (const [x, z] of [[0, -1.7], [-0.4, -2.1], [0.4, -2.1], [-0.8, -2.5], [0, -2.5], [0.8, -2.5]]) add(r, pin(x, z));
    add(r, ball(0.55, '#7B61FF', 0.5, 0.15, 1.7), ball(0.07, '#fff', 0.7, 0.9, 1.5), ball(0.07, '#fff', 0.45, 0.95, 1.4), ball(0.07, '#fff', 0.6, 0.78, 1.65));
  },
  photos(T, r) {
    const frame = (x, z, ry, pic, h) => { const g = group(box(1.7, 2.0, 0.12, '#fff', 0, 0, 0), box(1.4, 1.5, 0.05, pic[0], 0, 0.18, 0.07)); g.add(box(1.4, 0.55, 0.06, pic[1], 0, 0.18, 0.1), place(new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), mat('#FFE08A')), 0.35, 0.8, 0.11), cone(0.35, 0.5, pic[2], -0.3, 0.05, 0.12, 4)); g.position.set(x, h, z); g.rotation.y = ry; return g; };
    add(r, frame(-1.2, -0.3, 0.45, ['#9ED8FF', '#6FD08C', '#3FA37A'], 0.1), frame(1.2, -0.5, -0.4, ['#FFD3A5', '#FFB36E', '#E8743B'], 0.1), frame(0, 1.3, 0.05, ['#D6C9FF', '#B7A3FF', '#7B61FF'], 0.1));
    r.children.slice(-3).forEach((f) => { f.position.y += 1.0; });
    add(r, ball(0.14, '#FF5C8A', 1.9, 0, 1.6));
  },
  music(T, r) {
    add(r, box(4.0, 0.35, 3.0, '#B7A3FF', 0, 0, 0, 0.12), box(1.0, 1.5, 0.9, '#2F3550', -1.5, 0.35, -0.8), box(1.0, 1.5, 0.9, '#2F3550', 1.5, 0.35, -0.8));
    for (const x of [-1.5, 1.5]) add(r, cyl(0.32, 0.32, 0.06, '#FF8A3D', x, 1.2, -0.33).rotateX(Math.PI / 2), cyl(0.2, 0.2, 0.06, '#F3F6FB', x, 0.75, -0.33).rotateX(Math.PI / 2));
    const note = (x, y, z, c) => group(ball(0.28, c, x, y, z), cyl(0.05, 0.05, 1.1, c, x + 0.24, y + 0.3, z), box(0.5, 0.14, 0.08, c, x + 0.45, y + 1.35, z));
    add(r, note(-0.4, 2.2, 0.2, '#FF5C8A'), note(0.7, 1.7, 0.5, '#3FA9FF'));
    const disco = ball(0.5, '#E8EEF7', 0, 2.9, -0.8, { metalness: 0.5, roughness: 0.2 }); add(r, disco, cyl(0.02, 0.02, 0.8, '#8E99B3', 0, 3.4, -0.8));
  },
  present(T, r) {
    add(r, box(3.4, 2.1, 0.18, '#fff', 0, 1.4, -0.5), box(3.5, 0.12, 0.26, '#3B5BDB', 0, 3.4, -0.5), cyl(0.06, 0.06, 1.4, '#8E99B3', 0, 0, -0.5), box(1.2, 0.12, 0.8, '#8E99B3', 0, 0, -0.5));
    for (const [x, h, c] of [[-0.9, 0.7, '#3FA9FF'], [-0.3, 1.1, '#FF5C8A'], [0.3, 0.9, '#FFC93C'], [0.9, 1.4, '#2FD6A4']]) add(r, box(0.4, h, 0.1, c, x, 1.55, -0.38, 0.03));
    add(r, rot(cyl(0.1, 0.1, 1.3, '#3B5BDB', 1.6, 0.2, 1.4), 0, 0, 0.9), ball(0.12, '#FF3B3B', 1.0, 0.7, 1.4, { emissive: '#FF3B3B', emissiveIntensity: 0.8 }));
  },
  weather(T, r) {
    add(r, ball(0.9, '#FFC93C', 1.0, 2.0, -0.4, { emissive: '#FFB020', emissiveIntensity: 0.25 }));
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; add(r, rot(cone(0.12, 0.5, '#FFD54F', 1.0 + Math.cos(a) * 1.35, 2.0 + 0.9 + Math.sin(a) * 1.35 - 0.9, -0.4), 0, 0, a - Math.PI / 2)); }
    for (const [x, y, z, s] of [[-0.7, 1.4, 0.4, 0.85], [0.2, 1.6, 0.6, 1.1], [-1.5, 1.2, 0.5, 0.65], [0.9, 1.3, 0.6, 0.75]]) add(r, ball(s * 0.6, '#fff', x, y, z));
    for (const [x, z] of [[-1.0, 1.4], [-0.2, 1.7], [0.6, 1.4]]) { const d = ball(0.1, '#3FA9FF', x, 0.4, z); d.scale.set(0.7, 1.4, 0.7); add(r, d); }
  },
  video(T, r) {
    add(r, box(3.4, 2.3, 0.7, '#2F3550', 0, 0.5, -0.2, 0.12), box(2.9, 1.8, 0.1, '#FFF1D6', 0, 0.8, 0.18, 0.05), box(1.1, 0.12, 0.7, '#2F3550', 0, 0.0, -0.2));
    const tri = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 3), mat('#FF5C5C')); tri.rotation.set(Math.PI / 2, 0, Math.PI / 2); tri.position.set(0.1, 1.7, 0.3); add(r, tri);
    add(r, cyl(0.45, 0.35, 0.6, '#FF5C5C', 1.7, 0, 1.5), cyl(0.46, 0.46, 0.12, '#fff', 1.7, 0.2, 1.5), ball(0.2, '#FFF1B8', 1.6, 0.6, 1.5), ball(0.2, '#FFE08A', 1.85, 0.6, 1.4), ball(0.2, '#FFF1B8', 1.7, 0.75, 1.65));
    add(r, rot(cyl(0.03, 0.03, 1.0, '#8E99B3', -0.6, 2.7, -0.2), 0, 0, 0.5), rot(cyl(0.03, 0.03, 1.0, '#8E99B3', 0.6, 2.7, -0.2), 0, 0, -0.5));
  },
  timer(T, r) {
    add(r, cyl(1.5, 1.5, 0.7, '#FF8A3D', 0, 0.3, 0, 48).rotateX(Math.PI / 2), cyl(1.25, 1.25, 0.1, '#fff', 0, 1.5, 0.37, 48).rotateX(Math.PI / 2), cyl(0.2, 0.2, 0.4, '#8E99B3', 0, 3.05, 0), cyl(0.1, 0.1, 0.3, '#8E99B3', 1.1, 2.75, 0).rotateZ(-0.7));
    r.children.slice(-4).forEach((o) => { o.position.y += 1.0; });
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; add(r, box(0.08, i % 3 ? 0.14 : 0.26, 0.05, '#25304A', Math.sin(a) * 1.05, 2.5 + Math.cos(a) * 1.05, 0.46, 0.02)).children.at(-1).rotation.z = -a; }
    add(r, box(0.1, 0.9, 0.06, '#FF5C5C', 0.3, 2.55, 0.5).rotateZ(-0.5), box(0.12, 0.65, 0.06, '#25304A', 0, 2.5, 0.52), ball(0.12, '#25304A', 0, 2.38, 0.52));
  },
  'on-this-day'(T, r) {
    add(r, box(3.0, 2.8, 0.5, '#fff', 0, 0.4, -0.2, 0.12), box(3.0, 0.7, 0.54, '#FF5C5C', 0, 2.5, -0.2, 0.12));
    for (const x of [-0.8, 0.8]) add(r, cyl(0.1, 0.1, 0.6, '#8E99B3', x, 2.9, -0.2).rotateX(Math.PI / 2));
    r.children.slice(-2).forEach((o) => { o.position.y += 0.1; });
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) add(r, box(0.5, 0.4, 0.06, (i + j * 3) === 4 ? '#FF5C5C' : '#E6EEF9', -0.8 + i * 0.8, 0.8 + j * 0.55, 0.12, 0.05));
    add(r, ball(0.14, '#FFC93C', 1.9, 0, 1.5), ball(0.12, '#3FA9FF', -1.9, 0, 1.4));
  },
  'folder-party'(T, r) {
    add(r, cone(0.9, 2.2, '#FF5C8A', 0, 0.0, 0.0), ring(0.85, 0.07, '#FFC93C', 0, 0.45, 0).rotateX(Math.PI / 2), ring(0.55, 0.07, '#3FA9FF', 0, 1.1, 0).rotateX(Math.PI / 2), ball(0.22, '#FFC93C', 0, 2.1, 0));
    for (const [x, z, c] of [[-1.7, 1.2, '#3FA9FF'], [1.6, 1.4, '#2FD6A4'], [-1.4, -1.5, '#FFC93C'], [1.8, -0.9, '#FF5C8A'], [0.5, 1.9, '#7B61FF']]) add(r, rot(box(0.4, 0.06, 0.2, c, x, 0.05, z), 0, x, 0));
    const b = ball(0.7, '#3FA9FF', -1.7, 1.2, -0.6); b.scale.y = 1.2; add(r, b, place(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.3, 6), mat('#8E99B3')), -1.7, 0.65, -0.6));
  },
  'folder-arcade'(T, r) {
    add(r, box(1.9, 3.0, 1.6, '#7B61FF', 0, 0, 0, 0.12), box(1.5, 1.1, 0.1, '#25304A', 0, 1.55, 0.78), box(1.3, 0.9, 0.06, '#7FE3FF', 0, 1.65, 0.84, 0.03), box(1.9, 0.25, 1.1, '#5B45D6', 0, 1.1, 0.7));
    add(r, cyl(0.06, 0.06, 0.5, '#E8EEF7', -0.4, 1.2, 0.95), ball(0.17, '#FF5C5C', -0.4, 1.7, 0.95), ball(0.1, '#FFC93C', 0.2, 1.3, 0.95), ball(0.1, '#2FD6A4', 0.5, 1.3, 0.95), box(1.2, 0.5, 0.1, '#FFC93C', 0, 2.6, 0.5));
    add(r, ball(0.2, '#FF5C8A', 1.7, 0, 1.4), ball(0.2, '#3FA9FF', -1.7, 0, 1.3));
  },
  'folder-camera'(T, r) {
    add(r, box(3.0, 1.8, 1.3, '#FF5C8A', 0, 0.2, 0, 0.2), box(3.0, 0.5, 1.34, '#F3F6FB', 0, 1.1, 0, 0.18), cyl(0.85, 0.85, 0.6, '#25304A', 0, 0.55, 0.9).rotateX(Math.PI / 2), cyl(0.6, 0.6, 0.1, '#7FC8FF', 0, 0.55, 1.22).rotateX(Math.PI / 2), box(0.7, 0.4, 0.5, '#FF8FB3', -0.9, 2.0, 0), cyl(0.2, 0.2, 0.1, '#FFC93C', 1.0, 1.6, 0.2));
    r.children.slice(-5).forEach((o, i) => { if (i === 2 || i === 3) o.position.y += 0.9; });
    add(r, ball(0.25, '#fff', 1.9, 1.7, 1.2, { emissive: '#fff', emissiveIntensity: 0.6 }), box(0.9, 0.06, 0.7, '#fff', -1.6, 0.0, 1.5), box(0.9, 0.06, 0.7, '#9ED8FF', 1.5, 0.0, 1.6));
  },
  'folder-channels'(T, r) {
    add(r, box(3.2, 2.2, 1.2, '#1F7A8C', 0, 0.3, 0, 0.2), box(2.7, 1.7, 0.1, '#BFF3FF', 0, 0.55, 0.58, 0.06), box(0.2, 0.2, 0.1, '#FFC93C', 1.2, 0.35, 0.62), rot(cyl(0.04, 0.04, 1.3, '#8E99B3', -0.5, 2.5, 0), 0, 0, 0.5), rot(cyl(0.04, 0.04, 1.3, '#8E99B3', 0.5, 2.5, 0), 0, 0, -0.5));
    r.children.slice(-2).forEach((o) => { o.position.y += 0.1; });
    add(r, ball(0.5, '#fff', -0.5, 1.1, 0.7, { transparent: true, opacity: 0.0 }), ball(0.3, '#FFC93C', -0.5, 1.3, 0.66), ball(0.25, '#fff', 0.2, 1.4, 0.66), cone(0.3, 0.5, '#FF5C8A', 0.6, 0.95, 0.66, 3));
  },
};
