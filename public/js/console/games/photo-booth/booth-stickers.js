// Photo Booth stickers: hats, glasses, ears and a moustache that sit on faces. faceAnchor() turns MediaPipe face landmarks
// into a place, size and tilt on the picture; drawSticker() paints one original vector sticker there. Pure canvas, no files.
export const STICKERS = [
  { id: 'crown', name: 'Crown' },
  { id: 'party', name: 'Party hat' },
  { id: 'top', name: 'Top hat' },
  { id: 'cat', name: 'Cat ears' },
  { id: 'bunny', name: 'Bunny ears' },
  { id: 'sunglasses', name: 'Sunglasses' },
  { id: 'hearts', name: 'Heart glasses' },
  { id: 'round', name: 'Round glasses' },
  { id: 'mustache', name: 'Moustache' },
];

// Landmark numbers of the face mesh we use
const LM = { forehead: 10, chin: 152, eyeA: 33, eyeB: 263, noseBase: 2, lipTop: 0 };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

// landmarks: [{ x, y }] normalized 0..1 (like MediaPipe's); W, H: the picture size in pixels; mirrored: the picture is shown like a mirror
export function faceAnchor(landmarks, W, H, mirrored = true) {
  if (!landmarks || landmarks.length < 264) return null;
  const P = (i) => ({ x: (mirrored ? 1 - landmarks[i].x : landmarks[i].x) * W, y: landmarks[i].y * H });
  let a = P(LM.eyeA), b = P(LM.eyeB);
  if (a.x > b.x) [a, b] = [b, a]; // a = the eye on the left of the screen
  const forehead = P(LM.forehead), chin = P(LM.chin), faceH = dist(forehead, chin) || 1;
  const up = { x: (forehead.x - chin.x) / faceH, y: (forehead.y - chin.y) / faceH };
  const eyes = lerp(a, b, 0.5);
  return {
    eyes, width: dist(a, b), roll: Math.atan2(b.y - a.y, b.x - a.x), up,
    headTop: { x: forehead.x + up.x * faceH * 0.1, y: forehead.y + up.y * faceH * 0.1 },
    lip: lerp(P(LM.noseBase), P(LM.lipTop), 0.5), faceH,
  };
}

// Paint with the origin at (x, y), turned by the face's tilt, 100 units = the distance between the eyes
function at(ctx, x, y, a, draw) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(a.roll); ctx.scale(a.width / 100, a.width / 100);
  draw(ctx);
  ctx.restore();
}
const fillStroke = (ctx, fill, stroke, lw = 3) => { if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); } };

