'use client';

import { useState, useTransition } from 'react';
import { Ban, X, AlertTriangle } from 'lucide-react';
import { releasePnr } from '../actions/pnr';
import { MAX_RELEASE_REASON } from '@/lib/release';

/**
 * Release: the booking ends before EMD-1 is issued (Phase 9 Step 2, A2). A
 * reason is required and goes to the change history. Shown only where the
 * page found nothing blocking it; the server checks again, under a lock.
 */
export default function ReleasePnrButton({
  pnrId,
  pnrCode,
  agentsWithSeats,
}: {
  pnrId: string;
  pnrCode: string;
  /** Agents holding seats, whose seats end with the release. */
  agentsWithSeats: string[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.append('pnr_id', pnrId);
    startTransition(async () => {
      const res = await releasePnr(formData);
      if (res?.error) setError(res.error);
      else setIsOpen(false);
    });
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-xs font-semibold px-3 py-1.5 rounded-xl text-red-700 bg-white border border-red-200 shadow-sm hover:bg-red-50 transition-all inline-flex items-center gap-1.5 cursor-pointer"
      >
        <Ban className="w-3.5 h-3.5" />
        Release
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-stone-200 w-full max-w-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
                <Ban className="w-4 h-4 text-red-600" />
                Release {pnrCode}
              </h3>
              <button
                onClick={() => { setIsOpen(false); setError(null); }}
                className="text-stone-400 hover:text-stone-600 p-1 rounded-md hover:bg-stone-100 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <div className="text-xs text-stone-600 space-y-1.5 leading-relaxed">
                <p>
                  The booking ends here, before any EMD is issued. <strong>This cannot be undone.</strong>
                </p>
                {agentsWithSeats.length > 0 && (
                  <p>
                    Seats held by <strong>{agentsWithSeats.join(', ')}</strong> end with it.
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="release-reason" className="block text-xs font-medium text-stone-600 mb-1.5">
                  Reason<span className="text-red-500"> *</span>
                </label>
                <textarea
                  id="release-reason"
                  name="reason"
                  required
                  maxLength={MAX_RELEASE_REASON}
                  rows={3}
                  placeholder="e.g. EMD-1 deadline missed, airline released the seats"
                  className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-brand-light/50 focus:border-brand-light"
                />
                <p className="mt-1 text-[11px] text-stone-400">Shown to Head Office in the change history.</p>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setIsOpen(false); setError(null); }}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 cursor-pointer"
                >
                  Keep booking
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? 'Releasing…' : 'Release booking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
