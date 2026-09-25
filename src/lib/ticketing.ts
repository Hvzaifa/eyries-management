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
 * Only the outbound DATE is stored — there is no departure time anywhere in the
 * data model — so 72 hours is applied as three calendar days before the outbound
 * date. Anything finer would be a false precision: with no departure time, a
 * "72 hours" instant cannot be derived.
 *
 * Returns null for any other airline and whenever the outbound date is unknown.
 * Like every other policy rule in this system, this is a **suggestion staff can
 * overwrite**, never a value that is enforced (business-rules.md).
 */
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
 * Tickets still to be issued = seats − tickets issued.
 *
 * **Calculated, never typed** (owner rule, 2026-09-19: issued and balance
 * together are the seats on the booking). This is the same principle as
 * `total_emd_value` and the seat-allocation figures — a number the system owns,
 * so the two counts cannot drift apart through a typo.
 *
 * Null while nothing has been issued, which keeps an untouched form empty rather
 * than asserting that every seat is unticketed.
 */
export function balanceTicketsFor(seats: number, ticketsIssued: number | null): number | null {
  if (ticketsIssued === null || !Number.isInteger(ticketsIssued) || ticketsIssued < 0) return null;
  return Math.max(0, seats - ticketsIssued);
}

/**
 * Seats that were never ticketed by the issuance deadline — **considered
 * cancelled** (owner rule, 2026-09-19).
 *
 * Worked out from the deadline and the counts, and deliberately **not stored**:
 * no `cancelled_tickets` column exists in `data-model.md` (rule 3), and a stored
 * count would go stale the moment the airline extended the deadline. Extend the
 * deadline and this simply reports nothing again.
 *
 * Returns null — meaning "say nothing" rather than "zero" — whenever the answer
 * is not actually known:
 *  - no issuance deadline recorded;
 *  - the deadline has not passed yet;
 *  - **no ticket count recorded at all.** Blank is not the same as zero: all
 *    1,483 legacy ticketing rows carry dates and no counts, so reading blank as
 *    "none issued" would declare every old booking wholly cancelled on the
 *    strength of data nobody ever entered (owner ruling, same day);
 *  - the booking is no longer active, where the PNR's own status is the fact.
 */
export function cancelledTickets(input: {
  todayIso: string;
  ticketIssuanceDeadline: string | null;
  ticketsIssued: number | null;
  balanceTickets: number | null;
  pnrStatus: string;
}): number | null {
  const { todayIso, ticketIssuanceDeadline, ticketsIssued, balanceTickets, pnrStatus } = input;

  if (pnrStatus !== 'active') return null;
  if (!ticketIssuanceDeadline) return null;
  if (ticketsIssued === null) return null;
  // ISO dates compare correctly as plain strings; the deadline day itself is
  // still a working day, so only a date strictly in the past counts.
  if (ticketIssuanceDeadline >= todayIso) return null;

  const outstanding = balanceTickets ?? 0;
  return outstanding > 0 ? outstanding : null;
}
