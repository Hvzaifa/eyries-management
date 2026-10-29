'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { formatPkr } from '@/lib/format';
import type { RoundToRefund } from '@/lib/pnrs';
import { requestEmdRefunds } from '@/app/pnrs/actions/emd';

type Show = 'all' | 'awaiting' | 'requested' | 'forfeited';

const bucketOf = (r: RoundToRefund): Exclude<Show, 'all'> =>
  r.forfeited ? 'forfeited' : r.requested ? 'requested' : 'awaiting';

/**
 * Paid EMDs whose refund is due (Phase 9 Step 3, A6): the ticket deadline
 * passed at least a day ago, every ticket is issued, or — with no deadline —
 * the outbound date passed.
 *
 * Anyone who sees a round here may mark it refund requested (a branch sees only
 * its own bookings). Requested rounds stay, labelled, until Head Office records
 * the refund (owner, 2026-10-28). Head Office takes ticked bookings to the bulk
 * refund screen, which is where refunds are recorded. Ticking is by booking
 * because that screen fetches rounds by PNR code.
 */
export default function ToRefundList({ rows, canRecord }: { rows: RoundToRefund[]; canRecord: boolean }) {
  const [query, setQuery] = useState('');
  const [show, setShow] = useState<Show>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (show === 'all' || bucketOf(r) === show) &&
        (!q || [r.pnr, r.emdNumber, r.branchName, r.airlineCode, r.sector].some((v) => v?.toLowerCase().includes(q)))
    );
  }, [rows, query, show]);
  const count = (b: Exclude<Show, 'all'>) => rows.filter((r) => bucketOf(r) === b).length;

  // The rounds still to request on the ticked bookings, among those shown.
  // Forfeited rounds are refunded directly once the penalty is paid, never requested.
  const toRequest = visible.filter((r) => picked.has(r.pnr) && !r.requested && !r.forfeited);
  const requestPicked = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await requestEmdRefunds(toRequest.map((r) => r.roundId));
      if (res?.error) {
        setMessage({ tone: 'error', text: res.error });
      } else {
        setMessage({ tone: 'ok', text: `Refund requested for ${toRequest.length} round${toRequest.length === 1 ? '' : 's'}.` });
        setPicked(new Set());
      }
    });
  };

  const total = visible.reduce((s, r) => s + Math.round(r.emdAmount * 100), 0) / 100;
  const allPicked = visible.length > 0 && visible.every((r) => picked.has(r.pnr));
  const toggle = (pnr: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(pnr)) n.delete(pnr);
      else n.add(pnr);
      return n;
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search PNR, EMD number, branch, sector..."
            className="w-full bg-white border border-stone-300 rounded-xl pl-9 pr-3 py-2 text-xs text-stone-800 placeholder-stone-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-light/50"
          />
        </div>
        <div className="inline-flex rounded-xl border border-stone-300 bg-white p-0.5 text-[11px] font-medium">
          {([
            ['all', `All ${rows.length}`],
            ['awaiting', `To request ${count('awaiting')}`],
            ['requested', `Requested ${count('requested')}`],
            // Cancelled bookings whose penalty is paid (Phase 9 Step 5).
            ...(count('forfeited') > 0 ? ([['forfeited', `Forfeited ${count('forfeited')}`]] as const) : []),
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setShow(value)}
              className={`px-3 py-1.5 rounded-lg cursor-pointer ${show === value ? 'bg-brand text-white' : 'text-stone-600 hover:bg-stone-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-stone-500">
          {visible.length} round{visible.length === 1 ? '' : 's'} · {formatPkr(total)}
        </span>
        {picked.size > 0 && (
          <div className="ml-auto flex flex-wrap gap-2">
            {toRequest.length > 0 && (
              <button
                onClick={requestPicked}
                disabled={isPending}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-brand-dark bg-white border border-brand-200 rounded-xl shadow-sm hover:bg-brand-50 disabled:opacity-50 cursor-pointer"
              >
                {isPending ? 'Requesting…' : `Mark ${toRequest.length} round${toRequest.length === 1 ? '' : 's'} refund requested`}
              </button>
            )}
            {canRecord && (
              <Link
                href={`/pnrs/bulk-refund?pnrs=${encodeURIComponent([...picked].join(','))}`}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-tr from-brand to-brand-light rounded-xl shadow-sm"
              >
                Record refunds for {picked.size} booking{picked.size === 1 ? '' : 's'}
              </Link>
            )}
          </div>
        )}
      </div>
      {message && (
        <p className={`text-xs ${message.tone === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>{message.text}</p>
      )}

      <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
        {visible.length === 0 ? (
          <div className="p-12 text-center text-sm text-stone-400">
            {rows.length === 0 ? 'Nothing waiting to be refunded.' : 'Nothing matches.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/50 text-xs font-medium text-stone-500">
                  <th className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allPicked}
                      onChange={() => setPicked(allPicked ? new Set() : new Set(visible.map((r) => r.pnr)))}
                      aria-label="Select every booking shown"
                      className="w-3.5 h-3.5 rounded border-stone-300 cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">PNR</th>
                  <th className="px-4 py-3 font-medium">Round</th>
                  <th className="px-4 py-3 font-medium">EMD number</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Issued</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Paid to IATA</th>
                  <th className="px-4 py-3 font-medium">Branch</th>
                  <th className="px-4 py-3 font-medium">Airline</th>
                  <th className="px-4 py-3 font-medium">Seats / Sector</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Ticket deadline</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Outbound</th>
                  <th className="px-4 py-3 font-medium text-right whitespace-nowrap">EMD amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {visible.map((r) => (
                  <tr key={r.roundId} className={picked.has(r.pnr) ? 'bg-brand-50/50' : 'hover:bg-stone-50/50'}>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={picked.has(r.pnr)}
                        onChange={() => toggle(r.pnr)}
                        aria-label={`Select ${r.pnr}`}
                        className="w-3.5 h-3.5 rounded border-stone-300 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3 font-mono font-medium text-brand-dark">
                      <Link href={`/pnrs/${r.pnrId}`} className="hover:underline">{r.pnr}</Link>
                      {r.pnrStatus !== 'active' && <span className="ml-1.5 text-[10px] text-stone-400">{r.pnrStatus}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-amber-100 text-amber-700 text-xs font-bold">
                        {r.roundNumber}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-stone-600 whitespace-nowrap">
                      {r.emdNumber ?? '—'}
                      {r.requested && (
                        <span className="ml-1.5 font-sans text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-sky-50 text-sky-700 border-sky-200">
                          Requested
                        </span>
                      )}
                      {r.forfeited && (
                        <span className="ml-1.5 font-sans text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-200">
                          Forfeited · penalty paid
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-stone-600 whitespace-nowrap">{r.issuanceDate}</td>
                    <td className="px-4 py-3 text-stone-600 whitespace-nowrap">
                      {r.paidToIataOn ?? '—'}
                      {/* No payment recorded: its remittance day passed, so it is taken as paid. */}
                      {r.paidAssumed && <span className="block text-[10px] text-stone-400">assumed</span>}
                    </td>
                    <td className="px-4 py-3 text-stone-600">{r.branchName ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-stone-500">{r.airlineCode ?? '—'}</td>
                    <td className="px-4 py-3 text-stone-600 whitespace-nowrap">
                      {r.seats} <span className="text-stone-300">|</span> {r.sector ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-stone-600 whitespace-nowrap">{r.ticketIssuanceDeadline ?? '—'}</td>
                    <td className="px-4 py-3 text-stone-600 whitespace-nowrap">{r.outboundDate ?? '—'}</td>
                    <td className="px-4 py-3 font-mono font-semibold text-right text-stone-900">{formatPkr(r.emdAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
