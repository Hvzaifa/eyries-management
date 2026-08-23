'use client';

import { useMemo, useState, useTransition } from 'react';
import { AlertTriangle, Save, Sparkles } from 'lucide-react';
import { suggestEmd1 } from '@/lib/emd';
import type { PnrFormOptions } from '@/lib/pnrs';

export interface PnrFormValues {
  id?: string;
  requestDate: string;
  investorCompany: string;
  licenseId: string;
  branchId: string;
  pnr: string;
  gdsPnr: string;
  segment: string;
  airlineId: string;
  seats: string;
  outboundDate: string;
  inboundDate: string;
  sector: string;
  pnrTlDate: string;
  dealPct: string;
  issuedStatus: string;
  status: string;
  fare: string;
  airlineTaxes: string;
  psf: string;
}

export const EMPTY_PNR: PnrFormValues = {
  requestDate: '',
  investorCompany: '',
  licenseId: '',
  branchId: '',
  pnr: '',
  gdsPnr: '',
  segment: '',
  airlineId: '',
  seats: '',
  outboundDate: '',
  inboundDate: '',
  sector: '',
  pnrTlDate: '',
  dealPct: '',
  issuedStatus: 'unissued',
  status: 'active',
  fare: '',
  airlineTaxes: '',
  psf: '',
};

const inputCls =
  'w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400 transition-colors';

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-stone-600 mb-1.5">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-stone-400">{hint}</p>}
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-stone-900 mb-4">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-4">{children}</div>
    </section>
  );
}

