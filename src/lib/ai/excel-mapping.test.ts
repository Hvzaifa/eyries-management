import { describe, expect, it } from 'vitest';
import {
  applyMapping,
  checkMappingValues,
  cellDate,
  cellEmdNumber,
  cellPercent,
  cellTime,
  columnProfiles,
  guessHeaderRow,
  heuristicMapping,
  MAPPABLE_FIELDS,
  mappingPrompt,
  normalizeHeader,
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

const rows = [totalsRaw, HEADERS, dataRow({}), dataRow({ 0: 2, 6: 'XYZ789', 8: 'ONE WAY', 12: null, 13: 'LHE-RUH' })];
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
    expect(validateMapping(ok, W, 1)?.columns).toHaveLength(2);
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
      1
    )!;
    expect(m.columns).toEqual([{ index: 6, field: 'pnr', round: 1 }]);
  });

  it('refuses a map with no PNR column, or no map at all', () => {
    expect(validateMapping({ columns: [{ index: 19, field: 'fare', round: null }] }, W, 1)).toBeNull();
    expect(validateMapping('nonsense', W, 1)).toBeNull();
  });

  it('keeps the header row it is given', () => {
    expect(validateMapping(ok, W, 1)?.headerRow).toBe(1);
  });

  it('numbers round columns the AI left without a round', () => {
    const m = validateMapping(
      { headerRow: 1, columns: [{ index: 6, field: 'pnr', round: null }, { index: 24, field: 'roundEmdAmount', round: null }, { index: 32, field: 'roundEmdAmount', round: null }] },
      W,
      1
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
    expect(drafts[1].segment.value).toBe('One Way');
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
    // A date with a time of day keeps its day: 16:06 is not the next day.
    expect(cellDate(46149.6714)).toBe('2026-05-07');
    expect(cellDate('2026-03-13')).toBe('2026-03-13');
    expect(cellDate('13/03/2026')).toBe('2026-03-13');
    expect(cellDate('13-Mar-26')).toBe('2026-03-13');
    expect(cellDate('31/02/2026')).toBeNull();
    expect(cellDate(12)).toBeNull();
  });
  it('times: day fractions and HH:mm text', () => {
    expect(cellTime(0.5)).toBe('12:00');
    expect(cellTime('2359')).toBe('23:59');
    expect(cellTime(950)).toBe('09:50');
    expect(cellTime(45)).toBe('00:45');
    expect(cellTime(2460)).toBeNull();
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

describe('guessHeaderRow', () => {
  it('finds the header under a totals row: the row with the most text', () => {
    expect(guessHeaderRow(shown)).toBe(1);
  });
});

describe('columnProfiles — what the AI is shown', () => {
  const p = columnProfiles(shown, 1);

  it('gives each column its index, header, how often it is filled, and examples', () => {
    expect(p).toContain('[6] "PNR" — filled 2/2 — e.g. ABC123 | XYZ789');
    expect(p).toContain('[14] "PNR TL DATE" — filled 0/2');
  });

  it('treats "NULL" as empty', () => {
    const q = columnProfiles([['PNR', 'LICENSE'], ['ABC123', 'NULL'], ['XYZ789', 'TA-ISB-BSP']], 0);
    expect(q).toContain('[1] "LICENSE" — filled 1/2 — e.g. TA-ISB-BSP');
  });
});

describe('mappingPrompt', () => {
  it("describes every field and lists the system's own values to match on", () => {
    const prompt = mappingPrompt({
      licenses: [{ code: 'TA-ISB-BSP', name: 'Travel Advisor Islamabad' }],
      branches: [{ code: 'RWP', name: 'Rawalpindi' }],
      airlines: [{ code: 'SV', name: 'Saudi Arabian Airlines' }],
      segments: ['Umrah', 'One Way', 'Tour'],
    });
    expect(prompt).toContain('licenses: TA-ISB-BSP (Travel Advisor Islamabad)');
    expect(prompt).toContain('branches: RWP (Rawalpindi)');
    expect(prompt).toContain('airlines: SV (Saudi Arabian Airlines)');
    expect(prompt).toContain('segments: Umrah, One Way, Tour');
    expect(prompt).toContain('- sectorFlightCode:');
    expect(prompt).toContain('- licenseName:');
  });
});

// Two booking-portal exports with different headers for the same things
// (owner, 2026-10-20). Values invented; the real files stay out of git.
const SECTOR_COLS = (n: number) => [
  `flight_code_sector_${n}`, `from_sector_code_sector_${n}`, `to_sector_code_sector_${n}`,
  `grp_departure_date_sector_${n}`, `grp_arrival_date_sector_${n}`, `grp_etd_time_sector_${n}`, `grp_eta_time_sector_${n}`, `luggage_sector_${n}`,
];
const PORTAL = ['airline_pnr', 'branch_name', 'supplier_name', 'airline_code', 'grp_type', 'total_qty', 'base_fare_amount', ...SECTOR_COLS(1), ...SECTOR_COLS(2), ...SECTOR_COLS(3), ...SECTOR_COLS(4)];
const at = (h: string) => PORTAL.indexOf(h);
function portalRow(v: Record<string, unknown>): unknown[] {
  const r: unknown[] = PORTAL.map(() => 'NULL');
  for (const [k, x] of Object.entries(v)) r[at(k)] = x;
  return r;
}
const portalShown = (rows: unknown[][]) => rows.map((r) => r.map((c) => String(c ?? '')));

describe('sector columns', () => {
  it('the dictionary maps numbered sector columns, with the sector number', () => {
    const m = heuristicMapping(portalShown([PORTAL]))!;
    expect(m.columns.find((c) => c.index === at('flight_code_sector_2'))).toMatchObject({ field: 'sectorFlightCode', round: 2 });
    expect(m.columns.find((c) => c.index === at('luggage_sector_1'))).toMatchObject({ field: 'sectorBaggage', round: 1 });
    expect(m.columns.find((c) => c.index === at('supplier_name'))?.field).toBe('licenseName');
    expect(m.columns.find((c) => c.index === at('grp_type'))?.field).toBe('segment');
  });

  const read = (v: Record<string, unknown>) => {
    const rows = [PORTAL, portalRow(v)];
    const m = heuristicMapping(portalShown(rows))!;
    return applyMapping(m, rows, portalShown(rows), { filename: 'f.xlsx', method: 't', confidence: 'high', firstRowNumber: 1 }).drafts[0];
  };

  it('builds the outbound and return flights from sectors, split by dates', () => {
    const d = read({
      airline_pnr: 'ABC123', supplier_name: 'TU -PIA', grp_type: 'Umrah ',
      flight_code_sector_1: 'PK-731', from_sector_code_sector_1: 'KHI', to_sector_code_sector_1: 'JED',
      grp_departure_date_sector_1: 46308, grp_etd_time_sector_1: '1750', grp_eta_time_sector_1: '2030', luggage_sector_1: '1 PC 30KG - 7 KG',
      flight_code_sector_2: 'PK-744', from_sector_code_sector_2: 'MED', to_sector_code_sector_2: 'KHI',
      grp_departure_date_sector_2: 46335, grp_etd_time_sector_2: 45, grp_eta_time_sector_2: '0635', luggage_sector_2: '1 PC 23KG 7KG',
    });
    expect(d.licenseName.value).toBe('TU -PIA');
    expect(d.segment.value).toBe('Umrah');
    expect(d.tripType.value).toBe('round_trip');
    expect(d.outboundDate.value).toBe('2026-10-13');
    expect(d.outboundFlightCode.value).toBe('PK-731');
    expect(d.outboundDepartureCity.value).toBe('KHI');
    expect(d.outboundArrivalCity.value).toBe('JED');
    expect(d.outboundDepartureTime.value).toBe('17:50');
    expect(d.outboundBaggagePieces.value).toBe(1);
    expect(d.outboundBaggageKg.value).toBe(30);
    expect(d.inboundDate.value).toBe('2026-11-09');
    expect(d.inboundDepartureCity.value).toBe('MED');
    expect(d.inboundDepartureTime.value).toBe('00:45');
    expect(d.inboundBaggageKg.value).toBe(23);
    expect(d.outboundStops.value).toEqual([]);
  });

  it('a same-day sector is a connection, and becomes a stop', () => {
    const d = read({
      airline_pnr: 'XYZ789',
      from_sector_code_sector_1: 'SKT', to_sector_code_sector_1: 'DOH', grp_departure_date_sector_1: 46254, grp_eta_time_sector_1: '0200',
      flight_code_sector_2: 'QR-1186', from_sector_code_sector_2: 'DOH', to_sector_code_sector_2: 'JED', grp_departure_date_sector_2: 46254, grp_etd_time_sector_2: '0410',
      from_sector_code_sector_3: 'JED', to_sector_code_sector_3: 'DOH', grp_departure_date_sector_3: 46274,
      from_sector_code_sector_4: 'DOH', to_sector_code_sector_4: 'SKT', grp_departure_date_sector_4: 46274,
    });
    expect(d.outboundArrivalCity.value).toBe('JED');
    expect(d.outboundStops.value).toEqual([
      // no departure time on sector 1, so the day it reaches DOH is left for the reviewer
      { city: 'DOH', flightCode: 'QR-1186', arrivalTime: '02:00', departureTime: '04:10', arrivalDate: null, departureDate: '2026-08-20' },
    ]);
    expect(d.inboundDepartureCity.value).toBe('JED');
    expect(d.inboundArrivalCity.value).toBe('SKT');
    expect(d.inboundStops.value).toHaveLength(1);
  });

  // Owner, 2026-10-20: the export's arrival date is never read (wrong on about
  // one sector in five); the day is worked out from the times, marked to check.
  it("an overnight sector lands the next day, whatever the file's arrival date says", () => {
    const d = read({
      airline_pnr: 'NIGHT1',
      from_sector_code_sector_1: 'ISB', to_sector_code_sector_1: 'JED',
      grp_departure_date_sector_1: 46203, grp_arrival_date_sector_1: 46203, grp_etd_time_sector_1: '0950', grp_eta_time_sector_1: '1205',
      from_sector_code_sector_2: 'JED', to_sector_code_sector_2: 'ISB',
      grp_departure_date_sector_2: 46203 + 20, grp_arrival_date_sector_2: 46203 + 20, grp_etd_time_sector_2: '1810', grp_eta_time_sector_2: '0110',
    });
    expect(d.outboundArrivalDate).toEqual({ value: '2026-06-30', confidence: 'high' });
    expect(d.inboundDate.value).toBe('2026-07-20');
    expect(d.inboundArrivalDate).toEqual({ value: '2026-07-21', confidence: 'medium' });
  });

  it('a stop reached after midnight carries its date, and the stops are marked to check', () => {
    const d = read({
      airline_pnr: 'NIGHT2',
      from_sector_code_sector_1: 'LHE', to_sector_code_sector_1: 'DXB',
      grp_departure_date_sector_1: 46203, grp_etd_time_sector_1: '2300', grp_eta_time_sector_1: '0100',
      from_sector_code_sector_2: 'DXB', to_sector_code_sector_2: 'JED',
      grp_departure_date_sector_2: 46204, grp_etd_time_sector_2: '0300', grp_eta_time_sector_2: '0500',
    });
    expect(d.outboundStops).toEqual({
      value: [{ city: 'DXB', flightCode: null, arrivalTime: '01:00', departureTime: '03:00', arrivalDate: '2026-07-01', departureDate: '2026-07-01' }],
      confidence: 'medium',
    });
    expect(d.outboundArrivalDate).toEqual({ value: '2026-07-01', confidence: 'medium' });
  });

  it('the arrival date columns are never mapped', () => {
    const m = heuristicMapping(portalShown([PORTAL]))!;
    expect(m.columns.find((c) => c.index === at('grp_arrival_date_sector_1'))).toBeUndefined();
    expect(MAPPABLE_FIELDS).not.toContain('outboundArrivalDate');
    expect(MAPPABLE_FIELDS).not.toContain('inboundArrivalDate');
    expect(MAPPABLE_FIELDS).toContain('ticketIssuanceDeadline');
  });

  it('one sector is a one-way trip', () => {
    const d = read({ airline_pnr: 'ONE111', from_sector_code_sector_1: 'ISB', to_sector_code_sector_1: 'RUH', grp_departure_date_sector_1: 46184 });
    expect(d.tripType.value).toBe('one_way');
    expect(d.inboundDepartureCity.value).toBeNull();
  });
});

describe('checkMappingValues — a map is checked against the values', () => {
  const sheet = [
    ['airline_pnr', 'al_code_sector_1', 'flight_code_sector_1'],
    ['ABC123', 'SV', 'SV-725'],
    ['XYZ789', 'SV', 'SV-727'],
  ];

  it('drops a column mapped as flight numbers that holds only airline codes', () => {
    const m = validateMapping(
      { columns: [{ index: 0, field: 'pnr', round: null }, { index: 1, field: 'sectorFlightCode', round: 1 }] },
      3,
      0
    )!;
    expect(checkMappingValues(m, sheet).columns.map((c) => c.field)).toEqual(['pnr']);
  });

  it('adds the other sectors when the map named only sector 1', () => {
    const header = [...PORTAL];
    const m = checkMappingValues(
      {
        headerRow: 0,
        columns: [
          { index: at('airline_pnr'), field: 'pnr', round: 1 },
          { index: at('flight_code_sector_1'), field: 'sectorFlightCode', round: 1 },
          { index: at('grp_eta_time_sector_1'), field: 'sectorArrivalTime', round: 1 },
        ],
      },
      [header]
    );
    const of = (field: string) => m.columns.filter((c) => c.field === field).map((c) => [header[c.index], c.round]);
    expect(of('sectorFlightCode')).toEqual([
      ['flight_code_sector_1', 1], ['flight_code_sector_2', 2], ['flight_code_sector_3', 3], ['flight_code_sector_4', 4],
    ]);
    expect(of('sectorArrivalTime').map(([, r]) => r)).toEqual([1, 2, 3, 4]);
  });

  it('never gives a sector a second column for the same field', () => {
    const header = [...PORTAL];
    const m = checkMappingValues(
      {
        headerRow: 0,
        columns: [
          { index: at('airline_pnr'), field: 'pnr', round: 1 },
          { index: at('grp_etd_time_sector_1'), field: 'sectorDepartureTime', round: 1 },
          { index: at('grp_eta_time_sector_2'), field: 'sectorDepartureTime', round: 2 },
        ],
      },
      [header]
    );
    expect(m.columns.filter((c) => c.field === 'sectorDepartureTime').map((c) => [header[c.index], c.round])).toEqual([
      ['grp_etd_time_sector_1', 1], ['grp_eta_time_sector_2', 2], ['grp_etd_time_sector_3', 3], ['grp_etd_time_sector_4', 4],
    ]);
  });

  it('keeps a column of real flight numbers', () => {
    const m = validateMapping(
      { columns: [{ index: 0, field: 'pnr', round: null }, { index: 2, field: 'sectorFlightCode', round: 1 }] },
      3,
      0
    )!;
    expect(checkMappingValues(m, sheet).columns.map((c) => c.field)).toEqual(['pnr', 'sectorFlightCode']);
  });
});

describe('validateMapping — sectors decide the flights', () => {
  it('drops a per-flight column when the sheet gives flights by sector', () => {
    const m = validateMapping(
      {
        columns: [
          { index: 0, field: 'pnr', round: null },
          { index: 1, field: 'sectorFrom', round: 1 },
          { index: 2, field: 'inboundDate', round: null },
          { index: 3, field: 'fare', round: null },
        ],
      },
      4,
      0
    )!;
    expect(m.columns.map((c) => c.field)).toEqual(['pnr', 'sectorFrom', 'fare']);
  });
});

describe('applyMapping — arrival dates on a sheet with one time per flight', () => {
  const sheet = [
    ['PNR', 'OUTBOUND DATE', 'DEP TIME', 'ARR TIME'],
    ['NIGHT3', '2026-06-30', '18:10', '01:10'],
    ['DAY001', '2026-06-30', '09:50', '12:05'],
  ];
  const mapping: ColumnMapping = {
    headerRow: 0,
    columns: [
      { index: 0, field: 'pnr', round: 1 },
      { index: 1, field: 'outboundDate', round: 1 },
      { index: 2, field: 'outboundDepartureTime', round: 1 },
      { index: 3, field: 'outboundArrivalTime', round: 1 },
    ],
  };

  it('an overnight flight lands the next day, marked to check; a daytime one lands the departure day', () => {
    const { drafts } = applyMapping(mapping, sheet, sheet, { filename: 'f.xlsx', method: 't', confidence: 'high', firstRowNumber: 1 });
    expect(drafts[0].outboundArrivalDate).toEqual({ value: '2026-07-01', confidence: 'medium' });
    expect(drafts[1].outboundArrivalDate).toEqual({ value: '2026-06-30', confidence: 'high' });
  });
});
