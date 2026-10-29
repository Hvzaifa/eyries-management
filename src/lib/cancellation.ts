/**
 * Cancelling a PNR after EMD-1 (Phase 9 Step 5; B3, 2026-10-13/14).
 *
 * **Flagged, never automatic** (owner, 2026-10-28, reversing the 2026-10-14
 * auto-cancellation): the system flags a booking whose EMD-2 or ticketing
 * deadline was missed, and a person decides whether to cancel it, with a
 * reason. A booking staff keep alive stays flagged until the cause goes away
 * (EMD-2 issued, or a ticket count recorded). Cancelling can't be undone.
 *
 * Pure — no database — so the rules are tested.
 */

import { iataPaymentState } from './iata-payments';
import { ticketParts, type SplitRecord } from './splits';

/**
 * Only bookings created on or after this day (Pakistan time) are ever flagged
 * (owner, 2026-10-28: "created from tomorrow"). Every booking before it,
 * imported or entered in the app, is never flagged.
 */
export const CANCELLATION_FLAGS_FROM = '2026-10-29';

/** The longest cancellation reason kept. */
export const MAX_CANCEL_REASON = 500;

export interface FlagRound {
  roundNumber: number;
  status: string;
  paymentPct: number;
  deadlineDate: string | null;
  issuanceDate: string | null;
  paymentDate: string | null;
  refundDate: string | null;
}

/**
 * A round refunded inside its IATA billing window to move the bill a cycle
 * ("rolled"). Its re-issue is the same EMD under a new number, so the two count
 * as one (owner, 2026-10-28). Both are still shown in the system as records.
 */
export function isRolledRound(r: FlagRound, todayIso: string): boolean {
  return (
    r.status === 'refunded' &&
    iataPaymentState({
      issuanceDate: r.issuanceDate,
      paymentDate: r.paymentDate,
      refundDate: r.refundDate,
      roundStatus: r.status,
      todayIso,
    }).status === 'rolled'
  );
}

/**
 * The EMDs actually issued on a booking, in order: every round except a rolled
 * one, which its re-issue stands for. Used only by the cancellation flags; the
 * booking page and dashboard still show and count every round (owner,
 * 2026-10-28).
 */
export function distinctEmds(rounds: FlagRound[], todayIso: string): FlagRound[] {
  return rounds
    .filter((r) => !isRolledRound(r, todayIso))
    .slice()
    .sort((a, b) => a.roundNumber - b.roundNumber);
}

/**
 * EMD-1's deadline — the date by which EMD-2 must be issued: the one recorded
 * on EMD-1 (the policy date for SV, typed for other airlines). When EMD-1 is a
 * re-issue of a rolled round and carries no date, the rolled round's own date
 * at the same percentage stands for it, being the same EMD.
 */
export function emd2Deadline(rounds: FlagRound[], todayIso: string): string | null {
  const emd1 = distinctEmds(rounds, todayIso)[0];
  if (!emd1) return null;
  if (emd1.deadlineDate) return emd1.deadlineDate;
  const earlier = rounds
    .filter((r) => r.roundNumber < emd1.roundNumber && isRolledRound(r, todayIso) && r.paymentPct === emd1.paymentPct && r.deadlineDate)
    .sort((a, b) => b.roundNumber - a.roundNumber)[0];
  return earlier?.deadlineDate ?? null;
}

export type CancellationTrigger = 'emd2' | 'ticketing';

export interface CancellationFlag {
  trigger: CancellationTrigger;
  /** The deadline that was missed. */
  deadline: string;
}

/**
 * Why this booking is up for a cancellation decision, or null.
 *
 * - **EMD-2:** EMD-1 is the only EMD issued, it covers less than 100%, and the
 *   deadline recorded on it has passed (the day itself is not yet passed).
 * - **Ticketing:** the EMDs are complete — EMD-2 issued, or EMD-1 covering 100%
 *   (owner, 2026-10-28) — the ticket issuance deadline has passed, and staff
 *   **recorded that no tickets were issued** (remaining = every seat). A blank
 *   count never flags.
 *
 * Only an active booking created on or after `CANCELLATION_FLAGS_FROM`.
 */
export function cancellationFlag(input: {
  status: string;
  /** The day the booking was created, in Pakistan time. */
  createdOnIso: string;
  seats: number;
  rounds: FlagRound[];
  ticketIssuanceDeadline: string | null;
  balanceTickets: number | null;
  todayIso: string;
  /**
   * Splits inside the booking (Phase 9 Step 6). The ticketing trigger needs
   * every part — the booking's own seats and each split — past its own
   * deadline with no tickets recorded as issued (owner, 2026-10-29).
   */
  splits?: Pick<SplitRecord, 'seats' | 'ticketsIssued' | 'balanceTickets' | 'ticketIssuanceDeadline' | 'outboundDate'>[];
}): CancellationFlag | null {
  const { status, createdOnIso, seats, rounds, ticketIssuanceDeadline, balanceTickets, todayIso } = input;
  if (status !== 'active') return null;
  if (createdOnIso < CANCELLATION_FLAGS_FROM) return null;

  const emds = distinctEmds(rounds, todayIso);
  if (emds.length === 0) return null;
  const fullFirst = emds[0].paymentPct >= 100;

  if (emds.length === 1 && !fullFirst) {
    const deadline = emd2Deadline(rounds, todayIso);
    return deadline && deadline < todayIso ? { trigger: 'emd2', deadline } : null;
  }

  const parts = ticketParts(
    { seats, ticketsIssued: null, balanceTickets, ticketIssuanceDeadline, outboundDate: null },
    input.splits ?? []
  );
  const noneIssued =
    parts.length > 0 &&
    parts.every(
      (p) =>
        p.ticketIssuanceDeadline !== null &&
        p.ticketIssuanceDeadline < todayIso &&
        p.balanceTickets !== null &&
        p.balanceTickets >= p.seats
    );
  if (noneIssued) {
    // The last deadline missed is the one that completed the trigger.
    const deadline = parts.map((p) => p.ticketIssuanceDeadline as string).sort().at(-1)!;
    return { trigger: 'ticketing', deadline };
  }
  return null;
}

