import { describe, expect, it } from 'vitest';
import { emd2DaysBeforeDeparture, suggestEmdPlan, emd1DaysToDeadline, clampEmd2Deadline } from './emd';

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

describe('emd1DaysToDeadline — SV table bands (owner ruling 2026-09-07)', () => {
  it('60+ days out gets +10 (owner ruling, not the table\'s 14)', () => {
    expect(emd1DaysToDeadline(60)).toBe(10);
    expect(emd1DaysToDeadline(365)).toBe(10);
  });

  it('30-59 days out gets +6 (owner ruling, not the table\'s 10)', () => {
    expect(emd1DaysToDeadline(30)).toBe(6);
    expect(emd1DaysToDeadline(59)).toBe(6);
  });

  it('15-29 days out gets +3 — previously today, which read as overdue', () => {
    expect(emd1DaysToDeadline(15)).toBe(3);
    expect(emd1DaysToDeadline(29)).toBe(3);
  });

  it('7-14 days out gets +3 — previously today', () => {
    expect(emd1DaysToDeadline(7)).toBe(3);
    expect(emd1DaysToDeadline(14)).toBe(3);
  });

  it('2-6 days out gets +1 — previously today', () => {
    expect(emd1DaysToDeadline(2)).toBe(1);
    expect(emd1DaysToDeadline(6)).toBe(1);
  });

  it('under 2 days is genuinely immediate — today is correct here', () => {
    expect(emd1DaysToDeadline(1)).toBe(0);
    expect(emd1DaysToDeadline(0)).toBe(0);
  });

  it('never suggests a deadline in the past, even for a departure already gone', () => {
    expect(emd1DaysToDeadline(-30)).toBe(0);
  });

  it('every band boundary lands in the band the table names', () => {
    // The boundaries are where an off-by-one silently moves money.
    expect(emd1DaysToDeadline(59)).not.toBe(emd1DaysToDeadline(60));
    expect(emd1DaysToDeadline(29)).not.toBe(emd1DaysToDeadline(30));
    expect(emd1DaysToDeadline(6)).not.toBe(emd1DaysToDeadline(7));
    expect(emd1DaysToDeadline(1)).not.toBe(emd1DaysToDeadline(2));
  });
});

describe('clampEmd2Deadline — EMD-2 must never fall due before EMD-1', () => {
  it('leaves a normal EMD-2 date untouched', () => {
    expect(clampEmd2Deadline('2026-09-20', '2026-09-10')).toBe('2026-09-20');
  });

  it('fixes the real 7-days-out case that put round 2 before round 1', () => {
    // Booked 2026-09-07 for departure 2026-09-14:
    //   EMD-1 = today+3      = 2026-09-10
    //   EMD-2 = departure-5  = 2026-09-09  <- earlier than EMD-1
    expect(clampEmd2Deadline('2026-09-09', '2026-09-10')).toBe('2026-09-11');
  });

  it('pushes past EMD-1 when the two land on the SAME day', () => {
    // Same-day is still wrong: the rounds are sequential, not simultaneous.
    expect(clampEmd2Deadline('2026-09-10', '2026-09-10')).toBe('2026-09-11');
  });

  it('does nothing when EMD-1 has no deadline recorded', () => {
    expect(clampEmd2Deadline('2026-09-09', null)).toBe('2026-09-09');
  });

  it('rolls over month ends correctly when it pushes', () => {
    expect(clampEmd2Deadline('2026-09-29', '2026-09-30')).toBe('2026-10-01');
  });

  it('rolls over year ends correctly when it pushes', () => {
    expect(clampEmd2Deadline('2026-12-30', '2026-12-31')).toBe('2027-01-01');
  });

  it('handles a leap day', () => {
    expect(clampEmd2Deadline('2028-02-28', '2028-02-28')).toBe('2028-02-29');
  });

  it('is idempotent — re-clamping an already-clamped date changes nothing', () => {
    const once = clampEmd2Deadline('2026-09-09', '2026-09-10');
    expect(clampEmd2Deadline(once, '2026-09-10')).toBe(once);
  });

  it('every SV band now yields EMD-2 strictly after EMD-1', () => {
    const today = '2026-09-07';
    const add = (iso: string, n: number) => {
      const [y, m, d] = iso.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
    };
    for (const days of [7, 8, 10, 14, 15, 20, 29, 30, 45, 59, 60, 90, 365]) {
      const outbound = add(today, days);
      const emd1 = add(today, emd1DaysToDeadline(days));
      const offset = emd2DaysBeforeDeparture(days)!;
      const emd2 = clampEmd2Deadline(add(outbound, -offset), emd1);
      expect(emd2 > emd1, `days=${days}: EMD-2 ${emd2} must be after EMD-1 ${emd1}`).toBe(true);
    }
  });
});
