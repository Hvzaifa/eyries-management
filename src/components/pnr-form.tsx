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
import {
  TRIP_TYPES,
  TRIP_TYPE_LABELS,
  BAGGAGE_MAX_KG,
  BAGGAGE_MAX_PIECES,
  MAX_STOPS,
  buildSector,
  isAirportCode,
} from '@/lib/flight-details';
import { diffInDays, todayIsoInPkt } from '@/lib/urgency';
import type { PnrFormOptions } from '@/lib/pnrs';
import type { FieldConfidence } from '@/lib/ai/parse-booking';
import { EMPTY_STOP, type PnrFormValues, type StopFormValues } from '@/lib/pnr-form-values';

const inputCls =
  'w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-brand-light/50 focus:border-brand-light transition-colors';

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

type LegKey = 'outbound' | 'inbound';
type LegField = 'date' | 'departureCity' | 'departureTime' | 'arrivalCity' | 'arrivalTime' | 'flightCode';

const LEG_FIELD_NAMES: Record<LegField, string> = {
  date: 'date',
  departureCity: 'departure_city',
  departureTime: 'departure_time',
  arrivalCity: 'arrival_city',
  arrivalTime: 'arrival_time',
  flightCode: 'flight_code',
};

const LEG_FIELD_LABELS: Record<Exclude<LegField, 'flightCode'>, string> = {
  date: 'Departure date',
  departureCity: 'Departure city',
  departureTime: 'Departure time',
  arrivalCity: 'Arrival city',
  arrivalTime: 'Arrival time',
};

function legValueKey(leg: LegKey, field: LegField): keyof PnrFormValues {
  return `${leg}${field[0].toUpperCase()}${field.slice(1)}` as keyof PnrFormValues;
}

/**
 * One flight's fields. The field order is the owner's, per section, which is
 * why it is passed in rather than fixed here.
 */
