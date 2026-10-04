import { requirePageUser } from '@/lib/server/session';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Building2, ChevronDown, LayoutGrid, List, Mail, Phone } from 'lucide-react';
import AppHeader from '@/components/app-header';
import ReceivableCards, { SEAT_TYPE_DOTS } from '@/components/receivable-cards';
import AgentRoundSchedule from '@/components/agent-round-schedule';
import { isHeadOffice } from '@/lib/auth';
import { canEditAgent, canSendAgentNotice } from '@/lib/agents';
import { loadAgentLedger, type AgentBookingLine } from '@/lib/server/agent-ledger';
import { SEAT_TYPE_LABELS, summarizeReceivables } from '@/lib/agent-receivables';
import { buildAgentNotice } from '@/lib/agent-notices';
import { formatPkr } from '@/lib/format';
import { todayIsoInPkt } from '@/lib/urgency';
import SendNoticeButton from '../send-notice-button';
import AgentFormButton from '../agent-form-button';

export const metadata = { title: 'Agent | Six Sigma' };

/**
 * One agent, in two views switched by the buttons at the top (owner,
 * 2026-10-05): every booking combined — seats and receivable by seat type,
 * recovered, balance — and the same figures booking by booking.
 *
 * A branch sees only its own bookings' figures, and an agent who holds no seats
 * on them (and was not created by it) is not found. Margin is Head Office only.
 * Every figure is calculated; money is recorded on the booking, not here.
 */
