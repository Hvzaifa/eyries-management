import type { PnrListRow } from './pnrs';

/**
 * The five dashboard card values, computed from whatever rows the filters leave
 * visible.
 *
 * These used to come from the `dashboard_totals` SQL view, which was always
 * scoped to every active PNR the user could see and so ignored the filter bar
 * entirely — the page carried a note admitting it. Summing the rows already on
 * the page instead makes the cards agree with the table under any combination
 * of status, branch, airline and search.
 */
export interface DashboardSummary {
  /** Count of the PNRs the cards describe — not always the *active* count. */
  pnrCount: number;
  totalSeats: number;
  totalEmdValue: number;
  /** EMD the airline is holding across the visible rows (issued, not refunded). */
  totalIssued: number;
  totalRefunded: number;
}

/**
 * Sums money without float drift.
 *
 * Amounts are `decimal(14,2)` in Postgres but plain JS numbers by the time they
 * reach here, and adding a thousand of those accumulates a fraction of a paisa
 * per operation. Totalling whole paisa as integers keeps the sum exact, which
 * matters because these are the figures staff reconcile against.
 */
function sumMoney(values: number[]): number {
  const paisa = values.reduce((sum, v) => sum + Math.round(v * 100), 0);
  return paisa / 100;
}

/**
 * Card values for exactly the rows the filter bar leaves visible — status,
 * branch, airline, holder and the search box are all applied by the table
 * first. "All statuses" therefore totals every booking, cancelled and
 * completed included (owner, 2026-09-26, reversing the 2026-09-09 rule that
 * it meant active only).
 */
export function summarizeDashboard(rows: PnrListRow[]): DashboardSummary {
  return {
    pnrCount: rows.length,
    totalSeats: rows.reduce((sum, r) => sum + r.seats, 0),
    totalEmdValue: sumMoney(rows.map((r) => r.totalEmdValue ?? 0)),
    totalIssued: sumMoney(rows.map((r) => r.totalIssued)),
    totalRefunded: sumMoney(rows.map((r) => r.totalRefunded)),
  };
}

/**
 * Label for the count card, so it never claims to be counting something else.
 * "Active PNRs" sitting above a count of cancelled bookings is how a filtered
 * dashboard misleads someone.
 */
export function pnrCountLabel(statusFilter: string | null): string {
  if (!statusFilter) return 'PNRs Needing Action';
  return `${statusFilter.charAt(0).toUpperCase()}${statusFilter.slice(1)} PNRs`;
}

/**
 * Whether a booking belongs on the dashboard (owner, 2026-09-28: "as clean as
 * possible"). An active booking is listed only while something is still to be
 * done on it here:
 *
 * - an EMD still has to be issued (`emdsComplete` is false), or
 * - an IATA payment is not yet recorded (owed, dated or not).
 *
 * A booking whose EMDs are all issued and paid has nothing left but refunds,
 * which are worked from the Refunds page's "To be refunded" list. Cancelled and
 * completed bookings are not active work either; they appear only when the
 * status filter asks for them, so they stay reachable.
 */
export function isDashboardWork(row: Pick<PnrListRow, 'status' | 'emdsComplete' | 'nextIataPayment' | 'iataUndated'>): boolean {
  if (row.status !== 'active') return false;
  return !row.emdsComplete || row.nextIataPayment !== null || row.iataUndated;
}
