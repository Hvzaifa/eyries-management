'use server';

/**
 * Server actions for agents (phase 6 step 1).
 *
 * Head office and branches both use these; a branch may only touch agents it
 * created (docs/decisions.md, 2026-09-19 rulings 6 and 8).
 */

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { str } from '@/lib/form';
import { requireUser, TX_TIMEOUT_MS } from '@/lib/server/guards';
import { validateAgentNotice } from '@/lib/agent-notices';
import {
  agentNameKey,
  canEditAgent,
  parseContactEmails,
  validateAgent,
} from '@/lib/agents';

export interface AgentActionResult {
  ok: boolean;
  error?: string;
}

/** Reads the shared form fields. Used by both create and edit. */
function readForm(formData: FormData) {
  return {
    name: str(formData, 'name') ?? '',
    b2bCode: str(formData, 'b2b_code'),
    contactEmails: parseContactEmails(str(formData, 'contact_emails')),
    contactPhone: str(formData, 'contact_phone'),
  };
}

/**
 * Prisma's unique-violation code. `name_key` is unique in the database as well
 * as checked here: two staff members can submit the same new agent at the same
 * moment, and only the database can settle that race.
 */
const UNIQUE_VIOLATION = 'P2002';

async function nameClashMessage(nameKey: string): Promise<string> {
  const existing = await prisma.agent.findUnique({ where: { nameKey } });
  return existing
    ? `An agent called "${existing.name}" already exists — names are matched ignoring case and spacing.`
    : 'An agent with this name already exists.';
}

export async function createAgent(formData: FormData): Promise<AgentActionResult> {
  const user = await requireUser();

  // A branch account whose branch does not resolve cannot create anything: the
  // agent would be created with no owning branch, i.e. as head office's, and
  // would then be invisible to the very account that made it.
  if (user.accountType === 'branch' && !user.branchId) {
    return {
      ok: false,
      error:
        'Your account is not linked to a branch that exists in the system, so it cannot create agents. Ask Head Office to correct the branch on your account.',
    };
  }

  const input = readForm(formData);
  const invalid = validateAgent(input);
  if (invalid) return { ok: false, error: invalid.error };

  const name = input.name.trim().replace(/\s+/g, ' ');
  const nameKey = agentNameKey(name);

  try {
    await prisma.$transaction(async (tx) => {
      const agent = await tx.agent.create({
        data: {
          name,
          nameKey,
          b2bCode: input.b2bCode,
          contactEmails: input.contactEmails,
          contactPhone: input.contactPhone,
          // Head office agents carry no branch; a branch stamps its own.
          createdByBranchId: user.accountType === 'branch' ? user.branchId : null,
        },
      });

      await tx.activityLog.create({
        data: {
          tableName: 'agents',
          recordId: agent.id,
          fieldName: null,
          oldValue: null,
          newValue: `agent created: ${name}`,
          changedBy: user.id,
        },
      });
    }, { timeout: TX_TIMEOUT_MS });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION) {
      return { ok: false, error: await nameClashMessage(nameKey) };
    }
    throw err;
  }

  revalidatePath('/agents');
  return { ok: true };
}

export async function updateAgent(formData: FormData): Promise<AgentActionResult> {
  const user = await requireUser();

  const id = str(formData, 'id');
  if (!id) return { ok: false, error: 'Missing agent id.' };

  const existing = await prisma.agent.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: 'Agent not found.' };
  if (!canEditAgent(user, existing.createdByBranchId)) {
    return { ok: false, error: 'You do not have permission to edit this agent.' };
  }

  const input = readForm(formData);
  const invalid = validateAgent(input);
  if (invalid) return { ok: false, error: invalid.error };

  const name = input.name.trim().replace(/\s+/g, ' ');
  const nameKey = agentNameKey(name);
  const active = str(formData, 'active') === 'false' ? false : true;

  const next = {
    name,
    nameKey,
    b2bCode: input.b2bCode,
    contactEmails: input.contactEmails,
    contactPhone: input.contactPhone,
    active,
  };

  // Per-field change history, so the log says what moved rather than "agent
  // updated". Arrays are compared as their joined text.
  const asText = (v: unknown) => (Array.isArray(v) ? v.join(', ') : v === null ? null : String(v));
  const changes = (Object.keys(next) as (keyof typeof next)[])
    .filter((field) => field !== 'nameKey') // derived from name; logging both is noise
    .map((field) => ({
      field,
      old: asText(existing[field]),
      new: asText(next[field]),
    }))
    .filter((c) => c.old !== c.new);

  if (changes.length === 0) return { ok: true };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.agent.update({ where: { id }, data: next });
      await tx.activityLog.createMany({
        data: changes.map((c) => ({
          tableName: 'agents',
          recordId: id,
          fieldName: c.field,
          oldValue: c.old ?? '(empty)',
          newValue: c.new ?? '(empty)',
          changedBy: user.id,
        })),
      });
    }, { timeout: TX_TIMEOUT_MS });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION) {
      return { ok: false, error: await nameClashMessage(nameKey) };
    }
    throw err;
  }

  revalidatePath('/agents');
  return { ok: true };
}

