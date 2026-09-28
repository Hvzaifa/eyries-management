/**
 * Imports `Groups EMD Master Sheet.xlsx` (tab "OB 01JUN26 Onward") into an
 * empty booking database, and writes every row that needs checking to a
 * separate workbook.
 *
 *   npx tsx scripts/import-master-sheet.ts [file.xlsx]            dry run: plan + issues file, no writes
 *   npx tsx scripts/import-master-sheet.ts [file.xlsx] --commit   the same, then writes in ONE transaction
 *   --dump=plan.json   also writes the full plan, for checking it against the sheet independently
 *
 * The rules are in `src/lib/master-sheet-import.ts` (unit-tested) and the
 * owner's rulings behind them in docs/decisions.md, 2026-09-28.
 *
 * Refuses to commit into a database that already holds bookings or agents:
 * this is a load, not a merge, and running it twice would duplicate everything.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';
import { todayIsoInPkt } from '../src/lib/urgency';
import { agentNameKey } from '../src/lib/agents';
import { pnrCodeKey } from '../src/lib/booking-entry';
import { excelSerialToIso, planImport, sheetCode, type Issue, type SheetRow } from '../src/lib/master-sheet-import';

const SHEET = 'OB 01JUN26 Onward';
const args = process.argv.slice(2);
const commit = args.includes('--commit');
const file = args.find((a) => !a.startsWith('--')) ?? 'Groups EMD Master Sheet.xlsx';
const today = todayIsoInPkt(new Date());

const norm = (h: unknown) => String(h ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const text = (v: unknown): string | null => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim());
const date = (v: unknown): string | null => (typeof v === 'number' ? excelSerialToIso(v) : null);

function readRows(): { rows: SheetRow[]; oddDates: Issue[] } {
  const wb = XLSX.read(readFileSync(file), { type: 'buffer', cellDates: false });
  const ws = wb.Sheets[SHEET];
  if (!ws) throw new Error(`Tab "${SHEET}" not found in ${file}.`);
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
  const h = grid.findIndex((r) => norm(r[0]) === 'SR #');
  if (h < 0) throw new Error('Header row ("SR #") not found.');
  const headers = grid[h].map(norm);
  const col = (name: string) => {
    const i = headers.indexOf(name);
    if (i < 0) throw new Error(`Column "${name}" not found.`);
    return i;
  };
  const roundCols = ['1ST', '2ND', '3RD', '4TH'].map((o) => col(`${o} EMD NUMBER`));
  const oddDates: Issue[] = [];

  const rows: SheetRow[] = [];
  grid.slice(h + 1).forEach((c, i) => {
    if (!c.some((v) => v !== null && v !== '')) return;
    const rowNumber = h + i + 2;
    const d = (idx: number, label: string) => {
      const v = c[idx];
      if (text(v) !== null && typeof v !== 'number') {
        oddDates.push({ rowNumber, pnr: sheetCode(c[col('PNR')]), level: 'imported — check', category: 'Unreadable date', detail: `${label} "${v}" is not a date; left blank.` });
      }
      return date(v);
    };
    rows.push({
      rowNumber,
      srNo: num(c[col('SR #')]),
      requestDate: d(col('REQUEST DATE'), 'REQUEST DATE'),
      investor: text(c[col('INVESTMENT TYPE')]),
      license: text(c[col('LICENSE')]),
      branch: text(c[col('BRANCH')]),
      parentPnr: text(c[col('PARENT PNR')]),
      pnr: text(c[col('PNR')]),
      gdsPnr: text(c[col('GDS PNR')]),
      segment: text(c[col('SEGMENT')]),
      airline: text(c[col('AIRLINE')]),
      seats: num(c[col('NO OF SEATS')]),
      outboundDate: d(col('OUTBOUND DATE'), 'OUTBOUND DATE'),
      inboundDate: d(col('INBOUND DATE'), 'INBOUND DATE'),
      sector: text(c[col('SECTOR')]),
      airlineTaxes: num(c[col('AIRLINE TAXES')]),
      psf: num(c[col('PSF')]),
      fare: num(c[col('FARE')]),
      totalEmdValue: num(c[col('TOTAL EMD VALUE (WITHOUT TAXES AND PSF)')]),
      rounds: roundCols.map((k, n) => ({
        roundNumber: n + 1,
        issuanceDate: d(k - 2, `Round ${n + 1} ISSUANCE DATE`),
        pctFraction: num(c[k - 1]),
        emdNumber: text(c[k]),
        amount: num(c[k + 1]),
        refundAmount: num(c[k + 2]),
        refundDate: d(k + 3, `Round ${n + 1} Date of Refund`),
      })),
      secondEmdTl: d(col('2ND EMD TL'), '2ND EMD TL'),
      nameUpdateTl: d(col('NAME UPDATE TL'), 'NAME UPDATE TL'),
      ticketIssuanceTl: d(col('TKT ISSUANCE TL'), 'TKT ISSUANCE TL'),
      cancelledTickets: num(c[col('CANCELLED (10%) TICKETS')]),
      penaltyEmd: text(c[col('PENALTY EMD')]),
    });
  });
  return { rows, oddDates };
}

async function main() {
  const prisma = new PrismaClient();
  const { rows, oddDates } = readRows();
  const plan = planImport(rows, today);
  plan.issues.push(...oddDates);

  // Lookups. The sheet's PK is the PIA row (2026-08-23 convention).
  const [licenses, branches, airlines] = await Promise.all([
    prisma.license.findMany(),
    prisma.branch.findMany(),
    prisma.airline.findMany(),
  ]);
  const byName = <T extends { name: string; id: string }>(xs: T[]) => new Map(xs.map((x) => [x.name.trim().toUpperCase(), x.id]));
  const licenseId = byName(licenses);
  const branchId = byName(branches);
  const airlineId = new Map(airlines.map((a) => [a.code.toUpperCase(), a.id]));
  if (airlineId.has('PIA') && !airlineId.has('PK')) airlineId.set('PK', airlineId.get('PIA')!);

  for (const b of [...plan.bookings]) {
    const missing = [
      b.license && !licenseId.has(b.license.toUpperCase()) ? `license "${b.license}"` : null,
      b.branch && !branchId.has(b.branch.toUpperCase()) ? `branch "${b.branch}"` : null,
      b.airline && !airlineId.has(b.airline.toUpperCase()) ? `airline "${b.airline}"` : null,
    ].filter(Boolean);
    if (missing.length) {
      plan.issues.push({ rowNumber: b.rowNumber, pnr: b.pnr, level: 'not imported', category: 'Lookup', detail: `No ${missing.join(', ')} in the database.` });
      plan.bookings.splice(plan.bookings.indexOf(b), 1);
    }
  }
  plan.issues.sort((a, b) => a.rowNumber - b.rowNumber);

  // ---- report ----
  const rounds = plan.bookings.flatMap((b) => b.rounds.map((r) => ({ b, r })));
  const blockedRows = new Set(plan.issues.filter((i) => i.level === 'not imported').map((i) => i.rowNumber));
  const checkRows = new Set(plan.issues.filter((i) => i.level === 'imported — check').map((i) => i.rowNumber));
  const skipCounts = plan.skipped.reduce<Record<string, number>>((m, s) => ((m[s.reason] = (m[s.reason] ?? 0) + 1), m), {});
  const summary: [string, string | number][] = [
    ['Source', `${file} — tab "${SHEET}"`],
    ['Today (PKT)', today],
    ['Sheet rows read', rows.length],
    ...Object.entries(skipCounts).map(([k, v]) => [`Left out by rule: ${k}`, v] as [string, number]),
    ['Rows with a problem — NOT imported', blockedRows.size],
    ['Bookings imported', plan.bookings.length],
    ['  of which flagged for checking', [...checkRows].filter((r) => !blockedRows.has(r)).length],
    ['EMD rounds', rounds.length],
    ['  issued (held)', rounds.filter((x) => x.r.status === 'issued').length],
    ['  refunded', rounds.filter((x) => x.r.status === 'refunded').length],
    ['  IATA payment date ASSUMED (remittance day passed)', rounds.filter((x) => x.r.paymentDate).length],
    ['Agents', plan.agents.length],
    ['Bookings assigned to an agent', plan.bookings.filter((b) => b.agentName).length],
    ['Child bookings linked to a parent', plan.bookings.filter((b) => b.parentPnr).length],
    ['Ticketing rows', plan.bookings.filter((b) => b.ticketing).length],
    ['Mode', commit ? 'COMMIT' : 'dry run — nothing written'],
  ];
  console.log('');
  for (const [k, v] of summary) console.log(`${String(k).padEnd(52)} ${v}`);

  const rowInfo = new Map(rows.map((r) => [r.rowNumber, r]));
  const issueSheet = plan.issues.map((i) => {
    const r = rowInfo.get(i.rowNumber);
    return {
      'Sheet row': i.rowNumber,
      'SR #': r?.srNo ?? null,
      PNR: i.pnr,
      Status: i.level,
      Issue: i.category,
      Detail: i.detail,
      'Investment type': r?.investor ?? null,
      Branch: r?.branch ?? null,
      'Outbound date': r?.outboundDate ?? null,
    };
  });
  const out = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet([['Item', 'Value'], ...summary]), 'Summary');
  XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(issueSheet), 'Rows to check');
  XLSX.utils.book_append_sheet(
    out,
    XLSX.utils.json_to_sheet(plan.skipped.map((s) => ({ 'Sheet row': s.rowNumber, 'SR #': rowInfo.get(s.rowNumber)?.srNo ?? null, PNR: s.pnr, Reason: s.reason }))),
    'Left out by rule'
  );
  XLSX.utils.book_append_sheet(
    out,
    XLSX.utils.json_to_sheet(
      rounds.filter((x) => x.r.paymentDate).map(({ b, r }) => ({
        'Sheet row': b.rowNumber, PNR: b.pnr, Round: r.roundNumber, 'EMD number': r.emdNumber, Amount: r.emdAmount,
        Issued: r.issuanceDate, 'Recorded as paid to IATA on (assumed)': r.paymentDate,
      }))
    ),
    'IATA paid (assumed)'
  );
  const outFile = `Master Sheet Import — Rows to Check (${today}).xlsx`;
  XLSX.writeFile(out, outFile);
  console.log(`\nIssues written to "${outFile}".`);

  const dump = args.find((a) => a.startsWith('--dump='));
  if (dump) writeFileSync(dump.slice('--dump='.length), JSON.stringify(plan, null, 1));

  if (!commit) {
    await prisma.$disconnect();
    return;
  }

  const [existingPnrs, existingAgents] = await Promise.all([prisma.pnr.count(), prisma.agent.count()]);
  if (existingPnrs > 0 || existingAgents > 0) {
    throw new Error(`Refusing to import: the database already holds ${existingPnrs} bookings and ${existingAgents} agents.`);
  }

  // ---- write ----
  const d = (s: string | null) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
  const pnrId = new Map(plan.bookings.map((b) => [pnrCodeKey(b.pnr), randomUUID()]));
  const agentId = new Map(plan.agents.map((a) => [agentNameKey(a.name), randomUUID()]));
  const note = `imported from ${file}`;

  await prisma.$transaction(
    async (tx) => {
      await tx.pnr.createMany({
        data: plan.bookings.map((b) => ({
          id: pnrId.get(pnrCodeKey(b.pnr))!,
          requestDate: d(b.requestDate)!,
          investorCompany: b.investorCompany,
          licenseId: b.license ? licenseId.get(b.license.toUpperCase())! : null,
          branchId: b.branch ? branchId.get(b.branch.toUpperCase())! : null,
          parentPnrId: b.parentPnr ? pnrId.get(pnrCodeKey(b.parentPnr))! : null,
          pnr: b.pnr,
          gdsPnr: b.gdsPnr,
          segment: b.segment,
          airlineId: b.airline ? airlineId.get(b.airline.toUpperCase())! : null,
          seats: b.seats,
          outboundDate: d(b.outboundDate),
          inboundDate: d(b.inboundDate),
          sector: b.sector,
          pnrTlDate: d(b.pnrTlDate),
          airlineTaxes: b.airlineTaxes,
          psf: b.psf,
          fare: b.fare,
          status: 'active',
        })),
      });
      await tx.emdRound.createMany({
        data: plan.bookings.flatMap((b) =>
          b.rounds.map((r) => ({
            pnrId: pnrId.get(pnrCodeKey(b.pnr))!,
            roundNumber: r.roundNumber,
            issuanceDate: d(r.issuanceDate)!,
            paymentPct: r.paymentPct,
            emdNumber: r.emdNumber,
            emdAmount: r.emdAmount,
            status: r.status,
            refundAmount: r.refundAmount,
            refundDate: d(r.refundDate),
            deadlineDate: d(r.deadlineDate),
            paymentDate: d(r.paymentDate),
          }))
        ),
      });
      await tx.ticketing.createMany({
        data: plan.bookings.filter((b) => b.ticketing).map((b) => ({
          pnrId: pnrId.get(pnrCodeKey(b.pnr))!,
          nameUpdateDeadline: d(b.ticketing!.nameUpdateDeadline),
          ticketIssuanceDeadline: d(b.ticketing!.ticketIssuanceDeadline),
        })),
      });
      await tx.allocation.createMany({
        data: plan.bookings.filter((b) => b.parentPnr).map((b) => ({
          parentPnrId: pnrId.get(pnrCodeKey(b.parentPnr!))!,
          childPnrId: pnrId.get(pnrCodeKey(b.pnr))!,
          seatsAllocated: b.seats,
        })),
      });
      await tx.agent.createMany({
        data: plan.agents.map((a) => ({
          id: agentId.get(agentNameKey(a.name))!,
          name: a.name,
          nameKey: agentNameKey(a.name),
          b2bCode: a.b2bCode,
        })),
      });
      const assignments = plan.bookings.filter((b) => b.agentName).map((b) => ({
        id: randomUUID(),
        pnrId: pnrId.get(pnrCodeKey(b.pnr))!,
        agentId: agentId.get(agentNameKey(b.agentName!))!,
        seats: b.seats,
        b,
      }));
      await tx.agentAssignment.createMany({
        data: assignments.map((a) => ({ id: a.id, pnrId: a.pnrId, agentId: a.agentId, seats: a.seats })),
      });
      await tx.activityLog.createMany({
        data: [
          ...plan.bookings.map((b) => ({
            tableName: 'pnrs', recordId: pnrId.get(pnrCodeKey(b.pnr))!, fieldName: null, oldValue: null,
            newValue: `record created (${note}, row ${b.rowNumber})`,
          })),
          ...plan.agents.map((a) => ({
            tableName: 'agents', recordId: agentId.get(agentNameKey(a.name))!, fieldName: null, oldValue: null,
            newValue: `agent created from sheet investment type: ${a.name}`,
          })),
          ...assignments.map((a) => ({
            tableName: 'agent_assignments', recordId: a.id, fieldName: null, oldValue: null,
            newValue: `${a.seats} seat(s) assigned to ${a.b.agentName} (${note}, row ${a.b.rowNumber})`,
          })),
        ],
      });
    },
    { timeout: 300_000, maxWait: 30_000 }
  );

  const after = {
    pnrs: await prisma.pnr.count(),
    emd_rounds: await prisma.emdRound.count(),
    ticketing: await prisma.ticketing.count(),
    allocations: await prisma.allocation.count(),
    agents: await prisma.agent.count(),
    agent_assignments: await prisma.agentAssignment.count(),
    activity_log: await prisma.activityLog.count(),
  };
  console.log('\nWritten:', after);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
