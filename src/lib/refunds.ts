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
 * Deliberately NOT rejected: an amount larger than the round's own EMD amount.
 * That sounds like it must be wrong, but it is not written anywhere in
 * business-rules.md and one existing round in the live data already exceeds its
 * EMD amount — so enforcing it would contradict recorded company data. Left as
 * an open question for the owner (docs/decisions.md, 2026-09-07).
 */
export function validateRefund(
  amount: number | null,
  dateIso: string | null,
  currentStatus: string
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
  if (currentStatus === 'refunded') {
    return {
      error: 'This round is already refunded. Edit the round instead of refunding it again.',
    };
  }
  return { date };
}
