// The Couch Console emblem for the Grand Stadium (our own drawing, replaces the original's mascot):
// a sofa with four cushions in the player colors, as in the Couch Console logo (public/assets/logo.svg).
const PLAYERS = ["#2F80ED", "#EB5757", "#27AE60", "#D99A00"];

/** Draw the emblem centred on (cx, cy), `size` pixels wide, onto a 2D canvas context. */
export function drawEmblem(c, cx, cy, size = 200) {
  const u = size / 170; // the logo is drawn on a 170 x 150 grid
  c.save();
  c.translate(cx - 85 * u, cy - 75 * u);
  c.scale(u, u);
  const round = (x, y, w, h, r, color) => {
    c.fillStyle = color;
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    c.fill();
  };
  // the little "play" triangle above the sofa
  c.fillStyle = "#fff4d2";
  c.beginPath();
  c.moveTo(76, 13); c.lineTo(108, 30); c.lineTo(76, 47); c.closePath();
  c.fill();
  // back, arms and legs
  round(12, 62, 146, 62, 26, "#25304A");
  round(0, 82, 38, 60, 18, "#3a4868");
  round(132, 82, 38, 60, 18, "#3a4868");
  round(22, 132, 14, 14, 5, "#25304A");
  round(134, 132, 14, 14, 5, "#25304A");
  // four cushions
  PLAYERS.forEach((color, i) => round(40 + i * 23, 76, 21, 34, 7, color));
  c.restore();
}
