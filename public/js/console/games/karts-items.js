// Turbo Karts item rules (Phase 27), no graphics or sound, tested in Node (tests/karts.test.mjs).
// turbo-karts.js calls these when an item is used and draws/announces the results.
//   Lightning Bolt: everyone AHEAD of you shrinks for a few seconds (a Shield blocks it).
//   Triple Slick:   three slicks, dropped one per ITEM press.
//   Magnet:         pulls in coins from far away, and gives a slipstream pull toward the kart ahead.

export const SHRINK_TIME = 3.5;   // seconds a lightning strike keeps a kart small
export const SHRINK_TOP = 0.72;   // a small kart's top speed (share of normal)
export const SHRINK_WEIGHT = 0.35; // ...and how little it weighs in a bump
export const SHRINK_SLOW = 0.6;   // speed kept at the moment of the strike
export const MAGNET_TIME = 6;
export const MAGNET_REACH = 10;   // meters (normal coin pickup reach is about 2)
export const COIN_REACH = 1.9;
export const SLICK_CHARGES = 3;

// The Lightning Bolt. order = race order, leader first. Returns who was shrunk and who blocked it.
export function strikeLightning(user, order) {
  const ahead = order.slice(0, order.indexOf(user));
  const hit = [], blocked = [];
  for (const k of ahead) {
    if (k.finished != null) continue;      // already over the line: leave them be
    if (k.shield > 0) { k.shield = 0; blocked.push(k); continue; }
    k.shrink = SHRINK_TIME;
    k.v *= SHRINK_SLOW;
    k.drifting = false;
    hit.push(k);
  }
  return { hit, blocked };
}

// Using the item a kart holds: which effect fires, and whether the kart keeps holding it.
// (Triple Slick stays in hand until all three slicks are down.)
export function takeItem(k) {
  const item = k.item;
  if (!item) return null;
  if (item === 'slick3') {
    k.charges = (k.charges ?? SLICK_CHARGES) - 1;
    if (k.charges <= 0) { k.item = null; k.charges = null; }
    return 'slick';
  }
  k.item = null;
  return item;
}

// How far away this kart picks up coins
export const coinReach = (k) => (k.magnet > 0 ? MAGNET_REACH : COIN_REACH);

// Magnet slipstream: a gentle pull toward the kart just ahead, if it's close (meters per second)
export function magnetPull(k, ahead) {
  if (!(k.magnet > 0) || !ahead) return 0;
  const d = Math.hypot(ahead.x - k.x, ahead.z - k.z);
  return d < 30 ? 4 * (1 - d / 30) : 0;
}

// Effects that wear off over time (call every step)
export function tickItemEffects(k, dt) {
  k.shrink = Math.max(0, (k.shrink || 0) - dt);
  k.magnet = Math.max(0, (k.magnet || 0) - dt);
}
