// Photo Booth frames: original borders drawn on top of the picture (so they are part of the saved photo). Pure canvas
// drawing, no files. drawFrame(ctx, id, width, height, time, label) draws the border; time (seconds) animates a few of them.
export const FRAMES = [
  { id: 'none', name: 'Clean' },
  { id: 'polaroid', name: 'Polaroid' },
  { id: 'confetti', name: 'Confetti' },
  { id: 'film', name: 'Film strip' },
  { id: 'sunburst', name: 'Sunburst' },
  { id: 'neon', name: 'Neon' },
];

// A rectangle frame: fill the whole canvas except an inner rectangle (even-odd)
function border(ctx, W, H, l, t, r, b, radius = 0) {
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  if (radius) ctx.roundRect(l, t, W - l - r, H - t - b, radius); else ctx.rect(l, t, W - l - r, H - t - b);
}

// A tiny seeded random, so confetti sits in the same places every frame
function seeded(seed) { let s = seed; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

const DRAW = {
  none() {},
  polaroid(ctx, W, H, t, label) {
    const m = W * 0.035, bottom = H * 0.15;
    ctx.fillStyle = '#FBF8F1';
    border(ctx, W, H, m, m, m, bottom, W * 0.006); ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 2; ctx.strokeRect(m, m, W - 2 * m, H - m - bottom); // a hairline where the picture meets the paper
    ctx.fillStyle = '#4A4F63'; ctx.font = `600 ${H * 0.055}px Fredoka, Nunito, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label || 'Couch Console', W / 2, H - bottom / 2 - m * 0.2);
  },
  confetti(ctx, W, H, t) {
    const m = W * 0.045;
    ctx.fillStyle = '#FFF3E0'; border(ctx, W, H, m, m, m, m, W * 0.012); ctx.fill('evenodd');
    const rnd = seeded(7), colors = ['#FF5C8A', '#3FA9FF', '#FFC93C', '#2FD6A4', '#FF8A3D', '#9B7BFF'];
    for (let i = 0; i < 90; i++) {
      // pieces are scattered along the border, a few drift into the picture
      const edge = rnd() * 4 | 0, along = rnd(), depth = (rnd() * 1.6 - 0.2) * m;
      const x = edge < 2 ? along * W : (edge === 2 ? depth : W - depth), y = edge < 2 ? (edge === 0 ? depth : H - depth) : along * H;
      ctx.save();
      ctx.translate(x, y + Math.sin(t * 1.4 + i) * 2); ctx.rotate(rnd() * 6.28 + t * (rnd() - 0.5) * 0.6);
      ctx.fillStyle = colors[i % colors.length];
      const s = W * (0.008 + rnd() * 0.01), shape = i % 3;
      if (shape === 0) { ctx.beginPath(); ctx.arc(0, 0, s, 0, 6.28); ctx.fill(); } else if (shape === 1) ctx.fillRect(-s, -s * 0.5, s * 2, s); else { ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s, s); ctx.lineTo(-s, s); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }
  },
  film(ctx, W, H, t, label) {
    const bar = H * 0.11;
    ctx.fillStyle = '#17181F'; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar); ctx.fillRect(0, 0, W * 0.012, H); ctx.fillRect(W - W * 0.012, 0, W * 0.012, H);
    ctx.fillStyle = '#F4F1EA';
    const holeW = W * 0.022, holeH = bar * 0.42, gap = W * 0.046, shift = (t * W * 0.012) % gap;
    for (let x = -gap + shift; x < W + gap; x += gap) { ctx.beginPath(); ctx.roundRect(x, bar * 0.29, holeW, holeH, 4); ctx.fill(); ctx.beginPath(); ctx.roundRect(x, H - bar * 0.29 - holeH, holeW, holeH, 4); ctx.fill(); }
  },
  sunburst(ctx, W, H, t) {
    const m = W * 0.05;
    ctx.save();
    border(ctx, W, H, m, m, m, m, W * 0.015); ctx.clip('evenodd');
    ctx.translate(W / 2, H / 2); ctx.rotate(t * 0.08);
    const n = 28, R = Math.hypot(W, H);
    for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? '#FFC93C' : '#FF8A3D'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, (i / n) * 6.283, ((i + 1) / n) * 6.283); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = W * 0.006; ctx.beginPath(); ctx.roundRect(m, m, W - 2 * m, H - 2 * m, W * 0.015); ctx.stroke();
  },
  neon(ctx, W, H, t) {
    const m = W * 0.03, pulse = 0.85 + Math.sin(t * 3) * 0.1;
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) / 2);
    g.addColorStop(0, 'rgba(10,8,30,0)'); g.addColorStop(1, 'rgba(10,8,30,0.55)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (const [inset, color, width] of [[m, '#FF3EA5', W * 0.007], [m * 1.9, '#3EE6FF', W * 0.005]]) {
      ctx.save();
      ctx.shadowColor = color; ctx.shadowBlur = W * 0.02 * pulse; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.globalAlpha = pulse;
      ctx.beginPath(); ctx.roundRect(inset, inset, W - 2 * inset, H - 2 * inset, W * 0.02); ctx.stroke(); ctx.stroke();
      ctx.restore();
    }
  },
};

export function drawFrame(ctx, id, W, H, t = 0, label = '') {
  const fn = DRAW[id];
  if (!fn) return;
  ctx.save();
  fn(ctx, W, H, t, label);
  ctx.restore();
}
