// Skid marks: dark tyre streaks that stay on the road for a few seconds and fade. A ring buffer of ribbon quads in one mesh
// (a single draw call): each wheel remembers where its last quad ended and adds the next piece once it has moved a little.
export function createSkids(THREE, scene, { max = 2600, life = 9 } = {}) {
  const pos = new Float32Array(max * 12), birth = new Float32Array(max * 4).fill(-1000), idx = new Uint32Array(max * 6);
  for (let i = 0; i < max; i++) { const v = i * 4; idx.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], i * 6); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('birth', new THREE.BufferAttribute(birth, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: { now: { value: 0 }, life: { value: life }, opacity: { value: 0.6 } },
    vertexShader: 'attribute float birth; varying float vAge; uniform float now; void main(){ vAge = now - birth; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying float vAge; uniform float life, opacity; void main(){ float a = opacity * clamp(1.0 - vAge / life, 0.0, 1.0) * smoothstep(0.0, 0.15, vAge + 0.15); if (a < 0.01) discard; gl_FragColor = vec4(0.04, 0.04, 0.06, a); }',
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 2;
  scene.add(mesh);
  let cursor = 0, now = 0;
  const wheels = new Map(); // key -> { x, y, z, live }
  return {
    // One wheel at a place. active=false lifts the pen. width in meters.
    wheel(key, x, y, z, active, width = 0.34) {
      const w = wheels.get(key) || { live: false };
      wheels.set(key, w);
      if (!active) { w.live = false; return; }
      if (!w.live) { Object.assign(w, { x, y, z, live: true, dx: 0, dz: 0 }); return; }
      const dx = x - w.x, dz = z - w.z, d = Math.hypot(dx, dz);
      if (d < 0.45) return;
      if (d > 6) { Object.assign(w, { x, y, z }); return; } // (teleport or lap wrap: start a new streak)
      const nx = (-dz / d) * width / 2, nz = (dx / d) * width / 2, v = cursor * 4;
      pos.set([w.x - nx, w.y + 0.07, w.z - nz, w.x + nx, w.y + 0.07, w.z + nz, x - nx, y + 0.07, z - nz, x + nx, y + 0.07, z + nz], v * 3);
      birth.fill(now, v, v + 4);
      cursor = (cursor + 1) % max;
      Object.assign(w, { x, y, z });
      geo.attributes.position.needsUpdate = true; geo.attributes.birth.needsUpdate = true;
    },
    update(t, opacity = 0.6) { now = t; mat.uniforms.now.value = t; mat.uniforms.opacity.value = opacity; },
    clear() { birth.fill(-1000); wheels.clear(); geo.attributes.birth.needsUpdate = true; },
    dispose() { scene.remove(mesh); geo.dispose(); mat.dispose(); },
  };
}
