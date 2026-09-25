'use server';

/**
 * Handing PNR seats to agents, taking them back, and moving them between agents
 * (phase 6 step 2).
 *
 * Who may do what (docs/decisions.md, 2026-09-19, rulings 6–7):
 *   assign  — head office, and a branch on its own PNRs
 *   release — head office only
 *   move    — head office only
 *
 * Every write follows the same shape, and the shape is the point:
 *
 *   1. read and authorise;
 *   2. open a transaction and **lock the PNR row**;
 *   3. recompute the ledger from rows read INSIDE the lock;
 *   4. validate against it;
 *   5. write, and log to activity_log in the same transaction.
 *
 * Steps 2–4 are what stop two staff members assigning the last seats at the same
 * moment. Validating before the transaction would let both pass.
 */

import { revalidatePath } from 'next/cache';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { str, numVal } from '@/lib/form';
import {
  requireUser,
  requireHeadOffice,
  canSellOnPnr,
  TX_TIMEOUT_MS,
} from '@/lib/server/guards';
import { seatLedger, validateAssign, validateMove, validateRelease } from '@/lib/inventory';
import {
  describeTerm,
  isTermType,
  validateTerms,
  type AgentTerms,
} from '@/lib/agent-money';

export interface AssignmentActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Locks one PNR row for the rest of the transaction, so concurrent assignments
 * queue instead of racing. Parameterised — never string-built SQL (rule 8).
 */
async function lockPnr(tx: Prisma.TransactionClient, pnrId: string): Promise<{ seats: number } | null> {
  const rows = await tx.$queryRaw<{ seats: number }[]>`
    select seats from pnrs where id = ${pnrId}::uuid for update
  `;
  return rows[0] ?? null;
}

/** The live assignments of a PNR, read inside the lock. */
function liveAssignments(tx: Prisma.TransactionClient, pnrId: string) {
  return tx.agentAssignment.findMany({ where: { pnrId, releasedAt: null } });
}

export async function assignSeatsToAgent(formData: FormData): Promise<AssignmentActionResult> {
  const user = await requireUser();

  const pnrId = str(formData, 'pnr_id');
  const agentId = str(formData, 'agent_id');
  const seats = numVal(formData, 'seats');
  if (!pnrId || !agentId) return { ok: false, error: 'Missing booking or agent.' };
  if (seats === null) return { ok: false, error: 'Seats must be a positive whole number.' };

  const pnr = await prisma.pnr.findUnique({ where: { id: pnrId }, select: { branchId: true } });
  if (!pnr) return { ok: false, error: 'Booking not found.' };
  if (!canSellOnPnr(user, pnr.branchId)) {
    return { ok: false, error: 'You do not have permission to assign seats on this booking.' };
  }

  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) return { ok: false, error: 'Agent not found.' };
  if (!agent.active) return { ok: false, error: `${agent.name} is inactive — reactivate the agent first.` };

  const result = await prisma.$transaction(async (tx) => {
    const locked = await lockPnr(tx, pnrId);
    if (!locked) return { ok: false, error: 'Booking not found.' };

    const assignments = await liveAssignments(tx, pnrId);
    const ledger = seatLedger({ seats: locked.seats, assignments });

    const invalid = validateAssign(ledger, seats);
    if (invalid) return { ok: false, error: invalid };

    // One live assignment per agent per PNR: topping up an agent's seats adds to
    // the row they already have, rather than leaving two rows to reconcile.
    const existing = assignments.find((a) => a.agentId === agentId);

    if (existing) {
      await tx.agentAssignment.update({
        where: { id: existing.id },
        data: { seats: existing.seats + seats },
      });
      await tx.activityLog.create({
        data: {
          tableName: 'agent_assignments',
          recordId: existing.id,
          fieldName: 'seats',
          oldValue: String(existing.seats),
          newValue: String(existing.seats + seats),
          changedBy: user.id,
        },
      });
    } else {
      const created = await tx.agentAssignment.create({
        data: { pnrId, agentId, seats, assignedBy: user.id },
      });
      await tx.activityLog.create({
        data: {
          tableName: 'agent_assignments',
          recordId: created.id,
          fieldName: null,
          oldValue: null,
          newValue: `${seats} seat${seats === 1 ? '' : 's'} assigned to ${agent.name}`,
          changedBy: user.id,
        },
      });
    }

    return { ok: true };
  }, { timeout: TX_TIMEOUT_MS });

  if (result.ok) {
    revalidatePath(`/pnrs/${pnrId}`);
    revalidatePath('/');
  }
  return result;
}

