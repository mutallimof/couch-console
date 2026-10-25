// Turbo Karts pilots: one original chibi racer (big helmet, short body, racing suit, gloves, boots) made in code, with eight
// different helmets (shape, visor, stickers, ears, fins). The suit takes the racer's color. The pilot is "rigged" with a tiny
// pose system: the body, head and two arms (a two-bone solver puts the hands on the steering wheel, up in a cheer, or down in
// defeat), blending smoothly between clips:
//   drive · idle · wave · cheer · defeat · hit      (play(name); 'HitReact' / 'Yes' / 'Wave' / 'Cheer' / 'Defeat' also work)
// Nothing is allocated while it animates.
import { Parts, roundBox, sphereBand, toyMesh, setOutlines, cached, plasticMaterial, tint, hexOf } from './karts-toykit.js';

let THREE = null;
export function setPilotThree(t) { THREE = t; }

// ---------- the eight helmets ----------
// base = the helmet's own color · visor = glass tint · skin = the face · shape of the window: wide = how far round it goes (radians)
export const HELMETS = {
  dash: { base: '#F4F7FF', visor: '#3DB5FF', skin: '#FFD3B0', wide: 0.9 },
  bruno: { base: '#D9954F', visor: '#5C3B1E', skin: '#F2B98E', wide: 0.86 },
  finn: { base: '#46A7E8', visor: '#FF9F1C', skin: '#E9B48A', wide: 0.92 },
  mimi: { base: '#F06EAA', visor: '#7C3AED', skin: '#FFD9C0', wide: 0.84 },
  hopper: { base: '#9BE5B4', visor: '#FF6FA3', skin: '#C98A5E', wide: 0.88 },
  blaze: { base: '#FF5A3C', visor: '#FFC53D', skin: '#F7C59F', wide: 0.95 },
  rex: { base: '#69D24A', visor: '#14B8A6', skin: '#9C6A45', wide: 0.9 },
  zap: { base: '#FFD21F', visor: '#E6399B', skin: '#FFCFA4', wide: 0.86 },
};

const R = 0.46; // helmet radius
const W = 1024, H = 512;

function helmetTexture(id) {
  return cached(`helmet-tex|${id}`, () => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    const d = HELMETS[id];
    x.fillStyle = d.base; x.fillRect(0, 0, W, H);
    PAINT[id](x, d);
    // a dark chin band at the bottom (the helmet's lower edge)
    const g = x.createLinearGradient(0, H * 0.82, 0, H);
    g.addColorStop(0, 'rgba(30,20,60,0)'); g.addColorStop(1, 'rgba(30,20,60,0.45)');
    x.fillStyle = g; x.fillRect(0, H * 0.82, W, H * 0.18);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4;
    return t;
  });
}

const U = (u) => u * W, V = (v) => v * H; // v here counts DOWN from the top of the helmet (0 = crown, 1 = chin)
function sticker(x, u, v, size, draw) { x.save(); x.translate(U(u), V(v)); x.scale(1, 1); draw(x, size); x.restore(); }
const star = (x, r, fill = '#FFD43B', line = '#3b2a6b') => { x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } x.closePath(); x.lineWidth = r * 0.14; x.strokeStyle = line; x.lineJoin = 'round'; x.stroke(); x.fillStyle = fill; x.fill(); };
const bolt = (x, r, fill = '#FFFFFF', line = '#2b1a55') => { x.beginPath(); [[0.2, -1], [-0.55, 0.1], [-0.05, 0.1], [-0.3, 1], [0.6, -0.2], [0.05, -0.2], [0.45, -1]].forEach(([a, b], i) => (i ? x.lineTo(a * r, b * r) : x.moveTo(a * r, b * r))); x.closePath(); x.lineWidth = r * 0.16; x.strokeStyle = line; x.lineJoin = 'round'; x.stroke(); x.fillStyle = fill; x.fill(); };
const heart = (x, r, fill = '#FF4D8D', line = '#3b1a40') => { x.beginPath(); x.moveTo(0, r * 0.9); x.bezierCurveTo(-r * 1.5, -r * 0.1, -r * 0.8, -r * 1.1, 0, -r * 0.4); x.bezierCurveTo(r * 0.8, -r * 1.1, r * 1.5, -r * 0.1, 0, r * 0.9); x.closePath(); x.lineWidth = r * 0.16; x.strokeStyle = line; x.stroke(); x.fillStyle = fill; x.fill(); };
const paw = (x, r, fill = '#7A4A1E') => { x.fillStyle = fill; x.beginPath(); x.ellipse(0, r * 0.25, r * 0.55, r * 0.45, 0, 0, 7); x.fill(); for (const [a, b] of [[-0.62, -0.35], [-0.22, -0.78], [0.22, -0.78], [0.62, -0.35]]) { x.beginPath(); x.ellipse(a * r, b * r, r * 0.2, r * 0.26, 0, 0, 7); x.fill(); } };
const flame = (x, r, inner = '#FFE066', outer = '#FF9F1C') => { for (const [k, col] of [[1, outer], [0.6, inner]]) { x.fillStyle = col; x.beginPath(); x.moveTo(0, r * k); x.bezierCurveTo(-r * 0.9 * k, r * 0.3 * k, -r * 0.5 * k, -r * 0.4 * k, -r * 0.1 * k, -r * 1.1 * k); x.bezierCurveTo(r * 0.05 * k, -r * 0.5 * k, r * 0.2 * k, -r * 0.5 * k, r * 0.35 * k, -r * 0.25 * k); x.bezierCurveTo(r * 0.9 * k, r * 0.2 * k, r * 0.7 * k, r * 0.7 * k, 0, r * k); x.fill(); } };
const SIDES = [0, 0.5], BACK = 0.75;
// the center stripe goes front to back over the crown (u = 0.25 and 0.75)
const stripe = (x, color, edge, w = 0.03, over = 0.62) => { for (const u of [0.25, 0.75]) { x.fillStyle = edge; x.fillRect(U(u - w - 0.008), 0, U(2 * (w + 0.008)), V(over)); x.fillStyle = color; x.fillRect(U(u - w), 0, U(2 * w), V(over)); } };

