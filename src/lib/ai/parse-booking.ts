import { fieldListForPrompt } from './booking-schema';
import { aiAttempts, failureReason, providerErrorCode, type AiAttempt, type FailureReason } from './providers';
import { flagPastDates } from './draft-checks';
import { todayIsoInPkt } from '@/lib/urgency';

export type FieldConfidence = 'high' | 'medium' | 'low';

export interface ParsedField<T> {
  value: T | null;
  confidence: FieldConfidence;
  notes?: string;
}

export interface ParsedStop {
  city: string | null;
  /** The onward flight from the stop; null when the same flight continues. */
  flightCode: string | null;
  arrivalTime: string | null;
  departureTime: string | null;
}

export interface ParsedBookingDraft {
  // PNR core fields
  requestDate: ParsedField<string>; // YYYY-MM-DD
  investorCompany: ParsedField<string>;
  licenseName: ParsedField<string>;
  branchName: ParsedField<string>;
  pnr: ParsedField<string>;
  gdsPnr: ParsedField<string>;
  segment: ParsedField<string>;
  airlineCode: ParsedField<string>;
  seats: ParsedField<number>;
  outboundDate: ParsedField<string>; // YYYY-MM-DD
  inboundDate: ParsedField<string>; // YYYY-MM-DD
  sector: ParsedField<string>; // e.g. "ISB-JED-MED-ISB"
  pnrTlDate: ParsedField<string>; // YYYY-MM-DD
  airlineTaxes: ParsedField<number>;
  psf: ParsedField<number>;
  fare: ParsedField<number>;

  // Flights (2026-09-26). outboundDate/inboundDate above are the departure dates.
  tripType: ParsedField<string>; // 'one_way' | 'round_trip'
  outboundDepartureCity: ParsedField<string>; // 3-letter airport code
  outboundArrivalCity: ParsedField<string>;
  outboundDepartureTime: ParsedField<string>; // HH:mm
  outboundArrivalTime: ParsedField<string>;
  outboundFlightCode: ParsedField<string>; // e.g. SV727
  outboundBaggagePieces: ParsedField<number>; // checked bags per passenger
  outboundBaggageKg: ParsedField<number>; // kg limit per bag
  inboundDepartureCity: ParsedField<string>;
  inboundArrivalCity: ParsedField<string>;
  inboundDepartureTime: ParsedField<string>;
  inboundArrivalTime: ParsedField<string>;
  inboundFlightCode: ParsedField<string>;
  inboundBaggagePieces: ParsedField<number>;
  inboundBaggageKg: ParsedField<number>;
  outboundStops: ParsedField<ParsedStop[]>;
  inboundStops: ParsedField<ParsedStop[]>;
  /** Meal included in the package, for the booking as a whole. */
  mealIncluded: ParsedField<boolean>;

  // EMD round 1 (if present in message)
  roundIssuanceDate: ParsedField<string>; // YYYY-MM-DD
  roundPaymentPct: ParsedField<number>;
  roundEmdAmount: ParsedField<number>;
  roundEmdNumber: ParsedField<string>;
  roundDeadlineDate: ParsedField<string>; // YYYY-MM-DD
  roundDeadlineTime: ParsedField<string>; // HH:mm

  // Meta
  rawPastedText: string;
  modelUsed?: string;
}

/**
 * The instructions, built per request so they carry today's date: airline
 * messages write dates without a year ("14NOV"), and without today's date the
 * model filled in 2023 or 2024 (found 2026-10-05). The field list comes from
 * `booking-schema.ts`; Gemini is additionally held to the JSON schema.
 */
