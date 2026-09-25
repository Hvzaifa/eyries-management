import { PageSkeleton, TableSkeleton, TitleSkeleton } from '@/components/skeleton';

/** Refund log. */
export default function Loading() {
  return (
    <PageSkeleton label="Loading refunds">
      <TitleSkeleton />
      <TableSkeleton rows={8} cols={8} />
    </PageSkeleton>
  );
}
