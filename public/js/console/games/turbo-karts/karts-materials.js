// Turbo Karts road surface: asphalt made of little stones (a cellular pattern, so it reads as
// real aggregate instead of TV-static noise) with matching bump (normal) and shininess
// (roughness) maps, plus darker tyre-worn lanes painted in by the shader. Made once in code,
// no image files. Adapted from OpenWii's games/mario-kart/materials.js (MIT, see
// THIRD_PARTY_NOTICES.md).

let cached = null;
let override = null; // real asphalt maps (Poly Haven), see karts-polyhaven.js
export function setPavementOverride(maps) { override = maps; }

export function pavementMaps(THREE) {
  if (override) return override;
  if (cached) return cached;
  const size = 512, height = new Float32Array(size * size);
  let seed = 28971; // same stones every time
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const canvases = [0, 1, 2].map(() => { const c = document.createElement('canvas'); c.width = c.height = size; return c; });
  const [dc, nc, rc] = canvases.map((c) => c.getContext('2d'));
  const [di, ni, ri] = [dc, nc, rc].map((c) => c.createImageData(size, size));
  // Each pixel belongs to its nearest "stone"; the border between two stones is a groove
  const cells = 256, cell = size / cells;
  const stones = Array.from({ length: cells * cells }, () => ({ x: random(), y: random(), v: random() }));
  const pigment = new Float32Array(size * size), edgeShade = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      let nearest = Infinity, second = Infinity, stone = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const sx = cx + dx, sy = cy + dy, s = stones[((sy + cells) % cells) * cells + ((sx + cells) % cells)];
          const d = Math.hypot(x - (sx + 0.15 + s.x * 0.7) * cell, y - (sy + 0.15 + s.y * 0.7) * cell);
          if (d < nearest) { second = nearest; nearest = d; stone = s.v; } else if (d < second) second = d;
        }
      }
      const i = y * size + x, edge = Math.min(1, (second - nearest) / 0.65);
      pigment[i] = stone; edgeShade[i] = edge;
      height[i] = 0.12 + edge * 0.22 + stone * 0.12 + random() * 0.2;
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x, j = i * 4, v = height[i];
      const large = (Math.sin(x * 0.08) + Math.cos(y * 0.09) + Math.sin((x + y) * 0.022)) * 0.8;
      const grain = 91 + pigment[i] * 45 + edgeShade[i] * 10 + v * 19 + large;
      di.data.set([grain * 1.55, grain * 1.58, grain * 1.62, 255], j); // (brightened: our road color tints it)
      const dx = height[y * size + ((x + 1) % size)] - height[y * size + ((x + size - 1) % size)];
      const dy = height[((y + 1) % size) * size + x] - height[((y + size - 1) % size) * size + x];
      const len = Math.hypot(dx * 0.9, dy * 0.9, 1);
      ni.data.set([128 + (dx / len) * 100, 128 + (dy / len) * 100, 128 + 127 / len, 255], j);
      const r = 205 + edgeShade[i] * 22 - pigment[i] * 18;
      ri.data.set([r, r, r, 255], j);
    }
  }
  dc.putImageData(di, 0, 0); nc.putImageData(ni, 0, 0); rc.putImageData(ri, 0, 0);
  const [map, normalMap, roughnessMap] = canvases.map((c) => new THREE.CanvasTexture(c));
  map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, normalMap, roughnessMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.repeat.set(3, 3); }
  cached = { map, normalMap, roughnessMap };
  return cached;
}

// The road material. Its UVs: x = 0..1 across the road, y = along the road (in road widths).
export function roadMaterial(THREE, { night = false } = {}) {
  const maps = pavementMaps(THREE);
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, side: THREE.DoubleSide, ...maps,
    normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.68, metalness: 0.06,
    ...(night ? { emissive: '#14182c' } : {}),
  });
  // Darker worn lanes where tyres run, and soft resurfacing patches along the lap
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float lane = vMapUv.x / 3.0;
      float tyre = pow(abs(sin(lane * 19.0)), 26.0);
      float wear = 1.0 - smoothstep(0.32, 0.5, abs(lane - 0.5));
      float resurfaced = sin(vMapUv.y * 0.6) * sin(vMapUv.y * 0.13); // ('patch' is a reserved word in GLSL)
      diffuseColor.rgb *= 1.0 - wear * tyre * 0.12 - resurfaced * 0.03;`);
  };
  // (the maps repeat 3x across the road; the strip's own UVs handle the length)
  return mat;
}
