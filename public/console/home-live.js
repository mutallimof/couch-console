// The home screen's live preview: while Turbo Karts is focused, its tile plays a tiny live 3D scene (three karts with cast
// drivers lapping a toy island) instead of the still picture. It draws into a small canvas at 30 frames per second, only while
// the tile is focused and the menu is visible, and frees everything when you move away. If anything fails to load, the still
// picture simply stays (the other tiles get their own animated art from CSS, see home.css).
const MAX_FPS = 30;
let ready = null; // Promise of everything the scene needs, loaded once

async function prepare() {
  const THREE = await import('three');
  const { RoundedBoxGeometry } = await import('three/addons/geometries/RoundedBoxGeometry.js');
  const models = await import('../games/turbo-karts/karts-models.js');
  const { GP_CHARACTERS } = await import('../games/turbo-karts/ow-kart/characters.js');
  const { KARTS } = await import('../games/turbo-karts/karts-data.js');
  models.setThree(THREE);
  const cast = ['dash', 'blaze', 'finn'].map((id) => GP_CHARACTERS.find((c) => c.id === id) || GP_CHARACTERS[0]);
  return { THREE, RoundedBoxGeometry, models, cast, karts: KARTS.slice(0, 3) }; // (the pilots and karts are made in code: nothing to download)
}

// The toy island with three lapping karts. Returns a scene with update(dt) and dispose().
function buildScene({ THREE, RoundedBoxGeometry, models, cast, karts }) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#cdd9ff', 1.9));
  const key = new THREE.DirectionalLight('#fff1dc', 2.6);
  key.position.set(-6, 10, 5);
  scene.add(key);
  const mat = (c, r = 0.6) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const base = new THREE.Mesh(new RoundedBoxGeometry(5.4, 0.55, 5.4, 3, 0.18), mat('#FFF4E0'));
  base.position.y = -0.28;
  scene.add(base);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const tile = new THREE.Mesh(new RoundedBoxGeometry(1.22, 0.1, 1.22, 3, 0.04), mat((i + j) % 2 ? '#78D14F' : '#86DA5D'));
    tile.position.set(-1.9 + i * 1.27, 0.01, -1.9 + j * 1.27);
    scene.add(tile);
  }
  const R = 1.75;
  const road = new THREE.Mesh(new THREE.TorusGeometry(R, 0.5, 12, 64), mat('#5E6677'));
  road.rotation.x = Math.PI / 2; road.position.y = 0.06; road.scale.z = 0.35;
  const line = new THREE.Mesh(new THREE.TorusGeometry(R, 0.035, 6, 64), new THREE.MeshBasicMaterial({ color: '#fff' }));
  line.rotation.x = Math.PI / 2; line.position.y = 0.25;
  scene.add(road, line);
  // the finish gate over the road
  const gate = new THREE.Group();
  for (const x of [-0.75, 0.75]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.7, 10), mat('#fff')); p.position.set(x, 0.85, 0); gate.add(p); }
  const beam = new THREE.Mesh(new RoundedBoxGeometry(1.9, 0.32, 0.1, 3, 0.04), mat('#3FA9FF')); beam.position.set(0, 1.55, 0);
  gate.add(beam); gate.position.set(0, 0, -R); scene.add(gate);

  const pilots = [], racers = [];
  const colors = ['#2F80ED', '#EB5757', '#27AE60'];
  karts.forEach((k, n) => {
    const holder = new THREE.Group();
    const r = models.makeRacer(cast[n], k, colors[n], null); // the same racers as in the real race
    r.flame.visible = false; r.shield.visible = false; r.marker.visible = false; r.glider.visible = false; r.sparks.forEach((sp) => { sp.visible = false; }); r.shadow.visible = false;
    r.anim.mixer.update(n * 0.7);
    pilots.push(r);
    r.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    holder.add(r.root); holder.scale.setScalar(0.42);
    scene.add(holder);
    racers.push({ holder, body: r.root, angle: n * 2.1, speed: 0.95 + n * 0.12, wheels: r.wheels });
  });
  return Object.assign(scene, {
    update(dt) {
      pilots.forEach((r, n) => { r.anim.mixer.update(dt); r.anim.lean(Math.sin(racers[n].angle * 3) * 0.5, 30); });
      for (const r of racers) {
        r.angle += dt * r.speed;
        const x = Math.sin(r.angle) * R, z = -Math.cos(r.angle) * R, dx = Math.cos(r.angle), dz = Math.sin(r.angle);
        r.holder.position.set(x, 0.17, z);
        r.holder.rotation.y = Math.atan2(dx, dz); // along the road
        r.body.rotation.z = -0.04 * Math.sin(r.angle * 3);
        r.wheels.forEach((w) => { w.rotation.x += dt * 10; });
      }
    },
    dispose() { scene.traverse((o) => { if (!o.isSkinnedMesh) o.geometry?.dispose?.(); }); },
  });
}

export function createHomeLive() {
  let active = null; // { plate, token, stop }
  const covered = () => !document.getElementById('stage')?.hidden || !document.getElementById('pairing')?.hidden;

  async function start(plate) {
    const token = {};
    active = { plate, token };
    let pack;
    try { ready ??= prepare(); pack = await ready; } catch (err) { ready = null; console.warn('Home live preview unavailable:', err.message); return; }
    if (active?.token !== token) return;
    const { THREE } = pack;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.domElement.className = 'live-canvas';
    const scene = buildScene(pack);
    plate.append(renderer.domElement);
    const cam = new THREE.PerspectiveCamera(25, 1, 0.1, 60);
    let last = 0, raf = 0, t = 0, alive = true;
    const loop = (now) => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      if (now - last < 1000 / MAX_FPS - 1 || covered() || document.hidden) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      const w = plate.clientWidth, h = plate.clientHeight;
      if (w < 10 || h < 10) return;
      const pr = renderer.getPixelRatio();
      if (renderer.domElement.width !== Math.round(w * pr) || renderer.domElement.height !== Math.round(h * pr)) renderer.setSize(w, h, false);
      cam.aspect = w / h;
      const a = 0.78 + Math.sin(t * 0.3) * 0.09; // a slow sway so the island is never still
      cam.position.set(Math.cos(a) * 12.3, 9.2, Math.sin(a) * 12.3);
      cam.lookAt(0, 0.5, 0);
      cam.updateProjectionMatrix();
      scene.update(dt);
      renderer.render(scene, cam);
      plate.classList.add('live-on');
    };
    raf = requestAnimationFrame(loop);
    active.stop = () => { alive = false; cancelAnimationFrame(raf); renderer.dispose(); renderer.domElement.remove(); scene.dispose(); plate.classList.remove('live-on'); };
  }

  return {
    // Called when the focus moves: only the hero (Turbo Karts) gets the live scene
    focus(el, entry) {
      if (active) { active.stop?.(); active = null; }
      if (!el || entry?.id !== 'turbo-karts') return;
      start(el.querySelector('.plate'));
    },
    stop() { active?.stop?.(); active = null; },
  };
}
