import { describe, expect, it } from 'vitest';
import { refundRequestBlocker, refundTiming, roundStatusEdit, validateRefund } from './refunds';

const OK = '2026-09-07';

describe('validateRefund — amount', () => {
  it('accepts a normal amount and returns the parsed date', () => {
    const r = validateRefund(1_500_000, OK, 'issued');
    expect(r).toEqual({ date: new Date('2026-09-07T00:00:00.000Z') });
  });

  it('accepts zero (a recorded refund of nothing is not our call to reject)', () => {
    expect(validateRefund(0, OK, 'issued')).toHaveProperty('date');
  });

  it('rejects a negative amount', () => {
    expect(validateRefund(-1, OK, 'issued')).toEqual({
      error: 'Refund amount cannot be negative.',
    });
  });

  it('rejects NaN — Number("abc") reaches here as NaN, not null', () => {
    expect(validateRefund(Number('abc'), OK, 'issued')).toEqual({
      error: 'Refund amount must be a number.',
    });
  });

  it('rejects Infinity', () => {
    expect(validateRefund(Infinity, OK, 'issued')).toEqual({
      error: 'Refund amount must be a number.',
    });
  });

  it('rejects a missing amount', () => {
    expect(validateRefund(null, OK, 'issued')).toEqual({
      error: 'Refund amount must be a number.',
    });
  });

  it('does NOT reject an amount larger than the EMD (owner has not ruled; live data has one)', () => {
    expect(validateRefund(99_999_999, OK, 'issued')).toHaveProperty('date');
  });
});

describe('validateRefund — date', () => {
  it('rejects a missing date', () => {
    expect(validateRefund(100, null, 'issued')).toHaveProperty('error');
  });

  it('rejects free text that new Date() would turn into Invalid Date', () => {
    expect(validateRefund(100, 'garbage', 'issued')).toHaveProperty('error');
  });

  it('rejects a non-ISO format rather than guessing day/month order', () => {
    expect(validateRefund(100, '07/09/2026', 'issued')).toHaveProperty('error');
  });

  it('rejects an impossible day instead of silently rolling it over', () => {
    // new Date('2026-02-30') does not throw — it becomes 2026-03-02.
    expect(validateRefund(100, '2026-02-30', 'issued')).toEqual({
      error: 'Refund date "2026-02-30" is not a real date.',
    });
  });

  it('accepts a real leap day', () => {
    expect(validateRefund(100, '2028-02-29', 'issued')).toHaveProperty('date');
  });

  it('parses at UTC midnight, matching how every other date is stored', () => {
    const r = validateRefund(100, '2026-12-31', 'issued');
    expect('date' in r && r.date.toISOString()).toBe('2026-12-31T00:00:00.000Z');
  });
});

describe('validateRefund — status', () => {
  it('refuses to refund a round that is already refunded', () => {
    expect(validateRefund(100, OK, 'refunded')).toEqual({
      error: 'This round is already refunded. Edit the round instead of refunding it again.',
    });
  });

  // Head Office records the refund from issued or requested (Phase 9 Step 3, A1).
  it.each(['issued', 'refund_requested'])('allows a round with status %s', (status) => {
    expect(validateRefund(100, OK, status)).toHaveProperty('date');
  });

  it.each(['paid', 'expired'])('refuses a round with status %s', (status) => {
    expect(validateRefund(100, OK, status)).toHaveProperty('error');
  });

  it('a forfeited round only once the penalty is paid (Phase 9 Step 5)', () => {
    expect(validateRefund(100, OK, 'forfeited')).toHaveProperty('error');
    expect(validateRefund(100, OK, 'forfeited', undefined, false)).toHaveProperty('error');
    expect(validateRefund(100, OK, 'forfeited', undefined, true)).toHaveProperty('date');
  });
});

describe('refundTiming — when paid EMDs go on "To be refunded" (A6)', () => {
  const base = { seats: 30, ticketsIssued: null, ticketIssuanceDeadline: '2026-11-10', outboundDate: '2026-11-13', todayIso: '2026-11-10' };

  it('stays on the dashboard through the ticket deadline day itself', () => {
    expect(refundTiming(base)).toEqual({ due: false, missingTicketDeadline: false });
  });

  it('is due the day after the ticket deadline', () => {
    expect(refundTiming({ ...base, todayIso: '2026-11-11' })).toEqual({ due: true, why: 'ticket-deadline' });
  });

  it('is due at once when every ticket is issued, before the deadline', () => {
    expect(refundTiming({ ...base, todayIso: '2026-10-28', ticketsIssued: 30 })).toEqual({ due: true, why: 'tickets-issued' });
  });

  it('a partly ticketed or unanswered count does not make it due', () => {
    expect(refundTiming({ ...base, todayIso: '2026-10-28', ticketsIssued: 29 }).due).toBe(false);
    expect(refundTiming({ ...base, todayIso: '2026-10-28', ticketsIssued: 0 }).due).toBe(false);
    expect(refundTiming({ ...base, todayIso: '2026-10-28', ticketsIssued: null }).due).toBe(false);
  });

  it('a booking with no seats is never "all ticketed"', () => {
    expect(refundTiming({ ...base, seats: 0, ticketsIssued: 0, todayIso: '2026-10-28' }).due).toBe(false);
  });

  it('with no ticket deadline: flagged until the outbound date passes, then due (owner, 2026-10-28)', () => {
    const none = { ...base, ticketIssuanceDeadline: null };
    expect(refundTiming({ ...none, todayIso: '2026-11-13' })).toEqual({ due: false, missingTicketDeadline: true });
    expect(refundTiming({ ...none, todayIso: '2026-11-14' })).toEqual({ due: true, why: 'outbound-passed' });
  });

  it('with neither a ticket deadline nor an outbound date, stays flagged', () => {
    expect(refundTiming({ ...base, ticketIssuanceDeadline: null, outboundDate: null, todayIso: '2027-01-01' })).toEqual({
      due: false,
      missingTicketDeadline: true,
    });
  });
});

