import { describe, expect, it } from 'vitest';
import {
  holderSeatsOf,
  isPartialView,
  projectRowToHolder,
  seatsHeldBy,
  shareOfMoney,
} from './holder-view';
import { COMPANY_HOLDER } from './inventory';
import type { PnrListRow } from './pnrs';

/** Only the fields the projection reads; the rest of the row is irrelevant. */
function row(over: Partial<PnrListRow>): PnrListRow {
  return {
    id: 'id',
    pnr: 'AFY883',
    seats: 99,
    fare: 115_000,
    totalEmdValue: 99 * 115_000,
    totalIssued: 0,
    totalRefunded: 0,
    status: 'active',
    holder: '',
    holderKeys: [],
    agentNames: [],
    holderParts: [],
    agentSeats: 0,
    unassignedSeats: 99,
    ...over,
  } as PnrListRow;
}

/** The owner's live booking: 99 seats, two agents at 30, 39 with the company. */
const shared = row({
  seats: 99,
  fare: 115_000,
  totalEmdValue: 99 * 115_000,
  totalIssued: 4_500_000,
  totalRefunded: 1_000_000,
  holderParts: [
    { name: 'Ansar e Madinah', seats: 30 },
    { name: 'Eyries Holidays', seats: 30 },
  ],
  agentSeats: 60,
  unassignedSeats: 39,
  holderKeys: ['Ansar e Madinah', 'Eyries Holidays', COMPANY_HOLDER],
});

describe('holderSeatsOf', () => {
  it('lists every agent plus the company', () => {
    expect(holderSeatsOf(shared)).toEqual([
      { key: 'Ansar e Madinah', seats: 30 },
      { key: 'Eyries Holidays', seats: 30 },
      { key: COMPANY_HOLDER, seats: 39 },
    ]);
  });

  it('sums two assignment rows for the same agent', () => {
    // One live row per agent per booking is merged by the application, not by a
    // database constraint, so two rows must not read as two holders.
    const r = row({
      seats: 50,
      holderParts: [
        { name: 'QFC Group', seats: 20 },
        { name: 'QFC Group', seats: 10 },
      ],
      agentSeats: 30,
      unassignedSeats: 20,
    });
    expect(holderSeatsOf(r)).toEqual([
      { key: 'QFC Group', seats: 30 },
      { key: COMPANY_HOLDER, seats: 20 },
    ]);
  });

  it('omits the company when every seat is with agents', () => {
    const r = row({
      seats: 30,
      holderParts: [{ name: 'MAQBOOL TRAVEL', seats: 30 }],
      agentSeats: 30,
      unassignedSeats: 0,
    });
    expect(holderSeatsOf(r)).toEqual([{ key: 'MAQBOOL TRAVEL', seats: 30 }]);
  });
});

describe('seatsHeldBy', () => {
  it('gives each holder their own seats', () => {
    expect(seatsHeldBy(shared, 'Ansar e Madinah')).toBe(30);
    expect(seatsHeldBy(shared, 'Eyries Holidays')).toBe(30);
    expect(seatsHeldBy(shared, COMPANY_HOLDER)).toBe(39);
  });

  it('is zero for a holder with no seats on this booking', () => {
    expect(seatsHeldBy(shared, 'Someone Else')).toBe(0);
  });
});

describe('projectRowToHolder', () => {
  it('shows one agent their own 30 seats, not the booking’s 99', () => {
    const view = projectRowToHolder(shared, 'Ansar e Madinah');
    expect(view.seats).toBe(30);
    expect(view.holderView).toEqual({ holder: 'Ansar e Madinah', bookingSeats: 99 });
    expect(isPartialView(view)).toBe(true);
  });

  it('values those seats exactly, at seats × fare', () => {
    const view = projectRowToHolder(shared, 'Ansar e Madinah');
    expect(view.totalEmdValue).toBe(30 * 115_000);
  });

  it('divides the money by seats', () => {
    const view = projectRowToHolder(shared, 'Ansar e Madinah');
    // 30/99 of 4,500,000 = 1,363,636.36
    expect(view.totalIssued).toBeCloseTo(1_363_636.36, 2);
  });

  it('gives the company its own share', () => {
    const view = projectRowToHolder(shared, COMPANY_HOLDER);
    expect(view.seats).toBe(39);
    expect(view.totalEmdValue).toBe(39 * 115_000);
  });

  it('leaves a booking held entirely by one agent untouched', () => {
    const whole = row({
      seats: 30,
      fare: 120_000,
      totalEmdValue: 3_600_000,
      totalIssued: 900_000,
      holderParts: [{ name: 'MAQBOOL TRAVEL', seats: 30 }],
      agentSeats: 30,
      unassignedSeats: 0,
    });
    const view = projectRowToHolder(whole, 'MAQBOOL TRAVEL');
    expect(view.seats).toBe(30);
    expect(view.totalEmdValue).toBe(3_600_000);
    expect(view.totalIssued).toBe(900_000);
    // The booking is wholly theirs, so there is no "30 of 99" to show.
    expect(isPartialView(view)).toBe(false);
  });

  it('keeps a null EMD value null, so the column still prints an em dash', () => {
    const noValue = row({ totalEmdValue: null });
    expect(projectRowToHolder(noValue, COMPANY_HOLDER).totalEmdValue).toBeNull();
  });

  it('is the identity when no holder is selected', () => {
    expect(projectRowToHolder(shared, null)).toBe(shared);
  });

  it('preserves holderKeys, so the filter still matches the projected row', () => {
    const view = projectRowToHolder(shared, 'Eyries Holidays');
    expect(view.holderKeys).toEqual(shared.holderKeys);
  });

  it('shows zeroes for a holder who holds nothing on the booking', () => {
    const view = projectRowToHolder(shared, 'Someone Else');
    expect(view).toMatchObject({ seats: 0, totalEmdValue: 0, totalIssued: 0 });
  });

  it('survives a zero-seat booking without producing NaN', () => {
    // Reachable: holderFilterKeys still lists the company on a 0-seat booking.
    const empty = row({ seats: 0, totalEmdValue: 0, totalIssued: 0, unassignedSeats: 0 });
    const view = projectRowToHolder(empty, COMPANY_HOLDER);
    expect(view.seats).toBe(0);
    expect(Number.isNaN(view.totalIssued)).toBe(false);
    expect(view.totalIssued).toBe(0);
  });

  it('never inflates a figure when the stored rows over-allocate a booking', () => {
    // seatLedger clamps unassigned at 0, so agents CAN exceed the seat count.
    const over = row({
      seats: 10,
      totalIssued: 1_000,
      totalEmdValue: 1_150_000,
      holderParts: [
        { name: 'A', seats: 8 },
        { name: 'B', seats: 8 },
      ],
      agentSeats: 16,
      unassignedSeats: 0,
    });
    const a = projectRowToHolder(over, 'A');
    const b = projectRowToHolder(over, 'B');
    expect(a.totalIssued).toBeLessThanOrEqual(over.totalIssued);
    expect(a.totalIssued + b.totalIssued).toBeLessThanOrEqual(over.totalIssued);
  });
});

