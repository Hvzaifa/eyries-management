import { describe, expect, it } from 'vitest';
import {
  normalizePnrCode,
  parseAmount,
  parseExcelDate,
  parsePercent,
  partitionRows,
  type MappedLegacyRow,
} from './legacy-import';

function row(rowNumber: number, pnrCode: string | null, errors: string[] = []): MappedLegacyRow {
  return { rowNumber, pnrCode, data: {}, warnings: [], errors };
}

describe('normalizePnrCode', () => {
  it('trims and uppercases codes so ABC123 and abc123 collide', () => {
    expect(normalizePnrCode(' abc123 ')).toBe('ABC123');
  });
});

describe('partitionRows', () => {
  it('passes unique valid rows through as clean', () => {
    const { clean, flagged } = partitionRows([row(2, 'AAA'), row(3, 'BBB')]);
    expect(clean.map((r) => r.pnrCode)).toEqual(['AAA', 'BBB']);
    expect(flagged).toHaveLength(0);
  });

  it('flags EVERY copy when a PNR appears on multiple rows (the legacy-sheet trap)', () => {
    const { clean, flagged } = partitionRows([
      row(2, 'DUP'),
      row(3, 'DUP'),
      row(4, 'UNIQUE'),
      row(5, 'dup'),
    ]);
    expect(clean.map((r) => r.pnrCode)).toEqual(['UNIQUE']);
    expect(flagged.map((r) => r.rowNumber)).toEqual([2, 3, 5]);
    expect(flagged.every((r) => r.errors.some((e) => e.includes('duplicate PNR "DUP"')))).toBe(true);
  });

  it('flags a valid copy whose twin has its own errors — duplication must stay visible', () => {
    const { clean, flagged } = partitionRows([
      row(2, 'DUP', ['missing fare']),
      row(3, 'DUP'),
      row(4, 'SOLO'),
    ]);
    expect(clean.map((r) => r.pnrCode)).toEqual(['SOLO']);
    expect(flagged.map((r) => r.rowNumber)).toEqual([2, 3]);
  });

  it('flags rows with hard errors even when their code is unique', () => {
    const { clean, flagged } = partitionRows([
      row(2, 'BAD', ['seats missing']),
      row(3, 'GOOD'),
    ]);
    expect(flagged.map((r) => r.rowNumber)).toEqual([2]);
    expect(clean.map((r) => r.pnrCode)).toEqual(['GOOD']);
  });

  it('flags rows with empty PNR codes rather than grouping them together', () => {
    const { clean, flagged } = partitionRows([row(2, null), row(3, '')]);
    expect(clean).toHaveLength(0);
    expect(flagged.map((r) => r.rowNumber)).toEqual([2, 3]);
  });

  it('reports results sorted by sheet row number', () => {
    const { clean } = partitionRows([row(9, 'ZZZ'), row(2, 'AAA'), row(5, 'MMM')]);
    expect(clean.map((r) => r.rowNumber)).toEqual([2, 5, 9]);
  });
});

describe('parseExcelDate', () => {
  it('reads the intended day from the workbook midnight-PKT convention', () => {
    // Stored 2026-06-22T18:59:48Z = 23:59:48 PKT (12s before midnight) —
    // the sheet displays 23 June; the parser must recover the 23rd.
    expect(parseExcelDate(new Date('2026-06-22T18:59:48.000Z'))).toBe('2026-06-23');
    expect(parseExcelDate(new Date('2026-03-12T18:59:48.000Z'))).toBe('2026-03-13');
  });

  it('leaves mid-day instants on their own PKT day', () => {
    expect(parseExcelDate(new Date('2026-06-01T05:30:00Z'))).toBe('2026-06-01'); // 10:30 PKT
  });

  it('converts Excel serial numbers with the same convention', () => {
    // 46174.7916... = 2026-06-01 19:00Z = midnight PKT of 2026-06-02
    expect(parseExcelDate(46174.79166666)).toBe('2026-06-02');
    expect(parseExcelDate(46174)).toBe('2026-06-01');
  });

  it('parses ISO strings', () => {
    expect(parseExcelDate('2026-06-01')).toBe('2026-06-01');
  });

  it('parses DD/MM/YYYY text cells (South Asian convention)', () => {
    expect(parseExcelDate('01/06/2026')).toBe('2026-06-01');
    expect(parseExcelDate('1-6-2026')).toBe('2026-06-01');
  });

  it('parses 01JUN26 style compact dates from the old workbook', () => {
    expect(parseExcelDate('01JUN26')).toBe('2026-06-01');
    expect(parseExcelDate('1-JUN-2026')).toBe('2026-06-01');
  });

  it('returns null for junk and blanks', () => {
    expect(parseExcelDate('')).toBeNull();
    expect(parseExcelDate(null)).toBeNull();
    expect(parseExcelDate('not a date')).toBeNull();
  });
});

describe('parseAmount', () => {
  it('passes numbers through and cleans formatted strings', () => {
    expect(parseAmount(1275000)).toBe(1275000);
    expect(parseAmount('PKR 1,275,000.50')).toBe(1275000.5);
    expect(parseAmount(' 85000 ')).toBe(85000);
  });

  it('returns null for blanks and junk', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('n/a')).toBeNull();
    expect(parseAmount(null)).toBeNull();
  });
});

describe('parsePercent', () => {
  it('reads staff-style values and percent-formatted cells alike', () => {
    expect(parsePercent('15%')).toBe(15);
    expect(parsePercent(15)).toBe(15);
    expect(parsePercent(0.15)).toBe(15);
    expect(parsePercent('30')).toBe(30);
    expect(parsePercent('')).toBeNull();
  });

  it('treats the legacy-sheet fraction convention: 1 means 100%', () => {
    expect(parsePercent(1)).toBe(100);
    expect(parsePercent(0.5)).toBe(50);
    expect(parsePercent(0.7)).toBe(70);
    expect(parsePercent(0)).toBe(0);
  });
});
