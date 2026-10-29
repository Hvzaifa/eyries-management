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
 * - **One way**: no return, Saudi employment or any destination — the One Way segment
 *   (called Employment until 2026-10-20);
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
    case 'One Way':
      return 'oneway';
    case 'Tour':
      return 'tour';
    default:
      return 'other';
  }
}

/**
 * Booking statuses whose agent money counts (owner, 2026-10-05): active ones,
 * and completed ones because an agent can still owe after travel. ~~Cancelled
 * bookings are left out.~~ Cancelled ones count too since Phase 9 Step 5 (owner,
 * 2026-10-28): the agent owes their penalty, or is owed money back.
 */
export const RECEIVABLE_PNR_STATUSES = ['active', 'completed', 'cancelled'];

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
  /** On a cancelled booking: still to pay back to the agent — `dues.final.toPayBack`. */
  payBack?: number;
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
  /** Still to pay back to the agent on cancelled bookings (Phase 9 Step 5). */
  payBack: number;
  margin: number;
  /**
   * Owed on bookings not yet in the system (owner, 2026-10-29). Already
   * included in `balance`; shown separately so it is never mistaken for a
   * booking's balance.
   */
  notInSystem: number;
}

/**
 * What is still owed on bookings not yet in the system (owner, 2026-10-29).
 *
 * The ageing report put an agent's balance above every booking the system held
 * for them. That excess is stored with the receivable it was measured against;
 * every rupee of receivable added since (a missing booking entered) is taken
 * out of it, so the agent's balance stays the same until the excess is used up.
 * After that, new bookings add to the balance as normal. Never negative.
 */
export function unbookedRemaining(input: {
  unbookedBalance: number | null;
  baseline: number | null;
  receivableNow: number;
}): number {
  if (input.unbookedBalance === null || !Number.isFinite(input.unbookedBalance)) return 0;
  const growth = Math.max(0, toPaisa(input.receivableNow) - toPaisa(input.baseline ?? 0));
  return Math.max(0, toPaisa(input.unbookedBalance) - growth) / 100;
}

const zero = (): Record<SeatType, number> => ({ umrah: 0, oneway: 0, tour: 0, other: 0 });

/** Adds lines in whole paisa, so a long list re-adds exactly. */
export function summarizeReceivables(lines: ReceivableLine[], notInSystem = 0): ReceivableSummary {
  const seats = zero();
  const paisa = zero();
  let recovered = 0, balance = 0, credit = 0, payBack = 0, margin = 0;
  for (const l of lines) {
    seats[l.seatType] += l.seats;
    paisa[l.seatType] += toPaisa(l.receivable);
    recovered += toPaisa(l.recovered);
    balance += toPaisa(l.balance);
    credit += toPaisa(l.credit);
    payBack += toPaisa(l.payBack ?? 0);
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
    // The balance left includes what is owed on bookings not yet in the system.
    balance: (balance + toPaisa(notInSystem)) / 100,
    credit: credit / 100,
    payBack: payBack / 100,
    margin: margin / 100,
    notInSystem: toPaisa(notInSystem) / 100,
  };
}

function toPaisa(v: number): number {
  return Number.isFinite(v) ? Math.round(v * 100) : 0;
}
