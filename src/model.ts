// Core data model. All lengths are in metres internally; the UI converts.

export const C0 = 299_792_458; // speed of light, m/s

export type ElementRole = 'reflector' | 'driven' | 'director';

export interface YagiElement {
  role: ElementRole;
  /** Position along the boom (m). Driven element is at 0, forward is +x. */
  x: number;
  /** Total tip-to-tip length (m). */
  length: number;
}

export interface Design {
  /** Design frequency (Hz). */
  frequency: number;
  /** Element diameter (m); uniform across elements for now. */
  diameter: number;
  elements: YagiElement[];
}

export const wavelength = (frequency: number): number => C0 / frequency;

export const boomLength = (d: Design): number => {
  if (d.elements.length === 0) return 0;
  const xs = d.elements.map((e) => e.x);
  return Math.max(...xs) - Math.min(...xs);
};

export function swr(z: { re: number; im: number }, z0 = 50): number {
  // |Γ| = |(Z − Z0)/(Z + Z0)|
  const nr = z.re - z0, ni = z.im, dr = z.re + z0, di = z.im;
  const g = Math.hypot(nr, ni) / Math.hypot(dr, di);
  return g >= 1 ? Infinity : (1 + g) / (1 - g);
}
