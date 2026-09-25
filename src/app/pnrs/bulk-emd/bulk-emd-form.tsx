'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Ban } from 'lucide-react';
import { issueEmdRounds } from '../actions/bulk-emd';
import type { BulkEmdCandidate } from '@/lib/bulk-emd';
import { emdAmountFor } from '@/lib/emd';
import { formatEmdNumberInput, formatPkr } from '@/lib/format';

const inputCls =
  'w-full bg-stone-50 border border-stone-300 rounded-lg px-2.5 py-1.5 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400 transition-colors';

interface RowState {
  emdNumber: string;
  pct: string;
  amount: string;
  deadline: string;
  licenseId: string;
  amountTouched: boolean;
}

/**
 * One row per booking, with everything derivable already filled in.
 *
 * The amount follows the percentage until someone types over it, exactly as the
 * single Add Round modal behaves — the two read from the same
 * `emdAmountFor()`, so a bulk run cannot compute a different figure from the
 * one-at-a-time path.
 *
 * Bookings that cannot take an EMD are shown greyed with the reason rather than
 * hidden: someone who ticked six boxes and sees five rows cannot tell which one
 * went missing.
 */
export default function BulkEmdForm({
  candidates,
  licenses,
  today,
  max,
}: {
  candidates: BulkEmdCandidate[];
  licenses: { id: string; name: string }[];
  today: string;
  max: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const issuable = useMemo(() => candidates.filter((c) => !c.blockedReason), [candidates]);
  const blocked = useMemo(() => candidates.filter((c) => c.blockedReason), [candidates]);

  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      candidates.map((c) => [
        c.pnrId,
        {
          emdNumber: '',
          pct: c.suggestedPct === null ? '' : String(c.suggestedPct),
          amount: c.suggestedAmount === null ? '' : String(c.suggestedAmount),
          deadline: c.suggestedDeadline ?? '',
          licenseId: '',
          amountTouched: false,
        },
      ])
    )
  );

  const update = (pnrId: string, patch: Partial<RowState>) =>
    setRows((r) => ({ ...r, [pnrId]: { ...r[pnrId], ...patch } }));

  const onPctChange = (c: BulkEmdCandidate, value: string) => {
    const row = rows[c.pnrId];
    if (row.amountTouched) {
      update(c.pnrId, { pct: value });
      return;
    }
    const calculated = emdAmountFor(c.seats, c.fare, value === '' ? null : Number(value));
    update(c.pnrId, { pct: value, amount: calculated === null ? '' : String(calculated) });
  };

  const totalToIssue = issuable.reduce((sum, c) => {
    const amount = Number(rows[c.pnrId]?.amount);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  const readyCount = issuable.filter((c) => {
    const r = rows[c.pnrId];
    return r?.emdNumber.trim() !== '' && r?.pct !== '' && r?.amount !== '' && r?.deadline !== '';
  }).length;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const payload = issuable.map((c) => {
      const r = rows[c.pnrId];
      return {
        pnrId: c.pnrId,
        emdNumber: r.emdNumber,
        paymentPct: Number(r.pct),
        emdAmount: Number(r.amount),
        deadlineDate: r.deadline,
        licenseId: r.licenseId || null,
      };
    });

    startTransition(async () => {
      const res = await issueEmdRounds(payload);
      if (!res.ok) {
        setError(res.error ?? 'Something went wrong.');
        return;
      }
      // Straight back to the dashboard, where the issued bookings now show
      // their new time limit.
      router.push('/');
      router.refresh();
    });
  };

  if (issuable.length === 0) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-3">
        <p className="text-sm font-semibold text-stone-800">
          None of the selected bookings can take an EMD right now.
        </p>
        {blocked.map((c) => (
          <BlockedRow key={c.pnrId} candidate={c} />
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Nothing was issued.</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
        <table className="min-w-max w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-[#FAF7F1] text-left text-[11px] uppercase tracking-wide text-stone-500">
              <th className="px-3 py-3 font-semibold">Booking</th>
              <th className="px-3 py-3 font-semibold">Seats × fare</th>
              <th className="px-3 py-3 font-semibold">Issue by</th>
              <th className="px-3 py-3 font-semibold">Round</th>
              <th className="px-3 py-3 font-semibold w-24">%</th>
              <th className="px-3 py-3 font-semibold w-40">EMD amount</th>
              <th className="px-3 py-3 font-semibold w-44">
                EMD number <span className="text-red-500">*</span>
              </th>
              <th className="px-3 py-3 font-semibold w-40">Secures until</th>
              <th className="px-3 py-3 font-semibold w-40">Issued by license</th>
            </tr>
          </thead>
          <tbody>
            {issuable.map((c) => {
              const r = rows[c.pnrId];
              const calculated = emdAmountFor(c.seats, c.fare, r.pct === '' ? null : Number(r.pct));
              const edited =
                r.amountTouched && calculated !== null && r.amount !== '' && Number(r.amount) !== calculated;
              const lapsed = c.issueBy !== null && c.issueBy < today;

              return (
                <tr key={c.pnrId} className="border-b border-stone-100 last:border-0 align-top">
                  <td className="px-3 py-3">
                    <Link
                      href={`/pnrs/${c.pnrId}`}
                      target="_blank"
                      className="font-mono font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                    >
                      {c.pnrCode}
                    </Link>
                    <p className="text-[11px] text-stone-400">
                      SR#{c.srNo}
                      {c.airlineCode ? ` · ${c.airlineCode}` : ''}
                      {c.branchName ? ` · ${c.branchName}` : ''}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-stone-600 whitespace-nowrap">
                    {c.seats} × {formatPkr(c.fare)}
                    <p className="text-[11px] text-stone-400">{formatPkr(c.totalEmdValue)} total</p>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={lapsed ? 'text-red-600 font-medium' : 'text-stone-600'}>
                      {c.issueBy ?? '—'}
                    </span>
                    {lapsed && <p className="text-[11px] text-red-500">overdue</p>}
                  </td>
                  <td className="px-3 py-3 text-stone-600">
                    {c.roundNumber}
                    {c.roundsIssued > 0 && (
                      <p className="text-[11px] text-stone-400">{c.roundsIssued} issued</p>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={r.pct}
                      onChange={(e) => onPctChange(c, e.target.value)}
                      className={inputCls}
                      placeholder="15"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={r.amount}
                      onChange={(e) => update(c.pnrId, { amount: e.target.value, amountTouched: true })}
                      className={inputCls}
                    />
                    <p className="mt-0.5 text-[11px] text-stone-400">
                      {calculated === null ? 'enter a %' : formatPkr(calculated)}
                      {edited && <span className="text-amber-600"> · edited</span>}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={r.emdNumber}
                      onChange={(e) =>
                        update(c.pnrId, { emdNumber: formatEmdNumberInput(e.target.value) })
                      }
                      className={`${inputCls} font-mono`}
                      placeholder="123 4567890123"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="date"
                      value={r.deadline}
                      onChange={(e) => update(c.pnrId, { deadline: e.target.value })}
                      className={inputCls}
                    />
                    {!c.suggestedDeadline && (
                      <p className="mt-0.5 text-[11px] text-stone-400">no policy date — enter it</p>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={r.licenseId}
                      onChange={(e) => update(c.pnrId, { licenseId: e.target.value })}
                      className={`${inputCls} cursor-pointer`}
                    >
                      <option value="">{c.licenseName ?? '— booking’s license —'}</option>
                      {licenses.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {blocked.length > 0 && (
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm space-y-2">
          <p className="text-xs font-semibold text-stone-700">
            Left out of this batch ({blocked.length})
          </p>
          {blocked.map((c) => (
            <BlockedRow key={c.pnrId} candidate={c} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
        <div className="text-xs text-stone-600">
          <p>
            <strong className="text-stone-900">{readyCount}</strong> of {issuable.length} ready ·{' '}
            <strong className="text-stone-900">{formatPkr(totalToIssue)}</strong> to be secured
          </p>
          <p className="text-[11px] text-stone-400 mt-0.5">
            All or nothing — if one row is wrong, none are issued. Up to {max} bookings per batch.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="px-4 py-2 text-xs font-medium rounded-xl hover:bg-stone-100 text-stone-600 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isPending || readyCount === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-tr from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 shadow-md shadow-indigo-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-4 h-4" />
            {isPending
              ? 'Issuing…'
              : `Issue ${issuable.length} EMD${issuable.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </form>
  );
}

function BlockedRow({ candidate }: { candidate: BulkEmdCandidate }) {
  return (
    <div className="flex items-start gap-2 text-xs text-stone-500">
      <Ban className="w-3.5 h-3.5 shrink-0 mt-0.5 text-stone-400" />
      <span>
        <Link
          href={`/pnrs/${candidate.pnrId}`}
          target="_blank"
          className="font-mono text-indigo-600 hover:underline"
        >
          {candidate.pnrCode}
        </Link>{' '}
        — {candidate.blockedReason}
      </span>
    </div>
  );
}
