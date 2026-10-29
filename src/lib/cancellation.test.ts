import { describe, expect, it } from 'vitest';
import {
  CANCELLATION_FLAGS_FROM,
  cancelBlocker,
  cancellationFlag,
  cancelledAgentMoney,
  distinctEmds,
  emd2Deadline,
  FORFEITED_FROM_STATUSES,
  MAX_CANCEL_REASON,
  validatePayback,
  type FlagRound,
} from './cancellation';
import { emdHeldByAirline } from './agent-dues';

const round = (over: Partial<FlagRound>): FlagRound => ({
  roundNumber: 1,
  status: 'issued',
  paymentPct: 15,
  deadlineDate: '2026-11-20',
  issuanceDate: '2026-11-02',
  paymentDate: null,
  refundDate: null,
  ...over,
});

const base = {
  status: 'active',
  createdOnIso: '2026-10-29',
  seats: 30,
  rounds: [round({})],
  ticketIssuanceDeadline: '2026-12-10',
  balanceTickets: null as number | null,
  todayIso: '2026-11-21',
};

describe('cancellationFlag — EMD-2 trigger', () => {
  it('flags once the deadline recorded on EMD-1 has passed with no EMD-2', () => {
    expect(cancellationFlag(base)).toEqual({ trigger: 'emd2', deadline: '2026-11-20' });
  });

  it('not on the deadline day itself', () => {
    expect(cancellationFlag({ ...base, todayIso: '2026-11-20' })).toBeNull();
  });

  it('not once EMD-2 is issued', () => {
    expect(cancellationFlag({ ...base, rounds: [round({}), round({ roundNumber: 2, paymentPct: 85, deadlineDate: null })] })).toBeNull();
  });

  it('never when EMD-1 covers 100%', () => {
    expect(cancellationFlag({ ...base, rounds: [round({ paymentPct: 100 })] })).toBeNull();
  });

  it('not without a deadline on EMD-1, and not before any EMD (that is release)', () => {
    expect(cancellationFlag({ ...base, rounds: [round({ deadlineDate: null })] })).toBeNull();
    expect(cancellationFlag({ ...base, rounds: [] })).toBeNull();
  });
});

describe('cancellationFlag — only new bookings (owner, 2026-10-28)', () => {
  it('a booking created before the cut-off is never flagged', () => {
    expect(CANCELLATION_FLAGS_FROM).toBe('2026-10-29');
    expect(cancellationFlag({ ...base, createdOnIso: '2026-10-28' })).toBeNull();
    expect(cancellationFlag({ ...base, createdOnIso: '2026-10-29' })).not.toBeNull();
  });

  it('only an active booking', () => {
    expect(cancellationFlag({ ...base, status: 'cancelled' })).toBeNull();
    expect(cancellationFlag({ ...base, status: 'released' })).toBeNull();
  });
});

describe('a rolled round and its re-issue are one EMD (owner, 2026-10-28)', () => {
  // EMD-1 issued 2 Nov (bills 1–7 Nov), refunded 5 Nov to roll the bill, and
  // re-issued 8 Nov at the same 15%: still only EMD-1.
  const rolled = round({ status: 'refunded', refundDate: '2026-11-05' });
  const reissue = round({ roundNumber: 2, issuanceDate: '2026-11-08', deadlineDate: null });

  it('counts them once', () => {
    expect(distinctEmds([rolled, reissue], '2026-11-21').map((r) => r.roundNumber)).toEqual([2]);
  });

  it('round 2 is not mistaken for EMD-2: the EMD-2 flag still fires', () => {
    expect(cancellationFlag({ ...base, rounds: [rolled, reissue] })).toEqual({ trigger: 'emd2', deadline: '2026-11-20' });
  });

  it('the re-issue’s own deadline wins when it has one', () => {
    expect(emd2Deadline([rolled, { ...reissue, deadlineDate: '2026-11-25' }], '2026-11-21')).toBe('2026-11-25');
  });

  it('a refund after the billing window is a real refund and still counts as issued', () => {
    const late = round({ status: 'refunded', refundDate: '2026-11-10' });
    expect(distinctEmds([late, reissue], '2026-11-21')).toHaveLength(2);
  });
});

describe('cancellationFlag — ticketing trigger', () => {
  const both = [round({}), round({ roundNumber: 2, paymentPct: 85, deadlineDate: null })];
  const t = { ...base, rounds: both, ticketIssuanceDeadline: '2026-12-10', todayIso: '2026-12-11' };

  it('flags when staff recorded that no tickets were issued, after the deadline', () => {
    expect(cancellationFlag({ ...t, balanceTickets: 30 })).toEqual({ trigger: 'ticketing', deadline: '2026-12-10' });
  });

  it('a blank count never flags, nor does partial ticketing', () => {
    expect(cancellationFlag({ ...t, balanceTickets: null })).toBeNull();
    expect(cancellationFlag({ ...t, balanceTickets: 29 })).toBeNull();
    expect(cancellationFlag({ ...t, balanceTickets: 0 })).toBeNull();
  });

  it('not on the deadline day', () => {
    expect(cancellationFlag({ ...t, balanceTickets: 30, todayIso: '2026-12-10' })).toBeNull();
  });

  it('applies when EMD-1 covered 100% (owner, 2026-10-28)', () => {
    expect(cancellationFlag({ ...t, rounds: [round({ paymentPct: 100 })], balanceTickets: 30 })?.trigger).toBe('ticketing');
  });
});

