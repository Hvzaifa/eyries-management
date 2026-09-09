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

/** Tried in order until one returns usable JSON. */
const TEXT_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

/** Flash-lite is not trusted with screenshots, so the image path has one model. */
const VISION_MODELS = ['gemini-2.5-flash'];

/** Per-model request deadline. Several may be tried in sequence. */
const MODEL_TIMEOUT_MS = 45_000;

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
    throw new Error('GEMINI_API_KEY is not configured, so no booking can be parsed.');
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

  let lastError: Error | null = null;

  for (const model of models) {
    try {
      // Every call needs its own deadline. Without one, a model that accepts the
      // connection and then stalls holds the request open until the hosting
      // platform kills the whole function — and because these are tried one
      // after another, a slow one could exhaust the budget before a working
      // model was ever reached.
      const response = await fetch(GEMINI_URL, {
        signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
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
        throw new Error(`Gemini API error (${response.status}) on model ${model}: ${errorText}`);
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
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[AI Parsing] Failed with ${model}: ${lastError.message}`);
      // Try the next model if there is one.
      continue;
    }
  }

  throw lastError || new Error('Failed to parse airline text using available AI models.');
}
