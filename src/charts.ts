// Small SVG charts: polar pattern cuts and frequency-sweep lines. Two series
// (Lawson vs. method of moments), distinguished by colour and dash.

const NS = 'http://www.w3.org/2000/svg';

export interface Series<P> { key: string; label: string; points: P[] }

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}
function text(x: number, y: number, s: string, cls: string, anchor = 'middle'): SVGTextElement {
  const t = svgEl('text', { x, y, class: cls, 'text-anchor': anchor, 'dominant-baseline': 'middle' });
  t.textContent = s;
  return t;
}

// ---- tooltip (one per page) ----
const tip = document.createElement('div');
tip.className = 'tooltip';
tip.hidden = true;
document.body.append(tip);

function showTip(ev: PointerEvent, title: string, rows: { key: string; label: string; value: string }[]) {
  tip.replaceChildren();
  const h = document.createElement('div');
  h.className = 'tip-title';
  h.textContent = title;
  tip.append(h);
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = 'tip-row';
    const key = document.createElement('span');
    key.className = `tip-key s-${r.key}`;
    const v = document.createElement('strong');
    v.textContent = r.value;
    const l = document.createElement('span');
    l.className = 'tip-label';
    l.textContent = r.label;
    row.append(key, v, l);
    tip.append(row);
  }
  tip.hidden = false;
  const pad = 14, w = tip.offsetWidth, h2 = tip.offsetHeight;
  const x = ev.clientX + pad + w > innerWidth ? ev.clientX - pad - w : ev.clientX + pad;
  const y = Math.min(ev.clientY + pad, innerHeight - h2 - 4);
  tip.style.transform = `translate(${x}px, ${y}px)`;
}
const hideTip = () => { tip.hidden = true; };

// ---- polar pattern ----

export interface PolarPoint { angleDeg: number; gainDbi: number }