describe('refundRequestBlocker — only rounds on "To be refunded"', () => {
  const due = { due: true, why: 'ticket-deadline' } as const;

  it('allows an issued, paid round whose refund is due', () => {
    expect(refundRequestBlocker({ roundStatus: 'issued', paidToIata: true, timing: due })).toBeNull();
  });

  it('refuses a round not paid to IATA', () => {
    expect(refundRequestBlocker({ roundStatus: 'issued', paidToIata: false, timing: due })).toMatch(/not paid to IATA/);
  });

  it('refuses before the ticket deadline has passed', () => {
    expect(
      refundRequestBlocker({ roundStatus: 'issued', paidToIata: true, timing: { due: false, missingTicketDeadline: false } })
    ).toMatch(/has not passed/);
    expect(
      refundRequestBlocker({ roundStatus: 'issued', paidToIata: true, timing: { due: false, missingTicketDeadline: true } })
    ).toMatch(/no ticket issuance deadline/);
  });

  it('refuses a round already requested or refunded', () => {
    expect(refundRequestBlocker({ roundStatus: 'refund_requested', paidToIata: true, timing: due })).toMatch(/already been requested/);
    expect(refundRequestBlocker({ roundStatus: 'refunded', paidToIata: true, timing: due })).toMatch(/cannot have a refund requested/);
  });
});

describe('roundStatusEdit — the Edit round form', () => {
  it('never moves a requested round back to issued (A1)', () => {
    expect(roundStatusEdit('refund_requested', 'issued')).toEqual({
      error: 'A round whose refund has been requested cannot go back to issued.',
    });
  });

  it('does not request a refund; that has its own action', () => {
    expect(roundStatusEdit('issued', 'refund_requested')).toHaveProperty('error');
  });

  it('keeps an unchanged status, and the issued/refunded moves it always allowed', () => {
    expect(roundStatusEdit('refund_requested', 'refund_requested')).toEqual({ status: 'refund_requested' });
    expect(roundStatusEdit('refund_requested', 'refunded')).toEqual({ status: 'refunded' });
    expect(roundStatusEdit('issued', 'refunded')).toEqual({ status: 'refunded' });
    expect(roundStatusEdit('refunded', 'issued')).toEqual({ status: 'issued' });
  });

  it('forfeited is set only by cancelling, and left only by a recorded refund', () => {
    expect(roundStatusEdit('issued', 'forfeited')).toHaveProperty('error');
    expect(roundStatusEdit('forfeited', 'issued')).toHaveProperty('error');
    expect(roundStatusEdit('forfeited', 'refunded')).toHaveProperty('error');
    expect(roundStatusEdit('forfeited', 'forfeited')).toEqual({ status: 'forfeited' });
  });

  it('refuses a status that does not exist', () => {
    expect(roundStatusEdit('issued', 'paid')).toHaveProperty('error');
  });
});

describe('validateRefund — a refund may not exceed its EMD amount (owner ruling, 2026-09-20)', () => {
  it('accepts a refund equal to the round amount', () => {
    expect(validateRefund(500_000, '2026-09-20', 'issued', 500_000)).toEqual({
      date: new Date('2026-09-20T00:00:00.000Z'),
    });
  });

  it('accepts a partial refund', () => {
    expect('error' in validateRefund(100_000, '2026-09-20', 'issued', 500_000)).toBe(false);
  });

  it('rejects a refund larger than the round amount, naming both figures', () => {
    const r = validateRefund(500_001, '2026-09-20', 'issued', 500_000);
    expect('error' in r && r.error).toMatch(/more than the round's EMD amount/);
    expect('error' in r && r.error).toMatch(/500,001/);
    expect('error' in r && r.error).toMatch(/500,000/);
  });

  it('still checks everything else first — an impossible date is caught before the cap', () => {
    const r = validateRefund(999_999, '2026-02-30', 'issued', 1_000);
    expect('error' in r && r.error).toMatch(/not a real date/);
  });

  it('skips the cap when the round amount is not supplied', () => {
    // Kept deliberately optional so a caller without the amount cannot have the
    // check silently pass against `undefined`.
    expect('error' in validateRefund(999_999, '2026-09-20', 'issued')).toBe(false);
  });
});
