// Turbo Karts select screen: a little 3D showroom per player. The chosen character stands on
// a podium (idle animation; a wave when picked, a cheer when ready) next to the chosen kart
// slowly turning on a turntable, with that character in the driver's seat.
// turbo-karts.js renders it into the preview box of each player's panel.
import { makeRacer, makeStandingCharacter } from './karts-models.js';

let THREE;
export function setShowroomThree(t) { THREE = t; }

export function createShowroom(assets) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#4a5578', 1.6));
  const key = new THREE.DirectionalLight('#fff4e0', 2.4);
  key.position.set(3, 6, 5);
  const rim = new THREE.DirectionalLight('#9FB4FF', 1.4); // cool light from behind: separates them from the background
  rim.position.set(-4, 3, -5);
  scene.add(key, rim);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0.2, 1.8, 6.9);
  camera.lookAt(0.2, 0.8, 0);

  // Two podiums: character (left) and the kart turntable (right)
  const podiumMat = new THREE.MeshStandardMaterial({ color: '#2B3445', roughness: 0.5, metalness: 0.2 });
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff' }); // the player's color (see set)
  function podium(x, r) {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.04, 0.22, 48), podiumMat);
    top.position.y = -0.11;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, 0.025, 8, 64), ringMat);
    ring.rotation.x = Math.PI / 2;
    g.add(top, ring);
    g.position.x = x;
    scene.add(g);
    return { g, ring };
  }
  const charPod = podium(-1.55, 0.85), kartPod = podium(1.35, 1.75);

  let who = null, ride = null, standing = null, key2 = '';
  let t = 0, cheer = 0; // cheer > 0: the code-built animals jump for joy

  const clear = (obj) => obj?.parent?.remove(obj);

  return {
    scene, camera,
    // Show this character and kart (rebuilt only when they change)
    set(character, kart, color) {
      const k = `${character.id}/${kart.id}/${color}`;
      if (k === key2) return;
      const charChanged = character.id !== who;
      key2 = k; who = character.id;
      ringMat.color.set(color);
      if (charChanged || !standing) {
        clear(standing?.object);
        standing = makeStandingCharacter(character, assets);
        standing.object.position.set(0, 0, 0);
        standing.object.rotation.y = 0.35; // turned a little toward the kart
        if (!standing.anim) standing.object.scale.setScalar(1.05);
        charPod.g.add(standing.object);
      }
      const angle = ride?.root.rotation.y ?? 0.6;
      clear(ride?.root);
      ride = makeRacer(character, kart, color, assets);
      ride.root.rotation.y = angle;
      ride.root.scale.setScalar(0.92);
      // only the kart and driver here: no shield bubble, boost flame or drift sparks
      for (const fx of [ride.shield, ride.flame, ride.marker, ride.glider, ...ride.sparks]) fx.visible = false;
      kartPod.g.add(ride.root);
    },
    // 'pick' = character chosen (a wave) · 'ready' = all set (a cheer)
    celebrate(kind) {
      if (standing?.anim) standing.anim.play(kind === 'ready' ? 'Yes' : 'Wave');
      else cheer = kind === 'ready' ? 1.2 : 0.6;
      if (ride?.anim) ride.anim.play(kind === 'ready' ? 'Yes' : 'Wave');
    },
    update(dt) {
      t += dt;
      if (ride) ride.root.rotation.y += dt * 0.6; // the turntable
      ride?.anim?.mixer.update(dt);
      if (standing?.anim) standing.anim.mixer.update(dt);
      else if (standing) {
        // code-built animals: breathe and sway; a happy hop when cheering
        cheer = Math.max(0, cheer - dt);
        const hop = cheer > 0 ? Math.abs(Math.sin(cheer * 9)) * 0.35 : 0;
        standing.object.position.y = hop;
        standing.object.scale.y = 1.05 * (1 + Math.sin(t * 2.4) * 0.025);
        standing.object.rotation.z = Math.sin(t * 1.3) * 0.05;
        standing.object.rotation.y = 0.35 + (cheer > 0 ? cheer * 6 : 0);
      }
    },
    dispose() {
      scene.traverse((o) => { o.geometry?.dispose(); });
    },
  };
}
