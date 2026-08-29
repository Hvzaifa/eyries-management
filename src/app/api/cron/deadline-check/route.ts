import { NextResponse } from 'next/server';
import { todayIsoInPkt } from '@/lib/urgency';
import { backfillEmd2Deadlines, sendDeadlineAlert } from '@/lib/deadlines';

import { timingSafeEqual } from 'node:crypto';

function isAuthorizedCron(authHeader: string | null, secret: string | undefined): boolean {
  if (!secret || !authHeader) return false;
  const expected = `Bearer ${secret}`;
  const authBuffer = Buffer.from(authHeader);
  const expectedBuffer = Buffer.from(expected);
  if (authBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(authBuffer, expectedBuffer);
}

/**
 * Daily deadline job (Vercel Cron -> this route).
 * 1. Sets missing EMD-2 deadlines from the SV policy (owner rule) — the only
 *    write this job performs, each change activity-logged.
 * 2. Sends one read-only summary email for pending rounds due within 2 days.
 * Protected by the CRON_SECRET bearer token — Vercel sends it automatically.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');

  if (!isAuthorizedCron(auth, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const backfill = await backfillEmd2Deadlines();
  const result = await sendDeadlineAlert(todayIsoInPkt());

  if (result.error) {
    return NextResponse.json(
      { ok: false, error: result.error, due: result.alerts.length, backfill },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    backfill,
    due: result.alerts.length,
    sent: result.sent,
    recipients: result.recipients,
    subject: result.subject,
  });
}
