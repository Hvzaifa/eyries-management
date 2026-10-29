/**
 * Ticketing-stage logic (Phase 5 Step 1).
 *
 * Pure functions only — no database, no formatting — so the date and count rules
 * can be unit-tested (CLAUDE.md rule 4: anything involving dates or counts is
 * test-required).
 */

/**
 * Saudia's ticket-issuance policy: tickets must be issued **72 hours before
 * departure** (owner ruling, 2026-09-17).
 *
 * Applied as three calendar days before the outbound date, not 72 hours from
 * the departure time. When this was written no departure time was stored; the
 * owner kept the calendar-day rule once flight times became required (A4,
 * 2026-10-13: "outbound date − 3 days, not exactly 72 hours").
 *
 * Returns null for any other airline and whenever the outbound date is unknown.
 * Like every other policy rule in this system, this is a **suggestion staff can
 * overwrite**, never a value that is enforced (business-rules.md).
 */
import type { TicketPart } from './splits';

export const SV_TICKET_ISSUANCE_DAYS_BEFORE_DEPARTURE = 3;

export function svTicketIssuanceDeadline(
  airlineCode: string | null | undefined,
  outboundDateIso: string | null | undefined
): string | null {
  if (!airlineCode || airlineCode.trim().toUpperCase() !== 'SV') return null;
  if (!outboundDateIso) return null;

  const parts = outboundDateIso.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;

  const [y, m, d] = parts;
  // Date.UTC normalises the rollover, so month, year and leap-day boundaries are
  // handled by the calendar rather than by arithmetic on the day number.
  const t = new Date(Date.UTC(y, m - 1, d - SV_TICKET_ISSUANCE_DAYS_BEFORE_DEPARTURE));
  if (Number.isNaN(t.getTime())) return null;
  return t.toISOString().slice(0, 10);
}

export interface TicketingInput {
  nameUpdateDeadline: string | null;
  ticketIssuanceDeadline: string | null;
  status: string | null;
  ticketsIssued: number | null;
  balanceTickets: number | null;
}

/**
 * Validates what staff typed into the ticketing form.
 *
 * Deliberately narrow. It rejects what cannot be true of a count or a date, and
 * nothing else:
 *
 *  - ticket counts must be whole numbers that are not negative;
 *  - a date must be a real calendar date (`new Date('2026-02-30')` does NOT
 *    throw — it rolls over to 2 March, so an impossible date silently becomes a
 *    different, wrong one. The same trap was found in the refund path on
 *    2026-09-07 and is guarded the same way here: parse, then compare back);
 *  - **no more tickets than seats** (owner rule, 2026-09-19): tickets issued
 *    cannot exceed the booking's seats, and issued + balance cannot either —
 *    together they ARE the seats. `balanceTicketsFor` derives the balance so the
 *    two can never disagree; this check also guards a posted value.
 */
export function validateTicketing(
  input: TicketingInput,
  /** The booking's seats. Omit only where the seat count is genuinely unknown. */
  seats?: number
): { error: string } | null {
  for (const [label, value] of [
    ['Name update deadline', input.nameUpdateDeadline],
    ['Ticket issuance deadline', input.ticketIssuanceDeadline],
  ] as const) {
    if (value !== null && !isRealIsoDate(value)) {
      return { error: `${label} is not a valid date.` };
    }
  }

  for (const [label, value] of [
    ['Tickets issued', input.ticketsIssued],
    ['Balance tickets', input.balanceTickets],
  ] as const) {
    if (value === null) continue;
    if (!Number.isFinite(value)) return { error: `${label} must be a number.` };
    if (!Number.isInteger(value)) return { error: `${label} must be a whole number.` };
    if (value < 0) return { error: `${label} cannot be negative.` };
  }

  // Owner rule (2026-09-19): tickets issued and tickets still to be issued add
  // up to the seats on the booking, so neither — nor their sum — may exceed it.
  if (seats !== undefined && Number.isFinite(seats)) {
    if (input.ticketsIssued !== null && input.ticketsIssued > seats) {
      return {
        error: `Tickets issued (${input.ticketsIssued}) cannot exceed the ${seats} seats on this booking.`,
      };
    }
    if (input.balanceTickets !== null && input.balanceTickets > seats) {
      return {
        error: `Balance tickets (${input.balanceTickets}) cannot exceed the ${seats} seats on this booking.`,
      };
    }
    if (input.ticketsIssued !== null && input.balanceTickets !== null) {
      const total = input.ticketsIssued + input.balanceTickets;
      if (total > seats) {
        return {
          error: `Tickets issued (${input.ticketsIssued}) plus balance (${input.balanceTickets}) is ${total}, more than the ${seats} seats on this booking.`,
        };
      }
    }
  }

  return null;
}

