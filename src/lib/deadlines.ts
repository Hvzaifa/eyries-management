import { prisma } from './prisma';
import { emd2DaysBeforeDeparture, clampEmd2Deadline } from './emd';
import { formatPkr } from './format';
import { iataPaymentState, isIataPaymentDueForAlert } from './iata-payments';
import { duesForAssignment } from './agent-dues';
import { isAgentNoticeDue } from './agent-notices';
import { diffInDays } from './urgency';

/**
 * Step 7 — daily deadline alert.
 * Read-only: finds issued EMD rounds on ACTIVE PNRs whose deadline falls
 * between today and 2 days out, and produces one summary email for staff.
 *
 * Those deadlines are **issuance** time limits (owner correction, 2026-09-21):
 * by that date the next EMD must be issued, or the tickets, or the PNR is no
 * longer secured. The email says so, because "deadline" alone does not tell a
 * staff member which action is being asked for.
 *
 * Phase 5 Step 1 extended it rather than adding a second job: the same run also
 * reports `ticketing` name-update and ticket-issuance deadlines in the same
 * window, in their own table inside the same email.
 *
 * Overdue rounds are deliberately EXCLUDED (owner rule, docs/decisions.md
 * 2026-08-25 "Deadline alerts: future dates only") — they stay visible on the
 * dashboard but are never emailed. This docstring previously said overdue rounds
 * were included, which had not been true since that ruling.
 *
 * Rounds without a deadline are never alerted — they light up again the moment
 * a time limit is recorded.
 */

