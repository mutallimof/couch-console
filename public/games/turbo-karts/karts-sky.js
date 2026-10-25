// Turbo Karts sky: a gradient dome with soft toon clouds, a sun (or a moon and stars at night), plus a few chunky
// low-poly clouds drifting around the horizon. Everything is drawn by code (no photos). The dome's horizon color is
// the fog color, so distant ground fades straight into the sky. Cloud Gardens also gets a sea of clouds far below.
import { worldOf } from './karts-themes.js';
import { rng } from './karts-noise.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const VERT = 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const FRAG = `uniform vec3 zenith, mid, horizon, cloudCol, cloudShade, sunCol, sunDir; uniform float time, cloudAmt, night; varying vec3 vDir;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
  void main(){
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(horizon, mid, smoothstep(0.0, 0.2, h));
    col = mix(col, zenith, smoothstep(0.16, 0.7, h));
    // toon clouds: flat shapes with a hard edge, a shaded side away from the sun
    vec2 uv = d.xz / (max(h, 0.0) + 0.2) * 0.85 + vec2(time * 0.0045, time * 0.0018);
    float thr = 1.0 - cloudAmt;
    float body = smoothstep(thr, thr + 0.022, fbm(uv * 1.15));
    vec2 toSun = normalize(sunDir.xz + 0.0001) * 0.05;
    float lit = smoothstep(thr, thr + 0.022, fbm((uv + toSun) * 1.15));
    vec3 cc = mix(cloudShade, cloudCol, lit);
    body *= smoothstep(0.012, 0.16, h);
    col = mix(col, cc, body * (night > 0.5 ? 0.55 : 0.96));
    float sd = max(dot(d, sunDir), 0.0);
    col += sunCol * (smoothstep(0.9987, 0.9993, sd) * 1.7 + pow(sd, 24.0) * 0.28 + pow(sd, 5.0) * 0.07) * (1.0 - body * 0.8);
    if (night > 0.5) { vec3 q = floor(d * 190.0); float s = step(0.9972, hash(q.xy + q.z * 17.0)) * smoothstep(0.08, 0.35, h); col += vec3(0.9, 0.95, 1.0) * s * (1.0 - body); }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// One chunky cloud: a few flattened low-poly blobs merged into one geometry
function cloudGeometry(THREE, seed, shade = '#CFE0F5') {
  const r = rng(seed), parts = [];
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const g = new THREE.IcosahedronGeometry(1, 1), s = 0.7 + r() * 0.6;
    const m = new THREE.Matrix4().compose(new THREE.Vector3((i - n / 2) * 0.95 + r() * 0.4, (r() - 0.3) * 0.35 + (i % 2) * 0.18, (r() - 0.5) * 0.8), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.62, s * 0.9));
    g.applyMatrix4(m);
    g.deleteAttribute('uv');
    parts.push(g.toNonIndexed());
  }
  const geo = mergeGeometries(parts);
  // painted top-lit: white on top, a soft shade underneath (so the clouds need no lights and never turn muddy)
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), top = new THREE.Color('#FFFFFF'), under = new THREE.Color(shade);
  for (let i = 0; i < p.count; i++) { const c = under.clone().lerp(top, Math.min(1, Math.max(0, (p.getY(i) + 0.4) / 1.1))); col.set([c.r, c.g, c.b], i * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

export function buildSky(THREE, def, group, { sunDir, bounds, terrainSky = null } = {}) {
  const S = worldOf(def).sky, night = !!S.night, C = (h) => new THREE.Color(h);
  const horizon = C(def.sky?.[1] || S.horizon);
  // The dome follows the camera, so it can never be reached or clipped
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      zenith: { value: C(S.zenith) }, mid: { value: C(S.mid) }, horizon: { value: C(S.horizon) }, cloudCol: { value: C(S.cloud) }, cloudShade: { value: C(S.cloudShade) },
      sunCol: { value: C(S.sun) }, sunDir: { value: new THREE.Vector3(...sunDir).normalize() }, time: { value: 0 }, cloudAmt: { value: S.cloudAmt }, night: { value: night ? 1 : 0 },
    },
    vertexShader: VERT, fragmentShader: FRAG,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 40, 20), mat);
  dome.renderOrder = -100; dome.frustumCulled = false; dome.userData.isSky = true;
  group.add(dome);

  // Chunky clouds on the horizon ring (they turn slowly around the track)
  const clouds = new THREE.Group();
  const cmat = new THREE.MeshBasicMaterial({ vertexColors: true, color: night ? C('#8E80C8') : C('#FFFFFF'), fog: true });
  const r = rng(9 + def.id.length);
  const count = night ? 6 : 16;
  const geos = [0, 1, 2].map((i) => cloudGeometry(THREE, 31 + i * 7, S.cloudShade));
  const inst = geos.map((g) => ({ g, places: [] }));
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, dist = 520 + r() * 380, y = 70 + r() * 90, s = 26 + r() * 34;
    inst[i % 3].places.push({ x: Math.cos(a) * dist, y, z: Math.sin(a) * dist, s, rot: r() * 6 });
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const { g, places } of inst) {
    if (!places.length) continue;
    const mesh = new THREE.InstancedMesh(g, cmat, places.length);
    places.forEach((p, i) => { e.set(0, p.rot, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.s, p.s, p.s)); mesh.setMatrixAt(i, m4); });
    mesh.frustumCulled = false;
    clouds.add(mesh);
  }
  group.add(clouds);

  // A sea of clouds far below the floating islands (Cloud Gardens)
  let sea = null;
  if (worldOf(def).terrain.floating && bounds) {
    sea = new THREE.Group();
    const smat = new THREE.MeshBasicMaterial({ vertexColors: true, color: '#FFFFFF' });
    const rr = rng(77), places = [];
    const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2, R = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2 + 520;
    for (let i = 0; i < 210; i++) {
      const a = rr() * Math.PI * 2, dist = Math.sqrt(rr()) * R;
      places.push({ x: cx + Math.cos(a) * dist, y: -48 - rr() * 18, z: cz + Math.sin(a) * dist, s: 20 + rr() * 30, rot: rr() * 6 });
    }
    for (let k = 0; k < 3; k++) {
      const list = places.filter((_, i) => i % 3 === k);
      const mesh = new THREE.InstancedMesh(geos[k], smat, list.length);
      list.forEach((p, i) => { e.set(0, p.rot, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.s * 1.6, p.s * 1.1, p.s * 1.6)); mesh.setMatrixAt(i, m4); });
      mesh.frustumCulled = false;
      sea.add(mesh);
    }
    group.add(sea);
  }
  return {
    horizon, dome,
    update(t, camPos) { mat.uniforms.time.value = t; if (camPos) dome.position.copy(camPos); clouds.rotation.y = t * 0.0035; },
  };
}