const PAINT = {
  dash(x) { stripe(x, '#2F80ED', '#E5384E'); for (const u of SIDES) sticker(x, u, 0.42, 62, (c, s) => star(c, s)); sticker(x, BACK, 0.46, 96, (c, s) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, s * 1.05, 0, 7); c.fill(); star(c, s * 0.9, '#FF5470'); }); },
  bruno(x) { x.fillStyle = '#F3D2A2'; x.fillRect(0, V(0.7), W, V(0.3)); for (const u of SIDES) sticker(x, u, 0.46, 52, (c, s) => paw(c, s)); sticker(x, BACK, 0.45, 80, (c, s) => paw(c, s, '#5C3512')); x.fillStyle = '#B5732F'; for (const u of [0.25, 0.75]) x.fillRect(U(u - 0.012), 0, U(0.024), V(0.3)); },
  finn(x) { const g = x.createLinearGradient(0, V(0.45), 0, V(0.75)); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,1)'); x.fillStyle = g; x.fillRect(0, V(0.45), W, V(0.55)); x.strokeStyle = '#1D5A8C'; x.lineCap = 'round'; x.lineWidth = 12; for (const u of [0.02, 0.5]) for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(U(u - 0.012 + i * 0.016), V(0.34)); x.lineTo(U(u - 0.03 + i * 0.016), V(0.52)); x.stroke(); } x.fillStyle = '#1D5A8C'; x.fillRect(U(0.74), 0, U(0.02), V(0.3)); sticker(x, BACK, 0.5, 70, (c, s) => { c.fillStyle = '#fff'; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * s * 0.34 - s * 0.17, 0); c.lineTo(i * s * 0.34, s * 0.5); c.lineTo(i * s * 0.34 + s * 0.17, 0); c.fill(); } }); },
  mimi(x) { x.fillStyle = '#C23B83'; for (const [u, v] of [[0.75, 0.08], [0.75, 0.2], [0.75, 0.32], [0.25, 0.07], [0.5, 0.15], [0, 0.15]]) x.fillRect(U(u - 0.07), V(v), U(0.14), 14); x.strokeStyle = '#7B1E55'; x.lineWidth = 7; x.lineCap = 'round'; for (const [u, dir] of [[0.085, -1], [0.415, 1]]) for (const dy of [-0.05, 0, 0.05]) { x.beginPath(); x.moveTo(U(u), V(0.5 + dy * 0.4)); x.lineTo(U(u + dir * 0.07), V(0.5 + dy)); x.stroke(); } sticker(x, BACK, 0.48, 70, (c, s) => heart(c, s, '#FFE3F0', '#7B1E55')); },
  hopper(x) { x.fillStyle = '#fff'; x.fillRect(0, V(0.7), W, V(0.3)); for (const u of SIDES) sticker(x, u, 0.42, 48, (c, s) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, s * 1.15, 0, 7); c.fill(); heart(c, s * 0.8); }); sticker(x, BACK, 0.46, 82, (c, s) => { c.fillStyle = '#4DB848'; for (const a of [-0.5, 0, 0.5]) { c.save(); c.rotate(a); c.beginPath(); c.ellipse(0, -s * 1.15, s * 0.16, s * 0.4, 0, 0, 7); c.fill(); c.restore(); } c.fillStyle = '#FF8A1F'; c.beginPath(); c.moveTo(-s * 0.4, -s * 0.8); c.lineTo(s * 0.4, -s * 0.8); c.lineTo(0, s * 1.1); c.closePath(); c.fill(); c.strokeStyle = '#B85A00'; c.lineWidth = 5; for (const k of [-0.2, 0.15]) { c.beginPath(); c.moveTo(-s * 0.3, k * s); c.lineTo(s * 0.3, k * s); c.stroke(); } }); },
  blaze(x) { stripe(x, '#FFFFFF', '#1B2A6B', 0.035); for (const u of [0.02, 0.5, 0.75]) for (const o of (u === 0.75 ? [-0.06, 0.06] : [-0.025, 0.025])) sticker(x, u + o, 0.7, u === 0.75 ? 70 : 62, (c, s) => flame(c, s)); for (const u of SIDES) sticker(x, u, 0.32, 40, (c, s) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, s, 0, 7); c.fill(); c.fillStyle = '#1B2A6B'; c.font = `900 ${s * 1.3}px Fredoka, Nunito, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('1', 0, s * 0.08); }); },
  rex(x) { x.fillStyle = '#3FA32D'; let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; for (let i = 0; i < 30; i++) { x.beginPath(); x.ellipse(rnd() * W, V(0.05 + rnd() * 0.6), 18 + rnd() * 16, 12 + rnd() * 8, 0, 0, 7); x.fill(); } x.fillStyle = '#FFC24A'; x.fillRect(0, V(0.72), W, V(0.28)); x.fillStyle = '#fff'; for (let i = 0; i < 24; i++) { x.beginPath(); x.moveTo(U(i / 24), V(0.72)); x.lineTo(U((i + 0.5) / 24), V(0.8)); x.lineTo(U((i + 1) / 24), V(0.72)); x.fill(); } for (const u of SIDES) sticker(x, u, 0.4, 56, (c, s) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, s, 0, 7); c.fill(); c.fillStyle = '#E5384E'; c.font = `900 ${s * 1.2}px Fredoka, Nunito, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('R', 0, s * 0.08); }); },
  zap(x) { x.fillStyle = '#1F1B3A'; x.fillRect(U(0.24), 0, U(0.02), V(0.6)); x.fillRect(U(0.74), 0, U(0.02), V(0.6)); x.save(); x.beginPath(); x.rect(0, V(0.76), W, V(0.24)); x.clip(); x.fillStyle = '#1F1B3A'; for (let i = -4; i < 40; i++) { x.beginPath(); x.moveTo(i * 36, V(1)); x.lineTo(i * 36 + 18, V(1)); x.lineTo(i * 36 + 54, V(0.76)); x.lineTo(i * 36 + 36, V(0.76)); x.fill(); } x.restore(); for (const u of SIDES) sticker(x, u, 0.4, 62, (c, s) => bolt(c, s, '#FFFFFF', '#1F1B3A')); sticker(x, BACK, 0.46, 96, (c, s) => { c.fillStyle = '#E6399B'; c.beginPath(); c.arc(0, 0, s * 1.1, 0, 7); c.fill(); bolt(c, s * 0.95, '#FFE94A', '#1F1B3A'); }); },
};

