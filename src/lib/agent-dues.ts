/**
 * When an agent's money falls due (phase 7 step 3).
 *
 * Two deadlines, both **3 days before** the airline's own
 * (`business-rules.md` → "When the agent must pay", owner rulings 13–14):
 *
 *  1. **The EMD share**, before each EMD deadline — which is the date the next
 *     EMD (or the tickets) must be **issued** by, not a payment date. At any
 *     moment the agent must have paid `(agent seats ÷ PNR seats) × the EMD
 *     money the airline is currently holding`, less everything they have
 *     already paid.
 *  2. **The remainder**, before ticketing — charge, tax and whatever is left of
 *     their total, due 3 days before the ticket-issuance deadline. With **no
 *     ticketing deadline recorded there is no due date and no reminder**; the
 *     balance simply shows as outstanding.
 *
 * The owner's own extension cycle is what this file is built to get right, and
 * it is a required test case:
 *
 *   R1 450,000 issued, agent holds 10 of 30 seats   -> owes 150,000
 *   R1 refunded, extension R2 450,000 issued        -> owes 0 (the 150,000 they
 *                                                      already paid stands as
 *                                                      credit, not returned)
 *   R3 2,550,000 issued alongside R2                -> owes 850,000
 *                                                      (⅓ of 3,000,000 − 150,000)
 *
 * That middle step is the whole point: a refunded round drops out of what the
 * airline holds, so an extension does not ask the agent for the money twice.
 *
 * Pure functions only — dates and money, so every one of them is tested
 * (CLAUDE.md rule 4).
 */

import {
  agentBalance,
  agentMargin,
  isTermType,
  type AgentTerms,
  type PnrPricing,
} from './agent-money';

/**
 * The final balance falls due 3 days before the ticket issuance deadline
 * (ruling 13).
 *
 * This no longer applies to the **EMD share**, which since 2026-09-22 has no
 * payment deadline at all — it is collected before the airline issues each
 * round, as practice rather than against a date the system sets.
 */
export const AGENT_NOTICE_DAYS_BEFORE = 3;

/**
 * Rounds whose money the airline is **currently holding**.
 *
 * With statuses reduced to two (2026-09-21) this is simply `issued`: the EMD is
 * a guarantee the airline holds against the booking, whoever has paid what for
 * it. `refunded` is out — that money came back, which is exactly what makes an
 * extension cycle work.
 *
 * **The deadline these are measured against is an ISSUANCE deadline**, not a
 * payment one (owner correction, 2026-09-21) — the date by which the next EMD,
 * or the tickets, must be issued. The agent's share is collected 3 days ahead
 * of it because that is the point at which the company must act on the booking
 * (ruling 13). When the EMD itself must be *paid* is an IATA question that is
 * not modelled yet; if it ever gives agents a different clock, this anchor is
 * the line to revisit.
 */
export const HELD_ROUND_STATUSES = ['issued'];

/** The status that counts as an unresolved round, as everywhere else. */
const OPEN_ROUND_STATUS = 'issued';

export interface DuesRound {
  /** The round's own number on the booking. Orders the agent's schedule. */
  roundNumber: number;
  status: string;
  emdAmount: number;
  deadlineDate: string | null;
}

function toPaisa(value: number): number {
  return Math.round(value * 100);
}

/**
 * An ISO date shifted by whole days, through the calendar.
 *
 * `Date.UTC` normalises the rollover, so month ends, year ends and leap days
 * are handled by the calendar rather than by arithmetic on the day number —
 * the same approach as `svTicketIssuanceDeadline` in `ticketing.ts`.
 */
export function shiftIsoDays(iso: string | null | undefined, days: number): string | null {
  if (!iso) return null;
  const parts = iso.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, m, d] = parts;
  const t = new Date(Date.UTC(y, m - 1, d + days));
  if (Number.isNaN(t.getTime())) return null;
  return t.toISOString().slice(0, 10);
}

/** EMD money the airline holds on this booking right now, in whole paisa. */
export function emdHeldByAirline(rounds: DuesRound[]): number {
  const paisa = rounds
    .filter((r) => HELD_ROUND_STATUSES.includes(r.status))
    .reduce((sum, r) => sum + (Number.isFinite(r.emdAmount) ? toPaisa(r.emdAmount) : 0), 0);
  return paisa / 100;
}

