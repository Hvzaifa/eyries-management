'use client';

import { useState, useTransition } from 'react';
import { Undo2, X, AlertTriangle } from 'lucide-react';
import { recordEmdRefund } from '../actions/emd';

export default function RefundRoundButton({ pnrId, roundId }: { pnrId: string; roundId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.append('pnr_id', pnrId);
    formData.append('round_id', roundId);

    startTransition(async () => {
      const res = await recordEmdRefund(formData);
      if (res?.error) {
        setError(res.error);
      } else {
        setIsOpen(false);
      }
    });
  };

  const inputCls =
    'w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400 transition-colors';

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-[11px] font-medium text-stone-500 hover:text-violet-600 transition-colors inline-flex items-center gap-1 cursor-pointer ml-3 border border-stone-200 bg-white px-2 py-1 rounded-md hover:bg-violet-50 hover:border-violet-200 shadow-sm"
      >
        <Undo2 className="w-3 h-3" />
        Record Refund
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-stone-200 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-stone-900">Record Refund</h3>
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

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">
                  Refund Date <span className="text-red-500">*</span>
                </label>
                <input type="date" name="refund_date" required className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">
                  Refund Amount (PKR) <span className="text-red-500">*</span>
                </label>
                <input type="number" name="refund_amount" required min="0" step="0.01" className={inputCls} placeholder="Total amount refunded" />
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
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-white bg-violet-600 hover:bg-violet-500 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? 'Saving...' : 'Record Refund'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