const DRAW = {
  crown(ctx, a) {
    at(ctx, a.headTop.x, a.headTop.y, a, (c) => {
      const g = c.createLinearGradient(0, -70, 0, 0); g.addColorStop(0, '#FFE680'); g.addColorStop(1, '#F2A900');
      c.beginPath(); c.moveTo(-62, 0); c.lineTo(-68, -62); c.lineTo(-34, -34); c.lineTo(0, -78); c.lineTo(34, -34); c.lineTo(68, -62); c.lineTo(62, 0); c.closePath();
      fillStroke(c, g, '#B87800', 4);
      for (const [x, y, col] of [[-68, -64, '#FF5C8A'], [0, -80, '#3FA9FF'], [68, -64, '#FF5C8A']]) { c.beginPath(); c.arc(x, y, 7, 0, 6.28); fillStroke(c, col, '#fff', 2); }
      c.fillStyle = '#B87800'; c.fillRect(-62, -12, 124, 7);
    });
  },
  party(ctx, a) {
    at(ctx, a.headTop.x, a.headTop.y, a, (c) => {
      c.beginPath(); c.moveTo(-46, 6); c.lineTo(0, -140); c.lineTo(46, 6); c.closePath();
      const g = c.createLinearGradient(-46, 0, 46, 0); g.addColorStop(0, '#FF5C8A'); g.addColorStop(1, '#FF8A3D'); fillStroke(c, g, '#fff', 3);
      c.save(); c.clip(); c.strokeStyle = '#FFE066'; c.lineWidth = 9;
      for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-60, -10 - i * 34 + 20); c.lineTo(60, -10 - i * 34 - 10); c.stroke(); }
      c.restore();
      c.beginPath(); c.arc(0, -142, 12, 0, 6.28); fillStroke(c, '#FFE066', '#fff', 2);
    });
  },
  top(ctx, a) {
    at(ctx, a.headTop.x, a.headTop.y, a, (c) => {
      c.beginPath(); c.roundRect(-46, -110, 92, 106, 6); fillStroke(c, '#23263A', '#0F1120', 3);
      c.fillStyle = '#FF5C8A'; c.fillRect(-46, -28, 92, 16);
      c.beginPath(); c.ellipse(0, -2, 82, 14, 0, 0, 6.28); fillStroke(c, '#2E3250', '#0F1120', 3);
    });
  },
  cat(ctx, a) {
    for (const s of [-1, 1]) at(ctx, a.headTop.x, a.headTop.y, a, (c) => {
      c.beginPath(); c.moveTo(s * 20, 4); c.lineTo(s * 70, -58); c.lineTo(s * 74, 18); c.closePath(); fillStroke(c, '#3B3F5C', '#1D2036', 3);
      c.beginPath(); c.moveTo(s * 34, 2); c.lineTo(s * 62, -34); c.lineTo(s * 64, 10); c.closePath(); fillStroke(c, '#FF8FB1');
    });
  },
  bunny(ctx, a) {
    for (const s of [-1, 1]) at(ctx, a.headTop.x + s * a.width * 0.35, a.headTop.y, a, (c) => {
      c.rotate(s * 0.18);
      c.beginPath(); c.ellipse(0, -62, 20, 66, 0, 0, 6.28); fillStroke(c, '#FFFFFF', '#C9CEDD', 3);
      c.beginPath(); c.ellipse(0, -60, 10, 48, 0, 0, 6.28); fillStroke(c, '#FFB3C7');
    });
  },
  sunglasses(ctx, a) {
    at(ctx, a.eyes.x, a.eyes.y, a, (c) => {
      for (const s of [-1, 1]) { c.beginPath(); c.roundRect(s * 36 - 30, -18, 60, 40, [8, 8, 22, 22]); fillStroke(c, '#14151F', '#000', 3); c.fillStyle = 'rgba(255,255,255,0.28)'; c.beginPath(); c.moveTo(s * 36 - 20, -12); c.lineTo(s * 36 - 6, -12); c.lineTo(s * 36 - 22, 12); c.lineTo(s * 36 - 30, 12); c.closePath(); c.fill(); }
      c.fillStyle = '#14151F'; c.fillRect(-8, -12, 16, 7);
      c.strokeStyle = '#14151F'; c.lineWidth = 6; c.beginPath(); c.moveTo(-66, -8); c.lineTo(-84, -14); c.moveTo(66, -8); c.lineTo(84, -14); c.stroke();
    });
  },
  hearts(ctx, a) {
    at(ctx, a.eyes.x, a.eyes.y, a, (c) => {
      for (const s of [-1, 1]) {
        c.save(); c.translate(s * 36, 2); c.beginPath(); c.moveTo(0, 26); c.bezierCurveTo(-46, -2, -30, -36, 0, -14); c.bezierCurveTo(30, -36, 46, -2, 0, 26); c.closePath();
        fillStroke(c, 'rgba(255,92,138,0.78)', '#D6336C', 4); c.restore();
      }
      c.strokeStyle = '#D6336C'; c.lineWidth = 5; c.beginPath(); c.moveTo(-6, -8); c.quadraticCurveTo(0, -14, 6, -8); c.stroke();
    });
  },
  round(ctx, a) {
    at(ctx, a.eyes.x, a.eyes.y, a, (c) => {
      for (const s of [-1, 1]) { c.beginPath(); c.arc(s * 36, 0, 27, 0, 6.28); fillStroke(c, 'rgba(180,225,255,0.22)', '#2B2F45', 5); }
      c.strokeStyle = '#2B2F45'; c.lineWidth = 5; c.beginPath(); c.moveTo(-9, -3); c.quadraticCurveTo(0, -10, 9, -3); c.stroke();
      c.beginPath(); c.moveTo(-63, -4); c.lineTo(-82, -8); c.moveTo(63, -4); c.lineTo(82, -8); c.stroke();
    });
  },
  mustache(ctx, a) {
    at(ctx, a.lip.x, a.lip.y, a, (c) => {
      c.beginPath(); c.moveTo(0, -4);
      c.bezierCurveTo(-14, -16, -40, -10, -50, 8); c.bezierCurveTo(-56, 20, -42, 22, -34, 12); c.bezierCurveTo(-26, 4, -12, 6, 0, 8);
      c.bezierCurveTo(12, 6, 26, 4, 34, 12); c.bezierCurveTo(42, 22, 56, 20, 50, 8); c.bezierCurveTo(40, -10, 14, -16, 0, -4); c.closePath();
      fillStroke(c, '#4A3224', '#2A1B12', 3);
    });
  },
};

export function drawSticker(ctx, id, anchor) {
  if (anchor && DRAW[id]) { ctx.save(); DRAW[id](ctx, anchor); ctx.restore(); }
}