/** The flag in words, for the dashboard, the booking page and the history. */
export function describeFlag(flag: CancellationFlag): string {
  return flag.trigger === 'emd2'
    ? `EMD-2 was not issued by ${flag.deadline}`
    : `No tickets were issued by the ticket deadline (${flag.deadline})`;
}

/**
 * Why this booking cannot be cancelled now, or null. Only a flagged booking,
 * and a reason is required.
 */
export function cancelBlocker(input: { status: string; flag: CancellationFlag | null; reason: string | null }): string | null {
  if (input.status === 'cancelled') return 'This booking is already cancelled.';
  if (input.status !== 'active') return `Only an active booking can be cancelled; this one is ${input.status}.`;
  if (!input.flag) {
    return 'This booking is not flagged for cancellation: its EMD-2 and ticketing deadlines have not been missed.';
  }
  const reason = input.reason?.trim() ?? '';
  if (!reason) return 'A reason is required to cancel a booking.';
  if (reason.length > MAX_CANCEL_REASON) return `The reason can be at most ${MAX_CANCEL_REASON} characters.`;
  return null;
}

/**
 * The round statuses forfeited on cancellation: every round the airline still
 * holds — issued, or refund requested (owner, 2026-10-28: the whole PNR is
 * forfeited). A refunded round keeps its refund: a rolled one is only the
 * earlier record of an EMD whose re-issue is forfeited, and money that came
 * back does not go again.
 */
export const FORFEITED_FROM_STATUSES = ['issued', 'refund_requested'];

/**
 * An agent's money on a cancelled booking (B3; owner, 2026-10-14 and
 * 2026-10-28). They no longer owe their fare, terms or the unpaid rest of
 * their EMD share — only their penalty. What they paid beyond it is paid back.
 *
 * - `owes` — the penalty not yet covered by what they paid (paid 20,000 with a
 *   50,000 penalty owes 30,000);
 * - `toPayBack` — paid, less the penalty, less paybacks already made.
 *
 * `penaltyEntered` is false while the penalty is blank (blank is "not entered",
 * never zero), and nothing is paid back until it is.
 */
export interface CancelledAgentMoney {
  paid: number;
  penalty: number;
  penaltyEntered: boolean;
  paidBack: number;
  owes: number;
  toPayBack: number;
}

function toPaisa(value: number): number {
  return Math.round(value * 100);
}

function sumPaisa(values: number[]): number {
  return values.reduce((s, v) => s + (Number.isFinite(v) ? toPaisa(v) : 0), 0);
}

export function cancelledAgentMoney(input: {
  recoveries: number[];
  penalty: number | null;
  paybacks: number[];
}): CancelledAgentMoney {
  const paid = sumPaisa(input.recoveries);
  const penaltyEntered = input.penalty !== null && Number.isFinite(input.penalty) && input.penalty >= 0;
  const penalty = penaltyEntered ? toPaisa(input.penalty as number) : 0;
  const paidBack = sumPaisa(input.paybacks);
  // Positive: the agent is owed money back. Negative: the agent owes.
  const net = paid - paidBack - penalty;
  return {
    paid: paid / 100,
    penalty: penalty / 100,
    penaltyEntered,
    paidBack: paidBack / 100,
    owes: Math.max(0, -net) / 100,
    toPayBack: penaltyEntered ? Math.max(0, net) / 100 : 0,
  };
}

export type PaybackCheck = { error: string } | { date: Date };

/**
 * Checks one payback, in the shape of `validateRefund` / `validateRecovery`: a
 * positive amount, a real date not in the future — and never more than is owed
 * back (owner, 2026-10-28), so a payback can never put the agent in debt.
 * Several part paybacks are allowed up to that amount. Nothing is paid back
 * before the agent's penalty is entered.
 */
export function validatePayback(
  amount: number | null,
  dateIso: string | null,
  todayIso: string,
  money: CancelledAgentMoney
): PaybackCheck {
  if (!money.penaltyEntered) {
    return { error: 'Enter this agent’s penalty first (0 if none); the payback is what they paid less it.' };
  }
  if (amount === null || !Number.isFinite(amount)) return { error: 'Payback amount must be a number.' };
  if (amount <= 0) return { error: 'Payback amount must be more than zero.' };
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) {
    return { error: 'Payback amount can have at most two decimal places.' };
  }
  if (toPaisa(amount) > toPaisa(money.toPayBack)) {
    return {
      error: `Payback of ${amount.toLocaleString('en-US')} is more than the ${money.toPayBack.toLocaleString('en-US')} owed back to this agent.`,
    };
  }
  if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    return { error: 'Payback date is required, as a valid calendar date (YYYY-MM-DD).' };
  }
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateIso) {
    return { error: `Payback date "${dateIso}" is not a real date.` };
  }
  if (dateIso > todayIso) return { error: 'A payback cannot be dated in the future.' };
  return { date };
}
