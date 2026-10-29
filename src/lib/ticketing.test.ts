import { describe, expect, it } from 'vitest';
import {
  allTicketsAnswerOf,
  balanceTicketsFor,
  isRealIsoDate,
  penaltyEntryOpen,
  svUnissuedAllowance,
  ticketCountsFromAnswer,
  unissuedSeats,
  validatePenalty,
  svTicketIssuanceDeadline,
  ticketDeadlineError,
  validateTicketing,
  type TicketingInput,
} from './ticketing';
import { refundTiming } from './refunds';

describe('svTicketIssuanceDeadline', () => {
  it('is the outbound date minus 3 days for SV (72h policy, owner ruling 2026-09-17)', () => {
    expect(svTicketIssuanceDeadline('SV', '2026-11-20')).toBe('2026-11-17');
  });

  it('rolls back across month, year and leap-day boundaries', () => {
    expect(svTicketIssuanceDeadline('SV', '2026-11-01')).toBe('2026-10-29');
    expect(svTicketIssuanceDeadline('SV', '2027-01-02')).toBe('2026-12-30');
    expect(svTicketIssuanceDeadline('SV', '2028-03-01')).toBe('2028-02-27'); // 2028 is a leap year
    expect(svTicketIssuanceDeadline('SV', '2026-03-01')).toBe('2026-02-26');
  });

  it('accepts the code in any case or with stray spacing', () => {
    expect(svTicketIssuanceDeadline('sv', '2026-11-20')).toBe('2026-11-17');
    expect(svTicketIssuanceDeadline(' Sv ', '2026-11-20')).toBe('2026-11-17');
  });

  it('gives no suggestion for any other airline — only SV has a stored policy', () => {
    expect(svTicketIssuanceDeadline('PK', '2026-11-20')).toBeNull();
    expect(svTicketIssuanceDeadline('EK', '2026-11-20')).toBeNull();
    expect(svTicketIssuanceDeadline(null, '2026-11-20')).toBeNull();
    expect(svTicketIssuanceDeadline(undefined, '2026-11-20')).toBeNull();
  });

  it('gives no suggestion without a usable outbound date', () => {
    expect(svTicketIssuanceDeadline('SV', null)).toBeNull();
    expect(svTicketIssuanceDeadline('SV', undefined)).toBeNull();
    expect(svTicketIssuanceDeadline('SV', 'not-a-date')).toBeNull();
  });

  it('reads the date part of a full timestamp', () => {
    expect(svTicketIssuanceDeadline('SV', '2026-11-20T00:00:00.000Z')).toBe('2026-11-17');
  });
});

describe('isRealIsoDate', () => {
  it('rejects dates the calendar does not have', () => {
    // new Date('2026-02-30') does not throw — it rolls over to 2 March.
    expect(isRealIsoDate('2026-02-30')).toBe(false);
    expect(isRealIsoDate('2026-13-01')).toBe(false);
    expect(isRealIsoDate('2026-04-31')).toBe(false);
  });

  it('accepts real dates including leap days', () => {
    expect(isRealIsoDate('2026-02-28')).toBe(true);
    expect(isRealIsoDate('2028-02-29')).toBe(true);
  });

  it('rejects anything that is not YYYY-MM-DD', () => {
    expect(isRealIsoDate('20-11-2026')).toBe(false);
    expect(isRealIsoDate('')).toBe(false);
  });
});

const input = (over: Partial<TicketingInput> = {}): TicketingInput => ({
  nameUpdateDeadline: null,
  ticketIssuanceDeadline: null,
  status: null,
  ticketsIssued: null,
  balanceTickets: null,
  ...over,
});

