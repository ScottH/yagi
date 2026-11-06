import { type Design, boomLength } from './model';

// Top-down SVG drawing of the boom and elements.

const NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

export function drawLayout(svg: SVGSVGElement, d: Design): void {
  svg.replaceChildren();
  if (d.elements.length === 0) return;
  const xs = d.elements.map((e) => e.x);
  const maxLen = Math.max(...d.elements.map((e) => e.length));
  const span = Math.max(boomLength(d), maxLen * 0.5);
  const pad = 0.08 * span;
  const x0 = Math.min(...xs) - pad, w = span + 2 * pad;
  const h = maxLen * 1.25;
  svg.setAttribute('viewBox', `${x0} ${-h / 2} ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const stroke = w / 300;
  svg.append(el('line', { x1: Math.min(...xs), x2: Math.max(...xs), y1: 0, y2: 0, class: 'boom', 'stroke-width': stroke * 2.5 }));
  d.elements.forEach((e, i) => {
    const line = el('line', { x1: e.x, x2: e.x, y1: -e.length / 2, y2: e.length / 2, class: `elem ${e.role}`, 'stroke-width': stroke * 2 });
    const title = el('title', {});
    title.textContent = `${i + 1}: ${e.role} — x ${(e.x * 1000).toFixed(1)} mm, length ${(e.length * 1000).toFixed(1)} mm`;
    line.append(title);
    svg.append(line);
  });
  const arrow = el('text', { x: Math.max(...xs) + pad * 0.5, y: -h * 0.42, class: 'fwd', 'font-size': h / 30, 'text-anchor': 'end' });
  arrow.textContent = 'forward →';
  svg.append(arrow);
}
