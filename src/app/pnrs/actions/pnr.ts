'use server';

/**
 * Server actions that write to the `pnrs` table: creating a booking, editing
 * one, and splitting seats off to a child booking.
 *
 * Split out of a single 1,063-line `actions.ts` on 2026-09-07, which mixed
 * bookings, EMD rounds, refunds and email in one file.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { isHeadOffice } from '@/lib/auth';
import { balanceTicketsFor, svTicketIssuanceDeadline } from '@/lib/ticketing';
import { unallocatedSeats, validateSplit } from '@/lib/seats';
import { liveAgentSeats, seatLedger, validateSeatsChange } from '@/lib/inventory';
import {
  COMPANY_INVESTMENT,
  normalizeSegment,
  pnrCodeKey,
  validatePnrCode,
  validateSegment,
} from '@/lib/booking-entry';
import { str, dateVal, numVal } from '@/lib/form';
import { requireUser, requireHeadOffice, requirePnrEditor, TX_TIMEOUT_MS } from '@/lib/server/guards';

/**
 * Finds a booking with this PNR code, ignoring case and spacing.
 *
 * A PNR code identifies exactly one booking (owner ruling, 2026-09-20). It is an
 * application check rather than a unique index because the imported rows stay in
 * place while the owner still reads them; `src/lib/booking-entry.ts` records the
 * index to add once they are cleared.
 *
 * `exceptId` is the booking being edited, which must not count as its own
 * duplicate.
 */
async function findPnrByCode(code: string, exceptId?: string) {
  const key = pnrCodeKey(code);
  const candidates = await prisma.pnr.findMany({
    where: { pnr: { equals: code.trim(), mode: 'insensitive' } },
    select: { id: true, pnr: true, srNo: true },
  });
  return candidates.find((c) => c.id !== exceptId && pnrCodeKey(c.pnr) === key) ?? null;
}

