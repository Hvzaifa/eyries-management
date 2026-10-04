import { formatPkr } from '@/lib/format';
import { SEAT_TYPE_LABELS, type ReceivableSummary, type SeatType } from '@/lib/agent-receivables';

/** What each seat type means, in the owner's words (2026-10-05). */
const SEAT_TYPE_HINTS: Record<SeatType, string> = {
  umrah: 'Return seats, Saudi Arabia',
  oneway: 'No return, employment or any destination',
  tour: 'Return seats, outside Saudi Arabia',
  other: 'Segment not set',
};

export const SEAT_TYPE_DOTS: Record<SeatType, string> = {
  umrah: 'bg-emerald-500',
  oneway: 'bg-sky-500',
  tour: 'bg-amber-500',
  other: 'bg-stone-400',
};

/**
 * Seats and receivable by seat type, then recovered and balance. Used for all
 * agents on the Agents page and for one agent's bookings combined.
 */
export default function ReceivableCards({ summary, showMargin }: { summary: ReceivableSummary; showMargin: boolean }) {
  const types: SeatType[] = ['umrah', 'oneway', 'tour'];
  // "Other" only when a booking has a segment outside the list.
  if (summary.seats.other > 0) types.push('other');

  return (
    <div className="space-y-3">
      <div className={`grid grid-cols-1 gap-3 ${types.length === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'}`}>
        {types.map((t) => (
          <div key={t} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-xs font-semibold text-stone-800">
                <span className={`w-2 h-2 rounded-full ${SEAT_TYPE_DOTS[t]}`} />
                {SEAT_TYPE_LABELS[t]}
              </p>
              <p className="text-xs text-stone-500 tabular-nums">
                <span className="text-base font-bold text-stone-900">{summary.seats[t]}</span> seat
                {summary.seats[t] === 1 ? '' : 's'}
              </p>
            </div>
            <p className="mt-0.5 text-[11px] text-stone-400">{SEAT_TYPE_HINTS[t]}</p>
            <p className="mt-3 text-[11px] uppercase tracking-wide text-stone-400 font-medium">Receivable</p>
            <p className="text-lg font-bold text-stone-900 tabular-nums">{formatPkr(summary.receivable[t])}</p>
          </div>
        ))}
      </div>

      <div className={`grid grid-cols-1 gap-3 ${showMargin ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'}`}>
        <Total label="Total receivable" value={summary.totalReceivable} hint={`${summary.totalSeats} seats`} />
        <Total label="Group seats recovery" value={summary.recovered} hint="paid by the agent so far" />
        <Total
          label="Balance receivable"
          value={summary.balance}
          hint={summary.credit > 0 ? `plus ${formatPkr(summary.credit)} paid in advance (credit)` : 'still to collect'}
          strong
        />
        {showMargin && <Total label="Margin" value={summary.margin} hint="charge − discount · Head Office only" />}
      </div>
    </div>
  );
}

function Total({ label, value, hint, strong }: { label: string; value: number; hint: string; strong?: boolean }) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${strong ? 'border-brand-200 bg-brand-50' : 'border-stone-200 bg-white'}`}
    >
      <p className="text-[11px] uppercase tracking-wide text-stone-500 font-semibold">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${strong ? 'text-brand-dark' : 'text-stone-900'}`}>
        {formatPkr(value)}
      </p>
      <p className="text-[11px] text-stone-400 mt-0.5">{hint}</p>
    </div>
  );
}
