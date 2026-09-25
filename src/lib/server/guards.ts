import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { resolveAuthUser, isHeadOffice, canEditPnr, type AuthUser } from '@/lib/auth';

/**
 * Authorisation guards for server actions.
 *
 * Deliberately NOT a `'use server'` module: everything exported from one of
 * those becomes a callable endpoint, and these are internal checks, not actions.
 */

/**
 * Who is acting, for a server action that is about to WRITE.
 *
 * Deliberately `getUser()`, not the faster `getClaims()` pages use: a signed
 * JWT stays valid until it expires even if the account has been disabled, and
 * `getUser()` asks the Auth server, so a revoked user cannot move money in the
 * minutes before their token runs out. One extra round trip per write is the
 * right price for that; reads take the fast path (`lib/server/session.ts`).
 */
export async function requireUser(): Promise<AuthUser> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return resolveAuthUser(user);
}

export async function requireHeadOffice(): Promise<AuthUser> {
  const authUser = await requireUser();
  if (!isHeadOffice(authUser)) {
    throw new Error('Only the Head Office account can perform this action.');
  }
  return authUser;
}

/**
 * A branch may act on the selling side of a booking only when it is one of its
 * own; head office may always. `canEditPnr` cannot be reused: it also refuses
 * once an EMD round exists, which is right for editing a booking's details and
 * wrong here — seats are handed to agents, and agents pay, precisely while
 * deposits are running (docs/decisions.md, 2026-09-19, and ruling 6, which puts
 * "record recoveries, charges and discounts" among what a branch does).
 */
export function canSellOnPnr(user: AuthUser, pnrBranchId: string | null): boolean {
  if (isHeadOffice(user)) return true;
  if (user.branchIds.length === 0) return false;
  if (!pnrBranchId) return false;
  return user.branchIds.includes(pnrBranchId);
}

/** Exactly the shape the query below selects — keeps `any` out of the guard. */
type PnrWithRoundStatuses = Prisma.PnrGetPayload<{
  include: { emdRounds: { select: { status: true } } };
}>;

export async function requirePnrEditor(
  pnrId: string
): Promise<{ authUser: AuthUser; pnr: PnrWithRoundStatuses }> {
  const authUser = await requireUser();
  const pnr = await prisma.pnr.findUnique({
    where: { id: pnrId },
    include: { emdRounds: { select: { status: true } } },
  });
  if (!pnr) throw new Error('Booking not found.');
  // ANY existing round locks the booking for branch users: creating a round IS
  // issuing it (docs/decisions.md, 2026-09-07). This must match the same
  // calculation in getPnrDetail, which is what hides the Edit button.
  const hasIssuedEmd = pnr.emdRounds.length > 0;
  if (!canEditPnr(authUser, pnr.branchId, hasIssuedEmd)) {
    throw new Error('You do not have permission to edit this booking.');
  }
  return { authUser, pnr };
}

/**
 * Prisma's default interactive-transaction timeout is 5s. These transactions
 * make several round trips to a hosted database, which on a slow link can take
 * longer than that and abort a perfectly valid save. 20s is still short enough
 * to fail fast if the database is genuinely unreachable.
 */
export const TX_TIMEOUT_MS = 20_000;
