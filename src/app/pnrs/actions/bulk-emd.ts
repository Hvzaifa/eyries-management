'use server';

/**
 * Issuing EMDs against several bookings in one pass. **Head Office only.**
 *
 * The owner's own description of the job: *"HQ mostly issues EMDs… the
 * dashboard should have a checkbox option where the user can check say 5 boxes
 * and click issue EMDs, then all related details of those PNRs are fetched and
 * shown against individual PNRs for staff to issue."*
 *
 * Everything except the EMD number is derived — percentage, amount and the time
 * limit the EMD secures the PNR to — and every derived figure stays editable.
 * The EMD number is the one thing that cannot be calculated: it comes from the
 * airline.
 *
 * The batch is **all-or-nothing**, validated in full before a single row is
 * written, and the caller is told exactly which booking is wrong. Same shape as
 * `processBulkRefunds`, and for the same reason: a partly-applied batch leaves
 * staff unsure which bookings now carry an EMD.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireHeadOffice, TX_TIMEOUT_MS } from '@/lib/server/guards';
import { syncPnrTlDate } from '@/lib/server/pnr-tl';
import { isRealIsoDate } from '@/lib/ticketing';
import {
  MAX_BULK_EMD_ISSUES,
  isValidEmdNumber,
  EMD_NUMBER_HINT,
  type BulkEmdRow,
  type BulkEmdResult,
} from '@/lib/bulk-emd';

export async function issueEmdRounds(rows: BulkEmdRow[]): Promise<BulkEmdResult> {
  const user = await requireHeadOffice();

  if (!rows || rows.length === 0) return { ok: false, error: 'No bookings selected.' };
  if (rows.length > MAX_BULK_EMD_ISSUES) {
    return {
      ok: false,
      error: `Too many bookings in one batch (${rows.length}). Issue at most ${MAX_BULK_EMD_ISSUES} at a time.`,
    };
  }

  // One EMD per booking per batch. The same booking twice would issue two
  // rounds numbered from the same starting point.
  const ids = rows.map((r) => r.pnrId);
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: 'The same booking appears more than once in this batch.' };
  }

  // The EMD number identifies the document the airline issued, so the same one
  // against two bookings is a typo, not two EMDs.
  const numbers = rows.map((r) => (r.emdNumber ?? '').trim());
  const duplicate = numbers.find((n, i) => n !== '' && numbers.indexOf(n) !== i);
  if (duplicate) {
    return { ok: false, error: `EMD number ${duplicate} is used for more than one booking.` };
  }

  const pnrs = await prisma.pnr.findMany({
    where: { id: { in: ids } },
    include: { emdRounds: { select: { roundNumber: true } } },
  });
  const byId = new Map(pnrs.map((p) => [p.id, p]));

  // ---------------------------------------------------------------------
  // Validate the WHOLE batch first. Nothing is written until every row passes.
  // ---------------------------------------------------------------------
  const validated: {
    pnrId: string;
    label: string;
    roundNumber: number;
    emdNumber: string;
    paymentPct: number;
    emdAmount: number;
    deadlineDate: Date;
    licenseId: string | null;
  }[] = [];

  for (const row of rows) {
    const pnr = byId.get(row.pnrId);
    if (!pnr) {
      return {
        ok: false,
        error: 'One of the selected bookings no longer exists. Reload the page and try again.',
      };
    }
    const label = `${pnr.pnr} (SR#${pnr.srNo})`;

    if (pnr.status !== 'active') {
      return { ok: false, error: `${label}: the booking is ${pnr.status}, so no EMD can be issued.` };
    }

    const emdNumber = (row.emdNumber ?? '').trim();
    if (!emdNumber) return { ok: false, error: `${label}: the EMD number is required.` };
    if (!isValidEmdNumber(emdNumber)) {
      return { ok: false, error: `${label}: ${EMD_NUMBER_HINT}` };
    }

    if (!Number.isFinite(row.paymentPct) || row.paymentPct <= 0) {
      return { ok: false, error: `${label}: enter the payment percentage.` };
    }
    if (!Number.isFinite(row.emdAmount) || row.emdAmount <= 0) {
      return { ok: false, error: `${label}: enter the EMD amount.` };
    }
    if (!isRealIsoDate(row.deadlineDate)) {
      return {
        ok: false,
        error: `${label}: the date this EMD secures the PNR until is required, as a real calendar date.`,
      };
    }

    const roundNumber = Math.max(0, ...pnr.emdRounds.map((r) => r.roundNumber)) + 1;

    validated.push({
      pnrId: pnr.id,
      label,
      roundNumber,
      emdNumber,
      paymentPct: row.paymentPct,
      emdAmount: row.emdAmount,
      deadlineDate: new Date(`${row.deadlineDate}T00:00:00.000Z`),
      licenseId: row.licenseId ?? pnr.licenseId ?? null,
    });
  }

  const issuedAt = new Date();

  await prisma.$transaction(async (tx) => {
    for (const v of validated) {
      const round = await tx.emdRound.create({
        data: {
          pnrId: v.pnrId,
          roundNumber: v.roundNumber,
          issuanceDate: issuedAt,
          issuanceTime: issuedAt,
          paymentPct: v.paymentPct,
          emdNumber: v.emdNumber,
          emdAmount: v.emdAmount,
          deadlineDate: v.deadlineDate,
          status: 'issued',
          licenseId: v.licenseId,
        },
      });

      await tx.activityLog.create({
        data: {
          tableName: 'emd_rounds',
          recordId: round.id,
          fieldName: null,
          oldValue: null,
          newValue: `round ${v.roundNumber} issued in a bulk run`,
          changedBy: user.id,
        },
      });

      // The PNR TL follows the earliest outstanding round, which this EMD now
      // is. Without this the booking would still show the old time limit.
      await syncPnrTlDate(tx, v.pnrId, user.id);
    }
  }, { timeout: TX_TIMEOUT_MS });

  revalidatePath('/');
  for (const v of validated) revalidatePath(`/pnrs/${v.pnrId}`);

  return { ok: true, issued: validated.length };
}
