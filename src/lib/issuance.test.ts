import { describe, expect, it } from 'vitest';
import {
  FINAL_EMD_ROUND,
  nextStep,
  ordinal,
  nextEmdLabel,
  emdsToIssueOn,
  matchesIssuanceDate,
  issuanceDates,
} from './issuance';
import type { PnrListRow } from './pnrs';

const row = (over: Partial<PnrListRow>): PnrListRow =>
  ({
    id: over.id ?? 'x',
    status: 'active',
    seats: 10,
    fare: 100_000,
    roundsIssued: 0,
    nextIssuanceDeadline: null,
    nextEmdAmount: null,
    ...over,
  }) as PnrListRow;

describe('ordinal', () => {
  it('handles the ordinary cases', () => {
    expect([1, 2, 3, 4, 5].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '5th']);
  });

  it('handles the teens, which do not follow the last digit', () => {
    expect([11, 12, 13].map(ordinal)).toEqual(['11th', '12th', '13th']);
  });

  it('goes back to the last digit after the teens', () => {
    expect([21, 22, 23, 101, 111].map(ordinal)).toEqual([
      '21st',
      '22nd',
      '23rd',
      '101st',
      '111th',
    ]);
  });
});

describe('nextEmdLabel', () => {
  it('names the round that comes next, not the one just issued', () => {
    expect(nextEmdLabel(0)).toBe('1st EMD');
    expect(nextEmdLabel(1)).toBe('2nd EMD');
    expect(nextEmdLabel(2)).toBe('3rd EMD');
  });
});

describe('emdsToIssueOn', () => {
  const rows = [
    row({ id: 'a', nextIssuanceDeadline: '2026-09-20', nextEmdAmount: 937_500 }),
    row({ id: 'b', nextIssuanceDeadline: '2026-09-20', nextEmdAmount: 1_035_000 }),
    row({ id: 'c', nextIssuanceDeadline: '2026-09-21', nextEmdAmount: 500_000 }),
    row({ id: 'd', nextIssuanceDeadline: null, nextEmdAmount: null }),
  ];

  it('totals the deposits falling due on that date', () => {
    const day = emdsToIssueOn(rows, '2026-09-20');
    expect(day.bookings).toBe(2);
    expect(day.total).toBe(1_972_500);
    expect(day.undetermined).toBe(0);
  });

  it('takes that date exactly, never earlier ones', () => {
    // Owner's choice: the question is what one day's work is worth.
    const day = emdsToIssueOn(rows, '2026-09-21');
    expect(day.bookings).toBe(1);
    expect(day.total).toBe(500_000);
  });

  it('is blank until a date is picked', () => {
    expect(emdsToIssueOn(rows, null)).toEqual({
      date: null,
      bookings: 0,
      total: 0,
      undetermined: 0,
    });
  });

  it('counts a booking with no derivable amount instead of treating it as zero', () => {
    // No airline policy covers it, so staff type the figure when they issue it.
    // Folding it in as zero would make the day's total quietly short.
    const day = emdsToIssueOn(
      [
        row({ id: 'a', nextIssuanceDeadline: '2026-09-20', nextEmdAmount: 937_500 }),
        row({ id: 'e', nextIssuanceDeadline: '2026-09-20', nextEmdAmount: null }),
      ],
      '2026-09-20'
    );
    expect(day.bookings).toBe(2);
    expect(day.total).toBe(937_500);
    expect(day.undetermined).toBe(1);
  });

  it('ignores cancelled and completed bookings', () => {
    // They carry a date but have no EMD to issue.
    const day = emdsToIssueOn(
      [
        row({ id: 'a', nextIssuanceDeadline: '2026-09-20', nextEmdAmount: 100_000 }),
        row({ id: 'b', nextIssuanceDeadline: '2026-09-20', nextEmdAmount: 100_000, status: 'cancelled' }),
        row({ id: 'c', nextIssuanceDeadline: '2026-09-20', nextEmdAmount: 100_000, status: 'completed' }),
      ],
      '2026-09-20'
    );
    expect(day.bookings).toBe(1);
    expect(day.total).toBe(100_000);
  });

  it('adds in whole paisa so a long day re-adds exactly', () => {
    const day = emdsToIssueOn(
      [
        row({ id: 'a', nextIssuanceDeadline: '2026-09-20', nextEmdAmount: 0.1 }),
        row({ id: 'b', nextIssuanceDeadline: '2026-09-20', nextEmdAmount: 0.2 }),
      ],
      '2026-09-20'
    );
    expect(day.total).toBe(0.3);
  });

  it('reports a date with nothing on it as empty, not as an error', () => {
    const day = emdsToIssueOn(rows, '2026-12-25');
    expect(day).toEqual({ date: '2026-12-25', bookings: 0, total: 0, undetermined: 0 });
  });
});

