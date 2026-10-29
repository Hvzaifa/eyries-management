/**
 * Splits kept inside a booking (Phase 9 Step 6; owner, 2026-10-29).
 *
 * A split is part of a booking's seats flying on other dates. It is **not a
 * separate booking**: no dashboard row, an optional PNR code, and the booking
 * keeps its full seat count and its one set of EMD rounds (owner, 2026-10-29,
 * reversing 2026-09-01). Its seats come from **one holder** — one agent's
 * assignment, or the company's unassigned seats — and stay with that holder on
 * the same terms. It has its own ticket issuance deadline and its own "All
 * tickets issued?" answer; the booking answers for the seats not in a split.
 *
 * Pure — no database — so the seat and date rules are tested.
 */

import { isRealIsoDate, svTicketIssuanceDeadline } from './ticketing';
import { pnrCodeKey, validatePnrCode } from './booking-entry';

export interface SplitRecord {
  id: string;
  /** The agent assignment the seats came from; null = the company's seats. */
  assignmentId: string | null;
  seats: number;
  pnrCode: string | null;
  outboundDate: string;
  inboundDate: string | null;
  ticketIssuanceDeadline: string | null;
  ticketsIssued: number | null;
  balanceTickets: number | null;
}

/** Seats in splits, in total. */
export function splitSeats(splits: Pick<SplitRecord, 'seats'>[]): number {
  return splits.reduce((s, x) => s + x.seats, 0);
}

/**
 * Seats one holder can still put into a new split: the agent's seats (or the
 * company's unassigned seats) less what that holder already has in splits.
 */
export function splittableSeats(input: {
  /** The assignment's seats, or the booking's unassigned seats for the company. */
  holderSeats: number;
  assignmentId: string | null;
  splits: Pick<SplitRecord, 'assignmentId' | 'seats'>[];
}): number {
  const used = input.splits.filter((s) => s.assignmentId === input.assignmentId).reduce((n, s) => n + s.seats, 0);
  return Math.max(0, input.holderSeats - used);
}

export interface SplitDraft {
  seats: number | null;
  pnrCode: string | null;
  outboundDate: string | null;
  inboundDate: string | null;
  ticketIssuanceDeadline: string | null;
}

/**
 * What staff typed for a split, checked. Returns the clean values or the
 * reason they cannot be saved.
 *
 * - **SV only** (A3), and only on an active booking;
 * - seats: a whole number from 1 to what the holder can still split
 *   (`available`), unless editing, when the seats are fixed;
 * - PNR code: optional; if given, a valid code (uniqueness is checked against
 *   the database by the caller);
 * - outbound date required; inbound required on a round trip, none on a one-way,
 *   and never before the outbound;
 * - at least one of the PNR code and the dates must differ from the booking — a
 *   split identical to its booking records nothing;
 * - a ticket issuance deadline is required (for SV it is pre-filled as the
 *   split's outbound − 3) and not after the split's outbound date.
 */
