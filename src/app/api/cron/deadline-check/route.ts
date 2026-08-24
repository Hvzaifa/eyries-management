import { NextResponse } from 'next/server';
import { todayIsoInPkt } from '@/lib/urgency';
import { sendDeadlineAlert } from '@/lib/deadlines';

/**
 * Daily deadline-check job (Vercel Cron -> this route).
 * Read-only: queries due EMD rounds and sends one summary email to staff.
 * Protected by the CRON_SECRET bearer token — Vercel sends it automatically.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await sendDeadlineAlert(todayIsoInPkt());

  if (result.error) {
    return NextResponse.json(
      { ok: false, error: result.error, due: result.alerts.length },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    due: result.alerts.length,
    sent: result.sent,
    recipients: result.recipients,
    subject: result.subject,
  });
}
