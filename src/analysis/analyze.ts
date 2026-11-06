import type { Complex } from './complex';
import type { Engine, EngineId, Solution, Vec3 } from './engine';
import { lawsonEngine } from './engines/lawson';
import { emfEngine } from './engines/emf';
import { momEngine } from './engines/mom';
import { type Design, swr } from '../model';

export const ENGINES: Record<EngineId, Engine> = { lawson: lawsonEngine, emf: emfEngine, mom: momEngine };

export interface Performance {
  frequency: number;
  zIn: Complex;
  swr50: number;
  /** Forward (+x) gain, dBi; lossless, so gain = directivity. */
  gainDbi: number;
  /** Forward vs. directly backward (−x), dB (Lawson's definition, free space). */
  frontToBackDb: number;
}

const FWD: Vec3 = [1, 0, 0];
const BACK: Vec3 = [-1, 0, 0];
const dB = (x: number) => 10 * Math.log10(Math.max(x, 1e-12));

/** Gain, F/B, Z_in and SWR from an existing solution. */
export function performanceOf(s: Solution, frequency: number): Performance {
  const f = s.directivity(FWD), b = s.directivity(BACK);
  return { frequency, zIn: s.zIn, swr50: swr(s.zIn), gainDbi: dB(f), frontToBackDb: dB(f / b) };
}

export function analyze(design: Design, engine: Engine, frequency = design.frequency): Performance {
  return performanceOf(engine.solve(design, frequency), frequency);
}

export interface PatternPoint { angleDeg: number; gainDbi: number }

/**
 * Pattern cuts, 0° = forward. E-plane: the plane of the elements (azimuth for
 * a horizontal Yagi). H-plane: perpendicular to the elements, through the
 * boom (elevation for a horizontal Yagi).
 */
export function cutsOf(s: Solution, stepDeg = 2): { ePlane: PatternPoint[]; hPlane: PatternPoint[] } {
  const ePlane: PatternPoint[] = [], hPlane: PatternPoint[] = [];
  for (let deg = -180; deg <= 180; deg += stepDeg) {
    const t = (deg * Math.PI) / 180, c = Math.cos(t), sn = Math.sin(t);
    ePlane.push({ angleDeg: deg, gainDbi: dB(s.directivity([c, 0, sn])) });
    hPlane.push({ angleDeg: deg, gainDbi: dB(s.directivity([c, sn, 0])) });
  }
  return { ePlane, hPlane };
}

export function patterns(design: Design, engine: Engine, frequency = design.frequency, stepDeg = 2) {
  return cutsOf(engine.solve(design, frequency), stepDeg);
}

/**
 * Full-sphere gain grid. θ is the polar angle from the element axis (+z),
 * 0…180° in nTheta+1 rows; φ is the azimuth about it measured from forward
 * (+x) toward +y, 0…360° in nPhi+1 columns (the last repeats the first so a
 * mesh can close). gainDbi is row-major [θ][φ].
 */
export interface SphereGrid { nTheta: number; nPhi: number; gainDbi: Float32Array }

export function sphereOf(s: Solution, stepDeg = 3): SphereGrid {
  const nTheta = Math.round(180 / stepDeg), nPhi = Math.round(360 / stepDeg);
  const gainDbi = new Float32Array((nTheta + 1) * (nPhi + 1));
  for (let i = 0; i <= nTheta; i++) {
    const th = (i * Math.PI) / nTheta, st = Math.sin(th), ct = Math.cos(th);
    for (let j = 0; j < nPhi; j++) {
      const ph = (j * 2 * Math.PI) / nPhi;
      gainDbi[i * (nPhi + 1) + j] = dB(s.directivity([st * Math.cos(ph), st * Math.sin(ph), ct]));
    }
    gainDbi[i * (nPhi + 1) + nPhi] = gainDbi[i * (nPhi + 1)]!;
  }
  return { nTheta, nPhi, gainDbi };
}

/** Performance across a band with the physical dimensions held fixed. */
export function sweep(design: Design, engine: Engine, fLo: number, fHi: number, steps = 31): Performance[] {
  return Array.from({ length: steps }, (_, i) => analyze(design, engine, fLo + ((fHi - fLo) * i) / (steps - 1)));
}
