'use client';

import { useState, useTransition } from 'react';
import { Undo2 } from 'lucide-react';
import { requestEmdRefunds } from '../actions/emd';

/**
 * Marks one round refund requested (Phase 9 Step 3, A1). Shown only on a round
 * that is on "To be refunded"; the server checks again. It can't be undone, so
 * the click asks once more before it goes.
 */
export default function RequestRefundButton({ roundId }: { roundId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await requestEmdRefunds([roundId]);
      if (res?.error) setError(res.error);
      setConfirming(false);
    });
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {confirming ? (
        <>
          <button
            onClick={submit}
            disabled={isPending}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-lg text-white bg-brand hover:bg-brand-dark disabled:opacity-50 cursor-pointer"
          >
            {isPending ? 'Requesting…' : 'Confirm — can’t be undone'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-[11px] font-medium px-2 py-1 rounded-lg text-stone-600 bg-stone-100 hover:bg-stone-200 cursor-pointer"
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="text-[11px] font-semibold px-2.5 py-1 rounded-lg text-brand-dark bg-white border border-brand-200 hover:bg-brand-50 inline-flex items-center gap-1 cursor-pointer"
        >
          <Undo2 className="w-3 h-3" />
          Request refund
        </button>
      )}
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </span>
  );
}
