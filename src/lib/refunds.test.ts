import { describe, expect, it } from 'vitest';
import { validateRefund } from './refunds';

const OK = '2026-09-07';

describe('validateRefund — amount', () => {
  it('accepts a normal amount and returns the parsed date', () => {
    const r = validateRefund(1_500_000, OK, 'issued');
    expect(r).toEqual({ date: new Date('2026-09-07T00:00:00.000Z') });
  });

  it('accepts zero (a recorded refund of nothing is not our call to reject)', () => {
    expect(validateRefund(0, OK, 'issued')).toHaveProperty('date');
  });

  it('rejects a negative amount', () => {
    expect(validateRefund(-1, OK, 'issued')).toEqual({
      error: 'Refund amount cannot be negative.',
    });
  });

  it('rejects NaN — Number("abc") reaches here as NaN, not null', () => {
    expect(validateRefund(Number('abc'), OK, 'issued')).toEqual({
      error: 'Refund amount must be a number.',
    });
  });

  it('rejects Infinity', () => {
    expect(validateRefund(Infinity, OK, 'issued')).toEqual({
      error: 'Refund amount must be a number.',
    });
  });

  it('rejects a missing amount', () => {
    expect(validateRefund(null, OK, 'issued')).toEqual({
      error: 'Refund amount must be a number.',
    });
  });

  it('does NOT reject an amount larger than the EMD (owner has not ruled; live data has one)', () => {
    expect(validateRefund(99_999_999, OK, 'issued')).toHaveProperty('date');
  });
});

describe('validateRefund — date', () => {
  it('rejects a missing date', () => {
    expect(validateRefund(100, null, 'issued')).toHaveProperty('error');
  });

  it('rejects free text that new Date() would turn into Invalid Date', () => {
    expect(validateRefund(100, 'garbage', 'issued')).toHaveProperty('error');
  });

  it('rejects a non-ISO format rather than guessing day/month order', () => {
    expect(validateRefund(100, '07/09/2026', 'issued')).toHaveProperty('error');
  });

  it('rejects an impossible day instead of silently rolling it over', () => {
    // new Date('2026-02-30') does not throw — it becomes 2026-03-02.
    expect(validateRefund(100, '2026-02-30', 'issued')).toEqual({
      error: 'Refund date "2026-02-30" is not a real date.',
    });
  });

  it('accepts a real leap day', () => {
    expect(validateRefund(100, '2028-02-29', 'issued')).toHaveProperty('date');
  });

  it('parses at UTC midnight, matching how every other date is stored', () => {
    const r = validateRefund(100, '2026-12-31', 'issued');
    expect('date' in r && r.date.toISOString()).toBe('2026-12-31T00:00:00.000Z');
  });
});

describe('validateRefund — status', () => {
  it('refuses to refund a round that is already refunded', () => {
    expect(validateRefund(100, OK, 'refunded')).toEqual({
      error: 'This round is already refunded. Edit the round instead of refunding it again.',
    });
  });

  it.each(['issued', 'paid', 'refund_requested', 'expired'])(
    'allows a round with status %s',
    (status) => {
      expect(validateRefund(100, OK, status)).toHaveProperty('date');
    }
  );
});
