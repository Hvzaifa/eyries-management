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
 * becomes the suggested 1st EMD and the full-payment % the suggested 2nd EMD.
 * Hajj, Ramadhan-Umrah and Tour-Operator rows are NOT implemented (owner
 * instruction: umrah only; no current departures fall in Ramadhan).
 *
 *   ≥ 60 days : EMD-1 15% · balance 85% (+20 days before departure)
 *   30–59     : EMD-1 30% · balance 70% (+10 days)
 *   15–29     : EMD-1 50% · balance 50% (+7 days)
 *    7–14     : EMD-1 70% · balance 30% (+5 days)
 *    2–6      : EMD-1 100% within 1 day · no second round
 *    ≤ 1      : EMD-1 100% immediate · no second round
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
 * Days before departure when the SV policy's 2nd EMD (full payment) is due,
 * for a booking made `days` days before departure (same band as the plan).
 *   60+ -> 20 · 30-59 -> 10 · 15-29 -> 7 · 7-14 -> 5
 * Bookings under 7 days out have a single 100% deposit — no 2nd EMD (null).
 */
export function emd2DaysBeforeDeparture(days: number): number | null {
  if (days >= 60) return 20;
  if (days >= 30) return 10;
  if (days >= 15) return 7;
  if (days >= 7) return 5;
  return null;
}

/**
 * Days from today to the suggested **EMD-1** deadline, chosen by how far out the
 * booking is (the same bands as `suggestEmdPlan`).
 *
 * Two documents disagreed here and the owner ruled on 2026-09-07 to follow the
 * SV policy table in business-rules.md:
 *
 *   60+ days out -> +10 days   owner ruling 2026-09-02 (table itself says 14)
 *   30-59        -> +6  days   owner ruling 2026-09-02 (table itself says 10)
 *   15-29        -> +3  days   table: "50% within 3 days"
 *   7-14         -> +3  days   table: "70% within 3 days"
 *   2-6          -> +1  day    table: "100% within 1 day"
 *   under 2      ->  0 days    table: "100% immediate"
 *
 * The previous rule was "+10 for 15%, +6 for 30%, and +0 for anything else",
 * which only ever named the two long bands. Every short-notice booking therefore
 * pre-filled a deadline of TODAY and appeared overdue the moment it was created.
 *
 * Keyed on the band rather than on the typed percentage, because the table is
 * band-based and a percentage does not identify a band on its own: 100% appears
 * in two of them (+1 day at 2-6 days out, but immediate under 2). For the
 * standard percentages the two readings agree exactly.
 */
export function emd1DaysToDeadline(daysToDeparture: number): number {
  if (daysToDeparture >= 60) return 10;
  if (daysToDeparture >= 30) return 6;
  if (daysToDeparture >= 15) return 3;
  if (daysToDeparture >= 7) return 3;
  if (daysToDeparture >= 2) return 1;
  return 0;
}

/**
 * Keeps the suggested **EMD-2** deadline from landing on or before EMD-1's.
 *
 * The two deadlines are anchored to different things: EMD-1 counts forward from
 * confirmation (`emd1DaysToDeadline`), EMD-2 counts backward from departure
 * (`emd2DaysBeforeDeparture`). When a booking is made close to the departure
 * those anchors cross — at exactly 7 days out, EMD-1 lands on today+3 while
 * EMD-2 lands on departure-5 = today+2, so round 2 fell due a day BEFORE round 1.
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
