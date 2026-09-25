/**
 * What an agent owes on one booking (phase 7 step 1).
 *
 * Every rule here is the owner's, recorded in `docs/business-rules.md` →
 * "Selling side" → "What an agent owes" and `docs/decisions.md` rulings 9–15.
 * Nothing in this file is inferred; where a case was not covered it is flagged
 * in the docstring rather than decided quietly.
 *
 *   Agent total = seats × fare
 *               + additional charge        (% of base fare, or PKR per seat)
 *               − discount                 (same two forms, never both)
 *               + seats × airline tax      (only when staff tick it)
 *
 *   Agent margin = charge − discount.  **Tax is never margin** (ruling 15):
 *   "the taxes are paid to government, they shouldn't determine margin or the
 *   profit company makes".
 *
 * Owner's worked example, a required test case (ruling 12):
 *   10 seats, fare 100,000, tax 20,000/seat ticked, charge 5% of base fare
 *   → 1,000,000 + 50,000 + 200,000 = **PKR 1,250,000**, margin 50,000.
 *
 * Pure functions only. The same code answers the question for the server action,
 * the booking page and the agent page, so a screen can never show a total the
 * server disagrees with.
 *
 * **Money is summed in whole paisa**, the discipline `sumMoney()` in
 * `lib/dashboard.ts` already follows: these amounts are `numeric(12,2)` in
 * Postgres but plain floats by the time they reach here, and a percentage of a
 * fare lands on fractions that drift as they accumulate. Staff reconcile these
 * figures to the paisa against a bank statement.
 */

/** How a charge or a discount is expressed. `none` means there isn't one. */
export type TermType = 'none' | 'pct' | 'per_seat';

export const TERM_TYPES: TermType[] = ['none', 'pct', 'per_seat'];

export function isTermType(value: string | null): value is TermType {
  return value !== null && (TERM_TYPES as string[]).includes(value);
}

/** The commercial terms stored on one `agent_assignments` row. */
export interface AgentTerms {
  chargeType: TermType;
  chargeValue: number | null;
  discountType: TermType;
  discountValue: number | null;
  /** Whether this agent pays the airline tax (ruling 11 — staff decide). */
  chargeTax: boolean;
}

export const NO_TERMS: AgentTerms = {
  chargeType: 'none',
  chargeValue: null,
  discountType: 'none',
  discountValue: null,
  chargeTax: false,
};

/** The booking's own money, per seat, as `pnrs` stores it. */
export interface PnrPricing {
  /** `pnrs.fare` — per seat. */
  fare: number;
  /** `pnrs.airline_taxes` — per seat (ruling 11). Null when not recorded. */
  airlineTaxes: number | null;
}

export interface AgentMoney {
  /** Seats × fare. */
  base: number;
  /** The additional charge, in rupees, whichever form it was entered in. */
  charge: number;
  /** The discount, in rupees. Always positive; it is subtracted, not added. */
  discount: number;
  /** Seats × airline tax, or 0 when the tick is off or no tax is recorded. */
  tax: number;
  /** base + charge − discount + tax. What the agent owes in total. */
  total: number;
  /** charge − discount. Excludes tax, always (ruling 15). */
  margin: number;
}

/** Rupees rounded to the paisa — the precision the database column stores. */
function toPaisa(value: number): number {
  return Math.round(value * 100);
}

function fromPaisa(paisa: number): number {
  return paisa / 100;
}

