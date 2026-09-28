import { describe, expect, it } from 'vitest';
import { summarizeDashboard, pnrCountLabel, isDashboardWork } from './dashboard';
import type { PnrListRow } from './pnrs';
import { projectRowToHolder } from './holder-view';
import { COMPANY_HOLDER } from './inventory';

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
    airlineTaxes: null,
    psf: null,
    fare: 0,
    totalEmdValue: 0,
    status: 'active',
    totalIssued: 0,
    totalRefunded: 0,
    emdsComplete: false,
    ticketsBy: null,
    holder: '',
    holderKeys: [],
    agentNames: [],
    holderParts: [],
    agentSeats: 0,
    unassignedSeats: 10,
    ...over,
  } as PnrListRow;
}

describe('summarizeDashboard', () => {
  const rows = [
    row({ id: 'a', status: 'active', branchName: 'Islamabad', airlineCode: 'PA', seats: 10, totalEmdValue: 1000, totalIssued: 400, totalRefunded: 100 }),
    row({ id: 'b', status: 'active', branchName: 'Islamabad', airlineCode: 'SV', seats: 20, totalEmdValue: 2000, totalIssued: 500, totalRefunded: 0 }),
    row({ id: 'c', status: 'completed', branchName: 'Islamabad', airlineCode: 'PA', seats: 30, totalEmdValue: 3000, totalIssued: 600, totalRefunded: 0 }),
    row({ id: 'd', status: 'cancelled', branchName: 'Lahore', airlineCode: 'PA', seats: 40, totalEmdValue: 4000, totalIssued: 700, totalRefunded: 700 }),
  ];

  it('totals every status when no status is chosen', () => {
    // Owner, 2026-09-26: "All statuses" means all of them — it used to mean
    // active only, which made it indistinguishable from the Active filter.
    const s = summarizeDashboard(rows);
    expect(s.pnrCount).toBe(4);
    expect(s.totalSeats).toBe(100);
    expect(s.totalEmdValue).toBe(10000);
    expect(s.totalIssued).toBe(2200);
    expect(s.totalRefunded).toBe(800);
  });

  it('Active and All differ as soon as a non-active booking exists', () => {
    const active = summarizeDashboard(rows.filter((r) => r.status === 'active'));
    expect(active.totalEmdValue).toBe(3000);
    expect(summarizeDashboard(rows).totalEmdValue).not.toBe(active.totalEmdValue);
  });

  // The table applies the status filter itself, so these pass rows already
  // narrowed to that status.
  it('switches wholly to the chosen status', () => {
    const s = summarizeDashboard(rows.filter((r) => r.status === 'completed'));
    expect(s.pnrCount).toBe(1);
    expect(s.totalSeats).toBe(30);
    expect(s.totalEmdValue).toBe(3000);
    expect(s.totalIssued).toBe(600);
  });

  it('reports cancelled bookings when asked for them', () => {
    const s = summarizeDashboard(rows.filter((r) => r.status === 'cancelled'));
    expect(s.pnrCount).toBe(1);
    expect(s.totalRefunded).toBe(700);
  });

  it('combines status with branch and airline, as the table passes them in', () => {
    // The table has already applied status=active, branch=Islamabad and
    // airline=PA; only row "a" matches all three.
    const filtered = rows.filter(
      (r) => r.status === 'active' && r.branchName === 'Islamabad' && r.airlineCode === 'PA'
    );
    const s = summarizeDashboard(filtered);
    expect(s.pnrCount).toBe(1);
    expect(s.totalSeats).toBe(10);
    expect(s.totalIssued).toBe(400);
  });

  it('is all zeroes when a filter combination matches nothing', () => {
    const s = summarizeDashboard([]);
    expect(s).toEqual({ pnrCount: 0, totalSeats: 0, totalEmdValue: 0, totalIssued: 0, totalRefunded: 0 });
  });

  it('treats a missing total EMD value as zero rather than NaN', () => {
    const s = summarizeDashboard([row({ totalEmdValue: null })]);
    expect(s.totalEmdValue).toBe(0);
  });

  it('keeps paid gross — a refunded round is still money that went out', () => {
    // Not 0. Netting the refund off "total paid" would understate what left the
    // account, which is the distinction the dashboard_totals view drew too.
    const s = summarizeDashboard([row({ totalIssued: 500, totalRefunded: 500 })]);
    expect(s.totalIssued).toBe(500);
    expect(s.totalRefunded).toBe(500);
  });

  it('sums decimal amounts without float drift', () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point; three of these rows must still
    // total exactly 0.30, because staff reconcile these figures to the paisa.
    const cents = [row({ totalIssued: 0.1 }), row({ totalIssued: 0.1 }), row({ totalIssued: 0.1 })];
    expect(summarizeDashboard(cents).totalIssued).toBe(0.3);

    const many = Array.from({ length: 1000 }, () => row({ totalIssued: 1234.56 }));
    expect(summarizeDashboard(many).totalIssued).toBe(1_234_560);
  });
});