export function bookingPrompt(todayIso: string): string {
  return `You extract airline group booking details from pasted confirmation emails, GDS PNR texts (Sabre, Amadeus, Galileo, Navitaire), booking slips or screenshots.

Today is ${todayIso}. A date written without a year is the next occurrence on or after today.

Reply with JSON only, as a table: {"columns": [<the fields you found>], "rows": [[<one value per column, null if this booking lacks it>], ...], "unsure": [[<row index>, "<field>"], ...]}. One row per distinct booking/PNR. Name each field once in "columns" — never repeat field names per row. List in "unsure" only the values you are not confident about.

Fields:
${fieldListForPrompt()}

Rules:
1. Dates YYYY-MM-DD; times 24-hour HH:mm as printed.
2. airlineCode is the 2-character IATA code (SV Saudia, PA Airblue, 9P Fly Jinnah, PK PIA, ER Serene, FZ Flydubai, QR Qatar Airways).
3. sector: 3-letter airport codes joined by dashes (ISB-JED, LHE-MED-JED-LHE).
4. Numbers without commas or currency symbols. fare and airlineTaxes are per passenger.
5. Not found: value null, confidence "low". Never invent codes or amounts; if unsure, confidence "low".
6. tripType "round_trip" when there is a return flight, else "one_way" (then every inbound field null). Outbound fields describe the first flight; inbound the return. Flight codes are designator + number, no space (SV727, 9P842). For connections use the first flight's code and departure and the final arrival, and list each intermediate airport in that leg's Stops: city, flightCode of the flight DEPARTING the stop (null if the same flight continues), arrival and departure times. Direct flight: [].
7. Baggage is checked allowance PER PASSENGER: pieces = number of bags, kg = limit of EACH bag. "2PC 23KG" = 2 and 23; "30KG" alone = pieces null, kg 30. One allowance for the trip applies to both flights. Ignore cabin baggage.
8. mealIncluded: true if meals are included, false if stated not included, null if not mentioned.
9. round* fields describe the first EMD / deposit: issue date, percentage (30 for 30%), amount, EMD number, and the deadline date and time.`;
}

export function cleanJsonString(raw: string): string {
  // A reasoning model may prefix its answer with a <think> block.
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  // Remove markdown code fences if present
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

function parseField<T>(
  data: Record<string, unknown> | undefined,
  key: string,
  type: 'string' | 'number' | 'date'
): ParsedField<T> {
  const empty: ParsedField<T> = { value: null, confidence: 'low' };
  if (!data || typeof data !== 'object') return empty;

  const rawItem = data[key];
  if (!rawItem || typeof rawItem !== 'object') {
    if (rawItem === null || rawItem === undefined) return empty;
    // Fallback if model returned primitive instead of object
    return {
      value: sanitizeValue(rawItem, type) as T,
      confidence: 'medium',
    };
  }

  const item = rawItem as { value?: unknown; confidence?: unknown; notes?: unknown };
  const confRaw = String(item.confidence || '').toLowerCase();
  const confidence: FieldConfidence =
    confRaw === 'high' || confRaw === 'medium' || confRaw === 'low' ? confRaw : 'medium';

  const val = sanitizeValue(item.value, type);

  return {
    value: val as T,
    confidence: val === null ? 'low' : confidence,
    notes: typeof item.notes === 'string' ? item.notes : undefined,
  };
}

function sanitizeValue(v: unknown, type: 'string' | 'number' | 'date'): unknown {
  if (v === null || v === undefined) return null;

  if (type === 'number') {
    if (typeof v === 'number') return Number.isNaN(v) ? null : v;
    if (typeof v === 'string') {
      const cleaned = v.replace(/[^0-9.-]/g, '');
      const n = Number(cleaned);
      return Number.isNaN(n) ? null : n;
    }
    return null;
  }

  if (type === 'date') {
    if (typeof v !== 'string') return null;
    const s = v.trim();
    // Validate YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return s;
    }
    // Attempt parse
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
    return null;
  }

  if (type === 'string') {
    if (typeof v === 'string') {
      const s = v.trim();
      return s === '' ? null : s;
    }
    return String(v).trim();
  }

  return null;
}

function confidenceOf(item: unknown): FieldConfidence {
  const c = String((item as { confidence?: unknown })?.confidence ?? '').toLowerCase();
  return c === 'high' || c === 'medium' || c === 'low' ? c : 'medium';
}

/** A list of stops. Anything that is not a list reads as "none found", at low confidence. */
function parseStops(data: Record<string, unknown>, key: string): ParsedField<ParsedStop[]> {
  const item = data?.[key] as { value?: unknown } | unknown[] | undefined;
  const list = Array.isArray(item) ? item : (item as { value?: unknown })?.value;
  if (!Array.isArray(list)) return { value: null, confidence: 'low' };
  const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
  const stops = list
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({ city: str(x.city), flightCode: str(x.flightCode), arrivalTime: str(x.arrivalTime), departureTime: str(x.departureTime) }));
  return { value: stops, confidence: Array.isArray(item) ? 'medium' : confidenceOf(item) };
}