describe('matchesIssuanceDate', () => {
  it('agrees with what the card counted', () => {
    // The card and the rows beneath it must never disagree about which
    // bookings a date covers.
    const rows = [
      row({ id: 'a', nextIssuanceDeadline: '2026-09-20', nextEmdAmount: 1 }),
      row({ id: 'b', nextIssuanceDeadline: '2026-09-21', nextEmdAmount: 1 }),
      row({ id: 'c', nextIssuanceDeadline: '2026-09-20', nextEmdAmount: 1, status: 'cancelled' }),
    ];
    const matched = rows.filter((r) => matchesIssuanceDate(r, '2026-09-20'));
    expect(matched.map((r) => r.id)).toEqual(['a']);
    expect(matched.length).toBe(emdsToIssueOn(rows, '2026-09-20').bookings);
  });
});

describe('issuanceDates', () => {
  it('lists the dates that have work on them, earliest first, once each', () => {
    const rows = [
      row({ id: 'a', nextIssuanceDeadline: '2026-09-21' }),
      row({ id: 'b', nextIssuanceDeadline: '2026-09-20' }),
      row({ id: 'c', nextIssuanceDeadline: '2026-09-20' }),
      row({ id: 'd', nextIssuanceDeadline: null }),
      row({ id: 'e', nextIssuanceDeadline: '2026-09-22', status: 'completed' }),
    ];
    expect(issuanceDates(rows)).toEqual(['2026-09-20', '2026-09-21']);
  });

  it('returns nothing when no booking has a deadline', () => {
    expect(issuanceDates([row({ nextIssuanceDeadline: null })])).toEqual([]);
  });
});

describe('nextStep — the time limit in force is the latest round’s', () => {
  const r = (roundNumber: number, deadlineDate: string | null) => ({ roundNumber, deadlineDate });
  const base = { pnrTlDate: '2026-10-01', ticketIssuanceDeadline: '2026-11-17' };

  it('no rounds: the 1st EMD, by the PNR TL', () => {
    expect(nextStep({ ...base, rounds: [] })).toEqual({ kind: 'emd', emdRound: 1, deadline: '2026-10-01' });
  });

  it('one round: the 2nd EMD, by the time limit round 1 secured', () => {
    expect(nextStep({ ...base, rounds: [r(1, '2026-10-15')] })).toEqual({ kind: 'emd', emdRound: 2, deadline: '2026-10-15' });
  });

  it('a round with no recorded time limit falls back to the PNR TL', () => {
    expect(nextStep({ ...base, rounds: [r(1, null)] }).deadline).toBe('2026-10-01');
  });

  it('the owner’s case: round 2 issued meets round 1’s passed time limit — nothing overdue, no 3rd EMD', () => {
    // 9FF8DS: round 1 secured to 1 Sep and is not yet recorded as refunded;
    // round 2 was issued 1 Sep.
    const s = nextStep({ ...base, rounds: [r(1, '2026-09-01'), r(2, null)] });
    expect(s.kind).toBe('tickets');
    expect(s.emdRound).toBeNull();
    expect(s.deadline).toBe('2026-11-17');
  });

  it('after the final EMD, the ticketing record’s deadline is shown, else the last round’s time limit', () => {
    expect(nextStep({ ...base, rounds: [r(1, '2026-09-01'), r(2, '2026-10-20')] }).deadline).toBe('2026-11-17');
    expect(
      nextStep({ ...base, ticketIssuanceDeadline: null, rounds: [r(1, '2026-09-01'), r(2, '2026-10-20')] }).deadline
    ).toBe('2026-10-20');
  });

  it('a 3rd round staff created still never leads to a 4th being suggested', () => {
    const s = nextStep({ ...base, ticketIssuanceDeadline: null, rounds: [r(1, null), r(2, null), r(3, '2026-10-25')] });
    expect(s).toEqual({ kind: 'tickets', emdRound: null, deadline: '2026-10-25' });
    expect(FINAL_EMD_ROUND).toBe(2);
  });

  it('round order in the input does not matter', () => {
    expect(nextStep({ ...base, rounds: [r(1, '2026-10-20')] }).deadline).toBe('2026-10-20');
    expect(nextStep({ ...base, ticketIssuanceDeadline: null, rounds: [r(2, '2026-10-20'), r(1, '2026-09-01')] }).deadline).toBe('2026-10-20');
  });
});
