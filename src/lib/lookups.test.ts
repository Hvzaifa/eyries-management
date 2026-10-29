import { describe, expect, it } from 'vitest';
import { lookupLabel, lookupOptionText, findLookupRow, matchLookup, matchLookupOptions } from './lookups';

describe('lookupOptionText', () => {
  it('shows code and name, or one of them when they are the same', () => {
    expect(lookupOptionText({ code: 'TA-ISB-BSP', name: 'Travel Advisor Islamabad' })).toBe('TA-ISB-BSP — Travel Advisor Islamabad');
    expect(lookupOptionText({ code: 'SIX SIGMA', name: 'SIX SIGMA' })).toBe('SIX SIGMA');
    expect(lookupOptionText({ code: null, name: 'Old' })).toBe('Old');
  });
});

describe('lookupLabel', () => {
  it('shows the code, falling back to the name', () => {
    expect(lookupLabel({ name: 'Rawalpindi', code: 'RWP' })).toBe('RWP');
    expect(lookupLabel({ name: 'Rawalpindi', code: null })).toBe('Rawalpindi');
    expect(lookupLabel({ name: 'Rawalpindi', code: '  ' })).toBe('Rawalpindi');
    expect(lookupLabel(null)).toBeNull();
  });
});

describe('matchLookupOptions', () => {
  const branches = [
    { value: '1', code: 'LHE', name: 'Lahore' },
    { value: '2', code: 'STH-LHE', name: 'Corporate Lahore' },
    { value: '3', code: 'STH', name: 'Six Sigma Group – Corp' },
    { value: '4', code: 'RWP', name: 'Rawalpindi' },
  ];
  const codes = (q: string) => matchLookupOptions(branches, q).map((o) => o.code);

  it('returns everything, in order, for an empty query', () => {
    expect(codes('')).toEqual(['LHE', 'STH-LHE', 'STH', 'RWP']);
    expect(codes('   ')).toEqual(['LHE', 'STH-LHE', 'STH', 'RWP']);
  });

  it('puts an exact code first, then codes starting with it', () => {
    expect(codes('sth')).toEqual(['STH', 'STH-LHE']);
    expect(codes('LHE')).toEqual(['LHE', 'STH-LHE']);
  });

  it('finds a branch by its name, ignoring case', () => {
    expect(codes('rawal')).toEqual(['RWP']);
    expect(codes('lahore')).toEqual(['LHE', 'STH-LHE']);
    expect(codes('corp')).toEqual(['STH-LHE', 'STH']);
  });

  it('returns nothing when nothing matches', () => {
    expect(codes('karachi')).toEqual([]);
  });

  it('matches airline names with the code in brackets', () => {
    const airlines = [
      { value: 'a', code: 'PA', name: 'Airblue-(PA)' },
      { value: 'b', code: 'OV', name: 'Salam Air-(OV)' },
    ];
    expect(matchLookupOptions(airlines, 'blue').map((o) => o.code)).toEqual(['PA']);
    expect(matchLookupOptions(airlines, 'salam').map((o) => o.code)).toEqual(['OV']);
  });
});

describe('findLookupRow', () => {
  // Branches here; licenses are matched the same way.
  const rows = [
    { id: 'r', name: 'RAWALPINDI', code: null },
    { id: 'b', name: 'B2C', code: null },
    { id: 'k', name: 'Karachi', code: 'KHI' },
  ];

  it('matches on code first', () => {
    expect(findLookupRow(rows, { name: 'Anything', code: 'khi' })?.id).toBe('k');
  });

  it('matches the name ignoring case', () => {
    expect(findLookupRow(rows, { name: 'Rawalpindi', code: 'RWP' })?.id).toBe('r');
  });

  it('matches a row that was named after its code', () => {
    expect(findLookupRow(rows, { name: 'B2C Branch', code: 'B2C' })?.id).toBe('b');
  });

  it('returns nothing for a branch not yet in the table', () => {
    expect(findLookupRow(rows, { name: 'Kharian', code: 'QKH' })).toBeUndefined();
  });
});

describe('matchLookup', () => {
  const licenses = [
    { code: 'TU-PIA (PSA)', name: 'TU-PIA (PSA)' },
    { code: 'TA-ISB-BSP', name: 'Travel Advisor Islamabad' },
    { code: 'TF-BSP', name: 'Time 2 Fly' },
  ];

  it('matches a code or a name exactly, ignoring case', () => {
    expect(matchLookup(licenses, 'tf-bsp')?.name).toBe('Time 2 Fly');
    expect(matchLookup(licenses, 'time 2 fly')?.code).toBe('TF-BSP');
    expect(matchLookup(licenses, 'Travel Advisor Islamabad')?.code).toBe('TA-ISB-BSP');
  });

  it("finds an export's spelling of a code", () => {
    expect(matchLookup(licenses, 'TU -PIA')?.code).toBe('TU-PIA (PSA)');
    expect(matchLookup(licenses, 'ta isb bsp')?.code).toBe('TA-ISB-BSP');
  });

  it('matches airlines by code or by the name an export writes', () => {
    const airlines = [{ code: 'SV', name: 'Saudi Arabian Airlines' }, { code: 'PK', name: 'Pakistan International-(PK)' }];
    expect(matchLookup(airlines, 'Saudi Arabian Airlines')?.code).toBe('SV');
    expect(matchLookup(airlines, 'pk')?.code).toBe('PK');
  });

  it('finds nothing for an unknown value, a blank, or two equally loose matches', () => {
    expect(matchLookup(licenses, 'HD-BSP')).toBeUndefined();
    expect(matchLookup(licenses, '  ')).toBeUndefined();
    expect(matchLookup([{ name: 'AB (1)' }, { name: 'AB (2)' }], 'AB')).toBeUndefined();
  });
});
