import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { logout } from './login/actions';
import { getUserRole, canEdit, isAdmin } from '@/lib/types/auth';
import { 
  Plane, 
  Shield, 
  UserCheck, 
  Eye, 
  LogOut, 
  PlusCircle, 
  Settings, 
  CheckCircle2, 
  FileSpreadsheet,
  Calendar,
  Layers
} from 'lucide-react';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const role = getUserRole(user);
  const userCanEdit = canEdit(role);
  const userIsAdmin = isAdmin(role);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Plane className="w-5 h-5 -rotate-45" />
            </div>
            <div>
              <span className="font-bold text-base text-white tracking-tight">Eyries EMD</span>
              <span className="hidden sm:inline-block ml-2 text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-mono">
                Phase 1
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Role Badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs">
              {role === 'admin' && (
                <>
                  <Shield className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="font-semibold text-indigo-300">Admin</span>
                </>
              )}
              {role === 'staff' && (
                <>
                  <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="font-semibold text-emerald-300">Staff</span>
                </>
              )}
              {role === 'viewer' && (
                <>
                  <Eye className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-semibold text-amber-300">Viewer (Read-Only)</span>
                </>
              )}
            </div>

            {/* User details */}
            <span className="text-xs text-slate-400 hidden md:inline-block max-w-[180px] truncate">
              {user.email}
            </span>

            {/* Logout button */}
            <form action={logout}>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log Out</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-8">
        {/* Welcome Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 p-6 sm:p-8">
          <div className="relative z-10 max-w-3xl">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Group Airline Booking & EMD Management
            </h1>
            <p className="mt-2 text-sm sm:text-base text-slate-300 leading-relaxed">
              Authenticated as <span className="text-white font-medium">{user.email}</span> with role{' '}
              <span className="font-semibold uppercase text-indigo-400">{role}</span>.
            </p>
          </div>
        </div>

        {/* Role-Based Permissions Status Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-400" />
            Role-Based Access Control Verification
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* View Access */}
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300">Read & View PNRs</span>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                  Allowed
                </span>
              </div>
              <p className="text-xs text-slate-400">
                All roles (admin, staff, viewer) can view PNRs, deadlines, and reports.
              </p>
            </div>

            {/* Edit Access */}
            <div className={`p-4 rounded-xl border ${
              userCanEdit 
                ? 'border-emerald-800/60 bg-emerald-950/20' 
                : 'border-rose-900/40 bg-rose-950/10'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300">Create / Edit Data</span>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                  userCanEdit
                    ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                    : 'bg-rose-950 text-rose-400 border-rose-800'
                }`}>
                  {userCanEdit ? 'Active for your role' : 'Blocked (Viewer)'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Restricted to <span className="text-slate-200">staff</span> and <span className="text-slate-200">admin</span>. Viewers are blocked from editing.
              </p>
            </div>

            {/* Admin Access */}
            <div className={`p-4 rounded-xl border ${
              userIsAdmin 
                ? 'border-indigo-800/60 bg-indigo-950/20' 
                : 'border-slate-800 bg-slate-950/60'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300">Admin Management</span>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                  userIsAdmin
                    ? 'bg-indigo-950 text-indigo-400 border-indigo-800'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {userIsAdmin ? 'Active for your role' : 'Admin only'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Manage system lookup tables (licenses, branches, airlines) and user roles.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls & Next Steps */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Quick Actions (Demonstrating Role-Based Guard) */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-200">Interactive Action Controls</h3>
            <p className="text-xs text-slate-400">
              Interactive test buttons showing role-based permission enforcement:
            </p>

            <div className="space-y-3 pt-2">
              <button
                disabled={!userCanEdit}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-semibold border transition-all ${
                  userCanEdit
                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-md shadow-indigo-600/20 cursor-pointer'
                    : 'bg-slate-950/80 text-slate-500 border-slate-800 cursor-not-allowed'
                }`}
              >
                <span className="flex items-center gap-2">
                  <PlusCircle className="w-4 h-4" />
                  <span>Create / Edit PNR (Step 5)</span>
                </span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-black/30">
                  {userCanEdit ? 'Enabled' : 'Disabled for Viewer'}
                </span>
              </button>

              <button
                disabled={!userIsAdmin}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-semibold border transition-all ${
                  userIsAdmin
                    ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700 cursor-pointer'
                    : 'bg-slate-950/80 text-slate-500 border-slate-800 cursor-not-allowed'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  <span>Manage System Lookups & Roles</span>
                </span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-black/30">
                  {userIsAdmin ? 'Admin Only' : 'Locked'}
                </span>
              </button>
            </div>
          </div>

          {/* Phase 1 Roadmap Status */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-3">
            <h3 className="text-sm font-semibold text-slate-200">Phase 1 Steps Overview</h3>
            <ul className="space-y-2.5 text-xs">
              <li className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>Step 1: DB Schema & Seeding (Complete)</span>
              </li>
              <li className="flex items-center gap-2 text-indigo-400 font-medium">
                <div className="w-4 h-4 rounded-full border-2 border-indigo-400 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                </div>
                <span>Step 2: Authentication & Roles (Under Review)</span>
              </li>
              <li className="flex items-center gap-2 text-slate-500">
                <FileSpreadsheet className="w-4 h-4 flex-shrink-0" />
                <span>Step 3: PNR list (dashboard) with TanStack Table</span>
              </li>
              <li className="flex items-center gap-2 text-slate-500">
                <Layers className="w-4 h-4 flex-shrink-0" />
                <span>Step 4: PNR detail page & activity log</span>
              </li>
              <li className="flex items-center gap-2 text-slate-500">
                <Calendar className="w-4 h-4 flex-shrink-0" />
                <span>Step 7: Daily deadline-check job (Resend email)</span>
              </li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
