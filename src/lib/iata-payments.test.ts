import { describe, expect, it } from 'vitest';
import {
  iataPaymentState,
  isIataPaymentDueForAlert,
  groupByRemittanceDay,
  IATA_PAYMENT_NOTICE_DAYS,
  validateIataPayment,
} from './iata-payments';

// Period 20260903W bills 16–23 Sep 2026 and settles on 30 Sep 2026.
const ISSUED = '2026-09-22';
const BILLING_TO = '2026-09-23';
const DUE = '2026-09-30';

const state = (o: Partial<Parameters<typeof iataPaymentState>[0]> = {}) =>
  iataPaymentState({
    issuanceDate: ISSUED,
    paymentDate: null,
    refundDate: null,
    roundStatus: 'issued',
    todayIso: ISSUED,
    ...o,
  });

describe('iataPaymentState — settled outcomes', () => {
  it('a recorded payment owes nothing', () => {
    const s = state({ paymentDate: '2026-09-29' });
    expect(s.status).toBe('paid');
    expect(s.owed).toBe(false);
    expect(s.paidOn).toBe('2026-09-29');
    expect(s.label).toContain('2026-09-29');
  });

  it('keeps showing the deadline after payment, so the date can still be checked', () => {
    expect(state({ paymentDate: '2026-09-29' }).deadline).toBe(DUE);
  });

  it('treats a refunded round that WAS paid as paid, not as rolled', () => {
    // Payment first, refund afterwards: real money went out and came back.
    const s = state({ roundStatus: 'refunded', paymentDate: '2026-09-29' });
    expect(s.status).toBe('paid');
    expect(s.owed).toBe(false);
  });

  it('is overdue even when long past, if it was never paid or refunded', () => {
    const s = state({ todayIso: '2026-12-01' });
    expect(s.status).toBe('overdue');
    expect(s.owed).toBe(true);
  });
});

// The rule the owner corrected on 2026-09-22: a refund cancels the billing only
// if it lands inside the BILLING window, not merely before the remittance day.
// Getting this wrong writes off a bill the company still has to pay, so each
// side of the boundary is pinned down.
describe('iataPaymentState — refunding to roll the bill a cycle', () => {
  it('a refund inside the billing window cancels the bill', () => {
    // The owner's worked example: issued 20 Sep, cannot pay by 30 Sep, so
    // refund on or before 23 Sep and re-issue on the 24th.
    const s = state({
      issuanceDate: '2026-09-20',
      roundStatus: 'refunded',
      refundDate: '2026-09-22',
    });
    expect(s.status).toBe('rolled');
    expect(s.owed).toBe(false);
    expect(s.label).toContain('replaced it');
  });

  it('accepts a refund ON the billing-to date — the boundary is inclusive', () => {
    const s = state({ roundStatus: 'refunded', refundDate: BILLING_TO });
    expect(s.status).toBe('rolled');
    expect(s.owed).toBe(false);
  });

  it('a refund ONE DAY after the window closes does NOT cancel the bill', () => {
    // 24 Sep is already the next billing period. The EMD was billed in
    // 20260903W and still falls due on 30 Sep; the refund is a separate credit.
    const s = state({ roundStatus: 'refunded', refundDate: '2026-09-24' });
    expect(s.owed).toBe(true);
    expect(s.status).toBe('scheduled');
    expect(s.deadline).toBe(DUE);
    expect(s.lateRefund).toBe('after-billing');
    expect(s.label).toContain('after its billing window closed');
  });

  it('a refund before the remittance day but after the window is still owed', () => {
    // This is exactly the case an earlier version of this file got wrong: it
    // used the remittance day as the cut-off and would have written the bill off.
    const s = state({ roundStatus: 'refunded', refundDate: '2026-09-28' });
    expect(s.owed).toBe(true);
    expect(s.deadline).toBe(DUE);
  });

  it('will not treat a refund with no recorded date as cancelled', () => {
    const s = state({ roundStatus: 'refunded', refundDate: null });
    expect(s.owed).toBe(true);
    expect(s.lateRefund).toBe('date-unknown');
    expect(s.label).toContain('no date recorded');
  });

  it('a paid round is settled however late its refund was', () => {
    const s = state({
      roundStatus: 'refunded',
      refundDate: '2026-10-15',
      paymentDate: '2026-09-30',
    });
    expect(s.status).toBe('paid');
    expect(s.owed).toBe(false);
  });

  it('names the day by which a refund could still roll the bill', () => {
    expect(state().rollBy).toBe(BILLING_TO);
    expect(state({ todayIso: BILLING_TO }).rollBy).toBe(BILLING_TO);
  });

  it('stops offering the roll once the billing window has closed', () => {
    // Past the window the choice no longer exists, and showing a date that
    // cannot be acted on would invite someone to try.
    expect(state({ todayIso: '2026-09-24' }).rollBy).toBeNull();
    expect(state({ todayIso: '2026-09-29' }).rollBy).toBeNull();
  });

  it('offers no roll on something already settled', () => {
    expect(state({ paymentDate: '2026-09-22' }).rollBy).toBeNull();
    expect(state({ roundStatus: 'refunded', refundDate: BILLING_TO }).rollBy).toBeNull();
  });

  it('moves the bill exactly one cycle when re-issued after the window', () => {
    // The whole point of the manoeuvre, end to end.
    const original = state({ issuanceDate: '2026-09-20' });
    const reissued = state({ issuanceDate: '2026-09-24' });
    expect(original.deadline).toBe('2026-09-30');
    expect(reissued.deadline).toBe('2026-10-07');
    expect(reissued.period?.code).toBe('20260904W');
  });
});

