import { describe, expect, it } from 'vitest';
import { splitRemovable, splitSeats, splittableSeats, suggestedSplitDeadline, ticketParts, validateSplitDraft, lastOutbound } from './splits';
import { partsRefundTiming } from './refunds';
import { unissuedAcross } from './ticketing';
import { cancellationFlag } from './cancellation';
import { duesForAssignment } from './agent-dues';

const booking = {
  status: 'active',
  airlineCode: 'SV',
  tripType: 'round_trip',
  outboundDate: '2026-12-01',
  inboundDate: '2026-12-15',
  pnrCode: 'ABC123',
};
const draft = {
  seats: 15,
  pnrCode: null,
  outboundDate: '2026-12-01',
  inboundDate: '2026-12-22',
  ticketIssuanceDeadline: '2026-11-28',
};

describe('validateSplitDraft (Phase 9 Step 6)', () => {
  it('accepts 15 of a holder’s seats on a later return, with no new PNR code', () => {
    expect(validateSplitDraft(draft, booking, 15)).toEqual({
      seats: 15,
      pnrCode: null,
      outboundDate: '2026-12-01',
      inboundDate: '2026-12-22',
      ticketIssuanceDeadline: '2026-11-28',
    });
  });

  it('SV only', () => {
    expect(validateSplitDraft(draft, { ...booking, airlineCode: 'PK' }, 15)).toEqual({ error: 'Only SV bookings can be split.' });
  });

  it('only an active booking', () => {
    expect(validateSplitDraft(draft, { ...booking, status: 'cancelled' }, 15)).toHaveProperty('error');
  });

  it('seats: whole, at least 1, no more than the holder can still split', () => {
    expect(validateSplitDraft({ ...draft, seats: 16 }, booking, 15)).toHaveProperty('error');
    expect(validateSplitDraft({ ...draft, seats: 0 }, booking, 15)).toHaveProperty('error');
    expect(validateSplitDraft({ ...draft, seats: 2.5 }, booking, 15)).toHaveProperty('error');
  });

  it('editing keeps the seats fixed', () => {
    expect(validateSplitDraft({ ...draft, seats: null }, booking, null)).toMatchObject({ seats: null });
  });

  it('the PNR code is optional; when given it is checked and normalised', () => {
    expect(validateSplitDraft({ ...draft, pnrCode: ' 9xy z12 ' }, booking, 15)).toMatchObject({ pnrCode: '9XYZ12' });
    expect(validateSplitDraft({ ...draft, pnrCode: 'AB' }, booking, 15)).toHaveProperty('error');
    expect(validateSplitDraft({ ...draft, pnrCode: 'abc 123' }, booking, 15)).toHaveProperty('error');
  });

  it('a split with the booking’s own dates and no code records nothing', () => {
    expect(validateSplitDraft({ ...draft, inboundDate: '2026-12-15' }, booking, 15)).toHaveProperty('error');
    // A new code alone is enough.
    expect(validateSplitDraft({ ...draft, inboundDate: '2026-12-15', pnrCode: '9XYZ12' }, booking, 15)).not.toHaveProperty('error');
  });

  it('dates: outbound required; inbound required and not before it on a round trip; none on a one-way', () => {
    expect(validateSplitDraft({ ...draft, outboundDate: null }, booking, 15)).toHaveProperty('error');
    expect(validateSplitDraft({ ...draft, inboundDate: null }, booking, 15)).toHaveProperty('error');
    expect(validateSplitDraft({ ...draft, inboundDate: '2026-11-30' }, booking, 15)).toHaveProperty('error');
    const oneWay = { ...booking, tripType: 'one_way', inboundDate: null };
    expect(validateSplitDraft({ ...draft, outboundDate: '2026-12-04', inboundDate: null, ticketIssuanceDeadline: '2026-12-01' }, oneWay, 15)).toMatchObject({ inboundDate: null });
    expect(validateSplitDraft({ ...draft, outboundDate: '2026-12-04', ticketIssuanceDeadline: '2026-12-01' }, oneWay, 15)).toHaveProperty('error');
  });

  it('a ticket deadline is required and not after the split’s outbound', () => {
    expect(validateSplitDraft({ ...draft, ticketIssuanceDeadline: null }, booking, 15)).toHaveProperty('error');
    expect(validateSplitDraft({ ...draft, ticketIssuanceDeadline: '2026-12-02' }, booking, 15)).toHaveProperty('error');
    expect(validateSplitDraft({ ...draft, ticketIssuanceDeadline: '2026-02-30' }, booking, 15)).toHaveProperty('error');
  });

  it('SV pre-fill is the split’s outbound − 3', () => {
    expect(suggestedSplitDeadline('2026-12-01')).toBe('2026-11-28');
    expect(suggestedSplitDeadline(null)).toBeNull();
  });
});

