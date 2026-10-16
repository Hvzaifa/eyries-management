import * as xlsx from 'xlsx';
import type { ParsedBookingDraft } from './parse-booking';
import { callAi } from './parse-booking';
import { flagPastDates } from './draft-checks';
import {
  MAPPING_RESPONSE_SCHEMA,
  MAX_FORM_ROWS,
  applyMapping,
  heuristicMapping,
  mappingPrompt,
  sampleForPrompt,
  validateMapping,
  type ColumnMapping,
} from './excel-mapping';
import { todayIsoInPkt } from '@/lib/urgency';

/** The sheet has no column that can be read as a PNR, by the AI or the dictionary. */
export class ExcelMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExcelMappingError';
  }
}

export interface ExcelParseResult {
  drafts: ParsedBookingDraft[];
  /** Data rows found, which may exceed the drafts returned (`MAX_FORM_ROWS`). */
  totalRows: number;
  /** Shown to staff above the drafts, e.g. when only the first rows were loaded. */
  notice: string | null;
}

/**
 * An uploaded Excel or CSV file as booking drafts (rewritten 2026-10-05).
 *
 * One AI request reads the top rows and returns which column is which field —
 * whatever the headers are called, a totals row on top, round columns repeated
 * per round. The values are then copied by `applyMapping`, never by the AI.
 * If no AI answers, or its map is unusable, the fixed dictionary maps the
 * columns instead, so an upload still works on a bad day.
 *
 * The old parser assumed headers on row 1 (the master sheet has a totals row
 * there), matched headers by substring ("type" caught INVESTMENT TYPE as the
 * segment), and hard-coded flights and every EMD round field to empty.
 */
export async function parseExcelFile(
  buffer: ArrayBuffer,
  filename: string,
  todayIso: string = todayIsoInPkt()
): Promise<ExcelParseResult> {
  const wb = xlsx.read(buffer, { type: 'array' });
  // The first sheet that has any rows — a workbook's bookings sheet comes first.
  const sheet = wb.SheetNames.map((n) => wb.Sheets[n]).find((s) => s?.['!ref']);
  if (!sheet) throw new ExcelMappingError('This file has no rows to read.');

  const firstRowNumber = xlsx.utils.decode_range(sheet['!ref']!).s.r + 1;
  const rawRows = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: true });
  const formattedRows = xlsx.utils
    .sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '', blankrows: true })
    .map((row) => row.map((c) => String(c ?? '')));
  const width = Math.max(0, ...formattedRows.slice(0, 20).map((r) => r.length));

  let mapping: ColumnMapping | null = null;
  let method = 'excel: columns mapped by dictionary';
  let confidence: 'high' | 'medium' = 'medium';
  try {
    mapping = await callAi(
      {
        system: mappingPrompt(),
        user: `File: ${filename}\n\n${sampleForPrompt(formattedRows)}`,
        schema: MAPPING_RESPONSE_SCHEMA,
        schemaName: 'column_mapping',
      },
      (content, attempt) => {
        const parsed = validateMapping(JSON.parse(content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()), width, formattedRows.length);
        if (!parsed) throw new Error('The column map had no usable PNR column.');
        method = `excel: columns mapped by ${attempt.provider}/${attempt.model}`;
        confidence = 'high';
        return parsed;
      }
    );
  } catch (err) {
    // No AI, or no usable answer: the dictionary takes over.
    console.warn(`[AI] excel column mapping fell back to the dictionary: ${err instanceof Error ? err.name : 'error'}`);
  }
  mapping ??= heuristicMapping(formattedRows);
  if (!mapping) {
    throw new ExcelMappingError('No PNR column could be found in this sheet. Check that it has a header row with a PNR column.');
  }

  const { drafts, totalRows } = applyMapping(mapping, rawRows, formattedRows, {
    filename,
    method,
    confidence,
    firstRowNumber,
  });

  return {
    drafts: drafts.map((d) => flagPastDates(d, todayIso)),
    totalRows,
    notice:
      totalRows > MAX_FORM_ROWS
        ? `This sheet has ${totalRows} bookings; the first ${MAX_FORM_ROWS} are loaded for review here. Upload the rest as a separate sheet.`
        : null,
  };
}
