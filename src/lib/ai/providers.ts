/**
 * Which AI services the booking intake tries, in order (2026-10-05).
 *
 * Both speak the OpenAI-compatible `chat/completions` shape, so one request
 * loop serves them all. The URL decides the service — the env var name is only
 * a label (decisions.md, 2026-09-09: a Gemini key once went to OpenRouter's URL
 * and every call 401'd).
 *
 * Order, measured against the live API on 2026-10-05 with the app's own prompt:
 *   1. `gemini-3.5-flash-lite` — 3.5–6 s for text or a screenshot, every field
 *      right. GA, shutdown not before 7 May 2027 (Google deprecations page).
 *   2. `gemini-3.5-flash` — the same answers, but slower (13–16 s with
 *      `reasoning_effort: low`, 22 s without), so it is the backup, not first.
 *   3. Groq `qwen/qwen3.8-27b` — an independent free service, so one provider
 *      being busy no longer stops the intake. Only when `GROQ_API_KEY` is set.
 *      Groq does not retain inference data by default (Groq "Your data" docs).
 *      Its free plan caps this model at **1,000 output tokens a minute**
 *      (measured: a 2,048-token request is refused outright), so it runs with
 *      thinking off and a 900-token cap. That covers one or a few bookings in
 *      the table-shaped reply (`bookingPrompt`); a screenshot of a dozen
 *      bookings is beyond it and is Gemini's job. Its values carry "medium"
 *      confidence.
 *
 * `gemini-2.5-flash`, first until now, was dropped: Google now limits it to
 * accounts that used it before, and it took 17 s where 3.5-flash-lite took 4.
 * `gemini-3.5-flash-lite` rejects `reasoning_effort: none` (400), so it is sent
 * no reasoning setting at all.
 */

export const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export interface AiAttempt {
  provider: 'gemini' | 'groq';
  model: string;
  url: string;
  apiKey: string;
  /**
   * Whether a request that carries a JSON schema may use it (Gemini's
   * structured output — used for the spreadsheet column map). Groq's vision
   * model offers JSON mode only.
   */
  output: 'json_schema' | 'json_object';
  reasoningEffort?: 'low' | 'none';
  /** Confidence given to values this provider returns without marking them unsure. */
  confidence: 'high' | 'medium';
  /** Sent as `max_completion_tokens`; Groq refuses a request reserving more than its per-minute output limit. */
  maxTokens?: number;
}

const GEMINI_MODELS: { model: string; reasoningEffort?: 'low' }[] = [
  { model: 'gemini-3.5-flash-lite' },
  { model: 'gemini-3.5-flash', reasoningEffort: 'low' },
];

const GROQ_DEFAULT_MODEL = 'qwen/qwen3.8-27b';

/**
 * The attempts for this configuration. `GEMINI_MODEL` pins one Gemini model
 * (an operator override, settable on Vercel without a redeploy); `GROQ_MODEL`
 * does the same for Groq. An empty list means no key is set at all.
 */
export function aiAttempts(env: Record<string, string | undefined> = process.env): AiAttempt[] {
  const attempts: AiAttempt[] = [];
  const geminiKey = env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    const pinned = env.GEMINI_MODEL?.trim();
    const models = pinned ? [{ model: pinned }] : GEMINI_MODELS;
    for (const m of models) {
      attempts.push({ provider: 'gemini', url: GEMINI_URL, apiKey: geminiKey, output: 'json_schema', confidence: 'high', ...m });
    }
  }
  const groqKey = env.GROQ_API_KEY?.trim();
  if (groqKey) {
    attempts.push({
      provider: 'groq',
      model: env.GROQ_MODEL?.trim() || GROQ_DEFAULT_MODEL,
      url: GROQ_URL,
      apiKey: groqKey,
      output: 'json_object',
      confidence: 'medium',
      reasoningEffort: 'none',
      maxTokens: 900,
    });
  }
  return attempts;
}

/** Why an attempt failed, for the one-line log and the retry decision. */
export type FailureReason = 'key' | 'quota' | 'busy' | 'timeout' | 'invalid';

/**
 * 401/403: the key will not work — no point asking this provider again.
 * 429: a rate or quota limit — move straight on; retrying an exhausted quota
 *      only spends the time budget (the likely production failure, 2026-10-05).
 * 500/502/503/504: busy — worth one quick retry.
 * Anything else: the request or reply was unusable.
 */
export function failureReason(status: number): FailureReason {
  if (status === 401 || status === 403) return 'key';
  if (status === 429) return 'quota';
  if (status >= 500 && status <= 504) return 'busy';
  return 'invalid';
}

/**
 * The provider's error code from its error body (e.g. `RESOURCE_EXHAUSTED`),
 * for the log. Only the code: the body can echo the request, which carries
 * passenger names and PNRs, so it is never logged.
 */
export function providerErrorCode(body: string): string {
  try {
    const parsed = JSON.parse(body) as unknown;
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    const err = (first as { error?: { status?: unknown; code?: unknown; type?: unknown } })?.error;
    const code = err?.status ?? err?.type ?? err?.code;
    return typeof code === 'string' || typeof code === 'number' ? String(code).slice(0, 40) : '';
  } catch {
    return '';
  }
}
