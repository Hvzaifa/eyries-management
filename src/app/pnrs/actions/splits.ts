'use server';

/**
 * Splits kept inside a booking (Phase 9 Step 6; owner, 2026-10-29).
 *
 * A split never creates a booking: it is a row in `pnr_splits` under the
 * booking, taking seats from one holder (an agent, or the company's unassigned
 * seats), with its own dates, an optional new PNR code, and its own ticket
 * deadline and count. The booking's seats, fare and EMD rounds are untouched.
 *
 * Who: Head Office on any SV booking, a branch on its own — including after
 * EMD-1 (A3). Everything runs under the booking's row lock and is logged.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { str, numVal } from '@/lib/form';
import { requireUser, TX_TIMEOUT_MS } from '@/lib/server/guards';
import { canEditPnr } from '@/lib/auth';
import { pnrCodeKey } from '@/lib/booking-entry';
import { seatLedger } from '@/lib/inventory';
import { splitRemovable, splittableSeats, validateSplitDraft } from '@/lib/splits';
import { ticketCountsFromAnswer } from '@/lib/ticketing';

type Result = { error: string } | undefined;
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const day = (v: string | null) => (v ? new Date(`${v}T00:00:00.000Z`) : null);

/** A split's PNR code must not be any booking's or any other split's (owner, 2026-10-29). */
async function codeTaken(tx: Tx, code: string, exceptSplitId?: string): Promise<string | null> {
  // Matched as the new-booking duplicate check matches (`findPnrByCode`).
  const bookings = await tx.pnr.findMany({
    where: { pnr: { equals: code, mode: 'insensitive' } },
    select: { pnr: true, srNo: true },
  });
  const booking = bookings.find((b) => pnrCodeKey(b.pnr) === code);
  if (booking) return `PNR ${booking.pnr} already exists (SR#${booking.srNo}).`;
  const split = await tx.pnrSplit.findFirst({
    where: { pnrCode: code, ...(exceptSplitId ? { id: { not: exceptSplitId } } : {}) },
    select: { pnr: { select: { pnr: true } } },
  });
  if (split) return `PNR ${code} is already a split of ${split.pnr.pnr}.`;
  return null;
}

/** The booking, locked, with what a split needs to check against. */
async function lockedBooking(tx: Tx, pnrId: string) {
  await tx.$queryRaw`select id from pnrs where id = ${pnrId}::uuid for update`;
  return tx.pnr.findUnique({
    where: { id: pnrId },
    select: {
      id: true,
      pnr: true,
      status: true,
      seats: true,
      branchId: true,
      tripType: true,
      outboundDate: true,
      inboundDate: true,
      airline: { select: { code: true } },
      agentAssignments: { where: { releasedAt: null }, select: { id: true, seats: true, releasedAt: true, agent: { select: { name: true } } } },
      splits: { select: { id: true, assignmentId: true, seats: true } },
    },
  });
}

function draftFrom(formData: FormData) {
  return {
    seats: numVal(formData, 'seats'),
    pnrCode: str(formData, 'split_pnr_code'),
    outboundDate: str(formData, 'outbound_date'),
    inboundDate: str(formData, 'inbound_date'),
    ticketIssuanceDeadline: str(formData, 'ticket_issuance_deadline'),
  };
}

function bookingFacts(b: NonNullable<Awaited<ReturnType<typeof lockedBooking>>>) {
  return {
    status: b.status,
    airlineCode: b.airline?.code ?? null,
    tripType: b.tripType,
    outboundDate: iso(b.outboundDate),
    inboundDate: iso(b.inboundDate),
    pnrCode: b.pnr,
  };
}

export async function createSplit(formData: FormData): Promise<Result> {
  const user = await requireUser();
  const pnrId = str(formData, 'pnr_id');
  if (!pnrId) return { error: 'Missing booking id.' };
  // '' = the company's unassigned seats; otherwise an assignment id.
  const holder = str(formData, 'holder');
  const assignmentId = holder && holder !== 'company' ? holder : null;

  const owner = await prisma.pnr.findUnique({ where: { id: pnrId }, select: { branchId: true } });
  if (!owner) return { error: 'Booking not found.' };
  if (!canEditPnr(user, owner.branchId, false)) return { error: 'You can only split your own branch’s bookings.' };

  const result = await prisma.$transaction(async (tx) => {
    const b = await lockedBooking(tx, pnrId);
    if (!b) return { error: 'Booking not found.' };

    let holderSeats: number;
    let holderName: string;
    if (assignmentId) {
      const a = b.agentAssignments.find((x) => x.id === assignmentId);
      if (!a) return { error: 'That agent no longer holds seats on this booking.' };
      holderSeats = a.seats;
      holderName = a.agent.name;
    } else {
      holderSeats = seatLedger({ seats: b.seats, assignments: b.agentAssignments }).unassigned;
      holderName = 'Company';
    }
    const available = splittableSeats({ holderSeats, assignmentId, splits: b.splits });

    const v = validateSplitDraft(draftFrom(formData), bookingFacts(b), available);
    if ('error' in v) return { error: v.error };
    if (v.pnrCode) {
      const taken = await codeTaken(tx, v.pnrCode);
      if (taken) return { error: taken };
    }

    const split = await tx.pnrSplit.create({
      data: {
        pnrId,
        assignmentId,
        seats: v.seats!,
        pnrCode: v.pnrCode,
        outboundDate: day(v.outboundDate)!,
        inboundDate: day(v.inboundDate),
        ticketIssuanceDeadline: day(v.ticketIssuanceDeadline),
        createdBy: user.id,
      },
    });
    await tx.activityLog.create({
      data: {
        tableName: 'pnr_splits',
        recordId: pnrId,
        fieldName: 'split',
        oldValue: null,
        newValue: `${v.seats} seat${v.seats === 1 ? '' : 's'} of ${holderName} split${v.pnrCode ? ` as ${v.pnrCode}` : ''}: out ${v.outboundDate}${v.inboundDate ? `, in ${v.inboundDate}` : ''}, tickets by ${v.ticketIssuanceDeadline} (${split.id})`,
        changedBy: user.id,
      },
    });
    return null;
  }, { timeout: TX_TIMEOUT_MS });

  if (result) return result;
  revalidatePath('/');
  revalidatePath(`/pnrs/${pnrId}`);
  return undefined;
}

