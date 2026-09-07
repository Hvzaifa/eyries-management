import { type NextRequest } from 'next/server';
import { updateSession } from './lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     * - api/cron (scheduled jobs — see below)
     *
     * api/cron MUST stay excluded. Vercel Cron calls these routes as an
     * anonymous HTTP request with no Supabase session, so the redirect below
     * would bounce it to /login and the job would never run. The route
     * authenticates itself with the CRON_SECRET bearer token instead; that
     * check is only reachable if middleware lets the request through.
     */
    '/((?!api/cron|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
