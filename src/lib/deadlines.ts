import { prisma } from '@/lib/prisma';
import { formatPkr } from '@/lib/format';

/**
 * Step 7 — daily deadline alert.
 * Read-only: finds pending EMD rounds on ACTIVE PNRs whose deadline is
 * today, within the next 2 days, or already overdue, and produces one
 * summary email for staff. Rounds without a deadline are never alerted —
 * they light up again the moment a time limit is recorded.
 */

export function addDaysIso(todayIso: string, days: number): string {
  const [y, m, d] = todayIso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

/** Alert window: overdue, today, and the next 2 days inclusive. */
export function isDueForAlert(deadlineIso: string | null, todayIso: string): boolean {
  if (!deadlineIso) return false;
  return deadlineIso <= addDaysIso(todayIso, 2);
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
      status: 'pending',
      deadlineDate: { not: null, lte: new Date(`${horizon}T00:00:00.000Z`) },
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

export function buildDeadlineEmail(
  todayIso: string,
  alerts: DeadlineAlert[]
): { subject: string; html: string } {
  const overdueCount = alerts.filter((a) => a.overdue).length;
  const subject =
    alerts.length === 1
      ? `EMD deadline alert — 1 booking needs attention`
      : `EMD deadline alert — ${alerts.length} bookings need attention`;

  const rows = alerts
    .map((a) => {
      const when = a.overdue
        ? `<span style="color:#b91c1c;font-weight:700">OVERDUE ${Math.abs(a.daysLeft)}d</span>`
        : a.daysLeft === 0
          ? '<span style="color:#b91c1c;font-weight:700">TODAY</span>'
          : `<span style="color:#b45309;font-weight:600">in ${a.daysLeft}d</span>`;
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e7e5e4;font-family:monospace">${a.pnrCode}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e7e5e4">${a.airlineCode ?? '—'} · ${escapeHtml(a.investorCompany)}</td>
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

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:720px">
    <h2 style="color:#1c1917;margin:0 0 4px">EMD deadline alert</h2>
    <p style="color:#78716c;margin:0 0 16px;font-size:13px">Pending EMD rounds due within 2 days (or overdue) as of ${todayIso}.</p>
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
    </table>
    <p style="margin:16px 0 0;font-size:12px;color:#78716c">
      Open the <a href="{{DASHBOARD_URL}}" style="color:#4f46e5">dashboard</a> for the full picture.
    </p>
  </div>`;

  return { subject, html };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function dashboardUrl(): string {
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
): Promise<SendResult & { alerts: DeadlineAlert[] }> {
  const recipients = (process.env.STAFF_ALERT_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const alerts = await findDueRounds(todayIso);

  if (alerts.length === 0) {
    return { sent: false, recipients, subject: '', alerts };
  }
  if (recipients.length === 0) {
    return {
      sent: false,
      recipients,
      subject: '',
      alerts,
      error: 'STAFF_ALERT_EMAILS is not set — no recipients configured.',
    };
  }

  const { subject, html } = buildDeadlineEmail(todayIso, alerts);
  const finalHtml = html.replace('{{DASHBOARD_URL}}', dashboardUrl());

  if (opts.dryRun) {
    return { sent: false, recipients, subject, alerts };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false, recipients, subject, alerts, error: 'RESEND_API_KEY is not set.' };
  }

  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: process.env.ALERT_FROM_EMAIL ?? 'alerts@resend.dev',
    to: recipients,
    subject,
    html: finalHtml,
  });

  return { sent: !error, recipients, subject, alerts, error: error?.message };
}