export async function createPnr(formData: FormData) {
  const user = await requireUser();

  // ---------------------------------------------------------------------
  // 1. VALIDATE EVERYTHING FIRST.
  // Nothing below this block writes. The previous version created the PNR and
  // its activity-log row before checking the EMD number, so a rejected
  // submission still left a booking behind — the staff member saw an error,
  // assumed nothing was saved, and a half-finished PNR stayed in the system.
  // ---------------------------------------------------------------------
  const requestDate = dateVal(formData, 'request_date');
  const pnrCode = str(formData, 'pnr');
  const seats = numVal(formData, 'seats');
  const fare = numVal(formData, 'fare');

  if (!requestDate || !pnrCode || seats === null || Number.isNaN(seats) || fare === null || Number.isNaN(fare)) {
    return { error: 'Request date, PNR, seats and fare are required.' };
  }

  // Every booking is bought on company investment and stays there until seats
  // are handed to an agent or put on sale through the bot (owner ruling,
  // 2026-09-20). Staff no longer type this: who holds the seats is the seat
  // ledger's answer, not free text that can disagree with it.
  const investorCompany = COMPANY_INVESTMENT;

  const codeError = validatePnrCode(pnrCode);
  if (codeError) return { error: codeError.error };

  // A PNR code identifies one booking. Duplicates used to be allowed with a
  // warning because the imported sheet contained them; the re-entered data will
  // not (owner ruling, 2026-09-20). Case- and space-insensitive, because an
  // airline reference is a code, not a phrase.
  const duplicate = await findPnrByCode(pnrCode);
  if (duplicate) {
    return {
      error: `PNR ${duplicate.pnr} already exists (SR#${duplicate.srNo}). A booking cannot be entered twice.`,
    };
  }

  const segmentInput = str(formData, 'segment');
  const segmentError = validateSegment(segmentInput);
  if (segmentError) return { error: segmentError.error };
  const segment = normalizeSegment(segmentInput);

  // Branch users: force branchId to their own branch. An unresolved branch must
  // block creation — writing an unscoped PNR would leave a record no branch user
  // can see and every branch user could edit.
  if (!isHeadOffice(user) && !user.branchId) {
    return {
      error:
        'Your account is not linked to a branch that exists in the system, so it cannot create bookings. Ask Head Office to correct the branch on your account.',
    };
  }
  const branchId = isHeadOffice(user) ? str(formData, 'branch_id') : user.branchId;

  // The booking carries the DEADLINE to issue the first EMD, not the EMD itself
  // (owner ruling, 2026-09-21). It is stored as `pnr_tl_date` — the time limit
  // the PNR rests with us — and issuing against it is Head Office's job.
  const firstEmdDeadline = dateVal(formData, 'pnr_tl_date');
  if (!firstEmdDeadline) {
    return {
      error:
        'The date the first EMD must be issued by is required. For SV Umrah bookings it is filled in from the airline\u2019s policy; otherwise enter the airline\u2019s own deadline.',
    };
  }

  // ---------------------------------------------------------------------
  // 2. Read-only lookups for the auto EMD-2 policy (outside the transaction).
  // ---------------------------------------------------------------------
  const outboundDate = dateVal(formData, 'outbound_date');
  const airlineId = str(formData, 'airline_id');
  let airlineCode: string | null = null;
  if (airlineId) {
    const airline = await prisma.airline.findUnique({ where: { id: airlineId } });
    if (airline) airlineCode = airline.code;
  }

  // SV's ticket-issuance policy date (null for every other airline, and whenever
  // the outbound date is unknown).
  const svIssuanceDeadline = svTicketIssuanceDeadline(
    airlineCode,
    outboundDate ? outboundDate.toISOString().slice(0, 10) : null
  );

  const createdBy = user.id;

  // ---------------------------------------------------------------------
  // 3. ONE transaction: the booking, its rounds and every log entry commit
  //    together, or nothing does.
  // ---------------------------------------------------------------------
  const created = await prisma.$transaction(async (tx) => {
    const pnr = await tx.pnr.create({
      data: {
        requestDate,
        investorCompany,
        licenseId: str(formData, 'license_id'),
        branchId,
        pnr: pnrCode,
        gdsPnr: str(formData, 'gds_pnr'),
        segment,
        airlineId,
        seats,
        outboundDate,
        inboundDate: dateVal(formData, 'inbound_date'),
        sector: str(formData, 'sector'),
        // The PNR TL IS the deadline to issue the first EMD until one exists
        // (owner rule 2026-09-07, restated 2026-09-21). `syncPnrTlDate` moves it
        // on to the next outstanding round as rounds are issued.
        pnrTlDate: firstEmdDeadline,
        dealPct: numVal(formData, 'deal_pct'),
        issuedStatus: str(formData, 'issued_status') ?? 'unissued',
        airlineTaxes: numVal(formData, 'airline_taxes'),
        psf: numVal(formData, 'psf'),
        fare,
        status: str(formData, 'status') ?? 'active',
        rawAirlineText: str(formData, 'raw_airline_text'),
        createdBy,
      },
    });

    await tx.activityLog.create({
      data: {
        tableName: 'pnrs',
        recordId: pnr.id,
        fieldName: null,
        oldValue: null,
        newValue: 'record created',
        changedBy: createdBy,
      },
    });

    // NO EMD round is created here (owner ruling, 2026-09-21). Issuing an EMD is
    // Head Office's job and happens from the booking page or the bulk issuance
    // screen; a branch creating a booking must not be able to issue one as a
    // side effect of the form. What the booking carries is the DEADLINE by which
    // the first EMD must be issued — `pnr_tl_date`, set above.

    // Saudia issues tickets no later than 72 hours before departure (owner
    // ruling, 2026-09-17), so a new SV booking starts with that deadline already
    // recorded — editable like every other policy default. Without writing it
    // here the daily alert could never warn about a booking nobody had opened.
    // Other airlines have no stored policy; staff enter the date themselves.
    if (svIssuanceDeadline) {
      await tx.ticketing.create({
        data: {
          pnrId: pnr.id,
          ticketIssuanceDeadline: new Date(`${svIssuanceDeadline}T00:00:00.000Z`),
        },
      });
      await tx.activityLog.create({
        data: {
          tableName: 'ticketing',
          recordId: pnr.id,
          fieldName: 'ticketIssuanceDeadline',
          oldValue: null,
          newValue: svIssuanceDeadline,
          changedBy: createdBy,
        },
      });
    }

    return pnr;
  }, { timeout: TX_TIMEOUT_MS });

  revalidatePath('/');
  // redirect() throws internally, so it must stay OUTSIDE the transaction —
  // inside, it would abort and roll back the booking that was just created.
  redirect(`/pnrs/${created.id}`);
}

