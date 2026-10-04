import { describe, expect, it } from 'vitest';
import { seatTypeOf, summarizeReceivables, RECEIVABLE_PNR_STATUSES, type ReceivableLine } from './agent-receivables';

const line = (over: Partial<ReceivableLine> = {}): ReceivableLine => ({
  seatType: 'umrah',
  seats: 10,
  receivable: 1_000_000,
  recovered: 0,
  balance: 1_000_000,
  credit: 0,
  margin: 0,
  ...over,
});

describe('seatTypeOf — by segment (owner, 2026-10-05)', () => {
  it('Umrah → Umrah, Employment → One way, Tour → Tour', () => {
    expect(seatTypeOf('Umrah')).toBe('umrah');
    expect(seatTypeOf('Employment')).toBe('oneway');
    expect(seatTypeOf('Tour')).toBe('tour');
  });
  it('ignores case and spacing, as the segment list does', () => {
    expect(seatTypeOf(' UMRAH ')).toBe('umrah');
  });
  it('a missing or unknown segment is Other, never guessed into a type', () => {
    expect(seatTypeOf(null)).toBe('other');
    expect(seatTypeOf('Hajj')).toBe('other');
  });
});

describe('RECEIVABLE_PNR_STATUSES', () => {
  it('counts active and completed bookings, not cancelled', () => {
    expect(RECEIVABLE_PNR_STATUSES).toEqual(['active', 'completed']);
  });
});

describe('summarizeReceivables', () => {
  it('splits seats and receivable by type and totals the rest', () => {
    const s = summarizeReceivables([
      line({ seatType: 'umrah', seats: 10, receivable: 1_000_000, recovered: 400_000, balance: 600_000 }),
      line({ seatType: 'oneway', seats: 5, receivable: 250_000, recovered: 0, balance: 250_000 }),
      line({ seatType: 'tour', seats: 2, receivable: 300_000, recovered: 300_000, balance: 0 }),
      line({ seatType: 'umrah', seats: 4, receivable: 400_000, recovered: 0, balance: 400_000 }),
    ]);
    expect(s.seats).toEqual({ umrah: 14, oneway: 5, tour: 2, other: 0 });
    expect(s.receivable).toEqual({ umrah: 1_400_000, oneway: 250_000, tour: 300_000, other: 0 });
    expect(s.totalSeats).toBe(21);
    expect(s.totalReceivable).toBe(1_950_000);
    expect(s.recovered).toBe(700_000);
    expect(s.balance).toBe(1_250_000);
  });

  it('receivable − recovered = balance when nobody has overpaid', () => {
    const s = summarizeReceivables([line({ receivable: 500, recovered: 120, balance: 380 }), line({ receivable: 70, recovered: 0, balance: 70 })]);
    expect(s.totalReceivable - s.recovered).toBe(s.balance);
  });

  it('keeps an overpayment as credit, not netted against another booking', () => {
    const s = summarizeReceivables([
      line({ receivable: 100, recovered: 150, balance: 0, credit: 50 }),
      line({ receivable: 200, recovered: 0, balance: 200 }),
    ]);
    expect(s.balance).toBe(200);
    expect(s.credit).toBe(50);
  });

  it('adds in whole paisa', () => {
    const s = summarizeReceivables([line({ receivable: 0.1, balance: 0.1 }), line({ receivable: 0.2, balance: 0.2 })]);
    expect(s.totalReceivable).toBe(0.3);
    expect(s.balance).toBe(0.3);
  });

  it('an agent with no bookings totals to zero', () => {
    const s = summarizeReceivables([]);
    expect(s.totalReceivable).toBe(0);
    expect(s.totalSeats).toBe(0);
  });
});
