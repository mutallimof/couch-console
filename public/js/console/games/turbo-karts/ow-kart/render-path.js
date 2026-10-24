// Turns a track model (track-model.js, what the rules drive on) into the centre line the track
// builder (kart-track.js) draws from: the same points, so the road you SEE is the road you DRIVE on.
export const SAMPLES = 1000;

export function renderPath(THREE, model) {
  const pts = [], tan = [], nor = [];
  for (let i = 0; i < SAMPLES; i++) {
    const p = model.surfaceAt((i / SAMPLES) * model.length, 0);
    pts.push(new THREE.Vector3(p.x, p.y, p.z));
    tan.push(new THREE.Vector3(p.tx, 0, p.tz));
    nor.push(new THREE.Vector3(p.rx, 0, p.rz)); // to the driver's right
  }
  const at = (i) => ((Math.round(i) % SAMPLES) + SAMPLES) % SAMPLES;
  const index = (s) => at((s / model.length) * SAMPLES);
  return {
    pts, tan, nor, SAMPLES, length: model.length, at, def: model.def, model,
    roadHalf: model.roadHalf, wallHalf: model.wallHalf,
    pads: model.boostPads.map((p) => ({ i: index(p.s), side: p.lateral })),
    glides: model.glides.map((g) => ({ i: index(g.start) })),
  };
}
