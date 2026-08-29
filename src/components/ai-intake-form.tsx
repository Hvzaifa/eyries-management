'use client';

import { useState, useTransition } from 'react';
import { Bot, ClipboardPaste, Loader2, RotateCcw, AlertTriangle } from 'lucide-react';
import PnrForm, { type PnrFormValues, EMPTY_PNR } from '@/components/pnr-form';
import type { PnrFormOptions } from '@/lib/pnrs';
import type { ParsedBookingDraft, FieldConfidence } from '@/lib/ai/parse-booking';

type Phase = 'paste' | 'review';

/**
 * Map ParsedBookingDraft → PnrFormValues + confidenceMap,
 * resolving airline code → airline_id from the options list.
 */
function draftToFormValues(
  draft: ParsedBookingDraft,
  options: PnrFormOptions
): {
  values: PnrFormValues;
  confidenceMap: Partial<Record<keyof PnrFormValues, FieldConfidence>>;
} {
  // Resolve airline code to airline_id
  const airlineCode = draft.airlineCode.value?.toUpperCase() ?? '';
  const matchedAirline = options.airlines.find(
    (a) => a.code.toUpperCase() === airlineCode
  );

  // Resolve license name to license_id
  const licenseName = draft.licenseName.value?.toUpperCase() ?? '';
  const matchedLicense = options.licenses.find(
    (l) => l.name.toUpperCase() === licenseName
  );

  // Resolve branch name to branch_id
  const branchName = draft.branchName.value?.toUpperCase() ?? '';
  const matchedBranch = options.branches.find(
    (b) => b.name.toUpperCase() === branchName
  );

  const values: PnrFormValues = {
    requestDate: draft.requestDate.value ?? '',
    investorCompany: draft.investorCompany.value ?? '',
    licenseId: matchedLicense?.id ?? '',
    branchId: matchedBranch?.id ?? '',
    pnr: draft.pnr.value ?? '',
    gdsPnr: draft.gdsPnr.value ?? '',
    segment: draft.segment.value ?? '',
    airlineId: matchedAirline?.id ?? '',
    seats: draft.seats.value !== null ? String(draft.seats.value) : '',
    outboundDate: draft.outboundDate.value ?? '',
    inboundDate: draft.inboundDate.value ?? '',
    sector: draft.sector.value ?? '',
    pnrTlDate: draft.pnrTlDate.value ?? '',
    dealPct: draft.dealPct.value !== null ? String(draft.dealPct.value) : '',
    issuedStatus: 'unissued',
    status: 'active',
    fare: draft.fare.value !== null ? String(draft.fare.value) : '',
    airlineTaxes: draft.airlineTaxes.value !== null ? String(draft.airlineTaxes.value) : '',
    psf: draft.psf.value !== null ? String(draft.psf.value) : '',
  };

  const confidenceMap: Partial<Record<keyof PnrFormValues, FieldConfidence>> = {
    requestDate: draft.requestDate.confidence,
    investorCompany: draft.investorCompany.confidence,
    licenseId: matchedLicense ? draft.licenseName.confidence : 'low',
    branchId: matchedBranch ? draft.branchName.confidence : 'low',
    pnr: draft.pnr.confidence,
    gdsPnr: draft.gdsPnr.confidence,
    segment: draft.segment.confidence,
    airlineId: matchedAirline ? draft.airlineCode.confidence : 'low',
    seats: draft.seats.confidence,
    outboundDate: draft.outboundDate.confidence,
    inboundDate: draft.inboundDate.confidence,
    sector: draft.sector.confidence,
    pnrTlDate: draft.pnrTlDate.confidence,
    dealPct: draft.dealPct.confidence,
    fare: draft.fare.confidence,
    airlineTaxes: draft.airlineTaxes.confidence,
    psf: draft.psf.confidence,
  };

  return { values, confidenceMap };
}

