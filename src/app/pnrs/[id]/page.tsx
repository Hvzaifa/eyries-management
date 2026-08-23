import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPnrDetail } from '@/lib/pnrs';
import { getUrgency, todayIsoInPkt } from '@/lib/urgency';
import { formatPkr } from '@/lib/format';
import AppHeader from '@/components/app-header';
import {
  ArrowLeft,
  History,
  Scissors,
  Ticket,
  CircleDot,
  CalendarClock,
} from 'lucide-react';

const ROUND_STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  refund_requested: 'bg-sky-50 text-sky-700 border-sky-200',
  refunded: 'bg-violet-50 text-violet-700 border-violet-200',
  expired: 'bg-stone-100 text-stone-500 border-stone-200',
};

const PNr_STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
  completed: 'bg-sky-50 text-sky-700 border-sky-200',
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">{label}</p>
      <p className="mt-0.5 text-sm text-stone-800">{value ?? '—'}</p>
    </div>
  );
}

export default async function PnrDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const detail = await getPnrDetail(id);
  if (!detail) notFound();

  const today = todayIsoInPkt();
  const urgency = getUrgency(today, detail.rounds.find((r) => r.status === 'pending')?.deadlineDate ?? null, detail.status);

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader user={user} subtitle="PNR Detail" />

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-indigo-600 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to dashboard
        </Link>

        {/* Title block */}
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-stone-400">SR#{detail.srNo}</p>
              <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-stone-900 font-mono">
                {detail.pnr}
              </h1>
              <p className="text-sm text-stone-500 mt-1">
                {detail.investorCompany}
                {detail.airlineName ? ` · ${detail.airlineName}` : ''}
                {detail.sector ? ` · ${detail.sector}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs px-2.5 py-1 rounded-full border ${PNr_STATUS_STYLES[detail.status] ?? ''}`}>
                {detail.status}
              </span>
              {urgency !== 'grey' && detail.rounds.some((r) => r.status === 'pending') && (
                <span className={`text-xs px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 ${
                  urgency === 'red'
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : urgency === 'amber'
                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                }`}>
                  <CalendarClock className="w-3.5 h-3.5" />
                  {urgency === 'red' ? 'Due within 2 days' : urgency === 'amber' ? 'Due within 5 days' : 'On track'}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Core fields */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-stone-900 mb-4">Booking details</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-4">
              <Field label="Request date" value={detail.requestDate} />
              <Field label="Investor company" value={detail.investorCompany} />
              <Field label="License" value={detail.licenseName} />
              <Field label="Branch" value={detail.branchName} />
              <Field label="Segment" value={detail.segment} />
              <Field label="Airline" value={detail.airlineName ? `${detail.airlineCode} — ${detail.airlineName}` : null} />
              <Field label="Seats" value={detail.seats} />
              <Field label="Outbound" value={detail.outboundDate} />
              <Field label="Inbound" value={detail.inboundDate} />
              <Field label="Sector" value={<span className="font-mono text-[13px]">{detail.sector}</span>} />
              <Field label="PNR TL date" value={detail.pnrTlDate} />
              <Field label="GDS PNR" value={detail.gdsPnr ? <span className="font-mono">{detail.gdsPnr}</span> : null} />
              <Field label="Issued status" value={
                <span className={`text-[11px] px-2 py-0.5 rounded-full border ${
                  detail.issuedStatus === 'issued'
                    ? 'bg-sky-50 text-sky-700 border-sky-200'
                    : 'bg-stone-100 text-stone-500 border-stone-200'
                }`}>
                  {detail.issuedStatus}
                </span>
              } />
              <Field label="Deal %" value={detail.dealPct !== null ? `${detail.dealPct}%` : null} />
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-stone-900 mb-4">Money (PKR)</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <Field label="Fare per seat" value={formatPkr(detail.fare)} />
              <Field label="Total EMD value" value={
                <span className="font-semibold">{formatPkr(detail.totalEmdValue)}</span>
              } />
              <Field label="Airline taxes" value={formatPkr(detail.airlineTaxes)} />
              <Field label="PSF" value={formatPkr(detail.psf)} />
            </div>
            <p className="mt-4 text-[11px] text-stone-400">
              Total EMD value = seats × fare, calculated by the database — never typed in.
              EMD covers base fare only; taxes and PSF belong to the ticketing stage.
            </p>

            {detail.parentPnr && (
              <div className="mt-5 rounded-xl bg-indigo-50 border border-indigo-100 p-3.5">
                <p className="text-xs text-indigo-700 flex items-center gap-1.5">
                  <Scissors className="w-3.5 h-3.5" />
                  Child of{' '}
                  <Link href={`/pnrs/${detail.parentPnr.id}`} className="font-mono font-semibold underline">
                    {detail.parentPnr.pnr}
                  </Link>
                  {detail.parentAllocationsTotal !== null && (
                    <> · {detail.parentAllocationsTotal} seat{detail.parentAllocationsTotal === 1 ? '' : 's'} allocated to this child</>
                  )}
                </p>
              </div>
            )}

            {detail.childAllocations.length > 0 && (
              <div className="mt-5 rounded-xl bg-indigo-50 border border-indigo-100 p-3.5">
                <p className="text-xs font-medium text-indigo-700 flex items-center gap-1.5 mb-2">
                  <Scissors className="w-3.5 h-3.5" /> Split across children
                </p>
                <ul className="space-y-1">
                  {detail.childAllocations.map((a) => (
                    <li key={a.childPnrId} className="text-xs text-indigo-600">
                      <Link href={`/pnrs/${a.childPnrId}`} className="font-mono font-semibold underline">
                        {a.childPnrCode}
                      </Link>{' '}
                      — {a.seatsAllocated} seats
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        {/* EMD rounds */}
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-stone-900 mb-1">EMD rounds</h2>
          <p className="text-[11px] text-stone-400 mb-4">
            Open-ended list — a round is added each time the deposit is extended or topped up.
          </p>

          {detail.rounds.length === 0 ? (
            <p className="text-sm text-stone-400 py-6 text-center">
              No EMD rounds recorded for this booking yet.
            </p>
          ) : (
            <ol className="space-y-3">
              {detail.rounds.map((round) => {
                const overdue =
                  round.status === 'pending' && round.deadlineDate < today;
                return (
                  <li
                    key={round.id}
                    className={`rounded-xl border p-4 ${
                      overdue ? 'border-red-200 bg-red-50/50' : 'border-stone-200 bg-stone-50/60'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center">
                          {round.roundNumber}
                        </span>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${ROUND_STATUS_STYLES[round.status] ?? ''}`}>
                          {round.status.replace('_', ' ')}
                        </span>
                        {overdue && (
                          <span className="text-[11px] text-red-600 font-medium inline-flex items-center gap-1">
                            <CircleDot className="w-3 h-3" /> past deadline
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-semibold text-stone-900 tabular-nums">
                        {formatPkr(round.emdAmount)}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-2 text-xs text-stone-600">
                      <div><span className="text-stone-400">Issued</span> {round.issuanceDate}</div>
                      <div><span className="text-stone-400">Payment %</span> {round.paymentPct}%</div>
                      <div><span className="text-stone-400">Deadline</span> {round.deadlineDate}{round.deadlineTime ? ` ${round.deadlineTime}` : ''}</div>
                      <div><span className="text-stone-400">EMD #</span> {round.emdNumber ?? '—'}</div>
                      <div><span className="text-stone-400">Refund</span> {round.refundAmount !== null ? `${formatPkr(round.refundAmount)} on ${round.refundDate}` : '—'}</div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* Ticketing */}
        {detail.ticketing && (
          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-stone-900 mb-4 flex items-center gap-1.5">
              <Ticket className="w-4 h-4 text-sky-500" /> Ticketing stage
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-4">
              <Field label="Name update deadline" value={detail.ticketing.nameUpdateDeadline} />
              <Field label="Issuance deadline" value={detail.ticketing.ticketIssuanceDeadline} />
              <Field label="Status" value={detail.ticketing.status} />
              <Field label="Tickets issued" value={detail.ticketing.ticketsIssued} />
              <Field label="Balance tickets" value={detail.ticketing.balanceTickets} />
            </div>
          </section>
        )}

        {/* Activity history */}
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-stone-900 mb-4 flex items-center gap-1.5">
            <History className="w-4 h-4 text-violet-500" /> Change history
          </h2>
          {detail.activityLog.length === 0 ? (
            <p className="text-sm text-stone-400 py-4 text-center">
              No changes recorded yet. Every edit made through the app will appear here.
            </p>
          ) : (
            <ul className="space-y-3">
              {detail.activityLog.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
                  <div>
                    <span className="font-mono font-medium text-stone-800">{entry.fieldName}</span>{' '}
                    changed from{' '}
                    <span className="font-mono text-red-600 line-through decoration-red-300">
                      {entry.oldValue ?? '(empty)'}
                    </span>{' '}
                    to{' '}
                    <span className="font-mono text-emerald-700">{entry.newValue ?? '(empty)'}</span>
                    <span className="block text-[11px] text-stone-400 mt-0.5">
                      {new Date(entry.changedAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}
                      {' · '}
                      {entry.tableName}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="border-t border-stone-200 py-4">
        <p className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 text-[11px] text-stone-400">
          Eyries EMD · amounts in PKR · created {new Date(detail.createdAt).toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' })}
        </p>
      </footer>
    </div>
  );
}


