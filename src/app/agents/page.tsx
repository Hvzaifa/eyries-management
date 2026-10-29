import { requirePageUser } from '@/lib/server/session';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Users } from 'lucide-react';
import AppHeader from '@/components/app-header';
import ReceivableCards from '@/components/receivable-cards';
import { isHeadOffice } from '@/lib/auth';
import { loadAgentLedger } from '@/lib/server/agent-ledger';
import { summarizeReceivables } from '@/lib/agent-receivables';
import { formatPkr } from '@/lib/format';
import { todayIsoInPkt } from '@/lib/urgency';
import AgentFormButton from './agent-form-button';

export const metadata = { title: 'Agents | Six Sigma' };

/**
 * Every agent this account may see and what they owe (owner, 2026-10-05).
 *
 * Head Office sees all agents. A branch sees the agents it has sold seats to,
 * with figures from its own bookings only. Every figure is calculated from the
 * bookings, the agent's terms and the payments recorded; nothing is stored.
 */
export default async function AgentsPage() {
  const { user, authUser } = await requirePageUser();
  const isHQ = isHeadOffice(authUser);
  const agents = await loadAgentLedger(authUser, todayIsoInPkt());

  // The balance left includes what is owed on bookings not yet in the system
  // (owner, 2026-10-29).
  const rows = agents.map((a) => ({ agent: a, summary: summarizeReceivables(a.lines, a.notInSystem) }));
  const all = summarizeReceivables(agents.flatMap((a) => a.lines), agents.reduce((s, a) => s + Math.round(a.notInSystem * 100), 0) / 100);

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader user={user} subtitle="Agents" />

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-brand-dark transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to dashboard
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-stone-900 flex items-center gap-2">
              <Users className="w-6 h-6 text-brand-dark" />
              Agents
            </h1>
            <p className="text-sm text-stone-500 mt-1">
              {isHQ
                ? 'What every agent owes, across all branches.'
                : `What agents owe on ${authUser.branchName ?? 'your branch'}’s bookings.`}{' '}
              Active and completed bookings count; cancelled and released ones do not.
            </p>
          </div>
          <AgentFormButton />
        </div>

        <ReceivableCards summary={all} showMargin={isHQ} />

        <section className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
          {rows.length === 0 ? (
            <p className="text-sm text-stone-400 py-12 text-center">
              {isHQ
                ? 'No agents yet. Add the first one with “New agent”.'
                : 'No agents hold seats on your branch’s bookings yet.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-stone-500 border-b border-stone-200 bg-stone-50/60">
                    <th className="px-5 py-3 font-semibold">Agent</th>
                    <th className="px-4 py-3 font-semibold text-right">Seats</th>
                    <th className="px-4 py-3 font-semibold text-right">Receivable</th>
                    <th className="px-4 py-3 font-semibold text-right">Recovered</th>
                    <th className="px-4 py-3 font-semibold text-right">Balance</th>
                    <th className="px-3 py-3 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {rows.map(({ agent: a, summary: s }) => (
                    <tr key={a.id} className="group hover:bg-brand-50/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <Link href={`/agents/${a.id}`} className="font-medium text-stone-900 group-hover:text-brand-dark">
                          {a.name}
                        </Link>
                        {!a.active && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-md bg-stone-100 text-stone-500">inactive</span>
                        )}
                        <span className="block text-[11px] text-stone-400">
                          {a.lines.length} booking{a.lines.length === 1 ? '' : 's'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap text-stone-700">{s.totalSeats || '—'}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap text-stone-700">{formatPkr(s.totalReceivable)}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap text-stone-600">{formatPkr(s.recovered)}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap font-semibold text-stone-900">
                        {formatPkr(s.balance)}
                        {s.credit > 0 && (
                          <span className="block text-[10px] font-normal text-emerald-700">{formatPkr(s.credit)} credit</span>
                        )}
                        {s.payBack > 0 && (
                          <span className="block text-[10px] font-normal text-sky-700">{formatPkr(s.payBack)} to pay back</span>
                        )}
                        {s.notInSystem > 0 && (
                          <span className="block text-[10px] font-normal text-amber-700">
                            incl. {formatPkr(s.notInSystem)} on bookings not yet in the system
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3.5 text-right">
                        <Link href={`/agents/${a.id}`} aria-label={`Open ${a.name}`}>
                          <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-brand-dark" />
                        </Link>
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
          Six Sigma EMD · {rows.length} agent{rows.length === 1 ? '' : 's'} visible
        </p>
      </footer>
    </div>
  );
}
