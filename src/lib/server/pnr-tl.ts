import { Prisma } from '@prisma/client';
import { sameDate } from '@/lib/urgency';

/**
 * Re-apply the PNR TL rule after anything changes a PNR's EMD rounds.
 *
 * Owner rule (2026-09-07): the PNR TL is the time limit the PNR rests with us.
 * It starts as EMD-1's deadline; once EMD-1 is settled — the airline confirms
 * payment and staff update the round's status — the TL becomes EMD-2's deadline,
 * and so on down the rounds. So the TL is always the deadline of the earliest
 * round still outstanding (status 'issued'). When no round is outstanding, the
 * last round's deadline stands; the TL is never blanked.
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

  const outstanding = rounds.find((r) => r.status === 'issued');
  const newTlDate = outstanding
    ? outstanding.deadlineDate
    : rounds[rounds.length - 1].deadlineDate;

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
