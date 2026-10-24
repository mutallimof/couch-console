// Poly Haven (CC0, https://polyhaven.com) skies and textures from public/assets/polyhaven/. If a file is missing, or the link has
// ?polyhaven=off, nothing changes: the generated sky, road and ground stay. What is on disk comes from /api/polyhaven.
//   hdri/<name>_2k.hdr                            -> the sky of each track (and its reflections)
//   textures/<group>/textures/<name>_{diff,nor_gl,arm}_1k.jpg -> the road, and the ground of some tracks

export const ENABLED = new URLSearchParams(location.search).get('polyhaven') !== 'off';

// Which sky for which track theme (we have five pictures for seven themes)
const SKY_FOR = {
  park: 'kloofendal_48d_partly_cloudy_2k', pirate: 'kloofendal_48d_partly_cloudy_2k', desert: 'kloofendal_48d_partly_cloudy_2k',
  snow: 'snowy_field_2k', sky: 'cloud_layers_2k', city: 'solitude_night_2k', avenue: 'solitude_night_2k', stadium: 'rogland_moonlit_night_2k',
};
// How bright each sky is drawn (the pictures are real photographs: night ones need to be dimmer than our own light rig expects)
export const SKY_GAIN = { park: 1, pirate: 1, desert: 1, snow: 1, sky: 1, city: 0.45, avenue: 0.5, stadium: 0.5 };
// Road and ground materials: [group folder, material name]
export const ROAD = ['asphalt', 'asphalt_03'];
export const STADIUM_ROAD = ['concrete', 'concrete_pavement_03'];
const GROUND_FOR = { desert: ['grass', 'rocky_terrain'], snow: ['snow', 'snow_01'], city: ['concrete', 'pavement_02'], avenue: ['concrete', 'pavement_02'] };

let listing = null;
const loaded = new Map();

async function available() {
  if (!ENABLED) return {};
  listing ??= fetch('/api/polyhaven').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return listing;
}

// The sky picture for a track theme (a THREE.Texture), or null
export async function skyFor(THREE, theme) {
  const list = await available(), name = SKY_FOR[theme];
  if (!name || !list.hdri?.includes(name)) return null;
  if (!loaded.has(name)) {
    loaded.set(name, import('three/addons/loaders/RGBELoader.js')
      .then(({ RGBELoader }) => new RGBELoader().loadAsync(`/assets/polyhaven/hdri/${name}.hdr`))
      .then((tex) => { tex.mapping = THREE.EquirectangularReflectionMapping; return tex; })
      .catch((err) => { console.warn('Sky not loaded:', name, err.message); return null; }));
  }
  return loaded.get(name);
}

// A big sphere that shows the sky picture (so we can dim it: the scene background cannot be dimmed in this three.js version)
export function skyDome(THREE, tex, gain = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(950, 48, 24), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false, color: new THREE.Color(gain, gain, gain) }));
  m.scale.x = -1; // (seen from inside, the picture would be mirrored)
  m.renderOrder = -100;
  m.userData.skyPicture = true;
  return m;
}

// A material's maps: { map, normalMap, roughnessMap } (the "arm" picture holds roughness in its green channel), or null
export async function textures(THREE, [group, name], { repeat = 1 } = {}) {
  const list = await available(), entry = list.textures?.[group]?.find((t) => t.name === name);
  if (!entry?.diff) return null;
  const key = `${group}/${name}/${repeat}`;
  if (!loaded.has(key)) {
    const loader = new THREE.TextureLoader(), load = (u) => (u ? loader.loadAsync(u).catch(() => null) : Promise.resolve(null));
    loaded.set(key, Promise.all([load(entry.diff), load(entry.nor), load(entry.arm)]).then(([map, normalMap, roughnessMap]) => {
      if (!map) return null;
      map.colorSpace = THREE.SRGBColorSpace;
      for (const t of [map, normalMap, roughnessMap]) if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.repeat.set(repeat, repeat); }
      return { map, ...(normalMap ? { normalMap } : {}), ...(roughnessMap ? { roughnessMap } : {}) };
    }));
  }
  return loaded.get(key);
}

export const roadTextures = (THREE) => textures(THREE, ROAD, { repeat: 6 });
export const stadiumRoadTextures = (THREE) => textures(THREE, STADIUM_ROAD, { repeat: 3 });
// The ground texture of a track theme (desert, snow, city), or null. `repeat`: how many times it tiles over the ground.
export const groundTextures = (THREE, theme, repeat) => (GROUND_FOR[theme] ? textures(THREE, GROUND_FOR[theme], { repeat }) : Promise.resolve(null));
