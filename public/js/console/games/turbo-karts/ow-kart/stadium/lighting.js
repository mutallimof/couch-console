// The Grand Stadium's floodlights: five spot lights that move along the road with the camera, as
// in OpenWii's games/mario-kart/game.js (MIT, Copyright (c) 2026 Patrick Sun; see
// THIRD_PARTY_NOTICES.md). Pit lane and the crossing get softer, lower lights.
import { TRACK_LENGTH as L, surfaceAt } from "./track.js";

export function createStadiumLights(THREE, scene) {
  const lights = [-2, -1, 0, 1, 2].map((side) => {
    const light = new THREE.SpotLight(side < 0 ? "#c0dbff" : "#fff0d9", 1500, 72, 0.7, 0.72, 2);
    scene.add(light, light.target);
    return light;
  });
  return {
    lights,
    // Put the lights around road distance s (the kart this view follows)
    update(s) {
      for (let i = 0; i < lights.length; i++) {
        const stationIndex = Math.floor(s / 38) + i - 2, station = stationIndex * 38, side = stationIndex % 2 ? 1 : -1;
        const wrapped = ((station % L) + L) % L;
        const pit = wrapped < 82 || wrapped > L - 42, underpass = wrapped >= 95 && wrapped <= 135;
        const at = surfaceAt(station, side * (underpass ? 7 : pit ? 10 : 14));
        const light = lights[i], lift = underpass ? 6.2 : pit ? 12.7 : 15, n = at.normal || { x: 0, y: 1, z: 0 };
        light.position.set(at.x + n.x * lift, at.y + n.y * lift, at.z + n.z * lift);
        const target = surfaceAt(station + (underpass ? 1 : 6), -side * 3);
        light.target.position.set(target.x, target.y, target.z);
        light.color.set(underpass ? "#ffe0a6" : pit ? "#ffdfa8" : side < 0 ? "#c0dbff" : "#fff0d9");
        light.intensity = underpass ? 85 : pit ? 950 : 1500;
        light.distance = underpass ? 28 : 72;
        light.angle = underpass ? 0.85 : 0.7;
        light.target.updateMatrixWorld();
      }
    },
    remove() { for (const l of lights) { scene.remove(l, l.target); l.dispose?.(); } },
  };
}
