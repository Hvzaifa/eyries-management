import { describe, expect, it } from 'vitest';
import { diffInDays, getUrgency, todayIsoInPkt } from './urgency';

describe('diffInDays', () => {
  it('returns 0 for the same date', () => {
    expect(diffInDays('2026-08-23', '2026-08-23')).toBe(0);
  });

  it('counts simple forward differences', () => {
    expect(diffInDays('2026-08-23', '2026-08-24')).toBe(1);
    expect(diffInDays('2026-08-23', '2026-09-02')).toBe(10);
  });

  it('handles month and year rollovers', () => {
    expect(diffInDays('2026-08-31', '2026-09-01')).toBe(1);
    expect(diffInDays('2026-12-31', '2027-01-01')).toBe(1);
    expect(diffInDays('2028-02-28', '2028-03-01')).toBe(2); // leap year
  });

  it('returns negative for overdue deadlines', () => {
    expect(diffInDays('2026-08-23', '2026-08-22')).toBe(-1);
    expect(diffInDays('2026-08-23', '2026-08-20')).toBe(-3);
  });
});

describe('todayIsoInPkt', () => {
  it('formats as YYYY-MM-DD in Asia/Karachi', () => {
    // 18:00 UTC = 23:00 PKT — same calendar day
    expect(todayIsoInPkt(new Date('2026-08-23T18:00:00Z'))).toBe('2026-08-23');
  });

  it('rolls to the next PKT day before 19:00 UTC', () => {
    // 20:30 UTC = 01:30 PKT next day
    expect(todayIsoInPkt(new Date('2026-08-23T20:30:00Z'))).toBe('2026-08-24');
  });
});

describe('getUrgency', () => {
  const today = '2026-08-23';

  it('is grey for any non-active PNR status, even with an overdue deadline', () => {
    expect(getUrgency(today, '2026-08-20', 'cancelled')).toBe('grey');
    expect(getUrgency(today, '2026-08-24', 'completed')).toBe('grey');
  });

  it('is red at exactly 2 days out (boundary)', () => {
    expect(getUrgency(today, '2026-08-25', 'active')).toBe('red');
  });

  it('is red today and for overdue pending deadlines', () => {
    expect(getUrgency(today, '2026-08-23', 'active')).toBe('red');
    expect(getUrgency(today, '2026-08-22', 'active')).toBe('red');
  });

  it('is amber between 3 and exactly 5 days out (boundaries)', () => {
    expect(getUrgency(today, '2026-08-26', 'active')).toBe('amber');
    expect(getUrgency(today, '2026-08-28', 'active')).toBe('amber');
  });

  it('is green from exactly 6 days onward (boundary) and far future', () => {
    expect(getUrgency(today, '2026-08-29', 'active')).toBe('green');
    expect(getUrgency(today, '2026-12-31', 'active')).toBe('green');
  });

  it('is green when there is no pending deadline at all', () => {
    expect(getUrgency(today, null, 'active')).toBe('green');
  });
});
