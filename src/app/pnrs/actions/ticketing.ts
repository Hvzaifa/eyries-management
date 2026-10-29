'use server';

/**
 * Server actions for the ticketing stage (Phase 5 Step 1; Phase 9 Step 4).
 *
 * Head Office on any booking, a branch on its own (owner, 2026-10-28: the whole
 * ticketing form, at any time — the booking's EMD-1 edit lock does not apply,
 * since every booking reaches ticketing after its EMDs). Penalties for unissued
 * seats follow the same rule.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { str, dateVal, numVal } from '@/lib/form';
import { requireUser, TX_TIMEOUT_MS } from '@/lib/server/guards';
import { canEditPnr } from '@/lib/auth';
import { lookupLabel } from '@/lib/lookups';
import { todayIsoInPkt } from '@/lib/urgency';
import { liveAgentSeats } from '@/lib/inventory';
import {
  penaltyEntryOpen,
  ticketCountsFromAnswer,
  ticketDeadlineError,
  unissuedAcross,
  validatePenalty,
  validateTicketing,
} from '@/lib/ticketing';
import { enteredInApp } from '@/lib/booking-entry';
import { lastOutbound, splitSeats, ticketParts } from '@/lib/splits';

/** `YYYY-MM-DD` or null, for both the validator and the change log. */
function isoOrNull(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/**
 * One shape for every return, so the caller can read `res.error` without
 * narrowing a union of three object types.
 */
export interface SaveTicketingResult {
  ok: boolean;
  error?: string;
  /** True when the form was submitted with nothing actually changed. */
  unchanged?: boolean;
}

export async function saveTicketing(formData: FormData): Promise<SaveTicketingResult> {
  const user = await requireUser();

  const pnrId = str(formData, 'pnr_id');
  if (!pnrId) return { ok: false, error: 'Missing PNR ID.' };

  const pnr = await prisma.pnr.findUnique({ where: { id: pnrId }, include: { splits: { select: { seats: true } } } });
  if (!pnr) return { ok: false, error: 'Booking not found.' };
  if (!canEditPnr(user, pnr.branchId, false)) {
    return { ok: false, error: 'You can only change ticketing on your own branch\u2019s bookings.' };
  }
  // The booking answers for its seats not in a split; each split answers for
  // its own (Phase 9 Step 6; owner, 2026-10-29).
  const ownSeats = pnr.seats - splitSeats(pnr.splits);

  // "All tickets issued?" (A8): the remaining count is typed and tickets issued
  // is worked out from it — never the other way round since Phase 9 Step 4.
  const counts = ticketCountsFromAnswer(
    ownSeats,
    str(formData, 'all_tickets_issued'),
    numVal(formData, 'tickets_remaining')
  );
  if ('error' in counts) return { ok: false, error: counts.error };

  const next = {
    nameUpdateDeadline: dateVal(formData, 'name_update_deadline'),
    ticketIssuanceDeadline: dateVal(formData, 'ticket_issuance_deadline'),
    status: str(formData, 'ticketing_status'),
    ticketsIssued: counts.ticketsIssued,
    balanceTickets: counts.balanceTickets,
  };

  // Validate BEFORE writing anything, as createPnr now does (docs/decisions.md,
  // 2026-09-07): a rejected submission must leave no trace.
  const invalid = validateTicketing(
    {
      nameUpdateDeadline: str(formData, 'name_update_deadline'),
      ticketIssuanceDeadline: str(formData, 'ticket_issuance_deadline'),
      status: next.status,
      ticketsIssued: next.ticketsIssued,
      balanceTickets: next.balanceTickets,
    },
    ownSeats
  );
  if (invalid) return { ok: false, error: invalid.error };

  // A booking entered in the app keeps its ticket issuance deadline, no later
  // than departure, on every save (A6; owner, 2026-10-20). Imported ones are not
  // held to it.
  if (enteredInApp(pnr)) {
    const deadlineError = ticketDeadlineError(
      str(formData, 'ticket_issuance_deadline'),
      isoOrNull(pnr.outboundDate)
    );
    if (deadlineError) return { ok: false, error: deadlineError };
  }

  const existing = await prisma.ticketing.findUnique({ where: { pnrId } });

  // Field-by-field diff, so the change history says what actually moved rather
  // than "ticketing updated". Both sides are stringified before comparing —
  // comparing two Date objects with !== compares identity, not value
  // (docs/decisions.md, 2026-09-07 "PNR TL sync compared Date objects").
  const before = {
    nameUpdateDeadline: isoOrNull(existing?.nameUpdateDeadline ?? null),
    ticketIssuanceDeadline: isoOrNull(existing?.ticketIssuanceDeadline ?? null),
    status: existing?.status ?? null,
    ticketsIssued: existing?.ticketsIssued ?? null,
    balanceTickets: existing?.balanceTickets ?? null,
  };
  const after = {
    nameUpdateDeadline: isoOrNull(next.nameUpdateDeadline),
    ticketIssuanceDeadline: isoOrNull(next.ticketIssuanceDeadline),
    status: next.status,
    ticketsIssued: next.ticketsIssued,
    balanceTickets: next.balanceTickets,
  };

  const changes = (Object.keys(after) as (keyof typeof after)[])
    .map((field) => ({
      field,
      old: before[field] === null ? null : String(before[field]),
      new: after[field] === null ? null : String(after[field]),
    }))
    .filter((c) => c.old !== c.new);

  if (changes.length === 0) {
    return { ok: true, unchanged: true };
  }

  // One transaction: the ticketing row and its history commit together or not at
  // all — data-model.md requires every write to `ticketing` to write to
  // `activity_log`.
  await prisma.$transaction(async (tx) => {
    await tx.ticketing.upsert({
      where: { pnrId },
      create: { pnrId, ...next },
      update: next,
    });

    await tx.activityLog.createMany({
      data: changes.map((c) => ({
        tableName: 'ticketing',
        // `ticketing.pnr_id` IS that table's primary key, so the PNR id is also
        // the record id — no invented identifier.
        recordId: pnrId,
        fieldName: c.field,
        oldValue: c.old ?? '(empty)',
        newValue: c.new ?? '(empty)',
        changedBy: user.id,
      })),
    });
  }, { timeout: TX_TIMEOUT_MS });

  revalidatePath(`/pnrs/${pnrId}`);
  return { ok: true };
}

/**
 * Penalties for unissued seats (Phase 9 Step 4, A9/A10): one amount per agent
 * on the booking (`agent_assignments.penalty_amount`, added to what that agent
 * owes) and one for the company's own seats (`ticketing.company_penalty_amount`),
 * each with the license its penalty EMD was issued against (2026-10-14).
 *
 * Staff enter amounts only; which holder's seats went unissued is not recorded
 * (owner, 2026-10-28). Open only once the outbound date has passed and a penalty
 * is called for — beyond SV's 10%, or any unissued seat on another airline — to
 * Head Office on any booking and a branch on its own. Checked again here under a
 * row lock, since the page's view of it can be stale.
 */
export async function savePenalties(formData: FormData): Promise<SaveTicketingResult> {
  const user = await requireUser();
  const pnrId = str(formData, 'pnr_id');
  if (!pnrId) return { ok: false, error: 'Missing PNR ID.' };

  const owner = await prisma.pnr.findUnique({ where: { id: pnrId }, select: { branchId: true } });
  if (!owner) return { ok: false, error: 'Booking not found.' };
  if (!canEditPnr(user, owner.branchId, false)) {
    return { ok: false, error: 'You can only enter penalties on your own branch\u2019s bookings.' };
  }

  const licenses = await prisma.license.findMany({ select: { id: true, name: true, code: true } });
  const licenseLabel = new Map(licenses.map((l) => [l.id, lookupLabel(l) ?? l.name]));
  const today = todayIsoInPkt();

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`select id from pnrs where id = ${pnrId}::uuid for update`;
    const pnr = await tx.pnr.findUnique({
      where: { id: pnrId },
      select: {
        status: true,
        seats: true,
        outboundDate: true,
        airline: { select: { code: true } },
        ticketing: true,
        splits: { select: { seats: true, ticketsIssued: true, balanceTickets: true, ticketIssuanceDeadline: true, outboundDate: true } },
        agentAssignments: {
          where: { releasedAt: null },
          select: { id: true, seats: true, releasedAt: true, penaltyAmount: true, penaltyLicenseId: true, agent: { select: { name: true } } },
        },
      },
    });
    if (!pnr) return { ok: false, error: 'Booking not found.' } as const;
    if (!pnr.ticketing) return { ok: false, error: 'This booking has no ticketing record yet; add its ticket issuance deadline under Ticketing first.' } as const;

    // The whole booking, its own seats and every split (Phase 9 Step 6).
    const parts = ticketParts(
      {
        seats: pnr.seats,
        ticketsIssued: pnr.ticketing.ticketsIssued,
        balanceTickets: pnr.ticketing.balanceTickets,
        ticketIssuanceDeadline: isoOrNull(pnr.ticketing.ticketIssuanceDeadline),
        outboundDate: isoOrNull(pnr.outboundDate),
      },
      pnr.splits.map((x) => ({ ...x, ticketIssuanceDeadline: isoOrNull(x.ticketIssuanceDeadline), outboundDate: isoOrNull(x.outboundDate)! }))
    );
    const unissued = unissuedAcross({
      airlineCode: pnr.airline?.code ?? null,
      seats: pnr.seats,
      parts,
      todayIso: today,
      pnrStatus: pnr.status,
    });
    // Open after departure when unissued seats call for one (Step 4), and on a
    // cancelled booking from the moment it is cancelled (Step 5).
    if (pnr.status !== 'cancelled' && !penaltyEntryOpen({ outboundDate: lastOutbound(parts), todayIso: today, unissued })) {
      return {
        ok: false,
        error: 'A penalty can be entered only after the outbound date, when the unissued seats are beyond SV\u2019s 10% or any are unissued on another airline, or on a cancelled booking.',
      } as const;
    }

    const read = (label: string, amountKey: string, licenseKey: string) => {
      const licenseId = str(formData, licenseKey);
      if (licenseId && !licenseLabel.has(licenseId)) return { error: `${label}: that license does not exist.` };
      return validatePenalty(label, numVal(formData, amountKey), licenseId);
    };
    const money = (v: { toString(): string } | null) => (v === null ? null : Number(v.toString()).toFixed(2));
    const logs: { tableName: string; recordId: string; fieldName: string; oldValue: string; newValue: string; changedBy: string }[] = [];
    const log = (tableName: string, recordId: string, fieldName: string, oldValue: string | null, newValue: string | null) => {
      if (oldValue !== newValue) {
        logs.push({ tableName, recordId, fieldName, oldValue: oldValue ?? '(empty)', newValue: newValue ?? '(empty)', changedBy: user.id });
      }
    };

    const assignmentUpdates: { id: string; amount: number | null; licenseId: string | null }[] = [];
    for (const a of pnr.agentAssignments) {
      const v = read(a.agent.name, `penalty_${a.id}`, `penalty_license_${a.id}`);
      if ('error' in v) return { ok: false, error: v.error } as const;
      const before = money(a.penaltyAmount);
      const after = v.amount === null ? null : v.amount.toFixed(2);
      if (before === after && a.penaltyLicenseId === v.licenseId) continue;
      assignmentUpdates.push({ id: a.id, amount: v.amount, licenseId: v.licenseId });
      log('agent_assignments', a.id, 'penaltyAmount', before, after);
      log('agent_assignments', a.id, 'penaltyLicense',
        a.penaltyLicenseId ? licenseLabel.get(a.penaltyLicenseId) ?? a.penaltyLicenseId : null,
        v.licenseId ? licenseLabel.get(v.licenseId)! : null);
    }

    const company = read('Company', 'company_penalty', 'company_penalty_license');
    if ('error' in company) return { ok: false, error: company.error } as const;
    const companyBefore = money(pnr.ticketing.companyPenaltyAmount);
    const companyAfter = company.amount === null ? null : company.amount.toFixed(2);
    const companyChanged = companyBefore !== companyAfter || pnr.ticketing.penaltyLicenseId !== company.licenseId;
    // The company's penalty is for its own seats; with none left, only clearing it is allowed.
    const companySeats = pnr.seats - liveAgentSeats(pnr.agentAssignments);
    if (companyChanged && company.amount !== null && companySeats <= 0) {
      return { ok: false, error: 'Every seat on this booking is held by an agent, so there is no company penalty to enter.' } as const;
    }
    if (companyChanged) {
      log('ticketing', pnrId, 'companyPenaltyAmount', companyBefore, companyAfter);
      log('ticketing', pnrId, 'penaltyLicense',
        pnr.ticketing.penaltyLicenseId ? licenseLabel.get(pnr.ticketing.penaltyLicenseId) ?? pnr.ticketing.penaltyLicenseId : null,
        company.licenseId ? licenseLabel.get(company.licenseId)! : null);
    }

    if (assignmentUpdates.length === 0 && !companyChanged) return { ok: true, unchanged: true } as const;

    for (const u of assignmentUpdates) {
      await tx.agentAssignment.update({ where: { id: u.id }, data: { penaltyAmount: u.amount, penaltyLicenseId: u.licenseId } });
    }
    if (companyChanged) {
      await tx.ticketing.update({
        where: { pnrId },
        data: { companyPenaltyAmount: company.amount, penaltyLicenseId: company.licenseId },
      });
    }
    await tx.activityLog.createMany({ data: logs });
    return { ok: true } as const;
  }, { timeout: TX_TIMEOUT_MS });

  if (result.ok) {
    revalidatePath(`/pnrs/${pnrId}`);
    revalidatePath('/agents');
  }
  return result;
}
