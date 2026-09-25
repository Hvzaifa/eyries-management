import { requirePageUser } from '@/lib/server/session';
import Link from 'next/link';
import { ArrowLeft, Users, Building2 } from 'lucide-react';
import AppHeader from '@/components/app-header';
import { prisma } from '@/lib/prisma';
import { agentVisibilityFilter, canEditAgent } from '@/lib/agents';
import { duesForAssignment } from '@/lib/agent-dues';
import { formatPkr } from '@/lib/format';
import { todayIsoInPkt, diffInDays } from '@/lib/urgency';
import AgentFormButton from './agent-form-button';

export default async function AgentsPage() {
  const { user, authUser } = await requirePageUser();

  // null = this account may see no agents at all (a branch whose branch name
  // matches no row). Return an empty list rather than falling through to an
  // unfiltered query — see agentVisibilityFilter.
  const where = agentVisibilityFilter(authUser);
  const agents =
    where === null
      ? []
      : await prisma.agent.findMany({
          where,
          orderBy: [{ active: 'desc' }, { name: 'asc' }],
          include: {
            createdByBranch: { select: { name: true } },
            // The money columns. Read in the same query rather than per agent:
            // a row per agent asking for its own assignments is the classic
            // N+1, and this list is rendered on every visit.
            assignments: {
              where: { releasedAt: null, pnr: { status: 'active' } },
              include: {
                recoveries: { select: { amount: true } },
                pnr: {
                  select: {
                    seats: true,
                    fare: true,
                    airlineTaxes: true,
                    emdRounds: { select: { roundNumber: true, status: true, emdAmount: true, deadlineDate: true } },
                    ticketing: { select: { ticketIssuanceDeadline: true } },
                  },
                },
              },
            },
          },
        });

  const isHQ = authUser.accountType === 'headoffice';
  const today = todayIsoInPkt();
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

  // One row of money per agent, summed across every booking they hold seats on.
  // Calculated through the same `duesForAssignment` the agent page and the
  // daily alert use, so the three cannot disagree about a figure.
  const money = new Map<
    string,
    { seats: number; total: number; recovered: number; outstanding: number; margin: number; nextDue: string | null }
  >();
  for (const a of agents) {
    let seats = 0, total = 0, recovered = 0, outstanding = 0, margin = 0;
    let nextDue: string | null = null;
    for (const asg of a.assignments) {
      const { dues, margin: m } = duesForAssignment({
        agentSeats: asg.seats,
        pnrSeats: asg.pnr.seats,
        fare: Number(asg.pnr.fare),
        airlineTaxes: asg.pnr.airlineTaxes === null ? null : Number(asg.pnr.airlineTaxes),
        chargeType: asg.chargeType,
        chargeValue: asg.chargeValue === null ? null : Number(asg.chargeValue),
        discountType: asg.discountType,
        discountValue: asg.discountValue === null ? null : Number(asg.discountValue),
        chargeTax: asg.chargeTax,
        recoveries: asg.recoveries.map((r) => Number(r.amount)),
        rounds: asg.pnr.emdRounds.map((r) => ({
          roundNumber: r.roundNumber,
          status: r.status,
          emdAmount: Number(r.emdAmount),
          deadlineDate: iso(r.deadlineDate),
        })),
        ticketIssuanceDeadline: iso(asg.pnr.ticketing?.ticketIssuanceDeadline ?? null),
      });
      seats += asg.seats;
      total += dues.final.total;
      recovered += dues.final.recovered;
      outstanding += dues.final.outstanding;
      margin += m;
      // The soonest dated obligation across all their bookings. An undated one
      // is skipped rather than sorted last — there is no date to compare.
      const d = dues.next?.date ?? null;
      if (d && (nextDue === null || d < nextDue)) nextDue = d;
    }
    money.set(a.id, { seats, total, recovered, outstanding, margin, nextDue });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader user={user} subtitle="Agents" />

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-indigo-600 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to dashboard
        </Link>

        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-1">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-stone-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-500" />
                Agents
              </h1>
              <p className="text-sm text-stone-500 mt-1">
                Travel agents that PNR seats are handed over to. Agents do not log in — these are
                records kept by staff.
              </p>
            </div>
            <AgentFormButton />
          </div>

          <p className="text-[11px] text-stone-400 mb-5">
            {isHQ
              ? 'Head Office sees every agent.'
              : 'You see the agents your branch created. Head Office sees all of them.'}{' '}
            Money is totalled across the live bookings each agent holds seats on, and calculated —
            nothing here is stored. Open an agent to see the breakdown and send a notice.
          </p>

          {agents.length === 0 ? (
            <p className="text-sm text-stone-400 py-10 text-center">
              No agents yet. Add the first one with “New agent”.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-stone-400 border-b border-stone-200">
                    <th className="py-2 pr-4 font-medium">Agent</th>
                    <th className="py-2 pr-4 font-medium">B2B code</th>
                    <th className="py-2 pr-4 font-medium">Contact</th>
                    <th className="py-2 pr-4 font-medium text-right">Seats</th>
                    <th className="py-2 pr-4 font-medium text-right">Owes</th>
                    <th className="py-2 pr-4 font-medium text-right">Paid</th>
                    <th className="py-2 pr-4 font-medium text-right">Outstanding</th>
                    <th className="py-2 pr-4 font-medium text-right">Margin</th>
                    <th className="py-2 pr-4 font-medium">Next due</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => (
                    <tr key={a.id} className="border-b border-stone-100 last:border-0">
                      <td className="py-3 pr-4 font-medium">
                        <Link
                          href={`/agents/${a.id}`}
                          className="text-indigo-600 hover:text-indigo-800 hover:underline"
                        >
                          {a.name}
                        </Link>
                        <span className="block text-[11px] text-stone-400 inline-flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-stone-300" />
                          {a.createdByBranch?.name ?? 'Head Office'}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-stone-600 font-mono text-[13px]">
                        {a.b2bCode ?? '—'}
                      </td>
                      <td className="py-3 pr-4 text-stone-600">
                        {a.contactEmails.length > 0 ? (
                          <span className="block text-[13px]">{a.contactEmails.join(', ')}</span>
                        ) : (
                          <span className="text-amber-600 text-[12px]">no email on file</span>
                        )}
                        {a.contactPhone && (
                          <span className="block text-[11px] text-stone-400">{a.contactPhone}</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-stone-700">
                        {money.get(a.id)!.seats || '—'}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-stone-700">
                        {formatPkr(money.get(a.id)!.total)}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-stone-600">
                        {formatPkr(money.get(a.id)!.recovered)}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums font-semibold text-stone-900">
                        {formatPkr(money.get(a.id)!.outstanding)}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-stone-600">
                        {formatPkr(money.get(a.id)!.margin)}
                      </td>
                      <td className="py-3 pr-4">
                        <NextDueBadge date={money.get(a.id)!.nextDue} today={today} />
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full border ${
                            a.active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-stone-100 text-stone-500 border-stone-200'
                          }`}
                        >
                          {a.active ? 'active' : 'inactive'}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        {canEditAgent(authUser, a.createdByBranchId) && (
                          <AgentFormButton
                            agent={{
                              id: a.id,
                              name: a.name,
                              b2bCode: a.b2bCode,
                              contactEmails: a.contactEmails,
                              contactPhone: a.contactPhone,
                              active: a.active,
                            }}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-stone-200 py-4">
        <p className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 text-[11px] text-stone-400">
          Eyries EMD · {agents.length} agent{agents.length === 1 ? '' : 's'} visible
        </p>
      </footer>
    </div>
  );
}

/**
 * The soonest dated payment across everything this agent holds.
 *
 * An agent with money outstanding but no ticketing deadline recorded anywhere
 * shows no date at all — the system will not invent one (ruling 17).
 */
function NextDueBadge({ date, today }: { date: string | null; today: string }) {
  if (!date) return <span className="text-[11px] text-stone-400">—</span>;

  const days = diffInDays(today, date);
  const tone =
    days <= 2
      ? 'bg-red-50 border-red-200 text-red-700'
      : days <= 5
        ? 'bg-amber-50 border-amber-200 text-amber-700'
        : 'bg-stone-50 border-stone-200 text-stone-600';

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium whitespace-nowrap ${tone}`}
    >
      {days < 0 ? `overdue since ${date}` : date}
    </span>
  );
}
