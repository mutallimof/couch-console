// Turbo Karts podium: a small 3D stage for the results card. The top three stand on steps that rise one after the other;
// 1st place cheers, the others hang their heads (the "cheer" and "defeat" clips of the cast). It draws into its own canvas.
import { makeStandingCharacter } from './karts-models.js';

const STEP = [{ x: 0, h: 1.15 }, { x: -2.35, h: 0.78 }, { x: 2.35, h: 0.5 }]; // 1st, 2nd, 3rd

// entries: [{ character, color }] for 1st, 2nd, 3rd. Returns { canvas, update(dt), dispose() }
export function createPodium(THREE, assets, entries) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff6e8', '#cdb9a0', 2.1));
  const key = new THREE.DirectionalLight('#fff1d6', 3);
  key.position.set(3, 7, 6);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(30, 2.6, 0.1, 60);
  camera.position.set(0, 2.3, 9.4);
  camera.lookAt(0, 1.35, 0);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.domElement.className = 'kart-podium-canvas';

  const stands = entries.slice(0, 3).map((e, i) => {
    const g = new THREE.Group(), s = STEP[i];
    const col = new THREE.Color(e.color);
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, s.h, 1.9), new THREE.MeshStandardMaterial({ color: col, roughness: 0.55 }));
    body.position.y = s.h / 2;
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.08, 1.94), new THREE.MeshStandardMaterial({ color: col.clone().lerp(new THREE.Color('#fff'), 0.35), roughness: 0.5 }));
    top.position.y = s.h + 0.04;
    // the place number on the front of the step
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.font = '600 96px Fredoka, Nunito, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(i + 1), 64, 70);
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
    num.position.set(0, s.h / 2, 0.955);
    body.castShadow = true;
    g.add(body, top, num);
    g.position.x = s.x;
    const who = makeStandingCharacter(e.character, assets);
    who.object.position.set(0, s.h + 0.08, 0.05);
    g.add(who.object);
    scene.add(g);
    return { g, who, rank: i, t: 0, started: false };
  });
  let time = 0;
  const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3) * (1 + 1.4 * (1 - Math.min(1, t))); // a small overshoot
  return {
    canvas: renderer.domElement,
    names: null,
    update(dt) {
      time += dt;
      // 3rd place first, then 2nd, and the winner last
      for (const s of stands) {
        const start = 0.15 + (2 - s.rank) * 0.45, t = (time - start) / 0.55;
        s.g.scale.y = Math.max(0.001, ease(t));
        s.g.visible = t > 0;
        if (t > 0.9 && !s.started) { s.started = true; if (s.rank === 0) s.who.anim?.play('cheer', true); else s.who.anim?.play('defeat', false, true); }
        s.who.anim?.mixer.update(dt);
        s.who.object.scale.y = s.who.object.scale.x; // (the group's squash must not squash the character)
        s.who.object.scale.y = (s.who.anim?.unit ?? 1) / Math.max(0.001, s.g.scale.y);
      }
      const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
      if (w > 10 && h > 10) {
        if (renderer.domElement.width !== Math.round(w * renderer.getPixelRatio())) renderer.setSize(w, h, false);
        camera.aspect = w / h; camera.updateProjectionMatrix();
        renderer.render(scene, camera);
        // the name labels sit under their steps: world x -> percent of the width
        const visible = 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z * camera.aspect;
        this.names?.forEach((el, k) => { el.style.left = `${50 + (100 * STEP[[1, 0, 2][k]].x) / visible}%`; });
      }
    },
    dispose() { renderer.dispose(); renderer.domElement.remove(); scene.traverse((o) => o.geometry?.dispose()); },
  };
}
