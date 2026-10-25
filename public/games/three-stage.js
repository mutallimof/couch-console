// Shared setup for the 3D games: loads Three.js, makes a renderer, scene, camera and lights
// that fill the container, keeps them sized to it, and cleans everything up afterwards.

let THREE = null;

// Resolves to { THREE, scene, camera, renderer, root, dispose() }, or null if the game was
// closed while loading (isAlive() returned false).
export async function createStage(container, { sky = '#BFE3FF', fog = null, fov = 50, isAlive = () => true } = {}) {
  const root = document.createElement('div');
  root.className = 'stage3d';
  root.innerHTML = '<div class="stage3d-loading">Loading…</div>';
  container.append(root);
  try {
    THREE ??= await import('three');
  } catch (err) {
    root.querySelector('.stage3d-loading').textContent = 'Could not load the 3D engine. Did you run `npm install`?';
    console.error(err);
    return null;
  }
  if (!isAlive()) { root.remove(); return null; }
  root.querySelector('.stage3d-loading').remove();

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.className = 'game-canvas';
  root.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(sky);
  if (fog) scene.fog = new THREE.Fog(sky, fog[0], fog[1]);
  scene.add(new THREE.HemisphereLight('#ffffff', '#8a7a6a', 1.0));
  const sun = new THREE.DirectionalLight('#ffffff', 1.6);
  sun.position.set(3, 8, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 200);

  function resize() {
    const w = root.clientWidth, h = root.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(root);
  resize();

  return {
    THREE, scene, camera, renderer, root, sun,
    render: () => renderer.render(scene, camera),
    dispose() {
      observer.disconnect();
      scene.traverse((o) => {
        o.geometry?.dispose();
        [].concat(o.material || []).forEach((m) => { m.map?.dispose(); m.dispose(); });
      });
      renderer.dispose();
      root.remove();
    },
  };
}
