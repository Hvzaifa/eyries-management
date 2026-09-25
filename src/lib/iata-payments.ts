/**
 * What an issued EMD still owes IATA, and when.
 *
 * The calendar in `iata-calendar.ts` says *when* a payment falls due. This file
 * says *whether* it is still owed, which turns on a practice the owner
 * described on 2026-09-22 and which nothing in the system had captured:
 *
 * > *"If an EMD was issued on the 20th of September and the company decides it
 * > cannot pay in this deadline cycle — by the 30th — the company issues a
 * > refund with IATA **before or on the 23rd**, and issues a new EMD on the
 * > 24th, so that its deadline moves to the next cycle. Rounds three and four
 * > are the same as rounds one and two: they are only created if rounds 1–2 are
 * > refunded before payment, to re-issue them with new EMD numbers so the
 * > payment deadline moves to the next cycle."*
 *
 * So a refund is not always money coming back. It can be a **cancellation of
 * the billing**, after which the obligation reappears on the replacement round
 * in a later period. That is a deliberate cash-flow move, not an exception, and
 * it is why `emd_rounds` is open-ended.
 *
 * ### The deadline that governs the roll is the BILLING window, not the payment
 *
 * The refund must land **on or before the billing-to date of the period the EMD
 * was issued in** — 23 September in the owner's example, not the 30th. Once the
 * window closes the EMD has been billed, and a refund after that is a separate
 * credit in a later period: **the original bill still falls due on its own
 * remittance day.** An earlier version of this file used the remittance day as
 * the cut-off, which would have quietly written off a bill the company still
 * had to pay (owner correction, 2026-09-22).
 *
 * Outcomes for any round:
 *
 *   - a recorded `payment_date`        -> **paid**, nothing owed;
 *   - refunded on/before `billingTo`   -> **rolled**: the billing was cancelled
 *     and the money moved to whichever round replaced it, nothing owed here;
 *   - refunded *after* `billingTo`     -> still **owed** on the original
 *     remittance day — the refund came too late to catch the cycle;
 *   - still `issued`, unpaid           -> **owed** on the remittance day.
 *
 * The refund itself is also an IATA matter: *"the airline isn't concerned with
 * money — the refund request will be sent to IATA and IATA will process it"*
 * (owner, 2026-09-22).
 */

import { diffInDays, type Urgency } from './urgency';
import { iataPaymentDeadline, iataPeriodFor, type IataPeriod } from './iata-calendar';

export type IataPaymentStatus =
  /** Payment to IATA has been recorded. */
  | 'paid'
  /**
   * Refunded within its own billing window, which cancels the billing — the
   * obligation moved to whichever round replaced it.
   */
  | 'rolled'
  /** Owed, but the loaded calendar does not reach the issuance date. */
  | 'unknown'
  /** Owed and the remittance day has passed. */
  | 'overdue'
  /** Owed today. */
  | 'due-today'
  /** Owed within the alert window. */
  | 'due-soon'
  /** Owed, further out. */
  | 'scheduled';

export interface IataPaymentState {
  status: IataPaymentStatus;
  /** The remittance day, or null when the calendar does not cover the issuance date. */
  deadline: string | null;
  /** The billing period the EMD was issued in — shown so a date can be traced to the PDF. */
  period: IataPeriod | null;
  paidOn: string | null;
  /** Days until the remittance day; negative when it has passed. Null when unknown or settled. */
  daysLeft: number | null;
  /** True when this round still represents money the company must pay IATA. */
  owed: boolean;
  /**
   * The last day a refund can cancel this billing — the billing-to date of the
   * period the EMD was issued in. Refund on or before it and re-issue after it,
   * and the bill moves to the next cycle. Null once the question is settled, or
   * when the calendar does not cover the issuance date.
   */
  rollBy: string | null;
  /**
   * Set when the round is refunded but the refund came too late to cancel the
   * billing, or its date was never recorded so we cannot tell. Money is still
   * owed in both cases; the reason differs.
   */
  lateRefund: 'after-billing' | 'date-unknown' | null;
  /** Its own colour, independent of the issuance-deadline colour on the same row. */
  urgency: Urgency;
  /** One line a staff member can act on. */
  label: string;
}

