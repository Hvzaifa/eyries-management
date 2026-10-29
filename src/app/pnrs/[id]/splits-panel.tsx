'use client';

import { useState, useTransition } from 'react';
import { Scissors, X, AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import { createSplit, removeSplit, updateSplit } from '../actions/splits';
import { splitRemovable, suggestedSplitDeadline, type SplitRecord } from '@/lib/splits';
import { allTicketsAnswerOf, type AllTicketsAnswer } from '@/lib/ticketing';

const inputCls =
  'w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-brand-light/50 focus:border-brand-light';

export interface SplitHolder {
  /** An assignment id, or 'company' for the company's unassigned seats. */
  id: string;
  name: string;
  /** Seats this holder can still put into a new split. */
  available: number;
}

/**
 * Splits kept inside the booking (Phase 9 Step 6; owner, 2026-10-29): part of
 * the seats on other dates, from one holder, with an optional new PNR code and
 * its own ticket deadline and count. No separate booking is created.
 */
export default function SplitsPanel({
  pnrId,
  bookingSeats,
  oneWay,
  bookingOutbound,
  bookingInbound,
  splits,
  holders,
  canSplit,
  canEdit,
  splitBlockedReason,
}: {
  pnrId: string;
  bookingSeats: number;
  oneWay: boolean;
  bookingOutbound: string | null;
  bookingInbound: string | null;
  splits: (SplitRecord & { holderName: string })[];
  holders: SplitHolder[];
  /** May make a new split: SV, active, and the user's own booking or Head Office. */
  canSplit: boolean;
  /** May edit or remove existing splits. */
  canEdit: boolean;
  /** Why no split can be made here, shown instead of the button. */
  splitBlockedReason: string | null;
}) {
  const [dialog, setDialog] = useState<{ kind: 'new' } | { kind: 'edit'; split: SplitRecord & { holderName: string } } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (fn: (fd: FormData) => Promise<{ error: string } | undefined>) => (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await fn(fd);
      if (res?.error) setError(res.error);
      else setDialog(null);
    });
  };
  const remove = (id: string) => {
    if (!window.confirm('Remove this split? Its seats go back to the booking.')) return;
    const fd = new FormData();
    fd.append('split_id', id);
    setError(null);
    startTransition(async () => {
      const res = await removeSplit(fd);
      if (res?.error) setError(res.error);
    });
  };

  const inSplits = splits.reduce((n, s) => n + s.seats, 0);
  const open = holders.filter((h) => h.available > 0);

  if (splits.length === 0 && !canSplit && !splitBlockedReason) return null;

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-stone-900 flex items-center gap-1.5">
          <Scissors className="w-4 h-4 text-brand-dark" /> Splits
        </h2>
        {canSplit && open.length > 0 && (
          <button
            onClick={() => { setError(null); setDialog({ kind: 'new' }); }}
            className="text-[11px] font-medium text-stone-500 hover:text-brand-dark inline-flex items-center gap-1 cursor-pointer border border-stone-200 bg-white px-2.5 py-1.5 rounded-lg hover:bg-brand-50 hover:border-brand-200 shadow-sm"
          >
            <Scissors className="w-3 h-3" />
            Split seats
          </button>
        )}
      </div>
      <p className="text-[11px] text-stone-400 mb-4">
        Seats flying on other dates, kept inside this booking. The booking’s EMDs cover them; each split has its own
        ticket deadline. {inSplits > 0 && `${inSplits} of ${bookingSeats} seats are in splits.`}
      </p>
      {splitBlockedReason && splits.length === 0 && <p className="text-xs text-stone-400">{splitBlockedReason}</p>}
      {error && !dialog && <FormError message={error} />}

      {splits.length > 0 && (
        <ul className="space-y-2">
          {splits.map((s) => {
            const answer = allTicketsAnswerOf(s.balanceTickets);
            return (
              <li key={s.id} className="rounded-xl border border-stone-200 bg-stone-50/60 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-stone-800">
                    {s.seats} seat{s.seats === 1 ? '' : 's'} · {s.holderName}
                    {s.pnrCode && <span className="ml-2 font-mono text-xs font-normal text-brand-dark">{s.pnrCode}</span>}
                  </span>
                  {canEdit && (
                    <span className="flex items-center gap-1">
                      <button
                        onClick={() => { setError(null); setDialog({ kind: 'edit', split: s }); }}
                        className="text-stone-400 hover:text-brand-dark p-1.5 rounded-lg hover:bg-white cursor-pointer"
                        title="Edit dates, PNR code and tickets"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {splitRemovable(s) && (
                        <button
                          onClick={() => remove(s.id)}
                          disabled={isPending}
                          className="text-stone-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-white cursor-pointer disabled:opacity-50"
                          title="Remove the split — seats back on the booking"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-stone-500">
                  <span>
                    Out <span className="text-stone-700 tabular-nums">{s.outboundDate}</span>
                    {s.outboundDate !== bookingOutbound && <span className="text-amber-700"> (booking {bookingOutbound ?? '—'})</span>}
                  </span>
                  {!oneWay && (
                    <span>
                      In <span className="text-stone-700 tabular-nums">{s.inboundDate ?? '—'}</span>
                      {s.inboundDate !== bookingInbound && <span className="text-amber-700"> (booking {bookingInbound ?? '—'})</span>}
                    </span>
                  )}
                  <span>
                    Tickets by <span className="text-stone-700 tabular-nums">{s.ticketIssuanceDeadline ?? '—'}</span>
                  </span>
                  <span>
                    All tickets issued?{' '}
                    <span className="text-stone-700">
                      {answer === '' ? 'Not answered' : answer === 'yes' ? 'Yes' : `No — ${s.balanceTickets} remaining`}
                    </span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-stone-200 w-full max-w-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-stone-900">
                {dialog.kind === 'new' ? 'Split seats' : `Split of ${dialog.split.seats} seats · ${dialog.split.holderName}`}
              </h3>
              <button onClick={() => setDialog(null)} className="text-stone-400 hover:text-stone-600 p-1 rounded-md hover:bg-stone-100 cursor-pointer" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <SplitForm
              key={dialog.kind === 'edit' ? dialog.split.id : 'new'}
              pnrId={pnrId}
              split={dialog.kind === 'edit' ? dialog.split : null}
              holders={open}
              oneWay={oneWay}
              bookingOutbound={bookingOutbound}
              bookingInbound={bookingInbound}
              error={error}
              isPending={isPending}
              onSubmit={submit(dialog.kind === 'new' ? createSplit : updateSplit)}
              onCancel={() => setDialog(null)}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function SplitForm({
  pnrId,
  split,
  holders,
  oneWay,
  bookingOutbound,
  bookingInbound,
  error,
  isPending,
  onSubmit,
  onCancel,
}: {
  pnrId: string;
  split: SplitRecord | null;
  holders: SplitHolder[];
  oneWay: boolean;
  bookingOutbound: string | null;
  bookingInbound: string | null;
  error: string | null;
  isPending: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const [holder, setHolder] = useState(holders[0]?.id ?? 'company');
  const [outbound, setOutbound] = useState(split?.outboundDate ?? bookingOutbound ?? '');
  const [deadline, setDeadline] = useState(split?.ticketIssuanceDeadline ?? suggestedSplitDeadline(bookingOutbound) ?? '');
  const [deadlineTouched, setDeadlineTouched] = useState(!!split);
  const [answer, setAnswer] = useState<AllTicketsAnswer>(allTicketsAnswerOf(split?.balanceTickets ?? null));
  const max = holders.find((h) => h.id === holder)?.available ?? 0;

  return (
    <form onSubmit={onSubmit} className="p-5 space-y-4">
      {error && <FormError message={error} />}
      <input type="hidden" name="pnr_id" value={pnrId} />
      {split && <input type="hidden" name="split_id" value={split.id} />}

      {!split && (
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">Seats from <span className="text-red-500">*</span></label>
            <select name="holder" value={holder} onChange={(e) => setHolder(e.target.value)} className={`${inputCls} cursor-pointer`}>
              {holders.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} ({h.available} available)
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-stone-400">One holder per split: an agent’s seats stay theirs, on the same terms.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">Seats <span className="text-red-500">*</span></label>
            <input type="number" name="seats" required min="1" max={max} step="1" defaultValue={max} className={inputCls} />
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-stone-600 mb-1.5">New PNR code</label>
        <input name="split_pnr_code" defaultValue={split?.pnrCode ?? ''} placeholder="Optional — if the airline issued one" className={`${inputCls} font-mono uppercase`} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1.5">Outbound date <span className="text-red-500">*</span></label>
          <input
            type="date"
            name="outbound_date"
            required
            value={outbound}
            onChange={(e) => {
              setOutbound(e.target.value);
              // SV's deadline follows the outbound date until someone types over it.
              if (!deadlineTouched) setDeadline(suggestedSplitDeadline(e.target.value) ?? '');
            }}
            className={inputCls}
          />
          <p className="mt-1 text-[11px] text-stone-400">Booking: {bookingOutbound ?? '—'}</p>
        </div>
        {!oneWay && (
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">Inbound date <span className="text-red-500">*</span></label>
            <input type="date" name="inbound_date" required defaultValue={split?.inboundDate ?? bookingInbound ?? ''} className={inputCls} />
            <p className="mt-1 text-[11px] text-stone-400">Booking: {bookingInbound ?? '—'}</p>
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-stone-600 mb-1.5">Ticket issuance deadline <span className="text-red-500">*</span></label>
        <input
          type="date"
          name="ticket_issuance_deadline"
          required
          value={deadline}
          max={outbound || undefined}
          onChange={(e) => { setDeadline(e.target.value); setDeadlineTouched(true); }}
          className={inputCls}
        />
        <p className="mt-1 text-[11px] text-stone-400">SV: 3 days before the split’s outbound date. Not after it.</p>
      </div>

      {split && (
        <div>
          <span className="block text-xs font-medium text-stone-600 mb-1.5">All tickets issued for these {split.seats} seats?</span>
          <div className="flex gap-2">
            {([['', 'Not answered'], ['yes', 'Yes'], ['no', 'No']] as const).map(([value, label]) => (
              <label
                key={value}
                className={`flex-1 text-center px-3 py-2 rounded-xl border text-xs font-medium cursor-pointer ${
                  answer === value ? 'bg-brand text-white border-brand' : 'bg-stone-50 border-stone-300 text-stone-600 hover:bg-stone-100'
                }`}
              >
                <input type="radio" name="all_tickets_issued" value={value} checked={answer === value} onChange={() => setAnswer(value)} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
          {answer === 'no' && (
            <div className="mt-2">
              <label className="block text-xs font-medium text-stone-600 mb-1.5">Tickets remaining <span className="text-red-500">*</span></label>
              <input type="number" name="tickets_remaining" required min="1" max={split.seats} step="1" defaultValue={split.balanceTickets || ''} className={inputCls} />
            </div>
          )}
          <p className="mt-1 text-[11px] text-stone-400">Once a count is recorded the split can no longer be removed.</p>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl text-xs font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 cursor-pointer">
          Cancel
        </button>
        <button type="submit" disabled={isPending} className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-50 cursor-pointer">
          {isPending ? 'Saving…' : split ? 'Save split' : 'Split seats'}
        </button>
      </div>
    </form>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 p-3 mb-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}
