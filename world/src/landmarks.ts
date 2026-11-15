import * as THREE from 'three';
import { createThing, identity, type Thing, type ThingKind } from './things';
import { heightAt, WATER } from './terrain';
import { kinds, spot, SECTOR } from './layout';
import { addRim } from './shading';
import { theme } from './theme';

const SCALE: Record<ThingKind, number> = { lantern: 1.45, stranger: 1.15, well: 1.6, arch: 1.9, cabin: 1.9, boat: 1.8, lighthouse: 2 };
const HEIGHT: Record<ThingKind, number> = { lantern: 3, stranger: 1.9, well: 2.9, arch: 4.8, cabin: 4.6, boat: 1.2, lighthouse: 14 };
const BLOCK: Partial<Record<ThingKind, number>> = { lighthouse: 2.4, cabin: 2.7, well: 1.2, lantern: .35, stranger: .4 };
const LIGHT: Record<ThingKind, [number, number, number, number]> = {
  lantern: [.65, 2.18, 0, 1.4], stranger: [.55, .78, .42, 1.1], well: [0, 2.15, .95, 1.1], arch: [0, 4.6, .7, 1.6],
  cabin: [.83, 1.56, 1.75, 1.8], boat: [0, .96, 1.05, 1.1], lighthouse: [0, 11.5, 0, 5],
};

let glowTexture: THREE.Texture | null = null;
function glow() {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(.25, 'rgba(255,255,255,.45)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(c);
  return glowTexture;
}

function birds() {
  const group = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-.35, .08, 0, 0, 0, .06, 0, 0, -.06, .35, .08, 0, 0, 0, -.06, 0, 0, .06], 3));
  const material = new THREE.MeshBasicMaterial({ color: '#1b3640', side: THREE.DoubleSide, fog: false });
  for (let i = 0; i < 5; i++) {
    const bird = new THREE.Mesh(geometry, material);
    bird.userData.effect = true;
    bird.raycast = () => {};
    group.add(bird);
  }
  group.userData.dispose = () => { geometry.dispose(); material.dispose(); };
  return group;
}

function smoke() {
  const count = 26, pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) seed[i] = i / count;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { time: { value: 0 }, color: { value: new THREE.Color(theme.moonstone) } },
    vertexShader: 'uniform float time;attribute float seed;varying float vLife;void main(){float life=fract(time*.12+seed);vLife=life;vec3 p=vec3(sin(seed*40.+time*.6)*.25*life+life*1.4,life*6.,cos(seed*31.)*.2*life);vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=(60.+life*160.)/-mv.z;gl_Position=projectionMatrix*mv;}',
    fragmentShader: 'uniform vec3 color;varying float vLife;void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,.1,d)*(1.-vLife)*smoothstep(0.,.12,vLife)*.35;gl_FragColor=vec4(color,a);}',
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.userData.effect = true;
  points.userData.dispose = () => { geometry.dispose(); material.dispose(); };
  return points;
}

export class Landmarks {
  group = new THREE.Group();
  things = new Map<string, Thing>();
  outcomes = new Map<string, Record<string, unknown>>();
  private life = new Map<string, { birds?: THREE.Group; smoke?: THREE.Points; beacon: THREE.Sprite; phase: number }>();
  constructor(public seed: number, public names = new Map<string, { name: string; description: string }>()) {}

  rename(names: Map<string, { name: string; description: string }>) {
    this.names = names;
    for (const thing of this.things.values()) this.label(thing);
  }

  private label(thing: Thing) {
    const base = identity(thing.kind), custom = this.names.get(thing.kind);
    thing.name = custom?.name || base.name; thing.description = custom?.description || base.description;
  }

  height(thing: Thing) { return HEIGHT[thing.kind] * SCALE[thing.kind]; }

