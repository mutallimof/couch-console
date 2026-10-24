// Kart-to-kart contact: body rectangles, separating axes, and the momentum exchange.
// Adapted from OpenWii's games/mario-kart/kart-contact.js and contact-response.js (MIT,
// Copyright (c) 2026 Patrick Sun; see THIRD_PARTY_NOTICES.md): the track is passed in, and the
// imported-course branches are removed.
import { roadFrame } from './frame.js';
import { wrap } from './track-model.js';

/** Footprint (metres): a 2.6 m wide, 3.4 m long chassis, a little wider while spinning or drifting. */
export function kartFootprint(T, r, time = 0) {
  const frame = r.gliding
    ? { right: { x: Math.cos(r.heading), z: Math.sin(r.heading) }, forward: { x: Math.sin(r.heading), z: -Math.cos(r.heading) } }
    : roadFrame(T, r.s, r.lateral, r.heading);
  const yaw = r.spin > 0 ? time * 15 : r.drift ? -r.drift * 0.25 : 0, c = Math.cos(yaw), s = Math.sin(yaw);
  const right = { x: frame.right.x * c + frame.forward.x * s, z: frame.right.z * c + frame.forward.z * s };
  const back = { x: frame.right.x * s - frame.forward.x * c, z: frame.right.z * s - frame.forward.z * c };
  const halfWidth = 1.29;
  return [[-halfWidth, -1.76], [halfWidth, -1.76], [halfWidth, 1.64], [-halfWidth, 1.64]].map(([x, z]) => ({
    x: r.x + right.x * x + back.x * z, z: r.z + right.z * x + back.z * z,
  }));
}

/** Separating axes of the projected body rectangles. Returns the least displacement from A to B, or null. */
export function kartContact(T, a, b, time = 0) {
  if (Math.hypot(b.x - a.x, b.z - a.z) > 5) return null;
  const routeGap = Math.abs(wrap(b.s - a.s + T.length / 2, T.length) - T.length / 2);
  if (routeGap > 18 || ((a.gliding || b.gliding) && Math.abs(a.y - b.y) > 1.8)) return null;
  const A = kartFootprint(T, a, time), B = kartFootprint(T, b, time);
  let depth = Infinity, normal;
  for (const polygon of [A, B]) {
    for (let i = 0; i < 2; i++) {
      const dx = polygon[i + 1].x - polygon[i].x, dz = polygon[i + 1].z - polygon[i].z, len = Math.hypot(dx, dz);
      const nx = -dz / len, nz = dx / len;
      const pa = A.map((p) => p.x * nx + p.z * nz), pb = B.map((p) => p.x * nx + p.z * nz);
      const amin = Math.min(...pa), amax = Math.max(...pa), bmin = Math.min(...pb), bmax = Math.max(...pb);
      if (amax <= bmin || bmax <= amin) return null;
      const overlap = Math.min(amax - bmin, bmax - amin);
      if (overlap < depth) {
        depth = overlap;
        const sign = (b.x - a.x) * nx + (b.z - a.z) * nz < 0 ? -1 : 1;
        normal = { x: nx * sign, z: nz * sign };
      }
    }
  }
  return { x: normal.x * (depth + 0.005), z: normal.z * (depth + 0.005), depth };
}

/** Ground contact momentum in each kart's road frame. Equal arcade masses; 40% restitution gives a
 *  firm shove without the spin-out reserved for weapons. Returns how hard they closed. */
const dot = (a, b) => a.x * b.x + (a.y || 0) * (b.y || 0) + a.z * b.z;
const velocity = (r, f) => ({
  x: f.forward.x * r.speed + f.right.x * (r.sideVelocity || 0),
  y: (f.forward.y || 0) * r.speed + (f.right.y || 0) * (r.sideVelocity || 0),
  z: f.forward.z * r.speed + f.right.z * (r.sideVelocity || 0),
});
export function contactResponse(a, b, fa, fb, contact) {
  const length = Math.hypot(contact.x, contact.y || 0, contact.z);
  if (length < 1e-8) return 0;
  const n = { x: contact.x / length, y: (contact.y || 0) / length, z: contact.z / length }, va = velocity(a, fa), vb = velocity(b, fb);
  const closing = dot({ x: va.x - vb.x, y: va.y - vb.y, z: va.z - vb.z }, n);
  if (closing <= 0) return 0;
  const impulse = closing * 0.7;
  for (const [r, f, sign] of [[a, fa, -1], [b, fb, 1]]) {
    r.speed += sign * impulse * dot(n, f.forward);
    r.sideVelocity = (r.sideVelocity || 0) + sign * impulse * dot(n, f.right);
    r.contactSide = sign * dot(n, f.right);
  }
  return closing;
}
