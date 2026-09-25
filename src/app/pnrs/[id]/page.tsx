import { requirePageUser } from '@/lib/server/session';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { canEditPnr, canManageEmd, canSplitPnr, isHeadOffice } from '@/lib/auth';
import { listAssignableAgents } from '../actions/assignments';
import { getPnrDetail, getPnrFormOptions } from '@/lib/pnrs';
import { diffInDays, getUrgency, todayIsoInPkt } from '@/lib/urgency';
import { cancelledTickets, svTicketIssuanceDeadline } from '@/lib/ticketing';
import { nextEmdSuggestion } from '@/lib/emd';
import { formatPkr } from '@/lib/format';
import AppHeader from '@/components/app-header';
import {
  ArrowLeft,
  History,
  Scissors,
  Ticket,
  CalendarClock,
  Banknote,
} from 'lucide-react';
import AddRoundButton from './add-round-button';
import RefundRoundButton from './refund-round-button';
import EditRoundButton from './edit-round-button';
import IataPaymentButton from './iata-payment-button';
import { iataPaymentState } from '@/lib/iata-payments';
import SplitPnrButton from './split-pnr-button';
import EditTicketingButton from './edit-ticketing-button';
import SeatOwnership from './seat-ownership';

// Two statuses only (owner ruling, 2026-09-21): an EMD is issued until the
// airline refunds it.
const ROUND_STATUS_STYLES: Record<string, string> = {
  issued: 'bg-amber-50 text-amber-700 border-amber-200',
  refunded: 'bg-violet-50 text-violet-700 border-violet-200',
};

/**
 * Colours for the IATA payment line. Deliberately a SEPARATE scale from the
 * issuance urgency on the same page: a round can be comfortably within its
 * issuance time limit and still be about to fall due to IATA, and one merged
 * colour would hide whichever of the two is not driving it (owner ruling,
 * 2026-09-22 — two separate indicators).
 */
const IATA_TONES: Record<string, string> = {
  red: 'border-red-200 bg-red-50 text-red-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  green: 'border-emerald-200 bg-emerald-50/60 text-emerald-700',
  grey: 'border-stone-200 bg-stone-50 text-stone-500',
};

const PNr_STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
  completed: 'bg-sky-50 text-sky-700 border-sky-200',
};

/**
 * A ticketing deadline with the same "how close is this?" reading the EMD rounds
 * get — red once it is today or overdue, amber within 5 days. Only meaningful
 * while the booking is active, so a cancelled or completed PNR shows the plain
 * date (the grey rule from docs/decisions.md, 2026-08-23).
 */
function DeadlineValue({
  iso,
  today,
  pnrStatus,
}: {
  iso: string | null;
  today: string;
  pnrStatus: string;
}) {
  if (!iso) return <>—</>;
  if (pnrStatus !== 'active') return <>{iso}</>;

  const days = diffInDays(today, iso);
  const tone =
    days < 0
      ? 'text-red-600 font-semibold'
      : days <= 2
        ? 'text-red-600 font-semibold'
        : days <= 5
          ? 'text-amber-600 font-medium'
          : 'text-stone-800';
  const note =
    days < 0 ? `overdue ${Math.abs(days)}d` : days === 0 ? 'today' : `in ${days}d`;

  return (
    <span className={tone}>
      {iso} <span className="text-[11px]">({note})</span>
    </span>
  );
}

/** 1st, 2nd, 3rd, 4th … for the EMD about to be issued. */
function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/**
 * What has to be issued next on this booking, and by when.
 *
 * With no rounds yet it is the 1st EMD, due by the date the booking was created
 * with (`pnr_tl_date`, from the airline's policy or typed in). Once a round
 * exists it is the next one, due by the time limit that round secured — which
 * is the same field, because `syncPnrTlDate` keeps the PNR TL on the earliest
 * outstanding round (owner rulings, 2026-09-07 and 2026-09-21).
 *
 * Tickets issued in time end the cycle instead, which is why the wording says
 * "or the tickets" rather than naming the EMD alone.
 */
