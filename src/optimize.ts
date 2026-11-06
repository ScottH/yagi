import { type Design, type ElementRole, C0, boomLength, swr } from './model';
import { performanceOf, type Performance } from './analysis/analyze';
import type { Solution } from './analysis/engine';
import { lawsonEngine } from './analysis/engines/lawson';
import { solveMom } from './analysis/engines/mom';
import { fromTemplate, TEMPLATES } from './templates';

// Band optimiser. Variables are every element length plus every gap between
// neighbouring elements, in wavelengths at the band centre. The score is
// computed from the WORST value across the band (Lawson's bandwidth view:
// gain, F/B and match must all hold up over the whole band, ch. 1).
//
// Search: Nelder–Mead with restarts, in two stages:
//   1. Lawson's circuit model: microseconds per evaluation, so thousands of
//      evaluations get close quickly.
//   2. Method of moments: refines from stage 1, so the result isn't tuned to
//      the Lawson model's errors (its F/B nulls sit ~0.5–1 % off in
//      frequency; see docs/lawson-vs-mom.md). It searches with a coarse
//      10-segment model, which is fast but puts the feed impedance a few ohms
//      off the 24-segment model the app displays. That is corrected by space
//      mapping: in each of three rounds the impedance difference
//      Z24 − Z10 is measured at every band frequency on the current best
//      design and added to the coarse model's Z_in.
// Stages run on time budgets so runtime is predictable for any element
// count. The final design is re-analysed with the full model.

export type Goal = 'gain' | 'fb' | 'fr' | 'balanced';

export const GOALS: Record<Goal, string> = {
  balanced: 'Balanced (gain + F/R)',
  gain: 'Maximum gain',
  fb: 'Maximum front-to-back',
  fr: 'Maximum front-to-rear',
};

export interface OptimizeSpec {
  fLo: number;        // Hz
  fHi: number;        // Hz
  elements: number;   // total, ≥ 2
  diameter: number;   // m
  goal: Goal;
  /** SWR limit across the band against z0; omit for no match constraint. */
  maxSwr?: number;
  z0: number;         // Ω
  /** Boom-length limit (m); omit for none. */
  maxBoom?: number;
  /** 'mom' adds the method-of-moments refinement stage. */
  refine: 'mom' | 'lawson';
  /** Time budgets per stage (ms). */
  timeMs?: { lawson: number; mom: number };
}

export interface BandMetrics {
  minGainDbi: number;
  minFbDb: number;
  minFrDb: number;
  maxSwr: number;
  boom: number; // m
}

export interface Progress {
  stage: 'lawson' | 'mom' | 'final';
  evals: number;
  budget: number;
  bestScore: number;
  best: BandMetrics;
  design: Design;
}

const L_MIN = 0.3, L_MAX = 0.6, S_MIN = 0.04, S_MAX = 0.6; // λ

/** Starting point: a matching template if one exists, otherwise a generic progression. */
export function startDesign(spec: OptimizeSpec): Design {
  const f0 = (spec.fLo + spec.fHi) / 2;
  const t = TEMPLATES.find((x) => x.ref.elements.length === spec.elements);
  if (t) return fromTemplate(t, f0, spec.diameter);
  const lam = C0 / f0, n = Math.max(2, spec.elements);
  const els: Design['elements'] = [
    { role: 'reflector', x: -0.2 * lam, length: 0.495 * lam },
    { role: 'driven', x: 0, length: 0.475 * lam },
  ];
  let x = 0;
  for (let i = 0; i < n - 2; i++) {
    x += Math.min(0.1 + 0.05 * i, 0.35) * lam;
    els.push({ role: 'director', x, length: Math.max(0.445 - 0.006 * i, 0.4) * lam });
  }
  return { frequency: f0, diameter: spec.diameter, elements: els };
}

/** Design ↔ variable vector [lengths…, gaps…] in λ at f0. */
function toVars(d: Design, lam: number): number[] {
  const els = [...d.elements].sort((a, b) => a.x - b.x);
  return [...els.map((e) => e.length / lam), ...els.slice(1).map((e, i) => (e.x - els[i]!.x) / lam)];
}
function fromVars(v: number[], n: number, lam: number, f0: number, diameter: number): Design {
  const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
  const roles: ElementRole[] = Array.from({ length: n }, (_, i) => (i === 0 && n > 1 ? 'reflector' : i === (n > 1 ? 1 : 0) ? 'driven' : 'director'));
  let x = 0;
  const xs = [0];
  for (let i = 0; i < n - 1; i++) xs.push((x += clamp(v[n + i]!, S_MIN, S_MAX)));
  const x0 = xs[n > 1 ? 1 : 0]!;
  return {
    frequency: f0,
    diameter,
    elements: roles.map((role, i) => ({ role, x: (xs[i]! - x0) * lam, length: clamp(v[i]!, L_MIN, L_MAX) * lam })),
  };
}
/** Distance outside the box (λ), for a penalty that keeps the simplex inside. */
function outside(v: number[], n: number): number {
  let o = 0;
  v.forEach((x, i) => {
    const [lo, hi] = i < n ? [L_MIN, L_MAX] : [S_MIN, S_MAX];
    o += Math.max(0, lo - x) + Math.max(0, x - hi);
  });
  return o;
}

