import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { canEdit, getUserRole } from '@/lib/types/auth';
import { getPnrFormOptions } from '@/lib/pnrs';
import AppHeader from '@/components/app-header';
import AiIntakeForm from '@/components/ai-intake-form';
import { createPnr } from '../../actions';

export default async function AiIntakePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (!canEdit(getUserRole(user))) redirect('/');

  const options = await getPnrFormOptions();

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader user={user} subtitle="AI intake" breadcrumb={{ href: '/', label: 'Dashboard' }} />

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-5">
        <div>
          <h1 className="text-xl font-bold text-stone-900 tracking-tight">Paste &amp; parse</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Paste an airline confirmation message and let the AI extract the booking details.
          </p>
        </div>

        <AiIntakeForm options={options} action={createPnr} />
      </main>
    </div>
  );
}