function NextIssuance({
  roundsIssued,
  deadline,
  today,
  pnrStatus,
}: {
  roundsIssued: number;
  deadline: string | null;
  today: string;
  pnrStatus: string;
}) {
  const label = `${ordinal(roundsIssued + 1)} EMD`;

  if (!deadline) {
    return (
      <div className="mb-4 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-500">
        <strong className="font-semibold text-stone-700">{label}</strong> to be issued — no deadline
        recorded. Add one on the booking so it reaches the daily alert.
      </div>
    );
  }

  const active = pnrStatus === 'active';
  const days = diffInDays(today, deadline);
  const tone = !active
    ? 'border-stone-200 bg-stone-50 text-stone-500'
    : days < 0
      ? 'border-red-300 bg-red-50 text-red-800'
      : days <= 2
        ? 'border-red-200 bg-red-50 text-red-700'
        : days <= 5
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-indigo-200 bg-indigo-50 text-indigo-800';

  const when = !active
    ? deadline
    : days < 0
      ? `${deadline} — overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`
      : days === 0
        ? `${deadline} — today`
        : `${deadline} — in ${days} day${days === 1 ? '' : 's'}`;

  return (
    <div className={`mb-4 rounded-xl border px-4 py-3 ${tone}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <CalendarClock className="w-3.5 h-3.5 shrink-0" />
        <span>
          <strong className="font-semibold">{label}</strong> to be issued by
        </span>
        <span className="font-semibold tabular-nums">{when}</span>
      </div>
      <p className="mt-1 text-[11px] opacity-80">
        Issuing it secures the PNR to a new time limit. Issuing the tickets instead ends the cycle —
        no further EMD is needed.
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">{label}</p>
      <p className="mt-0.5 text-sm text-stone-800">{value ?? '—'}</p>
    </div>
  );
}

export default async function PnrDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user, authUser } = await requirePageUser();

  const { id } = await params;
  // Independent reads, fetched together rather than one after another — each
  // was a separate wait on the database before (2026-09-24). Nothing from the
  // options or the agent list is used unless the booking is found and in scope.
  const [detail, options, assignableAgents] = await Promise.all([
    getPnrDetail(id, authUser),
    getPnrFormOptions(authUser),
    listAssignableAgents(),
  ]);
  if (!detail) notFound();

  const userCanEditThisPnr = canEditPnr(authUser, detail.branchId, detail.hasIssuedEmd);
  const userCanManageEmd = canManageEmd(authUser);
  const userCanSplit = canSplitPnr(authUser);

  // Seat hand-over (phase 6). A branch may assign on its own bookings — and,
  // unlike editing, may still do so once an EMD round exists, because that is
  // exactly when seats are handed over (docs/decisions.md, 2026-09-19).
  const canAssignSeats =
    isHeadOffice(authUser) ||
    (detail.branchId !== null && authUser.branchIds.includes(detail.branchId));

  const today = todayIsoInPkt();
  const urgency = getUrgency(today, detail.rounds.find((r) => r.status === 'issued')?.deadlineDate ?? null, detail.status);

  // What the next EMD should look like, for the Add Round form to pre-fill.
  // Shared with the bulk issuance screen so the two cannot propose different
  // figures for the same booking.
  const nextEmd = nextEmdSuggestion({
    roundsIssued: detail.rounds.length,
    seats: detail.seats,
    fare: detail.fare,
    airlineCode: detail.airlineCode,
    segment: detail.segment,
    requestDateIso: detail.requestDate,
    outboundDateIso: detail.outboundDate,
    todayIso: today,
  });

  // Seats left unissued once the ticket-issuance deadline has passed. Null means
  // "nothing to say" — not zero (see cancelledTickets).
  const cancelled = cancelledTickets({
    todayIso: today,
    ticketIssuanceDeadline: detail.ticketing?.ticketIssuanceDeadline ?? null,
    ticketsIssued: detail.ticketing?.ticketsIssued ?? null,
    balanceTickets: detail.ticketing?.balanceTickets ?? null,
    pnrStatus: detail.status,
  });

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader user={user} subtitle="PNR Detail" />

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-indigo-600 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to dashboard
        </Link>

        {/* Title block */}
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-stone-400">SR#{detail.srNo}</p>
              <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-stone-900 font-mono">
                {detail.pnr}
              </h1>
              <p className="text-sm text-stone-500 mt-1">
                {detail.investorCompany}
                {detail.airlineName ? ` · ${detail.airlineName}` : ''}
                {detail.sector ? ` · ${detail.sector}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {userCanEditThisPnr && (
                <Link
                  href={`/pnrs/${detail.id}/edit`}
                  className="text-xs font-semibold px-3 py-1.5 rounded-xl text-white bg-gradient-to-tr from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 shadow-md shadow-indigo-500/20 transition-all"
                >
                  Edit booking
                </Link>
              )}
              <span className={`text-xs px-2.5 py-1 rounded-full border ${PNr_STATUS_STYLES[detail.status] ?? ''}`}>
                {detail.status}
              </span>
              {urgency !== 'grey' && detail.rounds.some((r) => r.status === 'issued') && (
                <span className={`text-xs px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 ${
                  urgency === 'red'
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : urgency === 'amber'
                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                }`}>
                  <CalendarClock className="w-3.5 h-3.5" />
                  {urgency === 'red' ? 'Due within 2 days' : urgency === 'amber' ? 'Due within 5 days' : 'On track'}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Core fields */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-stone-900 mb-4">Booking details</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-4">
              <Field label="Request date" value={detail.requestDate} />
              <Field label="Investor company" value={detail.investorCompany} />
              <Field label="License" value={detail.licenseName} />
              <Field label="Branch" value={detail.branchName} />
              <Field label="Segment" value={detail.segment} />
              <Field label="Airline" value={detail.airlineName ? `${detail.airlineCode} — ${detail.airlineName}` : null} />
              <Field label="Seats" value={
                <>
                  {detail.seats}
                  {detail.allocatedToChildren > 0 && (
                    <span className="text-[10px] text-stone-400 ml-1">
                      ({detail.allocatedToChildren} split to children)
                    </span>
                  )}
                </>
              } />
              <Field label="Outbound" value={detail.outboundDate} />
              <Field label="Inbound" value={detail.inboundDate} />
              <Field label="Sector" value={<span className="font-mono text-[13px]">{detail.sector}</span>} />
              <Field label="PNR TL date" value={detail.pnrTlDate} />
              <Field label="GDS PNR" value={detail.gdsPnr ? <span className="font-mono">{detail.gdsPnr}</span> : null} />
              <Field label="Issued status" value={
                <span className={`text-[11px] px-2 py-0.5 rounded-full border ${
                  detail.issuedStatus === 'issued'
                    ? 'bg-sky-50 text-sky-700 border-sky-200'
                    : 'bg-stone-100 text-stone-500 border-stone-200'
                }`}>
                  {detail.issuedStatus}
                </span>
              } />
              <Field label="Deal %" value={detail.dealPct !== null ? `${detail.dealPct}%` : null} />
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-stone-900 mb-4">Money (PKR)</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <Field label="Fare per seat" value={formatPkr(detail.fare)} />
              <Field label="Total EMD value" value={
                <span className="font-semibold">{formatPkr(detail.totalEmdValue)}</span>
              } />
              <Field label="Airline taxes" value={formatPkr(detail.airlineTaxes)} />
              <Field label="PSF" value={formatPkr(detail.psf)} />
            </div>
            <p className="mt-4 text-[11px] text-stone-400">
              Total EMD value = seats × fare, calculated by the database — never typed in.
              EMD covers base fare only; taxes and PSF belong to the ticketing stage.
            </p>

            {detail.parentPnr && (
              <div className="mt-5 rounded-xl bg-indigo-50 border border-indigo-100 p-3.5">
                <p className="text-xs text-indigo-700 flex items-center gap-1.5">
                  <Scissors className="w-3.5 h-3.5" />
                  Child of{' '}
                  <Link href={`/pnrs/${detail.parentPnr.id}`} className="font-mono font-semibold underline">
                    {detail.parentPnr.pnr}
                  </Link>
                  {detail.parentAllocationsTotal !== null && (
                    <> · {detail.parentAllocationsTotal} seat{detail.parentAllocationsTotal === 1 ? '' : 's'} allocated to this child</>
                  )}
                </p>
              </div>
            )}

            {detail.childAllocations.length > 0 && (
              <div className="mt-5 rounded-xl bg-indigo-50 border border-indigo-100 p-3.5">
                <p className="text-xs font-medium text-indigo-700 flex items-center gap-1.5 mb-2">
                  <Scissors className="w-3.5 h-3.5" /> Seat allocations
                </p>
                <div className="space-y-1.5">
                  {detail.childAllocations.map((a) => (
                    <div key={a.childPnrId} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Link href={`/pnrs/${a.childPnrId}`} className="font-mono font-semibold text-indigo-600 underline">
                          {a.childPnrCode}
                        </Link>
                        <span className="text-stone-500">→ {a.childInvestorCompany}</span>
                      </div>
                      <span className="font-medium text-stone-700">{a.seatsAllocated} seats</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t border-indigo-200 flex items-center justify-between text-xs font-medium">
                  <span className="text-indigo-600">Remaining on this PNR</span>
                  <span className="text-indigo-700">{detail.unallocatedSeats} seats</span>
                </div>
                {/* Offer what the SERVER will accept: seats held by agents
                    cannot be split away (phase 6). */}
                {userCanSplit && detail.unassignedSeats > 0 && (
                  <div className="mt-2">
                    <SplitPnrButton pnrId={detail.id} pnrCode={detail.pnr} maxSeats={detail.unassignedSeats} />
                  </div>
                )}
              </div>
            )}
            {detail.childAllocations.length === 0 && !detail.parentPnr && userCanSplit && detail.unassignedSeats > 0 && (
              <div className="mt-5">
                <SplitPnrButton pnrId={detail.id} pnrCode={detail.pnr} maxSeats={detail.unassignedSeats} />
              </div>
            )}
          </div>
        </section>

        {/* Seat ownership (phase 6) */}
        <SeatOwnership
          pnrId={detail.id}
          seats={detail.seats}
          agentSeats={detail.agentSeats}
          unassignedSeats={detail.unassignedSeats}
          assignments={detail.agentAssignments}
          agents={assignableAgents}
          pricing={{ fare: detail.fare, airlineTaxes: detail.airlineTaxes }}
          rounds={detail.rounds.map((r) => ({
            roundNumber: r.roundNumber,
            status: r.status,
            emdAmount: r.emdAmount,
            deadlineDate: r.deadlineDate,
          }))}
          upcomingRoundAmount={nextEmd.amount}
          ticketIssuanceDeadline={detail.ticketing?.ticketIssuanceDeadline ?? null}
          today={today}
          canAssign={canAssignSeats}
          canReleaseOrMove={userCanManageEmd}
        />

        {/* EMD rounds */}
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-stone-900">EMD rounds</h2>
            {userCanManageEmd && (
              <AddRoundButton
                pnrId={detail.id}
                licenses={options.licenses}
                seats={detail.seats}
                fare={detail.fare}
                suggestedPct={nextEmd.paymentPct}
                suggestedDeadline={nextEmd.deadline}
              />
            )}
          </div>
          <p className="text-[11px] text-stone-400 mb-4">
            Open-ended list — a round is added each time the deposit is extended or topped up.
            Issuing an EMD secures the PNR with the airline; paying for it is a separate
            obligation to IATA, shown on each round below and due on that period’s remittance day.
          </p>

          {/* The next thing that has to happen, and by when. Shown once for the
              booking rather than on each round: a round card carrying a date
              labelled "deadline" reads as that round's own due date, when it is
              actually the time limit for issuing the NEXT one (owner, 2026-09-21). */}
          <NextIssuance
            roundsIssued={detail.rounds.length}
            deadline={detail.pnrTlDate}
            today={today}
            pnrStatus={detail.status}
          />

          {detail.rounds.length === 0 ? (
            <p className="text-sm text-stone-400 py-6 text-center">
              No EMD rounds recorded for this booking yet.
            </p>
          ) : (
            <ol className="space-y-3">
              {detail.rounds.map((round) => {
                // No overdue styling per round: a round's date is the time limit
                // for issuing the NEXT EMD, so lateness belongs to the booking's
                // next-issuance block above, not to the round that was issued on
                // time.
                //
                // The IATA payment date is the one deadline that DOES belong to
                // the round itself — it is set by the period the round was
                // issued in, so it is shown and coloured here, separately from
                // the issuance clock above (owner ruling, 2026-09-22).
                const iata = iataPaymentState({
                  issuanceDate: round.issuanceDate,
                  paymentDate: round.paymentDate,
                  refundDate: round.refundDate,
                  roundStatus: round.status,
                  todayIso: today,
                });
                return (
                  <li
                    key={round.id}
                    className="rounded-xl border border-stone-200 bg-stone-50/60 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center">
                          {round.roundNumber}
                        </span>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${ROUND_STATUS_STYLES[round.status] ?? ''}`}>
                          {round.status.replace('_', ' ')}
                        </span>
                        {userCanManageEmd && (
                          <div className="flex gap-2">
                            <EditRoundButton pnrId={detail.id} round={round} licenses={options.licenses} />
                            {round.status !== 'refunded' && (
                              <RefundRoundButton pnrId={detail.id} roundId={round.id} />
                            )}
                            <IataPaymentButton roundId={round.id} state={iata} today={today} />
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-semibold text-stone-900 tabular-nums">
                        {formatPkr(round.emdAmount)}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-xs text-stone-600">
                      <div><span className="text-stone-400">Issued</span> {round.issuanceDate}{round.issuanceTime ? ` ${round.issuanceTime}` : ''}</div>
                      <div><span className="text-stone-400">Payment %</span> {round.paymentPct}%</div>
                      <div><span className="text-stone-400">EMD #</span> {round.emdNumber ?? '—'}</div>
                      <div>
                        <span className="text-stone-400">Paid By</span>{' '}
                        {round.licenseName ?? (detail.licenseName ? <span className="text-stone-500 italic">{detail.licenseName}</span> : '—')}
                      </div>
                      <div><span className="text-stone-400">Refund</span> {round.refundAmount !== null ? `${formatPkr(round.refundAmount)} on ${round.refundDate}` : '—'}</div>
                    </div>
                    <div className={`mt-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-[11px] ${IATA_TONES[iata.urgency]}`}>
                      <Banknote className="w-3.5 h-3.5 shrink-0" />
                      <span className="font-medium">{iata.label}</span>
                      {iata.period && (
                        <span className="text-stone-400 font-mono">
                          IATA {iata.period.code} · billed {iata.period.billingFrom} to {iata.period.billingTo}
                        </span>
                      )}
                      {/* The decision date, not another deadline: refund on or
                          before this and re-issue after it, and the bill moves
                          a cycle (owner, 2026-09-22). Hidden once it has
                          passed, when the choice is no longer available. */}
                      {iata.rollBy && (
                        <span className="text-stone-500">
                          To move this to the next cycle, refund by{' '}
                          <strong className="font-semibold">{iata.rollBy}</strong> and re-issue after it
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* Ticketing */}
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-stone-900 flex items-center gap-1.5">
              <Ticket className="w-4 h-4 text-sky-500" /> Ticketing stage
            </h2>
            {userCanManageEmd && (
              <EditTicketingButton
                pnrId={detail.id}
                seats={detail.seats}
                ticketing={detail.ticketing}
                suggestedIssuanceDeadline={svTicketIssuanceDeadline(
                  detail.airlineCode,
                  detail.outboundDate
                )}
              />
            )}
          </div>
          <p className="text-[11px] text-stone-400 mb-4">
            Both deadlines feed the daily deadline alert, alongside EMD rounds.
          </p>

          {/* Seats never ticketed by the issuance deadline are considered
              cancelled (owner rule, 2026-09-19). Worked out from the deadline
              and the counts — nothing is stored, so extending the deadline with
              the airline makes this disappear on its own. */}
          {cancelled !== null && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3.5">
              <p className="text-xs text-red-700">
                <strong>{cancelled} ticket{cancelled === 1 ? '' : 's'} considered cancelled.</strong>{' '}
                The ticket issuance deadline ({detail.ticketing?.ticketIssuanceDeadline}) passed with{' '}
                {cancelled} of {detail.seats} seat{detail.seats === 1 ? '' : 's'} unissued.
              </p>
              <p className="text-[11px] text-red-600/80 mt-1">
                Not recorded as a change — if the airline extends the deadline, update it above and
                this clears itself.
              </p>
            </div>
          )}

          {detail.ticketing ? (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-4">
              <Field
                label="Name update deadline"
                value={<DeadlineValue iso={detail.ticketing.nameUpdateDeadline} today={today} pnrStatus={detail.status} />}
              />
              <Field
                label="Issuance deadline"
                value={<DeadlineValue iso={detail.ticketing.ticketIssuanceDeadline} today={today} pnrStatus={detail.status} />}
              />
              <Field label="Status" value={detail.ticketing.status} />
              <Field label="Tickets issued" value={detail.ticketing.ticketsIssued} />
              <Field
                label="Balance tickets"
                value={
                  <>
                    {detail.ticketing.balanceTickets ?? '—'}
                    {cancelled !== null && (
                      <span className="block text-[11px] text-red-600 font-medium mt-0.5">
                        considered cancelled
                      </span>
                    )}
                  </>
                }
              />
            </div>
          ) : (
            <p className="text-sm text-stone-400 py-6 text-center">
              No ticketing details recorded for this booking yet.
            </p>
          )}
        </section>

        {/* Activity history */}
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-stone-900 mb-4 flex items-center gap-1.5">
            <History className="w-4 h-4 text-violet-500" /> Change history
          </h2>
          {detail.activityLog.length === 0 ? (
            <p className="text-sm text-stone-400 py-4 text-center">
              No changes recorded yet. Every edit made through the app will appear here.
            </p>
          ) : (
            <ul className="space-y-3">
              {detail.activityLog.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
                  <div>
                    <span className="font-mono font-medium text-stone-800">{entry.fieldName}</span>{' '}
                    changed from{' '}
                    <span className="font-mono text-red-600 line-through decoration-red-300">
                      {entry.oldValue ?? '(empty)'}
                    </span>{' '}
                    to{' '}
                    <span className="font-mono text-emerald-700">{entry.newValue ?? '(empty)'}</span>
                    <span className="block text-[11px] text-stone-400 mt-0.5">
                      {new Date(entry.changedAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}
                      {' · '}
                      {entry.tableName}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="border-t border-stone-200 py-4">
        <p className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 text-[11px] text-stone-400">
          Eyries EMD · amounts in PKR · created {new Date(detail.createdAt).toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' })}
        </p>
      </footer>
    </div>
  );
}


