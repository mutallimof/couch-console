// Turbo Karts models: real models from the packs (cars, animated characters) when they're loaded,
// plus code-built characters, karts and track objects (also the fallbacks).

import { CAR, cloneOf } from './karts-assets.js';
import { addRimTo } from './karts-style.js';

let THREE;
export function setThree(t) { THREE = t; }

const CAR_SCALE = 3.2;      // Toy Car Kit cars are tiny; this makes them kart-sized (~2.8 m long)
const DRIVER_HEIGHT = 1.45;  // drivers are scaled to this height (m) to fit the cars
// A character's glTF file: its own `path` (the Quaternius pack)
const modelPath = (c) => c.path;
// The clips of the Quaternius characters are called Idle, Victory, RecieveHit...; the game asks for Wave, Yes, HitReact: the same moments, mapped
const MODEL_HEIGHT = 1.8; // how tall the Quaternius characters are in their own units (measured in the browser)
const ANIM_ALIASES = { Wave: 'Victory', Yes: 'Victory', HitReact: 'RecieveHit' };

const std = (color, rough = 0.55, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
const mesh = (geo, mat, x = 0, y = 0, z = 0, cast = true) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  return m;
};

// ---------- Characters (cute, rounded, original) ----------

export function makeCharacter(c) {
  const g = new THREE.Group();
  const body = std(c.color, 0.6), accent = std(c.accent, 0.6), dark = std('#1B1F2A', 0.3);
  // torso and arms holding the wheel
  g.add(mesh(new THREE.CapsuleGeometry(0.32, 0.25, 6, 14), body, 0, 0.35, 0));
  for (const s of [-1, 1]) {
    const arm = mesh(new THREE.CapsuleGeometry(0.09, 0.32, 4, 8), body, s * 0.3, 0.42, 0.22);
    arm.rotation.x = -1.1; arm.rotation.z = s * 0.25;
    g.add(arm);
  }
  // head
  const head = new THREE.Group();
  head.position.y = 0.95;
  g.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.42, 24, 18), c.kind === 'robot' ? std(c.color, 0.25, 0.6) : body));
  // eyes (white + pupil + shine), facing forward (+z)
  const eyeY = c.kind === 'frog' ? 0.32 : 0.05;
  for (const s of [-1, 1]) {
    if (c.kind === 'robot') {
      head.add(mesh(new THREE.BoxGeometry(0.62, 0.16, 0.08), std(c.accent, 0.2, 0, { emissive: c.accent, emissiveIntensity: 0.8 }), 0, 0.05, 0.38));
      break;
    }
    const ex = s * (c.kind === 'alien' ? 0.15 : 0.15);
    const white = mesh(new THREE.SphereGeometry(c.kind === 'frog' ? 0.13 : 0.11, 14, 10), std('#ffffff', 0.3), ex, eyeY, 0.36);
    white.scale.z = 0.6;
    head.add(white);
    head.add(mesh(new THREE.SphereGeometry(0.065, 12, 8), dark, ex, eyeY, 0.42));
    head.add(mesh(new THREE.SphereGeometry(0.022, 6, 6), std('#ffffff', 0.2), ex + 0.02, eyeY + 0.03, 0.47, false));
  }
  // cheeks
  if (['cat', 'bunny', 'bear', 'fox', 'bird'].includes(c.kind)) {
    for (const s of [-1, 1]) head.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), std('#FF8FA3', 0.8), s * 0.26, -0.1, 0.33, false));
  }
  // features per kind
  const ear = (geo, x, y, z, rz, mat = body) => { const e = mesh(geo, mat, x, y, z); e.rotation.z = rz; head.add(e); return e; };
  switch (c.kind) {
    case 'cat':
      for (const s of [-1, 1]) { ear(new THREE.ConeGeometry(0.14, 0.26, 4), s * 0.24, 0.38, 0, -s * 0.35); ear(new THREE.ConeGeometry(0.07, 0.14, 4), s * 0.24, 0.37, 0.05, -s * 0.35, accent); }
      head.add(mesh(new THREE.SphereGeometry(0.04, 8, 6), std('#FF8FA3'), 0, -0.08, 0.42));
      break;
    case 'bear':
      for (const s of [-1, 1]) ear(new THREE.SphereGeometry(0.13, 12, 10), s * 0.3, 0.33, 0, 0);
      head.add(mesh(new THREE.SphereGeometry(0.17, 14, 10), accent, 0, -0.12, 0.3));
      head.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), dark, 0, -0.06, 0.45));
      break;
    case 'bunny':
      for (const s of [-1, 1]) { const e = ear(new THREE.CapsuleGeometry(0.08, 0.42, 4, 8), s * 0.15, 0.6, 0, -s * 0.15); e.scale.z = 0.6; }
      break;
    case 'fox':
      for (const s of [-1, 1]) ear(new THREE.ConeGeometry(0.15, 0.34, 4), s * 0.25, 0.4, 0, -s * 0.3);
      { const m = mesh(new THREE.ConeGeometry(0.16, 0.3, 12), accent, 0, -0.12, 0.38); m.rotation.x = Math.PI / 2; head.add(m); }
      head.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), dark, 0, -0.12, 0.54));
      break;
    case 'bird': {
      const beak = mesh(new THREE.ConeGeometry(0.1, 0.2, 10), std(c.accent, 0.5), 0, -0.08, 0.45);
      beak.rotation.x = Math.PI / 2; head.add(beak);
      for (let i = -1; i <= 1; i++) { const f = mesh(new THREE.ConeGeometry(0.05, 0.22, 6), std(c.accent), i * 0.08, 0.45, 0); f.rotation.z = -i * 0.4; head.add(f); }
      break;
    }
    case 'robot':
      head.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), std('#ADB5BD', 0.3, 0.8), 0, 0.5, 0));
      head.add(mesh(new THREE.SphereGeometry(0.07, 10, 8), std(c.accent, 0.2, 0, { emissive: c.accent, emissiveIntensity: 1.2 }), 0, 0.67, 0));
      for (const s of [-1, 1]) { const b = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 14), std('#868E96', 0.3, 0.8), s * 0.43, 0, 0); b.rotation.z = Math.PI / 2; head.add(b); }
      break;
    case 'frog':
      head.scale.set(1.15, 0.85, 1);
      head.add(mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 16, Math.PI), std('#2B8A3E'), 0, -0.12, 0.36));
      break;
    case 'alien':
      for (const s of [-1, 1]) {
        const a = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), body, s * 0.18, 0.5, 0); a.rotation.z = -s * 0.4; head.add(a);
        head.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), std(c.accent, 0.3, 0, { emissive: c.accent, emissiveIntensity: 0.9 }), s * 0.25, 0.64, 0));
      }
      break;
  }
  return g;
}