export default function PnrForm({
  mode,
  options,
  initial,
  action,
}: {
  mode: 'create' | 'edit';
  options: PnrFormOptions;
  initial: PnrFormValues;
  action: (formData: FormData) => Promise<{ error: string } | undefined>;
}) {
  const [values, setValues] = useState<PnrFormValues>(initial);
  const [roundPct, setRoundPct] = useState<string>('');
  const [roundPctTouched, setRoundPctTouched] = useState(false);
  const [showRound, setShowRound] = useState(mode === 'create');
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [confirmedDuplicate, setConfirmedDuplicate] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const suggestion = useMemo(
    () => suggestEmd1(values.requestDate || null, values.outboundDate || null),
    [values.requestDate, values.outboundDate]
  );

  const hideRound = mode === 'create' && suggestion.kind === 'no-round';

  const autoRoundPct =
    mode === 'create' && !roundPctTouched && suggestion.kind === 'suggested' && suggestion.pct !== null
      ? String(suggestion.pct)
      : roundPct;

  const duplicate =
    values.pnr.trim() !== '' &&
    options.existingPnrCodes.some(
      (c) => c.toLowerCase() === values.pnr.trim().toLowerCase() && c !== initial.pnr
    );

  const set = (key: keyof PnrFormValues) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setValues((v) => ({ ...v, [key]: e.target.value }));

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    if (mode === 'create' && duplicate && !confirmedDuplicate) {
      setDuplicateWarning(true);
      return;
    }

    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await action(formData);
      if (res?.error) {
        setErrorMessage(res.error);
        setDuplicateWarning(false);
      }
    });
  };

  const confirmDuplicateAndSave = () => {
    setConfirmedDuplicate(true);
    setDuplicateWarning(false);
    const form = document.getElementById('pnr-form') as HTMLFormElement | null;
    form?.requestSubmit();
  };

  return (
    <form id="pnr-form" onSubmit={handleSubmit} className="space-y-5">
      {errorMessage && (
        <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {duplicateWarning && duplicate && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
          <p className="flex items-start gap-2.5 text-xs text-amber-800 leading-relaxed">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              A booking with PNR code <strong className="font-mono">{values.pnr.trim()}</strong>{' '}
              already exists in the system. Duplicates are allowed but flagged — double-check this
              is not a data-entry slip.
            </span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmDuplicateAndSave}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-white transition-colors cursor-pointer"
            >
              Save anyway
            </button>
            <button
              type="button"
              onClick={() => setDuplicateWarning(false)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white hover:bg-stone-50 border border-stone-300 text-stone-600 transition-colors cursor-pointer"
            >
              Let me fix it
            </button>
          </div>
        </div>
      )}

      <SectionCard title="Booking details">
        <Field label="Request date" required>
          <input type="date" name="request_date" required value={values.requestDate} onChange={set('requestDate')} className={inputCls} />
        </Field>
        <Field label="Investor company" required>
          <input name="investor_company" required value={values.investorCompany} onChange={set('investorCompany')} placeholder="e.g. Al-Noor Travels" className={inputCls} />
        </Field>
        <Field label="PNR code" required hint="Duplicates are flagged, not blocked.">
          <input name="pnr" required value={values.pnr} onChange={set('pnr')} placeholder="e.g. XYZ123" className={`${inputCls} font-mono`} />
        </Field>
        <Field label="License">
          <select name="license_id" value={values.licenseId} onChange={set('licenseId')} className={`${inputCls} cursor-pointer`}>
            <option value="">—</option>
            {options.licenses.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
        <Field label="Branch">
          <select name="branch_id" value={values.branchId} onChange={set('branchId')} className={`${inputCls} cursor-pointer`}>
            <option value="">—</option>
            {options.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Airline">
          <select name="airline_id" value={values.airlineId} onChange={set('airlineId')} className={`${inputCls} cursor-pointer`}>
            <option value="">—</option>
            {options.airlines.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
          </select>
        </Field>
        <Field label="Segment" hint="Free text with suggestions from previous entries.">
          <input name="segment" list="segment-suggestions" value={values.segment} onChange={set('segment')} placeholder="Employment / Umrah / ..." className={inputCls} />
          <datalist id="segment-suggestions">
            {options.segmentSuggestions.map((s) => <option key={s} value={s} />)}
          </datalist>
        </Field>
        <Field label="GDS PNR" hint="Only when booked directly via a GDS.">
          <input name="gds_pnr" value={values.gdsPnr} onChange={set('gdsPnr')} className={`${inputCls} font-mono`} />
        </Field>
        <Field label="Seats" required>
          <input type="number" name="seats" required min="0" value={values.seats} onChange={set('seats')} className={inputCls} />
        </Field>
        <Field label="Outbound date" hint="Drives the EMD-1 suggestion below.">
          <input type="date" name="outbound_date" value={values.outboundDate} onChange={set('outboundDate')} className={inputCls} />
        </Field>
        <Field label="Inbound date">
          <input type="date" name="inbound_date" value={values.inboundDate} onChange={set('inboundDate')} className={inputCls} />
        </Field>
        <Field label="Sector" hint="e.g. ISB-JED-MED-ISB">
          <input name="sector" value={values.sector} onChange={set('sector')} className={`${inputCls} font-mono`} />
        </Field>
        <Field label="PNR TL date" hint="Time-limit / void date from the airline.">
          <input type="date" name="pnr_tl_date" value={values.pnrTlDate} onChange={set('pnrTlDate')} className={inputCls} />
        </Field>
        <Field label="Deal %">
          <input type="number" name="deal_pct" step="0.01" min="0" max="100" value={values.dealPct} onChange={set('dealPct')} className={inputCls} />
        </Field>
        <Field label="Issued status">
          <select name="issued_status" value={values.issuedStatus} onChange={set('issuedStatus')} className={`${inputCls} cursor-pointer`}>
            <option value="unissued">unissued</option>
            <option value="issued">issued</option>
          </select>
        </Field>
        <Field label="Status">
          <select name="status" value={values.status} onChange={set('status')} className={`${inputCls} cursor-pointer`}>
            <option value="active">active</option>
            <option value="cancelled">cancelled</option>
            <option value="completed">completed</option>
          </select>
        </Field>
      </SectionCard>

      <SectionCard title="Money (PKR)">
        <Field label="Fare per seat" required hint="Base fare only — no taxes. Total EMD value is calculated automatically after save.">
          <input type="number" name="fare" required step="0.01" min="0" value={values.fare} onChange={set('fare')} className={inputCls} />
        </Field>
        <Field label="Airline taxes">
          <input type="number" name="airline_taxes" step="0.01" min="0" value={values.airlineTaxes} onChange={set('airlineTaxes')} className={inputCls} />
        </Field>
        <Field label="PSF">
          <input type="number" name="psf" step="0.01" min="0" value={values.psf} onChange={set('psf')} className={inputCls} />
        </Field>
      </SectionCard>

      {mode === 'create' && (
        hideRound ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-xs text-amber-800 leading-relaxed">
              <strong>Under 7 days to departure:</strong> per business rules, this booking expects
              full ticket payment with no EMD round, so the deposit section is hidden. If reality
              differs, create the booking first and record rounds from its detail page later.
            </p>
          </section>
        ) : (
          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <h2 className="text-sm font-semibold text-stone-900">First EMD round</h2>
              {!hideRound && (
                <button
                  type="button"
                  onClick={() => setShowRound((v) => !v)}
                  className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 cursor-pointer"
                >
                  {showRound ? 'Hide' : 'Add first round'}
                </button>
              )}
            </div>

            {showRound ? (
              <>
                <div className="flex items-center gap-2 mb-4 text-[11px] text-indigo-700">
                  <Sparkles className="w-3.5 h-3.5" />
                  {suggestion.kind === 'none' && (
                    <span>Pick both a request date and an outbound date to get an EMD-1 % suggestion.</span>
                  )}
                  {suggestion.kind === 'suggested' && suggestion.pct !== null && (
                    <span>Suggested EMD-1: <strong>{suggestion.pct}%</strong> — pre-filled below, editable.</span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-4">
                  <Field label="Issuance date" required>
                    <input type="date" name="round_issuance_date" className={inputCls} />
                  </Field>
                  <Field label="Payment %" required hint="Suggested from request → departure days; always editable.">
                    <input
                      type="number"
                      name="round_payment_pct"
                      step="0.01" min="0" max="100"
                      value={autoRoundPct}
                      onChange={(e) => {
                        setRoundPct(e.target.value);
                        setRoundPctTouched(true);
                      }}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="EMD number" hint="Airline's reference.">
                    <input name="round_emd_number" className={inputCls} />
                  </Field>
                  <Field label="EMD amount (PKR)" required hint="Type the agreed amount — never auto-calculated.">
                    <input type="number" name="round_emd_amount" step="0.01" min="0" className={inputCls} />
                  </Field>
                  <Field label="Deadline date" required>
                    <input type="date" name="round_deadline_date" className={inputCls} />
                  </Field>
                  <Field label="Deadline time">
                    <input type="time" name="round_deadline_time" className={inputCls} />
                  </Field>
                </div>
              </>
            ) : (
              <p className="text-xs text-stone-400">
                No first round will be recorded. You can add rounds later from the detail page.
              </p>
            )}
          </section>
        )
      )}

      <div className="flex items-center justify-end gap-3 pb-8">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-tr from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 disabled:opacity-50 shadow-md shadow-indigo-500/25 transition-all cursor-pointer"
        >
          <Save className="w-4 h-4" />
          {isPending ? 'Saving...' : mode === 'create' ? 'Create booking' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

