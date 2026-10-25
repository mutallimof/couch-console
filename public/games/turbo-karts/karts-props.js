// Turbo Karts scenery props, all built by code: small flat-shaded, vertex-colored shapes drawn as InstancedMeshes
// (hundreds of trees cost a handful of draw calls). Each theme gets its own set, placed on the terrain.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, smooth } from './karts-noise.js';

// A geometry painted one color (and made non-indexed, so the flat shading stays crisp)
function part(THREE, geo, hex, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0 } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)));
  const c = new THREE.Color(hex), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

export function propGeometries(THREE) {
  const cyl = (rt, rb, h, s = 7) => new THREE.CylinderGeometry(rt, rb, h, s);
  const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
  const cone = (r, h, s = 7) => new THREE.ConeGeometry(r, h, s);
  const merge = (list) => mergeGeometries(list);
  // jitter a rock's corners so no two faces match
  const rock = (hex, r) => {
    const g = new THREE.DodecahedronGeometry(1, 0), p = g.attributes.position, seed = rng(5);
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.85 + seed() * 0.3), p.getY(i) * (0.7 + seed() * 0.3), p.getZ(i) * (0.85 + seed() * 0.3));
    g.computeVertexNormals();
    return part(THREE, g, hex, { sx: r * 1.2, sy: r * 0.8, sz: r, y: r * 0.45 });
  };
  return {
    roundTree: merge([part(THREE, cyl(0.28, 0.4, 2.4, 6), '#8B5E3C', { y: 1.2 }), part(THREE, ico(1.7), '#FFFFFF', { y: 3.6, sy: 0.95 }), part(THREE, ico(1.15), '#FFFFFF', { x: 0.5, y: 5, z: 0.2 })]),
    pine: merge([part(THREE, cyl(0.25, 0.35, 1.2, 6), '#7A5535', { y: 0.6 }),
      part(THREE, cone(2.0, 2.4, 7), '#2D7A55', { y: 2.3 }), part(THREE, cone(1.45, 2.2, 7), '#35895F', { y: 3.7 }), part(THREE, cone(0.95, 2.0, 7), '#3F9A6B', { y: 4.9 }),
      part(THREE, cone(1.15, 0.9, 7), '#FFFFFF', { y: 4.0 }), part(THREE, cone(0.7, 0.8, 7), '#FFFFFF', { y: 5.3 }), part(THREE, cone(1.5, 0.8, 7), '#F4F9FF', { y: 2.75 })]),
    bush: merge([part(THREE, ico(0.9), '#FFFFFF', { y: 0.55, sy: 0.75, sx: 1.2 }), part(THREE, ico(0.6), '#FFFFFF', { x: 0.8, y: 0.4, z: 0.2 })]),
    rock: rock('#9A9AA6', 1.4), rockRed: rock('#C46A3E', 1.6), rockSnow: merge([rock('#8D99B0', 1.5), part(THREE, ico(0.9), '#FFFFFF', { y: 1.2, sy: 0.5 })]),
    cactus: merge([part(THREE, cyl(0.42, 0.5, 3.4, 8), '#4F9A45', { y: 1.7 }), part(THREE, ico(0.42, 1), '#4F9A45', { y: 3.4 }),
      part(THREE, cyl(0.28, 0.28, 1.2, 7), '#4F9A45', { x: -0.9, y: 1.8, rz: Math.PI / 2 }), part(THREE, cyl(0.26, 0.28, 1.4, 7), '#4F9A45', { x: -1.5, y: 2.5 }),
      part(THREE, cyl(0.28, 0.28, 1.0, 7), '#4F9A45', { x: 0.8, y: 2.3, rz: Math.PI / 2 }), part(THREE, cyl(0.26, 0.28, 1.2, 7), '#4F9A45', { x: 1.3, y: 2.9 })]),
    spire: merge([part(THREE, cyl(2.4, 3.2, 5, 8), '#C65F33', { y: 2.5 }), part(THREE, cyl(1.8, 2.4, 4, 8), '#D9784B', { y: 7 }), part(THREE, cyl(1.2, 1.8, 3.5, 8), '#B84C2A', { y: 10.7 }), part(THREE, cyl(0.7, 1.2, 3, 8), '#E5A06C', { y: 13.9 })]),
    dryBush: merge([part(THREE, ico(0.8), '#B58A4B', { y: 0.45, sy: 0.6, sx: 1.3 }), part(THREE, ico(0.5), '#9F7440', { x: 0.7, y: 0.3 })]),
    flower: merge([part(THREE, cyl(0.04, 0.04, 0.5, 4), '#3C9A44', { y: 0.25 }), part(THREE, ico(0.13), '#FFFFFF', { y: 0.5, sy: 0.7 })]),
    crystal: merge([part(THREE, new THREE.OctahedronGeometry(1, 0), '#FFFFFF', { sx: 0.7, sy: 2.4, sz: 0.7, y: 2.4 }), part(THREE, new THREE.OctahedronGeometry(1, 0), '#E9DDFF', { x: 1.0, sx: 0.45, sy: 1.5, sz: 0.45, y: 1.5, rz: -0.25 }), part(THREE, new THREE.OctahedronGeometry(1, 0), '#E9DDFF', { x: -0.9, sx: 0.4, sy: 1.2, sz: 0.4, y: 1.2, rz: 0.3 })]),
    snowman: merge([part(THREE, ico(1.1, 1), '#FFFFFF', { y: 1.0 }), part(THREE, ico(0.8, 1), '#FFFFFF', { y: 2.4 }), part(THREE, ico(0.55, 1), '#FFFFFF', { y: 3.4 }),
      part(THREE, cone(0.1, 0.7, 5), '#F2701F', { y: 3.4, z: 0.6, rx: Math.PI / 2 }), part(THREE, cyl(0.5, 0.5, 0.15, 8), '#2B3445', { y: 3.9 }), part(THREE, cyl(0.3, 0.3, 0.5, 8), '#2B3445', { y: 4.2 })]),
    tower: merge([part(THREE, new THREE.BoxGeometry(1, 1, 1), '#FFFFFF', { y: 0.5 })]),
  };
}

