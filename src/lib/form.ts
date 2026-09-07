/**
 * Reading typed values out of a `FormData`.
 *
 * Shared by every server action so that "empty string means absent" is decided
 * in exactly one place — an empty text input posts `''`, which is not the same
 * as the field being missing, and treating the two differently per action is how
 * inconsistencies creep in.
 */

/** Trimmed string, or null when absent or blank. */
export function str(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

/** A `YYYY-MM-DD` field as a Date at UTC midnight, matching how dates are stored. */
export function dateVal(formData: FormData, key: string): Date | null {
  const s = str(formData, key);
  return s ? new Date(`${s}T00:00:00.000Z`) : null;
}

/**
 * A numeric field. Returns null when absent — but note that unparseable text
 * yields `NaN`, not null, so callers must still check `Number.isNaN`.
 */
export function numVal(formData: FormData, key: string): number | null {
  const s = str(formData, key);
  return s === null ? null : Number(s);
}
