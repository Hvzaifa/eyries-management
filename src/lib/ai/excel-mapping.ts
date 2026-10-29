import type { FieldConfidence, ParsedBookingDraft, ParsedField } from './parse-booking';
import { BOOKING_FIELDS } from './booking-schema';
import { normalizeSegment } from '@/lib/booking-entry';
import { arrivalDateFromTimes, parseLuggage, splitSectors, type Sector } from './sectors';
import { isFlightCode, normalizeFlightCode } from '@/lib/flight-details';

/**
 * Excel and CSV uploads on the new-booking page (owner, 2026-10-05): the AI
 * says which column is which field, and this file copies the values.
 *
 * Pure — no AI, no I/O — so it is fully tested. The AI only ever sees the top
 * rows and returns a column map; every amount and date in every row is read
 * here, exactly, so a model can never retype a number. When no AI answers,
 * `heuristicMapping` maps the columns from a fixed dictionary instead.
 */

/**
 * Fields a spreadsheet column can fill: the booking's own fields (stops are
 * never one column), plus two the form does not have but a sheet often does:
 *
 * - **sector fields**, numbered like EMD rounds, for flights written sector by
 *   sector (`flight_code_sector_1` … `_4`). `applyMapping` turns the sectors
 *   into the outbound and return flights and their stops;
 * - **luggage text** such as `1 PC 23KG`, which fills both baggage fields.
 */
const SECTOR_FIELDS = [
  'sectorAirline',
  'sectorFlightCode',
  'sectorFrom',
  'sectorTo',
  'sectorDepartureDate',
  'sectorDepartureTime',
  'sectorArrivalTime',
  'sectorBaggage',
] as const;
const LUGGAGE_FIELDS = ['outboundLuggage', 'inboundLuggage'] as const;

/**
 * Never read from a sheet (owner, 2026-10-20): an export's arrival dates were
 * wrong on about one sector in five, so the day a flight lands is worked out
 * from its times instead (`arrivalDateFromTimes`).
 */
const NOT_MAPPED = new Set(['outboundArrivalDate', 'inboundArrivalDate']);

export const MAPPABLE_FIELDS = [
  ...BOOKING_FIELDS.filter((f) => f.kind !== 'stops' && !NOT_MAPPED.has(f.key)).map((f) => f.key),
  ...SECTOR_FIELDS,
  ...LUGGAGE_FIELDS,
];
export type MappableField = string;

const ROUND_FIELDS = new Set([
  'roundIssuanceDate',
  'roundPaymentPct',
  'roundEmdAmount',
  'roundEmdNumber',
  'roundDeadlineDate',
  'roundDeadlineTime',
]);
/** Fields that repeat once per group: EMD rounds, and flight sectors. */
const NUMBERED_FIELDS = new Set<string>([...ROUND_FIELDS, ...SECTOR_FIELDS]);

/**
 * The per-flight fields. When a sheet gives its flights sector by sector, the
 * sectors decide all of these: a single date column beside them is not
 * reliable (the owner's export's `grp_arrival_date` reads 11 Jun on a booking
 * departing 29 Jun), so such a column is dropped from the map.
 */
const LEG_FIELDS = new Set<string>([
  'tripType', 'outboundDate', 'inboundDate', 'outboundLuggage', 'inboundLuggage',
  ...['outbound', 'inbound'].flatMap((leg) =>
    ['DepartureCity', 'ArrivalCity', 'DepartureTime', 'ArrivalTime', 'FlightCode', 'BaggagePieces', 'BaggageKg'].map((f) => leg + f)
  ),
]);

/**
 * What each field means, for the AI. The map is only as good as this: a model
 * shown bare field names guessed "name" was not the license and "al_name" was
 * not the airline (owner, 2026-10-20).
 */
