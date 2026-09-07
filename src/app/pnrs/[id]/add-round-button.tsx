'use client';

import { useState, useTransition } from 'react';
import { Plus, X, AlertTriangle } from 'lucide-react';
import { createEmdRound } from '../actions/emd';
import { formatEmdNumberInput } from '@/lib/format';

export default function AddRoundButton({ pnrId, licenses }: { pnrId: string, licenses: { id: string, name: string }[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.append('pnr_id', pnrId);

    startTransition(async () => {
      const res = await createEmdRound(formData);
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
        className="text-xs font-semibold px-3 py-1.5 rounded-xl text-stone-600 bg-white border border-stone-200 shadow-sm hover:bg-stone-50 transition-all inline-flex items-center gap-1.5"
      >
        <Plus className="w-3.5 h-3.5" />
        Add EMD round
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-stone-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-stone-900">Add new EMD round</h3>
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
                    Issuance Date <span className="text-red-500">*</span>
                  </label>
                  <input type="date" disabled defaultValue={new Date().toISOString().slice(0, 10)} className={`${inputCls} bg-stone-100 opacity-70 cursor-not-allowed`} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">
                    Issuance Time
                  </label>
                  <input type="time" disabled defaultValue={new Date().toISOString().slice(11, 16)} className={`${inputCls} bg-stone-100 opacity-70 cursor-not-allowed`} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">
                    Payment % <span className="text-red-500">*</span>
                  </label>
                  <input type="number" step="0.01" name="round_payment_pct" required className={inputCls} placeholder="e.g. 15" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">
                  EMD Amount (PKR) <span className="text-red-500">*</span>
                </label>
                <input type="number" name="round_emd_amount" required className={inputCls} placeholder="Total amount in PKR" />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">
                  Paid By License
                </label>
                <select name="round_license_id" className={`${inputCls} cursor-pointer`}>
                  <option value="">— (Same as PNR) —</option>
                  {licenses.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">
                    Deadline Date <span className="text-red-500">*</span>
                  </label>
                  <input type="date" name="round_deadline_date" required className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">
                    Deadline Time
                  </label>
                  <input type="time" name="round_deadline_time" className={inputCls} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">
                  EMD Number <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  name="round_emd_number" 
                  required
                  className={inputCls} 
                  placeholder="e.g. 123 4567890123" 
                  onChange={(e) => e.target.value = formatEmdNumberInput(e.target.value)}
                />
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
                  {isPending ? 'Saving...' : 'Add round'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
