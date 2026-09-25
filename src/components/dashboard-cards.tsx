'use client';

import { FileText, Users, Wallet, ArrowDownToLine, RotateCcw, CalendarClock } from 'lucide-react';
import { summarizeDashboard, pnrCountLabel } from '@/lib/dashboard';
import { emdsToIssueOn } from '@/lib/issuance';
import { formatPkr } from '@/lib/format';
import type { PnrListRow } from '@/lib/pnrs';

/**
 * The summary cards, totalled over the rows the filter bar leaves visible.
 *
 * Lives beside the table rather than on the page because the filters are table
 * state: the cards have to re-total on every keystroke and dropdown change, and
 * a server round-trip per filter change would make the table feel slower for no
 * gain — every row the user may see is already in the browser.
 */
export default function DashboardCards({
  rows,
  statusFilter,
  holder,
  issuanceDate,
  onClear,
}: {
  rows: PnrListRow[];
  statusFilter: string | null;
  /**
   * The date picked in the "EMDs to be issued" filter, or null.
   *
   * When set, the rows arriving here are already narrowed to it, so the card is
   * counting the same bookings the table is showing.
   */
  issuanceDate?: string | null;
  /**
   * The one holder in view, or null for all of them. When set, `rows` are
   * already projected to that holder's share (`lib/holder-view.ts`), so the
   * totals below are theirs — and the labels have to say so. A card reading
   * "Total Seats" above one agent's share is the same failure `pnrCountLabel`
   * exists to prevent.
   */
  holder?: string | null;
  onClear?: () => void;
}) {
  const summary = summarizeDashboard(rows, statusFilter);
  const share = Boolean(holder);
  const issuance = emdsToIssueOn(rows, issuanceDate ?? null);

  const cards = [
    {
      label: pnrCountLabel(statusFilter),
      value: String(summary.pnrCount),
      icon: FileText,
      tint: 'bg-indigo-100 text-indigo-600',
    },
    {
      label: share ? 'Seats Held' : 'Total Seats',
      value: String(summary.totalSeats),
      icon: Users,
      tint: 'bg-sky-100 text-sky-600',
    },
    {
      label: share ? 'EMD Value (Share)' : 'Total EMD Value',
      value: formatPkr(summary.totalEmdValue),
      icon: Wallet,
      tint: 'bg-violet-100 text-violet-600',
    },
    {
      label: share ? 'EMD Issued (Share)' : 'EMD Issued',
      value: formatPkr(summary.totalIssued),
      icon: ArrowDownToLine,
      tint: 'bg-emerald-100 text-emerald-600',
    },
    {
      label: share ? 'Refunded (Share)' : 'Total Refunded',
      value: formatPkr(summary.totalRefunded),
      icon: RotateCcw,
      tint: 'bg-amber-100 text-amber-600',
    },
    {
      // Blank until a date is picked (owner's choice, 2026-09-23) — a figure
      // with no date against it would be a different question answered.
      label: issuance.date ? `EMDs To Issue · ${issuance.date}` : 'EMDs To Issue',
      value: issuance.date ? formatPkr(issuance.total) : '—',
      hint: issuance.date
        ? `${issuance.bookings} booking${issuance.bookings === 1 ? '' : 's'}` +
          (issuance.undetermined > 0
            ? ` · ${issuance.undetermined} need${issuance.undetermined === 1 ? 's' : ''} a manual amount`
            : '')
        : 'pick a date to see the day’s work',
      icon: CalendarClock,
      tint: 'bg-rose-100 text-rose-600',
    },
  ];

  return (
    <div className="space-y-3">
      {holder && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs text-indigo-800">
          <span>
            Showing <strong>{holder}</strong>&rsquo;s share of each booking — their seats, and their
            part of the money by seat count. Booking totals are on the booking&rsquo;s own page.
          </span>
          {onClear && (
            <button
              onClick={onClear}
              className="ml-auto font-semibold text-indigo-700 hover:text-indigo-900 underline underline-offset-2 cursor-pointer"
            >
              Show all holders
            </button>
          )}
        </div>
      )}
      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
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
          {'hint' in card && card.hint && (
            <p className="mt-0.5 text-[10px] text-stone-400 leading-tight">{card.hint}</p>
          )}
          </div>
        ))}
      </section>
    </div>
  );
}
