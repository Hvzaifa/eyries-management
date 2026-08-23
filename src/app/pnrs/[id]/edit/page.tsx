import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { canEdit, getUserRole } from '@/lib/types/auth';
import { getPnrDetail, getPnrFormOptions } from '@/lib/pnrs';
import PnrForm, { type PnrFormValues } from '@/components/pnr-form';
import AppHeader from '@/components/app-header';
import { updatePnr } from '../../actions';

export default async function EditPnrPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (!canEdit(getUserRole(user))) redirect('/');

  const { id } = await params;
  const [detail, options] = await Promise.all([getPnrDetail(id), getPnrFormOptions()]);
  if (!detail) notFound();

  const initial: PnrFormValues = {
    id: detail.id,
    requestDate: detail.requestDate,
    investorCompany: detail.investorCompany,
    licenseId: detail.licenseId ?? '',
    branchId: detail.branchId ?? '',
    pnr: detail.pnr,
    gdsPnr: detail.gdsPnr ?? '',
    segment: detail.segment ?? '',
    airlineId: detail.airlineId ?? '',
    seats: String(detail.seats),
    outboundDate: detail.outboundDate ?? '',
    inboundDate: detail.inboundDate ?? '',
    sector: detail.sector ?? '',
    pnrTlDate: detail.pnrTlDate ?? '',
    dealPct: detail.dealPct === null ? '' : String(detail.dealPct),
    issuedStatus: detail.issuedStatus,
    status: detail.status,
    fare: String(detail.fare),
    airlineTaxes: detail.airlineTaxes === null ? '' : String(detail.airlineTaxes),
    psf: detail.psf === null ? '' : String(detail.psf),
  };

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader
        user={user}
        subtitle="Edit booking"
        breadcrumb={{ href: `/pnrs/${id}`, label: 'Detail' }}
      />

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-5">
        <div>
          <h1 className="text-xl font-bold text-stone-900 tracking-tight font-mono">{detail.pnr}</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Changes are recorded field-by-field in the change history.
          </p>
        </div>

        <PnrForm mode="edit" options={options} initial={initial} action={updatePnr} />
      </main>
    </div>
  );
}
