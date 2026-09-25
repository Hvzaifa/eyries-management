'use client';

import { useState, useTransition } from 'react';
import { Banknote, X, AlertTriangle, Undo2 } from 'lucide-react';
import { recordIataPayment, clearIataPayment } from '../actions/emd';
import type { IataPaymentState } from '@/lib/iata-payments';

/**
 * Records that this EMD was paid to IATA, or undoes that record.
 *
 * The deadline itself is never typed — it comes from the remittance calendar.
 * The only thing a person can tell the system is that the money went, and on
 * what day, so that is the only field.
 */
export default function IataPaymentButton({
  roundId,
  state,
  today,
}: {
  roundId: string;
  state: IataPaymentState;
  today: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (action: typeof recordIataPayment, formData: FormData) => {
    formData.append('round_id', roundId);
    startTransition(async () => {
      const res = await action(formData);
      if (res?.error) setError(res.error);
      else setIsOpen(false);
    });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    submit(recordIataPayment, new FormData(e.currentTarget));
  };

  const handleClear = () => {
    setError(null);
    submit(clearIataPayment, new FormData());
  };

  const inputCls =
    'w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400 transition-colors';

  if (state.status === 'paid') {
    return (
      <button
        onClick={handleClear}
        disabled={isPending}
        title="Remove this payment record"
        className="text-[11px] font-medium text-stone-400 hover:text-amber-600 transition-colors inline-flex items-center gap-1 cursor-pointer border border-stone-200 bg-white px-2 py-1 rounded-md hover:bg-amber-50 hover:border-amber-200 shadow-sm disabled:opacity-50"
      >
        <Undo2 className="w-3 h-3" />
        {isPending ? 'Undoing…' : 'Not paid after all'}
      </button>
    );
  }

  // A rolled round is settled by being replaced, so there is nothing to pay.
  if (state.status === 'rolled') return null;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-[11px] font-medium text-stone-500 hover:text-emerald-700 transition-colors inline-flex items-center gap-1 cursor-pointer border border-stone-200 bg-white px-2 py-1 rounded-md hover:bg-emerald-50 hover:border-emerald-200 shadow-sm"
      >
        <Banknote className="w-3 h-3" />
        Mark paid to IATA
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-stone-200 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-stone-900">Mark paid to IATA</h3>
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

              <p className="text-xs text-stone-500">
                {state.deadline ? (
                  <>
                    This EMD falls in IATA period{' '}
                    <span className="font-mono text-stone-700">{state.period?.code}</span> and is
                    due on <strong className="text-stone-700">{state.deadline}</strong>.
                  </>
                ) : (
                  <>The loaded IATA calendar does not cover this EMD’s issuance date.</>
                )}
              </p>

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">
                  Date paid <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  name="payment_date"
                  required
                  max={today}
                  defaultValue={state.deadline && state.deadline <= today ? state.deadline : today}
                  className={inputCls}
                />
                <p className="mt-1 text-[11px] text-stone-400">
                  The day the money actually went, which may differ from the due date.
                </p>
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
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-white bg-emerald-600 hover:bg-emerald-500 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? 'Saving…' : 'Mark paid'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
