import { describe, expect, it } from 'vitest';
import { emd1AtRisk, formStatusChange, MAX_RELEASE_REASON, releaseBlocker } from './release';

describe('releaseBlocker (Phase 9 Step 2, A2)', () => {
  const ok = { status: 'active', roundCount: 0, agentPaymentCount: 0, reason: 'Airline cancelled the group' };

  it('releases an active booking with no EMD and no agent payment, given a reason', () => {
    expect(releaseBlocker(ok)).toBeNull();
  });

  it('is refused once any EMD round exists', () => {
    expect(releaseBlocker({ ...ok, roundCount: 1 })).toBe('An EMD has been issued on this booking, so it can no longer be released.');
  });

  it('is refused when an agent has paid, including on seats since taken back', () => {
    expect(releaseBlocker({ ...ok, agentPaymentCount: 1 })).toBe('An agent has paid on this booking, so it cannot be released.');
  });

  it('needs a reason, and not an endless one', () => {
    expect(releaseBlocker({ ...ok, reason: '   ' })).toBe('A reason is required to release a booking.');
    expect(releaseBlocker({ ...ok, reason: null })).toBe('A reason is required to release a booking.');
    expect(releaseBlocker({ ...ok, reason: 'x'.repeat(MAX_RELEASE_REASON + 1) })).toMatch(/at most/);
  });

  it('only an active booking can be released, and only once', () => {
    expect(releaseBlocker({ ...ok, status: 'released' })).toBe('This booking is already released.');
    expect(releaseBlocker({ ...ok, status: 'completed' })).toBe('Only an active booking can be released; this one is completed.');
    expect(releaseBlocker({ ...ok, status: 'cancelled' })).toMatch(/Only an active booking/);
  });
});

describe('formStatusChange — the edit form and release', () => {
  it('may set active or completed', () => {
    expect(formStatusChange('active', 'completed')).toEqual({ status: 'completed' });
    expect(formStatusChange('completed', 'active')).toEqual({ status: 'active' });
    expect(formStatusChange(null, null)).toEqual({ status: 'active' });
  });

  it('no longer sets cancelled by hand (owner, 2026-10-20)', () => {
    expect(formStatusChange('active', 'cancelled')).toEqual({
      error: 'Use Cancel on the booking page to cancel a flagged booking, with a reason.',
    });
  });

  it('can never move a booking out of cancelled (Phase 9 Step 5)', () => {
    expect(formStatusChange('cancelled', 'active')).toEqual({ error: 'This booking was cancelled, and a cancellation cannot be undone.' });
    expect(formStatusChange('cancelled', 'completed')).toHaveProperty('error');
  });

  it('keeps an unchanged status, so a booking recorded as cancelled still saves', () => {
    expect(formStatusChange('cancelled', 'cancelled')).toEqual({ status: 'cancelled' });
  });

  it('cannot release — that needs the Release action and its reason', () => {
    expect(formStatusChange('active', 'released')).toEqual({ error: 'Use Release on the booking page to release it, with a reason.' });
  });

  it('can never move a booking out of released', () => {
    expect(formStatusChange('released', 'active')).toEqual({ error: 'This booking was released, and a release cannot be undone.' });
    expect(formStatusChange('released', 'released')).toEqual({ status: 'released' });
    expect(formStatusChange('released', null)).toEqual({ status: 'released' });
  });
});

describe('emd1AtRisk — flag, do not act', () => {
  const base = { status: 'active', roundCount: 0, pnrTlDate: '2026-10-19', todayIso: '2026-10-20' };

  it('flags an active booking whose EMD-1 deadline passed with no EMD', () => {
    expect(emd1AtRisk(base)).toBe(true);
  });

  it('not on the deadline day itself', () => {
    expect(emd1AtRisk({ ...base, pnrTlDate: '2026-10-20' })).toBe(false);
  });

  it('not once an EMD exists, without a deadline, or on a booking that is not active', () => {
    expect(emd1AtRisk({ ...base, roundCount: 1 })).toBe(false);
    expect(emd1AtRisk({ ...base, pnrTlDate: null })).toBe(false);
    expect(emd1AtRisk({ ...base, status: 'released' })).toBe(false);
  });
});
