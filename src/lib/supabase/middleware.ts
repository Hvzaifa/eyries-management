import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Never `getSession()` here: it trusts the cookie without verifying it.
  //
  // `getClaims()` verifies the JWT's signature against the project's published
  // keys, refreshing an expired session first (which is what writes the new
  // cookie through `setAll` above). With asymmetric signing keys that is a
  // local check — no request to Supabase Auth on every navigation, which cost
  // ~300 ms each (measured 2026-09-24). With the older symmetric keys it asks
  // the Auth server instead, so it is never weaker than the `getUser()` it
  // replaces. Server actions that write still call `getUser()` (see
  // `lib/server/guards.ts`) so a disabled account is refused immediately.
  const { data, error } = await supabase.auth.getClaims();
  const user = !error && data?.claims?.sub ? data.claims : null;

  const pathname = request.nextUrl.pathname;
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/auth');

  // If user is not authenticated and trying to access protected route, redirect to /login
  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    if (pathname !== '/') {
      url.searchParams.set('redirectTo', pathname);
    }
    return NextResponse.redirect(url);
  }

  // If user is authenticated and trying to access /login, redirect to /
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