export default function AiIntakeForm({
  options,
  action,
}: {
  options: PnrFormOptions;
  action: (formData: FormData) => Promise<{ error: string } | undefined>;
}) {
  const [phase, setPhase] = useState<Phase>('paste');
  const [rawText, setRawText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isParsing, startParsing] = useTransition();
  const [draft, setDraft] = useState<ParsedBookingDraft | null>(null);
  const [formValues, setFormValues] = useState<PnrFormValues>(EMPTY_PNR);
  const [confidenceMap, setConfidenceMap] = useState<Partial<Record<keyof PnrFormValues, FieldConfidence>>>({});
  const [modelUsed, setModelUsed] = useState<string | null>(null);

  const handleParse = () => {
    if (!rawText.trim()) return;
    setError(null);

    startParsing(async () => {
      try {
        const res = await fetch('/api/ai/parse-pnr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: rawText }),
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.error || 'Failed to parse airline message.');
          return;
        }

        const parsed = data.draft as ParsedBookingDraft;
        setDraft(parsed);
        setModelUsed(parsed.modelUsed ?? null);

        const { values, confidenceMap: cm } = draftToFormValues(parsed, options);
        setFormValues(values);
        setConfidenceMap(cm);
        setPhase('review');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      }
    });
  };

  const handleStartOver = () => {
    setPhase('paste');
    setDraft(null);
    setFormValues(EMPTY_PNR);
    setConfidenceMap({});
    setModelUsed(null);
    setError(null);
  };

  // Count confidence levels for the summary bar
  const confCounts = draft
    ? Object.values(confidenceMap).reduce(
        (acc, c) => {
          if (c) acc[c] = (acc[c] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      )
    : null;

  if (phase === 'paste') {
    return (
      <div className="space-y-5">
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-violet-500 to-purple-500 flex items-center justify-center text-white shadow-sm">
              <ClipboardPaste className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-stone-900">Paste airline message</h2>
              <p className="text-[11px] text-stone-400">
                Paste a confirmation email, GDS PNR, or booking slip. The AI will extract the fields.
              </p>
            </div>
          </div>

          <textarea
            id="ai-paste-box"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={`Paste the full airline confirmation message here...\n\nExamples:\n• Saudia group booking confirmation email\n• GDS PNR printout (Sabre, Amadeus, Galileo)\n• Airline booking slip with EMD details`}
            className="w-full h-56 bg-stone-50 border border-stone-300 rounded-xl px-4 py-3 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-violet-400/50 focus:border-violet-400 transition-colors font-mono resize-y"
          />

          {error && (
            <div className="flex items-start gap-3 p-3.5 mt-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end mt-4">
            <button
              id="ai-parse-btn"
              type="button"
              onClick={handleParse}
              disabled={isParsing || !rawText.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-tr from-violet-500 to-purple-500 hover:from-violet-400 hover:to-purple-400 disabled:opacity-50 shadow-md shadow-violet-500/25 transition-all cursor-pointer"
            >
              {isParsing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Parsing...
                </>
              ) : (
                <>
                  <Bot className="w-4 h-4" />
                  Parse with AI
                </>
              )}
            </button>
          </div>
        </section>
      </div>
    );
  }

  // Phase: review
  return (
    <div className="space-y-5">
      {/* AI extraction summary bar */}
      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-sm">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-stone-900">AI extraction complete</h2>
              <p className="text-[11px] text-stone-400">
                Review the pre-filled fields below. Low-confidence fields are highlighted in red.
                {modelUsed && (
                  <span className="ml-1.5 text-stone-300">
                    Model: {modelUsed.split('/').pop()?.replace(':free', '')}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Confidence summary */}
            {confCounts && (
              <div className="flex items-center gap-3 text-[11px]">
                {confCounts.high ? (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-stone-500">{confCounts.high} high</span>
                  </span>
                ) : null}
                {confCounts.medium ? (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-stone-500">{confCounts.medium} medium</span>
                  </span>
                ) : null}
                {confCounts.low ? (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-400" />
                    <span className="text-stone-500">{confCounts.low} low</span>
                  </span>
                ) : null}
              </div>
            )}

            <button
              id="ai-start-over-btn"
              type="button"
              onClick={handleStartOver}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 bg-white hover:bg-stone-50 border border-stone-300 rounded-xl shadow-sm transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Start over
            </button>
          </div>
        </div>
      </section>

      {/* The real form — reusing PnrForm with pre-filled values + confidence indicators */}
      <PnrForm
        mode="create"
        options={options}
        initial={formValues}
        action={action}
        confidenceMap={confidenceMap}
        rawAirlineText={rawText}
      />
    </div>
  );
}
