'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Search, CheckCircle2 } from 'lucide-react';
import { fetchEmdRoundsByPnrs, processBulkRefunds } from '../actions/emd';
import { formatPkr } from '@/lib/format';
import Link from 'next/link';

type FetchedRound = {
  id: string;
  roundNumber: number;
  emdAmount: string; // from Prisma Decimal
  emdNumber: string | null;
  status: string;
  pnr: {
    pnr: string;
    investorCompany: string;
  };
  license: { name: string } | null;
};

type RefundState = {
  selected: boolean;
  amount: string;
  date: string;
};

export default function BulkRefundForm() {
  const router = useRouter();
  const [pnrInput, setPnrInput] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  
  const [fetchedRounds, setFetchedRounds] = useState<FetchedRound[] | null>(null);
  const [refundStates, setRefundStates] = useState<Record<string, RefundState>>({});
  
  const today = new Date().toISOString().slice(0, 10);

  const handleFetch = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const codes = pnrInput.split(/[\s,]+/).filter(Boolean);
    
    if (codes.length === 0) {
      setError('Please enter at least one PNR code.');
      return;
    }

    startTransition(async () => {
      const res = await fetchEmdRoundsByPnrs(codes);
      if (res?.error) {
        setError(res.error);
      } else if (res.rounds) {
        // Prisma Decimals cross the server-action boundary as strings, which is
        // what FetchedRound declares; the two shapes do not overlap structurally.
        setFetchedRounds(res.rounds as unknown as FetchedRound[]);
        
        // Initialize state
        const initialStates: Record<string, RefundState> = {};
        res.rounds.forEach((r) => {
          initialStates[r.id] = {
            selected: true,
            amount: Number(r.emdAmount).toString(),
            date: today,
          };
        });
        setRefundStates(initialStates);
      }
    });
  };

  const updateState = <K extends keyof RefundState>(
    id: string,
    field: K,
    value: RefundState[K]
  ) => {
    setRefundStates(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value }
    }));
  };

  const toggleAll = (select: boolean) => {
    setRefundStates(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(id => {
        next[id].selected = select;
      });
      return next;
    });
  };

  const handleProcess = () => {
    if (!fetchedRounds) return;
    
    const selected = fetchedRounds.filter(r => refundStates[r.id].selected);

    if (selected.length === 0) {
      setError('No EMDs selected for refund.');
      return;
    }

    // Number('') is 0, not NaN — an amount box left empty would otherwise be
    // recorded as a refund of zero without anyone noticing. Check the raw text.
    const blank = selected.filter(r => refundStates[r.id].amount.trim() === '');
    if (blank.length > 0) {
      setError(
        `Enter a refund amount for: ${blank.map(r => `${r.pnr.pnr} round ${r.roundNumber}`).join(', ')}.`
      );
      return;
    }

    const toProcess = selected.map(r => ({
      roundId: r.id,
      amount: Number(refundStates[r.id].amount),
      date: refundStates[r.id].date,
    }));

    setError(null);
    startTransition(async () => {
      const res = await processBulkRefunds(toProcess);
      if (res?.error) {
        setError(res.error);
      } else {
        router.push('/');
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-stone-200 shadow-sm rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-stone-100 bg-stone-50/50">
          <h2 className="text-sm font-semibold text-stone-900 mb-1">Find EMDs by PNR</h2>
          <p className="text-xs text-stone-500 mb-4">
            Enter multiple PNR codes separated by commas or spaces. We will fetch all non-refunded EMD rounds for these bookings.
          </p>
          
          <form onSubmit={handleFetch} className="space-y-3">
            <textarea
              value={pnrInput}
              onChange={e => setPnrInput(e.target.value)}
              placeholder="e.g. Q2X8B, P9R4C"
              rows={3}
              className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400 transition-colors font-mono uppercase"
            />
            
            {error && (
              <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            
            <div className="flex justify-end gap-3">
              <Link href="/" className="px-4 py-2 text-sm font-medium rounded-xl text-stone-600 hover:bg-stone-100 transition-colors">
                Cancel
              </Link>
              <button
                type="submit"
                disabled={isPending || pnrInput.trim().length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-stone-900 hover:bg-stone-800 transition-colors disabled:opacity-50"
              >
                <Search className="w-4 h-4" />
                {isPending ? 'Fetching...' : 'Fetch EMDs'}
              </button>
            </div>
          </form>
        </div>

        {fetchedRounds && (
          <div className="p-0">
            {fetchedRounds.length === 0 ? (
              <div className="p-8 text-center text-stone-500 text-sm">
                No active EMD rounds found for these PNR codes.
              </div>
            ) : (
              <div>
                <div className="px-6 py-3 border-b border-stone-100 bg-stone-50 flex justify-between items-center">
                  <div className="text-xs font-medium text-stone-500">
                    {fetchedRounds.length} EMD round{fetchedRounds.length !== 1 ? 's' : ''} found
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <button onClick={() => toggleAll(true)} className="text-indigo-600 hover:text-indigo-700 font-medium cursor-pointer">Select All</button>
                    <span className="text-stone-300">|</span>
                    <button onClick={() => toggleAll(false)} className="text-stone-500 hover:text-stone-700 font-medium cursor-pointer">Select None</button>
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-stone-50/50 text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-3 border-b border-stone-100 w-10"></th>
                        <th className="px-6 py-3 border-b border-stone-100">PNR</th>
                        <th className="px-6 py-3 border-b border-stone-100">Round</th>
                        <th className="px-6 py-3 border-b border-stone-100">Original Amount</th>
                        <th className="px-6 py-3 border-b border-stone-100">Refund Amount</th>
                        <th className="px-6 py-3 border-b border-stone-100">Refund Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 text-stone-800">
                      {fetchedRounds.map(round => {
                        const state = refundStates[round.id];
                        if (!state) return null;
                        
                        return (
                          <tr key={round.id} className={state.selected ? 'bg-indigo-50/30' : ''}>
                            <td className="px-6 py-3">
                              <input
                                type="checkbox"
                                checked={state.selected}
                                onChange={e => updateState(round.id, 'selected', e.target.checked)}
                                className="w-4 h-4 rounded border-stone-300 text-indigo-600 focus:ring-indigo-600"
                              />
                            </td>
                            <td className="px-6 py-3">
                              <div className="font-mono font-medium text-stone-900">{round.pnr.pnr}</div>
                              <div className="text-[11px] text-stone-500 truncate max-w-[150px]" title={round.pnr.investorCompany}>
                                {round.pnr.investorCompany}
                              </div>
                            </td>
                            <td className="px-6 py-3">
                              Round {round.roundNumber}
                              {round.emdNumber && <div className="text-[10px] text-stone-400 font-mono mt-0.5">{round.emdNumber}</div>}
                              {round.license?.name && (
                                <div className="text-[10px] text-indigo-500 font-medium mt-0.5">Paid by: {round.license.name}</div>
                              )}
                            </td>
                            <td className="px-6 py-3 font-medium text-stone-600">
                              {formatPkr(Number(round.emdAmount))}
                            </td>
                            <td className="px-6 py-3">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={state.amount}
                                onChange={e => updateState(round.id, 'amount', e.target.value)}
                                disabled={!state.selected}
                                className="w-32 bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-sm disabled:opacity-50 disabled:bg-stone-50"
                              />
                            </td>
                            <td className="px-6 py-3">
                              <input
                                type="date"
                                value={state.date}
                                onChange={e => updateState(round.id, 'date', e.target.value)}
                                disabled={!state.selected}
                                className="bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-sm disabled:opacity-50 disabled:bg-stone-50"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                
                <div className="p-6 border-t border-stone-100 bg-stone-50 flex items-center justify-between">
                  <div className="text-sm text-stone-600">
                    Selected <span className="font-semibold text-stone-900">{Object.values(refundStates).filter(s => s.selected).length}</span> EMD rounds to refund.
                  </div>
                  <button
                    onClick={handleProcess}
                    disabled={isPending || Object.values(refundStates).filter(s => s.selected).length === 0}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-tr from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 shadow-md shadow-emerald-500/25 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isPending ? 'Processing...' : 'Process Refunds'}
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