/** Polar plot with 0° (forward) at the top, gain in dBi, 40 dB range. */
export function drawPolar(svg: SVGSVGElement, series: Series<PolarPoint>[], range = 40): void {
  svg.replaceChildren();
  const S = 300, c = S / 2, R = 118;
  svg.setAttribute('viewBox', `0 0 ${S} ${S}`);
  const all = series.flatMap((s) => s.points.map((p) => p.gainDbi));
  if (all.length === 0) return;
  const top = Math.ceil(Math.max(...all) / 5) * 5;
  const r = (g: number) => (Math.max(0, g - (top - range)) / range) * R;
  const xy = (deg: number, rad: number) => [c + rad * Math.sin((deg * Math.PI) / 180), c - rad * Math.cos((deg * Math.PI) / 180)] as const;

  const grid = svgEl('g', { class: 'grid' });
  for (let d = 0; d <= range; d += 10) grid.append(svgEl('circle', { cx: c, cy: c, r: r(top - d) }));
  for (let a = 0; a < 360; a += 30) {
    const [x, y] = xy(a, R);
    grid.append(svgEl('line', { x1: c, y1: c, x2: x, y2: y }));
    const [lx, ly] = xy(a, R + 14);
    grid.append(text(lx, ly, `${a > 180 ? a - 360 : a}°`, 'axis-label'));
  }
  for (let d = 0; d < range; d += 10) grid.append(text(c + 3, c - r(top - d) + 7, `${top - d}`, 'axis-label', 'start'));
  svg.append(grid);

  for (const s of series) {
    const d = s.points.map((p, i) => {
      const [x, y] = xy(p.angleDeg, r(p.gainDbi));
      return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join('') + 'Z';
    svg.append(svgEl('path', { d, class: `series s-${s.key}` }));
  }

  const hair = svgEl('line', { class: 'hairline', x1: c, y1: c, x2: c, y2: c, visibility: 'hidden' });
  svg.append(hair);
  svg.onpointermove = (ev) => {
    const box = svg.getBoundingClientRect();
    const px = ((ev.clientX - box.left) / box.width) * S - c, py = ((ev.clientY - box.top) / box.height) * S - c;
    let deg = (Math.atan2(px, -py) * 180) / Math.PI;
    deg = Math.round(deg / 2) * 2;
    const [x, y] = xy(deg, R);
    hair.setAttribute('x2', String(x));
    hair.setAttribute('y2', String(y));
    hair.setAttribute('visibility', 'visible');
    showTip(ev, `${deg}°`, series.map((s) => {
      const p = s.points.reduce((a, b) => (Math.abs(b.angleDeg - deg) < Math.abs(a.angleDeg - deg) ? b : a));
      return { key: s.key, label: s.label, value: `${p.gainDbi.toFixed(1)} dBi` };
    }));
  };
  svg.onpointerleave = () => { hair.setAttribute('visibility', 'hidden'); hideTip(); };
}

// ---- line chart ----

export interface XY { x: number; y: number }

export interface LineOpts {
  title: string;
  unit: string;
  yMin?: number;
  yMax?: number;
  digits?: number;
  /** Marker for the design frequency. */
  markX?: number;
}

const niceStep = (span: number, n: number) => {
  const raw = span / n, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
};

export function drawLine(svg: SVGSVGElement, series: Series<XY>[], o: LineOpts): void {
  svg.replaceChildren();
  const W = 340, H = 170, L = 40, Rm = 10, T = 22, B = 26;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const pts = series.flatMap((s) => s.points).filter((p) => Number.isFinite(p.y));
  if (pts.length === 0) return;
  const xs = pts.map((p) => p.x);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = o.yMin ?? Math.min(...pts.map((p) => p.y)), y1 = o.yMax ?? Math.max(...pts.map((p) => p.y));
  if (o.yMin === undefined) y0 = Math.floor(y0);
  if (o.yMax === undefined) y1 = Math.ceil(y1);
  if (y1 - y0 < 1) y1 = y0 + 1;
  const sx = (x: number) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - Rm);
  const sy = (y: number) => T + (1 - (Math.min(Math.max(y, y0), y1) - y0) / (y1 - y0)) * (H - T - B);

  svg.append(text(L, 10, o.unit ? `${o.title} (${o.unit})` : o.title, 'chart-title', 'start'));
  const grid = svgEl('g', { class: 'grid' });
  const ys = niceStep(y1 - y0, 4);
  for (let y = Math.ceil(y0 / ys) * ys; y <= y1 + 1e-9; y += ys) {
    grid.append(svgEl('line', { x1: L, x2: W - Rm, y1: sy(y), y2: sy(y) }));
    grid.append(text(L - 5, sy(y), `${+y.toFixed(2)}`, 'axis-label', 'end'));
  }
  const xsStep = niceStep(x1 - x0, 4);
  for (let x = Math.ceil(x0 / xsStep) * xsStep; x <= x1 + 1e-9; x += xsStep) {
    grid.append(text(sx(x), H - 10, `${+x.toFixed(3)}`, 'axis-label'));
  }
  if (o.markX !== undefined) grid.append(svgEl('line', { class: 'mark', x1: sx(o.markX), x2: sx(o.markX), y1: T, y2: H - B }));
  svg.append(grid);

  for (const s of series) {
    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
    svg.append(svgEl('path', { d, class: `series s-${s.key}` }));
  }

  const hair = svgEl('line', { class: 'hairline', y1: T, y2: H - B, visibility: 'hidden' });
  svg.append(hair);
  svg.onpointermove = (ev) => {
    const box = svg.getBoundingClientRect();
    const fx = x0 + ((((ev.clientX - box.left) / box.width) * W - L) / (W - L - Rm)) * (x1 - x0);
    const ref = series[0]!.points.reduce((a, b) => (Math.abs(b.x - fx) < Math.abs(a.x - fx) ? b : a));
    hair.setAttribute('x1', String(sx(ref.x)));
    hair.setAttribute('x2', String(sx(ref.x)));
    hair.setAttribute('visibility', 'visible');
    showTip(ev, `${ref.x.toFixed(3)} MHz`, series.map((s) => {
      const p = s.points.find((q) => q.x === ref.x);
      return { key: s.key, label: s.label, value: p && Number.isFinite(p.y) ? `${p.y.toFixed(o.digits ?? 1)}${o.unit ? ` ${o.unit}` : ''}` : '—' };
    }));
  };
  svg.onpointerleave = () => { hair.setAttribute('visibility', 'hidden'); hideTip(); };
}
