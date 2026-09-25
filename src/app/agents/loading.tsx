import { PageSkeleton, TableSkeleton, TitleSkeleton } from '@/components/skeleton';

/** Agents: the list with its money columns. */
export default function Loading() {
  return (
    <PageSkeleton width="max-w-[1200px]" label="Loading agents">
      <TitleSkeleton />
      <TableSkeleton rows={6} cols={10} />
    </PageSkeleton>
  );
}
