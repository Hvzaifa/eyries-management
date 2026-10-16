/**
 * Probes every configured AI attempt once and prints what it answered.
 *
 *   npm run ai:check
 *
 * Read-only: one tiny request per provider/model, no booking data sent. Use it
 * when staff report "the AI service is busy" — each line names the reason
 * (ok / quota / busy / timeout / key / invalid) and the time taken. Reads the
 * keys from .env, so run it with the same keys production uses.
 */
import 'dotenv/config';
import { aiAttempts, failureReason, providerErrorCode } from '../src/lib/ai/providers';

async function main() {
  const attempts = aiAttempts();
  if (attempts.length === 0) {
    console.log('No AI key configured: set GEMINI_API_KEY (and optionally GROQ_API_KEY).');
    process.exitCode = 1;
    return;
  }
  for (const a of attempts) {
    const t0 = Date.now();
    try {
      const res = await fetch(a.url, {
        method: 'POST',
        signal: AbortSignal.timeout(25_000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.apiKey}` },
        body: JSON.stringify({
          model: a.model,
          messages: [{ role: 'user', content: 'Reply with JSON: {"ok": true}' }], // Groq's JSON mode requires the word "json"
          response_format: { type: 'json_object' },
          // The same settings the app sends: without Groq's output cap its
          // default reservation alone exceeds the free per-minute limit.
          ...(a.reasoningEffort ? { reasoning_effort: a.reasoningEffort } : {}),
          ...(a.maxTokens ? { max_completion_tokens: a.maxTokens } : {}),
        }),
      });
      const ms = Date.now() - t0;
      if (res.ok) console.log(`ok       ${a.provider}/${a.model}  ${ms}ms`);
      else console.log(`${failureReason(res.status).padEnd(8)} ${a.provider}/${a.model}  http=${res.status} code=${providerErrorCode(await res.text()) || '-'}  ${ms}ms`);
    } catch (err) {
      const name = err instanceof Error ? err.name : 'Error';
      console.log(`${name === 'TimeoutError' ? 'timeout' : 'error'.padEnd(8)} ${a.provider}/${a.model}  ${Date.now() - t0}ms`);
    }
  }
}

main();
