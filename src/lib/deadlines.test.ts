import { describe, expect, it } from 'vitest';
import { addDaysIso, buildDeadlineEmail, isDueForAlert, type DeadlineAlert } from './deadlines';

describe('addDaysIso', () => {
  it('adds days across month boundaries', () => {
    expect(addDaysIso('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('isDueForAlert', () => {
  const today = '2026-08-23';

  it('alerts for overdue, today, and up to exactly 2 days out (boundaries)', () => {
    expect(isDueForAlert('2026-08-20', today)).toBe(true); // overdue
    expect(isDueForAlert(today, today)).toBe(true);
    expect(isDueForAlert('2026-08-24', today)).toBe(true);
    expect(isDueForAlert('2026-08-25', today)).toBe(true); // exactly +2
  });

  it('does not alert beyond the 2-day horizon or for missing deadlines', () => {
    expect(isDueForAlert('2026-08-26', today)).toBe(false);
    expect(isDueForAlert('2026-12-01', today)).toBe(false);
    expect(isDueForAlert(null, today)).toBe(false);
  });
});

const alert = (over: Partial<DeadlineAlert>): DeadlineAlert => ({
  pnrId: 'x',
  pnrCode: 'ABC123',
  investorCompany: 'Test & Co <traders>',
  airlineCode: 'SV',
  branchName: 'Islamabad',
  seats: 40,
  roundNumber: 1,
  paymentPct: 15,
  emdAmount: 500000,
  deadlineDate: '2026-08-24',
  daysLeft: 1,
  overdue: false,
  ...over,
});

describe('buildDeadlineEmail', () => {
  it('lists every alert round with amount and deadline', () => {
    const { subject, html } = buildDeadlineEmail('2026-08-23', [
      alert({}),
      alert({ pnrCode: 'XYZ789', overdue: true, daysLeft: -2, deadlineDate: '2026-08-21' }),
    ]);
    expect(subject).toContain('2 bookings');
    expect(html).toContain('ABC123');
    expect(html).toContain('XYZ789');
    expect(html).toContain('PKR 500,000.00');
    expect(html).toContain('OVERDUE 2d');
    expect(html).toContain('in 1d');
  });

  it('escapes company names so HTML cannot be injected', () => {
    const { html } = buildDeadlineEmail('2026-08-23', [alert({})]);
    expect(html).toContain('Test &amp; Co &lt;traders&gt;');
  });

  it('uses singular subject for a single alert', () => {
    const { subject } = buildDeadlineEmail('2026-08-23', [alert({})]);
    expect(subject).toBe('EMD deadline alert — 1 booking needs attention');
  });
});