const FIELD_GUIDE: Record<string, string> = {
  pnr: "the airline's booking reference (6 characters, e.g. 8PA8YA). Prefer the airline PNR over offer/GDS copies",
  gdsPnr: 'the GDS record locator, when a separate column holds it',
  requestDate: 'the date the group was requested or booked; when there is no such column, the transaction date (owner, 2026-10-20)',
  investorCompany: 'who invested in the seats: "Company Investment", "Customer Investment", or an agent/customer name',
  licenseName: 'the license / supplier account the booking is bought under — values look like the licenses listed below',
  branchName: 'the branch, by name or code — values look like the branches listed below',
  airlineCode: 'the airline of the booking, by its code or its name — values look like the airlines listed below. One booking-level column, not a per-sector one',
  segment: 'the group type / travel purpose — values look like the segments listed below',
  seats: 'the total number of seats in the group (not offered, sold, transferred or available seats)',
  sector: 'the route as one text, e.g. ISB-JED-ISB',
  outboundDate: 'departure date of the outbound flight, when not given per sector',
  inboundDate: 'departure date of the return flight, when not given per sector',
  pnrTlDate: 'the booking time limit / PNR TL date',
  ticketIssuanceDeadline: 'the date tickets must be issued by (ticketing deadline / ticket TL). Not a payment, expiry, PNR TL or EMD date',
  fare: 'base fare per seat, without taxes',
  airlineTaxes: 'airline taxes per seat',
  psf: 'PSF / service fee per seat',
  tripType: 'one way or round trip, only when a column says exactly that',
  mealIncluded: 'whether a meal is included (yes/no)',
  outboundLuggage: 'baggage text for the outbound flight, e.g. "1 PC 23KG", when not given per sector',
  inboundLuggage: 'baggage text for the return flight, when not given per sector',
  sectorAirline: "airline code of one sector, e.g. SV (al_code…). Read but not used: it is listed so it is not mistaken for the flight number",
  sectorFlightCode: 'flight NUMBER of one sector: designator plus digits, e.g. SV-725 or PK731. Never a column holding only the 2-letter airline code (al_code…)',
  sectorFrom: 'departure airport code of one sector',
  sectorTo: 'arrival airport code of one sector',
  sectorDepartureDate: 'departure date of one sector (never its arrival date, which is not read)',
  sectorDepartureTime: 'departure time (ETD) of one sector',
  sectorArrivalTime: 'arrival time (ETA) of one sector',
  sectorBaggage: 'baggage / luggage text of one sector, e.g. "1 PC 23KG 7KG"',
  roundIssuanceDate: 'date an EMD (deposit) was issued',
  roundPaymentPct: 'EMD payment percentage',
  roundEmdAmount: 'EMD amount',
  roundEmdNumber: 'EMD number (13 digits)',
  roundDeadlineDate: 'EMD time limit date',
  roundDeadlineTime: 'EMD time limit time',
};

export interface ColumnMapping {
  /** 0-based index, within the rows read, of the row holding the headers. */
  headerRow: number;
  /** `round` is the EMD round or the flight sector, for numbered fields; 1 otherwise. */
  columns: { index: number; field: MappableField; round: number }[];
}

/** The JSON schema the AI's column map is held to. */
export const MAPPING_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
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
  required: ['columns'],
};

/** How many top rows are searched for the header row. */
export const SAMPLE_ROWS = 8;
/** How many rows under the header are read for each column's examples. */
const PROFILE_ROWS = 40;

/** Exports write "NULL" into empty cells. */
const isBlank = (v: unknown) => {
  const s = String(v ?? '').trim();
  return s === '' || s.toUpperCase() === 'NULL';
};

/**
 * The header row: among the top rows, the one with the most text cells. A
 * totals row above it is numbers; a title row has one or two cells.
 */
export function guessHeaderRow(formatted: string[][]): number {
  let best = 0;
  let bestCount = -1;
  formatted.slice(0, SAMPLE_ROWS).forEach((row, r) => {
    const n = row.filter((c) => !isBlank(c) && !/^[\d.,\s%-]+$/.test(String(c))).length;
    if (n > bestCount) {
      best = r;
      bestCount = n;
    }
  });
  return best;
}

/**
 * Every column as the AI sees it: its header, how many of the rows read have
 * a value, and up to three different example values.
 */
