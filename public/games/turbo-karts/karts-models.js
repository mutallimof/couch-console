// Turbo Karts models: the helmeted pilots (karts-pilot.js) and toy karts (karts-toykart.js), all made in code, plus the
// track objects, scenery and the small face pictures for menus.

import { addRimTo } from './karts-style.js';
import { itemMesh } from './karts-items.js';
import { setToyThree, setOutlines } from './karts-toykit.js';
import { setPilotThree, makePilot } from './karts-pilot.js';
import { setToyKartThree, makeToyKart } from './karts-toykart.js';

let THREE;
export function setThree(t) { THREE = t; setToyThree(t); setPilotThree(t); setToyKartThree(t); }

const std = (color, rough = 0.55, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

// A pilot on their own feet (podium, portraits): the racer's helmet in the given suit color (default: the pilot's own).
// Returns { object, anim }. 'assets' is unused now (no model files), kept so callers do not change.
export function makeStandingCharacter(character, assets, suit = null) {
  const p = makePilot(character, suit || character.accent || character.color, { standing: true });
  p.object.scale.setScalar(0.85); p.anim.unit = 0.85; // (the podium squashes the group's y; it keeps the pilot's own scale through `unit`)
  return { object: p.object, anim: p.anim };
}

// Toy kart + helmeted pilot + effects, ready to drive. The suit is the racer's color. `assets` is unused (all made in code).
export function makeRacer(character, kart, color, assets) {
  const k = makeToyKart(kart, color);
  const pilot = makePilot(character, color);
  const driver = pilot.object, anim = pilot.anim;
  driver.position.set(0, k.seatY, k.seatZ);
  k.group.add(driver);
  // drift sparks, boost flame, shield bubble, blob shadow
  const sparkMat = new THREE.MeshBasicMaterial({ color: '#56CCF2' });
  const sparks = [-0.9, 0.9].map((x) => { const sp = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), sparkMat); sp.position.set(x, 0.2, -1.5); k.group.add(sp); return sp; });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.05, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color('#FF922B').multiplyScalar(5), transparent: true, opacity: 0.9 }));
  flame.rotation.x = -Math.PI / 2; flame.position.set(0, 0.75, -2.3); k.group.add(flame);
  const shield = new THREE.Mesh(new THREE.SphereGeometry(2.1, 24, 16), new THREE.MeshStandardMaterial({ color: '#94D82D', transparent: true, opacity: 0.25, emissive: '#94D82D', emissiveIntensity: 0.4 }));
  shield.position.y = 0.9; k.group.add(shield);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.6, 20), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.28, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.scale.set(0.8, 1.2, 1);
  addRimTo(THREE, k.group); // (the cartoon look's rim light; does nothing until switched on)
  const root = new THREE.Group();
  root.add(k.group);
  // Glider: a wing that unfolds above the kart off glide ramps (scaled open by turbo-karts.js)
  const glider = new THREE.Group();
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 1.1); wingShape.lineTo(1.9, -0.55); wingShape.quadraticCurveTo(0, -0.15, -1.9, -0.55); wingShape.closePath();
  const wing = new THREE.Mesh(new THREE.ShapeGeometry(wingShape), new THREE.MeshStandardMaterial({ color, roughness: 0.5, side: THREE.DoubleSide }));
  wing.rotation.x = -Math.PI / 2 + 0.12; wing.castShadow = true;
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.6), new THREE.MeshStandardMaterial({ color: '#2B3445' }));
  spine.position.set(0, 0.02, 0.2);
  glider.add(wing, spine);
  for (const s of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), spine.material);
    strut.position.set(s * 0.45, -0.65, 0); strut.rotation.z = s * 0.35;
    glider.add(strut);
  }
  glider.position.set(0, 2.6, -0.2); glider.visible = false;
  k.group.add(glider);
  // A floating marker in the player's color (set visible for human players)
  const marker = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.6, 4), new THREE.MeshBasicMaterial({ color }));
  marker.rotation.x = Math.PI; marker.position.y = 3.1; marker.visible = false;
  k.group.add(marker);
  return { root, body: k.group, wheels: k.wheels, flipWheels: !!k.flipWheels, driver, anim, marker, glider, sparks, sparkMat, flame, shield, shadow, setDetail: (low) => setOutlines(root, !low) };
}

