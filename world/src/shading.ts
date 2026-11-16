import * as THREE from 'three';

export const shared = {
  rim: { value: new THREE.Color('#E8EEF1') },
  time: { value: 0 },
  night: { value: 0 },
  tint: { value: new THREE.Color('#ffffff') },
  tintAmount: { value: 0 },
  wet: { value: 0 },
  snowCover: { value: 0 },
};

const WEATHER = `
      float wUp = clamp(dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz)), 0.0, 1.0);
      float wLum = dot(outgoingLight, vec3(.3, .59, .11));
      outgoingLight = mix(outgoingLight, vec3(.9, .94, .98) * min(1.0, wLum * 1.7 + .04), snowCover * smoothstep(.45, .85, wUp) * .8);
      float wFres = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 4.0);
      outgoingLight = outgoingLight * (1.0 - wetness * .3) + rimColor * wFres * wetness * wUp * .2;`;

export const tintSnippet = (k: number) => `diffuseColor.rgb = mix(diffuseColor.rgb, tintColor * (.8 + .4 * dot(diffuseColor.rgb, vec3(.3, .59, .11))), tintAmount * ${k.toFixed(2)});`;

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
    shader.uniforms.wetness = shared.wet;
    shader.uniforms.snowCover = shared.snowCover;
    const rim = strength > 0 ? `
      float rimTerm = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);
      outgoingLight += rimColor * rimTerm * ${strength.toFixed(2)};` : '';
    shader.fragmentShader = 'uniform vec3 rimColor;\nuniform float wetness;\nuniform float snowCover;\n' + shader.fragmentShader.replace('#include <opaque_fragment>', rim + WEATHER + '\n#include <opaque_fragment>');
    extra?.(shader);
  };
  material.customProgramCacheKey = () => 'rimw' + strength + (extra ? 'x' : '');
}
