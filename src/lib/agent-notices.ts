/**
 * Telling an agent what they owe — phase 7 step 4.
 *
 * Two separate things live here, and both are pure so they can be tested
 * without a database or a mail server:
 *
 *   1. **the default notice text**, which a staff member may edit before
 *      sending — it is a starting point, not a template the system insists on;
 *   2. **the recipient guard**, which is not editable at all.
 *
 * ### The guard is the point
 *
 * A notice may only go to an address recorded on that agent. This is the same
 * rule that closed the airline batch email, which accepted a recipient, a
 * subject and a body straight from the browser and sent them over the company's
 * verified domain — an open mail relay (`decisions.md`, 2026-09-07). The agent
 * record is the authority on where its mail may go, exactly as the airline
 * record is.
 *
 * Note what that means in practice: an agent with **no** recorded address
 * cannot be sent anything. That is deliberate. The alternative — falling back
 * to an address typed at send time — is the relay again.
 *
 * ### What is never in a notice
 *
 * No payment reference, ever (CLAUDE.md rule 8). Nothing here reads one, and
 * the log line records only subject, recipient and body — the same shape as the
 * airline email.
 */

import { diffInDays } from './urgency';
import { formatPkr } from './format';
import type { NextDue } from './agent-dues';

/**
 * How far ahead a due date is worth telling someone about.
 *
 * Two days, matching every other alert in the daily email. An agent notice is
 * not more urgent than an EMD time limit and should not shout louder.
 */
export const AGENT_NOTICE_WINDOW_DAYS = 2;

/**
 * Whether this obligation belongs in today's alert.
 *
 * Future only — today through the window — like every other alert in the job
 * (owner rule, 2026-08-25: overdue items stay on screen but are never emailed,
 * so the daily mail does not nag).
 *
 * Two things are deliberately not chased:
 *   - an obligation with **no date**, which means no ticketing deadline has
 *     been recorded. The system will not invent one, and it will not chase a
 *     date it invented (owner ruling 17).
 *   - an amount of zero or less, which is a settled or credited assignment.
 */
export function isAgentNoticeDue(next: NextDue | null, todayIso: string): boolean {
  if (!next || !next.date || next.amount <= 0) return false;
  const days = diffInDays(todayIso, next.date);
  return days >= 0 && days <= AGENT_NOTICE_WINDOW_DAYS;
}

export interface NoticeFacts {
  agentName: string;
  pnrCode: string;
  sector: string | null;
  seats: number;
  outboundDate: string | null;
  kind: NextDue['kind'];
  amount: number;
  /**
   * Null for an EMD share, which since 2026-09-22 has no due date — it is
   * collected before the airline issues the round. The notice then asks for the
   * money without quoting a date, rather than not being sendable at all: the
   * owner removed the deadline, not the ability to chase.
   */
  dueDate: string | null;
}

/** What the money is for, in words an agent outside the company would follow. */
export function noticeReason(kind: NextDue['kind']): string {
  return kind === 'emd'
    ? 'the EMD deposit securing these seats'
    : 'the balance for these seats';
}

/**
 * The default subject and body.
 *
 * Written to be read by the agent, not by staff: it names the booking, the
 * seats, the amount and the date, and says what the money is for. It does not
 * mention EMD rounds, percentages or the airline's internal deadlines — none of
 * that is the agent's business and quoting it invites an argument about
 * arithmetic they cannot check.
 *
 * The EMD share is described as **part of** the total, never as an extra
 * charge, because that is what it is (ruling 13) — an agent told they owe a
 * deposit *and* a balance would reasonably think they were being billed twice.
 */
export function buildAgentNotice(f: NoticeFacts): { subject: string; body: string } {
  const where = f.sector ? ` (${f.sector})` : '';
  const travelling = f.outboundDate ? `, travelling ${f.outboundDate}` : '';

  const subject = f.dueDate
    ? `Payment due ${f.dueDate} — ${formatPkr(f.amount)} for PNR ${f.pnrCode}`
    : `Payment required — ${formatPkr(f.amount)} for PNR ${f.pnrCode}`;

  const opening = f.dueDate
    ? `This is a reminder of a payment falling due on ${f.dueDate}.`
    : 'This is a reminder of a payment now required on the booking below.';

  // An EMD share has no calendar date; what it has is a condition — the deposit
  // must be with us before the airline issues the next EMD. Saying that is more
  // use to an agent than leaving the line out.
  const dueLine = f.dueDate ? `Due by:    ${f.dueDate}` : 'Due:       before the next EMD is issued';

  const explain =
    f.kind === 'emd'
      ? `This is ${noticeReason(f.kind)}. It is part of the total for this booking, not an additional charge.`
      : `This is ${noticeReason(f.kind)}, being the amount outstanding after payments received to date.`;

  const body = [
    `Dear ${f.agentName},`,
    '',
    opening,
    '',
    `Booking:   PNR ${f.pnrCode}${where}`,
    `Seats:     ${f.seats}${travelling}`,
    `Amount:    ${formatPkr(f.amount)}`,
    dueLine,
    '',
    explain,
    '',
    'If you have already sent this payment, please ignore this message and share the payment details so we can record it against your account.',
    '',
    'Kind regards,',
    'Eyries Holidays',
  ].join('\n');

  return { subject, body };
}

export type NoticeCheck = { recipient: string } | { error: string };

/**
 * Checks a notice before it is sent. **This is the open-relay guard.**
 *
 * The recipient is matched against the agent's own recorded addresses, trimmed
 * and case-folded on both sides so a harmless difference in typing is not read
 * as a different address — and nothing else is accepted.
 */
export function validateAgentNotice(input: {
  recipient: string | null;
  subject: string | null;
  body: string | null;
  agentName: string;
  allowedEmails: string[];
}): NoticeCheck {
  const recipient = (input.recipient ?? '').trim();
  const subject = (input.subject ?? '').trim();
  const body = (input.body ?? '').trim();

  if (!recipient) return { error: 'A recipient is required.' };
  if (!subject) return { error: 'A subject is required.' };
  if (!body) return { error: 'The message body is required.' };

  if (input.allowedEmails.length === 0) {
    return {
      error:
        `No contact email is recorded for ${input.agentName}, so there is nowhere approved to send this. ` +
        `Add the agent's address to their record first.`,
    };
  }

  const allowed = input.allowedEmails.map((e) => e.trim().toLowerCase());
  if (!allowed.includes(recipient.toLowerCase())) {
    return {
      error:
        `"${recipient}" is not a recorded contact address for ${input.agentName}. ` +
        `Allowed: ${input.allowedEmails.join(', ')}.`,
    };
  }

  return { recipient };
}
