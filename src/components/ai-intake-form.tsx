'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Bot, ClipboardPaste, Loader2, RotateCcw, AlertTriangle, ImagePlus, X, FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import PnrForm from '@/components/pnr-form';
import type { PnrFormValues } from '@/lib/pnr-form-values';
import { normalizeSegment } from '@/lib/booking-entry';
import type { PnrFormOptions } from '@/lib/pnrs';
import type { ParsedBookingDraft, FieldConfidence } from '@/lib/ai/parse-booking';
import { draftFlightValues } from '@/lib/ai/draft-flights';
import { draftNotes } from '@/lib/ai/draft-checks';
import { matchLookup } from '@/lib/lookups';

type Phase = 'paste' | 'review';

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const ACCEPTED_EXCEL_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'text/csv',
];
const ACCEPTED_FILE_TYPES = [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_EXCEL_TYPES];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function draftToFormValues(
  draft: ParsedBookingDraft,
  options: PnrFormOptions
): {
  values: PnrFormValues;
  confidenceMap: Partial<Record<keyof PnrFormValues, FieldConfidence>>;
} {
  // Each may be written by its code or its name: "SV" or "Saudi Arabian
  // Airlines", "TA-ISB-BSP" or "Travel Advisor Islamabad", "RWP" or "Rawalpindi".
  const matchedAirline = matchLookup(options.airlines, draft.airlineCode.value);
  const matchedLicense = matchLookup(options.licenses, draft.licenseName.value);
  const matchedBranch = matchLookup(options.branches, draft.branchName.value);

  const flights = draftFlightValues(draft);
  const oneWay = flights.values.tripType === 'one_way';

  const values: PnrFormValues = {
    requestDate: draft.requestDate.value ?? '',
    investorCompany: draft.investorCompany.value ?? '',
    licenseId: matchedLicense?.id ?? '',
    branchId: matchedBranch?.id ?? '',
    pnr: draft.pnr.value ?? '',
    gdsPnr: draft.gdsPnr.value ?? '',
    // The model may return any wording; the segment list is fixed, so an
    // unrecognised value starts blank rather than pre-filling something the
    // save will reject (owner ruling, 2026-09-20).
    segment: normalizeSegment(draft.segment.value ?? null) ?? '',
    airlineId: matchedAirline?.id ?? '',
    seats: draft.seats.value !== null ? String(draft.seats.value) : '',
    outboundDate: draft.outboundDate.value ?? '',
    inboundDate: oneWay ? '' : draft.inboundDate.value ?? '',
    ...flights.values,
    pnrTlDate: draft.pnrTlDate.value ?? '',
    ticketIssuanceDeadline: draft.ticketIssuanceDeadline.value ?? '',
    mealIncluded: draft.mealIncluded.value ? 'yes' : 'no',
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
    ...(oneWay ? {} : { inboundDate: draft.inboundDate.confidence }),
    ...flights.confidence,
    pnrTlDate: draft.pnrTlDate.confidence,
    ...(draft.ticketIssuanceDeadline.value ? { ticketIssuanceDeadline: draft.ticketIssuanceDeadline.confidence } : {}),
    mealIncluded: draft.mealIncluded.confidence,
    fare: draft.fare.confidence,
    airlineTaxes: draft.airlineTaxes.confidence,
    psf: draft.psf.confidence,
  };

  return { values, confidenceMap };
}

/** A screenshot's longest side once shrunk for upload. GDS text stays legible at this size. */
const MAX_IMAGE_SIDE = 1600;

/**
 * Shrinks a large screenshot in the browser before upload (2026-10-05): a phone
 * screenshot at full size was slow to send and slow for the model to read, which
 * fed the "AI is busy" timeouts. Re-encoded as JPEG 0.85; an image already
 * small enough is sent untouched. Falls back to the original if the browser
 * cannot decode it.
 */
