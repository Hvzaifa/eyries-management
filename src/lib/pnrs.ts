import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { pnrBranchFilter, type AuthUser } from '@/lib/auth';
import { seatsGivenToChildren, unallocatedSeats } from '@/lib/seats';
import { holderFilterKeys, holderLabel, seatLedger } from '@/lib/inventory';
import { isTermType, type AgentTerms, type TermType } from '@/lib/agent-money';
import { HELD_EMD_STATUS, nextEmdSuggestion } from '@/lib/emd';
import { iataPaymentDeadline } from '@/lib/iata-calendar';
import { iataPaymentState } from '@/lib/iata-payments';
import { todayIsoInPkt } from '@/lib/urgency';

/**
 * A stored `charge_type` / `discount_type` as the typed union.
 *
 * The column is text with a database check, so any value reaching here is
 * already one of the three — but a page must not be typed on that assumption,
 * and an unrecognised value reads as "no term", never as a charge.
 */
function toTermType(value: string | null): TermType {
  return isTermType(value) ? value : 'none';
}

export interface PnrListRow {
  id: string;
  srNo: number;
  requestDate: string;
  investorCompany: string;
  licenseName: string | null;
  branchName: string | null;
  pnr: string;
  gdsPnr: string | null;
  segment: string | null;
  airlineCode: string | null;
  seats: number;
  outboundDate: string | null;
  inboundDate: string | null;
  sector: string | null;
  pnrTlDate: string | null;
  dealPct: number | null;
  issuedStatus: string;
  airlineTaxes: number | null;
  psf: number | null;
  fare: number;
  totalEmdValue: number | null;
  status: string;
  /**
   * EMD the airline is **currently holding** on this booking: every round that
   * is issued and not yet refunded.
   *
   * This replaced "total paid" on 2026-09-21, when the statuses were reduced to
   * issued/refunded. There is no longer a `paid` status to sum — when an EMD is
   * paid is an IATA matter this system does not model — so the figure now
   * answers the question it can actually answer: how much deposit is with the
   * airline right now.
   */
  totalIssued: number;
  /** Refunds received back for this PNR. */
  totalRefunded: number;
  /** Earliest deadline among issued rounds (the only "unresolved" ones). */
  nextPendingDeadline: string | null;
  /** True when any issued round exists, even without a recorded deadline. */
  hasPendingRound: boolean;
  /** Rounds recorded on this booking, refunded ones included. */
  roundsIssued: number;
  /**
   * The date the **next** EMD must be issued by — the one deadline that is
   * always meaningful, whether or not a round exists yet.
   *
   * A booking with no rounds still has one: `pnr_tl_date`, set when the booking
   * was entered, is the time limit for the *first* EMD. The dashboard used to
   * read `nextPendingDeadline` alone here and so printed "No issued round"
   * against a booking whose first EMD was due tomorrow — hiding the most urgent
   * thing on the page behind a phrase that sounded like nothing was pending.
   *
   * Prefers the earliest open round's own deadline and falls back to
   * `pnr_tl_date`; `syncPnrTlDate` keeps the two in step once rounds exist.
   */
  nextIssuanceDeadline: string | null;
  /**
   * What that EMD is worth, from the airline's policy — `seats × fare × the
   * next round's percentage`.
   *
   * **Null where no policy covers the airline**, in which case staff type the
   * amount when they issue it. Null is never treated as zero: a booking whose
   * amount cannot be derived is counted separately on the dashboard rather than
   * quietly leaving a day's total short.
   */
  nextEmdAmount: number | null;
  /**
   * Earliest IATA remittance day still owed on this booking, and what it adds
   * up to. Derived from the calendar, never stored.
   *
   * A wholly separate clock from `nextPendingDeadline`: that one is the
   * airline's time limit to issue the next EMD, this one is IATA's day to be
   * paid for the EMDs already issued. They get their own columns and their own
   * colours (owner ruling, 2026-09-22), because a booking can be comfortable on
   * one and urgent on the other.
   */
  nextIataPayment: string | null;
  /** EMD issued on this booking with no payment recorded against it. */
  iataUnpaidAmount: number;
  /** True when something is owed to IATA but the calendar cannot date it. */
  iataUndated: boolean;
  /**
   * Who holds the seats (phase 6). `holder` is the sentence shown in the column
   * — "QFC Group", or "QFC Group (20) + Company (30)". `holderKeys` is what the
   * filter matches on: the plain things a person picks (an agent, the company,
   * the bot), so a shared booking is findable under every agent on it.
   */
  holder: string;
  holderKeys: string[];
  agentNames: string[];
  /**
   * Each agent holding seats, with how many. The Holder label is built from
   * these; the dashboard also needs the per-agent breakdown to show one
   * holder's share when the Holder filter picks them (`lib/holder-view.ts`) —
   * `agentSeats` is the total across all of them and cannot answer that.
   */
  holderParts: { name: string; seats: number }[];
  agentSeats: number;
  unassignedSeats: number;
  /**
   * Set only on a row projected to ONE holder's share. Carries the booking's
   * own seat count so the table can still say "30 of 99" — without it a share
   * is indistinguishable from a booking that is simply that size.
   */
  holderView?: { holder: string; bookingSeats: number };
}

