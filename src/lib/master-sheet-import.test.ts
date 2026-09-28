import { describe, expect, it } from 'vitest';
import {
  assumedIataPayment,
  b2bCodeOf,
  excelSerialToIso,
  planImport,
  planRow,
  pnrTlFor,
  skipReason,
  type SheetRound,
  type SheetRow,
} from './master-sheet-import';

const TODAY = '2026-09-28';

function round(n: number, over: Partial<SheetRound> = {}): SheetRound {
  return {
    roundNumber: n,
    issuanceDate: '2026-09-10',
    pctFraction: 0.3,
    emdNumber: '065 1937985779',
    amount: 300_000,
    refundAmount: null,
    refundDate: null,
    ...over,
  };
}

function row(over: Partial<SheetRow> = {}): SheetRow {
  return {
    rowNumber: 10,
    srNo: 8,
    requestDate: '2026-08-01',
    investor: 'COMPANY INVESTMENT',
    license: 'TRV ADV',
    branch: 'RAWALPINDI',
    parentPnr: null,
    pnr: 'ABC123',
    gdsPnr: null,
    segment: 'UMRAH',
    airline: 'SV',
    seats: 10,
    outboundDate: '2026-11-20',
    inboundDate: '2026-12-05',
    sector: 'ISB-JED-ISB',
    airlineTaxes: 20_000,
    psf: null,
    fare: 100_000,
    totalEmdValue: 1_000_000,
    rounds: [round(1)],
    secondEmdTl: '2026-10-15',
    nameUpdateTl: '2026-11-10',
    ticketIssuanceTl: '2026-11-17',
    cancelledTickets: null,
    penaltyEmd: null,
    ...over,
  };
}

describe('excelSerialToIso', () => {
  it('reads the day, rounding off the workbook’s seconds-short midnight', () => {
    expect(excelSerialToIso(46094)).toBe('2026-03-13');
    expect(excelSerialToIso(46093.99986)).toBe('2026-03-13');
  });
});

describe('skipReason — the owner’s three exclusions', () => {
  it('Total EMD Value 0', () => {
    expect(skipReason(row({ totalEmdValue: 0, seats: 0 }), TODAY)).toBe('Total EMD Value is 0');
  });

  it('no EMD ever issued', () => {
    expect(skipReason(row({ rounds: [round(1, { amount: 0, issuanceDate: null, pctFraction: null })] }), TODAY)).toBe(
      'No EMD issued (every EMD amount is 0)'
    );
  });

  it('outbound passed and every EMD refunded', () => {
    const r = row({
      outboundDate: '2026-09-01',
      rounds: [round(1, { refundAmount: 300_000, refundDate: '2026-08-20' })],
    });
    expect(skipReason(r, TODAY)).toBe('Outbound date passed and every EMD refunded');
  });

  it('keeps a past booking with an EMD still held', () => {
    expect(skipReason(row({ outboundDate: '2026-09-01' }), TODAY)).toBeNull();
  });

  it('keeps a fully refunded booking that has not flown yet', () => {
    expect(skipReason(row({ rounds: [round(1, { refundAmount: 300_000, refundDate: '2026-09-20' })] }), TODAY)).toBeNull();
  });

  it('an empty template round does not stop a refunded booking being excluded', () => {
    const r = row({
      outboundDate: '2026-09-01',
      rounds: [round(1, { refundAmount: 300_000, refundDate: '2026-08-20' }), round(2, { amount: 0, issuanceDate: null })],
    });
    expect(skipReason(r, TODAY)).toBe('Outbound date passed and every EMD refunded');
  });
});

describe('planRow', () => {
  it('maps a clean row: % as a percentage, round 1 deadline from 2ND EMD TL', () => {
    const { booking, issues } = planRow(row(), TODAY);
    expect(issues).toEqual([]);
    expect(booking).toMatchObject({ pnr: 'ABC123', segment: 'Umrah', agentName: null, pnrTlDate: '2026-10-15' });
    expect(booking!.rounds[0]).toMatchObject({ paymentPct: 30, status: 'issued', deadlineDate: '2026-10-15' });
  });

  it('a past booking with an unrefunded EMD is imported and flagged', () => {
    const { booking, issues } = planRow(row({ outboundDate: '2026-09-22' }), TODAY);
    expect(booking).not.toBeNull();
    expect(issues.map((i) => i.category)).toContain('Past, not refunded');
  });

  it('blocks a round with an amount but no issuance date', () => {
    const { booking, issues } = planRow(row({ rounds: [round(1, { issuanceDate: null })] }), TODAY);
    expect(booking).toBeNull();
    expect(issues[0]).toMatchObject({ level: 'not imported', category: 'EMD round' });
  });

  it('imports percentages over 100% as recorded, flagged', () => {
    const { booking, issues } = planRow(row({ rounds: [round(1, { pctFraction: 0.7 }), round(2, { pctFraction: 0.7 })] }), TODAY);
    expect(booking!.rounds.map((r) => r.paymentPct)).toEqual([70, 70]);
    expect(issues.map((i) => i.category)).toContain('EMD %');
  });

  it('agents are named verbatim; a lower-case "Company investment" is the company', () => {
    expect(planRow(row({ investor: 'QFC GROUP (PVT) LTD-RWP-B2B6022' }), TODAY).booking!.agentName).toBe(
      'QFC GROUP (PVT) LTD-RWP-B2B6022'
    );
    expect(planRow(row({ investor: 'Company investment' }), TODAY).booking!.agentName).toBeNull();
    const shared = planRow(row({ investor: 'KJ/QFC/MAQBOOL' }), TODAY);
    expect(shared.booking!.agentName).toBe('KJ/QFC/MAQBOOL');
    expect(shared.issues.map((i) => i.category)).toContain('Agent');
  });

  it('a numeric PNR and a trailing space are read as the code', () => {
    expect(planRow(row({ pnr: '993787' }), TODAY).booking!.pnr).toBe('993787');
    expect(planRow(row({ pnr: '9T9LHK ' }), TODAY).booking!.pnr).toBe('9T9LHK');
  });
});

