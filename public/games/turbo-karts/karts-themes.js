// The look of each track's world: sky colors, terrain shape and colors. Data only (karts-sky.js, karts-terrain.js
// and karts-props.js read it). The horizon color is always the fog color, so the ground melts into the sky.
// Palettes are original; shapes are toy-like (flat-shaded low-poly hills, mesas, floating islands).

export const WORLD = {
  park: {
    sky: { zenith: '#3F8FE8', mid: '#7FBDF3', horizon: '#D8EEFF', cloud: '#FFFFFF', cloudShade: '#CFE2F7', cloudAmt: 0.52, sun: '#FFF4D0' },
    terrain: { apron: 2.5, blend: 26, profile: 'smooth', hillAmp: 34, hillFreq: 0.0042, hillStart: 70, hillEnd: 300, bump: 0.9,
      colors: ['#62C257', '#78CE5E', '#53B34F'], low: '#8FD468', slope: '#8C7A55', patches: '#A9DD6F' },
  },
  desert: {
    sky: { zenith: '#4C9DDF', mid: '#F2C58A', horizon: '#FCE3BA', cloud: '#FFF6E8', cloudShade: '#F3D7B0', cloudAmt: 0.3, sun: '#FFE9B0' },
    terrain: { apron: 2.5, blend: 9, profile: 'terrace', step: 3.4, hillAmp: 82, hillFreq: 0.0052, hillStart: 45, hillEnd: 190, bump: 0.5,
      colors: ['#EBC27F', '#E2B26D', '#F0CE91'], strata: ['#C65F33', '#D9784B', '#B84C2A', '#E5A06C', '#A83F23'], slope: '#B8502B', patches: '#D6A15E' },
  },
  snow: {
    sky: { zenith: '#5E9CE6', mid: '#AFD0F0', horizon: '#EAF4FC', cloud: '#FFFFFF', cloudShade: '#D3E3F4', cloudAmt: 0.46, sun: '#FFF8DC' },
    terrain: { apron: 2.5, blend: 44, profile: 'smooth', hillAmp: 110, hillFreq: 0.0048, hillStart: 100, hillEnd: 340, ridged: true, bump: 0.6,
      colors: ['#FFFFFF', '#F1F7FD', '#E2EDF8'], low: '#E8F1FA', slope: '#7C8DA6', rockLine: 0.62, patches: '#CFE0F2' },
  },
  city: {
    sky: { zenith: '#070B22', mid: '#241B58', horizon: '#4A2F7C', cloud: '#5B4A99', cloudShade: '#2E2566', cloudAmt: 0.22, sun: '#A9B8FF', night: true },
    terrain: { apron: 2.5, blend: 8, profile: 'smooth', hillAmp: 0, hillFreq: 0.01, hillStart: 100, hillEnd: 300, bump: 0.0, flatY: -0.45, skyline: true,
      colors: ['#1D2145', '#242850', '#191C3C'], low: '#161936', slope: '#2C2F58', patches: '#2B3066' },
  },
  avenue: {
    sky: { zenith: '#080D2A', mid: '#2A1B5E', horizon: '#53307F', cloud: '#5B4A99', cloudShade: '#2E2566', cloudAmt: 0.2, sun: '#A9B8FF', night: true },
    terrain: { apron: 2.5, blend: 8, profile: 'smooth', hillAmp: 0, hillFreq: 0.01, hillStart: 100, hillEnd: 300, bump: 0.0, flatY: -0.45, skyline: true,
      colors: ['#1A1D40', '#212550', '#171A38'], low: '#14172F', slope: '#2C2F58', patches: '#2B3066' },
  },
  stadium: {
    sky: { zenith: '#070B22', mid: '#1C2254', horizon: '#3A3170', cloud: '#5B4A99', cloudShade: '#2E2566', cloudAmt: 0.18, sun: '#A9B8FF', night: true },
    terrain: {},
  },
  pirate: {
    sky: { zenith: '#2E9AF0', mid: '#79CBF6', horizon: '#D6F1FF', cloud: '#FFFFFF', cloudShade: '#CBE6F8', cloudAmt: 0.42, sun: '#FFF4D0' },
    terrain: { apron: 2.5, blend: 18, profile: 'smooth', hillAmp: 7, hillFreq: 0.01, hillStart: 40, hillEnd: 120, bump: 0.5, island: true, shore: 34,
      colors: ['#F2E0AB', '#EAD59A', '#F6E7BC'], low: '#E3C98B', slope: '#B79B6B', grass: ['#6FC25A', '#5BB04F'], patches: '#F8EDC8' },
  },
  sky: {
    sky: { zenith: '#4C8DE6', mid: '#A9C8F4', horizon: '#FBD9EA', cloud: '#FFFFFF', cloudShade: '#EBD7F2', cloudAmt: 0.5, sun: '#FFF0D4' },
    terrain: { apron: 2.5, blend: 16, profile: 'smooth', hillAmp: 0, hillFreq: 0.01, hillStart: 60, hillEnd: 200, bump: 0.7, floating: true, edge: 30,
      colors: ['#9FE08A', '#8BD47E', '#B2E996'], low: '#8FD882', slope: '#B49CC8', patches: '#C4F0A0' },
  },
};

export const worldOf = (def) => WORLD[def.theme] || WORLD.park;
