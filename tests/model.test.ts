import { describe, expect, it } from 'vitest';
import { swr, wavelength } from '../src/model';
import { TEMPLATES, fromTemplate } from '../src/templates';
import { decodeDesign, encodeDesign } from '../src/hash';

describe('model', () => {
  it('wavelength at 144 MHz is ~2.08 m', () => {
    expect(wavelength(144e6)).toBeCloseTo(2.0819, 3);
  });

  it('SWR is 1 for a matched load and 3 for 150 Ω on 50 Ω', () => {
    expect(swr({ re: 50, im: 0 })).toBeCloseTo(1, 9);
    expect(swr({ re: 150, im: 0 })).toBeCloseTo(3, 9);
  });
});

describe('template design', () => {
  it('has reflector, driven element and directors in boom order', () => {
    const d = fromTemplate(TEMPLATES.find((t) => t.id === 'lawson-6')!, 144e6, 0.006);
    expect(d.elements.map((e) => e.role)).toEqual(['reflector', 'driven', ...Array(4).fill('director')]);
    const xs = d.elements.map((e) => e.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });
});

describe('URL hash', () => {
  it('round-trips a design', () => {
    const d = fromTemplate(TEMPLATES.find((t) => t.id === 'lawson-5')!, 432.1e6, 0.004);
    const back = decodeDesign('#' + encodeDesign(d))!;
    expect(back.frequency).toBeCloseTo(d.frequency, 0);
    expect(back.elements).toHaveLength(5);
    back.elements.forEach((e, i) => {
      expect(e.role).toBe(d.elements[i]!.role);
      expect(e.x).toBeCloseTo(d.elements[i]!.x, 4);
      expect(e.length).toBeCloseTo(d.elements[i]!.length, 4);
    });
  });

  it('rejects junk', () => {
    expect(decodeDesign('#f=abc')).toBeNull();
  });
});