export async function updatePnr(formData: FormData) {
  const id = str(formData, 'id');
  if (!id) return { error: 'Missing booking id.' };

  // Use requirePnrEditor to check branch scoping + EMD lock
  const { authUser } = await requirePnrEditor(id);

  const existing = await prisma.pnr.findUnique({ where: { id } });
  if (!existing) return { error: 'Booking not found.' };

  const requestDate = dateVal(formData, 'request_date');
  const pnrCode = str(formData, 'pnr');
  const seats = numVal(formData, 'seats');
  const fare = numVal(formData, 'fare');

  if (!requestDate || !pnrCode || seats === null || Number.isNaN(seats) || fare === null || Number.isNaN(fare)) {
    return { error: 'Request date, PNR, seats and fare are required.' };
  }

  // The investor text is NEVER rewritten by an edit. New bookings are stamped
  // 'COMPANY INVESTMENT' and staff no longer type this field, but the imported
  // rows carry the name the sheet recorded and the owner keeps them to read —
  // overwriting that on every save would erase exactly what they are kept for.
  const investorCompany = existing.investorCompany;

  const codeError = validatePnrCode(pnrCode);
  if (codeError) return { error: codeError.error };

  // Duplicate check excludes THIS booking: re-saving a booking without changing
  // its code must not report the booking as a duplicate of itself.
  const duplicate = await findPnrByCode(pnrCode, id);
  if (duplicate) {
    return {
      error: `PNR ${duplicate.pnr} already exists (SR#${duplicate.srNo}). A booking cannot be entered twice.`,
    };
  }

  // A legacy booking may carry a segment outside the fixed list. Editing such a
  // booking must not be blocked by a value someone else typed years ago, so an
  // unchanged segment is left exactly as it is; only a CHANGED one is validated.
  const segmentInput = str(formData, 'segment');
  const segmentChanged = (segmentInput ?? null) !== (existing.segment ?? null);
  if (segmentChanged) {
    const segmentError = validateSegment(segmentInput);
    if (segmentError) return { error: segmentError.error };
  }
  const segment = segmentChanged ? normalizeSegment(segmentInput) : existing.segment;

  // Tickets issued can never exceed the seats on the booking (owner rule,
  // 2026-09-19), so seats cannot be edited down below what has already been
  // ticketed — that would break the rule from the other side and leave a stored
  // balance that no longer matches.
  const ticketing = await prisma.ticketing.findUnique({ where: { pnrId: id } });
  if (ticketing?.ticketsIssued != null && seats < ticketing.ticketsIssued) {
    return {
      error: `This booking already has ${ticketing.ticketsIssued} tickets issued, so it cannot be reduced to ${seats} seats.`,
    };
  }

  // Nor below what the selling side has already committed: seats held by agents
  // (and, from phase 8, put on sale) cannot vanish from under them.
  const liveAssignments = await prisma.agentAssignment.findMany({
    where: { pnrId: id, releasedAt: null },
    select: { seats: true },
  });
  const seatsError = validateSeatsChange(seats, {
    agentSeats: liveAgentSeats(liveAssignments),
  });
  if (seatsError) return { error: seatsError };

  // Head office may reassign the branch; a branch user may not. Preserve the
  // PNR's existing branch rather than stamping the user's primary row onto it —
  // otherwise editing a booking would silently move it between the duplicate
  // case-variant rows of the same real branch.
  const branchId = isHeadOffice(authUser) ? str(formData, 'branch_id') : existing.branchId;

  const next = {
    requestDate,
    investorCompany,
    licenseId: str(formData, 'license_id'),
    branchId,
    pnr: pnrCode,
    gdsPnr: str(formData, 'gds_pnr'),
    segment,
    airlineId: str(formData, 'airline_id'),
    seats,
    outboundDate: dateVal(formData, 'outbound_date'),
    inboundDate: dateVal(formData, 'inbound_date'),
    sector: str(formData, 'sector'),
    pnrTlDate: dateVal(formData, 'pnr_tl_date'),
    dealPct: numVal(formData, 'deal_pct'),
    issuedStatus: str(formData, 'issued_status') ?? 'unissued',
    airlineTaxes: numVal(formData, 'airline_taxes'),
    psf: numVal(formData, 'psf'),
    fare,
    status: str(formData, 'status') ?? 'active',
  };

  const changes: { fieldName: string; oldValue: string; newValue: string }[] = [];
  for (const [field, value] of Object.entries(next)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const before = (existing as any)[field];
    const beforeStr =
      before instanceof Date ? before.toISOString().slice(0, 10) : before === null || before === undefined ? null : String(before);
    const afterStr =
      value instanceof Date ? value.toISOString().slice(0, 10) : value === null || value === undefined ? null : String(value);
    if (beforeStr !== afterStr) {
      changes.push({ fieldName: field, oldValue: beforeStr ?? '(empty)', newValue: afterStr ?? '(empty)' });
    }
  }

  // One transaction: the edit and its change history commit together, or
  // neither does. These were two separate statements, so a failure between them
  // left the booking changed with no record of who changed what — and
  // data-model.md requires every write to `pnrs` to write to activity_log.
  // createPnr, createEmdRound and recordEmdRefund were made transactional on
  // 2026-09-07; updatePnr was missed, and it is the most-used write path here.
  await prisma.$transaction(async (tx) => {
    await tx.pnr.update({ where: { id }, data: next });

    // Balance tickets is seats − issued, so changing the seats changes it too.
    // Recomputed here rather than left stale, and logged like any other write to
    // `ticketing`.
    if (ticketing?.ticketsIssued != null && seats !== existing.seats) {
      const newBalance = balanceTicketsFor(seats, ticketing.ticketsIssued);
      if (newBalance !== ticketing.balanceTickets) {
        await tx.ticketing.update({ where: { pnrId: id }, data: { balanceTickets: newBalance } });
        await tx.activityLog.create({
          data: {
            tableName: 'ticketing',
            recordId: id,
            fieldName: 'balanceTickets',
            oldValue: ticketing.balanceTickets === null ? '(empty)' : String(ticketing.balanceTickets),
            newValue: newBalance === null ? '(empty)' : String(newBalance),
            changedBy: authUser.id,
          },
        });
      }
    }

    if (changes.length > 0) {
      await tx.activityLog.createMany({
        data: changes.map((c) => ({
          tableName: 'pnrs',
          recordId: id,
          fieldName: c.fieldName,
          oldValue: c.oldValue,
          newValue: c.newValue,
          changedBy: authUser.id,
        })),
      });
    }
  }, { timeout: TX_TIMEOUT_MS });

  revalidatePath('/');
  revalidatePath(`/pnrs/${id}`);
  redirect(`/pnrs/${id}`);
}

