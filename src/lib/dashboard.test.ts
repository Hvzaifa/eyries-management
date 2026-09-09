import { describe, expect, it } from 'vitest';
import { summarizeDashboard, pnrCountLabel } from './dashboard';
import type { PnrListRow } from './pnrs';

/** Only the fields the cards read; the rest of the row is irrelevant here. */
function row(over: Partial<PnrListRow>): PnrListRow {
  return {
    id: 'id',
    srNo: 1,
    requestDate: '2026-09-01',
    investorCompany: 'Al-Noor',
    licenseName: null,
    branchName: 'Islamabad',
    pnr: 'ABC123',
    gdsPnr: null,
    segment: 'Umrah',
    airlineCode: 'SV',
    seats: 10,
    outboundDate: '2026-11-15',
    inboundDate: null,
    sector: null,
    pnrTlDate: null,
    dealPct: null,
    issuedStatus: 'unissued',
    airlineTaxes: null,
    psf: null,
    fare: 0,
    totalEmdValue: 0,
    status: 'active',
    totalPaid: 0,
    totalRefunded: 0,
    nextPendingDeadline: null,
    hasPendingRound: false,
    ...over,
  } as PnrListRow;
}

describe('summarizeDashboard', () => {
  const rows = [
    row({ id: 'a', status: 'active', branchName: 'Islamabad', airlineCode: 'PA', seats: 10, totalEmdValue: 1000, totalPaid: 400, totalRefunded: 100 }),
    row({ id: 'b', status: 'active', branchName: 'Islamabad', airlineCode: 'SV', seats: 20, totalEmdValue: 2000, totalPaid: 500, totalRefunded: 0 }),
    row({ id: 'c', status: 'completed', branchName: 'Islamabad', airlineCode: 'PA', seats: 30, totalEmdValue: 3000, totalPaid: 600, totalRefunded: 0 }),
    row({ id: 'd', status: 'cancelled', branchName: 'Lahore', airlineCode: 'PA', seats: 40, totalEmdValue: 4000, totalPaid: 700, totalRefunded: 700 }),
  ];

  it('counts active PNRs only when no status is chosen', () => {
    // The owner's ruling: an unfiltered dashboard keeps its old meaning, so the
    // completed and cancelled rows below must not inflate these figures.
    const s = summarizeDashboard(rows, null);
    expect(s.pnrCount).toBe(2);
    expect(s.totalSeats).toBe(30);
    expect(s.totalEmdValue).toBe(3000);
    expect(s.totalPaid).toBe(900);
    expect(s.totalRefunded).toBe(100);
  });

  // The table applies the status filter itself, so these pass rows already
  // narrowed to that status — `statusFilter` only tells the summary not to
  // re-apply its active-only default on top.
  it('switches wholly to the chosen status', () => {
    const s = summarizeDashboard(rows.filter((r) => r.status === 'completed'), 'completed');
    expect(s.pnrCount).toBe(1);
    expect(s.totalSeats).toBe(30);
    expect(s.totalEmdValue).toBe(3000);
    expect(s.totalPaid).toBe(600);
  });

  it('reports cancelled bookings when asked for them', () => {
    const s = summarizeDashboard(rows.filter((r) => r.status === 'cancelled'), 'cancelled');
    expect(s.pnrCount).toBe(1);
    expect(s.totalRefunded).toBe(700);
  });

  it('does not re-apply the active-only default once a status is chosen', () => {
    // Guards the whole point of the `statusFilter` argument: with 'completed'
    // passed, a completed row must survive rather than being filtered to active.
    const completed = [row({ status: 'completed', seats: 7, totalPaid: 250 })];
    const s = summarizeDashboard(completed, 'completed');
    expect(s.pnrCount).toBe(1);
    expect(s.totalSeats).toBe(7);
    expect(s.totalPaid).toBe(250);
  });

  it('combines status with branch and airline, as the table passes them in', () => {
    // The table has already applied branch=Islamabad and airline=PA; only row
    // "a" is both active and matching, so "c" (completed) must stay out.
    const filtered = rows.filter((r) => r.branchName === 'Islamabad' && r.airlineCode === 'PA');
    const s = summarizeDashboard(filtered, null);
    expect(s.pnrCount).toBe(1);
    expect(s.totalSeats).toBe(10);
    expect(s.totalPaid).toBe(400);
  });

  it('is all zeroes when a filter combination matches nothing', () => {
    const s = summarizeDashboard([], null);
    expect(s).toEqual({ pnrCount: 0, totalSeats: 0, totalEmdValue: 0, totalPaid: 0, totalRefunded: 0 });
  });

  it('treats a missing total EMD value as zero rather than NaN', () => {
    const s = summarizeDashboard([row({ totalEmdValue: null })], null);
    expect(s.totalEmdValue).toBe(0);
  });

  it('keeps paid gross — a refunded round is still money that went out', () => {
    // Not 0. Netting the refund off "total paid" would understate what left the
    // account, which is the distinction the dashboard_totals view drew too.
    const s = summarizeDashboard([row({ totalPaid: 500, totalRefunded: 500 })], null);
    expect(s.totalPaid).toBe(500);
    expect(s.totalRefunded).toBe(500);
  });

  it('sums decimal amounts without float drift', () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point; three of these rows must still
    // total exactly 0.30, because staff reconcile these figures to the paisa.
    const cents = [row({ totalPaid: 0.1 }), row({ totalPaid: 0.1 }), row({ totalPaid: 0.1 })];
    expect(summarizeDashboard(cents, null).totalPaid).toBe(0.3);

    const many = Array.from({ length: 1000 }, () => row({ totalPaid: 1234.56 }));
    expect(summarizeDashboard(many, null).totalPaid).toBe(1_234_560);
  });
});

describe('pnrCountLabel', () => {
  it('says "Active PNRs" when nothing is filtered', () => {
    expect(pnrCountLabel(null)).toBe('Active PNRs');
  });

  it('names the filtered status so the card cannot mislabel its own number', () => {
    expect(pnrCountLabel('completed')).toBe('Completed PNRs');
    expect(pnrCountLabel('cancelled')).toBe('Cancelled PNRs');
    expect(pnrCountLabel('active')).toBe('Active PNRs');
  });
});
