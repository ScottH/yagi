import { describe, expect, it } from 'vitest';
import { scaleRadius, TEMPLATES, fromTemplate } from '../src/templates';
import { analyze, ENGINES } from '../src/analysis/analyze';

describe('Lawson radius scaling (ch. 7)', () => {
  it('reproduces Table 7.3', () => {
    const a1 = 0.00052599;
    // [case-1 length, case-2 (a = 0.0008), case-3 (a = 0.0012)]
    for (const [l1, l2, l3] of [[0.49478, 0.49445, 0.49408], [0.48038, 0.47892, 0.47729], [0.44766, 0.44393, 0.43977]]) {
      expect(scaleRadius(l1!, a1, 0.0008)).toBeCloseTo(l2!, 3);
      expect(scaleRadius(l1!, a1, 0.0012)).toBeCloseTo(l3!, 3);
    }
  });
  it('is the identity when the radius is unchanged', () => {
    expect(scaleRadius(0.45, 0.001, 0.001)).toBeCloseTo(0.45, 12);
  });
});

describe('templates', () => {
  it('scaled designs keep their Lawson-model gain', () => {
    for (const t of TEMPLATES) {
      const d = fromTemplate(t, 144.2e6, 0.006); // 6 mm elements on 2 m
      expect(Math.abs(analyze(d, ENGINES.lawson).gainDbi - t.ref.lawson.gainDbi), t.label).toBeLessThan(0.5);
    }
  });
  it('puts the driven element at the origin', () => {
    const d = fromTemplate(TEMPLATES[2]!, 14.2e6, 0.022);
    expect(d.elements.find((e) => e.role === 'driven')!.x).toBe(0);
  });
});
