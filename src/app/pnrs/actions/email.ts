'use server';

/**
 * Server actions for the batch airline email screen.
 *
 * The recipient is always one of the target airline's own recorded contact
 * addresses, and every PNR in a batch must belong to that airline — see
 * docs/decisions.md, 2026-09-07 "Batch airline email was an open mail relay".
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireHeadOffice } from '@/lib/server/guards';

export async function fetchPnrsForBatchEmail(pnrCodes: string[]) {
  await requireHeadOffice();

  if (!pnrCodes || pnrCodes.length === 0) return { pnrs: [], error: undefined };

  const normalizedCodes = pnrCodes.map(c => c.trim().toUpperCase()).filter(Boolean);
  if (normalizedCodes.length === 0) return { pnrs: [], error: undefined };

  const pnrs = await prisma.pnr.findMany({
    where: {
      pnr: { in: normalizedCodes },
    },
    select: {
      id: true,
      pnr: true,
      investorCompany: true,
      airlineId: true,
      airline: { select: { name: true, contactEmails: true } },
      sector: true,
      seats: true,
      outboundDate: true,
    },
    orderBy: { pnr: 'asc' }
  });

  return { 
    pnrs: pnrs.map(p => ({
      ...p,
      outboundDate: p.outboundDate ? p.outboundDate.toISOString().slice(0, 10) : null
    })), 
    error: undefined 
  };
}

export async function sendBatchAirlineEmails(payload: {
  airlineId: string;
  pnrIds: string[];
  recipient: string;
  subject: string;
  body: string;
}) {
  const user = await requireHeadOffice();

  const { airlineId, pnrIds, recipient, subject, body } = payload;

  if (!pnrIds || pnrIds.length === 0) return { error: 'No PNRs selected.' };
  if (!recipient || !subject || !body) return { error: 'Recipient, subject, and body are required.' };
  if (!airlineId) return { error: 'A target airline is required.' };

  // ---------------------------------------------------------------------
  // The recipient must be one of the AIRLINE'S OWN recorded addresses.
  //
  // Everything here used to be taken on trust: recipient, subject and body came
  // straight from the browser and were sent from the company's verified sending
  // domain, with `airlineId` accepted and then never used. That is an open mail
  // relay — arbitrary text to an arbitrary address, over the company's identity.
  // The UI's "mismatch" flagging was cosmetic; nothing enforced it server-side.
  //
  // data-model.md defines `airlines.contact_emails` as exactly this: the
  // "contact email(s) for sending deposit-confirmation / extension-request
  // emails". So the airline record is the authority on where its mail may go.
  // ---------------------------------------------------------------------
  const airline = await prisma.airline.findUnique({
    where: { id: airlineId },
    select: { name: true, contactEmails: true },
  });
  if (!airline) return { error: 'Target airline not found.' };

  if (airline.contactEmails.length === 0) {
    return {
      error:
        `No contact email is recorded for ${airline.name}, so there is nowhere approved to send this. ` +
        `Add the airline's address to its record first.`,
    };
  }
  const allowed = airline.contactEmails.map((e) => e.trim().toLowerCase());
  if (!allowed.includes(recipient.trim().toLowerCase())) {
    return {
      error:
        `"${recipient}" is not a recorded contact address for ${airline.name}. ` +
        `Allowed: ${airline.contactEmails.join(', ')}.`,
    };
  }

  // Every PNR in the batch must actually belong to that airline — otherwise one
  // airline is told about another's bookings.
  const pnrs = await prisma.pnr.findMany({
    where: { id: { in: pnrIds } },
    select: { id: true, pnr: true, airlineId: true },
  });
  if (pnrs.length !== pnrIds.length) {
    return { error: 'One or more selected bookings no longer exist. Re-fetch the list and try again.' };
  }
  const wrongAirline = pnrs.filter((p) => p.airlineId !== airlineId);
  if (wrongAirline.length > 0) {
    return {
      error:
        `These bookings do not belong to ${airline.name}: ` +
        `${wrongAirline.map((p) => p.pnr).join(', ')}. Remove them before sending.`,
    };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: 'RESEND_API_KEY is not configured, so no email can be sent.' };

  const fromEmail = process.env.ALERT_FROM_EMAIL || 'onboarding@resend.dev';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Eyries <${fromEmail}>`,
        to: [recipient],
        subject,
        text: body,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { error: `Failed to send email via Resend: ${errText}` };
    }

    // phase-3 Step 4: "Every sent email is logged against the PNR (subject,
    // body, timestamp, recipient)." The old entry recorded only the sentence
    // "batch email sent to airline" — no recipient, no subject, no body — so
    // there was no record of what any airline was actually told. Mapped onto
    // the existing activity_log columns; no new field invented (CLAUDE.md
    // rule 3). `changed_at` supplies the timestamp.
    await prisma.$transaction(async (tx) => {
      await tx.activityLog.createMany({
        data: pnrIds.map((pnrId) => ({
          tableName: 'pnrs',
          recordId: pnrId,
          fieldName: 'email_sent',
          oldValue: `To: ${recipient}`,
          newValue: `Subject: ${subject}\n\n${body}`,
          changedBy: user.id,
        })),
      });
    });

    revalidatePath('/');
    return { success: true };
  } catch (err) {
    // `catch` binds `unknown`: a thrown non-Error has no `.message` to read.
    return { error: `Email error: ${err instanceof Error ? err.message : String(err)}` };
  }
}
