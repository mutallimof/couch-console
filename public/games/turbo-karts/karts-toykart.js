// Turbo Karts toy karts: four chunky, rounded, glossy karts made in code (original shapes), in the racer's color with a lighter
// stripe. Fat soft tyres with hubcaps, bumpers, number plates, a tailpipe. One merged body mesh (plus its outline) and four wheels per
// kart; geometry is shared between karts of the same type and color. Karts face +z; the pilot sits where `seatY` / `seatZ` say.
import { Parts, roundBox, toyMesh, cached, tint, hexOf } from './karts-toykit.js';

let THREE = null;
export function setToyKartThree(t) { THREE = t; }

const TRIM = '#2b2d4a', CHROME = '#E9EEF8', RUBBER = '#2a2c3b', LAMP = '#FFFFFF', CAP = '#FFD43B';

// A fat tyre with a hubcap. Spins around x. white: white-wall tyres (the roadster)
function wheelGeometry({ r, w, hub, white = false }) {
  return cached(`wheel|${r}|${w}|${hub}|${white}`, () => {
    const p = new Parts(), t = r * 0.4, R = r - t, k = w / 2 / t;
    p.add(new THREE.TorusGeometry(R, t, 8, 16), RUBBER, [0, 0, 0], [0, Math.PI / 2, 0], [1, 1, k]);
    p.add(new THREE.CylinderGeometry(R * 1.02, R * 1.02, w * 0.86, 14), white ? '#FFFFFF' : tint(hub, 0.2), [0, 0, 0], [0, 0, Math.PI / 2]);
    if (white) p.add(new THREE.CylinderGeometry(R * 0.62, R * 0.62, w * 0.9, 12), hub, [0, 0, 0], [0, 0, Math.PI / 2]);
    else p.add(new THREE.CylinderGeometry(R * 0.55, R * 0.55, w * 0.9, 12), hub, [0, 0, 0], [0, 0, Math.PI / 2]);
    for (const s of [-1, 1]) p.add(new THREE.SphereGeometry(R * 0.27, 8, 6), CAP, [s * w * 0.45, 0, 0], [0, 0, 0], [0.45, 1, 1]);
    return p.merge();
  });
}

// --- tiny helpers ---
const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 3, 10);
const cyl = (r, h, seg = 12) => new THREE.CylinderGeometry(r, r, h, seg);
const ball = (r) => new THREE.SphereGeometry(r, 12, 8);
const alongZ = [Math.PI / 2, 0, 0], alongX = [0, 0, Math.PI / 2];

function plates(P, z, y) { // the number plate and a tailpipe
  P.add(roundBox(0.5, 0.24, 0.05, 0.03, 1), '#FFFFFF', [0, y, z]);
  P.add(roundBox(0.3, 0.07, 0.06, 0.02, 1), '#E5384E', [0, y, z - 0.005]);
}
function pipe(P, x, y, z, r = 0.075) { P.add(cyl(r, 0.45), CHROME, [x, y, z], alongZ); P.add(cyl(r * 0.6, 0.47), '#3a3d52', [x, y, z - 0.01], alongZ); }
function wheelPairs(group, wheels, defs, hub, white) {
  for (const [x, z, r, w] of defs) {
    const wg = new THREE.Group();
    wg.position.set(x, r, z);
    wg.add(toyMesh(wheelGeometry({ r, w, hub, white }), { outline: false }));
    group.add(wg); wheels.push(wg);
  }
}