export function columnProfiles(formatted: string[][], headerRow: number): string {
  const header = formatted[headerRow] ?? [];
  const below = formatted.slice(headerRow + 1, headerRow + 1 + PROFILE_ROWS).filter((r) => r.some((c) => !isBlank(c)));
  const width = Math.max(header.length, ...below.map((r) => r.length));
  const lines: string[] = [];
  for (let i = 0; i < width; i++) {
    const values = below.map((r) => String(r[i] ?? '').replace(/\s+/g, ' ').trim()).filter((v) => !isBlank(v));
    const name = String(header[i] ?? '').replace(/\s+/g, ' ').trim();
    if (!name && values.length === 0) continue;
    const examples = [...new Set(values)].slice(0, 3).map((v) => v.slice(0, 30));
    lines.push(
      `[${i}] "${name.slice(0, 50)}" — filled ${values.length}/${below.length}` +
        (examples.length ? ` — e.g. ${examples.join(' | ')}` : '')
    );
  }
  return lines.join('\n');
}

/** The system's own values, which tell the AI which column holds what. */
export interface KnownValues {
  licenses: { code: string | null; name: string }[];
  branches: { code: string | null; name: string }[];
  airlines: { code: string; name: string }[];
  segments: readonly string[];
}

const both = (l: { code: string | null; name: string }) => (l.code && l.code !== l.name ? `${l.code} (${l.name})` : l.code ?? l.name);

export function mappingPrompt(known?: KnownValues): string {
  const fields = MAPPABLE_FIELDS.map((f) => `- ${f}: ${FIELD_GUIDE[f] ?? 'as named'}`).join('\n');
  const lists = known
    ? `

Values this system knows (match a column by its example values, by code or by name):
- licenses: ${known.licenses.map(both).join(', ')}
- branches: ${known.branches.map(both).join(', ')}
- airlines: ${known.airlines.map((a) => `${a.code} (${a.name})`).join(', ')}
- segments: ${known.segments.join(', ')}`
    : '';
  return `You map the columns of a spreadsheet of airline group bookings to the fields of a booking system. Layouts differ from file to file, so decide by each column's MEANING and its EXAMPLE VALUES — never by exact header wording.

Fields:
${fields}${lists}

Rules:
- Each column is shown as: [index] "header" — how many sample rows have a value — example values.
- Flights written sector by sector (headers numbered "sector 1", "leg 2", "_1", …) map to the sector fields, with "round" set to the sector number. Do not also map them to outbound/inbound fields.
- EMD round columns that repeat per round map to the round fields, with "round" set to the round number.
- "round" is null for every other field.
- Never map two columns to the same field (or the same field and number). When two columns look alike, take the one filled in more rows.
- Leave out columns that match no field: ids, prices other than base fare and taxes, statuses, users, timestamps, hotel and package details.

Reply with JSON only: {"columns": [{"index": <n>, "field": "<field>", "round": <n or null>}]}`;
}

/**
 * Checks a column map against the sheet and keeps only what is sound: indexes
 * inside the sheet, known fields, no field mapped twice (numbered fields may
 * repeat once per number). Returns null when nothing usable is left or no PNR
 * column was found — the caller then falls back to the dictionary.
 */
export function validateMapping(raw: unknown, width: number, headerRow: number): ColumnMapping | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { columns?: unknown };
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
    if (NUMBERED_FIELDS.has(field)) {
      const given = Number(c?.round);
      round = Number.isInteger(given) && given >= 1 ? given : (nextRound.get(field) ?? 1);
      nextRound.set(field, round + 1);
    }
    const key = NUMBERED_FIELDS.has(field) ? `${field}#${round}` : field;
    if (seen.has(key)) continue;
    seen.add(key);
    indexes.add(index);
    columns.push({ index, field, round });
  }
  if (!columns.some((c) => c.field === 'pnr')) return null;
  const bySector = columns.some((c) => SECTOR_FIELDS.includes(c.field as (typeof SECTOR_FIELDS)[number]));
  return { headerRow, columns: bySector ? columns.filter((c) => !LEG_FIELDS.has(c.field)) : columns };
}