/**
 * Round statuses whose EMD the airline still holds.
 *
 * One status now (2026-09-21): `issued`. A refunded round has come back and is
 * reported separately, never netted against this.
 */
const HELD_ROUND_STATUSES: string[] = [HELD_EMD_STATUS];

function iso(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export async function listPnrs(user?: AuthUser): Promise<PnrListRow[]> {
  const where = pnrBranchFilter(user);
  // null = this user may see nothing (a branch account whose branch does not
  // resolve). Return no rows rather than falling through to an unfiltered query.
  if (where === null) return [];

  // One `today` for the whole list, so every row is judged against the same
  // date even if the request straddles midnight in Karachi.
  const today = todayIsoInPkt();

  // Two queries, issued together. The seat hand-overs are read as ONE flat query
  // and grouped below, rather than as a nested include on the 1,501-row booking
  // query: Prisma resolves a nested include by matching every parent row, which
  // measured slower than reading the (far fewer) assignment rows on their own.
  // Running them in parallel keeps the second one off the critical path.
  const [rows, assignmentRows] = await Promise.all([
    prisma.pnr.findMany({
      where,
      orderBy: { srNo: 'asc' },
      include: {
        license: true,
        branch: true,
        airline: true,
        // Every round, not just the next issued one: the same pass also totals
        // what was paid and refunded per PNR, so the dashboard cards can
        // re-total the rows a filter leaves visible without a second round-trip.
        emdRounds: {
          select: {
            status: true,
            deadlineDate: true,
            emdAmount: true,
            refundAmount: true,
            // The IATA payment deadline is derived from when the EMD was
            // issued, so the issuance date has to come back with the row.
            issuanceDate: true,
            paymentDate: true,
            refundDate: true,
          },
        },
      },
    }),
    prisma.agentAssignment.findMany({
      where: { releasedAt: null, pnr: where },
      select: { pnrId: true, seats: true, agent: { select: { name: true } } },
    }),
  ]);
  const assignmentsByPnr = new Map<string, { seats: number; agentName: string }[]>();
  for (const a of assignmentRows) {
    const list = assignmentsByPnr.get(a.pnrId) ?? [];
    list.push({ seats: a.seats, agentName: a.agent.name });
    assignmentsByPnr.set(a.pnrId, list);
  }

  return rows.map((r) => {
    const issued = r.emdRounds.filter((e) => e.status === 'issued');

    // Earliest *recorded* deadline among issued rounds. Rounds with no deadline
    // still make the PNR pending, they just cannot be the date shown — which is
    // what `ORDER BY deadline_date ASC` did before, Postgres sorting NULLs last.
    const deadlines = issued
      .map((e) => e.deadlineDate)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime());

    const totalIssued = r.emdRounds
      .filter((e) => HELD_ROUND_STATUSES.includes(e.status))
      .reduce((sum, e) => sum + Number(e.emdAmount), 0);

    const totalRefunded = r.emdRounds
      .filter((e) => e.status === 'refunded')
      .reduce((sum, e) => sum + Number(e.refundAmount ?? 0), 0);

    // What IATA is still owed on this booking: any round with no recorded
    // payment whose refund, if any, came too late to cancel the billing. A
    // refund only cancels it when it lands on or before the billing-to date of
    // the period the EMD was issued in (owner, 2026-09-22) — so this cannot
    // filter on `issued`, and `iataPaymentState` makes the call.
    const unpaid = r.emdRounds.filter(
      (e) =>
        e.paymentDate === null &&
        iataPaymentState({
          issuanceDate: e.issuanceDate.toISOString().slice(0, 10),
          paymentDate: null,
          refundDate: e.refundDate ? e.refundDate.toISOString().slice(0, 10) : null,
          roundStatus: e.status,
          todayIso: today,
        }).owed
    );
    const iataDays = unpaid
      .map((e) => iataPaymentDeadline(e.issuanceDate.toISOString().slice(0, 10)))
      .filter((d): d is string => d !== null)
      .sort();
    const nextIataPayment = iataDays[0] ?? null;
    const iataUnpaidAmount =
      unpaid.reduce((sum, e) => sum + Math.round(Number(e.emdAmount) * 100), 0) / 100;
    const iataUndated = unpaid.length > iataDays.length;

    // What has to be issued next on this booking, and what it is worth. The
    // same `nextEmdSuggestion` the Add Round modal and the bulk screen use, so
    // a figure on the dashboard cannot differ from the one on the form that
    // issues it.
    const nextIssuanceDeadline = isoOrNull(deadlines[0] ?? null) ?? isoOrNull(r.pnrTlDate);
    const nextEmd = nextEmdSuggestion({
      roundsIssued: r.emdRounds.length,
      seats: r.seats,
      fare: Number(r.fare),
      airlineCode: r.airline?.code ?? null,
      segment: r.segment,
      requestDateIso: isoOrNull(r.requestDate),
      outboundDateIso: isoOrNull(r.outboundDate),
      todayIso: today,
    });

    const assignments = assignmentsByPnr.get(r.id) ?? [];
    const ledger = seatLedger({ seats: r.seats, assignments });
    const agentNames = assignments.map((a) => a.agentName);
    const holderParts = assignments.map((a) => ({ name: a.agentName, seats: a.seats }));

    return {
      id: r.id,
      srNo: r.srNo,
      requestDate: iso(r.requestDate)!,
      investorCompany: r.investorCompany,
      licenseName: r.license?.name ?? null,
      branchName: r.branch?.name ?? null,
      licenseId: r.licenseId,
      branchId: r.branchId,
      pnr: r.pnr,
      gdsPnr: r.gdsPnr,
      segment: r.segment,
      airlineCode: r.airline?.code ?? null,
      seats: r.seats,
      outboundDate: iso(r.outboundDate),
      inboundDate: iso(r.inboundDate),
      sector: r.sector,
      pnrTlDate: iso(r.pnrTlDate),
      dealPct: r.dealPct === null ? null : Number(r.dealPct),
      issuedStatus: r.issuedStatus,
      airlineTaxes: r.airlineTaxes === null ? null : Number(r.airlineTaxes),
      psf: r.psf === null ? null : Number(r.psf),
      fare: Number(r.fare),
      totalEmdValue: r.totalEmdValue === null ? null : Number(r.totalEmdValue),
      status: r.status,
      totalIssued,
      totalRefunded,
      nextIataPayment,
      iataUnpaidAmount,
      iataUndated,
      roundsIssued: r.emdRounds.length,
      nextIssuanceDeadline,
      nextEmdAmount: nextEmd.amount,
      nextPendingDeadline: iso(deadlines[0] ?? null),
      hasPendingRound: issued.length > 0,
      holder: holderLabel(ledger, holderParts),
      holderKeys: holderFilterKeys(ledger, holderParts),
      agentNames,
      holderParts,
      agentSeats: ledger.agentSeats,
      unassignedSeats: ledger.unassigned,
    };
  });
}

