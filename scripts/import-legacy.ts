/**
 * One-time legacy-sheet importer (Phase 1 Step 6) — targets the real
 * "Groups EMD Master Sheet.xlsx", sheet "OB 01JUN26 Onward".
 *
 *   npx tsx scripts/import-legacy.ts "Groups EMD Master Sheet.xlsx"            (dry-run)
 *   npx tsx scripts/import-legacy.ts "Groups EMD Master Sheet.xlsx" --commit   (insert clean rows)
 *
 * Duplicate PNR codes are flagged, never silently merged (docs/decisions.md).
 * Selling-side columns (cancelled tickets / ticket loss / penalty EMD) are
 * ignored per docs/business-rules.md scope.
 */
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
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

const SHEET_NAME = 'OB 01JUN26 Onward';

interface RoundDraft {
  roundNumber: number;
  issuanceDate: Date | null;
  paymentPct: number | null;
  emdNumber: string | null;
  emdAmount: number | null;
  deadlineDate: string | null;
  deadlineTime: Date | null;
  status: 'pending' | 'refunded';
  refundAmount: number | null;
  refundDate: string | null;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function parseTimeCell(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return new Date(`1970-01-01T${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:00Z`);
  }
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const mins = Math.round(v * 1440);
    return new Date(`1970-01-01T${pad(Math.floor(mins / 60))}:${pad(mins % 60)}:00Z`);
  }
  const m = String(v).trim().match(/^(\d{1,2}):(\d{2})/);
  if (m) return new Date(`1970-01-01T${pad(Number(m[1]))}:${pad(Number(m[2]))}:00Z`);
  return null;
}

/** Locate the four repeated EMD-round column groups by header name. */
function findRoundColumns(headers: string[]) {
  const all = (name: string) =>
    headers.map((h, i) => (h === name ? i : -1)).filter((i) => i >= 0);
  const cols = {
    issuance: all('ISSUANCE DATE'),
    pct: all('PAYMENT %AGE'),
    amount: all('EMD AMOUNT').slice(0, 4),
    refundAmount: all('EMD Refund Amount'),
    refundDate: all('Date of Refund'),
    // The legacy sheet only carries time-limit columns for rounds 1–3;
    // pad so round 4 resolves to "no deadline available".
    tlDate: all('TIME LIMIT (Date)'),
    tlTime: all('TIME LIMIT (Time)'),
    numbers: [1, 2, 3, 4].map((n) =>
      headers.indexOf(`${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'} EMD NUMBER`)
    ),
  };
  if (cols.issuance.length !== 4 || cols.pct.length !== 4 || cols.amount.length !== 4 ||
      cols.refundAmount.length !== 4 || cols.refundDate.length !== 4 ||
      cols.numbers.some((i) => i < 0)) {
    throw new Error(
      `Unexpected round column layout: issuance=${cols.issuance.length} pct=${cols.pct.length} ` +
      `amount=${cols.amount.length} refundAmount=${cols.refundAmount.length} refundDate=${cols.refundDate.length}`
    );
  }
  while (cols.tlDate.length < 4) cols.tlDate.push(-1);
  while (cols.tlTime.length < 4) cols.tlTime.push(-1);
  return cols as Record<keyof typeof cols, number[]>;
}

