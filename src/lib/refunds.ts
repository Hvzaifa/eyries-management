/**
 * Validation for recording an EMD refund.
 *
 * Pure and unit-tested, following the pattern of `emd.ts` and `seats.ts`:
 * CLAUDE.md rule 4 requires tests for anything touching money, and both refund
 * paths (the single Refund button and the Head Office bulk page) previously had
 * none — they wrote whatever arrived from the browser.
 *
 * Used by `recordEmdRefund` and `processBulkRefunds` so the two cannot drift.
 */

import { EMD_STATUSES } from './emd';
import type { TicketPart } from './splits';

/** Most rounds one bulk batch may refund at once, so the transaction can finish. */
export const MAX_BULK_REFUNDS = 500;

export type RefundCheck = { error: string } | { date: Date };

/**
 * Checks one proposed refund.
 *
 * Rejects: a missing/NaN/infinite amount, a negative amount, a missing or
 * malformed date, and a round that is already refunded (re-refunding silently
 * overwrote the original amount and date with no record of what they were).
 *
 * A refund may not exceed the round's own EMD amount (owner ruling, 2026-09-20).
 * This was deliberately NOT enforced before: it is not written in
 * business-rules.md and one imported round already exceeds its EMD amount, so
 * enforcing it would have contradicted recorded company data. The owner has
 * since ruled that the imported data is not the standard to build to — it will
 * be re-entered cleanly — so the rule now applies to every refund recorded from
 * here on. The one historic round is untouched and simply cannot be re-refunded.
 *
 * `emdAmount` is optional so an unknown round amount does not silently pass the
 * check: a caller that has the amount must pass it, and both callers do.
 */
export function validateRefund(
  amount: number | null,
  dateIso: string | null,
  currentStatus: string,
  emdAmount?: number,
  /** `pnrs.penalty_paid` — a forfeited round is refundable only once it is true. */
  penaltyPaid?: boolean | null
): RefundCheck {
  if (amount === null || typeof amount !== 'number' || !Number.isFinite(amount)) {
    return { error: 'Refund amount must be a number.' };
  }
  if (amount < 0) {
    return { error: 'Refund amount cannot be negative.' };
  }
  if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    return { error: 'Refund date is required, as a valid calendar date (YYYY-MM-DD).' };
  }
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return { error: `Refund date "${dateIso}" is not a real date.` };
  }
  // `new Date('2026-02-30')` does not throw — it rolls over into March. Compare
  // the parsed date back to the input so an impossible day is caught, not shifted.
  if (date.toISOString().slice(0, 10) !== dateIso) {
    return { error: `Refund date "${dateIso}" is not a real date.` };
  }
  if (emdAmount !== undefined && Number.isFinite(emdAmount) && amount > emdAmount) {
    return {
      error: `Refund of ${amount.toLocaleString('en-US')} is more than the round's EMD amount of ${emdAmount.toLocaleString('en-US')}. A refund cannot exceed what was deposited.`,
    };
  }
  if (currentStatus === 'refunded') {
    return {
      error: 'This round is already refunded. Edit the round instead of refunding it again.',
    };
  }
  if (!REFUNDABLE_STATUSES.includes(currentStatus)) {
    return { error: `A round that is ${currentStatus.replace('_', ' ')} cannot be refunded.` };
  }
  // A forfeited EMD comes back only after the airline's penalty is paid (B3).
  if (currentStatus === 'forfeited' && penaltyPaid !== true) {
    return { error: 'This EMD was forfeited when the booking was cancelled. Mark the penalty paid before recording its refund.' };
  }
  return { date };
}

/**
 * The statuses Head Office records a refund from (Phase 9 Step 3, A1): an
 * issued round, or one already requested. Requesting first is not required —
 * a refund inside the billing window that rolls the bill is recorded straight
 * from `issued`, as before.
 */
export const REFUNDABLE_STATUSES: string[] = ['issued', 'refund_requested', 'forfeited'];

/**
 * Whether a booking's paid EMDs belong on "To be refunded" yet (Phase 9 Step 3,
 * A6, reversing 2026-09-28's "paid means listed").
 *
 * Due when:
 * - every ticket is issued (tickets issued ≥ seats; owner, 2026-10-28: use the
 *   count staff type today, until Step 4's "All tickets issued?" replaces it), or
 * - the ticket issuance deadline passed at least a day ago (deadline < today), or
 * - with **no ticket deadline recorded**, the outbound date has passed (owner,
 *   2026-10-28). Before that it is not due and is flagged for a deadline to be
 *   entered; no date is guessed.
 *
 * A blank ticket count is "not answered", never zero, and never all issued.
 */