// Many copies of a prop. places: [{ x, y, z, s, rot, tint }]; tint (a hex) varies the color per copy
export function scatterProps(THREE, geo, mat, places) {
  if (!places.length) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, places.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  places.forEach((p, i) => {
    e.set(p.tilt || 0, p.rot || 0, 0); q.setFromEuler(e);
    m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.sx ?? p.s ?? 1, p.sy ?? p.s ?? 1, p.sz ?? p.s ?? 1));
    mesh.setMatrixAt(i, m4);
    if (p.tint) mesh.setColorAt(i, c.set(p.tint));
  });
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  return mesh;
}

// The props of a track. terrain = buildTerrain(...). Returns { group, update(t) }
export function buildProps(THREE, def, path, terrain) {
  const group = new THREE.Group(), r = rng(1234 + def.id.length * 17), G = propGeometries(THREE);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
  const wall = path.wallHalf, { minX, maxX, minZ, maxZ } = terrain.bounds, theme = def.theme;
  const tints = (list) => () => list[Math.floor(r() * list.length)];

  // Random spots on land: away from the road, not too steep. rule(info) can veto a spot. Returns places with y on the ground.
  function spots(count, { min = wall + 5, max = 140, tries = count * 14, slope = 1.0, rule = null } = {}) {
    const out = [];
    for (let t = 0; t < tries && out.length < count; t++) {
      const x = minX - max + r() * (maxX - minX + max * 2), z = minZ - max + r() * (maxZ - minZ + max * 2);
      const s = terrain.sample(x, z);
      if (s.d < min || s.d > max) continue;
      if (Math.hypot(terrain.heightAt(x + 1.5, z) - terrain.heightAt(x - 1.5, z), terrain.heightAt(x, z + 1.5) - terrain.heightAt(x, z - 1.5)) / 3 > slope) continue;
      if (rule && !rule(s, x, z)) continue;
      out.push({ x, y: s.h - 0.05, z, rot: r() * 6.28, s: 0.75 + r() * 0.8 });
    }
    return out;
  }
  const add = (geo, places, material = mat) => { const m = scatterProps(THREE, geo, material, places); if (m) group.add(m); return m; };
  const updaters = [];

  if (theme === 'park') {
    const green = tints(['#5DBE52', '#72CC57', '#4FAF4D', '#86D660']);
    add(G.roundTree, spots(380, { max: 260 }).map((p) => ({ ...p, tint: green() })));
    add(G.bush, spots(220, { min: wall + 3, max: 90 }).map((p) => ({ ...p, s: p.s * 0.9, tint: green() })));
    add(G.flower, spots(900, { min: wall + 2.5, max: 55, slope: 0.6 }).map((p) => ({ ...p, s: 0.7 + p.s * 0.5, tint: ['#FF5C8A', '#FFC93C', '#FFFFFF', '#B28BFF', '#FF8A3D'][Math.floor(r() * 5)] })));
    add(G.rock, spots(50, { min: wall + 4, max: 110 }).map((p) => ({ ...p, s: 0.6 + r() * 0.7 })));
    windmill(THREE, group, terrain, spots, updaters);
    balloons(THREE, group, terrain, r, 4, updaters);
  } else if (theme === 'desert') {
    add(G.cactus, spots(170, { max: 120, slope: 0.5 }).map((p) => ({ ...p, s: 0.7 + r() * 0.7 })));
    add(G.dryBush, spots(160, { min: wall + 3, max: 100 }).map((p) => ({ ...p, tint: ['#FFFFFF', '#E8D5B0', '#CDB07A'][Math.floor(r() * 3)] })));
    add(G.rockRed, spots(130, { min: wall + 4, max: 200, slope: 1.4 }).map((p) => ({ ...p, s: 0.8 + r() * 1.6 })));
    add(G.spire, spots(34, { min: 34, max: 230, slope: 0.4 }).map((p) => ({ ...p, s: 0.9 + r() * 1.1 })));
  } else if (theme === 'snow') {
    const greens = tints(['#FFFFFF', '#E6F3EA', '#D4E8DC']);
    add(G.pine, spots(520, { min: wall + 6, max: 220, slope: 1.1, rule: (s) => s.h < 56 }).map((p) => ({ ...p, s: 0.8 + r() * 1.0, tint: greens() })));
    add(G.rockSnow, spots(110, { min: wall + 4, max: 230, slope: 1.6 }).map((p) => ({ ...p, s: 0.7 + r() * 1.5 })));
    add(G.snowman, spots(7, { min: wall + 4, max: 36, slope: 0.5 }).map((p) => ({ ...p, s: 0.9 + r() * 0.3 })));
    add(G.crystal, spots(36, { min: wall + 10, max: 150, slope: 0.7 }).map((p) => ({ ...p, s: 0.8 + r() * 0.8, tint: ['#BFE6FF', '#9AD7FF', '#D8F1FF'][Math.floor(r() * 3)] })));
  } else if (theme === 'pirate') {
    add(G.bush, spots(80, { min: wall + 3, max: 80, rule: (s) => s.h > 0.3 }).map((p) => ({ ...p, tint: ['#6BBE55', '#58AB4C'][Math.floor(r() * 2)] })));
    add(G.rock, spots(46, { min: wall + 4, max: 110, rule: (s) => s.h > -0.2 }).map((p) => ({ ...p, s: 0.6 + r() * 0.8, tint: '#D9C7A0' })));
  } else if (theme === 'sky') {
    const green = tints(['#6FD36A', '#86DE74', '#5CC463']);
    add(G.roundTree, spots(150, { max: 70, rule: (s) => s.h > -1 }).map((p) => ({ ...p, s: p.s * 0.9, tint: green() })));
    add(G.bush, spots(120, { min: wall + 3, max: 60, rule: (s) => s.h > -1 }).map((p) => ({ ...p, tint: green() })));
    add(G.flower, spots(800, { min: wall + 2.5, max: 52, slope: 0.6, rule: (s) => s.h > -1 }).map((p) => ({ ...p, s: 0.8 + p.s * 0.5, tint: ['#FF7EB6', '#FFE066', '#FFFFFF', '#B28BFF', '#7FD6FF'][Math.floor(r() * 5)] })));
    add(G.crystal, spots(46, { min: wall + 8, max: 60, rule: (s) => s.h > -1 }).map((p) => ({ ...p, s: 1 + r(), tint: ['#C9B3FF', '#FFB3DA', '#A7E8FF'][Math.floor(r() * 3)] })));
    balloons(THREE, group, terrain, r, 6, updaters);
    islets(THREE, group, terrain, r, G, mat);
  } else if (theme === 'city' || theme === 'avenue') {
    skyline(THREE, group, terrain, r, def);
  }
  return { group, update: (t) => updaters.forEach((f) => f(t)) };
}

