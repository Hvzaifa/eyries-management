import { describe, expect, it } from 'vitest';
import { seatTypeOf, summarizeReceivables, unbookedRemaining, RECEIVABLE_PNR_STATUSES, type ReceivableLine } from './agent-receivables';

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
  it('Umrah → Umrah, One Way → One way, Tour → Tour', () => {
    expect(seatTypeOf('Umrah')).toBe('umrah');
    expect(seatTypeOf('One Way')).toBe('oneway');
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
  it('counts active, completed and — since Phase 9 Step 5 — cancelled bookings; never released', () => {
    expect(RECEIVABLE_PNR_STATUSES).toEqual(['active', 'completed', 'cancelled']);
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

describe('unbookedRemaining — owed on bookings not yet in the system (owner, 2026-10-29)', () => {
  // QFC (Rawalpindi): the sheet says 53,051,518.70 is owed, the system's
  // bookings come to 5,774,000 and are recorded as fully recovered; the excess
  // 47,277,518.70 is stored against that receivable.
  const qfc = { unbookedBalance: 47_277_518.7, baseline: 5_774_000 };

  it('shows the whole excess while nothing has been added', () => {
    expect(unbookedRemaining({ ...qfc, receivableNow: 5_774_000 })).toBe(47_277_518.7);
  });

  it('a missing booking of 10,000,000 comes out of it, so the balance stays 47,277,518.70', () => {
    const left = unbookedRemaining({ ...qfc, receivableNow: 15_774_000 });
    expect(left).toBe(37_277_518.7);
    // That booking's own 10,000,000 balance + what is left = the same total.
    expect(Math.round((left + 10_000_000) * 100) / 100).toBe(47_277_518.7);
  });

  it('once used up, it is zero and new bookings add to the balance as normal', () => {
    expect(unbookedRemaining({ ...qfc, receivableNow: 60_000_000 })).toBe(0);
  });

  it('a fall in the receivable (a booking cancelled) never raises it above what was stored', () => {
    expect(unbookedRemaining({ ...qfc, receivableNow: 1_000_000 })).toBe(47_277_518.7);
  });

  it('an agent with no bookings: the sheet balance is the excess, from a receivable of 0', () => {
    expect(unbookedRemaining({ unbookedBalance: 199_878, baseline: 0, receivableNow: 0 })).toBe(199_878);
  });

  it('nothing stored, nothing shown', () => {
    expect(unbookedRemaining({ unbookedBalance: null, baseline: null, receivableNow: 5_000_000 })).toBe(0);
  });

  it('summarizeReceivables puts it in the balance and shows it separately', () => {
    const s = summarizeReceivables([], 199_878);
    expect(s.balance).toBe(199_878);
    expect(s.notInSystem).toBe(199_878);
  });
});
