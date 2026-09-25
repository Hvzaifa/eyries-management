'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowUpDown, Search, Sun, AlertTriangle, CalendarClock, FilePlus2, X } from 'lucide-react';
import Link from 'next/link';
import { BOT_HOLDER, COMPANY_HOLDER } from '@/lib/inventory';
import { isPartialView, projectRowToHolder } from '@/lib/holder-view';
import { matchesIssuanceDate, nextEmdLabel, issuanceDates } from '@/lib/issuance';
import { diffInDays, getUrgency, type Urgency } from '@/lib/urgency';
import type { PnrListRow } from '@/lib/pnrs';
import { formatNumber, formatPkr } from '@/lib/format';
import DashboardCards from '@/components/dashboard-cards';

const URGENCY_STYLES = {
  red: {
    badge: 'bg-red-50 border-red-200 text-red-700',
    dot: 'bg-red-500',
    rowBorder: 'border-l-[3px] border-l-red-400',
  },
  amber: {
    badge: 'bg-amber-50 border-amber-200 text-amber-700',
    dot: 'bg-amber-500',
    rowBorder: 'border-l-[3px] border-l-amber-400',
  },
  green: {
    badge: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    dot: 'bg-emerald-500',
    rowBorder: '',
  },
  grey: {
    badge: 'bg-stone-100 border-stone-200 text-stone-500',
    dot: 'bg-stone-400',
    rowBorder: '',
  },
} as const;

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
  completed: 'bg-sky-50 text-sky-700 border-sky-200',
};

function fmtDate(v: unknown): string {
  return typeof v === 'string' && v ? v : '—';
}

