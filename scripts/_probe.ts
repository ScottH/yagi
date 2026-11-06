import { optimize, type Goal } from '../src/optimize';
const fmt = (m: any) => `G ${m.minGainDbi.toFixed(2)}  F/B ${m.minFbDb.toFixed(1)}  F/R ${m.minFrDb.toFixed(1)}  SWR ${m.maxSwr.toFixed(2)}  boom ${(m.boom * 1000).toFixed(0)} mm`;
const [goal, n, swr, z0] = [process.argv[2] as Goal, Number(process.argv[3]), Number(process.argv[4]), Number(process.argv[5])];
const t = performance.now();
const r = optimize({ fLo: 144e6, fHi: 146e6, elements: n, diameter: 0.006, goal, z0, maxSwr: swr, refine: 'mom', timeMs: { lawson: 3000, mom: 15000 } });
console.log(`${goal} ${n}el SWR≤${swr}@${z0}Ω`, `${((performance.now() - t) / 1000).toFixed(1)} s  feasible=${r.feasible}`);
console.log('   start', fmt(r.start));
console.log('   final', fmt(r.metrics));
