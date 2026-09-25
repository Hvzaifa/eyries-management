import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveAuthUser, type AuthUser, type SessionIdentity } from '@/lib/auth';

/**
 * Who is signed in, for **page reads** — verified once per request.
 *
 * ### Why this exists (measured 2026-09-24)
 *
 * Every page called `supabase.auth.getUser()`, which always makes a network
 * request to Supabase Auth (~300 ms from Pakistan), after the middleware had
 * already made the same request; `AppHeader` then resolved the account again.
 *
 * `getClaims()` verifies the session JWT's signature against the project's
 * published keys (JWKS) and caches them, so with **asymmetric signing keys** it
 * needs no Auth round trip at all. With the older symmetric keys it falls back
 * to asking the Auth server — so this is correct before and after the owner
 * switches the project's keys (Supabase docs, `auth.getClaims`).
 *
 * React `cache()` makes the page, the header and anything else in the same
 * render share one result instead of each re-verifying.
 *
 * ### What still uses `getUser()`, deliberately
 *
 * `requireUser()` in `lib/server/guards.ts`, which every server action calls
 * before it WRITES. A signed JWT stays valid until it expires even if the
 * account is disabled in the meantime; `getUser()` asks the Auth server and so
 * sees a revocation immediately. Reads take the fast path; money-moving writes
 * keep the authoritative check.
 */
export const getSessionUser = cache(async (): Promise<SessionIdentity | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return {
    id: claims.sub,
    email: claims.email ?? '',
    app_metadata: claims.app_metadata ?? {},
  };
});

/** The signed-in account resolved to its branch scope, once per request. */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const user = await getSessionUser();
  return user ? resolveAuthUser(user) : null;
});

/**
 * For a page: the signed-in user and their account, or a redirect to login.
 * Replaces the three-line preamble every page used to repeat.
 */
export async function requirePageUser(): Promise<{ user: SessionIdentity; authUser: AuthUser }> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const authUser = await getAuthUser();
  if (!authUser) redirect('/login');
  return { user, authUser };
}
