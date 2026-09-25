import { describe, expect, it } from 'vitest';
import { isValidEmdNumber, MAX_BULK_EMD_ISSUES } from './bulk-emd';

describe('isValidEmdNumber', () => {
  // The airline's own format: three digits, a space, then ten. It is checked
  // when issuing one EMD, issuing many, and editing one — this is the single
  // definition all three use.
  it('accepts the airline’s format', () => {
    expect(isValidEmdNumber('123 4567890123')).toBe(true);
    expect(isValidEmdNumber('065 1234567890')).toBe(true);
  });

  it('ignores surrounding whitespace, which a paste brings with it', () => {
    expect(isValidEmdNumber('  123 4567890123  ')).toBe(true);
  });

  it('refuses a number missing the space', () => {
    expect(isValidEmdNumber('1234567890123')).toBe(false);
  });

  it('refuses the space in the wrong place', () => {
    expect(isValidEmdNumber('12 34567890123')).toBe(false);
    expect(isValidEmdNumber('1234 567890123')).toBe(false);
  });

  it('refuses the wrong number of digits', () => {
    expect(isValidEmdNumber('123 456789012')).toBe(false);
    expect(isValidEmdNumber('123 45678901234')).toBe(false);
  });

  it('refuses anything that is not digits', () => {
    expect(isValidEmdNumber('abc defghijklm')).toBe(false);
    expect(isValidEmdNumber('123-4567890123')).toBe(false);
  });

  it('refuses blank and missing values', () => {
    expect(isValidEmdNumber('')).toBe(false);
    expect(isValidEmdNumber('   ')).toBe(false);
    expect(isValidEmdNumber(null)).toBe(false);
    expect(isValidEmdNumber(undefined)).toBe(false);
  });
});

describe('MAX_BULK_EMD_ISSUES', () => {
  it('bounds a batch to something a transaction can finish', () => {
    expect(MAX_BULK_EMD_ISSUES).toBeGreaterThan(0);
    expect(MAX_BULK_EMD_ISSUES).toBeLessThanOrEqual(500);
  });
});
