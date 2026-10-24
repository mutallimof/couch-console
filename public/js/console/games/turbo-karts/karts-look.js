// Turbo Karts rendering: reflections, a soft glow on bright things (boost flames, drift
// sparks, neon) and a gentle vignette. Each split-screen view gets its own effect chain.
// Colors go through "PBR Neutral" tone mapping (Khronos), which keeps bright cartoon colors
// saturated instead of washing them out like the ACES curve did; the effect chain renders
// with 4x multisampling so edges stay smooth. (Techniques as in OpenWii's kart game, MIT.)
// If the laptop can't keep up (under ~40 frames per second for a few seconds), the effects
// switch off by themselves and the game renders plainly, like before.
// Console link options: ?fx=on (always on) · ?fx=off (always off).

import { STYLE } from './karts-style.js';

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

// Cartoon outlines: dark lines where the distance to the camera jumps (edges of karts, characters,
// buildings, barriers). Uses the depth the scene was drawn with.
const EdgeShader = {
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, uTexel: { value: null }, uNear: { value: 0.1 }, uFar: { value: 1800 }, uStrength: { value: 0.5 }, uWidth: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse, tDepth; uniform vec2 uTexel; uniform float uNear, uFar, uStrength, uWidth; varying vec2 vUv;
    float lin(vec2 uv) { float z = texture2D(tDepth, uv).x * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec2 o = uTexel * uWidth;
      float d = lin(vUv);
      float e = max(max(abs(lin(vUv + vec2(o.x, 0.0)) - d), abs(lin(vUv - vec2(o.x, 0.0)) - d)),
                    max(abs(lin(vUv + vec2(0.0, o.y)) - d), abs(lin(vUv - vec2(0.0, o.y)) - d)));
      // a jump bigger than a few percent of the distance is an edge (so far-away detail doesn't turn black)
      float edge = smoothstep(0.035, 0.09, e / (d * 0.5 + 1.5));
      base.rgb = mix(base.rgb, base.rgb * vec3(0.12, 0.10, 0.16), edge * uStrength);
      gl_FragColor = base;
    }`,
};

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
  uniforms: { tDiffuse: { value: null }, uStrength: { value: 0.45 }, uSize: { value: 0.8 }, uExposure: { value: 1.05 }, uToon: { value: 0 }, uLinear: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uStrength, uSize, uExposure, uToon, uLinear; varying vec2 vUv;
    ${neutral('finalNeutral')} // (own name: three.js may also include the screen's version)
    vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float d = distance(vUv, vec2(0.5));
      c *= mix(1.0, smoothstep(uSize, uSize - 0.5, d), uStrength);
      if (uToon > 0.0) {
        // Cartoon look: light falls off in a few steps (cel shading, softened), colors pop, warm lights and cool shadows
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        float steps = 5.0, banded = (floor(l * steps) + smoothstep(0.35, 0.65, fract(l * steps))) / steps;
        c *= mix(1.0, banded / max(l, 0.0005), 0.3 * uToon) * (1.0 + 0.1 * uToon); // (the little boost makes up for the steps rounding down)
        c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, 1.0 + 0.28 * uToon);
        c += uToon * (vec3(0.012, 0.004, -0.006) * l - vec3(0.006, 0.002, -0.012) * (1.0 - clamp(l, 0.0, 1.0)) * 0.5);
        c = max(c, vec3(0.0));
      }
      vec3 shown = clamp(finalNeutral(c * uExposure), 0.0, 1.0);
      gl_FragColor = vec4(uLinear > 0.5 ? shown : toSRGB(shown), 1.0); // (uLinear: the postprocessing library finishes the job and encodes sRGB itself)
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
      c.multiplyScalar(def.lighting ? def.lighting.env * 1.5 : def.night ? 0.5 : 0.8); // (a track can set its own reflection strength)
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
    // Ambient occlusion (soft contact shadows in corners and under karts), as in OpenWii. Optional.
    try { addons.GTAOPass = (await import('three/addons/postprocessing/GTAOPass.js')).GTAOPass; } catch (err) { console.warn('No ambient occlusion:', err.message); }
  } catch (err) { console.warn('No screen effects:', err.message); }

  // The postprocessing library (Phase 55): better bloom, SMAA edge smoothing and a little color grading, run
  // on the finished picture of our own chain (outlines, AO, tone mapping stay as they are). Optional.
  let lib = null;
  if (addons && force !== 'libs-off' && new URLSearchParams(location.search).get('pp') !== 'off') {
    try {
      const L = await import('postprocessing');
      const [searchImage, areaImage] = await new Promise((resolve, reject) => new L.SMAAImageLoader().load(resolve, reject));
      lib = { ...L, searchImage, areaImage };
    } catch (err) { console.warn('No postprocessing library:', err.message); }
  }

  const chains = [];          // one effect chain per split-screen view
  let enabled = !!addons && force !== 'off';
  let low = 0, frames = 0, last = performance.now(), fps = 60;
  let bloomStrength = 0.4, exposure = 1.05, aoOn = true, cartoonOn = false, libBloom = 0.35;

  function chain(i, w, h, camera) {
    let c = chains[i];
    if (!c) {
      // half-float (so bright things stay brighter than white until the end) and 4x multisampled
      const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
      target.depthTexture = new THREE.DepthTexture(w, h); // (the outlines read it)
      target.depthTexture.type = THREE.UnsignedIntType;
      const composer = new addons.EffectComposer(renderer, target);
      const pass = new addons.RenderPass(scene, null);
      // threshold 2: only things brighter than sunlit white glow (boost flames, sparks, neon, the sun)
      const bloom = new addons.UnrealBloomPass(new THREE.Vector2(w, h), bloomStrength, 0.4, 2);
      composer.addPass(pass);
      const edge = new addons.ShaderPass(EdgeShader);
      edge.uniforms.uTexel.value = new THREE.Vector2(1 / w, 1 / h);
      edge.enabled = cartoonOn;
      composer.addPass(edge);
      let ao = null;
      if (addons.GTAOPass) {
        ao = new addons.GTAOPass(scene, camera, w, h);
        ao.updateGtaoMaterial({ radius: 2.2, thickness: 1.1, distanceExponent: 1.5, samples: 8 });
        ao.updatePdMaterial({ radius: 4, samples: 8, depthPhi: 3, normalPhi: 3 });
        ao.blendIntensity = 0.6;
        ao.enabled = aoOn;
        composer.addPass(ao);
      }
      composer.addPass(bloom);
      const final = new addons.ShaderPass(FinalShader); // last: vignette + tone mapping + screen colors
      final.uniforms.uExposure.value = exposure;
      final.uniforms.uToon.value = cartoonOn ? 1 : 0;
      composer.addPass(final);
      c = chains[i] = { composer, pass, ao, edge, bloom, final, w: 0, h: 0, lib: null };
      if (lib) {
        try {
          // our chain draws into its own buffer (not the screen); the library's chain shows that picture, adds bloom + grading, then SMAA
          composer.renderToScreen = false;
          final.uniforms.uLinear.value = 1;
          const lc = new lib.EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, depthBuffer: false });
          const show = new lib.TextureEffect({ texture: null });
          const glow = new lib.BloomEffect({ intensity: libBloom, luminanceThreshold: 0.8, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.72 });
          const hue = new lib.HueSaturationEffect({ saturation: 0.12 });
          const bc = new lib.BrightnessContrastEffect({ contrast: 0.05 });
          lc.addPass(new lib.EffectPass(camera, show, glow, hue, bc));
          if (new URLSearchParams(location.search).get('pp') !== 'nosmaa') lc.addPass(new lib.EffectPass(camera, new lib.SMAAEffect({ searchImage: lib.searchImage, areaImage: lib.areaImage })));
          c.lib = { lc, show, glow };
          bloom.strength = bloomStrength * 0.5;
        } catch (err) { console.warn('postprocessing chain failed, using our own:', err.message); composer.renderToScreen = true; final.uniforms.uLinear.value = 0; lib = null; }
      }
    }
    if (c.w !== w || c.h !== h) {
      c.composer.setPixelRatio(renderer.getPixelRatio());
      c.composer.setSize(w, h);
      c.w = w; c.h = h;
      c.edge.uniforms.uTexel.value.set(1 / (w * renderer.getPixelRatio()), 1 / (h * renderer.getPixelRatio()));
      if (c.lib) { // (not lc.setSize: it would resize the whole canvas, and this view is only a part of it)
        const pw = Math.round(w * renderer.getPixelRatio()), ph = Math.round(h * renderer.getPixelRatio());
        c.lib.lc.inputBuffer.setSize(pw, ph); c.lib.lc.outputBuffer.setSize(pw, ph);
        for (const p of c.lib.lc.passes) p.setSize(pw, ph);
      }
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
      libBloom = def.night ? 0.95 : 0.3;
      for (const c of chains) if (c) { c.bloom.strength = c.lib ? bloomStrength * 0.5 : bloomStrength; if (c.lib) c.lib.glow.intensity = libBloom; }
      exposure = def.lighting?.exposure ?? 1.05; // (a track can be exposed brighter or darker)
      renderer.toneMappingExposure = exposure;
      for (const c of chains) if (c) c.final.uniforms.uExposure.value = exposure;
    },
    // Draw view i (camera) into the screen rectangle x, y, w, h (pixels, from the bottom left)
    render(i, camera, x, y, w, h) {
      renderer.setViewport(x, y, w, h);
      renderer.setScissor(x, y, w, h);
      if (!enabled) { renderer.render(scene, camera); return; }
      const c = chain(i, w, h, camera);
      c.pass.camera = camera;
      if (c.ao) c.ao.camera = camera;
      if (cartoonOn) {
        c.edge.uniforms.tDepth.value = c.composer.readBuffer.depthTexture;
        c.edge.uniforms.uNear.value = camera.near; c.edge.uniforms.uFar.value = camera.far;
      }
      c.composer.render();
      if (c.lib) {
        c.lib.show.texture = c.composer.readBuffer.texture;
        renderer.setViewport(x, y, w, h); renderer.setScissor(x, y, w, h);
        c.lib.lc.render(0.016);
      }
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
    // Ambient occlusion on/off (a bit heavier on slow laptops)
    // The cartoon look on/off: outlines, banded light, color grade (and the rim light on karts: see karts-style.js)
    setCartoon(on) {
      cartoonOn = on; STYLE.rim.value = on ? 1 : 0;
      for (const c of chains) if (c) { c.edge.enabled = on; c.final.uniforms.uToon.value = on ? 1 : 0; }
    },
    // Reflections from a real sky picture (an equirectangular HDRI) instead of the generated gradient
    setSkyTexture(tex) { scene.environment?.dispose(); scene.environment = pmrem.fromEquirectangular(tex).texture; },
    setAO(on) { aoOn = on; for (const c of chains) if (c?.ao) c.ao.enabled = on; },
    dispose() {
      for (const c of chains) { c?.composer.dispose(); c?.lib?.lc.dispose(); }
      chains.length = 0;
      scene.environment?.dispose();
      pmrem.dispose();
    },
  };
}
