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
  totalPaid: number;
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
 * Card values for the currently visible rows.
 *
 * `statusFilter` is the status the user picked in the filter bar, or null for
 * "All statuses". With no status chosen the cards fall back to **active PNRs
 * only** — the meaning they have always had, so the headline figures do not move
 * just because the table happens to list cancelled and completed bookings too
 * (owner's ruling, 2026-09-09). Every other filter is already applied to
 * `filteredRows` by the table, including the search box.
 */
export function summarizeDashboard(
  filteredRows: PnrListRow[],
  statusFilter: string | null
): DashboardSummary {
  const rows = statusFilter ? filteredRows : filteredRows.filter((r) => r.status === 'active');

  return {
    pnrCount: rows.length,
    totalSeats: rows.reduce((sum, r) => sum + r.seats, 0),
    totalEmdValue: sumMoney(rows.map((r) => r.totalEmdValue ?? 0)),
    totalPaid: sumMoney(rows.map((r) => r.totalPaid)),
    totalRefunded: sumMoney(rows.map((r) => r.totalRefunded)),
  };
}

/**
 * Label for the count card, so it never claims to be counting something else.
 * "Active PNRs" sitting above a count of cancelled bookings is how a filtered
 * dashboard misleads someone.
 */
export function pnrCountLabel(statusFilter: string | null): string {
  if (!statusFilter) return 'Active PNRs';
  return `${statusFilter.charAt(0).toUpperCase()}${statusFilter.slice(1)} PNRs`;
}
