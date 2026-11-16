// Turbo Karts track hazards, the part you see (the rules are in ow-kart/rules.js): toy things that cross the road,
// ice sheets, wind. All built in code from the art tokens; nothing is created while racing.
//   looks: ball · tumbleweed · taxi · cone · tail · tyres · pumpkin (movers) · ice (patch) · wind (gust)
import { Parts, toyMesh, roundBox } from './karts-toykit.js';
import { PALETTE, ROLES, roleMaterial } from './karts-tokens.js';

const P = PALETTE;

function ballGeometry(THREE, r) {
  // a beach ball: six colored wedges and two white caps
  const parts = new Parts(), colors = [P.pop, P.cream, P.sky, P.butter, P.mint, P.cream];
  colors.forEach((c, i) => parts.add(new THREE.SphereGeometry(r, 6, 10, (i * Math.PI) / 3, Math.PI / 3, 0.25, Math.PI - 0.5), c));
  parts.add(new THREE.SphereGeometry(r, 12, 3, 0, Math.PI * 2, 0, 0.26), P.cream);
  parts.add(new THREE.SphereGeometry(r, 12, 3, 0, Math.PI * 2, Math.PI - 0.26, 0.26), P.cream);
  return parts.merge();
}
function tumbleweedGeometry(THREE, r) {
  const parts = new Parts();
  for (let i = 0; i < 7; i++) parts.add(new THREE.TorusGeometry(r * (0.72 + (i % 3) * 0.1), r * 0.1, 5, 14), i % 2 ? '#E0B070' : '#C99255', [0, 0, 0], [i * 0.9, i * 1.7, i * 0.5]);
  parts.add(new THREE.IcosahedronGeometry(r * 0.5, 0), '#B07A45');
  return parts.merge();
}
function taxiGeometry(THREE) { // a small toy taxi, facing +x (the way it drives across the road)
  const parts = new Parts();
  parts.add(roundBox(3.4, 0.9, 1.8, 0.3), P.butter, [0, 0.85, 0]);
  parts.add(roundBox(1.8, 0.8, 1.6, 0.3), P.cream, [-0.1, 1.55, 0]);
  parts.add(roundBox(0.7, 0.3, 0.5, 0.1), P.ink, [-0.1, 2.05, 0]);           // the roof sign
  for (const z of [-0.92, 0.92]) for (const x of [-1.6, -1.1, -0.6, 0.6, 1.1, 1.6].slice(0)) if (Math.abs(x) < 1.7 && (Math.round(x * 2) % 2 === 0)) parts.add(new THREE.BoxGeometry(0.3, 0.26, 0.04), P.ink, [x * 0.6, 0.95, z]); // checker stripe
  for (const x of [-1.05, 1.05]) for (const z of [-0.85, 0.85]) parts.add(new THREE.CylinderGeometry(0.42, 0.42, 0.36, 14), P.ink, [x, 0.42, z], [Math.PI / 2, 0, 0]);
  parts.add(new THREE.SphereGeometry(0.16, 8, 6), P.cream, [1.72, 0.9, 0.55]); parts.add(new THREE.SphereGeometry(0.16, 8, 6), P.cream, [1.72, 0.9, -0.55]);
  return parts.merge();
}
function coneGeometry(THREE) {
  const parts = new Parts();
  parts.add(roundBox(1.3, 0.16, 1.3, 0.06), P.cushion, [0, 0.08, 0]);
  parts.add(new THREE.CylinderGeometry(0.1, 0.5, 1.5, 14), P.cushion, [0, 0.9, 0]);
  parts.add(new THREE.CylinderGeometry(0.3, 0.39, 0.3, 14), P.cream, [0, 0.72, 0]);
  return parts.merge();
}
function tyresGeometry(THREE) {
  const parts = new Parts();
  for (let i = 0; i < 3; i++) {
    parts.add(new THREE.TorusGeometry(0.85, 0.42, 8, 18), i === 1 ? P.cream : P.ink, [0, 0.42 + i * 0.8, 0], [Math.PI / 2, 0, 0]);
  }
  return parts.merge();
}
function tailGeometry(THREE) { // the sea monster's tail tip: a fat curled teardrop with a fin, lying across the road
  const parts = new Parts(), teal = '#1FB8A6';
  for (let i = 0; i < 6; i++) { const k = 1 - i / 7; parts.add(new THREE.SphereGeometry(1.25 * k, 12, 8), i % 2 ? teal : P.mint, [-i * 1.25, 0.95 * k + Math.sin(i * 0.9) * 0.25, 0], [0, 0, 0], [1.15, 1, 1]); }
  parts.add(new THREE.ConeGeometry(1.0, 1.9, 4), P.pop, [1.5, 1.25, 0], [0, 0, -Math.PI / 2], [1, 1, 0.25]);
  for (let i = 0; i < 4; i++) parts.add(new THREE.ConeGeometry(0.28, 0.6, 4), P.butter, [-i * 1.25 - 0.3, 2.0 - i * 0.28, 0]);
  return parts.merge();
}
function pumpkinGeometry(THREE, r) {
  const parts = new Parts();
  for (let i = 0; i < 6; i++) parts.add(new THREE.SphereGeometry(r * 0.62, 8, 8), i % 2 ? P.cushion : '#F27A2A', [Math.cos(i * 1.047) * r * 0.42, 0, Math.sin(i * 1.047) * r * 0.42], [0, 0, 0], [1, 1.25, 1]);
  parts.add(new THREE.CylinderGeometry(r * 0.08, r * 0.12, r * 0.4, 6), '#3E8F4A', [0, r * 0.85, 0]);
  return parts.merge();
}
const MOVER = {
  ball: { geo: (T, h) => ballGeometry(T, h.radius), lift: (h) => h.radius, roll: true },
  tumbleweed: { geo: (T, h) => tumbleweedGeometry(T, h.radius), lift: (h) => h.radius, roll: true, bounce: 0.5 },
  pumpkin: { geo: (T, h) => pumpkinGeometry(T, h.radius), lift: (h) => h.radius * 0.8, roll: true },
  taxi: { geo: (T) => taxiGeometry(T), lift: () => 0, face: true },
  tail: { geo: (T) => tailGeometry(T), lift: () => 0, face: true, wiggle: true },
  cone: { geo: (T) => coneGeometry(T), lift: () => 0 },
  tyres: { geo: (T) => tyresGeometry(T), lift: () => 0 },
};

