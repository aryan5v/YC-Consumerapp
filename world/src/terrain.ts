import * as THREE from 'three';

export const CHUNK = 48;
export const WATER = -1.5;

export function hash(x: number, z: number, seed: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise(x: number, z: number, seed: number) {
  const ix = Math.floor(x), iz = Math.floor(z);
  let u = x - ix, v = z - iz;
  u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix, iz, seed), hash(ix + 1, iz, seed), u), THREE.MathUtils.lerp(hash(ix, iz + 1, seed), hash(ix + 1, iz + 1, seed), u), v);
}

export function shore(z: number, seed: number) {
  return 27 + Math.sin(z * .013 + seed * .001) * 12 + Math.sin(z * .04) * 3;
}

export function pathX(z: number, seed: number) {
  return shore(z, seed) - 24 + Math.sin(z * .025) * 5;
}

export function surfaceAt(x: number, z: number, seed: number): 'path' | 'grass' | 'rock' | 'shore' {
  const inland = shore(z, seed) - x;
  if (inland < 8) return 'shore';
  if (Math.abs(x - pathX(z, seed)) < 2.2) return 'path';
  if (heightAt(x, z, seed) > 7) return 'rock';
  return 'grass';
}

export function heightAt(x: number, z: number, seed: number) {
  const inland = shore(z, seed) - x;
  const hills = noise(x * .016, z * .016, seed) * 9 + noise(x * .055, z * .055, seed + 2) * 2;
  const coast = THREE.MathUtils.smoothstep(inland, -5, 40);
  const path = Math.exp(-Math.pow((x - pathX(z, seed)) / 8, 2));
  return -3 + coast * (4 + hills * (1 - path * .65)) + THREE.MathUtils.smoothstep(inland,45,150)*hills*3;
}

import { addRim, shared, toon } from './shading';

const dummy = new THREE.Object3D();
const color = new THREE.Color();

