'use client';

import { Suspense, useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { login, signup } from './actions';
import { Shield, Plane, UserCheck, AlertCircle, CheckCircle2, Lock, Mail, KeyRound } from 'lucide-react';

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/';
  const urlError = searchParams.get('error');

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [errorMessage, setErrorMessage] = useState<string | null>(urlError);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<'admin' | 'staff' | 'viewer'>('staff');
  const [isPending, startTransition] = useTransition();

  const handleQuickFill = (role: 'admin' | 'staff' | 'viewer') => {
    setMode('signin');
    setEmailInput(`${role}@eyries.com`);
    setPasswordInput('password123');
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const formData = new FormData(e.currentTarget);
    formData.set('redirectTo', redirectTo);

    startTransition(async () => {
      if (mode === 'signin') {
        const res = await login(formData);
        if (res?.error) {
          setErrorMessage(res.error);
        }
      } else {
        formData.set('role', selectedRole);
        const res = await signup(formData);
        if (res?.error) {
          setErrorMessage(res.error);
        } else if (res?.message) {
          setSuccessMessage(res.message);
        }
      }
    });
  };

  return (
    <div className="w-full max-w-md">
      {/* Header Branding */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white shadow-lg shadow-indigo-500/25 mb-4">
          <Plane className="w-7 h-7 transform -rotate-45" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">EMD Booking System</h1>
        <p className="text-sm text-slate-400 mt-1">Group Booking & Deadline Management</p>
      </div>

      {/* Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        {/* Mode Switcher */}
        <div className="flex p-1 bg-slate-950/80 rounded-xl border border-slate-800/80 mb-6">
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              mode === 'signin'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              mode === 'signup'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Feedback Messages */}
        {errorMessage && (
          <div className="mb-5 flex items-start gap-3 p-3.5 bg-rose-950/50 border border-rose-800/60 rounded-xl text-rose-300 text-xs leading-relaxed">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-5 flex items-start gap-3 p-3.5 bg-emerald-950/50 border border-emerald-800/60 rounded-xl text-emerald-300 text-xs leading-relaxed">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5" htmlFor="email">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="email"
                name="email"
                type="email"
                required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="name@company.com"
                autoComplete="email"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={6}
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>

          {/* Role Selection (Sign Up only) */}
          {mode === 'signup' && (
            <div className="pt-2">
              <label className="block text-xs font-medium text-slate-300 mb-2">
                System Role
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedRole('admin')}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                    selectedRole === 'admin'
                      ? 'border-indigo-500 bg-indigo-950/40 text-white shadow-sm'
                      : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <Shield className="w-4 h-4 mb-1 text-indigo-400" />
                  <span className="text-xs font-semibold">Admin</span>
                  <span className="text-[10px] text-slate-400 mt-0.5 leading-tight">Full access</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedRole('staff')}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                    selectedRole === 'staff'
                      ? 'border-indigo-500 bg-indigo-950/40 text-white shadow-sm'
                      : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <UserCheck className="w-4 h-4 mb-1 text-indigo-400" />
                  <span className="text-xs font-semibold">Staff</span>
                  <span className="text-[10px] text-slate-400 mt-0.5 leading-tight">Create & Edit</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedRole('viewer')}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                    selectedRole === 'viewer'
                      ? 'border-indigo-500 bg-indigo-950/40 text-white shadow-sm'
                      : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <Lock className="w-4 h-4 mb-1 text-indigo-400" />
                  <span className="text-xs font-semibold">Viewer</span>
                  <span className="text-[10px] text-slate-400 mt-0.5 leading-tight">Read only</span>
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full mt-4 flex items-center justify-center py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-600/25 transition-all cursor-pointer"
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing...
              </span>
            ) : mode === 'signin' ? (
              'Sign In'
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        {/* Quick Demo Fill Accounts */}
        <div className="mt-6 pt-5 border-t border-slate-800/80">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
              Quick Test Accounts
            </span>
            <span className="text-[10px] text-slate-400 font-mono">pwd: password123</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleQuickFill('admin')}
              className="py-1.5 px-2 bg-slate-950 hover:bg-indigo-950/40 border border-slate-800 hover:border-indigo-600/50 rounded-lg text-slate-300 hover:text-white text-xs font-medium transition-all"
            >
              Admin
            </button>
            <button
              type="button"
              onClick={() => handleQuickFill('staff')}
              className="py-1.5 px-2 bg-slate-950 hover:bg-indigo-950/40 border border-slate-800 hover:border-indigo-600/50 rounded-lg text-slate-300 hover:text-white text-xs font-medium transition-all"
            >
              Staff
            </button>
            <button
              type="button"
              onClick={() => handleQuickFill('viewer')}
              className="py-1.5 px-2 bg-slate-950 hover:bg-indigo-950/40 border border-slate-800 hover:border-indigo-600/50 rounded-lg text-slate-300 hover:text-white text-xs font-medium transition-all"
            >
              Viewer
            </button>
          </div>
        </div>
      </div>

      {/* Footer info */}
      <p className="text-center text-xs text-slate-400 mt-6">
        Authorized personnel only. Protected by role-based access control.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 py-12 text-slate-100 selection:bg-indigo-500 selection:text-white">
      <Suspense fallback={
        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          Loading portal...
        </div>
      }>
        <LoginForm />
      </Suspense>
    </div>
  );
}