export default async function AgentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { user, authUser } = await requirePageUser();
  const { id } = await params;
  const byPnr = (await searchParams).view === 'pnrs';
  const today = todayIsoInPkt();

  const [agent] = await loadAgentLedger(authUser, today, id);
  if (!agent) notFound();

  const isHQ = isHeadOffice(authUser);
  const summary = summarizeReceivables(agent.lines);

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader user={user} subtitle="Agent" breadcrumb={{ href: '/agents', label: 'Agents' }} />

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        <Link
          href="/agents"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-brand-dark transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to agents
        </Link>

        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight text-stone-900">{agent.name}</h1>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full border ${
                    agent.active
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-stone-100 text-stone-500 border-stone-200'
                  }`}
                >
                  {agent.active ? 'active' : 'inactive'}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-stone-500">
                {agent.b2bCode && <span className="font-mono text-[13px]">{agent.b2bCode}</span>}
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-stone-400" />
                  Added by {agent.createdByBranchName ?? 'Head Office'}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-stone-400" />
                  {agent.contactEmails.length > 0 ? (
                    agent.contactEmails.join(', ')
                  ) : (
                    <span className="text-amber-600">no email on file</span>
                  )}
                </span>
                {agent.contactPhone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-stone-400" />
                    {agent.contactPhone}
                  </span>
                )}
              </div>
            </div>
            {canEditAgent(authUser, agent.createdByBranchId) && (
              <AgentFormButton
                agent={{
                  id: agent.id,
                  name: agent.name,
                  b2bCode: agent.b2bCode,
                  contactEmails: agent.contactEmails,
                  contactPhone: agent.contactPhone,
                  active: agent.active,
                }}
              />
            )}
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Choose a view" className="inline-flex rounded-xl border border-stone-200 bg-white p-1 shadow-sm">
            <ViewButton href={`/agents/${agent.id}`} active={!byPnr} icon={<LayoutGrid className="w-3.5 h-3.5" />}>
              All PNRs combined
            </ViewButton>
            <ViewButton href={`/agents/${agent.id}?view=pnrs`} active={byPnr} icon={<List className="w-3.5 h-3.5" />}>
              By PNR
            </ViewButton>
          </nav>
          <p className="text-[11px] text-stone-400">
            {agent.lines.length} booking{agent.lines.length === 1 ? '' : 's'}
            {isHQ ? '' : ` on ${authUser.branchName ?? 'your branch'}`} · active and completed
          </p>
        </div>

        {agent.lines.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-12 text-center text-sm text-stone-400 shadow-sm">
            No seats handed to this agent on {isHQ ? 'an active or completed booking' : 'your branch’s bookings'}.
          </div>
        ) : byPnr ? (
          <PnrTable agent={agent} isHQ={isHQ} authUser={authUser} />
        ) : (
          <ReceivableCards summary={summary} showMargin={isHQ} />
        )}
      </main>

      <footer className="border-t border-stone-200 py-4">
        <p className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 text-[11px] text-stone-400">
          Six Sigma EMD · agent record created{' '}
          {agent.createdAt.toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' })}
        </p>
      </footer>
    </div>
  );
}

function ViewButton({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
        active ? 'bg-brand text-white shadow-sm' : 'text-stone-600 hover:bg-stone-100'
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}

/**
 * Booking by booking: seat type, seats, receivable, recovered, balance (and
 * margin for Head Office), with the agent's share of each EMD round folded
 * under the row until opened, and a notice button where one can be sent.
 */
function PnrTable({
  agent,
  isHQ,
  authUser,
}: {
  agent: Awaited<ReturnType<typeof loadAgentLedger>>[number];
  isHQ: boolean;
  authUser: Parameters<typeof canSendAgentNotice>[0];
}) {
  const cols = isHQ ? 10 : 9;
  return (
    <section className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-stone-500 border-b border-stone-200 bg-stone-50/60">
              <th className="px-5 py-3 font-semibold">PNR</th>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Sector</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap">Outbound</th>
              <th className="px-4 py-3 font-semibold text-right">Seats</th>
              <th className="px-4 py-3 font-semibold text-right">Receivable</th>
              <th className="px-4 py-3 font-semibold text-right">Recovered</th>
              <th className="px-4 py-3 font-semibold text-right">Balance</th>
              {isHQ && <th className="px-4 py-3 font-semibold text-right">Margin</th>}
              <th className="px-4 py-3 font-semibold">Notice</th>
            </tr>
          </thead>
          {agent.lines.map((l) => (
            <tbody key={l.assignmentId} className="border-b border-stone-100 last:border-0">
              <tr>
                <td className="px-5 pt-3.5 pb-1">
                  <Link href={`/pnrs/${l.pnrId}`} className="font-mono font-medium text-brand-dark hover:underline">
                    {l.pnrCode}
                  </Link>
                  <span className="block text-[11px] text-stone-400 whitespace-nowrap">
                    SR#{l.srNo}
                    {l.airlineCode ? ` · ${l.airlineCode}` : ''}
                    {isHQ && l.branchName ? ` · ${l.branchName}` : ''}
                    {l.pnrStatus !== 'active' ? ` · ${l.pnrStatus}` : ''}
                  </span>
                </td>
                <td className="px-4 pt-3.5 pb-1">
                  <span className="inline-flex items-center gap-1.5 text-xs text-stone-700 whitespace-nowrap">
                    <span className={`w-2 h-2 rounded-full ${SEAT_TYPE_DOTS[l.seatType]}`} />
                    {SEAT_TYPE_LABELS[l.seatType]}
                  </span>
                </td>
                <td className="px-4 pt-3.5 pb-1 text-stone-600 whitespace-nowrap">{l.sector ?? '—'}</td>
                <td className="px-4 pt-3.5 pb-1 text-stone-600 whitespace-nowrap">{l.outboundDate ?? '—'}</td>
                <td className="px-4 pt-3.5 pb-1 text-right tabular-nums whitespace-nowrap text-stone-800">
                  {l.seats}
                  <span className="text-[11px] text-stone-400"> / {l.pnrSeats}</span>
                </td>
                <td className="px-4 pt-3.5 pb-1 text-right tabular-nums whitespace-nowrap text-stone-800">{formatPkr(l.receivable)}</td>
                <td className="px-4 pt-3.5 pb-1 text-right tabular-nums whitespace-nowrap text-stone-600">{formatPkr(l.recovered)}</td>
                <td className="px-4 pt-3.5 pb-1 text-right tabular-nums whitespace-nowrap font-semibold text-stone-900">
                  {l.credit > 0 ? (
                    <span className="text-emerald-700">{formatPkr(l.credit)} cr</span>
                  ) : l.balance === 0 ? (
                    <span className="text-emerald-700">Settled</span>
                  ) : (
                    formatPkr(l.balance)
                  )}
                </td>
                {isHQ && <td className="px-4 pt-3.5 pb-1 text-right tabular-nums whitespace-nowrap text-stone-600">{formatPkr(l.margin)}</td>}
                <td className="px-4 pt-3.5 pb-1">
                  <NoticeCell line={l} agent={agent} authUser={authUser} />
                </td>
              </tr>
              <tr>
                <td colSpan={cols} className="px-5 pb-3">
                  {/* The agent's share of each EMD round, collected before the
                      round is issued (owner, 2026-09-22). Folded away so the
                      table reads as one line per booking. */}
                  <details className="group">
                    <summary className="inline-flex items-center gap-1 cursor-pointer list-none text-[11px] font-medium text-stone-500 hover:text-brand-dark">
                      <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
                      EMD payments per round
                    </summary>
                    <div className="mt-2 max-w-md rounded-xl border border-stone-200 bg-stone-50/60 px-3 py-2">
                      <AgentRoundSchedule
                        rounds={l.dues.rounds}
                        emd={l.dues.emd}
                        agentSeats={l.seats}
                        pnrSeats={l.pnrSeats}
                        compact
                      />
                    </div>
                  </details>
                </td>
              </tr>
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}

/**
 * Sending is a human click, never the daily job. Offered when something is
 * outstanding that can be asked for: an EMD share (no date, by design) or a
 * dated balance. A balance with no ticketing deadline has nothing to ask by.
 */
function NoticeCell({
  line: l,
  agent,
  authUser,
}: {
  line: AgentBookingLine;
  agent: Awaited<ReturnType<typeof loadAgentLedger>>[number];
  authUser: Parameters<typeof canSendAgentNotice>[0];
}) {
  const next = l.dues.next;
  const sendable =
    next && (next.kind === 'emd' || next.date) && canSendAgentNotice(authUser, agent.createdByBranchId, l.pnrBranchId);
  if (!sendable) return <span className="text-[11px] text-stone-300">—</span>;
  const notice = buildAgentNotice({
    agentName: agent.name,
    pnrCode: l.pnrCode,
    sector: l.sector,
    seats: l.seats,
    outboundDate: l.outboundDate,
    kind: next.kind,
    amount: next.amount,
    dueDate: next.date,
  });
  return (
    <SendNoticeButton
      assignmentId={l.assignmentId}
      agentName={agent.name}
      pnrCode={l.pnrCode}
      contactEmails={agent.contactEmails}
      defaultSubject={notice.subject}
      defaultBody={notice.body}
    />
  );
}
