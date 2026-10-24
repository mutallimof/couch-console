// The cartoon look, part 1: a soft colored rim light on karts and characters (the glowing edge
// that makes them pop off the background). The screen-wide part (outlines, banded light, color
// grade) lives in karts-look.js. One shared strength, switched by the Settings option.
export const STYLE = { rim: { value: 0 }, rimColor: { value: null } };

// Add a rim light to a standard material (once). Needs THREE for the color.
export function addRim(THREE, material) {
  if (!material || material.userData.rim || !material.isMeshStandardMaterial) return;
  material.userData.rim = true;
  STYLE.rimColor.value ??= new THREE.Color('#C9E6FF');
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.(shader, renderer);
    shader.uniforms.uRim = STYLE.rim;
    shader.uniforms.uRimColor = STYLE.rimColor;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRim; uniform vec3 uRimColor;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float rimAmount = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.4);
        totalEmissiveRadiance += uRimColor * (uRim * rimAmount * 0.5);`);
  };
  const previousKey = material.customProgramCacheKey;
  material.customProgramCacheKey = () => `${previousKey.call(material)}rim`;
  material.needsUpdate = true;
}

// Rim-light everything a racer is made of (karts, characters)
export function addRimTo(THREE, object) {
  object.traverse((o) => { if (o.isMesh) [].concat(o.material || []).forEach((m) => addRim(THREE, m)); });
}
