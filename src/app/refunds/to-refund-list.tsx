'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { formatPkr } from '@/lib/format';
import type { RoundToRefund } from '@/lib/pnrs';

/**
 * Rounds issued, paid to IATA and still unrefunded (owner, 2026-09-28).
 *
 * Head Office ticks rounds and takes them to the bulk refund screen, which is
 * where refunds are recorded — this list only finds them. Ticking is by
 * booking because that screen fetches rounds by PNR code.
 */
export default function ToRefundList({ rows, canRecord }: { rows: RoundToRefund[]; canRecord: boolean }) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.pnr, r.emdNumber, r.branchName, r.airlineCode, r.sector].some((v) => v?.toLowerCase().includes(q))
    );
  }, [rows, query]);

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
        <span className="text-[11px] text-stone-500">
          {visible.length} round{visible.length === 1 ? '' : 's'} · {formatPkr(total)}
        </span>
        {canRecord && picked.size > 0 && (
          <Link
            href={`/pnrs/bulk-refund?pnrs=${encodeURIComponent([...picked].join(','))}`}
            className="ml-auto inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-tr from-brand-dark to-brand rounded-xl shadow-sm"
          >
            Record refunds for {picked.size} booking{picked.size === 1 ? '' : 's'}
          </Link>
        )}
      </div>

      <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
        {visible.length === 0 ? (
          <div className="p-12 text-center text-sm text-stone-400">
            {rows.length === 0 ? 'Nothing waiting to be refunded.' : 'Nothing matches the search.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/50 text-xs font-medium text-stone-500">
                  {canRecord && (
                    <th className="px-3 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={allPicked}
                        onChange={() => setPicked(allPicked ? new Set() : new Set(visible.map((r) => r.pnr)))}
                        aria-label="Select every booking shown"
                        className="w-3.5 h-3.5 rounded border-stone-300 cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 font-medium">PNR</th>
                  <th className="px-4 py-3 font-medium">Round</th>
                  <th className="px-4 py-3 font-medium">EMD number</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Issued</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Paid to IATA</th>
                  <th className="px-4 py-3 font-medium">Branch</th>
                  <th className="px-4 py-3 font-medium">Airline</th>
                  <th className="px-4 py-3 font-medium">Seats / Sector</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Outbound</th>
                  <th className="px-4 py-3 font-medium text-right whitespace-nowrap">EMD amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {visible.map((r) => (
                  <tr key={r.roundId} className={picked.has(r.pnr) ? 'bg-brand-50/50' : 'hover:bg-stone-50/50'}>
                    {canRecord && (
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={picked.has(r.pnr)}
                          onChange={() => toggle(r.pnr)}
                          aria-label={`Select ${r.pnr}`}
                          className="w-3.5 h-3.5 rounded border-stone-300 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 font-mono font-medium text-brand">
                      <Link href={`/pnrs/${r.pnrId}`} className="hover:underline">{r.pnr}</Link>
                      {r.pnrStatus !== 'active' && <span className="ml-1.5 text-[10px] text-stone-400">{r.pnrStatus}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-amber-100 text-amber-700 text-xs font-bold">
                        {r.roundNumber}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-stone-600 whitespace-nowrap">{r.emdNumber ?? '—'}</td>
                    <td className="px-4 py-3 text-stone-600 whitespace-nowrap">{r.issuanceDate}</td>
                    <td className="px-4 py-3 text-stone-600 whitespace-nowrap">{r.paidToIataOn}</td>
                    <td className="px-4 py-3 text-stone-600">{r.branchName ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-stone-500">{r.airlineCode ?? '—'}</td>
                    <td className="px-4 py-3 text-stone-600 whitespace-nowrap">
                      {r.seats} <span className="text-stone-300">|</span> {r.sector ?? '—'}
                    </td>
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
