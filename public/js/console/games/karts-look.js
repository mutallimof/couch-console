// Turbo Karts rendering: reflections, a soft glow on bright things (boost flames, drift
// sparks, neon) and a gentle vignette. Each split-screen view gets its own effect chain.
// If the laptop can't keep up (under ~40 frames per second for a few seconds), the effects
// switch off by themselves and the game renders plainly, like before.
// Console link options: ?fx=on (always on) · ?fx=off (always off).

const LOW_FPS = 40;
const LOW_FOR_S = 3;

const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, uStrength: { value: 0.55 }, uSize: { value: 0.78 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uStrength, uSize; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float d = distance(vUv, vec2(0.5));
      c.rgb *= mix(1.0, smoothstep(uSize, uSize - 0.5, d), uStrength);
      gl_FragColor = c;
    }`,
};

// force: 'on' (never switch off by itself) · 'off' (plain rendering) · null (automatic)
export async function createLook(THREE, renderer, scene, force = null) {
  // Reflections: made from each track's own sky and ground colors (see setTrack), so paint and
  // metal reflect a blue sky in the park and a purple glow in the city. No image files.
  const pmrem = new THREE.PMREMGenerator(renderer);
  function environmentFor(def) {
    const envScene = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 32, 16), colors = [];
    const top = new THREE.Color(def.sky[0]), horizon = new THREE.Color(def.sky[1]), ground = new THREE.Color(def.ground);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 10; // -1 (straight down) .. 1 (straight up)
      const c = y > 0 ? horizon.clone().lerp(top, Math.min(1, y * 1.6)) : horizon.clone().lerp(ground, Math.min(1, -y * 4));
      c.multiplyScalar(def.night ? 0.5 : 0.8);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    envScene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const tex = pmrem.fromScene(envScene, 0.02).texture;
    geo.dispose();
    return tex;
  }

  let addons = null;
  try {
    const [c, r, b, s, o] = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'), import('three/addons/postprocessing/ShaderPass.js'),
      import('three/addons/postprocessing/OutputPass.js')]);
    addons = { EffectComposer: c.EffectComposer, RenderPass: r.RenderPass, UnrealBloomPass: b.UnrealBloomPass, ShaderPass: s.ShaderPass, OutputPass: o.OutputPass };
  } catch (err) { console.warn('No screen effects:', err.message); }

  const chains = [];          // one effect chain per split-screen view
  let enabled = !!addons && force !== 'off';
  let low = 0, frames = 0, last = performance.now(), fps = 60;
  let bloomStrength = 0.4;

  function chain(i, w, h) {
    let c = chains[i];
    if (!c) {
      const composer = new addons.EffectComposer(renderer);
      const pass = new addons.RenderPass(scene, null);
      // threshold 2: only things brighter than sunlit white glow (boost flames, sparks, neon, the sun)
      const bloom = new addons.UnrealBloomPass(new THREE.Vector2(w, h), bloomStrength, 0.35, 2);
      composer.addPass(pass);
      composer.addPass(bloom);
      composer.addPass(new addons.ShaderPass(VignetteShader));
      composer.addPass(new addons.OutputPass()); // last: tone mapping + colors for the screen
      c = chains[i] = { composer, pass, bloom, w: 0, h: 0 };
    }
    if (c.w !== w || c.h !== h) {
      c.composer.setPixelRatio(renderer.getPixelRatio());
      c.composer.setSize(w, h);
      c.w = w; c.h = h;
    }
    return c;
  }

  return {
    get enabled() { return enabled; },
    get fps() { return fps; },
    // Neon city wants more glow than a sunny park
    setTrack(def) {
      scene.environment?.dispose();
      scene.environment = environmentFor(def);
      bloomStrength = def.night ? 0.75 : 0.35;
      for (const c of chains) if (c) c.bloom.strength = bloomStrength;
    },
    // Draw view i (camera) into the screen rectangle x, y, w, h (pixels, from the bottom left)
    render(i, camera, x, y, w, h) {
      renderer.setViewport(x, y, w, h);
      renderer.setScissor(x, y, w, h);
      if (!enabled) { renderer.render(scene, camera); return; }
      const c = chain(i, w, h);
      c.pass.camera = camera;
      c.composer.render();
    },
    // Call once per frame: watches the frame rate and turns the effects off if it's too low
    tick(dt) {
      frames++;
      const now = performance.now();
      if (now - last >= 1000) { fps = Math.round((frames * 1000) / (now - last)); frames = 0; last = now; }
      if (!enabled || force === 'on') return;
      low = fps < LOW_FPS ? low + dt : 0;
      if (low > LOW_FOR_S) { enabled = false; console.info('Turbo Karts: screen effects off (low frame rate)'); }
    },
    setEnabled(on) { enabled = on && !!addons; low = 0; },
    dispose() {
      for (const c of chains) c?.composer.dispose();
      chains.length = 0;
      scene.environment?.dispose();
      pmrem.dispose();
    },
  };
}
