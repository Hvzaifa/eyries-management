import { resolveAuthUser, isHeadOffice } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import AppHeader from '@/components/app-header';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import BulkRefundForm from './bulk-refund-form';
import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Bulk EMD Refund | Eyries',
};

export default async function BulkRefundPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const authUser = await resolveAuthUser(user);
  if (!isHeadOffice(authUser)) {
    redirect('/');
  }

  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      <AppHeader user={user} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        <div>
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-500 hover:text-stone-800 transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">Bulk EMD Refund</h1>
          <p className="text-sm text-stone-500 mt-1">
            Fetch active EMD rounds across multiple bookings and mark them as refunded at once.
          </p>
        </div>

        <BulkRefundForm />
      </main>

      <footer className="border-t border-stone-200 py-4 mt-8">
        <p className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 text-[11px] text-stone-400">
          Eyries EMD · internal booking tracker
        </p>
      </footer>
    </div>
  );
}
