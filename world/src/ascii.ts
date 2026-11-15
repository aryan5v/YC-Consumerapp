import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const rows = [
  '        ', '        ', '        ', '        ', '        ', '        ', '        ', '        ',
  '        ', '   ##   ', '   ##   ', '        ', '        ', '        ', '        ', '        ',
  '   #    ', '   #    ', '        ', '   #    ', '   #    ', '        ', '        ', '        ',
  '        ', ' ###### ', '        ', '        ', ' ###### ', '        ', '        ', '        ',
  '   #    ', '   #    ', ' #####  ', '   #    ', '   #    ', '        ', '        ', '        ',
  '        ', ' #   #  ', '  # #   ', '   #    ', '  # #   ', ' #   #  ', '        ', '        ',
  ' # # #  ', '####### ', ' # # #  ', '####### ', ' # # #  ', '        ', '        ', '        ',
  '########', '########', '########', '########', '########', '########', '########', '########',
];

function atlas() {
  const count = 8;
  const size = 8;
  const data = new Uint8Array(count * size * size);
  for (let glyph = 0; glyph < count; glyph++) {
    for (let y = 0; y < size; y++) {
      const row = rows[glyph * size + y] ?? '';
      for (let x = 0; x < size; x++) data[(y * count + glyph) * size + x] = row[x] === '#' ? 255 : 0;
    }
  }
  const texture = new THREE.DataTexture(data, count * size, size, THREE.RedFormat);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
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
      'void main() {',
      '  vec3 source = texture2D(tDiffuse, vUv).rgb;',
      '  vec2 cell = vec2(8.0 * cellScale);',
      '  vec2 grid = floor(gl_FragCoord.xy / cell);',
      '  vec2 center = (grid + 0.5) * cell / resolution;',
      '  vec3 sampleColor = texture2D(tDiffuse, center).rgb;',
      '  float lum = dot(sampleColor, vec3(0.2126, 0.7152, 0.0722));',
      '  float index = clamp(floor(pow(max(lum, 0.0), 0.85) * 8.0), 0.0, 7.0);',
      '  vec2 glyph = fract(gl_FragCoord.xy / cell);',
      '  glyph.y = 1.0 - glyph.y;',
      '  float ink = texture2D(atlas, vec2((glyph.x + index) / 8.0, glyph.y)).r;',
      '  vec3 paper = vec3(0.012, 0.014, 0.02);',
      '  vec3 silver = vec3(0.78, 0.84, 0.9);',
      '  vec3 amber = vec3(1.0, 0.58, 0.22);',
      '  vec3 tone = mix(silver, amber, smoothstep(0.18, 0.72, lum));',
      '  gl_FragColor = vec4(mix(source, mix(paper, tone, ink), amount), 1.0);',
      '}',
    ].join('\n'),
  });
  pass.enabled = false;
  return pass;
}
