import { describe, expect, it } from 'vitest';
import {
  emd2DaysBeforeDeparture,
  suggestEmdPlan,
  emd1DaysToDeadline,
  emd1PolicyDaysToIssue,
  EMD_ISSUANCE_SAFETY_DAYS,
  clampEmd2Deadline,
  emdAmountFor,
  EMD_STATUSES,
  HELD_EMD_STATUS,
  isEmdStatus,
  nextEmdSuggestion,
} from './emd';

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

describe('emd1PolicyDaysToIssue — the airline’s own figures', () => {
  // Straight off the SV policy sheet. These must match the table in
  // business-rules.md exactly; the system's own margin is applied separately.
  it('matches the uploaded policy row for row', () => {
    expect(emd1PolicyDaysToIssue(60)).toBe(14);
    expect(emd1PolicyDaysToIssue(365)).toBe(14);
    expect(emd1PolicyDaysToIssue(30)).toBe(10);
    expect(emd1PolicyDaysToIssue(59)).toBe(10);
    expect(emd1PolicyDaysToIssue(15)).toBe(3);
    expect(emd1PolicyDaysToIssue(29)).toBe(3);
    expect(emd1PolicyDaysToIssue(7)).toBe(3);
    expect(emd1PolicyDaysToIssue(14)).toBe(3);
    expect(emd1PolicyDaysToIssue(2)).toBe(1);
    expect(emd1PolicyDaysToIssue(6)).toBe(1);
    expect(emd1PolicyDaysToIssue(1)).toBe(0);
    expect(emd1PolicyDaysToIssue(0)).toBe(0);
  });
});

describe('emd1DaysToDeadline — issuance deadline, policy minus the 3-day margin', () => {
  // Owner ruling 2026-09-21: the policy governs when the EMD is ISSUED, and the
  // system works 3 days ahead of it because the airline is routinely 2-3 days
  // late sending the PNR and seats, with Sundays in between.
  it('is exactly the policy figure less the safety margin', () => {
    for (const days of [365, 60, 59, 30, 29, 15, 14, 7, 6, 2, 1, 0]) {
      expect(emd1DaysToDeadline(days)).toBe(
        Math.max(0, emd1PolicyDaysToIssue(days) - EMD_ISSUANCE_SAFETY_DAYS)
      );
    }
  });

  it('60+ days out gets +11 (policy 14)', () => {
    expect(emd1DaysToDeadline(60)).toBe(11);
    expect(emd1DaysToDeadline(365)).toBe(11);
  });

  it('30-59 days out gets +7 (policy 10)', () => {
    expect(emd1DaysToDeadline(30)).toBe(7);
    expect(emd1DaysToDeadline(59)).toBe(7);
  });

  it('15-29 and 7-14 days out are immediate (policy 3, margin 3)', () => {
    expect(emd1DaysToDeadline(15)).toBe(0);
    expect(emd1DaysToDeadline(29)).toBe(0);
    expect(emd1DaysToDeadline(7)).toBe(0);
    expect(emd1DaysToDeadline(14)).toBe(0);
  });

  it('floors at immediate rather than going negative — the owner’s own case', () => {
    // 2-6 days out: policy is "100% within 1 day", and 1 - 3 = -2. The deadline
    // is immediate, never two days in the past.
    expect(emd1DaysToDeadline(2)).toBe(0);
    expect(emd1DaysToDeadline(6)).toBe(0);
  });

  it('under 2 days is immediate, as the policy itself says', () => {
    expect(emd1DaysToDeadline(1)).toBe(0);
    expect(emd1DaysToDeadline(0)).toBe(0);
  });

  it('never suggests a deadline in the past, even for a departure already gone', () => {
    expect(emd1DaysToDeadline(-30)).toBe(0);
  });

  it('never suggests a date beyond the airline’s own deadline', () => {
    // The margin may only bring a date forward. If this ever inverts, every
    // booking in that band is issued late.
    for (const days of [365, 60, 45, 30, 20, 15, 10, 7, 5, 2, 1, 0]) {
      expect(emd1DaysToDeadline(days)).toBeLessThanOrEqual(emd1PolicyDaysToIssue(days));
    }
  });

  it('keeps the two long bands distinct at their boundaries', () => {
    // The short bands all collapse to "immediate", so only these can differ.
    expect(emd1DaysToDeadline(59)).not.toBe(emd1DaysToDeadline(60));
    expect(emd1DaysToDeadline(29)).not.toBe(emd1DaysToDeadline(30));
  });
});

