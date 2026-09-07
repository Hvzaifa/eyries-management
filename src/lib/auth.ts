import type { User } from '@supabase/supabase-js';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AccountType = 'headoffice' | 'branch';

export interface AuthUser {
  id: string;
  email: string;
  accountType: AccountType;
  /**
   * The branch row new PNRs are stamped with. Null for head office, and null for
   * a branch account whose `branch_name` matches no row — which must be treated
   * as "sees nothing", never as "sees everything". Use `pnrBranchFilter` rather
   * than testing this field directly.
   */
  branchId: string | null;
  /**
   * EVERY branch row whose name matches this account's branch, case-insensitively.
   * The legacy import created case-variant duplicates of the seeded branches
   * ("Rawalpindi" and "RAWALPINDI" are two rows holding 0 and 392 PNRs), so a
   * branch's bookings are split across more than one row and scoping to a single
   * id would hide most of them. Empty for head office and for an unresolved branch.
   */
  branchIds: string[];
  branchName: string | null; // e.g. "RAWALPINDI"
}

// ---------------------------------------------------------------------------
// Resolve Supabase user → AuthUser (case-insensitive branch lookup)
// ---------------------------------------------------------------------------

export async function resolveAuthUser(user: User): Promise<AuthUser> {
  const meta = user.app_metadata ?? {};

  if (meta.account_type === 'headoffice') {
    return {
      id: user.id,
      email: user.email ?? '',
      accountType: 'headoffice',
      branchId: null,
      branchIds: [],
      branchName: null,
    };
  }

  // Branch account — resolve branch by name (case-insensitive).
  const branchNameFromMeta: string | undefined = meta.branch_name;
  let branchIds: string[] = [];
  let branchId: string | null = null;
  let branchName: string | null = branchNameFromMeta ?? null;

  if (branchNameFromMeta) {
    const matches = await prisma.branch.findMany({
      where: { name: { equals: branchNameFromMeta, mode: 'insensitive' } },
      orderBy: { createdAt: 'asc' },
    });
    branchIds = matches.map((b) => b.id);

    if (matches.length === 1) {
      branchId = matches[0].id;
      branchName = matches[0].name;
    } else if (matches.length > 1) {
      // Duplicate case-variant rows for one real branch. Scoping covers them all,
      // but a NEW PNR can only point at one, so pick deterministically: the row
      // that already holds the most bookings — i.e. where this branch's records
      // actually live — with the oldest row as a tie-break. This is an interim
      // rule; merging the duplicates is an owner decision (see decisions.md).
      const counts = await prisma.pnr.groupBy({
        by: ['branchId'],
        where: { branchId: { in: branchIds } },
        _count: { _all: true },
      });
      const countFor = (id: string) =>
        counts.find((c) => c.branchId === id)?._count._all ?? 0;
      const primary = [...matches].sort((a, b) => countFor(b.id) - countFor(a.id))[0];
      branchId = primary.id;
      branchName = primary.name;
    }
  }

  return {
    id: user.id,
    email: user.email ?? '',
    accountType: 'branch',
    branchId,
    branchIds,
    branchName,
  };
}

/**
 * A branch account whose branch name matches no row in `branches`. Such an
 * account must be shown nothing at all — the failure mode to avoid is treating
 * "no branch to filter on" as "no filter needed".
 */
export function hasUnresolvedBranch(user: AuthUser): boolean {
  return user.accountType === 'branch' && user.branchIds.length === 0;
}

/**
 * Prisma `where` fragment restricting a query to the PNRs this user may see.
 *
 * Returns `null` to mean **deny everything** — callers must check for null and
 * short-circuit. It is deliberately not an empty object: spreading `{}` into a
 * where clause silently returns every row, which is exactly the bug this
 * function exists to prevent.
 */
export function pnrBranchFilter(
  user?: AuthUser
): { branchId: { in: string[] } } | Record<string, never> | null {
  if (!user || user.accountType === 'headoffice') return {};
  if (user.branchIds.length === 0) return null;
  return { branchId: { in: user.branchIds } };
}

// ---------------------------------------------------------------------------
// Permission helpers
// ---------------------------------------------------------------------------

export function isHeadOffice(user: AuthUser): boolean {
  return user.accountType === 'headoffice';
}

/**
 * Head office can always edit a PNR.
 * A branch user can edit only if all of these hold:
 *  - their own branch resolved to at least one row (otherwise: deny, never allow);
 *  - the PNR is actually assigned to a branch — an unbranched PNR belongs to no
 *    branch user, and must not fall through on a null == null comparison;
 *  - that branch is one of theirs;
 *  - no EMD round has been issued yet (decisions.md, 2026-09-07: creating a round
 *    IS issuing it, so ANY round locks the booking — not only a paid/refunded one).
 */
export function canEditPnr(
  user: AuthUser,
  pnrBranchId: string | null,
  hasIssuedEmd: boolean,
): boolean {
  if (isHeadOffice(user)) return true;
  if (user.branchIds.length === 0) return false;
  if (!pnrBranchId) return false;
  if (!user.branchIds.includes(pnrBranchId)) return false;
  if (hasIssuedEmd) return false;
  return true;
}

/** Only head office can add / edit / refund EMD rounds. */
export function canManageEmd(user: AuthUser): boolean {
  return isHeadOffice(user);
}

/** Only head office can split PNRs. */
export function canSplitPnr(user: AuthUser): boolean {
  return isHeadOffice(user);
}
