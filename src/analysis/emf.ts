import { type Complex, add, cx, expNegJ, scale } from './complex';
import { integrate } from './quad';

// Induced-EMF self and mutual impedance of thin, parallel, centre-aligned
// dipoles carrying sinusoidal current — the element model used for Yagi
// analysis in Lawson, "Yagi Antenna Design" (ARRL 1986), ch. 2; formulas as
// in Balanis, "Antenna Theory", §8.6.
//
// Element n has half-length h_n and current I_n(z) = I_m,n · sin(k(h_n − |z|)).
// The near field of element 1 along a line at distance d (Schelkunoff, exact
// for a sinusoidal filament):
//
//   E_z(z) = −j30·I_m1 [e^{−jkR1}/R1 + e^{−jkR2}/R2 − 2cos(kh1)·e^{−jkr0}/r0]
//
// and the mutual impedance, referred to the element centres (feed points), is
//
//   Z21 = −1/(I_1(0)·I_2(0)) ∫_{−h2}^{h2} E_z(z) I_2(z) dz.
//
// The self impedance is the same integral with d = wire radius.

const ETA_OVER_4PI = 30; // η0/4π with η0 = 120π

export function mutualImpedance(k: number, h1: number, h2: number, d: number): Complex {
  const c = 2 * Math.cos(k * h1);
  const field = (z: number): Complex => {
    const R1 = Math.hypot(d, z - h1), R2 = Math.hypot(d, z + h1), r0 = Math.hypot(d, z);
    const e1 = scale(expNegJ(k * R1), 1 / R1);
    const e2 = scale(expNegJ(k * R2), 1 / R2);
    const e0 = scale(expNegJ(k * r0), -c / r0);
    return scale(add(add(e1, e2), e0), Math.sin(k * (h2 - Math.abs(z))));
  };
  // The integrand is even in z: integrate [0, h2] and double, splitting at
  // the peaks (z = 0 is an endpoint; z = h1 if inside the range).
  const breaks = [0, ...(h1 < h2 ? [h1] : []), h2];
  let s = cx(0);
  for (let i = 0; i + 1 < breaks.length; i++) s = add(s, integrate(field, breaks[i]!, breaks[i + 1]!));
  // Z = j30 · 2 · s / (sin kh1 · sin kh2)
  const f = (2 * ETA_OVER_4PI) / (Math.sin(k * h1) * Math.sin(k * h2));
  return { re: -s.im * f, im: s.re * f };
}
