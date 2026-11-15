import { pathX, shore } from './terrain';
import type { ThingKind } from './things';

export const SECTOR = 440;
export const kinds: ThingKind[] = ['lantern', 'stranger', 'well', 'arch', 'cabin', 'boat', 'lighthouse'];
const offsets = [-8, -68, -128, -190, -250, -312, -378];
const side = [3.4, -3.6, 8.5, 0, -15, 0, 0];

export function spot(index: number, sector: number, seed: number) {
  const kind = kinds[index], z = -sector * SECTOR + offsets[index];
  const x = kind === 'boat' ? shore(z, seed) - 1.5 : kind === 'lighthouse' ? shore(z, seed) - 13 : pathX(z, seed) + side[index];
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