function tuftGeometry() {
  const positions: number[] = [], colors: number[] = [], normals: number[] = [];
  for (let b = 0; b < 4; b++) {
    const a = b / 4 * Math.PI + (b % 2) * .3, lean = (b - 1.5) * .1;
    const ca = Math.cos(a), sa = Math.sin(a), w = .045, h = .38 + (b % 2) * .16;
    const p = (u: number, v: number) => [ca * u * w * (1 - v) + lean * v * v, v * h, sa * u * w * (1 - v) + lean * v * v * .5];
    const quad = [[-1, 0], [1, 0], [-1, .5], [1, 0], [1, .5], [-1, .5], [-1, .5], [1, .5], [0, 1]];
    for (const [u, v] of quad) {
      positions.push(...p(u, v));
      colors.push(.78 + v * .3, .82 + v * .3, .7 + v * .25);
      normals.push(0, 1, 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return g;
}

function windy(material: THREE.Material) {
  addRim(material, 0, shader => {
    shader.uniforms.time = shared.time;
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);');
    shader.vertexShader = 'uniform float time;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 root = instanceMatrix[3].xyz;
      float bend = transformed.y * transformed.y;
      float gust = sin(time * 1.3 + root.x * .09 + root.z * .05) * .5 + .5;
      transformed.x += (sin(time * 2.1 + root.x * .7 + root.z * .4) * .12 + gust * .22) * bend;
      transformed.z += cos(time * 1.7 + root.z * .6) * .08 * bend;`);
  });
}

function painted(material: THREE.Material, rim: number) {
  addRim(material, rim, shader => {
    shader.vertexShader = 'varying vec3 paintPosition;\n' + shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvec4 paintWorld=vec4(transformed,1.);\n#ifdef USE_INSTANCING\npaintWorld=instanceMatrix*paintWorld;\n#endif\npaintPosition=(modelMatrix*paintWorld).xyz;');
    shader.fragmentShader = 'varying vec3 paintPosition;\nfloat phash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\nfloat pnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(phash(i),phash(i+vec2(1.,0.)),f.x),mix(phash(i+vec2(0.,1.)),phash(i+vec2(1.,1.)),f.x),f.y);}\n' + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 pp = paintPosition;
      float ang = sin(pp.x * .11 + pp.z * .07) * 1.3;
      vec2 q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * pp.xz;
      float stroke = pnoise(vec2(q.x * .9, q.y * 4. + pp.y * 2.)) * .6 + pnoise(vec2(q.x * 2.2, q.y * 9.)) * .4;
      float broad = pnoise(pp.xz * .05);
      diffuseColor.rgb *= .9 + stroke * .16;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.06, 1.08, .92), broad * .6);`);
  });
}

export class Terrain {
  chunks = new Map<string, THREE.Group>();
  group = new THREE.Group();
  private trunkGeometry = new THREE.CylinderGeometry(.14, .3, 1, 6);
  private crownGeometry = new THREE.IcosahedronGeometry(1, 1);
  private rockGeometry = new THREE.DodecahedronGeometry(1, 0);
  private tuft = tuftGeometry();
  private flowerGeometry = new THREE.IcosahedronGeometry(.055, 0);
  private bark = toon({ color: '#6e5a4e' });
  private leaves = toon({ color: '#ffffff' });
  private rock = toon({ color: '#b3bcbd' });
  private grass = new THREE.MeshLambertMaterial({ color: '#86c063', vertexColors: true, side: THREE.DoubleSide });
  private flower = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#2a2a2a' });
  private ground = toon({ vertexColors: true });

  constructor(public seed: number) {
    painted(this.ground, 0);
    painted(this.leaves, .28);
    painted(this.rock, .22);
    addRim(this.bark, .3);
    windy(this.grass);
    windy(this.flower);
  }

  update(x: number, z: number) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const needed: [number, number][] = [];
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      if (!this.chunks.has(`${cx + dx},${cz + dz}`)) needed.push([cx + dx, cz + dz]);
    }
    needed.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cz) - Math.hypot(b[0] - cx, b[1] - cz));
    for (const [gx, gz] of needed.slice(0, this.chunks.size ? 2 : 49)) this.create(gx, gz);
    for (const [key, chunk] of this.chunks) {
      const [gx, gz] = key.split(',').map(Number);
      const far = Math.max(Math.abs(gx - cx), Math.abs(gz - cz));
      if (far > 3) {
        this.group.remove(chunk);
        (chunk.children[0] as THREE.Mesh).geometry.dispose();
        chunk.traverse(o => { if (o instanceof THREE.InstancedMesh) o.dispose(); });
        this.chunks.delete(key);
      } else for (const mesh of chunk.userData.near as THREE.Object3D[]) mesh.visible = far <= 1;
    }
  }

  private create(cx: number, cz: number) {
    const group = new THREE.Group();
    const geometry = new THREE.PlaneGeometry(CHUNK, CHUNK, 32, 32);
    geometry.rotateX(-Math.PI / 2);
    const p = geometry.attributes.position;
    const colors: number[] = [];
    const lush = new THREE.Color('#6da957'), meadow = new THREE.Color('#9cc46a'), path = new THREE.Color('#cdbf9a'), sand = new THREE.Color('#e6dcc0'), stone = new THREE.Color('#9fae9f');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + cx * CHUNK + CHUNK / 2, z = p.getZ(i) + cz * CHUNK + CHUNK / 2;
      const h = heightAt(x, z, this.seed); p.setXYZ(i, x, h, z);
      const trail = Math.abs(x - pathX(z, this.seed));
      color.copy(lush).lerp(meadow, noise(x * .03, z * .03, this.seed + 9));
      if (h > 7) color.lerp(stone, THREE.MathUtils.smoothstep(h, 7, 11) * .8);
      color.lerp(path, (1 - THREE.MathUtils.smoothstep(trail, .5, 1.7)) * .9);
      color.lerp(sand, 1 - THREE.MathUtils.smoothstep(h, -1.2, .2));
      color.multiplyScalar(.92 + noise(x * .4, z * .4, this.seed + 4) * .16);
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    group.add(new THREE.Mesh(geometry, this.ground));
    const trees: number[][] = [], rocks: number[][] = [], tufts: number[][] = [], flowers: number[][] = [];
    for (let i = 0; i < 3200; i++) {
      const x = (cx + hash(cx * 103 + i, cz, this.seed)) * CHUNK, z = (cz + hash(cx, cz * 107 + i, this.seed + 1)) * CHUNK;
      const y = heightAt(x, z, this.seed), trail = Math.abs(x - pathX(z, this.seed));
      const r = hash(cx * 89 + i, cz * 97, this.seed + 7);
      if (y < -.6) continue;
      if (i < 22) { if (trail > 8 && x < shore(z, this.seed) - 14) trees.push([x, y, z, 4 + r * 6, r]); continue; }
      if (i < 30) { if (trail > 3) rocks.push([x, y, z, .4 + r * 1.6, r]); continue; }
      if (trail < 1.5) continue;
      if (i < 190) { if (noise(x * .08, z * .08, this.seed + 3) > .45) flowers.push([x, y, z, .8 + r * .5, r]); continue; }
      tufts.push([x, y, z, .7 + r * .7, r]);
    }
    const near: THREE.Object3D[] = [];
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, items: number[][], type: string) => {
      const per = type === 'crown' ? 5 : 1;
      const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length * per));
      mesh.count = items.length * per;
      let index = 0;
      for (const [x, y, z, size, r] of items) {
        for (let j = 0; j < per; j++) {
          dummy.rotation.set(0, r * 6.28 + j, 0);
          dummy.scale.setScalar(size);
          if (type === 'trunk') { dummy.position.set(x, y + size * .4, z); dummy.scale.set(1, size * .85, 1); }
          else if (type === 'crown') { dummy.position.set(x + Math.sin(j * 2.4 + r * 9) * size * .2, y + size * (.7 + (j % 3) * .07), z + Math.cos(j * 2.4 + r * 9) * size * .2); dummy.scale.set(size * (.3 + r * .08), size * (.24 + r * .06), size * (.3 + r * .05)); }
          else if (type === 'rock') { dummy.position.set(x, y + size * .15, z); dummy.scale.set(size, size * .6, size * .85); dummy.rotation.x = r; }
          else if (type === 'flower') { dummy.position.set(x, y + .32 * size, z); }
          else dummy.position.set(x, y - .05, z);
          dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix);
          if (type === 'crown') color.set(r > .55 ? '#8fcb72' : r > .25 ? '#6fb35e' : '#5a9e58').multiplyScalar(.9 + j * .04);
          else if (type === 'flower') color.set(r > .66 ? '#fbfaf2' : r > .33 ? '#f7eaa6' : '#bfe0f2');
          else if (type === 'tuft') color.set(r > .5 ? '#ffffff' : '#e3f0c8');
          else color.set('#ffffff').multiplyScalar(.9 + r * .2);
          mesh.setColorAt(index++, color);
        }
      }
      mesh.computeBoundingSphere();
      if (type === 'tuft' || type === 'flower') { near.push(mesh); mesh.visible = false; }
      group.add(mesh);
    };
    add(this.trunkGeometry, this.bark, trees, 'trunk');
    add(this.crownGeometry, this.leaves, trees, 'crown');
    add(this.rockGeometry, this.rock, rocks, 'rock');
    add(this.tuft, this.grass, tufts, 'tuft');
    add(this.flowerGeometry, this.flower, flowers, 'flower');
    group.userData.near = near;
    this.chunks.set(`${cx},${cz}`, group); this.group.add(group);
  }

  dispose() {
    for (const chunk of this.chunks.values()) {
      (chunk.children[0] as THREE.Mesh).geometry.dispose();
      chunk.traverse(o => { if (o instanceof THREE.InstancedMesh) o.dispose(); });
    }
    this.chunks.clear(); this.group.clear();
    for (const resource of [this.trunkGeometry, this.crownGeometry, this.rockGeometry, this.tuft, this.flowerGeometry, this.bark, this.leaves, this.rock, this.grass, this.flower, this.ground]) resource.dispose();
  }
}
