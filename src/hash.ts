import type { Design, ElementRole } from './model';

// Shareable links: the whole design lives in the URL hash, like moon.
// Format: f=<MHz>&d=<mm>&e=<role><x_mm>:<len_mm>,...  (role: r/d/D)

const ROLE_CODE: Record<ElementRole, string> = { reflector: 'r', driven: 'd', director: 'D' };
const CODE_ROLE: Record<string, ElementRole> = { r: 'reflector', d: 'driven', D: 'director' };

const mm = (m: number) => +(m * 1000).toFixed(2);

export function encodeDesign(d: Design): string {
  const e = d.elements.map((el) => `${ROLE_CODE[el.role]}${mm(el.x)}:${mm(el.length)}`).join(',');
  return new URLSearchParams({ f: String(d.frequency / 1e6), d: String(mm(d.diameter)), e }).toString();
}

export function decodeDesign(hash: string): Design | null {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const f = Number(p.get('f')), dia = Number(p.get('d')), e = p.get('e');
  if (!(f > 0) || !(dia > 0) || !e) return null;
  const elements = [];
  for (const tok of e.split(',')) {
    const m = /^([rdD])(-?[\d.]+):([\d.]+)$/.exec(tok);
    const role = m && CODE_ROLE[m[1]!];
    if (!m || !role) return null;
    elements.push({ role, x: Number(m[2]) / 1000, length: Number(m[3]) / 1000 });
  }
  return { frequency: f * 1e6, diameter: dia / 1000, elements };
}
