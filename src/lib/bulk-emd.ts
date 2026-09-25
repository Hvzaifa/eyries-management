/**
 * Shapes and rules for issuing EMDs in bulk (2026-09-21).
 *
 * Separate from the server action because a `'use server'` module may export
 * nothing but async functions — a constant or a type declared there fails the
 * build. Keeping them here also lets the form import them without pulling the
 * action's database code into the browser bundle.
 */

/**
 * Most bookings one batch may cover. The real limit is what a person can check
 * on screen; this keeps the transaction bounded either way.
 */
export const MAX_BULK_EMD_ISSUES = 100;

/**
 * The airline's EMD reference: 13 digits, written `123 4567890123`.
 *
 * One definition, because the same rule is enforced when issuing one round,
 * issuing many, and editing one — and three copies of a regular expression is
 * three chances for them to diverge.
 */
const EMD_NUMBER_PATTERN = /^\d{3} \d{10}$/;

export const EMD_NUMBER_HINT =
  'The EMD number must be exactly 13 digits with a space after the first three (e.g. 123 4567890123).';

export function isValidEmdNumber(value: string | null | undefined): boolean {
  return typeof value === 'string' && EMD_NUMBER_PATTERN.test(value.trim());
}

export interface BulkEmdCandidate {
  pnrId: string;
  pnrCode: string;
  srNo: number;
  airlineCode: string | null;
  branchName: string | null;
  licenseName: string | null;
  seats: number;
  fare: number;
  totalEmdValue: number;
  outboundDate: string | null;
  /** The deadline this EMD is being issued against — the booking's current TL. */
  issueBy: string | null;
  roundsIssued: number;
  /** Pre-filled figures for the round about to be issued. */
  roundNumber: number;
  suggestedPct: number | null;
  suggestedAmount: number | null;
  suggestedDeadline: string | null;
  /** Set when this booking cannot take an EMD right now, with the reason. */
  blockedReason: string | null;
}

export interface BulkEmdRow {
  pnrId: string;
  emdNumber: string;
  paymentPct: number;
  emdAmount: number;
  /** The time limit this EMD secures the PNR to, `YYYY-MM-DD`. */
  deadlineDate: string;
  licenseId?: string | null;
}

export interface BulkEmdResult {
  ok: boolean;
  error?: string;
  issued?: number;
}
