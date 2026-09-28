/**
 * Read for the Issue EMDs screen. Not a server action: nothing here is
 * callable from the browser, which is what lets it trust the `user` passed in.
 */

import { prisma } from '@/lib/prisma';
import { isHeadOffice, type AuthUser } from '@/lib/auth';
import { nextEmdSuggestion } from '@/lib/emd';
import { todayIsoInPkt } from '@/lib/urgency';
import { MAX_BULK_EMD_ISSUES, type BulkEmdCandidate } from '@/lib/bulk-emd';

/**
 * The bookings behind a set of ids, with everything the issuance form needs.
 *
 * Bookings that cannot take an EMD are returned too, carrying `blockedReason`,
 * rather than silently dropped: a staff member who ticked six boxes and sees
 * five rows has no way of knowing which one vanished or why.
 *
 * A page read, so it takes the user the page verified. It used to be a server
 * action calling `requireHeadOffice()` → `getUser()`, the write guard; when the
 * Auth server refused a session the page had accepted, that redirected to
 * /login and the middleware bounced it to the dashboard (2026-09-26, the same
 * defect that stopped booking pages opening).
 */
export async function getBulkEmdCandidates(
  user: AuthUser,
  pnrIds: string[]
): Promise<BulkEmdCandidate[]> {
  if (!isHeadOffice(user)) return [];
  if (pnrIds.length === 0) return [];

  const today = todayIsoInPkt();
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

  const pnrs = await prisma.pnr.findMany({
    where: { id: { in: pnrIds.slice(0, MAX_BULK_EMD_ISSUES) } },
    orderBy: { srNo: 'asc' },
    include: {
      airline: { select: { code: true } },
      branch: { select: { name: true } },
      license: { select: { name: true } },
      emdRounds: { select: { id: true } },
    },
  });

  return pnrs.map((p) => {
    const suggestion = nextEmdSuggestion({
      roundsIssued: p.emdRounds.length,
      seats: p.seats,
      fare: Number(p.fare),
      airlineCode: p.airline?.code ?? null,
      segment: p.segment,
      requestDateIso: iso(p.requestDate),
      outboundDateIso: iso(p.outboundDate),
      todayIso: today,
    });

    const blockedReason =
      p.status !== 'active'
        ? `This booking is ${p.status} — reactivate it before issuing an EMD.`
        : p.seats <= 0
          ? 'This booking has no seats, so there is nothing to secure.'
          : null;

    return {
      pnrId: p.id,
      pnrCode: p.pnr,
      srNo: p.srNo,
      airlineCode: p.airline?.code ?? null,
      branchName: p.branch?.name ?? null,
      licenseName: p.license?.name ?? null,
      seats: p.seats,
      fare: Number(p.fare),
      totalEmdValue: p.totalEmdValue === null ? 0 : Number(p.totalEmdValue),
      outboundDate: iso(p.outboundDate),
      issueBy: iso(p.pnrTlDate),
      roundsIssued: p.emdRounds.length,
      roundNumber: suggestion.roundNumber,
      suggestedPct: suggestion.paymentPct,
      suggestedAmount: suggestion.amount,
      suggestedDeadline: suggestion.deadline,
      blockedReason,
    };
  });
}
