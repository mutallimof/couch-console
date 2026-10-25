// Track geometry for the ported kart rules: a closed spline through control points, with
// surfaceAt / trackAt / project (where am I on the road?), boost pads, item-box rows, coin spots
// and glide sections. No graphics, so it can be tested in Node.
// Adapted from OpenWii's games/mario-kart/track.js (MIT, Copyright (c) 2026 Patrick Sun; see
// THIRD_PARTY_NOTICES.md). Changes: a factory (any of our track definitions, not one hard-coded
// course); the course-specific pieces (imported-course surface mesh, anti-gravity) are removed.

export const wrap = (s, L) => ((s % L) + L) % L;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const angle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Uniform Catmull-Rom between b and c (a and d are the neighbours)
function cat(a, b, c, d, t) {
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
}

// Our tracks were drawn for slower karts: stretched by this much, laps take about as long as in OpenWii's course (1400 m)
export const STRETCH = 1.3;
export const GLIDE_LENGTH = 34; // metres of road a glide ramp's flight covers

/**
 * def: one of our track definitions (kart-path.js TRACKS): points [[x, height, z], ...] scaled by
 * def.scale, pads / boxes / coins / glides as fractions (0..1) of the lap.
 */
export function createTrackModel(def, { roadHalf = 10, wallHalf = 14.5, SUB = 32, stretch = def.stadium ? 1 : STRETCH } = {}) {
  const scale = (def.scale ?? 1) * stretch;
  const CONTROL = def.points.map(([x, y, z]) => ({ x: x * scale, z: z * scale, y }));
  const N = CONTROL.length;
  const raw = [];
  const controlDistances = [];
  let length = 0;
  for (let i = 0; i < N; i++) {
    controlDistances.push(length);
    for (let j = 0; j < SUB; j++) {
      const p = {};
      for (const k of ['x', 'y', 'z']) {
        p[k] = cat(CONTROL[(i + N - 1) % N][k], CONTROL[i][k], CONTROL[(i + 1) % N][k], CONTROL[(i + 2) % N][k], j / SUB);
      }
      p.y = Math.max(0, p.y); // no below-ground road (the spline can undershoot after a hill)
      if (raw.length) length += Math.hypot(p.x - raw.at(-1).x, p.z - raw.at(-1).z);
      p.s = length;
      p.control = i + j / SUB;
      raw.push(p);
    }
  }
  length += Math.hypot(raw[0].x - raw.at(-1).x, raw[0].z - raw.at(-1).z);
  for (let i = 0; i < N; i++) controlDistances[i] = raw[i * SUB].s;

  function indexAt(s) {
    let lo = 0, hi = raw.length - 1;
    while (lo < hi) {
      const m = Math.ceil((lo + hi) / 2);
      if (raw[m].s <= s) lo = m; else hi = m - 1;
    }
    return lo;
  }

  // def.stadium (the Grand Stadium course): OpenWii's exact layout, given in control-point numbers
  const ST = def.stadium;
  const sAtControl = (c) => raw[Math.floor(c * SUB)].s;
  // Glide ramps: a kart crossing `start` (going forward) takes off; the flight covers the road up to `end`
  const glides = ST
    ? [{ start: controlDistances[ST.glide[0]], end: controlDistances[ST.glide[1]] }]
    : (def.glides || []).map((g) => {
      const f = typeof g === 'number' ? g : g.at;
      return { start: f * length, end: f * length + GLIDE_LENGTH };
    });
  // A banked, twisting stretch of road (visual: the road tilts, karts follow its height)
  const anti = ST ? { start: controlDistances[ST.anti[0]], end: controlDistances[ST.anti[1]] } : null;

  function trackAt(distance) {
    const s = wrap(distance, length), i = indexAt(s), a = raw[i], b = raw[(i + 1) % raw.length];
    const span = (i === raw.length - 1 ? length : b.s) - a.s, t = (s - a.s) / span;
    // A continuous tangent stops the road ribbon (and the kart/camera normal) jumping at each sample
    const prev = raw[(i + raw.length - 1) % raw.length], next = raw[(i + 2) % raw.length];
    const ax = b.x - prev.x, az = b.z - prev.z, bx = next.x - a.x, bz = next.z - a.z;
    const al = Math.hypot(ax, az), bl = Math.hypot(bx, bz);
    const vx = (ax / al) * (1 - t) + (bx / bl) * t, vz = (az / al) * (1 - t) + (bz / bl) * t, vl = Math.hypot(vx, vz);
    const tx = vx / vl, tz = vz / vl;
    const inAnti = !!anti && s >= anti.start && s < anti.end;
    const bank = inAnti ? Math.sin(Math.PI * clamp((s - anti.start) / (anti.end - anti.start), 0, 1)) * 0.98 : 0;
    return {
      x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t,
      tx, tz, rx: -tz, rz: tx, heading: Math.atan2(tx, -tz), bank, anti: inAnti,
      glide: glides.some((g) => s >= g.start && s < g.end), s,
      control: a.control + t * ((i === raw.length - 1 ? N : b.control) - a.control),
    };
  }

  function surfaceAt(s, lateral = 0) {
    const p = trackAt(s);
    return { ...p, x: p.x + p.rx * lateral, z: p.z + p.rz * lateral, y: p.y + Math.tan(p.bank) * lateral };
  }

  /** Local projection (near the last known position) avoids jumping between crossing roads. */
  function project(x, z, previousS = null) {
    let best = null;
    const center = previousS === null ? 0 : indexAt(wrap(previousS, length));
    const count = previousS === null ? raw.length : 85;
    for (let j = 0; j < count; j++) {
      const i = previousS === null ? j : wrap(center + j - 42, raw.length), a = raw[i], b = raw[(i + 1) % raw.length];
      const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / l2, 0, 1), px = a.x + t * dx, pz = a.z + t * dz;
      const d2 = (x - px) ** 2 + (z - pz) ** 2;
      if (!best || d2 < best.d2) {
        const len = Math.sqrt(l2);
        best = { s: wrap(a.s + t * len, length), lateral: ((x - px) * -dz + (z - pz) * dx) / len, d2 };
      }
    }
    return best;
  }

  const at = (f) => raw[Math.floor((((f % 1) + 1) % 1) * N * SUB)].s; // lap fraction -> distance along the road
  const boostPads = ST
    ? ST.pads.map(([c, lateral]) => ({ s: sAtControl(c), lateral, width: 4, length: 7 }))
    : (def.pads || []).flatMap((f) => [-4.5, 4.5].map((lateral) => ({ s: at(f), lateral, width: 4, length: 7 })));
  const itemRows = ST
    ? ST.boxes.flatMap((c) => [-6, 0, 6].map((lateral) => ({ s: sAtControl(c), lateral })))
    : (def.boxes || []).flatMap((f) => [-6, 0, 6].map((lateral) => ({ s: at(f), lateral })));
  const coinSpots = ST
    ? ST.coins.flatMap((c, i) => [-3, 0, 3].map((d) => ({ s: sAtControl(c) + d, lateral: i % 2 ? 6 : -3 })))
    : (def.coins || []).flatMap((f, i) => [-3, 0, 3].map((d) => ({ s: at(f) + d, lateral: i % 2 ? 6 : -3 })));

  return {
    def, length, roadHalf, wallHalf, samples: raw, controlDistances, glides,
    trackAt, surfaceAt, project, boostPads, itemRows, coinSpots,
  };
}
