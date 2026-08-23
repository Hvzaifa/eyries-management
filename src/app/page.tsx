import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { canEdit, getUserRole } from '@/lib/types/auth';
import { getDashboardTotals, listPnrs } from '@/lib/pnrs';
import { todayIsoInPkt } from '@/lib/urgency';
import PnrTable from './pnr-table';
import AppHeader from '@/components/app-header';
import { formatPkr } from '@/lib/format';
import {
  FileText,
  Users,
  Wallet,
  ArrowDownToLine,
  RotateCcw,
  PlusCircle,
} from 'lucide-react';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [rows, totals] = await Promise.all([listPnrs(), getDashboardTotals()]);
  const userCanEdit = canEdit(getUserRole(user));

  const cards = [
    { label: 'Active PNRs', value: String(totals.activePnrs), icon: FileText, tint: 'bg-indigo-100 text-indigo-600' },
    { label: 'Total Seats', value: String(totals.totalSeats), icon: Users, tint: 'bg-sky-100 text-sky-600' },
    { label: 'Total EMD Value', value: formatPkr(totals.totalEmdValue), icon: Wallet, tint: 'bg-violet-100 text-violet-600' },
    { label: 'Total Paid', value: formatPkr(totals.totalPaid), icon: ArrowDownToLine, tint: 'bg-emerald-100 text-emerald-600' },
    { label: 'Total Refunded', value: formatPkr(totals.totalRefunded), icon: RotateCcw, tint: 'bg-amber-100 text-amber-600' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader user={user} />

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-stone-900 tracking-tight">
              Welcome back
            </h1>
            <p className="text-sm text-stone-500 mt-0.5">
              Here is where every booking stands today.
            </p>
          </div>
          {userCanEdit && (
            <Link
              href="/pnrs/new"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-tr from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 shadow-md shadow-indigo-500/25 transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              New booking
            </Link>
          )}
        </div>

        <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {cards.map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
                  {card.label}
                </p>
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${card.tint}`}>
                  <card.icon className="w-3.5 h-3.5" />
                </span>
              </div>
              <p className="mt-2 text-lg font-bold text-stone-900 tabular-nums">{card.value}</p>
            </div>
          ))}
        </section>
        <p className="text-[11px] text-stone-400 -mt-3">
          Totals come from the dashboard_totals view, reflect active PNRs only, and do not change
          with the filters below. Total paid includes rounds later refunded (gross, never netted).
        </p>

        <PnrTable rows={rows} todayIso={todayIsoInPkt()} />
      </main>

      <footer className="border-t border-stone-200 py-4">
        <p className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 text-[11px] text-stone-400">
          Eyries EMD · internal booking tracker · amounts in PKR
        </p>
      </footer>
    </div>
  );
}

