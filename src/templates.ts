import { type Design, wavelength } from './model';
import { NBS_DESIGNS, PREFERRED_DESIGNS, type ReferenceDesign } from './data/lawson';

// Starting designs from Lawson's book, rescaled to the user's frequency and
// element diameter with his radius-scaling procedure (ch. 7, eqs. 7.1–7.6):
// keep each element's reactance at the design frequency unchanged so the same
// currents flow, by adjusting its length for the new radius.

/** A = 430.8 log K − 339, the reactance slope (eq. 7.2). */
const slopeA = (K: number) => 430.8 * Math.log10(K) - 339;
/** Resonant length in λ (eq. 7.3). */
function resonantLength(K: number): number {
  const L = Math.log10(K);
  return 0.5 - (33.25 + 3.19 * L - 0.35 * L * L) / (861.6 * L - 678);
}

/** New length (λ) for an element of length l (λ) when radius changes aFrom → aTo (λ). Eqs. 7.5–7.6. */
export function scaleRadius(l: number, aFrom: number, aTo: number): number {
  const Kd = 1 / aFrom, Ks = 1 / aTo;
  const fRd = resonantLength(Kd) / l;
  const fRs = 1 - (slopeA(Kd) * (1 - fRd)) / slopeA(Ks);
  return resonantLength(Ks) / fRs;
}

export interface Template { id: string; label: string; ref: ReferenceDesign }

export const TEMPLATES: Template[] = [
  ...PREFERRED_DESIGNS.map((ref) => ({ id: `lawson-${ref.elements.length}`, label: `${ref.name} (Table 7.1)`, ref })),
  ...NBS_DESIGNS.filter((r) => r.elements.length > 2).map((ref) => ({
    id: `nbs-${ref.elements.length}`, label: `${ref.name} (NBS TN 688)`, ref,
  })),
];

export function fromTemplate(t: Template, frequency: number, diameter: number): Design {
  const lam = wavelength(frequency);
  const aTo = diameter / 2 / lam;
  const els = t.ref.elements;
  const drv = els.length >= 2 ? 1 : 0;
  const x0 = els[drv]![0]; // put the driven element at the origin
  return {
    frequency,
    diameter,
    elements: els.map(([x, l], i) => ({
      role: i === drv ? 'driven' : i < drv ? 'reflector' : 'director',
      x: (x - x0) * lam,
      length: scaleRadius(l, t.ref.radius, aTo) * lam,
    })),
  };
}
