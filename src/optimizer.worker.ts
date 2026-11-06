/// <reference lib="webworker" />
import { optimize, type OptimizeSpec, type Progress, type OptimizeResult } from './optimize';

// Runs one optimisation, posting progress (with the best design so far) a few
// times a second. The page stops a run by terminating this worker and keeping
// the last design it was sent.

export type OptReply = { kind: 'progress'; progress: Progress } | { kind: 'done'; result: OptimizeResult } | { kind: 'error'; error: string };

self.onmessage = (ev: MessageEvent<OptimizeSpec>) => {
  const post = (m: OptReply) => (self as DedicatedWorkerGlobalScope).postMessage(m);
  try {
    const result = optimize(ev.data, (progress) => post({ kind: 'progress', progress }));
    post({ kind: 'done', result });
  } catch (err) {
    post({ kind: 'error', error: String(err) });
  }
};
