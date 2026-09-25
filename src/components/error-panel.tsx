'use client';

import Link from 'next/link';
import { AlertTriangle, RotateCw } from 'lucide-react';

/**
 * What a page shows when loading it failed — a way to retry instead of a blank
 * screen.
 *
 * **The error's message is never displayed.** A database or driver error can
 * carry query text, table names or connection details, and in production Next
 * already replaces server errors with a generic one for that reason. The only
 * thing shown is `digest`, an opaque id that matches the entry in the server
 * logs, so staff can quote it and a developer can find the real cause.
 */
export default function ErrorPanel({
  error,
  reset,
  what,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  what: string;
}) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full rounded-2xl border border-red-200 bg-white p-6 shadow-sm text-center">
        <AlertTriangle className="w-6 h-6 mx-auto text-red-500" />
        <h1 className="mt-3 text-base font-semibold text-stone-900">Couldn’t load {what}</h1>
        <p className="mt-1 text-sm text-stone-500">
          This is usually a brief connection problem. Nothing was changed.
        </p>
        {error.digest && (
          <p className="mt-3 text-[11px] text-stone-400">
            Reference <span className="font-mono">{error.digest}</span>
          </p>
        )}
        <div className="mt-5 flex justify-center gap-2">
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors cursor-pointer"
          >
            <RotateCw className="w-4 h-4" />
            Try again
          </button>
          <Link
            href="/"
            className="px-4 py-2 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-100 transition-colors"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
