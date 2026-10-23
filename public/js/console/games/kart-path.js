// Turbo Karts track data and geometry, with no graphics: the six track definitions, the
// center line (sampled points, directions, sideways normals) and "where on the track am I?".
// Used by kart-track.js (which builds the 3D track around it) and by karts-rules.js, and
// tested in Node (tests/karts.test.mjs).

export const ROAD_HALF = 8;          // half the road width (meters)
export const WALL = ROAD_HALF + 4.5; // barriers this far from the center line
export const SAMPLES = 1000;
// Shortcut glide ramps sit on one side of the road (this far from the center, this wide each way)
export const SHORTCUT_SIDE = 4.6, SHORTCUT_HALF = 3.2;
// ...and their flight keeps the glider at least this high (meters) over the middle of the gap
export const SHORTCUT_ARC = 6;

// Each track: a closed loop of [x, height, z] points (the start line is at the first point),
// a theme, where the extras go (0..1 along the lap), and how grippy the road is.
// glides: a number = a glide ramp across the whole road at that point of the lap;
// { at, to } = a shortcut ramp on one side of the road: glide from it straight across a gap
// and land at `to` (the road itself goes the long way round).
export const TRACKS = [
  {
    id: 'park', name: 'Sunny Park', theme: 'park', blurb: 'Gentle hills and a big jump. Great for starters.',
    sky: ['#5AA9F0', '#CFE9FF'], fog: [160, 520], ground: '#7CC36B', road: '#5A606B', curb: ['#E03131', '#FFFFFF'], wall: ['#2F80ED', '#F4F7FB'],
    grip: 1, scale: 1.35,
    points: [[0, 0, 0], [60, 0, 0], [105, 3, 10], [138, 8, 45], [135, 9, 90], [105, 4, 112], [65, 0, 106], [40, 0, 80], [10, 5, 70],
      [-12, 0, 92], [-50, 0, 110], [-95, 4, 95], [-115, 6, 55], [-100, 2, 15], [-60, 0, 0]],
    pads: [0.18, 0.62], boxes: [0.1, 0.42, 0.75], coins: [0.27, 0.53, 0.88], glides: [0.515], tunnel: null,
  },
  {
    id: 'desert', name: 'Dune Canyon', theme: 'desert', blurb: 'Long sweeping turns between red rocks. Hit the crests for air!',
    sky: ['#F2A65A', '#FBE3B5'], fog: [150, 480], ground: '#E3B778', road: '#8A6A4D', curb: ['#C2410C', '#FFF4E6'], wall: ['#C97B4A', '#FFE8CC'],
    grip: 0.95, scale: 1.5,
    points: [[0, 0, 0], [70, 0, -5], [120, 6, 20], [130, 12, 70], [95, 5, 100], [60, 12, 90], [30, 2, 120], [-20, 0, 125], [-75, 8, 100],
      [-110, 0, 60], [-95, 10, 20], [-55, 2, -10]],
    pads: [0.08, 0.5], boxes: [0.2, 0.55, 0.82], coins: [0.33, 0.66, 0.92], glides: [0.835], tunnel: [0.36, 0.44],
  },
  {
    id: 'snow', name: 'Frosty Peaks', theme: 'snow', blurb: 'Climb the mountain, fly down the other side. The road is icy!',
    sky: ['#8DB8E8', '#EEF5FC'], fog: [120, 420], ground: '#F1F3F5', road: '#6C7A89', curb: ['#1C7ED6', '#FFFFFF'], wall: ['#E7F5FF', '#74C0FC'],
    grip: 0.78, scale: 1.4,
    points: [[0, 0, 0], [55, 2, -8], [100, 9, 10], [118, 16, 50], [95, 22, 85], [50, 24, 95], [10, 18, 80], [-25, 10, 100],
      [-70, 4, 95], [-100, 0, 55], [-90, 0, 15], [-45, 0, -5]],
    pads: [0.12, 0.7], boxes: [0.06, 0.4, 0.78], coins: [0.25, 0.5, 0.9], glides: [0.497], tunnel: [0.58, 0.68],
  },
  {
    id: 'city', name: 'Neon City', theme: 'city', blurb: 'A night race through glowing towers, over a bridge and under it.',
    sky: ['#0B1026', '#3B2A6B'], fog: [120, 420], ground: '#1B1F3A', road: '#2A2F45', curb: ['#E64980', '#22B8CF'], wall: ['#7048E8', '#22B8CF'],
    grip: 1, scale: 1.45, night: true,
    // a figure-8: the second crossing goes over a bridge
    points: [[0, 0, 0], [45, 0, 35], [90, 0, 60], [120, 0, 30], [100, 0, -15], [50, 4, -25], [0, 12, 0], [-45, 4, 30],
      [-95, 0, 55], [-120, 0, 20], [-95, 0, -20], [-50, 0, -30]],
    pads: [0.15, 0.55], boxes: [0.08, 0.36, 0.72], coins: [0.24, 0.46, 0.86], glides: [0.512], tunnel: null,
  },
  {
    id: 'pirate', name: 'Pirate Cove', theme: 'pirate', blurb: 'A wooden boardwalk around a palm island. Watch out for the sea monster!',
    sky: ['#3FA9F5', '#C6ECFF'], fog: [180, 600], ground: '#EBD9A8', road: '#9C7650', curb: ['#6B3F22', '#F1E3C2'], wall: ['#7C4A2D', '#D9B88F'],
    water: '#1C8FC9', grip: 0.95, scale: 1.4,
    points: [[0, 0, 0], [60, 0, -5], [110, 2, 15], [130, 6, 55], [110, 3, 95], [70, 0, 108], [38, 7, 82], [0, 0, 95],
      [-45, 0, 122], [-95, 4, 102], [-122, 0, 58], [-102, 0, 12], [-55, 0, -8]],
    pads: [0.2, 0.6], boxes: [0.1, 0.4, 0.74], coins: [0.28, 0.52, 0.9], glides: [0.44], tunnel: [0.8, 0.87],
  },
  {
    id: 'sky', name: 'Cloud Gardens', theme: 'sky', blurb: 'Gardens above the clouds. Take a side ramp and glide across the gaps!',
    sky: ['#5C9CEB', '#FBD9EA'], fog: [190, 620], ground: '#B7C3F2', road: '#5B6094', curb: ['#F06595', '#FFFFFF'], wall: ['#9775FA', '#F8F0FC'],
    grip: 1, scale: 1.4,
    // two big loops the road goes round, and a hill with a glide down the far side
    points: [[0, 0, 0], [50, 0, 0], [85, 2, 25], [95, 5, 60], [130, 5, 70], [150, 2, 40], [150, 0, 5], [175, 4, -30], [150, 14, -80],
      [100, 16, -95], [50, 4, -90], [20, 0, -120], [12, 0, -195], [-25, 2, -228], [-62, 2, -195], [-55, 0, -110], [-45, 0, -50], [-25, 0, -10]],
    pads: [0.35, 0.9], boxes: [0.05, 0.38, 0.86], coins: [0.16, 0.52, 0.7], tunnel: null,
    glides: [0.43, { at: 0.09, to: 0.28 }, { at: 0.61, to: 0.81 }],
  },
];

