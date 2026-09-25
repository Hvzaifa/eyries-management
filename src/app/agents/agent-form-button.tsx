'use client';

import { useState, useTransition } from 'react';
import { Plus, Pencil, X, AlertTriangle } from 'lucide-react';
import { createAgent, updateAgent } from './actions';

export interface AgentValues {
  id: string;
  name: string;
  b2bCode: string | null;
  contactEmails: string[];
  contactPhone: string | null;
  active: boolean;
}

export default function AgentFormButton({ agent }: { agent?: AgentValues }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const editing = agent !== undefined;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    if (editing) formData.append('id', agent.id);

    startTransition(async () => {
      const res = editing ? await updateAgent(formData) : await createAgent(formData);
      if (res?.error) {
        setError(res.error);
      } else {
        setIsOpen(false);
      }
    });
  };

  const inputCls =
    'w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400 transition-colors';

  return (
    <>
      {editing ? (
        <button
          onClick={() => setIsOpen(true)}
          className="text-stone-400 hover:text-stone-600 p-1.5 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
          title="Edit agent"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl text-white bg-gradient-to-tr from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 shadow-md shadow-indigo-500/20 transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          New agent
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-stone-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-stone-900">
                {editing ? `Edit ${agent.name}` : 'New agent'}
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-stone-400 hover:text-stone-600 p-1 rounded-md hover:bg-stone-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {error && (
                <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">
                  Agent name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  defaultValue={agent?.name ?? ''}
                  placeholder="e.g. QFC Group (Pvt) Ltd"
                  className={inputCls}
                />
                <p className="mt-1 text-[11px] text-stone-400">
                  Matched ignoring case and spacing, so one agent cannot be added twice.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">B2B code</label>
                  <input
                    type="text"
                    name="b2b_code"
                    defaultValue={agent?.b2bCode ?? ''}
                    placeholder="e.g. B2B6022"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">Phone</label>
                  <input
                    type="text"
                    name="contact_phone"
                    defaultValue={agent?.contactPhone ?? ''}
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">
                  Contact emails
                </label>
                <textarea
                  name="contact_emails"
                  rows={2}
                  defaultValue={agent?.contactEmails.join(', ') ?? ''}
                  placeholder="bookings@agent.com, accounts@agent.com"
                  className={inputCls}
                />
                <p className="mt-1 text-[11px] text-stone-400">
                  Separate with commas. Dues notices can only be sent to an address recorded here.
                </p>
              </div>

              {editing && (
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">Status</label>
                  <select name="active" defaultValue={String(agent.active)} className={`${inputCls} cursor-pointer`}>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                  <p className="mt-1 text-[11px] text-stone-400">
                    Inactive agents stay on their existing bookings but are not offered for new ones.
                  </p>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-xs font-medium rounded-xl hover:bg-stone-100 text-stone-600 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? 'Saving...' : editing ? 'Save changes' : 'Create agent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