export function addDaysIso(todayIso: string, days: number): string {
  const [y, m, d] = todayIso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

/** Alert window: future only — today through exactly 2 days out. Overdue deadlines are excluded (owner rule). */
export function isDueForAlert(deadlineIso: string | null, todayIso: string): boolean {
  if (!deadlineIso) return false;
  return deadlineIso >= todayIso && deadlineIso <= addDaysIso(todayIso, 2);
}

export interface DeadlineAlert {
  pnrId: string;
  pnrCode: string;
  investorCompany: string;
  airlineCode: string | null;
  branchName: string | null;
  seats: number;
  roundNumber: number;
  paymentPct: number;
  emdAmount: number;
  deadlineDate: string;
  daysLeft: number;
  overdue: boolean;
}

export async function findDueRounds(todayIso: string): Promise<DeadlineAlert[]> {
  const horizon = addDaysIso(todayIso, 2);
  const rounds = await prisma.emdRound.findMany({
    where: {
      status: 'issued',
      deadlineDate: { not: null, gte: new Date(`${todayIso}T00:00:00.000Z`), lte: new Date(`${horizon}T00:00:00.000Z`) },
      pnr: { status: 'active' },
    },
    orderBy: { deadlineDate: 'asc' },
    include: {
      pnr: { include: { airline: true, branch: true } },
    },
  });

  return rounds.map((r) => {
    const deadlineDate = r.deadlineDate!.toISOString().slice(0, 10);
    return {
      pnrId: r.pnr.id,
      pnrCode: r.pnr.pnr,
      investorCompany: r.pnr.investorCompany,
      airlineCode: r.pnr.airline?.code ?? null,
      branchName: r.pnr.branch?.name ?? null,
      seats: r.pnr.seats,
      roundNumber: r.roundNumber,
      paymentPct: Number(r.paymentPct),
      emdAmount: Number(r.emdAmount),
      deadlineDate,
      daysLeft: Math.round(
        (Date.UTC(...(deadlineDate.split('-').map(Number) as [number, number, number])) -
          Date.UTC(...(todayIso.split('-').map(Number) as [number, number, number]))) /
          86_400_000
      ),
      overdue: deadlineDate < todayIso,
    };
  });
}

/**
 * A ticketing-stage deadline due inside the alert window (Phase 5 Step 1).
 *
 * `ticketing` holds two dates and either can fall due, so one row can produce
 * two alerts — hence `kind`.
 */
export interface TicketingAlert {
  pnrId: string;
  pnrCode: string;
  investorCompany: string;
  airlineCode: string | null;
  branchName: string | null;
  seats: number;
  kind: 'name_update' | 'ticket_issuance';
  deadlineDate: string;
  daysLeft: number;
  ticketsIssued: number | null;
  balanceTickets: number | null;
}

export const TICKETING_ALERT_LABELS: Record<TicketingAlert['kind'], string> = {
  name_update: 'Name update',
  ticket_issuance: 'Ticket issuance',
};

/**
 * Ticketing deadlines due between today and 2 days out, on ACTIVE bookings.
 *
 * Phase 5 Step 1 says to extend the existing daily job rather than build a
 * second one, so this is queried alongside `findDueRounds` and rendered into the
 * same email. It follows exactly the same rules as the EMD alert: future only
 * (overdue deadlines stay visible on the booking but are never emailed — owner
 * rule, docs/decisions.md 2026-08-25), never a PNR that is cancelled or
 * completed, and never a deadline that has not been recorded.
 */
export async function findDueTicketingDeadlines(todayIso: string): Promise<TicketingAlert[]> {
  const horizon = addDaysIso(todayIso, 2);
  const from = new Date(`${todayIso}T00:00:00.000Z`);
  const to = new Date(`${horizon}T00:00:00.000Z`);
  const window = { not: null, gte: from, lte: to };

  const rows = await prisma.ticketing.findMany({
    where: {
      pnr: { status: 'active' },
      OR: [{ nameUpdateDeadline: window }, { ticketIssuanceDeadline: window }],
    },
    include: { pnr: { include: { airline: true, branch: true } } },
  });

  const alerts: TicketingAlert[] = [];
  for (const row of rows) {
    for (const [kind, date] of [
      ['name_update', row.nameUpdateDeadline],
      ['ticket_issuance', row.ticketIssuanceDeadline],
    ] as const) {
      if (!date) continue;
      const deadlineDate = date.toISOString().slice(0, 10);
      // The OR above matches the ROW, so the other date on a matched row can sit
      // outside the window — each date is re-checked on its own.
      if (!isDueForAlert(deadlineDate, todayIso)) continue;

      alerts.push({
        pnrId: row.pnr.id,
        pnrCode: row.pnr.pnr,
        investorCompany: row.pnr.investorCompany,
        airlineCode: row.pnr.airline?.code ?? null,
        branchName: row.pnr.branch?.name ?? null,
        seats: row.pnr.seats,
        kind,
        deadlineDate,
        daysLeft: Math.round(
          (Date.UTC(...(deadlineDate.split('-').map(Number) as [number, number, number])) -
            Date.UTC(...(todayIso.split('-').map(Number) as [number, number, number]))) /
            86_400_000
        ),
        ticketsIssued: row.ticketsIssued,
        balanceTickets: row.balanceTickets,
      });
    }
  }

  return alerts.sort((a, b) => a.deadlineDate.localeCompare(b.deadlineDate));
}

export interface IataPaymentAlert {
  pnrId: string;
  pnrCode: string;
  investorCompany: string;
  airlineCode: string | null;
  roundNumber: number;
  emdNumber: string | null;
  emdAmount: number;
  periodCode: string | null;
  remittanceDay: string;
  daysLeft: number;
}

/**
 * IATA payments falling due within the same 2-day window as everything else in
 * this email.
 *
 * A round is owed when it has no recorded payment AND its refund, if any, came
 * too late to cancel the billing — only a refund on or before the billing-to
 * date of the issuing period does that (owner, 2026-09-22). So this is not
 * filtered to `status = 'issued'`; `iataPaymentState` decides per round.
 *
 * Overdue payments are excluded, like every other alert here — they stay on the
 * dashboard and the IATA page, but the daily email never nags (owner rule,
 * 2026-08-25).
 */
export async function findDueIataPayments(todayIso: string): Promise<IataPaymentAlert[]> {
  const rounds = await prisma.emdRound.findMany({
    where: { paymentDate: null, pnr: { status: 'active' } },
    select: {
      roundNumber: true,
      emdNumber: true,
      emdAmount: true,
      issuanceDate: true,
      refundDate: true,
      status: true,
      pnr: {
        select: {
          id: true,
          pnr: true,
          investorCompany: true,
          airline: { select: { code: true } },
        },
      },
    },
  });

  const alerts: IataPaymentAlert[] = [];
  for (const r of rounds) {
    const issuanceDate = r.issuanceDate.toISOString().slice(0, 10);
    const state = iataPaymentState({
      issuanceDate,
      paymentDate: null,
      refundDate: r.refundDate ? r.refundDate.toISOString().slice(0, 10) : null,
      roundStatus: r.status,
      todayIso,
    });
    if (!isIataPaymentDueForAlert(state, todayIso)) continue;
    alerts.push({
      pnrId: r.pnr.id,
      pnrCode: r.pnr.pnr,
      investorCompany: r.pnr.investorCompany,
      airlineCode: r.pnr.airline?.code ?? null,
      roundNumber: r.roundNumber,
      emdNumber: r.emdNumber,
      emdAmount: Number(r.emdAmount),
      periodCode: state.period?.code ?? null,
      remittanceDay: state.deadline!,
      daysLeft: state.daysLeft!,
    });
  }

  return alerts.sort((a, b) => a.remittanceDay.localeCompare(b.remittanceDay));
}

export interface AgentDueAlert {
  agentId: string;
  agentName: string;
  contactEmails: string[];
  pnrId: string;
  pnrCode: string;
  seats: number;
  kind: 'emd' | 'final';
  amount: number;
  dueDate: string;
  daysLeft: number;
}

/**
 * Agent money falling due within the same 2-day window as everything else in
 * this email (phase 7 step 4).
 *
 * Every figure is recomputed here from the same pure functions the agent page
 * uses — nothing about what an agent owes is stored, so an email cannot quote a
 * figure the screen disagrees with.
 *
 * Released assignments and non-active bookings are out of scope: seats handed
 * back are not owed for, and a cancelled booking is not a bill.
 */
export async function findDueAgentNotices(todayIso: string): Promise<AgentDueAlert[]> {
  const assignments = await prisma.agentAssignment.findMany({
    where: { releasedAt: null, pnr: { status: 'active' } },
    include: {
      agent: { select: { id: true, name: true, contactEmails: true, active: true } },
      recoveries: { select: { amount: true } },
      pnr: {
        select: {
          id: true,
          pnr: true,
          seats: true,
          fare: true,
          airlineTaxes: true,
          emdRounds: { select: { roundNumber: true, status: true, emdAmount: true, deadlineDate: true } },
          ticketing: { select: { ticketIssuanceDeadline: true } },
        },
      },
    },
  });

  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  const alerts: AgentDueAlert[] = [];

  for (const a of assignments) {
    // An inactive agent is a record kept for history, not someone to chase.
    if (!a.agent.active) continue;

    const { dues } = duesForAssignment({
      agentSeats: a.seats,
      pnrSeats: a.pnr.seats,
      fare: Number(a.pnr.fare),
      airlineTaxes: a.pnr.airlineTaxes === null ? null : Number(a.pnr.airlineTaxes),
      chargeType: a.chargeType,
      chargeValue: a.chargeValue === null ? null : Number(a.chargeValue),
      discountType: a.discountType,
      discountValue: a.discountValue === null ? null : Number(a.discountValue),
      chargeTax: a.chargeTax,
      recoveries: a.recoveries.map((r) => Number(r.amount)),
      rounds: a.pnr.emdRounds.map((r) => ({
        roundNumber: r.roundNumber,
        status: r.status,
        emdAmount: Number(r.emdAmount),
        deadlineDate: iso(r.deadlineDate),
      })),
      ticketIssuanceDeadline: iso(a.pnr.ticketing?.ticketIssuanceDeadline ?? null),
    });

    if (!isAgentNoticeDue(dues.next, todayIso)) continue;
    const next = dues.next!;

    alerts.push({
      agentId: a.agent.id,
      agentName: a.agent.name,
      contactEmails: a.agent.contactEmails,
      pnrId: a.pnr.id,
      pnrCode: a.pnr.pnr,
      seats: a.seats,
      kind: next.kind,
      amount: next.amount,
      dueDate: next.date!,
      daysLeft: diffInDays(todayIso, next.date!),
    });
  }

  return alerts.sort(
    (x, y) => x.dueDate.localeCompare(y.dueDate) || x.agentName.localeCompare(y.agentName)
  );
}

export function buildDeadlineEmail(
  todayIso: string,
  alerts: DeadlineAlert[],
  ticketingAlerts: TicketingAlert[] = [],
  iataAlerts: IataPaymentAlert[] = [],
  agentAlerts: AgentDueAlert[] = []
): { subject: string; html: string } {
  const overdueCount = alerts.filter((a) => a.overdue).length;
  const total =
    alerts.length + ticketingAlerts.length + iataAlerts.length + agentAlerts.length;
  const subject =
    total === 1
      ? `EMD deadline alert — 1 booking needs attention`
      : `EMD deadline alert — ${total} bookings need attention`;

  const rows = alerts
    .map((a) => {
      const when = a.overdue
        ? `<span style="color:#b91c1c;font-weight:700">OVERDUE ${Math.abs(a.daysLeft)}d</span>`
        : a.daysLeft === 0
          ? '<span style="color:#b91c1c;font-weight:700">TODAY</span>'
          : `<span style="color:#b45309;font-weight:600">in ${a.daysLeft}d</span>`;
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e7e5e4;font-family:monospace">${escapeHtml(a.pnrCode)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e7e5e4">${escapeHtml(a.airlineCode ?? '—')} · ${escapeHtml(a.investorCompany)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e7e5e4;text-align:right">${a.seats}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e7e5e4;text-align:center">${a.roundNumber} (${a.paymentPct}%)</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e7e5e4;text-align:right;white-space:nowrap">${formatPkr(a.emdAmount)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e7e5e4;white-space:nowrap">${a.deadlineDate} ${when}</td>
      </tr>`;
    })
    .join('');

  const overdueNote =
    overdueCount > 0
      ? `<p style="color:#b91c1c;margin:0 0 12px"><strong>${overdueCount}</strong> of these are already past their deadline — confirm with the airline.</p>`
      : '';

  const emdSection =
    alerts.length === 0
      ? ''
      : `<p style="color:#78716c;margin:0 0 16px;font-size:13px">EMD time limits falling within 2 days as of ${todayIso}. By each date the <strong>next EMD must be issued</strong> — or the tickets issued, which ends the cycle.</p>
    ${overdueNote}
    <table style="border-collapse:collapse;width:100%;font-size:13px;color:#292524">
      <thead>
        <tr style="background:#faf7f1;text-align:left">
          <th style="padding:8px 10px">PNR</th>
          <th style="padding:8px 10px">Airline / Company</th>
          <th style="padding:8px 10px;text-align:right">Seats</th>
          <th style="padding:8px 10px;text-align:center">Round</th>
          <th style="padding:8px 10px;text-align:right">EMD amount</th>
          <th style="padding:8px 10px">Deadline</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  // Ticketing deadlines ride in the same email rather than a second job
  // (phase-5 Step 1), as their own table: the columns are different, and merging
  // them into the EMD table would mean an "EMD amount" column with nothing in it.
  const ticketingRows = ticketingAlerts
    .map((t) => {
      const when =
        t.daysLeft === 0
          ? '<span style="color:#b91c1c;font-weight:700">TODAY</span>'
          : `<span style="color:#b45309;font-weight:600">in ${t.daysLeft}d</span>`;
      const issued =
        t.ticketsIssued === null && t.balanceTickets === null
          ? '—'
          : `${t.ticketsIssued ?? '—'} issued · ${t.balanceTickets ?? '—'} balance`;
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e7e5e4;font-family:monospace">${escapeHtml(t.pnrCode)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e7e5e4">${escapeHtml(t.airlineCode ?? '—')} · ${escapeHtml(t.investorCompany)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e7e5e4;text-align:right">${t.seats}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e7e5e4">${TICKETING_ALERT_LABELS[t.kind]}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e7e5e4">${escapeHtml(issued)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e7e5e4;white-space:nowrap">${t.deadlineDate} ${when}</td>
      </tr>`;
    })
    .join('');

  const ticketingSection =
    ticketingAlerts.length === 0
      ? ''
      : `<h3 style="color:#1c1917;margin:24px 0 4px;font-size:15px">Ticketing deadlines</h3>
    <p style="color:#78716c;margin:0 0 12px;font-size:13px">Name-update and ticket-issuance deadlines due within 2 days.</p>
    <table style="border-collapse:collapse;width:100%;font-size:13px;color:#292524">
      <thead>
        <tr style="background:#faf7f1;text-align:left">
          <th style="padding:8px 10px">PNR</th>
          <th style="padding:8px 10px">Airline / Company</th>
          <th style="padding:8px 10px;text-align:right">Seats</th>
          <th style="padding:8px 10px">Deadline type</th>
          <th style="padding:8px 10px">Tickets</th>
          <th style="padding:8px 10px">Deadline</th>
        </tr>
      </thead>
      <tbody>${ticketingRows}</tbody>
    </table>`;

  // IATA payments ride in the same email as their own table, for the same
  // reason as ticketing: different columns, and merging them would put an
  // issuance deadline and a remittance day in one column under one heading —
  // which is exactly the confusion the 2026-09-21 correction was about.
  const iataRows = iataAlerts
    .map((a) => {
      const when =
        a.daysLeft === 0
          ? '<span style="color:#b91c1c;font-weight:700">TODAY</span>'
          : `<span style="color:#b45309;font-weight:600">in ${a.daysLeft}d</span>`;
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e7e5e4;font-family:monospace">${escapeHtml(a.pnrCode)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e7e5e4">${escapeHtml(a.airlineCode ?? '—')} · ${escapeHtml(a.investorCompany)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e7e5e4;text-align:center">${a.roundNumber}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e7e5e4;font-family:monospace">${escapeHtml(a.emdNumber ?? '—')}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e7e5e4;text-align:right;white-space:nowrap">${formatPkr(a.emdAmount)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e7e5e4;white-space:nowrap">${a.remittanceDay} ${when}</td>
      </tr>`;
    })
    .join('');

  const iataTotal = iataAlerts.reduce((sum, a) => sum + Math.round(a.emdAmount * 100), 0) / 100;

  const iataSection =
    iataAlerts.length === 0
      ? ''
      : `<h3 style="color:#1c1917;margin:24px 0 4px;font-size:15px">IATA payments due</h3>
    <p style="color:#78716c;margin:0 0 12px;font-size:13px">EMDs whose <strong>IATA remittance day</strong> falls within 2 days — money leaving the company, not an issuance time limit. Total <strong>${formatPkr(iataTotal)}</strong>.</p>
    <table style="border-collapse:collapse;width:100%;font-size:13px;color:#292524">
      <thead>
        <tr style="background:#faf7f1;text-align:left">
          <th style="padding:8px 10px">PNR</th>
          <th style="padding:8px 10px">Airline / Company</th>
          <th style="padding:8px 10px;text-align:center">Round</th>
          <th style="padding:8px 10px">EMD number</th>
          <th style="padding:8px 10px;text-align:right">Amount</th>
          <th style="padding:8px 10px">Pay by</th>
        </tr>
      </thead>
      <tbody>${iataRows}</tbody>
    </table>`;

  // Agent money, as its own table for the same reason as the two above: these
  // are amounts owed TO the company by someone outside it, not deadlines the
  // company must meet. Each row links to the agent, because sending the notice
  // is a human click on that page — the daily email never sends anything to an
  // agent itself (phase 7 step 4).
  const agentRows = agentAlerts
    .map((a) => {
      const when =
        a.daysLeft === 0
          ? '<span style="color:#b91c1c;font-weight:700">TODAY</span>'
          : `<span style="color:#b45309;font-weight:600">in ${a.daysLeft}d</span>`;
      const reachable =
        a.contactEmails.length > 0
          ? escapeHtml(a.contactEmails[0])
          : '<span style="color:#b45309">no email on file</span>';
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e7e5e4"><a href="{{APP_URL}}/agents/${escapeHtml(a.agentId)}" style="color:#4f46e5;font-weight:600">${escapeHtml(a.agentName)}</a></td>
        <td style="padding:8px 10px;border-bottom:1px solid #e7e5e4;font-family:monospace">${escapeHtml(a.pnrCode)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e7e5e4;text-align:right">${a.seats}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e7e5e4">${a.kind === 'emd' ? 'EMD share' : 'Balance'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e7e5e4;text-align:right;white-space:nowrap">${formatPkr(a.amount)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e7e5e4;white-space:nowrap">${a.dueDate} ${when}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e7e5e4;font-size:12px">${reachable}</td>
      </tr>`;
    })
    .join('');

  const agentTotal = agentAlerts.reduce((sum, a) => sum + Math.round(a.amount * 100), 0) / 100;

  const agentSection =
    agentAlerts.length === 0
      ? ''
      : `<h3 style="color:#1c1917;margin:24px 0 4px;font-size:15px">Agent money due</h3>
    <p style="color:#78716c;margin:0 0 12px;font-size:13px">Agents whose payment falls due within 2 days — money owed <strong>to</strong> the company. Total <strong>${formatPkr(agentTotal)}</strong>. Open the agent to send the notice; nothing is sent to an agent automatically.</p>
    <table style="border-collapse:collapse;width:100%;font-size:13px;color:#292524">
      <thead>
        <tr style="background:#faf7f1;text-align:left">
          <th style="padding:8px 10px">Agent</th>
          <th style="padding:8px 10px">PNR</th>
          <th style="padding:8px 10px;text-align:right">Seats</th>
          <th style="padding:8px 10px">For</th>
          <th style="padding:8px 10px;text-align:right">Amount</th>
          <th style="padding:8px 10px">Due</th>
          <th style="padding:8px 10px">Contact</th>
        </tr>
      </thead>
      <tbody>${agentRows}</tbody>
    </table>`;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:720px">
    <h2 style="color:#1c1917;margin:0 0 4px">EMD deadline alert</h2>
    ${emdSection}
    ${ticketingSection}
    ${iataSection}
    ${agentSection}
    <p style="margin:16px 0 0;font-size:12px;color:#78716c">
      Open the <a href="{{DASHBOARD_URL}}" style="color:#4f46e5">dashboard</a> for the full picture.
    </p>
  </div>`;

  return { subject, html };
}

/** Module-private: only `buildDeadlineEmail` needs it. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface Emd2BackfillSummary {
  set: number;
  skippedNoEmd2: number;
  skippedNotSv: number;
  skippedNoDates: number;
  /** Fully ticketed, so no second EMD is needed at all — see below. */
  skippedTicketed: number;
  details: { pnrCode: string; deadline: string }[];
}

/**
 * Owner rule (2026-08-24): for SV Umrah bookings whose EMD-1 is settled
 * (paid or refunded) and whose EMD-2 round has no deadline, derive the
 * EMD-2 issuance deadline from the SV policy: outbound date minus the band's
 * days-before-departure (20/10/7/5). Writes an activity-log entry per set
 * deadline. PNRs without an existing EMD-2 round are only counted — the
 * round itself (and its amount) is staff's to add.
 *
 * The policy dates are used as the airline states them: the 3-day safety margin
 * applies to the FIRST EMD only (owner ruling, 2026-09-21).
 *
 * **A fully ticketed booking is skipped.** Issuing the tickets is the other way
 * to meet an EMD deadline — *"if the user can sell/issue the tickets he doesn't
 * have to issue a second EMD"* — so writing a deadline onto such a booking
 * would manufacture an alert for work nobody has to do. This is a reading of
 * that answer rather than a stated rule, and it is narrow on purpose: only
 * bookings whose tickets are ALL issued are skipped, because a partly ticketed
 * booking still needs its EMD for the seats that remain.
 */
export async function backfillEmd2Deadlines(): Promise<Emd2BackfillSummary> {
  const summary: Emd2BackfillSummary = {
    set: 0,
    skippedNoEmd2: 0,
    skippedNotSv: 0,
    skippedNoDates: 0,
    skippedTicketed: 0,
    details: [],
  };

  const pnrs = await prisma.pnr.findMany({
    where: { status: 'active' },
    include: {
      airline: true,
      emdRounds: { orderBy: { roundNumber: 'asc' } },
      ticketing: { select: { ticketsIssued: true } },
    },
  });

  for (const p of pnrs) {
    const isSvUmrah =
      p.airline?.code?.toUpperCase() === 'SV' &&
      !!p.segment &&
      p.segment.toLowerCase().includes('umrah');
    if (!isSvUmrah) {
      summary.skippedNotSv++;
      continue;
    }

    // Tickets issued for every seat: the booking is done with EMDs.
    const ticketsIssued = p.ticketing?.ticketsIssued ?? 0;
    if (p.seats > 0 && ticketsIssued >= p.seats) {
      summary.skippedTicketed++;
      continue;
    }

    const r1 = p.emdRounds.find((r) => r.roundNumber === 1);
    const r2 = p.emdRounds.find((r) => r.roundNumber === 2);
    // Settled = refunded, the only status that now means the deposit came back.
    const emd1Settled = !!r1 && r1.status === 'refunded';
    if (!emd1Settled) continue;

    if (!r2) {
      summary.skippedNoEmd2++;
      continue;
    }
    if (r2.deadlineDate !== null) continue;

    if (!p.requestDate || !p.outboundDate) {
      summary.skippedNoDates++;
      continue;
    }

    const days =
      Math.round(
        (Date.UTC(
          p.outboundDate.getUTCFullYear(),
          p.outboundDate.getUTCMonth(),
          p.outboundDate.getUTCDate()
        ) -
          Date.UTC(
            p.requestDate.getUTCFullYear(),
            p.requestDate.getUTCMonth(),
            p.requestDate.getUTCDate()
          )) /
          86_400_000
      );
    const offset = emd2DaysBeforeDeparture(days);
    if (offset === null) {
      summary.skippedNoDates++;
      continue;
    }

    const [y, m, d] = [
      p.outboundDate.getUTCFullYear(),
      p.outboundDate.getUTCMonth(),
      p.outboundDate.getUTCDate(),
    ];
    // Same ordering rule as the create form: a backfilled EMD-2 deadline must
    // not sit on or before EMD-1's (docs/decisions.md, 2026-09-07).
    const policyIso = new Date(Date.UTC(y, m, d - offset)).toISOString().slice(0, 10);
    const deadline = new Date(
      `${clampEmd2Deadline(policyIso, r1.deadlineDate ? r1.deadlineDate.toISOString().slice(0, 10) : null)}T00:00:00.000Z`
    );

    await prisma.emdRound.update({
      where: { id: r2.id },
      data: { deadlineDate: deadline },
    });
    await prisma.activityLog.create({
      data: {
        tableName: 'emd_rounds',
        recordId: r2.id,
        fieldName: 'deadline_date',
        oldValue: null,
        newValue: deadline.toISOString().slice(0, 10),
      },
    });

    summary.set++;
    if (summary.details.length < 20) {
      summary.details.push({ pnrCode: p.pnr, deadline: deadline.toISOString().slice(0, 10) });
    }
  }

  return summary;
}

/** Module-private: only `sendDeadlineAlert` needs it. */
function dashboardUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

export interface SendResult {
  sent: boolean;
  recipients: string[];
  subject: string;
  error?: string;
}

export async function sendDeadlineAlert(
  todayIso: string,
  opts: { dryRun?: boolean } = {}
): Promise<
  SendResult & {
    alerts: DeadlineAlert[];
    ticketingAlerts: TicketingAlert[];
    iataAlerts: IataPaymentAlert[];
    agentAlerts: AgentDueAlert[];
  }
> {
  const recipients = (process.env.STAFF_ALERT_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // EMD rounds, ticketing deadlines and IATA payments, in one job and one
  // email (phase-5 Step 1; IATA added 2026-09-22). One daily email is one thing
  // to read.
  const [alerts, ticketingAlerts, iataAlerts, agentAlerts] = await Promise.all([
    findDueRounds(todayIso),
    findDueTicketingDeadlines(todayIso),
    findDueIataPayments(todayIso),
    findDueAgentNotices(todayIso),
  ]);

  if (
    alerts.length === 0 &&
    ticketingAlerts.length === 0 &&
    iataAlerts.length === 0 &&
    agentAlerts.length === 0
  ) {
    return { sent: false, recipients, subject: '', alerts, ticketingAlerts, iataAlerts, agentAlerts };
  }
  if (recipients.length === 0) {
    return {
      sent: false,
      recipients,
      subject: '',
      alerts,
      ticketingAlerts,
      iataAlerts,
      agentAlerts,
      error: 'STAFF_ALERT_EMAILS is not set — no recipients configured.',
    };
  }

  const { subject, html } = buildDeadlineEmail(
    todayIso,
    alerts,
    ticketingAlerts,
    iataAlerts,
    agentAlerts
  );
  // `replaceAll` for APP_URL: there is one link per agent row, and `replace`
  // would rewrite only the first, leaving every other row pointing at a
  // literal {{APP_URL}}.
  const finalHtml = html
    .replace('{{DASHBOARD_URL}}', dashboardUrl())
    .replaceAll('{{APP_URL}}', dashboardUrl());

  if (opts.dryRun) {
    return { sent: false, recipients, subject, alerts, ticketingAlerts, iataAlerts, agentAlerts };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false, recipients, subject, alerts, ticketingAlerts, iataAlerts, agentAlerts, error: 'RESEND_API_KEY is not set.' };
  }

  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: process.env.ALERT_FROM_EMAIL ?? 'alerts@resend.dev',
    to: recipients,
    subject,
    html: finalHtml,
  });

  return { sent: !error, recipients, subject, alerts, ticketingAlerts, iataAlerts, agentAlerts, error: error?.message };
}