function parseBoolean(data: Record<string, unknown>, key: string): ParsedField<boolean> {
  const item = data?.[key];
  const raw = item && typeof item === 'object' ? (item as { value?: unknown }).value : item;
  const value = raw === true || raw === 'true' ? true : raw === false || raw === 'false' ? false : null;
  return value === null ? { value: null, confidence: 'low' } : { value, confidence: item && typeof item === 'object' ? confidenceOf(item) : 'medium' };
}

/**
 * The table-shaped reply (`bookingPrompt`) as one object per booking in the
 * `{ field: { value, confidence } }` shape the rest of this file reads. A value
 * the model listed as unsure is low confidence; any other found value takes
 * the provider's confidence. Null when the reply is not a table.
 */
export function tableToBookings(parsed: unknown, foundConfidence: FieldConfidence): Record<string, unknown>[] | null {
  const t = parsed as { columns?: unknown; rows?: unknown; unsure?: unknown };
  if (!t || !Array.isArray(t.columns) || !Array.isArray(t.rows)) return null;
  const columns = t.columns.map((c) => String(c));
  const unsure = new Set(
    (Array.isArray(t.unsure) ? t.unsure : [])
      .filter((u): u is unknown[] => Array.isArray(u) && u.length >= 2)
      .map((u) => `${Number(u[0])}:${String(u[1])}`)
  );
  return t.rows
    .filter((r): r is unknown[] => Array.isArray(r))
    .map((row, i) =>
      Object.fromEntries(
        columns.map((c, j) => [
          c,
          { value: row[j] ?? null, confidence: unsure.has(`${i}:${c}`) ? 'low' : foundConfidence },
        ])
      )
    );
}