describe('validateTicketing', () => {
  it('accepts an entirely empty form — every ticketing field is optional', () => {
    expect(validateTicketing(input())).toBeNull();
  });

  it('accepts real dates and whole non-negative counts', () => {
    expect(
      validateTicketing(
        input({
          nameUpdateDeadline: '2026-11-10',
          ticketIssuanceDeadline: '2026-11-17',
          status: 'partially issued',
          ticketsIssued: 12,
          balanceTickets: 0,
        })
      )
    ).toBeNull();
  });

  it('rejects an impossible date rather than letting it roll over', () => {
    expect(validateTicketing(input({ ticketIssuanceDeadline: '2026-02-30' }))?.error).toMatch(
      /Ticket issuance deadline/
    );
    expect(validateTicketing(input({ nameUpdateDeadline: '2026-13-01' }))?.error).toMatch(
      /Name update deadline/
    );
  });

  it('rejects negative, fractional and non-finite counts', () => {
    expect(validateTicketing(input({ ticketsIssued: -1 }))?.error).toMatch(/negative/);
    expect(validateTicketing(input({ balanceTickets: 2.5 }))?.error).toMatch(/whole number/);
    expect(validateTicketing(input({ ticketsIssued: Number.NaN }))?.error).toMatch(/must be a number/);
    expect(validateTicketing(input({ balanceTickets: Number.POSITIVE_INFINITY }))?.error).toMatch(
      /must be a number/
    );
  });

  it('rejects more tickets issued than the booking has seats (owner rule)', () => {
    expect(validateTicketing(input({ ticketsIssued: 41 }), 40)?.error).toMatch(
      /cannot exceed the 40 seats/
    );
    // Exactly the seat count is the whole booking ticketed — allowed.
    expect(validateTicketing(input({ ticketsIssued: 40, balanceTickets: 0 }), 40)).toBeNull();
  });

  it('rejects a balance larger than the seats, and a pair that adds up to more', () => {
    expect(validateTicketing(input({ balanceTickets: 41 }), 40)?.error).toMatch(
      /Balance tickets \(41\)/
    );
    expect(validateTicketing(input({ ticketsIssued: 30, balanceTickets: 20 }), 40)?.error).toMatch(
      /is 50, more than the 40 seats/
    );
  });

  it('allows issued + balance below the seat count (part-ticketed booking)', () => {
    expect(validateTicketing(input({ ticketsIssued: 10, balanceTickets: 30 }), 40)).toBeNull();
    expect(validateTicketing(input({ ticketsIssued: 10, balanceTickets: 0 }), 40)).toBeNull();
  });

  it('skips the seat comparison when the seat count is not supplied', () => {
    expect(validateTicketing(input({ ticketsIssued: 9999 }))).toBeNull();
  });
});

describe('ticketCountsFromAnswer — "All tickets issued?" (A8)', () => {
  it('not answered: both counts blank, never zero', () => {
    expect(ticketCountsFromAnswer(30, '', null)).toEqual({ ticketsIssued: null, balanceTickets: null });
    expect(ticketCountsFromAnswer(30, null, 5)).toEqual({ ticketsIssued: null, balanceTickets: null });
  });

  it('Yes: nothing remains and every seat is issued', () => {
    expect(ticketCountsFromAnswer(30, 'yes', null)).toEqual({ ticketsIssued: 30, balanceTickets: 0 });
  });

  it('No: the typed remaining count is stored, tickets issued is worked out', () => {
    expect(ticketCountsFromAnswer(30, 'no', 6)).toEqual({ ticketsIssued: 24, balanceTickets: 6 });
    // None issued at all is an answer too (Step 5's ticketing trigger reads it).
    expect(ticketCountsFromAnswer(30, 'no', 30)).toEqual({ ticketsIssued: 0, balanceTickets: 30 });
  });

  it('No needs a whole count from 1 to the seats', () => {
    expect(ticketCountsFromAnswer(30, 'no', null)).toHaveProperty('error');
    expect(ticketCountsFromAnswer(30, 'no', 0)).toEqual({ error: 'If no tickets remain, answer Yes — all tickets are issued.' });
    expect(ticketCountsFromAnswer(30, 'no', 31)).toHaveProperty('error');
    expect(ticketCountsFromAnswer(30, 'no', 2.5)).toHaveProperty('error');
    expect(ticketCountsFromAnswer(30, 'no', -1)).toHaveProperty('error');
  });

  it('refuses any other answer', () => {
    expect(ticketCountsFromAnswer(30, 'maybe', null)).toHaveProperty('error');
  });

  it('round-trips through the form', () => {
    expect(allTicketsAnswerOf(null)).toBe('');
    expect(allTicketsAnswerOf(0)).toBe('yes');
    expect(allTicketsAnswerOf(6)).toBe('no');
  });
});

