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
import { suggestEmdPlan, emd2DaysBeforeDeparture, clampEmd2Deadline } from '@/lib/emd';
import { diffInDays } from '@/lib/urgency';
import { unallocatedSeats, validateSplit } from '@/lib/seats';
import { str, dateVal, numVal } from '@/lib/form';
import { requireUser, requireHeadOffice, requirePnrEditor, TX_TIMEOUT_MS } from '@/lib/server/guards';

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
  const investorCompany = str(formData, 'investor_company');
  const pnrCode = str(formData, 'pnr');
  const seats = numVal(formData, 'seats');
  const fare = numVal(formData, 'fare');

  if (!requestDate || !investorCompany || !pnrCode || seats === null || Number.isNaN(seats) || fare === null || Number.isNaN(fare)) {
    return { error: 'Request date, investor company, PNR, seats and fare are required.' };
  }

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

  const roundPct = numVal(formData, 'round_payment_pct');
  const roundAmount = numVal(formData, 'round_emd_amount');
  const roundDeadline = dateVal(formData, 'round_deadline_date');
  const roundTouched = roundPct !== null || roundAmount !== null || roundDeadline !== null;
  const emdNumber = str(formData, 'round_emd_number');

  if (roundTouched) {
    if (!roundDeadline || roundPct === null || Number.isNaN(roundPct) || roundAmount === null || Number.isNaN(roundAmount)) {
      return {
        error:
          'The EMD round is incomplete. For new bookings the EMD time limit (deadline date), payment %, and amount are all required.',
      };
    }
    if (!emdNumber) {
      return { error: 'EMD Number is required.' };
    }
    if (!/^\d{3} \d{10}$/.test(emdNumber)) {
      return { error: 'EMD Number must be exactly 13 digits with a space after the first three numbers (e.g. 123 4567890123).' };
    }
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

  const suggestion = suggestEmdPlan({
    airlineCode,
    segment: str(formData, 'segment'),
    requestDateIso: requestDate.toISOString().slice(0, 10),
    outboundDateIso: outboundDate ? outboundDate.toISOString().slice(0, 10) : null,
  });

  let emd2: { pct: number; amount: number; deadlineDate: Date } | null = null;
  if (roundTouched && suggestion.applicable && suggestion.emd2Pct !== null && outboundDate && fare && seats) {
    const offset = emd2DaysBeforeDeparture(
      diffInDays(requestDate.toISOString().slice(0, 10), outboundDate.toISOString().slice(0, 10))
    );
    if (offset !== null) {
      const [y, m, d] = outboundDate.toISOString().slice(0, 10).split('-').map(Number);
      const policyIso = new Date(Date.UTC(y, m - 1, d - offset)).toISOString().slice(0, 10);
      // EMD-2 counts back from departure while EMD-1 counts forward from today,
      // so on a short-notice booking the two cross and round 2 would fall due
      // before round 1 (owner ruling, 2026-09-07).
      const emd2Iso = clampEmd2Deadline(
        policyIso,
        roundDeadline ? roundDeadline.toISOString().slice(0, 10) : null
      );
      emd2 = {
        pct: suggestion.emd2Pct,
        amount: fare * seats * (suggestion.emd2Pct / 100),
        deadlineDate: new Date(`${emd2Iso}T00:00:00.000Z`),
      };
    }
  }

  const createdBy = user.id;
  const deadlineTime = str(formData, 'round_deadline_time')
    ? new Date(`1970-01-01T${str(formData, 'round_deadline_time')}:00.000Z`)
    : null;

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
        segment: str(formData, 'segment'),
        airlineId,
        seats,
        outboundDate,
        inboundDate: dateVal(formData, 'inbound_date'),
        sector: str(formData, 'sector'),
        // The PNR TL starts as EMD-1's deadline (owner rule, 2026-09-07); it
        // only falls back to the typed value when no round is being created.
        pnrTlDate: roundTouched ? roundDeadline : dateVal(formData, 'pnr_tl_date'),
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

    if (roundTouched) {
      const round = await tx.emdRound.create({
        data: {
          pnrId: pnr.id,
          roundNumber: 1,
          issuanceDate: new Date(),
          issuanceTime: new Date(),
          paymentPct: roundPct!,
          emdNumber,
          emdAmount: roundAmount!,
          deadlineDate: roundDeadline,
          deadlineTime,
          status: 'issued',
          licenseId: str(formData, 'round_license_id') || str(formData, 'license_id') || null,
        },
      });

      await tx.activityLog.create({
        data: {
          tableName: 'emd_rounds',
          recordId: round.id,
          fieldName: null,
          oldValue: null,
          newValue: 'round 1 created',
          changedBy: createdBy,
        },
      });

      if (emd2) {
        const round2 = await tx.emdRound.create({
          data: {
            pnrId: pnr.id,
            roundNumber: 2,
            issuanceDate: new Date(), // Issued at the same time as R1 for the schedule
            issuanceTime: new Date(),
            paymentPct: emd2.pct,
            emdAmount: emd2.amount,
            deadlineDate: emd2.deadlineDate,
            status: 'issued',
          },
        });

        await tx.activityLog.create({
          data: {
            tableName: 'emd_rounds',
            recordId: round2.id,
            fieldName: null,
            oldValue: null,
            newValue: 'round 2 created (auto)',
            changedBy: createdBy,
          },
        });
      }

      // No syncPnrTlDate call here: pnrTlDate was just set to round 1's deadline
      // and round 1 is the earliest outstanding round, so the rule already holds.
      // Skipping it keeps this transaction short (see the timeout note below).
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
  const investorCompany = str(formData, 'investor_company');
  const pnrCode = str(formData, 'pnr');
  const seats = numVal(formData, 'seats');
  const fare = numVal(formData, 'fare');

  if (!requestDate || !investorCompany || !pnrCode || seats === null || Number.isNaN(seats) || fare === null || Number.isNaN(fare)) {
    return { error: 'Request date, investor company, PNR, seats and fare are required.' };
  }

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
    segment: str(formData, 'segment'),
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

  const newInvestorCompany = str(formData, 'new_investor_company');
  if (!newInvestorCompany) return { error: 'Investor company for the child PNR is required.' };

  const seatsToAllocate = numVal(formData, 'seats_to_allocate');
  if (seatsToAllocate === null) {
    return { error: 'Seats to allocate must be a positive whole number.' };
  }

  // Fetch parent with its rounds and existing allocations
  const parent = await prisma.pnr.findUnique({
    where: { id: parentPnrId },
    include: {
      emdRounds: { orderBy: { roundNumber: 'asc' } },
    },
  });
  if (!parent) return { error: 'Parent PNR not found.' };

  // Seat maths lives in src/lib/seats.ts (unit-tested): a PNR's `seats` is what
  // it still holds, so it IS the unallocated count. Subtracting `allocations` on
  // top double-counted every past split.
  const remaining = unallocatedSeats(parent);
  const seatsError = validateSplit(remaining, seatsToAllocate);
  if (seatsError) return { error: seatsError };

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
    const emd1IsPaid = emd1 && (emd1.status === 'paid' || emd1.status === 'refund_requested' || emd1.status === 'refunded');

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
