import type { ParsedBookingDraft } from './parse-booking';

/**
 * Dates a new booking should not have in the past: the flights and the time
 * limits. Request and EMD issuance dates are naturally in the past and are not
 * checked.
 */
const FORWARD_DATES = ['outboundDate', 'inboundDate', 'pnrTlDate', 'roundDeadlineDate'] as const;

const LABELS: Record<(typeof FORWARD_DATES)[number], string> = {
  outboundDate: 'Outbound date',
  inboundDate: 'Inbound date',
  pnrTlDate: 'PNR time limit',
  roundDeadlineDate: 'EMD deadline',
};

/**
 * Marks a forward-looking date that lies before today as low confidence, with a
 * note, so the review form highlights it (2026-10-05).
 *
 * Found that day: airline messages write dates without a year ("14NOV"), and
 * the model, never told today's date, filled in 2023 or 2024. The prompt now
 * states today's date; this is the check behind it. Nothing is changed — a
 * past date may be genuine (an old confirmation pasted on purpose) — it is only
 * put in front of the person who confirms the draft.
 */
export function flagPastDates(draft: ParsedBookingDraft, todayIso: string): ParsedBookingDraft {
  const out = { ...draft };
  for (const key of FORWARD_DATES) {
    const field = draft[key];
    if (field.value && field.value < todayIso) {
      out[key] = {
        ...field,
        confidence: 'low',
        notes: `${LABELS[key]} ${field.value} is in the past — check the year.`,
      };
    }
  }
  return out;
}

/** The notes worth showing a reviewer, in field order. */
export function draftNotes(draft: ParsedBookingDraft): string[] {
  return Object.values(draft)
    .filter((v): v is { notes: string } => !!v && typeof v === 'object' && typeof (v as { notes?: unknown }).notes === 'string')
    .map((v) => v.notes);
}
