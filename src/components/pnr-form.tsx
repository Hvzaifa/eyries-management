'use client';

import { useMemo, useState, useTransition } from 'react';
import { AlertTriangle, Save, Sparkles } from 'lucide-react';
import {
  suggestEmdPlan,
  emd2DaysBeforeDeparture,
  emd1DaysToDeadline,
  emd1PolicyDaysToIssue,
  clampEmd2Deadline,
} from '@/lib/emd';
import { SEGMENTS } from '@/lib/booking-entry';
import { diffInDays, todayIsoInPkt } from '@/lib/urgency';
import type { PnrFormOptions } from '@/lib/pnrs';
import type { FieldConfidence } from '@/lib/ai/parse-booking';
import type { PnrFormValues } from '@/lib/pnr-form-values';

const inputCls =
  'w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400 transition-colors';

const confidenceDot: Record<FieldConfidence, string> = {
  high: 'bg-emerald-400',
  medium: 'bg-amber-400',
  low: 'bg-red-400',
};

const confidenceBorder: Record<FieldConfidence, string> = {
  high: '',
  medium: '',
  low: 'border-l-2 border-l-red-400 pl-2',
};

function Field({
  label,
  required,
  hint,
  confidence,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  confidence?: FieldConfidence;
  children: React.ReactNode;
}) {
  return (
    <div className={confidence ? confidenceBorder[confidence] : ''}>
      <label className="block text-xs font-medium text-stone-600 mb-1.5">
        {label}
        {required && <span className="text-red-500"> *</span>}
        {confidence && (
          <span
            className={`inline-block w-2 h-2 rounded-full ml-1.5 align-middle ${confidenceDot[confidence]}`}
            title={`AI confidence: ${confidence}`}
          />
        )}
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
  confidenceMap,
  rawAirlineText,
  submitLabel,
  onSkip,
  onSuccess,
}: {
  mode: 'create' | 'edit';
  options: PnrFormOptions;
  initial: PnrFormValues;
  action: (formData: FormData) => Promise<{ error: string } | undefined>;
  confidenceMap?: Partial<Record<keyof PnrFormValues, FieldConfidence>>;
  rawAirlineText?: string;
  submitLabel?: string;
  onSkip?: () => void;
  onSuccess?: () => void;
}) {
  const conf = (key: keyof PnrFormValues) => confidenceMap?.[key];
  const [values, setValues] = useState<PnrFormValues>(initial);
  // Seeded from the booking so a date that arrived with the draft — the AI
  // intake parses a TL date off the airline's email — is not silently replaced
  // by the policy calculation. A supplied date counts as already touched.
  const [roundDeadline, setRoundDeadline] = useState<string>(initial.pnrTlDate ?? '');
  const [roundDeadlineTouched, setRoundDeadlineTouched] = useState(
    Boolean(initial.pnrTlDate)
  );
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const airlineCode = useMemo(
    () => options.airlines.find((a) => a.id === values.airlineId)?.code ?? null,
    [options.airlines, values.airlineId]
  );

  const suggestion = useMemo(
    () =>
      suggestEmdPlan({
        airlineCode,
        segment: values.segment,
        requestDateIso: values.requestDate || null,
        outboundDateIso: values.outboundDate || null,
      }),
    [airlineCode, values.segment, values.requestDate, values.outboundDate]
  );

  const computedDeadlineDate = useMemo(() => {
    if (mode !== 'create') return '';
    // Only airlines with an uploaded policy get a suggestion (docs/decisions.md,
    // 2026-08-23 "EMD suggestions now airline-scoped"). Previously this fired for
    // ANY airline whose typed percentage happened to be 15 or 30, applying SV's
    // policy to airlines that have none.
    if (!suggestion.applicable) return '';
    if (!values.requestDate || !values.outboundDate) return '';

    // The date by which EMD-1 must be ISSUED: the airline's band figure brought
    // forward by the 3-day safety margin — see emd1DaysToDeadline(). Short-notice
    // bands resolve to today, which is the rule, not an accident.
    const daysToAdd = emd1DaysToDeadline(diffInDays(values.requestDate, values.outboundDate));

    // Count forward in UTC from today-in-PKT, so adding days cannot be shifted
    // by the browser's own timezone.
    const todayIso = todayIsoInPkt(new Date());
    const [y, m, d] = todayIso.split('-').map(Number);
    const deadline = new Date(Date.UTC(y, m - 1, d + daysToAdd));
    return deadline.toISOString().slice(0, 10);
  }, [mode, suggestion, values.requestDate, values.outboundDate]);

  // PNR TL is the EMD-1 deadline until the deposit confirmation email is sent.
  const autoRoundDeadline =
    mode === 'create' && !roundDeadlineTouched && computedDeadlineDate
      ? computedDeadlineDate
      : roundDeadline;

  // (There was an `autoPnrTlDate` here that nothing ever rendered. The PNR TL is
  // set server-side from round 1's deadline in createPnr, so the form does not
  // need to derive it — docs/decisions.md, 2026-09-07 "PNR TL defined".)

  /** The airline's own figure, shown so staff can see what the margin came off. */
  const policyDays =
    values.requestDate && values.outboundDate
      ? emd1PolicyDaysToIssue(diffInDays(values.requestDate, values.outboundDate))
      : 0;

  const emd2DeadlinePreview = useMemo(() => {
    if (!suggestion.applicable || suggestion.emd2Pct === null) return null;
    if (!values.requestDate || !values.outboundDate) return null;
    const offset = emd2DaysBeforeDeparture(diffInDays(values.requestDate, values.outboundDate));
    if (offset === null) return null;
    const [y, m, d] = values.outboundDate.split('-').map(Number);
    const policyIso = new Date(Date.UTC(y, m - 1, d - offset)).toISOString().slice(0, 10);
    // Same clamp the server applies, so the preview cannot promise a date that
    // createPnr will then move.
    return clampEmd2Deadline(policyIso, autoRoundDeadline || null);
  }, [suggestion, values.requestDate, values.outboundDate, autoRoundDeadline]);

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

    // A PNR code identifies one booking (owner ruling, 2026-09-20). This used
    // to warn and offer "save anyway"; the server now refuses, so offering it
    // would only produce a rejection after the click.
    if (duplicate) {
      setDuplicateWarning(true);
      return;
    }

    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await action(formData);
      if (res?.error) {
        setErrorMessage(res.error);
        setDuplicateWarning(false);
      } else {
        onSuccess?.();
      }
    });
  };

  return (
    <form id="pnr-form" onSubmit={handleSubmit} className="space-y-5">
      {rawAirlineText && (
        <input type="hidden" name="raw_airline_text" value={rawAirlineText} />
      )}
      {errorMessage && (
        <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {duplicateWarning && duplicate && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="flex items-start gap-2.5 text-xs text-red-800 leading-relaxed">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              PNR <strong className="font-mono">{values.pnr.trim()}</strong> already exists. A
              booking cannot be entered twice — open the existing booking instead, or correct the
              code.
            </span>
          </p>
        </div>
      )}

      <SectionCard title="Booking details">
        <Field label="Request date" required confidence={conf('requestDate')}>
          <input type="date" name="request_date" required value={values.requestDate} onChange={set('requestDate')} className={inputCls} />
        </Field>
        {/* Investor company is no longer typed. Every booking is bought on
            company investment and stays there until its seats are handed to an
            agent or put on sale through the bot (owner ruling, 2026-09-20), so
            the Seat ownership panel answers this, not a free-text box that could
            disagree with it. Imported bookings keep the name the sheet recorded
            and show it read-only below. */}
        {values.investorCompany && values.investorCompany.toUpperCase() !== 'COMPANY INVESTMENT' && (
          <Field label="Investor company (as recorded)" hint="From the original sheet. Seat ownership is managed on the booking page.">
            <p className="text-sm text-stone-500 px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl">
              {values.investorCompany}
            </p>
          </Field>
        )}
        <Field label="PNR code" required hint="Must be unique — one booking per code." confidence={conf('pnr')}>
          <input name="pnr" required value={values.pnr} onChange={set('pnr')} placeholder="e.g. XYZ123" className={`${inputCls} font-mono`} />
        </Field>
        <Field label="License" confidence={conf('licenseId')}>
          <select name="license_id" value={values.licenseId} onChange={set('licenseId')} className={`${inputCls} cursor-pointer`}>
            <option value="">—</option>
            {options.licenses.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
        <Field label="Branch" confidence={conf('branchId')}>
          <select name="branch_id" value={values.branchId} onChange={set('branchId')} className={`${inputCls} cursor-pointer`}>
            <option value="">—</option>
            {options.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Airline" confidence={conf('airlineId')}>
          <select name="airline_id" value={values.airlineId} onChange={set('airlineId')} className={`${inputCls} cursor-pointer`}>
            <option value="">—</option>
            {options.airlines.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
          </select>
        </Field>
        <Field label="Segment" confidence={conf('segment')}>
          <select name="segment" value={values.segment} onChange={set('segment')} className={`${inputCls} cursor-pointer`}>
            <option value="">—</option>
            {SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
            {/* A booking imported with some other value keeps it until someone
                changes it: the list is for what is entered from now on, not a
                reason to block editing an old booking. */}
            {values.segment && !SEGMENTS.some((s) => s.toLowerCase() === values.segment.toLowerCase()) && (
              <option value={values.segment}>{values.segment} (as recorded)</option>
            )}
          </select>
        </Field>
        <Field label="GDS PNR" hint="Only when booked directly via a GDS." confidence={conf('gdsPnr')}>
          <input name="gds_pnr" value={values.gdsPnr} onChange={set('gdsPnr')} className={`${inputCls} font-mono`} />
        </Field>
        <Field label="Seats" required confidence={conf('seats')}>
          <input type="number" name="seats" required min="0" value={values.seats} onChange={set('seats')} className={inputCls} />
        </Field>
        <Field label="Outbound date" hint="Drives the EMD-1 suggestion below." confidence={conf('outboundDate')}>
          <input type="date" name="outbound_date" value={values.outboundDate} onChange={set('outboundDate')} className={inputCls} />
        </Field>
        <Field label="Inbound date" confidence={conf('inboundDate')}>
          <input type="date" name="inbound_date" value={values.inboundDate} onChange={set('inboundDate')} className={inputCls} />
        </Field>
        <Field label="Sector" hint="e.g. ISB-JED-MED-ISB" confidence={conf('sector')}>
          <input name="sector" value={values.sector} onChange={set('sector')} className={`${inputCls} font-mono`} />
        </Field>
        {/* On a NEW booking this date is the first EMD's issuance deadline and is
            entered in its own section below, so it is not asked for twice. On an
            existing booking it is the live time limit, kept in sync with the
            earliest outstanding round. */}
        {mode === 'edit' && (
          <Field
            label="PNR TL date"
            hint="The time limit the PNR rests with us — the date the next EMD must be issued by."
            confidence={conf('pnrTlDate')}
          >
            <input type="date" name="pnr_tl_date" value={values.pnrTlDate} onChange={set('pnrTlDate')} className={inputCls} />
          </Field>
        )}
        <Field label="Deal %" confidence={conf('dealPct')}>
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
        <Field label="Fare per seat" required hint="Base fare only — no taxes. Total EMD value is calculated automatically after save." confidence={conf('fare')}>
          <input type="number" name="fare" required step="0.01" min="0" value={values.fare} onChange={set('fare')} className={inputCls} />
        </Field>
        <Field label="Airline taxes" confidence={conf('airlineTaxes')}>
          <input type="number" name="airline_taxes" step="0.01" min="0" value={values.airlineTaxes} onChange={set('airlineTaxes')} className={inputCls} />
        </Field>
        <Field label="PSF" confidence={conf('psf')}>
          <input type="number" name="psf" step="0.01" min="0" value={values.psf} onChange={set('psf')} className={inputCls} />
        </Field>
      </SectionCard>

      {mode === 'create' && (
        <SectionCard title="First EMD issuance deadline">
          <div className="sm:col-span-2 lg:col-span-3 flex items-start gap-2 text-[11px] text-indigo-700 -mt-1 mb-1">
            <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {suggestion.applicable ? (
              <span>
                SV Umrah policy ({suggestion.bandLabel}): the 1st EMD must be issued by{' '}
                <strong>{computedDeadlineDate || '—'}</strong> — the airline&rsquo;s{' '}
                {policyDays} day{policyDays === 1 ? '' : 's'} less the 3-day margin. Editable.
              </span>
            ) : suggestion.reason === 'missing-dates' ? (
              <span>Pick the request date, outbound date and airline to check for a policy.</span>
            ) : (
              <span>
                No EMD policy stored for this airline yet, so enter the issuance deadline the
                airline&rsquo;s policy gives. Policies can be added per airline later.
              </span>
            )}
          </div>
          <Field
            label="Issue 1st EMD by"
            required
            hint="The date the first EMD must be issued to secure this PNR. Head Office issues the EMD itself."
          >
            <input
              type="date"
              name="pnr_tl_date"
              required
              value={autoRoundDeadline}
              onChange={(e) => {
                setRoundDeadline(e.target.value);
                setRoundDeadlineTouched(true);
              }}
              className={inputCls}
            />
          </Field>
          {emd2DeadlinePreview && (
            <div className="sm:col-span-2 text-[11px] text-stone-400 self-end pb-2">
              Once the 1st EMD is issued, the 2nd is due by <strong>{emd2DeadlinePreview}</strong>{' '}
              (policy, no margin).
            </div>
          )}
        </SectionCard>
      )}

      <div className="flex items-center justify-end gap-3 pb-8">
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            disabled={isPending}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 transition-colors"
          >
            Skip
          </button>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-tr from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 disabled:opacity-50 shadow-md shadow-indigo-500/25 transition-all cursor-pointer"
        >
          <Save className="w-4 h-4" />
          {isPending ? 'Saving...' : submitLabel || (mode === 'create' ? 'Create booking' : 'Save changes')}
        </button>
      </div>
    </form>
  );
}