/**
 * Edits a split's dates, PNR code, ticket deadline and "All tickets issued?"
 * answer. Its seats and holder are fixed; remove and split again to change
 * them (owner, 2026-10-29).
 */
export async function updateSplit(formData: FormData): Promise<Result> {
  const user = await requireUser();
  const splitId = str(formData, 'split_id');
  if (!splitId) return { error: 'Missing split.' };
  const found = await prisma.pnrSplit.findUnique({ where: { id: splitId }, select: { pnrId: true, pnr: { select: { branchId: true } } } });
  if (!found) return { error: 'Split not found.' };
  if (!canEditPnr(user, found.pnr.branchId, false)) return { error: 'You can only change splits on your own branch’s bookings.' };

  const result = await prisma.$transaction(async (tx) => {
    const b = await lockedBooking(tx, found.pnrId);
    if (!b) return { error: 'Booking not found.' };
    const s = await tx.pnrSplit.findUnique({ where: { id: splitId } });
    if (!s) return { error: 'Split not found.' };

    const v = validateSplitDraft(draftFrom(formData), bookingFacts(b), null);
    if ('error' in v) return { error: v.error };
    if (v.pnrCode && v.pnrCode !== s.pnrCode) {
      const taken = await codeTaken(tx, v.pnrCode, s.id);
      if (taken) return { error: taken };
    }
    const counts = ticketCountsFromAnswer(s.seats, str(formData, 'all_tickets_issued'), numVal(formData, 'tickets_remaining'));
    if ('error' in counts) return { error: counts.error };

    const before = {
      pnrCode: s.pnrCode,
      outboundDate: iso(s.outboundDate),
      inboundDate: iso(s.inboundDate),
      ticketIssuanceDeadline: iso(s.ticketIssuanceDeadline),
      balanceTickets: s.balanceTickets === null ? null : String(s.balanceTickets),
    };
    const after = {
      pnrCode: v.pnrCode,
      outboundDate: v.outboundDate,
      inboundDate: v.inboundDate,
      ticketIssuanceDeadline: v.ticketIssuanceDeadline,
      balanceTickets: counts.balanceTickets === null ? null : String(counts.balanceTickets),
    };
    const changes = (Object.keys(after) as (keyof typeof after)[]).filter((k) => before[k] !== after[k]);
    if (changes.length === 0) return null;

    await tx.pnrSplit.update({
      where: { id: s.id },
      data: {
        pnrCode: v.pnrCode,
        outboundDate: day(v.outboundDate)!,
        inboundDate: day(v.inboundDate),
        ticketIssuanceDeadline: day(v.ticketIssuanceDeadline),
        ticketsIssued: counts.ticketsIssued,
        balanceTickets: counts.balanceTickets,
      },
    });
    await tx.activityLog.createMany({
      data: changes.map((k) => ({
        tableName: 'pnr_splits',
        recordId: found.pnrId,
        fieldName: `split.${k}`,
        oldValue: before[k] ?? '(empty)',
        newValue: after[k] ?? '(empty)',
        changedBy: user.id,
      })),
    });
    return null;
  }, { timeout: TX_TIMEOUT_MS });

  if (result) return result;
  revalidatePath('/');
  revalidatePath(`/pnrs/${found.pnrId}`);
  return undefined;
}

/** Removes a split — its seats are simply the booking's again — until a ticket count is recorded on it. */
export async function removeSplit(formData: FormData): Promise<Result> {
  const user = await requireUser();
  const splitId = str(formData, 'split_id');
  if (!splitId) return { error: 'Missing split.' };
  const found = await prisma.pnrSplit.findUnique({ where: { id: splitId }, select: { pnrId: true, pnr: { select: { branchId: true } } } });
  if (!found) return { error: 'Split not found.' };
  if (!canEditPnr(user, found.pnr.branchId, false)) return { error: 'You can only change splits on your own branch’s bookings.' };

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`select id from pnrs where id = ${found.pnrId}::uuid for update`;
    const s = await tx.pnrSplit.findUnique({ where: { id: splitId } });
    if (!s) return { error: 'Split not found.' };
    if (!splitRemovable(s)) return { error: 'A ticket count is recorded on this split, so it can no longer be removed.' };
    await tx.pnrSplit.delete({ where: { id: s.id } });
    await tx.activityLog.create({
      data: {
        tableName: 'pnr_splits',
        recordId: found.pnrId,
        fieldName: 'split',
        oldValue: `${s.seats} seat${s.seats === 1 ? '' : 's'}${s.pnrCode ? ` (${s.pnrCode})` : ''}: out ${iso(s.outboundDate)}${s.inboundDate ? `, in ${iso(s.inboundDate)}` : ''} (${s.id})`,
        newValue: 'removed — seats back on the booking',
        changedBy: user.id,
      },
    });
    return null;
  }, { timeout: TX_TIMEOUT_MS });

  if (result) return result;
  revalidatePath('/');
  revalidatePath(`/pnrs/${found.pnrId}`);
  return undefined;
}
