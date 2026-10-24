// A simple original kart silhouette for the tower statue (the original showed a Nintendo character here).
import * as THREE from "three";
export function proceduralKart() {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: "#e9b949", metalness: 0.7, roughness: 0.28 });
  const dark = new THREE.MeshStandardMaterial({ color: "#2a2f3a", roughness: 0.6 });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  add(new THREE.BoxGeometry(1.5, 0.45, 2.6), gold, 0, 0.55, 0);
  add(new THREE.BoxGeometry(1, 0.5, 0.9), gold, 0, 0.95, -0.2);
  add(new THREE.BoxGeometry(1.8, 0.12, 0.5), gold, 0, 0.5, 1.4);
  for (const [x, z] of [[-0.85, 0.9], [0.85, 0.9], [-0.85, -0.9], [0.85, -0.9]])
    add(new THREE.CylinderGeometry(0.38, 0.38, 0.35, 16), dark, x, 0.38, z).rotation.z = Math.PI / 2;
  return g;
}
