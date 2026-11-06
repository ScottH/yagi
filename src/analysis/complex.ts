// Minimal complex arithmetic. Plain objects keep the maths readable; the
// systems here are tiny (N ≤ ~40), so allocation cost doesn't matter.

export interface Complex { re: number; im: number }

export const cx = (re: number, im = 0): Complex => ({ re, im });
export const add = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
export const sub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });
export const mul = (a: Complex, b: Complex): Complex => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
export const scale = (a: Complex, s: number): Complex => ({ re: a.re * s, im: a.im * s });
export const abs2 = (a: Complex): number => a.re * a.re + a.im * a.im;
export const abs = (a: Complex): number => Math.hypot(a.re, a.im);
export function div(a: Complex, b: Complex): Complex {
  const d = abs2(b);
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}
/** e^{-jθ} */
export const expNegJ = (theta: number): Complex => ({ re: Math.cos(theta), im: -Math.sin(theta) });

/**
 * Dense complex linear system in split re/im storage (row-major), solved in
 * place by Gaussian elimination with partial pivoting. Fast enough for the
 * few-hundred-unknown systems the moment-method engine produces.
 */
export class CMatrix {
  readonly re: Float64Array;
  readonly im: Float64Array;
  constructor(readonly n: number) {
    this.re = new Float64Array(n * n);
    this.im = new Float64Array(n * n);
  }
  set(i: number, j: number, z: Complex): void {
    this.re[i * this.n + j] = z.re;
    this.im[i * this.n + j] = z.im;
  }
  get(i: number, j: number): Complex {
    return { re: this.re[i * this.n + j]!, im: this.im[i * this.n + j]! };
  }
  /** Solve A·x = b. Destroys this matrix. */
  solve(b: Complex[]): Complex[] {
    const { n, re, im } = this;
    const br = Float64Array.from(b, (z) => z.re), bi = Float64Array.from(b, (z) => z.im);
    for (let c = 0; c < n; c++) {
      let p = c, best = -1;
      for (let r = c; r < n; r++) {
        const m = re[r * n + c]! ** 2 + im[r * n + c]! ** 2;
        if (m > best) { best = m; p = r; }
      }
      if (best === 0) throw new Error('Singular impedance matrix');
      if (p !== c) {
        for (let k = 0; k < n; k++) {
          const a = c * n + k, b2 = p * n + k;
          [re[a], re[b2]] = [re[b2]!, re[a]!];
          [im[a], im[b2]] = [im[b2]!, im[a]!];
        }
        [br[c], br[p]] = [br[p]!, br[c]!];
        [bi[c], bi[p]] = [bi[p]!, bi[c]!];
      }
      const pr = re[c * n + c]!, pi = im[c * n + c]!, pd = pr * pr + pi * pi;
      for (let r = c + 1; r < n; r++) {
        const ar = re[r * n + c]!, ai = im[r * n + c]!;
        if (ar === 0 && ai === 0) continue;
        const fr = (ar * pr + ai * pi) / pd, fi = (ai * pr - ar * pi) / pd;
        for (let k = c; k < n; k++) {
          const xr = re[c * n + k]!, xi = im[c * n + k]!;
          re[r * n + k]! -= fr * xr - fi * xi;
          im[r * n + k]! -= fr * xi + fi * xr;
        }
        const xr = br[c]!, xi = bi[c]!;
        br[r]! -= fr * xr - fi * xi;
        bi[r]! -= fr * xi + fi * xr;
      }
    }
    const x: Complex[] = new Array(n);
    for (let r = n - 1; r >= 0; r--) {
      let sr = br[r]!, si = bi[r]!;
      for (let k = r + 1; k < n; k++) {
        const ar = re[r * n + k]!, ai = im[r * n + k]!, xk = x[k]!;
        sr -= ar * xk.re - ai * xk.im;
        si -= ar * xk.im + ai * xk.re;
      }
      x[r] = div({ re: sr, im: si }, { re: re[r * n + r]!, im: im[r * n + r]! });
    }
    return x;
  }
}

/** Solve A·x = b for a small system given as nested arrays. */
export function solve(A: Complex[][], b: Complex[]): Complex[] {
  const M = new CMatrix(b.length);
  A.forEach((row, i) => row.forEach((z, j) => M.set(i, j, z)));
  return M.solve(b);
}
