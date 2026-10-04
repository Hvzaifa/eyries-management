/**
 * What agents owe, grouped the way the owner reads it (2026-10-05): seats and
 * receivable by seat type, what the agent has paid, and what is left.
 *
 * Pure — no database — so the sums are testable. Each line's figures come from
 * `duesForAssignment` (`agent-dues.ts`), the same calculation the booking page
 * and the daily alert use; this file only groups and adds them.
 */

import { normalizeSegment } from './booking-entry';

/**
 * The three seat types, from the booking's segment (owner, 2026-10-05):
 * - **Umrah**: return seats, Saudi Arabia only — the Umrah segment;
 * - **One way**: no return, Saudi employment or any destination — Employment;
 * - **Tour**: return seats anywhere but Saudi — the Tour segment.
 * A segment outside the list (old imported text) is `other`, shown only when present.
 */
export type SeatType = 'umrah' | 'oneway' | 'tour' | 'other';

export const SEAT_TYPE_LABELS: Record<SeatType, string> = {
  umrah: 'Umrah',
  oneway: 'One way',
  tour: 'Tour',
  other: 'Other',
};

export function seatTypeOf(segment: string | null): SeatType {
  switch (normalizeSegment(segment)) {
    case 'Umrah':
      return 'umrah';
    case 'Employment':
      return 'oneway';
    case 'Tour':
      return 'tour';
    default:
      return 'other';
  }
}

/**
 * Booking statuses whose agent money counts (owner, 2026-10-05): active ones,
 * and completed ones because an agent can still owe after travel. Cancelled
 * bookings are left out.
 */
export const RECEIVABLE_PNR_STATUSES = ['active', 'completed'];

/** One agent's seats on one booking, already priced. */
export interface ReceivableLine {
  seatType: SeatType;
  seats: number;
  /** Everything the agent owes on the booking — `dues.final.total`. */
  receivable: number;
  /** Payments received — `dues.final.recovered`. */
  recovered: number;
  /** What is left; never negative — `dues.final.outstanding`. */
  balance: number;
  /** Paid beyond the receivable — `dues.final.credit`. */
  credit: number;
  /** Charge − discount. Head Office only on screen. */
  margin: number;
}

export interface ReceivableSummary {
  seats: Record<SeatType, number>;
  receivable: Record<SeatType, number>;
  totalSeats: number;
  totalReceivable: number;
  recovered: number;
  /**
   * Sum of each booking's balance. A booking paid beyond its receivable shows
   * as `credit` and is not netted against another booking's balance — the same
   * per-booking rule the agent's pages have always used.
   */
  balance: number;
  credit: number;
  margin: number;
}

const zero = (): Record<SeatType, number> => ({ umrah: 0, oneway: 0, tour: 0, other: 0 });

/** Adds lines in whole paisa, so a long list re-adds exactly. */
export function summarizeReceivables(lines: ReceivableLine[]): ReceivableSummary {
  const seats = zero();
  const paisa = zero();
  let recovered = 0, balance = 0, credit = 0, margin = 0;
  for (const l of lines) {
    seats[l.seatType] += l.seats;
    paisa[l.seatType] += toPaisa(l.receivable);
    recovered += toPaisa(l.recovered);
    balance += toPaisa(l.balance);
    credit += toPaisa(l.credit);
    margin += toPaisa(l.margin);
  }
  const receivable = zero();
  for (const t of Object.keys(paisa) as SeatType[]) receivable[t] = paisa[t] / 100;
  return {
    seats,
    receivable,
    totalSeats: lines.reduce((s, l) => s + l.seats, 0),
    totalReceivable: Object.values(paisa).reduce((s, v) => s + v, 0) / 100,
    recovered: recovered / 100,
    balance: balance / 100,
    credit: credit / 100,
    margin: margin / 100,
  };
}

function toPaisa(v: number): number {
  return Number.isFinite(v) ? Math.round(v * 100) : 0;
}
