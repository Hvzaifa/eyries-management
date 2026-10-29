'use server';

/**
 * Cancelling a flagged booking, the penalty-paid switch, and paying agents back
 * (Phase 9 Step 5; owner, 2026-10-28: flagged, never automatic).
 *
 * Who may do what:
 *   cancel       — a branch on its own bookings, Head Office on any (as release);
 *                  only a booking flagged for a missed EMD-2 or ticketing
 *                  deadline, with a reason. Can't be undone.
 *   penalty paid — Head Office only.
 *   payback      — Head Office only, never more than is owed back. **The
 *                  payment reference never reaches a log line** (CLAUDE.md rule 8).
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { str, numVal } from '@/lib/form';
import { requireHeadOffice, requireUser, TX_TIMEOUT_MS } from '@/lib/server/guards';
import { canEditPnr } from '@/lib/auth';
import { todayIsoInPkt } from '@/lib/urgency';
import {
  cancelBlocker,
  cancellationFlag,
  cancelledAgentMoney,
  describeFlag,
  FORFEITED_FROM_STATUSES,
  validatePayback,
} from '@/lib/cancellation';

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export async function cancelPnr(formData: FormData): Promise<{ error: string } | undefined> {
  const user = await requireUser();
  const id = str(formData, 'pnr_id');
  if (!id) return { error: 'Missing booking id.' };
  const reason = str(formData, 'reason');

  const owner = await prisma.pnr.findUnique({ where: { id }, select: { branchId: true } });
  if (!owner) return { error: 'Booking not found.' };
  if (!canEditPnr(user, owner.branchId, false)) {
    return { error: 'You do not have permission to cancel this booking.' };
  }

  const today = todayIsoInPkt();
  const result = await prisma.$transaction(async (tx) => {
    // Locked, so an EMD-2 issued or a ticket count changed at the same moment
    // is seen by the flag check below.
    await tx.$queryRaw`select id from pnrs where id = ${id}::uuid for update`;
    const p = await tx.pnr.findUnique({
      where: { id },
      select: {
        status: true,
        seats: true,
        createdAt: true,
        ticketing: { select: { ticketIssuanceDeadline: true, balanceTickets: true } },
        splits: { select: { seats: true, ticketsIssued: true, balanceTickets: true, ticketIssuanceDeadline: true, outboundDate: true } },
        emdRounds: {
          select: {
            id: true,
            roundNumber: true,
            status: true,
            paymentPct: true,
            deadlineDate: true,
            issuanceDate: true,
            paymentDate: true,
            refundDate: true,
          },
        },
      },
    });
    if (!p) return { error: 'Booking not found.' };

    const flag = cancellationFlag({
      status: p.status,
      createdOnIso: todayIsoInPkt(p.createdAt),
      seats: p.seats,
      rounds: p.emdRounds.map((r) => ({
        roundNumber: r.roundNumber,
        status: r.status,
        paymentPct: Number(r.paymentPct),
        deadlineDate: iso(r.deadlineDate),
        issuanceDate: iso(r.issuanceDate),
        paymentDate: iso(r.paymentDate),
        refundDate: iso(r.refundDate),
      })),
      ticketIssuanceDeadline: iso(p.ticketing?.ticketIssuanceDeadline),
      balanceTickets: p.ticketing?.balanceTickets ?? null,
      todayIso: today,
      // Every split too: the ticketing trigger needs every part (Step 6).
      splits: p.splits.map((x) => ({ ...x, ticketIssuanceDeadline: iso(x.ticketIssuanceDeadline), outboundDate: iso(x.outboundDate)! })),
    });
    const blocker = cancelBlocker({ status: p.status, flag, reason });
    if (blocker) return { error: blocker };

    // penalty_paid starts at "no": it is set only on a cancelled booking.
    await tx.pnr.update({ where: { id }, data: { status: 'cancelled', penaltyPaid: false } });
    const forfeit = p.emdRounds.filter((r) => FORFEITED_FROM_STATUSES.includes(r.status));
    await tx.emdRound.updateMany({ where: { id: { in: forfeit.map((r) => r.id) } }, data: { status: 'forfeited' } });
    await tx.activityLog.createMany({
      data: [
        { tableName: 'pnrs', recordId: id, fieldName: 'status', oldValue: p.status, newValue: 'cancelled', changedBy: user.id },
        { tableName: 'pnrs', recordId: id, fieldName: 'cancelTrigger', oldValue: null, newValue: describeFlag(flag!), changedBy: user.id },
        { tableName: 'pnrs', recordId: id, fieldName: 'cancelReason', oldValue: null, newValue: reason!.trim(), changedBy: user.id },
        ...forfeit.map((r) => ({
          tableName: 'emd_rounds',
          recordId: r.id,
          fieldName: 'status',
          oldValue: r.status,
          newValue: 'forfeited',
          changedBy: user.id,
        })),
      ],
    });
    return null;
  }, { timeout: TX_TIMEOUT_MS });

  if (result) return result;
  revalidatePath('/');
  revalidatePath('/agents');
  revalidatePath(`/pnrs/${id}`);
  return undefined;
}

/**
 * The penalty-paid switch on a cancelled booking. Once yes, its forfeited EMDs
 * that were paid to IATA go on "To be refunded". It can be switched back while
 * none of them has been refunded yet; after that the refund stands on record.
 */
