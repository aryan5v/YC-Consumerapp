import * as THREE from 'three';
import { hash, heightAt, pathX } from './terrain';
import { clearance } from './layout';
import { addRim, NIGHT_GRADE, shared, tintSnippet, toon } from './shading';
import { theme } from './theme';

const CELL = .8;
const RADIUS = 26;
const MAX_TUFTS = 9000;
const MAX_FLOWERS = 900;
const MAX_STONES = 500;

function tuftGeometry() {
  const positions: number[] = [], colors: number[] = [], normals: number[] = [];
  for (let b = 0; b < 5; b++) {
    const a = b / 5 * Math.PI * 2 + (b % 2) * .4, off = .07;
    const ca = Math.cos(a), sa = Math.sin(a), w = .035, h = .36 + (b % 3) * .12;
    const lean = .12 + (b % 2) * .06;
    const p = (u: number, v: number) => [ca * off - sa * u * w * (1 - v) + ca * lean * v * v, v * h, sa * off + ca * u * w * (1 - v) + sa * lean * v * v];
    for (const [u, v] of [[-1, 0], [1, 0], [-1, .55], [1, 0], [1, .55], [-1, .55], [-1, .55], [1, .55], [0, 1]]) {
      positions.push(...p(u, v));
      colors.push(.5 + v * .62, .62 + v * .5, .42 + v * .5);
      normals.push(0, 1, 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return g;
}

function field(material: THREE.Material, sway: number) {
  addRim(material, 0, shader => {
    shader.uniforms.time = shared.time;
    shader.uniforms.nightGrade = shared.night;
    shader.uniforms.tintColor = shared.tint;
    shader.uniforms.tintAmount = shared.tintAmount;
    shader.vertexShader = 'uniform float time;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 root = (modelMatrix * instanceMatrix[3]).xyz;
      float fade = 1.0 - smoothstep(${(RADIUS - 9).toFixed(1)}, ${(RADIUS - 1).toFixed(1)}, distance(root.xz, cameraPosition.xz));
      transformed *= fade;
      float bend = transformed.y * transformed.y * ${sway.toFixed(2)};
      float gust = sin(time * 1.2 + root.x * .08 + root.z * .05) * .5 + .5;
      transformed.x += (sin(time * 2.3 + root.x * .9 + root.z * .5) * .35 + gust * .9) * bend;
      transformed.z += cos(time * 1.9 + root.z * .7 + root.x * .3) * .3 * bend;`);
    shader.fragmentShader = 'uniform float nightGrade;\nuniform vec3 tintColor;\nuniform float tintAmount;\n' + shader.fragmentShader
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + tintSnippet(.7) + '\n' + NIGHT_GRADE);
  });
}

const dummy = new THREE.Object3D();
const color = new THREE.Color();

export class NearField {
  group = new THREE.Group();
  private tuftGeometry = tuftGeometry();
  private flowerGeometry = (() => { const g = new THREE.IcosahedronGeometry(.075, 0); g.scale(1, .45, 1); return g; })();
  private stoneGeometry = new THREE.DodecahedronGeometry(1, 0);
  private grass = new THREE.MeshLambertMaterial({ color: '#8cc565', vertexColors: true, side: THREE.DoubleSide });
  private flower = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#3a2a2e' });
  private stoneMaterial = toon({ color: '#b6bfbd' });
  private tufts = new THREE.InstancedMesh(this.tuftGeometry, this.grass, MAX_TUFTS);
  private flowers = new THREE.InstancedMesh(this.flowerGeometry, this.flower, MAX_FLOWERS);
  private stones = new THREE.InstancedMesh(this.stoneGeometry, this.stoneMaterial, MAX_STONES);
  private center = new THREE.Vector2(1e9, 1e9);

  constructor(public seed: number) {
    field(this.grass, 1);
    field(this.flower, .3);
    addRim(this.stoneMaterial, .25);
    for (const mesh of [this.tufts, this.flowers, this.stones]) { mesh.frustumCulled = false; mesh.count = 0; this.group.add(mesh); }
  }

  update(player: THREE.Vector3) {
    if (Math.hypot(player.x - this.center.x, player.z - this.center.y) < 3) return;
    this.center.set(player.x, player.z);
    let t = 0, f = 0, s = 0;
    const gx0 = Math.floor((player.x - RADIUS) / CELL), gx1 = Math.floor((player.x + RADIUS) / CELL);
    const gz0 = Math.floor((player.z - RADIUS) / CELL), gz1 = Math.floor((player.z + RADIUS) / CELL);
    const blossom = new THREE.Color(theme.blossom), white = new THREE.Color('#fbfaf4'), pale = new THREE.Color('#ffd6dc');
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      const cx = (gx + .5) * CELL, cz = (gz + .5) * CELL;
      const d = Math.hypot(cx - player.x, cz - player.z);
      if (d > RADIUS) continue;
      const h0 = hash(gx, gz, this.seed + 11);
      const y0 = heightAt(cx, cz, this.seed);
      if (y0 < -.7) continue;
      const trail = Math.abs(cx - pathX(cz, this.seed));
      if (clearance(cx, cz, this.seed) < 3.2) continue;
      if (trail > 1.15 && trail < 2.1 && h0 < .09 && s < MAX_STONES) {
        const size = .07 + hash(gx, gz, this.seed + 12) * .16;
        dummy.position.set(cx + (h0 - .05) * 6, y0 + size * .2, cz);
        dummy.rotation.set(h0 * 20, h0 * 40, 0);
        dummy.scale.set(size * 1.3, size * .7, size);
        dummy.updateMatrix(); this.stones.setMatrixAt(s, dummy.matrix);
        color.set('#ffffff').multiplyScalar(.85 + h0 * 1.5); this.stones.setColorAt(s++, color);
      }
      if (trail < 1.35) continue;
      const per = d < 9 ? 3 : d < 17 ? 2 : 1;
      for (let k = 0; k < per && t < MAX_TUFTS; k++) {
        const jx = hash(gx * 7 + k, gz, this.seed + 13) - .5, jz = hash(gx, gz * 7 + k, this.seed + 14) - .5;
        const x = cx + jx * CELL, z = cz + jz * CELL;
        const r = hash(gx + k, gz - k, this.seed + 15);
        dummy.position.set(x, heightAt(x, z, this.seed) - .03, z);
        dummy.rotation.set(0, r * 6.28, 0);
        dummy.scale.setScalar(.75 + r * .75 + (trail > 6 ? .3 : 0));
        dummy.updateMatrix(); this.tufts.setMatrixAt(t, dummy.matrix);
        color.setHSL(.24 + r * .08, .45 + r * .2, .5 + r * .14); this.tufts.setColorAt(t++, color);
      }
      const fl = hash(gx * 3, gz * 5, this.seed + 16);
      const patch = hash(Math.floor(gx / 9), Math.floor(gz / 9), this.seed + 17);
      if (patch > .55 && fl < .22) {
        for (let k = 0; k < 3 && f < MAX_FLOWERS; k++) {
          const x = cx + (hash(gx, k, this.seed + 18) - .5) * CELL, z = cz + (hash(k, gz, this.seed + 19) - .5) * CELL;
          const r = hash(gx + k * 3, gz, this.seed + 20);
          dummy.position.set(x, heightAt(x, z, this.seed) + .26 + r * .16, z);
          dummy.rotation.set(0, r * 6, 0);
          dummy.scale.setScalar(.8 + r * .6);
          dummy.updateMatrix(); this.flowers.setMatrixAt(f, dummy.matrix);
          this.flowers.setColorAt(f++, patch > .8 ? (r > .4 ? blossom : pale) : (r > .3 ? white : blossom));
        }
      }
    }
    this.tufts.count = t; this.flowers.count = f; this.stones.count = s;
    for (const mesh of [this.tufts, this.flowers, this.stones]) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
  }

  dispose() {
    for (const mesh of [this.tufts, this.flowers, this.stones]) mesh.dispose();
    for (const r of [this.tuftGeometry, this.flowerGeometry, this.stoneGeometry, this.grass, this.flower, this.stoneMaterial]) r.dispose();
    this.group.clear();
  }
}