// ---------- Karts: four shapes ----------

export function makeKart(kart, color) {
  const g = new THREE.Group();
  const paint = std(color, 0.35, 0.3), trim = std('#2B3445', 0.5, 0.2), chrome = std('#DEE2E6', 0.15, 0.9);
  const s = { light: [1.5, 0.35, 2.3], classic: [1.7, 0.42, 2.6], heavy: [2.0, 0.55, 2.8], sport: [1.6, 0.32, 2.9] }[kart.shape];
  // body with a raised nose and side pods
  g.add(mesh(new THREE.BoxGeometry(s[0], s[1], s[2]), paint, 0, 0.45, 0));
  const nose = mesh(new THREE.CylinderGeometry(s[0] * 0.32, s[0] * 0.42, 1.0, 16), paint, 0, 0.5, s[2] / 2 + 0.25);
  nose.rotation.x = Math.PI / 2; nose.scale.z = 0.55; g.add(nose);
  for (const x of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.28, s[1] * 0.9, s[2] * 0.6), trim, x * (s[0] / 2 + 0.1), 0.42, 0));
  // bumper, seat, steering wheel, engine with exhausts
  g.add(mesh(new THREE.BoxGeometry(s[0] * 0.9, 0.18, 0.25), chrome, 0, 0.35, s[2] / 2 + 0.75));
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.55, 0.25), trim, 0, 0.85, -0.55));
  const wheelS = mesh(new THREE.TorusGeometry(0.2, 0.04, 8, 20), trim, 0, 0.95, 0.45); wheelS.rotation.x = -0.9; g.add(wheelS);
  g.add(mesh(new THREE.BoxGeometry(s[0] * 0.7, 0.4, 0.6), chrome, 0, 0.7, -s[2] / 2 + 0.1));
  for (const x of [-0.3, 0.3]) { const e = mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 10), chrome, x, 0.75, -s[2] / 2 - 0.25); e.rotation.x = Math.PI / 2; g.add(e); }
  if (kart.shape === 'sport' || kart.shape === 'heavy') {
    g.add(mesh(new THREE.BoxGeometry(s[0] + 0.3, 0.08, 0.45), paint, 0, 1.3, -s[2] / 2));
    for (const x of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.45, 0.3), trim, x * s[0] * 0.4, 1.08, -s[2] / 2));
  }
  // wheels (fat tyres with colored hubs)
  const wheels = [];
  const r = kart.shape === 'heavy' ? 0.52 : 0.44;
  for (const [x, z, big] of [[-1, 1, 0], [1, 1, 0], [-1, -1, 1], [1, -1, 1]]) {
    const w = new THREE.Group();
    const rr = r + big * 0.06;
    const tyre = mesh(new THREE.CylinderGeometry(rr, rr, 0.42 + big * 0.1, 18), std('#212529', 0.9));
    tyre.rotation.z = Math.PI / 2; w.add(tyre);
    const hub = mesh(new THREE.CylinderGeometry(rr * 0.5, rr * 0.5, 0.46 + big * 0.1, 12), std(color, 0.3, 0.5));
    hub.rotation.z = Math.PI / 2; w.add(hub);
    w.position.set(x * (s[0] / 2 + 0.25), rr, z * (s[2] / 2 - 0.15));
    g.add(w);
    wheels.push(w);
  }
  return { group: g, wheels, seatZ: -0.35, seatY: 0.62 };
}