  update(player: THREE.Vector3, elapsed: number) {
    const sector = Math.round(-player.z / SECTOR);
    for (let s = sector - 1; s <= sector + 1; s++) {
      for (let i = 0; i < kinds.length; i++) {
        const kind = kinds[i], id = this.seed + ':' + s + ':' + kind;
        if (this.things.has(id)) continue;
        const { x, z } = spot(i, s, this.seed);
        const thing = createThing(kind, id);
        const styled = new Set<THREE.Material>();
        thing.root.traverse(o => { if (o instanceof THREE.Mesh && !o.userData.effect && o.material instanceof THREE.MeshStandardMaterial && !styled.has(o.material)) { styled.add(o.material); o.material.color.lerp(new THREE.Color(theme.moonstone), .16); o.material.metalness *= .5; addRim(o.material, .4); } });
        const scale = SCALE[kind];
        thing.root.scale.setScalar(scale);
        thing.radius *= scale;
        thing.root.position.set(x, kind === 'boat' ? WATER + .14 : heightAt(x, z, this.seed), z);
        if (kind === 'boat') thing.root.rotation.y = -.65;
        thing.root.userData.sector = s;
        const [lx, ly, lz, size] = LIGHT[kind];
        const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: theme.blossom, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: .55 }));
        beacon.position.set(lx, ly, lz);
        beacon.scale.setScalar(size);
        beacon.userData.effect = true;
        beacon.raycast = () => {};
        thing.root.add(beacon);
        const entry: { birds?: THREE.Group; smoke?: THREE.Points; beacon: THREE.Sprite; phase: number } = { beacon, phase: (i * 1.7 + s) % 6.28 };
        if (kind === 'cabin') { entry.smoke = smoke(); entry.smoke.position.set(1.12, 4.05, -.62); thing.root.add(entry.smoke); }
        if (kind === 'lighthouse' || kind === 'arch') { entry.birds = birds(); this.group.add(entry.birds); }
        this.life.set(id, entry);
        this.label(thing);
        const outcome = this.outcomes.get(id); if (outcome) thing.apply(outcome);
        this.things.set(id, thing); this.group.add(thing.root);
      }
    }
    for (const [id, thing] of this.things) {
      if (Math.abs(thing.root.userData.sector - sector) > 1) { this.remove(id, thing); continue; }
      if (thing.root.position.distanceToSquared(player) > 160 * 160) continue;
      thing.update(elapsed, player);
      const life = this.life.get(id)!;
      const lit = thing.root.userData.lit !== false;
      life.beacon.visible = lit;
      (life.beacon.material as THREE.SpriteMaterial).opacity = .45 + Math.sin(elapsed * 2.3 + life.phase) * .08;
      if (life.smoke) (life.smoke.material as THREE.ShaderMaterial).uniforms.time.value = elapsed;
      if (life.birds) {
        const top = thing.root.position.y + this.height(thing) + 3;
        life.birds.children.forEach((bird, k) => {
          const a = elapsed * .35 + life.phase + k * .5, r = 7 + k * 1.3;
          bird.position.set(thing.root.position.x + Math.cos(a) * r, top + Math.sin(elapsed * .8 + k) * .8 + k * .4, thing.root.position.z + Math.sin(a) * r);
          bird.rotation.y = -a;
          bird.scale.set(1.4, 1 + Math.sin(elapsed * 9 + k * 2) * .8, 1.4);
        });
      }
    }
  }

  private remove(id: string, thing: Thing) {
    const life = this.life.get(id);
    if (life) {
      life.beacon.material.dispose();
      if (life.smoke) life.smoke.userData.dispose();
      if (life.birds) { this.group.remove(life.birds); life.birds.userData.dispose(); }
      this.life.delete(id);
    }
    this.group.remove(thing.root); thing.dispose(); this.things.delete(id);
  }

  reachable(player: THREE.Vector3) {
    return [...this.things.values()].filter(t => t.root.visible && Math.hypot(player.x - t.root.position.x, player.z - t.root.position.z) < t.radius + 6);
  }

  apply(id: string, change: Record<string, unknown>) {
    this.outcomes.set(id, { ...this.outcomes.get(id), ...change }); this.things.get(id)?.apply(change);
  }

  canWalk(x: number, z: number) {
    for (const thing of this.things.values()) {
      const block = BLOCK[thing.kind];
      if (!thing.root.visible || !block) continue;
      if (Math.hypot(x - thing.root.position.x, z - thing.root.position.z) < block * SCALE[thing.kind]) return false;
    }
    return true;
  }

  dispose() { for (const [id, thing] of [...this.things]) this.remove(id, thing); this.group.clear(); this.outcomes.clear(); }
}
