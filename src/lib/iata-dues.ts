import { prisma } from './prisma';
import { iataPaymentState } from './iata-payments';
import { licenseOfRound, type IataDueRound } from './iata-by-license';

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

export type { IataDueRound } from './iata-by-license';

/** Every EMD still owed to IATA, each under its license (see `licenseOfRound`). */
export async function findIataDueRounds(todayIso: string): Promise<IataDueRound[]> {
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
      license: { select: { id: true, name: true } },
      pnr: {
        select: {
          id: true,
          pnr: true,
          srNo: true,
          seats: true,
          outboundDate: true,
          airline: { select: { code: true } },
          branch: { select: { name: true } },
          license: { select: { id: true, name: true } },
        },
      },
    },
  });

  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

  return rounds.flatMap((r) => {
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
    const license = licenseOfRound(r.license, r.pnr.license);
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
      licenseId: license?.id ?? null,
      licenseName: license?.name ?? null,
      seats: r.pnr.seats,
      outboundDate: iso(r.pnr.outboundDate),
      periodCode: state.period?.code ?? null,
      deadline: state.deadline,
      rollBy: state.rollBy,
      lateRefund: state.lateRefund,
    }];
  });
}

/** Every license, for the page's buttons — including those owing nothing. */
export async function listLicenses() {
  return prisma.license.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });
}