// A Toy Car Kit car (turned to face +z), with its four wheels found by name so they can spin
function assetKart(gltf, kart) {
  const { object } = cloneOf(gltf);
  object.scale.setScalar(CAR_SCALE);
  object.rotation.y = Math.PI; // the models face -z; our karts face +z
  const g = new THREE.Group();
  g.add(object);
  const wheels = [];
  object.traverse((o) => { if (/^wheel-/.test(o.name)) wheels.push(o); });
  return { group: g, wheels, seatY: kart.seat[0], seatZ: kart.seat[1], flipWheels: true };
}

// An animated driver, or null if the model isn't loaded
// opts.skin: repaint the "Skin" material (the pack's is almost black) · opts.sit: hold the seated pose
function assetDriver(gltf, { skin, sit = false } = {}) {
  const c = cloneOf(gltf);
  if (!c) return null;
  const obj = c.object;
  // Own copies of the materials (clones share them), so a repaint never leaks to another racer
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
    for (const m of [].concat(o.material)) {
      if (skin && m.name === 'Skin') m.color.set(skin);
      m.roughness = Math.min(m.roughness, 0.6);
    }
  });
  obj.scale.setScalar(DRIVER_HEIGHT / MODEL_HEIGHT);
  const mixer = new THREE.AnimationMixer(obj);
  const actions = Object.fromEntries(c.animations.map((a) => [a.name, mixer.clipAction(a)]));
  for (const [alias, real] of Object.entries(ANIM_ALIASES)) if (!actions[alias] && actions[real]) actions[alias] = actions[real];
  // Seated: the last frame of SitDown, held (the pack has no sitting loop)
  const rest = sit && actions.SitDown ? 'SitDown' : 'Idle';
  const hold = (a) => { a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play(); a.time = a.getClip().duration; };
  let current = actions[rest];
  if (rest === 'SitDown') { hold(current); mixer.update(0); } else { current?.play(); mixer.update(Math.random() * 2); } // (don't all bob in sync)
  // Switch to another animation (smoothly). One-shot animations go back to Idle when done.
  const play = (name, loop = false) => {
    const next = actions[name];
    if (!next || next === current) return;
    current?.fadeOut(0.15);
    if (next === actions[rest] && rest === 'SitDown') { hold(next); next.fadeIn(0.15); } else {
      next.reset();
      next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      next.clampWhenFinished = !loop;
      next.fadeIn(0.15).play();
    }
    current = next;
  };
  mixer.addEventListener('finished', (e) => { if (e.action === current && current !== actions[rest]) play(rest, true); });
  return { object: obj, mixer, actions, play };
}

