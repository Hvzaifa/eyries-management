/**
 * Seat-allocation maths for parent/child PNR splits.
 *
 * The single rule everything here rests on (docs/decisions.md, 2026-09-01
 * "Parent seats display after split"):
 *
 *   **A PNR's `seats` is the number of seats it still holds.**
 *
 * Splitting decrements the parent at the moment of the split, and legacy-imported
 * PNRs were stored with their own seat count (children imported as separate rows).
 * So `seats` ALREADY excludes everything given to children, and the `allocations`
 * rows are a record of what was split away — never a further deduction.
 *
 * Subtracting `allocations` from `seats` double-counts every past split. On the
 * live data that produced a negative allowance on 12 of 37 parents, which blocked
 * any further split on them entirely.
 */

/** Seats a PNR may still allocate to a new child. */
export function unallocatedSeats(pnr: { seats: number }): number {
  return pnr.seats;
}

/**
 * Validate a requested split against the parent's remaining seats.
 * Returns an error message, or null when the split is allowed.
 */
export function validateSplit(parentSeats: number, requested: number): string | null {
  if (!Number.isFinite(requested) || !Number.isInteger(requested) || requested <= 0) {
    return 'Seats to allocate must be a positive whole number.';
  }
  if (requested > parentSeats) {
    return `Cannot allocate ${requested} seats. The parent PNR only holds ${parentSeats} seat${parentSeats === 1 ? '' : 's'}.`;
  }
  return null;
}

/** Seats a PNR has given away to children — history, shown for context only. */
export function seatsGivenToChildren(allocations: { seatsAllocated: number }[]): number {
  return allocations.reduce((sum, a) => sum + a.seatsAllocated, 0);
}
