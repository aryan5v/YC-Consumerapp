import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const RAMP = ' .:-=+*#%@';
const GW = 28;
const GH = 48;

function atlas() {
  const canvas = document.createElement('canvas');
  canvas.width = GW * RAMP.length;
  canvas.height = GH;
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.NoColorSpace;
  const draw = () => {
    const g = canvas.getContext('2d')!;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '500 40px "Paper Mono", ui-monospace, monospace';
    for (let i = 0; i < RAMP.length; i++) g.fillText(RAMP[i], i * GW + GW / 2, GH / 2 + 2);
    texture.needsUpdate = true;
  };
  draw();
  document.fonts?.load('500 40px "Paper Mono"').then(draw, () => {});
  return texture;
}

export function createAsciiPass() {
  const pass = new ShaderPass({
    name: 'SynquiAscii',
    uniforms: {
      tDiffuse: { value: null },
      atlas: { value: atlas() },
      amount: { value: 0 },
      resolution: { value: new THREE.Vector2(1, 1) },
      cellScale: { value: 1 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'varying vec2 vUv;',
      'uniform sampler2D tDiffuse;',
      'uniform sampler2D atlas;',
      'uniform float amount;',
      'uniform vec2 resolution;',
      'uniform float cellScale;',
      'const float COUNT = ' + RAMP.length.toFixed(1) + ';',
      'void main() {',
      '  vec3 source = texture2D(tDiffuse, vUv).rgb;',
      '  vec2 cell = vec2(7.0, 12.0) * cellScale;',
      '  vec2 grid = floor(gl_FragCoord.xy / cell);',
      '  vec2 center = (grid + 0.5) * cell / resolution;',
      '  vec3 sampleColor = texture2D(tDiffuse, center).rgb;',
      '  float lum = dot(sampleColor, vec3(0.2126, 0.7152, 0.0722));',
      '  float warm = clamp((sampleColor.r - sampleColor.b) * 2.5, 0.0, 1.0) * smoothstep(0.25, 0.6, lum);',
      '  float index = clamp(floor(pow(clamp(lum * 1.6, 0.0, 1.0), 0.8) * COUNT), 0.0, COUNT - 1.0);',
      '  vec2 glyph = fract(gl_FragCoord.xy / cell);',
      '  float ink = texture2D(atlas, vec2((glyph.x + index) / COUNT, glyph.y)).r;',
      '  vec3 paper = vec3(0.012, 0.016, 0.026);',
      '  vec3 silver = vec3(0.80, 0.86, 0.94);',
      '  vec3 amber = vec3(1.0, 0.66, 0.30);',
      '  vec3 tone = mix(silver * (0.45 + lum * 0.9), amber, warm);',
      '  float wave = smoothstep(0.0, 1.0, amount * 1.6 - (1.0 - vUv.y) * 0.6);',
      '  gl_FragColor = vec4(mix(source, mix(paper, tone, ink), wave), 1.0);',
      '}',
    ].join('\n'),
  });
  pass.enabled = false;
  return pass;
}
