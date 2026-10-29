import { describe, expect, it } from 'vitest';
import {
  COMPANY_INVESTMENT,
  SEGMENTS,
  enteredInApp,
  normalizeSegment,
  pnrCodeKey,
  validatePnrCode,
  validateSegment,
} from './booking-entry';

describe('segment is now a fixed list', () => {
  it('accepts the three travel purposes in any case', () => {
    for (const s of ['Umrah', 'UMRAH', 'umrah', 'One Way', 'one way', 'TOUR']) {
      expect(validateSegment(s)).toBeNull();
    }
  });

  it('returns the canonical spelling whatever was typed', () => {
    expect(normalizeSegment('UMRAH')).toBe('Umrah');
    expect(normalizeSegment('  ONE WAY ')).toBe('One Way');
  });

  it('rejects anything outside the list, and says what is allowed', () => {
    expect(validateSegment('Hajj')?.error).toMatch(/Umrah, One Way, Tour/);
    // Employment was replaced, not aliased: it is no longer a segment.
    expect(normalizeSegment('Employment')).toBeNull();
    expect(normalizeSegment('Hajj')).toBeNull();
  });

  it('treats a blank segment as absent, not wrong', () => {
    expect(validateSegment(null)).toBeNull();
    expect(validateSegment('')).toBeNull();
  });

  it('lists exactly the three purposes the live data uses', () => {
    expect([...SEGMENTS]).toEqual(['Umrah', 'One Way', 'Tour']);
  });
});

describe('PNR codes', () => {
  it('compares ignoring case and spacing, so one booking cannot be entered twice', () => {
    expect(pnrCodeKey('8mm3od')).toBe(pnrCodeKey('8MM3OD'));
    expect(pnrCodeKey(' 8MM 3OD ')).toBe('8MM3OD');
  });

  it('accepts a normal airline code', () => {
    expect(validatePnrCode('8MM3OD')).toBeNull();
    expect(validatePnrCode('AJK067')).toBeNull();
  });

  it('requires a code', () => {
    expect(validatePnrCode(null)?.error).toMatch(/required/);
    expect(validatePnrCode('   ')?.error).toMatch(/required/);
  });

  it('rejects codes that cannot be an airline reference', () => {
    expect(validatePnrCode('AB')?.error).toMatch(/5–10 characters/);
    expect(validatePnrCode('ABCDEFGHIJK')?.error).toMatch(/5–10 characters/);
    expect(validatePnrCode('8MM-3OD')?.error).toMatch(/letters and numbers/);
  });
});

describe('company investment', () => {
  it('is the value every new booking starts with', () => {
    expect(COMPANY_INVESTMENT).toBe('COMPANY INVESTMENT');
  });
});

describe('enteredInApp', () => {
  it('is a booking someone saved in the app; an imported one has no creator', () => {
    expect(enteredInApp({ createdBy: 'a3f1c2d4-0000-4000-8000-000000000001' })).toBe(true);
    expect(enteredInApp({ createdBy: null })).toBe(false);
  });
});
