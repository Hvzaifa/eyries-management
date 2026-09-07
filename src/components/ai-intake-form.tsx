'use client';

import { useRef, useState, useTransition } from 'react';
import { Bot, ClipboardPaste, Loader2, RotateCcw, AlertTriangle, ImagePlus, X, FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import PnrForm, { type PnrFormValues } from '@/components/pnr-form';
import type { PnrFormOptions } from '@/lib/pnrs';
import type { ParsedBookingDraft, FieldConfidence } from '@/lib/ai/parse-booking';

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
  const airlineCode = draft.airlineCode.value?.toUpperCase() ?? '';
  const matchedAirline = options.airlines.find((a) => a.code.toUpperCase() === airlineCode);

  const licenseName = draft.licenseName.value?.toUpperCase() ?? '';
  const matchedLicense = options.licenses.find((l) => l.name.toUpperCase() === licenseName);

  const branchName = draft.branchName.value?.toUpperCase() ?? '';
  const matchedBranch = options.branches.find((b) => b.name.toUpperCase() === branchName);

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
  action: (formData: FormData) => Promise<{ error: string } | undefined>;
}) {
  const [phase, setPhase] = useState<Phase>('paste');
  const [rawText, setRawText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isParsing, startParsing] = useTransition();

  // Multi-PNR state
  const [drafts, setDrafts] = useState<ParsedBookingDraft[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedIndexes, setCompletedIndexes] = useState<Set<number>>(new Set());

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
            payload.imageBase64 = await fileToBase64(file);
            payload.imageMimeType = file.type;
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
        setCurrentIndex(0);
        setCompletedIndexes(new Set());
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
    setCompletedIndexes(new Set());
    setError(null);
    removeFile();
  };

  const markCurrentCompleteAndNext = () => {
    setCompletedIndexes((prev) => {
      const next = new Set(prev);
      next.add(currentIndex);
      return next;
    });
    // Auto-advance to next incomplete if possible
    let nextIdx = currentIndex + 1;
    while (nextIdx < drafts.length && completedIndexes.has(nextIdx)) {
      nextIdx++;
    }
    if (nextIdx < drafts.length) {
      setCurrentIndex(nextIdx);
    }
  };

  const skipCurrent = () => {
    if (currentIndex < drafts.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  if (phase === 'paste') {
    return (
      <div className="space-y-5">
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-violet-500 to-purple-500 flex items-center justify-center text-white shadow-sm">
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
            className="w-full h-44 bg-stone-50 border border-stone-300 rounded-xl px-4 py-3 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-violet-400/50 focus:border-violet-400 transition-colors font-mono resize-y"
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
                className="border-2 border-dashed border-stone-300 hover:border-violet-400 rounded-xl p-6 text-center cursor-pointer transition-colors group"
              >
                <ImagePlus className="w-8 h-8 mx-auto text-stone-300 group-hover:text-violet-400 transition-colors" />
                <p className="mt-2 text-xs text-stone-500">
                  <span className="text-violet-600 font-medium">Click to upload</span> or drag and drop
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
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-tr from-violet-500 to-purple-500 hover:from-violet-400 hover:to-purple-400 disabled:opacity-50 shadow-md shadow-violet-500/25 transition-all cursor-pointer"
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
                    Model: {currentDraft.modelUsed.split('/').pop()?.replace(':free', '')}
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
                      ? 'border-indigo-400 bg-indigo-50/50 shadow-sm' 
                      : isCompleted 
                        ? 'border-stone-200 bg-stone-50 hover:bg-stone-100'
                        : 'border-stone-200 bg-white hover:border-indigo-200'
                  }`}
                >
                  <div className="flex flex-col">
                    <span className={`text-xs font-medium ${isActive ? 'text-indigo-900' : 'text-stone-700'}`}>
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
          
          <PnrForm
            key={currentIndex} // Force remount on change so form state resets
            mode="create"
            options={options}
            initial={values}
            action={action}
            confidenceMap={confidenceMap}
            rawAirlineText={currentDraft.rawPastedText}
            submitLabel={currentIndex < drafts.length - 1 ? 'Save & Next' : 'Save & Finish'}
            onSkip={currentIndex < drafts.length - 1 ? skipCurrent : undefined}
            onSuccess={markCurrentCompleteAndNext}
          />
        </div>
      </div>
    </div>
  );
}
