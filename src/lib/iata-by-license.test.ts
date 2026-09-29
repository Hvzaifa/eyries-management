import { describe, expect, it } from 'vitest';
import {
  dueForLicense,
  licenseOfRound,
  licenseTabs,
  NO_LICENSE,
  summarizeDues,
  type IataDueRound,
} from './iata-by-license';

const TODAY = '2026-09-29';
const TRV = { id: 'l-trv', name: 'TRV ADV' };
const T2F = { id: 'l-t2f', name: 'TIME 2 FLY' };
const SIX = { id: 'l-six', name: 'SIX SIGMA' };

function due(over: Partial<IataDueRound> = {}): IataDueRound {
  return {
    roundId: 'r1',
    pnrId: 'p1',
    pnrCode: 'ABC123',
    srNo: 1,
    roundNumber: 1,
    emdNumber: null,
    emdAmount: 100,
    issuanceDate: '2026-09-20',
    airlineCode: 'SV',
    branchName: null,
    licenseId: TRV.id,
    licenseName: TRV.name,
    seats: 10,
    outboundDate: null,
    periodCode: '2026-09-3',
    deadline: '2026-10-08',
    rollBy: null,
    lateRefund: null,
    ...over,
  };
}

describe('licenseOfRound — the round’s own license, else the booking’s', () => {
  it('prefers the license that paid for the round', () => {
    expect(licenseOfRound(SIX, TRV)).toBe(SIX);
  });
  it('falls back to the booking’s when the round has none (every imported round)', () => {
    expect(licenseOfRound(null, TRV)).toBe(TRV);
  });
  it('is none only when neither has one', () => {
    expect(licenseOfRound(null, null)).toBeNull();
  });
});

describe('licenseTabs', () => {
  it('lists every license in name order, including those owing nothing', () => {
    const tabs = licenseTabs([TRV, T2F, SIX], [due(), due({ roundId: 'r2', emdAmount: 50.25 })]);
    expect(tabs.map((t) => [t.name, t.count, t.total])).toEqual([
      ['SIX SIGMA', 0, 0],
      ['TIME 2 FLY', 0, 0],
      ['TRV ADV', 2, 150.25],
    ]);
  });

  it('adds "No license" only when an owed EMD has none', () => {
    expect(licenseTabs([TRV], [due()]).map((t) => t.key)).toEqual([TRV.id]);
    const tabs = licenseTabs([TRV], [due(), due({ roundId: 'r2', licenseId: null, licenseName: null })]);
    expect(tabs.map((t) => t.key)).toEqual([TRV.id, NO_LICENSE]);
  });

  it('the buttons’ counts add up to the whole — nothing owed drops out', () => {
    const all = [due(), due({ roundId: 'r2', licenseId: T2F.id }), due({ roundId: 'r3', licenseId: null })];
    const tabs = licenseTabs([TRV, T2F, SIX], all);
    expect(tabs.reduce((n, t) => n + t.count, 0)).toBe(all.length);
  });
});

describe('dueForLicense', () => {
  const all = [
    due({ roundId: 'a', licenseId: TRV.id }),
    due({ roundId: 'b', licenseId: T2F.id }),
    due({ roundId: 'c', licenseId: null }),
  ];
  it('null is every license', () => {
    expect(dueForLicense(all, null)).toHaveLength(3);
  });
  it('one license', () => {
    expect(dueForLicense(all, T2F.id).map((d) => d.roundId)).toEqual(['b']);
  });
  it('"No license" is the rounds with none', () => {
    expect(dueForLicense(all, NO_LICENSE).map((d) => d.roundId)).toEqual(['c']);
  });
  it('a license owing nothing is empty', () => {
    expect(dueForLicense(all, SIX.id)).toEqual([]);
  });
});

describe('summarizeDues — the cards for one license', () => {
  const all = [
    due({ roundId: 'a', emdAmount: 0.1, deadline: '2026-10-08' }),
    due({ roundId: 'b', emdAmount: 0.2, deadline: '2026-10-15', lateRefund: 'after-billing' }),
    due({ roundId: 'c', emdAmount: 1_000, licenseId: T2F.id, deadline: '2026-10-08' }),
    due({ roundId: 'd', emdAmount: 5, deadline: null, periodCode: null }),
  ];

  it('totals only the chosen license, in whole paisa', () => {
    const s = summarizeDues(dueForLicense(all, TRV.id), TODAY);
    expect(s.totalOwed).toBe(5.3);
    expect(s.count).toBe(3);
  });

  it('groups by remittance day and narrows both warning lists', () => {
    const s = summarizeDues(dueForLicense(all, TRV.id), TODAY);
    expect(s.groups.map((g) => [g.remittanceDay, g.total])).toEqual([
      ['2026-10-08', 0.1],
      ['2026-10-15', 0.2],
    ]);
    expect(s.lateRefunds.map((d) => d.roundId)).toEqual(['b']);
    expect(s.undated.map((d) => d.roundId)).toEqual(['d']);
    expect(summarizeDues(dueForLicense(all, T2F.id), TODAY).lateRefunds).toEqual([]);
  });

  it('the licenses’ totals add up to the all-licenses total', () => {
    const whole = summarizeDues(all, TODAY).totalOwed;
    const parts = [TRV.id, T2F.id].map((k) => summarizeDues(dueForLicense(all, k), TODAY).totalOwed);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(whole);
  });
});
