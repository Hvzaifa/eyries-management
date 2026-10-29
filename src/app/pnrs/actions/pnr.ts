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
import { canEditPnr, isHeadOffice } from '@/lib/auth';
import { formStatusChange, releaseBlocker } from '@/lib/release';
import { balanceTicketsFor, ticketDeadlineError } from '@/lib/ticketing';
import { liveAgentSeats, validateSeatsChange } from '@/lib/inventory';
import {
  COMPANY_INVESTMENT,
  enteredInApp,
  normalizeSegment,
  pnrCodeKey,
  validatePnrCode,
  validateSegment,
} from '@/lib/booking-entry';
import { str, dateVal, numVal } from '@/lib/form';
import { splitSeats } from '@/lib/splits';
import {
  FLIGHT_TIME_COLUMNS,
  dateFromDb,
  describeStops,
  flightColumns,
  flightStopRows,
  readFlightDetails,
  timeFromDb,
} from '@/lib/flight-details';
import { requireUser, requirePnrEditor, TX_TIMEOUT_MS } from '@/lib/server/guards';

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

/**
 * A code already used by a split inside another booking (Phase 9 Step 6;
 * owner, 2026-10-29: split codes are unique across bookings and splits). A
 * booking's own split may not reuse the booking's code either.
 */
async function findSplitByCode(code: string, exceptPnrId?: string): Promise<string | null> {
  const split = await prisma.pnrSplit.findFirst({
    where: { pnrCode: pnrCodeKey(code) },
    select: { pnrId: true, pnr: { select: { pnr: true } } },
  });
  if (!split) return null;
  return split.pnrId === exceptPnrId
    ? `PNR ${pnrCodeKey(code)} is a split of this booking; a booking cannot take its own split's code.`
    : `PNR ${pnrCodeKey(code)} is already a split of ${split.pnr.pnr}. A booking cannot be entered twice.`;
}

/** The new-booking form: saves, then opens the booking. */
export async function createPnr(formData: FormData) {
  const saved = await saveNewPnr(formData);
  if ('error' in saved) return saved;
  // redirect() throws internally, so it must stay OUTSIDE the transaction —
  // inside, it would abort and roll back the booking that was just created.
  redirect(`/pnrs/${saved.id}`);
}

/**
 * The upload review (AI text, screenshot or spreadsheet): saves and stays, so
 * staff go on to the next draft. Using `createPnr` there redirected after the
 * first save and lost the rest of the batch (owner report, 2026-10-28).
 */
export async function createPnrAndContinue(formData: FormData): Promise<{ error: string } | { id: string; pnr: string }> {
  return saveNewPnr(formData);
}