/** The earliest deadline among open rounds — the next one the airline will act on. */
export function nextOpenDeadline(rounds: DuesRound[]): string | null {
  const dates = rounds
    .filter((r) => r.status === OPEN_ROUND_STATUS && r.deadlineDate)
    .map((r) => r.deadlineDate as string)
    .sort();
  return dates[0] ?? null;
}

export interface EmdShare {
  /** EMD the airline holds on the whole booking. */
  held: number;
  /** This agent's share of it — what they must have paid by the due date. */
  required: number;
  /** What they have paid so far. */
  recovered: number;
  /** Still to collect. Never negative. */
  due: number;
  /**
   * The airline's own next issuance deadline, kept as **context only** — the
   * date by which the next EMD must be issued, and therefore roughly when this
   * money has to be in hand.
   *
   * There is deliberately **no payment due date** on an agent's EMD share
   * (owner ruling, 2026-09-22): *"No round deadline needs to be added as the
   * staff knows to collect money from agents before an EMD is issued."* The
   * money is collected ahead of issuance as a matter of practice, not against a
   * date the system sets. The earlier rule — three days before the airline's
   * deadline — is withdrawn for the EMD share; it still governs the final
   * balance, which hangs off the ticketing deadline.
   */
  deadlineDate: string | null;
}

export function emdShareDue(input: {
  agentSeats: number;
  pnrSeats: number;
  rounds: DuesRound[];
  /** Everything recovered from this agent on this booking. */
  recovered: number;
}): EmdShare {
  const held = emdHeldByAirline(input.rounds);
  const recovered = Number.isFinite(input.recovered) ? input.recovered : 0;

  // Clamped at 1: `seatLedger` clamps unassigned seats at zero, so stored rows
  // can over-allocate a booking, and a ratio above 1 would ask one agent for
  // more than the airline holds in total.
  const ratio =
    input.pnrSeats > 0 ? Math.min(1, Math.max(0, input.agentSeats) / input.pnrSeats) : 0;

  const requiredPaisa = Math.round(toPaisa(held) * ratio);
  const duePaisa = Math.max(0, requiredPaisa - toPaisa(recovered));
  const deadlineDate = nextOpenDeadline(input.rounds);

  return {
    held,
    required: requiredPaisa / 100,
    recovered,
    due: duePaisa / 100,
    deadlineDate,
  };
}

export interface EmdRoundShare {
  /**
   * What the **agent** calls this round — held rounds numbered 1, 2, 3…
   *
   * Not the booking's own `round_number`. When a round is refunded before its
   * billing window and re-issued, the booking gains rounds 3 and 4 while the
   * agent still owes for the same two deposits: *"No need to show refunded
   * rounds for agents as the amount stays the same, so agents will follow round
   * 1 and 2"* (owner, 2026-09-22). Showing the internal numbering would have an
   * agent asking why they are being billed for a fourth round.
   */
  roundNumber: number;
  /** The round's full EMD amount on the booking. */
  emdAmount: number;
  /** This agent's part of it. */
  share: number;
  /**
   * False for the round the airline has not issued yet. Its share is **not**
   * counted in `EmdShare.required`, because the airline is not holding that
   * money — it is shown so staff can collect before it is issued.
   */
  issued: boolean;
}

/**
 * The agent's EMD money broken out per round — what they pay for each one.
 *
 * The owner's instruction (2026-09-22): *"When a PNR is assigned to agents the
 * agents should show payment to make for each round… Agents' money will be
 * collected for an EMD round before it is issued."*
 *
 * This is a **breakdown of one running balance**, not a set of separately
 * settled debts (owner's choice). Payments stay a single pot against the
 * assignment, which is what keeps ruling 13 working: a round refunded and
 * replaced leaves the agent's payment standing as credit rather than stranded
 * against a round that no longer exists.
 *
 * **Refunded rounds are omitted entirely** and the survivors renumbered from 1.
 *
 * ### The shares add up exactly
 *
 * Each share is the *difference between two cumulative roundings*, not a
 * rounding of each round on its own. Rounding every round independently lets
 * the parts drift from the total by a paisa per round, so a schedule of four
 * rounds could display a column that does not add up to the figure beside it.
 * Done this way the issued shares sum to `EmdShare.required` exactly, always.
 */
