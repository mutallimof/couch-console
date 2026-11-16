// Turbo Karts art tokens: the one place for the "toys on the playroom floor" look (.claude/docs/KARTS-V2.md, section 1).
// Palette, the three material roles and the light presets. Data only (no three.js import), so tests can read it.

// The style-guide colors. Tracks, karts and items pick from these; shadows and outlines are Ink, never black.
export const PALETTE = {
  cushion: '#FF8A3D', sky: '#3FA9FF', pop: '#FF5C8A', mint: '#2FD6A4', butter: '#FFC93C',
  slate: '#4A5370',  // road
  cream: '#FFF6E8',  // road lines, the light half of curbs and barriers
  ink: '#25304A',    // outlines, blob shadows, slab edges
  wood: '#B98A5A',   // the one road that is not asphalt: Pirate Cove's boardwalk
};

// Each track's own pair out of the five: [curb, barrier]. The other half of every stripe is Cream.
export const TRACK_PAIRS = {
  park: ['pop', 'sky'], desert: ['cushion', 'butter'], snow: ['sky', 'mint'], city: ['mint', 'pop'],
  avenue: ['pop', 'cushion'], pirate: ['butter', 'cushion'], sky: ['butter', 'pop'], stadium: ['cushion', 'sky'],
};
// The painted parts of a track definition (kart-path.js spreads this into each track)
export function trackPaint(theme) {
  const [curb, wall] = TRACK_PAIRS[theme] || TRACK_PAIRS.park;
  return { road: theme === 'pirate' ? PALETTE.wood : PALETTE.slate, curb: [PALETTE[curb], PALETTE.cream], wall: [PALETTE[wall], PALETTE.cream] };
}

// Three material roles. Everything in a race is one of these.
//   plastic: karts, pilots, props, curbs and barriers · rubber: tyres, road, ground (also felt) · glow: boost, sparks, gems, lamps
export const ROLES = {
  plastic: { roughness: 0.45, metalness: 0 },
  rubber: { roughness: 0.9, metalness: 0 },
  glow: { toneMapped: false }, // drawn brighter than white, so only these bloom
};
// The glossy coat on hero plastic (karts, pilots): a MeshPhysicalMaterial on top of the plastic role
export const PLASTIC_COAT = { clearcoat: 0.55, clearcoatRoughness: 0.3, envMapIntensity: 0.9 };

// A material of a role. `THREE` is passed in (the game loads three.js itself).
export function roleMaterial(THREE, role, color, extra = {}) {
  if (role === 'glow') return new THREE.MeshBasicMaterial({ color, ...ROLES.glow, ...extra });
  return new THREE.MeshStandardMaterial({ color, ...ROLES[role], ...extra });
}
// Imported models (Kenney, Quaternius, KayKit) arrive with their own shininess: bring them to the plastic role
export function toyify(object) {
  object.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material || [])) {
      if (!m.isMeshStandardMaterial || m.userData.toy) continue;
      m.userData.toy = true; m.roughness = ROLES.plastic.roughness; m.metalness = 0;
    }
  });
  return object;
}

// Light presets: one warm key light (with shadows) and a cool sky fill. A track names one with `light`.
export const LIGHTS = {
  day: { key: 2.2, keyColor: '#fff4e0', hemi: 0.66, hemiSky: '#CFE6FF', hemiGround: '#5A6A4A', fill: 0.35, fillColor: '#77BAFF' },
  dusk: { key: 1.9, keyColor: '#FFC08A', hemi: 0.62, hemiSky: '#D9C6FF', hemiGround: '#6E5A62', fill: 0.45, fillColor: '#A88BFF' },
  night: { key: 0.6, keyColor: '#B9CCFF', hemi: 0.42, hemiSky: '#8FA6E8', hemiGround: '#2E3350', fill: 0.35, fillColor: '#77BAFF' },
};
export const lightOf = (def) => LIGHTS[def.night ? 'night' : def.light] || LIGHTS.day;
