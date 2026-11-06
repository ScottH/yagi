import { type Complex, add } from './complex';

// Adaptive Gauss–Legendre quadrature for complex-valued integrands.
// The induced-EMF integrands are smooth but sharply peaked (width ~ wire
// radius) near element ends and centre, so fixed rules undersample them.

const X = [-0.9602898564975363, -0.7966664774136267, -0.5255324099163290, -0.1834346424956498,
  0.1834346424956498, 0.5255324099163290, 0.7966664774136267, 0.9602898564975363];
const W = [0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.3626837833783620,
  0.3626837833783620, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];

function gl8(f: (x: number) => Complex, a: number, b: number): Complex {
  const m = (a + b) / 2, h = (b - a) / 2;
  let re = 0, im = 0;
  for (let i = 0; i < 8; i++) {
    const v = f(m + h * X[i]!);
    re += W[i]! * v.re;
    im += W[i]! * v.im;
  }
  return { re: re * h, im: im * h };
}

export function integrate(f: (x: number) => Complex, a: number, b: number, tol = 1e-9, depth = 40): Complex {
  const whole = gl8(f, a, b);
  const go = (lo: number, hi: number, est: Complex, d: number): Complex => {
    const mid = (lo + hi) / 2;
    const l = gl8(f, lo, mid), r = gl8(f, mid, hi);
    const both = add(l, r);
    if (d <= 0 || Math.hypot(both.re - est.re, both.im - est.im) <= tol * Math.max(1, Math.hypot(both.re, both.im))) return both;
    return add(go(lo, mid, l, d - 1), go(mid, hi, r, d - 1));
  };
  return go(a, b, whole, depth);
}