export async function splitPnr(formData: FormData) {
  const user = await requireHeadOffice();

  const parentPnrId = str(formData, 'parent_pnr_id');
  if (!parentPnrId) return { error: 'Missing parent PNR ID.' };

  const childPnrCode = str(formData, 'child_pnr_code');
  if (!childPnrCode) return { error: 'A child PNR code from the airline is required.' };

  // The airline issues a NEW code for the child (docs/decisions.md, 2026-09-01),
  // so it is a new booking and the uniqueness rule applies to it as well.
  const childCodeError = validatePnrCode(childPnrCode);
  if (childCodeError) return { error: childCodeError.error };
  const childDuplicate = await findPnrByCode(childPnrCode);
  if (childDuplicate) {
    return {
      error: `PNR ${childDuplicate.pnr} already exists (SR#${childDuplicate.srNo}). The child booking needs the new code the airline issued.`,
    };
  }

  // A child booking is company investment like any other, until its seats are
  // handed to an agent or put on sale (owner ruling, 2026-09-20). It is no
  // longer typed at split time: assign the child on its own page afterwards.
  const newInvestorCompany = COMPANY_INVESTMENT;

  const seatsToAllocate = numVal(formData, 'seats_to_allocate');
  if (seatsToAllocate === null) {
    return { error: 'Seats to allocate must be a positive whole number.' };
  }

  // Fetch parent with its rounds and existing allocations
  const parent = await prisma.pnr.findUnique({
    where: { id: parentPnrId },
    include: {
      emdRounds: { orderBy: { roundNumber: 'asc' } },
      agentAssignments: { where: { releasedAt: null } },
    },
  });
  if (!parent) return { error: 'Parent PNR not found.' };

  // Seat maths lives in src/lib/seats.ts (unit-tested): a PNR's `seats` is what
  // it still holds, so it IS the unallocated count. Subtracting `allocations` on
  // top double-counted every past split.
  //
  // From phase 6 a split may only take seats nobody is selling yet: seats an
  // agent holds cannot be moved to a different PNR behind their back. The ledger
  // decides what is free (docs/business-rules.md, "Selling side").
  const ledger = seatLedger({ seats: unallocatedSeats(parent), assignments: parent.agentAssignments });
  const seatsError = validateSplit(ledger.unassigned, seatsToAllocate);
  if (seatsError) {
    return {
      error:
        ledger.agentSeats > 0
          ? `${seatsError} ${ledger.agentSeats} seat${ledger.agentSeats === 1 ? ' is' : 's are'} held by agents and cannot be split away — release them first.`
          : seatsError,
    };
  }

  const parentFare = Number(parent.fare);
  const parentRemainingSeats = parent.seats - seatsToAllocate;
  const childOutboundDate = dateVal(formData, 'child_outbound_date');
  const childInboundDate = dateVal(formData, 'child_inbound_date');

  // Use a transaction for atomicity
  const result = await prisma.$transaction(async (tx) => {
    // 1. Create the child PNR — inherits flight details, gets new investor and PNR code
    const child = await tx.pnr.create({
      data: {
        requestDate: parent.requestDate,
        investorCompany: newInvestorCompany,
        licenseId: parent.licenseId,
        branchId: parent.branchId,
        parentPnrId: parent.id,
        pnr: childPnrCode,
        gdsPnr: null,
        segment: parent.segment,
        airlineId: parent.airlineId,
        seats: seatsToAllocate,
        outboundDate: childOutboundDate ?? parent.outboundDate,
        inboundDate: childInboundDate ?? parent.inboundDate,
        sector: parent.sector,
        pnrTlDate: parent.pnrTlDate,
        dealPct: parent.dealPct,
        issuedStatus: 'unissued',
        airlineTaxes: parent.airlineTaxes,
        psf: parent.psf,
        fare: parent.fare,
        status: 'active',
        createdBy: user.id,
      },
    });

    // 2. Create the allocation record
    await tx.allocation.create({
      data: {
        parentPnrId: parent.id,
        childPnrId: child.id,
        seatsAllocated: seatsToAllocate,
      },
    });

    // 3. Update parent seats to reflect remaining
    await tx.pnr.update({
      where: { id: parent.id },
      data: { seats: parentRemainingSeats },
    });

    // 4. Handle EMD rounds based on whether EMD-1 was already paid
    const parentRounds = parent.emdRounds;
    const emd1 = parentRounds.find((r) => r.roundNumber === 1);
    // Settled = the airline gave it back. With two statuses, that is `refunded`.
    const emd1IsPaid = emd1 && emd1.status === 'refunded';

    if (emd1IsPaid) {
      // Scenario 1: EMD-1 already paid — parent and child share the original EMD-1.
      // Only EMD-2 gets recalculated proportionally based on new seat counts.
      const emd2 = parentRounds.find((r) => r.roundNumber === 2);
      if (emd2) {
        // Recalculate parent EMD-2 for reduced seats
        const parentEmd2Amount = parentFare * parentRemainingSeats * (Number(emd2.paymentPct) / 100);
        await tx.emdRound.update({
          where: { id: emd2.id },
          data: { emdAmount: parentEmd2Amount },
        });

        // Create child EMD-2 proportional to child seats
        const childEmd2Amount = parentFare * seatsToAllocate * (Number(emd2.paymentPct) / 100);
        await tx.emdRound.create({
          data: {
            pnrId: child.id,
            roundNumber: 2,
            issuanceDate: emd2.issuanceDate,
            paymentPct: emd2.paymentPct,
            emdAmount: childEmd2Amount,
            deadlineDate: emd2.deadlineDate,
            deadlineTime: emd2.deadlineTime,
            status: emd2.status,
          },
        });
      }
    } else {
      // Scenario 2: No EMD paid yet — recalculate all rounds for both parent and child
      for (const round of parentRounds) {
        // Recalculate parent round amount for reduced seats
        const parentRoundAmount = parentFare * parentRemainingSeats * (Number(round.paymentPct) / 100);
        await tx.emdRound.update({
          where: { id: round.id },
          data: { emdAmount: parentRoundAmount },
        });

        // Create matching child round proportional to child seats
        const childRoundAmount = parentFare * seatsToAllocate * (Number(round.paymentPct) / 100);
        await tx.emdRound.create({
          data: {
            pnrId: child.id,
            roundNumber: round.roundNumber,
            issuanceDate: round.issuanceDate,
            paymentPct: round.paymentPct,
            emdAmount: childRoundAmount,
            deadlineDate: round.deadlineDate,
            deadlineTime: round.deadlineTime,
            status: round.status,
          },
        });
      }
    }

    // 5. Activity log on parent
    await tx.activityLog.create({
      data: {
        tableName: 'pnrs',
        recordId: parent.id,
        fieldName: 'split',
        oldValue: `${parent.seats} seats`,
        newValue: `${seatsToAllocate} seats → ${childPnrCode} (${newInvestorCompany})`,
        changedBy: user.id,
      },
    });

    // 6. Activity log on child
    await tx.activityLog.create({
      data: {
        tableName: 'pnrs',
        recordId: child.id,
        fieldName: null,
        oldValue: null,
        newValue: `record created (split from ${parent.pnr})`,
        changedBy: user.id,
      },
    });

    return child;
  });

  revalidatePath('/');
  revalidatePath(`/pnrs/${parentPnrId}`);
  redirect(`/pnrs/${result.id}`);
}