/**
 * Takes seats back from an agent. Head office only (ruling 7) — releasing is
 * half of moving seats between agents, so letting a branch release would let it
 * move them in two steps.
 */
export async function releaseAgentSeats(formData: FormData): Promise<AssignmentActionResult> {
  const user = await requireHeadOffice();

  const assignmentId = str(formData, 'assignment_id');
  const seats = numVal(formData, 'seats');
  if (!assignmentId) return { ok: false, error: 'Missing assignment.' };

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.agentAssignment.findUnique({
      where: { id: assignmentId },
      include: { agent: { select: { name: true } } },
    });
    if (!existing) return { ok: false, error: 'Assignment not found.' };
    if (existing.releasedAt) return { ok: false, error: 'These seats have already been released.' };

    await lockPnr(tx, existing.pnrId);

    // No seats given = release the whole assignment.
    const toRelease = seats ?? existing.seats;
    const invalid = validateRelease(existing.seats, toRelease);
    if (invalid) return { ok: false, error: invalid };

    if (toRelease === existing.seats) {
      await tx.agentAssignment.update({
        where: { id: existing.id },
        data: { releasedAt: new Date() },
      });
    } else {
      await tx.agentAssignment.update({
        where: { id: existing.id },
        data: { seats: existing.seats - toRelease },
      });
    }

    await tx.activityLog.create({
      data: {
        tableName: 'agent_assignments',
        recordId: existing.id,
        fieldName: 'seats',
        oldValue: String(existing.seats),
        newValue: String(existing.seats - toRelease),
        changedBy: user.id,
      },
    });

    return { ok: true, pnrId: existing.pnrId };
  }, { timeout: TX_TIMEOUT_MS });

  if (result.ok && 'pnrId' in result) {
    revalidatePath(`/pnrs/${result.pnrId}`);
    revalidatePath('/');
  }
  return { ok: result.ok, error: result.error };
}

/**
 * Moves seats from one agent to another on the same booking. **Head office only**
 * (ruling 7): this is the one action a branch must not perform.
 *
 * A move needs no unassigned seats — the seats are already committed and simply
 * change hands — so it is deliberately not "release then assign", which would
 * fail whenever the booking is fully assigned, i.e. exactly when a move is most
 * likely to be needed.
 */
