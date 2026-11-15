import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type ThingKind = 'lighthouse' | 'arch' | 'boat' | 'cabin' | 'lantern' | 'well' | 'stranger';

export interface Thing {
  id: string;
  kind: ThingKind;
  name: string;
  description: string;
  root: THREE.Group;
  radius: number;
  update: (elapsed: number, player: THREE.Vector3) => void;
  apply: (change: Record<string, unknown>) => void;
  dispose: () => void;
}

const identities: Record<ThingKind, { name: string; description: string; radius: number }> = {
  lighthouse: { name: 'The Last Light', description: 'An old sea tower keeps a patient amber watch over the valley.', radius: 3 },
  arch: { name: 'The Moon Gate', description: 'Silver-blue stones frame a road that has outlived its makers.', radius: 3 },
  boat: { name: 'The Ferryman’s Boat', description: 'A narrow wooden rowboat waits with its oars crossed and a lantern burning.', radius: 1.7 },
  cabin: { name: 'The Keeper’s Cabin', description: 'Honey-colored light spills through the window of a weathered cedar cabin.', radius: 3 },
  lantern: { name: 'The Wayside Lantern', description: 'A small flame hangs from a curled iron arm, sheltering a circle of warmth.', radius: 0.55 },
  well: { name: 'The Wishing Well', description: 'A rope descends into dark water beneath a little roof of midnight slate.', radius: 1.5 },
  stranger: { name: 'The Cloaked Stranger', description: 'A hooded traveler holds a tiny lantern. Their face is lost in the blue dark.', radius: 0.65 },
};

export function identity(kind: ThingKind) {
  return identities[kind];
}

