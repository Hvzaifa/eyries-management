import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { resolveAuthUser } from '@/lib/auth';
import { getPnrFormOptions } from '@/lib/pnrs';
import { EMPTY_PNR } from '@/components/pnr-form';
import PnrForm from '@/components/pnr-form';
import AppHeader from '@/components/app-header';
import { createPnr } from '../actions/pnr';
import Link from 'next/link';
import { Bot } from 'lucide-react';

export default async function NewPnrPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const authUser = await resolveAuthUser(user);
  const options = await getPnrFormOptions(authUser);

  // Branch users: filter options to only their branch, and pre-fill branchId
  const filteredOptions = authUser.accountType === 'branch' && authUser.branchIds.length > 0
    ? {
        ...options,
        branches: options.branches.filter(b => authUser.branchIds.includes(b.id)),
      }
    : options;

  const initial = authUser.accountType === 'branch' && authUser.branchId
    ? { ...EMPTY_PNR, branchId: authUser.branchId }
    : EMPTY_PNR;

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader user={user} subtitle="New booking" breadcrumb={{ href: '/', label: 'Dashboard' }} />

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-stone-900 tracking-tight">New booking</h1>
            <p className="text-sm text-stone-500 mt-0.5">
              Fill in the deal details. Every save is recorded in the change history.
            </p>
          </div>
          <Link
            href="/pnrs/new/ai"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl transition-colors"
          >
            <Bot className="w-4 h-4" />
            Or paste an airline message →
          </Link>
        </div>

        <PnrForm mode="create" options={filteredOptions} initial={initial} action={createPnr} />
      </main>
    </div>
  );
}
