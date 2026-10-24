// Turbo Karts effects: drift sparks that streak away from the rear wheels (blue, then orange,
// then purple as the drift charges), tyre smoke, a sparkle burst when an item box breaks, and a
// flickering exhaust flame while boosting. One shared pool of particles, drawn in a single call.
// Adapted from OpenWii's games/mario-kart/race-effects.js and boost-effect.js (MIT, see
// THIRD_PARTY_NOTICES.md): same techniques, rewritten for our karts and coordinates.

export const TIER_COLORS = ['#FFF0C0', '#22CAFF', '#FF941F', '#E451FF']; // none · blue · orange · purple

// kind: 0 = spark streak (stretched along its motion), 1 = soft smoke puff, 2 = star glint, 3 = round flash
export function createRaceFx(THREE, scene) {
  const COUNT = 1400;
  const parts = Array.from({ length: COUNT }, () => ({ life: 0 }));
  let cursor = 0;
  const pos = new Float32Array(COUNT * 3), col = new Float32Array(COUNT * 3), vel = new Float32Array(COUNT * 3);
  const size = new Float32Array(COUNT), alpha = new Float32Array(COUNT), kind = new Float32Array(COUNT);
  const geo = new THREE.BufferGeometry();
  for (const [name, arr, n] of [['position', pos, 3], ['color', col, 3], ['velocity', vel, 3], ['size', size, 1], ['alpha', alpha, 1], ['kind', kind, 1]]) {
    geo.setAttribute(name, new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage));
  }
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { viewport: { value: 600 } },
    vertexShader: `attribute vec3 color; attribute vec3 velocity; attribute float size; attribute float alpha; attribute float kind;
      uniform float viewport; varying vec3 tint; varying float opacity; varying float type; varying vec2 dir;
      void main(){
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        vec4 q = projectionMatrix * p;
        vec4 next = projectionMatrix * (p + modelViewMatrix * vec4(velocity * 0.02, 0.0));
        dir = normalize(next.xy / next.w - q.xy / q.w + vec2(0.00001));
        tint = color; opacity = alpha; type = kind;
        gl_Position = q;
        gl_PointSize = clamp(size * viewport * projectionMatrix[1][1] / max(0.1, -p.z), 1.0, 120.0);
      }`,
    fragmentShader: `varying vec3 tint; varying float opacity; varying float type; varying vec2 dir;
      void main(){
        vec2 p = (gl_PointCoord - 0.5) * 2.0; float density; float core = 0.0;
        if (type < 0.5) {            // a curved streak along the direction of motion
          vec2 d = vec2(dir.x, -dir.y); float along = dot(p, d), across = dot(p, vec2(-d.y, d.x));
          float curve = across - 0.2 * (along * along - 0.3); float taper = smoothstep(1.0, 0.15, abs(along));
          density = (exp(-curve * curve * 35.0) * 0.55 + exp(-curve * curve * 220.0)) * taper;
          core = exp(-curve * curve * 380.0) * taper * 0.85;
        } else if (type < 1.5) {     // smoke
          float r = length(p); density = exp(-r * r * 4.0) * smoothstep(1.0, 0.65, r);
        } else if (type < 2.5) {     // four-point star
          float r = length(p);
          float rays = exp(-abs(p.x) * 32.0) * exp(-abs(p.y) * 3.0) + exp(-abs(p.y) * 32.0) * exp(-abs(p.x) * 3.0);
          density = (rays + exp(-r * r * 18.0)) * smoothstep(1.0, 0.7, r); core = exp(-r * r * 55.0);
        } else {                     // round flash
          float r = length(p); density = (exp(-r * r * 6.0) * 0.65 + exp(-r * r * 48.0)) * smoothstep(1.0, 0.6, r); core = exp(-r * r * 70.0);
        }
        float a = opacity * density; if (a < 0.006) discard;
        gl_FragColor = vec4(mix(tint, vec3(1.0), core) * 2.2, min(1.0, a)); // (bright: the glow picks it up)
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  const tmp = new THREE.Color();

  function emit(x, y, z, vx, vy, vz, color, sz, life, k = 0) {
    Object.assign(parts[cursor], { x, y, z, vx, vy, vz, color, size: sz, life, total: life, kind: k });
    cursor = (cursor + 1) % COUNT;
  }

  const tyre = new WeakMap(); // per kart: leftover spark "debt" and the last tier (for the flash when it goes up)
  return {
    // Drift sparks from both rear wheels. tier 0..3 (0 = drifting but not charged yet)
    drift(k, tier, dt) {
      let s = tyre.get(k);
      if (!s) tyre.set(k, (s = { debt: 0, tier: 0 }));
      if (!k.drifting || k.air || k.v < 10) { s.debt = 0; s.tier = 0; return; }
      const fx = Math.sin(k.heading), fz = Math.cos(k.heading), rx = -fz, rz = fx; // forward, right
      const color = TIER_COLORS[tier];
      s.debt += dt * (tier ? 130 : 60);
      const amount = Math.min(7, Math.floor(s.debt)); s.debt -= amount;
      const flare = tier > s.tier; s.tier = tier; // the charge just went up: a bigger burst
      for (const side of [-1, 1]) {
        const x = k.x - fx * 1.3 + rx * side * 0.95, y = k.y + 0.15, z = k.z - fz * 1.3 + rz * side * 0.95;
        if (tier) emit(x, y, z, fx * k.v * 0.7, 0, fz * k.v * 0.7, color, flare ? 1.45 : 0.48 + Math.random() * 0.18, flare ? 0.15 : 0.045, 3);
        for (let i = 0; i < amount + (flare ? 12 : 0); i++) {
          const lat = side * (1.5 + Math.random() * 5), lift = 0.5 + Math.random() * 3, back = 2 + Math.random() * 6;
          emit(x, y, z, -fx * back + rx * lat, lift, -fz * back + rz * lat, color, (flare ? 0.48 : 0.2) + Math.random() * 0.2, 0.12 + Math.random() * 0.13, 0);
          if (i === 0) {
            emit(x, y, z, -fx, 0.7, -fz, '#A3A9B3', 0.55, 0.4, 1); // a little tyre smoke
            if (tier) emit(x, y, z, -fx * back + rx * lat, lift, -fz * back + rz * lat, color, 0.28, 0.16, 2);
          }
        }
      }
    },
    // Sparkles when an item box breaks (or any happy burst)
    burst(x, y, z, palette = ['#80EFFF', '#F2AFFF', '#E4FFFF', '#969AFF', '#8FFFD9']) {
      for (let i = 0; i < 28; i++) {
        const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 0.6, sp = 3 + Math.random() * 6;
        emit(x, y, z, Math.cos(a) * sp, u * sp, Math.sin(a) * sp, palette[i % palette.length], 0.3 + Math.random() * 0.45, 0.3 + Math.random() * 0.3, i % 3 ? 2 : 3);
      }
      emit(x, y, z, 0, 0, 0, '#EDFFFF', 3.1, 0.14, 3);
    },
    update(dt) {
      for (let i = 0; i < COUNT; i++) {
        const p = parts[i];
        if (p.life <= 0) { alpha[i] = 0; size[i] = 0; continue; }
        p.life = Math.max(0, p.life - dt);
        const age = 1 - p.life / p.total;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.kind === 0) p.vy -= 12 * dt; else if (p.kind === 2) p.vy -= 5 * dt; // sparks fall
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        vel[i * 3] = p.vx; vel[i * 3 + 1] = p.vy; vel[i * 3 + 2] = p.vz;
        tmp.set(p.color); col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
        kind[i] = p.kind;
        size[i] = p.size * (p.kind === 1 ? 1 + age * 1.8 : 1);
        alpha[i] = (1 - age) * (p.kind === 1 ? 0.22 : 1);
      }
      for (const a of Object.values(geo.attributes)) a.needsUpdate = true;
    },
    // Point sizes are in screen pixels: tell it how tall the view being drawn is
    setViewport(heightPx) { mat.uniforms.viewport.value = heightPx; },
    clear() { for (const p of parts) p.life = 0; },
    dispose() { scene.remove(points); geo.dispose(); mat.dispose(); },
  };
}

// The boost flame: two flickering, curling jets out of the back of the kart (add it to the kart
// body, so it follows the kart's tilt). updateExhaust(mesh, boostSecondsLeft, time) each frame.
export function makeExhaust(THREE, { x = 0.45, y = 0.62, z = -1.75, length = 2.6 } = {}) {
  const positions = [], uv = [], flare = [], phase = [];
  for (const side of [-1, 1]) {
    // three crossed planes along the jet, plus one facing backwards for the bright mouth
    for (let plane = 0; plane < 4; plane++) {
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]]) {
        const w = (u - 0.5) * 0.9, h = plane === 3 ? (v - 0.5) * 0.55 : 0, d = plane === 3 ? -0.015 : -v * length;
        const px = plane === 1 ? 0 : plane === 2 ? w * 0.707 : w, py = plane === 1 ? w : plane === 2 ? w * 0.707 : h;
        positions.push(px + side * x, py + y, d + z); uv.push(u, v); flare.push(plane === 3 ? 1 : 0); phase.push(side * 1.7);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('flare', new THREE.Float32BufferAttribute(flare, 1));
  g.setAttribute('phase', new THREE.Float32BufferAttribute(phase, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, strength: { value: 0 } },
    vertexShader: `attribute float flare; attribute float phase; varying vec2 vUv; varying float vFlare; varying float vPhase;
      void main(){ vUv = uv; vFlare = flare; vPhase = phase; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float time; uniform float strength; varying vec2 vUv; varying float vFlare; varying float vPhase;
      void main(){
        float pulse = 0.9 + 0.1 * sin(time * 43.0 + vPhase); float density;
        if (vFlare > 0.5) { vec2 p = (vUv - 0.5) * 2.0; density = exp(-dot(p, p) * 9.0) * 0.45; }
        else {
          float t = vUv.y;
          float bend = (sin(t * 18.0 - time * 38.0 + vPhase) * 0.055 + sin(t * 37.0 - time * 59.0) * 0.025) * t;
          float width = (0.18 + 0.12 * sin(t * 3.14159)) * (1.0 - t) * (0.84 + 0.16 * sin(t * 23.0 - time * 51.0 + vPhase));
          float x = abs(vUv.x - 0.5 + bend);
          density = exp(-pow(x / max(0.005, width), 2.0) * 2.0) * pow(max(0.0, 1.0 - t), 0.6) * pulse;
        }
        float a = min(1.0, density * strength * 1.25); if (a < 0.008) discard;
        vec3 c = mix(vec3(1.0, 0.3, 0.004), vec3(1.0, 0.96, 0.4), smoothstep(0.22, 0.75, density));
        gl_FragColor = vec4(c * 2.4, a);
      }`,
  });
  const mesh = new THREE.Mesh(g, material);
  mesh.visible = false;
  mesh.frustumCulled = false;
  return mesh;
}
export function updateExhaust(mesh, boost, time) {
  mesh.visible = boost > 0;
  mesh.material.uniforms.time.value = time;
  mesh.material.uniforms.strength.value = Math.min(1, Math.max(0, boost) / 0.12);
}
