// The "Grand Stadium" course: an original loop drawn for this project (a tall pear with a hairpin at
// the top and a hook after the start). The scenery around it comes from OpenWii's stadium world
// (MIT, Copyright (c) 2026 Patrick Sun; see THIRD_PARTY_NOTICES.md) and is placed by distance along
// the road, which is why the lengths between the numbered control points are kept.
// Points are [x, height, z].
const RAW = [
  [0, 0, 0],
  [68, 0, 45],
  [113, 0, 77],
  [149, 0, 102],
  [206, 0, 126],
  [255, 0, 113],
  [269, 0, 86],
  [251, 0, 54],
  [238, 6, -9],
  [235, 12, -90],
  [228, 17, -169],
  [220, 21, -202],
  [160, 23, -304],
  [119, 27, -422],
  [101, 32, -455],
  [51, 38, -482],
  [5, 47, -478],
  [-22, 49, -488],
  [-42, 47, -515],
  [-72, 42, -514],
  [-100, 34, -472],
  [-94, 27, -400],
  [-70, 0, -331],
  [-51, 0, -240],
  [-48, 0, -174],
  [-51, 0, -139],
  [-44, 0, -72],
];
export const STADIUM = {
  id: 'stadium', name: 'Grand Stadium', theme: 'stadium',
  blurb: 'A bright afternoon race through pit lanes and under a bridge, with a big glide over the gap.',
  sky: ['#4A86E0', '#F6E3CC'], fog: [320, 1100], ground: '#6F8F5A', road: '#6B6D70', curb: ['#C23B3B', '#F2F2F2'], wall: ['#2A5AA8', '#E7EEF8'],
  // A bright afternoon (the world is OpenWii's night scene; its floodlights and searchlights are left off): warm sun, sky light
  lighting: { key: 2.4, keyColor: '#fff1d6', keyOffset: [-30, 60, 25], hemi: 1.0, hemiSky: '#cfe6ff', hemiGround: '#8a9078', fill: 0.5, env: 0.7, fog: ['#dfe9f4', 0.00055], exposure: 1.05 },
  grip: 1, scale: 0.85,
  points: RAW, // [x, height, z]
  // everything below is positioned in control-point numbers, as in OpenWii
  stadium: {
    pads: [[5.05, -7], [5.8, -7], [6.55, -7], [24.2, 7], [25, 7], [25.8, 7]],
    boxes: [3.5, 11.7, 20.4],
    coins: [1.3, 4.8, 6, 8.3, 10.9, 13.4, 15.8, 18.4, 20.6, 23.4, 25.5],
    glide: [21, 22], anti: [9, 21],
  },
};
