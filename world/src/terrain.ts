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

const dummy = new THREE.Object3D();
const color = new THREE.Color();

export class Terrain {
  chunks = new Map<string, THREE.Group>();
  group = new THREE.Group();
  private trunkGeometry = new THREE.CylinderGeometry(.13, .28, 1, 5);
  private crownGeometry = new THREE.IcosahedronGeometry(1, 1);
  private rockGeometry = new THREE.IcosahedronGeometry(1, 0);
  private grassGeometry = new THREE.PlaneGeometry(.13, .8);
  private bark = new THREE.MeshStandardMaterial({ color: '#4b4543', roughness: 1, flatShading: true });
  private leaves = new THREE.MeshStandardMaterial({ color: '#4f6a63', roughness: 1, flatShading: true });
  private rock = new THREE.MeshStandardMaterial({ color: '#8c8d90', roughness: 1, flatShading: true });
  private grass = new THREE.MeshStandardMaterial({ color: '#8e9a92', roughness: 1, side: THREE.DoubleSide });
  private ground = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });

  constructor(public seed: number) {
    for(const material of [this.ground,this.leaves,this.rock]){
      material.onBeforeCompile=shader=>{
        shader.vertexShader='varying vec3 paintPosition;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvec4 paintWorld=vec4(transformed,1.);\n#ifdef USE_INSTANCING\npaintWorld=instanceMatrix*paintWorld;\n#endif\npaintPosition=(modelMatrix*paintWorld).xyz;');
        shader.fragmentShader='varying vec3 paintPosition;\nfloat phash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\nfloat pnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(phash(i),phash(i+vec2(1.,0.)),f.x),mix(phash(i+vec2(0.,1.)),phash(i+vec2(1.,1.)),f.x),f.y);}\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          vec3 p=paintPosition;
          float a=sin(p.x*.13+p.z*.07)*1.4;
          vec2 q=mat2(cos(a),-sin(a),sin(a),cos(a))*p.xz;
          float stroke=pnoise(vec2(q.x*1.1,q.y*5.5+p.y*2.))*.6+pnoise(vec2(q.x*2.7,q.y*11.))*.4;
          float broad=pnoise(p.xz*.08);
          diffuseColor.rgb*=.8+stroke*.32;
          diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.9,.98,1.1),broad*.5);
        `);
      };
    }
  }

  update(x: number, z: number) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const needed: [number, number][] = [];
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      if (!this.chunks.has(`${cx + dx},${cz + dz}`)) needed.push([cx + dx, cz + dz]);
    }
    needed.sort((a,b) => Math.hypot(a[0]-cx,a[1]-cz)-Math.hypot(b[0]-cx,b[1]-cz));
    for (const [gx,gz] of needed.slice(0, this.chunks.size ? 2 : 49)) this.create(gx,gz);
    for (const [key, chunk] of this.chunks) {
      const [gx,gz] = key.split(',').map(Number);
      if (Math.abs(gx-cx)>3 || Math.abs(gz-cz)>3) {
        this.group.remove(chunk);
        (chunk.children[0] as THREE.Mesh).geometry.dispose();
        chunk.traverse(o => { if (o instanceof THREE.InstancedMesh) o.dispose(); });
        this.chunks.delete(key);
      }
    }
  }

  private create(cx: number, cz: number) {
    const group = new THREE.Group();
    const geometry = new THREE.PlaneGeometry(CHUNK, CHUNK, 32, 32);
    geometry.rotateX(-Math.PI/2);
    const p = geometry.attributes.position;
    const colors: number[] = [];
    for (let i=0;i<p.count;i++) {
      const x=p.getX(i)+cx*CHUNK+CHUNK/2,z=p.getZ(i)+cz*CHUNK+CHUNK/2;
      const h=heightAt(x,z,this.seed); p.setXYZ(i,x,h,z);
      const trail=Math.abs(x-pathX(z,this.seed));
      color.set(h < -.3 ? '#7f8486' : trail < 1.7 ? '#868a88' : h > 7 ? '#6c727c' : '#4a6158');
      color.multiplyScalar(.82+noise(x*.45,z*.45,this.seed+4)*.38);
      colors.push(color.r,color.g,color.b);
    }
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geometry.computeVertexNormals();
    group.add(new THREE.Mesh(geometry,this.ground));
    const trees: number[][]=[],rocks: number[][]=[],grass: number[][]=[];
    for(let i=0;i<500;i++) {
      const x=(cx+hash(cx*103+i,cz,this.seed))*CHUNK,z=(cz+hash(cx,cz*107+i,this.seed+1))*CHUNK;
      const y=heightAt(x,z,this.seed),trail=Math.abs(x-pathX(z,this.seed));
      if(y<-.7 || trail<4) continue;
      const r=hash(cx*89+i,cz*97,this.seed+7);
      if(i<18 && trail>8 && x<shore(z,this.seed)-14) trees.push([x,y,z,4+r*6,r]);
      else if(i<25) rocks.push([x,y,z,.4+r*1.8,r]);
      else grass.push([x,y,z,.3+r*.6,r]);
    }
    const add=(geo:THREE.BufferGeometry,mat:THREE.Material,items:number[][],type:string)=>{
      const mesh=new THREE.InstancedMesh(geo,mat,items.length*(type==='crown'?5:1));
      let index=0;
      for(const [x,y,z,size,r] of items) {
        for(let j=0;j<(type==='crown'?5:1);j++) {
          dummy.position.set(x+(type==='crown'?Math.sin(j*2.4+r*9)*size*.22:0),y+(type==='trunk'?size*.42:type==='crown'?size*(.64+j*.045):type==='grass'?size*.35:.2),z+(type==='crown'?Math.cos(j*2.4+r*9)*size*.22:0));
          dummy.rotation.set(type==='crown'?r*.4:0,r*6.28,type==='grass'?r*.4-.2:0);
          if(type==='trunk')dummy.scale.set(1,size*.9,1);
          else if(type==='crown')dummy.scale.set(size*(.28+r*.1),size*(.15+r*.1),size*(.28+r*.05));
          else if(type==='grass')dummy.scale.set(size,size,size);
          else dummy.scale.set(size,size*.65,size*.9);
          dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);
          color.set(type==='crown'?(r>.6?'#8ea6a0':'#6f8a84'):'#ffffff').multiplyScalar(.65+r*.55);mesh.setColorAt(index++,color);
        }
      }
      mesh.computeBoundingSphere();group.add(mesh);
    };
    add(this.trunkGeometry,this.bark,trees,'trunk');add(this.crownGeometry,this.leaves,trees,'crown');add(this.rockGeometry,this.rock,rocks,'rock');add(this.grassGeometry,this.grass,grass,'grass');
    this.chunks.set(`${cx},${cz}`,group);this.group.add(group);
  }

  dispose() {
    for(const chunk of this.chunks.values()) {
      (chunk.children[0] as THREE.Mesh).geometry.dispose();
      chunk.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();});
    }
    this.chunks.clear();this.group.clear();
    for(const resource of [this.trunkGeometry,this.crownGeometry,this.rockGeometry,this.grassGeometry,this.bark,this.leaves,this.rock,this.grass,this.ground])resource.dispose();
  }
}
