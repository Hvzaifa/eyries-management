import { describe, expect, it } from 'vitest';
import { suggestEmd1, type Emd1Suggestion } from './emd';

function pctOf(s: Emd1Suggestion): number | null {
  return s.kind === 'suggested' ? s.pct : null;
}

describe('suggestEmd1', () => {
  it('returns none when either date is missing', () => {
    expect(suggestEmd1(null, '2026-10-01')).toEqual({ kind: 'none', reason: 'missing-dates' });
    expect(suggestEmd1('2026-08-01', undefined)).toEqual({ kind: 'none', reason: 'missing-dates' });
  });

  it('says no round under 7 days (boundary: 6)', () => {
    expect(suggestEmd1('2026-08-23', '2026-08-29')).toEqual({
      kind: 'no-round',
      reason: 'under-7-days',
    });
  });

  it('suggests 100% for exactly 7 through 14 days (boundaries)', () => {
    expect(pctOf(suggestEmd1('2026-08-23', '2026-08-30'))).toBe(100);
    expect(pctOf(suggestEmd1('2026-08-23', '2026-09-06'))).toBe(100);
  });

  it('suggests 50% for exactly 15 through 29 days (boundaries)', () => {
    expect(pctOf(suggestEmd1('2026-08-23', '2026-09-07'))).toBe(50);
    expect(pctOf(suggestEmd1('2026-08-23', '2026-09-21'))).toBe(50);
  });

  it('suggests 30% for exactly 30 through 59 days (boundaries)', () => {
    expect(pctOf(suggestEmd1('2026-08-23', '2026-09-22'))).toBe(30);
    expect(pctOf(suggestEmd1('2026-08-23', '2026-10-21'))).toBe(30);
  });

  it('suggests 15% at exactly 60 days through exactly 90 days (boundaries)', () => {
    expect(pctOf(suggestEmd1('2026-08-23', '2026-10-22'))).toBe(15);
    expect(pctOf(suggestEmd1('2026-08-23', '2026-10-23'))).toBe(15);
    expect(pctOf(suggestEmd1('2026-08-23', '2026-11-21'))).toBe(15);
  });

  it('still suggests the lowest band beyond 90 days', () => {
    expect(pctOf(suggestEmd1('2026-08-23', '2026-11-22'))).toBe(15);
    expect(pctOf(suggestEmd1('2026-01-01', '2027-01-01'))).toBe(15);
  });

  it('handles month and year rollovers in day counting', () => {
    expect(pctOf(suggestEmd1('2026-12-31', '2027-01-07'))).toBe(100);
    expect(pctOf(suggestEmd1('2028-02-28', '2028-03-06'))).toBe(100);
  });
});
