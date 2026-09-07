'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Search, Mail, XCircle } from 'lucide-react';
import { fetchPnrsForBatchEmail, sendBatchAirlineEmails } from '../actions/email';
import Link from 'next/link';

type AirlineOption = { id: string; name: string; contactEmails: string[] };

type FetchedPnr = {
  id: string;
  pnr: string;
  investorCompany: string;
  airlineId: string | null;
  airline: { name: string; contactEmails: string[] } | null;
  sector: string | null;
  seats: number;
  outboundDate: string | null;
};

export default function BatchEmailForm({ airlines }: { airlines: AirlineOption[] }) {
  const router = useRouter();
  
  const [targetAirlineId, setTargetAirlineId] = useState('');
  const [pnrInput, setPnrInput] = useState('');
  
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  
  const [fetchedPnrs, setFetchedPnrs] = useState<FetchedPnr[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const [emailType, setEmailType] = useState('Deposit Confirmation');
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const targetAirline = airlines.find(a => a.id === targetAirlineId);

  // The recipient is always one of the airline's own recorded contacts — the
  // server enforces this, so offering a free-text box only invited a rejection.
  // Reset it whenever the airline changes so a previous airline's address can
  // never be carried over to the next one.
  useEffect(() => {
    setRecipient(targetAirline?.contactEmails[0] ?? '');
  }, [targetAirline]);

  const handleFetch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetAirlineId) {
      setError('Please select a target airline first.');
      return;
    }
    
    setError(null);
    const codes = pnrInput.split(/[\s,]+/).filter(Boolean);
    
    if (codes.length === 0) {
      setError('Please enter at least one PNR code.');
      return;
    }

    startTransition(async () => {
      const res = await fetchPnrsForBatchEmail(codes);
      if (res?.error) {
        setError(res.error);
      } else if (res?.pnrs) {
        setFetchedPnrs(res.pnrs);
        // Auto-select valid PNRs
        const validIds = new Set(
          res.pnrs.filter(p => p.airlineId === targetAirlineId).map(p => p.id)
        );
        setSelectedIds(validIds);
      }
    });
  };

  const togglePnr = (id: string, valid: boolean) => {
    if (!valid) return;
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleAll = (select: boolean) => {
    if (!fetchedPnrs) return;
    if (select) {
      const validIds = new Set(
        fetchedPnrs.filter(p => p.airlineId === targetAirlineId).map(p => p.id)
      );
      setSelectedIds(validIds);
    } else {
      setSelectedIds(newSet => {
        const remaining = new Set(newSet);
        fetchedPnrs.forEach(p => remaining.delete(p.id));
        return remaining;
      });
    }
  };

  // Auto-generate template when selections change
  useEffect(() => {
    if (!fetchedPnrs || selectedIds.size === 0 || !targetAirline) {
      setSubject('');
      setBody('');
      return;
    }

    const selectedList = fetchedPnrs.filter(p => selectedIds.has(p.id));
    const pnrCodes = selectedList.map(p => p.pnr).join(', ');

    if (emailType === 'Deposit Confirmation') {
      setSubject(`EMD Deposit Confirmation - PNRs: ${pnrCodes}`);
      
      let bodyText = `Dear ${targetAirline.name} team,\n\n`;
      bodyText += `Please be advised that the initial deposit has been successfully processed for our group bookings below:\n\n`;
      
      selectedList.forEach(p => {
        bodyText += `- PNR: ${p.pnr} | Sector: ${p.sector || 'TBD'} | Seats: ${p.seats} | Travel Date: ${p.outboundDate || 'TBD'}\n`;
      });

      bodyText += `\nAs the initial deposit is confirmed, we will now track and process the EMD-2 requirements according to standard policy.\n\n`;
      bodyText += `Best regards,\nEyries Team`;
      
      setBody(bodyText);
    } else {
      setSubject(`Notice regarding PNRs: ${pnrCodes}`);
      let bodyText = `Dear ${targetAirline.name} team,\n\n`;
      bodyText += `Regarding our group bookings below:\n\n`;
      selectedList.forEach(p => {
        bodyText += `- PNR: ${p.pnr}\n`;
      });
      bodyText += `\n\nBest regards,\nEyries Team`;
      setBody(bodyText);
    }
  }, [fetchedPnrs, selectedIds, emailType, targetAirline]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.size === 0) {
      setError('Please select at least one valid PNR.');
      return;
    }
    
    setError(null);
    startTransition(async () => {
      const res = await sendBatchAirlineEmails({
        airlineId: targetAirlineId,
        pnrIds: Array.from(selectedIds),
        recipient,
        subject,
        body
      });
      
      if (res?.error) {
        setError(res.error);
      } else {
        router.push('/');
        router.refresh();
      }
    });
  };

  const inputCls = "w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400 transition-colors";

  return (
    <div className="space-y-6">
      <div className="bg-white border border-stone-200 shadow-sm rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-stone-100 bg-stone-50/50">
          <h2 className="text-sm font-semibold text-stone-900 mb-1">Target Airline & PNRs</h2>
          <p className="text-xs text-stone-500 mb-4">
            Select the airline you are emailing, then paste the PNR codes. PNRs belonging to other airlines will be flagged.
          </p>
          
          <form onSubmit={handleFetch} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1.5">Target Airline</label>
              <select 
                value={targetAirlineId} 
                onChange={e => setTargetAirlineId(e.target.value)} 
                className={`${inputCls} font-medium`}
                required
              >
                <option value="">-- Select Airline --</option>
                {airlines.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1.5">PNR Codes</label>
              <textarea
                value={pnrInput}
                onChange={e => setPnrInput(e.target.value)}
                placeholder="e.g. Q2X8B, P9R4C"
                rows={3}
                className={`${inputCls} font-mono uppercase`}
                required
              />
            </div>
            
            {error && !fetchedPnrs && (
              <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            
            <div className="flex justify-end gap-3">
              <Link href="/" className="px-4 py-2 text-sm font-medium rounded-xl text-stone-600 hover:bg-stone-100 transition-colors">
                Cancel
              </Link>
              <button
                type="submit"
                disabled={isPending || pnrInput.trim().length === 0 || !targetAirlineId}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-stone-900 hover:bg-stone-800 transition-colors disabled:opacity-50"
              >
                <Search className="w-4 h-4" />
                {isPending && !fetchedPnrs ? 'Fetching...' : 'Fetch PNRs'}
              </button>
            </div>
          </form>
        </div>

        {fetchedPnrs && (
          <form onSubmit={handleSubmit}>
            <div className="p-0 border-b border-stone-100">
              <div className="px-6 py-4 flex items-center justify-between bg-white border-b border-stone-100">
                <h3 className="text-sm font-semibold text-stone-900">
                  {fetchedPnrs.length} PNRs found
                </h3>
                <div className="flex items-center gap-3 text-xs">
                  <button type="button" onClick={() => toggleAll(true)} className="text-indigo-600 hover:text-indigo-700 font-medium">Select All Valid</button>
                  <span className="text-stone-300">|</span>
                  <button type="button" onClick={() => toggleAll(false)} className="text-stone-500 hover:text-stone-700 font-medium">Select None</button>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-stone-50/50 text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-3 border-b border-stone-100 w-10"></th>
                      <th className="px-6 py-3 border-b border-stone-100">PNR</th>
                      <th className="px-6 py-3 border-b border-stone-100">Airline</th>
                      <th className="px-6 py-3 border-b border-stone-100">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-stone-800">
                    {fetchedPnrs.map(pnr => {
                      const isValid = pnr.airlineId === targetAirlineId;
                      const isSelected = selectedIds.has(pnr.id);
                      
                      return (
                        <tr key={pnr.id} className={`${isSelected ? 'bg-indigo-50/30' : ''} ${!isValid ? 'bg-red-50/30' : ''}`}>
                          <td className="px-6 py-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!isValid}
                              onChange={() => togglePnr(pnr.id, isValid)}
                              className="w-4 h-4 rounded border-stone-300 text-indigo-600 focus:ring-indigo-600 disabled:opacity-50"
                            />
                          </td>
                          <td className="px-6 py-3">
                            <div className="font-mono font-medium text-stone-900">{pnr.pnr}</div>
                            <div className="text-[11px] text-stone-500 truncate max-w-[150px]" title={pnr.investorCompany}>
                              {pnr.investorCompany}
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            {isValid ? (
                              <span className="text-stone-600">{pnr.airline?.name || 'Unknown'}</span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-md">
                                <XCircle className="w-3.5 h-3.5" />
                                {pnr.airline?.name || 'Unknown'} (Mismatch)
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-3 text-xs text-stone-500">
                            {pnr.seats} seats · {pnr.sector || 'TBD'} · {pnr.outboundDate || 'TBD'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-6 bg-stone-50/50 space-y-4">
              <h3 className="text-sm font-semibold text-stone-900 mb-2 border-b border-stone-200 pb-2">Configure Email</h3>
              
              {error && fetchedPnrs && (
                <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">Template</label>
                  <select
                    value={emailType}
                    onChange={e => setEmailType(e.target.value)}
                    className={inputCls}
                  >
                    <option value="Deposit Confirmation">Deposit Confirmation</option>
                    <option value="Generic Notice">Generic Notice</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1.5">To</label>
                  <select
                    value={recipient}
                    onChange={e => setRecipient(e.target.value)}
                    required
                    disabled={!targetAirline || targetAirline.contactEmails.length === 0}
                    className={`${inputCls} cursor-pointer disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {(targetAirline?.contactEmails ?? []).map(email => (
                      <option key={email} value={email}>{email}</option>
                    ))}
                    {(!targetAirline || targetAirline.contactEmails.length === 0) && (
                      <option value="">— no contact email on file —</option>
                    )}
                  </select>
                  {targetAirline && targetAirline.contactEmails.length === 0 && (
                    <p className="text-[10px] text-amber-600 mt-1">
                      {targetAirline.name} has no contact email recorded, so nothing can be sent to
                      it. Add the address to the airline record first.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  required
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">Message Body</label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  required
                  rows={8}
                  className={`${inputCls} font-sans leading-relaxed`}
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isPending || selectedIds.size === 0}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-sm disabled:opacity-50"
                >
                  <Mail className="w-4 h-4" />
                  {isPending ? 'Sending...' : `Send Email (${selectedIds.size} PNRs)`}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
