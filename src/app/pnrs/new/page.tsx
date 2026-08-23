import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { canEdit, getUserRole } from '@/lib/types/auth';
import { getPnrFormOptions } from '@/lib/pnrs';
import { EMPTY_PNR } from '@/components/pnr-form';
import PnrForm from '@/components/pnr-form';
import AppHeader from '@/components/app-header';
import { createPnr } from '../actions';

export default async function NewPnrPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (!canEdit(getUserRole(user))) redirect('/');

  const options = await getPnrFormOptions();

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader user={user} subtitle="New booking" breadcrumb={{ href: '/', label: 'Dashboard' }} />

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-5">
        <div>
          <h1 className="text-xl font-bold text-stone-900 tracking-tight">New booking</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Fill in the deal details. Every save is recorded in the change history.
          </p>
        </div>

        <PnrForm mode="create" options={options} initial={EMPTY_PNR} action={createPnr} />
      </main>
    </div>
  );
}
