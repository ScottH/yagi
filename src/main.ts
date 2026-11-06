import './style.css';
import { type Design, type ElementRole, boomLength, wavelength } from './model';
import { TEMPLATES, fromTemplate } from './templates';
import { decodeDesign, encodeDesign } from './hash';
import { drawLayout } from './layout';
import { drawLine, drawPolar, type Series, type XY, type PolarPoint } from './charts';
import type { EngineResult, Reply, Request } from './worker';
import type { EngineId } from './analysis/engine';
import type { Pattern3D } from './pattern3d';

const $ = <T extends Element = HTMLElement>(id: string) => document.getElementById(id) as unknown as T;

const inputs = {
  template: $<HTMLSelectElement>('template'),
  freq: $<HTMLInputElement>('freq'),
  dia: $<HTMLInputElement>('dia'),
  span: $<HTMLInputElement>('span'),
};

for (const t of TEMPLATES) inputs.template.append(new Option(t.label, t.id));
inputs.template.value = 'lawson-6';

const LABEL: Record<EngineId, string> = { lawson: 'Lawson', mom: 'MoM', emf: 'EMF' };
const ORDER: EngineId[] = ['mom', 'lawson']; // draw MoM first, Lawson on top (dashed)

function generate(): Design {
  const t = TEMPLATES.find((x) => x.id === inputs.template.value) ?? TEMPLATES[0]!;
  return fromTemplate(t, Number(inputs.freq.value) * 1e6, Number(inputs.dia.value) / 1000);
}

let design: Design = decodeDesign(location.hash) ?? generate();
const results = new Map<EngineId, EngineResult>();

// ---------- analysis worker ----------

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
let reqId = 0;
let debounce = 0;

function requestAnalysis(): void {
  clearTimeout(debounce);
  debounce = window.setTimeout(() => {
    const span = Math.min(Math.max(Number(inputs.span.value) || 2, 0.1), 20) / 100;
    const req: Request = { id: ++reqId, design, span, steps: 31 };
    $('busy').hidden = false;
    document.body.classList.add('stale');
    worker.postMessage(req);
  }, 150);
}

worker.onmessage = (ev: MessageEvent<Reply>) => {
  const msg = ev.data;
  if (msg.id !== reqId) return;
  if ('error' in msg) {
    $('busy').textContent = `error: ${msg.error}`;
    return;
  }
  results.set(msg.result.engine, msg.result);
  if (msg.result.engine === 'mom') {
    $('busy').hidden = true;
    document.body.classList.remove('stale');
  }
  renderResults();
};

// ---------- 3D pattern (three.js loaded on first use) ----------

let p3d: Pattern3D | null = null;
let p3dLoading: Promise<void> | null = null;
let p3dEngine: EngineId = 'mom';

function render3d(): void {
  // Show the chosen engine; fall back to Lawson while MoM is still computing.
  const r = results.get(p3dEngine) ?? results.get('lawson');
  if (!r) return;
  if (!p3d) {
    p3dLoading ??= import('./pattern3d').then(({ Pattern3D, RAMP_CSS }) => {
      p3d = new Pattern3D($('p3d'));
      p3d.opts.range = Number($<HTMLSelectElement>('p3dRange').value);
      p3d.opts.seeThrough = $<HTMLInputElement>('p3dSee').checked;
      $('cbBar').style.background = RAMP_CSS;
      p3d.setAntenna(design);
      render3d();
    });
    return;
  }
  p3d.setPattern(r.sphere);
  $('cbHi').textContent = `${p3d.peakDbi.toFixed(1)} dBi`;
  $('cbLo').textContent = `≤ ${(p3d.peakDbi - p3d.opts.range).toFixed(1)}`;
}

for (const b of document.querySelectorAll<HTMLButtonElement>('.seg button')) {
  b.addEventListener('click', () => {
    p3dEngine = b.dataset.engine as EngineId;
    for (const o of document.querySelectorAll<HTMLButtonElement>('.seg button')) o.setAttribute('aria-pressed', String(o === b));
    render3d();
  });
}
$('p3dRange').addEventListener('change', () => { p3d?.setOptions({ range: Number($<HTMLSelectElement>('p3dRange').value) }); render3d(); });
$('p3dSee').addEventListener('change', () => p3d?.setOptions({ seeThrough: $<HTMLInputElement>('p3dSee').checked }));

// ---------- rendering ----------

const ROLE_LABEL: Record<ElementRole, string> = { reflector: 'R', driven: 'DE', director: 'D' };

function renderTable(): void {
  const body = $('elements').querySelector('tbody')!;
  let dn = 0;
  body.replaceChildren(...design.elements.map((e, i) => {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.textContent = e.role === 'director' ? `D${++dn}` : ROLE_LABEL[e.role];
    tr.append(th);
    for (const k of ['x', 'length'] as const) {
      const td = document.createElement('td');
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.step = '0.1';
      inp.dataset.i = String(i);
      inp.dataset.k = k;
      inp.value = (e[k] * 1000).toFixed(1);
      td.append(inp);
      tr.append(td);
    }
    return tr;
  }));
}

