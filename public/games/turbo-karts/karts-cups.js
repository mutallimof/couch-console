// Turbo Karts cups: a short championship of four races, points for every place (the same table for everyone).
export const CUPS = [
  { id: 'sun', name: 'Sun Cup', tracks: ['park', 'desert', 'snow', 'pirate'], color: '#FFB020', blurb: 'Four sunny races: park, canyon, mountain and cove.' },
  { id: 'star', name: 'Star Cup', tracks: ['city', 'avenue', 'sky', 'stadium'], color: '#7C5CFA', blurb: 'Four big races: the city, the avenue, the clouds and the stadium.' },
];
export const CUP_POINTS = [15, 12, 10, 8, 6, 4, 2, 1]; // by finishing place

// A racer's name in the cup table: a human by phone number, a computer driver by character
export const racerKey = (v) => (v.playerId ? `P${v.playerId}` : `c:${v.char.id}`);

// Add one race's results (views in finishing order) to the cup table: { key -> { points, wins, name, color, playerId, char } }
export function addRace(table, order) {
  order.forEach((v, i) => {
    const row = table.get(racerKey(v)) || { points: 0, wins: 0, name: v.playerId ? `P${v.playerId}` : v.char.name, color: v.color, playerId: v.playerId, charId: v.char.id };
    row.points += CUP_POINTS[i] ?? 0;
    if (i === 0) row.wins += 1;
    table.set(racerKey(v), row);
  });
  return [...table.values()].sort((a, b) => b.points - a.points || b.wins - a.wins);
}
