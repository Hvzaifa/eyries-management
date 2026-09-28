import { Prisma } from '@prisma/client';
import { sameDate } from '@/lib/urgency';

/**
 * Re-apply the PNR TL rule after anything changes a PNR's EMD rounds.
 *
 * Owner rule (2026-09-07): the PNR TL is the time limit the PNR rests with us.
 * It starts as the 1st EMD's deadline; each EMD issued secures the PNR to a new
 * time limit, so **the TL is the latest round's deadline**. Corrected
 * 2026-09-28: it used to be the earliest round still `issued`, which left the
 * TL on round 1's passed date whenever round 2 was issued before round 1's
 * refund was recorded, and the dashboard called those bookings overdue.
 *
 * Each of those deadlines is an **issuance** time limit — the date the next EMD
 * or the tickets must be issued by — so the TL genuinely is "how long the PNR
 * rests with us" (owner correction, 2026-09-21).
 *
 * Must run wherever a round is created, edited, or refunded — the handover is
 * triggered by the status change, so a path that skips this leaves the TL
 * pointing at a deadline that has already been settled.
 */
export async function syncPnrTlDate(
  tx: Prisma.TransactionClient,
  pnrId: string,
  changedBy: string
): Promise<void> {
  const [pnr, rounds] = await Promise.all([
    tx.pnr.findUnique({ where: { id: pnrId }, select: { pnrTlDate: true } }),
    tx.emdRound.findMany({ where: { pnrId }, orderBy: { roundNumber: 'asc' } }),
  ]);
  if (!pnr || rounds.length === 0) return;

  const newTlDate = rounds[rounds.length - 1].deadlineDate;

  // Value comparison — see sameDate(). Comparing Date objects with !== reports a
  // change every time and logs a TL move that never happened.
  if (sameDate(pnr.pnrTlDate, newTlDate)) return;

  await tx.pnr.update({ where: { id: pnrId }, data: { pnrTlDate: newTlDate } });
  await tx.activityLog.create({
    data: {
      tableName: 'pnrs',
      recordId: pnrId,
      fieldName: 'pnr_tl_date',
      oldValue: pnr.pnrTlDate ? pnr.pnrTlDate.toISOString().slice(0, 10) : '(empty)',
      newValue: newTlDate ? newTlDate.toISOString().slice(0, 10) : '(empty)',
      changedBy,
    },
  });
}