/** "flight code sector 2" → stem "flight code", sector 2: the ending the dictionary reads. */
const SECTOR_HEADER = /^(.*?)\s*(?:sector|leg)\s*(\d)$/;

/**
 * Adds the other sectors of a sector field the map named for only some of
 * them: when `flight_code_sector_1` is mapped, so are `flight_code_sector_2`
 * … `_4`. A model mapped only sector 1 in one of three runs on the owner's
 * export (2026-10-20), losing every return flight and its times, which a new
 * booking now requires.
 */
function completeSectors(mapping: ColumnMapping, header: string[]): ColumnMapping {
  const taken = new Set(mapping.columns.map((c) => c.index));
  const named = new Set(mapping.columns.map((c) => `${c.field}#${c.round}`));
  const added: ColumnMapping['columns'] = [];
  for (const c of mapping.columns) {
    if (!SECTOR_FIELDS.includes(c.field as (typeof SECTOR_FIELDS)[number])) continue;
    const mine = normalizeHeader(header[c.index]).match(SECTOR_HEADER);
    if (!mine) continue;
    header.forEach((h, index) => {
      const other = normalizeHeader(h).match(SECTOR_HEADER);
      if (!other || other[1] !== mine[1] || taken.has(index)) return;
      const round = Number(other[2]);
      if (named.has(`${c.field}#${round}`)) return;
      added.push({ index, field: c.field, round });
      taken.add(index);
      named.add(`${c.field}#${round}`);
    });
  }
  return added.length ? { ...mapping, columns: [...mapping.columns, ...added] } : mapping;
}

/**
 * Checks the map against the sheet itself, whatever the headers say:
 *
 * - the other sectors of a sector field are added (`completeSectors`);
 * - a column mapped as flight numbers whose values are not flight numbers is
 *   dropped — a model once mapped the "SV" airline-code column there, over the
 *   "SV-725" one beside it.
 */
export function checkMappingValues(mapping: ColumnMapping, formatted: string[][]): ColumnMapping {
  mapping = completeSectors(mapping, formatted[mapping.headerRow] ?? []);
  const values = (index: number) =>
    formatted
      .slice(mapping.headerRow + 1, mapping.headerRow + 1 + PROFILE_ROWS)
      .map((r) => String(r[index] ?? '').trim())
      .filter((v) => !isBlank(v));
  const looksLikeFlights = (index: number) => {
    const v = values(index);
    return v.length === 0 || v.filter((x) => isFlightCode(normalizeFlightCode(x))).length * 2 >= v.length;
  };
  const flightFields = new Set(['sectorFlightCode', 'outboundFlightCode', 'inboundFlightCode']);
  return { ...mapping, columns: mapping.columns.filter((c) => !flightFields.has(c.field) || looksLikeFlights(c.index)) };
}

/** Header text compared on whole words: lower-case, punctuation and line breaks as spaces. */
export function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * The fallback dictionary, used only when no AI answers. Matched on the WHOLE
 * normalised header: the old parser matched substrings, so "type" caught
 * INVESTMENT TYPE as the segment and "code" matched anything (2026-10-05).
 */
