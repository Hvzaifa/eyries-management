import { describe, expect, it } from 'vitest';
import {
  applyMapping,
  cellDate,
  cellEmdNumber,
  cellPercent,
  cellTime,
  heuristicMapping,
  normalizeHeader,
  sampleForPrompt,
  validateMapping,
  type ColumnMapping,
} from './excel-mapping';

// The master sheet's real header row (PNRs.xlsx, 2026-10-05) under its totals
// row. Data rows are invented: the workbook itself is kept out of git.
const HEADERS = [
  'SR #', 'REQUEST DATE', 'INVESTMENT TYPE', 'LICENSE', 'BRANCH', 'PARENT PNR', 'PNR', 'GDS PNR', 'SEGMENT', 'AIRLINE',
  'NO OF SEATS', 'OUTBOUND DATE', 'INBOUND DATE', 'SECTOR', 'PNR TL\nDATE', 'DEAL\n%AGE', 'Issued / Unissued',
  'Airline Taxes', 'PSF', 'FARE', 'Total EMD Value (Without Taxes and PSF)',
  'ISSUANCE DATE', 'PAYMENT %AGE', '1st EMD NUMBER', 'EMD AMOUNT', 'EMD Refund Amount', 'Date of Refund', 'TIME LIMIT\n(Date)', 'TIME LIMIT\n(Time)',
  'ISSUANCE DATE', 'PAYMENT %AGE', '2nd EMD NUMBER', 'EMD AMOUNT', 'EMD Refund Amount', 'Date of Refund', 'TIME LIMIT\n(Date)', 'TIME LIMIT\n(Time)',
];
const W = HEADERS.length;
const totalsRaw = Array(W).fill(null);
totalsRaw[10] = 79416;
totalsRaw[20] = 9119205866.9;
const totalsShown = totalsRaw.map((v) => (v === null ? '' : String(v)));

function dataRow(over: Record<number, unknown>): unknown[] {
  const r: unknown[] = Array(W).fill(null);
  Object.assign(r, {
    0: 1, 1: 46094, 2: 'TEST AGENCY-RWP-B2B0001', 3: 'TRV ADV', 4: 'RAWALPINDI', 6: 'ABC123', 8: 'UMRAH', 9: 'SV',
    10: 20, 11: 46350, 12: 46365, 13: 'ISB-JED-ISB', 16: 'Issued', 17: 18148, 19: 81380, 20: 1627600,
    21: 46300, 22: 0.3, 23: '0651937985779', 24: 488280, 29: 46320, 30: 0.7, 31: '065 1937985780', 32: 1139320,
    ...over,
  });
  return r;
}
const shownOf = (r: unknown[]) => r.map((v, i) => (v === null ? '' : i === 22 || i === 30 ? `${Number(v) * 100}%` : String(v)));

const rows = [totalsRaw, HEADERS, dataRow({}), dataRow({ 0: 2, 6: 'XYZ789', 8: 'EMPLOYMENT', 12: null, 13: 'LHE-RUH' })];
const shown = [totalsShown, HEADERS, shownOf(rows[2]), shownOf(rows[3])];

describe('heuristicMapping — the fallback dictionary', () => {
  const m = heuristicMapping(shown)!;
  const fieldAt = (i: number) => m.columns.find((c) => c.index === i);

  it('finds the header row under the totals row', () => {
    expect(m.headerRow).toBe(1);
  });

  it('maps by whole header, not substring: INVESTMENT TYPE is the investor, not the segment', () => {
    expect(fieldAt(2)?.field).toBe('investorCompany');
    expect(fieldAt(8)?.field).toBe('segment');
    expect(fieldAt(9)?.field).toBe('airlineCode');
  });

  it('reads multi-line headers and the ordinal EMD columns', () => {
    expect(fieldAt(14)?.field).toBe('pnrTlDate');
    expect(fieldAt(27)).toMatchObject({ field: 'roundDeadlineDate', round: 1 });
    expect(fieldAt(23)).toMatchObject({ field: 'roundEmdNumber', round: 1 });
    expect(fieldAt(31)).toMatchObject({ field: 'roundEmdNumber', round: 2 });
  });

  it('numbers repeated round columns in order', () => {
    expect(fieldAt(21)).toMatchObject({ field: 'roundIssuanceDate', round: 1 });
    expect(fieldAt(29)).toMatchObject({ field: 'roundIssuanceDate', round: 2 });
  });

  it('leaves totals, refunds, deal %, status and parent PNR unmapped', () => {
    for (const i of [0, 5, 15, 16, 20, 25, 26]) expect(fieldAt(i)).toBeUndefined();
  });
});

describe('validateMapping — the AI map is checked, not trusted', () => {
  const ok = { headerRow: 1, columns: [{ index: 6, field: 'pnr', round: null }, { index: 19, field: 'fare', round: null }] };

  it('accepts a sound map', () => {
    expect(validateMapping(ok, W, 4)?.columns).toHaveLength(2);
  });

  it('drops unknown fields, out-of-range columns and a second column for one field', () => {
    const m = validateMapping(
      {
        headerRow: 1,
        columns: [
          { index: 6, field: 'pnr', round: null },
          { index: 7, field: 'pnr', round: null },
          { index: 99, field: 'fare', round: null },
          { index: 3, field: 'favouriteColour', round: null },
          { index: 4, field: 'ignore', round: null },
        ],
      },
      W,
      4
    )!;
    expect(m.columns).toEqual([{ index: 6, field: 'pnr', round: 1 }]);
  });

  it('refuses a map with no PNR column, or a header row outside the sample', () => {
    expect(validateMapping({ headerRow: 1, columns: [{ index: 19, field: 'fare', round: null }] }, W, 4)).toBeNull();
    expect(validateMapping({ ...ok, headerRow: 40 }, W, 4)).toBeNull();
    expect(validateMapping('nonsense', W, 4)).toBeNull();
  });

  it('numbers round columns the AI left without a round', () => {
    const m = validateMapping(
      { headerRow: 1, columns: [{ index: 6, field: 'pnr', round: null }, { index: 24, field: 'roundEmdAmount', round: null }, { index: 32, field: 'roundEmdAmount', round: null }] },
      W,
      4
    )!;
    expect(m.columns.filter((c) => c.field === 'roundEmdAmount').map((c) => c.round)).toEqual([1, 2]);
  });
});

