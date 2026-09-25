'use client';

import { useState, useTransition } from 'react';
import { UserPlus, X, AlertTriangle, Undo2, ArrowLeftRight, Percent, Banknote, Trash2, CalendarClock } from 'lucide-react';
import {
  assignSeatsToAgent,
  releaseAgentSeats,
  moveAgentSeats,
  saveAssignmentTerms,
} from '../actions/assignments';
import { recordRecovery, deleteRecovery } from '../actions/recoveries';
import {
  agentBalance,
  agentTotal,
  describeTerm,
  type AgentTerms,
  type PnrPricing,
  type TermType,
} from '@/lib/agent-money';
import { agentDues, type DuesRound } from '@/lib/agent-dues';
import AgentRoundSchedule from '@/components/agent-round-schedule';
import { diffInDays } from '@/lib/urgency';
import { formatPkr } from '@/lib/format';

export interface RecoveryRow {
  id: string;
  amount: number;
  receivedDate: string;
  method: string | null;
  reference: string | null;
}

export interface AssignmentRow {
  id: string;
  agentId: string;
  agentName: string;
  seats: number;
  terms: AgentTerms;
  recoveries: RecoveryRow[];
}

const inputCls =
  'w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400 transition-colors';

/**
 * Who holds this booking's seats, and the actions that change it.
 *
 * Every number shown here is derived from the ledger (src/lib/inventory.ts) —
 * the same code the server validates against, so this panel can never offer a
 * number the save will refuse.
 */