describe('the shares re-add to the booking', () => {
  it('splits seats back to the whole', () => {
    const parts = ['Ansar e Madinah', 'Eyries Holidays', COMPANY_HOLDER].map(
      (h) => projectRowToHolder(shared, h).seats
    );
    expect(parts).toEqual([30, 30, 39]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(shared.seats);
  });

  it('splits money back to the whole, to the paisa', () => {
    // 30/99, 30/99 and 39/99 do not divide evenly; the odd paisa stays with the
    // company rather than disappearing.
    for (const amount of [4_500_000, 1_000_000, 333_333.33, 0.03, 999_999.99]) {
      const r = { ...shared, totalIssued: amount };
      const parts = ['Ansar e Madinah', 'Eyries Holidays', COMPANY_HOLDER].map(
        (h) => projectRowToHolder(r, h).totalIssued
      );
      const sum = Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100;
      expect(sum).toBe(amount);
    }
  });

  it('splits EMD value back to the whole', () => {
    const parts = ['Ansar e Madinah', 'Eyries Holidays', COMPANY_HOLDER].map(
      (h) => projectRowToHolder(shared, h).totalEmdValue ?? 0
    );
    expect(parts.reduce((a, b) => a + b, 0)).toBe(shared.totalEmdValue);
  });
});

describe('shareOfMoney', () => {
  const holders = [
    { key: 'A', seats: 30 },
    { key: 'B', seats: 30 },
    { key: COMPANY_HOLDER, seats: 39 },
  ];

  it('returns null for an amount that was never recorded', () => {
    expect(shareOfMoney(null, 'A', holders, 99)).toBeNull();
  });

  it('gives the whole amount to a holder of every seat', () => {
    expect(shareOfMoney(500, 'A', [{ key: 'A', seats: 10 }], 10)).toBe(500);
  });

  it('falls back to the largest agent when the company holds nothing', () => {
    const agentsOnly = [
      { key: 'A', seats: 7 },
      { key: 'B', seats: 3 },
    ];
    const sum =
      (shareOfMoney(100.01, 'A', agentsOnly, 10) ?? 0) +
      (shareOfMoney(100.01, 'B', agentsOnly, 10) ?? 0);
    expect(Math.round(sum * 100) / 100).toBe(100.01);
  });
});

describe('projectRowToHolder — the next EMD to issue', () => {
  it('gives the holder their share of it', () => {
    const r = row({
      seats: 30,
      fare: 100_000,
      nextEmdAmount: 450_000,
      agentNames: ['QFC Group'],
      holderParts: [{ name: 'QFC Group', seats: 10 }],
      agentSeats: 10,
      unassignedSeats: 20,
    });
    expect(projectRowToHolder(r, 'QFC Group').nextEmdAmount).toBe(150_000);
  });

  it('leaves an underivable amount null rather than turning it into zero', () => {
    const r = row({
      seats: 30,
      fare: 100_000,
      nextEmdAmount: null,
      agentNames: ['QFC Group'],
      holderParts: [{ name: 'QFC Group', seats: 10 }],
      agentSeats: 10,
      unassignedSeats: 20,
    });
    expect(projectRowToHolder(r, 'QFC Group').nextEmdAmount).toBeNull();
  });

  it('leaves it whole for a holder who holds the entire booking', () => {
    const r = row({
      seats: 30,
      fare: 100_000,
      nextEmdAmount: 450_000,
      agentNames: ['QFC Group'],
      holderParts: [{ name: 'QFC Group', seats: 30 }],
      agentSeats: 30,
      unassignedSeats: 0,
    });
    expect(projectRowToHolder(r, 'QFC Group').nextEmdAmount).toBe(450_000);
  });
});