// ---------- helmet geometry ----------

const helmetMats = new Map();
function helmetMaterial(id) {
  if (!helmetMats.has(id)) helmetMats.set(id, new THREE.MeshPhysicalMaterial({ map: helmetTexture(id), roughness: 0.3, clearcoat: 0.65, clearcoatRoughness: 0.25, envMapIntensity: 0.9 }));
  return helmetMats.get(id);
}

// The shell has a window at the front: dome above, a ring below/behind, and the chin piece; the visor glass closes the window
function helmetShell(id) {
  return cached(`shell|${id}`, () => {
    const wide = HELMETS[id].wide, a0 = Math.PI / 2 - wide, a1 = Math.PI / 2 + wide, t0 = 0.98, t1 = 1.9;
    const p = new Parts();
    const white = '#ffffff';
    p.add(sphereBand(R, 24, 9, 0, Math.PI * 2, 0, t0), white);
    p.add(sphereBand(R, 24, 9, a1, Math.PI * 2 - 2 * wide, t0, Math.PI - t0), white);
    p.add(sphereBand(R, 12, 6, a0, 2 * wide, t1, Math.PI - t1), white);
    return p.merge();
  });
}
function visorGlass(id) {
  return cached(`glass|${id}`, () => {
    const wide = HELMETS[id].wide;
    return sphereBand(R + 0.016, 24, 8, Math.PI / 2 - wide - 0.07, 2 * wide + 0.14, 0.93, 1.02);
  });
}

const nrm = (v) => { const l = Math.hypot(...v); return v.map((a) => a / l); };
// a point on the helmet at (angle from the front around y, angle from the top), and the direction pointing out of it (for ears, plates)
const onHelmet = (az, th, out = 0) => { const s = Math.sin(th), p = [-Math.cos(az) * s, Math.cos(th), Math.sin(az) * s]; return { p: p.map((a) => a * (R + out)), n: nrm(p) }; };
const lookDown = (n) => { // Euler (x, z) that points a +y shape along n
  const rz = -Math.atan2(n[0], n[1]), rx = Math.atan2(n[2], Math.hypot(n[0], n[1]));
  return [rx, 0, rz];
};

