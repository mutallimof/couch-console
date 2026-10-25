// Turbo Karts particles with three.quarks (Phase 55): exhaust puffs, drift sparks, boost flames, dust
// and finish-line confetti. Every kart carries a few small systems on its body (the particles are
// left behind in the world); confetti is a one-off burst. If the library can't load, the older point
// effects in karts-fx.js keep working (createQuarks() then resolves to null).

const soft = (THREE, draw, size = 64) => {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
};

export async function createQuarks(THREE, scene) {
  let Q;
  try { Q = await import('three.quarks'); } catch (err) { console.warn('No three.quarks:', err.message); return null; }
  const { BatchedRenderer, ParticleSystem, ConeEmitter, ConstantValue, IntervalValue, ConstantColor, Gradient, ColorOverLife, SizeOverLife, ApplyForce,
    RotationOverLife, PiecewiseBezier, Bezier, RenderMode } = Q;
  const V4 = (r, g, b, a = 1) => new THREE.Vector4(r, g, b, a);
  const V3 = (r, g, b) => new THREE.Vector3(r, g, b);
  const batch = new BatchedRenderer();
  scene.add(batch);

  // Pictures made on the spot: a soft puff, a bright dot, a flame drop, a confetti square
  const puffTex = soft(THREE, (x, s) => { const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, s, s); });
  const dotTex = soft(THREE, (x, s) => { const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, s, s); });
  const squareTex = soft(THREE, (x, s) => { x.fillStyle = '#fff'; x.beginPath(); x.roundRect(s * 0.18, s * 0.28, s * 0.64, s * 0.44, 4); x.fill(); });
  const mat = (map, additive) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false });
  const MAT = { puff: mat(puffTex, false), glow: mat(dotTex, true), confetti: mat(squareTex, false) };
  const fade = (from = 1) => new ColorOverLife(new Gradient([[V3(1, 1, 1), 0], [V3(1, 1, 1), 1]], [[from, 0], [0, 1]]));
  const sizeCurve = (a, b, c, d) => new SizeOverLife(new PiecewiseBezier([[new Bezier(a, b, c, d), 0]]));
  const down = V3(0, -1, 0);

  // The cone emitter shoots along its local +z (checked in the browser): "backwards" for a kart is -z
  function system(opts, parent, pos, spin = [0, 0, 0]) {
    const ps = new ParticleSystem({ looping: true, duration: 1, worldSpace: true, ...opts });
    ps.emitter.position.set(...pos);
    ps.emitter.rotation.set(...spin);
    parent.add(ps.emitter);
    batch.addSystem(ps);
    return ps;
  }
  const BACK = [0, Math.PI, 0];
  const constants = new Map(); // one shared ConstantValue per number
  const constant = (v) => { let c = constants.get(v); if (!c) constants.set(v, (c = new ConstantValue(v))); return c; };

  return {
    // The small systems of one kart (call detach(rig) when the race is cleared)
    // lite: for computer drivers: only the exhaust puffs and the boost flame (fewer particle systems to update)
    attach(body, { x = 0, y = 0.62, z = -1.7, lite = false } = {}) {
      const exhaust = system({
        maxParticle: 50, startLife: new IntervalValue(0.45, 0.8), startSpeed: new IntervalValue(1.2, 2.4), startSize: new IntervalValue(0.35, 0.6), startColor: new ConstantColor(V4(0.78, 0.8, 0.86, 0.55)),
        emissionOverTime: new ConstantValue(0), shape: new ConeEmitter({ radius: 0.35, thickness: 1, angle: 0.22, arc: Math.PI * 2 }), material: MAT.puff, renderMode: RenderMode.BillBoard,
        behaviors: [fade(0.5), sizeCurve(0.5, 1.1, 1.6, 2.1), new ApplyForce(V3(0, 1, 0), new ConstantValue(0.6))],
      }, body, [x, y, z], BACK);
      const flame = system({
        maxParticle: 90, startLife: new IntervalValue(0.16, 0.3), startSpeed: new IntervalValue(6, 10), startSize: new IntervalValue(0.16, 0.3), startColor: new ConstantColor(V4(1.6, 0.8, 0.25, 1)),
        emissionOverTime: new ConstantValue(0), shape: new ConeEmitter({ radius: 0.32, thickness: 1, angle: 0.14, arc: Math.PI * 2 }), material: MAT.glow, renderMode: RenderMode.BillBoard,
        behaviors: [new ColorOverLife(new Gradient([[V3(1.8, 1.1, 0.35), 0], [V3(1.4, 0.3, 0.05), 1]], [[0.8, 0], [0, 1]])), sizeCurve(1, 0.9, 0.5, 0.1)],
      }, body, [x, y, z - 0.1], BACK);
      if (lite) return { exhaust, flame, tier: -1, dustUntil: 0 };
      const sparks = system({
        maxParticle: 140, startLife: new IntervalValue(0.18, 0.4), startSpeed: new IntervalValue(5, 11), startSize: new IntervalValue(0.12, 0.22), startColor: new ConstantColor(V4(2.4, 2.2, 1.6, 1)),
        emissionOverTime: new ConstantValue(0), shape: new ConeEmitter({ radius: 0.8, thickness: 1, angle: 0.9, arc: Math.PI * 2 }), material: MAT.glow, renderMode: RenderMode.StretchedBillBoard,
        rendererEmitterSettings: { speedFactor: 0.07, lengthFactor: 0 },
        behaviors: [fade(1), new ApplyForce(down, new ConstantValue(14))],
      }, body, [0, 0.2, -1.2], [-0.5, Math.PI, 0]);
      const dust = system({
        maxParticle: 70, startLife: new IntervalValue(0.5, 1.0), startSpeed: new IntervalValue(1.5, 4), startSize: new IntervalValue(0.6, 1.1), startColor: new ConstantColor(V4(0.82, 0.74, 0.6, 0.5)),
        emissionOverTime: new ConstantValue(0), shape: new ConeEmitter({ radius: 0.9, thickness: 1, angle: 0.8, arc: Math.PI * 2 }), material: MAT.puff, renderMode: RenderMode.BillBoard,
        behaviors: [fade(0.55), sizeCurve(0.5, 1.2, 1.8, 2.2), new ApplyForce(V3(0, 1, 0), new ConstantValue(1.2))],
      }, body, [0, 0.1, -1.2], [-1.2, Math.PI, 0]);
      return { exhaust, flame, sparks, dust, tier: -1, dustUntil: 0 };
    },
    // Set what a kart is doing right now (every frame). speed: m/s · boost: seconds left · drift: charge tier 0..3 or -1 · air: gliding or jumping · offroad: on the grass
    state(rig, { speed, boost, drift, air, offroad, color, dustColor, dustScale = 1, sparkScale = 1 }, now) {
      // (set only what changed: building a new ConstantValue every frame for every kart made a lot of garbage)
      const set = (ps, key, value) => { if (ps[`_${key}`] !== value) { ps[`_${key}`] = value; ps.emissionOverTime = constant(value); } };
      set(rig.exhaust, 'e', !air && speed > 6 && boost <= 0 ? 16 : 0);
      set(rig.flame, 'e', boost > 0 ? 60 : 0);
      if (rig.sparks) {
        set(rig.sparks, 'e', drift >= 0 && !air && speed > 10 ? (drift ? 130 : 55) * sparkScale : 0);
        if (drift >= 0 && drift !== rig.tier) { rig.tier = drift; rig.sparks.startColor = new ConstantColor(color(drift)); }
      }
      if (rig.dust) {
        const kicking = (offroad && speed > 8) || now < rig.dustUntil || (drift >= 0 && !air && speed > 12); // grass, a landing, or a drift
        set(rig.dust, 'e', kicking ? (offroad ? 55 : 32) * dustScale : 0);
        if (dustColor && rig.dustKey !== dustColor) { rig.dustKey = dustColor; rig.dust.startColor = new ConstantColor(dustColor); }
      }
    },
    // A puff of dust for a moment (landing after a jump, bumping a wall)
    puffDust(rig, now, seconds = 0.25) { rig.dustUntil = now + seconds; },
    detach(rig) { for (const ps of [rig.exhaust, rig.flame, rig.sparks, rig.dust].filter(Boolean)) { batch.deleteSystem(ps); ps.emitter.removeFromParent(); ps.dispose?.(); } },
    // Confetti fountain at a place (the finish line): six colors, thrown up and out
    confetti(x, y, z) {
      for (const c of [[3, 0.9, 0.7], [0.8, 2.4, 3], [3, 2.6, 0.5], [1, 2.8, 1.2], [2.4, 0.9, 3], [3, 1.5, 0.4]]) {
        const ps = new ParticleSystem({
          looping: false, duration: 0.2, autoDestroy: true, worldSpace: true, maxParticle: 60, startLife: new IntervalValue(2.2, 3.6), startSpeed: new IntervalValue(9, 17), startSize: new IntervalValue(0.28, 0.5),
          startRotation: new IntervalValue(0, 6.28), startColor: new ConstantColor(V4(...c, 1)), emissionOverTime: new ConstantValue(0),
          emissionBursts: [{ time: 0, count: new ConstantValue(22), cycle: 1, interval: 0.01, probability: 1 }],
          shape: new ConeEmitter({ radius: 0.6, thickness: 1, angle: 0.75, arc: Math.PI * 2 }), material: MAT.confetti, renderMode: RenderMode.BillBoard,
          behaviors: [new ApplyForce(down, new ConstantValue(9)), new RotationOverLife(new IntervalValue(-7, 7), false), new ColorOverLife(new Gradient([[V3(1, 1, 1), 0], [V3(1, 1, 1), 1]], [[1, 0], [1, 0.8], [0, 1]]))],
        });
        ps.emitter.position.set(x, y, z);
        ps.emitter.rotation.set(-Math.PI / 2, 0, 0); // up
        scene.add(ps.emitter);
        batch.addSystem(ps);
      }
    },
    update(dt) { batch.update(dt); },
    dispose() { scene.remove(batch); },
  };
}
