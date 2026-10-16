import { describe, expect, it } from 'vitest';
import {
  IATA_PERIODS,
  IATA_CALENDAR_FROM,
  IATA_CALENDAR_TO,
  iataPeriodFor,
  iataPaymentDeadline,
} from './iata-calendar';
import { diffInDays } from './urgency';

// The calendar is transcribed from a PDF, so the tests do two separate jobs:
// prove the TRANSCRIPTION is intact, and prove the LOOKUP over it is right.
// A typo in a date would be invisible to a lookup test alone.

describe('the transcribed calendar', () => {
  it('holds the 48 four-times-per-month periods of 2026, and nothing else', () => {
    expect(IATA_PERIODS).toHaveLength(48);
    expect(IATA_CALENDAR_FROM).toBe('2026-01-01');
    expect(IATA_CALENDAR_TO).toBe('2026-12-31');
  });

  it('matches the PDF at the edges and in the middle', () => {
    expect(IATA_PERIODS[0]).toEqual({
      code: '20260101W',
      billingFrom: '2026-01-01',
      billingTo: '2026-01-07',
      remittanceDay: '2026-01-14',
    });
    // The period containing the day this was built.
    expect(IATA_PERIODS.find((p) => p.code === '20260903W')).toEqual({
      code: '20260903W',
      billingFrom: '2026-09-16',
      billingTo: '2026-09-23',
      remittanceDay: '2026-09-30',
    });
    // The last one settles in the NEXT year — the remittance day may fall
    // outside the billing year, and the code must not assume otherwise.
    expect(IATA_PERIODS[47]).toEqual({
      code: '20261204W',
      billingFrom: '2026-12-24',
      billingTo: '2026-12-31',
      remittanceDay: '2027-01-07',
    });
  });

  it('is contiguous with no gaps and no overlaps', () => {
    // This is the property that makes a first-match lookup correct. If two
    // windows ever overlapped, `iataPeriodFor` would silently pick the earlier
    // one and quote the wrong remittance day.
    for (let i = 0; i < IATA_PERIODS.length; i++) {
      const p = IATA_PERIODS[i];
      expect(p.billingFrom <= p.billingTo, `${p.code} runs backwards`).toBe(true);
      if (i > 0) {
        const gap = diffInDays(IATA_PERIODS[i - 1].billingTo, p.billingFrom);
        expect(gap, `${p.code} does not start the day after ${IATA_PERIODS[i - 1].code} ends`).toBe(1);
      }
    }
  });

  it('never settles before the billing window has closed', () => {
    for (const p of IATA_PERIODS) {
      const lag = diffInDays(p.billingTo, p.remittanceDay);
      expect(lag, `${p.code} settles ${lag} days after billing closed`).toBeGreaterThanOrEqual(7);
      expect(lag).toBeLessThanOrEqual(10);
    }
  });

  it('gives every month exactly four periods', () => {
    const byMonth = new Map<string, number>();
    for (const p of IATA_PERIODS) {
      const m = p.billingFrom.slice(0, 7);
      byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
    }
    expect(byMonth.size).toBe(12);
    for (const [month, count] of byMonth) {
      expect(count, `${month} has ${count} periods`).toBe(4);
    }
  });

  it('uses period codes that agree with their own billing window', () => {
    // 20260903W = 2026, month 09, the 3rd period, weekly-billed.
    for (const p of IATA_PERIODS) {
      expect(p.code.slice(0, 6)).toBe(p.billingFrom.slice(0, 7).replace('-', ''));
      expect(p.code.endsWith('W')).toBe(true);
    }
  });
});

describe('iataPeriodFor', () => {
  it('finds the period containing a date', () => {
    expect(iataPeriodFor('2026-09-22')?.code).toBe('20260903W');
  });

  it('includes both ends of the window', () => {
    // A booking issued on the first or last day of a window belongs to it —
    // an off-by-one here moves real money into the wrong settlement.
    expect(iataPeriodFor('2026-09-16')?.code).toBe('20260903W');
    expect(iataPeriodFor('2026-09-23')?.code).toBe('20260903W');
    expect(iataPeriodFor('2026-09-15')?.code).toBe('20260902W');
    expect(iataPeriodFor('2026-09-24')?.code).toBe('20260904W');
  });

  it('assigns every single day of 2026 to exactly one period', () => {
    let day = new Date(Date.UTC(2026, 0, 1));
    const end = Date.UTC(2026, 11, 31);
    let checked = 0;
    while (day.getTime() <= end) {
      const iso = day.toISOString().slice(0, 10);
      const matches = IATA_PERIODS.filter((p) => p.billingFrom <= iso && iso <= p.billingTo);
      expect(matches, `${iso} matched ${matches.length} periods`).toHaveLength(1);
      checked++;
      day = new Date(day.getTime() + 86_400_000);
    }
    expect(checked).toBe(365);
  });

  it('tolerates a full timestamp, not just a plain date', () => {
    expect(iataPeriodFor('2026-09-22T11:30:00.000Z')?.code).toBe('20260903W');
  });

  it('returns null outside the loaded calendar', () => {
    expect(iataPeriodFor('2025-12-31')).toBeNull();
    expect(iataPeriodFor('2027-01-01')).toBeNull();
    expect(iataPeriodFor(null)).toBeNull();
    expect(iataPeriodFor(undefined)).toBeNull();
    expect(iataPeriodFor('')).toBeNull();
  });
});

describe('iataPaymentDeadline', () => {
  it('gives the remittance day of the issuance date’s period', () => {
    expect(iataPaymentDeadline('2026-09-22')).toBe('2026-09-30');
    expect(iataPaymentDeadline('2026-01-01')).toBe('2026-01-14');
    expect(iataPaymentDeadline('2026-12-31')).toBe('2027-01-07');
  });

  it('is driven by when the EMD was ISSUED, not by any other date', () => {
    // Two EMDs a single day apart can sit in different settlements. This is
    // the whole point of the calendar and the easiest thing to get wrong.
    expect(iataPaymentDeadline('2026-09-23')).toBe('2026-09-30');
    expect(iataPaymentDeadline('2026-09-24')).toBe('2026-10-07');
  });

  it('never invents a date it was not given', () => {
    expect(iataPaymentDeadline('2027-02-01')).toBeNull();
    expect(iataPaymentDeadline(null)).toBeNull();
  });
});