function strCell(v: unknown): string | null {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  return String(v).trim();
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
  const sheetName = workbook.SheetNames.find((n) => n.trim().toLowerCase() === SHEET_NAME.toLowerCase());
  if (!sheetName) {
    console.error(`Sheet "${SHEET_NAME}" not found. Sheets: ${workbook.SheetNames.join(', ')}`);
    process.exit(1);
  }

  const grid = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: null,
  });
  const headerIdx = grid.findIndex((r) =>
    r.some((c) => String(c ?? '').trim().toUpperCase() === 'SR #')
  );
  if (headerIdx < 0) throw new Error('Header row ("SR #") not found.');
  const headers = (grid[headerIdx] as unknown[]).map((c) =>
    String(c ?? '').replace(/\n/g, ' ').trim()
  );
  const allRows = grid
    .slice(headerIdx + 1)
    .filter((r) => r.some((c) => c !== null && c !== undefined && String(c).trim() !== ''));

  // Owner rules for junk rows are applied after the column map below.
  const allRowsForFiltering = allRows;

  const col = (name: string) => headers.indexOf(name);
  const idx = {
    requestDate: col('REQUEST DATE'),
    investorCompany: col('INVESTMENT TYPE'),
    license: col('LICENSE'),
    branch: col('BRANCH'),
    parentPnr: col('PARENT PNR'),
    pnr: col('PNR'),
    gdsPnr: col('GDS PNR'),
    segment: col('SEGMENT'),
    airline: col('AIRLINE'),
    seats: col('NO OF SEATS'),
    outboundDate: col('OUTBOUND DATE'),
    inboundDate: col('INBOUND DATE'),
    sector: col('SECTOR'),
    pnrTlDate: col('PNR TL DATE'),
    dealPct: col('DEAL %AGE'),
    issuedStatus: col('Issued / Unissued'),
    airlineTaxes: col('Airline Taxes'),
    psf: col('PSF'),
    fare: col('FARE'),
    totalEmdValue: col('Total EMD Value (Without Taxes and PSF)'),
    ticketingStatus: col('TICKETING STATUS'),
    ticketsIssued: col('NO. OF TKT ISSUED'),
    balanceTickets: col('BALANCE TKTS'),
    nameUpdateTl: col('NAME UPDATE TL'),
    tktIssuanceTl: col('TKT ISSUANCE TL'),
  };
  for (const [k, i] of Object.entries(idx)) {
    if (i < 0) throw new Error(`Required column "${k}" not found in sheet.`);
  }
  const rounds = findRoundColumns(headers);

  // Owner rule: rows with 0 seats are junk and are dropped, never inserted.
  // Trailing pre-formatted template rows (no PNR/date/seats/fare) are skipped too.
  const skippedZeroSeats: number[] = [];
  const skippedEmptyRows: number[] = [];
  const rawRows = allRows.filter((r, i) => {
    const rowNumber = headerIdx + i + 2;
    const seats = r[idx.seats];
    if (seats !== null && Number(seats) === 0) {
      skippedZeroSeats.push(rowNumber);
      return false;
    }
    const hasAnyContent = [idx.pnr, idx.requestDate, idx.seats, idx.fare, idx.investorCompany].some(
      (ci) => r[ci] !== null && String(r[ci]).trim() !== ''
    );
    if (!hasAnyContent) {
      skippedEmptyRows.push(rowNumber);
      return false;
    }
    return true;
  });
  void allRowsForFiltering;

  // ---- lookups -----------------------------------------------------------
  const createdLookups: string[] = [];
  async function ensureLicense(name: string): Promise<string | null> {
    const existing = await prisma.license.findFirst({ where: { name } });
    if (existing) return existing.id;
    if (!commit) {
      createdLookups.push(`license "${name}"`);
      return null;
    }
    const row = await prisma.license.create({ data: { name } });
    createdLookups.push(`license "${name}"`);
    return row.id;
  }
  async function ensureBranch(name: string): Promise<string | null> {
    const existing = await prisma.branch.findFirst({ where: { name } });
    if (existing) return existing.id;
    if (!commit) {
      createdLookups.push(`branch "${name}"`);
      return null;
    }
    const row = await prisma.branch.create({ data: { name } });
    createdLookups.push(`branch "${name}"`);
    return row.id;
  }
  async function ensureAirline(codeRaw: string): Promise<{ id: string | null; aliasNote?: string }> {
    const code = codeRaw.trim();
    let lookupCode = code;
    let aliasNote: string | undefined;
    if (code.toUpperCase() === 'PK') {
      lookupCode = 'PIA';
      aliasNote = `airline "PK" mapped to existing PIA`;
    }
    const existing = await prisma.airline.findFirst({
      where: { OR: [{ code: lookupCode }, { code }] },
    });
    if (existing) return { id: existing.id, aliasNote };
    if (!commit) {
      createdLookups.push(`airline "${code}"`);
      return { id: null, aliasNote };
    }
    const row = await prisma.airline.create({
      data: { code, name: code, contactEmails: [] },
    });
    createdLookups.push(`airline "${code}" (name=code — rename later)`);
    return { id: row.id, aliasNote };
  }

  // ---- map rows ----------------------------------------------------------
  const licenseCache = new Map<string, string | null>();
  const branchCache = new Map<string, string | null>();
  const airlineCache = new Map<string, { id: string | null; aliasNote?: string }>();

  const mapped: (MappedLegacyRow & { parentCode: string | null })[] = rawRows.map((r, i) => {
    const rowNumber = headerIdx + i + 2;
    const warnings: string[] = [];
    const errors: string[] = [];

    const pnrCode = strCell(r[idx.pnr]);
    if (!pnrCode) errors.push('missing PNR code');
    const requestDateRaw = r[idx.requestDate];
    const requestDate = parseExcelDate(requestDateRaw);
    if (!requestDate) errors.push(`missing/unparseable request date (${JSON.stringify(requestDateRaw) ?? 'null'})`);
    const seats = parseAmount(r[idx.seats]);
    if (seats === null) errors.push('missing seats');
    const fare = parseAmount(r[idx.fare]);
    if (fare === null) errors.push('missing fare');
    const investorCompany = strCell(r[idx.investorCompany]);
    if (!investorCompany) errors.push('missing investor company');

    const data: Record<string, unknown> = {
      requestDate: requestDate ? new Date(`${requestDate}T00:00:00.000Z`) : null,
      investorCompany,
      pnr: pnrCode,
      gdsPnr: strCell(r[idx.gdsPnr]),
      segment: strCell(r[idx.segment]),
      seats: seats as number,
      outboundDate: parseExcelDate(r[idx.outboundDate])
        ? new Date(`${parseExcelDate(r[idx.outboundDate])}T00:00:00.000Z`)
        : null,
      inboundDate: parseExcelDate(r[idx.inboundDate])
        ? new Date(`${parseExcelDate(r[idx.inboundDate])}T00:00:00.000Z`)
        : null,
      sector: strCell(r[idx.sector]),
      pnrTlDate: parseExcelDate(r[idx.pnrTlDate])
        ? new Date(`${parseExcelDate(r[idx.pnrTlDate])}T00:00:00.000Z`)
        : null,
      dealPct: parsePercent(r[idx.dealPct]),
      issuedStatus: /un/i.test(String(r[idx.issuedStatus] ?? '')) ? 'unissued' : 'issued',
      airlineTaxes: parseAmount(r[idx.airlineTaxes]),
      psf: parseAmount(r[idx.psf]),
      fare: fare as number,
    };

    const statusRaw = strCell(r[idx.issuedStatus]);
    if (!statusRaw) warnings.push('no Issued/Unissued value — defaulted to unissued');

    return {
      rowNumber,
      pnrCode,
      parentCode: strCell(r[idx.parentPnr]),
      warnings,
      errors,
      data,
    };
  });

  // ---- enrich: lookups, rounds, ticketing (async) ------------------------
  const createdAirlineAliases = new Set<string>();
  const totalEmdMismatches: string[] = [];

  for (const row of mapped) {
    const r = rawRows[row.rowNumber - headerIdx - 2];
    const d = row.data as Record<string, unknown>;

    const licRaw = strCell(r[idx.license]);
    if (licRaw) {
      if (!licenseCache.has(licRaw)) licenseCache.set(licRaw, await ensureLicense(licRaw));
      d.licenseId = licenseCache.get(licRaw) ?? null;
      if (!d.licenseId) row.warnings.push(`license "${licRaw}" will be created on commit`);
    }

    const brRaw = strCell(r[idx.branch]);
    if (brRaw) {
      if (!branchCache.has(brRaw)) branchCache.set(brRaw, await ensureBranch(brRaw));
      d.branchId = branchCache.get(brRaw) ?? null;
      if (!d.branchId) row.warnings.push(`branch "${brRaw}" will be created on commit`);
    }

    const airRaw = strCell(r[idx.airline]);
    if (airRaw) {
      if (!airlineCache.has(airRaw)) airlineCache.set(airRaw, await ensureAirline(airRaw));
      const res = airlineCache.get(airRaw)!;
      d.airlineId = res.id;
      if (res.aliasNote && !createdAirlineAliases.has(res.aliasNote)) {
        createdAirlineAliases.add(res.aliasNote);
        row.warnings.push(res.aliasNote);
      }
      if (!res.id) row.warnings.push(`airline "${airRaw}" will be created on commit`);
    } else {
      d.airlineId = null;
      row.warnings.push('no airline code — left empty');
    }

    // EMD rounds (up to 4 groups)
    const pnrTl = parseExcelDate(r[idx.pnrTlDate]);
    const roundDrafts: RoundDraft[] = [];
    for (let n = 0; n < 4; n++) {
      const num = rounds.numbers[n] >= 0 ? strCell(r[rounds.numbers[n]]) : null;
      const pct = parsePercent(r[rounds.pct[n]]);
      const amount = parseAmount(r[rounds.amount[n]]);
      const refundAmount = parseAmount(r[rounds.refundAmount[n]]);
      const refundDate = parseExcelDate(r[rounds.refundDate[n]]);
      const tlDate = rounds.tlDate[n] >= 0 ? parseExcelDate(r[rounds.tlDate[n]]) : null;
      const tlTime = rounds.tlTime[n] >= 0 ? parseTimeCell(r[rounds.tlTime[n]]) : null;
      const issuance = parseExcelDate(r[rounds.issuance[n]]);

      if (num === null && pct === null && amount === null && tlDate === null) continue;

      const problems: string[] = [];
      if (amount === null) problems.push('amount');
      if (pct === null) problems.push('payment %');
      if (problems.length > 0) {
        row.errors.push(`EMD round ${n + 1} incomplete — missing ${problems.join(', ')}`);
        continue;
      }

      // PNR TL is the EMD-1 deadline until the deposit email is sent to the
      // airline (owner rule) — use it when the round's own time limit is empty.
      let effectiveTl = tlDate;
      if (effectiveTl === null && n === 0 && pnrTl) {
        effectiveTl = pnrTl;
        row.warnings.push('round 1 deadline taken from PNR TL DATE');
      }
      if (effectiveTl === null) {
        row.warnings.push(`EMD round ${n + 1} has no deadline in the sheet — backfill later`);
      }
      roundDrafts.push({
        roundNumber: n + 1,
        issuanceDate: issuance ? new Date(`${issuance}T00:00:00.000Z`) : null,
        paymentPct: pct as number,
        emdNumber: num,
        emdAmount: amount as number,
        deadlineDate: effectiveTl,
        deadlineTime: tlTime,
        status: refundAmount !== null || refundDate !== null ? 'refunded' : 'pending',
        refundAmount,
        refundDate,
      });
    }
    if (roundDrafts.length === 0) row.errors.push('no complete EMD round found');
    (row.data as Record<string, unknown>).rounds = roundDrafts;

    // Ticketing stage fields
    const tStatus = strCell(r[idx.ticketingStatus]);
    const tIssued = parseAmount(r[idx.ticketsIssued]);
    const tBalance = parseAmount(r[idx.balanceTickets]);
    const tNameTl = parseExcelDate(r[idx.nameUpdateTl]);
    const tTktTl = parseExcelDate(r[idx.tktIssuanceTl]);
    if (tStatus !== null || tIssued !== null || tBalance !== null || tNameTl !== null || tTktTl !== null) {
      (row.data as Record<string, unknown>).ticketing = {
        status: tStatus,
        ticketsIssued: tIssued,
        balanceTickets: tBalance,
        nameUpdateDeadline: tNameTl ? new Date(`${tNameTl}T00:00:00.000Z`) : null,
        ticketIssuanceDeadline: tTktTl ? new Date(`${tTktTl}T00:00:00.000Z`) : null,
      };
    }

    // Cross-check generated total against the sheet's own column (warning only)
    const sheetTotal = parseAmount(r[idx.totalEmdValue]);
    const seatCount = d.seats as number | null;
    const fareValue = d.fare as number | null;
    if (sheetTotal !== null && seatCount !== null && fareValue !== null) {
      const computed = seatCount * fareValue;
      if (Math.abs(computed - sheetTotal) > Math.max(1, sheetTotal * 0.01)) {
        totalEmdMismatches.push(
          `Row ${row.rowNumber} [${row.pnrCode}]: sheet says ${sheetTotal}, seats×fare = ${computed}`
        );
      }
    }
  }

  // ---- partition + report -------------------------------------------------
  const parentByRow = new Map(mapped.map((m) => [m.rowNumber, m.parentCode]));
  const { clean, flagged } = partitionRows(mapped as MappedLegacyRow[]);

  console.log(`\nSheet "${sheetName}": ${mapped.length} data rows considered.`);
  console.log(`Skipped: ${skippedZeroSeats.length} rows with 0 seats; ${skippedEmptyRows.length} empty template rows.`);
  console.log('================ IMPORT REPORT ================');
  console.log(`Clean (will insert): ${clean.length}`);
  console.log(`Flagged (need human review): ${flagged.length}`);
  if (createdLookups.length > 0 || createdAirlineAliases.size > 0) {
    console.log('\n--- LOOKUP CHANGES ---');
    if (commit) {
      for (const l of createdLookups) console.log(`  created ${l}`);
    } else {
      for (const l of createdLookups) console.log(`  will create: ${l}`);
    }
    for (const a of createdAirlineAliases) console.log(`  ${a}`);
  }
  if (totalEmdMismatches.length > 0) {
    console.log(`\n--- TOTAL-EMD-VALUE MISMATCHES (${totalEmdMismatches.length}) ---`);
    for (const m of totalEmdMismatches.slice(0, 15)) console.log(`  ${m}`);
    if (totalEmdMismatches.length > 15) console.log(`  ... and ${totalEmdMismatches.length - 15} more`);
  }

  const errorReasons = new Map<string, number>();
  for (const f of flagged) {
    for (const e of f.errors) {
      const key = e.replace(/row [\d, ]+/g, 'rows N').replace(/"[^"]*"/g, '"X"');
      errorReasons.set(key, (errorReasons.get(key) ?? 0) + 1);
    }
  }
  console.log('\n--- FLAG REASONS (summary) ---');
  for (const [reason, count] of [...errorReasons.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count}x ${reason}`);
  }

  const warnKeys = new Map<string, number>();
  for (const c of [...clean, ...flagged]) {
    for (const w of c.warnings) warnKeys.set(w, (warnKeys.get(w) ?? 0) + 1);
  }
  if (warnKeys.size > 0) {
    console.log('\n--- WARNINGS (summary) ---');
    for (const [w, n] of [...warnKeys.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n}x ${w}`);
    }
  }

  const dupRows = flagged.filter((f) => f.errors.some((e) => e.startsWith('duplicate PNR')));
  console.log('\n--- FLAGGED ROW DETAIL (first 40) ---');
  for (const f of flagged.slice(0, 40)) {
    console.log(`  Row ${f.rowNumber} [${normalizePnrCode(f.pnrCode)}]: ${f.errors.join(' | ')}`);
  }
  if (flagged.length > 40) console.log(`  ... and ${flagged.length - 40} more rows`);
  void dupRows;
  console.log('==============================================');

  const exportArg = args.find((a) => a.startsWith('--export-flagged='));
  if (exportArg) {
    const outPath = exportArg.split('=')[1];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['sheet_row,pnr,company,seats,fare,reasons']
      .concat(
        flagged.map((f) =>
          [
            f.rowNumber,
            normalizePnrCode(f.pnrCode),
            esc(f.data.investorCompany ?? f.data.investor_company ?? ''),
            esc((f.data as Record<string, unknown>).seats ?? ''),
            esc((f.data as Record<string, unknown>).fare ?? ''),
            esc(f.errors.join('; ')),
          ].join(',')
        )
      )
      .join('\n');
    writeFileSync(outPath, csv);
    console.log(`\nFlagged rows exported to ${outPath} (${flagged.length} rows).`);
  }

  if (!commit) {
    console.log('\nDry run only - nothing was written. Re-run with --commit to insert clean rows.');
    await prisma.$disconnect();
    return;
  }

  // ---- commit (batched) ----------------------------------------------------
  console.log('\nInserting clean rows...');
  interface CleanRow {
    row: MappedLegacyRow;
    pnrData: Record<string, unknown>;
    roundDrafts: RoundDraft[];
    ticketing: Record<string, unknown> | null;
    parentCode: string | null;
  }
  const plan: CleanRow[] = clean.map((row) => {
    const d = row.data as Record<string, unknown>;
    const { rounds: roundDrafts, ticketing, ...pnrData } = d as {
      rounds?: RoundDraft[];
      ticketing?: Record<string, unknown>;
      [k: string]: unknown;
    };
    return {
      row,
      pnrData,
      roundDrafts: roundDrafts ?? [],
      ticketing: ticketing ?? null,
      parentCode: parentByRow.get(row.rowNumber) ?? null,
    };
  });

  // 1. PNRs
  const createdPnrs = await prisma.pnr.createManyAndReturn({
    data: plan.map((p) => p.pnrData as never),
    select: { id: true, pnr: true },
  });
  const insertedIds = new Map<string, string>();
  createdPnrs.forEach((p) => insertedIds.set(normalizePnrCode(p.pnr), p.id));
  console.log(`  pnrs inserted: ${createdPnrs.length}`);

  // 2. EMD rounds
  const roundInputs: Record<string, unknown>[] = [];
  for (const [i, p] of plan.entries()) {
    const pnrId = createdPnrs[i].id;
    for (const rd of p.roundDrafts) {
      roundInputs.push({
        pnrId,
        roundNumber: rd.roundNumber,
        issuanceDate:
          rd.issuanceDate ??
          new Date(`${(p.pnrData.requestDate as Date).toISOString().slice(0, 10)}T00:00:00.000Z`),
        paymentPct: rd.paymentPct as number,
        emdNumber: rd.emdNumber,
        emdAmount: rd.emdAmount as number,
        deadlineDate: rd.deadlineDate ? new Date(`${rd.deadlineDate}T00:00:00.000Z`) : null,
        deadlineTime: rd.deadlineTime,
        status: rd.status,
        refundAmount: rd.refundAmount,
        refundDate: rd.refundDate ? new Date(`${rd.refundDate}T00:00:00.000Z`) : null,
      });
    }
  }
  const createdRounds = roundInputs.length
    ? await prisma.emdRound.createManyAndReturn({ data: roundInputs as never, select: { id: true } })
    : [];
  console.log(`  emd_rounds inserted: ${createdRounds.length}`);

  // 3. Ticketing rows
  const ticketingInputs = plan
    .filter((p) => p.ticketing)
    .map((p) => ({
      pnrId: createdPnrs[plan.indexOf(p)].id,
      status: p.ticketing!.status as string | null,
      ticketsIssued: p.ticketing!.ticketsIssued as number | null,
      balanceTickets: p.ticketing!.balanceTickets as number | null,
      nameUpdateDeadline: p.ticketing!.nameUpdateDeadline as Date | null,
      ticketIssuanceDeadline: p.ticketing!.ticketIssuanceDeadline as Date | null,
    }));
  if (ticketingInputs.length) {
    await prisma.ticketing.createMany({ data: ticketingInputs as never });
    console.log(`  ticketing rows inserted: ${ticketingInputs.length}`);
  }

  // 4. Activity log (per PNR + per round, paired by insert order)
  const logInputs: { tableName: string; recordId: string; fieldName: string | null; oldValue: string | null; newValue: string }[] = [];
  createdPnrs.forEach((p) => {
    logInputs.push({ tableName: 'pnrs', recordId: p.id, fieldName: null, oldValue: null, newValue: 'record created' });
  });
  let roundCursor = 0;
  for (const p of plan) {
    for (const rd of p.roundDrafts) {
      const roundId = createdRounds[roundCursor++]?.id;
      if (!roundId) throw new Error('round/log pairing desync');
      logInputs.push({
        tableName: 'emd_rounds',
        recordId: roundId,
        fieldName: null,
        oldValue: null,
        newValue: `round ${rd.roundNumber} created`,
      });
    }
  }
  await prisma.activityLog.createMany({ data: logInputs as never });
  console.log(`  activity_log rows inserted: ${logInputs.length}`);

  // 5. Link children to parents
  const childrenToLink: { childId: string; parentCode: string; seats: number }[] = [];
  plan.forEach((p, i) => {
    if (p.parentCode && normalizePnrCode(p.parentCode) !== normalizePnrCode(p.row.pnrCode)) {
      childrenToLink.push({
        childId: createdPnrs[i].id,
        parentCode: normalizePnrCode(p.parentCode),
        seats: p.pnrData.seats as number,
      });
    }
  });

  let linked = 0;
  const orphanParents = new Set<string>();
  for (const c of childrenToLink) {
    const parentId = insertedIds.get(c.parentCode);
    if (!parentId) {
      orphanParents.add(c.parentCode);
      continue;
    }
    await prisma.pnr.update({ where: { id: c.childId }, data: { parentPnrId: parentId } });
    await prisma.allocation.create({
      data: { parentPnrId: parentId, childPnrId: c.childId, seatsAllocated: c.seats },
    });
    linked++;
  }

  const done = createdPnrs.length;
  console.log(`\nDone. ${done} bookings imported.`);
  console.log(`Children linked to parents: ${linked}`);
  if (orphanParents.size > 0) {
    console.log(`Parent codes not present in sheet (children left unlinked): ${[...orphanParents].join(', ')}`);
  }
  console.log(`Flagged rows left for manual review: ${flagged.length}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Import failed:', err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
