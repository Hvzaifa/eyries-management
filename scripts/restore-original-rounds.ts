/**
 * One-time restoration (owner decision, 2026-08-25): undo the percentage-
 * replacement pass by rebuilding the affected PNRs' EMD rounds exactly as
 * the sheet recorded them (original round numbers, percentages, amounts,
 * dates, refund statuses). EMD-2 deadlines are re-derived afterwards by the
 * standard rule (backfillEmd2Deadlines).
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import * as XLSX from 'xlsx';
import { prisma } from '../src/lib/prisma';

const SHEET_NAME = 'OB 01JUN26 Onward';

function pad(n: number) { return String(n).padStart(2, '0'); }
function parseTimeCell(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime()))
    return new Date(`1970-01-01T${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:00Z`);
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const mins = Math.round(v * 1440);
    return new Date(`1970-01-01T${pad(Math.floor(mins / 60))}:${pad(mins % 60)}:00Z`);
  }
  const m = String(v).trim().match(/^(\d{1,2}):(\d{2})/);
  return m ? new Date(`1970-01-01T${pad(Number(m[1]))}:${pad(Number(m[2]))}:00Z`) : null;
}
function isoDate(d: Date | null): Date | null {
  return d ? new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`) : null;
}
function strCell(v: unknown): string | null {
  const s = v === null || v === undefined ? '' : String(v).trim();
  return s === '' ? null : s;
}
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}
function pct(v: unknown): number | null {
  if (typeof v === 'number') return v > 0 && v <= 1 ? Math.round(v * 10000) / 100 : v;
  const s = String(v ?? '').replace('%', '').trim();
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n > 0 && n <= 1 && s.includes('.') ? Math.round(n * 10000) / 100 : n;
}
function dateVal(v: unknown): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return isoDate(v);
  return null;
}

async function main() {
  // 1. Which PNRs were touched by the replacement pass?
  const moved = await prisma.activityLog.findMany({
    where: { tableName: 'emd_rounds', newValue: { contains: 'moved into slot' } },
    select: { recordId: true },
  });
  const roundIds = moved.map((m) => m.recordId);
  const rounds = await prisma.emdRound.findMany({
    where: { id: { in: roundIds } },
    select: { pnrId: true },
  });
  const pnrIds = [...new Set(rounds.map((r) => r.pnrId))];
  console.log(`PNRs affected by the replacement pass: ${pnrIds.length}`);

  // 2. Sheet rows by PNR code
  const wb = XLSX.read(readFileSync('Groups EMD Master Sheet.xlsx'), { cellDates: true });
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[SHEET_NAME], { header: 1, defval: null });
  const hIdx = grid.findIndex((r) => r.some((c) => String(c ?? '').trim().toUpperCase() === 'SR #'));
  const headers = (grid[hIdx] as unknown[]).map((c) => String(c ?? '').replace(/\n/g, ' ').trim());
  const col = (n: string) => headers.indexOf(n);
  const idx = {
    requestDate: col('REQUEST DATE'), pnr: col('PNR'), pnrTl: col('PNR TL DATE'),
  };
  const all = (n: string) => headers.map((h, i) => (h === n ? i : -1)).filter((i) => i >= 0);
  const rounds_cols = {
    issuance: all('ISSUANCE DATE'),
    pct: all('PAYMENT %AGE'),
    amount: all('EMD AMOUNT').slice(0, 4),
    refundAmount: all('EMD Refund Amount'),
    refundDate: all('Date of Refund'),
    tlDate: all('TIME LIMIT (Date)'),
    tlTime: all('TIME LIMIT (Time)'),
    numbers: ['1st', '2nd', '3rd', '4th'].map((s) => headers.indexOf(`${s} EMD NUMBER`)),
  };

  const byPnr = new Map<string, unknown[]>();
  for (const r of grid.slice(hIdx + 1)) {
    const code = strCell(r[idx.pnr]);
    if (code && !byPnr.has(code)) byPnr.set(code, r); // clean rows are unique; dup rows were never imported
  }

  // 3. Rebuild rounds for each affected PNR
  let restored = 0;
  for (const pnrId of pnrIds) {
    const pnr = await prisma.pnr.findUnique({ where: { id: pnrId }, select: { pnr: true, requestDate: true } });
    if (!pnr) continue;
    const row = byPnr.get(pnr.pnr);
    if (!row) {
      console.error(`  !! ${pnr.pnr}: no sheet row found — skipped`);
      continue;
    }

    const drafts: {
      roundNumber: number; issuanceDate: Date; paymentPct: number; emdNumber: string | null;
      emdAmount: number; deadlineDate: Date | null; deadlineTime: Date | null;
      status: 'pending' | 'refunded'; refundAmount: number | null; refundDate: Date | null;
    }[] = [];
    const pnrTl = dateVal(row[idx.pnrTl]);

    for (let n = 0; n < 4; n++) {
      const number_ = rounds_cols.numbers[n] >= 0 ? strCell(row[rounds_cols.numbers[n]]) : null;
      const p = pct(row[rounds_cols.pct[n]]);
      const amount = num(row[rounds_cols.amount[n]]);
      const tlDate = rounds_cols.tlDate[n] >= 0 ? dateVal(row[rounds_cols.tlDate[n]]) : null;
      if (number_ === null && p === null && amount === null && tlDate === null) continue;
      if (amount === null || p === null) continue; // incomplete in sheet — was never imported

      const refundAmount = num(row[rounds_cols.refundAmount[n]]);
      const refundDate = dateVal(row[rounds_cols.refundDate[n]]);
      const effectiveTl = tlDate ?? (n === 0 ? pnrTl : null);

      drafts.push({
        roundNumber: n + 1,
        issuanceDate: dateVal(row[rounds_cols.issuance[n]]) ?? pnr.requestDate,
        paymentPct: p,
        emdNumber: number_,
        emdAmount: amount,
        deadlineDate: effectiveTl,
        deadlineTime: rounds_cols.tlTime[n] >= 0 ? parseTimeCell(row[rounds_cols.tlTime[n]]) : null,
        status: refundAmount !== null || refundDate !== null ? 'refunded' : 'pending',
        refundAmount,
        refundDate,
      });
    }

    await prisma.emdRound.deleteMany({ where: { pnrId } });
    for (const d of drafts) {
      const created = await prisma.emdRound.create({ data: { pnrId, ...d } });
      await prisma.activityLog.create({
        data: {
          tableName: 'emd_rounds',
          recordId: created.id,
          fieldName: null,
          oldValue: null,
          newValue: `round ${d.roundNumber} restored to original sheet data`,
        },
      });
    }
    await prisma.activityLog.create({
      data: {
        tableName: 'pnrs',
        recordId: pnrId,
        fieldName: null,
        oldValue: null,
        newValue: 'EMD rounds restored to original sheet data (undo of replacement pass)',
      },
    });
    restored++;
  }

  console.log(`Restored original rounds for ${restored} PNRs.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
