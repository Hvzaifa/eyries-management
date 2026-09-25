/**
 * A fixed-window request counter, per key, in memory.
 *
 * Used on the one route that spends money per call (AI parsing). It is
 * deliberately simple, and its limit is worth stating plainly: on serverless
 * hosting each running instance has its own memory, so this caps bursts from a
 * session that lands on one instance rather than enforcing a global quota. The
 * real gate is that the route requires a signed-in staff account; this stops a
 * stuck script or a runaway retry loop from spending the key's budget in
 * seconds. A shared store (Redis) would make it global, and is not worth adding
 * a service for at this scale.
 */

interface Window {
  start: number;
  count: number;
}

export interface RateLimiter {
  /** True when the call is allowed, and counts it. */
  take(key: string, now?: number): boolean;
  /** Seconds until the key's window resets. */
  retryAfter(key: string, now?: number): number;
}

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const windows = new Map<string, Window>();

  const current = (key: string, now: number): Window => {
    const w = windows.get(key);
    if (w && now - w.start < windowMs) return w;
    const fresh = { start: now, count: 0 };
    windows.set(key, fresh);
    // Keep the map from growing without bound on a long-lived instance.
    if (windows.size > 1000) {
      for (const [k, v] of windows) if (now - v.start >= windowMs) windows.delete(k);
    }
    return fresh;
  };

  return {
    take(key, now = Date.now()) {
      const w = current(key, now);
      if (w.count >= limit) return false;
      w.count++;
      return true;
    },
    retryAfter(key, now = Date.now()) {
      const w = windows.get(key);
      if (!w) return 0;
      return Math.max(0, Math.ceil((w.start + windowMs - now) / 1000));
    },
  };
}