async function saveNewPnr(formData: FormData): Promise<{ error: string } | { id: string; pnr: string }> {
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
  const splitDuplicate = await findSplitByCode(pnrCode);
  if (splitDuplicate) return { error: splitDuplicate };
  if (duplicate) {
    return {
      error: `PNR ${duplicate.pnr} already exists (SR#${duplicate.srNo}). A booking cannot be entered twice.`,
    };
  }

  const segmentInput = str(formData, 'segment');
  const segmentError = validateSegment(segmentInput);
  if (segmentError) return { error: segmentError.error };
  const segment = normalizeSegment(segmentInput);

  // Trip type and flights (owner request, 2026-09-26). A new booking needs
  // every flight time, stops included, and the date of an overnight flight
  // (Phase 9 Step 1, A4).
  const flights = readFlightDetails((key) => str(formData, key), { requireTimes: true });
  if ('error' in flights) return { error: flights.error };
  const flight = flightColumns(flights.details);

  // And a ticket issuance deadline, no later than departure (A6; owner,
  // 2026-10-20). The form pre-fills SV's policy date; staff may change it.
  const ticketIssuanceDeadline = str(formData, 'ticket_issuance_deadline');
  const ticketError = ticketDeadlineError(ticketIssuanceDeadline, flights.details.outbound.date);
  if (ticketError) return { error: ticketError };

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

  // Active or completed only: released needs the Release action and a reason,
  // and cancelled is no longer set by hand (owner, 2026-10-20).
  const statusChange = formStatusChange(null, str(formData, 'status'));
  if ('error' in statusChange) return { error: statusChange.error };

  const airlineId = str(formData, 'airline_id');
  const createdBy = user.id;

  // ---------------------------------------------------------------------
  // 2. ONE transaction: the booking, its rounds and every log entry commit
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
        ...flight,
        mealIncluded: str(formData, 'meal_included') === 'yes',
        // The PNR TL IS the deadline to issue the first EMD until one exists
        // (owner rule 2026-09-07, restated 2026-09-21). `syncPnrTlDate` moves it
        // on to the next outstanding round as rounds are issued.
        pnrTlDate: firstEmdDeadline,
        airlineTaxes: numVal(formData, 'airline_taxes'),
        // No PSF on a new booking: it is bought on company investment, and PSF
        // is charged only to agents, through their charge or discount (owner,
        // 2026-10-20).
        psf: null,
        fare,
        status: statusChange.status,
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

    const stops = flightStopRows(flights.details);
    if (stops.length > 0) {
      await tx.flightStop.createMany({ data: stops.map((st) => ({ ...st, pnrId: pnr.id })) });
    }

    // NO EMD round is created here (owner ruling, 2026-09-21). Issuing an EMD is
    // Head Office's job and happens from the booking page or the bulk issuance
    // screen; a branch creating a booking must not be able to issue one as a
    // side effect of the form. What the booking carries is the DEADLINE by which
    // the first EMD must be issued — `pnr_tl_date`, set above.

    // Every new booking starts with its ticket issuance deadline recorded (A6).
    // Until Phase 9 only SV's was, worked out here from the policy (owner
    // ruling, 2026-09-17); the form now pre-fills that date and staff confirm
    // it, or enter another airline's.
    await tx.ticketing.create({
      data: {
        pnrId: pnr.id,
        ticketIssuanceDeadline: new Date(`${ticketIssuanceDeadline}T00:00:00.000Z`),
      },
    });
    await tx.activityLog.create({
      data: {
        tableName: 'ticketing',
        recordId: pnr.id,
        fieldName: 'ticketIssuanceDeadline',
        oldValue: null,
        newValue: ticketIssuanceDeadline,
        changedBy: createdBy,
      },
    });

    return pnr;
  }, { timeout: TX_TIMEOUT_MS });

  revalidatePath('/');
  return { id: created.id, pnr: created.pnr };
}

