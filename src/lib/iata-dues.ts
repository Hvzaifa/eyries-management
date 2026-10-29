import { prisma } from './prisma';
import { iataPaymentState } from './iata-payments';
import { licenseOfRound, type IataDueRound } from './iata-by-license';
import { lookupLabel } from '@/lib/lookups';

/**
 * What the company still owes IATA, read-only.
 *
 * IATA settles a whole billing period in one payment, so the useful question is
 * "what has to go out on 30 September", not "what does this booking owe". The
 * rounds are therefore grouped by remittance day (owner ruling, 2026-09-22).
 *
 * A round is owed only while nothing settles it and its remittance day is today
 * or ahead; a passed day reads as paid (owner, 2026-10-03). A refund after the
 * billing window does not settle it — the payment stands and the refund is a
 * later credit (owner, 2026-10-04) — so the query does not filter on
 * `status = 'issued'`.
 * `iataPaymentState` makes the call per round and this filters on its verdict.
 */

export type { IataDueRound } from './iata-by-license';

/** Every EMD still owed to IATA, each under its license (see `licenseOfRound`). */
export async function findIataDueRounds(todayIso: string): Promise<IataDueRound[]> {
  const rounds = await prisma.emdRound.findMany({
    where: {
      paymentDate: null,
      // Deliberately NOT filtered to status = 'issued': a round refunded after
      // its billing window (or with no refund date) is still owed until its
      // remittance day, so
      // `iataPaymentState` decides below and this keeps refunded rounds in scope.
      // A cancelled or completed booking is not a live obligation to settle.
      pnr: { status: 'active' },
    },
    orderBy: { issuanceDate: 'asc' },
    include: {
      license: { select: { id: true, name: true, code: true } },
      pnr: {
        select: {
          id: true,
          pnr: true,
          srNo: true,
          seats: true,
          outboundDate: true,
          airline: { select: { code: true } },
          branch: { select: { name: true, code: true } },
          license: { select: { id: true, name: true, code: true } },
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
    // Listed by code, like every other license label (2026-10-20).
    const asRef = (l: { id: string; name: string; code: string | null } | null) => (l ? { id: l.id, name: lookupLabel(l)! } : null);
    const license = licenseOfRound(asRef(r.license), asRef(r.pnr.license));
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
      branchName: lookupLabel(r.pnr.branch),
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
  const rows = await prisma.license.findMany({ select: { id: true, name: true, code: true } });
  // Shown by code (2026-10-20); `licenseTabs` orders them.
  return rows.map((l) => ({ id: l.id, name: lookupLabel(l)! }));
}