describe('Yes → the paid EMDs go on "To be refunded" at once', () => {
  it('before the ticket deadline', () => {
    const counts = ticketCountsFromAnswer(30, 'yes', null) as { ticketsIssued: number };
    expect(
      refundTiming({ seats: 30, ticketsIssued: counts.ticketsIssued, ticketIssuanceDeadline: '2026-11-20', outboundDate: '2026-11-23', todayIso: '2026-10-28' })
    ).toEqual({ due: true, why: 'tickets-issued' });
  });

  it('a No with tickets remaining does not', () => {
    const counts = ticketCountsFromAnswer(30, 'no', 1) as { ticketsIssued: number };
    expect(
      refundTiming({ seats: 30, ticketsIssued: counts.ticketsIssued, ticketIssuanceDeadline: '2026-11-20', outboundDate: '2026-11-23', todayIso: '2026-10-28' }).due
    ).toBe(false);
  });
});

describe('svUnissuedAllowance — 10% rounded down (A9)', () => {
  it.each([
    [25, 2],
    [30, 3],
    [9, 0],
    [10, 1],
    [19, 1],
    [100, 10],
    [0, 0],
  ])('%i seats allow %i', (seats, allowed) => {
    expect(svUnissuedAllowance(seats)).toBe(allowed);
  });
});

describe('unissuedSeats — after ticketing closes (A9, A10)', () => {
  const sv = {
    airlineCode: 'SV',
    seats: 30,
    balanceTickets: 3,
    ticketIssuanceDeadline: '2026-10-20',
    outboundDate: '2026-10-23',
    todayIso: '2026-10-28',
    pnrStatus: 'active',
  };

  it('SV, 30 seats, 3 unissued: within the 10%, no penalty', () => {
    expect(unissuedSeats(sv)).toEqual({ unissued: 3, allowance: 3, overLimit: 0, penaltyCalledFor: false, isSv: true });
  });

  it('SV, 30 seats, 6 unissued: 3 beyond the limit, a penalty is called for', () => {
    expect(unissuedSeats({ ...sv, balanceTickets: 6 })).toEqual({
      unissued: 6,
      allowance: 3,
      overLimit: 3,
      penaltyCalledFor: true,
      isSv: true,
    });
  });

  it('another airline: any unissued seat calls for a penalty (PK, 1 unissued)', () => {
    expect(unissuedSeats({ ...sv, airlineCode: 'PK', balanceTickets: 1 })).toEqual({
      unissued: 1,
      allowance: 0,
      overLimit: 1,
      penaltyCalledFor: true,
      isSv: false,
    });
  });

  it('says nothing on or before the deadline day', () => {
    expect(unissuedSeats({ ...sv, balanceTickets: 6, todayIso: '2026-10-20' })).toBeNull();
    expect(unissuedSeats({ ...sv, balanceTickets: 6, todayIso: '2026-10-19' })).toBeNull();
  });

  it('a blank count is not zero issued — it says nothing', () => {
    expect(unissuedSeats({ ...sv, balanceTickets: null })).toBeNull();
  });

  it('says nothing once every ticket is issued, or on a booking not active', () => {
    expect(unissuedSeats({ ...sv, balanceTickets: 0 })).toBeNull();
    expect(unissuedSeats({ ...sv, balanceTickets: 6, pnrStatus: 'released' })).toBeNull();
  });

  it('with no ticket deadline, ticketing closes when the outbound date has passed', () => {
    const none = { ...sv, airlineCode: 'PK', ticketIssuanceDeadline: null, balanceTickets: 2 };
    expect(unissuedSeats({ ...none, todayIso: '2026-10-23' })).toBeNull();
    expect(unissuedSeats({ ...none, todayIso: '2026-10-24' })?.penaltyCalledFor).toBe(true);
  });
});

