import { describe, expect, it } from 'vitest';
import {
  agentDues,
  emdHeldByAirline,
  emdShareDue,
  emdRoundShares,
  finalBalanceDue,
  nextOpenDeadline,
  shiftIsoDays,
  type DuesRound,
  duesForAssignment,
} from './agent-dues';
import { NO_TERMS, type AgentTerms, type PnrPricing } from './agent-money';

const terms = (t: Partial<AgentTerms>): AgentTerms => ({ ...NO_TERMS, ...t });
const pricing: PnrPricing = { fare: 100_000, airlineTaxes: 20_000 };

let roundSeq = 0;
const round = (over: Partial<DuesRound>): DuesRound => ({
  roundNumber: ++roundSeq,
  status: 'issued',
  emdAmount: 0,
  deadlineDate: null,
  ...over,
});

/**
 * The owner's own extension cycle (docs/decisions.md, ruling 13), start to
 * finish. QFC holds 10 of a 30-seat booking.
 *
 * If any of these three numbers changes, the code is wrong, not the test.
 */
describe('the extension cycle — ruling 13, end to end', () => {
  const agentSeats = 10;
  const pnrSeats = 30;

  it('stage 1 — R1 450,000 issued: the agent owes 150,000', () => {
    const share = emdShareDue({
      agentSeats,
      pnrSeats,
      rounds: [round({ emdAmount: 450_000, deadlineDate: '2026-10-10' })],
      recovered: 0,
    });
    expect(share.held).toBe(450_000);
    expect(share.required).toBe(150_000);
    expect(share.due).toBe(150_000);
    // Due three days before the airline's deadline.
    // The airline's own deadline is kept as context; there is no payment
    // due date on an agent's EMD share any more (owner ruling, 2026-09-22).
    expect(share.deadlineDate).toBe('2026-10-10');
  });

  it('stage 2 — R1 refunded and R2 450,000 issued: nothing further is due', () => {
    // The refunded round drops out of what the airline holds, so the 150,000
    // already paid still covers the share. This is the step that makes an
    // extension not charge the agent twice.
    const share = emdShareDue({
      agentSeats,
      pnrSeats,
      rounds: [
        round({ status: 'refunded', emdAmount: 450_000, deadlineDate: '2026-10-10' }),
        round({ emdAmount: 450_000, deadlineDate: '2026-10-25' }),
      ],
      recovered: 150_000,
    });
    expect(share.held).toBe(450_000);
    expect(share.required).toBe(150_000);
    expect(share.due).toBe(0);
  });

  it('stage 3 — R3 2,550,000 issued alongside R2: 850,000 falls due', () => {
    const share = emdShareDue({
      agentSeats,
      pnrSeats,
      rounds: [
        round({ status: 'refunded', emdAmount: 450_000, deadlineDate: '2026-10-10' }),
        round({ emdAmount: 450_000, deadlineDate: '2026-11-01' }),
        round({ emdAmount: 2_550_000, deadlineDate: '2026-11-01' }),
      ],
      recovered: 150_000,
    });
    expect(share.held).toBe(3_000_000);
    expect(share.required).toBe(1_000_000);
    expect(share.due).toBe(850_000);
    expect(share.deadlineDate).toBe('2026-11-01');
  });

  it('a payment into a refunded round is never handed back — it stays as credit', () => {
    // Same as stage 2, but the agent paid more than the new share needs.
    const share = emdShareDue({
      agentSeats,
      pnrSeats,
      rounds: [
        round({ status: 'refunded', emdAmount: 900_000 }),
        round({ emdAmount: 450_000, deadlineDate: '2026-10-25' }),
      ],
      recovered: 300_000,
    });
    expect(share.required).toBe(150_000);
    expect(share.due).toBe(0);
  });
});

