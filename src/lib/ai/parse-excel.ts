import * as xlsx from 'xlsx';
import type { ParsedBookingDraft, ParsedField } from './parse-booking';

/**
 * Parses an Excel or CSV file buffer into an array of ParsedBookingDrafts.
 * Uses deterministic mapping based on column headers.
 */
export function parseExcelFile(buffer: ArrayBuffer, filename: string): ParsedBookingDraft[] {
  const wb = xlsx.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  
  if (!sheet) return [];

  // Parse to JSON array of objects
  const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  return rows.map((row, index) => {
    // Basic heuristics to find columns regardless of exact naming
    const keys = Object.keys(row);
    const getVal = (possibleNames: string[]): unknown => {
      const key = keys.find(k => possibleNames.some(pn => k.toLowerCase().includes(pn.toLowerCase())));
      return key ? row[key] : null;
    };

    const makeField = <T>(val: unknown): ParsedField<T> => {
      if (val === null || val === undefined || val === '') {
        return { value: null, confidence: 'low' };
      }
      return { value: val as T, confidence: 'high' };
    };

    const makeNumField = (val: unknown): ParsedField<number> => {
      if (val === null || val === undefined || val === '') return { value: null, confidence: 'low' };
      const num = Number(String(val).replace(/[^0-9.-]/g, ''));
      return isNaN(num) ? { value: null, confidence: 'low' } : { value: num, confidence: 'high' };
    };

    const makeDateField = (val: unknown): ParsedField<string> => {
      if (!val) return { value: null, confidence: 'low' };
      // Handle Excel date serial numbers
      if (typeof val === 'number') {
        const d = new Date((val - (25567 + 2)) * 86400 * 1000); // Excel epoch adjustment
        if (!isNaN(d.getTime())) return { value: d.toISOString().slice(0,10), confidence: 'high' };
      }
      // Try parsing string
      const d = new Date(String(val));
      if (!isNaN(d.getTime())) return { value: d.toISOString().slice(0,10), confidence: 'high' };
      return { value: null, confidence: 'low' };
    };

    return {
      requestDate: makeDateField(getVal(['request date', 'date of req', 'req date'])),
      investorCompany: makeField<string>(getVal(['investor', 'company', 'agency'])),
      licenseName: makeField<string>(getVal(['license', 'licence'])),
      branchName: makeField<string>(getVal(['branch', 'city'])),
      pnr: makeField<string>(getVal(['pnr', 'record locator'])),
      gdsPnr: makeField<string>(getVal(['gds', 'sabre', 'amadeus', 'galileo'])),
      segment: makeField<string>(getVal(['segment', 'type', 'purpose'])),
      airlineCode: makeField<string>(getVal(['airline', 'carrier', 'code'])),
      seats: makeNumField(getVal(['seats', 'pax', 'qty', 'quantity'])),
      outboundDate: makeDateField(getVal(['outbound', 'dep date', 'departure date'])),
      inboundDate: makeDateField(getVal(['inbound', 'return date', 'arr date'])),
      sector: makeField<string>(getVal(['sector', 'route', 'itinerary'])),
      pnrTlDate: makeDateField(getVal(['tl date', 'time limit', 'expiry'])),
      dealPct: makeNumField(getVal(['deal', 'percentage', 'pct'])),
      airlineTaxes: makeNumField(getVal(['tax', 'taxes'])),
      psf: makeNumField(getVal(['psf', 'service fee'])),
      fare: makeNumField(getVal(['fare', 'price', 'amount'])),

      roundIssuanceDate: { value: null, confidence: 'low' },
      roundPaymentPct: { value: null, confidence: 'low' },
      roundEmdAmount: { value: null, confidence: 'low' },
      roundEmdNumber: { value: null, confidence: 'low' },
      roundDeadlineDate: { value: null, confidence: 'low' },
      roundDeadlineTime: { value: null, confidence: 'low' },

      rawPastedText: `Imported from Excel row ${index + 2} (${filename})`,
      modelUsed: 'deterministic-excel-parser',
    };
  });
}
