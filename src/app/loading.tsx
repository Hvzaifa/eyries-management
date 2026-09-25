import { PageSkeleton, CardsSkeleton, TableSkeleton, Bone } from '@/components/skeleton';

/** Dashboard: the cards, the filter bar and the bookings table. */
export default function Loading() {
  return (
    <PageSkeleton label="Loading bookings">
      <CardsSkeleton count={6} />
      <div className="flex flex-wrap gap-3">
        <Bone className="h-9 w-72 rounded-xl" />
        <Bone className="h-9 w-32 rounded-xl" />
        <Bone className="h-9 w-32 rounded-xl" />
        <Bone className="h-9 w-32 rounded-xl" />
        <Bone className="h-9 w-40 rounded-xl" />
      </div>
      <TableSkeleton rows={10} cols={9} />
    </PageSkeleton>
  );
}