// A windmill on a hill with turning blades
function windmill(THREE, group, terrain, spots, updaters) {
  const hill = spots(40, { min: 70, max: 200, slope: 0.5 }).sort((a, b) => b.y - a.y)[0];
  if (!hill) return;
  const g = new THREE.Group(), m = (c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.9 });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.6, 12, 8), m('#F4EDE0')), roof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 4.5, 8), m('#C0532F'));
  tower.position.y = 6; roof.position.y = 14.2;
  const hub = new THREE.Group(); hub.position.set(0, 12.5, 3.6);
  for (let i = 0; i < 4; i++) { const blade = new THREE.Mesh(new THREE.BoxGeometry(1.6, 9, 0.3), m('#FFFFFF')); blade.position.y = 4.8; const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2; arm.add(blade); hub.add(arm); }
  hub.add(new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), m('#8B5E3C')));
  g.add(tower, roof, hub);
  g.position.set(hill.x, hill.y, hill.z); g.rotation.y = Math.atan2(-hill.x, -hill.z);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.add(g);
  updaters.push((t) => { hub.rotation.z = t * 0.45; });
}

// Hot-air balloons drifting in the distance
function balloons(THREE, group, terrain, r, n, updaters) {
  const palette = [['#FF5C8A', '#FFFFFF'], ['#FFC93C', '#FF8A3D'], ['#3FA9FF', '#FFFFFF'], ['#2FD6A4', '#FFFFFF'], ['#B28BFF', '#FFE066']];
  const { minX, maxX, minZ, maxZ } = terrain.bounds, cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  for (let i = 0; i < n; i++) {
    const [a, b] = palette[i % palette.length], g = new THREE.Group();
    const geo = new THREE.SphereGeometry(7, 12, 9);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), ca = new THREE.Color(a), cb = new THREE.Color(b);
    for (let k = 0; k < pos.count; k++) { const ang = Math.atan2(pos.getZ(k), pos.getX(k)), c = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 8) % 2 ? ca : cb; col.set([c.r, c.g, c.b], k * 3); }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const env = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 }));
    env.scale.y = 1.15; env.position.y = 12;
    const basket = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 2.4), new THREE.MeshStandardMaterial({ color: '#8B5E3C', flatShading: true }));
    basket.position.y = 1.2;
    g.add(env, basket);
    const ang = r() * 6.28, rad = 200 + r() * 160, base = { x: cx + Math.cos(ang) * rad, y: 70 + r() * 70, z: cz + Math.sin(ang) * rad };
    g.position.set(base.x, base.y, base.z); g.scale.setScalar(1.5 + r());
    group.add(g);
    const ph = r() * 6.28;
    updaters.push((t) => { g.position.set(base.x + Math.sin(t * 0.03 + ph) * 18, base.y + Math.sin(t * 0.2 + ph) * 3, base.z + Math.cos(t * 0.025 + ph) * 18); });
  }
}