describe('pnrTlFor — the app’s own PNR TL rule', () => {
  const r = (n: number, status: 'issued' | 'refunded', deadlineDate: string | null) => ({
    roundNumber: n, issuanceDate: '2026-09-01', paymentPct: 50, emdNumber: null, emdAmount: 1,
    status, refundAmount: null, refundDate: null, deadlineDate, paymentDate: null,
  });
  it('is the earliest unrefunded round’s deadline', () => {
    expect(pnrTlFor([r(1, 'issued', '2026-10-15'), r(2, 'issued', null)])).toBe('2026-10-15');
  });
  it('moves on once round 1 is refunded — round 2 has no recorded deadline', () => {
    expect(pnrTlFor([r(1, 'refunded', '2026-10-15'), r(2, 'issued', null)])).toBeNull();
  });
  it('falls back to the last round when all are refunded', () => {
    expect(pnrTlFor([r(1, 'refunded', '2026-10-15')])).toBe('2026-10-15');
  });
});

describe('assumedIataPayment — the owner’s "paid on time" ruling', () => {
  const base = { roundNumber: 1, paymentPct: 30, emdNumber: null, emdAmount: 1, refundAmount: null, refundDate: null, deadlineDate: null };
  it('a remittance day already past → paid on that day', () => {
    // Issued 2 Sep 2026 falls in the 1–7 Sep period, remitted 15 Sep.
    const paid = assumedIataPayment({ ...base, issuanceDate: '2026-09-02', status: 'issued' }, TODAY);
    expect(paid).not.toBeNull();
    expect(paid! < TODAY).toBe(true);
  });
  it('a remittance day still ahead → left owed', () => {
    expect(assumedIataPayment({ ...base, issuanceDate: '2026-09-25', status: 'issued' }, TODAY)).toBeNull();
  });
  it('a refund inside its billing window cancelled the bill → nothing to pay', () => {
    expect(
      assumedIataPayment({ ...base, issuanceDate: '2026-09-02', status: 'refunded', refundDate: '2026-09-03' }, TODAY)
    ).toBeNull();
  });
});

describe('planImport — checks across rows', () => {
  it('holds back every copy of a duplicated PNR', () => {
    const plan = planImport([row({ rowNumber: 3 }), row({ rowNumber: 4 })], TODAY);
    expect(plan.bookings).toEqual([]);
    expect(plan.issues.filter((i) => i.category === 'Duplicate PNR')).toHaveLength(2);
  });

  it('links a child only to a parent being imported', () => {
    const plan = planImport(
      [row({ rowNumber: 3, pnr: 'PARENT1' }), row({ rowNumber: 4, pnr: 'CHILD1', parentPnr: 'PARENT1' }), row({ rowNumber: 5, pnr: 'CHILD2', parentPnr: 'GONE99' })],
      TODAY
    );
    expect(plan.bookings.find((b) => b.pnr === 'CHILD1')!.parentPnr).toBe('PARENT1');
    expect(plan.bookings.find((b) => b.pnr === 'CHILD2')!.parentPnr).toBeNull();
    expect(plan.issues.map((i) => i.category)).toContain('Parent PNR');
  });

  it('one agent per name ignoring case, and look-alike spellings flagged', () => {
    const plan = planImport(
      [
        row({ rowNumber: 3, pnr: 'AAA111', investor: 'Duniya Aviation' }),
        row({ rowNumber: 4, pnr: 'AAA222', investor: 'DUNIYA AVIATION' }),
        row({ rowNumber: 5, pnr: 'AAA333', investor: 'Hananah Travels' }),
        row({ rowNumber: 6, pnr: 'AAA444', investor: 'Hanangh Travels' }),
      ],
      TODAY
    );
    expect(plan.agents.map((a) => a.name)).toEqual(['Duniya Aviation', 'Hananah Travels', 'Hanangh Travels']);
    expect(plan.issues.filter((i) => i.category === 'Agent')).toHaveLength(2);
  });

  it('reads the B2B code without altering the name', () => {
    expect(b2bCodeOf('HAMARA SAFAR TRAVEL AND TOURS-FSD-B2B7060')).toBe('B2B7060');
    expect(b2bCodeOf('Duniya Aviation')).toBeNull();
  });
});
