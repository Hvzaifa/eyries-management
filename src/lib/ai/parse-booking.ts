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

Return ONLY a valid JSON object matching this exact schema. For every field, return an object with "value", "confidence" ("high", "medium", or "low"), and optional "notes" explaining your extraction.

Schema:
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

Guidelines:
1. Dates must be formatted as YYYY-MM-DD. If year is missing in text, infer current or next logical year based on travel dates.
2. Airline code should be 2-character IATA if identifiable (e.g. SV for Saudia, PA for Airblue, 9P for Fly Jinnah, PK for PIA, ER for Serene, FZ for Flydubai, QR for Qatar Airways).
3. Sector format: standard IATA 3-letter codes joined by dashes (e.g. "ISB-JED", "LHE-MED-JED-LHE", "KHI-DXB-KHI").
4. Seats and monetary amounts (fare, taxes, psf, emdAmount) must be numbers without commas or currency symbols.
5. If a field cannot be found in the text, set value to null and confidence to "low".
6. Never make up booking codes or amounts. If ambiguous, set confidence to "low" and explain in notes.
7. Return ONLY the JSON object. Do not include markdown code block formatting or explanation text outside the JSON.`;

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

export function parseRawLlmJson(jsonText: string, rawPastedText: string, modelUsed?: string): ParsedBookingDraft {
  const cleaned = cleanJsonString(jsonText);
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse LLM JSON output: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    requestDate: parseField<string>(parsed, 'requestDate', 'date'),
    investorCompany: parseField<string>(parsed, 'investorCompany', 'string'),
    licenseName: parseField<string>(parsed, 'licenseName', 'string'),
    branchName: parseField<string>(parsed, 'branchName', 'string'),
    pnr: parseField<string>(parsed, 'pnr', 'string'),
    gdsPnr: parseField<string>(parsed, 'gdsPnr', 'string'),
    segment: parseField<string>(parsed, 'segment', 'string'),
    airlineCode: parseField<string>(parsed, 'airlineCode', 'string'),
    seats: parseField<number>(parsed, 'seats', 'number'),
    outboundDate: parseField<string>(parsed, 'outboundDate', 'date'),
    inboundDate: parseField<string>(parsed, 'inboundDate', 'date'),
    sector: parseField<string>(parsed, 'sector', 'string'),
    pnrTlDate: parseField<string>(parsed, 'pnrTlDate', 'date'),
    dealPct: parseField<number>(parsed, 'dealPct', 'number'),
    airlineTaxes: parseField<number>(parsed, 'airlineTaxes', 'number'),
    psf: parseField<number>(parsed, 'psf', 'number'),
    fare: parseField<number>(parsed, 'fare', 'number'),

    roundIssuanceDate: parseField<string>(parsed, 'roundIssuanceDate', 'date'),
    roundPaymentPct: parseField<number>(parsed, 'roundPaymentPct', 'number'),
    roundEmdAmount: parseField<number>(parsed, 'roundEmdAmount', 'number'),
    roundEmdNumber: parseField<string>(parsed, 'roundEmdNumber', 'string'),
    roundDeadlineDate: parseField<string>(parsed, 'roundDeadlineDate', 'date'),
    roundDeadlineTime: parseField<string>(parsed, 'roundDeadlineTime', 'string'),

    rawPastedText,
    modelUsed,
  };
}

const DEFAULT_FREE_MODELS = [
  'nvidia/nemotron-3.5-lightning:free',
  'z-ai/glm-5.2:free',
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
];

export async function parseAirlineMessage(
  rawText: string,
  opts: { model?: string; apiKey?: string } = {}
): Promise<ParsedBookingDraft> {
  const apiKey = opts.apiKey || process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error('LLM_API_KEY is not configured in environment variables.');
  }

  const modelCandidates = opts.model
    ? [opts.model]
    : process.env.LLM_MODEL
      ? [process.env.LLM_MODEL]
      : DEFAULT_FREE_MODELS;

  let lastError: Error | null = null;

  for (const model of modelCandidates) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://eyries.local',
          'X-Title': 'Eyries Group Booking Intake',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: `Extract the booking and EMD details from the following message:\n\n${rawText}`,
            },
          ],
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error (${response.status}) on model ${model}: ${errorText}`);
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error(`Empty response received from LLM model ${model}.`);
      }

      return parseRawLlmJson(content, rawText, model);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Try next candidate model if available
      continue;
    }
  }

  throw lastError || new Error('Failed to parse airline text using available AI models.');
}
