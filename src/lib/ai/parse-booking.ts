export type FieldConfidence = 'high' | 'medium' | 'low';

export interface ParsedField<T> {
  value: T | null;
  confidence: FieldConfidence;
  notes?: string;
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
  dealPct: ParsedField<number>;
  airlineTaxes: ParsedField<number>;
  psf: ParsedField<number>;
  fare: ParsedField<number>;

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

const SYSTEM_PROMPT = `You are an expert airline group booking data extraction assistant for an airline seat management system.
Your task is to analyze pasted airline confirmation emails, GDS PNR texts (Sabre, Amadeus, Galileo, Navitaire), or booking slips, and extract structured fields.

Return ONLY a valid JSON array of objects matching this exact schema. If the text contains multiple distinct bookings or PNRs, return multiple objects in the array. For every field, return an object with "value", "confidence" ("high", "medium", or "low"), and optional "notes" explaining your extraction.

Schema:
[
  {
  "pnr": { "value": string | null, "confidence": "high"|"medium"|"low", "notes": string },
  "gdsPnr": { "value": string | null, "confidence": "high"|"medium"|"low", "notes": string },
  "airlineCode": { "value": string | null, "confidence": "high"|"medium"|"low", "notes": string },
  "investorCompany": { "value": string | null, "confidence": "high"|"medium"|"low", "notes": string },
  "licenseName": { "value": string | null, "confidence": "high"|"medium"|"low", "notes": string },
  "branchName": { "value": string | null, "confidence": "high"|"medium"|"low", "notes": string },
  "segment": { "value": string | null, "confidence": "high"|"medium"|"low", "notes": string },
  "seats": { "value": number | null, "confidence": "high"|"medium"|"low", "notes": string },
  "sector": { "value": string | null, "confidence": "high"|"medium"|"low", "notes": string },
  "requestDate": { "value": "YYYY-MM-DD" | null, "confidence": "high"|"medium"|"low", "notes": string },
  "outboundDate": { "value": "YYYY-MM-DD" | null, "confidence": "high"|"medium"|"low", "notes": string },
  "inboundDate": { "value": "YYYY-MM-DD" | null, "confidence": "high"|"medium"|"low", "notes": string },
  "pnrTlDate": { "value": "YYYY-MM-DD" | null, "confidence": "high"|"medium"|"low", "notes": string },
  "fare": { "value": number | null, "confidence": "high"|"medium"|"low", "notes": string },
  "airlineTaxes": { "value": number | null, "confidence": "high"|"medium"|"low", "notes": string },
  "psf": { "value": number | null, "confidence": "high"|"medium"|"low", "notes": string },
  "dealPct": { "value": number | null, "confidence": "high"|"medium"|"low", "notes": string },
  "roundIssuanceDate": { "value": "YYYY-MM-DD" | null, "confidence": "high"|"medium"|"low", "notes": string },
  "roundPaymentPct": { "value": number | null, "confidence": "high"|"medium"|"low", "notes": string },
  "roundEmdAmount": { "value": number | null, "confidence": "high"|"medium"|"low", "notes": string },
  "roundEmdNumber": { "value": string | null, "confidence": "high"|"medium"|"low", "notes": string },
    "roundDeadlineDate": { "value": "YYYY-MM-DD" | null, "confidence": "high"|"medium"|"low", "notes": string },
    "roundDeadlineTime": { "value": "HH:mm" | null, "confidence": "high"|"medium"|"low", "notes": string }
  }
]

Guidelines:
1. Dates must be formatted as YYYY-MM-DD. If year is missing in text, infer current or next logical year based on travel dates.
2. Airline code should be 2-character IATA if identifiable (e.g. SV for Saudia, PA for Airblue, 9P for Fly Jinnah, PK for PIA, ER for Serene, FZ for Flydubai, QR for Qatar Airways).
3. Sector format: standard IATA 3-letter codes joined by dashes (e.g. "ISB-JED", "LHE-MED-JED-LHE", "KHI-DXB-KHI").
4. Seats and monetary amounts (fare, taxes, psf, emdAmount) must be numbers without commas or currency symbols.
5. If a field cannot be found in the text, set value to null and confidence to "low".
6. Never make up booking codes or amounts. If ambiguous, set confidence to "low" and explain in notes.
7. Return ONLY the JSON array. Do not include markdown code block formatting or explanation text outside the JSON.`;

export function cleanJsonString(raw: string): string {
  let cleaned = raw.trim();
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

export function parseRawLlmJson(jsonText: string, rawPastedText: string, modelUsed?: string): ParsedBookingDraft[] {
  const cleaned = cleanJsonString(jsonText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse LLM JSON output: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Ensure it's an array
  const parsedArray = Array.isArray(parsed) ? parsed : [parsed];

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
      dealPct: parseField<number>(obj, 'dealPct', 'number'),
      airlineTaxes: parseField<number>(obj, 'airlineTaxes', 'number'),
      psf: parseField<number>(obj, 'psf', 'number'),
      fare: parseField<number>(obj, 'fare', 'number'),

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
 * Gemini's OpenAI-compatible endpoint, reached with `GEMINI_API_KEY`.
 *
 * The env var name is only a label — this URL is what decides which service
 * receives the request. That distinction cost a debugging session: the key's
 * *value* was swapped to Gemini while the URL still pointed at OpenRouter, so
 * every call 401'd and the intake route reported it as the same generic 500 it
 * reports for any other failure.
 *
 * Groq and Cerebras providers were removed on 2026-09-09 — same reasoning that
 * removed Ollama on 2026-09-07 (docs/decisions.md). Neither key is set on the
 * deployed app, so neither was ever reachable in production; Cerebras answered
 * 402 (no credit) and Groq's pinned models had 404'd out of existence, so the
 * "fallback" was three guaranteed failures before the only working provider.
 * Gemini is multimodal, so one provider now serves both text and screenshots.
 */
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

/**
 * The AI service cannot be used at all with the configuration it was given —
 * no key, or a key the provider rejects. Distinct from a parse failure so the
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
 * HTTP statuses that mean "this key will not work", not "this attempt failed".
 * 401 = not a valid credential; 403 = valid but not permitted (API disabled,
 * key restricted). Retrying another model with the same key cannot help.
 */
export function isKeyRejection(status: number): boolean {
  return status === 401 || status === 403;
}

/**
 * The provider is up but will not serve this request right now — rate limited
 * or "experiencing high demand". Worth one quick retry, and never the user's
 * input at fault.
 *
 * Found on 2026-09-25: Google answers 503 "This model is currently experiencing
 * high demand" intermittently (1 in 3 probes on two models that day), and the
 * screenshot path had a single model and no retry — so every busy moment
 * reached staff as "failed to parse", which reads like a bad screenshot.
 */
export function isTransientStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

/**
 * Every model was busy or unreachable. Distinct from a parse failure so the
 * route can tell staff to try again shortly, rather than suggest the input is
 * the problem.
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
    message: string
  ) {
    super(message);
    this.name = 'ProviderHttpError';
  }
}

/**
 * Tried in order until one returns usable JSON.
 *
 * Checked against the live API on 2026-09-25 with a rendered booking
 * confirmation (PNR, seats, sector, dates, fare, taxes, segment): both models
 * extracted every field correctly from the image and from pasted text.
 *
 * - `gemini-2.5-flash` first — the model this app has been tuned against.
 * - `gemini-3.5-flash-lite` as the backup — the replacement Google names for
 *   the retired `gemini-2.5-flash-lite` (which answered 404 "no longer
 *   available to new users"), and the faster of the two (~3 s vs ~9 s on an
 *   image). The old rule "flash-lite is not trusted with screenshots" was about
 *   the 2.5 generation; a human confirms every draft before it is saved either
 *   way.
 *
 * `gemini-3.5-flash` and `gemini-flash-latest` were also tried and were
 * returning 503 "high demand" at the time, so neither is relied on.
 */
const TEXT_MODELS = ['gemini-2.5-flash', 'gemini-3.5-flash-lite'];
const VISION_MODELS = ['gemini-2.5-flash', 'gemini-3.5-flash-lite'];

/** Per-request deadline. Several requests may be made in sequence. */
const MODEL_TIMEOUT_MS = 45_000;

/**
 * Everything together — every model, every retry — must finish inside this,
 * or the hosting platform ends the function first and staff see a bare error
 * instead of a message. Well inside Vercel's 60 s ceiling for a function that
 * sets no `maxDuration`.
 */
const TOTAL_BUDGET_MS = 55_000;

/** Wait before retrying a busy model. Overridable so tests do not sleep. */
function retryDelayMs(): number {
  const v = Number(process.env.GEMINI_RETRY_DELAY_MS);
  return Number.isFinite(v) && v >= 0 ? v : 1_500;
}

/**
 * The models to try, in order.
 *
 * `GEMINI_MODEL` pins a single model and skips the fallback, so a bad model can
 * be routed around from the Vercel dashboard without a redeploy
 * (docs/operations.md).
 */
function modelsToTry(hasImage: boolean): string[] {
  const pinned = process.env.GEMINI_MODEL;
  if (pinned) return [pinned];
  return hasImage ? VISION_MODELS : TEXT_MODELS;
}

export async function parseAirlineMessage(
  rawText: string,
  opts: { imageBase64?: string; imageMimeType?: string } = {}
): Promise<ParsedBookingDraft[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AiConfigError('GEMINI_API_KEY is not configured, so no booking can be parsed.');
  }

  const hasImage = !!opts.imageBase64;
  const models = modelsToTry(hasImage);

  // Build the user message content — multimodal when an image is present
  type ContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };

  const userContent: string | ContentPart[] = hasImage
    ? [
        {
          type: 'image_url' as const,
          image_url: {
            url: `data:${opts.imageMimeType || 'image/png'};base64,${opts.imageBase64}`,
          },
        },
        ...(rawText.trim()
          ? [{ type: 'text' as const, text: `Also consider this accompanying text:\n\n${rawText}` }]
          : []),
        { type: 'text' as const, text: 'Extract the booking and EMD details from this airline booking screenshot.' },
      ]
    : `Extract the booking and EMD details from the following message:\n\n${rawText}`;

  const startedAt = Date.now();
  const remaining = () => TOTAL_BUDGET_MS - (Date.now() - startedAt);

  let lastError: Error | null = null;
  // True while every failure so far has been the provider being busy or slow —
  // decides whether staff are told "try again shortly" or "could not parse".
  let onlyTransientFailures = true;

  for (const model of models) {
    // A busy model gets one quick retry before moving on; demand spikes on
    // Google's side are usually seconds long.
    for (let attempt = 1; attempt <= 2; attempt++) {
      // Never start a request the time budget cannot finish.
      if (remaining() < 5_000) break;
      try {
        // Every call needs its own deadline. Without one, a model that accepts
        // the connection and then stalls holds the request open until the
        // hosting platform kills the whole function.
        const response = await fetch(GEMINI_URL, {
          signal: AbortSignal.timeout(Math.min(MODEL_TIMEOUT_MS, remaining())),
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: userContent },
            ],
            temperature: 0.1,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          if (isKeyRejection(response.status)) {
            throw new AiConfigError(
              `Gemini rejected GEMINI_API_KEY (${response.status}) on model ${model}: ${errorText}`
            );
          }
          throw new ProviderHttpError(
            response.status,
            `Gemini API error (${response.status}) on model ${model}: ${errorText}`
          );
        }

        const data = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
        };

        const content = data.choices?.[0]?.message?.content;
        if (!content) {
          throw new Error(`Empty response received from model ${model}.`);
        }

        return parseRawLlmJson(content, rawText || '[image upload]', model);
      } catch (err) {
        // A rejected key fails identically on every model; stop here rather
        // than spending another request to learn the same thing.
        if (err instanceof AiConfigError) throw err;
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`[AI Parsing] ${model} attempt ${attempt} failed: ${lastError.message}`);

        const transient =
          (err instanceof ProviderHttpError && isTransientStatus(err.status)) ||
          (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError'));
        if (!transient) {
          onlyTransientFailures = false;
          break; // not worth retrying this model — try the next one
        }
        if (attempt === 1) await new Promise((r) => setTimeout(r, retryDelayMs()));
      }
    }
  }

  if (lastError && onlyTransientFailures) {
    throw new AiBusyError(`Every AI model was busy or timed out. Last error: ${lastError.message}`);
  }
  throw lastError || new AiBusyError('No AI request could be made within the time allowed.');
}
