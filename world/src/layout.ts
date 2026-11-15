import { pathX, shore } from './terrain';
import type { ThingKind } from './things';

export const SECTOR = 192;
export const kinds: ThingKind[] = ['lantern', 'stranger', 'well', 'arch', 'cabin', 'boat', 'lighthouse'];
const offsets = [5, -6, -13, -25, -40, -48, -65];
const side = [3, -3, 6, 0, -10, 0, 0];

export function spot(index: number, sector: number, seed: number) {
  const kind = kinds[index], z = -sector * SECTOR + offsets[index];
  const x = kind === 'boat' ? shore(z, seed) - 1 : kind === 'lighthouse' ? shore(z, seed) - 9 : pathX(z, seed) + side[index];
  return { kind, x, z };
}

export function clearance(x: number, z: number, seed: number) {
  const sector = Math.round(-z / SECTOR);
  let best = Infinity;
  for (let s = sector - 1; s <= sector + 1; s++) for (let i = 0; i < kinds.length; i++) {
    const p = spot(i, s, seed);
    best = Math.min(best, Math.hypot(x - p.x, z - p.z));
  }
  return best;
}
