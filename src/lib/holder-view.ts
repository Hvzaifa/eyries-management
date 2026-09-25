/**
 * One holder's share of a booking, for the dashboard's Holder filter.
 *
 * The filter keeps a booking when the chosen holder is *any* of its holders
 * (`holderFilterKeys`, `lib/inventory.ts`), which is right — an agent's shared
 * bookings are still their bookings. But the row then described the **whole**
 * booking: filtering to an agent holding 30 of 99 seats showed 99 seats, and
 * the cards totalled 99 (owner's report, 2026-09-20).
 *
 * So when one holder is selected, each row is replaced by a **view of that
 * holder's share** before the table sees it. Cells, sorting, the visible count
 * and the cards all read the projected rows, so there is one set of numbers on
 * the screen rather than two that disagree.
 *
 * How each figure divides:
 *
 *   seats        the holder's own count — nothing calculated
 *   EMD value    heldSeats × fare, which is EXACT: `total_emd_value` is the
 *                generated `seats × fare`, so a share of it is a share of seats
 *   issued,      EMD the airline holds against the whole booking, divided by
 *   refunded     seat share, with the odd paisa left with the company so the
 *                shares always re-add to the booking's own total
 *
 * These are buying-side display figures. **What an agent owes is a different
 * number** — `agentTotal()` in `lib/agent-money.ts`, built from that
 * assignment's charge, discount and tax, and not seat-prorated. Nothing here
 * may be labelled as what an agent owes.
 */

import { BOT_HOLDER, COMPANY_HOLDER } from './inventory';
import type { PnrListRow } from './pnrs';

/** One holder of a booking and the seats they hold. */
export interface HolderSeats {
  key: string;
  seats: number;
}

function toPaisa(value: number): number {
  return Math.round(value * 100);
}

/**
 * Every holder of a booking with their seats: each agent (**summed by name**,
 * because one agent having two live assignment rows on a booking is merged by
 * the application and not by a database constraint), the company's unassigned
 * seats, and the bot's allotment once phase 8 exists.
 */
export function holderSeatsOf(row: PnrListRow): HolderSeats[] {
  const byName = new Map<string, number>();
  for (const part of row.holderParts ?? []) {
    byName.set(part.name, (byName.get(part.name) ?? 0) + part.seats);
  }

  const holders: HolderSeats[] = [...byName]
    .filter(([, seats]) => seats > 0)
    .map(([key, seats]) => ({ key, seats }));

  if (row.unassignedSeats > 0) holders.push({ key: COMPANY_HOLDER, seats: row.unassignedSeats });
  return holders;
}

/** Seats the given holder holds on this booking. 0 when they hold none. */
export function seatsHeldBy(row: PnrListRow, holder: string): number {
  return holderSeatsOf(row)
    .filter((h) => h.key === holder)
    .reduce((sum, h) => sum + h.seats, 0);
}

/**
 * One holder's share of an amount of real money, in whole paisa.
 *
 * Divided by the **seats actually held**, not by `row.seats`: `seatLedger`
 * clamps unassigned seats at zero, so if the stored rows ever over-allocate a
 * booking the agents' seats can exceed it. Dividing by the larger of the two
 * keeps every share inside the booking's own figure instead of inflating it.
 *
 * The odd paisa stays with the **company**: dividing 30/30/39 of an amount and
 * rounding each part independently loses a paisa, and the company's view would
 * then stop equalling "the booking minus the agents". With no company seats it
 * goes to the largest agent share. Either way the shares re-add to the whole,
 * which a test asserts.
 */
export function shareOfMoney(
  amount: number | null,
  holder: string,
  holders: HolderSeats[],
  bookingSeats: number
): number | null {
  if (amount === null || !Number.isFinite(amount)) return null;

  const held = holders.filter((h) => h.key === holder).reduce((s, h) => s + h.seats, 0);
  if (held === 0) return 0;

  const holderTotal = holders.reduce((s, h) => s + h.seats, 0);
  const denominator = Math.max(bookingSeats, holderTotal);
  // Reachable: `holderFilterKeys` still lists the company on a 0-seat booking.
  if (denominator <= 0) return 0;

  const totalPaisa = toPaisa(amount);
  if (held >= denominator) return totalPaisa / 100;

  const residualHolder = pickResidualHolder(holders);
  if (holder !== residualHolder) {
    return Math.round((totalPaisa * held) / denominator) / 100;
  }

  // The residual holder takes what the others leave, so nothing is lost.
  const others = holders
    .filter((h) => h.key !== holder)
    .reduce((sum, h) => sum + Math.round((totalPaisa * h.seats) / denominator), 0);
  return Math.max(0, totalPaisa - others) / 100;
}

/** The company, or the largest agent when the company holds nothing. */
function pickResidualHolder(holders: HolderSeats[]): string | null {
  const company = holders.find((h) => h.key === COMPANY_HOLDER);
  if (company) return company.key;
  const largest = [...holders].sort((a, b) => b.seats - a.seats)[0];
  return largest?.key ?? null;
}

/**
 * The row as it should read when `holder` is the only holder in view.
 *
 * `holder === null` returns the row untouched — the dashboard's normal state,
 * and the identity case a test pins.
 *
 * `holderKeys` and every other field are preserved, so the existing Holder
 * `filterFn` still matches on a projected row.
 */
export function projectRowToHolder(row: PnrListRow, holder: string | null): PnrListRow {
  if (!holder) return row;

  const holders = holderSeatsOf(row);
  const held = seatsHeldBy(row, holder);

  // Holds the whole booking: every figure is already theirs, and rebuilding it
  // would turn a null EMD value into 0 and print "PKR 0.00" where the column
  // should print an em dash.
  if (held >= row.seats && row.seats > 0) {
    return { ...row, holderView: { holder, bookingSeats: row.seats } };
  }

  return {
    ...row,
    seats: held,
    // Exact, not prorated: total_emd_value is the generated seats × fare.
    totalEmdValue: row.totalEmdValue === null ? null : held * row.fare,
    totalIssued: shareOfMoney(row.totalIssued, holder, holders, row.seats) ?? 0,
    totalRefunded: shareOfMoney(row.totalRefunded, holder, holders, row.seats) ?? 0,
    // The obligation to IATA belongs to the company however the seats were
    // split, so the DATE is left alone — a holder's view of a booking does not
    // move when IATA must be paid. Only the amount is apportioned, so that
    // filtering to one holder does not make the whole booking's bill look like
    // theirs.
    iataUnpaidAmount: shareOfMoney(row.iataUnpaidAmount, holder, holders, row.seats) ?? 0,
    // The next EMD is issued for the whole booking, but a holder's view shows
    // their part of every other figure — leaving this one whole would have the
    // "EMDs to issue" card quote the booking's full deposit under one agent's
    // name. Null stays null: an amount nobody can derive has no share either.
    nextEmdAmount:
      row.nextEmdAmount === null
        ? null
        : shareOfMoney(row.nextEmdAmount, holder, holders, row.seats),
    holderView: { holder, bookingSeats: row.seats },
  };
}

/** True when this row shows part of a booking rather than all of it. */
export function isPartialView(row: PnrListRow): boolean {
  return row.holderView !== undefined && row.seats < row.holderView.bookingSeats;
}

export { BOT_HOLDER, COMPANY_HOLDER };