// Extras: static pieces (one merged mesh) and flopping ears (own meshes)
function accessories(id) {
  return cached(`acc|${id}`, () => {
    const p = new Parts(), ears = [];
    const sph = (r, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);
    const cone = (r, h, seg = 12) => new THREE.ConeGeometry(r, h, seg);
    const neck = '#2b2d4a';
    p.add(new THREE.TorusGeometry(0.2, 0.05, 8, 20), neck, [0, -R + 0.04, 0], [Math.PI / 2, 0, 0]); // the collar ring at the bottom
    if (id === 'dash') {
      p.add(sph(0.06), '#FFD43B', [0, R + 0.04, 0]); p.add(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 6), '#2b2d4a', [0, R, 0]);
      for (const s of [-1, 1]) p.add(sph(0.11, 12, 8), '#2F80ED', [s * (R - 0.02), -0.02, -0.02], [0, 0, 0], [0.55, 1, 0.9]);
    } else if (id === 'bruno') {
      for (const s of [-1, 1]) { const o = onHelmet(Math.PI / 2 + s * 1.15, 0.75); p.add(sph(0.17), '#C27A38', o.p.map((a, i) => a + (i === 1 ? 0.03 : 0)), [0, 0, 0], [1, 1, 0.8]); p.add(sph(0.1), '#F3D2A2', o.p.map((a, i) => a * 1.03 + [0, 0.03, 0.06][i]), [0, 0, 0], [1, 1, 0.5]); }
      p.add(sph(0.15, 14, 10), '#F3D2A2', [0, -0.31, 0.35], [0, 0, 0], [1.15, 0.8, 0.75]); p.add(sph(0.065, 10, 8), '#3b2a22', [0, -0.26, 0.46], [0, 0, 0], [1.3, 0.9, 0.8]);
    } else if (id === 'finn') {
      const fin = new THREE.Shape(); fin.moveTo(0.34, 0); fin.bezierCurveTo(0.15, 0.1, 0.1, 0.4, -0.02, 0.66); fin.bezierCurveTo(-0.1, 0.4, -0.28, 0.12, -0.36, -0.02); fin.closePath();
      const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.07, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 2, curveSegments: 10 }); fg.translate(0, 0, -0.035);
      p.add(fg, '#2F7FC4', [0, R - 0.12, -0.02], [0, -Math.PI / 2, 0], [0.75, 0.55, 1]);
      for (const s of [-1, 1]) { const f2 = new THREE.Shape(); f2.moveTo(0, 0); f2.quadraticCurveTo(0.18, 0.02, 0.2, 0.2); f2.quadraticCurveTo(0.08, 0.1, 0, 0.12); f2.closePath(); const g2 = new THREE.ExtrudeGeometry(f2, { depth: 0.05, bevelEnabled: false }); p.add(g2, '#2F7FC4', [s * (R - 0.01), -0.12, 0], [0, s * Math.PI / 2 - (s > 0 ? 0 : 0), -s * 0.5], 1); }
    } else if (id === 'mimi') {
      for (const s of [-1, 1]) { const o = onHelmet(Math.PI / 2 + s * 0.95, 0.72), r = lookDown(o.n); p.add(cone(0.16, 0.34, 4), '#E0508F', o.p.map((a) => a * 0.98), [r[0], Math.PI / 4, r[2]]); p.add(cone(0.1, 0.22, 4), '#FFC2DD', o.p.map((a, i) => a * 0.98 + o.n[i] * 0.02 + (i === 2 ? 0.03 : 0)), [r[0], Math.PI / 4, r[2]]); }
    } else if (id === 'hopper') {
      ears.push({ x: -0.16 }, { x: 0.16 }); // the ears are separate (they flop), see makeEars
    } else if (id === 'blaze') {
      p.add(cone(0.2, 0.52, 20), '#FFFFFF', [0, R + 0.22, 0]); p.add(cone(0.1, 0.22, 16), '#E5384E', [0, R + 0.5, 0]); p.add(new THREE.CylinderGeometry(0.205, 0.205, 0.05, 20), '#E5384E', [0, R + 0.01, 0]);
      for (const s of [-1, 1]) { const f = new THREE.Shape(); f.moveTo(0, 0); f.lineTo(0.3, -0.05); f.lineTo(0.0, 0.34); f.closePath(); const g = new THREE.ExtrudeGeometry(f, { depth: 0.05, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 }); p.add(g, '#FFFFFF', [s * 0.3, 0.06, -0.3], [0, s * 0.9 + (s > 0 ? Math.PI / 2 : -Math.PI / 2) * 0, 0], 1); }
    } else if (id === 'rex') {
      // the plates run over the crown from just above the visor to the back, and a small tail sticks out behind
      [0.95, 1.3, 1.65, 2.0, 2.35].forEach((ang, i) => {
        const h = [0.24, 0.3, 0.32, 0.28, 0.2][i], py = Math.sin(ang) * R, pz = Math.cos(ang) * R;
        p.add(cone(0.15, h, 4), i % 2 ? '#FF8A1F' : '#FFB02E', [0, py + Math.sin(ang) * h * 0.35, pz + Math.cos(ang) * h * 0.35], [Math.PI / 2 - ang, Math.PI / 4, 0], [1, 1, 0.55]);
      });
      p.add(cone(0.13, 0.42, 10), '#4FB838', [0, -0.12, -R - 0.12], [-Math.PI / 2 - 0.5, 0, 0]);
      for (const s of [-1, 1]) { p.add(sph(0.065, 10, 8), '#4FB838', [s * 0.2, 0.34, 0.26]); p.add(sph(0.034, 8, 6), '#FFFFFF', [s * 0.2, 0.36, 0.31]); p.add(sph(0.018, 6, 5), '#1F1B3A', [s * 0.2, 0.36, 0.335]); }
    } else if (id === 'zap') {
      [0.8, 1.05, 1.3, 1.55, 1.8, 2.05, 2.3].forEach((a, i) => {
        const ang = a, py = Math.sin(ang) * (R + 0.01), pz = Math.cos(ang) * (R + 0.01), h = [0.2, 0.26, 0.3, 0.3, 0.28, 0.24, 0.18][i];
        p.add(roundBox(0.07, h, 0.12, 0.03, 1), i % 2 ? '#FF3D81' : '#2b2d42', [0, py + Math.sin(ang) * h * 0.4, pz + Math.cos(ang) * h * 0.4], [Math.PI / 2 - ang, 0, 0]);
      });
      for (const s of [-1, 1]) p.add(sph(0.1, 12, 8), '#2b2d42', [s * (R - 0.02), -0.02, -0.02], [0, 0, 0], [0.55, 1, 0.9]);
    }
    return { geometry: p.list.length ? p.merge() : null, ears };
  });
}

