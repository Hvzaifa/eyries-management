import type { FieldConfidence, ParsedBookingDraft, ParsedField } from './parse-booking';
import { BOOKING_FIELDS } from './booking-schema';
import { normalizeSegment } from '@/lib/booking-entry';

/**
 * Excel and CSV uploads on the new-booking page (owner, 2026-10-05): the AI
 * says which column is which field, and this file copies the values.
 *
 * Pure — no AI, no I/O — so it is fully tested. The AI only ever sees the top
 * rows and returns a column map; every amount and date in every row is read
 * here, exactly, so a model can never retype a number. When no AI answers,
 * `heuristicMapping` maps the columns from a fixed dictionary instead.
 */

/** Fields a spreadsheet column can fill. Stops are never a single column. */
export const MAPPABLE_FIELDS = BOOKING_FIELDS.filter((f) => f.kind !== 'stops').map((f) => f.key);
export type MappableField = string;

const ROUND_FIELDS = new Set([
  'roundIssuanceDate',
  'roundPaymentPct',
  'roundEmdAmount',
  'roundEmdNumber',
  'roundDeadlineDate',
  'roundDeadlineTime',
]);

export interface ColumnMapping {
  /** 0-based index, within the rows read, of the row holding the headers. */
  headerRow: number;
  columns: { index: number; field: MappableField; round: number }[];
}

/** The JSON schema the AI's column map is held to. */
export const MAPPING_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    headerRow: { type: 'integer' },
    columns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          field: { type: 'string', enum: [...MAPPABLE_FIELDS, 'ignore'] },
          round: { type: ['integer', 'null'] },
        },
        required: ['index', 'field', 'round'],
      },
    },
  },
  required: ['headerRow', 'columns'],
};

/** How many top rows the AI is shown. Enough to get past a totals row or a title. */
export const SAMPLE_ROWS = 8;

/** The top rows as the AI sees them: only non-empty cells, each with its column index. */
export function sampleForPrompt(formatted: string[][]): string {
  return formatted
    .slice(0, SAMPLE_ROWS)
    .map((row, r) => {
      const cells = row
        .map((c, i) => (String(c ?? '').trim() ? `[${i}] ${String(c).replace(/\s+/g, ' ').trim().slice(0, 40)}` : null))
        .filter(Boolean);
      return `Row ${r}: ${cells.join(' | ') || '(empty)'}`;
    })
    .join('\n');
}

export function mappingPrompt(): string {
  return `You map spreadsheet columns to the fields of an airline group booking system.

You are shown the top rows of a sheet. Find the row that holds the column headers (it may not be the first: a totals or title row can sit above it) and say which field each column holds.

Fields: ${MAPPABLE_FIELDS.join(', ')}.

Rules:
- Map by meaning, not exact wording. "INVESTMENT TYPE" or "Investor" is investorCompany; "NO OF SEATS" or "Pax" is seats; "PNR TL DATE" is pnrTlDate; "PAYMENT %AGE" is roundPaymentPct; "TIME LIMIT (Date)" is roundDeadlineDate; "TIME LIMIT (Time)" is roundDeadlineTime; "1st EMD NUMBER" is roundEmdNumber.
- EMD round columns often repeat once per round (ISSUANCE DATE, PAYMENT %AGE, EMD NUMBER, EMD AMOUNT, TIME LIMIT…). Give each its round number: 1 for the first group, 2 for the second, and so on. Use null for round on non-round fields.
- "ignore" anything with no matching field: totals, refunds, parent PNR, deal %, issued/unissued status, total EMD value, serial numbers.
- Never map two columns to the same non-round field.
- List only the columns that map to a field; leave ignored columns out.

Reply with JSON only: {"headerRow": <row number>, "columns": [{"index": <n>, "field": "<field>", "round": <n or null>}]}`;
}

/**
 * Checks an AI column map against the sheet and keeps only what is sound:
 * indexes inside the sheet, known fields, no field mapped twice (round fields
 * may repeat once per round). Returns null when nothing usable is left or no
 * PNR column was found — the caller then falls back to the dictionary.
 */