/**
 * How many days ahead a payment starts being called out. Matches the issuance
 * alert window (`isDueForAlert`) on purpose: one notice period is one thing to
 * remember, and staff already read "within 2 days" as urgent here.
 */
export const IATA_PAYMENT_NOTICE_DAYS = 2;

export function iataPaymentState(input: {
  issuanceDate: string | null;
  paymentDate: string | null;
  /** When the EMD was refunded. Decides whether a refund caught its billing window. */
  refundDate: string | null;
  roundStatus: string;
  todayIso: string;
}): IataPaymentState {
  const { issuanceDate, paymentDate, refundDate, roundStatus, todayIso } = input;
  const period = iataPeriodFor(issuanceDate);
  const deadline = iataPaymentDeadline(issuanceDate);

  if (paymentDate) {
    return {
      status: 'paid',
      deadline,
      period,
      paidOn: paymentDate,
      daysLeft: null,
      owed: false,
      rollBy: null,
      lateRefund: null,
      urgency: 'green',
      label: `Paid to IATA on ${paymentDate}`,
    };
  }

  // Refunded, unpaid — did the refund catch the billing window?
  //
  // Only a refund landing ON OR BEFORE the period's billing-to date cancels the
  // billing. After that the EMD has already been billed, and the original bill
  // still falls due on its own remittance day whatever the refund does.
  let lateRefund: IataPaymentState['lateRefund'] = null;
  if (roundStatus === 'refunded') {
    if (period && refundDate && refundDate <= period.billingTo) {
      return {
        status: 'rolled',
        deadline,
        period,
        paidOn: null,
        daysLeft: null,
        owed: false,
        rollBy: null,
        lateRefund: null,
        label: `Refunded ${refundDate}, inside its billing window — the bill moved to the round that replaced it`,
        urgency: 'grey',
      };
    }
    // Still owed. Either the refund missed the window, or its date was never
    // recorded and we cannot claim it caught one. Falls through to the ordinary
    // countdown, flagged so the row explains itself.
    lateRefund = refundDate ? 'after-billing' : 'date-unknown';
  }

  if (!deadline) {
    // Owed, but undatable. Never green: an unknown date is a gap to close, and
    // showing it as settled would lose a real obligation.
    return {
      status: 'unknown',
      deadline: null,
      period: null,
      paidOn: null,
      daysLeft: null,
      owed: true,
      rollBy: null,
      lateRefund,
      urgency: 'amber',
      label: 'Payment due — outside the loaded IATA calendar',
    };
  }

  const daysLeft = diffInDays(todayIso, deadline);
  // The decision date: refund on or before this and re-issue after it, and the
  // bill moves a cycle. Past it, the choice has already been made.
  const rollBy = period && period.billingTo >= todayIso ? period.billingTo : null;
  const base = { deadline, period, paidOn: null, daysLeft, owed: true, rollBy, lateRefund } as const;

  const why =
    lateRefund === 'after-billing'
      ? ` — refunded ${refundDate}, after its billing window closed ${period?.billingTo}, so this bill still stands`
      : lateRefund === 'date-unknown'
        ? ' — refunded with no date recorded, so it cannot be treated as cancelled'
        : '';

  if (daysLeft < 0) {
    const late = Math.abs(daysLeft);
    return {
      ...base,
      status: 'overdue',
      urgency: 'red',
      label: `IATA payment overdue by ${late} day${late === 1 ? '' : 's'} (was due ${deadline})${why}`,
    };
  }
  if (daysLeft === 0) {
    return {
      ...base,
      status: 'due-today',
      urgency: 'red',
      label: `Pay IATA today (${deadline})${why}`,
    };
  }
  if (daysLeft <= IATA_PAYMENT_NOTICE_DAYS) {
    return {
      ...base,
      status: 'due-soon',
      urgency: 'red',
      label: `Pay IATA in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${deadline})${why}`,
    };
  }
  return {
    ...base,
    status: 'scheduled',
    urgency: daysLeft <= 5 ? 'amber' : 'green',
    label: `Pay IATA by ${deadline}${why}`,
  };
}

