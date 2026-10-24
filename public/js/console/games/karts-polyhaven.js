// Poly Haven (CC0) skies and textures, used when the files are in public/assets/polyhaven/
// (see docs/kart-art-options.md for what to download and where). Without them nothing changes:
// the generated sky and road stay. Asked from /api/polyhaven so we never request missing files.

let listing = null;
const loaded = new Map();

async function available() {
  listing ??= fetch('/api/polyhaven').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return listing;
}

// The sky picture for a track theme (or null). Resolves to a THREE.Texture usable as scene.background.
export async function skyFor(THREE, theme) {
  const list = await available();
  if (!list.hdri?.includes(theme)) return null;
  const key = `sky:${theme}`;
  if (!loaded.has(key)) {
    loaded.set(key, import('three/addons/loaders/RGBELoader.js')
      .then(({ RGBELoader }) => new RGBELoader().loadAsync(`/assets/polyhaven/hdri/${theme}.hdr`))
      .then((tex) => { tex.mapping = THREE.EquirectangularReflectionMapping; return tex; })
      .catch((err) => { console.warn('Sky not loaded:', theme, err.message); return null; }));
  }
  return loaded.get(key);
}

// Road surface maps from textures/asphalt/ (or null): { map, normalMap, roughnessMap }
export async function asphalt(THREE) {
  const list = await available();
  if (!list.textures?.includes('asphalt')) return null;
  if (!loaded.has('asphalt')) {
    const loader = new THREE.TextureLoader(), at = (f) => loader.loadAsync(`/assets/polyhaven/textures/asphalt/${f}.jpg`);
    loaded.set('asphalt', Promise.all([at('diff'), at('nor').catch(() => null), at('rough').catch(() => null)]).then(([map, normalMap, roughnessMap]) => {
      map.colorSpace = THREE.SRGBColorSpace;
      for (const t of [map, normalMap, roughnessMap]) if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.repeat.set(3, 3); }
      return { map, ...(normalMap ? { normalMap } : {}), ...(roughnessMap ? { roughnessMap } : {}) };
    }).catch((err) => { console.warn('Asphalt not loaded:', err.message); return null; }));
  }
  return loaded.get('asphalt');
}