function earGeometry(id) {
  return cached(`ear|${id}`, () => {
    const p = new Parts();
    p.add(new THREE.CapsuleGeometry(0.095, 0.42, 3, 8), '#F2F7F4', [0, 0.3, 0], [0, 0, 0], [1, 1, 0.6]);
    p.add(new THREE.CapsuleGeometry(0.055, 0.34, 4, 8), '#FF9CC2', [0, 0.3, 0.03], [0, 0, 0], [1, 1, 0.5]);
    return p.merge();
  });
}

// ---------- the body ----------

const BELT = '#2b2d4a', GLOVE = '#FFFFFF', BOOT = '#2b2d4a';
const SH = { x: 0.31, y: 0.46 };  // shoulder, in the torso's own space
const L1 = 0.3, L2 = 0.3;         // arm bone lengths
const TORSO_Y = 0.1;              // where the torso turns (on the hips)

function bodyGeometry(suit, helmetId, standing) {
  return cached(`body|${suit}|${helmetId}|${standing}`, () => {
    const light = hexOf(tint(suit, 0.45)), dark = hexOf(tint(suit, -0.3)), accent = HELMETS[helmetId].base;
    // torso (turns on the hips)
    const t = new Parts();
    t.add(new THREE.SphereGeometry(0.3, 16, 11), suit, [0, 0.3, 0], [0, 0, 0], [1, 1.12, 0.88]);
    t.add(new THREE.TorusGeometry(0.265, 0.035, 6, 18), BELT, [0, 0.12, 0], [Math.PI / 2, 0, 0], [1, 0.88, 1]);
    t.add(roundBox(0.1, 0.07, 0.04, 0.02, 1), '#FFD43B', [0, 0.12, 0.25]);
    t.add(roundBox(0.03, 0.34, 0.03, 0.012, 1), light, [0, 0.36, 0.26]);
    t.add(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 14), accent, [0.14, 0.42, 0.235], [Math.PI / 2 - 0.3, 0, 0.35]);
    t.add(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 16), accent, [0, 0.34, -0.25], [Math.PI / 2 + 0.1, 0, 0]);
    t.add(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 14), '#FFFFFF', [0, 0.34, -0.268], [Math.PI / 2 + 0.1, 0, 0]);
    t.add(new THREE.TorusGeometry(0.15, 0.055, 6, 14), dark, [0, 0.57, 0], [Math.PI / 2, 0, 0]);
    for (const s of [-1, 1]) t.add(new THREE.SphereGeometry(0.12, 10, 8), suit, [s * SH.x, SH.y, 0]);
    // hips + legs (do not move; seated: knees forward, or standing)
    const h = new Parts();
    h.add(new THREE.SphereGeometry(0.3, 14, 9), dark, [0, 0.02, 0], [0, 0, 0], [1, 0.62, 0.9]);
    for (const s of [-1, 1]) {
      if (standing) {
        h.add(new THREE.CapsuleGeometry(0.1, 0.22, 2, 6), suit, [s * 0.15, -0.2, 0.0]);
        h.add(new THREE.CapsuleGeometry(0.092, 0.2, 2, 6), dark, [s * 0.15, -0.46, 0.0]);
        h.add(roundBox(0.19, 0.12, 0.34, 0.05, 2), BOOT, [s * 0.15, -0.64, 0.06]);
      } else {
        h.add(new THREE.CapsuleGeometry(0.1, 0.34, 2, 6), suit, [s * 0.15, 0.1, 0.3], [Math.PI / 2 - 0.1, 0, 0]);
        h.add(new THREE.CapsuleGeometry(0.092, 0.2, 2, 6), dark, [s * 0.15, -0.0, 0.58], [0.2, 0, 0]);
        h.add(roundBox(0.19, 0.12, 0.34, 0.05, 2), BOOT, [s * 0.15, -0.14, 0.68]);
      }
    }
    // arms: the upper arm hangs down from the shoulder, the forearm from the elbow (each with the sleeve in the suit color)
    const up = new Parts();
    up.add(new THREE.CapsuleGeometry(0.085, 0.13, 3, 8), suit, [0, -0.15, 0]);
    const fo = new Parts();
    fo.add(new THREE.CapsuleGeometry(0.078, 0.12, 3, 8), suit, [0, -0.15, 0]);
    fo.add(new THREE.TorusGeometry(0.082, 0.025, 6, 14), light, [0, -0.225, 0], [Math.PI / 2, 0, 0]);
    fo.add(new THREE.SphereGeometry(0.105, 12, 8), GLOVE, [0, -0.32, 0]);
    fo.add(new THREE.SphereGeometry(0.045, 8, 6), GLOVE, [0.0, -0.37, 0.07]);
    // the elbow joint (a small ball so the bend looks round)
    up.add(new THREE.SphereGeometry(0.085, 8, 6), suit, [0, -0.3, 0]);
    return { torso: t.merge(), hips: h.merge(), upper: up.merge(), fore: fo.merge() };
  });
}

