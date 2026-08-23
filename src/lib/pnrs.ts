import { prisma } from '@/lib/prisma';

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
  /** Earliest deadline among pending rounds (the only "unresolved" ones). */
  nextPendingDeadline: string | null;
}

function iso(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export async function listPnrs(): Promise<PnrListRow[]> {
  const rows = await prisma.pnr.findMany({
    orderBy: { srNo: 'asc' },
    include: {
      license: true,
      branch: true,
      airline: true,
      emdRounds: {
        where: { status: 'pending' },
        orderBy: { deadlineDate: 'asc' },
        take: 1,
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    srNo: r.srNo,
    requestDate: iso(r.requestDate)!,
    investorCompany: r.investorCompany,
    licenseName: r.license?.name ?? null,
    branchName: r.branch?.name ?? null,
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
    nextPendingDeadline: iso(r.emdRounds[0]?.deadlineDate ?? null),
  }));
}

export interface DashboardTotals {
  activePnrs: number;
  totalSeats: number;
  totalEmdValue: number;
  totalPaid: number;
  totalRefunded: number;
}

/** Global totals from the dashboard_totals SQL view — never recomputed in app code. */
export async function getDashboardTotals(): Promise<DashboardTotals> {
  const result = await prisma.$queryRaw<
    {
      active_pnrs: bigint | number;
      total_seats: bigint | number;
      total_emd_value: string;
      total_paid: string;
      total_refunded: string;
    }[]
  >`select * from "dashboard_totals"`;

  const row = result[0];
  if (!row) {
    return { activePnrs: 0, totalSeats: 0, totalEmdValue: 0, totalPaid: 0, totalRefunded: 0 };
  }

  return {
    activePnrs: Number(row.active_pnrs),
    totalSeats: Number(row.total_seats),
    totalEmdValue: Number(row.total_emd_value),
    totalPaid: Number(row.total_paid),
    totalRefunded: Number(row.total_refunded),
  };
}

export interface EmdRoundView {
  id: string;
  roundNumber: number;
  issuanceDate: string;
  paymentPct: number;
  emdNumber: string | null;
  emdAmount: number;
  deadlineDate: string;
  deadlineTime: string | null;
  status: string;
  refundAmount: number | null;
  refundDate: string | null;
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
  parentPnrId: string | null;
  pnr: string;
  gdsPnr: string | null;
  segment: string | null;
  airlineCode: string | null;
  airlineName: string | null;
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
  childAllocations: { childPnrId: string; childPnrCode: string; seatsAllocated: number }[];
  parentAllocationsTotal: number | null;
  activityLog: ActivityLogView[];
}

function isoOrNull(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export async function getPnrDetail(id: string): Promise<PnrDetail | null> {
  const r = await prisma.pnr.findUnique({
    where: { id },
    include: {
      license: true,
      branch: true,
      airline: true,
      emdRounds: { orderBy: { roundNumber: 'asc' } },
      ticketing: true,
      parentPnr: { select: { id: true, pnr: true } },
      childAllocations: true,
      parentAllocations: {
        include: { childPnr: { select: { id: true, pnr: true } } },
      },
    },
  });

  if (!r) return null;

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

  const parentAllocated = r.childAllocations.reduce((sum, a) => sum + a.seatsAllocated, 0);

  return {
    id: r.id,
    srNo: r.srNo,
    requestDate: isoOrNull(r.requestDate)!,
    investorCompany: r.investorCompany,
    licenseName: r.license?.name ?? null,
    branchName: r.branch?.name ?? null,
    parentPnrId: r.parentPnrId,
    pnr: r.pnr,
    gdsPnr: r.gdsPnr,
    segment: r.segment,
    airlineCode: r.airline?.code ?? null,
    airlineName: r.airline?.name ?? null,
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
      paymentPct: Number(x.paymentPct),
      emdNumber: x.emdNumber,
      emdAmount: Number(x.emdAmount),
      deadlineDate: isoOrNull(x.deadlineDate)!,
      deadlineTime: x.deadlineTime ? x.deadlineTime.toISOString().slice(11, 16) : null,
      status: x.status,
      refundAmount: x.refundAmount === null ? null : Number(x.refundAmount),
      refundDate: isoOrNull(x.refundDate),
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
    })),
    parentAllocationsTotal: r.parentPnrId ? parentAllocated : null,
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
