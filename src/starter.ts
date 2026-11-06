import { type Design, type YagiElement, wavelength } from './model';

// PLACEHOLDER geometry so the UI has something to draw. These are rough
// textbook-style proportions, NOT an optimised or validated design. They get
// replaced by the design method from the reference book once it's chosen.

export interface StarterParams {
  frequency: number; // Hz
  count: number;     // total elements, >= 2
  diameter: number;  // m
}

export function starterDesign({ frequency, count, diameter }: StarterParams): Design {
  const lam = wavelength(frequency);
  const n = Math.max(2, Math.round(count));
  const elements: YagiElement[] = [
    { role: 'reflector', x: -0.2 * lam, length: 0.5 * lam },
    { role: 'driven', x: 0, length: 0.47 * lam },
  ];
  let x = 0;
  for (let i = 0; i < n - 2; i++) {
    x += i === 0 ? 0.1 * lam : Math.min(0.15 * lam + 0.025 * lam * i, 0.4 * lam);
    elements.push({ role: 'director', x, length: Math.max(0.44 * lam - 0.005 * lam * i, 0.4 * lam) });
  }
  return { frequency, diameter, elements };
}
