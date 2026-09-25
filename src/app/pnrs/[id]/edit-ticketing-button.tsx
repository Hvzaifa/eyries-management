'use client';

import { useState, useTransition } from 'react';
import { Pencil, X, AlertTriangle, Sparkles } from 'lucide-react';
import { saveTicketing } from '../actions/ticketing';

export interface TicketingValues {
  nameUpdateDeadline: string | null;
  ticketIssuanceDeadline: string | null;
  status: string | null;
  ticketsIssued: number | null;
  balanceTickets: number | null;
}

export default function EditTicketingButton({
  pnrId,
  seats,
  ticketing,
  suggestedIssuanceDeadline,
}: {
  pnrId: string;
  seats: number;
  ticketing: TicketingValues | null;
  /** SV's 72-hour policy date (outbound − 3 days), or null for other airlines. */
  suggestedIssuanceDeadline: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<string>(
    ticketing?.ticketsIssued === null || ticketing?.ticketsIssued === undefined
      ? ''
      : String(ticketing.ticketsIssued)
  );

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.append('pnr_id', pnrId);

    startTransition(async () => {
      const res = await saveTicketing(formData);
      if (res?.error) {
        setError(res.error);
      } else {
        setIsOpen(false);
      }
    });
  };

  const inputCls =
    'w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400 transition-colors';

  // The SV policy date only ever pre-fills an EMPTY field. A date staff have
  // already recorded is never overwritten by a suggestion (business-rules.md:
  // policies suggest, they do not enforce).
  const issuanceDefault = ticketing?.ticketIssuanceDeadline ?? suggestedIssuanceDeadline ?? '';
  const usingSuggestion = !ticketing?.ticketIssuanceDeadline && !!suggestedIssuanceDeadline;

  // Seats not yet ticketed. Calculated, never typed: issued + balance are the
  // seats on the booking (owner rule, 2026-09-19). The server computes this too
  // — what the browser shows is a preview, not the source.
  const issuedNum = Number(issued);
  const issuedIsUsable = issued.trim() !== '' && Number.isInteger(issuedNum) && issuedNum >= 0;
  const derivedBalance = issuedIsUsable ? Math.max(0, seats - issuedNum) : null;
  const overSeats = issuedIsUsable && issuedNum > seats;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-[11px] font-medium text-stone-500 hover:text-sky-600 transition-colors inline-flex items-center gap-1 cursor-pointer border border-stone-200 bg-white px-2.5 py-1.5 rounded-lg hover:bg-sky-50 hover:border-sky-200 shadow-sm"
      >
        <Pencil className="w-3 h-3" />
        {ticketing ? 'Edit ticketing' : 'Add ticketing details'}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-stone-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-stone-900">Ticketing stage</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-stone-400 hover:text-stone-600 p-1 rounded-md hover:bg-stone-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {error && (
                <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">
                    Name update deadline
                  </label>
                  <input
                    type="date"
                    name="name_update_deadline"
                    defaultValue={ticketing?.nameUpdateDeadline ?? ''}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">
                    Ticket issuance deadline
                  </label>
                  <input
                    type="date"
                    name="ticket_issuance_deadline"
                    defaultValue={issuanceDefault}
                    className={inputCls}
                  />
                  {usingSuggestion && (
                    <p className="mt-1 text-[11px] text-sky-600 inline-flex items-start gap-1">
                      <Sparkles className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      Saudia policy: 72 hours before departure. Editable.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">Status</label>
                <input
                  type="text"
                  name="ticketing_status"
                  defaultValue={ticketing?.status ?? ''}
                  placeholder="e.g. issued, partially issued, pending"
                  className={inputCls}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">
                    Tickets issued
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={seats}
                    step="1"
                    name="tickets_issued"
                    value={issued}
                    onChange={(e) => setIssued(e.target.value)}
                    className={`${inputCls} ${overSeats ? 'border-red-400 focus:ring-red-400/50' : ''}`}
                  />
                  <p className={`mt-1 text-[11px] ${overSeats ? 'text-red-600 font-medium' : 'text-stone-400'}`}>
                    {overSeats
                      ? `Only ${seats} seats on this booking`
                      : `${seats} seats on this booking`}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">
                    Balance tickets
                  </label>
                  {/* Calculated, not typed: issued + balance are the seats
                      (owner rule, 2026-09-19). Read-only here and recomputed
                      server-side, so the two counts cannot disagree. */}
                  <input
                    type="number"
                    readOnly
                    disabled
                    value={
                      derivedBalance !== null
                        ? String(derivedBalance)
                        : ticketing?.balanceTickets === null || ticketing?.balanceTickets === undefined
                          ? ''
                          : String(ticketing.balanceTickets)
                    }
                    className={`${inputCls} bg-stone-100 text-stone-500 cursor-not-allowed`}
                  />
                  <p className="mt-1 text-[11px] text-stone-400">
                    Seats − tickets issued, calculated
                  </p>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-xs font-medium rounded-xl hover:bg-stone-100 text-stone-600 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? 'Saving...' : 'Save ticketing'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