/** True for a real, non-negative, finite amount. Blank and NaN are not money. */
function isAmount(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * One side of the terms — a charge or a discount — as an amount in paisa.
 *
 * `pct` is a percentage **of the base fare** (seats × fare), not of the total:
 * the owner's example reads "5% × 1,000,000" where 1,000,000 is 10 seats at
 * 100,000. `per_seat` is a flat rupee amount for each seat the agent holds.
 */
function termPaisa(
  type: TermType,
  value: number | null,
  seats: number,
  basePaisa: number
): number {
  if (type === 'none' || !isAmount(value)) return 0;
  if (type === 'pct') return Math.round((basePaisa * value) / 100);
  return Math.round(toPaisa(value) * seats);
}

/**
 * Everything one agent owes on one booking, and the company's margin on it.
 *
 * Returns zeroes for a zero-seat assignment rather than throwing — a released
 * assignment is still rendered in history, and a page must not crash on it.
 */
export function agentTotal(input: {
  seats: number;
  pricing: PnrPricing;
  terms: AgentTerms;
}): AgentMoney {
  const { seats, pricing, terms } = input;
  const safeSeats = Number.isFinite(seats) && seats > 0 ? Math.trunc(seats) : 0;
  const fare = isAmount(pricing.fare) ? pricing.fare : 0;

  const basePaisa = toPaisa(fare) * safeSeats;
  const chargePaisa = termPaisa(terms.chargeType, terms.chargeValue, safeSeats, basePaisa);
  const discountPaisa = termPaisa(terms.discountType, terms.discountValue, safeSeats, basePaisa);

  // The tick is what decides, not the presence of a tax figure: a booking can
  // carry airline taxes that this particular agent was not asked to pay.
  const taxPaisa =
    terms.chargeTax && isAmount(pricing.airlineTaxes)
      ? toPaisa(pricing.airlineTaxes) * safeSeats
      : 0;

  return {
    base: fromPaisa(basePaisa),
    charge: fromPaisa(chargePaisa),
    discount: fromPaisa(discountPaisa),
    tax: fromPaisa(taxPaisa),
    total: fromPaisa(basePaisa + chargePaisa - discountPaisa + taxPaisa),
    margin: fromPaisa(chargePaisa - discountPaisa),
  };
}

/**
 * The company's profit on one assignment: charge − discount.
 *
 * Deliberately **not** "total − cost": the tax is collected for the government
 * and passed on, and the fare is what the seats cost. What the company makes is
 * exactly what it added or gave away.
 */
export function agentMargin(input: {
  seats: number;
  pricing: PnrPricing;
  terms: AgentTerms;
}): number {
  return agentTotal(input).margin;
}

/**
 * May these terms be saved?
 *
 * Three rules, in the order a person hits them:
 *
 * 1. **A charge and a discount are never used together** (ruling 10). The
 *    database enforces this too; refusing here means the person is told why
 *    instead of seeing a constraint error.
 * 2. A type without its value, or a value without its type, is half-saved.
 * 3. A discount cannot exceed the base fare. This one is arithmetic, not
 *    policy: a larger discount makes the agent's total negative, i.e. the
 *    company owing the agent for taking seats. **No upper bound is imposed on a
 *    charge** — a strong market is exactly when the owner said a margin gets
 *    added, and inventing a ceiling would be guessing (rule 2).
 */
export function validateTerms(
  terms: AgentTerms,
  context: { seats: number; pricing: PnrPricing }
): { error: string } | null {
  if (!isTermType(terms.chargeType) || !isTermType(terms.discountType)) {
    return { error: 'Choose how the charge or discount is calculated.' };
  }

  if (terms.chargeType !== 'none' && terms.discountType !== 'none') {
    return {
      error:
        'A charge and a discount cannot both be set on one agent. Use a charge when selling above the fare, a discount when selling below it.',
    };
  }

  const sides: [string, TermType, number | null][] = [
    ['charge', terms.chargeType, terms.chargeValue],
    ['discount', terms.discountType, terms.discountValue],
  ];

  for (const [label, type, value] of sides) {
    if (type === 'none') {
      // A leftover value with no type is dropped by the caller, not an error.
      continue;
    }
    if (value === null || !Number.isFinite(value)) {
      return { error: `Enter the ${label} amount.` };
    }
    if (value < 0) {
      return { error: `The ${label} cannot be negative.` };
    }
    if (value === 0) {
      return { error: `A ${label} of zero is the same as none — leave it as “None”.` };
    }
    if (type === 'pct' && value > 100 && label === 'discount') {
      return { error: 'A discount cannot be more than 100% of the fare.' };
    }
  }

  const money = agentTotal({ seats: context.seats, pricing: context.pricing, terms });
  if (toPaisa(money.discount) > toPaisa(money.base)) {
    return {
      error: `A discount of ${money.discount.toLocaleString()} is more than the ${money.base.toLocaleString()} these seats cost, which would leave the company owing the agent.`,
    };
  }

  return null;
}

/**
 * The terms in words, for a screen and for the activity log.
 * "5% of fare", "PKR 2,000 per seat", "No charge".
 */
export function describeTerm(type: TermType, value: number | null): string {
  if (type === 'none' || value === null) return 'None';
  if (type === 'pct') return `${value}% of fare`;
  return `PKR ${value.toLocaleString()} per seat`;
}

/* -------------------------------------------------------------------------
 * Recoveries — money actually received from an agent (phase 7 step 2).
 *
 * "Recovery" is the company's own word for a payment received. Outstanding is
 * the agent's total minus what they have paid, and it is **always calculated**:
 * a stored balance goes stale the moment a charge, a discount or the seat count
 * changes, and then two screens disagree about what an agent owes.
 * ------------------------------------------------------------------------- */

/** Sums payments in whole paisa. Same discipline as `sumMoney()`. */
export function sumRecoveries(amounts: number[]): number {
  return fromPaisa(
    amounts.reduce((sum, a) => sum + (isAmount(a) ? toPaisa(a) : 0), 0)
  );
}

export interface AgentBalance extends AgentMoney {
  /** Everything received against this assignment. */
  recovered: number;
  /** What is still to come in. Never negative — see `credit`. */
  outstanding: number;
  /**
   * Paid beyond the total. Surfaced rather than folded into a negative
   * outstanding, for the same reason `seatLedger` reports `overAllocated`: a
   * screen showing "−50,000 outstanding" reads as a mistake, and an overpayment
   * is a real thing here — the owner's rule 13 has an agent's payment standing
   * as credit when a round is refunded and re-issued.
   */
  credit: number;
}

export function agentBalance(input: {
  seats: number;
  pricing: PnrPricing;
  terms: AgentTerms;
  /** Amounts of every recovery recorded against this assignment. */
  recoveries: number[];
}): AgentBalance {
  const money = agentTotal(input);
  const recovered = sumRecoveries(input.recoveries);
  const remainingPaisa = toPaisa(money.total) - toPaisa(recovered);

  return {
    ...money,
    recovered,
    outstanding: fromPaisa(Math.max(0, remainingPaisa)),
    credit: fromPaisa(Math.max(0, -remainingPaisa)),
  };
}

export type RecoveryCheck = { error: string } | { date: Date };

/**
 * Checks one proposed recovery, in the shape of `validateRefund` in
 * `lib/refunds.ts` — the same failures cost the same money either way.
 *
 * Rejects a missing, NaN, infinite, zero or negative amount; a malformed or
 * impossible date; and a date in the future.
 *
 * **Zero and negative are refused deliberately.** A negative "payment" would
 * read as money going back to the agent, which is not what a recovery is, and
 * it is how a mistyped entry gets "corrected" invisibly. A wrong recovery is
 * deleted — head office only, and the deletion is logged.
 *
 * **A payment larger than the total is allowed.** It shows as credit, because
 * the owner's own rule has an agent's money standing as credit when a round is
 * refunded and re-issued (ruling 13); refusing it would refuse a real event.
 */
export function validateRecovery(
  amount: number | null,
  dateIso: string | null,
  todayIso: string
): RecoveryCheck {
  if (amount === null || typeof amount !== 'number' || !Number.isFinite(amount)) {
    return { error: 'Amount received must be a number.' };
  }
  if (amount <= 0) {
    return {
      error:
        'Amount received must be more than zero. To correct a payment recorded by mistake, delete it instead.',
    };
  }
  if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    return { error: 'Date received is required, as a valid calendar date (YYYY-MM-DD).' };
  }
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return { error: `Date received "${dateIso}" is not a real date.` };
  }
  // `new Date('2026-02-30')` rolls over into March rather than throwing, so the
  // parsed date is compared back to the input (the check `refunds.ts` already
  // makes for the same reason).
  if (date.toISOString().slice(0, 10) !== dateIso) {
    return { error: `Date received "${dateIso}" is not a real date.` };
  }
  if (dateIso > todayIso) {
    return { error: 'A payment cannot be recorded as received on a future date.' };
  }
  return { date };
}

/** One recovery in a log line — **never** including the payment reference. */
export function describeRecovery(amount: number, dateIso: string, method: string | null): string {
  const where = method ? ` by ${method}` : '';
  return `PKR ${amount.toLocaleString()} received on ${dateIso}${where}`;
}