/*
 * `getDashboardTotals()` and its `DashboardTotals` type were removed on
 * 2026-09-09. They read the `dashboard_totals` view (and a hand-written branch
 * equivalent) for figures that were always active-only and unfilterable, so the
 * cards contradicted the table beneath them. The cards now total the rows the
 * filters leave visible — see `lib/dashboard.ts`, which is also the only place
 * the paid/refunded rule now lives, instead of three.
 *
 * The `dashboard_totals` view was dropped on 2026-09-24.
 */

export interface EmdRoundView {
  id: string;
  roundNumber: number;
  issuanceDate: string;
  issuanceTime: string | null;
  paymentPct: number;
  emdNumber: string | null;
  emdAmount: number;
  deadlineDate: string | null;
  deadlineTime: string | null;
  status: string;
  refundAmount: number | null;
  refundDate: string | null;
  /** The day this EMD was paid to IATA; null when no payment is recorded. */
  paymentDate: string | null;
  /**
   * When IATA must be paid for this EMD, read from the remittance calendar
   * using the issuance date. Derived, never stored — if IATA republishes the
   * calendar, every round follows it. Null means the loaded calendar does not
   * cover the issuance date, which is a gap to fill, not "nothing to pay".
   */
  iataPaymentDeadline: string | null;
  licenseId: string | null;
  licenseName: string | null;
}

