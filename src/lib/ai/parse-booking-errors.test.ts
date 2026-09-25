import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseAirlineMessage,
  AiConfigError,
  AiBusyError,
  isKeyRejection,
  isTransientStatus,
} from './parse-booking';

const reply = (status: number, body: unknown) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('isKeyRejection', () => {
  it('treats 401 and 403 as a key problem, nothing else', () => {
    expect([401, 403].map(isKeyRejection)).toEqual([true, true]);
    expect([400, 404, 429, 500, 503].map(isKeyRejection)).toEqual([false, false, false, false, false]);
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

describe('isTransientStatus', () => {
  it('treats rate limits and server-side trouble as worth a retry', () => {
    expect([429, 500, 502, 503, 504].map(isTransientStatus)).toEqual([true, true, true, true, true]);
  });

  it('never retries a request the provider called invalid', () => {
    expect([400, 401, 403, 404].map(isTransientStatus)).toEqual([false, false, false, false]);
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
    expect(models).toEqual(['gemini-2.5-flash', 'gemini-2.5-flash', 'gemini-3.5-flash-lite']);
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
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).model).toBe('gemini-3.5-flash-lite');
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
