'use server';

/**
 * Server actions for EMD rounds: adding one, editing one, and recording refunds
 * both singly and in bulk. All of these are Head Office only.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { validateRefund, MAX_BULK_REFUNDS } from '@/lib/refunds';
import { str, dateVal, numVal } from '@/lib/form';
import { requireHeadOffice, TX_TIMEOUT_MS } from '@/lib/server/guards';
import { syncPnrTlDate } from '@/lib/server/pnr-tl';

export async function createEmdRound(formData: FormData) {
  const user = await requireHeadOffice();

  const pnrId = str(formData, 'pnr_id');
  if (!pnrId) return { error: 'Missing PNR ID.' };

  const existing = await prisma.pnr.findUnique({ where: { id: pnrId } });
  if (!existing) return { error: 'Booking not found.' };

  const roundPct = numVal(formData, 'round_payment_pct');
  const roundAmount = numVal(formData, 'round_emd_amount');
  const roundDeadline = dateVal(formData, 'round_deadline_date');

  if (!roundDeadline || roundPct === null || Number.isNaN(roundPct) || roundAmount === null || Number.isNaN(roundAmount)) {
    return {
      error: 'The EMD time limit (deadline date), payment %, and amount are all required.',
    };
  }

  const maxRound = await prisma.emdRound.aggregate({
    where: { pnrId },
    _max: { roundNumber: true },
  });
  const roundNumber = (maxRound._max.roundNumber ?? 0) + 1;

  const deadlineTimeStr = str(formData, 'round_deadline_time');
  const deadlineTime = deadlineTimeStr ? new Date(`1970-01-01T${deadlineTimeStr}:00.000Z`) : null;

  const emdNumber = str(formData, 'round_emd_number');
  if (!emdNumber) {
    return { error: 'EMD Number is required.' };
  }
  if (!/^\d{3} \d{10}$/.test(emdNumber)) {
    return { error: 'EMD Number must be exactly 13 digits with a space after the first three numbers (e.g. 123 4567890123).' };
  }

  await prisma.$transaction(async (tx) => {
    const round = await tx.emdRound.create({
      data: {
        pnrId,
        roundNumber,
        issuanceDate: new Date(),
        issuanceTime: new Date(),
        paymentPct: roundPct,
        emdNumber: emdNumber,
        emdAmount: roundAmount,
        deadlineDate: roundDeadline,
        deadlineTime,
        status: 'issued',
        licenseId: str(formData, 'round_license_id') || existing.licenseId || null,
      },
    });

    await tx.activityLog.create({
      data: {
        tableName: 'emd_rounds',
        recordId: round.id,
        fieldName: null,
        oldValue: null,
        newValue: `round ${roundNumber} manually added`,
        changedBy: user.id,
      },
    });

    await syncPnrTlDate(tx, pnrId, user.id);
  }, { timeout: TX_TIMEOUT_MS });

  revalidatePath('/');
  revalidatePath(`/pnrs/${pnrId}`);
  return { success: true };
}

export async function updateEmdRound(formData: FormData) {
  const user = await requireHeadOffice();

  const roundId = str(formData, 'round_id');
  if (!roundId) return { error: 'Missing round ID.' };

  const existing = await prisma.emdRound.findUnique({
    where: { id: roundId },
    include: { pnr: { include: { emdRounds: { orderBy: { roundNumber: 'asc' } } } } }
  });
  if (!existing) return { error: 'EMD round not found.' };

  const roundIssuance = dateVal(formData, 'round_issuance_date');
  const roundPct = numVal(formData, 'round_payment_pct');
  const roundAmount = numVal(formData, 'round_emd_amount');
  const roundDeadline = dateVal(formData, 'round_deadline_date');
  const roundStatus = str(formData, 'round_status') || existing.status;

  if (!roundIssuance || roundPct === null || roundAmount === null || !roundDeadline) {
    return { error: 'Issuance date, payment %, EMD amount, and deadline are required.' };
  }

  const issuanceTimeStr = str(formData, 'round_issuance_time');
  const issuanceTime = issuanceTimeStr ? new Date(`1970-01-01T${issuanceTimeStr}:00.000Z`) : null;
  const deadlineTimeStr = str(formData, 'round_deadline_time') || issuanceTimeStr;
  const deadlineTime = deadlineTimeStr ? new Date(`1970-01-01T${deadlineTimeStr}:00.000Z`) : null;

  const emdNumber = str(formData, 'round_emd_number');
  if (!emdNumber) {
    return { error: 'EMD Number is required.' };
  }
  if (!/^\d{3} \d{10}$/.test(emdNumber)) {
    return { error: 'EMD Number must be exactly 13 digits with a space after the first three numbers (e.g. 123 4567890123).' };
  }

  await prisma.$transaction(async (tx) => {
    await tx.emdRound.update({
      where: { id: roundId },
      data: {
        issuanceDate: roundIssuance,
        issuanceTime,
        paymentPct: roundPct,
        emdNumber,
        emdAmount: roundAmount,
        deadlineDate: roundDeadline,
        deadlineTime,
        status: roundStatus,
        licenseId: str(formData, 'round_license_id') || null,
      },
    });

    await tx.activityLog.create({
      data: {
        tableName: 'emd_rounds',
        recordId: roundId,
        fieldName: null,
        oldValue: null,
        newValue: `round ${existing.roundNumber} updated (status: ${roundStatus}, amount: ${roundAmount})`,
        changedBy: user.id,
      },
    });

    // Marking EMD-1 paid/refunded here is exactly the handover the TL rule
    // describes: the TL moves on to EMD-2's deadline.
    await syncPnrTlDate(tx, existing.pnrId, user.id);
  }, { timeout: TX_TIMEOUT_MS });

  revalidatePath('/');
  revalidatePath(`/pnrs/${existing.pnrId}`);
  return { success: true };
}

export async function recordEmdRefund(formData: FormData) {
  const user = await requireHeadOffice();

  const roundId = str(formData, 'round_id');
  if (!roundId) return { error: 'Missing round ID.' };

  const existing = await prisma.emdRound.findUnique({ where: { id: roundId } });
  if (!existing) return { error: 'EMD round not found.' };

  // The round itself says which PNR it belongs to. This used to take `pnr_id`
  // from the submitted form, so a wrong or tampered value would re-sync and
  // revalidate a DIFFERENT booking than the one being refunded.
  const pnrId = existing.pnrId;

  const refundAmount = numVal(formData, 'refund_amount');
  const check = validateRefund(refundAmount, str(formData, 'refund_date'), existing.status);
  // Re-wrap in a fresh object literal rather than returning `check` directly.
  // Every action here returns literals, which TypeScript merges into one type
  // with optional properties — that is what lets callers write `res?.error`.
  // Returning the narrowed named type instead keeps a strict union and breaks
  // every call site.
  if ('error' in check) return { error: check.error };
  const refundDate = check.date;

  await prisma.$transaction(async (tx) => {
    await tx.emdRound.update({
      where: { id: roundId },
      data: {
        status: 'refunded',
        refundAmount,
        refundDate,
      },
    });

    await tx.activityLog.create({
      data: {
        tableName: 'emd_rounds',
        recordId: roundId,
        fieldName: 'status',
        oldValue: existing.status,
        newValue: 'refunded',
        changedBy: user.id,
      },
    });

    // Refunding a round settles it, so the TL hands over to the next
    // outstanding round. This path previously skipped the sync entirely,
    // leaving the PNR TL on a deadline that no longer applied.
    await syncPnrTlDate(tx, pnrId, user.id);
  }, { timeout: TX_TIMEOUT_MS });

  revalidatePath('/');
  revalidatePath(`/pnrs/${pnrId}`);
  return { success: true };
}

export async function fetchEmdRoundsByPnrs(pnrCodes: string[]) {
  await requireHeadOffice(); // Only Head Office
  
  if (!pnrCodes || pnrCodes.length === 0) return { rounds: [], error: undefined };

  const normalizedCodes = pnrCodes.map(c => c.trim().toUpperCase()).filter(Boolean);
  if (normalizedCodes.length === 0) return { rounds: [], error: undefined };

  const rounds = await prisma.emdRound.findMany({
    where: {
      pnr: { pnr: { in: normalizedCodes } },
      status: { in: ['issued', 'paid', 'refund_requested'] },
    },
    include: {
      pnr: { select: { pnr: true, investorCompany: true } },
      license: { select: { name: true } }
    },
    orderBy: [
      { pnr: { pnr: 'asc' } },
      { roundNumber: 'asc' }
    ]
  });

  return { rounds, error: undefined };
}

export async function processBulkRefunds(refunds: { roundId: string, amount: number, date: string }[]) {
  const user = await requireHeadOffice();
  
  if (!refunds || refunds.length === 0) return { error: 'No refunds selected.' };
  if (refunds.length > MAX_BULK_REFUNDS) {
    return { error: `Too many refunds in one batch (${refunds.length}). Process at most ${MAX_BULK_REFUNDS} at a time.` };
  }

  // ---------------------------------------------------------------------
  // Validate the WHOLE batch before writing any of it. The previous version
  // validated nothing and used `continue` to skip rounds it could not find,
  // so a partly-bad batch silently refunded some rounds and not others, and
  // reported success either way. Now the batch is all-or-nothing, and the
  // staff member is told exactly which row is wrong.
  // ---------------------------------------------------------------------
  // The same round listed twice would be updated twice, the second write
  // silently replacing the first.
  const ids = refunds.map((r) => r.roundId);
  if (new Set(ids).size !== ids.length) {
    return { error: 'The same EMD round appears more than once in this batch.' };
  }

  const rounds = await prisma.emdRound.findMany({
    where: { id: { in: ids } },
    include: { pnr: { select: { pnr: true } } },
  });
  const byId = new Map(rounds.map((r) => [r.id, r]));

  const validated: { roundId: string; pnrId: string; amount: number; date: Date }[] = [];
  for (const req of refunds) {
    const existing = byId.get(req.roundId);
    if (!existing) {
      return { error: `One of the selected EMD rounds no longer exists. Re-fetch the list and try again.` };
    }
    const label = `${existing.pnr.pnr} round ${existing.roundNumber}`;
    const check = validateRefund(req.amount, req.date, existing.status);
    if ('error' in check) return { error: `${label}: ${check.error}` };
    validated.push({ roundId: req.roundId, pnrId: existing.pnrId, amount: req.amount, date: check.date });
  }

  const affectedPnrIds = new Set<string>();

  await prisma.$transaction(async (tx) => {
    for (const req of validated) {
      await tx.emdRound.update({
        where: { id: req.roundId },
        data: {
          status: 'refunded',
          refundAmount: req.amount,
          refundDate: req.date,
        }
      });

      await tx.activityLog.create({
        data: {
          tableName: 'emd_rounds',
          recordId: req.roundId,
          fieldName: null,
          oldValue: null,
          newValue: `bulk refunded (amount: ${req.amount})`,
          changedBy: user.id,
        },
      });

      affectedPnrIds.add(req.pnrId);
    }

    // Once every round in this batch is refunded, re-apply the TL rule to each
    // affected PNR — same handover as a single refund.
    for (const pnrId of affectedPnrIds) {
      await syncPnrTlDate(tx, pnrId, user.id);
    }
  }, { timeout: TX_TIMEOUT_MS });

  revalidatePath('/');
  return { success: true };
}


