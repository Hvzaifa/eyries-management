import { describe, expect, it } from 'vitest';
import { emd2DaysBeforeDeparture, suggestEmdPlan } from './emd';

const svUmrah = {
  airlineCode: 'SV',
  segment: 'UMRAH',
  requestDateIso: '2026-08-23',
};

describe('suggestEmdPlan (SV Umrah year-round policy)', () => {
  it('suggests 15/85 at exactly 60 days and beyond', () => {
    expect(suggestEmdPlan({ ...svUmrah, outboundDateIso: '2026-10-22' })).toMatchObject({
      applicable: true,
      emd1Pct: 15,
      emd2Pct: 85,
    });
    expect(suggestEmdPlan({ ...svUmrah, outboundDateIso: '2027-01-01' }).emd1Pct).toBe(15);
  });

  it('suggests 30/70 for 30 through 59 days (boundaries)', () => {
    expect(suggestEmdPlan({ ...svUmrah, outboundDateIso: '2026-09-22' }).emd1Pct).toBe(30);
    expect(suggestEmdPlan({ ...svUmrah, outboundDateIso: '2026-10-21' }).emd1Pct).toBe(30);
  });

  it('suggests 50/50 for 15 through 29 days (boundaries)', () => {
    expect(suggestEmdPlan({ ...svUmrah, outboundDateIso: '2026-09-07' }).emd1Pct).toBe(50);
    expect(suggestEmdPlan({ ...svUmrah, outboundDateIso: '2026-09-21' }).emd2Pct).toBe(50);
  });

  it('suggests 70/30 for 7 through 14 days (boundaries)', () => {
    expect(suggestEmdPlan({ ...svUmrah, outboundDateIso: '2026-08-30' }).emd1Pct).toBe(70);
    expect(suggestEmdPlan({ ...svUmrah, outboundDateIso: '2026-09-06' }).emd2Pct).toBe(30);
  });

  it('suggests 100% single deposit for 2 through 6 days (boundaries)', () => {
    const s = suggestEmdPlan({ ...svUmrah, outboundDateIso: '2026-08-25' });
    expect(s.emd1Pct).toBe(100);
    expect(s.emd2Pct).toBeNull();
    expect(suggestEmdPlan({ ...svUmrah, outboundDateIso: '2026-08-29' }).bandLabel).toBe('2–6 days out');
  });

  it('suggests immediate 100% under 2 days out', () => {
    const s = suggestEmdPlan({ ...svUmrah, outboundDateIso: '2026-08-24' });
    expect(s.emd1Pct).toBe(100);
    expect(s.emd2Pct).toBeNull();
    expect(s.bandLabel).toBe('under 2 days out');
  });
});

describe('suggestEmdPlan scoping', () => {
  it('does not apply to non-SV airlines — manual entry until policies arrive', () => {
    for (const code of ['PK', 'EK', 'QR', null]) {
      const s = suggestEmdPlan({ ...svUmrah, airlineCode: code, outboundDateIso: '2026-10-22' });
      expect(s).toMatchObject({ applicable: false, reason: 'non-sv-airline', emd1Pct: null });
    }
  });

  it('does not apply to SV bookings that are not Umrah (no hajj/tour policy)', () => {
    for (const segment of ['EMPLOYMENT', 'TOUR', 'Hajj', null]) {
      const s = suggestEmdPlan({ ...svUmrah, segment, outboundDateIso: '2026-10-22' });
      expect(s).toMatchObject({ applicable: false, reason: 'non-umrah-segment' });
    }
  });

  it('needs both dates to compute a band', () => {
    expect(
      suggestEmdPlan({ ...svUmrah, requestDateIso: null, outboundDateIso: '2026-10-22' }).reason
    ).toBe('missing-dates');
    expect(suggestEmdPlan({ ...svUmrah, outboundDateIso: null }).reason).toBe('missing-dates');
  });
});

describe('emd2DaysBeforeDeparture', () => {
  it('maps each policy band to its full-payment offset (boundaries)', () => {
    expect(emd2DaysBeforeDeparture(60)).toBe(20);
    expect(emd2DaysBeforeDeparture(200)).toBe(20);
    expect(emd2DaysBeforeDeparture(59)).toBe(10);
    expect(emd2DaysBeforeDeparture(30)).toBe(10);
    expect(emd2DaysBeforeDeparture(29)).toBe(7);
    expect(emd2DaysBeforeDeparture(15)).toBe(7);
    expect(emd2DaysBeforeDeparture(14)).toBe(5);
    expect(emd2DaysBeforeDeparture(7)).toBe(5);
  });

  it('returns null for single-deposit bookings under 7 days', () => {
    expect(emd2DaysBeforeDeparture(6)).toBeNull();
    expect(emd2DaysBeforeDeparture(0)).toBeNull();
  });
});