describe('penaltyEntryOpen — outbound passed AND a penalty called for (owner, 2026-10-28)', () => {
  const calledFor = { unissued: 6, allowance: 3, overLimit: 3, penaltyCalledFor: true, isSv: true };

  it('opens after the outbound date when the limit is passed', () => {
    expect(penaltyEntryOpen({ outboundDate: '2026-10-23', todayIso: '2026-10-24', unissued: calledFor })).toBe(true);
  });

  it('stays shut on the outbound day itself, and before it', () => {
    expect(penaltyEntryOpen({ outboundDate: '2026-10-24', todayIso: '2026-10-24', unissued: calledFor })).toBe(false);
  });

  it('stays shut within SV\'s 10%, or with nothing unissued', () => {
    expect(
      penaltyEntryOpen({ outboundDate: '2026-10-23', todayIso: '2026-10-28', unissued: { ...calledFor, unissued: 3, overLimit: 0, penaltyCalledFor: false } })
    ).toBe(false);
    expect(penaltyEntryOpen({ outboundDate: '2026-10-23', todayIso: '2026-10-28', unissued: null })).toBe(false);
  });
});

describe('validatePenalty', () => {
  it('blank means no penalty, and drops the license', () => {
    expect(validatePenalty('QFC', null, 'lic')).toEqual({ amount: null, licenseId: null });
  });

  it('an amount needs its penalty EMD license', () => {
    expect(validatePenalty('QFC', 50_000, null)).toEqual({ error: 'QFC: choose the license the penalty EMD was issued against.' });
    expect(validatePenalty('QFC', 50_000, 'lic')).toEqual({ amount: 50_000, licenseId: 'lic' });
  });

  it('accepts zero (a waived penalty) and paisa; refuses negative, NaN and fractions of a paisa', () => {
    expect(validatePenalty('Company', 0, 'lic')).toEqual({ amount: 0, licenseId: 'lic' });
    expect(validatePenalty('Company', 1234.56, 'lic')).toEqual({ amount: 1234.56, licenseId: 'lic' });
    expect(validatePenalty('Company', -1, 'lic')).toHaveProperty('error');
    expect(validatePenalty('Company', NaN, 'lic')).toHaveProperty('error');
    expect(validatePenalty('Company', 1.005, 'lic')).toHaveProperty('error');
  });
});

describe('balanceTicketsFor', () => {
  it('is the seats not yet ticketed', () => {
    expect(balanceTicketsFor(40, 15)).toBe(25);
    expect(balanceTicketsFor(40, 40)).toBe(0);
    expect(balanceTicketsFor(40, 0)).toBe(40);
  });

  it('never goes negative, even on a booking whose seats were reduced', () => {
    expect(balanceTicketsFor(40, 45)).toBe(0);
  });

  it('stays empty until tickets issued is a usable count', () => {
    expect(balanceTicketsFor(40, null)).toBeNull();
    expect(balanceTicketsFor(40, -2)).toBeNull();
    expect(balanceTicketsFor(40, 1.5)).toBeNull();
  });

  it('always agrees with the validator: a derived balance is never rejected', () => {
    for (const seats of [1, 5, 40, 99]) {
      for (const issued of [0, 1, Math.floor(seats / 2), seats]) {
        const balance = balanceTicketsFor(seats, issued);
        expect(validateTicketing(input({ ticketsIssued: issued, balanceTickets: balance }), seats)).toBeNull();
      }
    }
  });
});

// A6 (2026-10-13): every new booking has a ticket issuance deadline; owner,
// 2026-10-20: it may not be after the outbound departure date.
describe('ticketDeadlineError', () => {
  it('requires the deadline', () => {
    expect(ticketDeadlineError(null, '2026-11-15')).toMatch(/^The ticket issuance deadline is required\./);
  });

  it('refuses a date the calendar does not have', () => {
    expect(ticketDeadlineError('2026-02-30', '2026-11-15')).toBe('The ticket issuance deadline is not a valid date.');
  });

  it('refuses a deadline after departure; the departure day itself is allowed', () => {
    expect(ticketDeadlineError('2026-11-16', '2026-11-15')).toBe(
      'The ticket issuance deadline (2026-11-16) cannot be after the outbound departure date (2026-11-15).'
    );
    expect(ticketDeadlineError('2026-11-15', '2026-11-15')).toBeNull();
    expect(ticketDeadlineError('2026-11-12', '2026-11-15')).toBeNull();
  });

  it('accepts the SV policy date', () => {
    expect(ticketDeadlineError(svTicketIssuanceDeadline('SV', '2026-11-15'), '2026-11-15')).toBeNull();
  });

  it('checks only presence when the departure date is unknown', () => {
    expect(ticketDeadlineError('2026-11-12', null)).toBeNull();
  });
});
