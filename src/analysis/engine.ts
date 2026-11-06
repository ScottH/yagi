import type { Complex } from './complex';
import type { Design } from '../model';

// Every analysis engine solves the antenna at one frequency and returns the
// feed-point impedance plus a directivity function. Coordinates follow
// Lawson (Fig. 1.1): elements parallel to z, boom along x, forward = +x.

export type Vec3 = readonly [number, number, number];

export interface Solution {
  /** Feed-point impedance of the driven element (ohms). */
  zIn: Complex;
  /** Directivity (linear, relative to isotropic) in unit direction u. */
  directivity(u: Vec3): number;
}

export type EngineId = 'lawson' | 'emf' | 'mom';

export interface Engine {
  id: EngineId;
  label: string;
  solve(design: Design, frequency: number): Solution;
}

export function drivenIndex(d: Design): number {
  const i = d.elements.findIndex((e) => e.role === 'driven');
  if (i < 0) throw new Error('Design has no driven element');
  return i;
}