export default function PnrTable({
  rows,
  todayIso,
  canIssueEmds = false,
}: {
  rows: PnrListRow[];
  todayIso: string;
  /** Head Office only: tick bookings and issue their EMDs in one pass. */
  canIssueEmds?: boolean;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'outboundDate', desc: false }]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  /**
   * The holder in view, held here rather than read back out of `columnFilters`.
   * It drives two things at once — which rows the table keeps AND how each row
   * is projected — and a controlled select cannot be left showing a holder that
   * has since disappeared from the options.
   */
  const [holderFilter, setHolderFilter] = useState('');
  /**
   * Bookings ticked for bulk EMD issuance, by id.
   *
   * Kept as ids rather than row indexes so a selection survives sorting and
   * filtering — a booking ticked, then filtered out of view, is still ticked
   * when the filter is cleared.
   */
  const [selected, setSelected] = useState<Set<string>>(new Set());

  /**
   * The day whose EMD issuance the user is looking at, or '' for none.
   *
   * Held here as well as in `columnFilters` for the same reason as the holder:
   * it drives the card above the table, not only which rows survive, and a
   * controlled input must always show the value actually in force.
   */
  const [issuanceDate, setIssuanceDate] = useState('');

  const urgencyCounts = useMemo(() => {
    const counts = { red: 0, amber: 0 };
    for (const r of rows) {
      // Same date the Next Deadline column shows. Counting only rounds already
      // issued left a booking whose FIRST EMD was due tomorrow out of the
      // "needs attention" banner entirely.
      const u = getUrgency(todayIso, r.nextIssuanceDeadline, r.status);
      if (u === 'red') counts.red++;
      else if (u === 'amber') counts.amber++;
    }
    return counts;
  }, [rows, todayIso]);

  /**
   * With one holder selected, every row becomes that holder's SHARE of its
   * booking: their seats, and their part of the money (`lib/holder-view.ts`).
   * The table, its sorting and the cards all read these rows, so the screen
   * cannot show one holder's seats beside another's totals.
   *
   * The `useMemo` is load-bearing, not tidiness: a fresh array on every render
   * rebuilds every row object and invalidates the memoised filtered model the
   * cards read below.
   */
  const viewRows = useMemo(
    () => (holderFilter ? rows.map((r) => projectRowToHolder(r, holderFilter)) : rows),
    [rows, holderFilter]
  );

  const columns = useMemo<ColumnDef<PnrListRow>[]>(
    () => [
      // accessor must match the PnrListRow field name — 'sr_no' (the DB column)
      // silently rendered an empty column, because TanStack finds no such key.
      { accessorKey: 'srNo', header: 'SR#' },
      { accessorKey: 'requestDate', header: 'Request Date', cell: (c) => fmtDate(c.getValue()) },
      { accessorKey: 'investorCompany', header: 'Investor Company', cell: (c) => (
          <span className="font-medium text-stone-800">{c.getValue<string>()}</span>
        ) },
      { accessorKey: 'licenseName', header: 'License', cell: (c) => c.getValue<string>() ?? '—' },
      { accessorKey: 'branchName', header: 'Branch', filterFn: 'equalsString' },
      { accessorKey: 'pnr', header: 'PNR', cell: (c) => (
          <Link
            href={`/pnrs/${c.row.original.id}`}
            className="font-mono text-indigo-600 hover:text-indigo-800 hover:underline"
          >
            {c.getValue<string>()}
          </Link>
        ) },
      { accessorKey: 'gdsPnr', header: 'GDS PNR', cell: (c) => c.getValue<string>() ?? '—' },
      { accessorKey: 'segment', header: 'Segment' },
      { accessorKey: 'airlineCode', header: 'Airline', filterFn: 'equalsString' },
      { accessorKey: 'seats', header: 'Seats' },
      // Who holds the seats (phase 6). Derived server-side from the seat ledger,
      // so this column and the booking page can never disagree.
      {
        accessorKey: 'holder',
        header: 'Holder',
        // Filters on holderKeys, not on the displayed sentence: picking
        // "QFC Group" must find every booking they hold seats on, including the
        // ones they share with another agent or with the company.
        filterFn: (row, _id, value) => row.original.holderKeys.includes(String(value)),
        cell: (c) => {
          const r = c.row.original;
          // Filtered to one holder: name them, and say how much of the booking
          // is theirs. Without the count a 30-seat share of a 99-seat booking
          // would read exactly like a 30-seat booking.
          if (r.holderView) {
            const { holder, bookingSeats } = r.holderView;
            return (
              <span className={holder === COMPANY_HOLDER ? 'text-stone-500' : 'text-stone-800'}>
                {holder}
                {isPartialView(r) && (
                  <span className="text-stone-400"> ({r.seats} of {bookingSeats})</span>
                )}
              </span>
            );
          }
          const label = c.getValue<string>();
          if (label === COMPANY_HOLDER) {
            return <span className="text-stone-500">{COMPANY_HOLDER}</span>;
          }
          return <span className="text-stone-800">{label}</span>;
        },
      },
      { accessorKey: 'outboundDate', header: 'Outbound', cell: (c) => fmtDate(c.getValue()), sortingFn: (a, b) => {
          const av = a.original.outboundDate ?? '';
          const bv = b.original.outboundDate ?? '';
          if (!av && !bv) return 0;
          if (!av) return 1;
          if (!bv) return -1;
          return av.localeCompare(bv);
        } },
      { accessorKey: 'inboundDate', header: 'Inbound', cell: (c) => fmtDate(c.getValue()) },
      { accessorKey: 'sector', header: 'Sector', cell: (c) => (
          <span className="font-mono text-[11px]">{c.getValue<string>() ?? '—'}</span>
        ) },
      { accessorKey: 'pnrTlDate', header: 'PNR TL Date', cell: (c) => fmtDate(c.getValue()) },
      { accessorKey: 'dealPct', header: 'Deal %', cell: (c) => {
          const v = c.getValue<number | null>();
          return v === null || v === undefined ? '—' : `${v}%`;
        } },
      { accessorKey: 'issuedStatus', header: 'Issued', cell: (c) => (
          <span className={`text-[11px] px-1.5 py-0.5 rounded-full border ${
            c.getValue<string>() === 'issued'
              ? 'bg-sky-50 text-sky-700 border-sky-200'
              : 'bg-stone-100 text-stone-500 border-stone-200'
          }`}>
            {c.getValue<string>()}
          </span>
        ) },
      { accessorKey: 'airlineTaxes', header: 'Taxes (PKR)', cell: (c) => {
          const v = c.getValue<number | null>();
          return v === null || v === undefined ? '—' : formatNumber(v);
        } },
      { accessorKey: 'psf', header: 'PSF (PKR)', cell: (c) => {
          const v = c.getValue<number | null>();
          return v === null || v === undefined ? '—' : formatNumber(v);
        } },
      { accessorKey: 'fare', header: 'Fare (PKR)', cell: (c) => formatNumber(c.getValue<number>()) },
      { accessorKey: 'totalEmdValue', header: 'Total EMD Value (PKR)', cell: (c) => formatPkr(c.getValue<number | null>()) },
      { accessorKey: 'status', header: 'Status', filterFn: 'equalsString', cell: (c) => (
          <span className={`text-[11px] px-2 py-0.5 rounded-full border ${STATUS_STYLES[c.getValue<string>()] ?? ''}`}>
            {c.getValue<string>()}
          </span>
        ) },
      /*
       * When the next EMD must be issued — and WHICH one.
       *
       * This used to read `nextPendingDeadline`, the earliest deadline among
       * rounds already issued, and so printed "No issued round" against a
       * booking that had never had an EMD. That is exactly backwards: a booking
       * with no rounds is the one with work outstanding, and its first EMD may
       * be due tomorrow. `nextIssuanceDeadline` falls back to `pnr_tl_date`,
       * which is the time limit for the first EMD (owner, 2026-09-23).
       *
       * The small line underneath names the round — "1st EMD", "2nd EMD" — so a
       * date alone never leaves someone guessing what has to be done by it.
       */
      {
        id: 'nextIssuance',
        header: 'Next Deadline',
        accessorFn: (r) => r.nextIssuanceDeadline ?? '',
        sortingFn: (a, b) =>
          (a.original.nextIssuanceDeadline ?? '').localeCompare(
            b.original.nextIssuanceDeadline ?? ''
          ),
        // Shared with the card above, so the two can never disagree about which
        // bookings a picked date covers.
        filterFn: (row, _columnId, filterValue) =>
          !filterValue || matchesIssuanceDate(row.original, String(filterValue)),
        cell: (c) => {
          const row = c.row.original;
          if (row.status !== 'active') {
            const s = URGENCY_STYLES.grey;
            return (
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] whitespace-nowrap font-medium ${s.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                {row.status === 'cancelled' ? 'Cancelled' : 'Completed'}
              </span>
            );
          }

          const which = nextEmdLabel(row.roundsIssued);
          const deadline = row.nextIssuanceDeadline;
          // Coloured by the date actually shown — reading one date and tinting
          // by another is how a red badge ends up beside a comfortable deadline.
          const u = getUrgency(todayIso, deadline, row.status);
          const s = URGENCY_STYLES[u];
          const label = !deadline
            ? 'No deadline recorded'
            : deadline < todayIso
              ? `Overdue since ${deadline}`
              : `Issue by ${deadline}`;

          return (
            <span className="inline-flex flex-col gap-0.5">
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] whitespace-nowrap font-medium ${s.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                {label}
              </span>
              <span className="text-[10px] text-stone-400">
                {which}
                {row.nextEmdAmount !== null && ` · ${formatPkr(row.nextEmdAmount)}`}
              </span>
            </span>
          );
        },
      },
      /*
       * IATA payment — its OWN column and its OWN colour, sitting beside the
       * issuance deadline rather than merged into it (owner ruling,
       * 2026-09-22). The two measure different things against different
       * counterparties: "issue the next EMD by X" is the airline's time limit
       * to keep the PNR secured, "pay IATA by Y" is money leaving the company.
       * A booking is routinely relaxed on one and urgent on the other, and a
       * single merged colour would hide whichever is not driving it.
       *
       * The date is never stored — it is read from the remittance calendar
       * using the day each EMD was issued.
       */
      {
        id: 'iata',
        header: 'IATA Payment',
        accessorFn: (r) => r.nextIataPayment ?? '',
        sortingFn: (a, b) =>
          (a.original.nextIataPayment ?? '').localeCompare(b.original.nextIataPayment ?? ''),
        cell: (c) => {
          const row = c.row.original;
          if (row.status !== 'active') {
            return <span className="text-[11px] text-stone-400">—</span>;
          }
          if (row.nextIataPayment === null) {
            // Nothing owed at all, or owed but outside the loaded calendar —
            // which is a gap to close, not a settled debt, so it is not silent.
            return row.iataUndated ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] whitespace-nowrap font-medium bg-amber-50 border-amber-200 text-amber-700">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Not in calendar
              </span>
            ) : (
              <span className="text-[11px] text-stone-400">Nothing owed</span>
            );
          }
          const days = diffInDays(todayIso, row.nextIataPayment);
          const u: Urgency = days < 0 || days <= 2 ? 'red' : days <= 5 ? 'amber' : 'green';
          const s = URGENCY_STYLES[u];
          const label =
            days < 0
              ? `Overdue since ${row.nextIataPayment}`
              : days === 0
                ? `Pay today (${row.nextIataPayment})`
                : `Pay ${row.nextIataPayment}`;
          return (
            <span className="inline-flex flex-col gap-0.5">
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] whitespace-nowrap font-medium ${s.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                {label}
              </span>
              <span className="text-[10px] text-stone-400 tabular-nums">
                {formatPkr(row.iataUnpaidAmount)}
              </span>
            </span>
          );
        },
      },
    ],
    [todayIso]
  );

  const table = useReactTable({
    data: viewRows,
    columns,
    state: { sorting, globalFilter, columnFilters },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue).toLowerCase();
      // Primitives and arrays of primitives only. `holderParts` is an array of
      // objects, and stringifying one yields "[object Object]" — which would
      // make a search for "o" or "ct" match every booking on the dashboard.
      return Object.values(row.original).some((v) => {
        if (v === null || v === undefined) return false;
        if (Array.isArray(v)) {
          return v.some((item) => typeof item !== 'object' && String(item).toLowerCase().includes(q));
        }
        if (typeof v === 'object') return false;
        return String(v).toLowerCase().includes(q);
      });
    },
  });

  const branchOptions = useMemo(
    () => [...new Set(rows.map((r) => r.branchName).filter(Boolean))] as string[],
    [rows]
  );
  const airlineOptions = useMemo(
    () => [...new Set(rows.map((r) => r.airlineCode).filter(Boolean))] as string[],
    [rows]
  );
  // Holder options: every agent that holds seats, plus the company and the bot
  // where they do. Built from holderKeys so a shared booking contributes each of
  // its agents, and sorted so the two fixed values lead.
  const holderOptions = useMemo(() => {
    const all = new Set<string>();
    for (const r of rows) for (const k of r.holderKeys) all.add(k);
    const fixed = [COMPANY_HOLDER, BOT_HOLDER].filter((v) => all.has(v));
    const agents = [...all]
      .filter((h) => h !== COMPANY_HOLDER && h !== BOT_HOLDER)
      .sort((a, b) => a.localeCompare(b));
    return [...fixed, ...agents];
  }, [rows]);

  const setSelectFilter = (id: string, value: string) => {
    setColumnFilters((prev) => {
      const rest = prev.filter((f) => f.id !== id);
      return value ? [...rest, { id, value }] : rest;
    });
  };

  const setHolder = (value: string) => {
    setHolderFilter(value);
    setSelectFilter('holder', value);
  };

  const setIssuanceDay = (value: string) => {
    setIssuanceDate(value);
    setSelectFilter('nextIssuance', value);
  };

  /** Dates that actually have EMDs waiting, so the picker can point at them. */
  const daysWithWork = useMemo(() => issuanceDates(rows), [rows]);

  // A holder can vanish from the list — their seats released, or the bookings
  // they held filtered away by the branch scope. Left alone, the filter would
  // keep matching nothing: an empty table under cards reading zero.
  useEffect(() => {
    if (holderFilter && !holderOptions.includes(holderFilter)) setHolder('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holderOptions, holderFilter]);

  const visibleRows = table.getRowModel().rows;

  // "Select all" means the rows the filters currently leave visible, not every
  // booking in the database — ticking a box should never reach past what the
  // person can see.
  const visibleIds = visibleRows.map((r) => r.original.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someVisibleSelected = visibleIds.some((id) => selected.has(id));

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) for (const id of visibleIds) next.delete(id);
      else for (const id of visibleIds) next.add(id);
      return next;
    });

  // What the cards summarise: every filter the table applies, including the
  // search box. The status filter is passed separately so the summary knows
  // whether to fall back to its active-only default (see lib/dashboard.ts).
  //
  // Not wrapped in useMemo: `getFilteredRowModel()` is memoised by TanStack and
  // returns a new model only when the filters actually change, whereas `table`
  // itself is a stable reference — so a useMemo keyed on it would hand back a
  // stale set of rows and freeze the cards on the first filter applied.
  const filteredRows = table.getFilteredRowModel().rows.map((r) => r.original);
  const statusFilter =
    (columnFilters.find((f) => f.id === 'status')?.value as string | undefined) ?? null;

  return (
    <div className="space-y-4">
      <DashboardCards
        rows={filteredRows}
        statusFilter={statusFilter}
        holder={holderFilter || null}
        issuanceDate={issuanceDate || null}
        onClear={() => setHolder('')}
      />

      {canIssueEmds && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3">
          <span className="text-sm text-indigo-900">
            <strong>{selected.size}</strong> booking{selected.size === 1 ? '' : 's'} selected
          </span>
          <button
            onClick={() => setSelected(new Set())}
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:text-indigo-900 cursor-pointer"
          >
            <X className="w-3 h-3" />
            Clear
          </button>
          <Link
            href={`/pnrs/bulk-emd?ids=${[...selected].join(',')}`}
            className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-tr from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 shadow-md shadow-indigo-500/25 transition-all"
          >
            <FilePlus2 className="w-4 h-4" />
            Issue EMDs
          </Link>
        </div>
      )}

      {urgencyCounts.red > 0 && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            <strong>{urgencyCounts.red}</strong> booking{urgencyCounts.red === 1 ? '' : 's'} need
            attention within 2 days, and <strong>{urgencyCounts.amber}</strong> within 5 days.
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search PNR, company, sector..."
            className="w-full bg-white border border-stone-300 rounded-xl pl-9 pr-3 py-2 text-xs text-stone-800 placeholder-stone-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400"
          />
        </div>

        {[
          { id: 'status', label: 'All statuses', options: ['active', 'cancelled', 'completed'] },
          { id: 'branchName', label: 'All branches', options: branchOptions },
          { id: 'airlineCode', label: 'All airlines', options: airlineOptions },
        ].map((sel) => (
          <select
            key={sel.id}
            onChange={(e) => setSelectFilter(sel.id, e.target.value)}
            defaultValue=""
            className="bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-700 shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
          >
            <option value="">{sel.label}</option>
            {sel.options.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        ))}

        {/* Controlled, unlike the others: this one also decides how every row
            is projected, so its value must always be the one in effect. */}
        <select
          value={holderFilter}
          onChange={(e) => setHolder(e.target.value)}
          className="bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-700 shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
        >
          <option value="">All holders</option>
          {holderOptions.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>

        {/* EMDs to be issued on one day. Picking a date narrows the table to
            that day's bookings and fills the card above with what they are
            worth (owner, 2026-09-23). */}
        <div className="flex items-center gap-1.5">
          <label
            htmlFor="issuance-date"
            className="text-[11px] font-medium text-stone-500 whitespace-nowrap"
          >
            EMDs to issue on
          </label>
          <input
            id="issuance-date"
            type="date"
            value={issuanceDate}
            list="issuance-days"
            onChange={(e) => setIssuanceDay(e.target.value)}
            className="bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-700 shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
          />
          {/* The dates that actually have something to issue. A browser that
              ignores `list` on a date input simply shows the plain picker. */}
          <datalist id="issuance-days">
            {daysWithWork.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
          {issuanceDate && (
            <button
              onClick={() => setIssuanceDay('')}
              title="Show every date again"
              className="text-stone-400 hover:text-stone-700 p-1.5 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <span className="ml-auto text-[11px] font-medium text-stone-500">
          Showing {visibleRows.length} of {rows.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
        <table className="min-w-max w-full text-xs">
          <thead className="sticky top-0">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-stone-200 bg-[#FAF7F1]">
                {canIssueEmds && (
                  <th className="px-3 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      ref={(el) => {
                        // Partly selected reads as neither on nor off, which is
                        // exactly what the person is looking at.
                        if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
                      }}
                      onChange={toggleAllVisible}
                      aria-label="Select all visible bookings"
                      className="w-3.5 h-3.5 rounded border-stone-300 text-indigo-600 focus:ring-indigo-400/50 cursor-pointer"
                    />
                  </th>
                )}
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className="px-3 py-3 text-left font-semibold text-stone-500 whitespace-nowrap cursor-pointer select-none hover:text-stone-800"
                  >
                    <span className="inline-flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <ArrowUpDown className="w-3 h-3 text-stone-300" />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (canIssueEmds ? 1 : 0)} className="px-4 py-12 text-center text-stone-400">
                  <Sun className="w-6 h-6 mx-auto mb-2 text-amber-300" />
                  Nothing matches the current filters — try clearing them.
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => {
                const u = getUrgency(todayIso, row.original.nextPendingDeadline, row.original.status);
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-stone-100 last:border-0 transition-colors ${
                      selected.has(row.original.id) ? 'bg-indigo-50/60' : 'hover:bg-amber-50/50'
                    } ${URGENCY_STYLES[u].rowBorder}`}
                  >
                    {canIssueEmds && (
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(row.original.id)}
                          onChange={() => toggleOne(row.original.id)}
                          aria-label={`Select ${row.original.pnr}`}
                          className="w-3.5 h-3.5 rounded border-stone-300 text-indigo-600 focus:ring-indigo-400/50 cursor-pointer"
                        />
                      </td>
                    )}
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2.5 text-stone-700 whitespace-nowrap">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-stone-500">
        <span className="flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5" /> Urgency (nearest issued round):</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> red ≤ 2 days</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> amber ≤ 5 days</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> green otherwise</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-stone-400" /> grey = not active</span>
      </div>
    </div>
  );
}




