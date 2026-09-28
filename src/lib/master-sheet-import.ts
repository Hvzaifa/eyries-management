/**
 * Planning the import of `Groups EMD Master Sheet.xlsx` (owner request,
 * 2026-09-28). Pure logic — no database, no file I/O — so every rule below is
 * unit-tested; `scripts/import-master-sheet.ts` reads the file and writes.
 *
 * What the owner ruled for this import (docs/decisions.md, 2026-09-28):
 * - Rows are NOT imported when the Total EMD Value column is 0, when no EMD was
 *   ever issued (every round amount 0), or when the outbound date has passed
 *   and every EMD has been refunded.
 * - A booking whose outbound has passed but still holds an unrefunded EMD is
 *   imported ACTIVE and flagged.
 * - IATA: a round whose remittance day is before today is recorded as paid ON
 *   that day (assumed on time); later ones stay owed.
 * - `2ND EMD TL` is the date the 2nd EMD must be issued by, i.e. the time limit
 *   EMD-1 secured — round 1's `deadline_date`.
 * - Agents: every investor value except Company Investment is an agent named
 *   verbatim, holding the booking's whole seat count (2026-09-19 ruling).
 *
 * Standing rule: flag rather than guess. A row with a problem that would make a
 * stored fact wrong is not imported; one whose facts are sound but need a
 * person's eye is imported and listed.
 */

import { iataPaymentState } from '@/lib/iata-payments';
import { COMPANY_INVESTMENT, normalizeSegment, pnrCodeKey, validatePnrCode } from '@/lib/booking-entry';
import { agentNameKey } from '@/lib/agents';
import { COMPANY_HOLDER, BOT_HOLDER } from '@/lib/inventory';

export interface SheetRound {
  roundNumber: number;
  issuanceDate: string | null;
  /** As the sheet stores it: a fraction, 0.15 = 15%. */
  pctFraction: number | null;
  emdNumber: string | null;
  amount: number | null;
  refundAmount: number | null;
  refundDate: string | null;
}

export interface SheetRow {
  rowNumber: number;
  srNo: number | null;
  requestDate: string | null;
  investor: string | null;
  license: string | null;
  branch: string | null;
  parentPnr: string | null;
  pnr: string | null;
  gdsPnr: string | null;
  segment: string | null;
  airline: string | null;
  seats: number | null;
  outboundDate: string | null;
  inboundDate: string | null;
  sector: string | null;
  airlineTaxes: number | null;
  psf: number | null;
  fare: number | null;
  totalEmdValue: number | null;
  rounds: SheetRound[];
  secondEmdTl: string | null;
  nameUpdateTl: string | null;
  ticketIssuanceTl: string | null;
  cancelledTickets: number | null;
  penaltyEmd: string | null;
}

export type IssueLevel = 'not imported' | 'imported — check';

export interface Issue {
  rowNumber: number;
  pnr: string | null;
  level: IssueLevel;
  category: string;
  detail: string;
}

export interface SkippedRow {
  rowNumber: number;
  pnr: string | null;
  reason: string;
}

export interface PlannedRound {
  roundNumber: number;
  issuanceDate: string;
  paymentPct: number;
  emdNumber: string | null;
  emdAmount: number;
  status: 'issued' | 'refunded';
  refundAmount: number | null;
  refundDate: string | null;
  deadlineDate: string | null;
  /** Assumed from the IATA calendar, per the owner's ruling. */
  paymentDate: string | null;
}

export interface PlannedBooking {
  rowNumber: number;
  srNo: number | null;
  pnr: string;
  requestDate: string;
  investorCompany: string;
  license: string | null;
  branch: string | null;
  airline: string | null;
  parentPnr: string | null;
  gdsPnr: string | null;
  segment: string | null;
  seats: number;
  outboundDate: string;
  inboundDate: string | null;
  sector: string | null;
  airlineTaxes: number | null;
  psf: number | null;
  fare: number;
  pnrTlDate: string | null;
  rounds: PlannedRound[];
  ticketing: { nameUpdateDeadline: string | null; ticketIssuanceDeadline: string | null } | null;
  /** Null for company investment. */
  agentName: string | null;
}

export interface ImportPlan {
  bookings: PlannedBooking[];
  skipped: SkippedRow[];
  issues: Issue[];
  /** Distinct agents to create, keyed by `agentNameKey`, first spelling seen wins. */
  agents: { name: string; b2bCode: string | null }[];
}

/** Excel's day number → ISO date. Rounded, because the workbook stores midnight a few seconds short. */
export function excelSerialToIso(serial: number): string {
  const ms = Math.round(serial) * 86_400_000 + Date.UTC(1899, 11, 30);
  return new Date(ms).toISOString().slice(0, 10);
}