export async function moveAgentSeats(formData: FormData): Promise<AssignmentActionResult> {
  const user = await requireHeadOffice();

  const assignmentId = str(formData, 'assignment_id');
  const toAgentId = str(formData, 'to_agent_id');
  const seats = numVal(formData, 'seats');
  if (!assignmentId || !toAgentId) return { ok: false, error: 'Missing assignment or destination agent.' };

  const toAgent = await prisma.agent.findUnique({ where: { id: toAgentId } });
  if (!toAgent) return { ok: false, error: 'Destination agent not found.' };
  if (!toAgent.active) return { ok: false, error: `${toAgent.name} is inactive — reactivate the agent first.` };

  const result = await prisma.$transaction(async (tx) => {
    const from = await tx.agentAssignment.findUnique({
      where: { id: assignmentId },
      include: { agent: { select: { name: true } } },
    });
    if (!from) return { ok: false, error: 'Assignment not found.' };
    if (from.releasedAt) return { ok: false, error: 'These seats have already been released.' };

    await lockPnr(tx, from.pnrId);

    const toMove = seats ?? from.seats;
    const invalid = validateMove(from.seats, toMove, from.agentId === toAgentId);
    if (invalid) return { ok: false, error: invalid };

    // Take the seats off the losing agent.
    if (toMove === from.seats) {
      await tx.agentAssignment.update({ where: { id: from.id }, data: { releasedAt: new Date() } });
    } else {
      await tx.agentAssignment.update({ where: { id: from.id }, data: { seats: from.seats - toMove } });
    }

    // Give them to the receiving agent, merging with any row they already hold.
    const existingTo = await tx.agentAssignment.findFirst({
      where: { pnrId: from.pnrId, agentId: toAgentId, releasedAt: null },
    });
    if (existingTo) {
      await tx.agentAssignment.update({
        where: { id: existingTo.id },
        data: { seats: existingTo.seats + toMove },
      });
    } else {
      // The commercial terms do NOT travel with the seats: they belong to the
      // agent who was given them, and the new agent's terms are head office's to
      // set (ruling 9). A moved-to assignment starts with no charge or discount.
      await tx.agentAssignment.create({
        data: { pnrId: from.pnrId, agentId: toAgentId, seats: toMove, assignedBy: user.id },
      });
    }

    await tx.activityLog.create({
      data: {
        tableName: 'agent_assignments',
        recordId: from.id,
        fieldName: 'agent_id',
        oldValue: `${from.agent.name} (${from.seats} seats)`,
        newValue: `${toMove} seat${toMove === 1 ? '' : 's'} moved to ${toAgent.name}`,
        changedBy: user.id,
      },
    });

    return { ok: true, pnrId: from.pnrId };
  }, { timeout: TX_TIMEOUT_MS });

  if (result.ok && 'pnrId' in result) {
    revalidatePath(`/pnrs/${result.pnrId}`);
    revalidatePath('/');
  }
  return { ok: result.ok, error: result.error };
}

