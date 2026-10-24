// The "Grand Stadium" course: OpenWii's procedural stadium layout (its CONTROL_POINTS; MIT,
// Copyright (c) 2026 Patrick Sun; see THIRD_PARTY_NOTICES.md), as one more track definition for
// our track model. Points are [x, height, z] after OpenWii's own offset.
const RAW = [
  [365, 445, 0], [445, 432, 0], [499, 422, 0], [538, 444, 0], [558, 502, 0], [578, 548, 0], [555, 569, 0], [526, 546, 0],
  [510, 483, 6], [491, 404, 12], [472, 328, 17], [451, 301, 21], [338, 263, 23], [220, 222, 27], [194, 194, 32],
  [195, 138, 38], [194, 92, 47], [178, 67, 49], [145, 70, 47], [124, 91, 42], [127, 142, 34], [133, 215, 27],
  [151, 286, 0], [175, 376, 0], [190, 440, 0], [215, 465, 0], [282, 460, 0],
];
export const STADIUM = {
  id: 'stadium', name: 'Grand Stadium', theme: 'stadium', night: true,
  blurb: 'A floodlit night race through pit lanes and under a bridge, with a big glide over the gap.',
  sky: ['#02050C', '#0B1330'], fog: [260, 900], ground: '#6F8F5A', road: '#6B6D70', curb: ['#C23B3B', '#F2F2F2'], wall: ['#2A5AA8', '#E7EEF8'],
  grip: 1, scale: 0.85,
  points: RAW.map(([x, z, y]) => [x - 360, y, z - 330]),
  // everything below is positioned in control-point numbers, as in OpenWii
  stadium: {
    pads: [[5.05, -7], [5.8, -7], [6.55, -7], [24.2, 7], [25, 7], [25.8, 7]],
    boxes: [3.5, 11.7, 20.4],
    coins: [1.3, 4.8, 6, 8.3, 10.9, 13.4, 15.8, 18.4, 20.6, 23.4, 25.5],
    glide: [21, 22], anti: [9, 21],
  },
};