export interface ActivityLogView {
  id: string;
  tableName: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  changedAt: string;
}

export interface PnrDetail {
  id: string;
  srNo: number;
  requestDate: string;
  investorCompany: string;
  licenseName: string | null;
  branchName: string | null;
  licenseId: string | null;
  branchId: string | null;
  parentPnrId: string | null;
  pnr: string;
  gdsPnr: string | null;
  segment: string | null;
  airlineCode: string | null;
  airlineName: string | null;
  airlineContactEmails: string[];
  airlineId: string | null;
  seats: number;
  outboundDate: string | null;
  inboundDate: string | null;
  sector: string | null;
  pnrTlDate: string | null;
  dealPct: number | null;
  issuedStatus: string;
  airlineTaxes: number | null;
  psf: number | null;
  fare: number;
  totalEmdValue: number | null;
  status: string;
  createdAt: string;
  createdBy: string | null;
  rounds: EmdRoundView[];
  ticketing: {
    nameUpdateDeadline: string | null;
    ticketIssuanceDeadline: string | null;
    status: string | null;
    ticketsIssued: number | null;
    balanceTickets: number | null;
  } | null;
  parentPnr: { id: string; pnr: string } | null;
  childAllocations: { childPnrId: string; childPnrCode: string; seatsAllocated: number; childInvestorCompany: string }[];
  /**
   * Seats this PNR still holds and may still split away. Identical to `seats`:
   * a split decrements the parent, so `seats` already excludes everything given
   * to children (docs/decisions.md, 2026-09-01). Kept as its own field because
   * that equivalence is a business rule, not a coincidence.
   */
  unallocatedSeats: number;
  /** Seats this PNR has given to its children — history, not a deduction. */
  allocatedToChildren: number;
  /**
   * Seat ledger (phase 6): who holds this booking's seats. `unassignedSeats` is
   * what a split or a new assignment may draw on — the split form must offer
   * this, not `seats`, or the form's limit and the server's limit drift apart
   * (the failure recorded on 2026-09-07).
   */
  agentSeats: number;
  unassignedSeats: number;
  agentAssignments: {
    id: string;
    agentId: string;
    agentName: string;
    seats: number;
    assignedAt: string;
    /**
     * This agent's commercial terms on this booking (phase 7 step 1). Stored
     * per assignment because two agents on one booking can be given different
     * deals (ruling 9). What they owe is derived from these by
     * `agentTotal()` — there is no stored amount.
     */
    terms: AgentTerms;
    /** Payments received from this agent against this booking (step 2). */
    recoveries: {
      id: string;
      amount: number;
      receivedDate: string;
      method: string | null;
      /** Shown to staff; never written to a log line (rule 8). */
      reference: string | null;
    }[];
  }[];
  /** For a child PNR: how many seats its parent allocated to it. */
  parentAllocationsTotal: number | null;
  hasIssuedEmd: boolean;
  activityLog: ActivityLogView[];
}