// THREE is passed in (it's only used for its vector and curve math)
export function trackPath(THREE, def) {
  const P = def.points.map(([x, y, z]) => new THREE.Vector3(x * def.scale, y, z * def.scale));
  const curve = new THREE.CatmullRomCurve3(P, true, 'centripetal');
  const length = curve.getLength();

  // Sample the center line once: position, direction and the sideways normal at each point
  const pts = [], tan = [], nor = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t = i / SAMPLES;
    pts.push(curve.getPointAt(t));
    const d = curve.getTangentAt(t);
    tan.push(d);
    nor.push(new THREE.Vector3(-d.z, 0, d.x).normalize()); // to the driver's right
  }
  const at = (i) => ((Math.round(i) % SAMPLES) + SAMPLES) % SAMPLES;
  // Boost pads: two side by side at each spot. Glide ramps: across the whole road.
  const pads = def.pads.flatMap((t) => [-3.5, 3.5].map((side) => ({ i: at(t * SAMPLES), side })));
  const glides = (def.glides || []).map((g) => {
    if (typeof g === 'number') return { i: at(g * SAMPLES) };
    // a shortcut: the ramp goes on the side of the road that faces where you'll land
    const i = at(g.at * SAMPLES), to = at(g.to * SAMPLES);
    const toward = (pts[to].x - pts[i].x) * nor[i].x + (pts[to].z - pts[i].z) * nor[i].z;
    const side = Math.sign(toward) * SHORTCUT_SIDE;
    return { i, to, side, from: pts[i].clone().addScaledVector(nor[i], side), land: pts[to] };
  });
  const span = (g) => (g.to - g.i + SAMPLES) % SAMPLES;

  // Nearest center-line sample to (x, z), searching near the last known one.
  // Uses the height too, so the two levels of a bridge never get mixed up.
  function locate(x, z, hint, y = null) {
    let best = hint ?? 0, bestD = Infinity;
    const range = hint == null ? SAMPLES : 50;
    for (let k = -range; k <= range; k++) {
      const i = at((hint ?? 0) + k), p = pts[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2 + (y == null ? 0 : ((p.y - y) * 3) ** 2);
      if (d < bestD) { bestD = d; best = i; }
    }
    const p = pts[best], n = nor[best], t = tan[best];
    const lateral = (x - p.x) * n.x + (z - p.z) * n.z;
    // road height right here: between this sample and its neighbor
    const along = (x - p.x) * t.x + (z - p.z) * t.z;
    const j = at(best + Math.sign(along || 1)), f = Math.min(1, Math.abs(along) / (length / SAMPLES));
    const height = p.y + (pts[j].y - p.y) * f;
    return { i: best, lateral, height };
  }

  // During a shortcut flight: how far across the gap you are (0..1), the lap position that
  // matches it (so laps and race places keep working), and the lowest the glider may sink.
  function flightAt(g, x, z) {
    const A = g.from, B = g.land, dx = B.x - A.x, dz = B.z - A.z;
    const f = Math.min(1, Math.max(0, ((x - A.x) * dx + (z - A.z) * dz) / (dx * dx + dz * dz)));
    return { f, i: at(g.i + f * span(g)), lateral: 0, height: A.y + (B.y - A.y) * f + SHORTCUT_ARC * Math.sin(Math.PI * f) };
  }

  return { pts, tan, nor, SAMPLES, length, at, locate, flightAt, pads, glides, def };
}