describe('splittableSeats — one holder per split', () => {
  const splits = [
    { assignmentId: 'qfc', seats: 10 },
    { assignmentId: null, seats: 4 },
  ];
  it('an agent can split what they hold less what they already split', () => {
    expect(splittableSeats({ holderSeats: 15, assignmentId: 'qfc', splits })).toBe(5);
  });
  it('the company splits from its unassigned seats', () => {
    expect(splittableSeats({ holderSeats: 10, assignmentId: null, splits })).toBe(6);
  });
  it('never negative', () => {
    expect(splittableSeats({ holderSeats: 3, assignmentId: 'qfc', splits })).toBe(0);
  });
  it('totals', () => {
    expect(splitSeats(splits)).toBe(14);
  });
});

describe('splitRemovable', () => {
  it('until a ticket count is recorded on it', () => {
    expect(splitRemovable({ balanceTickets: null })).toBe(true);
    expect(splitRemovable({ balanceTickets: 0 })).toBe(false);
    expect(splitRemovable({ balanceTickets: 5 })).toBe(false);
  });
});

const own = { seats: 30, ticketsIssued: null, balanceTickets: null, ticketIssuanceDeadline: '2026-11-28', outboundDate: '2026-12-01' };
const split15 = { seats: 15, ticketsIssued: null, balanceTickets: null, ticketIssuanceDeadline: '2026-12-08', outboundDate: '2026-12-11' };

describe('ticketParts — the booking answers for the seats not in a split', () => {
  it('30 seats with 15 split: two parts of 15', () => {
    expect(ticketParts(own, [split15]).map((p) => p.seats)).toEqual([15, 15]);
  });
  it('every seat split away: the booking part drops out', () => {
    expect(ticketParts(own, [{ ...split15, seats: 30 }]).map((p) => p.seats)).toEqual([30]);
  });
  it('lastOutbound is the latest part’s departure', () => {
    expect(lastOutbound(ticketParts(own, [split15]))).toBe('2026-12-11');
  });
});

describe('partsRefundTiming — the EMDs wait for every part (owner, 2026-10-29)', () => {
  const parts = ticketParts(own, [split15]);
  it('the booking’s deadline passed but the split’s not: not due', () => {
    expect(partsRefundTiming(parts, '2026-11-29')).toEqual({ due: false, missingTicketDeadline: false });
  });
  it('the day after the split’s deadline: due', () => {
    expect(partsRefundTiming(parts, '2026-12-09')).toEqual({ due: true, why: 'ticket-deadline' });
  });
  it('every part all-issued: due at once', () => {
    const done = ticketParts({ ...own, ticketsIssued: 15, balanceTickets: 0 }, [{ ...split15, ticketsIssued: 15, balanceTickets: 0 }]);
    expect(partsRefundTiming(done, '2026-11-01')).toEqual({ due: true, why: 'tickets-issued' });
  });
  it('only one part all-issued: not yet', () => {
    const half = ticketParts({ ...own, ticketsIssued: 15, balanceTickets: 0 }, [split15]);
    expect(partsRefundTiming(half, '2026-11-01').due).toBe(false);
  });
});

