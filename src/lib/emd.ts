import { diffInDays } from './urgency';

export type Emd1Suggestion =
  | { kind: 'none'; reason: 'missing-dates' }
  | { kind: 'no-round'; reason: 'under-7-days' }
  | { kind: 'suggested'; pct: number | null };

/**
 * EMD-1 % auto-suggestion (docs/business-rules.md + docs/decisions.md):
 *   < 7 days   -> no EMD round at all (form hides the round section)
 *   7–14       -> 100%
 *   15–29      -> 50%
 *   30–59      -> 30%
 *   60–90      -> 15% (exactly-60 gap resolved to the lower band by owner)
 *   > 90       -> 15% (lowest band as starting point)
 * Always a default for the UI — never a validation that blocks saving.
 */
export function suggestEmd1(
  requestDateIso: string | null | undefined,
  outboundDateIso: string | null | undefined
): Emd1Suggestion {
  if (!requestDateIso || !outboundDateIso) {
    return { kind: 'none', reason: 'missing-dates' };
  }
  const days = diffInDays(requestDateIso, outboundDateIso);
  if (days < 7) return { kind: 'no-round', reason: 'under-7-days' };
  if (days <= 14) return { kind: 'suggested', pct: 100 };
  if (days <= 29) return { kind: 'suggested', pct: 50 };
  if (days <= 59) return { kind: 'suggested', pct: 30 };
  return { kind: 'suggested', pct: 15 };
}