describe('cancelBlocker', () => {
  const flag = { trigger: 'emd2' as const, deadline: '2026-11-20' };

  it('cancels a flagged active booking with a reason', () => {
    expect(cancelBlocker({ status: 'active', flag, reason: 'Airline confirmed it' })).toBeNull();
  });

  it('only a flagged booking — there is no other manual cancellation', () => {
    expect(cancelBlocker({ status: 'active', flag: null, reason: 'x' })).toMatch(/not flagged/);
  });

  it('needs a reason, and not an endless one', () => {
    expect(cancelBlocker({ status: 'active', flag, reason: '  ' })).toMatch(/reason is required/);
    expect(cancelBlocker({ status: 'active', flag, reason: 'x'.repeat(MAX_CANCEL_REASON + 1) })).toMatch(/at most/);
  });

  it('once only, and never a booking that is not active', () => {
    expect(cancelBlocker({ status: 'cancelled', flag, reason: 'x' })).toBe('This booking is already cancelled.');
    expect(cancelBlocker({ status: 'completed', flag, reason: 'x' })).toMatch(/Only an active booking/);
  });
});

describe('forfeiture', () => {
  it('forfeits every round still held: issued and refund requested', () => {
    expect(FORFEITED_FROM_STATUSES).toEqual(['issued', 'refund_requested']);
  });

  it('forfeited rounds stay out of the held totals until refunded', () => {
    const rounds = [
      { roundNumber: 1, status: 'forfeited', emdAmount: 450_000, deadlineDate: null },
      { roundNumber: 2, status: 'forfeited', emdAmount: 2_550_000, deadlineDate: null },
    ];
    expect(emdHeldByAirline(rounds)).toBe(0);
  });
});

describe('cancelledAgentMoney — penalty and payback', () => {
  it('paid 200,000 with a 50,000 penalty: owed 150,000 back', () => {
    expect(cancelledAgentMoney({ recoveries: [120_000, 80_000], penalty: 50_000, paybacks: [] })).toEqual({
      paid: 200_000,
      penalty: 50_000,
      penaltyEntered: true,
      paidBack: 0,
      owes: 0,
      toPayBack: 150_000,
    });
  });

  it('paid nothing and no penalty: owes nothing more', () => {
    const m = cancelledAgentMoney({ recoveries: [], penalty: 0, paybacks: [] });
    expect(m.owes).toBe(0);
    expect(m.toPayBack).toBe(0);
  });

  it('paid less than the penalty: owes the difference (owner, 2026-10-28)', () => {
    expect(cancelledAgentMoney({ recoveries: [20_000], penalty: 50_000, paybacks: [] }).owes).toBe(30_000);
    expect(cancelledAgentMoney({ recoveries: [], penalty: 50_000, paybacks: [] }).owes).toBe(50_000);
  });

  it('recording the payback brings what is owed back to zero', () => {
    const m = cancelledAgentMoney({ recoveries: [200_000], penalty: 50_000, paybacks: [100_000, 50_000] });
    expect(m.paidBack).toBe(150_000);
    expect(m.toPayBack).toBe(0);
    expect(m.owes).toBe(0);
  });

  it('nothing is paid back while the penalty is blank — blank is not zero', () => {
    const m = cancelledAgentMoney({ recoveries: [200_000], penalty: null, paybacks: [] });
    expect(m.penaltyEntered).toBe(false);
    expect(m.toPayBack).toBe(0);
  });
});

describe('validatePayback', () => {
  const money = cancelledAgentMoney({ recoveries: [200_000], penalty: 50_000, paybacks: [] });
  const today = '2026-12-01';

  it('accepts a payback up to what is owed back, in parts', () => {
    expect(validatePayback(150_000, '2026-12-01', today, money)).toEqual({ date: new Date('2026-12-01T00:00:00.000Z') });
    expect(validatePayback(100_000, '2026-11-30', today, money)).toHaveProperty('date');
  });

  it('never more than is owed back (owner, 2026-10-28)', () => {
    expect(validatePayback(150_000.01, '2026-12-01', today, money)).toHaveProperty('error');
  });

  it('refuses zero, negative, NaN, fractions of a paisa, bad and future dates', () => {
    expect(validatePayback(0, '2026-12-01', today, money)).toHaveProperty('error');
    expect(validatePayback(-5, '2026-12-01', today, money)).toHaveProperty('error');
    expect(validatePayback(NaN, '2026-12-01', today, money)).toHaveProperty('error');
    expect(validatePayback(10.005, '2026-12-01', today, money)).toHaveProperty('error');
    expect(validatePayback(100, '2026-02-30', today, money)).toHaveProperty('error');
    expect(validatePayback(100, null, today, money)).toHaveProperty('error');
    expect(validatePayback(100, '2026-12-02', today, money)).toHaveProperty('error');
  });

  it('refuses while the penalty is not entered', () => {
    const blank = cancelledAgentMoney({ recoveries: [200_000], penalty: null, paybacks: [] });
    expect(validatePayback(100, '2026-12-01', today, blank)).toHaveProperty('error');
  });
});