describe('unissuedAcross — whole booking (owner, 2026-10-29)', () => {
  const base = { airlineCode: 'SV', seats: 30, todayIso: '2026-12-20', pnrStatus: 'active' };
  it('2 + 2 unissued across the parts: 4 of 30, SV allows 3, 1 over', () => {
    const parts = ticketParts({ ...own, ticketsIssued: 13, balanceTickets: 2 }, [{ ...split15, ticketsIssued: 13, balanceTickets: 2 }]);
    expect(unissuedAcross({ ...base, parts })).toEqual({ unissued: 4, allowance: 3, overLimit: 1, penaltyCalledFor: true, isSv: true });
  });
  it('nothing reported while a part is still open, or has no count', () => {
    const parts = ticketParts({ ...own, balanceTickets: 2 }, [{ ...split15, balanceTickets: 2 }]);
    expect(unissuedAcross({ ...base, todayIso: '2026-12-05', parts })).toBeNull();
    const blank = ticketParts({ ...own, balanceTickets: 2 }, [split15]);
    expect(unissuedAcross({ ...base, parts: blank })).toBeNull();
  });
});

describe('cancellation ticketing flag needs every part with no tickets', () => {
  const flagBase = {
    status: 'active',
    createdOnIso: '2026-10-30',
    seats: 30,
    rounds: [
      { roundNumber: 1, status: 'issued', paymentPct: 15, deadlineDate: '2026-11-11', issuanceDate: '2026-10-30', paymentDate: null, refundDate: null },
      { roundNumber: 2, status: 'issued', paymentPct: 85, deadlineDate: null, issuanceDate: '2026-11-10', paymentDate: null, refundDate: null },
    ],
    ticketIssuanceDeadline: '2026-11-28',
    balanceTickets: 15,
    todayIso: '2026-12-20',
  };
  it('both parts none issued, both deadlines passed: flagged at the later deadline', () => {
    expect(cancellationFlag({ ...flagBase, splits: [{ ...split15, balanceTickets: 15 }] })).toEqual({ trigger: 'ticketing', deadline: '2026-12-08' });
  });
  it('the split issued some tickets: not flagged', () => {
    expect(cancellationFlag({ ...flagBase, splits: [{ ...split15, balanceTickets: 5 }] })).toBeNull();
  });
  it('the split not answered: not flagged', () => {
    expect(cancellationFlag({ ...flagBase, splits: [split15] })).toBeNull();
  });
});

describe('QFC, 30 seats, split 15 + 15 — still one 30-seat deal (required test)', () => {
  // The split lives inside the booking and never touches the assignment, the
  // fare or the EMD rounds, so the agent's money has exactly the same inputs.
  const facts = {
    agentSeats: 30,
    pnrSeats: 30,
    fare: 100_000,
    airlineTaxes: 20_000,
    chargeType: 'pct',
    chargeValue: 5,
    discountType: 'none',
    discountValue: null,
    chargeTax: true,
    recoveries: [450_000],
    rounds: [{ roundNumber: 1, status: 'issued', emdAmount: 450_000, deadlineDate: '2026-11-11' }],
    ticketIssuanceDeadline: '2026-11-28',
  };
  it('the same total, EMD share and outstanding before and after the split', () => {
    const before = duesForAssignment(facts);
    const after = duesForAssignment({ ...facts });
    expect(after.dues.final.total).toBe(3_750_000);
    expect(after.dues.final.total).toBe(before.dues.final.total);
    expect(after.dues.emd).toEqual(before.dues.emd);
    expect(after.dues.final.outstanding).toBe(before.dues.final.outstanding);
    expect(after.dues.final.outstanding).toBe(3_300_000);
  });
});