/**
 * Whether a payment should appear in the daily alert.
 *
 * Future only — today through the notice window — matching the issuance
 * deadlines in the same email (owner rule, 2026-08-25: overdue items stay on
 * the dashboard but are never emailed, so the alert never nags).
 */
export function isIataPaymentDueForAlert(state: IataPaymentState, todayIso: string): boolean {
  if (!state.owed || !state.deadline) return false;
  const days = diffInDays(todayIso, state.deadline);
  return days >= 0 && days <= IATA_PAYMENT_NOTICE_DAYS;
}

/** Money summed in whole paisa, so a long list of rounds re-adds exactly. */
function sumMoney(values: number[]): number {
  return values.reduce((sum, v) => sum + Math.round(v * 100), 0) / 100;
}

export interface RemittanceGroup<T> {
  /** The day one payment covers every item under it. */
  remittanceDay: string;
  /** Billing periods that settle on this day, as IATA codes. */
  periodCodes: string[];
  items: T[];
  total: number;
  daysLeft: number;
  overdue: boolean;
}

/**
 * Groups owed rounds into the single payments they will actually be made as.
 *
 * IATA settles a whole billing period at once, so "what do we owe on 30
 * September" is the question accounts asks — not "what does this booking owe".
 * Ordered by remittance day, earliest first.
 */
export function groupByRemittanceDay<T>(
  items: T[],
  read: (item: T) => { deadline: string | null; periodCode: string | null; amount: number },
  todayIso: string
): RemittanceGroup<T>[] {
  const groups = new Map<string, { items: T[]; amounts: number[]; codes: Set<string> }>();

  for (const item of items) {
    const { deadline, periodCode, amount } = read(item);
    if (!deadline) continue;
    let g = groups.get(deadline);
    if (!g) {
      g = { items: [], amounts: [], codes: new Set() };
      groups.set(deadline, g);
    }
    g.items.push(item);
    g.amounts.push(amount);
    if (periodCode) g.codes.add(periodCode);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([remittanceDay, g]) => {
      const daysLeft = diffInDays(todayIso, remittanceDay);
      return {
        remittanceDay,
        periodCodes: [...g.codes].sort(),
        items: g.items,
        total: sumMoney(g.amounts),
        daysLeft,
        overdue: daysLeft < 0,
      };
    });
}

export type IataPaymentCheck = { date: Date } | { error: string };

/**
 * Checks a payment date before it is recorded.
 *
 * Recording a payment states that money has already left, so the date cannot be
 * in the future, and it cannot precede the EMD it settles. Same shape and same
 * reasoning as `validateRecovery` in `agent-money.ts`.
 */
export function validateIataPayment(
  dateIso: string | null,
  issuanceIso: string | null,
  todayIso: string
): IataPaymentCheck {
  if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    return { error: 'Payment date is required, as a valid calendar date (YYYY-MM-DD).' };
  }
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  // `new Date('2026-02-30')` rolls into March rather than throwing, so the
  // parsed date is compared back to the input.
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateIso) {
    return { error: `Payment date "${dateIso}" is not a real date.` };
  }
  if (dateIso > todayIso) {
    return { error: 'A payment cannot be recorded on a future date.' };
  }
  if (issuanceIso && dateIso < issuanceIso) {
    return {
      error: `The EMD was issued on ${issuanceIso}, so it cannot have been paid on ${dateIso}.`,
    };
  }
  return { date };
}
