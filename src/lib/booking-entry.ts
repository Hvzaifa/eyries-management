/**
 * Rules for entering a booking (owner rulings, 2026-09-20).
 *
 * These replace leniencies that existed ONLY because the imported spreadsheet
 * was messy. The owner's instruction: *"The system should not mould according to
 * the data currently in the database — rather the data will be re-entered in a
 * clean manner."* So each rule below is what a correct booking looks like, and
 * the imported rows are treated as history to look at, not as the standard.
 *
 * Enforced in the application rather than as database constraints, because the
 * existing rows stay in place while they are still being read. Each rule notes
 * what to add to `db/schema.sql` once the old data is cleared.
 */

/**
 * Travel purposes a booking may have.
 *
 * Was free text with autocomplete, because the sheet's values were inconsistent
 * and a locked list would have rejected real rows (docs/decisions.md,
 * 2026-08-21). The re-entered data is consistent, so this is now a fixed list.
 * Every active booking in the current data already uses one of these three.
 */
export const SEGMENTS = ['Umrah', 'Employment', 'Tour'] as const;
export type Segment = (typeof SEGMENTS)[number];

/** Case-insensitive match against the fixed list; returns the canonical spelling. */
export function normalizeSegment(value: string | null): Segment | null {
  if (!value) return null;
  const found = SEGMENTS.find((s) => s.toLowerCase() === value.trim().toLowerCase());
  return found ?? null;
}

export function validateSegment(value: string | null): { error: string } | null {
  if (!value) return null; // segment is optional; a blank one is not a wrong one
  if (normalizeSegment(value)) return null;
  return { error: `Segment must be one of: ${SEGMENTS.join(', ')}.` };
}

/**
 * The value `investor_company` is stamped with on every new booking.
 *
 * Owner ruling: *"Every booking that comes in is under company investment until
 * it is assigned to an agent or bot."* Who holds the seats is therefore answered
 * by the seat ledger, not by typed text — the field is no longer entered by
 * staff, and stays only so the imported rows remain readable.
 */
export const COMPANY_INVESTMENT = 'COMPANY INVESTMENT';

/**
 * A PNR code must be unique (owner ruling, 2026-09-20).
 *
 * Duplicates were previously allowed with a warning, because the sheet contained
 * them and blocking would have made imported rows uneditable (2026-08-21). The
 * check is case-insensitive: an airline PNR is a code, and `8MM3OD` and `8mm3od`
 * are the same booking — the same reasoning that made branch and agent names
 * case-insensitive after one branch ended up split across two rows.
 *
 * **Once the imported data is cleared**, add to `db/schema.sql`:
 *   `create unique index idx_pnrs_code_lower on pnrs (lower(pnr));`
 * Until then it is an application check, because a unique index cannot be
 * created while the old rows may still contain duplicates.
 */
export function pnrCodeKey(code: string): string {
  return code.trim().replace(/\s+/g, '').toUpperCase();
}

export function validatePnrCode(code: string | null): { error: string } | null {
  if (!code || !code.trim()) return { error: 'PNR code is required.' };
  const key = pnrCodeKey(code);
  if (key.length < 5 || key.length > 10) {
    return { error: 'A PNR code is normally 5–10 characters.' };
  }
  if (!/^[A-Z0-9]+$/.test(key)) {
    return { error: 'A PNR code contains only letters and numbers.' };
  }
  return null;
}
