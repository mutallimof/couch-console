// Turbo Karts select screen: a little 3D showroom per player. The chosen racer sits in the chosen
// kart on a slowly turning podium, idling with a small bounce; a hop and a cheer when Ready.
// turbo-karts.js renders it into the preview box of each player's panel.
import { makeRacer } from './karts-models.js';

let THREE;
export function setShowroomThree(t) { THREE = t; }

export function createShowroom(assets) {
  const scene = new THREE.Scene();
  // Warm, bright stage: sunny key, soft peach fill from the ground, a golden rim from behind
  scene.add(new THREE.HemisphereLight('#fff6e8', '#d9b48c', 2.3));
  const key = new THREE.DirectionalLight('#fff1d6', 3.2);
  key.position.set(3, 6, 5);
  const fill = new THREE.DirectionalLight('#ffe0c2', 1.2);
  fill.position.set(-5, 2, 4);
  const rim = new THREE.DirectionalLight('#ffc89a', 1.8);
  rim.position.set(-3, 3, -5);
  scene.add(key, fill, rim);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0.3, 2.5, 10.2);
  camera.lookAt(0, 1.45, 0);

  // One podium with the player's colored ring
  const podiumMat = new THREE.MeshStandardMaterial({ color: '#5b6785', roughness: 0.5, metalness: 0.1 });
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff' }); // the player's color (see set)
  const podium = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.1, 0.24, 56), podiumMat);
  top.position.y = -0.12;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.04, 8, 72), ringMat);
  ring.rotation.x = Math.PI / 2;
  podium.add(top, ring);
  scene.add(podium);

  let ride = null, key2 = '';
  let t = 0, cheer = 0, spin = 0; // cheer > 0: the kart hops for joy

  const clear = (obj) => obj?.parent?.remove(obj);

  return {
    scene, camera,
    // Tall, narrow preview boxes need the camera further back to keep the kart in the picture
    fit(aspect) { camera.aspect = aspect; camera.position.z = 10.2 * Math.min(2.4, Math.max(1, 0.85 / aspect)); camera.lookAt(0, 1.45, 0); camera.updateProjectionMatrix(); },
    // Show this character in this kart (rebuilt only when they change)
    set(character, kart, color) {
      const k = `${character.id}/${kart.id}/${color}`;
      if (k === key2) return;
      key2 = k;
      ringMat.color.set(color);
      const angle = ride?.root.rotation.y ?? 0.7;
      clear(ride?.root);
      ride = makeRacer(character, kart, color, assets);
      ride.root.rotation.y = angle;
      ride.root.scale.setScalar(1.2);
      ride.seatY = ride.driver.position.y;
      // only the kart and driver here: no shield bubble, boost flame or drift sparks
      for (const fx of [ride.shield, ride.flame, ride.marker, ride.glider, ...ride.sparks]) fx.visible = false;
      podium.add(ride.root);
    },
    // 'pick' = character chosen (a little hop) · 'ready' = all set (a hop, a spin and a cheer)
    celebrate(kind) {
      cheer = kind === 'ready' ? 1.3 : 0.6;
      spin = kind === 'ready' ? Math.PI * 2 : 0;
      ride?.anim?.play(kind === 'ready' ? 'Yes' : 'Wave');
    },
    update(dt) {
      t += dt;
      if (!ride) return;
      cheer = Math.max(0, cheer - dt);
      const hop = cheer > 0 ? Math.abs(Math.sin(cheer * 4.2)) * 0.45 : 0;
      const turn = dt * 0.5 + (spin > 0 ? Math.min(spin, dt * 5.5) : 0);
      spin = Math.max(0, spin - dt * 5.5);
      ride.root.rotation.y += turn; // the turntable
      // idle: a small bounce of the whole kart, the driver bobbing a touch behind it
      ride.root.position.y = hop + Math.abs(Math.sin(t * 2.6)) * 0.035;
      ride.driver.position.y = ride.seatY + Math.sin(t * 5.2) * 0.012;
      ride.anim?.mixer.update(dt);
    },
    dispose() {
      scene.traverse((o) => { o.geometry?.dispose(); });
    },
  };
}