export default function SeatOwnership({
  pnrId,
  seats,
  agentSeats,
  unassignedSeats,
  assignments,
  agents,
  pricing,
  rounds,
  upcomingRoundAmount,
  ticketIssuanceDeadline,
  today,
  canAssign,
  canReleaseOrMove,
}: {
  pnrId: string;
  seats: number;
  agentSeats: number;
  unassignedSeats: number;
  assignments: AssignmentRow[];
  agents: { id: string; name: string }[];
  /** The booking's own per-seat money, used to work out what each agent owes. */
  pricing: PnrPricing;
  /**
   * The booking's EMD rounds and ticketing deadline — what the airline holds
   * and by when. Together they decide when each agent's money falls due
   * (`lib/agent-dues.ts`); without them the panel could show a balance but not
   * a date.
   */
  rounds: DuesRound[];
  /**
   * The next round's EMD amount, from the airline policy. Shown as money to
   * collect **before** that round is issued (owner ruling, 2026-09-22) — null
   * when no policy covers the airline, in which case no upcoming line appears
   * rather than a guessed one.
   */
  upcomingRoundAmount: number | null;
  ticketIssuanceDeadline: string | null;
  /**
   * Today in Pakistan, from the server. A payment cannot be dated in the
   * future, and the browser's own clock and time zone decide neither — a laptop
   * set to yesterday would otherwise make today's payment unrecordable.
   */
  today: string;
  canAssign: boolean;
  /** Release and move are Head Office only (docs/decisions.md, ruling 7). */
  canReleaseOrMove: boolean;
}) {
  const [dialog, setDialog] = useState<
    | { kind: 'assign' }
    | { kind: 'release'; row: AssignmentRow }
    | { kind: 'move'; row: AssignmentRow }
    | { kind: 'terms'; row: AssignmentRow }
    | { kind: 'pay'; row: AssignmentRow }
    | null
  >(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: (fd: FormData) => Promise<{ ok: boolean; error?: string }>) =>
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      const formData = new FormData(e.currentTarget);
      startTransition(async () => {
        const res = await fn(formData);
        if (res?.error) setError(res.error);
        else setDialog(null);
      });
    };

  const pct = (n: number) => (seats > 0 ? (n / seats) * 100 : 0);
  const assignableAgents = agents.filter((a) => a.id);

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-stone-900">Seat ownership</h2>
        {canAssign && unassignedSeats > 0 && agents.length > 0 && (
          <button
            onClick={() => { setError(null); setDialog({ kind: 'assign' }); }}
            className="text-[11px] font-medium text-stone-500 hover:text-indigo-600 transition-colors inline-flex items-center gap-1 cursor-pointer border border-stone-200 bg-white px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 hover:border-indigo-200 shadow-sm"
          >
            <UserPlus className="w-3 h-3" />
            Assign to agent
          </button>
        )}
      </div>
      <p className="text-[11px] text-stone-400 mb-4">
        Every booking is bought on company investment; seats stay with the company until they are
        handed to an agent. Assigning never changes the booking’s seat count or its EMD value.
      </p>

      {/* Proportional bar: agents vs unassigned */}
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-stone-100 mb-3">
        {agentSeats > 0 && (
          <div
            className="bg-gradient-to-r from-indigo-500 to-violet-500"
            style={{ width: `${pct(agentSeats)}%` }}
            title={`${agentSeats} seats with agents`}
          />
        )}
        {unassignedSeats > 0 && (
          <div
            className="bg-stone-300"
            style={{ width: `${pct(unassignedSeats)}%` }}
            title={`${unassignedSeats} with the company`}
          />
        )}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-stone-600 mb-4">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-indigo-500" />
          {agentSeats} with agents
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-stone-300" />
          {unassignedSeats} with the company
        </span>
        <span className="text-stone-400">{seats} seats on this booking</span>
      </div>

      {assignments.length === 0 ? (
        <p className="text-sm text-stone-400 py-4 text-center">
          No seats handed to an agent yet.
          {agents.length === 0 && ' Add an agent first on the Agents page.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {assignments.map((a) => {
            const money = agentBalance({
              seats: a.seats,
              pricing,
              terms: a.terms,
              recoveries: a.recoveries.map((r) => r.amount),
            });
            const dues = agentDues({
              agentSeats: a.seats,
              pnrSeats: seats,
              pricing,
              terms: a.terms,
              recoveries: a.recoveries.map((r) => r.amount),
              rounds,
              ticketIssuanceDeadline,
              upcomingRoundAmount,
            });
            const hasTerms = a.terms.chargeType !== 'none' || a.terms.discountType !== 'none';
            return (
              <li
                key={a.id}
                className="rounded-xl border border-stone-200 bg-stone-50/60 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-stone-800">{a.agentName}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-stone-700 tabular-nums">
                      {a.seats} seat{a.seats === 1 ? '' : 's'}
                    </span>
                    <div className="flex items-center gap-1">
                      {canAssign && (
                        <>
                          <button
                            onClick={() => { setError(null); setDialog({ kind: 'pay', row: a }); }}
                            className="text-stone-400 hover:text-emerald-600 p-1.5 rounded-lg hover:bg-white transition-colors cursor-pointer"
                            title="Record a payment received"
                          >
                            <Banknote className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { setError(null); setDialog({ kind: 'terms', row: a }); }}
                            className="text-stone-400 hover:text-emerald-600 p-1.5 rounded-lg hover:bg-white transition-colors cursor-pointer"
                            title="Set charge, discount and tax"
                          >
                            <Percent className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      {canReleaseOrMove && (
                        <>
                          <button
                            onClick={() => { setError(null); setDialog({ kind: 'move', row: a }); }}
                            className="text-stone-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-white transition-colors cursor-pointer"
                            title="Move seats to another agent"
                          >
                            <ArrowLeftRight className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { setError(null); setDialog({ kind: 'release', row: a }); }}
                            className="text-stone-400 hover:text-violet-600 p-1.5 rounded-lg hover:bg-white transition-colors cursor-pointer"
                            title="Take seats back"
                          >
                            <Undo2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* What this agent owes. Every figure is calculated from the
                    terms and the booking's fare — nothing here is stored. */}
                <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px] text-stone-500">
                  <span className="text-stone-700">
                    Owes <span className="font-semibold tabular-nums">{formatPkr(money.total)}</span>
                  </span>
                  <span className="tabular-nums">{a.seats} × {formatPkr(pricing.fare)} fare</span>
                  {money.charge > 0 && (
                    <span className="text-emerald-700 tabular-nums">
                      + {formatPkr(money.charge)} charge ({describeTerm(a.terms.chargeType, a.terms.chargeValue)})
                    </span>
                  )}
                  {money.discount > 0 && (
                    <span className="text-amber-700 tabular-nums">
                      − {formatPkr(money.discount)} discount ({describeTerm(a.terms.discountType, a.terms.discountValue)})
                    </span>
                  )}
                  {money.tax > 0 && (
                    <span className="tabular-nums">+ {formatPkr(money.tax)} airline tax</span>
                  )}
                  {hasTerms && (
                    <span className={money.margin < 0 ? 'text-amber-700' : 'text-emerald-700'}>
                      Margin {formatPkr(money.margin)}
                    </span>
                  )}
                  {!hasTerms && <span className="text-stone-400">At fare — no charge or discount set</span>}
                </div>

                {/* What is still to come in, and when. Outstanding is the total
                    minus the payments recorded, and the due dates come from the
                    airline's own deadlines — all calculated, never stored. */}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-stone-200/70 pt-2 text-[11px]">
                  <span className="text-stone-500">
                    Paid <span className="tabular-nums text-stone-700">{formatPkr(money.recovered)}</span>
                    {a.recoveries.length > 0 && (
                      <span className="text-stone-400"> ({a.recoveries.length} payment{a.recoveries.length === 1 ? '' : 's'})</span>
                    )}
                  </span>
                  {money.credit > 0 ? (
                    <span className="font-semibold text-indigo-700 tabular-nums">
                      {formatPkr(money.credit)} in credit
                    </span>
                  ) : money.outstanding === 0 ? (
                    <span className="font-semibold text-emerald-700">Settled in full</span>
                  ) : (
                    <span className="text-stone-600">
                      Outstanding{' '}
                      <span className="font-semibold tabular-nums text-stone-900">
                        {formatPkr(money.outstanding)}
                      </span>
                    </span>
                  )}
                  <NextDue dues={dues} today={today} />
                </div>

                {/* What this agent pays for each EMD round. There is no date
                    per round — staff collect before the airline issues each
                    one (owner ruling, 2026-09-22). */}
                <div className="mt-2 border-t border-stone-200/70 pt-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-stone-400 mb-1">
                    EMD payments to make
                  </p>
                  <AgentRoundSchedule
                    rounds={dues.rounds}
                    emd={dues.emd}
                    agentSeats={a.seats}
                    pnrSeats={seats}
                    compact
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-stone-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-stone-900">
                {dialog.kind === 'assign'
                  ? 'Assign seats to an agent'
                  : dialog.kind === 'release'
                    ? `Take seats back from ${dialog.row.agentName}`
                    : dialog.kind === 'terms'
                      ? `What ${dialog.row.agentName} pays`
                      : dialog.kind === 'pay'
                        ? `Payments from ${dialog.row.agentName}`
                      : `Move ${dialog.row.agentName}’s seats`}
              </h3>
              <button
                onClick={() => setDialog(null)}
                className="text-stone-400 hover:text-stone-600 p-1 rounded-md hover:bg-stone-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {dialog.kind === 'assign' && (
              <form onSubmit={run(assignSeatsToAgent)} className="p-5 space-y-4">
                {error && <FormError message={error} />}
                <input type="hidden" name="pnr_id" value={pnrId} />
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">
                    Agent <span className="text-red-500">*</span>
                  </label>
                  <select name="agent_id" required className={`${inputCls} cursor-pointer`}>
                    {assignableAgents.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">
                    Seats <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    name="seats"
                    required
                    min="1"
                    max={unassignedSeats}
                    step="1"
                    defaultValue={unassignedSeats}
                    className={inputCls}
                  />
                  <p className="mt-1 text-[11px] text-stone-400">
                    {unassignedSeats} still with the company. Giving an agent more seats adds to
                    what they already hold.
                  </p>
                </div>
                <Buttons onCancel={() => setDialog(null)} isPending={isPending} label="Assign seats" />
              </form>
            )}

            {dialog.kind === 'release' && (
              <form onSubmit={run(releaseAgentSeats)} className="p-5 space-y-4">
                {error && <FormError message={error} />}
                <input type="hidden" name="assignment_id" value={dialog.row.id} />
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">
                    Seats to take back <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    name="seats"
                    required
                    min="1"
                    max={dialog.row.seats}
                    step="1"
                    defaultValue={dialog.row.seats}
                    className={inputCls}
                  />
                  <p className="mt-1 text-[11px] text-stone-400">
                    {dialog.row.agentName} holds {dialog.row.seats}. Released seats return to the
                    company.
                  </p>
                </div>
                <Buttons onCancel={() => setDialog(null)} isPending={isPending} label="Take seats back" />
              </form>
            )}

            {dialog.kind === 'move' && (
              <form onSubmit={run(moveAgentSeats)} className="p-5 space-y-4">
                {error && <FormError message={error} />}
                <input type="hidden" name="assignment_id" value={dialog.row.id} />
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">
                    Move to <span className="text-red-500">*</span>
                  </label>
                  <select name="to_agent_id" required className={`${inputCls} cursor-pointer`}>
                    {assignableAgents
                      .filter((a) => a.id !== dialog.row.agentId)
                      .map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">
                    Seats <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    name="seats"
                    required
                    min="1"
                    max={dialog.row.seats}
                    step="1"
                    defaultValue={dialog.row.seats}
                    className={inputCls}
                  />
                  <p className="mt-1 text-[11px] text-stone-400">
                    Charges and discounts stay with {dialog.row.agentName} — the receiving agent
                    starts with none.
                  </p>
                </div>
                <Buttons onCancel={() => setDialog(null)} isPending={isPending} label="Move seats" />
              </form>
            )}

            {dialog.kind === 'terms' && (
              <TermsForm
                row={dialog.row}
                pricing={pricing}
                error={error}
                isPending={isPending}
                onSubmit={run(saveAssignmentTerms)}
                onCancel={() => setDialog(null)}
              />
            )}

            {dialog.kind === 'pay' && (
              <RecoveryForm
                row={dialog.row}
                pricing={pricing}
                today={today}
                error={error}
                isPending={isPending}
                canDelete={canReleaseOrMove}
                onSubmit={run(recordRecovery)}
                onDelete={run(deleteRecovery)}
                onCancel={() => setDialog(null)}
              />
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function Buttons({
  onCancel,
  isPending,
  label,
}: {
  onCancel: () => void;
  isPending: boolean;
  label: string;
}) {
  return (
    <div className="pt-2 flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="px-4 py-2 text-xs font-medium rounded-xl hover:bg-stone-100 text-stone-600 transition-colors cursor-pointer"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-2 text-xs font-semibold rounded-xl text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
      >
        {isPending ? 'Saving...' : label}
      </button>
    </div>
  );
}

/**
 * Charge, discount and the airline-tax tick for one agent on one booking.
 *
 * A charge and a discount are never used together (ruling 10), so the form
 * offers **one** adjustment and asks which it is. Making them two independent
 * fields would let a person fill in both and only learn at save time that the
 * combination is refused — and the database check would refuse it too.
 *
 * The total updates as the form is filled in, from `agentTotal()` — the same
 * function the server validates and the page displays with, so the preview
 * cannot promise a figure the save then changes.
 */
function TermsForm({
  row,
  pricing,
  error,
  isPending,
  onSubmit,
  onCancel,
}: {
  row: AssignmentRow;
  pricing: PnrPricing;
  error: string | null;
  isPending: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  type Adjustment = 'none' | 'charge' | 'discount';
  const initialAdjustment: Adjustment =
    row.terms.chargeType !== 'none' ? 'charge' : row.terms.discountType !== 'none' ? 'discount' : 'none';
  // Whichever side is set decides how the box is pre-filled; a fresh assignment
  // opens on a percentage, the form the owner's own example uses.
  const initialType: TermType =
    row.terms.chargeType !== 'none'
      ? row.terms.chargeType
      : row.terms.discountType !== 'none'
        ? row.terms.discountType
        : 'pct';
  const initialValue =
    row.terms.chargeValue ?? row.terms.discountValue ?? null;

  const [adjustment, setAdjustment] = useState<Adjustment>(initialAdjustment);
  const [termType, setTermType] = useState<TermType>(initialType);
  const [value, setValue] = useState<string>(initialValue === null ? '' : String(initialValue));
  const [tax, setTax] = useState<boolean>(row.terms.chargeTax);

  const parsed = value.trim() === '' ? null : Number(value);
  const preview = agentTotal({
    seats: row.seats,
    pricing,
    terms: {
      chargeType: adjustment === 'charge' ? termType : 'none',
      chargeValue: adjustment === 'charge' ? parsed : null,
      discountType: adjustment === 'discount' ? termType : 'none',
      discountValue: adjustment === 'discount' ? parsed : null,
      chargeTax: tax,
    },
  });

  return (
    <form onSubmit={onSubmit} className="p-5 space-y-4">
      {error && <FormError message={error} />}
      <input type="hidden" name="assignment_id" value={row.id} />
      {/* The two sides are posted separately; only the chosen one carries a
          type, which is what keeps the charge-XOR-discount rule true. */}
      <input type="hidden" name="charge_type" value={adjustment === 'charge' ? termType : 'none'} />
      <input type="hidden" name="charge_value" value={adjustment === 'charge' ? value : ''} />
      <input type="hidden" name="discount_type" value={adjustment === 'discount' ? termType : 'none'} />
      <input type="hidden" name="discount_value" value={adjustment === 'discount' ? value : ''} />
      <input type="hidden" name="charge_tax" value={tax ? 'true' : 'false'} />

      <div>
        <label className="block text-xs font-medium text-stone-600 mb-1.5">
          On top of the fare
        </label>
        <select
          value={adjustment}
          onChange={(e) => setAdjustment(e.target.value as Adjustment)}
          className={`${inputCls} cursor-pointer`}
        >
          <option value="none">Nothing — the agent pays the fare</option>
          <option value="charge">Additional charge (sold above fare)</option>
          <option value="discount">Discount (sold below fare)</option>
        </select>
      </div>

      {adjustment !== 'none' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">Calculated as</label>
            <select
              value={termType}
              onChange={(e) => setTermType(e.target.value as TermType)}
              className={`${inputCls} cursor-pointer`}
            >
              <option value="pct">% of fare</option>
              <option value="per_seat">PKR per seat</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">
              {termType === 'pct' ? 'Percentage' : 'Amount per seat'}{' '}
              <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={termType === 'pct' ? '5' : '2000'}
              className={inputCls}
            />
          </div>
        </div>
      )}

      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={tax}
          onChange={(e) => setTax(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-stone-300 text-indigo-600 focus:ring-indigo-400/50 cursor-pointer"
        />
        <span className="text-xs text-stone-600">
          Agent pays the airline tax
          {pricing.airlineTaxes !== null ? (
            <span className="text-stone-400"> — {formatPkr(pricing.airlineTaxes)} per seat on this booking</span>
          ) : (
            <span className="text-amber-600"> — no airline tax recorded on this booking, so nothing is added</span>
          )}
          <span className="block text-stone-400 mt-0.5">
            Taxes go to the government and never count towards margin.
          </span>
        </span>
      </label>

      {/* Live total, same calculation as the server's */}
      <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-xs space-y-1">
        <Line label={`${row.seats} × fare`} value={formatPkr(preview.base)} />
        {preview.charge > 0 && <Line label="Additional charge" value={`+ ${formatPkr(preview.charge)}`} />}
        {preview.discount > 0 && <Line label="Discount" value={`− ${formatPkr(preview.discount)}`} />}
        {preview.tax > 0 && <Line label="Airline tax" value={`+ ${formatPkr(preview.tax)}`} />}
        <div className="flex justify-between pt-1.5 border-t border-stone-200 font-semibold text-stone-800">
          <span>{row.agentName} owes</span>
          <span className="tabular-nums">{formatPkr(preview.total)}</span>
        </div>
        <div className="flex justify-between text-stone-500">
          <span>Company margin</span>
          <span className="tabular-nums">{formatPkr(preview.margin)}</span>
        </div>
      </div>

      <Buttons onCancel={onCancel} isPending={isPending} label="Save terms" />
    </form>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-stone-600">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Recording money received from one agent, and the payments already recorded.
 *
 * The list and the form share one dialog on purpose: the question "has this
 * agent paid?" and the act of recording a payment are the same moment of work,
 * and a staff member about to enter a payment should be looking at the ones
 * already there — it is how a double entry gets caught before it is made.
 *
 * Deleting is the only correction (a negative payment would read as money going
 * back to the agent) and is Head Office only, so a branch sees the list without
 * the bins.
 */
function RecoveryForm({
  row,
  pricing,
  today,
  error,
  isPending,
  canDelete,
  onSubmit,
  onDelete,
  onCancel,
}: {
  row: AssignmentRow;
  pricing: PnrPricing;
  today: string;
  error: string | null;
  isPending: boolean;
  canDelete: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onDelete: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const money = agentBalance({
    seats: row.seats,
    pricing,
    terms: row.terms,
    recoveries: row.recoveries.map((r) => r.amount),
  });

  return (
    <div className="p-5 space-y-4">
      {error && <FormError message={error} />}

      <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-xs space-y-1">
        <Line label={`Owes on ${row.seats} seat${row.seats === 1 ? '' : 's'}`} value={formatPkr(money.total)} />
        <Line label="Paid so far" value={formatPkr(money.recovered)} />
        <div className="flex justify-between pt-1.5 border-t border-stone-200 font-semibold text-stone-800">
          <span>{money.credit > 0 ? 'In credit' : 'Outstanding'}</span>
          <span className="tabular-nums">
            {formatPkr(money.credit > 0 ? money.credit : money.outstanding)}
          </span>
        </div>
      </div>

      {row.recoveries.length > 0 && (
        <div className="space-y-1.5 max-h-44 overflow-y-auto">
          {row.recoveries.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 px-3 py-2 text-xs"
            >
              <div className="min-w-0">
                <span className="font-medium text-stone-800 tabular-nums">{formatPkr(r.amount)}</span>
                <span className="text-stone-400"> · {r.receivedDate}</span>
                {r.method && <span className="text-stone-500"> · {r.method}</span>}
                {r.reference && (
                  <span className="block text-[10px] text-stone-400 truncate">Ref {r.reference}</span>
                )}
              </div>
              {canDelete && (
                <form onSubmit={onDelete}>
                  <input type="hidden" name="recovery_id" value={r.id} />
                  <button
                    type="submit"
                    disabled={isPending}
                    className="text-stone-300 hover:text-red-600 p-1 rounded-md hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50"
                    title="Delete this payment — the deletion is recorded in the history"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4 border-t border-stone-100 pt-4">
        <input type="hidden" name="assignment_id" value={row.id} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">
              Amount received <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="amount"
              required
              min="0.01"
              step="0.01"
              placeholder="150000"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">
              Date received <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              name="received_date"
              required
              defaultValue={today}
              max={today}
              className={inputCls}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">Method</label>
            <input type="text" name="method" placeholder="Bank transfer" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">Reference</label>
            <input type="text" name="reference" placeholder="Cheque or transfer no." className={inputCls} />
          </div>
        </div>
        <p className="text-[11px] text-stone-400">
          A payment larger than the balance is allowed — it shows as credit.
        </p>
        <Buttons onCancel={onCancel} isPending={isPending} label="Record payment" />
      </form>
    </div>
  );
}

/**
 * When this agent's money falls due, beside what they still owe.
 *
 * The EMD share comes first and the balance at ticketing; they are not added
 * together, because the EMD share is a milestone inside the total rather than a
 * separate charge. A balance with **no ticketing deadline recorded** shows as
 * owed with no date — nothing here invents one (owner ruling 17).
 */
function NextDue({ dues, today }: { dues: ReturnType<typeof agentDues>; today: string }) {
  const next = dues.next;
  if (!next) return null;

  const what = next.kind === 'emd' ? 'EMD share' : 'Balance';

  if (!next.date) {
    // Two different reasons for having no date, and they must not read alike.
    // An EMD share never has one; a balance has none only until somebody
    // records the ticketing deadline.
    return (
      <span className="text-stone-400">
        {what} {formatPkr(next.amount)} —{' '}
        {next.kind === 'emd'
          ? 'collect before the next EMD is issued'
          : 'no due date until the ticketing deadline is set'}
      </span>
    );
  }

  const days = diffInDays(today, next.date);
  const tone =
    days <= 2
      ? 'bg-red-50 border-red-200 text-red-700'
      : days <= 5
        ? 'bg-amber-50 border-amber-200 text-amber-700'
        : 'bg-stone-50 border-stone-200 text-stone-500';

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium whitespace-nowrap ${tone}`}
    >
      <CalendarClock className="w-3 h-3" />
      {what} {formatPkr(next.amount)} {days < 0 ? `overdue since ${next.date}` : `due ${next.date}`}
    </span>
  );
}
