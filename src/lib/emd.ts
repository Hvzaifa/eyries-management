import { diffInDays } from './urgency';

export interface EmdPlanSuggestion {
  /** true when a stored airline policy applies to this booking */
  applicable: boolean;
  reason?: 'non-sv-airline' | 'non-umrah-segment' | 'missing-dates';
  emd1Pct: number | null;
  emd2Pct: number | null;
  bandLabel?: string;
}

/**
 * SV Umrah policy — "Umrah Year-round excluding Ramadhan" row of the airline's
 * Requests-vs-Time-to-Departure table (uploaded 2026-08-23). The deposit %
 * becomes the suggested 1st EMD and the balance % the suggested 2nd EMD.
 * Hajj, Ramadhan-Umrah and Tour-Operator rows are NOT implemented (owner
 * instruction: umrah only; no current departures fall in Ramadhan).
 *
 *   ≥ 60 days : EMD-1 15% · balance 85% (issue by departure − 20)
 *   30–59     : EMD-1 30% · balance 70% (departure − 10)
 *   15–29     : EMD-1 50% · balance 50% (departure − 7)
 *    7–14     : EMD-1 70% · balance 30% (departure − 5)
 *    2–6      : EMD-1 100%, issue within 1 day · no second round
 *    ≤ 1      : EMD-1 100%, issue immediately · no second round
 *
 * **The policy governs when EMDs are ISSUED, not when they are paid** (owner
 * correction, 2026-09-21). The airline requires the EMD to be issued on this
 * schedule because issuing it is what secures the PNR. When the money is paid
 * is an IATA matter, not modelled here — see business-rules.md.
 *
 * Only Saudia (SV) has a stored policy today. Every other airline gets NO
 * auto-suggestion — staff set percentages manually until their policies are
 * uploaded. Suggestions are defaults, never validation.
 */
export function suggestEmdPlan(input: {
  airlineCode: string | null | undefined;
  segment: string | null | undefined;
  requestDateIso: string | null | undefined;
  outboundDateIso: string | null | undefined;
}): EmdPlanSuggestion {
  const { airlineCode, segment, requestDateIso, outboundDateIso } = input;

  if (!airlineCode || airlineCode.trim().toUpperCase() !== 'SV') {
    return { applicable: false, reason: 'non-sv-airline', emd1Pct: null, emd2Pct: null };
  }
  if (!segment || !segment.trim().toLowerCase().includes('umrah')) {
    return { applicable: false, reason: 'non-umrah-segment', emd1Pct: null, emd2Pct: null };
  }
  if (!requestDateIso || !outboundDateIso) {
    return { applicable: false, reason: 'missing-dates', emd1Pct: null, emd2Pct: null };
  }

  const days = diffInDays(requestDateIso, outboundDateIso);
  if (days >= 60) return { applicable: true, emd1Pct: 15, emd2Pct: 85, bandLabel: '60+ days out' };
  if (days >= 30) return { applicable: true, emd1Pct: 30, emd2Pct: 70, bandLabel: '30–59 days out' };
  if (days >= 15) return { applicable: true, emd1Pct: 50, emd2Pct: 50, bandLabel: '15–29 days out' };
  if (days >= 7) return { applicable: true, emd1Pct: 70, emd2Pct: 30, bandLabel: '7–14 days out' };
  if (days >= 2) return { applicable: true, emd1Pct: 100, emd2Pct: null, bandLabel: '2–6 days out' };
  return { applicable: true, emd1Pct: 100, emd2Pct: null, bandLabel: 'under 2 days out' };
}

/**
 * Days before departure by which the SV policy's 2nd EMD (the balance) must be
 * **issued**, for a booking made `days` days before departure (same band as the
 * plan).
 *   60+ -> 20 · 30-59 -> 10 · 15-29 -> 7 · 7-14 -> 5
 * Bookings under 7 days out have a single 100% deposit — no 2nd EMD (null).
 *
 * **The 3-day safety margin deliberately does NOT apply here** (owner ruling,
 * 2026-09-21: *"No — keep the policy dates"*). The margin exists because the
 * airline is slow to send the PNR and seats after the initial request, which is
 * a problem for the FIRST EMD only — by the time the balance falls due the
 * booking is long since confirmed, and these dates are anchored to departure
 * rather than to anything the airline has to send us.
 */
