import { redirect } from 'next/navigation';
import { requirePageUser } from '@/lib/server/session';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import AppHeader from '@/components/app-header';
import { isHeadOffice } from '@/lib/auth';
import { getBulkEmdCandidates } from '../actions/bulk-emd';
import { MAX_BULK_EMD_ISSUES } from '@/lib/bulk-emd';
import { getPnrFormOptions } from '@/lib/pnrs';
import { todayIsoInPkt } from '@/lib/urgency';
import BulkEmdForm from './bulk-emd-form';

export const metadata = {
  title: 'Issue EMDs | Eyries',
};

/**
 * Issue EMDs against the bookings ticked on the dashboard.
 *
 * The selection arrives as `?ids=` rather than in session storage so the page
 * can be reloaded, opened in a second tab, or sent to a colleague, and still
 * show the same bookings.
 */
export default async function BulkEmdPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { user, authUser } = await requirePageUser();
  if (!isHeadOffice(authUser)) redirect('/');

  const { ids } = await searchParams;
  const pnrIds = (ids ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Fetched together rather than one after another.
  const [candidates, options] = await Promise.all([
    getBulkEmdCandidates(pnrIds),
    getPnrFormOptions(authUser),
  ]);
  const requested = pnrIds.length;

  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      <AppHeader user={user} subtitle="Issue EMDs" />

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-500 hover:text-stone-800 transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to dashboard
          </Link>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">Issue EMDs</h1>
          <p className="text-sm text-stone-500 mt-1">
            Percentage, amount and the new time limit are filled in from each booking and its
            airline policy. Type the EMD number the airline gave you; correct anything else that
            does not match.
          </p>
        </div>

        {requested === 0 ? (
          <EmptyState
            title="No bookings selected"
            body="Tick the bookings you want to issue EMDs for on the dashboard, then choose Issue EMDs."
          />
        ) : candidates.length === 0 ? (
          <EmptyState
            title="Those bookings could not be found"
            body="They may have been deleted since the dashboard was loaded. Go back and select again."
          />
        ) : (
          <BulkEmdForm
            candidates={candidates}
            licenses={options.licenses}
            today={todayIsoInPkt()}
            max={MAX_BULK_EMD_ISSUES}
          />
        )}
      </main>

      <footer className="border-t border-stone-200 py-4 mt-8">
        <p className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 text-[11px] text-stone-400">
          Eyries EMD · internal booking tracker
        </p>
      </footer>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center shadow-sm">
      <p className="text-sm font-semibold text-stone-800">{title}</p>
      <p className="mt-1 text-sm text-stone-500">{body}</p>
      <Link
        href="/"
        className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-tr from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 shadow-md shadow-indigo-500/20 transition-all"
      >
        Go to the dashboard
      </Link>
    </div>
  );
}
