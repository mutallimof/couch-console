// Road orientation shared by the rules, the chase camera and kart contacts: where "up", "forward"
// and "right" point for a kart on the road. Adapted from OpenWii's games/mario-kart/visual-frame.js
// (MIT, Copyright (c) 2026 Patrick Sun; see THIRD_PARTY_NOTICES.md): the track is passed in
// (no module-level course), and the imported-course branches are removed.
import { clamp } from './track-model.js';

const norm = (v) => {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

export function roadFrame(T, s, lateral, heading) {
  // Use the centreline for horizontal travel, so a tight inside curb can never turn the camera upside down
  const a = T.surfaceAt(s - 0.2, 0), b = T.surfaceAt(s + 0.2, 0);
  const c = T.surfaceAt(s, lateral - 0.2), d = T.surfaceAt(s, lateral + 0.2);
  const along = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const across = { x: d.x - c.x, y: d.y - c.y, z: d.z - c.z };
  const up = norm(cross(across, along));
  // The projected forward vector keeps the player's horizontal heading
  const x = Math.sin(heading), z = -Math.cos(heading);
  const forward = norm({ x, y: -(up.x * x + up.z * z) / Math.max(0.1, up.y), z });
  return { up, forward, right: norm(cross(forward, up)) };
}

/** Never let the camera dip below the road (hills) */
export function cameraClearance(T, position, referenceS = null) {
  const p = T.project(position.x, position.z, referenceS);
  if (Math.abs(p.lateral) > T.wallHalf + 1) return position;
  return { ...position, y: Math.max(position.y, T.surfaceAt(p.s, p.lateral).y + 1.25) };
}

/** While gliding the camera follows the real descent */
export function flightFrame(racer) {
  const speed = Math.max(26, Math.abs(racer.speed || 0));
  const forward = norm({ x: Math.sin(racer.heading) * speed, y: Number.isFinite(racer.flightV) ? racer.flightV : -speed * 0.08, z: -Math.cos(racer.heading) * speed });
  const up = norm({ x: -forward.x * forward.y, y: 1 - forward.y * forward.y, z: -forward.z * forward.y });
  return { forward, up };
}

/** The chase camera: low and close behind the kart, looking at a point above it, between straight
 *  ahead and the road ahead (so the kart sits low in the picture and the next corner is visible). */
export function chasePose(T, racer, opts = {}) {
  const frame = racer.gliding
    ? flightFrame(racer)
    : roadFrame(T, racer.s, racer.lateral, racer.heading);
  const { up: n, forward: f } = frame;
  const back = (opts.back ?? 9.6) - (racer.gliding ? 0.8 : 0), height = (opts.height ?? 3.65) + (racer.gliding ? 0.15 : 0);
  const eye = cameraClearance(T, {
    x: racer.x - f.x * back + n.x * height,
    y: racer.y - f.y * back + n.y * height,
    z: racer.z - f.z * back + n.z * height,
  }, racer.s);
  const ahead = T.surfaceAt(racer.s + 14, racer.lateral * 0.55);
  const follow = racer.gliding ? 0 : 0.45;
  const aimHeight = racer.gliding ? 1.3 : 3.1;
  const aim = {
    x: (racer.x + f.x * 12) * (1 - follow) + ahead.x * follow + n.x * aimHeight,
    y: (racer.y + f.y * 12) * (1 - follow) + ahead.y * follow + n.y * aimHeight,
    z: (racer.z + f.z * 12) * (1 - follow) + ahead.z * follow + n.z * aimHeight,
  };
  const viewUp = norm({ x: n.x * 0.72, y: n.y * 0.72 + 0.28, z: n.z * 0.72 });
  return { eye, aim, up: viewUp };
}
export { clamp };
