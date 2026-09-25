import { formatPkr } from '@/lib/format';
import type { EmdRoundShare, EmdShare } from '@/lib/agent-dues';

/**
 * What one agent pays for each EMD round.
 *
 * The owner's instruction (2026-09-22): *"When a PNR is assigned to agents the
 * agents should show payment to make for each round… Agents' money will be
 * collected for an EMD round before it is issued."*
 *
 * Three things this deliberately does **not** show:
 *
 *   - **a due date per round.** There isn't one. Staff collect before the
 *     airline issues each EMD, as practice rather than against a date the
 *     system sets.
 *   - **refunded rounds.** When a round is pulled and re-issued the booking
 *     gains rounds 3 and 4, but the agent owes for the same two deposits and
 *     the amount does not change — so the rounds here are renumbered from 1.
 *     Showing the internal numbering would have an agent asking why they are
 *     being billed for a fourth round.
 *   - **the not-yet-issued round inside the required total.** The airline is
 *     not holding that money, so it sits below the line as a collection to
 *     make, not as arrears.
 */
export default function AgentRoundSchedule({
  rounds,
  emd,
  agentSeats,
  pnrSeats,
  compact = false,
}: {
  rounds: EmdRoundShare[];
  emd: EmdShare;
  agentSeats: number;
  pnrSeats: number;
  compact?: boolean;
}) {
  if (rounds.length === 0) {
    return (
      <p className={`text-stone-400 ${compact ? 'text-[11px]' : 'text-xs'}`}>
        No EMD issued on this booking yet, so there is nothing to collect for a round.
      </p>
    );
  }

  const pad = compact ? 'px-2 py-1' : 'px-3 py-1.5';

  return (
    <div className="space-y-1.5">
      <table className={`w-full ${compact ? 'text-[11px]' : 'text-xs'}`}>
        <thead>
          <tr className="text-left text-stone-400 border-b border-stone-200/70">
            <th className={`${pad} font-medium`}>Round</th>
            <th className={`${pad} font-medium text-right`}>Round EMD</th>
            <th className={`${pad} font-medium text-right`}>
              Share ({agentSeats}/{pnrSeats})
            </th>
          </tr>
        </thead>
        <tbody>
          {rounds.map((r) => (
            <tr
              key={`${r.roundNumber}-${r.issued}`}
              className={`border-b border-stone-100 last:border-0 ${
                r.issued ? '' : 'bg-indigo-50/40'
              }`}
            >
              <td className={`${pad} ${r.issued ? 'text-stone-600' : 'text-indigo-700 font-medium'}`}>
                Round {r.roundNumber}
                {!r.issued && (
                  <span className="block text-[10px] text-indigo-500">
                    collect before it is issued
                  </span>
                )}
              </td>
              <td className={`${pad} text-right tabular-nums text-stone-500`}>
                {formatPkr(r.emdAmount)}
              </td>
              <td
                className={`${pad} text-right tabular-nums font-semibold ${
                  r.issued ? 'text-stone-900' : 'text-indigo-700'
                }`}
              >
                {formatPkr(r.share)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className={`text-stone-500 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
        Required for rounds already issued{' '}
        <span className="tabular-nums text-stone-700">{formatPkr(emd.required)}</span> · received{' '}
        <span className="tabular-nums text-stone-700">{formatPkr(emd.recovered)}</span> ·{' '}
        {emd.due > 0 ? (
          <>
            still to collect{' '}
            <span className="tabular-nums font-semibold text-stone-900">{formatPkr(emd.due)}</span>
          </>
        ) : (
          <span className="font-semibold text-emerald-700">EMD share covered</span>
        )}
      </p>
    </div>
  );
}
