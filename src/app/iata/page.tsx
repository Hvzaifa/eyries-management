import { redirect } from 'next/navigation';
import { requirePageUser } from '@/lib/server/session';
import Link from 'next/link';
import { Banknote, AlertTriangle, CheckCircle2, CalendarClock } from 'lucide-react';
import AppHeader from '@/components/app-header';
import { isHeadOffice } from '@/lib/auth';
import { findIataDues } from '@/lib/iata-dues';
import { IATA_CALENDAR_FROM, IATA_CALENDAR_TO } from '@/lib/iata-calendar';
import { formatPkr } from '@/lib/format';
import { todayIsoInPkt } from '@/lib/urgency';

export const metadata = { title: 'IATA settlements | Eyries' };

/**
 * What the company owes IATA, grouped into the payments it will actually make.
 *
 * Head Office only: paying IATA is a head-office settlement, and a branch has
 * no reason to see company-wide obligations.
 *
 * Nothing on this page is stored. Every date is read from the remittance
 * calendar using the day each EMD was issued, so republishing the calendar
 * moves every figure with it.
 */
export default async function IataPage() {
  const { user, authUser } = await requirePageUser();
  if (!isHeadOffice(authUser)) redirect('/');

  const today = todayIsoInPkt();
  const dues = await findIataDues(today);
  const overdue = dues.groups.filter((g) => g.overdue);
  const ahead = dues.groups.filter((g) => !g.overdue);

  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      <AppHeader user={user} subtitle="IATA settlements" />

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">IATA settlements</h1>
          <p className="text-sm text-stone-500 mt-1">
            Every EMD with no recorded payment, grouped into the single payment that settles its
            billing period. Dates come from the IATA remittance calendar ({IATA_CALENDAR_FROM} to{' '}
            {IATA_CALENDAR_TO}), read from the day each EMD was issued. A refund removes a bill only
            when it lands on or before that period’s billing-to date — the <em>roll by</em> date on
            each row.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card label="Outstanding to IATA" value={formatPkr(dues.totalOwed)} tone="stone" />
          <Card label="EMDs awaiting payment" value={String(dues.count)} tone="stone" />
          <Card
            label="Next settlement"
            value={ahead[0] ? ahead[0].remittanceDay : '—'}
            hint={ahead[0] ? formatPkr(ahead[0].total) : 'nothing scheduled'}
            tone={ahead[0] && ahead[0].daysLeft <= 2 ? 'red' : 'stone'}
          />
        </div>

        {dues.count === 0 && (
          <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center shadow-sm">
            <CheckCircle2 className="w-6 h-6 mx-auto text-emerald-500" />
            <p className="mt-2 text-sm font-semibold text-stone-800">Nothing outstanding to IATA.</p>
            <p className="mt-1 text-sm text-stone-500">
              Every issued EMD on an active booking has a payment recorded against it.
            </p>
          </div>
        )}

        {overdue.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> Past their remittance day
            </h2>
            {overdue.map((g) => (
              <SettlementGroup key={g.remittanceDay} group={g} />
            ))}
          </section>
        )}

        {ahead.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-stone-800 flex items-center gap-1.5">
              <CalendarClock className="w-4 h-4 text-indigo-500" /> Upcoming
            </h2>
            {ahead.map((g) => (
              <SettlementGroup key={g.remittanceDay} group={g} />
            ))}
          </section>
        )}

        {dues.lateRefunds.length > 0 && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm space-y-2">
            <h2 className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> Refunded but still owed ({dues.lateRefunds.length})
            </h2>
            <p className="text-xs text-amber-700">
              A refund only cancels a bill when it lands <strong>on or before</strong> the
              billing-to date of the period the EMD was issued in. These refunds came after that
              window closed — or have no recorded date — so the original bill still stands and the
              refund is a separate credit in a later period. They are included in the totals above.
            </p>
            <ul className="text-xs text-amber-900 space-y-1 pt-1">
              {dues.lateRefunds.map((d) => (
                <li key={d.roundId}>
                  <Link href={`/pnrs/${d.pnrId}`} className="font-mono hover:underline">
                    {d.pnrCode}
                  </Link>{' '}
                  round {d.roundNumber} · issued {d.issuanceDate} · {formatPkr(d.emdAmount)} ·{' '}
                  {d.lateRefund === 'date-unknown'
                    ? 'refund date not recorded'
                    : 'refunded after its billing window'}
                </li>
              ))}
            </ul>
          </section>
        )}

        {dues.undated.length > 0 && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm space-y-2">
            <h2 className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> Outside the loaded calendar ({dues.undated.length})
            </h2>
            <p className="text-xs text-amber-700">
              These EMDs were issued outside {IATA_CALENDAR_FROM} – {IATA_CALENDAR_TO}, so no
              remittance day can be named. The money is still owed. Load the relevant IATA
              calendar to date them.
            </p>
            <ul className="text-xs text-amber-900 space-y-1 pt-1">
              {dues.undated.map((d) => (
                <li key={d.roundId}>
                  <Link href={`/pnrs/${d.pnrId}`} className="font-mono hover:underline">
                    {d.pnrCode}
                  </Link>{' '}
                  round {d.roundNumber} · issued {d.issuanceDate} · {formatPkr(d.emdAmount)}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="border-t border-stone-200 py-4 mt-8">
        <p className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 text-[11px] text-stone-400">
          Eyries EMD · internal booking tracker
        </p>
      </footer>
    </div>
  );
}

function Card({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: 'stone' | 'red';
}) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${
        tone === 'red' ? 'border-red-200 bg-red-50' : 'border-stone-200 bg-white'
      }`}
    >
      <p className="text-[11px] uppercase tracking-wide text-stone-500 font-semibold">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tone === 'red' ? 'text-red-700' : 'text-stone-900'}`}>
        {value}
      </p>
      {hint && <p className="text-[11px] text-stone-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function SettlementGroup({
  group,
}: {
  group: Awaited<ReturnType<typeof findIataDues>>['groups'][number];
}) {
  const when = group.overdue
    ? `overdue by ${Math.abs(group.daysLeft)} day${Math.abs(group.daysLeft) === 1 ? '' : 's'}`
    : group.daysLeft === 0
      ? 'today'
      : `in ${group.daysLeft} day${group.daysLeft === 1 ? '' : 's'}`;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
      <div
        className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b ${
          group.overdue
            ? 'border-red-100 bg-red-50/70'
            : group.daysLeft <= 2
              ? 'border-red-100 bg-red-50/40'
              : 'border-stone-100 bg-[#FAF7F1]'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <Banknote className={`w-4 h-4 ${group.overdue ? 'text-red-500' : 'text-indigo-500'}`} />
          <div>
            <p className="text-sm font-semibold text-stone-900">
              Pay {group.remittanceDay}{' '}
              <span className={`font-normal ${group.overdue ? 'text-red-600' : 'text-stone-500'}`}>
                — {when}
              </span>
            </p>
            <p className="text-[11px] text-stone-400 font-mono">
              {group.periodCodes.join(', ') || '—'} · {group.items.length} EMD
              {group.items.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <p className="text-base font-bold text-stone-900 tabular-nums">{formatPkr(group.total)}</p>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-stone-500 border-b border-stone-100">
            <th className="px-5 py-2 font-semibold">Booking</th>
            <th className="px-3 py-2 font-semibold">Round</th>
            <th className="px-3 py-2 font-semibold">EMD number</th>
            <th className="px-3 py-2 font-semibold">Issued</th>
            <th className="px-3 py-2 font-semibold">License</th>
            <th className="px-5 py-2 font-semibold text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {group.items.map((d) => (
            <tr key={d.roundId} className="border-b border-stone-50 last:border-0">
              <td className="px-5 py-2.5">
                <Link href={`/pnrs/${d.pnrId}`} className="font-mono font-medium text-indigo-600 hover:underline">
                  {d.pnrCode}
                </Link>
                <span className="text-[11px] text-stone-400">
                  {' '}
                  SR#{d.srNo}
                  {d.airlineCode ? ` · ${d.airlineCode}` : ''}
                  {d.branchName ? ` · ${d.branchName}` : ''}
                </span>
              </td>
              <td className="px-3 py-2.5 text-stone-600">{d.roundNumber}</td>
              <td className="px-3 py-2.5 font-mono text-stone-600">{d.emdNumber ?? '—'}</td>
              <td className="px-3 py-2.5 text-stone-600">
                {d.issuanceDate}
                {/* The decision date, not a deadline: refund on or before it
                    and re-issue after it, and this bill moves a cycle. */}
                {d.rollBy && (
                  <p className="text-[11px] text-stone-400">roll by {d.rollBy}</p>
                )}
                {d.lateRefund === 'after-billing' && (
                  <p className="text-[11px] text-amber-600">refunded too late</p>
                )}
                {d.lateRefund === 'date-unknown' && (
                  <p className="text-[11px] text-amber-600">refunded, no date</p>
                )}
              </td>
              <td className="px-3 py-2.5 text-stone-600">{d.licenseName ?? '—'}</td>
              <td className="px-5 py-2.5 text-right font-medium text-stone-900 tabular-nums">
                {formatPkr(d.emdAmount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
