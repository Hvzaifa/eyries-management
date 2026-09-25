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
 * Validate a requested split against the seats the parent can actually give.
 *
 * `available` is what the parent may split away — from phase 6 that is its
 * **unassigned** seats (`seatLedger().unassigned`), not its whole seat count:
 * seats an agent already holds cannot be moved to a different PNR behind their
 * back. Callers pass the ledger figure; the wording here says "available to
 * split" rather than "holds", because with agents in the picture a PNR can hold
 * 50 seats and have none to give.
 */
export function validateSplit(available: number, requested: number): string | null {
  if (!Number.isFinite(requested) || !Number.isInteger(requested) || requested <= 0) {
    return 'Seats to allocate must be a positive whole number.';
  }
  if (requested > available) {
    return `Cannot allocate ${requested} seats. The parent PNR has only ${available} seat${available === 1 ? '' : 's'} available to split.`;
  }
  return null;
}

/** Seats a PNR has given away to children — history, shown for context only. */
export function seatsGivenToChildren(allocations: { seatsAllocated: number }[]): number {
  return allocations.reduce((sum, a) => sum + a.seatsAllocated, 0);
}
