/**
 * Creates a synthetic legacy-style sheet to exercise the importer end-to-end:
 *   npx tsx scripts/make-sample-sheet.ts /tmp/sample.xlsx
 * Contains clean rows, the decisions.md duplicate case (same PNR, seats
 * changed), an unparseable date, and lookup values that do not exist.
 */
import 'dotenv/config';
import * as XLSX from 'xlsx';
import { writeFileSync } from 'fs';

const rows = [
  {
    SR: 1,
    'Request Date': '2026-06-01',
    Company: 'Alpha Travels',
    License: 'TRV ADV',
    Branch: 'Islamabad',
    PNR: 'AAA111',
    Segment: 'Employment',
    Airline: 'EK',
    Seats: 50,
    'Outbound Date': '2026-09-15',
    Sector: 'ISB-DXB-ISB',
    'Deal %': '7.5%',
    Issued: 'unissued',
    Taxes: 42000,
    PSF: 1500,
    Fare: '85,000',
    'EMD No': 'EK-1',
    'Payment %': '30%',
    'EMD Amount': 1275000,
    Deadline: '2026-08-01',
  },
  {
    SR: 2,
    'Request Date': '2026-07-10',
    Company: 'Beta Tours',
    License: 'SIX SIGMA',
    Branch: 'Rawalpindi',
    PNR: 'BBB222',
    Segment: 'Umrah',
    Airline: 'SV',
    Seats: 90,
    'Outbound Date': '2026-08-20',
    Sector: 'ISB-JED-ISB',
    'Deal %': 0.1,
    Issued: 'issued',
    Taxes: 48000,
    PSF: 1500,
    Fare: 92000,
    'EMD Amount': 1200000,
    Deadline: '2026-08-05',
  },
  {
    SR: 3,
    'Request Date': '2026-07-12',
    Company: 'Beta Tours',
    License: 'SIX SIGMA',
    Branch: 'Rawalpindi',
    PNR: 'BBB222',
    Segment: 'Umrah',
    Airline: 'SV',
    Seats: 0,
    'Outbound Date': '2026-08-20',
    Sector: 'ISB-JED-ISB',
    'Deal %': 0.1,
    Issued: 'issued',
    Taxes: 48000,
    PSF: 1500,
    Fare: 92000,
  },
  {
    SR: 4,
    'Request Date': 'not sure lol',
    Company: 'Gamma Travels',
    Branch: 'Peshawar',
    PNR: 'CCC333',
    Seats: 25,
    'Outbound Date': '2026-11-01',
    Fare: 70000,
  },
  {
    SR: 5,
    'Request Date': '2026-07-15',
    Company: 'Delta Tours',
    Branch: 'Nowhere City',
    PNR: 'DDD444',
    Airline: 'XX',
    Seats: 40,
    'Outbound Date': 46200,
    Fare: 75000,
    Deadline: 46150,
    'Payment %': '50%',
    'EMD Amount': 1000000,
  },
];

const ws = XLSX.utils.json_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
const out = process.argv[2] ?? 'sample.xlsx';
writeFileSync(out, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
console.log(`Sample sheet written to ${out} (5 rows: 2 clean, 3 flagged incl. the duplicate-PNR pair)`);
console.log('Dry-run it with: npx tsx scripts/import-legacy.ts ' + out);