/** A PNR code as the sheet may hold it — sometimes a number, sometimes with stray spaces. */
export function sheetCode(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

const isCompany = (investor: string | null) =>
  !investor || agentNameKey(investor) === agentNameKey(COMPANY_INVESTMENT);

/** `QFC GROUP (PVT) LTD-RWP-B2B6022` → `B2B6022`. The name itself is kept verbatim. */
export function b2bCodeOf(name: string): string | null {
  const m = name.match(/-\s*(B2B\d+)\s*$/i);
  return m ? m[1].toUpperCase() : null;
}

/** Rounds that carry an actual EMD. A round with amount 0 is an empty template row. */
function realRounds(row: SheetRow): SheetRound[] {
  return row.rounds.filter((r) => (r.amount ?? 0) !== 0);
}

const isRefunded = (r: SheetRound) => r.refundAmount !== null || r.refundDate !== null;

/** Why this row is left out entirely, per the owner's three rules — or null to keep it. */
export function skipReason(row: SheetRow, todayIso: string): string | null {
  if ((row.totalEmdValue ?? 0) === 0) return 'Total EMD Value is 0';
  const real = realRounds(row);
  if (real.length === 0) return 'No EMD issued (every EMD amount is 0)';
  if (row.outboundDate && row.outboundDate < todayIso && real.every(isRefunded)) {
    return 'Outbound date passed and every EMD refunded';
  }
  return null;
}

/** PNR TL, by the app's own rule (`syncPnrTlDate`): the earliest unrefunded round's deadline, else the last round's. */
export function pnrTlFor(rounds: PlannedRound[]): string | null {
  if (rounds.length === 0) return null;
  const open = rounds.find((r) => r.status === 'issued');
  return open ? open.deadlineDate : rounds[rounds.length - 1].deadlineDate;
}

/** The IATA payment date to record: the remittance day, once it has passed. */
export function assumedIataPayment(r: Omit<PlannedRound, 'paymentDate'>, todayIso: string): string | null {
  const s = iataPaymentState({
    issuanceDate: r.issuanceDate,
    paymentDate: null,
    refundDate: r.refundDate,
    roundStatus: r.status,
    todayIso,
  });
  return s.owed && s.deadline && s.deadline < todayIso ? s.deadline : null;
}

const EMD_NUMBER = /^\d{3} \d{10}$/;

/** Plans one row that is not skipped. Returns the booking (unless blocked) and its issues. */
export function planRow(row: SheetRow, todayIso: string): { booking: PlannedBooking | null; issues: Issue[] } {
  const issues: Issue[] = [];
  const pnr = sheetCode(row.pnr);
  const block = (category: string, detail: string) =>
    issues.push({ rowNumber: row.rowNumber, pnr, level: 'not imported', category, detail });
  const check = (category: string, detail: string) =>
    issues.push({ rowNumber: row.rowNumber, pnr, level: 'imported — check', category, detail });

  const codeError = validatePnrCode(pnr);
  if (codeError) block('PNR code', `${codeError.error} (sheet: "${row.pnr ?? ''}")`);
  if (!row.requestDate) block('Missing field', 'No request date.');
  if (!row.outboundDate) block('Missing field', 'No outbound date.');
  if (!row.seats || row.seats < 0 || !Number.isInteger(row.seats)) block('Missing field', `Seats not a positive whole number (${row.seats}).`);
  if (!row.fare || row.fare <= 0) block('Missing field', `Fare missing or zero (${row.fare}).`);
  if (row.seats && row.fare && row.totalEmdValue !== null && Math.abs(row.seats * row.fare - row.totalEmdValue) > 1) {
    check('Total EMD value', `Sheet total ${row.totalEmdValue} ≠ seats × fare ${row.seats * row.fare}; the system recalculates it as seats × fare.`);
  }
  const segment = normalizeSegment(row.segment);
  if (row.segment && !segment) block('Segment', `"${row.segment}" is not Umrah / Employment / Tour.`);

  const rounds: PlannedRound[] = [];
  const empties = row.rounds.filter((r) => (r.amount ?? 0) === 0 && (r.issuanceDate || r.emdNumber));
  for (const e of empties) check('EMD round', `Round ${e.roundNumber} has details but amount 0 — not imported as a round.`);

  for (const r of realRounds(row)) {
    const n = r.roundNumber;
    if (!r.issuanceDate) { block('EMD round', `Round ${n} has an amount but no issuance date.`); continue; }
    if (r.pctFraction === null) { block('EMD round', `Round ${n} has no payment %.`); continue; }
    if ((r.refundAmount === null) !== (r.refundDate === null)) {
      block('EMD refund', `Round ${n} has a refund ${r.refundAmount === null ? 'date but no amount' : 'amount but no date'}.`);
      continue;
    }
    if (r.refundAmount !== null && r.amount !== null && r.refundAmount > r.amount + 0.005) {
      block('EMD refund', `Round ${n} refund ${r.refundAmount} exceeds its EMD amount ${r.amount}.`);
      continue;
    }
    if (r.refundAmount !== null && r.amount !== null && r.refundAmount < r.amount - 0.005) {
      check('EMD refund', `Round ${n} refunded ${r.refundAmount} of ${r.amount} — partial refund.`);
    }
    if (!r.emdNumber) check('EMD number', `Round ${n} has no EMD number.`);
    else if (!EMD_NUMBER.test(r.emdNumber.trim())) check('EMD number', `Round ${n} EMD number "${r.emdNumber}" is not in the 123 4567890123 form.`);
    if (r.refundDate && r.refundDate < r.issuanceDate) check('EMD refund', `Round ${n} refunded ${r.refundDate}, before it was issued ${r.issuanceDate}.`);

    const base = {
      roundNumber: n,
      issuanceDate: r.issuanceDate,
      // Sheet fractions (0.15) → the app's percentages (15), to 2 dp as stored.
      paymentPct: Math.round(r.pctFraction * 10_000) / 100,
      emdNumber: r.emdNumber?.trim() || null,
      emdAmount: r.amount!,
      status: (isRefunded(r) ? 'refunded' : 'issued') as 'issued' | 'refunded',
      refundAmount: r.refundAmount,
      refundDate: r.refundDate,
      deadlineDate: n === 1 ? row.secondEmdTl : null,
    };
    const paymentDate = assumedIataPayment(base, todayIso);
    const state = iataPaymentState({ issuanceDate: base.issuanceDate, paymentDate: null, refundDate: base.refundDate, roundStatus: base.status, todayIso });
    if (state.status === 'unknown') check('IATA', `Round ${n} issued ${base.issuanceDate} is outside the IATA calendar — payment not recorded.`);
    rounds.push({ ...base, paymentDate });
  }

  const real = realRounds(row);
  if (real.length > 0 && real[0].roundNumber !== 1) {
    check('EMD round', `No round 1 recorded; first EMD is round ${real[0].roundNumber}.`);
  }
  const pctTotal = real.reduce((s, r) => s + (r.pctFraction ?? 0), 0);
  if (pctTotal > 1.0001) check('EMD %', `Round percentages add to ${Math.round(pctTotal * 10000) / 100}% (over 100%). Imported as recorded.`);

  const r1 = rounds.find((r) => r.roundNumber === 1);
  if (r1 && !row.secondEmdTl && r1.status === 'issued') {
    check('Deadline', '2ND EMD TL is blank while EMD-1 is still held — no next-EMD deadline recorded.');
  }
  if (r1 && row.secondEmdTl && row.secondEmdTl < r1.issuanceDate) {
    check('Deadline', `2ND EMD TL ${row.secondEmdTl} is before EMD-1 was issued ${r1.issuanceDate}.`);
  }

  const open = rounds.filter((r) => r.status === 'issued');
  if (row.outboundDate && row.outboundDate < todayIso && open.length > 0) {
    check('Past, not refunded', `Outbound ${row.outboundDate} has passed but round${open.length > 1 ? 's' : ''} ${open.map((r) => r.roundNumber).join(', ')} not refunded. Imported as active.`);
  }
  if (row.inboundDate && row.outboundDate && row.inboundDate < row.outboundDate) {
    check('Dates', `Inbound ${row.inboundDate} is before outbound ${row.outboundDate}.`);
  }
  if (row.cancelledTickets) check('Not imported column', `CANCELLED (10%) TICKETS = ${row.cancelledTickets} — no field for it (selling side, out of scope).`);
  if (row.penaltyEmd) check('Not imported column', `PENALTY EMD = ${row.penaltyEmd} — no field for it (selling side, out of scope).`);
  if (!row.nameUpdateTl && !row.ticketIssuanceTl) check('Ticketing', 'No name-update or ticket-issuance deadline in the sheet.');

  const investor = row.investor?.trim() || null;
  const agentName = isCompany(investor) ? null : investor;
  if (agentName) {
    const key = agentNameKey(agentName);
    if (key === agentNameKey(BOT_HOLDER) || key === agentNameKey(COMPANY_HOLDER)) {
      block('Agent', `"${agentName}" is a reserved holder name.`);
    } else if (/\//.test(agentName)) {
      check('Agent', `"${agentName}" names several agents; recorded as ONE agent with all ${row.seats} seats, as the 2026-09-19 ruling says. Split by hand if needed.`);
    } else if (/agent investment/i.test(agentName)) {
      check('Agent', `"${agentName}" is a placeholder, not an agent's name; recorded as written.`);
    }
  }

  if (issues.some((i) => i.level === 'not imported')) return { booking: null, issues };

  return {
    booking: {
      rowNumber: row.rowNumber,
      srNo: row.srNo,
      pnr: pnr!.replace(/\s+/g, ''),
      requestDate: row.requestDate!,
      investorCompany: investor ?? COMPANY_INVESTMENT,
      license: row.license?.trim() || null,
      branch: row.branch?.trim() || null,
      airline: row.airline?.trim() || null,
      parentPnr: sheetCode(row.parentPnr),
      gdsPnr: sheetCode(row.gdsPnr),
      segment,
      seats: row.seats!,
      outboundDate: row.outboundDate!,
      inboundDate: row.inboundDate,
      sector: row.sector?.trim() || null,
      airlineTaxes: row.airlineTaxes,
      psf: row.psf,
      fare: row.fare!,
      pnrTlDate: pnrTlFor(rounds),
      rounds,
      ticketing:
        row.nameUpdateTl || row.ticketIssuanceTl
          ? { nameUpdateDeadline: row.nameUpdateTl, ticketIssuanceDeadline: row.ticketIssuanceTl }
          : null,
      agentName,
    },
    issues,
  };
}

/** Levenshtein distance, for spotting agent names that are probably typos of each other. */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Plans the whole sheet: per-row rules, then the checks that need every row at once. */
export function planImport(rows: SheetRow[], todayIso: string): ImportPlan {
  const skipped: SkippedRow[] = [];
  const issues: Issue[] = [];
  let bookings: PlannedBooking[] = [];

  for (const row of rows) {
    const reason = skipReason(row, todayIso);
    if (reason) {
      skipped.push({ rowNumber: row.rowNumber, pnr: sheetCode(row.pnr), reason });
      continue;
    }
    const planned = planRow(row, todayIso);
    issues.push(...planned.issues);
    if (planned.booking) bookings.push(planned.booking);
  }

  // One booking per PNR code (2026-09-20). Every copy is held back, not just
  // the second: which copy is right is not something to guess.
  const byCode = new Map<string, PlannedBooking[]>();
  for (const b of bookings) {
    const k = pnrCodeKey(b.pnr);
    byCode.set(k, [...(byCode.get(k) ?? []), b]);
  }
  const dupRows = new Set<number>();
  for (const [code, group] of byCode) {
    if (group.length < 2) continue;
    for (const b of group) {
      dupRows.add(b.rowNumber);
      issues.push({
        rowNumber: b.rowNumber,
        pnr: b.pnr,
        level: 'not imported',
        category: 'Duplicate PNR',
        detail: `PNR ${code} appears on rows ${group.map((g) => g.rowNumber).join(', ')}.`,
      });
    }
  }
  bookings = bookings.filter((b) => !dupRows.has(b.rowNumber));

  // Parent links: only to a parent that is itself being imported.
  const imported = new Set(bookings.map((b) => pnrCodeKey(b.pnr)));
  for (const b of bookings) {
    if (!b.parentPnr) continue;
    if (pnrCodeKey(b.parentPnr) === pnrCodeKey(b.pnr)) {
      issues.push({ rowNumber: b.rowNumber, pnr: b.pnr, level: 'imported — check', category: 'Parent PNR', detail: 'Parent PNR is the booking itself; not linked.' });
      b.parentPnr = null;
    } else if (!imported.has(pnrCodeKey(b.parentPnr))) {
      issues.push({ rowNumber: b.rowNumber, pnr: b.pnr, level: 'imported — check', category: 'Parent PNR', detail: `Parent ${b.parentPnr} is not among the imported bookings; imported unlinked.` });
      b.parentPnr = null;
    }
  }

  // Agents: one per spelling-insensitive name.
  const agents = new Map<string, { name: string; b2bCode: string | null }>();
  for (const b of bookings) {
    if (!b.agentName) continue;
    const k = agentNameKey(b.agentName);
    if (!agents.has(k)) agents.set(k, { name: b.agentName.trim().replace(/\s+/g, ' '), b2bCode: b2bCodeOf(b.agentName) });
  }
  const names = [...agents.values()].map((a) => a.name);
  const bare = (n: string) => n.toLowerCase().replace(/-.*$/, '').replace(/[^a-z]/g, '');
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) {
      const [a, b] = [bare(names[i]), bare(names[j])];
      if (a.length >= 5 && b.length >= 5 && a !== b && distance(a, b) <= 2) {
        for (const bk of bookings.filter((x) => x.agentName && [names[i], names[j]].includes(agents.get(agentNameKey(x.agentName))!.name))) {
          issues.push({ rowNumber: bk.rowNumber, pnr: bk.pnr, level: 'imported — check', category: 'Agent', detail: `Agents "${names[i]}" and "${names[j]}" look like the same agent spelled two ways; kept separate.` });
        }
      }
    }

  issues.sort((x, y) => x.rowNumber - y.rowNumber);
  return { bookings, skipped, issues, agents: [...agents.values()] };
}