describe('clampEmd2Deadline — EMD-2 must never fall due before EMD-1', () => {
  it('leaves a normal EMD-2 date untouched', () => {
    expect(clampEmd2Deadline('2026-09-20', '2026-09-10')).toBe('2026-09-20');
  });

  it('fixes the case that put round 2 before round 1', () => {
    // The shape that motivated the clamp: EMD-2 counts back from departure and
    // landed on 09 Sep while EMD-1, counting forward, landed on the 10th.
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

describe('emdAmountFor — the EMD amount staff verify', () => {
  it('is the booking’s value × the round percentage', () => {
    // 50 seats at 125,000 = 6,250,000; a 15% deposit is 937,500.
    expect(emdAmountFor(50, 125_000, 15)).toBe(937_500);
    expect(emdAmountFor(50, 125_000, 85)).toBe(5_312_500);
  });

  it('adds back to the booking’s full value across a policy’s two rounds', () => {
    const deposit = emdAmountFor(99, 115_000, 15)!;
    const balance = emdAmountFor(99, 115_000, 85)!;
    expect(deposit + balance).toBe(99 * 115_000);
  });

  it('rounds to the paisa rather than leaving a fraction', () => {
    // 15% of 3 × 333,333.33 = 149,999.9985 — rounded to the paisa, 150,000.00.
    // The point is that nothing carries more precision than the column stores.
    expect(emdAmountFor(3, 333_333.33, 15)).toBe(150_000);
    // 7.5% of 1 × 333,333.33 = 24,999.99975 -> 25,000.00
    expect(emdAmountFor(1, 333_333.33, 7.5)).toBe(25_000);
    // A figure that genuinely lands on a paisa keeps it.
    expect(emdAmountFor(1, 100.05, 50)).toBe(50.03);
  });

  it('handles 100%, the short-notice bands’ single deposit', () => {
    expect(emdAmountFor(10, 100_000, 100)).toBe(1_000_000);
  });

  it('returns null when anything it needs is missing or impossible', () => {
    expect(emdAmountFor(null, 125_000, 15)).toBeNull();
    expect(emdAmountFor(50, null, 15)).toBeNull();
    expect(emdAmountFor(50, 125_000, null)).toBeNull();
    expect(emdAmountFor(0, 125_000, 15)).toBeNull();
    expect(emdAmountFor(50, 125_000, -1)).toBeNull();
    expect(emdAmountFor(NaN, 125_000, 15)).toBeNull();
  });
});

describe('EMD statuses', () => {
  it('has exactly two (owner ruling, 2026-09-21)', () => {
    expect(EMD_STATUSES).toEqual(['issued', 'refunded']);
  });

  it('treats an issued round as the EMD the airline holds', () => {
    expect(HELD_EMD_STATUS).toBe('issued');
  });

  it('rejects the statuses that were removed', () => {
    expect(isEmdStatus('issued')).toBe(true);
    expect(isEmdStatus('refunded')).toBe(true);
    for (const gone of ['paid', 'refund_requested', 'expired', 'pending', null]) {
      expect(isEmdStatus(gone)).toBe(false);
    }
  });
});

describe('nextEmdSuggestion — what the issuance forms pre-fill', () => {
  const booking = {
    seats: 50,
    fare: 125_000,
    airlineCode: 'SV',
    segment: 'Umrah',
    requestDateIso: '2026-09-21',
    outboundDateIso: '2026-12-20', // 90 days out -> the 15/85 band
    todayIso: '2026-09-21',
  };

  it('proposes the deposit for a booking with no rounds yet', () => {
    expect(nextEmdSuggestion({ ...booking, roundsIssued: 0 })).toEqual({
      roundNumber: 1,
      paymentPct: 15,
      amount: 937_500,
      deadline: '2026-11-30', // outbound − 20, the policy date for the balance
    });
  });

  it('proposes the balance once the deposit is issued, and no new time limit', () => {
    // After the balance there is no policy date left — an extension is agreed
    // with the airline, so nothing is proposed.
    expect(nextEmdSuggestion({ ...booking, roundsIssued: 1 })).toEqual({
      roundNumber: 2,
      paymentPct: 85,
      amount: 5_312_500,
      deadline: null,
    });
  });

  it('proposes nothing but the round number for an extension', () => {
    expect(nextEmdSuggestion({ ...booking, roundsIssued: 2 })).toMatchObject({
      roundNumber: 3,
      paymentPct: null,
      amount: null,
      deadline: null,
    });
  });

  it('the deposit and balance it proposes add to the booking’s value', () => {
    const first = nextEmdSuggestion({ ...booking, roundsIssued: 0 }).amount!;
    const second = nextEmdSuggestion({ ...booking, roundsIssued: 1 }).amount!;
    expect(first + second).toBe(50 * 125_000);
  });

  it('proposes no figures for an airline with no stored policy', () => {
    expect(nextEmdSuggestion({ ...booking, airlineCode: 'EK', roundsIssued: 0 })).toEqual({
      roundNumber: 1,
      paymentPct: null,
      amount: null,
      deadline: null,
    });
  });

  it('never proposes a time limit that has already passed', () => {
    // A booking requested on 1 Sep for a 25 Sep departure is in the 15–29 band,
    // whose balance is due outbound − 7 = 18 Sep — already behind today. The
    // clamp must push it past today rather than propose a lapsed date.
    const late = nextEmdSuggestion({
      ...booking,
      requestDateIso: '2026-09-01',
      outboundDateIso: '2026-09-25',
      todayIso: '2026-09-21',
      roundsIssued: 0,
    });
    expect(late.paymentPct).toBe(50);
    expect(late.deadline).toBe('2026-09-22');
  });

  it('handles a single-deposit band, which has no balance round', () => {
    // 2–6 days out: 100% and no second EMD, so no policy time limit either.
    const s = nextEmdSuggestion({ ...booking, outboundDateIso: '2026-09-24', roundsIssued: 0 });
    expect(s.paymentPct).toBe(100);
    expect(s.amount).toBe(6_250_000);
    expect(s.deadline).toBeNull();
  });
});
