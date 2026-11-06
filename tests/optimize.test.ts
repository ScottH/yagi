import { describe, expect, it } from 'vitest';
import { bandFrequencies, feasible, nelderMead, optimize, score, startDesign, type OptimizeSpec } from '../src/optimize';
import { wavelength } from '../src/model';

describe('Nelder–Mead', () => {
  it('finds the minimum of a shifted quadratic', () => {
    const r = nelderMead((v) => (v[0]! - 1) ** 2 + 10 * (v[1]! + 2) ** 2, [0, 0], [0.5, 0.5], 2000);
    expect(r.x[0]).toBeCloseTo(1, 3);
    expect(r.x[1]).toBeCloseTo(-2, 3);
  });
  it('respects an evaluation budget', () => {
    let calls = 0;
    nelderMead((v) => { calls++; return v[0]! ** 2; }, [5], [1], 50);
    expect(calls).toBeLessThanOrEqual(60); // finishes the current step
  });
});

describe('band optimiser', () => {
  const base: OptimizeSpec = { fLo: 144e6, fHi: 146e6, elements: 4, diameter: 0.006, goal: 'balanced', z0: 50, refine: 'lawson', timeMs: { lawson: 800, mom: 0 } };

  it('samples the band edges and centre', () => {
    expect(bandFrequencies(144e6, 146e6)).toEqual([144e6, 144.5e6, 145e6, 145.5e6, 146e6]);
  });

  it('improves on the starting design and keeps elements ordered within bounds', () => {
    const r = optimize(base);
    expect(score(r.metrics, base)).toBeGreaterThan(score(r.start, base));
    const els = r.design.elements, lam = wavelength(r.design.frequency);
    expect(els.map((e) => e.role)).toEqual(['reflector', 'driven', 'director', 'director']);
    for (let i = 1; i < els.length; i++) expect(els[i]!.x).toBeGreaterThan(els[i - 1]!.x);
    for (const e of els) { expect(e.length / lam).toBeGreaterThanOrEqual(0.3); expect(e.length / lam).toBeLessThanOrEqual(0.6); }
  });

  it('meets an SWR limit (in the model it optimised with)', () => {
    const spec = { ...base, maxSwr: 1.8, z0: 25 };
    const r = optimize(spec);
    expect(r.feasible).toBe(true);
    expect(r.metrics.maxSwr).toBeLessThanOrEqual(1.8);
  });

  it('meets a boom-length limit', () => {
    const spec = { ...base, elements: 5, maxBoom: 0.9 };
    const r = optimize(spec);
    expect(r.metrics.boom).toBeLessThanOrEqual(0.9 + 1e-9);
    expect(feasible(r.metrics, spec)).toBe(true);
  });

  it('builds a start design for counts without a template', () => {
    const d = startDesign({ ...base, elements: 9 });
    expect(d.elements).toHaveLength(9);
  });

  it('runs the MoM refinement stage', () => {
    const r = optimize({ ...base, elements: 3, refine: 'mom', timeMs: { lawson: 300, mom: 1500 } });
    expect(Number.isFinite(r.metrics.minGainDbi)).toBe(true);
    expect(r.metrics.per).toHaveLength(5);
  }, 20000);
});