/** Agents this user may pick from when assigning (same visibility as /agents). */
export async function listAssignableAgents(): Promise<{ id: string; name: string }[]> {
  const user = await requireUser();
  const { agentVisibilityFilter } = await import('@/lib/agents');
  const where = agentVisibilityFilter(user);
  if (where === null) return [];
  return prisma.agent.findMany({
    where: { ...where, active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
}

/**
 * Sets one agent's commercial terms on one booking (phase 7 step 1).
 *
 * Terms are per agent per PNR, never per EMD round (ruling 9): two agents on the
 * same booking can be given different deals, and the same agent can have
 * different terms on two bookings.
 *
 * A branch may set these on its own booking — the owner listed "record
 * recoveries, charges and discounts" among what a branch does (ruling 6). Only
 * *moving* seats between agents is head-office-only.
 *
 * The PNR row is locked and the assignment re-read inside the transaction, for
 * the same reason the seat actions do it: `seats` is what the discount is
 * checked against, and head office can be releasing seats at the same moment.
 */
export async function saveAssignmentTerms(formData: FormData): Promise<AssignmentActionResult> {
  const user = await requireUser();

  const assignmentId = str(formData, 'assignment_id');
  if (!assignmentId) return { ok: false, error: 'Missing assignment.' };

  const chargeType = str(formData, 'charge_type') ?? 'none';
  const discountType = str(formData, 'discount_type') ?? 'none';
  if (!isTermType(chargeType) || !isTermType(discountType)) {
    return { ok: false, error: 'Choose how the charge or discount is calculated.' };
  }

  // A value left in a box that was then switched to "None" is dropped, not
  // saved: the database check requires type and value to agree, and a hidden
  // amount attached to no term is exactly the kind of half-saved row that
  // resurfaces later as a wrong total.
  const terms: AgentTerms = {
    chargeType,
    chargeValue: chargeType === 'none' ? null : numVal(formData, 'charge_value'),
    discountType,
    discountValue: discountType === 'none' ? null : numVal(formData, 'discount_value'),
    chargeTax: formData.get('charge_tax') === 'on' || formData.get('charge_tax') === 'true',
  };

  const existing = await prisma.agentAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      agent: { select: { name: true } },
      pnr: { select: { id: true, branchId: true, fare: true, airlineTaxes: true } },
    },
  });
  if (!existing) return { ok: false, error: 'Assignment not found.' };
  if (existing.releasedAt) {
    return { ok: false, error: 'These seats have been released — there are no terms to set.' };
  }
  if (!canSellOnPnr(user, existing.pnr.branchId)) {
    return { ok: false, error: 'You do not have permission to set terms on this booking.' };
  }

  const pricing = {
    fare: Number(existing.pnr.fare),
    airlineTaxes: existing.pnr.airlineTaxes === null ? null : Number(existing.pnr.airlineTaxes),
  };

  const result = await prisma.$transaction(async (tx) => {
    await lockPnr(tx, existing.pnr.id);

    // Re-read inside the lock: the seat count is what a discount is measured
    // against, and it can have moved since the form was opened.
    const current = await tx.agentAssignment.findUnique({ where: { id: assignmentId } });
    if (!current) return { ok: false, error: 'Assignment not found.' };
    if (current.releasedAt) {
      return { ok: false, error: 'These seats have been released — there are no terms to set.' };
    }

    const invalid = validateTerms(terms, { seats: current.seats, pricing });
    if (invalid) return { ok: false, error: invalid.error };

    const before: AgentTerms = {
      chargeType: (current.chargeType as AgentTerms['chargeType']) ?? 'none',
      chargeValue: current.chargeValue === null ? null : Number(current.chargeValue),
      discountType: (current.discountType as AgentTerms['discountType']) ?? 'none',
      discountValue: current.discountValue === null ? null : Number(current.discountValue),
      chargeTax: current.chargeTax,
    };

    await tx.agentAssignment.update({
      where: { id: assignmentId },
      data: {
        chargeType: terms.chargeType,
        chargeValue: terms.chargeValue,
        discountType: terms.discountType,
        discountValue: terms.discountValue,
        chargeTax: terms.chargeTax,
      },
    });

    // Logged in the words a person used, not as four separate column changes:
    // "5% of fare" is the decision; `charge_type = pct` is how it is stored.
    const changes: { field: string; oldValue: string; newValue: string }[] = [];
    const oldCharge = describeTerm(before.chargeType, before.chargeValue);
    const newCharge = describeTerm(terms.chargeType, terms.chargeValue);
    if (oldCharge !== newCharge) {
      changes.push({ field: 'charge', oldValue: oldCharge, newValue: newCharge });
    }
    const oldDiscount = describeTerm(before.discountType, before.discountValue);
    const newDiscount = describeTerm(terms.discountType, terms.discountValue);
    if (oldDiscount !== newDiscount) {
      changes.push({ field: 'discount', oldValue: oldDiscount, newValue: newDiscount });
    }
    if (before.chargeTax !== terms.chargeTax) {
      changes.push({
        field: 'charge_tax',
        oldValue: before.chargeTax ? 'Agent pays airline tax' : 'No airline tax',
        newValue: terms.chargeTax ? 'Agent pays airline tax' : 'No airline tax',
      });
    }

    for (const c of changes) {
      await tx.activityLog.create({
        data: {
          tableName: 'agent_assignments',
          recordId: assignmentId,
          fieldName: c.field,
          oldValue: c.oldValue,
          newValue: c.newValue,
          changedBy: user.id,
        },
      });
    }

    return { ok: true, pnrId: existing.pnr.id };
  }, { timeout: TX_TIMEOUT_MS });

  if (result.ok) {
    revalidatePath(`/pnrs/${existing.pnr.id}`);
    revalidatePath(`/agents/${existing.agentId}`);
  }
  return { ok: result.ok, error: result.error };
}