export async function updatePnr(formData: FormData) {
  const id = str(formData, 'id');
  if (!id) return { error: 'Missing booking id.' };

  // Use requirePnrEditor to check branch scoping + EMD lock
  const { authUser } = await requirePnrEditor(id);

  const existing = await prisma.pnr.findUnique({
    where: { id },
    include: { flightStops: { orderBy: [{ leg: 'asc' }, { position: 'asc' }] } },
  });
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
  const splitDuplicate = await findSplitByCode(pnrCode, id);
  if (splitDuplicate) return { error: splitDuplicate };
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

  // A booking saved before flight details existed has only a sector and two
  // dates; the edit form pre-fills the cities from the sector and asks for the
  // rest, so every saved edit leaves a complete set. A booking entered in the
  // app keeps the rules it was entered under — every time, overnight dates —
  // on every edit; an imported one is not held to them (owner, 2026-10-20).
  const strict = enteredInApp(existing);
  const flights = readFlightDetails((key) => str(formData, key), { requireTimes: strict });
  if ('error' in flights) return { error: flights.error };

  // Tickets issued can never exceed the seats on the booking (owner rule,
  // 2026-09-19), so seats cannot be edited down below what has already been
  // ticketed — that would break the rule from the other side and leave a stored
  // balance that no longer matches.
  const ticketing = await prisma.ticketing.findUnique({ where: { pnrId: id } });
  // Seats in splits are part of the booking (Phase 9 Step 6) and the booking's
  // own ticket count covers the rest, so both must still fit.
  const splits = await prisma.pnrSplit.findMany({ where: { pnrId: id }, select: { seats: true, assignmentId: true } });
  const inSplits = splitSeats(splits);
  if (ticketing?.ticketsIssued != null && seats < ticketing.ticketsIssued + inSplits) {
    return {
      error: `This booking already has ${ticketing.ticketsIssued} tickets issued${inSplits ? ` and ${inSplits} seats in splits` : ''}, so it cannot be reduced to ${seats} seats.`,
    };
  }
  if (seats < inSplits) {
    return { error: `${inSplits} seats are in splits, so this booking cannot be reduced to ${seats} seats.` };
  }

  // Its ticket deadline may not fall after departure (owner, 2026-10-20), so
  // an earlier departure date waits until the deadline is moved under Ticketing.
  const ticketDeadline = dateFromDb(ticketing?.ticketIssuanceDeadline);
  if (strict && ticketDeadline) {
    const ticketError = ticketDeadlineError(ticketDeadline, flights.details.outbound.date);
    if (ticketError) return { error: `${ticketError} Move the deadline under Ticketing first.` };
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
  // The company's split seats must still be the company's.
  const companySplit = splitSeats(splits.filter((x) => x.assignmentId === null));
  if (seats < liveAgentSeats(liveAssignments) + companySplit) {
    return { error: `Agents hold ${liveAgentSeats(liveAssignments)} seats and ${companySplit} of the company's are in a split, so this booking cannot be reduced to ${seats} seats.` };
  }

  // Head office may reassign the branch; a branch user may not. Preserve the
  // PNR's existing branch rather than stamping the user's primary row onto it —
  // otherwise editing a booking would silently move it between the duplicate
  // case-variant rows of the same real branch.
  const branchId = isHeadOffice(authUser) ? str(formData, 'branch_id') : existing.branchId;

  // A release cannot be undone, and neither released nor cancelled is set from
  // this form (Phase 9 Step 2; owner, 2026-10-20).
  const statusChange = formStatusChange(existing.status, str(formData, 'status'));
  if ('error' in statusChange) return { error: statusChange.error };

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
    ...flightColumns(flights.details),
    mealIncluded: str(formData, 'meal_included') === 'yes',
    pnrTlDate: dateVal(formData, 'pnr_tl_date'),
    airlineTaxes: numVal(formData, 'airline_taxes'),
    // The form shows PSF only on a booking that already carries one (owner,
    // 2026-10-20); with no field posted, the stored value is kept.
    psf: formData.has('psf') ? numVal(formData, 'psf') : existing.psf,
    fare,
    status: statusChange.status,
  };

  // `time` columns come back as a Date on 1970-01-01, so printing them as a
  // date would log every time as "1970-01-01" and never see a change.
  const asLogText = (field: string, v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) {
      return FLIGHT_TIME_COLUMNS.has(field) ? v.toISOString().slice(11, 16) : v.toISOString().slice(0, 10);
    }
    return String(v);
  };

  const changes: { fieldName: string; oldValue: string; newValue: string }[] = [];
  for (const [field, value] of Object.entries(next)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const beforeStr = asLogText(field, (existing as any)[field]);
    const afterStr = asLogText(field, value);
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

    // Stops are replaced as a set; the history records each flight's before
    // and after as one readable line rather than row-by-row churn.
    const newStops = flightStopRows(flights.details);
    await tx.flightStop.deleteMany({ where: { pnrId: id } });
    if (newStops.length > 0) {
      await tx.flightStop.createMany({ data: newStops.map((st) => ({ ...st, pnrId: id })) });
    }
    for (const leg of ['outbound', 'inbound'] as const) {
      const as = (
        rows: {
          leg: string;
          city: string;
          flightCode: string | null;
          arrivalTime: Date | null;
          departureTime: Date | null;
          arrivalDate: Date | null;
          departureDate: Date | null;
        }[]
      ) =>
        describeStops(
          rows
            .filter((r) => r.leg === leg)
            .map((r) => ({
              ...r,
              arrivalTime: timeFromDb(r.arrivalTime),
              departureTime: timeFromDb(r.departureTime),
              arrivalDate: dateFromDb(r.arrivalDate),
              departureDate: dateFromDb(r.departureDate),
            }))
        );
      const before = as(existing.flightStops);
      const after = as(newStops);
      if (before !== after) {
        await tx.activityLog.create({
          data: { tableName: 'pnrs', recordId: id, fieldName: `${leg}Stops`, oldValue: before, newValue: after, changedBy: authUser.id },
        });
      }
    }

    // The seats changed after a ticket count was recorded: the tickets already
    // issued stay issued and the remainder is recalculated (owner, 2026-10-28,
    // Phase 9 Step 4 — even though the remainder is now the typed field).
    // Logged like any other write to `ticketing`.
    if (ticketing?.ticketsIssued != null && seats !== existing.seats) {
      // The booking's own count covers its seats not in a split.
      const newBalance = balanceTicketsFor(seats - inSplits, ticketing.ticketsIssued);
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


/**
 * Releases a booking: it ends before EMD-1 is issued (Phase 9 Step 2, A2).
 * A branch may release its own bookings, Head Office any. Refused once any EMD
 * round exists — for Head Office too — and when any agent has paid on it. The
 * reason goes to the change history; agents' unpaid seats end with it, each
 * logged. It cannot be undone.
 */
export async function releasePnr(formData: FormData): Promise<{ error: string } | undefined> {
  const user = await requireUser();
  const id = str(formData, 'pnr_id');
  if (!id) return { error: 'Missing booking id.' };
  const reason = str(formData, 'reason');

  const pnr = await prisma.pnr.findUnique({ where: { id }, select: { branchId: true } });
  if (!pnr) return { error: 'Booking not found.' };
  // The edit rule's branch scope: a branch only on its own bookings. Its "no
  // EMD yet" half is checked inside the lock below, for everyone.
  if (!canEditPnr(user, pnr.branchId, false)) {
    return { error: 'You do not have permission to release this booking.' };
  }

  const result = await prisma.$transaction(async (tx) => {
    // Locked, so an EMD issued or a payment recorded at the same moment cannot
    // slip past the checks.
    await tx.$queryRaw`select id from pnrs where id = ${id}::uuid for update`;
    const current = await tx.pnr.findUnique({
      where: { id },
      select: {
        status: true,
        _count: { select: { emdRounds: true } },
        agentAssignments: {
          select: { id: true, seats: true, releasedAt: true, agent: { select: { name: true } }, _count: { select: { recoveries: true } } },
        },
      },
    });
    if (!current) return { error: 'Booking not found.' };

    const blocker = releaseBlocker({
      status: current.status,
      roundCount: current._count.emdRounds,
      // Every assignment, live or ended: any payment ever received blocks it.
      agentPaymentCount: current.agentAssignments.reduce((n, a) => n + a._count.recoveries, 0),
      reason,
    });
    if (blocker) return { error: blocker };

    await tx.pnr.update({ where: { id }, data: { status: 'released' } });
    await tx.activityLog.createMany({
      data: [
        { tableName: 'pnrs', recordId: id, fieldName: 'status', oldValue: current.status, newValue: 'released', changedBy: user.id },
        { tableName: 'pnrs', recordId: id, fieldName: 'releaseReason', oldValue: null, newValue: reason!.trim(), changedBy: user.id },
      ],
    });

    // The agents' seats end with the booking. None has paid, or the release
    // was refused above.
    const now = new Date();
    for (const a of current.agentAssignments.filter((x) => !x.releasedAt)) {
      await tx.agentAssignment.update({ where: { id: a.id }, data: { releasedAt: now } });
      await tx.activityLog.create({
        data: {
          tableName: 'agent_assignments',
          recordId: a.id,
          fieldName: 'seats',
          oldValue: String(a.seats),
          newValue: `0 (booking released; ${a.agent.name}'s seats ended)`,
          changedBy: user.id,
        },
      });
    }
    return null;
  }, { timeout: TX_TIMEOUT_MS });

  if (result) return result;
  revalidatePath('/');
  revalidatePath(`/pnrs/${id}`);
  return undefined;
}
