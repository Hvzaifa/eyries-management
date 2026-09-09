import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { resolveAuthUser } from '@/lib/auth';
import { listPnrs } from '@/lib/pnrs';
import { todayIsoInPkt } from '@/lib/urgency';
import PnrTable from '@/components/pnr-table';
import AppHeader from '@/components/app-header';
import { RotateCcw, PlusCircle, Mail } from 'lucide-react';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const authUser = await resolveAuthUser(user);

  const rows = await listPnrs(authUser);

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader user={user} />

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-stone-900 tracking-tight">
              Welcome back
            </h1>
            <p className="text-sm text-stone-500 mt-0.5">
              Here is where every booking stands today.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {authUser.accountType === 'headoffice' && (
              <>
                <Link
                  href="/pnrs/batch-email"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-stone-700 bg-white border border-stone-200 hover:bg-stone-50 shadow-sm transition-all"
                >
                  <Mail className="w-4" />
                  Batch emails
                </Link>
                <Link
                  href="/pnrs/bulk-refund"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-stone-700 bg-white border border-stone-200 hover:bg-stone-50 shadow-sm transition-all"
                >
                  <RotateCcw className="w-4" />
                  Bulk refund
                </Link>
              </>
            )}
            <Link
              href="/pnrs/new"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-tr from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 shadow-md shadow-indigo-500/25 transition-all"
            >
              <PlusCircle className="w-4" />
              New booking
            </Link>
          </div>
        </div>

        {/* The cards live inside PnrTable: they re-total on every filter change,
            and the filters are the table's own state. */}
        <PnrTable rows={rows} todayIso={todayIsoInPkt()} />

        <p className="text-[11px] text-stone-400">
          Cards follow the filters above and show active PNRs unless a status is chosen. Total paid
          includes rounds later refunded (gross, never netted).
        </p>
      </main>

      <footer className="border-t border-stone-200 py-4">
        <p className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 text-[11px] text-stone-400">
          Eyries EMD · internal booking tracker · amounts in PKR
        </p>
      </footer>
    </div>
  );
}

