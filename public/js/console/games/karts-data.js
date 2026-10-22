// Turbo Karts data: the original characters, karts and items.
// Stats go from 1 (low) to 5 (high).

// model: a pirate from the Pirate Kit (animated). No model = drawn in code (the animals).
export const CHARACTERS = [
  { id: 'anne', name: 'Anne', model: 'Characters_Anne', color: '#C08457', accent: '#F4D35E' },
  { id: 'barbarossa', name: 'Barbarossa', model: 'Characters_Captain_Barbarossa', color: '#C92A2A', accent: '#FFD43B' },
  { id: 'henry', name: 'Henry', model: 'Characters_Henry', color: '#8D6E63', accent: '#E03131' },
  { id: 'mako', name: 'Mako', model: 'Characters_Mako', color: '#868E96', accent: '#4DABF7' },
  { id: 'sharky', name: 'Sharky', model: 'Characters_Sharky', color: '#4C6EF5', accent: '#A5D8FF' },
  { id: 'skelly', name: 'Skelly', model: 'Characters_Skeleton', color: '#CED4DA', accent: '#F59F00' },
  { id: 'pip', name: 'Pip', kind: 'bird', color: '#F2C94C', accent: '#F2994A' },
  { id: 'mochi', name: 'Mochi', kind: 'cat', color: '#F4F1EC', accent: '#F7A8B8' },
  { id: 'bruno', name: 'Bruno', kind: 'bear', color: '#9C6B3C', accent: '#E5C49F' },
  { id: 'bolt', name: 'Bolt', kind: 'robot', color: '#B8C4D4', accent: '#56CCF2' },
  { id: 'hops', name: 'Hops', kind: 'bunny', color: '#C9B6E8', accent: '#F7D9E8' },
  { id: 'ember', name: 'Ember', kind: 'fox', color: '#F2994A', accent: '#FFFFFF' },
  { id: 'kiwi', name: 'Kiwi', kind: 'frog', color: '#6FCF97', accent: '#E8F7EE' },
  { id: 'nova', name: 'Nova', kind: 'alien', color: '#56CCF2', accent: '#BB6BD9' },
];

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

// Items from item boxes. Further back in the race = better items.
export const ITEMS = {
  turbo: { name: 'Turbo', color: '#FF922B' },     // a short speed boost
  orb: { name: 'Homing Orb', color: '#E64980' },  // flies ahead and spins out the kart in front
  slick: { name: 'Slick', color: '#4DABF7' },     // dropped behind you; karts that hit it spin
  shield: { name: 'Shield', color: '#94D82D' },   // blocks one hit for a few seconds
};
export const ITEM_ODDS = {
  front: { slick: 50, shield: 30, orb: 20 },
  middle: { orb: 40, turbo: 30, slick: 15, shield: 15 },
  back: { turbo: 60, orb: 30, shield: 10 },
};

// Small flat icons for the HUD (original drawings)
export const ITEM_ICONS = {
  turbo: '<svg viewBox="0 0 40 40"><path d="M14 6h12l-2 6h-8z" fill="#ADB5BD"/><rect x="13" y="12" width="14" height="18" rx="4" fill="#FF922B"/><path d="M15 30l5 8 5-8z" fill="#FFD43B"/></svg>',
  orb: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="13" fill="#E64980"/><circle cx="15" cy="15" r="4" fill="#fff" opacity=".7"/><circle cx="20" cy="20" r="17" fill="none" stroke="#F783AC" stroke-width="2" stroke-dasharray="4 4"/></svg>',
  slick: '<svg viewBox="0 0 40 40"><ellipse cx="20" cy="26" rx="16" ry="8" fill="#4DABF7"/><ellipse cx="15" cy="24" rx="5" ry="2" fill="#fff" opacity=".6"/><path d="M20 4c5 7 7 10 7 13a7 7 0 0 1-14 0c0-3 2-6 7-13z" fill="#339AF0"/></svg>',
  shield: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="15" fill="#94D82D" opacity=".35"/><circle cx="20" cy="20" r="15" fill="none" stroke="#94D82D" stroke-width="3"/><path d="M14 13a9 9 0 0 1 8-3" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
};

// Turn 1..5 stats into physics numbers
export function kartPhysics(kart) {
  return {
    top: 27 + kart.speed * 1.4,           // m/s
    accel: 14 + kart.accel * 3,           // m/s²
    turn: 1.55 + kart.handling * 0.13,    // rad/s at full lock
    weight: kart.weight,
  };
}

export function rollItem(place, total) {
  const pos = (place - 1) / Math.max(1, total - 1); // 0 = first, 1 = last
  const odds = ITEM_ODDS[pos < 0.25 ? 'front' : pos > 0.6 ? 'back' : 'middle'];
  let r = Math.random() * Object.values(odds).reduce((a, b) => a + b, 0);
  for (const [item, w] of Object.entries(odds)) { r -= w; if (r <= 0) return item; }
  return 'turbo';
}
