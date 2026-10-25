// Building blocks for the toy pilots and karts (karts-pilot.js, karts-toykart.js): every racer is made in code from a few rounded
// shapes, merged into one mesh per moving part with the colors baked in (vertex colors), so a racer costs only a handful of draw
// calls and every racer shares ONE glossy plastic material. A soft dark outline is drawn by an inflated back-face copy of the same
// geometry (the "inverted hull"), in the same mesh: no extra geometry.
// All original shapes. Nothing here runs per frame.

let THREE = null;
export function setToyThree(t) { THREE = t; }

// ---------- shared materials ----------

let plastic = null, hull = null;
const hullThick = { value: 0.02 };

// One glossy toy-plastic material for everything with vertex colors
export function plasticMaterial() {
  if (!plastic) {
    plastic = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.34, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.3, envMapIntensity: 0.9 });
  }
  return plastic;
}

// The outline: the same shape pushed out a little along its normals and drawn from the inside only
export function outlineMaterial() {
  if (!hull) {
    hull = new THREE.MeshBasicMaterial({ color: '#2a1d4a', side: THREE.BackSide });
    hull.onBeforeCompile = (shader) => {
      shader.uniforms.uThick = hullThick;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uThick;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normalize(normal) * uThick;');
    };
    hull.customProgramCacheKey = () => 'toy-hull';
  }
  return hull;
}

// ---------- shapes ----------

// A box with rounded edges and corners (smooth normals)
export function roundBox(w, h, d, r = 0.1, seg = 2) {
  const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2);
  const half = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
  const p = new THREE.Vector3(), q = new THREE.Vector3(), n = new THREE.Vector3();
  const pos = g.attributes.position, nor = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    q.set(Math.max(-half.x, Math.min(half.x, p.x)), Math.max(-half.y, Math.min(half.y, p.y)), Math.max(-half.z, Math.min(half.z, p.z)));
    n.subVectors(p, q);
    if (n.lengthSq() < 1e-10) { n.fromBufferAttribute(nor, i); } else n.normalize();
    p.copy(q).addScaledVector(n, r);
    pos.setXYZ(i, p.x, p.y, p.z); nor.setXYZ(i, n.x, n.y, n.z);
  }
  return g;
}

// A sphere cut to a range of angles, with UVs that follow the WHOLE sphere (u = around, v = from the bottom), so one picture
// can be wrapped over several pieces. phi 0 = -x, pi/2 = +z (front), pi = +x, 3pi/2 = -z (back).
export function sphereBand(r, wSeg, hSeg, phiStart = 0, phiLength = Math.PI * 2, thetaStart = 0, thetaLength = Math.PI) {
  const g = new THREE.SphereGeometry(r, wSeg, hSeg, phiStart, phiLength, thetaStart, thetaLength);
  const uv = g.attributes.uv;
  let i = 0;
  for (let iy = 0; iy <= hSeg; iy++) {
    for (let ix = 0; ix <= wSeg; ix++, i++) {
      const phi = phiStart + (ix / wSeg) * phiLength, theta = thetaStart + (iy / hSeg) * thetaLength;
      uv.setXY(i, phi / (Math.PI * 2), 1 - theta / Math.PI);
    }
  }
  return g;
}

// ---------- merging many shapes into one mesh ----------

const m4 = () => new THREE.Matrix4();
export class Parts {
  constructor() { this.list = []; }
  // geometry, color, then a position [x,y,z], rotation [x,y,z] (radians) and scale [x,y,z] (numbers or arrays)
  add(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
    const g = geo.clone();
    const s = Array.isArray(scale) ? scale : [scale, scale, scale];
    g.applyMatrix4(m4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...s)));
    const c = new THREE.Color(color), n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.list.push(g);
    return this;
  }
  merge() { return mergeGeometries(this.list); }
}

export function mergeGeometries(list) {
  let vertices = 0, indices = 0;
  for (const g of list) { vertices += g.attributes.position.count; indices += g.index ? g.index.count : g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  const names = ['position', 'normal', 'uv', 'color'], sizes = { position: 3, normal: 3, uv: 2, color: 3 };
  const arrays = Object.fromEntries(names.map((n) => [n, new Float32Array(vertices * sizes[n])]));
  const index = new Uint32Array(indices);
  let v = 0, ii = 0;
  for (const g of list) {
    const count = g.attributes.position.count;
    for (const n of names) {
      const a = g.attributes[n];
      if (a) arrays[n].set(a.array, v * sizes[n]);
      else if (n === 'color') arrays.color.fill(1, v * 3, (v + count) * 3);
    }
    if (g.index) for (let k = 0; k < g.index.count; k++) index[ii++] = g.index.array[k] + v;
    else for (let k = 0; k < count; k++) index[ii++] = v + k;
    v += count;
  }
  for (const n of names) out.setAttribute(n, new THREE.BufferAttribute(arrays[n], sizes[n]));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  return out;
}

// A mesh that draws the shape in toy plastic and then its outline (one object, two draws).
//   opts.material: another material for the first draw (e.g. a textured helmet) · opts.outline: false for none · opts.thick
export function toyMesh(geo, { material = null, outline = true, cast = true } = {}) {
  const mats = [material || plasticMaterial()];
  geo.clearGroups();
  const count = geo.index.count;
  geo.addGroup(0, count, 0);
  if (outline) { geo.addGroup(0, count, 1); mats.push(outlineMaterial()); }
  const mesh = new THREE.Mesh(geo, outline ? mats : mats[0]);
  mesh.castShadow = cast;
  mesh.userData.hasOutline = outline;
  return mesh;
}

// Outlines on or off for a whole racer (a cheaper picture for far-away or crowded split-screen views)
export function setOutlines(root, on) {
  root.traverse((o) => {
    if (!o.isMesh || !o.userData.hasOutline) return;
    const g = o.geometry;
    g.clearGroups();
    g.addGroup(0, g.index.count, 0);
    if (on) g.addGroup(0, g.index.count, 1);
  });
}

// Cached by key: the geometry of a part is the same for every racer that looks like it
const cache = new Map();
export function cached(key, build) {
  if (!cache.has(key)) cache.set(key, build());
  return cache.get(key);
}

// colors
export const tint = (hex, amount) => { const c = new THREE.Color(hex); return amount >= 0 ? c.lerp(new THREE.Color('#ffffff'), amount) : c.lerp(new THREE.Color('#10122a'), -amount); };
export const hexOf = (c) => `#${(c.isColor ? c : new THREE.Color(c)).getHexString()}`;