describe('iataPaymentState — the countdown', () => {
  it('is scheduled while the remittance day is far off', () => {
    const s = state();
    expect(s.status).toBe('scheduled');
    expect(s.deadline).toBe(DUE);
    expect(s.daysLeft).toBe(8);
    expect(s.urgency).toBe('green');
    expect(s.owed).toBe(true);
  });

  it('turns amber inside five days, still without being urgent', () => {
    expect(state({ todayIso: '2026-09-26' }).urgency).toBe('amber');
    expect(state({ todayIso: '2026-09-26' }).status).toBe('scheduled');
  });

  it('turns red inside the notice window', () => {
    const s = state({ todayIso: '2026-09-28' });
    expect(s.status).toBe('due-soon');
    expect(s.daysLeft).toBe(IATA_PAYMENT_NOTICE_DAYS);
    expect(s.urgency).toBe('red');
    expect(s.label).toContain('2 days');
  });

  it('says "today" on the remittance day, not "overdue"', () => {
    const s = state({ todayIso: DUE });
    expect(s.status).toBe('due-today');
    expect(s.daysLeft).toBe(0);
    expect(s.label).toContain('today');
  });

  it('counts the days late once the day has passed', () => {
    const s = state({ todayIso: '2026-10-03' });
    expect(s.status).toBe('overdue');
    expect(s.daysLeft).toBe(-3);
    expect(s.urgency).toBe('red');
    expect(s.label).toContain('3 days');
  });

  it('says "1 day" and not "1 days"', () => {
    expect(state({ todayIso: '2026-09-29' }).label).toContain('in 1 day (');
    expect(state({ todayIso: '2026-10-01' }).label).toContain('by 1 day ');
  });

  it('carries the IATA period code so a date can be traced to the PDF', () => {
    expect(state().period?.code).toBe('20260903W');
  });
});

describe('iataPaymentState — outside the calendar', () => {
  it('is owed but undated when the calendar does not reach the issuance date', () => {
    const s = state({ issuanceDate: '2027-05-01', todayIso: '2027-05-01' });
    expect(s.status).toBe('unknown');
    expect(s.owed).toBe(true);
    expect(s.deadline).toBeNull();
    // Never green: an unknown date is a gap to close, not a settled debt.
    expect(s.urgency).toBe('amber');
  });

  it('a paid round outside the calendar is still settled', () => {
    const s = state({ issuanceDate: '2027-05-01', paymentDate: '2027-05-10' });
    expect(s.status).toBe('paid');
    expect(s.owed).toBe(false);
  });
});

describe('isIataPaymentDueForAlert', () => {
  it('emails inside the window', () => {
    expect(isIataPaymentDueForAlert(state({ todayIso: '2026-09-28' }), '2026-09-28')).toBe(true);
    expect(isIataPaymentDueForAlert(state({ todayIso: DUE }), DUE)).toBe(true);
  });

  it('stays quiet further out', () => {
    expect(isIataPaymentDueForAlert(state({ todayIso: '2026-09-27' }), '2026-09-27')).toBe(false);
  });

  it('never emails an overdue payment — it stays on the dashboard only', () => {
    // Owner rule, 2026-08-25: alerts are future-only, so the daily email does
    // not nag about something already late.
    const s = state({ todayIso: '2026-10-05' });
    expect(s.status).toBe('overdue');
    expect(isIataPaymentDueForAlert(s, '2026-10-05')).toBe(false);
  });

  it('never emails what is not owed', () => {
    expect(isIataPaymentDueForAlert(state({ paymentDate: '2026-09-29' }), '2026-09-28')).toBe(false);
    expect(
      isIataPaymentDueForAlert(
        state({ roundStatus: 'refunded', refundDate: BILLING_TO }),
        '2026-09-28'
      )
    ).toBe(false);
  });

  it('DOES email a refunded round whose refund missed its billing window', () => {
    const s = state({ roundStatus: 'refunded', refundDate: '2026-09-26', todayIso: '2026-09-28' });
    expect(s.owed).toBe(true);
    expect(isIataPaymentDueForAlert(s, '2026-09-28')).toBe(true);
  });

  it('never emails a payment with no known date', () => {
    const s = state({ issuanceDate: '2027-05-01' });
    expect(s.owed).toBe(true);
    expect(isIataPaymentDueForAlert(s, '2027-05-01')).toBe(false);
  });
});

