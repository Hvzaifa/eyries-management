/**
 * Branches, airlines and agents as they are shown and picked (owner,
 * 2026-10-19). Pure — no database — so it is unit-tested and shared by the
 * pages, the forms and `prisma/seed.ts`.
 */

/**
 * How a branch or license is shown: by its code (RWP, TA-ISB-BSP). The full
 * name is the fallback for a row that has no code yet.
 */
export function lookupLabel(row: { name: string; code: string | null } | null | undefined): string | null {
  if (!row) return null;
  return row.code?.trim() || row.name;
}

/** A dropdown entry: "TA-ISB-BSP — Travel Advisor Islamabad", or the code alone when it is the name. */
export function lookupOptionText(row: { name: string; code: string | null }): string {
  const code = row.code?.trim();
  return code && code !== row.name ? `${code} — ${row.name}` : code || row.name;
}

/** One choice in a typeable dropdown. `code` and `name` are both searchable. */
export interface LookupOption {
  value: string;
  code: string;
  name: string;
}

/**
 * The choices matching what has been typed, best first: an exact code, then
 * codes starting with it, then names starting with it, then the rest that
 * contain it anywhere. Case and surrounding spaces are ignored. An empty query
 * returns every option, in its original order.
 */
export function matchLookupOptions<T extends LookupOption>(options: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  const rank = (o: T): number => {
    const code = o.code.toLowerCase();
    const name = o.name.toLowerCase();
    if (code === q) return 0;
    if (code.startsWith(q)) return 1;
    if (name.startsWith(q)) return 2;
    if (name.split(/[\s\-–()/]+/).some((w) => w.startsWith(q))) return 3;
    if (code.includes(q) || name.includes(q)) return 4;
    return -1;
  };
  return options
    .map((o, i) => ({ o, i, r: rank(o) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.o);
}

/**
 * Which existing branch or license row a listed one is. Matched on the code
 * first, then on the name ignoring case — branch names are case-insensitive
 * identifiers (2026-09-07) — then on a row whose name IS the code: rows such
 * as the "B2C" branch and the "TA-ISB-BSP" license were named by their code
 * before codes had a column of their own.
 */
export function findLookupRow<T extends { name: string; code: string | null }>(
  rows: T[],
  listed: { name: string; code: string }
): T | undefined {
  const name = listed.name.trim().toLowerCase();
  const code = listed.code.trim().toLowerCase();
  return (
    rows.find((r) => r.code?.trim().toLowerCase() === code) ??
    rows.find((r) => r.name.trim().toLowerCase() === name) ??
    rows.find((r) => r.name.trim().toLowerCase() === code)
  );
}

/** A name or code compared loosely: no bracketed note, no spacing or punctuation, any case. */
const looseName = (s: string) => s.replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();

/**
 * The license, branch or airline a sheet or message wrote, by its code or its
 * name: `TA-ISB-BSP` or `Travel Advisor Islamabad`, `RWP` or `Rawalpindi`,
 * `SV` or `Saudi Arabian Airlines`. An exact match (ignoring case) wins;
 * otherwise the one row whose code or name is the same once spacing,
 * punctuation and a bracketed note are ignored — so `TU -PIA` finds
 * `TU-PIA (PSA)`. Two or more loose matches find nothing rather than guess.
 */
export function matchLookup<T extends { name: string; code?: string | null }>(
  rows: T[],
  written: string | null | undefined
): T | undefined {
  const w = written?.trim();
  if (!w) return undefined;
  const keys = (r: T) => [r.code, r.name].filter((k): k is string => !!k?.trim());
  const exact = rows.filter((r) => keys(r).some((k) => k.trim().toLowerCase() === w.toLowerCase()));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return undefined;
  const key = looseName(w);
  if (!key) return undefined;
  const loose = rows.filter((r) => keys(r).some((k) => looseName(k) === key));
  return loose.length === 1 ? loose[0] : undefined;
}
