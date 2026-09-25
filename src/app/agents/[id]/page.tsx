import { Fragment } from 'react';
import { requirePageUser } from '@/lib/server/session';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Building2, Mail, Phone, CalendarClock } from 'lucide-react';
import AppHeader from '@/components/app-header';
import { prisma } from '@/lib/prisma';
import { agentVisibilityFilter, canEditAgent } from '@/lib/agents';
import { agentDues, duesForAssignment } from '@/lib/agent-dues';
import { buildAgentNotice } from '@/lib/agent-notices';
import { nextEmdSuggestion } from '@/lib/emd';
import AgentRoundSchedule from '@/components/agent-round-schedule';
import SendNoticeButton from '../send-notice-button';
import { formatPkr } from '@/lib/format';
import { todayIsoInPkt, diffInDays } from '@/lib/urgency';

/**
 * One agent: who they are, which seats they hold, and what they owe when.
 *
 * Every figure here is **calculated** — from the assignment's terms, the
 * booking's fare and tax, the EMD the airline is holding, and the payments
 * recorded. Nothing is stored, so nothing can go stale when a round is
 * refunded or a charge changes (`lib/agent-dues.ts`, phase 7 step 3).
 *
 * Read-only: money is recorded on the booking, where the seats are.
 */
export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user, authUser } = await requirePageUser();
  const { id } = await params;

  // Visibility is applied in the QUERY, not after fetching: a branch must not be
  // able to read another branch's agent by guessing the URL.
  const where = agentVisibilityFilter(authUser);
  if (where === null) notFound();

  const agent = await prisma.agent.findFirst({
    where: { id, ...where },
    include: {
      createdByBranch: { select: { name: true } },
      assignments: {
        where: { releasedAt: null },
        orderBy: { assignedAt: 'desc' },
        include: {
          recoveries: { select: { amount: true } },
          pnr: {
            select: {
              id: true,
              pnr: true,
              srNo: true,
              seats: true,
              sector: true,
              outboundDate: true,
              status: true,
              fare: true,
              airlineTaxes: true,
              segment: true,
              requestDate: true,
              airline: { select: { code: true } },
              branch: { select: { name: true } },
              // What the airline holds, and by when — the two facts the EMD
              // share is worked out from.
              emdRounds: { select: { roundNumber: true, status: true, emdAmount: true, deadlineDate: true } },
              ticketing: { select: { ticketIssuanceDeadline: true } },
            },
          },
        },
      },
    },
  });

  if (!agent) notFound();

  const totalSeats = agent.assignments.reduce((sum, a) => sum + a.seats, 0);
  const today = todayIsoInPkt();

  // One schedule per booking this agent holds seats on. The same pure functions
  // the booking page uses, so the two pages cannot disagree about a figure.
  const lines = agent.assignments.map((a) => {
    const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
    // What the next EMD will cost, from the airline's own policy. The agent's
    // share of it is money to collect BEFORE it is issued (owner ruling,
    // 2026-09-22); null when no policy covers the airline, in which case no
    // upcoming line is shown rather than a guessed one.
    const upcoming = nextEmdSuggestion({
      roundsIssued: a.pnr.emdRounds.filter((r) => r.status === 'issued').length,
      seats: a.pnr.seats,
      fare: Number(a.pnr.fare),
      airlineCode: a.pnr.airline?.code ?? null,
      segment: a.pnr.segment,
      requestDateIso: iso(a.pnr.requestDate),
      outboundDateIso: iso(a.pnr.outboundDate),
      todayIso: today,
    });

    const { dues, margin } = duesForAssignment({
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
      upcomingRoundAmount: upcoming.amount,
    });
    // The default text for a notice about whatever falls due next. Built on the
    // server so the browser is never handed the means to compose one freely.
    // Sendable whenever something is outstanding. An EMD share has no date and
    // is chased without quoting one; a balance with no ticketing deadline is
    // the case that still cannot be chased, because there is nothing to ask by.
    const notice =
      dues.next && (dues.next.kind === 'emd' || dues.next.date)
        ? buildAgentNotice({
            agentName: agent.name,
            pnrCode: a.pnr.pnr,
            sector: a.pnr.sector,
            seats: a.seats,
            outboundDate: iso(a.pnr.outboundDate),
            kind: dues.next.kind,
            amount: dues.next.amount,
            dueDate: dues.next.date,
          })
        : null;
    return { assignment: a, dues, margin, notice };
  });

  const owedTotal = lines.reduce((sum, l) => sum + l.dues.final.total, 0);
  const paidTotal = lines.reduce((sum, l) => sum + l.dues.final.recovered, 0);
  const outstandingTotal = lines.reduce((sum, l) => sum + l.dues.final.outstanding, 0);
  const marginTotal = lines.reduce((sum, l) => sum + l.margin, 0);
  const mayChase = canEditAgent(authUser, agent.createdByBranchId);

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader user={user} subtitle="Agent" breadcrumb={{ href: '/agents', label: 'Agents' }} />

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        <Link
          href="/agents"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-indigo-600 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to agents
        </Link>

        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-stone-900">{agent.name}</h1>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-stone-500">
                {agent.b2bCode && <span className="font-mono text-[13px]">{agent.b2bCode}</span>}
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-stone-400" />
                  {agent.createdByBranch?.name ?? 'Head Office'}
                </span>
                {agent.contactEmails.length > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-stone-400" />
                    {agent.contactEmails.join(', ')}
                  </span>
                )}
                {agent.contactPhone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-stone-400" />
                    {agent.contactPhone}
                  </span>
                )}
              </div>
            </div>
            <span
              className={`text-xs px-2.5 py-1 rounded-full border ${
                agent.active
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-stone-100 text-stone-500 border-stone-200'
              }`}
            >
              {agent.active ? 'active' : 'inactive'}
            </span>
          </div>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-stone-900 mb-1">Seats held and money due</h2>
          <p className="text-[11px] text-stone-400 mb-4">
            {totalSeats} seat{totalSeats === 1 ? '' : 's'} across {agent.assignments.length} booking
            {agent.assignments.length === 1 ? '' : 's'}. Every figure is calculated from the
            booking&rsquo;s fare, this agent&rsquo;s terms and the payments recorded. The EMD share is
            collected <strong>before each round is issued</strong> and carries no deadline of its
            own; the balance falls due 3 days before ticketing.
          </p>

          {agent.assignments.length > 0 && (
            <div className="mb-5 grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'Seats held', value: String(totalSeats) },
                { label: 'Owes', value: formatPkr(owedTotal) },
                { label: 'Paid', value: formatPkr(paidTotal) },
                { label: 'Outstanding', value: formatPkr(outstandingTotal) },
                { label: 'Margin', value: formatPkr(marginTotal) },
              ].map((c) => (
                <div key={c.label} className="rounded-xl border border-stone-200 bg-stone-50/60 px-4 py-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-stone-400">
                    {c.label}
                  </p>
                  <p className="mt-1 text-sm font-bold text-stone-900 tabular-nums">{c.value}</p>
                </div>
              ))}
            </div>
          )}

          {agent.assignments.length === 0 ? (
            <p className="text-sm text-stone-400 py-8 text-center">
              No seats handed to this agent yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-stone-400 border-b border-stone-200">
                    <th className="py-2 pr-4 font-medium">SR#</th>
                    <th className="py-2 pr-4 font-medium">PNR</th>
                    <th className="py-2 pr-4 font-medium">Airline</th>
                    <th className="py-2 pr-4 font-medium">Outbound</th>
                    <th className="py-2 pr-4 font-medium text-right">Seats held</th>
                    <th className="py-2 pr-4 font-medium text-right">Owes</th>
                    <th className="py-2 pr-4 font-medium text-right">Paid</th>
                    <th className="py-2 pr-4 font-medium text-right">Outstanding</th>
                    <th className="py-2 pr-4 font-medium text-right">Margin</th>
                    <th className="py-2 pr-4 font-medium">Next due</th>
                    <th className="py-2 font-medium">Notice</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map(({ assignment: a, dues, margin, notice }) => (
                    <Fragment key={a.id}>
                    <tr className="border-b border-stone-100">
                      <td className="py-3 pr-4 text-stone-500">{a.pnr.srNo}</td>
                      <td className="py-3 pr-4">
                        <Link
                          href={`/pnrs/${a.pnr.id}`}
                          className="font-mono text-indigo-600 hover:text-indigo-800 hover:underline"
                        >
                          {a.pnr.pnr}
                        </Link>
                        {a.pnr.status !== 'active' && (
                          <span className="ml-2 text-[10px] text-stone-400">{a.pnr.status}</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-stone-600">{a.pnr.airline?.code ?? '—'}</td>
                      <td className="py-3 pr-4 text-stone-600">
                        {a.pnr.outboundDate ? a.pnr.outboundDate.toISOString().slice(0, 10) : '—'}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-stone-800">
                        {a.seats}
                        <span className="text-[11px] text-stone-400"> / {a.pnr.seats}</span>
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-stone-800">
                        {formatPkr(dues.final.total)}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-stone-600">
                        {formatPkr(dues.final.recovered)}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums font-semibold text-stone-900">
                        {dues.final.credit > 0
                          ? `${formatPkr(dues.final.credit)} cr`
                          : formatPkr(dues.final.outstanding)}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-stone-600">
                        {formatPkr(margin)}
                      </td>
                      <td className="py-3 pr-4">
                        <NextDueCell dues={dues} today={today} />
                      </td>
                      <td className="py-3">
                        {/* Sending is a human click, never the daily job. An
                            undated balance offers no button: there is no date
                            to quote and none may be invented (ruling 17). */}
                        {mayChase && notice ? (
                          <SendNoticeButton
                            assignmentId={a.id}
                            agentName={agent.name}
                            pnrCode={a.pnr.pnr}
                            contactEmails={agent.contactEmails}
                            defaultSubject={notice.subject}
                            defaultBody={notice.body}
                          />
                        ) : (
                          <span className="text-[10px] text-stone-300">—</span>
                        )}
                      </td>
                    </tr>
                    {/* What this agent pays for each EMD round on this booking.
                        No date per round — staff collect before the airline
                        issues each one (owner ruling, 2026-09-22). */}
                    <tr className="border-b border-stone-100 last:border-0">
                      <td colSpan={11} className="pb-4 pt-1 pl-8 pr-4">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-stone-400 mb-1">
                          EMD payments to make
                        </p>
                        <div className="max-w-md rounded-xl border border-stone-200 bg-stone-50/60 px-3 py-2">
                          <AgentRoundSchedule
                            rounds={dues.rounds}
                            emd={dues.emd}
                            agentSeats={a.seats}
                            pnrSeats={a.pnr.seats}
                            compact
                          />
                        </div>
                      </td>
                    </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-stone-200 py-4">
        <p className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 text-[11px] text-stone-400">
          Eyries EMD · agent record created{' '}
          {agent.createdAt.toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' })}
        </p>
      </footer>
    </div>
  );
}

/**
 * What this agent owes next on one booking, and when.
 *
 * Three states, and the third is the one that matters: a balance with **no
 * ticketing deadline recorded** is owed but has no date, so it says so plainly
 * rather than showing a date this system invented. No reminder fires for it
 * either (owner ruling 17) — the deadline is a person's to enter.
 */
function NextDueCell({
  dues,
  today,
}: {
  dues: ReturnType<typeof agentDues>;
  today: string;
}) {
  const next = dues.next;
  if (!next) {
    return <span className="text-[11px] text-emerald-700 font-medium">Settled in full</span>;
  }

  const what = next.kind === 'emd' ? 'EMD share' : 'Balance';

  if (!next.date) {
    // Two different reasons for having no date, and they must not read alike.
    // An EMD share never has one; a balance has none only until somebody
    // records the ticketing deadline.
    return (
      <span className="text-[11px] text-stone-500">
        {formatPkr(next.amount)} — {what}
        <span className="block text-stone-400">
          {next.kind === 'emd'
            ? 'collect before the next EMD is issued'
            : 'no due date (ticketing deadline not set)'}
        </span>
      </span>
    );
  }

  const days = diffInDays(today, next.date);
  const tone =
    days <= 2
      ? 'bg-red-50 border-red-200 text-red-700'
      : days <= 5
        ? 'bg-amber-50 border-amber-200 text-amber-700'
        : 'bg-stone-50 border-stone-200 text-stone-600';

  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="tabular-nums text-stone-800">{formatPkr(next.amount)}</span>
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium whitespace-nowrap ${tone}`}
      >
        <CalendarClock className="w-3 h-3" />
        {what} {days < 0 ? `overdue since ${next.date}` : `due ${next.date}`}
      </span>
    </span>
  );
}