describe('groupByRemittanceDay', () => {
  const read = (r: { due: string | null; code: string | null; amt: number }) => ({
    deadline: r.due,
    periodCode: r.code,
    amount: r.amt,
  });

  it('collects everything settling on one day into one payment', () => {
    const groups = groupByRemittanceDay(
      [
        { due: '2026-09-30', code: '20260903W', amt: 937_500 },
        { due: '2026-10-07', code: '20260904W', amt: 100_000 },
        { due: '2026-09-30', code: '20260903W', amt: 1_035_000 },
      ],
      read,
      '2026-09-22'
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].remittanceDay).toBe('2026-09-30');
    expect(groups[0].items).toHaveLength(2);
    expect(groups[0].total).toBe(1_972_500);
    expect(groups[0].daysLeft).toBe(8);
    expect(groups[0].overdue).toBe(false);
  });

  it('orders by remittance day, earliest first', () => {
    const groups = groupByRemittanceDay(
      [
        { due: '2026-12-07', code: 'c', amt: 1 },
        { due: '2026-09-30', code: 'a', amt: 1 },
        { due: '2026-10-22', code: 'b', amt: 1 },
      ],
      read,
      '2026-09-22'
    );
    expect(groups.map((g) => g.remittanceDay)).toEqual([
      '2026-09-30',
      '2026-10-22',
      '2026-12-07',
    ]);
  });

  it('adds money in whole paisa so the group total re-adds exactly', () => {
    // 0.1 + 0.2 is 0.30000000000000004 in plain floating point; three of these
    // drifting is a settlement figure that does not match the bank.
    const groups = groupByRemittanceDay(
      [
        { due: DUE, code: 'x', amt: 0.1 },
        { due: DUE, code: 'x', amt: 0.2 },
        { due: DUE, code: 'x', amt: 0.3 },
      ],
      read,
      ISSUED
    );
    expect(groups[0].total).toBe(0.6);
  });

  it('lists every period settling on the same day, de-duplicated and sorted', () => {
    const groups = groupByRemittanceDay(
      [
        { due: DUE, code: '20260903W', amt: 1 },
        { due: DUE, code: '20260903W', amt: 1 },
        { due: DUE, code: '20260902W', amt: 1 },
      ],
      read,
      ISSUED
    );
    expect(groups[0].periodCodes).toEqual(['20260902W', '20260903W']);
  });

  it('drops items with no known remittance day rather than inventing a group', () => {
    const groups = groupByRemittanceDay(
      [
        { due: null, code: null, amt: 500 },
        { due: DUE, code: '20260903W', amt: 100 },
      ],
      read,
      ISSUED
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].total).toBe(100);
  });

  it('marks a group whose day has passed as overdue', () => {
    const groups = groupByRemittanceDay(
      [{ due: '2026-09-30', code: '20260903W', amt: 1 }],
      read,
      '2026-10-02'
    );
    expect(groups[0].overdue).toBe(true);
    expect(groups[0].daysLeft).toBe(-2);
  });

  it('returns nothing for an empty list', () => {
    expect(groupByRemittanceDay([], read, ISSUED)).toEqual([]);
  });
});

describe('validateIataPayment', () => {
  const ok = (r: ReturnType<typeof validateIataPayment>) =>
    'date' in r ? r.date.toISOString().slice(0, 10) : `ERROR: ${r.error}`;

  it('accepts a real date on or after issuance and not in the future', () => {
    expect(ok(validateIataPayment('2026-09-30', ISSUED, '2026-10-01'))).toBe('2026-09-30');
    expect(ok(validateIataPayment(ISSUED, ISSUED, '2026-10-01'))).toBe(ISSUED);
  });

  it('refuses a missing or malformed date', () => {
    expect(validateIataPayment(null, ISSUED, ISSUED)).toHaveProperty('error');
    expect(validateIataPayment('30-09-2026', ISSUED, ISSUED)).toHaveProperty('error');
  });

  it('refuses a date that does not exist', () => {
    // Rolls into March rather than throwing, which is why it is checked.
    const r = validateIataPayment('2026-02-30', null, '2026-12-01');
    expect(r).toHaveProperty('error');
  });

  it('refuses a future date', () => {
    const r = validateIataPayment('2026-10-05', ISSUED, '2026-10-01');
    expect('error' in r && r.error).toContain('future');
  });

  it('refuses a payment made before the EMD existed', () => {
    const r = validateIataPayment('2026-09-01', ISSUED, '2026-10-01');
    expect('error' in r && r.error).toContain('issued on 2026-09-22');
  });

  it('allows any past date when the issuance date is unknown', () => {
    expect(ok(validateIataPayment('2026-01-05', null, '2026-10-01'))).toBe('2026-01-05');
  });
});
