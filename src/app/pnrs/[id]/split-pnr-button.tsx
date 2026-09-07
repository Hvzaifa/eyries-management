'use client';

import { useState, useTransition } from 'react';
import { Scissors, X, AlertTriangle } from 'lucide-react';
import { splitPnr } from '../actions/pnr';

interface SplitPnrButtonProps {
  pnrId: string;
  pnrCode: string;
  maxSeats: number;
}

export default function SplitPnrButton({ pnrId, pnrCode, maxSeats }: SplitPnrButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (maxSeats <= 0) return null;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.append('parent_pnr_id', pnrId);

    startTransition(async () => {
      const res = await splitPnr(formData);
      if (res?.error) {
        setError(res.error);
      }
      // On success, the action redirects to the new child PNR
    });
  };

  const inputCls =
    'w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400 transition-colors';

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-xs font-semibold px-3 py-1.5 rounded-xl text-stone-600 bg-white border border-stone-200 shadow-sm hover:bg-stone-50 transition-all inline-flex items-center gap-1.5 cursor-pointer"
      >
        <Scissors className="w-3.5 h-3.5" />
        Split Seats
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-stone-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
                <Scissors className="w-4 h-4 text-violet-500" />
                Split seats from {pnrCode}
              </h3>
              <button
                onClick={() => { setIsOpen(false); setError(null); }}
                className="text-stone-400 hover:text-stone-600 p-1 rounded-md hover:bg-stone-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
              {error && (
                <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-xs text-indigo-700">
                <p className="font-medium mb-1">How splitting works:</p>
                <ul className="space-y-0.5 list-disc list-inside text-[11px] text-indigo-600">
                  <li>The airline provides a new PNR code for the child booking.</li>
                  <li>Parent seats will be reduced by the allocated amount.</li>
                  <li>EMD rounds are recalculated proportionally based on new seat counts.</li>
                </ul>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">
                  Child PNR Code <span className="text-red-400">*</span>
                  <span className="text-[10px] text-stone-400 ml-1">(assigned by the airline)</span>
                </label>
                <input
                  type="text"
                  name="child_pnr_code"
                  required
                  placeholder="e.g. 8K7FGY"
                  className={`${inputCls} font-mono`}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">
                  Seats to Allocate <span className="text-red-400">*</span>
                  <span className="text-[10px] text-stone-400 ml-1">(max {maxSeats} available)</span>
                </label>
                <input
                  type="number"
                  name="seats_to_allocate"
                  required
                  min={1}
                  max={maxSeats}
                  placeholder={`1 – ${maxSeats}`}
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">
                  New Investor Company <span className="text-red-400">*</span>
                  <span className="text-[10px] text-stone-400 ml-1">(whom seats are assigned to)</span>
                </label>
                <input
                  type="text"
                  name="new_investor_company"
                  required
                  placeholder="Company name"
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">
                  Child Outbound Date
                  <span className="text-[10px] text-stone-400 ml-1">(leave empty to inherit from parent)</span>
                </label>
                <input
                  type="date"
                  name="child_outbound_date"
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">
                  Child Inbound Date
                  <span className="text-[10px] text-stone-400 ml-1">(leave empty to inherit from parent)</span>
                </label>
                <input
                  type="date"
                  name="child_inbound_date"
                  className={inputCls}
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setIsOpen(false); setError(null); }}
                  className="px-4 py-2 text-xs font-medium rounded-xl hover:bg-stone-100 text-stone-600 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-white bg-gradient-to-tr from-violet-500 to-indigo-500 hover:from-violet-400 hover:to-indigo-400 shadow-md shadow-violet-500/20 transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  <Scissors className="w-3.5 h-3.5" />
                  {isPending ? 'Splitting...' : 'Split Seats'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