/** True only for a `YYYY-MM-DD` string that names a date the calendar actually has. */
export function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return (
    parsed.getUTCFullYear() === y &&
    parsed.getUTCMonth() === m - 1 &&
    parsed.getUTCDate() === d
  );
}

/**
 * The ticket issuance deadline of a booking entered in the app: required (A6,
 * 2026-10-13: every new PNR has one when it is created), and no later than the
 * outbound departure date (owner, 2026-10-20). Older bookings are not held to
 * either, so they stay editable. Returns the problem, or null.
 */
export function ticketDeadlineError(deadlineIso: string | null, outboundDateIso: string | null): string | null {
  if (!deadlineIso) {
    return 'The ticket issuance deadline is required. For SV it is filled in as 3 days before departure; for other airlines enter the airline\u2019s deadline.';
  }
  if (!isRealIsoDate(deadlineIso)) return 'The ticket issuance deadline is not a valid date.';
  if (outboundDateIso && deadlineIso > outboundDateIso) {
    return `The ticket issuance deadline (${deadlineIso}) cannot be after the outbound departure date (${outboundDateIso}).`;
  }
  return null;
}

/**
 * Tickets still to be issued, once tickets issued is known: seats − issued.
 *
 * Since Phase 9 Step 4 (A8) the remaining count is what staff **type**, and
 * tickets issued is worked out from it (`ticketCountsFromAnswer`). This is used
 * only when the **seats change** after a count was recorded: the tickets already
 * issued stay issued, and the remainder is recalculated (owner, 2026-10-28).
 *
 * Null while nothing is recorded, which keeps an untouched form empty rather
 * than asserting that every seat is unticketed.
 */
export function balanceTicketsFor(seats: number, ticketsIssued: number | null): number | null {
  if (ticketsIssued === null || !Number.isInteger(ticketsIssued) || ticketsIssued < 0) return null;
  return Math.max(0, seats - ticketsIssued);
}

/** The answer to "All tickets issued?" (A8). Blank is "not answered", never zero. */
export type AllTicketsAnswer = '' | 'yes' | 'no';

/**
 * The two ticket counts stored for an answer to "All tickets issued?" (Phase 9
 * Step 4, A8, reversing the 2026-09-19 direction):
 *
 * - **not answered** — both null. Never read as zero;
 * - **Yes** — nothing remains (balance 0) and every seat is issued;
 * - **No** — staff type how many tickets remain, from 1 to the seats; tickets
 *   issued is seats − remaining. "No" with 0 remaining would contradict itself,
 *   so it is refused rather than read as Yes.
 */
export function ticketCountsFromAnswer(
  seats: number,
  answer: string | null,
  remaining: number | null
): { ticketsIssued: number | null; balanceTickets: number | null } | { error: string } {
  if (!answer) return { ticketsIssued: null, balanceTickets: null };
  if (answer === 'yes') return { ticketsIssued: seats, balanceTickets: 0 };
  if (answer !== 'no') return { error: 'Answer "All tickets issued?" with Yes or No, or leave it unanswered.' };
  if (remaining === null) return { error: 'Enter how many tickets remain to be issued.' };
  if (!Number.isFinite(remaining) || !Number.isInteger(remaining)) {
    return { error: 'Tickets remaining must be a whole number.' };
  }
  if (remaining < 1) return { error: 'If no tickets remain, answer Yes — all tickets are issued.' };
  if (remaining > seats) {
    return { error: `Tickets remaining (${remaining}) cannot be more than the ${seats} seats on this booking.` };
  }
  return { ticketsIssued: seats - remaining, balanceTickets: remaining };
}

/** The answer a stored remaining count represents, for pre-filling the form. */
export function allTicketsAnswerOf(balanceTickets: number | null): AllTicketsAnswer {
  if (balanceTickets === null) return '';
  return balanceTickets === 0 ? 'yes' : 'no';
}

/**
 * SV's allowance for unissued seats after the ticketing deadline: 10% of the
 * seats, **rounded down** (A9: 25 seats allow 2). Integer arithmetic, so no
 * floating-point 10% can round 30 down to 2.
 */
export function svUnissuedAllowance(seats: number): number {
  if (!Number.isInteger(seats) || seats <= 0) return 0;
  return Math.floor(seats / 10);
}

