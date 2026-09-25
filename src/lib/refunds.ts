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
  emdAmount?: number
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
  return { date };
}