// A character standing on its own (select-screen showroom): a character with its animations,
// or a code-built animal. Returns { object, anim } (anim = null for the animals).
export function makeStandingCharacter(character, assets) {
  const gltf = assets?.get(modelPath(character));
  const anim = gltf ? assetDriver(gltf, { skin: character.skin }) : null;
  return { object: anim ? anim.object : makeCharacter(character), anim };
}

// Kart + driver + effects, ready to drive. `assets` = loaded models (Map path -> glTF), optional.
export function makeRacer(character, kart, color, assets) {
  const carModel = kart.model && assets?.get(CAR(kart.model));
  const k = carModel ? assetKart(carModel, kart) : makeKart(kart, color);
  const gltf = assets?.get(modelPath(character));
  const anim = gltf ? assetDriver(gltf, { skin: character.skin, sit: true }) : null;
  const driver = anim ? anim.object : makeCharacter(character);
  driver.position.set(0, k.seatY, k.seatZ);
  if (!anim) driver.scale.setScalar(carModel ? 0.85 : 0.95);
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
  return { root, body: k.group, wheels: k.wheels, flipWheels: !!k.flipWheels, driver, anim, marker, glider, sparks, sparkMat, flame, shield, shadow };
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

export function makeItemMesh(kind) {
  if (kind === 'orb') {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14), std('#E64980', 0.2, 0, { emissive: '#E64980', emissiveIntensity: 0.9 })));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.06, 8, 24), new THREE.MeshBasicMaterial({ color: '#F783AC' }));
    g.add(ring);
    return g;
  }
  if (kind === 'slick') {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1.4, 20), new THREE.MeshStandardMaterial({ color: '#4DABF7', roughness: 0.05, transparent: true, opacity: 0.85 }));
    m.rotation.x = -Math.PI / 2;
    const g = new THREE.Group(); g.add(m); g.scale.set(1, 1, 0.75);
    return g;
  }
  return new THREE.Group();
}

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
  scene.add(new THREE.HemisphereLight('#ffffff', '#666666', 2.2));
  const sun = new THREE.DirectionalLight('#ffffff', 2); sun.position.set(2, 3, 4); scene.add(sun);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  const pixels = new Uint8Array(size * size * 4);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const out = {};
  for (const c of characters) {
    const gltf = assets?.get(modelPath(c));
    const anim = gltf ? assetDriver(gltf, { skin: c.skin }) : null;
    const ch = anim ? anim.object : makeCharacter(c);
    if (anim) {
      // frame the character's head: find its top in the idle pose
      anim.mixer.setTime(0.5);
      ch.updateMatrixWorld(true);
      const top = new THREE.Box3().setFromObject(ch, true).max.y;
      cam.position.set(0.55, top - 0.15, 2.7); cam.lookAt(0, top - 0.4, 0);
    } else {
      cam.position.set(0.6, 1.25, 2.6); cam.lookAt(0, 0.95, 0);
    }
    scene.add(ch);
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) img.data.set(pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    ctx.putImageData(img, 0, 0);
    out[c.id] = canvas.toDataURL();
    scene.remove(ch);
  }
  renderer.setRenderTarget(null);
  target.dispose();
  return out;
}