export function validateMapping(raw: unknown, width: number, rowsRead: number): ColumnMapping | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { headerRow?: unknown; columns?: unknown };
  const headerRow = Number(r.headerRow);
  if (!Number.isInteger(headerRow) || headerRow < 0 || headerRow >= Math.min(rowsRead, SAMPLE_ROWS)) return null;
  if (!Array.isArray(r.columns)) return null;

  const known = new Set(MAPPABLE_FIELDS);
  const seen = new Set<string>();
  const indexes = new Set<number>();
  const nextRound = new Map<string, number>();
  const columns: ColumnMapping['columns'] = [];
  for (const c of [...r.columns].sort((a, b) => Number(a?.index) - Number(b?.index))) {
    const index = Number(c?.index);
    const field = String(c?.field ?? '');
    if (!Number.isInteger(index) || index < 0 || index >= width || indexes.has(index)) continue;
    if (field === 'ignore' || !known.has(field)) continue;
    let round = 1;
    if (ROUND_FIELDS.has(field)) {
      const given = Number(c?.round);
      round = Number.isInteger(given) && given >= 1 ? given : (nextRound.get(field) ?? 1);
      nextRound.set(field, round + 1);
    }
    const key = ROUND_FIELDS.has(field) ? `${field}#${round}` : field;
    if (seen.has(key)) continue;
    seen.add(key);
    indexes.add(index);
    columns.push({ index, field, round });
  }
  if (!columns.some((c) => c.field === 'pnr')) return null;
  return { headerRow, columns };
}

/** Header text compared on whole words: lower-case, punctuation and line breaks as spaces. */
export function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * The fallback dictionary, matched on the WHOLE normalised header. The old
 * parser matched substrings, so "type" caught INVESTMENT TYPE as the segment
 * and "code" matched anything (2026-10-05).
 */
const SYNONYMS: Record<string, string[]> = {
  pnr: ['pnr', 'pnr no', 'pnr number', 'record locator', 'booking reference', 'booking ref'],
  gdsPnr: ['gds pnr', 'gds', 'gds record locator'],
  requestDate: ['request date', 'req date', 'date of request', 'requested on'],
  investorCompany: ['investment type', 'investor', 'investor company', 'group name', 'agency', 'agent', 'company'],
  licenseName: ['license', 'licence'],
  branchName: ['branch'],
  segment: ['segment', 'purpose'],
  airlineCode: ['airline', 'carrier', 'airline code'],
  seats: ['no of seats', 'seats', 'pax', 'no of pax', 'qty', 'quantity'],
  outboundDate: ['outbound date', 'outbound', 'departure date', 'dep date', 'travel date'],
  inboundDate: ['inbound date', 'inbound', 'return date'],
  sector: ['sector', 'route', 'itinerary'],
  pnrTlDate: ['pnr tl date', 'pnr tl', 'pnr time limit', 'tl date'],
  airlineTaxes: ['airline taxes', 'taxes', 'tax'],
  psf: ['psf', 'service fee'],
  fare: ['fare', 'base fare', 'fare per pax'],
  tripType: ['trip type'],
  outboundFlightCode: ['flight', 'flight no', 'flight number', 'flight code', 'outbound flight'],
  inboundFlightCode: ['inbound flight', 'return flight'],
  mealIncluded: ['meal', 'meal included'],
  roundIssuanceDate: ['issuance date', 'emd issuance date', 'issue date'],
  roundPaymentPct: ['payment age', 'payment', 'payment percentage', 'emd percentage'],
  roundEmdAmount: ['emd amount'],
  roundEmdNumber: ['emd number', 'emd no'],
  roundDeadlineDate: ['time limit date', 'emd deadline', 'deadline date'],
  roundDeadlineTime: ['time limit time', 'deadline time'],
};