// A pair of striped marker posts at the roadside, so you can see a hazard coming
function markerGeometry(THREE) {
  const parts = new Parts();
  for (let i = 0; i < 4; i++) parts.add(new THREE.CylinderGeometry(0.22, 0.22, 0.7, 10), i % 2 ? P.cream : P.pop, [0, 0.35 + i * 0.7, 0]);
  parts.add(new THREE.SphereGeometry(0.34, 10, 8), P.butter, [0, 3.05, 0]);
  return parts.merge();
}

// race.hazards -> meshes in one group. update(race, t) moves them (t = seconds, for the little idle motions).
export function createHazards(THREE, T, hazards) {
  const group = new THREE.Group(), movers = [], winds = [];
  const geos = new Map(), geoOf = (key, build) => { if (!geos.has(key)) geos.set(key, build()); return geos.get(key); };
  const side = T.roadHalf + 2.6;
  const post = (s, lateral) => { const m = toyMesh(geoOf('marker', () => markerGeometry(THREE))); const p = T.surfaceAt(s, lateral); m.position.set(p.x, p.y, p.z); group.add(m); };
  const ice = new THREE.MeshPhysicalMaterial({ color: '#D6F0FF', roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, transparent: true, opacity: 0.9, envMapIntensity: 1.4, side: THREE.DoubleSide });
  const streakMat = roleMaterial(THREE, 'glow', P.cream, { transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });

  for (const h of hazards) {
    if (h.type === 'mover') {
      const kind = MOVER[h.look] || MOVER.ball;
      const mesh = toyMesh(geoOf(`${h.look}|${h.radius}`, () => kind.geo(THREE, h)));
      const holder = new THREE.Group(); holder.add(mesh); group.add(holder);
      movers.push({ h, kind, holder, mesh, last: 0 });
      if (h.span) for (const s of [-1, 1]) post(h.s - 9, s * side);
    } else if (h.type === 'patch') {
      // a sheet lying on the road, following its curve
      const pos = [], idx = [], n = Math.max(4, Math.round(h.length / 2.5));
      for (let i = 0; i <= n; i++) {
        const s = h.s - h.length / 2 + (h.length * i) / n, edge = Math.min(1, Math.min(i, n - i) / 2); // (rounded ends)
        const half = (h.width / 2) * (0.55 + 0.45 * edge) * (1 + Math.sin(i * 1.7) * 0.06);
        for (const sgn of [-1, 1]) { const p = T.surfaceAt(s, h.lateral + sgn * half); pos.push(p.x, p.y + 0.075, p.z); }
        if (i < n) { const v = i * 2; idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, h.look === 'ice' ? ice : new THREE.MeshStandardMaterial({ color: P.sky, ...ROLES.rubber, transparent: true, opacity: 0.8 }));
      m.receiveShadow = true; m.renderOrder = 1; group.add(m);
      for (const s of [-1, 1]) post(h.s - h.length / 2 - 6, s * side);
    } else if (h.type === 'gust') {
      // windsocks at both ends and pale streaks that drift across the road with the wind
      // (a windsock on each side at the start, the middle and the end of the stretch)
      const socks = [[-1, -1], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 1]].map(([e, sd]) => {
        const p = T.surfaceAt(h.s + (e * h.length) / 2, sd * side), f = T.trackAt(h.s + (e * h.length) / 2);
        const holder = new THREE.Group(); holder.position.set(p.x, p.y, p.z); holder.rotation.y = Math.atan2(f.rx, f.rz);
        const pole = toyMesh(geoOf('pole', () => new Parts().add(new THREE.CylinderGeometry(0.14, 0.18, 6.4, 8), P.cream, [0, 3.2, 0]).add(new THREE.SphereGeometry(0.26, 8, 6), P.pop, [0, 6.5, 0]).merge()));
        const sock = new THREE.Group(); sock.position.y = 6;
        sock.add(toyMesh(geoOf('sock', () => { const q = new Parts(); for (let i = 0; i < 4; i++) q.add(new THREE.CylinderGeometry(0.55 - i * 0.1, 0.45 - i * 0.1, 0.75, 10, 1, true), i % 2 ? P.cream : P.pop, [0, 0, 0.4 + i * 0.75], [Math.PI / 2, 0, 0]); return q.merge(); })));
        holder.add(pole, sock); holder.scale.setScalar(1.35); group.add(holder);
        return sock;
      });
      const streaks = Array.from({ length: 18 }, (_, i) => {
        const m = new THREE.Mesh(geoOf('streak', () => new THREE.PlaneGeometry(5.5, 0.28)), streakMat);
        m.userData = { s: h.s - h.length / 2 + ((i + 0.5) / 18) * h.length, off: (i * 7.3) % 1, y: 0.9 + (i % 4) * 0.7 };
        group.add(m); return m;
      });
      winds.push({ h, socks, streaks });
    }
  }

  return {
    group,
    update(race, t) {
      for (const m of movers) {
        const { h, kind, holder, mesh } = m, lat = race.hazardLateral(h), p = T.surfaceAt(h.s, lat);
        const moved = lat - m.last; m.last = lat;
        const since = h.hitAt == null ? 9 : race.raceTime - h.hitAt, knock = since < 0.7 ? Math.sin((since / 0.7) * Math.PI) : 0; // a little jump when a kart hits it
        const bounce = kind.bounce ? Math.abs(Math.sin(t * 5 + h.id)) * kind.bounce : 0;
        holder.position.set(p.x, p.y + kind.lift(h) + bounce + knock * 1.1, p.z);
        holder.rotation.y = Math.atan2(p.rx, p.rz) - Math.PI / 2; // local +x = across the road, to the right
        if (kind.roll) mesh.rotation.z -= moved / Math.max(0.4, h.radius);
        if (kind.face && moved) mesh.rotation.y = moved > 0 ? 0 : Math.PI;
        if (kind.wiggle) mesh.rotation.z = Math.sin(t * 3 + h.id) * 0.08;
        if (!kind.roll) mesh.rotation.x = knock * 0.5;
      }
      for (const w of winds) {
        const push = race.gustPush(w.h), k = push / w.h.force;
        for (const s of w.socks) { s.rotation.y = k >= 0 ? 0 : Math.PI; s.rotation.x = 0.5 - Math.abs(k) * 0.5 + Math.sin(t * 9) * 0.04 * Math.abs(k); }
        streakMat.opacity = 0.15 + Math.abs(k) * 0.7;
        for (const m of w.streaks) {
          const u = m.userData; u.off = (u.off + k * 0.012 + 1) % 1;
          const p = T.surfaceAt(u.s, (u.off - 0.5) * (T.roadHalf * 2 + 6));
          m.position.set(p.x, p.y + u.y, p.z); m.rotation.y = Math.atan2(p.rx, p.rz) - Math.PI / 2;
        }
      }
    },
    dispose() { group.removeFromParent(); for (const g of geos.values()) g.dispose(); ice.dispose(); streakMat.dispose(); },
  };
}
