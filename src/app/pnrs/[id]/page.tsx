import { requirePageUser } from '@/lib/server/session';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { canEditPnr, canManageEmd, isHeadOffice } from '@/lib/auth';
import { getPnrDetail, getPnrFormOptions, listAssignableAgents, type DetailStop } from '@/lib/pnrs';
import { diffInDays, getUrgency, todayIsoInPkt } from '@/lib/urgency';
import { penaltyEntryOpen, svTicketIssuanceDeadline, unissuedAcross } from '@/lib/ticketing';
import { lastOutbound, splittableSeats, ticketParts } from '@/lib/splits';
import { nextEmdSuggestion } from '@/lib/emd';
import { enteredInApp } from '@/lib/booking-entry';
import { formatPkr } from '@/lib/format';
import AppHeader from '@/components/app-header';
import {
  ArrowLeft,
  History,
  Ticket,
  AlertTriangle,
  CalendarClock,
  Banknote,
} from 'lucide-react';
import AddRoundButton from './add-round-button';
import RefundRoundButton from './refund-round-button';
import RequestRefundButton from './request-refund-button';
import { partsRefundTiming, refundRequestBlocker } from '@/lib/refunds';
import EditRoundButton from './edit-round-button';
import IataPaymentButton from './iata-payment-button';
import { iataPaymentState } from '@/lib/iata-payments';
import SplitsPanel from './splits-panel';
import ReleasePnrButton from './release-pnr-button';
import CancelPnrButton from './cancel-pnr-button';
import PenaltyPaidSwitch from './penalty-paid-switch';
import { cancellationFlag, describeFlag } from '@/lib/cancellation';
import { emd1AtRisk } from '@/lib/release';
import EditTicketingButton from './edit-ticketing-button';
import PenaltyButton from './penalty-button';
import SeatOwnership from './seat-ownership';
import { TRIP_TYPE_LABELS, formatBaggage, isTripType } from '@/lib/flight-details';
import { nextStep, ordinal, type NextStep } from '@/lib/issuance';