function FlightSection({
  title,
  leg,
  order,
  flightCodeLabel,
  dateHint,
  minDate,
  values,
  onChange,
  onStopsChange,
  conf,
}: {
  title: string;
  leg: LegKey;
  order: LegField[];
  flightCodeLabel: string;
  dateHint?: string;
  minDate?: string;
  values: PnrFormValues;
  onChange: (key: keyof PnrFormValues, value: string) => void;
  onStopsChange: (stops: StopFormValues[]) => void;
  conf: (key: keyof PnrFormValues) => FieldConfidence | undefined;
}) {
  const stops = values[`${leg}Stops`];
  const setStop = (i: number, patch: Partial<StopFormValues>) =>
    onStopsChange(stops.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const input = (field: LegField) => {
    const key = legValueKey(leg, field);
    const name = `${leg}_${LEG_FIELD_NAMES[field]}`;
    const value = (values[key] as string) ?? '';
    switch (field) {
      case 'date':
        return (
          <input type="date" name={name} required min={minDate || undefined} value={value} onChange={(e) => onChange(key, e.target.value)} className={inputCls} />
        );
      case 'departureTime':
      case 'arrivalTime':
        return (
          <input type="time" name={name} value={value} onChange={(e) => onChange(key, e.target.value)} className={inputCls} />
        );
      case 'departureCity':
      case 'arrivalCity':
        return (
          <input
            name={name}
            required
            maxLength={3}
            pattern="[A-Za-z]{3}"
            title="3-letter airport code, e.g. ISB"
            placeholder={field === 'departureCity' ? 'e.g. ISB' : 'e.g. JED'}
            value={value}
            onChange={(e) => onChange(key, e.target.value.toUpperCase())}
            className={`${inputCls} font-mono uppercase placeholder:normal-case`}
          />
        );
      case 'flightCode':
        return (
          <input
            name={name}
            required
            maxLength={10}
            placeholder="e.g. SV727"
            value={value}
            onChange={(e) => onChange(key, e.target.value.toUpperCase())}
            className={`${inputCls} font-mono uppercase placeholder:normal-case`}
          />
        );
    }
  };

  return (
    <div className="rounded-xl border border-stone-200 p-4">
      <h3 className="text-xs font-semibold text-stone-800 mb-3">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-4">
        {order.map((field) => (
          <Field
            key={field}
            label={field === 'flightCode' ? flightCodeLabel : LEG_FIELD_LABELS[field]}
            required={field !== 'departureTime' && field !== 'arrivalTime'}
            hint={field === 'date' ? dateHint : undefined}
            confidence={conf(legValueKey(leg, field))}
          >
            {input(field)}
          </Field>
        ))}
      </div>

      {/* Connecting flight: stops in order. The flight code at a stop is the
          ONWARD flight — the aircraft may change there (owner, 2026-09-28). */}
      <div className="mt-4 pt-3 border-t border-stone-100">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            Stops {stops.length === 0 && <span className="normal-case font-normal text-stone-400">— direct flight</span>}
          </h4>
          {stops.length < MAX_STOPS && (
            <button
              type="button"
              onClick={() => onStopsChange([...stops, { ...EMPTY_STOP }])}
              className="text-[11px] font-semibold text-brand hover:text-brand-dark cursor-pointer"
            >
              + Add stop
            </button>
          )}
        </div>
        <input type="hidden" name={`${leg}_stop_count`} value={stops.length} />
        {stops.map((stop, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.3fr_auto] gap-x-4 gap-y-3 items-start mb-3">
            <Field label={`Stop ${i + 1} city`} required confidence={i === 0 ? conf(`${leg}Stops`) : undefined}>
              <input
                name={`${leg}_stop_${i}_city`}
                required
                maxLength={3}
                pattern="[A-Za-z]{3}"
                title="3-letter airport code, e.g. DXB"
                placeholder="e.g. DXB"
                value={stop.city}
                onChange={(e) => setStop(i, { city: e.target.value.toUpperCase() })}
                className={`${inputCls} font-mono uppercase placeholder:normal-case`}
              />
            </Field>
            <Field label="Arrives">
              <input type="time" name={`${leg}_stop_${i}_arrival_time`} value={stop.arrivalTime} onChange={(e) => setStop(i, { arrivalTime: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Departs">
              <input type="time" name={`${leg}_stop_${i}_departure_time`} value={stop.departureTime} onChange={(e) => setStop(i, { departureTime: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Onward flight code" hint="If the aircraft changes here.">
              <input
                name={`${leg}_stop_${i}_flight_code`}
                maxLength={10}
                placeholder="e.g. EK612"
                value={stop.flightCode}
                onChange={(e) => setStop(i, { flightCode: e.target.value.toUpperCase() })}
                className={`${inputCls} font-mono uppercase placeholder:normal-case`}
              />
            </Field>
            <button
              type="button"
              onClick={() => onStopsChange(stops.filter((_, j) => j !== i))}
              className="lg:mt-6 px-2 py-2 text-[11px] font-medium text-stone-400 hover:text-red-600 cursor-pointer justify-self-start"
              aria-label={`Remove stop ${i + 1}`}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-stone-100">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 mb-2">Baggage</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-4">
          <Field label="Bags" hint="Checked bags per passenger." confidence={conf(`${leg}BaggagePieces`)}>
            <input
              type="number"
              name={`${leg}_baggage_pieces`}
              min={0}
              max={BAGGAGE_MAX_PIECES}
              step={1}
              placeholder="e.g. 2"
              value={values[`${leg}BaggagePieces`]}
              onChange={(e) => onChange(`${leg}BaggagePieces`, e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Weight (kg)" hint="Limit for each bag — e.g. 2 bags × 23 kg means 23 kg per bag, not 23 kg in total." confidence={conf(`${leg}BaggageKg`)}>
            <input
              type="number"
              name={`${leg}_baggage_kg`}
              min={1}
              max={BAGGAGE_MAX_KG}
              step={1}
              placeholder="e.g. 23"
              value={values[`${leg}BaggageKg`]}
              onChange={(e) => onChange(`${leg}BaggageKg`, e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

const ONE_WAY_ORDER: LegField[] = ['date', 'departureTime', 'arrivalTime', 'departureCity', 'arrivalCity', 'flightCode'];
const ROUND_TRIP_ORDER: LegField[] = ['date', 'departureCity', 'departureTime', 'arrivalCity', 'arrivalTime', 'flightCode'];

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
  const setValue = (key: keyof PnrFormValues, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));

  // The sector the save will build, shown so staff can check the route reads
  // the way it always has. Same function as the server.
  const sectorPreview = useMemo(() => {
    const validStops = (st: StopFormValues[]) => st.every((x) => isAirportCode(x.city));
    const out = { departureCity: values.outboundDepartureCity, arrivalCity: values.outboundArrivalCity, stops: values.outboundStops };
    if (!isAirportCode(out.departureCity) || !isAirportCode(out.arrivalCity) || !validStops(out.stops)) return null;
    if (values.tripType !== 'round_trip') return buildSector(out, null);
    const inb = { departureCity: values.inboundDepartureCity, arrivalCity: values.inboundArrivalCity, stops: values.inboundStops };
    if (!isAirportCode(inb.departureCity) || !isAirportCode(inb.arrivalCity) || !validStops(inb.stops)) return null;
    return buildSector(out, inb);
  }, [
    values.tripType,
    values.outboundDepartureCity,
    values.outboundArrivalCity,
    values.outboundStops,
    values.inboundDepartureCity,
    values.inboundArrivalCity,
    values.inboundStops,
  ]);

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
      {/* updatePnr reads the booking to change from the form. Missing since
          the form was first written (2026-08-23), so every edit was refused
          with "Missing booking id." (2026-09-26). The server still checks this
          user may edit this booking — the id is not trusted for that. */}
      {mode === 'edit' && initial.id && <input type="hidden" name="id" value={initial.id} />}
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
        <Field label="Status">
          <select name="status" value={values.status} onChange={set('status')} className={`${inputCls} cursor-pointer`}>
            <option value="active">active</option>
            <option value="cancelled">cancelled</option>
            <option value="completed">completed</option>
          </select>
        </Field>
        {/* For the package as a whole, not per flight (owner, 2026-09-28). */}
        <Field label="Meal included" confidence={conf('mealIncluded')}>
          <select name="meal_included" value={values.mealIncluded} onChange={set('mealIncluded')} className={`${inputCls} cursor-pointer`}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </Field>

        <div className="sm:col-span-2 lg:col-span-3 border-t border-stone-100 pt-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-medium text-stone-600">
              Trip type<span className="text-red-500"> *</span>
            </span>
            <div role="radiogroup" aria-label="Trip type" className="inline-flex rounded-xl border border-stone-300 bg-stone-100 p-0.5">
              {TRIP_TYPES.map((t) => {
                const active = values.tripType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setValue('tripType', t)}
                    className={`px-4 py-1.5 rounded-[10px] text-xs font-semibold transition-colors cursor-pointer ${
                      active ? 'bg-white text-brand-dark shadow-sm' : 'text-stone-500 hover:text-stone-800'
                    }`}
                  >
                    {TRIP_TYPE_LABELS[t]}
                  </button>
                );
              })}
            </div>
            <input type="hidden" name="trip_type" value={values.tripType} />
            {sectorPreview && (
              <span className="text-[11px] text-stone-400">
                Sector <span className="font-mono text-stone-600">{sectorPreview}</span>
              </span>
            )}
          </div>

          {values.tripType === 'one_way' ? (
            <FlightSection
              title="Flight details"
              leg="outbound"
              order={ONE_WAY_ORDER}
              flightCodeLabel="Flight code"
              dateHint={mode === 'create' ? 'Drives the EMD-1 suggestion below.' : undefined}
              values={values}
              onChange={setValue}
              onStopsChange={(st) => setValues((v) => ({ ...v, outboundStops: st }))}
              conf={conf}
            />
          ) : values.tripType === 'round_trip' ? (
            <>
              <FlightSection
                title="Outbound"
                leg="outbound"
                order={ROUND_TRIP_ORDER}
                flightCodeLabel="Outbound flight code"
                dateHint={mode === 'create' ? 'Drives the EMD-1 suggestion below.' : undefined}
                values={values}
                onChange={setValue}
                onStopsChange={(st) => setValues((v) => ({ ...v, outboundStops: st }))}
                conf={conf}
              />
              <FlightSection
                title="Inbound"
                leg="inbound"
                order={ROUND_TRIP_ORDER}
                flightCodeLabel="Inbound flight code"
                minDate={values.outboundDate}
                values={values}
                onChange={setValue}
                onStopsChange={(st) => setValues((v) => ({ ...v, inboundStops: st }))}
                conf={conf}
              />
            </>
          ) : (
            <p className="text-[11px] text-stone-400">Choose one way or round trip to enter the flights.</p>
          )}
        </div>
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
          <div className="sm:col-span-2 lg:col-span-3 flex items-start gap-2 text-[11px] text-brand-dark -mt-1 mb-1">
            <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {suggestion.applicable ? (
              <span>
                SV Umrah policy ({suggestion.bandLabel}): the 1st EMD must be issued by{' '}
                <strong>{computedDeadlineDate || '—'}</strong> — the airline&rsquo;s{' '}
                {policyDays} day{policyDays === 1 ? '' : 's'} less the 3-day margin. Editable.
              </span>
            ) : suggestion.reason === 'missing-dates' ? (
              <span>Pick the request date, departure date and airline to check for a policy.</span>
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
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-tr from-brand-dark to-brand hover:from-brand-dark hover:to-brand-dark disabled:opacity-50 shadow-md shadow-brand/25 transition-all cursor-pointer"
        >
          <Save className="w-4 h-4" />
          {isPending ? 'Saving...' : submitLabel || (mode === 'create' ? 'Create booking' : 'Save changes')}
        </button>
      </div>
    </form>
  );
}

