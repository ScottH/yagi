import type { Complex } from './complex';
import type { Engine, EngineId, Vec3 } from './engine';
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

export function analyze(design: Design, engine: Engine, frequency = design.frequency): Performance {
  const s = engine.solve(design, frequency);
  const f = s.directivity(FWD), b = s.directivity(BACK);
  return { frequency, zIn: s.zIn, swr50: swr(s.zIn), gainDbi: dB(f), frontToBackDb: dB(f / b) };
}

export interface PatternPoint { angleDeg: number; gainDbi: number }

/**
 * Pattern cuts, 0° = forward. E-plane: the plane of the elements (azimuth for
 * a horizontal Yagi). H-plane: perpendicular to the elements, through the
 * boom (elevation for a horizontal Yagi).
 */
export function patterns(design: Design, engine: Engine, frequency = design.frequency, stepDeg = 2) {
  const s = engine.solve(design, frequency);
  const ePlane: PatternPoint[] = [], hPlane: PatternPoint[] = [];
  for (let deg = -180; deg <= 180; deg += stepDeg) {
    const t = (deg * Math.PI) / 180, c = Math.cos(t), sn = Math.sin(t);
    ePlane.push({ angleDeg: deg, gainDbi: dB(s.directivity([c, 0, sn])) });
    hPlane.push({ angleDeg: deg, gainDbi: dB(s.directivity([c, sn, 0])) });
  }
  return { ePlane, hPlane };
}

/** Performance across a band with the physical dimensions held fixed. */
export function sweep(design: Design, engine: Engine, fLo: number, fHi: number, steps = 31): Performance[] {
  return Array.from({ length: steps }, (_, i) => analyze(design, engine, fLo + ((fHi - fLo) * i) / (steps - 1)));
}
