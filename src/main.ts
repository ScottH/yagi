import './style.css';
import { type Design, type ElementRole, boomLength, wavelength } from './model';
import { starterDesign } from './starter';
import { decodeDesign, encodeDesign } from './hash';
import { drawLayout } from './layout';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const inputs = {
  freq: $<HTMLInputElement>('freq'),
  count: $<HTMLInputElement>('count'),
  dia: $<HTMLInputElement>('dia'),
};

let design: Design = decodeDesign(location.hash) ?? generate();

function generate(): Design {
  return starterDesign({
    frequency: Number(inputs.freq.value) * 1e6,
    count: Number(inputs.count.value),
    diameter: Number(inputs.dia.value) / 1000,
  });
}

const ROLE_LABEL: Record<ElementRole, string> = { reflector: 'R', driven: 'DE', director: 'D' };

function renderTable(): void {
  const body = $('elements').querySelector('tbody')!;
  let dn = 0;
  body.replaceChildren(...design.elements.map((e, i) => {
    const tr = document.createElement('tr');
    const label = e.role === 'director' ? `D${++dn}` : ROLE_LABEL[e.role];
    tr.innerHTML = `<th>${label}</th>
      <td><input type="number" step="0.1" data-i="${i}" data-k="x" value="${(e.x * 1000).toFixed(1)}"></td>
      <td><input type="number" step="0.1" min="0" data-i="${i}" data-k="length" value="${(e.length * 1000).toFixed(1)}"></td>`;
    return tr;
  }));
}

function renderSummary(): void {
  const lam = wavelength(design.frequency);
  const boom = boomLength(design);
  $('summary').innerHTML = `
    <dt>Wavelength</dt><dd>${(lam * 1000).toFixed(1)} mm</dd>
    <dt>Boom</dt><dd>${(boom * 1000).toFixed(0)} mm (${(boom / lam).toFixed(2)} λ)</dd>
    <dt>Elements</dt><dd>${design.elements.length}</dd>
    <dt>Gain / F/B / Z</dt><dd class="muted">analysis engine not yet implemented</dd>`;
}

function render(fromTable = false): void {
  if (!fromTable) renderTable();
  renderSummary();
  drawLayout($<HTMLElement & SVGSVGElement>('layout'), design);
  history.replaceState(null, '', `#${encodeDesign(design)}`);
}

function syncInputs(): void {
  inputs.freq.value = String(+(design.frequency / 1e6).toFixed(4));
  inputs.count.value = String(design.elements.length);
  inputs.dia.value = String(+(design.diameter * 1000).toFixed(2));
}

$('generate').addEventListener('click', () => { design = generate(); render(); });

$('elements').addEventListener('change', (ev) => {
  const t = ev.target as HTMLInputElement;
  const i = Number(t.dataset.i), k = t.dataset.k as 'x' | 'length' | undefined;
  const v = Number(t.value);
  const e = design.elements[i];
  if (!e || !k || !Number.isFinite(v)) return;
  e[k] = v / 1000;
  render(true);
});

syncInputs();
render();
