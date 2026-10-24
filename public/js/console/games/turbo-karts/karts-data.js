// Turbo Karts data: the karts and the item icons (the racers are in ow-kart/characters.js).
// Stats go from 1 (low) to 5 (high).

// Toy Car Kit vehicles. open = the driver sits in a cockpit; closed cars have the driver
// pop out of the roof (toy style). seat = [height, forward] of the driver's feet (meters).
// shape = the code-built kart used if the model can't be loaded.
// speed = top speed · accel = acceleration · handling = turning · weight = bumping power
export const KARTS = [
  { id: 'speedster', name: 'Speedster', model: 'vehicle-speedster', open: true, seat: [0.4, -0.3], shape: 'sport', speed: 4, accel: 4, handling: 3, weight: 2 },
  { id: 'roadster', name: 'Roadster', model: 'vehicle-vintage-racer', open: true, seat: [0.3, -0.25], shape: 'light', speed: 2, accel: 5, handling: 5, weight: 2 },
  { id: 'dragster', name: 'Dragster', model: 'vehicle-drag-racer', open: true, seat: [0.5, -0.85], shape: 'sport', speed: 5, accel: 2, handling: 2, weight: 3 },
  { id: 'racer', name: 'Racer', model: 'vehicle-racer', open: false, seat: [0.95, -0.1], shape: 'classic', speed: 3, accel: 3, handling: 3, weight: 3 },
  { id: 'coupe', name: 'Coupe', model: 'vehicle-racer-low', open: false, seat: [0.85, -0.1], shape: 'classic', speed: 4, accel: 3, handling: 4, weight: 2 },
  { id: 'monster', name: 'Monster', model: 'vehicle-monster-truck', open: false, seat: [1.75, -0.15], shape: 'heavy', speed: 3, accel: 2, handling: 2, weight: 5 },
  { id: 'trekker', name: 'Trekker', model: 'vehicle-suv', open: false, seat: [1.05, -0.15], shape: 'heavy', speed: 3, accel: 3, handling: 2, weight: 4 },
  { id: 'hauler', name: 'Hauler', model: 'vehicle-truck', open: false, seat: [0.85, 0.55], shape: 'heavy', speed: 2, accel: 3, handling: 3, weight: 5 },
];

// Small flat icons for the HUD (original drawings)
export const ITEM_ICONS = {
  turbo: '<svg viewBox="0 0 40 40"><path d="M14 6h12l-2 6h-8z" fill="#ADB5BD"/><rect x="13" y="12" width="14" height="18" rx="4" fill="#FF922B"/><path d="M15 30l5 8 5-8z" fill="#FFD43B"/></svg>',
  orb: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="13" fill="#E64980"/><circle cx="15" cy="15" r="4" fill="#fff" opacity=".7"/><circle cx="20" cy="20" r="17" fill="none" stroke="#F783AC" stroke-width="2" stroke-dasharray="4 4"/></svg>',
  slick: '<svg viewBox="0 0 40 40"><ellipse cx="20" cy="26" rx="16" ry="8" fill="#4DABF7"/><ellipse cx="15" cy="24" rx="5" ry="2" fill="#fff" opacity=".6"/><path d="M20 4c5 7 7 10 7 13a7 7 0 0 1-14 0c0-3 2-6 7-13z" fill="#339AF0"/></svg>',
  bolt: '<svg viewBox="0 0 40 40"><path d="M23 3 8 23h10l-4 14 18-22H21l5-12z" fill="#FFD43B" stroke="#E8A317" stroke-width="2" stroke-linejoin="round"/></svg>',
  slick3: '<svg viewBox="0 0 40 40">' + [[11, 24], [20, 13], [29, 24]].map(([x, y]) => `<path d="M${x} ${y - 9}c3.5 5 5 7 5 9a5 5 0 0 1-10 0c0-2 1.5-4 5-9z" fill="#339AF0"/>`).join('') + '</svg>',
  magnet: '<svg viewBox="0 0 40 40"><path d="M9 8v13a11 11 0 0 0 22 0V8h-8v13a3 3 0 0 1-6 0V8z" fill="#F03E3E"/><path d="M9 8h8v6H9zM23 8h8v6h-8z" fill="#DEE2E6"/></svg>',
  seeker: '<svg viewBox="0 0 40 40"><circle cx="20" cy="22" r="11" fill="#F76707"/><circle cx="16" cy="18" r="3.5" fill="#fff" opacity=".7"/><path d="M20 2l6 9h-4v5h-4v-5h-4z" fill="#FFD43B"/></svg>',
  star: '<svg viewBox="0 0 40 40"><path d="M20 3l5.3 10.8 11.9 1.7-8.6 8.4 2 11.8L20 30.1l-10.6 5.6 2-11.8-8.6-8.4 11.9-1.7z" fill="#FFD43B" stroke="#F59F00" stroke-width="2" stroke-linejoin="round"/></svg>',
  comet: '<svg viewBox="0 0 40 40"><path d="M6 34L24 16" stroke="#74C0FC" stroke-width="5" stroke-linecap="round" opacity=".6"/><path d="M12 36L28 20" stroke="#A5D8FF" stroke-width="4" stroke-linecap="round" opacity=".8"/><circle cx="28" cy="14" r="9" fill="#339AF0"/><circle cx="25" cy="11" r="3" fill="#fff" opacity=".8"/></svg>',
  shield: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="15" fill="#94D82D" opacity=".35"/><circle cx="20" cy="20" r="15" fill="none" stroke="#94D82D" stroke-width="3"/><path d="M14 13a9 9 0 0 1 8-3" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
};