export function parseRawLlmJson(
  jsonText: string,
  rawPastedText: string,
  modelUsed?: string,
  foundConfidence: FieldConfidence = 'high'
): ParsedBookingDraft[] {
  const cleaned = cleanJsonString(jsonText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse LLM JSON output: ${err instanceof Error ? err.message : String(err)}`);
  }

  // The table reply (current); {"bookings": [...]}; or a bare array / object.
  const table = tableToBookings(parsed, foundConfidence);
  const bookings = (parsed as { bookings?: unknown })?.bookings;
  const parsedArray = table ?? (Array.isArray(bookings) ? bookings : Array.isArray(parsed) ? parsed : [parsed]);

  return parsedArray.map((item) => {
    const obj = item as Record<string, unknown>;
    return {
      requestDate: parseField<string>(obj, 'requestDate', 'date'),
      investorCompany: parseField<string>(obj, 'investorCompany', 'string'),
      licenseName: parseField<string>(obj, 'licenseName', 'string'),
      branchName: parseField<string>(obj, 'branchName', 'string'),
      pnr: parseField<string>(obj, 'pnr', 'string'),
      gdsPnr: parseField<string>(obj, 'gdsPnr', 'string'),
      segment: parseField<string>(obj, 'segment', 'string'),
      airlineCode: parseField<string>(obj, 'airlineCode', 'string'),
      seats: parseField<number>(obj, 'seats', 'number'),
      outboundDate: parseField<string>(obj, 'outboundDate', 'date'),
      inboundDate: parseField<string>(obj, 'inboundDate', 'date'),
      sector: parseField<string>(obj, 'sector', 'string'),
      pnrTlDate: parseField<string>(obj, 'pnrTlDate', 'date'),
      airlineTaxes: parseField<number>(obj, 'airlineTaxes', 'number'),
      psf: parseField<number>(obj, 'psf', 'number'),
      fare: parseField<number>(obj, 'fare', 'number'),

      tripType: parseField<string>(obj, 'tripType', 'string'),
      outboundDepartureCity: parseField<string>(obj, 'outboundDepartureCity', 'string'),
      outboundArrivalCity: parseField<string>(obj, 'outboundArrivalCity', 'string'),
      outboundDepartureTime: parseField<string>(obj, 'outboundDepartureTime', 'string'),
      outboundArrivalTime: parseField<string>(obj, 'outboundArrivalTime', 'string'),
      outboundFlightCode: parseField<string>(obj, 'outboundFlightCode', 'string'),
      outboundBaggagePieces: parseField<number>(obj, 'outboundBaggagePieces', 'number'),
      outboundBaggageKg: parseField<number>(obj, 'outboundBaggageKg', 'number'),
      inboundDepartureCity: parseField<string>(obj, 'inboundDepartureCity', 'string'),
      inboundArrivalCity: parseField<string>(obj, 'inboundArrivalCity', 'string'),
      inboundDepartureTime: parseField<string>(obj, 'inboundDepartureTime', 'string'),
      inboundArrivalTime: parseField<string>(obj, 'inboundArrivalTime', 'string'),
      inboundFlightCode: parseField<string>(obj, 'inboundFlightCode', 'string'),
      inboundBaggagePieces: parseField<number>(obj, 'inboundBaggagePieces', 'number'),
      inboundBaggageKg: parseField<number>(obj, 'inboundBaggageKg', 'number'),
      outboundStops: parseStops(obj, 'outboundStops'),
      inboundStops: parseStops(obj, 'inboundStops'),
      mealIncluded: parseBoolean(obj, 'mealIncluded'),

      roundIssuanceDate: parseField<string>(obj, 'roundIssuanceDate', 'date'),
      roundPaymentPct: parseField<number>(obj, 'roundPaymentPct', 'number'),
      roundEmdAmount: parseField<number>(obj, 'roundEmdAmount', 'number'),
      roundEmdNumber: parseField<string>(obj, 'roundEmdNumber', 'string'),
      roundDeadlineDate: parseField<string>(obj, 'roundDeadlineDate', 'date'),
      roundDeadlineTime: parseField<string>(obj, 'roundDeadlineTime', 'string'),

      rawPastedText,
      modelUsed,
    };
  });
}
/**
 * The AI service cannot be used at all with the configuration it was given —
 * no key, or a key every provider rejects. Distinct from a parse failure so the
 * route can say so plainly instead of "could not parse this input".
 *
 * Found on 2026-09-25: the configured `GEMINI_API_KEY` was not a Gemini API key
 * (Google returned 401 UNAUTHENTICATED on every endpoint), and every upload
 * reported only "failed to parse", which reads like a problem with the image.
 */
export class AiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiConfigError';
  }
}

/**
 * Every provider was busy, out of quota or too slow. Distinct from a parse
 * failure so the route can tell staff to try again shortly, rather than
 * suggest the input is the problem.
 */
export class AiBusyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiBusyError';
  }
}

/** A provider response that failed with an HTTP status, kept so it can be classified. */
class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ProviderHttpError';
  }
}

/**
 * Per-request deadline. One booking takes ~4–6 s; a screenshot of 14 bookings
 * 10–14 s with the table reply. 35 s leaves room for a larger table while
 * keeping ~20 s of the budget for the next provider. A timed-out request is
 * not retried on the same model — a request that slow would be slow again
 * (found 2026-10-05: two 25 s timeouts on one model used the whole budget).
 */
const ATTEMPT_TIMEOUT_MS = 35_000;

/**
 * Everything together — every provider, every retry — must finish inside this,
 * or the hosting platform ends the function first and staff see a bare error
 * instead of a message. The route sets `maxDuration = 60`.
 */
const TOTAL_BUDGET_MS = 55_000;

/** Wait before retrying a busy model. Overridable so tests do not sleep. */
function retryDelayMs(): number {
  const v = Number(process.env.GEMINI_RETRY_DELAY_MS);
  return Number.isFinite(v) && v >= 0 ? v : 1_500;
}

export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export interface AiRequest {
  system: string;
  user: string | ContentPart[];
  /** JSON schema for Gemini's structured output; without one (or on Groq), JSON mode. */
  schema?: object;
  schemaName?: string;
}

/**
 * Sends one request through the providers in order until a reply is accepted.
 *
 * `accept` turns the reply into the result and throws if it is unusable, which
 * moves on to the next attempt exactly like an HTTP failure would.
 *
 * - **busy** (5xx) or **timeout**: one retry after a short wait, then move on;
 * - **quota** (429): move on at once — retrying an exhausted quota only burns
 *   the time budget, which is how a quota hit used to surface as "busy";
 * - **key** (401/403): skip every remaining attempt on that provider;
 * - **invalid** (other status, or a reply `accept` rejects): move on.
 *
 * Every failure is logged as one line naming provider, model, reason, HTTP
 * status, the provider's error code and the time taken — never a request or
 * reply body, which carry passenger names and PNRs.
 */
export async function callAi<T>(req: AiRequest, accept: (content: string, attempt: AiAttempt) => T): Promise<T> {
  const attempts = aiAttempts();
  if (attempts.length === 0) {
    throw new AiConfigError('GEMINI_API_KEY is not configured, so no booking can be parsed.');
  }

  const startedAt = Date.now();
  const remaining = () => TOTAL_BUDGET_MS - (Date.now() - startedAt);
  const rejectedProviders = new Set<AiAttempt['provider']>();
  let lastError: Error | null = null;
  // True while every failure so far was busy / quota / timeout — decides
  // whether staff are told "try again shortly" or "could not parse".
  let onlyTransient = true;

  for (const attempt of attempts) {
    if (rejectedProviders.has(attempt.provider)) continue;
    for (let tryNo = 1; tryNo <= 2; tryNo++) {
      // Never start a request the time budget cannot finish.
      if (remaining() < 5_000) break;
      const t0 = Date.now();
      try {
        const response = await fetch(attempt.url, {
          signal: AbortSignal.timeout(Math.min(ATTEMPT_TIMEOUT_MS, remaining())),
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${attempt.apiKey}` },
          body: JSON.stringify({
            model: attempt.model,
            messages: [
              { role: 'system', content: req.system },
              { role: 'user', content: req.user },
            ],
            temperature: 0.1,
            response_format:
              attempt.output === 'json_schema' && req.schema
                ? { type: 'json_schema', json_schema: { name: req.schemaName ?? 'reply', schema: req.schema } }
                : { type: 'json_object' },
            ...(attempt.reasoningEffort ? { reasoning_effort: attempt.reasoningEffort } : {}),
            ...(attempt.maxTokens ? { max_completion_tokens: attempt.maxTokens } : {}),
          }),
        });

        if (!response.ok) {
          const body = await response.text();
          throw new ProviderHttpError(
            response.status,
            providerErrorCode(body),
            `${attempt.provider} ${attempt.model} answered ${response.status}`
          );
        }

        const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error(`Empty reply from ${attempt.provider} ${attempt.model}.`);

        const result = accept(content, attempt);
        console.info(`[AI] ${attempt.provider}/${attempt.model} ok ${Date.now() - t0}ms`);
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const timedOut = lastError.name === 'TimeoutError' || lastError.name === 'AbortError';
        const reason: FailureReason =
          err instanceof ProviderHttpError ? failureReason(err.status) : timedOut ? 'timeout' : 'invalid';
        console.warn(
          `[AI] ${attempt.provider}/${attempt.model} try ${tryNo} failed: reason=${reason}` +
            ` http=${err instanceof ProviderHttpError ? err.status : '-'}` +
            ` code=${err instanceof ProviderHttpError ? err.code || '-' : '-'} ${Date.now() - t0}ms`
        );

        if (reason === 'key') {
          rejectedProviders.add(attempt.provider);
          break;
        }
        if (reason === 'invalid') onlyTransient = false;
        // Only a busy provider is worth asking again; a timeout moves on.
        if (reason === 'busy' && tryNo === 1) {
          await new Promise((r) => setTimeout(r, retryDelayMs()));
          continue;
        }
        break;
      }
    }
  }

  // Every configured provider refused its key: an administrator's problem.
  if (attempts.every((a) => rejectedProviders.has(a.provider))) {
    throw new AiConfigError(`Every AI provider rejected its key. Last error: ${lastError?.message ?? 'none'}`);
  }
  if (lastError && onlyTransient) {
    throw new AiBusyError(`Every AI provider was busy, out of quota or timed out. Last error: ${lastError.message}`);
  }
  throw lastError || new AiBusyError('No AI request could be made within the time allowed.');
}

export async function parseAirlineMessage(
  rawText: string,
  opts: { imageBase64?: string; imageMimeType?: string } = {},
  todayIso: string = todayIsoInPkt()
): Promise<ParsedBookingDraft[]> {
  const hasImage = !!opts.imageBase64;
  const user: string | ContentPart[] = hasImage
    ? [
        { type: 'image_url', image_url: { url: `data:${opts.imageMimeType || 'image/png'};base64,${opts.imageBase64}` } },
        ...(rawText.trim() ? [{ type: 'text' as const, text: `Also consider this accompanying text:\n\n${rawText}` }] : []),
        { type: 'text', text: 'Extract the booking and EMD details from this airline booking screenshot.' },
      ]
    : `Extract the booking and EMD details from the following message:\n\n${rawText}`;

  return callAi(
    { system: bookingPrompt(todayIso), user },
    (content, attempt) =>
      parseRawLlmJson(content, rawText || '[image upload]', `${attempt.provider}/${attempt.model}`, attempt.confidence).map((d) =>
        flagPastDates(d, todayIso)
      )
  );
}