async function imageToUploadBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1) {
      bitmap.close();
      return { base64: await fileToBase64(file), mimeType: file.type };
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.fillStyle = '#ffffff'; // a transparent PNG would turn black as JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return { base64: canvas.toDataURL('image/jpeg', 0.85).split(',')[1], mimeType: 'image/jpeg' };
  } catch {
    return { base64: await fileToBase64(file), mimeType: file.type };
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AiIntakeForm({
  options,
  action,
}: {
  options: PnrFormOptions;
  action: (formData: FormData) => Promise<{ error: string } | { id: string; pnr: string }>;
}) {
  const [phase, setPhase] = useState<Phase>('paste');
  const [rawText, setRawText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isParsing, startParsing] = useTransition();

  // Multi-PNR state
  const [drafts, setDrafts] = useState<ParsedBookingDraft[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  // Saved drafts and the booking each became, so a saved one is never saved twice.
  const [saved, setSaved] = useState<Map<number, { id: string; pnr: string }>>(new Map());
  const completedIndexes = new Set(saved.keys());
  const [notice, setNotice] = useState<string | null>(null);

  // File upload state
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasInput = rawText.trim() || file;

  const handleFileSelect = (selectedFile: File) => {
    if (
      !ACCEPTED_FILE_TYPES.includes(selectedFile.type) &&
      !selectedFile.name.endsWith('.csv') &&
      !selectedFile.name.endsWith('.xlsx')
    ) {
      setError('Only PNG, JPEG, WebP, XLSX, and CSV files are supported.');
      return;
    }
    if (selectedFile.size > MAX_FILE_SIZE) {
      setError('File too large. Maximum size is 10 MB.');
      return;
    }
    setError(null);
    setFile(selectedFile);

    if (selectedFile.type.startsWith('image/')) {
      setFilePreview(URL.createObjectURL(selectedFile));
    } else {
      setFilePreview(null);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFileSelect(f);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelect(f);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const removeFile = () => {
    setFile(null);
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFilePreview(null);
  };

  const handleParse = () => {
    if (!hasInput) return;
    setError(null);

    startParsing(async () => {
      try {
        const payload: Record<string, string> = {};
        if (rawText.trim()) payload.text = rawText;

        if (file) {
          const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.csv');
          if (isExcel) {
            payload.excelBase64 = await fileToBase64(file);
            payload.excelFileName = file.name;
          } else {
            const img = await imageToUploadBase64(file);
            payload.imageBase64 = img.base64;
            payload.imageMimeType = img.mimeType;
          }
        }

        const res = await fetch('/api/ai/parse-pnr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.error || 'Failed to parse data.');
          return;
        }

        const parsedDrafts = data.drafts as ParsedBookingDraft[];
        if (!parsedDrafts || parsedDrafts.length === 0) {
          setError('No bookings could be extracted from the provided input.');
          return;
        }

        setDrafts(parsedDrafts);
        setNotice(typeof data.notice === 'string' ? data.notice : null);
        setCurrentIndex(0);
        setSaved(new Map());
        setPhase('review');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      }
    });
  };

  const handleStartOver = () => {
    setPhase('paste');
    setDrafts([]);
    setCurrentIndex(0);
    setSaved(new Map());
    setNotice(null);
    setError(null);
    removeFile();
  };

  /** The next unsaved draft after `from`, wrapping round to any skipped earlier; null when all are saved. */
  const nextUnsaved = (from: number, done: Set<number>): number | null => {
    for (let step = 1; step < drafts.length; step++) {
      const i = (from + step) % drafts.length;
      if (!done.has(i)) return i;
    }
    return null;
  };

  const markCurrentCompleteAndNext = (result?: { id: string; pnr: string }) => {
    if (!result) return;
    const next = new Map(saved).set(currentIndex, result);
    setSaved(next);
    const nextIdx = nextUnsaved(currentIndex, new Set(next.keys()));
    if (nextIdx !== null) setCurrentIndex(nextIdx);
  };

  const skipCurrent = () => {
    const nextIdx = nextUnsaved(currentIndex, completedIndexes);
    if (nextIdx !== null) setCurrentIndex(nextIdx);
  };

  if (phase === 'paste') {
    return (
      <div className="space-y-5">
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand to-brand-light flex items-center justify-center text-white shadow-sm">
              <ClipboardPaste className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-stone-900">Bulk Paste or Upload</h2>
              <p className="text-[11px] text-stone-400">
                Paste airline details, upload an image, or drop an Excel (.xlsx/.csv) sheet containing multiple bookings.
              </p>
            </div>
          </div>

          <textarea
            id="ai-paste-box"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={`Paste text containing multiple bookings here...`}
            className="w-full h-44 bg-stone-50 border border-stone-300 rounded-xl px-4 py-3 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-brand-light/50 focus:border-brand-light transition-colors font-mono resize-y"
          />

          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-stone-600">File Attachment</span>
              <span className="text-[11px] text-stone-400">(optional)</span>
            </div>

            {file ? (
              <div className="relative inline-block">
                {filePreview ? (
                  /* eslint-disable-next-line @next/next/no-img-element --
                     filePreview is a client-side data: URL for a file the user just
                     picked. next/image cannot optimise a data URL and would need the
                     dimensions up front, which we do not have. */
                  <img src={filePreview} alt="Preview" className="max-h-48 rounded-xl border border-stone-200 shadow-sm" />
                ) : (
                  <div className="flex flex-col items-center justify-center w-48 h-32 rounded-xl border border-stone-200 bg-stone-50 shadow-sm">
                    <FileSpreadsheet className="w-8 h-8 text-stone-400 mb-2" />
                    <p className="text-xs text-stone-600 font-medium truncate max-w-[90%]">{file.name}</p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={removeFile}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-400 text-white rounded-full flex items-center justify-center shadow-md transition-colors cursor-pointer"
                  title="Remove file"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-stone-300 hover:border-brand-light rounded-xl p-6 text-center cursor-pointer transition-colors group"
              >
                <ImagePlus className="w-8 h-8 mx-auto text-stone-300 group-hover:text-brand-light transition-colors" />
                <p className="mt-2 text-xs text-stone-500">
                  <span className="text-brand-dark font-medium">Click to upload</span> or drag and drop
                </p>
                <p className="mt-0.5 text-[11px] text-stone-400">Images or Excel (.xlsx, .csv) · Max 10 MB</p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpeg,.jpg,.webp,.xlsx,.csv"
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>

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
              disabled={isParsing || !hasInput}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-tr from-brand to-brand-light hover:from-brand-dark hover:to-brand-dark disabled:opacity-50 shadow-md shadow-brand/25 transition-all cursor-pointer"
            >
              {isParsing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Parsing batch...
                </>
              ) : (
                <>
                  <Bot className="w-4 h-4" />
                  Parse Batch
                </>
              )}
            </button>
          </div>
        </section>
      </div>
    );
  }

  // Phase: Batch Review
  const currentDraft = drafts[currentIndex];
  const { values, confidenceMap } = draftToFormValues(currentDraft, options);

  const notes = draftNotes(currentDraft);

  const confCounts = Object.values(confidenceMap).reduce((acc, c) => {
    if (c) acc[c] = (acc[c] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-sm">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-stone-900">
                Batch extraction complete ({drafts.length} found)
              </h2>
              <p className="text-[11px] text-stone-400">
                Review the fields below. Low-confidence fields are highlighted in red.
                {currentDraft.modelUsed && (
                  <span className="ml-1.5 text-stone-300">
                    Model: {currentDraft.modelUsed}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleStartOver}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 bg-white hover:bg-stone-50 border border-stone-300 rounded-xl shadow-sm transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Discard Batch
            </button>
          </div>
        </div>
      </section>

      {notice && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{notice}</span>
        </div>
      )}

      {notes.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-900">
          <p className="font-semibold mb-1 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Check before saving
          </p>
          <ul className="list-disc pl-5 space-y-0.5">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Split screen layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar list */}
        <div className="lg:col-span-1 space-y-2">
          <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wider px-1">
            Bookings ({completedIndexes.size} / {drafts.length})
          </h3>
          <div className="flex flex-col gap-1.5 max-h-[600px] overflow-y-auto pr-2">
            {drafts.map((d, idx) => {
              const isCompleted = completedIndexes.has(idx);
              const isActive = currentIndex === idx;
              return (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`flex items-center justify-between p-3 rounded-xl border text-left transition-colors ${
                    isActive 
                      ? 'border-brand-light bg-brand-50/50 shadow-sm' 
                      : isCompleted 
                        ? 'border-stone-200 bg-stone-50 hover:bg-stone-100'
                        : 'border-stone-200 bg-white hover:border-brand-200'
                  }`}
                >
                  <div className="flex flex-col">
                    <span className={`text-xs font-medium ${isActive ? 'text-brand-dark' : 'text-stone-700'}`}>
                      {d.pnr.value || 'Unknown PNR'}
                    </span>
                    <span className="text-[10px] text-stone-400">
                      {d.airlineCode.value} {d.seats.value ? `- ${d.seats.value} pax` : ''}
                    </span>
                  </div>
                  {isCompleted && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Form area */}
        <div className="lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-stone-900">
              Reviewing #{currentIndex + 1}
            </h3>
            {/* Confidence summary */}
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
          </div>
          
          {saved.size === drafts.length && (
            <div className="mb-4 flex items-center justify-between gap-3 flex-wrap p-4 rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                All {drafts.length} booking{drafts.length === 1 ? '' : 's'} saved.
              </span>
              <span className="flex items-center gap-2">
                {drafts.length === 1 && (
                  <Link href={`/pnrs/${saved.get(0)!.id}`} className="text-xs font-semibold underline">Open booking</Link>
                )}
                <Link href="/" className="text-xs font-semibold px-3 py-1.5 rounded-xl text-white bg-emerald-600 hover:bg-emerald-700">
                  Go to dashboard
                </Link>
              </span>
            </div>
          )}
          {saved.has(currentIndex) ? (
            // Saved already: shown, never offered for saving again.
            <div className="p-5 rounded-2xl border border-stone-200 bg-white text-sm text-stone-700 flex items-center justify-between gap-3 flex-wrap">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>
                  Saved as <span className="font-mono font-semibold">{saved.get(currentIndex)!.pnr}</span>.
                </span>
              </span>
              <Link href={`/pnrs/${saved.get(currentIndex)!.id}`} className="text-xs font-semibold text-brand-dark hover:underline">
                Open booking →
              </Link>
            </div>
          ) : (
            <PnrForm
              key={currentIndex} // Force remount on change so form state resets
              mode="create"
              options={options}
              initial={values}
              action={action}
              confidenceMap={confidenceMap}
              rawAirlineText={currentDraft.rawPastedText}
              submitLabel={nextUnsaved(currentIndex, completedIndexes) !== null ? 'Save & Next' : 'Save & Finish'}
              onSkip={nextUnsaved(currentIndex, completedIndexes) !== null ? skipCurrent : undefined}
              onSuccess={markCurrentCompleteAndNext}
            />
          )}
        </div>
      </div>
    </div>
  );
}
