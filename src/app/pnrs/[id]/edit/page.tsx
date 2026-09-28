import { redirect, notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/server/session';
import { canEditPnr } from '@/lib/auth';
import { getPnrDetail, getPnrFormOptions } from '@/lib/pnrs';
import PnrForm from '@/components/pnr-form';
import type { PnrFormValues } from '@/lib/pnr-form-values';
import { citiesFromSector, isTripType } from '@/lib/flight-details';
import AppHeader from '@/components/app-header';
import { updatePnr } from '../../actions/pnr';

export default async function EditPnrPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user, authUser } = await requirePageUser();

  const { id } = await params;
  const [detail, options] = await Promise.all([getPnrDetail(id, authUser), getPnrFormOptions(authUser)]);
  if (!detail) notFound();

  // Branch scoping: cannot edit if PNR is from another branch or EMD has been issued
  if (!canEditPnr(authUser, detail.branchId, detail.hasIssuedEmd)) {
    redirect(`/pnrs/${id}`);
  }

  const fromSector = detail.tripType ? null : citiesFromSector(detail.sector);

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
    pnrTlDate: detail.pnrTlDate ?? '',
    status: detail.status,
    // A booking saved before flight details existed has no trip type or cities.
    // Its trip type follows from whether it has a return date, and its cities
    // are read back from the sector it was saved with; the flight codes and
    // times are asked for on this save.
    tripType: isTripType(detail.tripType) ? detail.tripType : detail.inboundDate ? 'round_trip' : 'one_way',
    outboundDate: detail.outboundDate ?? '',
    outboundDepartureCity: detail.outboundDepartureCity ?? fromSector?.outboundDepartureCity ?? '',
    outboundArrivalCity: detail.outboundArrivalCity ?? fromSector?.outboundArrivalCity ?? '',
    outboundDepartureTime: detail.outboundDepartureTime ?? '',
    outboundArrivalTime: detail.outboundArrivalTime ?? '',
    outboundFlightCode: detail.outboundFlightCode ?? '',
    outboundBaggagePieces: detail.outboundBaggagePieces?.toString() ?? '',
    outboundBaggageKg: detail.outboundBaggageKg?.toString() ?? '',
    inboundDate: detail.inboundDate ?? '',
    inboundDepartureCity: detail.inboundDepartureCity ?? fromSector?.inboundDepartureCity ?? '',
    inboundArrivalCity: detail.inboundArrivalCity ?? fromSector?.inboundArrivalCity ?? '',
    inboundDepartureTime: detail.inboundDepartureTime ?? '',
    inboundArrivalTime: detail.inboundArrivalTime ?? '',
    inboundFlightCode: detail.inboundFlightCode ?? '',
    inboundBaggagePieces: detail.inboundBaggagePieces?.toString() ?? '',
    inboundBaggageKg: detail.inboundBaggageKg?.toString() ?? '',
    fare: String(detail.fare),
    airlineTaxes: detail.airlineTaxes === null ? '' : String(detail.airlineTaxes),
    psf: detail.psf === null ? '' : String(detail.psf),
  };

  // For branch users, filter options to only show their branch
  const filteredOptions = authUser.accountType === 'branch' && authUser.branchIds.length > 0
    ? {
        ...options,
        branches: options.branches.filter(b => authUser.branchIds.includes(b.id)),
      }
    : options;

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

        <PnrForm mode="edit" options={filteredOptions} initial={initial} action={updatePnr} />
      </main>
    </div>
  );
}
