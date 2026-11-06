/// <reference lib="webworker" />
import { cutsOf, ENGINES, performanceOf, sphereOf, sweep, type Performance, type PatternPoint, type SphereGrid } from './analysis/analyze';
import type { EngineId } from './analysis/engine';
import type { Design } from './model';

// Analysis runs off the main thread: the moment-method solve for a long Yagi
// takes a few hundred ms per frequency.

export interface Request { id: number; design: Design; span: number; steps: number }
export interface EngineResult {
  engine: EngineId;
  at: Performance;
  ePlane: PatternPoint[];
  hPlane: PatternPoint[];
  sphere: SphereGrid;
  sweep: Performance[];
}
export type Reply = { id: number; result: EngineResult } | { id: number; error: string };

let latest = 0;

self.onmessage = (ev: MessageEvent<Request>) => {
  const { id, design, span, steps } = ev.data;
  latest = id;
  // Lawson first (instant), then MoM. Each posts as soon as it's done.
  for (const engine of ['lawson', 'mom'] as const) {
    if (id !== latest) return;
    try {
      const e = ENGINES[engine];
      const f = design.frequency;
      // One solve at the design frequency feeds the summary, cuts and sphere.
      const s = e.solve(design, f);
      const { ePlane, hPlane } = cutsOf(s, 2);
      const result: EngineResult = {
        engine,
        at: performanceOf(s, f),
        ePlane,
        hPlane,
        sphere: sphereOf(s, 3),
        sweep: sweep(design, e, f * (1 - span), f * (1 + span), steps),
      };
      (self as DedicatedWorkerGlobalScope).postMessage({ id, result } satisfies Reply);
    } catch (err) {
      (self as DedicatedWorkerGlobalScope).postMessage({ id, error: String(err) } satisfies Reply);
    }
  }
};
