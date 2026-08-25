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