function isoOrNull(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export async function getPnrDetail(id: string, user?: AuthUser): Promise<PnrDetail | null> {
  // Two reads in parallel, then the history. The id lookup of EVERY assignment
  // (released ones included, for the history) needs only the booking id we
  // already have, so it no longer waits for the main query to come back — one
  // network round trip saved per page view. Nothing it returns is used until
  // the branch-scope check below has passed.
  const [r, allAssignments] = await Promise.all([
    prisma.pnr.findUnique({
    where: { id },
    include: {
      license: true,
      branch: true,
      airline: true,
      emdRounds: { 
        orderBy: { roundNumber: 'asc' },
        include: { license: true }
      },
      ticketing: true,
      parentPnr: { select: { id: true, pnr: true } },
      childAllocations: true,
      parentAllocations: {
        include: { childPnr: { select: { id: true, pnr: true, investorCompany: true } } },
      },
      // Live assignments only — released rows are history and must not count
      // against the ledger.
      agentAssignments: {
        where: { releasedAt: null },
        orderBy: { assignedAt: 'asc' },
        include: {
          agent: { select: { id: true, name: true } },
          // Payments received against this assignment (phase 7 step 2). What is
          // outstanding is these subtracted from the calculated total — never
          // a stored balance.
          recoveries: { orderBy: { receivedDate: 'desc' } },
        },
      },
    },
  }),
    prisma.agentAssignment.findMany({ where: { pnrId: id }, select: { id: true } }),
  ]);

  if (!r) return null;

  // Branch scoping. A branch account sees a PNR only when it is assigned to one
  // of its own branch rows; an unresolved branch (or an unbranched PNR) denies.
  if (user?.accountType === 'branch') {
    if (user.branchIds.length === 0) return null;
    if (!r.branchId || !user.branchIds.includes(r.branchId)) return null;
  }

  const roundIds = r.emdRounds.map((x) => x.id);
  // ALL assignments, including released ones: the include above deliberately
  // fetches only live rows for the ledger, but "seats returned by X" is exactly
  // the history a reader wants, and it lives on the released row.
  const assignmentIds = allAssignments.map((a) => a.id);

  const log = await prisma.activityLog.findMany({
    where: {
      OR: [
        { tableName: 'pnrs', recordId: r.id },
        { tableName: 'emd_rounds', recordId: { in: roundIds } },
        // `ticketing` is keyed by pnr_id, so its log entries carry the PNR's own
        // id. They were being written from the first day of Phase 5 Step 1 and
        // never shown: this query listed only two table names, so every
        // ticketing edit vanished from the booking's change history.
        { tableName: 'ticketing', recordId: r.id },
        // Seat hand-overs (phase 6). Added WITH the feature, not after someone
        // notices the history is empty — the ticketing entries above were
        // written for a day before anything displayed them.
        { tableName: 'agent_assignments', recordId: { in: assignmentIds } },
        // Recoveries are logged against their ASSIGNMENT id, so that a payment
        // deleted as a mistake is still findable here. Added WITH the feature —
        // the phase-5 lesson was that writing the entry is only half of it
        // (docs/decisions.md, 2026-09-19 ticketing entry).
        { tableName: 'agent_recoveries', recordId: { in: assignmentIds } },
      ],
    },
    orderBy: { changedAt: 'desc' },
    take: 100,
  });

  // r.childAllocations = rows where THIS PNR is the child (seats it received).
  // r.parentAllocations = rows where THIS PNR is the parent (seats it gave away).
  // The two are easy to mix up; the previous code subtracted the received-as-child
  // total from this PNR's own seats to get "unallocated", which is unrelated.
  const seatsReceivedAsChild = r.childAllocations.reduce((sum, a) => sum + a.seatsAllocated, 0);
  const givenToChildren = seatsGivenToChildren(r.parentAllocations);

  // Seat ledger: `seats` is what this PNR holds; agents hold part of it, and
  // what is left is what a split or a new assignment may draw on.
  const ledger = seatLedger({ seats: r.seats, assignments: r.agentAssignments });

  return {
    id: r.id,
    srNo: r.srNo,
    requestDate: isoOrNull(r.requestDate)!,
    investorCompany: r.investorCompany,
    licenseName: r.license?.name ?? null,
    branchName: r.branch?.name ?? null,
    licenseId: r.licenseId,
    branchId: r.branchId,
    parentPnrId: r.parentPnrId,
    pnr: r.pnr,
    gdsPnr: r.gdsPnr,
    segment: r.segment,
    airlineCode: r.airline?.code ?? null,
    airlineName: r.airline?.name ?? null,
    airlineContactEmails: r.airline?.contactEmails ?? [],
    airlineId: r.airlineId,
    seats: r.seats,
    outboundDate: isoOrNull(r.outboundDate),
    inboundDate: isoOrNull(r.inboundDate),
    sector: r.sector,
    pnrTlDate: isoOrNull(r.pnrTlDate),
    dealPct: r.dealPct === null ? null : Number(r.dealPct),
    issuedStatus: r.issuedStatus,
    airlineTaxes: r.airlineTaxes === null ? null : Number(r.airlineTaxes),
    psf: r.psf === null ? null : Number(r.psf),
    fare: Number(r.fare),
    totalEmdValue: r.totalEmdValue === null ? null : Number(r.totalEmdValue),
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    createdBy: r.createdBy,
    rounds: r.emdRounds.map((x) => ({
      id: x.id,
      roundNumber: x.roundNumber,
      issuanceDate: isoOrNull(x.issuanceDate)!,
      issuanceTime: x.issuanceTime ? x.issuanceTime.toISOString().slice(11, 16) : null,
      paymentPct: Number(x.paymentPct),
      emdNumber: x.emdNumber,
      emdAmount: Number(x.emdAmount),
      deadlineDate: isoOrNull(x.deadlineDate),
      deadlineTime: x.deadlineTime ? x.deadlineTime.toISOString().slice(11, 16) : null,
      status: x.status,
      refundAmount: x.refundAmount === null ? null : Number(x.refundAmount),
      refundDate: isoOrNull(x.refundDate),
      paymentDate: isoOrNull(x.paymentDate),
      iataPaymentDeadline: iataPaymentDeadline(isoOrNull(x.issuanceDate)),
      licenseId: x.licenseId,
      licenseName: x.license?.name ?? null,
    })),
    ticketing: r.ticketing
      ? {
          nameUpdateDeadline: isoOrNull(r.ticketing.nameUpdateDeadline),
          ticketIssuanceDeadline: isoOrNull(r.ticketing.ticketIssuanceDeadline),
          status: r.ticketing.status,
          ticketsIssued: r.ticketing.ticketsIssued,
          balanceTickets: r.ticketing.balanceTickets,
        }
      : null,
    parentPnr: r.parentPnr ? { id: r.parentPnr.id, pnr: r.parentPnr.pnr } : null,
    childAllocations: r.parentAllocations.map((a) => ({
      childPnrId: a.childPnr.id,
      childPnrCode: a.childPnr.pnr,
      seatsAllocated: a.seatsAllocated,
      childInvestorCompany: a.childPnr.investorCompany,
    })),
    // `seats` already excludes everything split away — see the field's docs.
    unallocatedSeats: unallocatedSeats(r),
    allocatedToChildren: givenToChildren,
    agentSeats: ledger.agentSeats,
    unassignedSeats: ledger.unassigned,
    agentAssignments: r.agentAssignments.map((a) => ({
      id: a.id,
      agentId: a.agentId,
      agentName: a.agent.name,
      seats: a.seats,
      assignedAt: a.assignedAt.toISOString(),
      terms: {
        chargeType: toTermType(a.chargeType),
        chargeValue: a.chargeValue === null ? null : Number(a.chargeValue),
        discountType: toTermType(a.discountType),
        discountValue: a.discountValue === null ? null : Number(a.discountValue),
        chargeTax: a.chargeTax,
      },
      recoveries: a.recoveries.map((rec) => ({
        id: rec.id,
        amount: Number(rec.amount),
        receivedDate: rec.receivedDate.toISOString().slice(0, 10),
        method: rec.method,
        reference: rec.reference,
      })),
    })),
    parentAllocationsTotal: r.parentPnrId ? seatsReceivedAsChild : null,
    hasIssuedEmd: r.emdRounds.length > 0,
    activityLog: log.map((e) => ({
      id: e.id,
      tableName: e.tableName,
      fieldName: e.fieldName,
      oldValue: e.oldValue,
      newValue: e.newValue,
      changedAt: e.changedAt.toISOString(),
    })),
  };
}

export interface PnrFormOptions {
  licenses: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  airlines: { id: string; code: string; name: string; contactEmails: string[] }[];
  segmentSuggestions: string[];
  existingPnrCodes: string[];
}

/**
 * Lookup data for the create/edit forms.
 *
 * `existingPnrCodes` drives the duplicate-PNR warning, so it is **branch-scoped
 * like every other listing**. It previously returned every PNR code in the
 * company to every user, which handed a branch account a list of all 1,014
 * codes — including every other branch's — undoing the branch isolation the rest
 * of the code enforces. A branch user only needs to be warned about duplicates
 * they could actually have created.
 */
export async function getPnrFormOptions(user?: AuthUser): Promise<PnrFormOptions> {
  const codeScope = pnrBranchFilter(user);

  const [licenses, branches, airlines, segments, codes] = await Promise.all([
    prisma.license.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.branch.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.airline.findMany({ orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, contactEmails: true } }),
    prisma.pnr.findMany({
      where: { segment: { not: null } },
      distinct: ['segment'],
      orderBy: { segment: 'asc' },
      select: { segment: true },
    }),
    // null = this user may see nothing; send no codes rather than all of them.
    codeScope === null
      ? Promise.resolve([] as { pnr: string }[])
      : prisma.pnr.findMany({ where: codeScope, select: { pnr: true }, distinct: ['pnr'] }),
  ]);

  return {
    licenses,
    branches,
    airlines,
    segmentSuggestions: segments.map((s) => s.segment!).filter(Boolean),
    existingPnrCodes: codes.map((c) => c.pnr),
  };
}