function renderSummary(): void {
  const lam = wavelength(design.frequency);
  const boom = boomLength(design);
  const rows: [string, string][] = [
    ['Wavelength', `${(lam * 1000).toFixed(1)} mm`],
    ['Boom', `${(boom * 1000).toFixed(0)} mm (${(boom / lam).toFixed(2)} λ)`],
    ['Element Ø', `${(design.diameter * 1000).toFixed(2)} mm (λ/a = ${(lam / (design.diameter / 2)).toFixed(0)})`],
  ];
  $('summary').replaceChildren(...rows.flatMap(([k, v]) => {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    return [dt, dd];
  }));
}

const fmtZ = (z: { re: number; im: number }) => `${z.re.toFixed(1)} ${z.im < 0 ? '−' : '+'} j${Math.abs(z.im).toFixed(1)} Ω`;

function renderResults(): void {
  const L = results.get('lawson'), M = results.get('mom');
  const cell = (r: EngineResult | undefined, f: (r: EngineResult) => string) => r ? f(r) : '…';
  const rows: [string, (r: EngineResult) => string][] = [
    ['Gain', (r) => `${r.at.gainDbi.toFixed(2)} dBi`],
    ['F/B', (r) => `${r.at.frontToBackDb.toFixed(1)} dB`],
    ['Z in', (r) => fmtZ(r.at.zIn)],
    ['SWR 50 Ω', (r) => Number.isFinite(r.at.swr50) ? r.at.swr50.toFixed(2) : '∞'],
  ];
  $('perf').querySelector('tbody')!.replaceChildren(...rows.map(([name, f]) => {
    const tr = document.createElement('tr');
    for (const v of [name, cell(L, f), cell(M, f)]) {
      const td = document.createElement(v === name ? 'th' : 'td');
      td.textContent = v;
      tr.append(td);
    }
    return tr;
  }));

  const have = ORDER.map((id) => results.get(id)).filter((r): r is EngineResult => !!r);
  const polar = (k: 'ePlane' | 'hPlane'): Series<PolarPoint>[] => have.map((r) => ({ key: r.engine, label: LABEL[r.engine], points: r[k] }));
  drawPolar($<SVGSVGElement>('ePlane'), polar('ePlane'));
  drawPolar($<SVGSVGElement>('hPlane'), polar('hPlane'));

  const line = (f: (p: EngineResult['sweep'][number]) => number): Series<XY>[] =>
    have.map((r) => ({ key: r.engine, label: LABEL[r.engine], points: r.sweep.map((p) => ({ x: p.frequency / 1e6, y: f(p) })) }));
  const markX = design.frequency / 1e6;
  drawLine($<SVGSVGElement>('gainSweep'), line((p) => p.gainDbi), { title: 'Forward gain', unit: 'dBi', digits: 2, markX });
  drawLine($<SVGSVGElement>('fbSweep'), line((p) => p.frontToBackDb), { title: 'Front-to-back', unit: 'dB', yMin: 0, markX });
  drawLine($<SVGSVGElement>('swrSweep'), line((p) => Math.min(p.swr50, 10)), { title: 'SWR (50 Ω)', unit: '', yMin: 1, yMax: 5, digits: 2, markX });
  renderSweepTable(have);
  render3d();
}

function renderSweepTable(have: EngineResult[]): void {
  const t = $('sweepTable');
  const head = document.createElement('tr');
  for (const h of ['MHz', ...have.flatMap((r) => [`${LABEL[r.engine]} gain dBi`, `${LABEL[r.engine]} F/B dB`, `${LABEL[r.engine]} Z in`])]) {
    const th = document.createElement('th'); th.textContent = h; head.append(th);
  }
  const rows = (have[0]?.sweep ?? []).map((p, i) => {
    const tr = document.createElement('tr');
    const vals = [(p.frequency / 1e6).toFixed(3), ...have.flatMap((r) => {
      const q = r.sweep[i]!;
      return [q.gainDbi.toFixed(2), q.frontToBackDb.toFixed(1), fmtZ(q.zIn)];
    })];
    for (const v of vals) { const td = document.createElement('td'); td.textContent = v; tr.append(td); }
    return tr;
  });
  t.replaceChildren(head, ...rows);
}

function render(fromTable = false): void {
  if (!fromTable) renderTable();
  renderSummary();
  drawLayout($<SVGSVGElement>('layout'), design);
  p3d?.setAntenna(design);
  history.replaceState(null, '', `#${encodeDesign(design)}`);
  requestAnalysis();
}

function syncInputs(): void {
  inputs.freq.value = String(+(design.frequency / 1e6).toFixed(4));
  inputs.dia.value = String(+(design.diameter * 1000).toFixed(2));
}

// ---------- events ----------

$('generate').addEventListener('click', () => { design = generate(); render(); });
inputs.span.addEventListener('change', requestAnalysis);

$('elements').addEventListener('change', (ev) => {
  const t = ev.target as HTMLInputElement;
  const i = Number(t.dataset.i), k = t.dataset.k as 'x' | 'length' | undefined;
  const v = Number(t.value);
  const e = design.elements[i];
  if (!e || !k || !Number.isFinite(v) || (k === 'length' && v <= 0)) return;
  e[k] = v / 1000;
  render(true);
});

syncInputs();
render();