// issued → refund requested → refunded (Phase 9 Step 3, A1).
const ROUND_STATUS_STYLES: Record<string, string> = {
  issued: 'bg-amber-50 text-amber-700 border-amber-200',
  refund_requested: 'bg-sky-50 text-sky-700 border-sky-200',
  forfeited: 'bg-red-50 text-red-700 border-red-200',
  refunded: 'bg-brand-50 text-brand-dark border-brand-200',
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
  released: 'bg-stone-100 text-stone-600 border-stone-300',
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

/**
 * What has to be issued next on this booking, and by when.
 *
 * With no rounds yet it is the 1st EMD, due by the date the booking was created
 * with (`pnr_tl_date`, from the airline's policy or typed in). After round 1 it
 * is the 2nd, due by the time limit round 1 secured. After the 2nd, no EMD is
 * suggested — only the tickets remain (`nextStep`, owner 2026-09-28).
 *
 * Tickets issued in time end the cycle instead, which is why the wording says
 * "or the tickets" rather than naming the EMD alone.
 */
function NextIssuance({
  step,
  roundsIssued,
  today,
  pnrStatus,
}: {
  step: NextStep;
  roundsIssued: number;
  today: string;
  pnrStatus: string;
}) {
  // Every EMD issued: what is left is the tickets, which this system keeps no
  // record of — so the date is information, never a warning (owner, 2026-09-28).
  if (step.kind === 'tickets') {
    return (
      <div className="mb-4 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-600">
        <strong className="font-semibold text-stone-700">{roundsIssued} EMDs issued</strong> — no further
        EMD is due. {step.deadline ? <>Tickets are due by <span className="font-semibold tabular-nums">{step.deadline}</span>.</> : 'Tickets are next.'}
      </div>
    );
  }
  const deadline = step.deadline;
  const label = `${ordinal(step.emdRound!)} EMD`;

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
          : 'border-brand-200 bg-brand-50 text-brand-dark';

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

/**
 * "+1" after a time on a later day than the flight's departure, the airline
 * way of writing an overnight arrival; the date itself shows on hover.
 */
function LaterDay({ from, on }: { from: string | null; on: string | null }) {
  if (!from || !on) return null;
  const days = diffInDays(from, on);
  if (days <= 0) return null;
  return (
    <sup className="ml-0.5 text-[10px] font-semibold text-amber-700" title={`On ${on}`}>
      +{days}
    </sup>
  );
}

/** One flight on the booking; parts not recorded are simply left out. */
function FlightLegView({
  title,
  date,
  from,
  to,
  departs,
  arrives,
  arrivalDate,
  flightCode,
  baggage,
  stops,
}: {
  title: string;
  date: string | null;
  from: string | null;
  to: string | null;
  departs: string | null;
  arrives: string | null;
  /** The day it lands; a later day than `date` shows as "+1". */
  arrivalDate: string | null;
  flightCode: string | null;
  baggage: string | null;
  stops: DetailStop[];
}) {
  return (
    <div>
    <div className="flex items-baseline gap-x-4 gap-y-1 flex-wrap text-sm">
      <span className="w-20 shrink-0 text-[11px] font-medium uppercase tracking-wide text-stone-400">{title}</span>
      <span className="text-stone-800">{date ?? '—'}</span>
      {(from || to) && (
        <span className="font-mono text-[13px] text-stone-800">
          {from ?? '?'}
          {departs && <span className="text-stone-500"> {departs}</span>}
          <span className="text-stone-400"> → </span>
          {to ?? '?'}
          {arrives && <span className="text-stone-500"> {arrives}</span>}
          <LaterDay from={date} on={arrivalDate} />
        </span>
      )}
      {flightCode && (
        <span className="font-mono text-[12px] px-2 py-0.5 rounded-md bg-brand-50 text-brand-dark border border-brand-100">
          {flightCode}
        </span>
      )}
      {baggage && (
        <span className="text-[12px] text-stone-600" title="Checked baggage per passenger">
          Baggage {baggage} <span className="text-stone-400">per passenger</span>
        </span>
      )}
    </div>
    {stops.length > 0 && (
      <ul className="ml-24 mt-1 space-y-0.5 text-[12px] text-stone-600">
        {stops.map((st, i) => (
          <li key={i}>
            via <span className="font-mono">{st.city}</span>
            {(st.arrivalTime || st.departureTime) && (
              <span className="text-stone-500">
                {' '}· arrives {st.arrivalTime ?? '—'}
                <LaterDay from={date} on={st.arrivalDate} />, departs {st.departureTime ?? '—'}
                <LaterDay from={date} on={st.departureDate} />
              </span>
            )}
            {st.flightCode && (
              <span className="ml-1.5 font-mono text-[11px] px-1.5 py-0.5 rounded bg-brand-50 text-brand-dark border border-brand-100">
                onward {st.flightCode}
              </span>
            )}
          </li>
        ))}
      </ul>
    )}
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
    listAssignableAgents(authUser),
  ]);
  if (!detail) notFound();

  const userCanEditThisPnr = canEditPnr(authUser, detail.branchId, detail.hasIssuedEmd);
  const userCanManageEmd = canManageEmd(authUser);

  // Seat hand-over (phase 6). A branch may assign on its own bookings — and,
  // unlike editing, may still do so once an EMD round exists, because that is
  // exactly when seats are handed over (docs/decisions.md, 2026-09-19).
  const canAssignSeats =
    isHeadOffice(authUser) ||
    (detail.branchId !== null && authUser.branchIds.includes(detail.branchId));

  const today = todayIsoInPkt();
  // The latest round's time limit governs, and once every EMD is issued it is
  // the tickets' — not tracked here, so never urgent (lib/issuance.ts nextStep).
  const step = nextStep({
    rounds: detail.rounds.map((r) => ({ roundNumber: r.roundNumber, deadlineDate: r.deadlineDate })),
    pnrTlDate: detail.pnrTlDate,
    ticketIssuanceDeadline: detail.ticketing?.ticketIssuanceDeadline ?? null,
  });
  const urgency = getUrgency(today, step.kind === 'emd' ? step.deadline : null, detail.status);

  // Release (Phase 9 Step 2): before any EMD, by whoever may edit the booking.
  // A payment on seats taken back is not loaded here; the server refuses that.
  const canRelease =
    detail.status === 'active' &&
    detail.rounds.length === 0 &&
    userCanEditThisPnr &&
    !detail.agentAssignments.some((a) => a.recoveries.length > 0);
  const atRisk = emd1AtRisk({ status: detail.status, roundCount: detail.rounds.length, pnrTlDate: detail.pnrTlDate, todayIso: today });

  // Missed EMD-2 or ticketing deadline: flagged for a person to decide whether
  // to cancel (Phase 9 Step 5; owner, 2026-10-28) — never cancelled by the
  // system. A branch on its own bookings, Head Office on any, as release.
  const flag = cancellationFlag({
    status: detail.status,
    createdOnIso: todayIsoInPkt(new Date(detail.createdAt)),
    seats: detail.seats,
    rounds: detail.rounds.map((r) => ({
      roundNumber: r.roundNumber,
      status: r.status,
      paymentPct: r.paymentPct,
      deadlineDate: r.deadlineDate,
      issuanceDate: r.issuanceDate,
      paymentDate: r.paymentDate,
      refundDate: r.refundDate,
    })),
    ticketIssuanceDeadline: detail.ticketing?.ticketIssuanceDeadline ?? null,
    balanceTickets: detail.ticketing?.balanceTickets ?? null,
    todayIso: today,
    splits: detail.splits,
  });
  const canCancel = !!flag && canEditPnr(authUser, detail.branchId, false);
  const isCancelled = detail.status === 'cancelled';

  // When this booking's paid EMDs go on "To be refunded" (Phase 9 Step 3, A6).
  // A branch may request refunds on its own bookings, Head Office on any.
  // Every part of the booking — its own seats and each split (Step 6): the
  // EMDs cover them all, so the refund waits for every part.
  const parts = ticketParts(
    {
      seats: detail.seats,
      ticketsIssued: detail.ticketing?.ticketsIssued ?? null,
      balanceTickets: detail.ticketing?.balanceTickets ?? null,
      ticketIssuanceDeadline: detail.ticketing?.ticketIssuanceDeadline ?? null,
      outboundDate: detail.outboundDate,
    },
    detail.splits
  );
  const refundWhen = partsRefundTiming(parts, today);
  const canRequestRefund = canEditPnr(authUser, detail.branchId, false);

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

  // Ticketing: Head Office on any booking, a branch on its own, at any time —
  // the EMD-1 edit lock does not apply (owner, 2026-10-28). Penalties likewise.
  const canEditTicketing = canEditPnr(authUser, detail.branchId, false);

  // Seats left unissued once ticketing has closed (Phase 9 Step 4, A9/A10).
  // Null means "nothing to say" — not zero. Partial ticketing never cancels.
  // Whole booking: every part's count, once every part's ticketing has closed
  // (owner, 2026-10-29); penalties once every part has departed.
  const unissued = unissuedAcross({
    airlineCode: detail.airlineCode,
    seats: detail.seats,
    parts,
    todayIso: today,
    pnrStatus: detail.status,
  });
  const allDeparted = lastOutbound(parts);
  const canEnterPenalty =
    canEditTicketing && penaltyEntryOpen({ outboundDate: allDeparted, todayIso: today, unissued });

  // Splits (Phase 9 Step 6): SV only, active, a branch on its own bookings or
  // Head Office — after EMD-1 too (A3). Each holder offers what it can still split.
  const isSv = (detail.airlineCode ?? '').toUpperCase() === 'SV';
  const canEditSplits = canEditPnr(authUser, detail.branchId, false) && detail.status === 'active';
  const splitHolders = [
    ...detail.agentAssignments.map((a) => ({
      id: a.id,
      name: a.agentName,
      available: splittableSeats({ holderSeats: a.seats, assignmentId: a.id, splits: detail.splits }),
    })),
    { id: 'company', name: 'Company', available: splittableSeats({ holderSeats: detail.unassignedSeats, assignmentId: null, splits: detail.splits }) },
  ];
  const penalties = [
    ...detail.agentAssignments
      .filter((a) => a.penaltyAmount !== null)
      .map((a) => ({ who: a.agentName, amount: a.penaltyAmount!, license: a.penaltyLicenseName })),
    ...(detail.ticketing?.companyPenaltyAmount != null
      ? [{ who: 'Company', amount: detail.ticketing.companyPenaltyAmount, license: detail.ticketing.penaltyLicenseName }]
      : []),
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader user={user} subtitle="PNR Detail" />

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-brand-dark transition-colors"
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
                  className="text-xs font-semibold px-3 py-1.5 rounded-xl text-white bg-gradient-to-tr from-brand to-brand-light hover:from-brand-dark hover:to-brand-dark shadow-md shadow-brand/20 transition-all"
                >
                  Edit booking
                </Link>
              )}
              {canRelease && (
                <ReleasePnrButton
                  pnrId={detail.id}
                  pnrCode={detail.pnr}
                  agentsWithSeats={detail.agentAssignments.map((a) => a.agentName)}
                />
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

        {/* Flag, don't act (A2): a person confirms with the airline and
            releases it; the system never changes the status itself. */}
        {flag && (
          <div className="flex flex-wrap items-start justify-between gap-3 p-4 rounded-2xl border border-red-200 bg-red-50 text-red-800 text-xs">
            <span className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Cancellation review.</strong> {describeFlag(flag)}. Confirm with the airline and decide whether
                to cancel. If it stays active, this stays flagged until the cause is resolved
                {flag.trigger === 'emd2' ? ' (EMD-2 issued)' : ' (tickets recorded as issued)'}.
              </span>
            </span>
            {canCancel && (
              <CancelPnrButton
                pnrId={detail.id}
                pnrCode={detail.pnr}
                flagText={describeFlag(flag)}
                agentsWithSeats={detail.agentAssignments.map((a) => a.agentName)}
              />
            )}
          </div>
        )}

        {/* Cancelled (Phase 9 Step 5): EMDs forfeited until the penalty is
            paid; agents owe only their penalty and are paid back the rest. */}
        {isCancelled && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl border border-red-200 bg-white text-xs text-stone-700">
            <span>
              <strong className="text-red-700">Cancelled.</strong> Its EMDs are forfeited. Once the airline’s penalty is
              paid, those paid to IATA go on “To be refunded”. Each agent owes only their penalty; what they paid
              beyond it is paid back (Seat ownership below).
            </span>
            <span className="flex items-center gap-3">
              {canEditTicketing && (
                <PenaltyButton
                  title="Cancellation penalties"
                  pnrId={detail.id}
                  agents={detail.agentAssignments.map((a) => ({
                    id: a.id,
                    name: a.agentName,
                    seats: a.seats,
                    penaltyAmount: a.penaltyAmount,
                    penaltyLicenseId: a.penaltyLicenseId,
                  }))}
                  companySeats={detail.unassignedSeats}
                  company={{
                    amount: detail.ticketing?.companyPenaltyAmount ?? null,
                    licenseId: detail.ticketing?.penaltyLicenseId ?? null,
                  }}
                  licenses={options.licenses}
                />
              )}
              <span className="inline-flex items-center gap-2">
                <span className="text-stone-500">Penalty paid?</span>
                {isHeadOffice(authUser) ? (
                  <PenaltyPaidSwitch pnrId={detail.id} paid={detail.penaltyPaid === true} />
                ) : (
                  <strong>{detail.penaltyPaid ? 'Yes' : 'No'}</strong>
                )}
              </span>
            </span>
          </div>
        )}

        {atRisk && (
          <div className="flex items-start gap-3 p-4 rounded-2xl border border-red-200 bg-red-50 text-red-800 text-xs">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              <strong>At risk — confirm with the airline.</strong> The 1st EMD had to be issued by {detail.pnrTlDate} and
              none was. If the airline has let the seats go, release the booking.
            </span>
          </div>
        )}

        {/* Core fields */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-stone-900 mb-4">Booking details</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-4">
              <Field label="Request date" value={detail.requestDate} />
              <Field label="Investor company" value={detail.investorCompany} />
              {/* An agent investor's B2B code (owner, 2026-10-20). On a company
                  investment, agents' codes show in Seat ownership instead. */}
              {detail.investorIsAgent && (
                <Field label="B2B code" value={detail.investorB2bCode ?? '—'} />
              )}
              <Field label="License" value={detail.licenseName} />
              <Field label="Branch" value={detail.branchName} />
              <Field label="Segment" value={detail.segment} />
              <Field label="Airline" value={detail.airlineName ? `${detail.airlineCode} — ${detail.airlineName}` : null} />
              <Field label="Seats" value={
                <>
                  {detail.seats}
                  {detail.splits.length > 0 && (
                    <span className="text-[10px] text-stone-400 ml-1">
                      ({detail.splits.reduce((n, x) => n + x.seats, 0)} in splits)
                    </span>
                  )}
                </>
              } />
              <Field label="Trip type" value={isTripType(detail.tripType) ? TRIP_TYPE_LABELS[detail.tripType] : null} />
              <Field label="Meal included" value={detail.mealIncluded ? 'Yes' : 'No'} />
              <Field label="Sector" value={detail.sector ? <span className="font-mono text-[13px]">{detail.sector}</span> : null} />
              <Field label="PNR TL date" value={detail.pnrTlDate} />
              <Field label="GDS PNR" value={detail.gdsPnr ? <span className="font-mono">{detail.gdsPnr}</span> : null} />
            </div>

            <div className="mt-5 pt-4 border-t border-stone-100 space-y-3">
              <FlightLegView
                title={detail.tripType === 'one_way' ? 'Flight' : 'Outbound'}
                date={detail.outboundDate}
                from={detail.outboundDepartureCity}
                to={detail.outboundArrivalCity}
                departs={detail.outboundDepartureTime}
                arrives={detail.outboundArrivalTime}
                arrivalDate={detail.outboundArrivalDate}
                flightCode={detail.outboundFlightCode}
                baggage={formatBaggage(detail.outboundBaggagePieces, detail.outboundBaggageKg)}
                stops={detail.outboundStops}
              />
              {detail.tripType !== 'one_way' && (detail.tripType === 'round_trip' || detail.inboundDate) && (
                <FlightLegView
                  title="Inbound"
                  date={detail.inboundDate}
                  from={detail.inboundDepartureCity}
                  to={detail.inboundArrivalCity}
                  departs={detail.inboundDepartureTime}
                  arrives={detail.inboundArrivalTime}
                  arrivalDate={detail.inboundArrivalDate}
                  flightCode={detail.inboundFlightCode}
                  baggage={formatBaggage(detail.inboundBaggagePieces, detail.inboundBaggageKg)}
                  stops={detail.inboundStops}
                />
              )}
              {!detail.tripType && (
                <p className="text-[11px] text-stone-400">
                  Saved before flight details were recorded — editing the booking asks for them.
                </p>
              )}
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
          cancelled={isCancelled}
        />

        {/* Splits kept inside the booking (Phase 9 Step 6). Only SV can split. */}
        {(isSv || detail.splits.length > 0) && (
          <SplitsPanel
            pnrId={detail.id}
            bookingSeats={detail.seats}
            oneWay={detail.tripType === 'one_way'}
            bookingOutbound={detail.outboundDate}
            bookingInbound={detail.inboundDate}
            splits={detail.splits}
            holders={splitHolders}
            canSplit={isSv && canEditSplits}
            canEdit={canEditSplits}
            splitBlockedReason={detail.status !== 'active' ? `This booking is ${detail.status}, so it cannot be split.` : null}
          />
        )}

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
          <NextIssuance step={step} roundsIssued={detail.rounds.length} today={today} pnrStatus={detail.status} />

          {/* A paid EMD with no ticket deadline waits until the outbound date
              passes (owner, 2026-10-28); flagged so a deadline is entered. */}
          {!refundWhen.due && refundWhen.missingTicketDeadline && detail.rounds.some((r) => r.status === 'issued') && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <strong className="font-semibold">No ticket issuance deadline.</strong> This booking’s paid EMDs go on
              “To be refunded” the day after the ticket deadline, or once every ticket is issued. With no deadline they
              wait until the outbound date has passed. Enter one under Ticketing.
            </div>
          )}

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
                const requestable =
                  canRequestRefund &&
                  refundRequestBlocker({ roundStatus: round.status, paidToIata: iata.status === 'paid', timing: refundWhen }) === null;
                return (
                  <li
                    key={round.id}
                    className="rounded-xl border border-stone-200 bg-stone-50/60 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-full bg-brand-100 text-brand-dark text-xs font-bold flex items-center justify-center">
                          {round.roundNumber}
                        </span>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${ROUND_STATUS_STYLES[round.status] ?? ''}`}>
                          {round.status.replace('_', ' ')}
                        </span>
                        {userCanManageEmd && (
                          <div className="flex gap-2">
                            <EditRoundButton pnrId={detail.id} round={round} licenses={options.licenses} />
                            {round.status !== 'refunded' && (round.status !== 'forfeited' || detail.penaltyPaid === true) && (
                              <RefundRoundButton pnrId={detail.id} roundId={round.id} />
                            )}
                            <IataPaymentButton roundId={round.id} state={iata} today={today} />
                          </div>
                        )}
                        {requestable && <RequestRefundButton roundId={round.id} />}
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
            {canEditTicketing && (
              <EditTicketingButton
                pnrId={detail.id}
                seats={detail.seats}
                ticketing={detail.ticketing}
                suggestedIssuanceDeadline={svTicketIssuanceDeadline(
                  detail.airlineCode,
                  detail.outboundDate
                )}
                issuanceDeadlineRequired={enteredInApp(detail)}
                outboundDate={detail.outboundDate}
              />
            )}
          </div>
          <p className="text-[11px] text-stone-400 mb-4">
            Both deadlines feed the daily deadline alert, alongside EMD rounds.
          </p>

          {/* Unissued seats after ticketing closed (Phase 9 Step 4). SV may leave
              10% (rounded down) unissued; beyond that, and for any unissued seat
              on other airlines, staff enter the airline's penalty. Partial
              ticketing never cancels the booking. */}
          {unissued && (
            <div className={`mb-4 rounded-xl border p-3.5 ${unissued.penaltyCalledFor ? 'bg-red-50 border-red-200' : 'bg-stone-50 border-stone-200'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className={`text-xs ${unissued.penaltyCalledFor ? 'text-red-700' : 'text-stone-600'}`}>
                  <strong>
                    {unissued.unissued} of {detail.seats} ticket{detail.seats === 1 ? '' : 's'} not issued.
                  </strong>{' '}
                  {unissued.isSv
                    ? unissued.penaltyCalledFor
                      ? `SV allows ${unissued.allowance} (10%, rounded down); ${unissued.overLimit} beyond the limit — the airline's penalty applies.`
                      : `Within SV's allowance of ${unissued.allowance} (10%, rounded down) — no penalty.`
                    : 'Set for a manual penalty — the 10% allowance is SV only.'}
                </p>
                {canEnterPenalty && (
                  <PenaltyButton
                    pnrId={detail.id}
                    agents={detail.agentAssignments.map((a) => ({
                      id: a.id,
                      name: a.agentName,
                      seats: a.seats,
                      penaltyAmount: a.penaltyAmount,
                      penaltyLicenseId: a.penaltyLicenseId,
                    }))}
                    companySeats={detail.unassignedSeats}
                    company={{
                      amount: detail.ticketing?.companyPenaltyAmount ?? null,
                      licenseId: detail.ticketing?.penaltyLicenseId ?? null,
                    }}
                    licenses={options.licenses}
                  />
                )}
              </div>
              {unissued.penaltyCalledFor && !canEnterPenalty && allDeparted && allDeparted >= today && (
                <p className="text-[11px] text-red-600/80 mt-1">Penalties can be entered once the outbound date ({allDeparted}) has passed.</p>
              )}
            </div>
          )}

          {penalties.length > 0 && (
            <div className="mb-4 rounded-xl border border-stone-200 bg-white p-3.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400 mb-1.5">Penalties for unissued seats</p>
              <ul className="space-y-1 text-xs text-stone-700">
                {penalties.map((p) => (
                  <li key={p.who} className="flex justify-between gap-3">
                    <span>
                      {p.who}
                      {p.license && <span className="text-stone-400"> · penalty EMD on {p.license}</span>}
                    </span>
                    <span className="tabular-nums font-semibold">{formatPkr(p.amount)}</span>
                  </li>
                ))}
              </ul>
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
              <Field
                label="All tickets issued?"
                value={
                  detail.ticketing.balanceTickets === null
                    ? 'Not answered'
                    : detail.ticketing.balanceTickets === 0
                      ? 'Yes'
                      : `No — ${detail.ticketing.balanceTickets} remaining`
                }
              />
              <Field label="Tickets issued" value={detail.ticketing.ticketsIssued} />
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
            <History className="w-4 h-4 text-brand-dark" /> Change history
          </h2>
          {detail.activityLog.length === 0 ? (
            <p className="text-sm text-stone-400 py-4 text-center">
              No changes recorded yet. Every edit made through the app will appear here.
            </p>
          ) : (
            <ul className="space-y-3">
              {detail.activityLog.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-light mt-1.5 flex-shrink-0" />
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
          Six Sigma EMD · amounts in PKR · created {new Date(detail.createdAt).toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi' })}
        </p>
      </footer>
    </div>
  );
}


