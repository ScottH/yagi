import { type Complex, cx } from '../complex';
import type { Engine } from '../engine';
import { solveCircuit } from './circuit';
import { TABLE_1_3, TABLE_1_3_STEP } from '../../data/lawson';

// Lawson, "Yagi Antenna Design" (1986), chapter 1, implemented as printed.
//
// Self-impedance (eqs. 1.2–1.7, 1.14): Z = 73 + jX, where X is linear in
// length about a resonant length that depends on K = λ/radius. Fitted to
// Hallén-method data (Uda & Mushiake).
//
// Mutual impedance: Table 1.3 (thin half-wave dipoles), cubic interpolation
// in spacing; eqs. 1.15/1.16 beyond 2 λ. Note it ignores element length and
// radius entirely.
//
// Directivity: eq. 1.24, with the element-pattern normalisation noted below.

/** X_0.5: reactance of a 0.5 λ dipole (eq. 1.2, five-term fit). */
export function x05(K: number): number {
  const L = Math.log10(K);
  return 24.1591 + 14.5151 * L - 5.3677 * L ** 2 + 0.9352 * L ** 3 - 0.06184 * L ** 4;
}
/** ΔX = X_0.45 − X_0.5 (eq. 1.3). */
export const deltaX = (K: number): number => -43.1 * Math.log10(K) + 33.9;
/** Resonant length in λ (eq. 1.6). */
export const resonantLength = (K: number): number => 0.5 + x05(K) / (20 * deltaX(K));

/** Self-impedance of an element of length l (λ), K = λ/a (eqs. 1.7, 1.14). */
export function selfImpedance(l: number, K: number): Complex {
  return cx(73, -20 * deltaX(K) * (l - resonantLength(K)));
}

/** Catmull-Rom interpolation through Table 1.3, s in λ. */
export function mutualImpedance(s: number): Complex {
  if (s > 2) {
    const a = 2 * Math.PI * s;
    return cx((19.06 / s) * Math.sin(a), (19.06 / s) * Math.cos(a)); // eqs. 1.15, 1.16
  }
  const t = s / TABLE_1_3_STEP;
  const i = Math.min(Math.floor(t), TABLE_1_3.length - 2);
  const u = t - i;
  const at = (k: number) => TABLE_1_3[Math.max(0, Math.min(TABLE_1_3.length - 1, k))]!;
  const cr = (c: 0 | 1) => {
    const p0 = at(i - 1)[c], p1 = at(i)[c], p2 = at(i + 1)[c], p3 = at(i + 2)[c];
    return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3);
  };
  return cx(cr(0), cr(1));
}

export const lawsonEngine: Engine = {
  id: 'lawson',
  label: 'Lawson (1986)',
  solve: (design, frequency) => solveCircuit({
    impedance(d, i, j, lambda) {
      const ei = d.elements[i]!, ej = d.elements[j]!;
      if (i === j) return selfImpedance(ei.length / lambda, lambda / (d.diameter / 2));
      return mutualImpedance(Math.abs(ei.x - ej.x) / lambda);
    },
    // Eq. 1.26 as printed (g = 1 − cos πl, centre current) is inconsistent with
    // the fixed 73 Ω radiation resistance: a lone 0.47 λ dipole would come out
    // at 1.3 dBi. Normalising g to 1 broadside — every element radiates like a
    // half-wave dipole carrying its centre current, matching R = 73 Ω —
    // reproduces Lawson's published gains (Tables 1.5, 7.1) to ≤ 0.3 dB, so
    // that is evidently what his program did.
    patternScale: (l) => 1 / (1 - Math.cos(Math.PI * l)),
  }, design, frequency),
};
