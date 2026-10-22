// Turbo Karts: real 3D models from the free CC0 packs in public/assets/
// (Kenney Toy Car Kit + Racing Kit, Quaternius Pirate Kit). Each model is loaded once and
// cloned. Anything that fails to load just falls back to the code-built models.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const BASE = '/assets/';
export const CAR = (n) => `car-kit/Models/GLB format/${n}.glb`;
export const RACE = (n) => `racing-kit/Models/GLTF format/${n}.glb`;
export const PIRATE = (n) => `pirate-kit/glTF/${n}.gltf`;

const loader = new GLTFLoader();
const cache = new Map(); // path -> Promise<gltf | null>

// Load a model (once). Resolves to the glTF, or null if it couldn't be loaded.
export function load(path) {
  if (!cache.has(path)) {
    cache.set(path, loader.loadAsync(BASE + path).then((g) => {
      g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      return g;
    }).catch((err) => { console.warn('Model not loaded:', path, err.message); return null; }));
  }
  return cache.get(path);
}

// Load many with a progress callback (0..1)
export async function loadAll(paths, onProgress) {
  let done = 0;
  const out = await Promise.all(paths.map((p) => load(p).then((g) => { onProgress?.(++done / paths.length); return g; })));
  return out;
}

// A fresh copy of a loaded model (skinned characters need a special clone), or null
export async function instance(path) {
  const g = await load(path);
  if (!g) return null;
  return { object: cloneSkinned(g.scene), animations: g.animations };
}

// Copy synchronously from an already-loaded glTF
export function cloneOf(g) {
  return g ? { object: cloneSkinned(g.scene), animations: g.animations } : null;
}

// Scale an object so its largest size is `size` meters and it sits on y = 0 (centered)
export function fit(THREE, object, size, { center = true } = {}) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const s = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const k = size / Math.max(s.x, s.y, s.z);
  object.scale.multiplyScalar(k);
  object.position.y -= box.min.y * k;
  if (center) { object.position.x -= c.x * k; object.position.z -= c.z * k; }
  const holder = new THREE.Group();
  holder.add(object);
  return holder;
}
