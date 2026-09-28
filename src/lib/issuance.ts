import type { PnrListRow } from './pnrs';

/**
 * "What EMDs do I have to issue on this date, and what will they cost?"
 *
 * The owner's request (2026-09-23): pick a date, and the dashboard says how
 * much EMD has to be issued that day and shows only the bookings behind it.
 *
 * **The figure is the deposits themselves** — `seats × fare × the next round's
 * policy percentage` — not the bookings' total EMD value. It answers "how much
 * money do I need ready on the 20th", which is the question someone picking a
 * date is asking.
 */

/** 1st, 2nd, 3rd, 4th… including the 11th/12th/13th exceptions. */
export function ordinal(n: number): string {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

/**
 * Rounds the airline policy has. After the 2nd EMD the next step is issuing
 * the tickets, so no 3rd or 4th EMD is ever suggested — one exists only when
 * staff create it (owner, 2026-09-28).
 */
export const FINAL_EMD_ROUND = 2;

export interface NextStep {
  /**
   * `emd`: round `emdRound` must be issued by `deadline`.
   * `tickets`: every EMD is issued; `deadline` is when the tickets are due.
   * The system keeps no record of tickets being issued, so a `tickets`
   * deadline is shown for information only — never coloured as urgent.
   */
  kind: 'emd' | 'tickets';
  emdRound: number | null;
  deadline: string | null;
}

/**
 * What a booking is waiting for, and by when.
 *
 * **The time limit in force is the latest round's.** Each EMD secures the PNR
 * to a new time limit, so issuing round 2 meets round 1's — whether or not
 * round 1's refund has been recorded yet. Reading the earliest unrefunded round
 * instead showed "Overdue since …" on bookings whose next EMD had been issued
 * on time and whose IATA payment was done (owner report, 2026-09-28).
 */
export function nextStep(input: {
  rounds: { roundNumber: number; deadlineDate: string | null }[];
  pnrTlDate: string | null;
  ticketIssuanceDeadline: string | null;
}): NextStep {
  const { rounds, pnrTlDate, ticketIssuanceDeadline } = input;
  if (rounds.length === 0) return { kind: 'emd', emdRound: 1, deadline: pnrTlDate };
  const latest = rounds.reduce((a, b) => (b.roundNumber > a.roundNumber ? b : a));
  if (rounds.length < FINAL_EMD_ROUND) {
    return { kind: 'emd', emdRound: rounds.length + 1, deadline: latest.deadlineDate ?? pnrTlDate };
  }
  // The ticketing record's own deadline first: round 2's `deadline_date` can
  // hold the EMD-2 policy date written by the daily backfill, which is not a
  // ticket deadline.
  return { kind: 'tickets', emdRound: null, deadline: ticketIssuanceDeadline ?? latest.deadlineDate };
}

/** "1st EMD", "2nd EMD" — which round a booking has to issue next. */
export function nextEmdLabel(roundsIssued: number): string {
  return `${ordinal(roundsIssued + 1)} EMD`;
}

export interface IssuanceDay {
  /** The date asked about, or null when none was picked. */
  date: string | null;
  /** Bookings whose next EMD must be issued on that date. */
  bookings: number;
  /** What those EMDs are worth, where the policy can price them. */
  total: number;
  /**
   * Of those bookings, how many have no derivable amount — no airline policy
   * covers them, so staff type the figure when they issue it.
   *
   * Reported rather than folded in. Treating an unknown as zero would make a
   * day's total quietly short, and a total that is short is worse than a total
   * that admits what it is missing.
   */
  undetermined: number;
}

/** Money summed in whole paisa, as everywhere else — floats drift. */
function sumMoney(values: number[]): number {
  return values.reduce((sum, v) => sum + Math.round(v * 100), 0) / 100;
}

/**
 * The EMDs falling due on one date, across the rows the other filters leave.
 *
 * **That date exactly**, not "on or before" (owner's choice, 2026-09-23): the
 * question is what one day's work is worth. Anything overdue from an earlier
 * date stays under its own date.
 *
 * Only `active` bookings count. A cancelled or completed booking has no EMD to
 * issue, whatever date it still carries.
 */
export function emdsToIssueOn(rows: PnrListRow[], dateIso: string | null): IssuanceDay {
  if (!dateIso) return { date: null, bookings: 0, total: 0, undetermined: 0 };

  const due = rows.filter(
    (r) => r.status === 'active' && r.nextIssuanceDeadline === dateIso
  );

  return {
    date: dateIso,
    bookings: due.length,
    total: sumMoney(due.map((r) => r.nextEmdAmount ?? 0)),
    undetermined: due.filter((r) => r.nextEmdAmount === null).length,
  };
}

/**
 * Whether a row belongs in the table when a date is picked.
 *
 * Kept beside `emdsToIssueOn` so the card and the rows below it can never
 * disagree about which bookings a date covers.
 */
export function matchesIssuanceDate(row: PnrListRow, dateIso: string): boolean {
  return row.status === 'active' && row.nextIssuanceDeadline === dateIso;
}

/** The dates that actually have EMDs to issue, earliest first — for a picker. */
export function issuanceDates(rows: PnrListRow[]): string[] {
  const dates = rows
    .filter((r) => r.status === 'active' && r.nextIssuanceDeadline !== null)
    .map((r) => r.nextIssuanceDeadline as string);
  return [...new Set(dates)].sort();
}