const LOOKUP = new Map<string, string>();
for (const [field, names] of Object.entries(SYNONYMS)) for (const n of names) LOOKUP.set(n, field);

function dictionaryField(header: unknown): string | null {
  const h = normalizeHeader(header);
  if (!h) return null;
  // "1st EMD NUMBER", "2nd EMD NUMBER": the ordinal names the round, not the field.
  return LOOKUP.get(h.replace(/^\d+(st|nd|rd|th) /, '')) ?? null;
}

/**
 * Maps columns from the dictionary: the header row is the one among the top
 * rows with the most recognised headers (at least three), and repeated round
 * columns are numbered by the order they appear in.
 */
export function heuristicMapping(formatted: string[][]): ColumnMapping | null {
  let best: { row: number; hits: number } | null = null;
  formatted.slice(0, SAMPLE_ROWS).forEach((row, r) => {
    const hits = row.filter((c) => dictionaryField(c) !== null).length;
    if (hits >= 3 && (!best || hits > best.hits)) best = { row: r, hits };
  });
  if (!best) return null;
  const headerRow = (best as { row: number }).row;
  const raw = formatted[headerRow].map((c, index) => ({ index, field: dictionaryField(c) ?? 'ignore', round: null }));
  return validateMapping({ headerRow, columns: raw }, formatted[headerRow].length, formatted.length);
}

// --- Values ---------------------------------------------------------------

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

const iso = (y: number, m: number, d: number): string | null => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
};
const fullYear = (y: number) => (y < 100 ? 2000 + y : y);

/** Excel's day number → ISO date. Rounded, because workbooks store midnight a few seconds short. */
function excelSerialToIso(serial: number): string {
  const ms = Math.round(serial) * 86_400_000 + Date.UTC(1899, 11, 30);
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * A spreadsheet date: an Excel serial number, or text in a few unambiguous
 * forms. Slash and dash dates are read DAY first, as written in Pakistan.
 */
export function cellDate(v: unknown): string | null {
  if (typeof v === 'number') return v > 20_000 && v < 80_000 ? excelSerialToIso(v) : null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return iso(fullYear(+m[3]), +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-](\d{2,4})$/);
  if (m && MONTHS[m[2].toLowerCase()]) return iso(fullYear(+m[3]), MONTHS[m[2].toLowerCase()], +m[1]);
  return null;
}

