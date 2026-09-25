import { PageSkeleton, PanelSkeleton, TableSkeleton, CardsSkeleton } from '@/components/skeleton';

/** One agent: who they are, the money summary, and their bookings. */
export default function Loading() {
  return (
    <PageSkeleton width="max-w-[1200px]" label="Loading agent">
      <PanelSkeleton lines={2} />
      <CardsSkeleton count={5} />
      <TableSkeleton rows={4} cols={10} />
    </PageSkeleton>
  );
}