describe('emdHeldByAirline', () => {
  it('counts every issued round', () => {
    expect(
      emdHeldByAirline([
        round({ status: 'issued', emdAmount: 100 }),
        round({ status: 'issued', emdAmount: 200 }),
        round({ status: 'issued', emdAmount: 300 }),
      ])
    ).toBe(600);
  });

  it('excludes refunded rounds — that money came back', () => {
    expect(
      emdHeldByAirline([
        round({ status: 'refunded', emdAmount: 1_000 }),
        round({ status: 'issued', emdAmount: 7 }),
      ])
    ).toBe(7);
  });

  it('ignores a status that no longer exists rather than counting it', () => {
    // 'paid', 'refund_requested' and 'expired' were removed on 2026-09-21. A
    // stray value must not silently count as money the airline holds.
    expect(
      emdHeldByAirline([
        round({ status: 'paid', emdAmount: 500 }),
        round({ status: 'expired', emdAmount: 500 }),
      ])
    ).toBe(0);
  });

  it('is zero for a booking with no rounds yet', () => {
    expect(emdHeldByAirline([])).toBe(0);
  });

  it('sums in paisa without drift', () => {
    expect(emdHeldByAirline([round({ emdAmount: 0.1 }), round({ emdAmount: 0.2 })])).toBe(0.3);
  });
});

describe('nextOpenDeadline', () => {
  it('takes the earliest deadline among issued rounds only', () => {
    expect(
      nextOpenDeadline([
        round({ status: 'refunded', deadlineDate: '2026-10-01' }),
        round({ status: 'issued', deadlineDate: '2026-11-05' }),
        round({ status: 'issued', deadlineDate: '2026-10-20' }),
      ])
    ).toBe('2026-10-20');
  });

  it('ignores an issued round with no deadline recorded', () => {
    expect(nextOpenDeadline([round({ deadlineDate: null })])).toBeNull();
  });
});

describe('emdShareDue', () => {
  it('has nothing due before any round exists', () => {
    const share = emdShareDue({ agentSeats: 10, pnrSeats: 30, rounds: [], recovered: 0 });
    expect(share).toMatchObject({ held: 0, required: 0, due: 0, deadlineDate: null });
  });

  it('asks a whole-booking agent for the whole EMD', () => {
    const share = emdShareDue({
      agentSeats: 30,
      pnrSeats: 30,
      rounds: [round({ emdAmount: 450_000 })],
      recovered: 0,
    });
    expect(share.required).toBe(450_000);
  });

  it('never asks one agent for more than the airline holds', () => {
    // seatLedger clamps unassigned at 0, so stored rows can over-allocate.
    const share = emdShareDue({
      agentSeats: 40,
      pnrSeats: 30,
      rounds: [round({ emdAmount: 450_000 })],
      recovered: 0,
    });
    expect(share.required).toBe(450_000);
  });

  it('survives a zero-seat booking without dividing by zero', () => {
    const share = emdShareDue({
      agentSeats: 0,
      pnrSeats: 0,
      rounds: [round({ emdAmount: 450_000 })],
      recovered: 0,
    });
    expect(share.required).toBe(0);
    expect(Number.isNaN(share.due)).toBe(false);
  });

  it('rounds a share to the paisa', () => {
    // A third of 1,000,000.01 does not divide evenly.
    const share = emdShareDue({
      agentSeats: 10,
      pnrSeats: 30,
      rounds: [round({ emdAmount: 1_000_000.01 })],
      recovered: 0,
    });
    expect(share.required).toBe(333_333.34);
  });
});

describe('finalBalanceDue', () => {
  const base = {
    seats: 10,
    pricing,
    terms: terms({ chargeType: 'pct', chargeValue: 5, chargeTax: true }),
    recoveries: [],
  };

  it('falls due 3 days before the ticket-issuance deadline', () => {
    const final = finalBalanceDue({ ...base, ticketIssuanceDeadline: '2026-11-20' });
    expect(final.total).toBe(1_250_000);
    expect(final.outstanding).toBe(1_250_000);
    expect(final.dueDate).toBe('2026-11-17');
  });

  it('for SV that lands on outbound − 6 days', () => {
    // SV issues tickets 72h before departure, so a 20 Nov flight has a 17 Nov
    // issuance deadline, and the agent's money is due on the 14th.
    const outbound = '2026-11-20';
    const issuance = shiftIsoDays(outbound, -3);
    const final = finalBalanceDue({ ...base, ticketIssuanceDeadline: issuance });
    expect(issuance).toBe('2026-11-17');
    expect(final.dueDate).toBe('2026-11-14');
    expect(shiftIsoDays(outbound, -6)).toBe(final.dueDate);
  });

  it('has NO due date when no ticketing deadline is recorded (ruling 17)', () => {
    const final = finalBalanceDue({ ...base, ticketIssuanceDeadline: null });
    expect(final.outstanding).toBe(1_250_000);
    expect(final.dueDate).toBeNull();
  });

  it('subtracts what the agent has paid', () => {
    const final = finalBalanceDue({
      ...base,
      recoveries: [150_000, 100_000],
      ticketIssuanceDeadline: '2026-11-20',
    });
    expect(final.recovered).toBe(250_000);
    expect(final.outstanding).toBe(1_000_000);
  });

  it('reports an overpayment as credit, not as a negative balance', () => {
    const final = finalBalanceDue({
      ...base,
      recoveries: [1_300_000],
      ticketIssuanceDeadline: '2026-11-20',
    });
    expect(final.outstanding).toBe(0);
    expect(final.credit).toBe(50_000);
  });
});

