import { describe, expect, it } from 'vitest';
import {
  balanceTicketsFor,
  cancelledTickets,
  isRealIsoDate,
  svTicketIssuanceDeadline,
  validateTicketing,
  type TicketingInput,
} from './ticketing';

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

describe('cancelledTickets', () => {
  const base = {
    todayIso: '2026-09-19',
    ticketIssuanceDeadline: '2026-09-17',
    ticketsIssued: 35,
    balanceTickets: 15,
    pnrStatus: 'active',
  };

  it('reports the unissued balance once the deadline has passed', () => {
    expect(cancelledTickets(base)).toBe(15);
  });

  it('says nothing while the deadline is today or still ahead', () => {
    expect(cancelledTickets({ ...base, ticketIssuanceDeadline: '2026-09-19' })).toBeNull();
    expect(cancelledTickets({ ...base, ticketIssuanceDeadline: '2026-09-20' })).toBeNull();
  });

  it('says nothing when the whole booking was ticketed', () => {
    expect(cancelledTickets({ ...base, ticketsIssued: 50, balanceTickets: 0 })).toBeNull();
  });

  it('distinguishes "none recorded" from "none issued" — blank counts say nothing', () => {
    // All 1,483 legacy ticketing rows look like this: dates, no counts. Reading
    // blank as zero would declare every old booking wholly cancelled.
    expect(
      cancelledTickets({ ...base, ticketsIssued: null, balanceTickets: null })
    ).toBeNull();
    // Zero issued, explicitly recorded, IS an answer.
    expect(cancelledTickets({ ...base, ticketsIssued: 0, balanceTickets: 50 })).toBe(50);
  });

  it('says nothing without a recorded issuance deadline', () => {
    expect(cancelledTickets({ ...base, ticketIssuanceDeadline: null })).toBeNull();
  });

  it('says nothing on a booking that is no longer active', () => {
    expect(cancelledTickets({ ...base, pnrStatus: 'completed' })).toBeNull();
    expect(cancelledTickets({ ...base, pnrStatus: 'cancelled' })).toBeNull();
  });

  it('stops reporting as soon as the deadline is extended', () => {
    expect(cancelledTickets(base)).toBe(15);
    expect(cancelledTickets({ ...base, ticketIssuanceDeadline: '2026-10-01' })).toBeNull();
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