export async function setPenaltyPaid(formData: FormData): Promise<{ error: string } | undefined> {
  const user = await requireHeadOffice();
  const id = str(formData, 'pnr_id');
  const value = str(formData, 'penalty_paid');
  if (!id) return { error: 'Missing booking id.' };
  if (value !== 'yes' && value !== 'no') return { error: 'Answer Yes or No.' };
  const paid = value === 'yes';

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`select id from pnrs where id = ${id}::uuid for update`;
    const p = await tx.pnr.findUnique({ where: { id }, select: { status: true, penaltyPaid: true } });
    if (!p) return { error: 'Booking not found.' };
    if (p.status !== 'cancelled') return { error: 'Penalty paid is recorded only on a cancelled booking.' };
    if (p.penaltyPaid === paid) return null;
    if (!paid) {
      // A forfeited round refunded after the penalty was marked paid depends on
      // it; un-marking would leave that refund unexplained. The rounds forfeited
      // are the ones the cancellation logged.
      const rounds = await tx.emdRound.findMany({ where: { pnrId: id }, select: { id: true, status: true } });
      const forfeited = await tx.activityLog.findMany({
        where: { tableName: 'emd_rounds', fieldName: 'status', newValue: 'forfeited', recordId: { in: rounds.map((r) => r.id) } },
        select: { recordId: true },
      });
      const wasForfeited = new Set(forfeited.map((l) => l.recordId));
      if (rounds.some((r) => wasForfeited.has(r.id) && r.status !== 'forfeited')) {
        return { error: 'A forfeited EMD on this booking has already been refunded, so the penalty stays marked paid.' };
      }
    }
    await tx.pnr.update({ where: { id }, data: { penaltyPaid: paid } });
    await tx.activityLog.create({
      data: { tableName: 'pnrs', recordId: id, fieldName: 'penaltyPaid', oldValue: p.penaltyPaid ? 'yes' : 'no', newValue: paid ? 'yes' : 'no', changedBy: user.id },
    });
    return null;
  }, { timeout: TX_TIMEOUT_MS });

  if (result) return result;
  revalidatePath('/refunds');
  revalidatePath(`/pnrs/${id}`);
  return undefined;
}

/**
 * Money paid back to an agent on a cancelled booking: what they paid less their
 * penalty, in one or more parts, never more (owner, 2026-10-28). Checked again
 * inside a lock on the assignment's booking so two paybacks at once cannot
 * together exceed it.
 */
export async function recordPayback(formData: FormData): Promise<{ error: string } | undefined> {
  const user = await requireHeadOffice();
  const assignmentId = str(formData, 'assignment_id');
  if (!assignmentId) return { error: 'Missing assignment.' };
  const amount = numVal(formData, 'amount');
  const paidOn = str(formData, 'paid_on');
  const reference = str(formData, 'reference');

  const found = await prisma.agentAssignment.findUnique({ where: { id: assignmentId }, select: { pnrId: true } });
  if (!found) return { error: 'Assignment not found.' };
  const pnrId = found.pnrId;

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`select id from pnrs where id = ${pnrId}::uuid for update`;
    const a = await tx.agentAssignment.findUnique({
      where: { id: assignmentId },
      select: {
        penaltyAmount: true,
        pnr: { select: { status: true } },
        recoveries: { select: { amount: true } },
        paybacks: { select: { amount: true } },
      },
    });
    if (!a) return { error: 'Assignment not found.' };
    if (a.pnr.status !== 'cancelled') return { error: 'Paybacks are recorded only on a cancelled booking.' };

    const money = cancelledAgentMoney({
      recoveries: a.recoveries.map((r) => Number(r.amount)),
      penalty: a.penaltyAmount === null ? null : Number(a.penaltyAmount),
      paybacks: a.paybacks.map((b) => Number(b.amount)),
    });
    const check = validatePayback(amount, paidOn, todayIsoInPkt(), money);
    if ('error' in check) return { error: check.error };

    await tx.agentPayback.create({
      data: { assignmentId, amount: amount!, paidOn: check.date, reference, createdBy: user.id },
    });
    // Keyed by the assignment, as recoveries are, so the booking's history
    // shows it. Amount and date only — never the reference.
    await tx.activityLog.create({
      data: {
        tableName: 'agent_paybacks',
        recordId: assignmentId,
        fieldName: 'payback',
        oldValue: null,
        newValue: `PKR ${amount!.toLocaleString('en-US')} paid back on ${paidOn}`,
        changedBy: user.id,
      },
    });
    return null;
  }, { timeout: TX_TIMEOUT_MS });

  if (result) return result;
  revalidatePath(`/pnrs/${pnrId}`);
  revalidatePath('/agents');
  return undefined;
}
