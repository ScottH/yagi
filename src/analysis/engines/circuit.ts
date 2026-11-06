import { type Complex, add, cx, div, expNegJ, mul, scale, solve, abs2 } from '../complex';
import { type Solution, type Vec3, drivenIndex } from '../engine';
import { type Design, C0 } from '../../model';

// Shared by the two "circuit" engines (Lawson; induced EMF): each element is
// one port with an assumed sinusoidal current, coupled through an N×N
// impedance matrix (Carter's method, Lawson eq. 1.17). Drive the driver with
// 1 V, short the parasites, solve Z·I = V for the centre currents.

export interface CircuitModel {
  /** Z_ij between elements i and j (i === j: self-impedance), at wavelength λ. */
  impedance(design: Design, i: number, j: number, lambda: number): Complex;
  /**
   * Scale applied to the element pattern g(ψ) = [cos(πl·cosψ) − cos(πl)]/sinψ
   * for centre current I and length l (λ); see each engine for why.
   */
  patternScale(l: number): number;
}

export function solveCircuit(model: CircuitModel, design: Design, frequency: number): Solution {
  const lambda = C0 / frequency;
  const n = design.elements.length;
  const Z: Complex[][] = Array.from({ length: n }, () => new Array<Complex>(n));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const z = model.impedance(design, i, j, lambda);
      Z[i]![j] = z;
      Z[j]![i] = z;
    }
  }
  const drv = drivenIndex(design);
  const currents = solve(Z, design.elements.map((_, i) => cx(i === drv ? 1 : 0)));
  const iDr = currents[drv]!;
  const pIn = 0.5 * iDr.re; // ½·|I|²·R_in with V = 1 (Lawson eq. 1.23)
  const k = (2 * Math.PI) / lambda;
  const weights = design.elements.map((e, i) => scale(currents[i]!, model.patternScale(e.length / lambda)));

  return {
    zIn: div(cx(1), iDr),
    // Lawson eq. 1.24 generalised to any direction: D = 60/P_in · |Σ e^{jk r̂·r_i} I_i g_i|²
    directivity([ux, , uz]: Vec3): number {
      const sinPsi = Math.sqrt(Math.max(0, 1 - uz * uz));
      if (sinPsi < 1e-9) return 0;
      let s = cx(0);
      design.elements.forEach((e, i) => {
        const pl = (Math.PI * e.length) / lambda;
        const g = (Math.cos(pl * uz) - Math.cos(pl)) / sinPsi; // eq. 1.26/1.28
        s = add(s, scale(mul(weights[i]!, expNegJ(-k * e.x * ux)), g));
      });
      return (60 * abs2(s)) / pIn;
    },
  };
}
