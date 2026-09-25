import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rate-limit';

describe('createRateLimiter', () => {
  it('allows up to the limit within a window, then refuses', () => {
    const rl = createRateLimiter(3, 60_000);
    expect([1, 2, 3, 4].map(() => rl.take('u', 1_000))).toEqual([true, true, true, false]);
  });

  it('opens again once the window has passed', () => {
    const rl = createRateLimiter(1, 60_000);
    expect(rl.take('u', 0)).toBe(true);
    expect(rl.take('u', 59_999)).toBe(false);
    expect(rl.take('u', 60_000)).toBe(true);
  });

  it('counts each key separately', () => {
    const rl = createRateLimiter(1, 60_000);
    expect(rl.take('a', 0)).toBe(true);
    expect(rl.take('b', 0)).toBe(true);
    expect(rl.take('a', 1)).toBe(false);
  });

  it('says how long until the window resets', () => {
    const rl = createRateLimiter(1, 60_000);
    rl.take('u', 0);
    expect(rl.retryAfter('u', 15_000)).toBe(45);
    expect(rl.retryAfter('never-seen', 0)).toBe(0);
  });
});
