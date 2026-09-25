import { describe, expect, it } from 'vitest';
import {
  addDaysIso,
  buildDeadlineEmail,
  isDueForAlert,
  type DeadlineAlert,
  type TicketingAlert,
} from './deadlines';

describe('addDaysIso', () => {
  it('adds days across month boundaries', () => {
    expect(addDaysIso('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('isDueForAlert', () => {
  const today = '2026-08-23';

  it('alerts today and up to exactly 2 days out (boundaries)', () => {
    expect(isDueForAlert(today, today)).toBe(true);
    expect(isDueForAlert('2026-08-24', today)).toBe(true);
    expect(isDueForAlert('2026-08-25', today)).toBe(true); // exactly +2
  });

  it('never alerts overdue deadlines (owner rule: future only)', () => {
    expect(isDueForAlert('2026-08-22', today)).toBe(false);
    expect(isDueForAlert('2026-08-20', today)).toBe(false);
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

const ticketAlert = (over: Partial<TicketingAlert> = {}): TicketingAlert => ({
  pnrId: 'y',
  pnrCode: 'TKT001',
  investorCompany: 'Test & Co <traders>',
  airlineCode: 'SV',
  branchName: 'Rawalpindi',
  seats: 40,
  kind: 'ticket_issuance',
  deadlineDate: '2026-08-24',
  daysLeft: 1,
  ticketsIssued: 10,
  balanceTickets: 30,
  ...over,
});

describe('buildDeadlineEmail — ticketing deadlines (phase 5 step 1)', () => {
  it('lists ticketing deadlines in their own section of the same email', () => {
    const { subject, html } = buildDeadlineEmail(
      '2026-08-23',
      [alert({})],
      [ticketAlert({}), ticketAlert({ pnrCode: 'TKT002', kind: 'name_update', daysLeft: 0, deadlineDate: '2026-08-23' })]
    );

    // One email, one subject, counting both kinds of deadline.
    expect(subject).toBe('EMD deadline alert — 3 bookings need attention');
    expect(html).toContain('Ticketing deadlines');
    expect(html).toContain('TKT001');
    expect(html).toContain('Ticket issuance');
    expect(html).toContain('TKT002');
    expect(html).toContain('Name update');
    expect(html).toContain('10 issued · 30 balance');
    expect(html).toContain('TODAY');
  });

  it('escapes ticketing company names too', () => {
    const { html } = buildDeadlineEmail('2026-08-23', [], [ticketAlert({})]);
    expect(html).toContain('Test &amp; Co &lt;traders&gt;');
    expect(html).not.toContain('<traders>');
  });

  it('sends a ticketing-only email when no EMD round is due', () => {
    const { subject, html } = buildDeadlineEmail('2026-08-23', [], [ticketAlert({})]);
    expect(subject).toBe('EMD deadline alert — 1 booking needs attention');
    expect(html).toContain('Ticketing deadlines');
    // The EMD table is omitted entirely rather than rendered empty.
    expect(html).not.toContain('EMD amount');
  });

  it('omits the ticketing section entirely when nothing is due there', () => {
    const { html } = buildDeadlineEmail('2026-08-23', [alert({})], []);
    expect(html).not.toContain('Ticketing deadlines');
  });

  it('shows a dash when no ticket counts have been recorded', () => {
    const { html } = buildDeadlineEmail(
      '2026-08-23',
      [],
      [ticketAlert({ ticketsIssued: null, balanceTickets: null })]
    );
    expect(html).toContain('>—</td>');
  });
});

describe('buildDeadlineEmail — IATA payments', () => {
  const iata = [
    {
      pnrId: 'p1',
      pnrCode: 'ABC123',
      investorCompany: 'Eyries Holidays',
      airlineCode: 'SV',
      roundNumber: 1,
      emdNumber: '123 4567890123',
      emdAmount: 937_500,
      periodCode: '20260903W',
      remittanceDay: '2026-09-30',
      daysLeft: 2,
    },
    {
      pnrId: 'p2',
      pnrCode: 'XYZ999',
      investorCompany: 'Ansar e Madinah',
      airlineCode: 'SV',
      roundNumber: 2,
      emdNumber: null,
      emdAmount: 1_035_000,
      periodCode: '20260903W',
      remittanceDay: '2026-09-30',
      daysLeft: 2,
    },
  ];

  it('adds an IATA table with its own heading and total', () => {
    const { html } = buildDeadlineEmail('2026-09-28', [], [], iata);
    expect(html).toContain('IATA payments due');
    expect(html).toContain('ABC123');
    expect(html).toContain('123 4567890123');
    // 937,500 + 1,035,000 — the sum of what leaves the company that day.
    expect(html).toContain('1,972,500');
  });

  it('counts IATA payments in the subject line', () => {
    const { subject } = buildDeadlineEmail('2026-09-28', [], [], iata);
    expect(subject).toContain('2');
  });

  it('says nothing about IATA when nothing is due', () => {
    const { html } = buildDeadlineEmail('2026-09-28', [], [], []);
    expect(html).not.toContain('IATA payments due');
  });

  it('keeps the IATA table separate from the issuance table', () => {
    // Merging them would put an issuance time limit and a remittance day in one
    // column under one heading — the exact confusion the 2026-09-21 correction
    // was about.
    const { html } = buildDeadlineEmail('2026-09-28', [], [], iata);
    const iataAt = html.indexOf('IATA payments due');
    expect(iataAt).toBeGreaterThan(-1);
    expect(html.indexOf('Pay by')).toBeGreaterThan(iataAt);
  });

  it('escapes company names rather than injecting them into the email', () => {
    const { html } = buildDeadlineEmail('2026-09-28', [], [], [
      { ...iata[0], investorCompany: '<script>x</script>' },
    ]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('buildDeadlineEmail — agent money', () => {
  const agents = [
    {
      agentId: 'a1',
      agentName: 'QFC Group',
      contactEmails: ['ops@qfc.example'],
      pnrId: 'p1',
      pnrCode: 'AJK067',
      seats: 10,
      kind: 'emd' as const,
      amount: 150_000,
      dueDate: '2026-09-24',
      daysLeft: 2,
    },
    {
      agentId: 'a2',
      agentName: 'Ansar e Madinah',
      contactEmails: [],
      pnrId: 'p2',
      pnrCode: 'XYZ999',
      seats: 20,
      kind: 'final' as const,
      amount: 850_000,
      dueDate: '2026-09-24',
      daysLeft: 2,
    },
  ];

  it('adds an agent table with its own heading and total', () => {
    const { html } = buildDeadlineEmail('2026-09-22', [], [], [], agents);
    expect(html).toContain('Agent money due');
    expect(html).toContain('QFC Group');
    expect(html).toContain('1,000,000'); // 150,000 + 850,000
  });

  it('says the email sends nothing to agents itself', () => {
    // Phase 7 step 4: sending is a human click. An automated demand for money
    // to an outside party is not a cron job's decision.
    const { html } = buildDeadlineEmail('2026-09-22', [], [], [], agents);
    expect(html).toContain('nothing is sent to an agent automatically');
  });

  it('flags an agent with no address on file rather than hiding them', () => {
    const { html } = buildDeadlineEmail('2026-09-22', [], [], [], agents);
    expect(html).toContain('no email on file');
  });

  it('counts agent dues in the subject line', () => {
    const { subject } = buildDeadlineEmail('2026-09-22', [], [], [], agents);
    expect(subject).toContain('2');
  });

  it('says nothing about agents when none are due', () => {
    const { html } = buildDeadlineEmail('2026-09-22', [], [], [], []);
    expect(html).not.toContain('Agent money due');
  });

  it('escapes agent names rather than injecting them', () => {
    const { html } = buildDeadlineEmail('2026-09-22', [], [], [], [
      { ...agents[0], agentName: '<script>x</script>' },
    ]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
