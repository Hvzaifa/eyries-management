import { PageSkeleton, PanelSkeleton, TitleSkeleton, Bone } from '@/components/skeleton';

/** One booking: title, details, seat ownership, EMD rounds, ticketing, history. */
export default function Loading() {
  return (
    <PageSkeleton width="max-w-[1200px]" label="Loading booking">
      <Bone className="h-4 w-32" />
      <TitleSkeleton />
      <PanelSkeleton lines={6} />
      <PanelSkeleton lines={3} />
      <PanelSkeleton lines={5} />
      <PanelSkeleton lines={3} />
    </PageSkeleton>
  );
}
