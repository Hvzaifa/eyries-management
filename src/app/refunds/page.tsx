import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import AppHeader from '@/components/app-header';
import { listRefundedRounds } from '@/lib/pnrs';
import { resolveAuthUser } from '@/lib/auth';
import { formatPkr } from '@/lib/format';
import Link from 'next/link';
import { RotateCcw } from 'lucide-react';

export default async function RefundsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const authUser = await resolveAuthUser(user);
  const rows = await listRefundedRounds(authUser);

  return (
    <div className="min-h-screen flex flex-col bg-stone-50/50">
      <AppHeader user={user} breadcrumb={{ href: '/refunds', label: 'Refund Log' }} />

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        <div>
          <h1 className="text-xl font-bold text-stone-900 tracking-tight flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-violet-500" />
            Refund Log
          </h1>
          <p className="text-sm text-stone-500 mt-0.5">
            A comprehensive list of all EMD rounds marked as refunded.
          </p>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
          {rows.length === 0 ? (
            <div className="p-12 text-center text-sm text-stone-400">
              No refunded EMD rounds found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50/50 text-xs font-semibold text-stone-500">
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Refund Date</th>
                    <th className="px-4 py-3 font-medium">PNR</th>
                    <th className="px-4 py-3 font-medium">Branch</th>
                    <th className="px-4 py-3 font-medium">Airline</th>
                    <th className="px-4 py-3 font-medium">Seats / Sector</th>
                    <th className="px-4 py-3 font-medium">Round</th>
                    <th className="px-4 py-3 font-medium">Original Amt</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap text-right">Refund Amt (PKR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-stone-50/50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-stone-600">
                        {row.refund_date ? row.refund_date.toISOString().slice(0, 10) : '—'}
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-indigo-600">
                        <Link href={`/pnrs/${row.pnr_id}`} className="hover:underline">
                          {row.pnr}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-stone-600">
                        {row.branch_name ?? '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-stone-500">
                        {row.airline_code ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-stone-600 whitespace-nowrap">
                        {row.seats} <span className="text-stone-300">|</span> {row.sector ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-stone-600">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-violet-100 text-violet-700 text-xs font-bold">
                          {row.round_number}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-stone-400 font-mono">
                        {formatPkr(Number(row.emd_amount))}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-stone-900 text-right text-emerald-600 bg-emerald-50/30">
                        {/* formatPkr(Number(null)) would silently print "PKR 0.00" —
                            a missing amount must read as missing, not as zero. */}
                        {row.refund_amount === null ? '—' : formatPkr(Number(row.refund_amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
