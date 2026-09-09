import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { pnrBranchFilter, type AuthUser } from '@/lib/auth';
import { seatsGivenToChildren, unallocatedSeats } from '@/lib/seats';

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
   * Money that actually left for this PNR — gross, never netted against a later
   * refund. Same rule as the `dashboard_totals` view (docs/decisions.md,
   * 2026-08-23); carried per row so the dashboard cards can re-total whatever
   * the filters leave visible.
   */
  totalPaid: number;
  /** Refunds received back for this PNR. */
  totalRefunded: number;
  /** Earliest deadline among issued rounds (the only "unresolved" ones). */
  nextPendingDeadline: string | null;
  /** True when any issued round exists, even without a recorded deadline. */
  hasPendingRound: boolean;
}

/**
 * Round statuses that count as money paid out.
 *
 * A refunded round still had its EMD paid, so it stays in this list — the
 * refund is reported separately rather than subtracted.
 */
const PAID_ROUND_STATUSES = ['paid', 'refund_requested', 'refunded'];

function iso(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export async function listPnrs(user?: AuthUser): Promise<PnrListRow[]> {
  const where = pnrBranchFilter(user);
  // null = this user may see nothing (a branch account whose branch does not
  // resolve). Return no rows rather than falling through to an unfiltered query.
  if (where === null) return [];

  const rows = await prisma.pnr.findMany({
    where,
    orderBy: { srNo: 'asc' },
    include: {
      license: true,
      branch: true,
      airline: true,
      // Every round, not just the next issued one: the same pass now also totals
      // what was paid and refunded per PNR, so the dashboard cards can re-total
      // the rows a filter leaves visible without a second round-trip.
      emdRounds: {
        select: { status: true, deadlineDate: true, emdAmount: true, refundAmount: true },
      },
    },
  });

  return rows.map((r) => {
    const issued = r.emdRounds.filter((e) => e.status === 'issued');

    // Earliest *recorded* deadline among issued rounds. Rounds with no deadline
    // still make the PNR pending, they just cannot be the date shown — which is
    // what `ORDER BY deadline_date ASC` did before, Postgres sorting NULLs last.
    const deadlines = issued
      .map((e) => e.deadlineDate)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime());

    const totalPaid = r.emdRounds
      .filter((e) => PAID_ROUND_STATUSES.includes(e.status))
      .reduce((sum, e) => sum + Number(e.emdAmount), 0);

    const totalRefunded = r.emdRounds
      .filter((e) => e.status === 'refunded')
      .reduce((sum, e) => sum + Number(e.refundAmount ?? 0), 0);

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
      totalPaid,
      totalRefunded,
      nextPendingDeadline: iso(deadlines[0] ?? null),
      hasPendingRound: issued.length > 0,
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
 * The `dashboard_totals` view itself still exists in `db/schema.sql`; dropping
 * it is a database migration, not a code change.
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
  /** For a child PNR: how many seats its parent allocated to it. */
  parentAllocationsTotal: number | null;
  hasIssuedEmd: boolean;
  activityLog: ActivityLogView[];
}

function isoOrNull(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export async function getPnrDetail(id: string, user?: AuthUser): Promise<PnrDetail | null> {
  const r = await prisma.pnr.findUnique({
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
    },
  });

  if (!r) return null;

  // Branch scoping. A branch account sees a PNR only when it is assigned to one
  // of its own branch rows; an unresolved branch (or an unbranched PNR) denies.
  if (user?.accountType === 'branch') {
    if (user.branchIds.length === 0) return null;
    if (!r.branchId || !user.branchIds.includes(r.branchId)) return null;
  }

  const roundIds = r.emdRounds.map((x) => x.id);
  const log = await prisma.activityLog.findMany({
    where: {
      OR: [
        { tableName: 'pnrs', recordId: r.id },
        { tableName: 'emd_rounds', recordId: { in: roundIds } },
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
