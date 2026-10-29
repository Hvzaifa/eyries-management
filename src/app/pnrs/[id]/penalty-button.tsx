'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, Scale, X } from 'lucide-react';
import { savePenalties } from '../actions/ticketing';
import { lookupOptionText } from '@/lib/lookups';

/**
 * Penalties for unissued seats (Phase 9 Step 4, A9/A10). One amount per agent
 * holding seats, added to what that agent owes, and one for the company's own
 * seats — each with the license its penalty EMD was issued against. Amounts
 * only: whose seats went unissued is not recorded (owner, 2026-10-28). Blank
 * means no penalty. Shown only once the outbound date has passed and a penalty
 * is called for; the server checks again.
 */
export default function PenaltyButton({
  pnrId,
  agents,
  companySeats,
  company,
  licenses,
  title = 'Penalties for unissued seats',
}: {
  /** "Penalties for unissued seats", or the cancellation penalty (Step 5). */
  title?: string;
  pnrId: string;
  agents: { id: string; name: string; seats: number; penaltyAmount: number | null; penaltyLicenseId: string | null }[];
  /** Seats the company holds itself; with none, there is no company penalty to enter. */
  companySeats: number;
  company: { amount: number | null; licenseId: string | null };
  licenses: { id: string; name: string; code: string | null }[];
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
      const res = await savePenalties(formData);
      if (res?.error) setError(res.error);
      else setIsOpen(false);
    });
  };

  const inputCls =
    'w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-brand-light/50 focus:border-brand-light';
  const hasAny = agents.some((a) => a.penaltyAmount !== null) || company.amount !== null;

  const row = (label: string, seats: number, amountName: string, licenseName: string, amount: number | null, licenseId: string | null) => (
    <div key={amountName} className="grid grid-cols-[1fr_8rem_10rem] gap-2 items-center">
      <span className="text-xs text-stone-700">
        {label} <span className="text-stone-400">· {seats} seat{seats === 1 ? '' : 's'}</span>
      </span>
      <input
        type="number"
        name={amountName}
        min="0"
        step="0.01"
        defaultValue={amount ?? ''}
        placeholder="No penalty"
        aria-label={`${label} penalty`}
        className={inputCls}
      />
      <select name={licenseName} defaultValue={licenseId ?? ''} aria-label={`${label} penalty license`} className={inputCls}>
        <option value="">License…</option>
        {licenses.map((l) => (
          <option key={l.id} value={l.id}>
            {lookupOptionText(l)}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-[11px] font-semibold text-red-700 bg-white border border-red-200 px-2.5 py-1.5 rounded-lg hover:bg-red-50 inline-flex items-center gap-1 cursor-pointer shadow-sm"
      >
        <Scale className="w-3 h-3" />
        {hasAny ? 'Edit penalties' : 'Enter penalties'}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-stone-200 w-full max-w-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-stone-900">{title}</h3>
              <button
                onClick={() => { setIsOpen(false); setError(null); }}
                className="text-stone-400 hover:text-stone-600 p-1 rounded-md hover:bg-stone-100 cursor-pointer"
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
              <p className="text-xs text-stone-600 leading-relaxed">
                Enter the airline’s penalty (PKR) charged to each agent and to the company, and the license its
                penalty EMD was issued against. An agent’s penalty is added to what they owe. Leave blank for no penalty.
              </p>
              <div className="space-y-2">
                {agents.map((a) => row(a.name, a.seats, `penalty_${a.id}`, `penalty_license_${a.id}`, a.penaltyAmount, a.penaltyLicenseId))}
                {(companySeats > 0 || company.amount !== null) &&
                  row('Company', companySeats, 'company_penalty', 'company_penalty_license', company.amount, company.licenseId)}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setIsOpen(false); setError(null); }}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? 'Saving…' : 'Save penalties'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