const SYNONYMS: Record<string, string[]> = {
  pnr: ['pnr', 'pnr no', 'pnr number', 'record locator', 'booking reference', 'booking ref', 'airline pnr'],
  gdsPnr: ['gds pnr', 'gds', 'gds record locator'],
  requestDate: ['request date', 'req date', 'date of request', 'requested on', 'transaction date'],
  investorCompany: ['investment type', 'investor', 'investor company', 'group name', 'agency', 'agent', 'company'],
  licenseName: ['license', 'licence', 'supplier', 'supplier name'],
  branchName: ['branch', 'branch name', 'branch code'],
  segment: ['segment', 'purpose', 'grp type', 'group type'],
  airlineCode: ['airline', 'carrier', 'airline code', 'airline name', 'al name'],
  seats: ['no of seats', 'seats', 'pax', 'no of pax', 'qty', 'quantity', 'total qty', 'total seats'],
  outboundDate: ['outbound date', 'outbound', 'departure date', 'dep date', 'travel date'],
  inboundDate: ['inbound date', 'inbound', 'return date'],
  sector: ['sector', 'route', 'itinerary', 'sector details'],
  pnrTlDate: ['pnr tl date', 'pnr tl', 'pnr time limit', 'tl date'],
  ticketIssuanceDeadline: ['ticket issuance deadline', 'ticketing deadline', 'ticket deadline', 'ticketing tl', 'ticket tl', 'tkt tl'],
  airlineTaxes: ['airline taxes', 'taxes', 'tax', 'tax amount'],
  psf: ['psf', 'service fee'],
  fare: ['fare', 'base fare', 'fare per pax', 'base fare amount'],
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

/** Sector columns: the header without its "sector N" / "leg N" ending. */
const SECTOR_SYNONYMS: Record<string, string[]> = {
  sectorFlightCode: ['flight code', 'flight no', 'flight number', 'flight'],
  sectorFrom: ['from sector code', 'from', 'from city', 'origin', 'departure city'],
  sectorTo: ['to sector code', 'to', 'to city', 'destination', 'arrival city'],
  sectorDepartureDate: ['grp departure date', 'departure date', 'dep date', 'date'],
  sectorDepartureTime: ['grp etd time', 'etd time', 'etd', 'departure time', 'dep time'],
  sectorArrivalTime: ['grp eta time', 'eta time', 'eta', 'arrival time', 'arr time'],
  sectorBaggage: ['luggage', 'baggage'],
};

const LOOKUP = new Map<string, string>();
for (const [field, names] of Object.entries(SYNONYMS)) for (const n of names) LOOKUP.set(n, field);
const SECTOR_LOOKUP = new Map<string, string>();
for (const [field, names] of Object.entries(SECTOR_SYNONYMS)) for (const n of names) SECTOR_LOOKUP.set(n, field);

function dictionaryField(header: unknown): { field: string; round: number | null } | null {
  const h = normalizeHeader(header);
  if (!h) return null;
  const sector = h.match(/^(.*?)\s*(?:sector|leg)\s*(\d)$/);
  if (sector) {
    const field = SECTOR_LOOKUP.get(sector[1].trim());
    return field ? { field, round: Number(sector[2]) } : null;
  }
  // "1st EMD NUMBER", "2nd EMD NUMBER": the ordinal names the round, not the field.
  const field = LOOKUP.get(h.replace(/^\d+(st|nd|rd|th) /, ''));
  return field ? { field, round: null } : null;
}

/**
 * Maps columns from the dictionary: the header row is the one among the top
 * rows with the most recognised headers (at least three); repeated round
 * columns are numbered by the order they appear in, sector columns by their
 * own number.
 */
export function heuristicMapping(formatted: string[][]): ColumnMapping | null {
  let best: { row: number; hits: number } | null = null;
  formatted.slice(0, SAMPLE_ROWS).forEach((row, r) => {
    const hits = row.filter((c) => dictionaryField(c) !== null).length;
    if (hits >= 3 && (!best || hits > best.hits)) best = { row: r, hits };
  });
  if (!best) return null;
  const headerRow = (best as { row: number }).row;
  const raw = formatted[headerRow].map((c, index) => {
    const found = dictionaryField(c);
    return { index, field: found?.field ?? 'ignore', round: found?.round ?? null };
  });
  return validateMapping({ columns: raw }, formatted[headerRow].length, headerRow);
}

// --- Values ---------------------------------------------------------------

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

const iso = (y: number, m: number, d: number): string | null => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
};
const fullYear = (y: number) => (y < 100 ? 2000 + y : y);

/**
 * Excel's day number → ISO date. The time of day is dropped, so 16:06 on
 * 7 May stays 7 May (2026-10-20: rounding moved every afternoon timestamp to
 * the next day). A minute's grace still reads a midnight stored a few seconds
 * short as that day.
 */
