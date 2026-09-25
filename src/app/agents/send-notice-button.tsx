'use client';

import { useState, useTransition } from 'react';
import { Send, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { sendAgentNotice } from './actions';

/**
 * Sends one agent a notice about one booking. A **human click** — the daily
 * email reports who is due, it never writes to an agent itself.
 *
 * Subject and body are pre-filled and editable; the **recipient is a fixed
 * list** of the agent's recorded addresses, never a free-text field. That is
 * the open-relay guard made visible — and it is enforced again on the server,
 * because a control that only exists in the form is decoration
 * (`decisions.md`, 2026-09-07).
 */
export default function SendNoticeButton({
  assignmentId,
  agentName,
  pnrCode,
  contactEmails,
  defaultSubject,
  defaultBody,
}: {
  assignmentId: string;
  agentName: string;
  pnrCode: string;
  contactEmails: string[];
  defaultSubject: string;
  defaultBody: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [recipient, setRecipient] = useState(contactEmails[0] ?? '');
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);

  const inputCls =
    'w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400 transition-colors';

  // No address on file means there is nowhere approved to send. Shown as a
  // disabled prompt rather than a button that would only fail on the server.
  if (contactEmails.length === 0) {
    return (
      <span
        title={`No contact email is recorded for ${agentName}. Add one to their record first.`}
        className="text-[10px] text-amber-600 whitespace-nowrap"
      >
        no email on file
      </span>
    );
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await sendAgentNotice({ assignmentId, recipient, subject, body });
      if (res?.error) {
        setError(res.error);
        return;
      }
      setSent(true);
      setIsOpen(false);
    });
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`text-[10px] font-medium inline-flex items-center gap-1 cursor-pointer border px-2 py-1 rounded-md shadow-sm transition-colors ${
          sent
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-stone-200 bg-white text-stone-500 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700'
        }`}
      >
        {sent ? <CheckCircle2 className="w-3 h-3" /> : <Send className="w-3 h-3" />}
        {sent ? 'Notice sent' : 'Send notice'}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-stone-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-stone-900">Send notice to {agentName}</h3>
                <p className="text-[11px] text-stone-400 mt-0.5">PNR {pnrCode}</p>
              </div>
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
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">To</label>
                <select
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className={`${inputCls} cursor-pointer`}
                >
                  {contactEmails.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-stone-400">
                  Only addresses recorded on this agent can be used. To send somewhere else, add it
                  to their record first.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">Message</label>
                <textarea
                  rows={12}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className={`${inputCls} font-mono text-[12px] leading-relaxed`}
                />
              </div>

              <div className="pt-1 flex justify-end gap-2">
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
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isPending ? 'Sending…' : 'Send notice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