// ---------- Track objects ----------

export function makeItemBox() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 1.3), new THREE.MeshStandardMaterial({
    color: '#ffffff', transparent: true, opacity: 0.55, roughness: 0.1, emissive: '#BB6BD9', emissiveIntensity: 0.35 }));
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.font = '900 52px Nunito, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', 32, 36);
  const q = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, side: THREE.DoubleSide }));
  g.add(box, q);
  return g;
}

export function makeCoin() {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.1, 20), std('#FFD43B', 0.25, 0.85, { emissive: '#B8860B', emissiveIntensity: 0.25 }));
  m.rotation.x = Math.PI / 2;
  const g = new THREE.Group(); g.add(m);
  return g;
}

export function makeItemMesh(kind) { return itemMesh(THREE, kind); }

// ---------- Scenery per theme (instanced where possible) ----------

export function makeScenery(theme, spots) {
  const g = new THREE.Group();
  const add = (geo, mat, list, place) => {
    const inst = new THREE.InstancedMesh(geo, mat, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    list.forEach((p, i) => {
      const { pos, scale, rot = 0 } = place(p);
      e.set(0, rot, 0); q.setFromEuler(e);
      m4.compose(pos, q, scale); inst.setMatrixAt(i, m4);
    });
    inst.receiveShadow = true;
    g.add(inst);
    return inst;
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const S = (s, sy = s) => V(s, sy, s);
  const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
  if (theme === 'park') {
    add(new THREE.CylinderGeometry(0.35, 0.45, 2.4, 7), lam('#8B5E3C'), spots, ([x, z, s]) => ({ pos: V(x, 1.2 * s, z), scale: S(s) }));
    const crowns = add(new THREE.IcosahedronGeometry(2.2, 1), lam('#ffffff'), spots, ([x, z, s]) => ({ pos: V(x, 3.6 * s, z), scale: S(s), rot: x }));
    spots.forEach(([x], i) => crowns.setColorAt(i, new THREE.Color().setHSL(0.27 + (Math.abs(x) % 7) * 0.012, 0.55, 0.38)));
  } else if (theme === 'desert') {
    const cacti = spots.filter((_, i) => i % 3);
    add(new THREE.CapsuleGeometry(0.45, 2.6, 4, 10), lam('#5C9E4A'), cacti, ([x, z, s]) => ({ pos: V(x, 1.7 * s, z), scale: S(s) }));
    add(new THREE.CapsuleGeometry(0.3, 1.0, 4, 8), lam('#5C9E4A'), cacti, ([x, z, s]) => ({ pos: V(x + 0.6 * s, 2.2 * s, z), scale: S(s) }));
    const rocks = spots.filter((_, i) => !(i % 3));
    add(new THREE.DodecahedronGeometry(2, 0), lam('#C97B4A'), rocks, ([x, z, s]) => ({ pos: V(x, 0.8 * s, z), scale: V(s * 1.4, s * 0.8, s), rot: z }));
  } else if (theme === 'snow') {
    add(new THREE.ConeGeometry(2, 5.5, 8), lam('#2F6B4F'), spots, ([x, z, s]) => ({ pos: V(x, 2.75 * s, z), scale: S(s) }));
    add(new THREE.ConeGeometry(1.3, 2.2, 8), lam('#F8F9FA'), spots, ([x, z, s]) => ({ pos: V(x, 4.7 * s, z), scale: S(s) }));
    add(new THREE.SphereGeometry(2, 10, 6), lam('#F1F3F5'), spots.filter((_, i) => i % 4 === 0), ([x, z, s]) => ({ pos: V(x + 4, 0, z + 3), scale: V(s * 1.5, s * 0.5, s) }));
  } else if (theme === 'sky') {
    // Cloud Gardens: puffy clouds on the ground and floating rock islands with a lawn on top
    const puff = new THREE.IcosahedronGeometry(1, 2), white = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 1 });
    const clouds = spots.filter((_, i) => i % 3 === 1);
    for (const [dx, dy, k] of [[0, 0, 1], [2.6, -0.4, 0.75], [-2.4, -0.5, 0.7]]) {
      add(puff, white, clouds, ([x, z, s]) => ({ pos: V(x + dx * s * 1.6, 1 + dy * s, z), scale: V(4 * s * k, 2.6 * s * k, 4 * s * k) }));
    }
    const isles = spots.filter((_, i) => i % 7 === 2);
    const lift = ([x, z, s]) => 14 + (Math.abs(x * 13 + z * 7) % 22) * s;
    add(new THREE.ConeGeometry(6, 9, 7), lam('#B49FC4', { side: THREE.DoubleSide }), isles, (p) => ({ pos: V(p[0], lift(p) - 4.5 * p[2], p[1]), scale: V(p[2], -p[2], p[2]) })); // upside down
    add(new THREE.CylinderGeometry(6.2, 6.2, 1.2, 7), lam('#7CC36B'), isles, (p) => ({ pos: V(p[0], lift(p) + 0.6 * p[2], p[1]), scale: S(p[2]) }));
    add(new THREE.SphereGeometry(1.8, 10, 8), lam('#F783AC'), isles, (p) => ({ pos: V(p[0] + 2 * p[2], lift(p) + 2.4 * p[2], p[1]), scale: S(p[2]) }));
  } else if (theme === 'city') {
    // Buildings with glowing windows
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const x2 = c.getContext('2d');
    x2.fillStyle = '#1B1F3A'; x2.fillRect(0, 0, 64, 128);
    for (let y = 4; y < 128; y += 10) for (let x = 4; x < 64; x += 10) {
      x2.fillStyle = Math.random() < 0.55 ? ['#FFD43B', '#74C0FC', '#F783AC'][Math.floor(Math.random() * 3)] : '#2A2F55';
      x2.fillRect(x, y, 6, 6);
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    add(new THREE.BoxGeometry(6, 1, 6), new THREE.MeshLambertMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.9 }), spots,
      ([x, z, s]) => ({ pos: V(x, 6 + s * 8, z), scale: V(1, 12 + s * 16, 1) }));
  }
  return g;
}