export function createThing(kind: ThingKind, id: string): Thing {
  const root = new THREE.Group();
  root.name = `${kind}:${id}`;
  root.userData.thingId = id;
  root.userData.kind = kind;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const luminous = new Map<THREE.MeshStandardMaterial, number>();
  const lightVolumes: THREE.Object3D[] = [];
  const hinges: THREE.Group[] = [];
  const animations: Array<(elapsed: number, player: THREE.Vector3) => void> = [];
  let lit = true;
  let disposed = false;

  function material(color: number, roughness = 0.88, metalness = 0): THREE.MeshStandardMaterial {
    const value = new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
    materials.add(value);
    return value;
  }

  const stone = [material(0x687a89), material(0x778791), material(0x536879), material(0x8a9391)];
  const darkStone = material(0x344657);
  const wood = material(0x78533b);
  const woodLight = material(0x9b7050);
  const woodDark = material(0x392f30);
  const iron = material(0x273546, 0.55, 0.55);
  const brass = material(0xc5ced2, 0.48, 0.55);
  const slate = [material(0x293b54), material(0x354b65), material(0x405772)];
  const moss = material(0x52695c);

  function glow(intensity = 1.6): THREE.MeshStandardMaterial {
    const value = material(0xff8e9e, 0.5);
    value.emissive.setHex(0xff7f93);
    value.emissiveIntensity = intensity;
    luminous.set(value, intensity);
    return value;
  }

  function mesh(geometry: THREE.BufferGeometry, surface: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = root): THREE.Mesh {
    geometries.add(geometry);
    const object = new THREE.Mesh(geometry, surface);
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  function box(w: number, h: number, d: number, surface: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = root): THREE.Mesh {
    return mesh(new THREE.BoxGeometry(w, h, d), surface, x, y, z, parent);
  }

  function cylinder(top: number, bottom: number, h: number, surface: THREE.Material, x = 0, y = 0, z = 0, sides = 8, parent: THREE.Object3D = root): THREE.Mesh {
    return mesh(new THREE.CylinderGeometry(top, bottom, h, sides), surface, x, y, z, parent);
  }

  function beam(a: THREE.Vector3, b: THREE.Vector3, width: number, surface: THREE.Material, parent: THREE.Object3D = root): THREE.Mesh {
    const object = cylinder(width, width, a.distanceTo(b), surface, 0, 0, 0, 6, parent);
    object.position.copy(a).add(b).multiplyScalar(0.5);
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return object;
  }

  function halo(parent: THREE.Object3D, size: number): THREE.Mesh {
    const surface = new THREE.MeshBasicMaterial({ color: 0xffa3b0, transparent: true, opacity: 0.16, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    materials.add(surface);
    const object = mesh(new THREE.SphereGeometry(size, 10, 6), surface, 0, 0, 0, parent);
    object.castShadow = false;
    object.receiveShadow = false;
    object.userData.effect = true;
    object.raycast = () => {};
    lightVolumes.push(object);
    return object;
  }

  function lantern(parent: THREE.Object3D, x: number, y: number, z: number, scale = 1): THREE.Group {
    const group = new THREE.Group();
    parent.add(group);
    group.position.set(x, y, z);
    group.scale.setScalar(scale);
    cylinder(0.19, 0.23, 0.09, iron, 0, -0.29, 0, 6, group);
    cylinder(0.24, 0.13, 0.14, iron, 0, 0.29, 0, 6, group);
    cylinder(0.10, 0.20, 0.33, glow(1.7), 0, -0.01, 0, 6, group);
    for (let i = 0; i < 4; i++) {
      const angle = Math.PI * 0.25 + i * Math.PI * 0.5;
      beam(new THREE.Vector3(Math.cos(angle) * 0.17, -0.25, Math.sin(angle) * 0.17), new THREE.Vector3(Math.cos(angle) * 0.17, 0.25, Math.sin(angle) * 0.17), 0.022, iron, group);
    }
    const ring = mesh(new THREE.TorusGeometry(0.08, 0.018, 4, 10), brass, 0, 0.43, 0, group);
    ring.rotation.y = Math.PI * 0.5;
    halo(group, 0.53);
    return group;
  }

  function door(x: number, y: number, z: number, width: number, height: number, parent: THREE.Object3D = root): void {
    box(width + 0.22, height + 0.15, 0.12, woodDark, x, y + height * 0.5, z - 0.04, parent);
    const hinge = new THREE.Group();
    hinge.position.set(x - width * 0.5, y, z + 0.06);
    parent.add(hinge);
    hinges.push(hinge);
    for (let i = 0; i < 5; i++) box(width / 5 - 0.012, height, 0.09, i % 2 ? wood : woodLight, (i + 0.5) * width / 5, height * 0.5, 0, hinge);
    for (const yy of [height * 0.22, height * 0.78]) box(width * 0.92, 0.07, 0.12, iron, width * 0.5, yy, 0.025, hinge);
    mesh(new THREE.SphereGeometry(0.045, 6, 4), brass, width * 0.82, height * 0.48, 0.09, hinge);
    box(0.1, height + 0.18, 0.17, woodLight, x - width / 2 - 0.06, y + height / 2, z + 0.03, parent);
    box(0.1, height + 0.18, 0.17, woodLight, x + width / 2 + 0.06, y + height / 2, z + 0.03, parent);
    box(width + 0.24, 0.12, 0.18, woodLight, x, y + height + 0.06, z + 0.03, parent);
  }

  function roof(width: number, depth: number, eaveY: number, rise: number, parent: THREE.Object3D = root): void {
    const slope = Math.atan2(rise, width * 0.5);
    const length = Math.hypot(width * 0.5, rise);
    for (const side of [-1, 1]) {
      const panel = box(length, 0.14, depth, slate[0], side * width / 4, eaveY + rise / 2, 0, parent);
      panel.rotation.z = -side * slope;
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 6; col++) {
          const distance = (row + 0.5) / 4;
          const tile = box(length / 4 + 0.04, 0.065, depth / 6 - 0.025, slate[(col + row) % slate.length], side * width / 2 * distance, eaveY + rise * (1 - distance) + 0.10, (col - 2.5) * depth / 6, parent);
          tile.rotation.z = -side * slope;
        }
      }
      for (const z of [-depth / 2, depth / 2]) beam(new THREE.Vector3(0, eaveY + rise + 0.04, z), new THREE.Vector3(side * width / 2, eaveY, z), 0.075, woodDark, parent);
    }
    beam(new THREE.Vector3(0, eaveY + rise + 0.13, -depth / 2 - 0.08), new THREE.Vector3(0, eaveY + rise + 0.13, depth / 2 + 0.08), 0.085, slate[2], parent);
  }

  if (kind === 'lighthouse') {
    cylinder(2.45, 2.7, 0.4, darkStone, 0, 0.2);
    cylinder(2.12, 2.35, 0.32, stone[1], 0, 0.56);
    cylinder(1.2, 1.85, 9.65, stone[0], 0, 5.5, 0, 12);
    for (let row = 0; row < 12; row++) {
      const y = 1 + row * 0.77;
      const r = 1.85 - (y - 0.68) / 9.65 * 0.65;
      cylinder(r + 0.035, r + 0.065, 0.08, row % 3 === 0 ? stone[2] : stone[1], 0, y, 0, 12);
    }
    for (const [y, angle] of [[3.7, 0], [6.1, 1.5], [8.5, 3.2]]) {
      const r = 1.85 - (y - 0.68) / 9.65 * 0.65;
      const group = new THREE.Group();
      group.position.set(Math.sin(angle) * r, y, Math.cos(angle) * r);
      group.rotation.y = angle;
      root.add(group);
      box(0.39, 0.86, 0.11, darkStone, 0, 0, 0, group);
      box(0.18, 0.57, 0.12, glow(0.6), 0, 0, 0.065, group);
      box(0.5, 0.1, 0.3, stone[1], 0, -0.47, 0.05, group);
    }
    door(0, 0.72, 1.84, 0.93, 1.65);
    for (let i = 0; i < 3; i++) box(1.4 + i * 0.18, 0.19, 0.48, stone[i], 0, 0.59 - i * 0.18, 2.05 + i * 0.4);
    cylinder(1.85, 1.45, 0.27, darkStone, 0, 10.4, 0, 12);
    cylinder(1.82, 1.82, 0.14, stone[1], 0, 10.6, 0, 12);
    cylinder(1.26, 1.26, 1.65, glow(0.8), 0, 11.48, 0, 12);
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      const x = Math.sin(a), z = Math.cos(a);
      cylinder(0.035, 0.035, 1.7, iron, x * 1.28, 11.48, z * 1.28, 5);
      cylinder(0.035, 0.045, 0.76, iron, x * 1.69, 11.03, z * 1.69, 5);
    }
    const rail = mesh(new THREE.TorusGeometry(1.7, 0.045, 4, 12), iron, 0, 11.4);
    rail.rotation.x = Math.PI / 2;
    cylinder(1.54, 1.54, 0.18, iron, 0, 12.34, 0, 12);
    cylinder(0.14, 1.74, 1.08, slate[0], 0, 12.96, 0, 12);
    cylinder(0.02, 0.09, 0.58, brass, 0, 13.75, 0, 6);
    const beacon = new THREE.Group();
    beacon.position.y = 11.5;
    root.add(beacon);
    cylinder(0.3, 0.3, 0.75, glow(3), 0, 0, 0, 8, beacon);
    halo(beacon, 1.55);
    const beamMaterial = new THREE.MeshBasicMaterial({ color: 0xe8eef1, transparent: true, opacity: 0.07, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    materials.add(beamMaterial);
    const shaft = mesh(new THREE.ConeGeometry(1.1, 9, 12, 1, true), beamMaterial, 0, 0, 5.1, beacon);
    shaft.rotation.x = -Math.PI / 2;
    shaft.castShadow = false;
    shaft.receiveShadow = false;
    shaft.userData.effect = true;
    shaft.raycast = () => {};
    lightVolumes.push(shaft);
    animations.push(elapsed => { beacon.rotation.y = elapsed * 0.17; });
  }

  if (kind === 'arch') {
    const inner = 1.65, outer = 2.37, spring = 2.55;
    for (const side of [-1, 1]) {
      box(1.14, 0.22, 1.22, darkStone, side * 2.02, 0.11);
      for (let row = 0; row < 5; row++) {
        const block = box(0.77 + (row % 2) * 0.07, 0.49, 0.96 + (row % 2) * 0.06, stone[(row + (side + 1)) % 4], side * 2.01, 0.47 + row * 0.48);
        block.rotation.y = Math.sin(row * 3 + side) * 0.025;
      }
      box(0.96, 0.14, 1.16, stone[1], side * 2.01, spring);
      for (let j = 0; j < 3; j++) {
        const rock = mesh(new THREE.DodecahedronGeometry(0.25 + j * 0.06), j === 1 ? moss : stone[2], side * (2.25 + j * 0.22), 0.18, (j - 1) * 0.42);
        rock.scale.y = 0.55;
      }
    }
    for (let i = 0; i < 13; i++) {
      const a = i / 13 * Math.PI + 0.012, b = (i + 1) / 13 * Math.PI - 0.012;
      const shape = new THREE.Shape();
      shape.moveTo(Math.cos(a) * inner, spring + Math.sin(a) * inner);
      shape.lineTo(Math.cos(a) * outer, spring + Math.sin(a) * outer);
      shape.lineTo(Math.cos(b) * outer, spring + Math.sin(b) * outer);
      shape.lineTo(Math.cos(b) * inner, spring + Math.sin(b) * inner);
      shape.closePath();
      const block = mesh(new THREE.ExtrudeGeometry(shape, { depth: i === 6 ? 1.16 : 0.96, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 1, steps: 1 }), stone[i % 4], 0, 0, i === 6 ? -0.58 : -0.48);
      if (i === 6) block.position.y = 0.06;
    }
    const crest = mesh(new THREE.OctahedronGeometry(0.14), brass, 0, 4.53, 0.65);
    crest.scale.set(0.65, 1.4, 0.3);
    for (const side of [-1, 1]) {
      beam(new THREE.Vector3(side * 2.32, 0.3, 0.52), new THREE.Vector3(side * 2.27, 2.9, 0.55), 0.025, moss);
      for (let j = 0; j < 7; j++) {
        const leaf = mesh(new THREE.OctahedronGeometry(0.13), moss, side * (2.28 + Math.sin(j * 2) * 0.11), 0.6 + j * 0.32, 0.59);
        leaf.scale.set(0.7, 1.7, 0.28);
        leaf.rotation.z = Math.sin(j * 4) * 0.8;
      }
    }
  }

  if (kind === 'boat') {
    const hull = new THREE.Group();
    root.add(hull);
    const sections = 12, strakes = 6;
    const hullSurfaces = [material(0x76503d), material(0x906045)];
    for (const surface of hullSurfaces) surface.side = THREE.DoubleSide;
    const point = (section: number, edge: number, side: number): THREE.Vector3 => {
      const t = section / sections;
      const fullness = Math.pow(Math.sin(Math.PI * t), 0.62);
      const angle = edge / strakes * Math.PI / 2;
      return new THREE.Vector3(side * Math.sin(angle) * fullness * 0.7, 0.13 + (1 - Math.cos(angle)) * 0.6 + Math.pow(Math.abs(t - 0.5) * 2, 3) * 0.25, (t - 0.5) * 3.4);
    };
    for (const side of [-1, 1]) {
      for (let j = 0; j < strakes; j++) {
        const vertices: number[] = [];
        for (let i = 0; i < sections; i++) {
          const a = point(i, j, side), b = point(i + 1, j, side), c = point(i + 1, j + 1, side), d = point(i, j + 1, side);
          for (const p of [a, b, d, b, c, d]) vertices.push(p.x, p.y, p.z);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.computeVertexNormals();
        mesh(geometry, hullSurfaces[j % 2], 0, 0, 0, hull);
      }
      for (let i = 0; i < sections; i++) beam(point(i, strakes, side), point(i + 1, strakes, side), 0.045, woodLight, hull);
      for (const i of [3, 6, 9]) {
        for (let j = 0; j < strakes; j++) beam(point(i, j, side), point(i, j + 1, side), 0.025, woodDark, hull);
      }
    }
    box(0.12, 0.1, 3.1, woodDark, 0, 0.15, 0, hull);
    for (const z of [-0.72, 0.1, 0.85]) box(z === 0.85 ? 0.92 : 1.12, 0.09, 0.24, woodLight, 0, 0.58, z, hull);
    for (const side of [-1, 1]) {
      const oar = new THREE.Group();
      hull.add(oar);
      oar.position.set(side * 0.24, 0.79, -0.04);
      oar.rotation.y = side * 0.62;
      beam(new THREE.Vector3(0, 0, -1.25), new THREE.Vector3(0, 0, 0.9), 0.028, woodLight, oar);
      const blade = box(0.16, 0.045, 0.48, wood, 0, 0, -1.35, oar);
      blade.rotation.z = side * 0.18;
    }
    lantern(hull, 0, 0.96, 1.05, 0.55);
    animations.push(elapsed => {
      hull.position.y = Math.sin(elapsed * 1.1) * 0.035;
      hull.rotation.z = Math.sin(elapsed * 0.7) * 0.025;
      hull.rotation.x = Math.sin(elapsed * 0.9 + 0.8) * 0.012;
    });
  }

  if (kind === 'cabin') {
    for (const x of [-1.55, 1.55]) for (const z of [-1.25, 1.25]) box(0.46, 0.38, 0.46, stone[2], x, 0.19, z);
    box(3.65, 0.18, 3.12, woodDark, 0, 0.4);
    for (let row = 0; row < 11; row++) {
      const y = 0.6 + row * 0.18;
      for (const z of [-1.4, 1.4]) box(3.55, 0.17, 0.16, row % 3 ? wood : woodLight, 0, y, z);
      for (const x of [-1.7, 1.7]) box(0.16, 0.17, 2.85, row % 3 ? wood : woodLight, x, y);
    }
    for (const x of [-1.7, 1.7]) for (const z of [-1.4, 1.4]) box(0.17, 2.3, 0.17, woodDark, x, 1.55, z);
    const gable = new THREE.Shape();
    gable.moveTo(-1.76, 2.48); gable.lineTo(1.76, 2.48); gable.lineTo(0, 3.78); gable.closePath();
    mesh(new THREE.ExtrudeGeometry(gable, { depth: 2.86, bevelEnabled: false }), woodDark, 0, 0, -1.43);
    roof(4.2, 3.6, 2.48, 1.38);
    door(-0.79, 0.49, 1.51, 0.86, 1.64);
    box(1.06, 1.12, 0.13, woodDark, 0.83, 1.56, 1.52);
    box(0.84, 0.9, 0.12, glow(1.65), 0.83, 1.56, 1.6);
    for (const x of [0.34, 1.32]) box(0.09, 1.13, 0.18, woodLight, x, 1.56, 1.64);
    for (const y of [1.02, 2.1]) box(1.14, 0.09, 0.2, woodLight, 0.83, y, 1.64);
    box(0.05, 0.98, 0.1, woodDark, 0.83, 1.56, 1.71);
    box(0.95, 0.05, 0.1, woodDark, 0.83, 1.56, 1.71);
    for (const side of [-1, 1]) {
      const shutter = box(0.3, 1.05, 0.08, slate[1], 0.83 + side * 0.73, 1.56, 1.62);
      shutter.rotation.y = side * 0.18;
      for (let j = 0; j < 5; j++) box(0.28, 0.035, 0.04, slate[0], 0.83 + side * 0.73, 1.2 + j * 0.18, 1.69);
    }
    box(3.85, 0.14, 0.86, woodLight, 0, 0.4, 1.86);
    box(1.2, 0.2, 0.45, stone[1], -0.79, 0.17, 2.39);
    box(0.52, 1.6, 0.55, darkStone, 1.12, 3.04, -0.62);
    for (let j = 0; j < 5; j++) box(0.56, 0.05, 0.59, stone[2], 1.12, 2.7 + j * 0.25, -0.62);
    box(0.7, 0.14, 0.72, stone[1], 1.12, 3.92, -0.62);
    box(0.34, 0.035, 0.36, iron, 1.12, 4.0, -0.62);
    lantern(root, -1.42, 2.08, 1.72, 0.55);
    for (let i = 0; i < 4; i++) {
      const log = cylinder(0.11, 0.12, 0.7, wood, 1.99, 0.2 + Math.floor(i / 2) * 0.22, -0.3 + (i % 2) * 0.26, 7);
      log.rotation.z = Math.PI / 2;
    }
  }

  if (kind === 'lantern') {
    cylinder(0.3, 0.42, 0.22, darkStone, 0, 0.11);
    cylinder(0.12, 0.19, 0.25, iron, 0, 0.31);
    cylinder(0.065, 0.095, 2.15, iron, 0, 1.49);
    for (const y of [0.52, 2.23, 2.53]) cylinder(0.12, 0.12, 0.07, brass, 0, y);
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 2.47, 0), new THREE.Vector3(0.04, 2.78, 0), new THREE.Vector3(0.37, 2.91, 0), new THREE.Vector3(0.65, 2.77, 0), new THREE.Vector3(0.65, 2.59, 0)]);
    mesh(new THREE.TubeGeometry(curve, 16, 0.037, 5, false), iron);
    const lamp = lantern(root, 0.65, 2.18, 0, 0.83);
    animations.push(elapsed => { lamp.rotation.z = Math.sin(elapsed * 1.15) * 0.035; });
  }

  if (kind === 'well') {
    cylinder(1.08, 1.18, 0.16, darkStone, 0, 0.08, 0, 12);
    for (let row = 0; row < 3; row++) for (let i = 0; i < 12; i++) {
      const angle = (i + (row % 2) * 0.5) * Math.PI / 6;
      const block = box(0.44, 0.27, 0.3, stone[(i + row) % 4], Math.sin(angle) * 0.87, 0.28 + row * 0.28, Math.cos(angle) * 0.87);
      block.rotation.y = angle;
    }
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6;
      const cap = box(0.51, 0.14, 0.39, stone[(i + 1) % 4], Math.sin(angle) * 0.87, 1.03, Math.cos(angle) * 0.87);
      cap.rotation.y = angle;
    }
    const water = material(0x142b3b, 0.22, 0.45);
    cylinder(0.71, 0.71, 0.02, water, 0, 0.18, 0, 24);
    for (const x of [-1.07, 1.07]) {
      box(0.16, 2.33, 0.18, woodDark, x, 1.35);
      beam(new THREE.Vector3(x, 1.83, 0), new THREE.Vector3(x * 0.62, 2.47, 0), 0.055, woodLight);
    }
    roof(2.9, 1.95, 2.37, 0.63);
    const axle = cylinder(0.075, 0.075, 2.5, woodLight, 0, 1.78, 0, 8);
    axle.rotation.z = Math.PI / 2;
    const spool = cylinder(0.17, 0.17, 0.36, wood, 0, 1.78, 0, 8);
    spool.rotation.z = Math.PI / 2;
    for (let i = 0; i < 7; i++) {
      const coil = mesh(new THREE.TorusGeometry(0.17, 0.017, 4, 12), woodLight, (i - 3) * 0.045, 1.78);
      coil.rotation.y = Math.PI / 2;
    }
    beam(new THREE.Vector3(0, 0.42, 0.12), new THREE.Vector3(0, 1.8, 0.12), 0.018, woodLight);
    beam(new THREE.Vector3(1.3, 1.78, 0), new THREE.Vector3(1.3, 1.44, 0), 0.035, iron);
    beam(new THREE.Vector3(1.3, 1.44, 0), new THREE.Vector3(1.53, 1.44, 0), 0.045, wood);
    cylinder(0.21, 0.16, 0.3, wood, -0.55, 1.24, 0.45, 8);
    mesh(new THREE.TorusGeometry(0.18, 0.018, 4, 10, Math.PI), iron, -0.55, 1.39, 0.45);
  }

  if (kind === 'stranger') {
    const figure = new THREE.Group();
    root.add(figure);
    const cloakMaterial = material(0x29334f);
    const lining = material(0x131e33);
    box(0.18, 0.13, 0.34, woodDark, -0.16, 0.065, 0.08, figure);
    box(0.18, 0.13, 0.34, woodDark, 0.16, 0.065, 0.08, figure);
    const vertices: number[] = [];
    const rows = 9, folds = 20;
    const cloakPoint = (row: number, col: number): THREE.Vector3 => {
      const t = row / rows, a = col / folds * Math.PI * 2;
      const r = (0.49 - t * 0.27) + Math.cos(a * 10) * (0.045 - t * 0.025);
      return new THREE.Vector3(Math.sin(a) * r, 0.13 + t * 1.39 + Math.cos(a * 3) * 0.035 * (1 - t), Math.cos(a) * r * 0.76 - 0.06);
    };
    for (let row = 0; row < rows; row++) for (let col = 0; col < folds; col++) {
      const a = cloakPoint(row, col), b = cloakPoint(row, col + 1), c = cloakPoint(row + 1, col + 1), d = cloakPoint(row + 1, col);
      for (const p of [a, b, d, b, c, d]) vertices.push(p.x, p.y, p.z);
    }
    const cloak = new THREE.BufferGeometry();
    cloak.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    cloak.computeVertexNormals();
    cloakMaterial.side = THREE.DoubleSide;
    mesh(cloak, cloakMaterial, 0, 0, 0, figure);
    const shoulder = mesh(new THREE.SphereGeometry(0.32, 10, 6), cloakMaterial, 0, 1.4, -0.06, figure);
    shoulder.scale.set(1.2, 0.56, 0.88);
    const head = new THREE.Group();
    head.position.set(0, 1.63, -0.045);
    figure.add(head);
    const hood = mesh(new THREE.SphereGeometry(0.3, 12, 8, 0.52, Math.PI * 2 - 1.04), cloakMaterial, 0, 0, 0, head);
    hood.rotation.y = Math.PI / 2;
    hood.scale.set(1, 1.17, 1.05);
    const face = mesh(new THREE.SphereGeometry(0.23, 10, 6), lining, 0, -0.025, 0.095, head);
    face.scale.set(0.86, 1.12, 0.58);
    const clasp = mesh(new THREE.OctahedronGeometry(0.055), brass, 0, 1.38, 0.21, figure);
    clasp.scale.z = 0.4;
    beam(new THREE.Vector3(-0.24, 1.4, 0), new THREE.Vector3(-0.39, 0.94, 0.15), 0.115, cloakMaterial, figure);
    beam(new THREE.Vector3(0.24, 1.39, 0), new THREE.Vector3(0.47, 1.08, 0.19), 0.11, cloakMaterial, figure);
    beam(new THREE.Vector3(0.47, 1.08, 0.19), new THREE.Vector3(0.55, 1.1, 0.4), 0.075, cloakMaterial, figure);
    mesh(new THREE.SphereGeometry(0.07, 6, 4), material(0xd9c2b4), 0.55, 1.1, 0.42, figure);
    lantern(figure, 0.55, 0.78, 0.42, 0.58);
    const localPlayer = new THREE.Vector3();
    let last = -1;
    animations.push((elapsed, player) => {
      const dt = last < 0 ? 0.016 : Math.min(0.05, Math.max(0, elapsed - last));
      last = elapsed;
      figure.rotation.z = Math.sin(elapsed * 0.75) * 0.008;
      root.updateWorldMatrix(true, false);
      localPlayer.copy(player);
      root.worldToLocal(localPlayer);
      const target = Math.atan2(localPlayer.x, localPlayer.z);
      const delta = Math.atan2(Math.sin(target - figure.rotation.y), Math.cos(target - figure.rotation.y));
      figure.rotation.y += delta * (1 - Math.exp(-dt * 3.2));
      head.rotation.y = THREE.MathUtils.clamp(delta, -0.4, 0.4);
    });
  }

  const parents: THREE.Object3D[] = [];
  root.traverse(object => { if (object.children.some(child => child instanceof THREE.Mesh)) parents.push(object); });
  for (const parent of parents) {
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of parent.children) {
      if (!(child instanceof THREE.Mesh) || child.userData.effect || Array.isArray(child.material)) continue;
      const batch = batches.get(child.material) ?? [];
      batch.push(child);
      batches.set(child.material, batch);
    }
    for (const [surface, batch] of batches) {
      if (batch.length < 2) continue;
      const parts = batch.map(object => {
        object.updateMatrix();
        const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
        for (const attribute of Object.keys(geometry.attributes)) {
          if (attribute !== 'position' && attribute !== 'normal') geometry.deleteAttribute(attribute);
        }
        geometry.applyMatrix4(object.matrix);
        return geometry;
      });
      const merged = mergeGeometries(parts, false);
      for (const part of parts) part.dispose();
      if (!merged) continue;
      for (const object of batch) parent.remove(object);
      mesh(merged, surface, 0, 0, 0, parent);
    }
  }
  const retained = new Set<THREE.BufferGeometry>();
  root.traverse(object => { if (object instanceof THREE.Mesh) retained.add(object.geometry); });
  for (const geometry of geometries) {
    if (retained.has(geometry)) continue;
    geometry.dispose();
    geometries.delete(geometry);
  }

  const metadata = identities[kind];
  root.userData.name = metadata.name;
  root.userData.description = metadata.description;
  root.userData.lit = true;
  root.userData.doorOpen = false;
  root.userData.gone = false;

  return {
    id,
    kind,
    ...metadata,
    root,
    update(elapsed, player) {
      if (disposed || !Number.isFinite(elapsed)) return;
      for (const animate of animations) animate(elapsed, player);
      const flicker = 0.96 + Math.sin(elapsed * 3.7) * 0.025 + Math.sin(elapsed * 7.1) * 0.015;
      for (const [surface, intensity] of luminous) surface.emissiveIntensity = lit ? intensity * flicker : 0;
    },
    apply(change) {
      if (disposed) return;
      if (typeof change.lit === 'boolean') {
        lit = change.lit;
        root.userData.lit = lit;
        for (const [surface, intensity] of luminous) {
          surface.emissiveIntensity = lit ? intensity : 0;
          surface.color.setHex(lit ? 0xff8e9e : 0x3b4652);
        }
        for (const volume of lightVolumes) volume.visible = lit;
      }
      if (typeof change.doorOpen === 'boolean') {
        root.userData.doorOpen = change.doorOpen;
        for (const hinge of hinges) hinge.rotation.y = change.doorOpen ? -Math.PI * 0.57 : 0;
      }
      if (typeof change.gone === 'boolean') {
        root.visible = !change.gone;
        root.userData.gone = change.gone;
      }
      if (change.position && typeof change.position === 'object') {
        const position = change.position as Record<string, unknown>;
        for (const axis of ['x', 'y', 'z'] as const) {
          const value = position[axis];
          if (typeof value === 'number' && Number.isFinite(value)) root.position[axis] = value;
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      root.clear();
      for (const geometry of geometries) geometry.dispose();
      for (const surface of materials) surface.dispose();
      geometries.clear();
      materials.clear();
      luminous.clear();
      animations.length = 0;
      lightVolumes.length = 0;
      hinges.length = 0;
    },
  };
}
