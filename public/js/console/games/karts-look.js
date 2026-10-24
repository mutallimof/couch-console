// Turbo Karts rendering: reflections, a soft glow on bright things (boost flames, drift
// sparks, neon) and a gentle vignette. Each split-screen view gets its own effect chain.
// Colors go through "PBR Neutral" tone mapping (Khronos), which keeps bright cartoon colors
// saturated instead of washing them out like the ACES curve did; the effect chain renders
// with 4x multisampling so edges stay smooth. (Techniques as in OpenWii's kart game, MIT.)
// If the laptop can't keep up (under ~40 frames per second for a few seconds), the effects
// switch off by themselves and the game renders plainly, like before.
// Console link options: ?fx=on (always on) · ?fx=off (always off).

const LOW_FPS = 40;
const LOW_FOR_S = 3;

// Khronos PBR Neutral tone mapping (three.js r160 doesn't have it yet)
const neutral = (name) => `vec3 ${name}(vec3 color) {
    const float start = 0.8 - 0.04; const float desaturation = 0.15;
    float x = min(color.r, min(color.g, color.b));
    float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
    color -= offset;
    float peak = max(color.r, max(color.g, color.b));
    if (peak < start) return color;
    float d = 1.0 - start;
    float newPeak = 1.0 - d * d / (peak + d - start);
    color *= newPeak / peak;
    float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
    return mix(color, vec3(newPeak), g);
  }`;

// Use it for everything drawn straight to the screen (renderer.toneMapping = CustomToneMapping)
let patched = false;
function patchToneMapping(THREE) {
  if (patched) return;
  patched = true;
  THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
    'vec3 CustomToneMapping( vec3 color ) { return color; }',
    `${neutral('neutralTone')}\nvec3 CustomToneMapping( vec3 color ) { return neutralTone( color * toneMappingExposure ); }`);
}

// The last step of the effect chain: vignette, tone mapping and screen colors in one pass
const FinalShader = {
  uniforms: { tDiffuse: { value: null }, uStrength: { value: 0.45 }, uSize: { value: 0.8 }, uExposure: { value: 1.05 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uStrength, uSize, uExposure; varying vec2 vUv;
    ${neutral('finalNeutral')} // (own name: three.js may also include the screen's version)
    vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float d = distance(vUv, vec2(0.5));
      c *= mix(1.0, smoothstep(uSize, uSize - 0.5, d), uStrength);
      gl_FragColor = vec4(toSRGB(clamp(finalNeutral(c * uExposure), 0.0, 1.0)), 1.0);
    }`,
};

// force: 'on' (never switch off by itself) · 'off' (plain rendering) · null (automatic)
export async function createLook(THREE, renderer, scene, force = null) {
  patchToneMapping(THREE);
  renderer.toneMapping = THREE.CustomToneMapping;
  renderer.toneMappingExposure = 1.05;
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
    const [c, r, b, s] = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'), import('three/addons/postprocessing/ShaderPass.js')]);
    addons = { EffectComposer: c.EffectComposer, RenderPass: r.RenderPass, UnrealBloomPass: b.UnrealBloomPass, ShaderPass: s.ShaderPass };
  } catch (err) { console.warn('No screen effects:', err.message); }

  const chains = [];          // one effect chain per split-screen view
  let enabled = !!addons && force !== 'off';
  let low = 0, frames = 0, last = performance.now(), fps = 60;
  let bloomStrength = 0.4;

  function chain(i, w, h) {
    let c = chains[i];
    if (!c) {
      // half-float (so bright things stay brighter than white until the end) and 4x multisampled
      const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
      const composer = new addons.EffectComposer(renderer, target);
      const pass = new addons.RenderPass(scene, null);
      // threshold 2: only things brighter than sunlit white glow (boost flames, sparks, neon, the sun)
      const bloom = new addons.UnrealBloomPass(new THREE.Vector2(w, h), bloomStrength, 0.4, 2);
      composer.addPass(pass);
      composer.addPass(bloom);
      composer.addPass(new addons.ShaderPass(FinalShader)); // last: vignette + tone mapping + screen colors
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
