import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAirlineMessage, AiConfigError, AiBusyError } from './parse-booking';
import { failureReason } from './providers';

const reply = (status: number, body: unknown) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

beforeEach(() => {
  vi.stubEnv('GROQ_API_KEY', '');
  vi.stubEnv('GROQ_MODEL', '');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('failureReason — a key problem', () => {
  it('treats 401 and 403 as a key problem, nothing else', () => {
    expect([401, 403].map(failureReason)).toEqual(['key', 'key']);
    expect([400, 404, 429, 500, 503].map(failureReason)).not.toContain('key');
  });
});

describe('parseAirlineMessage — configuration failures', () => {
  it('raises AiConfigError when no key is set', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    await expect(parseAirlineMessage('PNR ABC123')).rejects.toBeInstanceOf(AiConfigError);
  });

  it('raises AiConfigError on a rejected key, after ONE request', async () => {
    // The 2026-09-25 incident: the key was not a Gemini key at all. Every model
    // fails identically, so trying the next one only doubles the wait.
    vi.stubEnv('GEMINI_API_KEY', 'not-a-real-key');
    vi.stubEnv('GEMINI_MODEL', '');
    const fetchMock = vi.fn().mockResolvedValue(reply(401, { error: { status: 'UNAUTHENTICATED' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(parseAirlineMessage('PNR ABC123')).rejects.toBeInstanceOf(AiConfigError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls through to the next model on an ordinary failure', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'k');
    vi.stubEnv('GEMINI_MODEL', '');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(400, 'bad request'))
      .mockResolvedValueOnce(reply(400, 'bad request'));
    vi.stubGlobal('fetch', fetchMock);

    const err = await parseAirlineMessage('PNR ABC123').catch((e) => e);
    expect(err).not.toBeInstanceOf(AiConfigError);
    expect(err).not.toBeInstanceOf(AiBusyError);
    // A non-transient failure is not retried: one request per model.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

const goodReply = () =>
  reply(200, {
    choices: [{ message: { content: JSON.stringify({ pnr: 'KQX7LM', seats: 25 }) } }],
  });

describe('failureReason — rate limits and server trouble', () => {
  it('reads 429 as quota and 500–504 as busy', () => {
    expect(failureReason(429)).toBe('quota');
    expect([500, 502, 503, 504].map(failureReason)).toEqual(['busy', 'busy', 'busy', 'busy']);
  });

  it('never calls a request the provider rejected quota or busy', () => {
    for (const r of [400, 401, 403, 404].map(failureReason)) expect(['quota', 'busy']).not.toContain(r);
  });
});

describe('parseAirlineMessage — a busy provider (2026-09-25)', () => {
  // Google answers 503 "experiencing high demand" intermittently. The image
  // path used to have one model and no retry, so every busy moment reached
  // staff as "failed to parse".
  const setup = () => {
    vi.stubEnv('GEMINI_API_KEY', 'k');
    vi.stubEnv('GEMINI_MODEL', '');
    vi.stubEnv('GEMINI_RETRY_DELAY_MS', '0');
  };

  it('retries a busy model once and succeeds', async () => {
    setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(503, 'high demand')).mockResolvedValueOnce(goodReply());
    vi.stubGlobal('fetch', fetchMock);

    const drafts = await parseAirlineMessage('PNR KQX7LM');
    expect(drafts.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('moves to the backup model when the first stays busy', async () => {
    setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(503, 'high demand'))
      .mockResolvedValueOnce(reply(503, 'high demand'))
      .mockResolvedValueOnce(goodReply());
    vi.stubGlobal('fetch', fetchMock);

    await parseAirlineMessage('PNR KQX7LM');
    const models = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).model);
    expect(models).toEqual(['gemini-3.5-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.5-flash']);
  });

  it('gives an IMAGE a backup model too — the path that used to have none', async () => {
    setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(503, 'high demand'))
      .mockResolvedValueOnce(reply(503, 'high demand'))
      .mockResolvedValueOnce(goodReply());
    vi.stubGlobal('fetch', fetchMock);

    const drafts = await parseAirlineMessage('', { imageBase64: 'aGVsbG8=', imageMimeType: 'image/png' });
    expect(drafts.length).toBeGreaterThan(0);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).model).toBe('gemini-3.5-flash');
  });

  it('reports AiBusyError, not a parse failure, when every model stays busy', async () => {
    setup();
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(reply(503, 'high demand')));
    vi.stubGlobal('fetch', fetchMock);

    await expect(parseAirlineMessage('PNR KQX7LM')).rejects.toBeInstanceOf(AiBusyError);
    // Two models, one retry each.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('treats a timeout as busy, not as a bad input', async () => {
    setup();
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout));

    await expect(parseAirlineMessage('PNR KQX7LM')).rejects.toBeInstanceOf(AiBusyError);
  });

  it('does not call a mix of busy and invalid "busy"', async () => {
    setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(503, 'high demand'))
      .mockResolvedValueOnce(reply(503, 'high demand'))
      .mockResolvedValueOnce(reply(400, 'bad request'));
    vi.stubGlobal('fetch', fetchMock);

    const err = await parseAirlineMessage('PNR KQX7LM').catch((e) => e);
    expect(err).not.toBeInstanceOf(AiBusyError);
  });

  it('still stops at once on a rejected key, even mid-retry', async () => {
    setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(503, 'high demand')).mockResolvedValueOnce(reply(401, {}));
    vi.stubGlobal('fetch', fetchMock);

    await expect(parseAirlineMessage('PNR KQX7LM')).rejects.toBeInstanceOf(AiConfigError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// 2026-10-05: two free providers, quota handled apart from "busy", and a log
// line that names the reason.
describe('parseAirlineMessage — providers and quotas (2026-10-05)', () => {
  const setup = (groq = false) => {
    vi.stubEnv('GEMINI_API_KEY', 'k');
    vi.stubEnv('GEMINI_MODEL', '');
    vi.stubEnv('GEMINI_RETRY_DELAY_MS', '0');
    if (groq) vi.stubEnv('GROQ_API_KEY', 'g');
  };
  const bodyOf = (call: unknown[]) => JSON.parse((call[1] as { body: string }).body);

  it('a 429 moves on at once — no retry against an exhausted quota', async () => {
    setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(429, [{ error: { status: 'RESOURCE_EXHAUSTED' } }]))
      .mockResolvedValueOnce(goodReply());
    vi.stubGlobal('fetch', fetchMock);

    await parseAirlineMessage('PNR KQX7LM');
    expect(fetchMock.mock.calls.map((c) => bodyOf(c).model)).toEqual(['gemini-3.5-flash-lite', 'gemini-3.5-flash']);
  });

  it('every provider out of quota is "busy", not a parse failure', async () => {
    setup();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(reply(429, 'quota'))));
    await expect(parseAirlineMessage('PNR KQX7LM')).rejects.toBeInstanceOf(AiBusyError);
  });

  it('never calls Groq without its key', async () => {
    setup();
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(reply(503, 'busy')));
    vi.stubGlobal('fetch', fetchMock);
    await parseAirlineMessage('PNR KQX7LM').catch(() => null);
    expect(fetchMock.mock.calls.every((c) => String(c[0]).includes('generativelanguage.googleapis.com'))).toBe(true);
  });

  it('falls back to Groq when Gemini stays busy, in JSON mode', async () => {
    setup(true);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(503, 'busy'))
      .mockResolvedValueOnce(reply(503, 'busy'))
      .mockResolvedValueOnce(reply(503, 'busy'))
      .mockResolvedValueOnce(reply(503, 'busy'))
      .mockResolvedValueOnce(goodReply());
    vi.stubGlobal('fetch', fetchMock);

    const drafts = await parseAirlineMessage('PNR KQX7LM');
    const last = fetchMock.mock.calls[4];
    expect(String(last[0])).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(bodyOf(last).response_format).toEqual({ type: 'json_object' });
    // Groq's free plan allows 1,000 output tokens a minute: thinking off, capped.
    expect(bodyOf(last)).toMatchObject({ max_completion_tokens: 900, reasoning_effort: 'none' });
    expect(drafts[0].modelUsed).toBe('groq/qwen/qwen3.8-27b');
  });

  it('asks every provider for the table reply, in JSON mode', async () => {
    setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(goodReply());
    vi.stubGlobal('fetch', fetchMock);
    await parseAirlineMessage('PNR KQX7LM');
    const body = bodyOf(fetchMock.mock.calls[0]);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[0].content).toContain('"columns"');
  });

  it('a timeout moves on to the next model instead of retrying the same one', async () => {
    setup();
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    const fetchMock = vi.fn().mockRejectedValueOnce(timeout).mockResolvedValueOnce(goodReply());
    vi.stubGlobal('fetch', fetchMock);
    const drafts = await parseAirlineMessage('PNR KQX7LM');
    expect(fetchMock.mock.calls.map((c) => bodyOf(c).model)).toEqual(['gemini-3.5-flash-lite', 'gemini-3.5-flash']);
    expect(drafts[0].modelUsed).toBe('gemini/gemini-3.5-flash');
  });

  it('a rejected Gemini key hands over to Groq instead of giving up', async () => {
    setup(true);
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(401, {})).mockResolvedValueOnce(goodReply());
    vi.stubGlobal('fetch', fetchMock);

    const drafts = await parseAirlineMessage('PNR KQX7LM');
    expect(fetchMock).toHaveBeenCalledTimes(2); // the second Gemini model is skipped
    expect(drafts[0].modelUsed).toMatch(/^groq\//);
  });

  it('every provider rejecting its key is a configuration problem', async () => {
    setup(true);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(reply(403, {}))));
    await expect(parseAirlineMessage('PNR KQX7LM')).rejects.toBeInstanceOf(AiConfigError);
  });

  it('a reply that is not JSON moves on to the next model', async () => {
    setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(200, { choices: [{ message: { content: 'sorry, I cannot' } }] }))
      .mockResolvedValueOnce(goodReply());
    vi.stubGlobal('fetch', fetchMock);
    const drafts = await parseAirlineMessage('PNR KQX7LM');
    expect(drafts[0].modelUsed).toBe('gemini/gemini-3.5-flash');
  });

  it('logs the reason, status and provider code — never the reply body', async () => {
    setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(reply(429, [{ error: { status: 'RESOURCE_EXHAUSTED', message: 'PNR KQX7LM passenger ALI/AHMED' } }]))
        .mockResolvedValueOnce(goodReply())
    );
    await parseAirlineMessage('PNR KQX7LM');
    const line = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(line).toContain('reason=quota');
    expect(line).toContain('http=429');
    expect(line).toContain('code=RESOURCE_EXHAUSTED');
    expect(line).not.toContain('ALI/AHMED');
    warn.mockRestore();
  });
});


describe('prompts — Groq JSON mode needs the word "json" (2026-10-05)', () => {
  // Groq answers 400 "'messages' must contain the word 'json'" otherwise —
  // found when the health check's probe left it out.
  it('both prompts mention JSON', async () => {
    const { bookingPrompt } = await import('./parse-booking');
    const { mappingPrompt } = await import('./excel-mapping');
    expect(bookingPrompt('2026-10-05')).toMatch(/json/i);
    expect(mappingPrompt()).toMatch(/json/i);
  });
});
