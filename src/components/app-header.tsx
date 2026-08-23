import { logout } from '@/app/login/actions';
import { getUserRole, canEdit } from '@/lib/types/auth';
import type { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { Plane, LogOut } from 'lucide-react';

export default function AppHeader({
  user,
  subtitle,
  breadcrumb,
}: {
  user: User;
  subtitle?: string;
  breadcrumb?: { href: string; label: string };
}) {
  const role = getUserRole(user);
  const userCanEdit = canEdit(role);

  return (
    <header className="border-b border-stone-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Plane className="w-5 h-5 -rotate-45" />
            </div>
            <div>
              <span className="font-bold text-base text-stone-900 tracking-tight">Eyries EMD</span>
              <span className="hidden sm:inline-block ml-2 text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 font-medium">
                {subtitle ?? 'PNR Dashboard'}
              </span>
            </div>
          </Link>
          {breadcrumb && (
            <nav className="hidden sm:flex items-center gap-1.5 ml-2 text-xs text-stone-400">
              <Link href={breadcrumb.href} className="hover:text-indigo-600 transition-colors">
                {breadcrumb.label}
              </Link>
            </nav>
          )}
        </div>

        <div className="flex items-center gap-4">
          <span className="text-xs px-3 py-1.5 rounded-xl bg-stone-100 border border-stone-200 capitalize font-medium text-stone-600">
            {role}
          </span>
          {!userCanEdit && (
            <span className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
              read-only
            </span>
          )}
          <span className="text-xs text-stone-500 hidden md:inline-block max-w-[180px] truncate">
            {user.email}
          </span>
          <form action={logout}>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 bg-white hover:bg-stone-50 border border-stone-300 rounded-xl shadow-sm transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Out</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
