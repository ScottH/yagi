import { describe, expect, it } from 'vitest';
import { ALL_BANDS, matchBand } from '../src/data/bands';

describe('ham band list', () => {
  it('has unique ids and sensible edges', () => {
    expect(new Set(ALL_BANDS.map((b) => b.id)).size).toBe(ALL_BANDS.length);
    for (const b of ALL_BANDS) {
      expect(b.hi, b.id).toBeGreaterThan(b.lo);
      expect(b.label, b.id).toContain(String(b.lo).replace(/\.0+$/, '').slice(0, 2));
    }
  });
  it('matches edges back to a band', () => {
    expect(matchBand(144, 148)?.id).toBe('2m');
    expect(matchBand(144, 147)).toBeUndefined();
  });
});