// Small floating rock islets with a tree, hovering around the big island (Cloud Gardens)
function islets(THREE, group, terrain, r, G, mat) {
  const { minX, maxX, minZ, maxZ } = terrain.bounds, cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, R = Math.max(maxX - minX, maxZ - minZ) / 2 + 60;
  const rockM = new THREE.MeshStandardMaterial({ color: '#B49CC8', flatShading: true, roughness: 1 }), grassM = new THREE.MeshStandardMaterial({ color: '#8BD47E', flatShading: true, roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const a = r() * 6.28, d = R + 30 + r() * 140, s = 10 + r() * 18, g = new THREE.Group();
    const under = new THREE.Mesh(new THREE.ConeGeometry(s, s * 1.1, 7), rockM); under.rotation.x = Math.PI; under.position.y = -s * 0.55;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(s, s * 1.02, 1.6, 7), grassM); top.position.y = 0.2;
    g.add(under, top);
    if (r() > 0.4) { const t = new THREE.Mesh(G.roundTree, mat); t.scale.setScalar(s * 0.12); t.position.y = 1; g.add(t); }
    g.position.set(cx + Math.cos(a) * d, -4 + (r() - 0.5) * 30, cz + Math.sin(a) * d);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    group.add(g);
  }
}

// A ring of chunky toy-block towers on the horizon (the city tracks): pastel colors, a few big windows, flat tops with a little
// cap or dome, so the skyline reads as calm shapes instead of noise. One merged mesh per color.
function skyline(THREE, group, terrain, r, def) {
  const PASTEL = def.theme === 'avenue'
    ? ['#FFB38A', '#FFD08A', '#FF9EB5', '#9ED8C9', '#B3C0FF', '#FFE4A0']
    : ['#FF9EB5', '#8FD0F0', '#FFD66B', '#A9E0A0', '#C3A9F5', '#FFB38A'];
  const facade = (hex) => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const x = c.getContext('2d'); x.fillStyle = hex; x.fillRect(0, 0, 64, 128);
    x.fillStyle = 'rgba(255,255,255,0.55)';
    for (let yy = 14; yy < 118; yy += 36) for (let xx = 10; xx < 54; xx += 24) { x.beginPath(); x.roundRect(xx, yy, 16, 22, 5); x.fill(); } // 2 big windows per row
    x.fillStyle = 'rgba(0,0,0,0.08)'; x.fillRect(0, 124, 64, 4);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  };
  const { minX, maxX, minZ, maxZ } = terrain.bounds, cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, R0 = Math.max(maxX - minX, maxZ - minZ) / 2 + 150;
  const roofMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.7, flatShading: true });
  PASTEL.forEach((hex, n) => {
    const tex = facade(hex), body = [], caps = [];
    for (let i = n; i < 48; i += PASTEL.length) {
      const a = (i / 48) * 6.28 + r() * 0.06, d = R0 + r() * 150, w = 24 + r() * 28, h = 34 + r() * 90;
      const g = new THREE.BoxGeometry(w, h, w);
      const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * Math.max(1, Math.round(w / 22)), uv.getY(k) * Math.max(1, Math.round(h / 28)));
      g.translate(cx + Math.cos(a) * d, h / 2 - 2, cz + Math.sin(a) * d);
      body.push(g);
      const cap = r() < 0.5 ? new THREE.CylinderGeometry(w * 0.2, w * 0.36, w * 0.4, 12) : new THREE.ConeGeometry(w * 0.5, w * 0.5, 4);
      cap.translate(cx + Math.cos(a) * d, h - 2 + w * 0.2, cz + Math.sin(a) * d);
      caps.push(cap);
    }
    group.add(new THREE.Mesh(mergeGeometries(body), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, flatShading: true })));
    const roofs = new THREE.Mesh(mergeGeometries(caps), roofMat.clone()); roofs.material.color.set(hex).offsetHSL(0, 0.05, -0.12);
    group.add(roofs);
  });
}

// Block City's streets: chunky pastel towers placed on the free spots next to the road (one InstancedMesh, colors per tower)
export function toyBlocks(THREE, spots) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const x = c.getContext('2d'); x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, 64, 128);
  x.fillStyle = 'rgba(70,90,140,0.28)';
  for (let yy = 14; yy < 118; yy += 36) for (let xx = 10; xx < 54; xx += 24) { x.beginPath(); x.roundRect(xx, yy, 16, 22, 5); x.fill(); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const geo = new THREE.BoxGeometry(1, 1, 1), uv = geo.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 2, uv.getY(k) * 3);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, flatShading: true }), spots.length);
  const PASTEL = ['#FF9EB5', '#8FD0F0', '#FFD66B', '#A9E0A0', '#C3A9F5', '#FFB38A'], m4 = new THREE.Matrix4(), col = new THREE.Color();
  spots.forEach(([px, pz, s], i) => {
    const w = 9 + s * 5, h = 12 + s * 22;
    m4.compose(new THREE.Vector3(px, h / 2 - 0.5, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (px * 7 + pz) % 3, 0)), new THREE.Vector3(w, h, w));
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, col.set(PASTEL[(Math.abs(Math.floor(px * 3 + pz)) + i) % PASTEL.length]));
  });
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
