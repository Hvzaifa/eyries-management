/**
 * One-time legacy-sheet importer (Phase 1 Step 6).
 *
 *   npx tsx scripts/import-legacy.ts <file.xlsx>            (dry-run report only)
 *   npx tsx scripts/import-legacy.ts <file.xlsx> --commit   (insert clean rows)
 *
 * Duplicate PNR codes are flagged, never silently merged (docs/decisions.md).
 *
 * NOTE: COLUMN_ALIASES below is a PROVISIONAL mapping derived from
 * docs/data-model.md vocabulary. It must be finalized against the real
 * export before any --commit run against production data.
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import * as XLSX from 'xlsx';
import { prisma } from '../src/lib/prisma';
import {
  normalizePnrCode,
  parseAmount,
  parseExcelDate,
  parsePercent,
  partitionRows,
  type MappedLegacyRow,
} from '../src/lib/legacy-import';

const COLUMN_ALIASES: Record<string, string[]> = {
  request_date: ['request date', 'req date', 'date', 'request'],
  investor_company: ['investor company', 'company', 'investor', 'agent', 'client', 'party'],
  license: ['license', 'licence', 'company license'],
  branch: ['branch', 'office', 'city'],
  pnr: ['pnr', 'pnr code', 'pnr no'],
  gds_pnr: ['gds pnr', 'gds'],
  segment: ['segment', 'purpose', 'type'],
  airline: ['airline', 'carrier'],
  seats: ['seats', 'seat', 'total seats'],
  outbound_date: ['outbound date', 'departure date', 'departure', 'outbound'],
  inbound_date: ['inbound date', 'return date', 'return', 'inbound'],
  sector: ['sector', 'route', 'sectors'],
  pnr_tl_date: ['pnr tl date', 'pnr tl', 'tl date', 'time limit', 'void date'],
  deal_pct: ['deal %', 'deal pct', 'deal percent', 'deal'],
  issued_status: ['issued status', 'issued', 'status'],
  airline_taxes: ['airline taxes', 'taxes', 'tax'],
  psf: ['psf'],
  fare: ['fare', 'base fare', 'per seat fare'],
  round_payment_pct: ['payment %', 'payment pct', 'emd %', 'emd percent'],
  round_emd_number: ['emd no', 'emd number', 'emd #'],
  round_emd_amount: ['emd amount', 'amount', 'deposit amount'],
  round_deadline_date: ['deadline', 'deadline date', 'emd deadline'],
};

function buildHeaderMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const normalized = headers.map((h) => String(h ?? '').trim().toLowerCase());
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const idx = normalized.indexOf(alias);
      if (idx >= 0) {
        map[field] = headers[idx];
        break;
      }
    }
  }
  return map;
}

function cell(sheet: Record<string, unknown>, header: string | undefined): unknown {
  if (!header || !(header in sheet)) return null;
  return sheet[header];
}

async function resolveLookups() {
  const [licenses, branches, airlines] = await Promise.all([
    prisma.license.findMany(),
    prisma.branch.findMany(),
    prisma.airline.findMany(),
  ]);
  const findLicense = (v: unknown) =>
    licenses.find((l) => l.name.toLowerCase() === String(v ?? '').trim().toLowerCase())?.id ?? null;
  const findBranch = (v: unknown) =>
    branches.find((b) => b.name.toLowerCase() === String(v ?? '').trim().toLowerCase())?.id ?? null;
  const findAirline = (v: unknown) => {
    const s = String(v ?? '').trim().toLowerCase();
    return (
      airlines.find((a) => a.code.toLowerCase() === s)?.id ??
      airlines.find((a) => a.name.toLowerCase() === s)?.id ??
      null
    );
  };
  return { findLicense, findBranch, findAirline };
}

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find((a) => !a.startsWith('--'));
  const commit = args.includes('--commit');

  if (!filePath) {
    console.error('Usage: npx tsx scripts/import-legacy.ts <file.xlsx> [--commit]');
    process.exit(1);
  }

  const workbook = XLSX.read(readFileSync(filePath), { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: null,
  });

  if (raw.length === 0) {
    console.error(`Sheet "${sheetName}" has no data rows.`);
    process.exit(1);
  }
  console.log(`Sheet "${sheetName}": ${raw.length} data rows.`);

  const headers = Object.keys(raw[0]);
  const headerMap = buildHeaderMap(headers);
  console.log('Mapped columns:', Object.entries(headerMap).map(([f, h]) => `${f} <- "${h}"`).join(', ') || 'NONE');
  const missingCritical = ['pnr', 'request_date', 'seats', 'fare'].filter((f) => !headerMap[f]);
  if (missingCritical.length > 0) {
    console.error(`\nFATAL: could not find columns for required field(s): ${missingCritical.join(', ')}.`);
    console.error('Update COLUMN_ALIASES in scripts/import-legacy.ts to match this sheet before importing.');
    process.exit(1);
  }

  const lookups = await resolveLookups();
  const mapped: MappedLegacyRow[] = raw.map((r, i) => {
    const rowNumber = i + 2; // +2: spreadsheet 1-based + header row
    const warnings: string[] = [];
    const errors: string[] = [];

    const pnrCode = strCell(cell(r, headerMap['pnr']));
    if (!pnrCode) errors.push('missing PNR code');

    const requestDate = parseExcelDate(cell(r, headerMap['request_date']));
    if (!requestDate) errors.push('missing/unparseable request date');

    const seats = parseAmount(cell(r, headerMap['seats']));
    if (seats === null) errors.push('missing seats');

    const fare = parseAmount(cell(r, headerMap['fare']));
    if (fare === null) errors.push('missing fare');

    const licenseRaw = cell(r, headerMap['license']);
    let licenseId: string | null = null;
    if (notBlank(licenseRaw)) {
      licenseId = lookups.findLicense(licenseRaw);
      if (!licenseId) warnings.push(`license "${licenseRaw}" not found in lookup table - left empty`);
    }

    const branchRaw = cell(r, headerMap['branch']);
    let branchId: string | null = null;
    if (notBlank(branchRaw)) {
      branchId = lookups.findBranch(branchRaw);
      if (!branchId) warnings.push(`branch "${branchRaw}" not found - left empty`);
    }

    const airlineRaw = cell(r, headerMap['airline']);
    let airlineId: string | null = null;
    if (notBlank(airlineRaw)) {
      airlineId = lookups.findAirline(airlineRaw);
      if (!airlineId) warnings.push(`airline "${airlineRaw}" not found - left empty`);
    }

    const outboundDate = parseExcelDate(cell(r, headerMap['outbound_date']));
    const roundDeadline = parseExcelDate(cell(r, headerMap['round_deadline_date']));
    const roundPct = parsePercent(cell(r, headerMap['round_payment_pct']));
    const roundAmount = parseAmount(cell(r, headerMap['round_emd_amount']));
    if ((roundDeadline !== null || roundAmount !== null) && (roundPct === null || roundDeadline === null || roundAmount === null)) {
      errors.push('incomplete EMD-1 details (need payment %, amount AND deadline together)');
    }

    return {
      rowNumber,
      pnrCode,
      warnings,
      errors,
      data: {
        requestDate: requestDate!,
        investorCompany: strCell(cell(r, headerMap['investor_company'])),
        licenseId,
        branchId,
        pnr: pnrCode,
        gdsPnr: strCell(cell(r, headerMap['gds_pnr'])),
        segment: strCell(cell(r, headerMap['segment'])),
        airlineId,
        seats: seats as number,
        outboundDate,
        inboundDate: parseExcelDate(cell(r, headerMap['inbound_date'])),
        sector: strCell(cell(r, headerMap['sector'])),
        pnrTlDate: parseExcelDate(cell(r, headerMap['pnr_tl_date'])),
        dealPct: parsePercent(cell(r, headerMap['deal_pct'])),
        issuedStatus: /iss/i.test(String(cell(r, headerMap['issued_status']) ?? '')) ? 'issued' : 'unissued',
        airlineTaxes: parseAmount(cell(r, headerMap['airline_taxes'])),
        psf: parseAmount(cell(r, headerMap['psf'])),
        fare: fare!,
        round: roundDeadline
          ? {
              issuanceDate: requestDate!,
              paymentPct: roundPct as number,
              emdNumber: strCell(cell(r, headerMap['round_emd_number'])),
              emdAmount: roundAmount as number,
              deadlineDate: roundDeadline,
            }
          : null,
      },
    };
  });

  const { clean, flagged } = partitionRows(mapped);

  console.log('\n================ IMPORT REPORT ================');
  console.log(`Total rows: ${mapped.length}`);
  console.log(`Clean (will insert): ${clean.length}`);
  console.log(`Flagged (need human review): ${flagged.length}`);

  if (flagged.length > 0) {
    console.log('\n--- FLAGGED ROWS ---');
    for (const f of flagged) {
      console.log(`Row ${f.rowNumber} [${normalizePnrCode(f.pnrCode) || 'no code'}]:`);
      for (const e of f.errors) console.log(`   ERROR: ${e}`);
      for (const w of f.warnings) console.log(`   warn:  ${w}`);
    }
  }

  if (clean.length > 0 && clean.some((c) => c.warnings.length > 0)) {
    console.log('\n--- CLEAN ROWS WITH WARNINGS ---');
    for (const c of clean.filter((x) => x.warnings.length > 0)) {
      console.log(`Row ${c.rowNumber} [${c.pnrCode}]: ${c.warnings.join('; ')}`);
    }
  }
  console.log('==============================================');

  if (!commit) {
    console.log('\nDry run only - nothing was written. Re-run with --commit to insert clean rows.');
  } else {
    console.log('\nInserting clean rows...');
    for (const c of clean) {
      const d = c.data as Record<string, unknown>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pnr = await prisma.pnr.create({ data: d as any });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inserts: any[] = [
        {
          tableName: 'pnrs',
          recordId: pnr.id,
          fieldName: null,
          oldValue: null,
          newValue: 'record created',
        },
      ];
      if (d.round) {
        const roundData = d.round as Record<string, unknown>;
        const round = await prisma.emdRound.create({
          data: {
            pnrId: pnr.id,
            roundNumber: 1,
            issuanceDate: roundData.issuanceDate as Date,
            paymentPct: roundData.paymentPct as number,
            emdNumber: roundData.emdNumber as string | null,
            emdAmount: roundData.emdAmount as number,
            deadlineDate: roundData.deadlineDate as Date,
            status: 'pending',
          },
        });
        inserts.push({
          tableName: 'emd_rounds',
          recordId: round.id,
          fieldName: null,
          oldValue: null,
          newValue: 'round 1 created',
        });
      }
      await prisma.activityLog.createMany({ data: inserts });
      console.log(`  inserted ${pnr.pnr} (${pnr.id})`);
    }
    console.log(`Done. ${clean.length} bookings imported, ${flagged.length} rows left for manual review.`);
  }

  await prisma.$disconnect();
}

function notBlank(v: unknown): boolean {
  return v !== null && v !== undefined && String(v).trim() !== '';
}

function strCell(v: unknown): string | null {
  if (!notBlank(v)) return null;
  return String(v).trim();
}

main().catch(async (err) => {
  console.error('Import failed:', err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
