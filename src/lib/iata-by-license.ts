import { groupByRemittanceDay, type RemittanceGroup } from './iata-payments';

/**
 * The IATA page, one license at a time (owner, 2026-09-29).
 *
 * Pure — no database — so the per-license sums are testable. `iata-dues.ts`
 * reads the rounds and hands them here.
 */

export interface LicenseRef {
  id: string;
  name: string;
}

export interface IataDueRound {
  roundId: string;
  pnrId: string;
  pnrCode: string;
  srNo: number;
  roundNumber: number;
  emdNumber: string | null;
  emdAmount: number;
  issuanceDate: string;
  airlineCode: string | null;
  branchName: string | null;
  /** The license this EMD is listed under — see `licenseOfRound`. */
  licenseId: string | null;
  licenseName: string | null;
  seats: number;
  outboundDate: string | null;
  periodCode: string | null;
  deadline: string | null;
  /** Last day a refund could still move this bill to the next cycle. */
  rollBy: string | null;
  /** Why a refunded round is nonetheless still owed. */
  lateRefund: 'after-billing' | 'date-unknown' | null;
}

export interface IataDues {
  /** Payments still to make, earliest settlement first. */
  groups: RemittanceGroup<IataDueRound>[];
  /** Owed, but issued outside the loaded calendar — no day can be named yet. */
  undated: IataDueRound[];
  /**
   * Owed despite being refunded, because the refund missed its billing window
   * or has no recorded date. Surprising enough to be worth naming.
   */
  lateRefunds: IataDueRound[];
  /** Every owed round, dated or not. */
  totalOwed: number;
  /** Rounds counted. */
  count: number;
}

/**
 * The license an EMD is listed under: the round's own license — the one that
 * actually paid for it (2026-09-07) — and, when staff have not set one, the
 * booking's. Every imported round has none, so today they all fall back.
 */
export function licenseOfRound(round: LicenseRef | null, booking: LicenseRef | null): LicenseRef | null {
  return round ?? booking ?? null;
}

/** The button for owed EMDs with no license on the round or the booking. */
export const NO_LICENSE = 'none';

export interface LicenseTab {
  /** A license id, or `NO_LICENSE`. */
  key: string;
  name: string;
  count: number;
  total: number;
}

/**
 * One button per license — every license, including those owing nothing
 * (owner, 2026-09-29) — in name order. "No license" is added only when an owed
 * EMD has none, so nothing owed can drop out of every button.
 */
export function licenseTabs(licenses: LicenseRef[], due: IataDueRound[]): LicenseTab[] {
  const tabs = [...licenses]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((l) => tabFor(l.id, l.name, due.filter((d) => d.licenseId === l.id)));
  const orphans = due.filter((d) => d.licenseId === null);
  return orphans.length > 0 ? [...tabs, tabFor(NO_LICENSE, 'No license', orphans)] : tabs;
}

function tabFor(key: string, name: string, items: IataDueRound[]): LicenseTab {
  return { key, name, count: items.length, total: sumMoney(items.map((d) => d.emdAmount)) };
}

/** Owed EMDs for one license; `null` is every license. */
export function dueForLicense(due: IataDueRound[], key: string | null): IataDueRound[] {
  if (key === null) return due;
  const want = key === NO_LICENSE ? null : key;
  return due.filter((d) => d.licenseId === want);
}

/** Everything the page shows, for whichever rounds it is given. */
export function summarizeDues(due: IataDueRound[], todayIso: string): IataDues {
  return {
    groups: groupByRemittanceDay(
      due,
      (d) => ({ deadline: d.deadline, periodCode: d.periodCode, amount: d.emdAmount }),
      todayIso
    ),
    undated: due.filter((d) => d.deadline === null),
    lateRefunds: due.filter((d) => d.lateRefund !== null),
    totalOwed: sumMoney(due.map((d) => d.emdAmount)),
    count: due.length,
  };
}

/** Summed in whole paisa so a float never drifts a total. */
function sumMoney(values: number[]): number {
  return values.reduce((sum, v) => sum + Math.round(v * 100), 0) / 100;
}
