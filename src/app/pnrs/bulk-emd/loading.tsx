import { PageSkeleton, TableSkeleton, TitleSkeleton } from '@/components/skeleton';

/** Bulk EMD issuance: one row per selected booking. */
export default function Loading() {
  return (
    <PageSkeleton width="max-w-[1400px]" label="Loading bookings to issue">
      <TitleSkeleton />
      <TableSkeleton rows={5} cols={9} />
    </PageSkeleton>
  );
}
