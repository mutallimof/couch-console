// Small seeded value noise for the race scenery (terrain, clouds, scatter). No graphics, no dependencies.
// noise2(x, z) is smooth and lies in 0..1; fbm adds octaves; ridged makes sharp mountain crests.
function hash(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fade = (t) => t * t * (3 - 2 * t);

export function makeNoise(seed = 1) {
  const noise2 = (x, z) => {
    const ix = Math.floor(x), iz = Math.floor(z), fx = fade(x - ix), fz = fade(z - iz);
    const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };
  const fbm = (x, z, octaves = 4, lacunarity = 2, gain = 0.5) => {
    let sum = 0, amp = 0.5, norm = 0;
    for (let i = 0; i < octaves; i++) { sum += noise2(x, z) * amp; norm += amp; x *= lacunarity; z *= lacunarity; amp *= gain; }
    return sum / norm;
  };
  const ridged = (x, z, octaves = 4) => {
    let sum = 0, amp = 0.5, norm = 0;
    for (let i = 0; i < octaves; i++) { sum += (1 - Math.abs(noise2(x, z) * 2 - 1)) * amp; norm += amp; x *= 2.07; z *= 2.07; amp *= 0.5; }
    return sum / norm;
  };
  return { noise2, fbm, ridged, rand: (i) => hash(i, 7, seed + 99) };
}

// A tiny seeded random generator (for scatter that must look the same every time a track loads)
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;