describe('shiftIsoDays', () => {
  it('crosses a month end by the calendar', () => {
    expect(shiftIsoDays('2026-11-01', -3)).toBe('2026-10-29');
  });

  it('crosses a year end', () => {
    expect(shiftIsoDays('2027-01-02', -3)).toBe('2026-12-30');
  });

  it('handles a leap day', () => {
    expect(shiftIsoDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('returns null for a missing or unparseable date', () => {
    expect(shiftIsoDays(null, -3)).toBeNull();
    expect(shiftIsoDays('not-a-date', -3)).toBeNull();
  });
});

describe('agentDues — the whole schedule', () => {
  const input = {
    agentSeats: 10,
    pnrSeats: 30,
    pricing,
    terms: terms({ chargeType: 'pct', chargeValue: 5, chargeTax: true }),
    recoveries: [] as number[],
    rounds: [round({ emdAmount: 450_000, deadlineDate: '2026-10-10' })],
    ticketIssuanceDeadline: '2026-11-17',
  };

  it('puts the EMD share first and the balance at ticketing', () => {
    const dues = agentDues(input);
    expect(dues.emd.due).toBe(150_000);
    expect(dues.emd.deadlineDate).toBe('2026-10-10');
    expect(dues.final.outstanding).toBe(1_250_000);
    expect(dues.final.dueDate).toBe('2026-11-14');
    // The EMD share comes first because it precedes ticketing by construction,
    // and it carries no date — it is collected before the airline issues the
    // round (owner ruling, 2026-09-22).
    expect(dues.next).toEqual({ kind: 'emd', amount: 150_000, date: null });
  });

  it('does not add the two together — the EMD share is part of the total', () => {
    const dues = agentDues(input);
    expect(dues.emd.due).toBeLessThan(dues.final.outstanding);
    expect(dues.final.total).toBe(1_250_000);
  });

  it('moves to the final balance once the EMD share is covered', () => {
    const dues = agentDues({ ...input, recoveries: [150_000] });
    expect(dues.emd.due).toBe(0);
    expect(dues.next).toEqual({ kind: 'final', amount: 1_100_000, date: '2026-11-14' });
  });

  it('has nothing next when the agent has paid in full', () => {
    const dues = agentDues({ ...input, recoveries: [1_250_000] });
    expect(dues.next).toBeNull();
  });

  it('prefers a dated obligation over an undated one', () => {
    // No ticketing deadline: the balance cannot be chased, but the EMD share can.
    const dues = agentDues({ ...input, ticketIssuanceDeadline: null });
    expect(dues.next?.kind).toBe('emd');
    expect(dues.final.dueDate).toBeNull();
  });

  it('still reports an undated balance as owed when there is no EMD round either', () => {
    const dues = agentDues({ ...input, rounds: [], ticketIssuanceDeadline: null });
    expect(dues.next).toEqual({ kind: 'final', amount: 1_250_000, date: null });
  });
});

describe('duesForAssignment', () => {
  // The owner's worked example (ruling 15), now through the one mapper that
  // the agent list, the agent page and the daily alert all share. If these
  // three ever disagree about what an agent owes, it is because something
  // stopped going through here.
  const base = {
    agentSeats: 10,
    pnrSeats: 10,
    fare: 100_000,
    airlineTaxes: 20_000,
    chargeType: 'pct',
    chargeValue: 5,
    discountType: 'none' as string | null,
    discountValue: null,
    chargeTax: true,
    recoveries: [] as number[],
    rounds: [],
    ticketIssuanceDeadline: null,
  };

  it('reproduces the owner’s worked example', () => {
    const { dues, margin } = duesForAssignment(base);
    expect(dues.final.total).toBe(1_250_000);
    expect(margin).toBe(50_000);
  });

  it('never counts tax as margin', () => {
    // Ruling 15: "the taxes are paid to government, they shouldn't determine
    // margin".
    const withTax = duesForAssignment(base).margin;
    const withoutTax = duesForAssignment({ ...base, chargeTax: false }).margin;
    expect(withTax).toBe(withoutTax);
  });

  it('falls back to no term when the stored type is not recognised', () => {
    // charge_type is a text column, so an unexpected value must not flow into
    // the arithmetic as an unknown term.
    const { dues, terms } = duesForAssignment({ ...base, chargeType: 'wibble' });
    expect(terms.chargeType).toBe('none');
    expect(dues.final.total).toBe(1_200_000); // seats × fare + tax, no charge
  });

  it('subtracts recoveries from what is outstanding', () => {
    const { dues } = duesForAssignment({ ...base, recoveries: [250_000] });
    expect(dues.final.recovered).toBe(250_000);
    expect(dues.final.outstanding).toBe(1_000_000);
  });

  it('leaves a balance undated when no ticketing deadline is recorded', () => {
    const { dues } = duesForAssignment(base);
    expect(dues.final.dueDate).toBeNull();
    expect(dues.next?.date).toBeNull();
  });
});

describe('emdRoundShares — what the agent pays per round', () => {
  const agentSeats = 10;
  const pnrSeats = 30;

  it('splits each round by the agent’s seat share', () => {
    const lines = emdRoundShares({
      agentSeats,
      pnrSeats,
      rounds: [
        round({ roundNumber: 1, emdAmount: 450_000 }),
        round({ roundNumber: 2, emdAmount: 900_000 }),
      ],
    });
    expect(lines).toEqual([
      { roundNumber: 1, emdAmount: 450_000, share: 150_000, issued: true },
      { roundNumber: 2, emdAmount: 900_000, share: 300_000, issued: true },
    ]);
  });

  it('adds up to exactly what emdShareDue requires, to the paisa', () => {
    // The whole reason shares are cumulative differences rather than four
    // independent roundings. Amounts chosen so every round divides badly by 3.
    const rounds = [
      round({ roundNumber: 1, emdAmount: 100_000.01 }),
      round({ roundNumber: 2, emdAmount: 100_000.01 }),
      round({ roundNumber: 3, emdAmount: 100_000.01 }),
      round({ roundNumber: 4, emdAmount: 100_000.01 }),
    ];
    const lines = emdRoundShares({ agentSeats, pnrSeats, rounds });
    const share = emdShareDue({ agentSeats, pnrSeats, rounds, recovered: 0 });
    const summed = lines.reduce((sum, l) => sum + Math.round(l.share * 100), 0) / 100;
    expect(summed).toBe(share.required);
  });

  it('omits refunded rounds and renumbers from 1', () => {
    // Rounds 1 and 2 were pulled inside their billing window and re-issued as
    // 3 and 4. The agent owes for the same two deposits, so they see rounds
    // 1 and 2 — not 3 and 4 (owner, 2026-09-22).
    const lines = emdRoundShares({
      agentSeats,
      pnrSeats,
      rounds: [
        round({ roundNumber: 1, emdAmount: 450_000, status: 'refunded' }),
        round({ roundNumber: 2, emdAmount: 900_000, status: 'refunded' }),
        round({ roundNumber: 3, emdAmount: 450_000 }),
        round({ roundNumber: 4, emdAmount: 900_000 }),
      ],
    });
    expect(lines.map((l) => l.roundNumber)).toEqual([1, 2]);
    expect(lines.map((l) => l.share)).toEqual([150_000, 300_000]);
  });

  it('orders by the booking’s round number, however the rows arrive', () => {
    const lines = emdRoundShares({
      agentSeats,
      pnrSeats,
      rounds: [
        round({ roundNumber: 2, emdAmount: 900_000 }),
        round({ roundNumber: 1, emdAmount: 450_000 }),
      ],
    });
    expect(lines.map((l) => l.emdAmount)).toEqual([450_000, 900_000]);
  });

  it('shows the next round as not issued, and keeps it out of the required total', () => {
    const rounds = [round({ roundNumber: 1, emdAmount: 450_000 })];
    const lines = emdRoundShares({ agentSeats, pnrSeats, rounds, upcomingAmount: 900_000 });
    expect(lines).toEqual([
      { roundNumber: 1, emdAmount: 450_000, share: 150_000, issued: true },
      { roundNumber: 2, emdAmount: 900_000, share: 300_000, issued: false },
    ]);
    // The airline is not holding the upcoming money, so it is not arrears.
    const share = emdShareDue({ agentSeats, pnrSeats, rounds, recovered: 0 });
    expect(share.required).toBe(150_000);
  });

  it('quotes the same figure before and after that round is issued', () => {
    // A collection that changes the moment the EMD is issued is a collection
    // nobody trusts. 333,333.33 divides badly by 3 on purpose.
    const first = round({ roundNumber: 1, emdAmount: 333_333.33 });
    const before = emdRoundShares({
      agentSeats,
      pnrSeats,
      rounds: [first],
      upcomingAmount: 333_333.33,
    });
    const after = emdRoundShares({
      agentSeats,
      pnrSeats,
      rounds: [first, round({ roundNumber: 2, emdAmount: 333_333.33 })],
    });
    expect(before[1].share).toBe(after[1].share);
  });

  it('shows the first round as upcoming when nothing is issued yet', () => {
    const lines = emdRoundShares({
      agentSeats,
      pnrSeats,
      rounds: [],
      upcomingAmount: 450_000,
    });
    expect(lines).toEqual([
      { roundNumber: 1, emdAmount: 450_000, share: 150_000, issued: false },
    ]);
  });

  it('shows nothing when there are no rounds and no policy figure', () => {
    expect(emdRoundShares({ agentSeats, pnrSeats, rounds: [] })).toEqual([]);
    expect(
      emdRoundShares({ agentSeats, pnrSeats, rounds: [], upcomingAmount: null })
    ).toEqual([]);
  });

  it('gives an agent holding every seat the whole round', () => {
    const lines = emdRoundShares({
      agentSeats: 30,
      pnrSeats: 30,
      rounds: [round({ roundNumber: 1, emdAmount: 450_000 })],
    });
    expect(lines[0].share).toBe(450_000);
  });

  it('never asks one agent for more than the round, even if seats over-allocate', () => {
    // seatLedger clamps unassigned seats at zero, so stored rows can
    // over-allocate a booking — the same clamp emdShareDue makes.
    const lines = emdRoundShares({
      agentSeats: 40,
      pnrSeats: 30,
      rounds: [round({ roundNumber: 1, emdAmount: 450_000 })],
    });
    expect(lines[0].share).toBe(450_000);
  });

  it('asks for nothing when the booking has no seats', () => {
    const lines = emdRoundShares({
      agentSeats: 10,
      pnrSeats: 0,
      rounds: [round({ roundNumber: 1, emdAmount: 450_000 })],
    });
    expect(lines[0].share).toBe(0);
  });
});

describe('agentDues — the per-round schedule rides along', () => {
  it('carries the rounds and the upcoming one', () => {
    const dues = agentDues({
      agentSeats: 10,
      pnrSeats: 30,
      pricing,
      terms: NO_TERMS,
      recoveries: [],
      rounds: [round({ roundNumber: 1, emdAmount: 450_000, deadlineDate: '2026-10-10' })],
      ticketIssuanceDeadline: null,
      upcomingRoundAmount: 900_000,
    });
    expect(dues.rounds.map((r) => r.share)).toEqual([150_000, 300_000]);
    expect(dues.rounds.map((r) => r.issued)).toEqual([true, false]);
    // Required counts only what the airline actually holds.
    expect(dues.emd.required).toBe(150_000);
  });
});
