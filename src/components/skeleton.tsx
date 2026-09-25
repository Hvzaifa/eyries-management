import { Plane } from 'lucide-react';

/**
 * Loading placeholders, shown the instant a link is clicked while the server
 * fetches the page (`loading.tsx` in each route).
 *
 * Next.js prefetches a route's `loading.tsx`, so the skeleton appears without a
 * network wait and the real page streams in behind it. Before these existed, a
 * click showed nothing at all until the whole page had been fetched.
 *
 * Plain Tailwind blocks in the app's own palette — no library. The shapes follow
 * the real layouts closely enough that nothing jumps when the content arrives.
 */

/** One grey block. */
export function Bone({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-stone-200/70 ${className}`} />;
}

/**
 * The header, drawn without any data. Pages render their own `AppHeader`, which
 * needs the signed-in account, so the skeleton stands in for it with the parts
 * that never change.
 */
export function HeaderSkeleton() {
  return (
    <header className="border-b border-stone-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <Plane className="w-5 h-5 -rotate-45" />
          </div>
          <span className="font-bold text-base text-stone-900 tracking-tight">Eyries EMD</span>
        </div>
        <div className="flex items-center gap-4">
          <Bone className="h-4 w-14" />
          <Bone className="h-4 w-14" />
          <Bone className="h-7 w-24 rounded-xl" />
        </div>
      </div>
    </header>
  );
}

/** Page frame: header, a main area, and an accessible "loading" announcement. */
export function PageSkeleton({
  children,
  width = 'max-w-[1600px]',
  label = 'Loading',
}: {
  children: React.ReactNode;
  width?: string;
  label?: string;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <HeaderSkeleton />
      <main
        className={`${width} mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6`}
        aria-busy="true"
      >
        {/* Screen readers hear this; the grey blocks mean nothing to them. */}
        <span className="sr-only" role="status">
          {label}…
        </span>
        {children}
      </main>
    </div>
  );
}

/** A row of summary cards. */
export function CardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <Bone className="h-3 w-20" />
            <Bone className="h-7 w-7" />
          </div>
          <Bone className="mt-3 h-5 w-28" />
        </div>
      ))}
    </section>
  );
}

/** A table: header strip and some rows. */
export function TableSkeleton({ rows = 8, cols = 7 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex gap-6 border-b border-stone-200 bg-[#FAF7F1] px-4 py-3.5">
        {Array.from({ length: cols }, (_, i) => (
          <Bone key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-6 border-b border-stone-100 px-4 py-4 last:border-0">
          {Array.from({ length: cols }, (_, c) => (
            <Bone key={c} className={`h-3 flex-1 ${c === 0 ? 'max-w-12' : ''}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A white section with a title and some lines. */
export function PanelSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-3">
      <Bone className="h-4 w-40" />
      {Array.from({ length: lines }, (_, i) => (
        <Bone key={i} className={`h-3 ${i % 3 === 2 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </section>
  );
}

/** A page title block. */
export function TitleSkeleton() {
  return (
    <div className="space-y-2">
      <Bone className="h-7 w-56" />
      <Bone className="h-3.5 w-96 max-w-full" />
    </div>
  );
}
