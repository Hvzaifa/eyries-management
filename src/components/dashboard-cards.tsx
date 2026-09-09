'use client';

import { FileText, Users, Wallet, ArrowDownToLine, RotateCcw } from 'lucide-react';
import { summarizeDashboard, pnrCountLabel } from '@/lib/dashboard';
import { formatPkr } from '@/lib/format';
import type { PnrListRow } from '@/lib/pnrs';

/**
 * The five summary cards, totalled over the rows the filter bar leaves visible.
 *
 * Lives beside the table rather than on the page because the filters are table
 * state: the cards have to re-total on every keystroke and dropdown change, and
 * a server round-trip per filter change would make the table feel slower for no
 * gain — every row the user may see is already in the browser.
 */
export default function DashboardCards({
  rows,
  statusFilter,
}: {
  rows: PnrListRow[];
  statusFilter: string | null;
}) {
  const summary = summarizeDashboard(rows, statusFilter);

  const cards = [
    {
      label: pnrCountLabel(statusFilter),
      value: String(summary.pnrCount),
      icon: FileText,
      tint: 'bg-indigo-100 text-indigo-600',
    },
    {
      label: 'Total Seats',
      value: String(summary.totalSeats),
      icon: Users,
      tint: 'bg-sky-100 text-sky-600',
    },
    {
      label: 'Total EMD Value',
      value: formatPkr(summary.totalEmdValue),
      icon: Wallet,
      tint: 'bg-violet-100 text-violet-600',
    },
    {
      label: 'Total Paid',
      value: formatPkr(summary.totalPaid),
      icon: ArrowDownToLine,
      tint: 'bg-emerald-100 text-emerald-600',
    },
    {
      label: 'Total Refunded',
      value: formatPkr(summary.totalRefunded),
      icon: RotateCcw,
      tint: 'bg-amber-100 text-amber-600',
    },
  ];

  return (
    <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
              {card.label}
            </p>
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${card.tint}`}>
              <card.icon className="w-3.5 h-3.5" />
            </span>
          </div>
          <p className="mt-2 text-lg font-bold text-stone-900 tabular-nums">{card.value}</p>
        </div>
      ))}
    </section>
  );
}