export function emd2DaysBeforeDeparture(days: number): number | null {
  if (days >= 60) return 20;
  if (days >= 30) return 10;
  if (days >= 15) return 7;
  if (days >= 7) return 5;
  return null;
}

/**
 * The **airline's own figure**: days from confirmation within which the 1st EMD
 * must be ISSUED, straight off the SV policy sheet.
 *
 *   60+ days out -> 14 days   "15% within 14 days of confirmation"
 *   30-59        -> 10 days   "30% within 10 days"
 *   15-29        ->  3 days   "50% within 3 days"
 *   7-14         ->  3 days   "70% within 3 days"
 *   2-6          ->  1 day    "100% within 1 day"
 *   under 2      ->  0 days   "100% immediate"
 *
 * Kept separate from what the system actually stores so the sheet stays
 * auditable against this file, and so the safety margin below is one number in
 * one place rather than six hand-adjusted figures.
 *
 * Keyed on the band rather than on the typed percentage, because the table is
 * band-based and a percentage does not identify a band on its own: 100% appears
 * in two of them (within 1 day at 2-6 days out, but immediate under 2).
 */
export function emd1PolicyDaysToIssue(daysToDeparture: number): number {
  if (daysToDeparture >= 60) return 14;
  if (daysToDeparture >= 30) return 10;
  if (daysToDeparture >= 15) return 3;
  if (daysToDeparture >= 7) return 3;
  if (daysToDeparture >= 2) return 1;
  return 0;
}

/**
 * How far ahead of the airline's own date this system sets its deadline
 * (owner ruling, 2026-09-21).
 *
 * The airline's staff commonly send the PNR and seat confirmation **2–3 days
 * after the request**, and Sundays fall in between with the offices shut. An
 * EMD issued exactly on the policy date is therefore an EMD issued late, and a
 * late EMD does not secure the PNR. Three days early is the owner's working
 * margin for staying ahead of that.
 */
export const EMD_ISSUANCE_SAFETY_DAYS = 3;

/**
 * Days from today to the **EMD-1 issuance deadline** this system works to: the
 * airline's figure, brought forward by the safety margin.
 *
 * **Floored at zero — that is the rule, not a guard.** The owner was explicit:
 * *"make sure subtracting 3 days doesn't make the deadline go beyond immediate
 * issuance… it shouldn't turn into negative but rather the deadline is
 * immediate."* So the four short bands all resolve to **today**, which is
 * correct: a booking 10 days from departure needs its EMD issued now.
 *
 * This knowingly reverses part of the 2026-09-07 ruling, which set the short
 * bands to 3/3/1/0 so that short-notice bookings were not created looking
 * overdue. A deadline of *today* reads as **due today**, not overdue, so that
 * complaint does not return — see docs/decisions.md, 2026-09-21.
 */
export function emd1DaysToDeadline(daysToDeparture: number): number {
  return Math.max(0, emd1PolicyDaysToIssue(daysToDeparture) - EMD_ISSUANCE_SAFETY_DAYS);
}

/**
 * Keeps the suggested **EMD-2** deadline from landing on or before EMD-1's.
 *
 * The two deadlines are anchored to different things: EMD-1 counts forward from
 * confirmation (`emd1DaysToDeadline`), EMD-2 counts backward from departure
 * (`emd2DaysBeforeDeparture`). When a booking is made close to the departure
 * those anchors can cross, and round 2 would then have to be issued BEFORE
 * round 1 — which is not a schedule anyone can work to.
 *
 * That also broke the PNR TL rule, which follows "the earliest round still
 * outstanding": round 2 would already be overdue at the moment round 1 was issued.
 *
 * Owner ruling (2026-09-07): keep both policies as written, but never let EMD-2
 * precede EMD-1 — push it to the day after. Only the crossing case is affected;
 * every other band returns its policy date untouched.
 *
 * Dates are ISO `YYYY-MM-DD`, which compare correctly as plain strings.
 */