export function emdRoundShares(input: {
  agentSeats: number;
  pnrSeats: number;
  rounds: DuesRound[];
  /**
   * The next round the policy says is coming, if one is known. Shown as money
   * to collect before it is issued; never counted as required.
   */
  upcomingAmount?: number | null;
}): EmdRoundShare[] {
  // Same clamp as emdShareDue: stored rows can over-allocate a booking, and a
  // ratio above 1 would ask one agent for more than the airline holds.
  const ratio =
    input.pnrSeats > 0 ? Math.min(1, Math.max(0, input.agentSeats) / input.pnrSeats) : 0;

  const held = input.rounds
    .filter((r) => HELD_ROUND_STATUSES.includes(r.status))
    .slice()
    .sort((a, b) => a.roundNumber - b.roundNumber);

  const lines: EmdRoundShare[] = [];
  let cumulativePaisa = 0;
  let allocatedPaisa = 0;

  held.forEach((r, i) => {
    const amountPaisa = Number.isFinite(r.emdAmount) ? toPaisa(r.emdAmount) : 0;
    cumulativePaisa += amountPaisa;
    const shouldHavePaisa = Math.round(cumulativePaisa * ratio);
    const sharePaisa = shouldHavePaisa - allocatedPaisa;
    allocatedPaisa = shouldHavePaisa;
    lines.push({
      roundNumber: i + 1,
      emdAmount: amountPaisa / 100,
      share: sharePaisa / 100,
      issued: true,
    });
  });

  if (input.upcomingAmount !== null && input.upcomingAmount !== undefined) {
    const upcomingPaisa = Number.isFinite(input.upcomingAmount)
      ? toPaisa(input.upcomingAmount)
      : 0;
    // Priced on the same cumulative basis, so issuing it and re-reading this
    // schedule produces the identical figure — a collection that changes the
    // moment the EMD is issued is a collection nobody trusts.
    const shouldHavePaisa = Math.round((cumulativePaisa + upcomingPaisa) * ratio);
    lines.push({
      roundNumber: held.length + 1,
      emdAmount: upcomingPaisa / 100,
      share: (shouldHavePaisa - allocatedPaisa) / 100,
      issued: false,
    });
  }

  return lines;
}

export interface FinalBalance {
  /** Everything this agent owes on the booking. */
  total: number;
  recovered: number;
  /** Total − recovered. Never negative; an overpayment is `credit`. */
  outstanding: number;
  credit: number;
  /** The booking's ticket-issuance deadline, as recorded. */
  ticketIssuanceDeadline: string | null;
  /**
   * Three days before it — **null when no ticketing deadline is recorded**, in
   * which case the balance is outstanding with no due date and no reminder
   * fires (ruling 17). A missing deadline must never be guessed at here: for SV
   * it is pre-filled at booking time, and for every other airline staff enter
   * it, so inventing one would contradict a date a person is responsible for.
   */
  dueDate: string | null;
}

export function finalBalanceDue(input: {
  seats: number;
  pricing: PnrPricing;
  terms: AgentTerms;
  recoveries: number[];
  ticketIssuanceDeadline: string | null;
}): FinalBalance {
  const balance = agentBalance({
    seats: input.seats,
    pricing: input.pricing,
    terms: input.terms,
    recoveries: input.recoveries,
  });

  return {
    total: balance.total,
    recovered: balance.recovered,
    outstanding: balance.outstanding,
    credit: balance.credit,
    ticketIssuanceDeadline: input.ticketIssuanceDeadline,
    dueDate: shiftIsoDays(input.ticketIssuanceDeadline, -AGENT_NOTICE_DAYS_BEFORE),
  };
}

/** What falls due next, for a screen and (in step 4) for the daily alert. */
export interface NextDue {
  kind: 'emd' | 'final';
  amount: number;
  /** Null means the money is owed with no date attached — no reminder fires. */
  date: string | null;
}

export interface AgentDues {
  emd: EmdShare;
  /** What the agent pays for each round, including the one not yet issued. */
  rounds: EmdRoundShare[];
  final: FinalBalance;
  /** Null when nothing is outstanding at all. */
  next: NextDue | null;
}

/**
 * The whole schedule for one agent on one booking.
 *
 * The two dues are **not added together**: the EMD share is a milestone inside
 * the total, not an extra charge. An agent who has paid their EMD share still
 * owes the rest of their total by ticketing; an agent who has paid nothing owes
 * the EMD share first and the remainder later. `next` is therefore whichever
 * unmet obligation comes first by date, with a dated one always preferred to an
 * undated one — a balance with no ticketing deadline cannot be chased.
 */
