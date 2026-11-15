import * as THREE from 'three';

export const shared = {
  rim: { value: new THREE.Color('#E8EEF1') },
  time: { value: 0 },
  night: { value: 0 },
};

export const NIGHT_GRADE = 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(.3, .59, .11))) * vec3(.55, .8, .95), nightGrade * .7);';

const ramp = (() => {
  const data = new Uint8Array([120, 120, 120, 255, 190, 190, 190, 255, 235, 235, 235, 255, 255, 255, 255, 255]);
  const texture = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
})();

export function toon(parameters: THREE.MeshToonMaterialParameters) {
  return new THREE.MeshToonMaterial({ gradientMap: ramp, ...parameters });
}

export function addRim(material: THREE.Material, strength = .55, extra?: (shader: THREE.WebGLProgramParametersWithUniforms) => void) {
  material.onBeforeCompile = shader => {
    shader.uniforms.rimColor = shared.rim;
    if (strength <= 0) { extra?.(shader); return; }
    shader.fragmentShader = 'uniform vec3 rimColor;\n' + shader.fragmentShader.replace('#include <opaque_fragment>', `
      float rimTerm = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);
      outgoingLight += rimColor * rimTerm * ${strength.toFixed(2)};
      #include <opaque_fragment>`);
    extra?.(shader);
  };
  material.customProgramCacheKey = () => 'rim' + strength + (extra ? 'x' : '');
}
