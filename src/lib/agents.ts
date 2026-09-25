/**
 * Agents — the travel agents that seats are handed over to (phase 6).
 *
 * Pure logic only: name normalisation, validation and visibility. Database
 * access lives in the server actions and page queries, as elsewhere.
 *
 * Agents are records, not user accounts. Nothing here authenticates anybody.
 */

import type { AuthUser } from '@/lib/auth';
import { BOT_HOLDER, COMPANY_HOLDER } from './inventory';

/**
 * The comparison key for an agent's name: trimmed, inner whitespace collapsed,
 * lower-cased.
 *
 * This exists because of a failure that has already happened once here. The
 * `branches` table had a plain unique constraint on `name`, which compares text
 * exactly, so `Rawalpindi` and `RAWALPINDI` were both allowed — one real branch
 * ended up as two rows, and 392 bookings became invisible to the branch that
 * owned them (docs/decisions.md, 2026-09-07). Agent names come from staff typing
 * them, so the same thing would happen within a week.
 *
 * Whitespace is collapsed as well as trimmed: `QFC  GROUP` and `QFC GROUP` are
 * the same agent to a human, and a double space is invisible on screen.
 */
export function agentNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export interface AgentInput {
  name: string;
  b2bCode: string | null;
  contactEmails: string[];
  contactPhone: string | null;
}

/**
 * Names an agent may not take: they are the two fixed holders the dashboard
 * shows beside the agents (`COMPANY_HOLDER` / `BOT_HOLDER` in `inventory.ts`),
 * compared through `agentNameKey` so a case or spacing variant cannot slip past.
 */
const RESERVED_HOLDER_NAMES = [agentNameKey(COMPANY_HOLDER), agentNameKey(BOT_HOLDER)];

/**
 * Validates an agent before it is written.
 *
 * Contact emails are checked because they are load-bearing, not decorative: a
 * dues notice may only be sent to an address recorded on the agent, exactly as
 * airline emails may only go to an address recorded on the airline
 * (docs/decisions.md, 2026-09-07 — the batch email was an open relay). A typo
 * here is a notice that never arrives.
 */
export function validateAgent(input: AgentInput): { error: string } | null {
  const name = input.name.trim();
  if (!name) return { error: 'Agent name is required.' };
  if (name.length > 200) return { error: 'Agent name is too long (200 characters maximum).' };

  // The dashboard's Holder filter lists agents alongside these two fixed
  // holders, keyed by name. An agent called "Company Investment" would be
  // indistinguishable from the company's own unassigned seats — one filter
  // entry meaning two different things, and a share calculated for the wrong
  // one. Reserved here, where the name is already being checked.
  if (RESERVED_HOLDER_NAMES.includes(agentNameKey(name))) {
    return {
      error: `"${name}" is reserved — the dashboard uses it for seats the company or the bot holds. Choose another name for the agent.`,
    };
  }

  if (input.b2bCode !== null && input.b2bCode.trim().length > 50) {
    return { error: 'B2B code is too long (50 characters maximum).' };
  }

  for (const email of input.contactEmails) {
    if (!isPlausibleEmail(email)) {
      return { error: `"${email}" is not a valid email address.` };
    }
  }

  const seen = new Set<string>();
  for (const email of input.contactEmails) {
    const key = email.trim().toLowerCase();
    if (seen.has(key)) return { error: `"${email}" is listed twice.` };
    seen.add(key);
  }

  return null;
}

/**
 * Deliberately permissive: it rejects what is obviously not an address rather
 * than trying to encode RFC 5322, which no regular expression does correctly.
 * The real check is that a human reads it back on the agent's page.
 */
function isPlausibleEmail(value: string): boolean {
  const v = value.trim();
  if (v.length === 0 || v.length > 254) return false;
  if (/\s/.test(v)) return false;
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(v);
}

/** Splits the comma/newline separated contact-email box into clean addresses. */
export function parseContactEmails(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\n;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Prisma `where` fragment for the agents this user may see.
 *
 * Head office sees every agent. A branch sees only agents it created — that is,
 * whose `created_by_branch_id` is one of its own branch rows (owner ruling,
 * 2026-09-17).
 *
 * Returns **null meaning deny everything**, never `{}`, for a branch account
 * whose branch name matches no row. `{}` spread into a where clause returns
 * every row, which is exactly how branch scoping once failed open and gave a
 * misconfigured account MORE access than a correct one (docs/decisions.md,
 * 2026-09-07). `pnrBranchFilter` has the same contract for the same reason.
 */
export function agentVisibilityFilter(
  user: AuthUser
): { createdByBranchId: { in: string[] } } | Record<string, never> | null {
  if (user.accountType === 'headoffice') return {};
  if (user.branchIds.length === 0) return null;
  return { createdByBranchId: { in: user.branchIds } };
}

/**
 * Whether this user may edit this agent.
 *
 * Head office may edit any. A branch may edit only an agent it created — which
 * is the same set it can see, so there is no agent a branch can read but not
 * correct. An agent created by head office is head office's to maintain.
 */
export function canEditAgent(user: AuthUser, agentCreatedByBranchId: string | null): boolean {
  if (user.accountType === 'headoffice') return true;
  if (user.branchIds.length === 0) return false;
  if (!agentCreatedByBranchId) return false;
  return user.branchIds.includes(agentCreatedByBranchId);
}
