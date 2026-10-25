// Turbo Karts item visuals, all original: the Spark Gem (the box you drive through), the Pulse Orb (a bouncing energy
// ball), the Goo puddle (a hazard left on the road), the Dart (a homing drone) and the Meteor (a strike on the leader).
// The rules (ow-kart/rules.js) keep their ids: orb, slick, seeker, comet, turbo, star.
const std = (THREE, color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0, ...o });
const glow = (THREE, color, opacity = 0.9) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });

// The item box: a faceted gem that spins and bobs, with a ring around it
export function makeGem(THREE) {
  const g = new THREE.Group();
  const geo = new THREE.OctahedronGeometry(0.95, 0).toNonIndexed();
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), a = new THREE.Color('#3EE6FF'), b = new THREE.Color('#B26BFF'), c = new THREE.Color('#FF6BC4');
  for (let i = 0; i < p.count; i += 3) { // one color per face: cyan on top, violet around, pink below
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, col3 = y > 0.2 ? a : y < -0.2 ? c : b;
    for (let k = 0; k < 3; k++) col.set([col3.r, col3.g, col3.b], (i + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.scale(1, 1.3, 1);
  const gem = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.2, metalness: 0.1, emissive: '#8A6BFF', emissiveIntensity: 0.12 }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.05, 6, 28), glow(THREE, '#9CF3FF', 0.75));
  ring.rotation.x = Math.PI / 2.4;
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 8), glow(THREE, '#C9A8FF', 0.05));
  g.add(gem, ring, halo);
  g.userData.spin = (t) => { gem.rotation.y = t * 1.4; ring.rotation.z = -t * 1.1; g.position.y += 0; };
  return g;
}

// A coin-like prize is not needed here: the toy coin model stays. These are the thrown / dropped items.
export function itemMesh(THREE, kind) {
  const g = new THREE.Group();
  if (kind === 'orb') { // Pulse Orb: a hot faceted core with two crossing rings
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), std(THREE, '#FF4D8D', { flatShading: true, emissive: '#FF2D75', emissiveIntensity: 1.1 }));
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.05, 6, 24), glow(THREE, '#7DF3FF', 0.9)), r2 = r1.clone();
    r2.rotation.x = Math.PI / 2;
    g.add(core, r1, r2, new THREE.Mesh(new THREE.SphereGeometry(1.0, 10, 8), glow(THREE, '#FF6BA8', 0.14)));
    g.userData.spin = (t) => { r1.rotation.y = t * 3; r2.rotation.z = t * 2.4; };
    return g;
  }
  if (kind === 'slick') { // Goo: a glossy purple puddle with bubbles
    const geo = new THREE.CircleGeometry(1.35, 22), pos = geo.attributes.position;
    for (let i = 1; i < pos.count; i++) { const a = Math.atan2(pos.getY(i), pos.getX(i)), k = 0.82 + 0.22 * Math.sin(a * 3 + 1) + 0.12 * Math.sin(a * 5); pos.setXY(i, pos.getX(i) * k, pos.getY(i) * k); }
    const puddle = new THREE.Mesh(geo, std(THREE, '#7C3AED', { roughness: 0.12, emissive: '#4C1D95', emissiveIntensity: 0.45 }));
    puddle.rotation.x = -Math.PI / 2;
    g.add(puddle);
    for (const [x, z, s] of [[0.5, 0.2, 0.28], [-0.6, -0.1, 0.2], [0.1, -0.6, 0.16], [-0.2, 0.5, 0.12]]) {
      const bub = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), std(THREE, '#B794F6', { transparent: true, opacity: 0.8, roughness: 0.05, emissive: '#7C3AED', emissiveIntensity: 0.3 }));
      bub.position.set(x, s * 0.5, z); bub.scale.y = 0.7;
      g.add(bub);
    }
    return g;
  }
  if (kind === 'seeker') { // Dart: a small homing drone, nose along +z
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.7, 8), std(THREE, '#FF8A3D', { flatShading: true, emissive: '#FF6A00', emissiveIntensity: 0.35 }));
    body.rotation.x = Math.PI / 2; body.position.z = 0.1;
    g.add(body);
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.5), std(THREE, '#27C9E5', { flatShading: true }));
      fin.position.set(0, 0, -0.55); const holder = new THREE.Group(); holder.rotation.z = (i * Math.PI) / 2; fin.position.y = 0.38; holder.add(fin); g.add(holder);
    }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.4, 8), glow(THREE, '#FFC247', 0.85));
    flame.rotation.x = -Math.PI / 2; flame.position.z = -1.35;
    g.add(flame);
    g.userData.spin = (t) => { flame.scale.set(1, 0.8 + 0.3 * Math.sin(t * 40), 1); };
    g.userData.faces = true; // (turned to point along the road)
    return g;
  }
  if (kind === 'comet') { // Meteor: a dark rock with glowing cracks and a fiery tail
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.95, 0), std(THREE, '#5B3A29', { flatShading: true, roughness: 0.9, emissive: '#FF7A1A', emissiveIntensity: 0.6 }));
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.95, 4.5, 8, 1, true), glow(THREE, '#FF9A3D', 0.55));
    tail.rotation.x = -Math.PI / 2; tail.position.z = -2.4;
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8), glow(THREE, '#FFB347', 0.22));
    g.add(rock, tail, halo);
    g.userData.spin = (t) => { rock.rotation.set(t * 2, t * 3, 0); };
    g.userData.faces = true;
    return g;
  }
  return g;
}
