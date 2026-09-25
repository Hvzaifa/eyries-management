'use server';

/**
 * Recording money received from an agent (phase 7 step 2).
 *
 * "Recovery" is the company's own word for a payment received against what an
 * agent owes. Outstanding is **always** the calculated total minus the sum of
 * these rows — there is no stored balance to drift.
 *
 * Who may do what:
 *   record — head office, and a branch on its own bookings (ruling 6, which
 *            lists "record recoveries, charges and discounts" among a branch's
 *            work; ruling 8 adds that a branch may do this even for an agent
 *            head office created, as long as the booking is the branch's own)
 *   delete — head office only. A deletion is how a mistyped payment is undone,
 *            and undoing money is not a branch's call.
 *
 * **The payment reference never reaches a log line** (CLAUDE.md rule 8). It is
 * stored and shown to staff; `describeRecovery` builds the log text without it.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { str, numVal } from '@/lib/form';
import {
  requireUser,
  requireHeadOffice,
  canSellOnPnr,
  TX_TIMEOUT_MS,
} from '@/lib/server/guards';
import { describeRecovery, validateRecovery } from '@/lib/agent-money';
import { todayIsoInPkt } from '@/lib/urgency';

export interface RecoveryActionResult {
  ok: boolean;
  error?: string;
}

export async function recordRecovery(formData: FormData): Promise<RecoveryActionResult> {
  const user = await requireUser();

  const assignmentId = str(formData, 'assignment_id');
  if (!assignmentId) return { ok: false, error: 'Missing assignment.' };

  const amount = numVal(formData, 'amount');
  const receivedDate = str(formData, 'received_date');
  const method = str(formData, 'method');
  const reference = str(formData, 'reference');

  const check = validateRecovery(amount, receivedDate, todayIsoInPkt());
  if ('error' in check) return { ok: false, error: check.error };

  const assignment = await prisma.agentAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      agent: { select: { id: true, name: true } },
      pnr: { select: { id: true, branchId: true } },
    },
  });
  if (!assignment) return { ok: false, error: 'Assignment not found.' };
  if (assignment.releasedAt) {
    // A released assignment owes nothing — its seats went back to the company —
    // so a payment against it has nowhere to land. Recording one would create a
    // balance on a row whose total is zero, i.e. a permanent phantom credit.
    return {
      ok: false,
      error:
        'These seats have been released, so there is nothing outstanding to pay against. Record the payment on the agent’s current seats instead.',
    };
  }
  if (!canSellOnPnr(user, assignment.pnr.branchId)) {
    return { ok: false, error: 'You do not have permission to record payments on this booking.' };
  }

  await prisma.$transaction(async (tx) => {
    await tx.agentRecovery.create({
      data: {
        assignmentId,
        amount: amount!,
        receivedDate: check.date,
        method,
        reference,
        recordedBy: user.id,
      },
    });

    await tx.activityLog.create({
      data: {
        tableName: 'agent_recoveries',
        // Keyed by the ASSIGNMENT, not by the recovery row. A recovery can be
        // deleted, and an entry keyed on a row that no longer exists could
        // never be found again by the booking's history query — the payment
        // would vanish from the record along with the mistake. The same reason
        // `ticketing` entries carry the PNR's id.
        recordId: assignmentId,
        fieldName: null,
        oldValue: null,
        // No reference here, deliberately — rule 8.
        newValue: `${describeRecovery(amount!, receivedDate!, method)} from ${assignment.agent.name}`,
        changedBy: user.id,
      },
    });
  }, { timeout: TX_TIMEOUT_MS });

  revalidatePath(`/pnrs/${assignment.pnr.id}`);
  revalidatePath(`/agents/${assignment.agent.id}`);
  return { ok: true };
}

/**
 * Removes a payment recorded by mistake. **Head office only.**
 *
 * This is the only way to correct a recovery: a negative payment would read as
 * money going back to the agent and would quietly change a balance with nothing
 * to show for it. The deletion itself is logged, so the audit trail keeps what
 * the row said even though the row is gone.
 */
export async function deleteRecovery(formData: FormData): Promise<RecoveryActionResult> {
  const user = await requireHeadOffice();

  const recoveryId = str(formData, 'recovery_id');
  if (!recoveryId) return { ok: false, error: 'Missing payment.' };

  const recovery = await prisma.agentRecovery.findUnique({
    where: { id: recoveryId },
    include: {
      assignment: {
        include: {
          agent: { select: { id: true, name: true } },
          pnr: { select: { id: true } },
        },
      },
    },
  });
  if (!recovery) return { ok: false, error: 'Payment not found.' };

  const amount = Number(recovery.amount);
  const dateIso = recovery.receivedDate.toISOString().slice(0, 10);

  await prisma.$transaction(async (tx) => {
    await tx.agentRecovery.delete({ where: { id: recoveryId } });
    await tx.activityLog.create({
      data: {
        tableName: 'agent_recoveries',
        recordId: recovery.assignmentId,
        fieldName: 'deleted',
        // Again without the reference.
        oldValue: describeRecovery(amount, dateIso, recovery.method),
        newValue: null,
        changedBy: user.id,
      },
    });
  }, { timeout: TX_TIMEOUT_MS });

  revalidatePath(`/pnrs/${recovery.assignment.pnr.id}`);
  revalidatePath(`/agents/${recovery.assignment.agent.id}`);
  return { ok: true };
}