const BUILD = {
  // wedge nose and side pods, a rear wing
  speedster(P, c) {
    P.add(roundBox(1.5, 0.2, 3.4, 0.08), TRIM, [0, 0.36, 0.25]);
    P.add(roundBox(1.0, 0.4, 1.5, 0.16), c.paint, [0, 0.6, 1.35], [0.1, 0, 0]);
    P.add(roundBox(0.72, 0.26, 0.62, 0.11), c.light, [0, 0.5, 2.05], [0.1, 0, 0]);
    P.add(roundBox(0.22, 0.05, 1.7, 0.02, 1), c.light, [0, 0.84, 1.3], [0.1, 0, 0]);
    for (const s of [-1, 1]) {
      P.add(roundBox(0.16, 0.42, 1.5, 0.07), c.paint, [s * 0.55, 0.62, -0.45]);
      P.add(cap(0.24, 1.1), c.light, [s * 0.88, 0.56, 0.3], alongZ);
      P.add(ball(0.17), c.dark, [s * 0.88, 0.56, 1.0], [0, 0, 0], [1, 1, 0.6]);
      P.add(cyl(0.05, 0.5), TRIM, [s * 0.45, 0.95, -1.45]);
      P.add(roundBox(0.05, 0.32, 0.56, 0.02, 1), c.paint, [s * 0.88, 1.32, -1.5]);
      P.add(ball(0.1), LAMP, [s * 0.3, 0.66, 1.93]);
      pipe(P, s * 0.3, 0.6, -1.65);
    }
    P.add(roundBox(1.0, 0.4, 0.34, 0.1), c.dark, [0, 0.7, 0.62]);
    P.add(roundBox(1.15, 0.5, 0.9, 0.16), c.paint, [0, 0.72, -1.1]);
    P.add(roundBox(1.2, 0.34, 0.5, 0.12), TRIM, [0, 0.5, -1.4]);
    P.add(roundBox(1.75, 0.07, 0.5, 0.03, 1), c.light, [0, 1.24, -1.5]);
    P.add(cap(0.09, 1.2), CHROME, [0, 0.42, 2.2], alongX);
    plates(P, -1.64, 0.58);
    return { seatY: 0.56, seatZ: -0.3, wheels: [[-1.0, 1.25, 0.42, 0.4], [1.0, 1.25, 0.42, 0.4], [-1.02, -0.95, 0.47, 0.5], [1.02, -0.95, 0.47, 0.5]] };
  },
  // a round little bubble with big fenders, headlights and white-wall tyres
  roadster(P, c) {
    P.add(roundBox(1.6, 0.2, 3.1, 0.08), TRIM, [0, 0.36, 0.05]);
    P.add(roundBox(1.5, 0.55, 2.5, 0.26), c.paint, [0, 0.62, -0.05]);
    P.add(roundBox(1.3, 0.45, 1.1, 0.2), c.paint, [0, 0.6, 1.4]);
    P.add(new THREE.TorusGeometry(0.62, 0.075, 10, 24), c.dark, [0, 0.86, -0.25], [Math.PI / 2, 0, 0], [1, 1.05, 1]);
    P.add(roundBox(0.1, 0.03, 1.1, 0.012, 1), c.light, [-0.15, 0.84, 1.4]); P.add(roundBox(0.1, 0.03, 1.1, 0.012, 1), c.light, [0.15, 0.84, 1.4]);
    for (const s of [-1, 1]) {
      P.add(ball(0.5), c.paint, [s * 1.0, 0.74, 1.15], [0, 0, 0], [0.8, 0.55, 1.3]);
      P.add(ball(0.5), c.paint, [s * 1.0, 0.76, -0.95], [0, 0, 0], [0.8, 0.55, 1.3]);
      P.add(ball(0.17), LAMP, [s * 0.68, 0.98, 1.55]); P.add(new THREE.TorusGeometry(0.17, 0.035, 8, 14), CHROME, [s * 0.68, 0.98, 1.58]);
    }
    P.add(roundBox(0.7, 0.34, 0.07, 0.04, 1), CHROME, [0, 0.62, 1.98]);
    for (const x of [-0.2, 0, 0.2]) P.add(roundBox(0.04, 0.3, 0.08, 0.015, 1), TRIM, [x, 0.62, 1.99]);
    P.add(cap(0.09, 1.1), CHROME, [0, 0.38, 2.12], alongX);
    P.add(cap(0.09, 1.1), CHROME, [0, 0.38, -1.6], alongX);
    P.add(new THREE.TorusGeometry(0.27, 0.11, 10, 18), RUBBER, [0, 0.72, -1.38], [-0.3, 0, 0]); P.add(cyl(0.22, 0.1, 16), c.dark, [0, 0.72, -1.43], [Math.PI / 2 - 0.3, 0, 0]);
    pipe(P, 0.45, 0.5, -1.66);
    plates(P, -1.6, 0.4);
    return { seatY: 0.52, seatZ: -0.2, white: true, wheels: [[-1.0, 1.15, 0.44, 0.4], [1.0, 1.15, 0.44, 0.4], [-1.0, -0.95, 0.46, 0.44], [1.0, -0.95, 0.46, 0.44]] };
  },
  // long, thin, small front wheels, huge rear wheels, tall pipes
  dragster(P, c) {
    P.add(roundBox(0.9, 0.18, 3.7, 0.07), TRIM, [0, 0.36, 0.4]);
    P.add(cap(0.3, 2.0), c.paint, [0, 0.58, 1.5], alongZ);
    P.add(roundBox(0.12, 0.05, 2.4, 0.02, 1), c.light, [0, 0.89, 1.45]);
    P.add(roundBox(0.95, 0.5, 1.3, 0.22), c.paint, [0, 0.62, -0.25]);
    P.add(new THREE.TorusGeometry(0.52, 0.07, 10, 22), c.dark, [0, 0.88, -0.25], [Math.PI / 2, 0, 0], [1, 1.1, 1]);
    P.add(roundBox(0.95, 0.56, 0.8, 0.14), CHROME, [0, 0.8, -1.2]);
    P.add(roundBox(0.5, 0.22, 0.5, 0.1), c.light, [0, 1.18, -1.15]);
    for (const x of [-0.42, -0.15, 0.15, 0.42]) { P.add(cyl(0.06, 0.8, 8), CHROME, [x, 1.3, -1.62], [-0.38, 0, x * 0.4]); P.add(cyl(0.04, 0.82, 8), '#3a3d52', [x, 1.3, -1.625], [-0.38, 0, x * 0.4]); }
    P.add(roundBox(1.9, 0.12, 0.16, 0.05, 1), TRIM, [0, 0.62, -1.0]);
    P.add(roundBox(1.3, 0.12, 0.14, 0.05, 1), CHROME, [0, 0.32, 2.2]);
    P.add(roundBox(0.06, 0.4, 0.5, 0.02, 1), c.paint, [-0.5, 1.5, -1.62]); P.add(roundBox(0.06, 0.4, 0.5, 0.02, 1), c.paint, [0.5, 1.5, -1.62]);
    P.add(roundBox(1.3, 0.07, 0.5, 0.03, 1), c.light, [0, 1.72, -1.62]);
    for (const s of [-1, 1]) P.add(ball(0.1), LAMP, [s * 0.18, 0.64, 2.45]);
    plates(P, -1.75, 0.5);
    return { seatY: 0.5, seatZ: -0.15, wheels: [[-0.78, 2.2, 0.3, 0.26], [0.78, 2.2, 0.3, 0.26], [-1.05, -1.0, 0.66, 0.62], [1.05, -1.0, 0.66, 0.62]] };
  },
  // boxy classic with a roll bar and wide stripes
  racer(P, c) {
    P.add(roundBox(1.7, 0.22, 3.0, 0.08), TRIM, [0, 0.38, 0]);
    P.add(roundBox(1.6, 0.5, 1.2, 0.14), c.paint, [0, 0.62, 1.2]);
    P.add(roundBox(1.6, 0.5, 1.0, 0.14), c.paint, [0, 0.62, -1.1]);
    for (const s of [-1, 1]) {
      P.add(roundBox(0.2, 0.5, 1.3, 0.08), c.paint, [s * 0.7, 0.62, -0.15]);
      P.add(cyl(0.05, 0.6, 8), TRIM, [s * 0.62, 1.2, -0.95]);
      P.add(roundBox(0.28, 0.17, 0.06, 0.04, 1), LAMP, [s * 0.55, 0.72, 1.82]);
      pipe(P, s * 0.45, 0.55, -1.68);
    }
    P.add(roundBox(1.2, 0.36, 0.3, 0.1), c.dark, [0, 0.78, 0.62]);
    P.add(new THREE.TorusGeometry(0.62, 0.055, 8, 20, Math.PI), TRIM, [0, 0.9, -0.95]);
    P.add(roundBox(0.34, 0.03, 1.2, 0.012, 1), c.light, [0, 0.89, 1.2]); P.add(roundBox(0.34, 0.03, 0.9, 0.012, 1), c.light, [0, 0.89, -1.1]);
    P.add(roundBox(1.9, 0.2, 0.2, 0.08, 2), CHROME, [0, 0.44, 2.02]); P.add(roundBox(1.9, 0.2, 0.2, 0.08, 2), CHROME, [0, 0.44, -1.64]);
    plates(P, -1.75, 0.62); P.add(roundBox(0.5, 0.24, 0.05, 0.03, 1), '#FFFFFF', [0, 0.46, 2.14]);
    return { seatY: 0.6, seatZ: -0.35, wheels: [[-1.0, 1.2, 0.45, 0.45], [1.0, 1.2, 0.45, 0.45], [-1.0, -1.1, 0.47, 0.5], [1.0, -1.1, 0.47, 0.5]] };
  },
};

// kart: a KARTS entry (id), color: the racer's color. Returns { group, wheels, seatY, seatZ, flipWheels }
export function makeToyKart(kart, color) {
  const id = BUILD[kart.id] ? kart.id : 'racer';
  const base = hexOf(new THREE.Color(color));
  const c = { paint: base, light: hexOf(tint(base, 0.45)), dark: hexOf(tint(base, -0.35)) };
  const built = cached(`kart|${id}|${base}`, () => { const P = new Parts(); const info = BUILD[id](P, c); return { geo: P.merge(), info }; });
  const group = new THREE.Group();
  group.add(toyMesh(built.geo));
  const wheels = [];
  wheelPairs(group, wheels, built.info.wheels, hexOf(tint(base, -0.1)), !!built.info.white);
  return { group, wheels, seatY: built.info.seatY, seatZ: built.info.seatZ, flipWheels: false };
}
