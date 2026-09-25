import { prisma } from './prisma';
import { iataPaymentState, groupByRemittanceDay, type RemittanceGroup } from './iata-payments';

/**
 * What the company still owes IATA, read-only.
 *
 * IATA settles a whole billing period in one payment, so the useful question is
 * "what has to go out on 30 September", not "what does this booking owe". The
 * rounds are therefore grouped by remittance day (owner ruling, 2026-09-22).
 *
 * A round is owed when it has no recorded payment AND its refund, if any, came
 * too late to cancel the billing — a refund only does that when it lands on or
 * before the billing-to date of the period the EMD was issued in. So the query
 * cannot filter on `status = 'issued'`: a refunded round whose refund missed
 * the window is still a bill. `iataPaymentState` makes that call per round and
 * this filters on its verdict.
 */

export interface IataDueRound {
  roundId: string;
  pnrId: string;
  pnrCode: string;
  srNo: number;
  roundNumber: number;
  emdNumber: string | null;
  emdAmount: number;
  issuanceDate: string;
  airlineCode: string | null;
  branchName: string | null;
  licenseName: string | null;
  seats: number;
  outboundDate: string | null;
  periodCode: string | null;
  deadline: string | null;
  /** Last day a refund could still move this bill to the next cycle. */
  rollBy: string | null;
  /** Why a refunded round is nonetheless still owed. */
  lateRefund: 'after-billing' | 'date-unknown' | null;
}

export interface IataDues {
  /** Payments still to make, earliest settlement first. */
  groups: RemittanceGroup<IataDueRound>[];
  /** Owed, but issued outside the loaded calendar — no day can be named yet. */
  undated: IataDueRound[];
  /**
   * Owed despite being refunded, because the refund missed its billing window
   * or has no recorded date. Surprising enough to be worth naming.
   */
  lateRefunds: IataDueRound[];
  /** Every owed round, dated or not. */
  totalOwed: number;
  /** Rounds counted. */
  count: number;
}

export async function findIataDues(todayIso: string): Promise<IataDues> {
  const rounds = await prisma.emdRound.findMany({
    where: {
      paymentDate: null,
      // Deliberately NOT filtered to status = 'issued'. A round refunded after
      // its billing window closed is still billed, so `iataPaymentState`
      // decides below and this keeps the refunded ones in scope.
      // A cancelled or completed booking is not a live obligation to settle.
      pnr: { status: 'active' },
    },
    orderBy: { issuanceDate: 'asc' },
    include: {
      license: { select: { name: true } },
      pnr: {
        select: {
          id: true,
          pnr: true,
          srNo: true,
          seats: true,
          outboundDate: true,
          airline: { select: { code: true } },
          branch: { select: { name: true } },
        },
      },
    },
  });

  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

  const due: IataDueRound[] = rounds.flatMap((r) => {
    const issuanceDate = iso(r.issuanceDate)!;
    const state = iataPaymentState({
      issuanceDate,
      paymentDate: null,
      refundDate: iso(r.refundDate),
      roundStatus: r.status,
      todayIso,
    });
    // A round refunded inside its billing window is not owed — the bill moved
    // to whichever round replaced it, and listing both would count it twice.
    if (!state.owed) return [];
    return [{
      roundId: r.id,
      pnrId: r.pnr.id,
      pnrCode: r.pnr.pnr,
      srNo: r.pnr.srNo,
      roundNumber: r.roundNumber,
      emdNumber: r.emdNumber,
      emdAmount: Number(r.emdAmount),
      issuanceDate,
      airlineCode: r.pnr.airline?.code ?? null,
      branchName: r.pnr.branch?.name ?? null,
      licenseName: r.license?.name ?? null,
      seats: r.pnr.seats,
      outboundDate: iso(r.pnr.outboundDate),
      periodCode: state.period?.code ?? null,
      deadline: state.deadline,
      rollBy: state.rollBy,
      lateRefund: state.lateRefund,
    }];
  });

  const groups = groupByRemittanceDay(
    due,
    (d) => ({ deadline: d.deadline, periodCode: d.periodCode, amount: d.emdAmount }),
    todayIso
  );
  const undated = due.filter((d) => d.deadline === null);
  const lateRefunds = due.filter((d) => d.lateRefund !== null);

  return {
    groups,
    undated,
    lateRefunds,
    totalOwed: due.reduce((sum, d) => sum + Math.round(d.emdAmount * 100), 0) / 100,
    count: due.length,
  };
}
