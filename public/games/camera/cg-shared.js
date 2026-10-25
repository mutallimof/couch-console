// Small things Mirror Match and Party Workout both need: who is who (names and colors for the people in the picture), drawing a
// body on the picture, and the lobby / leaderboard markup.
import { colorFor } from '../../shared/protocol.js';
import { LM, BONE_NAMES } from './pose-math.js';

const GUEST_COLORS = ['#9B51E0', '#F2994A', '#00A6A6', '#E0457B'];
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// People in the picture get the names of the joined phones, in order from left to right when the game starts; anyone after that is a guest.
//   labeler.assign(peopleLeftToRight)   (call when the game starts)    labeler.of(personId) -> { name, color, tag }
export function createLabeler(api, party) {
  const map = new Map();
  let guests = 0;
  const players = () => [...api.players].sort((a, b) => a.playerId - b.playerId);
  const take = (id) => {
    const used = new Set([...map.values()].map((l) => l.playerId));
    const free = players().find((p) => !used.has(p.playerId));
    if (free) map.set(id, { playerId: free.playerId, name: party.personOfPlayer?.(free.playerId)?.name || `P${free.playerId}`, color: colorFor(free.playerId), tag: `P${free.playerId}` });
    else { guests += 1; map.set(id, { playerId: null, name: `Guest ${guests}`, color: GUEST_COLORS[(guests - 1) % GUEST_COLORS.length], tag: `G${guests}` }); }
  };
  return {
    assign(ids) { ids.forEach((id) => { if (!map.has(id)) take(id); }); },
    of(id) { if (!map.has(id)) take(id); return map.get(id); },
    reset() { map.clear(); guests = 0; },
  };
}

// The body as a few thick lines in the person's color on top of the camera picture (so people see that they are being followed)
export function drawBody(ctx, body, aspect, W, H, color, alpha = 0.9) {
  const P = (i) => ({ x: (body[i].x / aspect) * W, y: body[i].y * H, vis: body[i].vis });
  ctx.save();
  ctx.globalAlpha = alpha; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const line = (a, b) => { const A = P(a), B = P(b); if (!A.vis || !B.vis) return; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); };
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = H * 0.026;
  const bones = [[LM.lSh, LM.rSh], [LM.lSh, LM.lEl], [LM.lEl, LM.lWr], [LM.rSh, LM.rEl], [LM.rEl, LM.rWr], [LM.lSh, LM.lHip], [LM.rSh, LM.rHip], [LM.lHip, LM.rHip], [LM.lHip, LM.lKnee], [LM.lKnee, LM.lAnk], [LM.rHip, LM.rKnee], [LM.rKnee, LM.rAnk]];
  for (const [a, b] of bones) line(a, b);
  ctx.strokeStyle = color; ctx.lineWidth = H * 0.016;
  for (const [a, b] of bones) line(a, b);
  const n = P(LM.nose);
  if (n.vis) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(n.x, n.y, H * 0.03, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = H * 0.006; ctx.strokeStyle = '#fff'; ctx.stroke(); }
  ctx.restore();
}

// Where to put a person's name tag (a point above their head, as shares of the picture)
export function tagSpot(body, aspect) {
  const top = [LM.nose, LM.lSh, LM.rSh].map((i) => body[i]).filter((p) => p?.vis).sort((a, b) => a.y - b.y)[0];
  return top ? { x: Math.max(0.06, Math.min(0.94, top.x / aspect)), y: Math.max(0.06, top.y - 0.12) } : null;
}

export const BONE_COUNT = BONE_NAMES.length;

// The final leaderboard
export function leaderboardHtml(rows, unit = 'pts') {
  const medals = ['🥇', '🥈', '🥉'];
  return `<ol class="cg-board">${rows.map((r, i) => `<li style="--c:${r.color}"><span class="cg-medal">${medals[i] || i + 1}</span><b>${esc(r.name)}</b><em>${esc(r.total)} ${unit}</em>${r.detail ? `<small>${esc(r.detail)}</small>` : ''}</li>`).join('')}</ol>`;
}