function excelSerialToIso(serial: number): string {
  const ms = Math.floor(serial + 1 / 1440) * 86_400_000 + Date.UTC(1899, 11, 30);
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

/**
 * A time: an Excel day fraction, HH:mm / HHmm text, or HHmm stored as a whole
 * number — exports write 00:45 as `45` and 09:50 as `950`.
 */
export function cellTime(v: unknown): string | null {
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const mins = Math.round(v * 24 * 60);
    return `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }
  if (typeof v === 'number') {
    if (!Number.isInteger(v) || v > 2359 || v % 100 > 59) return null;
    return `${String(Math.floor(v / 100)).padStart(2, '0')}:${String(v % 100).padStart(2, '0')}`;
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

export function cellText(v: unknown): string | null {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s ? s : null;
}

export function cellBoolean(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  const s = normalizeHeader(v);
  if (['yes', 'y', 'true', 'included', '1'].includes(s)) return true;
  if (['no', 'n', 'false', 'not included', '0'].includes(s)) return false;
  return null;
}

const KIND = new Map(BOOKING_FIELDS.map((f) => [f.key, f.kind]));

/** One cell to one field value, or `undefined` when the cell is empty. */
function convert(field: string, raw: unknown, shown: string): { value: unknown } | { unreadable: true } | undefined {
  if (raw === null || raw === undefined || isBlank(raw)) return undefined;
  let value: unknown;
  if (field === 'sectorDepartureDate') value = cellDate(raw);
  else if (field === 'sectorDepartureTime' || field === 'sectorArrivalTime') value = cellTime(raw);
  else if (field === 'sectorFrom' || field === 'sectorTo') value = cellText(raw)?.toUpperCase() ?? null;
  else if (field === 'roundPaymentPct') value = cellPercent(raw, shown);
  else if (field === 'roundEmdNumber') value = cellEmdNumber(raw);
  else if (field === 'pnr' || field === 'gdsPnr') value = cellText(raw)?.toUpperCase().replace(/\s/g, '') ?? null;
  else if (field === 'airlineCode') {
    // A code ("sv", "P K") is tidied; a name ("Saudi Arabian Airlines") is kept as written.
    const t = cellText(raw);
    value = t && t.replace(/\s/g, '').length <= 3 ? t.replace(/\s/g, '').toUpperCase() : t;
  }
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

export function blankDraft(rawPastedText: string, modelUsed: string): ParsedBookingDraft {
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
  const direct = new Set(used.map((c) => c.field));
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
    const sectors = new Map<number, Partial<Record<string, unknown>>>();
    const luggage: Partial<Record<string, string>> = {};
    for (const c of used) {
      const shown = String(formattedRows[r]?.[c.index] ?? '');
      const got = convert(c.field, raw[c.index], shown);
      if (!got) continue;
      if (c.field.startsWith('sector')) {
        // Kept aside: sectors become flights once the whole row is read.
        if ('value' in got) sectors.set(c.round, { ...sectors.get(c.round), [c.field]: got.value });
        continue;
      }
      if (c.field.endsWith('Luggage')) {
        if ('value' in got) luggage[c.field] = String(got.value);
        continue;
      }
      out[c.field] =
        'unreadable' in got
          ? { value: null, confidence: 'low', notes: `Could not read "${shown || String(raw[c.index])}" in column ${normalizeHeader(header[c.index]).toUpperCase() || c.index + 1}.` }
          : { value: got.value, confidence: opts.confidence };
    }
    applySectors(out, sectors, direct, opts.confidence);
    if (sectors.size === 0) applyArrivalDates(out, opts.confidence);
    for (const leg of ['outbound', 'inbound'] as const) {
      const bag = parseLuggage(luggage[`${leg}Luggage`] ?? null);
      if (out[`${leg}BaggagePieces`].value === null && bag.pieces !== null) out[`${leg}BaggagePieces`] = { value: bag.pieces, confidence: opts.confidence };
      if (out[`${leg}BaggageKg`].value === null && bag.kg !== null) out[`${leg}BaggageKg`] = { value: bag.kg, confidence: opts.confidence };
    }
    drafts.push(draft);
  }
  return { drafts, totalRows };
}

/**
 * A row's sectors as the outbound and return flights: departure from the
 * first sector of each, arrival from the last, each connection a stop, and
 * the trip type. A field the sheet gave directly is never overwritten. When
 * the split could not be read from dates, everything it set is marked low.
 */
function applySectors(
  out: Record<string, ParsedField<unknown>>,
  byNumber: Map<number, Partial<Record<string, unknown>>>,
  direct: Set<string>,
  confidence: FieldConfidence
) {
  const sectors: Sector[] = [...byNumber.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, s]) => ({
      flightCode: (s.sectorFlightCode as string) ?? null,
      from: (s.sectorFrom as string) ?? null,
      to: (s.sectorTo as string) ?? null,
      departureDate: (s.sectorDepartureDate as string) ?? null,
      departureTime: (s.sectorDepartureTime as string) ?? null,
      arrivalTime: (s.sectorArrivalTime as string) ?? null,
      baggage: (s.sectorBaggage as string) ?? null,
    }))
    .filter((s) => s.from || s.to || s.flightCode);
  if (sectors.length === 0) return;

  const { outbound, inbound, certain } = splitSectors(sectors);
  const conf: FieldConfidence = certain ? confidence : 'low';
  const put = (key: string, value: unknown, c: FieldConfidence = conf) => {
    if (direct.has(key) || value === null || value === undefined) return;
    out[key] = { value, confidence: c };
  };
  for (const [leg, list] of [['outbound', outbound], ['inbound', inbound]] as const) {
    if (list.length === 0) continue;
    const first = list[0];
    const last = list[list.length - 1];
    put(`${leg}Date`, first.departureDate);
    put(`${leg}DepartureCity`, first.from);
    put(`${leg}ArrivalCity`, last.to);
    put(`${leg}DepartureTime`, first.departureTime);
    put(`${leg}ArrivalTime`, last.arrivalTime);
    put(`${leg}FlightCode`, first.flightCode);
    const bag = parseLuggage(first.baggage);
    put(`${leg}BaggagePieces`, bag.pieces);
    put(`${leg}BaggageKg`, bag.kg);

    // The days, from the times (owner, 2026-10-20), always filled — the
    // departure day too. A day after the flight's departure is marked to check.
    const day = first.departureDate;
    const landsOn = (s: Sector) => arrivalDateFromTimes(s.departureDate, s.departureTime, s.arrivalTime);
    const later = (d: string | null) => !!d && !!day && d !== day;
    const arrivalDate = landsOn(last);
    put(`${leg}ArrivalDate`, arrivalDate, later(arrivalDate) ? toCheck(conf) : conf);
    // Each connection is a stop: where the previous sector landed, and the
    // flight leaving it.
    const stops = list.slice(1).map((s, i) => ({
      city: s.from,
      flightCode: s.flightCode,
      arrivalTime: list[i].arrivalTime,
      departureTime: s.departureTime,
      arrivalDate: landsOn(list[i]),
      departureDate: s.departureDate,
    }));
    put(`${leg}Stops`, stops, stops.some((s) => later(s.arrivalDate) || later(s.departureDate)) ? toCheck(conf) : conf);
  }
  put('tripType', inbound.length > 0 ? 'round_trip' : 'one_way');
}

/** A value worked out rather than read is at most "check this" (amber), never "sure". */
const toCheck = (c: FieldConfidence): FieldConfidence => (c === 'high' ? 'medium' : c);

/**
 * A sheet with one departure and one arrival time per flight: the arrival
 * date, always filled — the next day (marked to check) when it lands at an
 * earlier time than it left, otherwise the departure day.
 */
function applyArrivalDates(out: Record<string, ParsedField<unknown>>, confidence: FieldConfidence) {
  for (const leg of ['outbound', 'inbound'] as const) {
    const day = out[`${leg}Date`].value as string | null;
    const landsOn = arrivalDateFromTimes(day, out[`${leg}DepartureTime`].value as string | null, out[`${leg}ArrivalTime`].value as string | null);
    if (landsOn) out[`${leg}ArrivalDate`] = { value: landsOn, confidence: landsOn !== day ? toCheck(confidence) : confidence };
  }
}
