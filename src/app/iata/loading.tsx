import { PageSkeleton, CardsSkeleton, PanelSkeleton, TitleSkeleton } from '@/components/skeleton';

/** IATA settlements: the summary cards and one block per remittance day. */
export default function Loading() {
  return (
    <PageSkeleton width="max-w-[1400px]" label="Loading IATA settlements">
      <TitleSkeleton />
      <CardsSkeleton count={3} />
      <PanelSkeleton lines={4} />
      <PanelSkeleton lines={3} />
    </PageSkeleton>
  );
}
