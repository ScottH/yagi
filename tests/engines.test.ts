import { describe, expect, it } from 'vitest';
import { mutualImpedance as emfMutual } from '../src/analysis/emf';
import { solve, cx } from '../src/analysis/complex';
import { analyze, ENGINES, patterns } from '../src/analysis/analyze';
import { solveMom } from '../src/analysis/engines/mom';
import { NBS_DESIGNS, PREFERRED_DESIGNS, referenceToDesign } from '../src/data/lawson';
import { type Design, C0 } from '../src/model';

const k = 2 * Math.PI; // λ = 1 m throughout
const dipole = (length: number, radius: number): Design =>
  ({ frequency: C0, diameter: 2 * radius, elements: [{ role: 'driven', x: 0, length }] });

describe('induced-EMF impedances (Balanis §8.5–8.6; Lawson Table 1.3)', () => {
  it('thin half-wave dipole: Z ≈ 73.1 + j42.5 Ω', () => {
    const z = emfMutual(k, 0.25, 0.25, 1e-5);
    expect(z.re).toBeCloseTo(73.1, 0);
    expect(z.im).toBeCloseTo(42.5, 0);
  });
  it('side-by-side half-wave dipoles reproduce Table 1.3', () => {
    for (const [s, r, x] of [[0.1, 67.3, 7.5], [0.5, -12.5, -29.9], [1.0, 4.0, 17.7]] as const) {
      const z = emfMutual(k, 0.25, 0.25, s);
      expect(z.re).toBeCloseTo(r, 0);
      expect(z.im).toBeCloseTo(x, 0);
    }
  });
  it('is reciprocal for unequal lengths', () => {
    const a = emfMutual(k, 0.24, 0.21, 0.15), b = emfMutual(k, 0.21, 0.24, 0.15);
    expect(a.re).toBeCloseTo(b.re, 6);
    expect(a.im).toBeCloseTo(b.im, 6);
  });
});

describe('complex solver', () => {
  it('solves a 2×2 system', () => {
    const x = solve([[cx(2, 1), cx(1)], [cx(0, 1), cx(3, -1)]], [cx(1), cx(0, 2)]);
    const r0 = { re: 2 * x[0]!.re - x[0]!.im + x[1]!.re, im: 2 * x[0]!.im + x[0]!.re + x[1]!.im };
    expect(r0.re).toBeCloseTo(1, 12);
    expect(r0.im).toBeCloseTo(0, 12);
  });
});

describe.each(Object.values(ENGINES))('$label engine', (engine) => {
  it('lone half-wave dipole: ≈2.15 dBi, 0 dB F/B, null off the ends', () => {
    const d = dipole(0.5, 1e-4);
    const r = analyze(d, engine);
    expect(r.gainDbi).toBeGreaterThan(2.1);
    expect(r.gainDbi).toBeLessThan(2.25);
    expect(r.frontToBackDb).toBeCloseTo(0, 6);
    const p = patterns(d, engine, d.frequency, 90); // −180, −90, 0, 90, 180
    expect(p.ePlane[1]!.gainDbi).toBeLessThan(-30);   // along the element
    expect(p.hPlane[1]!.gainDbi).toBeCloseTo(r.gainDbi, 6); // omni in H-plane
  });

  // Measured worst cases: MoM 0.4 dB, Lawson 0.6 dB, induced EMF 1.5 dB.
  const tol = { mom: 0.5, lawson: 0.7, emf: 1.6 }[engine.id];
  it(`NBS designs: gain within ${tol} dB of the NBS pattern-integrated gain`, () => {
    for (const ref of NBS_DESIGNS) {
      expect(Math.abs(analyze(referenceToDesign(ref), engine).gainDbi - ref.nbsPatternDbi!), ref.name).toBeLessThan(tol);
    }
  });
});

describe('Lawson engine reproduces the book', () => {
  it('Table 1.5 and Table 7.1 computed gains to ≤ 0.35 dB', () => {
    for (const ref of [...NBS_DESIGNS, ...PREFERRED_DESIGNS]) {
      expect(Math.abs(analyze(referenceToDesign(ref), ENGINES.lawson).gainDbi - ref.lawson.gainDbi), ref.name).toBeLessThanOrEqual(0.35);
    }
  });
  it('Table 7.1 F/B to within 2 dB for the shallower nulls', () => {
    for (const ref of PREFERRED_DESIGNS.filter((r) => r.lawson.frontToBackDb! < 35)) {
      expect(Math.abs(analyze(referenceToDesign(ref), ENGINES.lawson).frontToBackDb - ref.lawson.frontToBackDb!), ref.name).toBeLessThan(2);
    }
  });
});

describe('method of moments', () => {
  it('resonant length agrees with Hallén theory (Lawson Table 1.2) to < 1 %', () => {
    for (const [a, twoLr] of [[0.005, 0.927], [0.001, 0.958], [0.0001, 0.971]] as const) {
      const x = (l: number) => solveMom(dipole(l, a), C0, { segments: 40 }).zIn.im;
      let l0 = 0.46, l1 = 0.5, x0 = x(l0), x1 = x(l1);
      for (let i = 0; i < 6; i++) { const l2 = l1 - (x1 * (l1 - l0)) / (x1 - x0); [l0, x0, l1] = [l1, x1, l2]; x1 = x(l1); }
      expect(Math.abs(2 * l1 / twoLr - 1)).toBeLessThan(0.01);
    }
  });
  it('gain has converged at the default segmentation', () => {
    const d = referenceToDesign(PREFERRED_DESIGNS[1]!);
    const g = (seg: number) => 10 * Math.log10(solveMom(d, C0, { segments: seg }).directivity([1, 0, 0]));
    expect(Math.abs(g(24) - g(80))).toBeLessThan(0.15);
  });
});

describe('full-sphere grid', () => {
  it('dipole: peak broadside, nulls along the element axis, seam closes', async () => {
    const { sphereOf } = await import('../src/analysis/analyze');
    const s = ENGINES.lawson.solve(dipole(0.5, 1e-4), C0);
    const g = sphereOf(s, 3);
    const at = (i: number, j: number) => g.gainDbi[i * (g.nPhi + 1) + j]!;
    expect(at(0, 0)).toBeLessThan(-40);                 // θ = 0: off the end
    expect(at(g.nTheta / 2, 0)).toBeCloseTo(2.15, 1);   // θ = 90°: broadside
    expect(at(g.nTheta / 2, g.nPhi)).toBe(at(g.nTheta / 2, 0)); // seam closes
  });
  it('Yagi: sphere maximum is the forward gain', async () => {
    const { sphereOf, performanceOf } = await import('../src/analysis/analyze');
    const d = referenceToDesign(PREFERRED_DESIGNS[4]!);
    const s = ENGINES.mom.solve(d, C0);
    const g = sphereOf(s, 3);
    expect(Math.max(...g.gainDbi)).toBeCloseTo(performanceOf(s, C0).gainDbi, 1);
  });
});