describe('applyMapping — values copied exactly', () => {
  const m = heuristicMapping(shown) as ColumnMapping;
  const { drafts, totalRows } = applyMapping(m, rows, shown, { filename: 'PNRs.xlsx', method: 'test', confidence: 'medium', firstRowNumber: 1 });

  it('one draft per data row; the totals row is skipped', () => {
    expect(totalRows).toBe(2);
    expect(drafts.map((d) => d.pnr.value)).toEqual(['ABC123', 'XYZ789']);
    expect(drafts[0].rawPastedText).toBe('Imported from PNRs.xlsx, row 3');
  });

  it('copies amounts and seats exactly', () => {
    expect(drafts[0].fare.value).toBe(81380);
    expect(drafts[0].airlineTaxes.value).toBe(18148);
    expect(drafts[0].seats.value).toBe(20);
    expect(drafts[0].roundEmdAmount.value).toBe(488280);
  });

  it('reads Excel serial dates, the % fraction, the EMD number and the segment', () => {
    expect(drafts[0].requestDate.value).toBe('2026-03-13');
    expect(drafts[0].outboundDate.value).toBe('2026-11-24');
    expect(drafts[0].roundPaymentPct.value).toBe(30);
    expect(drafts[0].roundEmdNumber.value).toBe('065 1937985779');
    expect(drafts[0].segment.value).toBe('Umrah');
    expect(drafts[1].segment.value).toBe('Employment');
  });

  it('takes round 1 only into the draft', () => {
    expect(drafts[0].roundIssuanceDate.value).toBe('2026-10-05');
  });

  it('an empty cell stays empty; the investor name is kept whole', () => {
    expect(drafts[1].inboundDate.value).toBeNull();
    expect(drafts[0].investorCompany.value).toBe('TEST AGENCY-RWP-B2B0001');
  });

  it('an unreadable cell is left empty, low confidence, with a note', () => {
    const bad = [...rows.slice(0, 2), dataRow({ 11: 'next tuesday' })];
    const { drafts: d } = applyMapping(m, bad, [...shown.slice(0, 2), shownOf(bad[2])], {
      filename: 'f.xlsx', method: 'test', confidence: 'high', firstRowNumber: 1,
    });
    expect(d[0].outboundDate).toMatchObject({ value: null, confidence: 'low' });
    expect(d[0].outboundDate.notes).toContain('next tuesday');
  });

  it('loads at most the limit but counts every row', () => {
    const many = [totalsRaw, HEADERS, ...Array.from({ length: 5 }, (_, i) => dataRow({ 6: `PNR00${i}` }))];
    const r = applyMapping(m, many, many.map((x) => shownOf(x as unknown[])), { filename: 'f', method: 't', confidence: 'high', firstRowNumber: 1, limit: 3 });
    expect(r.drafts).toHaveLength(3);
    expect(r.totalRows).toBe(5);
  });
});

describe('cell readers', () => {
  it('dates: serials, ISO, day-first slashes, day-month-name', () => {
    expect(cellDate(46094)).toBe('2026-03-13');
    // Workbooks store midnight a few seconds short (2026-08-26): still the 13th.
    expect(cellDate(46093.99986)).toBe('2026-03-13');
    expect(cellDate('2026-03-13')).toBe('2026-03-13');
    expect(cellDate('13/03/2026')).toBe('2026-03-13');
    expect(cellDate('13-Mar-26')).toBe('2026-03-13');
    expect(cellDate('31/02/2026')).toBeNull();
    expect(cellDate(12)).toBeNull();
  });
  it('times: day fractions and HH:mm text', () => {
    expect(cellTime(0.5)).toBe('12:00');
    expect(cellTime('2359')).toBe('23:59');
    expect(cellTime('25:00')).toBeNull();
  });
  it('percent: a %-formatted fraction, a bare fraction, a plain percentage', () => {
    expect(cellPercent(1, '100%')).toBe(100);
    expect(cellPercent(0.15, '')).toBe(15);
    expect(cellPercent(30, '30')).toBe(30);
  });
  it('EMD numbers become 123 4567890123', () => {
    expect(cellEmdNumber('0651937985779')).toBe('065 1937985779');
    expect(cellEmdNumber('065-1937985779')).toBe('065 1937985779');
    expect(cellEmdNumber('ABC')).toBe('ABC');
  });
  it('headers normalise line breaks and punctuation', () => {
    expect(normalizeHeader('PNR TL\nDATE')).toBe('pnr tl date');
    expect(normalizeHeader('PAYMENT %AGE')).toBe('payment age');
  });
});

describe('sampleForPrompt', () => {
  it('shows only non-empty cells with their column index, and nothing past the sample', () => {
    const s = sampleForPrompt(shown);
    expect(s).toContain('Row 1: [0] SR # | [1] REQUEST DATE');
    expect(s).toContain('[14] PNR TL DATE');
    expect(s.split('\n')).toHaveLength(4);
  });
});
