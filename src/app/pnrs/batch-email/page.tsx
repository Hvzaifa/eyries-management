import { resolveAuthUser, isHeadOffice } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import AppHeader from '@/components/app-header';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { redirect } from 'next/navigation';
import BatchEmailForm from './batch-email-form';
import { getPnrFormOptions } from '@/lib/pnrs';

export const metadata = {
  title: 'Batch Emails | Eyries',
};

export default async function BatchEmailPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const authUser = await resolveAuthUser(user);
  if (!isHeadOffice(authUser)) {
    redirect('/');
  }

  // Head-office only (non-HQ is redirected above), so the unscoped list is correct here.
  const options = await getPnrFormOptions(authUser);

  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      <AppHeader user={user} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        <div>
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-500 hover:text-stone-800 transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">Batch Airline Emails</h1>
          <p className="text-sm text-stone-500 mt-1">
            Fetch PNRs and send a single combined email to a specific airline (e.g. for deposit confirmation).
          </p>
        </div>

        <BatchEmailForm airlines={options.airlines} />
      </main>

      <footer className="border-t border-stone-200 py-4 mt-8">
        <p className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 text-[11px] text-stone-400">
          Eyries EMD · internal booking tracker
        </p>
      </footer>
    </div>
  );
}