describe('pnrCountLabel', () => {
  it('says "PNRs Needing Action" when no status is chosen', () => {
    expect(pnrCountLabel(null)).toBe('PNRs Needing Action');
  });

  it('names the filtered status so the card cannot mislabel its own number', () => {
    expect(pnrCountLabel('completed')).toBe('Completed PNRs');
    expect(pnrCountLabel('cancelled')).toBe('Cancelled PNRs');
    expect(pnrCountLabel('active')).toBe('Active PNRs');
  });
});

describe('summarizeDashboard over one holder’s share', () => {
  // The cards total whatever rows they are given, and with a holder selected
  // those rows are already projected to that holder's share
  // (`lib/holder-view.ts`). This is the case the owner reported: filtering to
  // an agent holding 30 of 99 seats used to total 99.
  const shared = row({
    id: 'shared',
    seats: 99,
    fare: 115_000,
    totalEmdValue: 99 * 115_000,
    totalIssued: 4_500_000,
    holderParts: [
      { name: 'Ansar e Madinah', seats: 30 },
      { name: 'Eyries Holidays', seats: 30 },
    ],
    agentSeats: 60,
    unassignedSeats: 39,
    holderKeys: ['Ansar e Madinah', 'Eyries Holidays', COMPANY_HOLDER],
  });

  it('counts the agent’s seats, not the booking’s', () => {
    const projected = [projectRowToHolder(shared, 'Ansar e Madinah')];
    const summary = summarizeDashboard(projected);
    expect(summary.pnrCount).toBe(1);
    expect(summary.totalSeats).toBe(30);
    expect(summary.totalEmdValue).toBe(30 * 115_000);
  });

  it('totals every holder back to the booking itself', () => {
    const holders = ['Ansar e Madinah', 'Eyries Holidays', COMPANY_HOLDER];
    const seats = holders.reduce(
      (sum, h) => sum + summarizeDashboard([projectRowToHolder(shared, h)]).totalSeats,
      0
    );
    const paid = holders.reduce(
      (sum, h) => sum + summarizeDashboard([projectRowToHolder(shared, h)]).totalIssued,
      0
    );
    expect(seats).toBe(99);
    expect(Math.round(paid * 100) / 100).toBe(4_500_000);
  });
});

describe('isDashboardWork — what the dashboard lists', () => {
  const r = (over: Partial<Parameters<typeof isDashboardWork>[0]>) => ({
    status: 'active',
    emdsComplete: false,
    nextIataPayment: null,
    iataUndated: false,
    ...over,
  });
  it('an EMD still to issue', () => expect(isDashboardWork(r({}))).toBe(true));
  it('every EMD issued, but an IATA payment not recorded', () =>
    expect(isDashboardWork(r({ emdsComplete: true, nextIataPayment: '2026-10-07' }))).toBe(true));
  it('owed to IATA outside the loaded calendar still counts', () =>
    expect(isDashboardWork(r({ emdsComplete: true, iataUndated: true }))).toBe(true));
  it('every EMD issued and paid: left for the Refunds page', () =>
    expect(isDashboardWork(r({ emdsComplete: true }))).toBe(false));
  it('cancelled and completed bookings are not dashboard work', () => {
    expect(isDashboardWork(r({ status: 'cancelled' }))).toBe(false);
    expect(isDashboardWork(r({ status: 'completed' }))).toBe(false);
  });
});