export interface UnissuedSeats {
  /** Tickets never issued: the recorded remaining count. */
  unissued: number;
  /** How many may go unissued without a penalty: SV 10% rounded down, others 0. */
  allowance: number;
  /** Unissued beyond the allowance. */
  overLimit: number;
  /** True when the airline's penalty applies (A9 beyond the allowance; A10 any). */
  penaltyCalledFor: boolean;
  isSv: boolean;
}

/**
 * Seats left unissued once ticketing has closed (Phase 9 Step 4, A9/A10 —
 * replaces 2026-09-19's "considered cancelled"). **Partial ticketing never
 * cancels the booking**; this only reports, so staff can enter a penalty.
 *
 * Ticketing has closed once the ticket issuance deadline has passed (the day
 * itself still counts as open). A booking with no deadline closes when its
 * outbound date has passed, the reading the owner gave for such bookings on
 * 2026-10-28.
 *
 * Null — "nothing to say", not zero — when the booking is not active, ticketing
 * has not closed, no count is recorded (blank is never zero), or nothing
 * remains.
 */
export function unissuedSeats(input: {
  airlineCode: string | null;
  seats: number;
  balanceTickets: number | null;
  ticketIssuanceDeadline: string | null;
  outboundDate: string | null;
  todayIso: string;
  pnrStatus: string;
}): UnissuedSeats | null {
  return unissuedAcross({
    airlineCode: input.airlineCode,
    seats: input.seats,
    parts: [{ seats: input.seats, ticketsIssued: null, balanceTickets: input.balanceTickets, ticketIssuanceDeadline: input.ticketIssuanceDeadline, outboundDate: input.outboundDate }],
    todayIso: input.todayIso,
    pnrStatus: input.pnrStatus,
  });
}

/**
 * Unissued seats for the **whole booking**, its own seats and its splits
 * together (Phase 9 Step 6; owner, 2026-10-29): reported once **every** part's
 * ticketing has closed (each its own deadline, or with none its outbound date)
 * and **every** part has a count recorded — one blank part means the total is
 * not known. Unissued is the sum of the parts' remaining tickets, and SV's 10%
 * is of all the booking's seats.
 */
export function unissuedAcross(input: {
  airlineCode: string | null;
  /** All the booking's seats, split or not. */
  seats: number;
  parts: TicketPart[];
  todayIso: string;
  pnrStatus: string;
}): UnissuedSeats | null {
  const { airlineCode, seats, parts, todayIso, pnrStatus } = input;
  if (pnrStatus !== 'active' || parts.length === 0) return null;
  for (const p of parts) {
    const closesOn = p.ticketIssuanceDeadline ?? p.outboundDate;
    if (!closesOn || closesOn >= todayIso) return null;
    if (p.balanceTickets === null) return null;
  }
  const remaining = parts.reduce((n, p) => n + (p.balanceTickets ?? 0), 0);
  if (remaining <= 0) return null;

  const isSv = (airlineCode ?? '').trim().toUpperCase() === 'SV';
  const allowance = isSv ? svUnissuedAllowance(seats) : 0;
  const overLimit = Math.max(0, remaining - allowance);
  return { unissued: remaining, allowance, overLimit, penaltyCalledFor: overLimit > 0, isSv };
}

/**
 * Whether penalties may be entered (owner, 2026-10-28): the outbound date has
 * passed **and** a penalty is called for — beyond SV's 10%, or any unissued seat
 * on another airline. A 30-seat SV booking with 3 unissued never gets one.
 */
export function penaltyEntryOpen(input: {
  outboundDate: string | null;
  todayIso: string;
  unissued: UnissuedSeats | null;
}): boolean {
  if (!input.outboundDate || input.outboundDate >= input.todayIso) return false;
  return !!input.unissued?.penaltyCalledFor;
}

/**
 * One penalty amount and its license, as staff entered them. Blank amount =
 * no penalty (and no license). An amount needs the license its penalty EMD was
 * issued against (2026-10-14). Zero is accepted — an airline that waived it
 * charged nothing, and that is a fact to record.
 */
export function validatePenalty(
  label: string,
  amount: number | null,
  licenseId: string | null
): { amount: number | null; licenseId: string | null } | { error: string } {
  if (amount === null) return { amount: null, licenseId: null };
  if (!Number.isFinite(amount)) return { error: `${label}: the penalty must be a number.` };
  if (amount < 0) return { error: `${label}: the penalty cannot be negative.` };
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) {
    return { error: `${label}: the penalty can have at most two decimal places.` };
  }
  if (!licenseId) return { error: `${label}: choose the license the penalty EMD was issued against.` };
  return { amount, licenseId };
}