export function agentDues(input: {
  agentSeats: number;
  pnrSeats: number;
  pricing: PnrPricing;
  terms: AgentTerms;
  recoveries: number[];
  rounds: DuesRound[];
  ticketIssuanceDeadline: string | null;
  /** The next round's EMD amount from the airline policy, when one is known. */
  upcomingRoundAmount?: number | null;
}): AgentDues {
  const recovered = input.recoveries.reduce(
    (sum, r) => sum + (Number.isFinite(r) ? toPaisa(r) : 0),
    0
  ) / 100;

  const emd = emdShareDue({
    agentSeats: input.agentSeats,
    pnrSeats: input.pnrSeats,
    rounds: input.rounds,
    recovered,
  });

  const rounds = emdRoundShares({
    agentSeats: input.agentSeats,
    pnrSeats: input.pnrSeats,
    rounds: input.rounds,
    upcomingAmount: input.upcomingRoundAmount ?? null,
  });

  const final = finalBalanceDue({
    seats: input.agentSeats,
    pricing: input.pricing,
    terms: input.terms,
    recoveries: input.recoveries,
    ticketIssuanceDeadline: input.ticketIssuanceDeadline,
  });

  // Which obligation comes first is settled by the shape of the deal, not by
  // comparing dates.
  //
  // **An outstanding EMD share always comes first.** It is collected before the
  // airline issues each round, and no booking reaches ticketing without its
  // EMDs — so it precedes the balance by construction. Since 2026-09-22 it
  // carries no date at all (owner ruling: *"no round deadline needs to be
  // added as the staff knows to collect money from agents before an EMD is
  // issued"*), and sorting on dates would therefore have pushed it behind a
  // dated balance falling months later. That would understate what has to be
  // collected this week.
  //
  // A null date also keeps it out of the daily alert, which emails dated
  // obligations only — which is what the owner asked for.
  if (emd.due > 0) {
    return { emd, rounds, final, next: { kind: 'emd', amount: emd.due, date: null } };
  }
  if (final.outstanding > 0) {
    return {
      emd,
      rounds,
      final,
      next: { kind: 'final', amount: final.outstanding, date: final.dueDate },
    };
  }
  return { emd, rounds, final, next: null };
}

/**
 * One assignment's worth of database values, as plain numbers.
 *
 * Deliberately not a Prisma type: this file stays pure and testable, and the
 * caller does the `Decimal` → `number` and `Date` → ISO conversion it was going
 * to do anyway.
 */
export interface AssignmentFacts {
  agentSeats: number;
  pnrSeats: number;
  fare: number;
  airlineTaxes: number | null;
  chargeType: string | null;
  chargeValue: number | null;
  discountType: string | null;
  discountValue: number | null;
  chargeTax: boolean;
  recoveries: number[];
  rounds: DuesRound[];
  ticketIssuanceDeadline: string | null;
  /** The next round's EMD amount from the airline policy, when one is known. */
  upcomingRoundAmount?: number | null;
}

/**
 * The schedule and the margin for one assignment, from one set of raw values.
 *
 * Exists because three separate screens — the agent list, the agent page and
 * the daily alert — were each assembling `AgentTerms` from the same columns and
 * calling `agentDues` themselves. That is how two screens come to disagree
 * about what an agent owes, and it is the mistake `nextEmdSuggestion()` was
 * introduced to prevent on the EMD side (`decisions.md`, 2026-09-22).
 *
 * The `isTermType` guards matter: `charge_type` is a text column, so a value
 * the application does not recognise must fall back to `'none'` rather than
 * flow into the arithmetic as an unknown term.
 */
export function duesForAssignment(f: AssignmentFacts): {
  dues: AgentDues;
  margin: number;
  terms: AgentTerms;
} {
  const pricing: PnrPricing = { fare: f.fare, airlineTaxes: f.airlineTaxes };
  const terms: AgentTerms = {
    chargeType: isTermType(f.chargeType) ? f.chargeType : 'none',
    chargeValue: f.chargeValue,
    discountType: isTermType(f.discountType) ? f.discountType : 'none',
    discountValue: f.discountValue,
    chargeTax: f.chargeTax,
  };

  const dues = agentDues({
    agentSeats: f.agentSeats,
    pnrSeats: f.pnrSeats,
    pricing,
    terms,
    recoveries: f.recoveries,
    rounds: f.rounds,
    ticketIssuanceDeadline: f.ticketIssuanceDeadline,
    upcomingRoundAmount: f.upcomingRoundAmount ?? null,
  });

  // Charge − discount. Tax is NEVER margin (ruling 15) — it is collected for
  // the government and passes straight through.
  const margin = agentMargin({ seats: f.agentSeats, pricing, terms });

  return { dues, margin, terms };
}
