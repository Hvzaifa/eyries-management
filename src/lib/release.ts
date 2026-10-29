/**
 * Releasing a PNR (Phase 9 Step 2; rulings A2 and B3, 2026-10-13).
 *
 * A booking ends in one of two ways. **Released**: it ends before EMD-1 is
 * issued, deliberately or because the EMD-1 deadline was missed — a person
 * does it, with a reason. **Cancelled**: the EMD-2 or ticketing deadline was
 * missed; flagged, and a person cancels it with a reason (Step 5,
 * `cancellation.ts`). Pure — no database — so the rules are tested.
 */

/** Every value `pnrs.status` may hold. */
export const PNR_STATUSES = ['active', 'released', 'cancelled', 'completed'] as const;

/**
 * The statuses the booking form may set (owner, 2026-10-20). `released` is set
 * only by the Release action, which takes a reason; `cancelled` is no longer
 * set by the form — before EMD-1 a booking is released, after it a flagged
 * booking is cancelled from the booking page (Step 5).
 */
export const FORM_STATUSES = ['active', 'completed'] as const;

/**
 * The status a booking form save may write, or the reason it may not. An
 * unchanged status is always kept, so a booking recorded as cancelled still
 * saves. A released or cancelled booking can never be moved out of that
 * status: neither can be undone (Steps 2 and 5).
 */
export function formStatusChange(current: string | null, posted: string | null): { status: string } | { error: string } {
  const next = posted ?? current ?? 'active';
  if (current === 'released' && next !== 'released') {
    return { error: 'This booking was released, and a release cannot be undone.' };
  }
  if (current === 'cancelled' && next !== 'cancelled') {
    return { error: 'This booking was cancelled, and a cancellation cannot be undone.' };
  }
  if (next === 'cancelled' && current !== 'cancelled') {
    return { error: 'Use Cancel on the booking page to cancel a flagged booking, with a reason.' };
  }
  if (next === current) return { status: next };
  if (next === 'released') return { error: 'Use Release on the booking page to release it, with a reason.' };
  if (!(FORM_STATUSES as readonly string[]).includes(next)) {
    return { error: `Status must be one of: ${FORM_STATUSES.join(', ')}.` };
  }
  return { status: next };
}

export interface ReleaseCheck {
  status: string;
  /** EMD rounds recorded on the booking, in any status. */
  roundCount: number;
  /** Payments recorded from agents on this booking, including on seats since taken back. */
  agentPaymentCount: number;
  reason: string | null;
}

/** The longest release reason kept. */
export const MAX_RELEASE_REASON = 500;

/**
 * Why this booking cannot be released, or null when it can.
 *
 * - only an active booking can be released;
 * - never once any EMD round exists, for Head Office too (A2);
 * - never when an agent has paid anything on it — including on seats later
 *   taken back (owner, 2026-10-20), so money received is never left hanging;
 * - a reason is required.
 */
export function releaseBlocker(input: ReleaseCheck): string | null {
  if (input.status === 'released') return 'This booking is already released.';
  if (input.status !== 'active') return `Only an active booking can be released; this one is ${input.status}.`;
  if (input.roundCount > 0) {
    return 'An EMD has been issued on this booking, so it can no longer be released.';
  }
  if (input.agentPaymentCount > 0) {
    return 'An agent has paid on this booking, so it cannot be released.';
  }
  const reason = input.reason?.trim() ?? '';
  if (!reason) return 'A reason is required to release a booking.';
  if (reason.length > MAX_RELEASE_REASON) return `The reason can be at most ${MAX_RELEASE_REASON} characters.`;
  return null;
}

/**
 * At risk — confirm with the airline: an active booking whose EMD-1 issuance
 * deadline (`pnr_tl_date` while no round exists) has passed with no EMD issued.
 * Only a flag: a person releases it; the system never changes the status (A2).
 * The deadline day itself is not yet passed.
 */
export function emd1AtRisk(input: {
  status: string;
  roundCount: number;
  pnrTlDate: string | null;
  todayIso: string;
}): boolean {
  return input.status === 'active' && input.roundCount === 0 && !!input.pnrTlDate && input.pnrTlDate < input.todayIso;
}