function faceGeometry(id) {
  return cached(`face|${id}`, () => {
    const d = HELMETS[id], skin = d.skin;
    const face = new Parts().add(new THREE.SphereGeometry(0.33, 16, 12), skin, [0, -0.03, 0.04]);
    face.add(new THREE.SphereGeometry(0.06, 8, 6), tint(skin, -0.12), [0, -0.0, 0.36], [0, 0, 0], [0.8, 1, 0.6]); // a little nose
    face.add(new THREE.SphereGeometry(0.06, 8, 6), '#FF9FB0', [-0.21, -0.08, 0.27], [0, 0, 0], [1, 0.7, 0.4]);
    face.add(new THREE.SphereGeometry(0.06, 8, 6), '#FF9FB0', [0.21, -0.08, 0.27], [0, 0, 0], [1, 0.7, 0.4]);
    const eyes = new Parts();
    for (const s of [-1, 1]) {
      eyes.add(new THREE.SphereGeometry(0.075, 12, 10), '#FFFFFF', [s * 0.13, 0, 0], [0, 0, 0], [0.85, 1.12, 0.55]);
      eyes.add(new THREE.SphereGeometry(0.052, 10, 8), '#23213f', [s * 0.13, -0.004, 0.026], [0, 0, 0], [0.85, 1.12, 0.5]);
      eyes.add(new THREE.SphereGeometry(0.018, 6, 5), '#FFFFFF', [s * 0.13 + 0.014, 0.025, 0.05]);
    }
    const smile = new Parts().add(new THREE.TorusGeometry(0.075, 0.015, 6, 14, Math.PI), '#7a2a3a');
    const open = new Parts().add(new THREE.SphereGeometry(0.07, 12, 8), '#6b1f33', [0, 0, 0], [0, 0, 0], [1, 0.9, 0.4]).add(new THREE.SphereGeometry(0.04, 8, 6), '#FF7A93', [0, -0.03, 0.01], [0, 0, 0], [1, 0.6, 0.4]);
    return { face: face.merge(), eyes: eyes.merge(), smile: smile.merge(), open: open.merge() };
  });
}

function wheelGeometry() {
  return cached('wheel', () => {
    const p = new Parts();
    p.add(new THREE.TorusGeometry(0.2, 0.034, 8, 22), '#2b2d4a');
    p.add(new THREE.TorusGeometry(0.2, 0.036, 8, 8, 0.7), '#FFD43B', [0, 0, 0], [0, 0, Math.PI / 2 - 0.35]); // the top marker
    p.add(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), '#FF5470', [0, 0, 0], [Math.PI / 2, 0, 0]);
    for (const a of [Math.PI / 2 + Math.PI / 2, Math.PI / 2 - 1.1, Math.PI / 2 + 1.1]) p.add(roundBox(0.045, 0.2, 0.03, 0.012, 1), '#2b2d4a', [Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0], [0, 0, a - Math.PI / 2]);
    return p.merge();
  });
}

// ---------- the pose system ----------

const V3 = () => new THREE.Vector3(), Q4 = () => new THREE.Quaternion();
const DOWN = () => new THREE.Vector3(0, -1, 0);
const ALIAS = { HitReact: 'hit', Hit: 'hit', Yes: 'cheer', Cheer: 'cheer', Wave: 'wave', Defeat: 'defeat', Idle: 'idle', Sit: 'drive', Drive: 'drive' };

