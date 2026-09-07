export type FieldConfidence = 'high' | 'medium' | 'low';

export interface ParsedField<T> {
  value: T | null;
  confidence: FieldConfidence;
  rawText?: string;
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
 * Providers are tried in order until one returns a usable response.
 *
 * All three speak the OpenAI chat-completions shape, so one request body works
 * for each. A local Ollama provider used to sit at the head of this list; it was
 * removed on 2026-09-07 — it can only ever work on a developer's own machine and
 * on the deployed app it was a guaranteed connection failure and a wasted retry
 * before every real provider was reached.
 */
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const CEREBRAS_URL = 'https://api.cerebras.ai/v1/chat/completions';

/** Text-only fallback chain, fastest and most reliable first. */
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
const CEREBRAS_MODELS = ['llama3.1-70b'];
const OPENROUTER_MODELS = ['openrouter/free', 'nvidia/nemotron-3.5-lightning:free', 'google/gemma-4-31b-it:free'];

/** Only OpenRouter is wired for image input, so a screenshot has one route. */
const OPENROUTER_VISION_MODELS = ['openrouter/free'];

/** Per-provider request deadline. Several candidates may be tried in sequence. */
const PROVIDER_TIMEOUT_MS = 45_000;

interface ModelCandidate {
  provider: string;
  url: string;
  model: string;
  apiKey: string;
}

/**
 * Builds the ordered list of providers to try.
 *
 * An explicitly requested model (or `LLM_MODEL`) short-circuits the chain and is
 * the only thing tried; otherwise the fallback list is assembled from whichever
 * API keys are configured.
 */
function buildCandidates(opts: {
  model?: string;
  openRouterKey?: string;
  groqKey?: string;
  cerebrasKey?: string;
  hasImage: boolean;
}): ModelCandidate[] {
  const { model, openRouterKey, groqKey, cerebrasKey, hasImage } = opts;
  const openRouter = (m: string): ModelCandidate =>
    ({ provider: 'OpenRouter', url: OPENROUTER_URL, model: m, apiKey: openRouterKey! });

  const explicit = model || process.env.LLM_MODEL;
  if (explicit && openRouterKey) return [openRouter(explicit)];

  // An image can only go to a vision-capable model.
  if (hasImage) {
    return openRouterKey ? OPENROUTER_VISION_MODELS.map(openRouter) : [];
  }

  const candidates: ModelCandidate[] = [];
  if (groqKey) {
    candidates.push(...GROQ_MODELS.map((m) => ({ provider: 'Groq', url: GROQ_URL, model: m, apiKey: groqKey })));
  }
  if (cerebrasKey) {
    candidates.push(...CEREBRAS_MODELS.map((m) => ({ provider: 'Cerebras', url: CEREBRAS_URL, model: m, apiKey: cerebrasKey })));
  }
  if (openRouterKey) {
    candidates.push(...OPENROUTER_MODELS.map(openRouter));
  }
  return candidates;
}

export async function parseAirlineMessage(
  rawText: string,
  opts: { model?: string; apiKey?: string; imageBase64?: string; imageMimeType?: string } = {}
): Promise<ParsedBookingDraft[]> {
  const openRouterKey = opts.apiKey || process.env.LLM_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const cerebrasKey = process.env.CEREBREAS_API_KEY;

  const hasImage = !!opts.imageBase64;
  const candidates = buildCandidates({ model: opts.model, openRouterKey, groqKey, cerebrasKey, hasImage });

  if (candidates.length === 0) {
    throw new Error(
      hasImage
        ? 'Image parsing needs LLM_API_KEY (OpenRouter) to be configured.'
        : 'No LLM API key is configured. Set LLM_API_KEY, GROQ_API_KEY or CEREBREAS_API_KEY.'
    );
  }

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

  for (const candidate of candidates) {
    try {
      // Every provider call needs its own deadline. Without one, a provider that
      // accepts the connection and then stalls holds the request open until the
      // hosting platform kills the whole function — and because these candidates
      // are tried one after another, a few slow ones in a row could exhaust the
      // budget before a working provider was ever reached.
      const response = await fetch(candidate.url, {
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${candidate.apiKey}`,
          ...(candidate.provider === 'OpenRouter' && {
            'HTTP-Referer': 'https://eyries.local',
            'X-Title': 'Eyries Group Booking Intake',
          }),
        },
        body: JSON.stringify({
          model: candidate.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userContent },
          ],
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${candidate.provider} API error (${response.status}) on model ${candidate.model}: ${errorText}`);
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error(`Empty response received from LLM model ${candidate.model}.`);
      }

      return parseRawLlmJson(content, rawText || '[image upload]', candidate.model);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[AI Parsing] Failed with ${candidate.provider} (${candidate.model}): ${lastError.message}`);
      // Try next candidate model if available
      continue;
    }
  }

  throw lastError || new Error('Failed to parse airline text using available AI models.');
}