/**
 * Sends a dues notice to an agent. **A human click, never the daily job.**
 *
 * The daily email tells staff who is due; it does not write to agents. Phase 7
 * step 4 is explicit about that, and it is the right shape — an automated
 * demand for money sent to an outside party on the company's behalf is not
 * something a cron job should decide.
 *
 * Authority: whoever may edit the agent may write to it. `canEditAgent` already
 * governs who can change `contact_emails`, and those addresses are the only
 * places a notice can go — so anyone who can change the destination can
 * certainly send to it. A branch chases the agents it created; Head Office
 * chases any.
 *
 * The recipient guard lives in `validateAgentNotice` and is enforced HERE, on
 * the server, not in the form. The airline batch email was an open mail relay
 * precisely because its check was cosmetic (`decisions.md`, 2026-09-07).
 */
export async function sendAgentNotice(payload: {
  assignmentId: string;
  recipient: string;
  subject: string;
  body: string;
}): Promise<AgentActionResult> {
  const user = await requireUser();

  const { assignmentId, recipient, subject, body } = payload;
  if (!assignmentId) return { ok: false, error: 'Missing assignment.' };

  const assignment = await prisma.agentAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      agent: { select: { id: true, name: true, contactEmails: true, createdByBranchId: true } },
      pnr: { select: { id: true, pnr: true } },
    },
  });
  if (!assignment) return { ok: false, error: 'That seat hand-over no longer exists.' };
  if (assignment.releasedAt) {
    return { ok: false, error: 'Those seats have been handed back, so there is nothing to chase.' };
  }

  if (!canEditAgent(user, assignment.agent.createdByBranchId)) {
    return { ok: false, error: 'You cannot send notices to this agent.' };
  }

  const check = validateAgentNotice({
    recipient,
    subject,
    body,
    agentName: assignment.agent.name,
    allowedEmails: assignment.agent.contactEmails,
  });
  if ('error' in check) return { ok: false, error: check.error };

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY is not configured, so no email can be sent.' };
  const fromEmail = process.env.ALERT_FROM_EMAIL || 'onboarding@resend.dev';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `Eyries <${fromEmail}>`,
        to: [check.recipient],
        subject: subject.trim(),
        text: body.trim(),
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `Failed to send notice via Resend: ${await res.text()}` };
    }
  } catch (err) {
    // `catch` binds `unknown`: a thrown non-Error has no `.message` to read.
    return { ok: false, error: `Email error: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Logged against the ASSIGNMENT, which is where the booking page's history
  // query already looks for `agent_assignments` — so this shows up without a
  // second change. Subject, recipient and body are all recorded, the shape the
  // airline email settled on; `changed_at` supplies the timestamp. No new
  // field is invented (CLAUDE.md rule 3).
  await prisma.activityLog.create({
    data: {
      tableName: 'agent_assignments',
      recordId: assignmentId,
      fieldName: 'notice_sent',
      oldValue: `To: ${check.recipient}`,
      newValue: `Subject: ${subject.trim()}\n\n${body.trim()}`,
      changedBy: user.id,
    },
  });

  revalidatePath(`/agents/${assignment.agent.id}`);
  revalidatePath(`/pnrs/${assignment.pnr.id}`);
  return { ok: true };
}
