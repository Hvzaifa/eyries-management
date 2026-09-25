'use server';

/**
 * Server action for the ticketing stage (Phase 5 Step 1).
 *
 * Head Office only, matching how EMD rounds, refunds and splits are already
 * restricted (docs/decisions.md, 2026-09-07 "Authorization Overhaul"): ticketing
 * is the stage where the money finally moves, and a branch account is locked out
 * of a booking as soon as any EMD round exists — which is true of every booking
 * that ever reaches ticketing.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { str, dateVal, numVal } from '@/lib/form';
import { requireHeadOffice, TX_TIMEOUT_MS } from '@/lib/server/guards';
import { balanceTicketsFor, validateTicketing } from '@/lib/ticketing';

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
  const user = await requireHeadOffice();

  const pnrId = str(formData, 'pnr_id');
  if (!pnrId) return { ok: false, error: 'Missing PNR ID.' };

  const pnr = await prisma.pnr.findUnique({ where: { id: pnrId } });
  if (!pnr) return { ok: false, error: 'Booking not found.' };

  const ticketsIssued = numVal(formData, 'tickets_issued');

  const next = {
    nameUpdateDeadline: dateVal(formData, 'name_update_deadline'),
    ticketIssuanceDeadline: dateVal(formData, 'ticket_issuance_deadline'),
    status: str(formData, 'ticketing_status'),
    ticketsIssued,
    // Derived from the seats, never read from the form (owner rule, 2026-09-19:
    // issued + balance ARE the seats). The form renders it read-only, but the
    // browser is not the authority — the server computes it either way.
    balanceTickets: balanceTicketsFor(pnr.seats, ticketsIssued),
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
    pnr.seats
  );
  if (invalid) return { ok: false, error: invalid.error };

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
