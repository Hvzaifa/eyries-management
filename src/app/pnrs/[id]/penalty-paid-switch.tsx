'use client';

import { useState, useTransition } from 'react';
import { setPenaltyPaid } from '../actions/cancellation';

/**
 * Penalty paid on a cancelled booking (Phase 9 Step 5, B3): Head Office only.
 * Once Yes, the booking's forfeited EMDs paid to IATA go on "To be refunded".
 */
export default function PenaltyPaidSwitch({ pnrId, paid }: { pnrId: string; paid: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const set = (value: 'yes' | 'no') => {
    setError(null);
    const fd = new FormData();
    fd.append('pnr_id', pnrId);
    fd.append('penalty_paid', value);
    startTransition(async () => {
      const res = await setPenaltyPaid(fd);
      if (res?.error) setError(res.error);
    });
  };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex rounded-lg border border-stone-300 bg-white p-0.5 text-[11px] font-medium">
        {(['no', 'yes'] as const).map((v) => (
          <button
            key={v}
            disabled={isPending}
            onClick={() => (paid !== (v === 'yes') ? set(v) : undefined)}
            className={`px-3 py-1 rounded-md cursor-pointer disabled:opacity-50 ${
              paid === (v === 'yes') ? 'bg-brand text-white' : 'text-stone-600 hover:bg-stone-50'
            }`}
          >
            {v === 'yes' ? 'Yes' : 'No'}
          </button>
        ))}
      </span>
      {error && <span className="text-[11px] text-red-600 max-w-xs text-right">{error}</span>}
    </span>
  );
}
