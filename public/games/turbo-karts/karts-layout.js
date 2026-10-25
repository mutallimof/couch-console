// Turbo Karts split-screen layout (no graphics, so it can be tested): where each player's view goes, how wide its field of view is,
// and how big its HUD is.
// 1 view: the whole screen · 2: side by side · 3: top left, top right, bottom left (the minimap takes the 4th) · 4: a grid.
// Rects are in CSS pixels from the top left.
export const GUTTER = 3;
export function viewRects(n, W, H) {
  const g = GUTTER;
  if (n <= 1) return [{ x: 0, y: 0, w: W, h: H }];
  if (n === 2) return [{ x: 0, y: 0, w: W / 2 - g / 2, h: H }, { x: W / 2 + g / 2, y: 0, w: W / 2 - g / 2, h: H }];
  const w = W / 2 - g / 2, h = H / 2 - g / 2, x2 = W / 2 + g / 2, y2 = H / 2 + g / 2;
  return [{ x: 0, y: 0, w, h }, { x: x2, y: 0, w, h }, { x: 0, y: y2, w, h }, { x: x2, y: y2, w, h }].slice(0, n);
}
// A narrow view needs a taller field of view to show the same width of road
export const fovFor = (base, aspect) => base * Math.min(1.35, Math.max(1, 1.5 / aspect));
// How big the HUD is in a view (the HUD is drawn for a full screen)
export const hudZoom = (n) => (n <= 1 ? 1 : n === 2 ? 0.72 : 0.56);

