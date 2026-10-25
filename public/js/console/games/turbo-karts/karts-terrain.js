// Turbo Karts terrain: a low-poly heightfield under and around the whole track, so the road always has real ground
// (or a cliff, a mountain, a floating island) beneath it instead of a flat plain. Visual only: the race rules ride the
// road model. The ground follows the road's own height right at the road, then blends into the theme's shape
// (rolling hills, terraced mesas, ridged mountains, a sandy island, floating islands). Colors are per vertex.
import { makeNoise, smooth, lerp } from './karts-noise.js';
import { worldOf } from './karts-themes.js';

export function buildTerrain(THREE, def, path, { fogFar = 600 } = {}) {
  const W = worldOf(def).terrain, wallHalf = path.wallHalf, apron = wallHalf + W.apron;
  const N = makeNoise((def.id.length * 131 + def.id.charCodeAt(0) * 17) | 0);
  const { pts } = path;
  const color = (hex) => new THREE.Color(hex);
  const C = { base: W.colors.map(color), low: color(W.low || W.colors[0]), slope: color(W.slope), patches: color(W.patches), strata: (W.strata || []).map(color), grass: (W.grass || []).map(color) };

  // ---- Where is the road? A grid of sample lists, so "nearest road point" is quick for 100k vertices ----
  const CELL = 12;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const gx0 = Math.floor(minX / CELL) - 1, gz0 = Math.floor(minZ / CELL) - 1, gw = Math.ceil((maxX - minX) / CELL) + 3, gh = Math.ceil((maxZ - minZ) / CELL) + 3;
  const grid = Array.from({ length: gw * gh }, () => []);
  pts.forEach((p, i) => grid[(Math.floor(p.z / CELL) - gz0) * gw + (Math.floor(p.x / CELL) - gx0)].push(i));
  const coarse = pts.filter((_, i) => i % 12 === 0);
  const REACH = 5; // cells searched around a point (60 m)

  function nearRoad(x, z) {
    const cx = Math.floor(x / CELL) - gx0, cz = Math.floor(z / CELL) - gz0;
    let best = Infinity, yNear = 0, yLow = Infinity;
    for (let dz = -REACH; dz <= REACH; dz++) {
      const rz = cz + dz; if (rz < 0 || rz >= gh) continue;
      for (let dx = -REACH; dx <= REACH; dx++) {
        const rx = cx + dx; if (rx < 0 || rx >= gw) continue;
        for (const i of grid[rz * gw + rx]) {
          const p = pts[i], d2 = (p.x - x) ** 2 + (p.z - z) ** 2;
          if (d2 < best) { best = d2; yNear = p.y; }
          if (d2 < apron * apron && p.y < yLow) yLow = p.y; // (a bridge crossing: the ground goes under the lower road)
        }
      }
    }
    if (best === Infinity) { // far away: the coarse list is accurate enough
      for (const p of coarse) { const d2 = (p.x - x) ** 2 + (p.z - z) ** 2; if (d2 < best) { best = d2; yNear = p.y; } }
      return { d: Math.sqrt(best) - 6, y: yNear, yLow: Infinity };
    }
    return { d: Math.sqrt(best), y: yNear, yLow };
  }

  // ---- The shape ----
  const quant = (v, step) => { const k = v / step, f = Math.floor(k); return (f + smooth(0.78, 1, k - f)) * step; };
  function natural(x, z, d) {
    const ramp = smooth(W.hillStart, W.hillEnd, d);
    if (W.flatY !== undefined) return W.flatY;
    if (W.ridged) return Math.pow(N.ridged(x * W.hillFreq, z * W.hillFreq, 5), 1.7) * W.hillAmp * ramp + N.fbm(x * 0.02, z * 0.02, 3) * 4;
    if (W.profile === 'terrace') return quant(Math.max(0, N.fbm(x * W.hillFreq, z * W.hillFreq, 4) - 0.3) * 1.55 * W.hillAmp * ramp, W.step);
    if (W.island) return 0.9 + (N.fbm(x * 0.03, z * 0.03, 3) - 0.5) * 3 + N.fbm(x * W.hillFreq, z * W.hillFreq, 3) * W.hillAmp * 0.3;
    if (W.floating) return (N.fbm(x * 0.03, z * 0.03, 3) - 0.5) * 3;
    return Math.max(0, N.fbm(x * W.hillFreq, z * W.hillFreq, 4) - 0.32) * 1.45 * W.hillAmp * ramp; // rolling hills, flat near the road
  }

  function sample(x, z) {
    const r = nearRoad(x, z);
    const under = (Number.isFinite(r.yLow) ? r.yLow : r.y) - 0.55;
    if (r.d <= apron) return { h: under, d: r.d, y: r.y };
    const edge = r.d - apron, nat = natural(x, z, r.d);
    const t = Math.min(1, edge / W.blend);
    let s = smooth(0, 1, t);
    if (W.profile === 'terrace') { const k = Math.max(1, Math.min(10, Math.round(Math.abs(r.y - 0.55 - nat) / W.step))); const u = t * k, f = Math.floor(u); s = Math.min(1, (f + smooth(0.8, 1, u - f)) / k); }
    let h = lerp(r.y - 0.55, nat, s);
    h += (N.fbm(x * 0.07, z * 0.07, 2) - 0.5) * 2 * W.bump * smooth(6, 40, edge);
    if (W.floating) h = lerp(h, -80, smooth(0, 14, r.d - (apron + W.edge + 16 * N.fbm(x * 0.02, z * 0.02, 2))));       // floating islands: the lawn ends in a cliff
    if (W.island) h = lerp(h, -3.4, smooth(0, 26, r.d - (apron + W.shore + 14 * N.fbm(x * 0.015, z * 0.015, 2))));     // the beach slopes into the sea
    return { h, d: r.d, y: r.y };
  }
  const heightAt = (x, z) => sample(x, z).h;

  // ---- The mesh ----
  const margin = Math.max(fogFar + 60, 560);
  const bx0 = minX - margin, bx1 = maxX + margin, bz0 = minZ - margin, bz1 = maxZ + margin;
  const cell = Math.max(4.5, Math.max(bx1 - bx0, bz1 - bz0) / 300);
  const nx = Math.ceil((bx1 - bx0) / cell) + 1, nz = Math.ceil((bz1 - bz0) / cell) + 1;
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), heights = new Float32Array(nx * nz), ds = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = bx0 + i * cell, z = bz0 + j * cell, s = sample(x, z), k = j * nx + i;
      pos[k * 3] = x; pos[k * 3 + 1] = s.h; pos[k * 3 + 2] = z; heights[k] = s.h; ds[k] = s.d;
    }
  }
  const tmp = new THREE.Color();
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i, x = pos[k * 3], z = pos[k * 3 + 2], h = heights[k], d = ds[k];
      const hx = (heights[j * nx + Math.min(nx - 1, i + 1)] - heights[j * nx + Math.max(0, i - 1)]) / (2 * cell);
      const hz = (heights[Math.min(nz - 1, j + 1) * nx + i] - heights[Math.max(0, j - 1) * nx + i]) / (2 * cell);
      const steep = Math.hypot(hx, hz);
      tmp.copy(terrainColor(x, z, h, steep, d));
      col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
    }
  }
  function terrainColor(x, z, h, steep, d) {
    const v = N.fbm(x * 0.018, z * 0.018, 2), band = v < 0.42 ? 0 : v < 0.6 ? 1 : 2; // three tones in soft patches, like mowed fields
    const c = C.base[band % C.base.length].clone();
    if (W.low && h < 1.2 && d > apron) c.lerp(C.low, 0.45);
    if (N.noise2(x * 0.045 + 9, z * 0.045) > 0.76) c.lerp(C.patches, 0.6);
    if (C.grass.length && h > 0.35 && N.fbm(x * 0.025, z * 0.025, 2) > 0.5) c.copy(C.grass[band % C.grass.length]);   // pirate: grass in the middle of the island
    if (h < -0.4 && W.island) c.lerp(C.low, 0.8);
    if (C.strata.length && (steep > 0.35 || h > 1.5)) { // canyon walls: layers of rock
      const layer = C.strata[Math.abs(Math.floor(h / W.step + N.noise2(x * 0.04, z * 0.04) * 0.6)) % C.strata.length];
      c.lerp(layer, smooth(0.15, 0.6, steep) * 0.95 + (h > 1.5 ? 0.15 : 0));
    }
    if (W.floating && h < -2) c.copy(C.slope).lerp(color('#7A5C98'), smooth(-2, -50, h));
    else if (W.ridged) { if (steep > 0.85 && h > 14) c.lerp(C.slope, smooth(0.85, 1.6, steep) * 0.9); }
    else c.lerp(C.slope, smooth(0.9, 1.6, steep) * 0.85);
    return c;
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let q = 0;
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c2 = a + nx, e = c2 + 1;
    if ((i + j) % 2) idx.set([a, c2, b, b, c2, e], q); else idx.set([a, c2, e, a, e, b], q); // (alternating diagonals: no streaky facets)
    q += 6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 }));
  mesh.receiveShadow = true;
  return { mesh, heightAt, sample, nearRoad, bounds: { minX, maxX, minZ, maxZ }, apron, params: W, noise: N, groundColor: (x, z) => terrainColor(x, z, 0, 0, 99) };
}
