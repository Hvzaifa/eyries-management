import { PageSkeleton, PanelSkeleton, TitleSkeleton } from '@/components/skeleton';

/** Editing a booking: the form. */
export default function Loading() {
  return (
    <PageSkeleton width="max-w-[1200px]" label="Loading form">
      <TitleSkeleton />
      <PanelSkeleton lines={8} />
      <PanelSkeleton lines={4} />
    </PageSkeleton>
  );
}
