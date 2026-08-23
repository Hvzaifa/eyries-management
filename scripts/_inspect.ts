import 'dotenv/config';
import { readFileSync } from 'fs';
import * as XLSX from 'xlsx';

const wb = XLSX.read(readFileSync('Groups EMD Master Sheet.xlsx'), { cellDates: true });
console.log('SHEETS:', wb.SheetNames);

const name = wb.SheetNames.find(n => n.trim().toLowerCase() === 'ob 01june26 onwards') ?? wb.SheetNames[0];
console.log('\nUsing sheet:', JSON.stringify(name));
const ws = wb.Sheets[name];

const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
console.log('data rows:', rows.length);
console.log('\nHEADERS:', Object.keys(rows[0] ?? {}).map(h => `"${h}"`).join(', '));

// print first 3 raw rows fully
for (let i = 0; i < Math.min(3, rows.length); i++) {
  console.log(`\n--- row ${i + 2} ---`);
  for (const [k, v] of Object.entries(rows[i])) {
    console.log(`  "${k}":`, v instanceof Date ? v.toISOString().slice(0, 10) : JSON.stringify(v));
  }
}
