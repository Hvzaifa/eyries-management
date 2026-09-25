'use client';

import ErrorPanel from '@/components/error-panel';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPanel error={error} reset={reset} what="this booking" />;
}
