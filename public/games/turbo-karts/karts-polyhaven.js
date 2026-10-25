// The Grand Stadium's concrete road: Poly Haven's concrete_pavement_03 (CC0, https://polyhaven.com), three 1k pictures in
// public/assets/polyhaven/textures/concrete/textures/. Every other track's road, sky and ground are generated in code.
// If the files are missing, or the link has ?polyhaven=off, nothing changes: the generated road stays.
// /api/polyhaven says which files are on disk (so we never ask for one that is not there).

export const ENABLED = new URLSearchParams(location.search).get('polyhaven') !== 'off';
export const STADIUM_ROAD = ['concrete', 'concrete_pavement_03'];

let listing = null;
const loaded = new Map();

async function available() {
  if (!ENABLED) return {};
  listing ??= fetch('/api/polyhaven').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return listing;
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

export const stadiumRoadTextures = (THREE) => textures(THREE, STADIUM_ROAD, { repeat: 3 });
