import { prisma } from './prisma';
import { emd2DaysBeforeDeparture, clampEmd2Deadline } from './emd';
import { formatPkr } from './format';

/**
 * Step 7 — daily deadline alert.
 * Read-only: finds issued EMD rounds on ACTIVE PNRs whose deadline falls
 * between today and 2 days out, and produces one summary email for staff.
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
  details: { pnrCode: string; deadline: string }[];
}

/**
 * Owner rule (2026-08-24): for SV Umrah bookings whose EMD-1 is settled
 * (paid or refunded) and whose EMD-2 round has no deadline, derive the
 * EMD-2 deadline from the SV policy: outbound date minus the band's
 * days-before-departure (20/10/7/5). Writes an activity-log entry per set
 * deadline. PNRs without an existing EMD-2 round are only counted — the
 * round itself (and its amount) is staff's to add.
 */
export async function backfillEmd2Deadlines(): Promise<Emd2BackfillSummary> {
  const summary: Emd2BackfillSummary = {
    set: 0,
    skippedNoEmd2: 0,
    skippedNotSv: 0,
    skippedNoDates: 0,
    details: [],
  };

  const pnrs = await prisma.pnr.findMany({
    where: { status: 'active' },
    include: {
      airline: true,
      emdRounds: { orderBy: { roundNumber: 'asc' } },
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

    const r1 = p.emdRounds.find((r) => r.roundNumber === 1);
    const r2 = p.emdRounds.find((r) => r.roundNumber === 2);
    const emd1Settled = !!r1 && (r1.status === 'paid' || r1.status === 'refunded');
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