// ---------- Portraits: render a character's head to a small image for menus/HUD ----------

// assets (optional): loaded models, so the characters are drawn from their real models
export function makePortraits(renderer, characters, assets) {
  const size = 160;
  const target = new THREE.WebGLRenderTarget(size, size);
  target.texture.colorSpace = THREE.SRGBColorSpace; // so colors match the screen
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#9a9fb5', 2.4));
  const sun = new THREE.DirectionalLight('#ffffff', 2.4); sun.position.set(2, 4, 4); scene.add(sun);
  const rim = new THREE.DirectionalLight('#bfe0ff', 1.2); rim.position.set(-3, 2, -2); scene.add(rim);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 30);
  const pixels = new Uint8Array(size * size * 4);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const out = {};
  for (const c of characters) {
    const p = makePilot(c, c.accent || c.color, { standing: true });
    p.anim.play('idle');
    scene.add(p.object);
    p.object.rotation.y = -0.5; // a little turned: a 3/4 view
    p.object.updateMatrixWorld(true);
    cam.position.set(0.5, p.headTop - 0.38, 3.1); cam.lookAt(0, p.headTop - 0.62, 0);
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) img.data.set(pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    ctx.putImageData(img, 0, 0);
    out[c.id] = canvas.toDataURL();
    scene.remove(p.object);
    p.object.traverse((o) => { if (o.isMesh && o.userData.portrait) o.geometry.dispose(); });
  }
  renderer.setRenderTarget(null);
  target.dispose();
  return out;
}