export type RefundTiming =
  | { due: true; why: 'tickets-issued' | 'ticket-deadline' | 'outbound-passed' }
  | { due: false; missingTicketDeadline: boolean };

export function refundTiming(input: {
  seats: number;
  ticketsIssued: number | null;
  ticketIssuanceDeadline: string | null;
  outboundDate: string | null;
  todayIso: string;
}): RefundTiming {
  const { seats, ticketsIssued, ticketIssuanceDeadline, outboundDate, todayIso } = input;
  if (seats > 0 && ticketsIssued !== null && ticketsIssued >= seats) return { due: true, why: 'tickets-issued' };
  if (ticketIssuanceDeadline) {
    return ticketIssuanceDeadline < todayIso
      ? { due: true, why: 'ticket-deadline' }
      : { due: false, missingTicketDeadline: false };
  }
  if (outboundDate && outboundDate < todayIso) return { due: true, why: 'outbound-passed' };
  return { due: false, missingTicketDeadline: true };
}

/**
 * Refund timing over every part of a booking — its own seats and each split
 * (Phase 9 Step 6; owner, 2026-10-29). The booking's EMDs cover every seat, so
 * they are due only once **every** part is: all tickets issued, or its own
 * ticket deadline (or, with none, its outbound date) passed. Nothing is refunded
 * while a split still flies on the EMD. If not due, `missingTicketDeadline` says
 * whether some part is waiting with no deadline recorded.
 */
export function partsRefundTiming(parts: TicketPart[], todayIso: string): RefundTiming {
  const timings = parts.map((p) => refundTiming({ ...p, todayIso }));
  if (timings.length === 0) return { due: false, missingTicketDeadline: false };
  const waiting = timings.filter((t): t is Extract<RefundTiming, { due: false }> => !t.due);
  if (waiting.length > 0) return { due: false, missingTicketDeadline: waiting.some((t) => t.missingTicketDeadline) };
  const whys = timings.map((t) => (t as Extract<RefundTiming, { due: true }>).why);
  return { due: true, why: whys.every((w) => w === 'tickets-issued') ? 'tickets-issued' : whys.includes('outbound-passed') ? 'outbound-passed' : 'ticket-deadline' };
}

/**
 * Why a round cannot be marked refund requested, or null when it can.
 *
 * Only a round on "To be refunded" may be marked (owner, 2026-10-28): issued,
 * paid to IATA (recorded or assumed), on a booking whose refund is due. The
 * system only flags; a person marks it. Who may mark it — a branch on its own
 * bookings, Head Office on any — is checked by the caller.
 */
export function refundRequestBlocker(input: {
  roundStatus: string;
  paidToIata: boolean;
  timing: RefundTiming;
}): string | null {
  if (input.roundStatus === 'refund_requested') return 'A refund has already been requested for this round.';
  if (input.roundStatus !== 'issued') return `A round that is ${input.roundStatus.replace('_', ' ')} cannot have a refund requested.`;
  if (!input.paidToIata) return 'This EMD is not paid to IATA yet, so its refund cannot be requested.';
  if (!input.timing.due) {
    return input.timing.missingTicketDeadline
      ? 'This booking has no ticket issuance deadline. Enter one under Ticketing, or wait until the outbound date has passed.'
      : 'The ticket issuance deadline has not passed yet, so this refund cannot be requested.';
  }
  return null;
}

/**
 * What the Edit round form may do to a round's status.
 *
 * A requested round never goes back to `issued` (A1). Requesting is not done
 * here either: it has its own action, which checks the round is on "To be
 * refunded" and is open to branches. Moving between `issued` and `refunded`
 * stays as it was.
 */
export function roundStatusEdit(from: string, to: string): { status: string } | { error: string } {
  if (from === to) return { status: to };
  // Forfeiture comes only from cancelling the booking, and a forfeited round
  // leaves it only through a recorded refund once the penalty is paid (Step 5).
  if (from === 'forfeited') {
    return { error: 'A forfeited round changes only when its refund is recorded, after the penalty is paid.' };
  }
  if (to === 'forfeited') return { error: 'A round is forfeited only by cancelling the booking.' };
  if (!(EMD_STATUSES as readonly string[]).includes(to)) return { error: `"${to}" is not an EMD round status.` };
  if (from === 'refund_requested' && to === 'issued') {
    return { error: 'A round whose refund has been requested cannot go back to issued.' };
  }
  if (to === 'refund_requested') {
    return { error: 'Use Request refund on the round, or on the To be refunded list, to request its refund.' };
  }
  return { status: to };
}
