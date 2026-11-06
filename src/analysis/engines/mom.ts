import { type Complex, CMatrix, cx, div } from '../complex';
import { type Engine, type Solution, type Vec3, drivenIndex } from '../engine';
import { type Design, C0 } from '../../model';

// Thin-wire method of moments, after Harrington, "Field Computation by Moment
// Methods" (1968), ch. 4 — the same family of solution as NEC, simplified to
// parallel straight wires.
//
// Each element is cut into an even number of equal segments. The current is
// piecewise linear: a triangle basis function at each interior node, so it
// falls to zero exactly at the tips; the charge is then piecewise constant.
// The E-field is tested with the same triangles (Galerkin), which gives a
// symmetric matrix and much faster convergence than point matching — needed
// because deep F/B nulls move with sub-ohm changes in element reactance. The
// kernel is the reduced (thin-wire) kernel: R is measured to the wire surface
// on the same element. The driver is fed by
// a 1 V delta gap at its centre node. Nothing about the current shape is
// assumed: element lengths, spacings and radii all enter exactly, and the
// method converges as segments are added.

const ETA0 = 120 * Math.PI;

// 4-point Gauss–Legendre on [−1, 1]
const GX = [-0.8611363115940526, -0.3399810435848563, 0.3399810435848563, 0.8611363115940526];
const GW = [0.3478548451374538, 0.6521451548625461, 0.6521451548625461, 0.3478548451374538];
// 8-point rule for the outer integral over nearby segments
const GX8 = [-0.9602898564975363, -0.7966664774136267, -0.5255324099163290, -0.1834346424956498,
  0.1834346424956498, 0.5255324099163290, 0.7966664774136267, 0.9602898564975363];
const GW8 = [0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.3626837833783620,
  0.3626837833783620, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];

/**
 * ∫ T(z) e^{−jkR}/R dz over [z1, z2] where T is linear, T(z1) = t1, T(z2) = t2.
 * The 1/R part is integrated analytically.
 */
function linearKernelIntegral(k: number, z1: number, z2: number, t1: number, t2: number, z0: number, rho: number): Complex {
  const m = (z1 + z2) / 2, h = (z2 - z1) / 2;
  const beta = (t2 - t1) / (z2 - z1), tAt = (z: number) => t1 + beta * (z - z1);
  let re = 0, im = 0;
  for (let i = 0; i < 4; i++) {
    const z = m + h * GX[i]!, R = Math.hypot(rho, z - z0), w = GW[i]! * tAt(z);
    re += w * (Math.cos(k * R) - 1) / R;
    im += w * -Math.sin(k * R) / R;
  }
  // ∫ (T(z0) + β(z − z0)) / R dz
  const sing = tAt(z0) * (Math.asinh((z2 - z0) / rho) - Math.asinh((z1 - z0) / rho))
    + beta * (Math.hypot(rho, z2 - z0) - Math.hypot(rho, z1 - z0));
  return { re: re * h + sing, im: im * h };
}

/** ∫_{z1}^{z2} e^{−jkR}/R dz, R = √(ρ² + (z − z0)²); singular part done analytically. */
function kernelIntegral(k: number, z1: number, z2: number, z0: number, rho: number): Complex {
  const m = (z1 + z2) / 2, h = (z2 - z1) / 2;
  let re = 0, im = 0;
  for (let i = 0; i < 4; i++) {
    const R = Math.hypot(rho, m + h * GX[i]! - z0);
    // (e^{−jkR} − 1)/R is smooth (→ −jk as R → 0)
    re += GW[i]! * (Math.cos(k * R) - 1) / R;
    im += GW[i]! * -Math.sin(k * R) / R;
  }
  re = re * h + Math.asinh((z2 - z0) / rho) - Math.asinh((z1 - z0) / rho);
  return { re, im: im * h };
}

interface Unknown { el: number; z: number; dz: number }

export interface MomOptions {
  /** Segments per element (rounded up to even, capped so Δ ≥ 2a). */
  segments: number;
}

