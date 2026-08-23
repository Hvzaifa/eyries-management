'use client';

import { useMemo, useState } from 'react';
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
import { ArrowUpDown, Search, Sun, AlertTriangle, CalendarClock } from 'lucide-react';
import Link from 'next/link';
import { getUrgency } from '@/lib/urgency';
import type { PnrListRow } from '@/lib/pnrs';
import { formatNumber, formatPkr } from '@/lib/format';

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

export default function PnrTable({ rows, todayIso }: { rows: PnrListRow[]; todayIso: string }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'sr_no', desc: false }]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const urgencyCounts = useMemo(() => {
    const counts = { red: 0, amber: 0 };
    for (const r of rows) {
      const u = getUrgency(todayIso, r.nextPendingDeadline, r.status);
      if (u === 'red') counts.red++;
      else if (u === 'amber') counts.amber++;
    }
    return counts;
  }, [rows, todayIso]);

  const columns = useMemo<ColumnDef<PnrListRow>[]>(
    () => [
      { accessorKey: 'sr_no', header: 'SR#' },
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
      { accessorKey: 'outboundDate', header: 'Outbound', cell: (c) => fmtDate(c.getValue()) },
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
      {
        id: 'urgency',
        header: 'Next Deadline',
        accessorFn: (r) => r.nextPendingDeadline ?? '',
        sortingFn: (a, b) =>
          (a.original.nextPendingDeadline ?? '').localeCompare(b.original.nextPendingDeadline ?? ''),
        cell: (c) => {
          const row = c.row.original;
          const u = getUrgency(todayIso, row.nextPendingDeadline, row.status);
          const s = URGENCY_STYLES[u];
          let label = 'No pending round';
          if (row.status !== 'active') {
            label = row.status === 'cancelled' ? 'Cancelled' : 'Completed';
          } else if (row.nextPendingDeadline) {
            label = row.nextPendingDeadline < todayIso
              ? `Overdue since ${row.nextPendingDeadline}`
              : `Due ${row.nextPendingDeadline}`;
          }
          return (
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] whitespace-nowrap font-medium ${s.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
              {label}
            </span>
          );
        },
      },
    ],
    [todayIso]
  );

  const table = useReactTable({
    data: rows,
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
      return Object.values(row.original).some((v) => String(v ?? '').toLowerCase().includes(q));
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

  const setSelectFilter = (id: string, value: string) => {
    setColumnFilters((prev) => {
      const rest = prev.filter((f) => f.id !== id);
      return value ? [...rest, { id, value }] : rest;
    });
  };

  const visibleRows = table.getRowModel().rows;

  return (
    <div className="space-y-4">
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

        <span className="ml-auto text-[11px] font-medium text-stone-500">
          Showing {visibleRows.length} of {rows.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
        <table className="min-w-max w-full text-xs">
          <thead className="sticky top-0">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-stone-200 bg-[#FAF7F1]">
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
                <td colSpan={columns.length} className="px-4 py-12 text-center text-stone-400">
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
                    className={`border-b border-stone-100 last:border-0 hover:bg-amber-50/50 transition-colors ${URGENCY_STYLES[u].rowBorder}`}
                  >
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
        <span className="flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5" /> Urgency (nearest pending round):</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> red ≤ 2 days</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> amber ≤ 5 days</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> green otherwise</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-stone-400" /> grey = not active</span>
      </div>
    </div>
  );
}




