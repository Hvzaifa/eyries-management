/**
 * Legacy-sheet import core (Phase 1 Step 6).
 * Pure logic only — no DB, no file I/O — so it is fully unit-testable.
 *
 * Rule from docs/decisions.md (2026-08-21): duplicate PNR values in the
 * legacy sheet are NOT assumed meaningful. Every PNR code appearing on more
 * than one row is flagged for human review; only unambiguous rows insert.
 */

export interface MappedLegacyRow {
  /** 1-based sheet row number (including header offset) for the report. */
  rowNumber: number;
  pnrCode: string | null;
  data: Record<string, unknown>;
  /** Non-blocking issues (e.g. lookup value not found — column left empty). */
  warnings: string[];
  /** Blocking issues — row is always flagged and never inserted. */
  errors: string[];
}

export interface PartitionResult {
  clean: MappedLegacyRow[];
  flagged: MappedLegacyRow[];
}

export function normalizePnrCode(code: string | null | undefined): string {
  return (code ?? '').trim().toUpperCase();
}

/**
 * Partition mapped rows into clean (safe to auto-insert) and flagged
 * (human review required). Duplicate grouping happens across ALL rows
 * before validity checks: if a PNR code appears more than once, EVERY
 * copy is flagged together even when some copies have their own errors —
 * otherwise the report would silently hide the duplication.
 * A lone row is flagged when it has any hard error.
 */
export function partitionRows(rows: MappedLegacyRow[]): PartitionResult {
  const noCode: MappedLegacyRow[] = [];
  const byCode = new Map<string, MappedLegacyRow[]>();
  for (const row of rows) {
    const key = normalizePnrCode(row.pnrCode);
    if (!key) {
      noCode.push(row);
      continue;
    }
    const group = byCode.get(key);
    if (group) group.push(row);
    else byCode.set(key, [row]);
  }

  const clean: MappedLegacyRow[] = [];
  const flagged: MappedLegacyRow[] = [...noCode];

  for (const [code, group] of byCode) {
    if (group.length > 1) {
      for (const row of group) {
        row.errors.push(
          `duplicate PNR "${code}" appears on ${group.length} rows (${group
            .map((g) => g.rowNumber)
            .join(', ')})`
        );
      }
      flagged.push(...group);
    } else if (group[0].errors.length > 0) {
      flagged.push(group[0]);
    } else {
      clean.push(group[0]);
    }
  }

  clean.sort((a, b) => a.rowNumber - b.rowNumber);
  flagged.sort((a, b) => a.rowNumber - b.rowNumber);
  return { clean, flagged };
}

/**
 * The workbook stores every date as "midnight PKT of the true day" expressed
 * in UTC (~19:00Z), but a float rounding artifact lands the stored instant 12
 * seconds short (18:59:48Z). Nudge forward one minute and read the calendar
 * date in Asia/Karachi — this recovers exactly the date Excel displays.
 */
export function sheetDateToIso(v: Date): string {
  const nudged = new Date(v.getTime() + 60_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(nudged);
}

/** Excel serial date -> ISO yyyy-mm-dd (SheetJS may also hand us Date objects). */
export function parseExcelDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return sheetDateToIso(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = Math.round((value - 25569) * 86400000) + 60_000;
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ms));
  }
  const s = String(value).trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(m[1], m[2], m[3]);

  // DD/MM/YYYY or DD-MM-YYYY (South Asian convention; also covers Excel text cells)
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) return iso(m[3], m[2], m[1]);

  // 01JUN26 / 1-JUN-2026 style seen in the legacy workbook
  m = s.match(/^(\d{1,2})[- ]?([A-Za-z]{3})[- ]?(\d{2}|\d{4})$/);
  if (m) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const mi = months.indexOf(m[2].toLowerCase());
    if (mi >= 0) {
      const year = m[3].length === 2 ? `20${m[3]}` : m[3];
      return iso(year, String(mi + 1), m[1]);
    }
  }
  return null;
}

function iso(y: string, mo: string, d: string): string {
  const pad = (n: string) => n.padStart(2, '0');
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/** "PKR 1,275,000.00" / "1275000" / 1275000 -> number | null. */
export function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Staff-style values ("30%", 30) and Excel fraction cells alike.
 * Fractions are the legacy-sheet convention: 0.15 -> 15, 1 -> 100.
 */
export function parsePercent(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    if (value > 0 && value <= 1) return Math.round(value * 10000) / 100;
    return value;
  }
  const s = String(value).replace('%', '').trim();
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (n > 0 && n <= 1 && s.includes('.')) return Math.round(n * 10000) / 100;
  return n;
}