// character: { id, name... } (the helmet), suit: the suit color, opts.standing: on its own feet (podium, portraits) instead of seated
export function makePilot(character, suit, { standing = false, wheel = !standing } = {}) {
  const id = HELMETS[character.id] ? character.id : 'dash';
  const g = bodyGeometry(hexOf(new THREE.Color(suit)), id, standing);
  const root = new THREE.Group();             // the pilot (origin = the seat, or the ground when standing)
  const rig = new THREE.Group();              // everything that bobs
  rig.position.y = standing ? 0.7 : 0;
  root.add(rig);
  rig.add(toyMesh(g.hips));
  const torso = new THREE.Group(); torso.position.set(0, TORSO_Y, 0); rig.add(torso);
  torso.add(toyMesh(g.torso));
  // head
  const head = new THREE.Group(); head.position.set(0, 0.6, 0); torso.add(head);
  const helm = new THREE.Group(); helm.position.set(0, 0.4, 0); head.add(helm);
  helm.add(toyMesh(helmetShell(id), { material: helmetMaterial(id) }));
  const glass = new THREE.Mesh(visorGlass(id), new THREE.MeshPhysicalMaterial({ color: HELMETS[id].visor, transparent: true, opacity: 0.2, roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false, envMapIntensity: 1.4 }));
  glass.renderOrder = 2;
  const fg = faceGeometry(id), faceMesh = toyMesh(fg.face, { outline: false, cast: false });
  helm.add(faceMesh);
  const eyes = toyMesh(fg.eyes, { outline: false, cast: false }); eyes.position.set(0, 0.06, 0.345); helm.add(eyes);
  const smile = toyMesh(fg.smile, { outline: false, cast: false }); smile.position.set(0, -0.1, 0.355); smile.rotation.z = Math.PI; helm.add(smile);
  const open = toyMesh(fg.open, { outline: false, cast: false }); open.position.set(0, -0.11, 0.35); open.visible = false; helm.add(open);
  helm.add(glass);
  const acc = accessories(id);
  if (acc.geometry) helm.add(toyMesh(acc.geometry));
  const ears = acc.ears.map((e) => { const pv = new THREE.Group(); pv.position.set(e.x, R - 0.06, -0.06); pv.add(toyMesh(earGeometry(id))); helm.add(pv); return { pv, side: Math.sign(e.x) }; });
  // arms
  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group(); pivot.position.set(side * SH.x, SH.y, 0); torso.add(pivot);
    pivot.add(toyMesh(g.upper));
    const fore = new THREE.Group(); fore.position.set(0, -L1, 0); pivot.add(fore);
    fore.add(toyMesh(g.fore));
    return { side, pivot, fore, pole: new THREE.Vector3(side * 0.7, -0.7, -0.35).normalize(), shoulder: new THREE.Vector3(side * SH.x, SH.y, 0) };
  });
  // steering wheel (the pilot brings it)
  const wheelPos = new THREE.Vector3(0, 0.45, 0.5), wheelTilt = Q4().setFromEuler(new THREE.Euler(0.8, 0, 0));
  const wheelGroup = new THREE.Group(); wheelGroup.position.copy(wheelPos); wheelGroup.quaternion.copy(wheelTilt);
  const wheelSpin = new THREE.Group(); wheelGroup.add(wheelSpin);
  wheelSpin.add(toyMesh(wheelGeometry(), { outline: false }));
  if (wheel) rig.add(wheelGroup);

  // ----- state (all preallocated) -----
  const S = {
    clip: standing ? 'idle' : 'drive', clipT: 0, t: Math.random() * 10, hit: 0, steerIn: 0, speedIn: 0, steer: 0, speed: 0, blink: 1.5 + Math.random() * 2, blinkT: 0,
    hand: [V3(), V3()], handT: [V3(), V3()],
    torsoR: V3(), torsoT: V3(), headR: V3(), headT: V3(), body: 0, bodyT: 0, wave: 0, mouth: 0, eyeOpen: 1, eyeT: 1,
  };
  const tmp = { a: V3(), b: V3(), d: V3(), e: V3(), f: V3(), pole: V3(), qU: Q4(), qT: Q4(), eul: new THREE.Euler(), down: DOWN(), grip: V3(), tIn: Q4() };
  // initial hand positions = on the wheel / hanging
  const setGrip = (out, side, angle) => { // a point on the wheel's rim, on the left (-1) or right (+1) of the driver
    const a = Math.PI / 2 - side * 1.05 + angle;
    out.set(Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0).applyQuaternion(wheelTilt).add(wheelPos);
    return out;
  };
  setGrip(S.hand[0], -1, 0); setGrip(S.hand[1], 1, 0); S.handT[0].copy(S.hand[0]); S.handT[1].copy(S.hand[1]);

  // two-bone arm: put the hand at `target` (pilot space)
  function solve(arm, target) {
    const torsoOrigin = tmp.a.set(0, TORSO_Y, 0);
    tmp.b.copy(target).sub(torsoOrigin).applyQuaternion(tmp.tIn); // target in the torso's own space
    tmp.d.copy(tmp.b).sub(arm.shoulder);
    let len = tmp.d.length();
    const maxLen = (L1 + L2) * 0.995;
    if (len < 0.06) { tmp.d.set(0, -1, 0); len = 0.06; } else tmp.d.multiplyScalar(1 / len);
    const reach = Math.min(len, maxLen);
    const a = (L1 * L1 - L2 * L2 + reach * reach) / (2 * reach), hgt = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    tmp.pole.copy(arm.pole).addScaledVector(tmp.d, -arm.pole.dot(tmp.d)).normalize();
    tmp.e.copy(tmp.d).multiplyScalar(a).addScaledVector(tmp.pole, hgt);           // the elbow, relative to the shoulder
    tmp.qU.setFromUnitVectors(tmp.down, tmp.f.copy(tmp.e).normalize());
    arm.pivot.quaternion.copy(tmp.qU);
    tmp.f.copy(tmp.d).multiplyScalar(reach).sub(tmp.e).normalize().applyQuaternion(tmp.qT.copy(tmp.qU).invert()); // the forearm, in the upper arm's space
    arm.fore.quaternion.setFromUnitVectors(tmp.down, tmp.f);
  }

  // ----- the clips: each one sets the TARGETS; the pose then eases towards them -----
  function targets(dt) {
    const t = S.t, st = S.steer, sp = Math.min(1, S.speed / 40), clip = S.hit > 0 ? 'hit' : S.clip;
    S.bodyT = 0; S.torsoT.set(0, 0, 0); S.headT.set(0, 0, 0); S.eyeT = 1; S.mouth = 0;
    const hang = standing ? 0.16 : 0;
    const driveHands = () => { const ang = st * 1.6; setGrip(S.handT[0], -1, ang); setGrip(S.handT[1], 1, ang); };
    const rest = (side, i) => S.handT[i].set(side * 0.4, 0.2 - hang, 0.1);
    switch (clip) {
      case 'drive':
        driveHands();
        S.torsoT.set(-0.05 * sp, -st * 0.1, st * 0.18);
        S.headT.set(-sp * 0.07 + Math.sin(t * 9) * 0.01 * sp, -st * 0.4, -st * 0.06);
        S.bodyT = Math.sin(t * (7 + S.speed * 0.15)) * 0.012 * sp;
        break;
      case 'idle':
        if (standing) { rest(-1, 0); rest(1, 1); } else driveHands();
        S.torsoT.set(Math.sin(t * 1.7) * 0.02, Math.sin(t * 0.5) * 0.08, 0);
        S.headT.set(Math.sin(t * 0.9) * 0.05, Math.sin(t * 0.6) * 0.32, Math.sin(t * 0.7) * 0.04);
        S.bodyT = Math.sin(t * 2.4) * 0.012;
        break;
      case 'wave':
        if (standing) rest(-1, 0); else setGrip(S.handT[0], -1, 0);
        S.handT[1].set(0.8 + Math.sin(t * 10) * 0.1, 1.2, 0.1);
        S.torsoT.set(0, -0.1, -0.1); S.headT.set(-0.08, 0.25, -0.18);
        S.bodyT = Math.abs(Math.sin(t * 5)) * 0.03; S.mouth = 1;
        break;
      case 'cheer':
        S.handT[0].set(-0.5 + Math.sin(t * 7) * 0.05, 1.5, 0.05); S.handT[1].set(0.5 - Math.sin(t * 7) * 0.05, 1.5, 0.05);
        S.torsoT.set(-0.1, Math.sin(t * 3.5) * 0.18, Math.sin(t * 7) * 0.05); S.headT.set(-0.28, Math.sin(t * 3.5) * 0.2, 0);
        S.bodyT = Math.abs(Math.sin(t * 7)) * 0.1; S.mouth = 2;
        break;
      case 'defeat':
        if (standing) { S.handT[0].set(-0.34, 0.0, 0.2); S.handT[1].set(0.34, 0.0, 0.2); } else { S.handT[0].set(-0.3, 0.25, 0.42); S.handT[1].set(0.3, 0.25, 0.42); }
        S.torsoT.set(0.38, 0, 0.04); S.headT.set(0.6, Math.sin(t * 0.7) * 0.1, 0); S.eyeT = 0.45; S.mouth = 3;
        S.bodyT = -0.06 + Math.sin(t * 1.3) * 0.008;
        break;
      case 'hit': {
        const k = S.hit / 0.55;
        driveHands();
        if (standing) { rest(-1, 0); rest(1, 1); }
        S.torsoT.set(-0.22 * k, 0, Math.sin(t * 45) * 0.12 * k); S.headT.set(-0.2 * k, Math.sin(t * 52) * 0.35 * k, Math.sin(t * 38) * 0.25 * k); S.eyeT = 1.25; S.mouth = 2;
        break;
      }
      default: break;
    }
    void dt;
  }

  function update(dt) {
    if (!(dt > 0)) return;
    S.t += dt;
    if (S.hit > 0) S.hit = Math.max(0, S.hit - dt);
    S.steer += (S.steerIn - S.steer) * (1 - Math.exp(-dt * 14));
    S.speed += (S.speedIn - S.speed) * (1 - Math.exp(-dt * 6));
    targets(dt);
    const kb = 1 - Math.exp(-dt * 11), kh = 1 - Math.exp(-dt * 16);
    S.torsoR.lerp(S.torsoT, kb); S.headR.lerp(S.headT, kb); S.body += (S.bodyT - S.body) * kb;
    for (let i = 0; i < 2; i++) S.hand[i].lerp(S.handT[i], kh);
    rig.position.y = (standing ? 0.7 : 0) + S.body;
    torso.rotation.set(S.torsoR.x, S.torsoR.y, S.torsoR.z);
    head.rotation.set(S.headR.x, S.headR.y, S.headR.z);
    tmp.tIn.setFromEuler(tmp.eul.set(S.torsoR.x, S.torsoR.y, S.torsoR.z)).invert();
    solve(arms[0], S.hand[0]); solve(arms[1], S.hand[1]);
    wheelSpin.rotation.z = S.steer * 1.6;
    // face: blinks, the mouth, wide eyes when surprised
    S.blink -= dt;
    if (S.blink <= 0) { S.blinkT = 0.13; S.blink = 2 + Math.random() * 3; }
    S.blinkT = Math.max(0, S.blinkT - dt);
    S.eyeOpen += (S.eyeT - S.eyeOpen) * (1 - Math.exp(-dt * 20));
    eyes.scale.y = Math.max(0.08, S.eyeOpen * (S.blinkT > 0 ? 0.1 : 1));
    smile.visible = S.mouth !== 2; smile.rotation.z = S.mouth === 3 ? 0 : Math.PI; smile.position.y = S.mouth === 3 ? -0.14 : -0.1;
    open.visible = S.mouth === 2;
    // floppy ears trail behind when you go fast, and bounce when you cheer
    for (const e of ears) {
      const flop = S.speed * 0.012 + Math.abs(Math.sin(S.t * 7)) * (S.clip === 'cheer' ? 0.25 : 0.03);
      e.pv.rotation.set(-0.15 - flop - S.headR.x * 0.4, 0, e.side * (0.22 + Math.sin(S.t * 6 + e.side) * 0.04 + S.steer * 0.1));
    }
  }

  const anim = {
    unit: 1,
    mixer: { update },
    // the steering input for this frame (call after mixer.update, like before)
    lean(steer = 0, speed = 0) { S.steerIn = steer; S.speedIn = speed; },
    play(name) {
      const n = ALIAS[name] || name;
      if (n === 'hit') { S.hit = 0.55; return; }
      if (['drive', 'idle', 'wave', 'cheer', 'defeat'].includes(n)) { S.clip = n; S.clipT = 0; }
    },
    get clip() { return S.clip; },
  };
  update(0.0001);
  for (let i = 0; i < 20; i++) update(1 / 30); // settle into the first pose
  return { object: root, anim, setDetail: (low) => setOutlines(root, !low), headTop: (standing ? 0.7 : 0) + 1.56 };
}

export { plasticMaterial };