export function bandFrequencies(fLo: number, fHi: number, n = 5): number[] {
  if (fHi <= fLo) return [fLo];
  return Array.from({ length: n }, (_, i) => fLo + ((fHi - fLo) * i) / (n - 1));
}

type Solver = (d: Design, f: number) => Solution;

/** Per-frequency impedance correction added to Z_in (space mapping). */
export type ZCorrection = { re: number; im: number }[];

export function bandMetrics(d: Design, freqs: number[], solve: Solver, z0: number, zCorr?: ZCorrection): BandMetrics & { per: Performance[] } {
  const per = freqs.map((f, i) => {
    const p = performanceOf(solve(d, f), f);
    const c = zCorr?.[i];
    return c ? { ...p, zIn: { re: p.zIn.re + c.re, im: p.zIn.im + c.im } } : p;
  });
  return {
    per,
    minGainDbi: Math.min(...per.map((p) => p.gainDbi)),
    minFbDb: Math.min(...per.map((p) => p.frontToBackDb)),
    minFrDb: Math.min(...per.map((p) => p.frontToRearDb)),
    maxSwr: Math.max(...per.map((p) => swr(p.zIn, z0))),
    boom: boomLength(d),
  };
}

/** Higher is better. F/B and F/R are capped: beyond ~35 dB a null is fragile and not worth gain. */
export function score(m: BandMetrics, spec: OptimizeSpec): number {
  const cap = (x: number, c: number) => Math.min(x, c);
  let s: number;
  switch (spec.goal) {
    case 'gain': s = m.minGainDbi + 0.02 * cap(m.minFrDb, 20); break;
    case 'fb': s = cap(m.minFbDb, 40) + 0.3 * m.minGainDbi; break;
    case 'fr': s = cap(m.minFrDb, 35) + 0.3 * m.minGainDbi; break;
    case 'balanced': s = m.minGainDbi + 0.25 * cap(m.minFrDb, 25); break;
  }
  if (spec.maxSwr !== undefined) {
    // Aim 5 % (of the range above 1) inside the limit: the space-mapped
    // coarse model leaves a small residual impedance error.
    const target = spec.maxSwr - 0.05 * (spec.maxSwr - 1);
    const over = (Number.isFinite(m.maxSwr) ? m.maxSwr : 100) - target;
    if (over > 0) s -= 3 + 3 * over; // step + slope, so feasibility dominates
  }
  if (spec.maxBoom !== undefined && m.boom > spec.maxBoom) s -= 3 + 30 * ((m.boom - spec.maxBoom) / (C0 / ((spec.fLo + spec.fHi) / 2)));
  return s;
}

/** Whether the hard limits (SWR, boom) are met. */
export function feasible(m: BandMetrics, spec: OptimizeSpec): boolean {
  return (spec.maxSwr === undefined || m.maxSwr <= spec.maxSwr + 1e-9) && (spec.maxBoom === undefined || m.boom <= spec.maxBoom + 1e-9);
}