export interface RefundedEmdRoundRow {
  id: string;
  pnr_id: string;
  round_number: number;
  issuance_date: Date;
  payment_pct: Prisma.Decimal;
  emd_number: string | null;
  emd_amount: Prisma.Decimal;
  deadline_date: Date | null;
  deadline_time: Date | null;
  status: string;
  // Nullable in the database, and genuinely null in live data: one legacy
  // round carries status 'refunded' with neither an amount nor a date. Typing
  // these as non-null is what made /refunds crash (docs/decisions.md,
  // 2026-09-07 "Refund log crashed on a refunded round with no date").
  refund_amount: Prisma.Decimal | null;
  refund_date: Date | null;
  created_at: Date;
  updated_at: Date;
  
  pnr: string;
  gds_pnr: string | null;
  sector: string | null;
  seats: number;
  outbound_date: Date | null;
  airline_code: string | null;
  branch_name: string | null;
}

/**
 * Refund log — the `refunded_emd_rounds` view, never a separate table
 * (docs/decisions.md, 2026-08-21). Branch-scoped like every other listing:
 * the view exposes `pnr_id`, so the branch filter is applied through it without
 * needing the view itself to carry `branch_id`.
 */
export async function listRefundedRounds(user?: AuthUser): Promise<RefundedEmdRoundRow[]> {
  const scope = pnrBranchFilter(user);
  if (scope === null) return [];

  if (user?.accountType === 'branch') {
    return prisma.$queryRaw<RefundedEmdRoundRow[]>`
      SELECT * FROM refunded_emd_rounds
      WHERE pnr_id IN (SELECT id FROM pnrs WHERE branch_id = ANY(${user.branchIds}::uuid[]))
      ORDER BY refund_date DESC NULLS LAST, pnr ASC
    `;
  }

  return prisma.$queryRaw<RefundedEmdRoundRow[]>`
    SELECT * FROM refunded_emd_rounds
    ORDER BY refund_date DESC NULLS LAST, pnr ASC
  `;
}