export function validateSplitDraft(
  draft: SplitDraft,
  booking: {
    status: string;
    airlineCode: string | null;
    tripType: string | null;
    outboundDate: string | null;
    inboundDate: string | null;
    pnrCode: string;
  },
  /** Seats the chosen holder can still split. Null when editing (seats fixed). */
  available: number | null
):
  | { error: string }
  | { seats: number | null; pnrCode: string | null; outboundDate: string; inboundDate: string | null; ticketIssuanceDeadline: string } {
  if ((booking.airlineCode ?? '').trim().toUpperCase() !== 'SV') return { error: 'Only SV bookings can be split.' };
  if (booking.status !== 'active') return { error: `Only an active booking can be split; this one is ${booking.status}.` };

  let seats: number | null = null;
  if (available !== null) {
    const n = draft.seats;
    if (n === null || !Number.isInteger(n) || n < 1) return { error: 'Seats to split must be a whole number of at least 1.' };
    if (n > available) {
      return { error: `Only ${available} seat${available === 1 ? ' is' : 's are'} available to split from this holder.` };
    }
    seats = n;
  }

  let pnrCode: string | null = null;
  if (draft.pnrCode && draft.pnrCode.trim()) {
    const bad = validatePnrCode(draft.pnrCode);
    if (bad) return bad;
    pnrCode = pnrCodeKey(draft.pnrCode);
    if (pnrCode === pnrCodeKey(booking.pnrCode)) return { error: 'The split’s PNR code is the booking’s own code. Leave it blank or enter the new code.' };
  }

  const out = draft.outboundDate;
  if (!out || !isRealIsoDate(out)) return { error: 'The split’s outbound date is required.' };
  const oneWay = booking.tripType === 'one_way';
  const inb = oneWay ? null : draft.inboundDate;
  if (!oneWay) {
    if (!inb || !isRealIsoDate(inb)) return { error: 'The split’s inbound date is required.' };
    if (inb < out) return { error: 'The split’s inbound date cannot be before its outbound date.' };
  } else if (draft.inboundDate) {
    return { error: 'A one-way booking has no return, so its split has no inbound date.' };
  }

  if (!pnrCode && out === booking.outboundDate && inb === (oneWay ? null : booking.inboundDate)) {
    return { error: 'This split has the booking’s own dates and no new PNR code, so it records nothing. Change a date or enter the new code.' };
  }

  const deadline = draft.ticketIssuanceDeadline;
  if (!deadline) return { error: 'The split’s ticket issuance deadline is required (for SV, 3 days before its outbound date).' };
  if (!isRealIsoDate(deadline)) return { error: 'The split’s ticket issuance deadline is not a valid date.' };
  if (deadline > out) {
    return { error: `The split’s ticket issuance deadline (${deadline}) cannot be after its outbound date (${out}).` };
  }

  return { seats, pnrCode, outboundDate: out, inboundDate: inb, ticketIssuanceDeadline: deadline };
}

/** The SV deadline a new split's form pre-fills: its outbound − 3 days. */
export function suggestedSplitDeadline(outboundDate: string | null): string | null {
  return svTicketIssuanceDeadline('SV', outboundDate);
}

/** A split can be removed — its seats back on the booking — until a ticket count is recorded on it. */
export function splitRemovable(split: Pick<SplitRecord, 'balanceTickets'>): boolean {
  return split.balanceTickets === null;
}

/**
 * One part of a booking for ticketing: the booking's own seats (those not in a
 * split), or one split. Refund timing, unissued seats and the "no tickets
 * issued" cancellation flag are judged over **every** part (owner, 2026-10-29).
 */
export interface TicketPart {
  seats: number;
  ticketsIssued: number | null;
  balanceTickets: number | null;
  ticketIssuanceDeadline: string | null;
  outboundDate: string | null;
}

/**
 * The booking's parts: its own seats first (seats − split seats, with its
 * `ticketing` counts and its dates), then each split. A part with no seats —
 * every seat split away — is left out.
 */
export function ticketParts(
  booking: {
    seats: number;
    ticketsIssued: number | null;
    balanceTickets: number | null;
    ticketIssuanceDeadline: string | null;
    outboundDate: string | null;
  },
  splits: Pick<SplitRecord, 'seats' | 'ticketsIssued' | 'balanceTickets' | 'ticketIssuanceDeadline' | 'outboundDate'>[]
): TicketPart[] {
  const own: TicketPart = {
    seats: booking.seats - splitSeats(splits),
    ticketsIssued: booking.ticketsIssued,
    balanceTickets: booking.balanceTickets,
    ticketIssuanceDeadline: booking.ticketIssuanceDeadline,
    outboundDate: booking.outboundDate,
  };
  return [own, ...splits.map((s) => ({ ...s }))].filter((p) => p.seats > 0);
}

/** The last day any part flies out — every part has departed after it. */
export function lastOutbound(parts: Pick<TicketPart, 'outboundDate'>[]): string | null {
  const dates = parts.map((p) => p.outboundDate);
  if (dates.some((d) => !d)) return null;
  return (dates as string[]).sort().at(-1) ?? null;
}