/** Nelder–Mead minimiser with restarts until the evaluation budget is spent. */
export function nelderMead(f: (v: number[]) => number, x0: number[], steps: number[], budget: number,
  onImprove?: (best: number[], fx: number, evals: number) => void, deadline = Infinity): { x: number[]; fx: number; evals: number } {
  const n = x0.length;
  let evals = 0;
  const more = () => evals < budget && Date.now() < deadline;
  let bestX = x0, bestF = Infinity;
  const ev = (v: number[]) => {
    const y = f(v);
    evals++;
    if (y < bestF) { bestF = y; bestX = v; onImprove?.(v, y, evals); }
    return y;
  };
  let start = x0, scaleStep = 1;
  while (more()) {
    let simplex = [start, ...steps.map((st, i) => start.map((x, j) => (j === i ? x + st * scaleStep : x)))];
    let fs = simplex.map(ev);
    while (more()) {
      const order = fs.map((_, i) => i).sort((a, b) => fs[a]! - fs[b]!);
      simplex = order.map((i) => simplex[i]!);
      fs = order.map((i) => fs[i]!);
      // converged? (simplex collapsed)
      const spread = Math.max(...simplex.slice(1).map((p) => Math.max(...p.map((x, j) => Math.abs(x - simplex[0]![j]!)))));
      if (spread < 1e-5 || fs[n]! - fs[0]! < 1e-7) break;
      const c = Array.from({ length: n }, (_, j) => simplex.slice(0, n).reduce((a, p) => a + p[j]!, 0) / n);
      const at = (t: number) => c.map((cj, j) => cj + t * (simplex[n]![j]! - cj));
      const xr = at(-1), fr = ev(xr);
      if (fr < fs[0]!) {
        const xe = at(-2), fe = ev(xe);
        [simplex[n], fs[n]] = fe < fr ? [xe, fe] : [xr, fr];
      } else if (fr < fs[n - 1]!) {
        [simplex[n], fs[n]] = [xr, fr];
      } else {
        const xc = fr < fs[n]! ? at(-0.5) : at(0.5), fc = ev(xc);
        if (fc < Math.min(fr, fs[n]!)) {
          [simplex[n], fs[n]] = [xc, fc];
        } else {
          for (let i = 1; i <= n; i++) {
            simplex[i] = simplex[i]!.map((x, j) => simplex[0]![j]! + 0.5 * (x - simplex[0]![j]!));
            fs[i] = ev(simplex[i]!);
          }
        }
      }
    }
    // restart from the best point with a smaller simplex
    start = bestX;
    scaleStep = Math.max(scaleStep * 0.5, 0.125);
  }
  return { x: bestX, fx: bestF, evals };
}

export interface OptimizeResult {
  design: Design;
  metrics: BandMetrics & { per: Performance[] };
  start: BandMetrics;
  feasible: boolean;
}

export function optimize(spec: OptimizeSpec, onProgress?: (p: Progress) => void): OptimizeResult {
  const n = Math.max(2, Math.round(spec.elements));
  const f0 = (spec.fLo + spec.fHi) / 2, lam = C0 / f0;
  const freqs = bandFrequencies(spec.fLo, spec.fHi);
  const time = spec.timeMs ?? { lawson: 3000, mom: 25000 };
  const init = startDesign({ ...spec, elements: n });
  const steps = [...Array(n).fill(0.01), ...Array(n - 1).fill(0.03)];
  const lawson: Solver = (d, f) => lawsonEngine.solve(d, f);
  const coarse: Solver = (d, f) => solveMom(d, f, { segments: 10 });
  const full: Solver = (d, f) => solveMom(d, f, { segments: 24 });
  const design = (v: number[]) => fromVars(v, n, lam, f0, spec.diameter);

  const runStage = (stage: 'lawson' | 'mom', solve: Solver, x0: number[], ms: number, zCorr?: ZCorrection) => {
    let last = 0;
    const objective = (v: number[]) => -score(bandMetrics(design(v), freqs, solve, spec.z0, zCorr), spec) + 10 * outside(v, n);
    return nelderMead(objective, x0, steps, Infinity, (v, fx, evals) => {
      const now = Date.now();
      if (!onProgress || now - last < 250) return;
      last = now;
      onProgress({ stage, evals, budget: 0, bestScore: -fx, best: bandMetrics(design(v), freqs, solve, spec.z0, zCorr), design: design(v) });
    }, Date.now() + ms);
  };

  const start = bandMetrics(init, freqs, full, spec.z0);
  let x = toVars(init, lam);
  x = runStage('lawson', lawson, x, time.lawson).x;

  if (spec.refine === 'mom') {
    const ROUNDS = 3;
    for (let r = 0; r < ROUNDS; r++) {
      const d = design(x);
      const zCorr = freqs.map((f) => {
        const a = full(d, f).zIn, b = coarse(d, f).zIn;
        return { re: a.re - b.re, im: a.im - b.im };
      });
      x = runStage('mom', coarse, x, time.mom / ROUNDS, zCorr).x;
    }
  }

  const best = design(x);
  const finalSolve = spec.refine === 'mom' ? full : lawson;
  const metrics = bandMetrics(best, freqs, finalSolve, spec.z0);
  onProgress?.({ stage: 'final', evals: 0, budget: 0, bestScore: score(metrics, spec), best: metrics, design: best });
  return { design: best, metrics, start, feasible: feasible(metrics, spec) };
}
