'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { canEdit, getUserRole, type UserRole } from '@/lib/types/auth';
import { prisma } from '@/lib/prisma';

function str(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

function dateVal(formData: FormData, key: string): Date | null {
  const s = str(formData, key);
  return s ? new Date(`${s}T00:00:00.000Z`) : null;
}

function numVal(formData: FormData, key: string): number | null {
  const s = str(formData, key);
  return s === null ? null : Number(s);
}

async function requireEditor() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const role: UserRole = getUserRole(user);
  if (!canEdit(role)) {
    throw new Error('Viewers cannot create or edit bookings.');
  }
  return user;
}

export async function createPnr(formData: FormData) {
  const user = await requireEditor();

  const requestDate = dateVal(formData, 'request_date');
  const investorCompany = str(formData, 'investor_company');
  const pnrCode = str(formData, 'pnr');
  const seats = numVal(formData, 'seats');
  const fare = numVal(formData, 'fare');

  if (!requestDate || !investorCompany || !pnrCode || seats === null || Number.isNaN(seats) || fare === null || Number.isNaN(fare)) {
    return { error: 'Request date, investor company, PNR, seats and fare are required.' };
  }

  const createdBy = user.id;
  const created = await prisma.pnr.create({
    data: {
      requestDate,
      investorCompany,
      licenseId: str(formData, 'license_id'),
      branchId: str(formData, 'branch_id'),
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
      rawAirlineText: str(formData, 'raw_airline_text'),
      createdBy,
    },
  });

  await prisma.activityLog.create({
    data: {
      tableName: 'pnrs',
      recordId: created.id,
      fieldName: null,
      oldValue: null,
      newValue: 'record created',
      changedBy: createdBy,
    },
  });

  const roundIssuance = dateVal(formData, 'round_issuance_date');
  const roundPct = numVal(formData, 'round_payment_pct');
  const roundAmount = numVal(formData, 'round_emd_amount');
  const roundDeadline = dateVal(formData, 'round_deadline_date');

  const roundTouched =
    roundIssuance !== null || roundPct !== null || roundAmount !== null || roundDeadline !== null;

  if (roundTouched) {
    if (!roundIssuance || !roundDeadline || roundPct === null || Number.isNaN(roundPct) || roundAmount === null || Number.isNaN(roundAmount)) {
      return {
        error:
          'The EMD round is incomplete. For new bookings the EMD time limit (deadline date), payment %, amount and issuance date are all required.',
      };
    }
  } else {
    revalidatePath('/');
    redirect(`/pnrs/${created.id}`);
  }

  const maxRound = await prisma.emdRound.aggregate({
    where: { pnrId: created.id },
    _max: { roundNumber: true },
  });
  const roundNumber = (maxRound._max.roundNumber ?? 0) + 1;

  const round = await prisma.emdRound.create({
    data: {
      pnrId: created.id,
      roundNumber,
      issuanceDate: roundIssuance,
      paymentPct: roundPct,
      emdNumber: str(formData, 'round_emd_number'),
      emdAmount: roundAmount,
      deadlineDate: roundDeadline,
      deadlineTime: str(formData, 'round_deadline_time')
        ? new Date(`1970-01-01T${str(formData, 'round_deadline_time')}:00.000Z`)
        : null,
      status: 'pending',
    },
  });

  await prisma.activityLog.create({
    data: {
      tableName: 'emd_rounds',
      recordId: round.id,
      fieldName: null,
      oldValue: null,
      newValue: `round ${roundNumber} created`,
      changedBy: createdBy,
    },
  });

  revalidatePath('/');
  redirect(`/pnrs/${created.id}`);
}

export async function updatePnr(formData: FormData) {
  const user = await requireEditor();

  const id = str(formData, 'id');
  if (!id) return { error: 'Missing booking id.' };

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

  const next = {
    requestDate,
    investorCompany,
    licenseId: str(formData, 'license_id'),
    branchId: str(formData, 'branch_id'),
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

  await prisma.pnr.update({ where: { id }, data: next });

  if (changes.length > 0) {
    await prisma.activityLog.createMany({
      data: changes.map((c) => ({
        tableName: 'pnrs',
        recordId: id,
        fieldName: c.fieldName,
        oldValue: c.oldValue,
        newValue: c.newValue,
        changedBy: user.id,
      })),
    });
  }

  revalidatePath('/');
  revalidatePath(`/pnrs/${id}`);
  redirect(`/pnrs/${id}`);
}
