import type { PnrListRow } from './pnrs';

/**
 * "What EMDs do I have to issue on this date, and what will they cost?"
 *
 * The owner's request (2026-09-23): pick a date, and the dashboard says how
 * much EMD has to be issued that day and shows only the bookings behind it.
 * Widened on 2026-09-29 to one day **or a range** picked from a calendar.
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

/**
 * The days picked in the "EMDs to issue" calendar, inclusive. A single day is a
 * range whose `from` and `to` are the same (owner, 2026-09-29: pick one day or
 * a range from the calendar).
 */
export interface IssuanceRange {
  from: string;
  to: string;
}

export interface IssuanceDay {
  /** The range asked about, or null when nothing is picked. */
  range: IssuanceRange | null;
  /** Bookings whose next EMD must be issued within the range. */
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

/** Puts a two-click selection in order, so a range picked backwards still reads forwards. */
export function orderedRange(a: string, b: string): IssuanceRange {
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

/**
 * Whether a row belongs in the table when days are picked. The card counts
 * exactly these rows, so the two can never disagree.
 *
 * Only `active` bookings count. A cancelled or completed booking has no EMD to
 * issue, whatever date it still carries.
 */
export function matchesIssuanceRange(row: PnrListRow, range: IssuanceRange): boolean {
  const d = row.nextIssuanceDeadline;
  return row.status === 'active' && d !== null && d >= range.from && d <= range.to;
}

/**
 * The EMDs falling due within the picked days, across the rows the other
 * filters leave — the figure the "EMDs To Issue" card shows. Both ends are
 * included; a single day is `from === to`.
 */
export function emdsToIssueIn(rows: PnrListRow[], range: IssuanceRange | null): IssuanceDay {
  if (!range) return { range: null, bookings: 0, total: 0, undetermined: 0 };
  const due = rows.filter((r) => matchesIssuanceRange(r, range));
  return {
    range,
    bookings: due.length,
    total: sumMoney(due.map((r) => r.nextEmdAmount ?? 0)),
    undetermined: due.filter((r) => r.nextEmdAmount === null).length,
  };
}

/** The dates that actually have EMDs to issue, earliest first — for a picker. */
export function issuanceDates(rows: PnrListRow[]): string[] {
  const dates = rows
    .filter((r) => r.status === 'active' && r.nextIssuanceDeadline !== null)
    .map((r) => r.nextIssuanceDeadline as string);
  return [...new Set(dates)].sort();
}