export function clampEmd2Deadline(
  emd2DeadlineIso: string,
  emd1DeadlineIso: string | null
): string {
  if (!emd1DeadlineIso) return emd2DeadlineIso;
  if (emd2DeadlineIso > emd1DeadlineIso) return emd2DeadlineIso;
  const [y, m, d] = emd1DeadlineIso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * The two statuses an EMD round can hold (owner ruling, 2026-09-21).
 *
 * A round is **issued** — which is what secures the PNR — until the airline
 * **refunds** it. `paid`, `refund_requested` and `expired` were removed: when an
 * EMD is paid is governed by the IATA calendar, which this system does not model
 * yet, so `paid` was a fact nobody could place in time.
 */
export const EMD_STATUSES = ['issued', 'refunded'] as const;
export type EmdStatus = (typeof EMD_STATUSES)[number];

export function isEmdStatus(value: string | null | undefined): value is EmdStatus {
  return value === 'issued' || value === 'refunded';
}

/** EMD the airline is holding: everything issued and not yet refunded. */
export const HELD_EMD_STATUS: EmdStatus = 'issued';

/**
 * What an EMD round is worth: the booking's total EMD value × the round's
 * percentage.
 *
 * The airline's policy is expressed in percentages of the booking (15% deposit,
 * 85% balance), and the booking's value is `seats × fare` — so the amount is
 * derivable and should not be typed from scratch. Staff still see it and can
 * correct it, because the airline occasionally issues an EMD for a figure of
 * its own (owner ruling, 2026-09-21: pre-filled, editable).
 *
 * Rounded to the paisa, the precision `numeric(14,2)` stores, so a percentage
 * of an odd fare cannot leave a fraction behind.
 */
export function emdAmountFor(
  seats: number | null | undefined,
  fare: number | null | undefined,
  paymentPct: number | null | undefined
): number | null {
  if (!Number.isFinite(seats ?? NaN) || !Number.isFinite(fare ?? NaN)) return null;
  if (!Number.isFinite(paymentPct ?? NaN)) return null;
  if ((seats as number) <= 0 || (fare as number) < 0 || (paymentPct as number) < 0) return null;

  const basePaisa = Math.round((fare as number) * 100) * (seats as number);
  return Math.round((basePaisa * (paymentPct as number)) / 100) / 100;
}

export interface NextEmdSuggestion {
  /** The round about to be issued: 1 for a booking with none yet. */
  roundNumber: number;
  /** The policy percentage, or null where the airline has no stored policy. */
  paymentPct: number | null;
  /** `seats × fare × pct`, or null when the percentage is unknown. */
  amount: number | null;
  /**
   * The time limit this EMD would secure the PNR to — the date by which the
   * NEXT one (or the tickets) must be issued.
   *
   * Only round 1 gets a suggestion: the policy's balance date, counted back
   * from departure. After the balance is issued there is no policy left — an
   * extension is negotiated with the airline, so nothing is proposed and staff
   * enter what they agreed.
   */
  deadline: string | null;
}

/**
 * Everything the form should pre-fill for the next EMD on a booking.
 *
 * One function so the single Add Round modal and the bulk issuance screen
 * cannot drift: two places deriving "what should this EMD be?" separately is
 * how a bulk run quietly issues different amounts from the one-at-a-time path.
 *
 * Every figure is a **suggestion** staff can overwrite (business-rules.md).
 */
export function nextEmdSuggestion(input: {
  roundsIssued: number;
  seats: number;
  fare: number;
  airlineCode: string | null;
  segment: string | null;
  requestDateIso: string | null;
  outboundDateIso: string | null;
  /** Used to keep a proposed time limit from landing in the past. */
  todayIso: string;
}): NextEmdSuggestion {
  const roundNumber = input.roundsIssued + 1;
  const plan = suggestEmdPlan({
    airlineCode: input.airlineCode,
    segment: input.segment,
    requestDateIso: input.requestDateIso,
    outboundDateIso: input.outboundDateIso,
  });

  const paymentPct = !plan.applicable
    ? null
    : roundNumber === 1
      ? plan.emd1Pct
      : roundNumber === 2
        ? plan.emd2Pct
        : null;

  let deadline: string | null = null;
  if (plan.applicable && roundNumber === 1 && input.requestDateIso && input.outboundDateIso) {
    const offset = emd2DaysBeforeDeparture(diffInDays(input.requestDateIso, input.outboundDateIso));
    if (offset !== null) {
      const [y, m, d] = input.outboundDateIso.split('-').map(Number);
      const policyIso = new Date(Date.UTC(y, m - 1, d - offset)).toISOString().slice(0, 10);
      // Never on or before today: a time limit that has already passed is not a
      // schedule anyone can work to.
      deadline = clampEmd2Deadline(policyIso, input.todayIso);
    }
  }

  return {
    roundNumber,
    paymentPct,
    amount: emdAmountFor(input.seats, input.fare, paymentPct),
    deadline,
  };
}