/** A time: an Excel day fraction, or HH:mm / HHmm text. */
export function cellTime(v: unknown): string | null {
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const mins = Math.round(v * 24 * 60);
    return `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }
  const m = String(v ?? '').trim().match(/^(\d{1,2}):?(\d{2})$/);
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/** A number exactly as the cell holds it; text has commas and currency removed. */
export function cellNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '').replace(/[^0-9.-]/g, '');
  if (!s || s === '-' || s === '.') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * A percentage. A cell formatted as % holds a fraction (0.3 shown as "30%"),
 * which is how the master sheet records PAYMENT %AGE (decisions.md,
 * 2026-08: 0.15 = 15%, 1 = 100%). Without that format, a value from 0 to 1 is
 * read as a fraction and anything larger as the percentage itself.
 */
export function cellPercent(raw: unknown, shown: string): number | null {
  const pct = shown.trim().match(/^(-?[\d.,]+)\s*%$/);
  if (pct) return cellNumber(pct[1]);
  const n = cellNumber(raw);
  if (n === null) return null;
  return n >= 0 && n <= 1 ? Math.round(n * 10_000) / 100 : n;
}

/** EMD numbers are 13 digits, stored as `123 4567890123`. */
export function cellEmdNumber(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const digits = s.replace(/\D/g, '');
  return digits.length === 13 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : s;
}

function cellText(v: unknown): string | null {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s ? s : null;
}

function cellBoolean(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  const s = normalizeHeader(v);
  if (['yes', 'y', 'true', 'included', '1'].includes(s)) return true;
  if (['no', 'n', 'false', 'not included', '0'].includes(s)) return false;
  return null;
}

const KIND = new Map(BOOKING_FIELDS.map((f) => [f.key, f.kind]));

/** One cell to one field value, or `undefined` when the cell is empty. */
function convert(field: string, raw: unknown, shown: string): { value: unknown } | { unreadable: true } | undefined {
  if (raw === null || raw === undefined || String(raw).trim() === '') return undefined;
  let value: unknown;
  if (field === 'roundPaymentPct') value = cellPercent(raw, shown);
  else if (field === 'roundEmdNumber') value = cellEmdNumber(raw);
  else if (field === 'pnr' || field === 'gdsPnr' || field === 'airlineCode') value = cellText(raw)?.toUpperCase().replace(/\s/g, '') ?? null;
  else if (field === 'segment') value = normalizeSegment(cellText(raw)) ?? cellText(raw);
  else if (field === 'seats') {
    const n = cellNumber(raw);
    value = n !== null && Number.isInteger(n) ? n : null;
  } else if (field === 'tripType') {
    const s = normalizeHeader(raw);
    value = s.includes('one') ? 'one_way' : s.includes('round') || s.includes('return') ? 'round_trip' : null;
  } else {
    switch (KIND.get(field)) {
      case 'date':
        value = cellDate(raw);
        break;
      case 'time':
        value = cellTime(raw);
        break;
      case 'number':
        value = cellNumber(raw);
        break;
      case 'boolean':
        value = cellBoolean(raw);
        break;
      default:
        value = cellText(raw);
    }
  }
  return value === null ? { unreadable: true } : { value };
}

const empty = <T>(): ParsedField<T> => ({ value: null, confidence: 'low' });

function blankDraft(rawPastedText: string, modelUsed: string): ParsedBookingDraft {
  const d: Record<string, unknown> = {};
  for (const f of BOOKING_FIELDS) d[f.key] = empty();
  return { ...(d as unknown as ParsedBookingDraft), rawPastedText, modelUsed };
}

/** The most rows a spreadsheet hands to the review form, which goes one booking at a time. */
export const MAX_FORM_ROWS = 100;

/**
 * Turns every data row under the header into a draft. Rows with no PNR (totals,
 * blanks, notes) are skipped. Only round 1 fills the draft's round fields —
 * the form drafts one round, as it always has.
 */
export function applyMapping(
  mapping: ColumnMapping,
  rawRows: unknown[][],
  formattedRows: string[][],
  opts: { filename: string; method: string; confidence: FieldConfidence; firstRowNumber: number; limit?: number }
): { drafts: ParsedBookingDraft[]; totalRows: number } {
  const limit = opts.limit ?? MAX_FORM_ROWS;
  const pnrCol = mapping.columns.find((c) => c.field === 'pnr')!.index;
  const used = mapping.columns.filter((c) => !ROUND_FIELDS.has(c.field) || c.round === 1);
  const header = formattedRows[mapping.headerRow] ?? [];

  const drafts: ParsedBookingDraft[] = [];
  let totalRows = 0;
  for (let r = mapping.headerRow + 1; r < rawRows.length; r++) {
    const raw = rawRows[r] ?? [];
    if (!cellText(raw[pnrCol])) continue;
    totalRows++;
    if (drafts.length >= limit) continue;

    const rowNumber = opts.firstRowNumber + r;
    const draft = blankDraft(`Imported from ${opts.filename}, row ${rowNumber}`, opts.method);
    const out = draft as unknown as Record<string, ParsedField<unknown>>;
    for (const c of used) {
      const shown = String(formattedRows[r]?.[c.index] ?? '');
      const got = convert(c.field, raw[c.index], shown);
      if (!got) continue;
      out[c.field] =
        'unreadable' in got
          ? { value: null, confidence: 'low', notes: `Could not read "${shown || String(raw[c.index])}" in column ${normalizeHeader(header[c.index]).toUpperCase() || c.index + 1}.` }
          : { value: got.value, confidence: opts.confidence };
    }
    drafts.push(draft);
  }
  return { drafts, totalRows };
}