export function solveMom(design: Design, frequency: number, opts: MomOptions = { segments: 24 }): Solution & { currents: Complex[]; unknowns: Unknown[] } {
  const lambda = C0 / frequency;
  const k = (2 * Math.PI) / lambda;
  const a = design.diameter / 2;
  // Thin-wire kernel needs segments ≥ ~2 radii (NEC guideline); clamp so the
  // shortest element still satisfies it.
  const minLen = Math.min(...design.elements.map((e) => e.length));
  const maxSeg = Math.max(2, Math.floor(minLen / (2 * a)));
  const nSeg = Math.max(2, 2 * Math.ceil(Math.min(opts.segments, maxSeg) / 2));
  const els = design.elements;

  const unknowns: Unknown[] = [];
  els.forEach((e, el) => {
    const dz = e.length / nSeg;
    for (let i = 1; i < nSeg; i++) unknowns.push({ el, z: -e.length / 2 + i * dz, dz });
  });
  const N = unknowns.length;

  // Galerkin: test with the same triangles. With T' = ±1/Δ on each half,
  //   Z_mn = jωμ ∫∫ T_m T_n G  +  1/(jωε) ∫∫ T'_m T'_n G,   G = e^{−jkR}/(4πR).
  // Each triangle is two linear halves; every term is a sum over half pairs
  // of  ∫_obs w(z0) [∫_src t(z) e^{−jkR}/R dz] dz0, the inner integral done
  // with the analytic 1/R part, the outer by Gauss–Legendre.
  const halves = (u: Unknown) => [
    { z1: u.z - u.dz, z2: u.z, t1: 0, t2: 1, dq: 1 / u.dz },   // rising half, T' = +1/Δ
    { z1: u.z, z2: u.z + u.dz, t1: 1, t2: 0, dq: -1 / u.dz },  // falling half, T' = −1/Δ
  ];
  const c1 = (k * ETA0) / (4 * Math.PI), c2 = ETA0 / (k * 4 * Math.PI);

  /** Accurate Galerkin entry, used where source and test triangles are close. */
  const nearEntry = (um: Unknown, un: Unknown, rho: number): Complex => {
    let aRe = 0, aIm = 0, qRe = 0, qIm = 0;
    for (const o of halves(um)) {
      const om = (o.z1 + o.z2) / 2, oh = (o.z2 - o.z1) / 2, ob = (o.t2 - o.t1) / (o.z2 - o.z1);
      for (let i = 0; i < 8; i++) {
        const z0 = om + oh * GX8[i]!, w = GW8[i]! * oh, tObs = o.t1 + ob * (z0 - o.z1);
        for (const q of halves(un)) {
          const tri = linearKernelIntegral(k, q.z1, q.z2, q.t1, q.t2, z0, rho);
          const flat = kernelIntegral(k, q.z1, q.z2, z0, rho);
          aRe += w * tObs * tri.re; aIm += w * tObs * tri.im;
          qRe += w * o.dq * q.dq * flat.re; qIm += w * o.dq * q.dq * flat.im;
        }
      }
    }
    // (1/4π)[ jkη·A  −  j(η/k)·Q ]
    return { re: -c1 * aIm + c2 * qIm, im: c1 * aRe - c2 * qRe };
  };

  // Product-rule points for well-separated pairs: FAR_Q Gauss points per half.
  const FX = [-0.7745966692414834, 0, 0.7745966692414834], FW = [0.5555555555555556, 0.8888888888888888, 0.5555555555555556];
  const FAR_Q = FX.length;
  const qz = new Float64Array(N * 2 * FAR_Q), qt = new Float64Array(N * 2 * FAR_Q), qd = new Float64Array(N * 2 * FAR_Q);
  unknowns.forEach((u, n) => {
    halves(u).forEach((h, side) => {
      const m = (h.z1 + h.z2) / 2, hw = (h.z2 - h.z1) / 2;
      for (let i = 0; i < FAR_Q; i++) {
        const z = m + hw * FX[i]!, j = (n * 2 + side) * FAR_Q + i;
        qz[j] = z;
        qt[j] = FW[i]! * hw * (h.t1 + ((h.t2 - h.t1) * (z - h.z1)) / (h.z2 - h.z1));
        qd[j] = FW[i]! * hw * h.dq;
      }
    });
  });
  const P = 2 * FAR_Q;
  const farEntry = (m: number, n: number, rho: number): Complex => {
    let aRe = 0, aIm = 0, qRe = 0, qIm = 0;
    const r2 = rho * rho;
    for (let i = m * P; i < m * P + P; i++) {
      for (let j = n * P; j < n * P + P; j++) {
        const dz = qz[i]! - qz[j]!, R = Math.sqrt(r2 + dz * dz);
        const gr = Math.cos(k * R) / R, gi = -Math.sin(k * R) / R;
        const wa = qt[i]! * qt[j]!, wq = qd[i]! * qd[j]!;
        aRe += wa * gr; aIm += wa * gi; qRe += wq * gr; qIm += wq * gi;
      }
    }
    return { re: -c1 * aIm + c2 * qIm, im: c1 * aRe - c2 * qRe };
  };

  const Z = new CMatrix(N);
  const first = els.map((_, el) => unknowns.findIndex((u) => u.el === el));
  for (let em = 0; em < els.length; em++) {
    for (let en = em; en < els.length; en++) {
      const m0 = first[em]!, n0 = first[en]!;
      if (em === en) {
        // uniform segmentation ⇒ symmetric Toeplitz block: one row suffices
        const row = Array.from({ length: nSeg - 1 }, (_, d) => nearEntry(unknowns[m0]!, unknowns[m0 + d]!, a));
        for (let i = 0; i < nSeg - 1; i++) for (let j = 0; j < nSeg - 1; j++) Z.set(m0 + i, m0 + j, row[Math.abs(i - j)]!);
        continue;
      }
      const rho = Math.abs(els[em]!.x - els[en]!.x);
      const close = rho < 3 * Math.max(unknowns[m0]!.dz, unknowns[n0]!.dz);
      for (let i = 0; i < nSeg - 1; i++) {
        for (let j = 0; j < nSeg - 1; j++) {
          const z = close ? nearEntry(unknowns[m0 + i]!, unknowns[n0 + j]!, rho) : farEntry(m0 + i, n0 + j, rho);
          Z.set(m0 + i, n0 + j, z);
          Z.set(n0 + j, m0 + i, z);
        }
      }
    }
  }

  const drv = drivenIndex(design);
  const feed = unknowns.findIndex((u) => u.el === drv && Math.abs(u.z) < u.dz / 4);
  const V = unknowns.map((_, i) => cx(i === feed ? 1 : 0));
  const currents = Z.solve(V);
  const iFeed = currents[feed]!;
  const pIn = 0.5 * iFeed.re;

  return {
    zIn: div(cx(1), iFeed),
    currents,
    unknowns,
    // D = 4πU/P_in with U = k²η|N⊥|²/(32π²), N = Σ I_n Δ_n e^{jk r̂·r_n}
    directivity([ux, , uz]: Vec3): number {
      let re = 0, im = 0;
      unknowns.forEach((u, i) => {
        const ph = k * (els[u.el]!.x * ux + u.z * uz);
        const c = Math.cos(ph), s = Math.sin(ph), I = currents[i]!;
        re += u.dz * (I.re * c - I.im * s);
        im += u.dz * (I.re * s + I.im * c);
      });
      const n2 = (re * re + im * im) * (1 - uz * uz);
      return (k * k * ETA0 * n2) / (8 * Math.PI * pIn);
    },
  };
}

export const momEngine: Engine = {
  id: 'mom',
  label: 'Method of moments',
  solve: (design, frequency) => solveMom(design, frequency),
};
