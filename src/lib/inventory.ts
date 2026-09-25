/**
 * The seat ledger — who holds every seat of a PNR (phase 6).
 *
 * One rule this whole file exists to protect (docs/business-rules.md, "Selling
 * side"):
 *
 *   **`pnrs.seats` is a buying-side fact. Selling NEVER writes it.**
 *
 * `total_emd_value` is `seats × fare`, so decrementing `seats` when a seat is
 * handed to an agent or sold to a customer would silently shrink the booking's
 * EMD value. Instead the seats are *divided by derivation*:
 *
 *     pnrs.seats
 *      ├─ agent seats   = Σ live agent_assignments.seats
 *      ├─ bot allotment = seats put on sale through the WhatsApp bot (phase 8)
 *      └─ unassigned    = seats − agent seats − bot allotment
 *
 * The same discipline as parent/child allocations, where holding two readings of
 * one rule at once double-counted every split (docs/decisions.md, 2026-09-07).
 *
 * Pure functions only: every caller — server action, page, and later the bot API
 * — asks the same code the same question, so a form can never offer a number the
 * server will refuse.
 */

/** A live (not released) assignment. Released rows are history and never count. */
export interface LedgerAssignment {
  seats: number;
  releasedAt?: Date | null;
}

export interface SeatLedger {
  /** `pnrs.seats` — everything this PNR holds. */
  seats: number;
  /** Seats held by agents, across every live assignment. */
  agentSeats: number;
  /** Seats on sale through the bot. Always 0 until phase 8 exists. */
  botAllotment: number;
  /** Seats nobody is selling yet. Never negative. */
  unassigned: number;
  /** True when the stored rows already break the invariant (see below). */
  overAllocated: boolean;
}

/** Seats of live assignments only. */
export function liveAgentSeats(assignments: LedgerAssignment[]): number {
  return assignments
    .filter((a) => !a.releasedAt)
    .reduce((sum, a) => sum + a.seats, 0);
}

export function seatLedger(input: {
  seats: number;
  assignments: LedgerAssignment[];
  botAllotment?: number;
}): SeatLedger {
  const agentSeats = liveAgentSeats(input.assignments);
  const botAllotment = input.botAllotment ?? 0;
  const raw = input.seats - agentSeats - botAllotment;

  return {
    seats: input.seats,
    agentSeats,
    botAllotment,
    // Clamped at zero: a negative "unassigned" would be offered to callers as a
    // number to compare against, and a negative limit blocks every legal action
    // — the shape of the split bug on 2026-09-07, where 12 parents could not be
    // split at all because their allowance had gone negative.
    unassigned: Math.max(0, raw),
    // Surfaced rather than hidden. It should be impossible (every write checks
    // the invariant), but if seats were reduced by another route, a screen
    // showing a tidy 0 would be lying.
    overAllocated: raw < 0,
  };
}

/**
 * May `requested` seats be handed to an agent (or put on sale)?
 * Returns an error message, or null when it is allowed.
 */
export function validateAssign(ledger: SeatLedger, requested: number): string | null {
  if (!Number.isFinite(requested) || !Number.isInteger(requested) || requested <= 0) {
    return 'Seats must be a positive whole number.';
  }
  if (requested > ledger.unassigned) {
    return ledger.unassigned === 0
      ? `Every seat on this booking is already assigned. Release seats first.`
      : `Cannot assign ${requested} seats — only ${ledger.unassigned} of the ${ledger.seats} seats on this booking are still with the company.`;
  }
  return null;
}

/**
 * May `requested` seats be taken back from an existing assignment?
 *
 * Releasing part of an assignment is allowed: an agent who took 20 seats may
 * hand 5 back. Releasing all of them ends the assignment.
 */
export function validateRelease(assignmentSeats: number, requested: number): string | null {
  if (!Number.isFinite(requested) || !Number.isInteger(requested) || requested <= 0) {
    return 'Seats to release must be a positive whole number.';
  }
  if (requested > assignmentSeats) {
    return `Cannot release ${requested} seats — this agent holds ${assignmentSeats}.`;
  }
  return null;
}

/**
 * May this many seats move from one agent to another?
 *
 * A move is a release and an assign in one step, so it needs no unassigned seats
 * of its own — the seats are already committed and simply change hands. Only
 * head office may do it (ruling 7); that check belongs in the action, not here.
 */
export function validateMove(
  fromAssignmentSeats: number,
  requested: number,
  sameAgent: boolean
): string | null {
  if (sameAgent) return 'Choose a different agent to move these seats to.';
  return validateRelease(fromAssignmentSeats, requested);
}

/**
 * May `pnrs.seats` be changed to `newSeats`?
 *
 * The buying side owns this number, but it cannot drop below what the selling
 * side has already committed — that would leave agents holding seats the booking
 * no longer has. Same shape as the ticket-count guard added in phase 5 step 1.
 */
export function validateSeatsChange(
  newSeats: number,
  committed: { agentSeats: number; botAllotment?: number }
): string | null {
  const total = committed.agentSeats + (committed.botAllotment ?? 0);
  if (newSeats < total) {
    return `This booking has ${total} seat${total === 1 ? '' : 's'} already assigned, so it cannot be reduced to ${newSeats}. Release seats first.`;
  }
  return null;
}

/** How a PNR's seats are held, for the dashboard's Holder column (step 3). */
export type HolderKind = 'unassigned' | 'agent' | 'bot' | 'mixed';

/**
 * The dashboard's Holder column (owner rulings, 2026-09-20).
 *
 * A booking is bought on company investment and stays there until its seats are
 * handed over, so the label answers "who holds these seats now?":
 *
 *   nobody handed over          -> "Company Investment"
 *   all seats to one agent      -> "QFC Group"            (it belongs to them now)
 *   part to one agent           -> "QFC Group (20) + Company (30)"
 *   two or more agents          -> "QFC Group + KJ Travels"
 *   agents plus company seats   -> "QFC Group (20) + KJ Travels (20) + Company (10)"
 *
 * Seat counts appear exactly where they answer a question the names cannot: when
 * the company still holds some of the booking. Where every seat is with agents,
 * the names alone say it.
 *
 * **"Mixed" is gone.** It used to cover any split at all, including one agent
 * plus company seats — which the owner pointed out is not what mixed means: a
 * booking is mixed when *several agents* share it, and that case now simply
 * lists them.
 */
export const COMPANY_HOLDER = 'Company Investment';
export const BOT_HOLDER = 'B2C / Bot';

export interface HolderPart {
  name: string;
  seats: number;
}

export function holderLabel(ledger: SeatLedger, agents: HolderPart[]): string {
  const held = agents.filter((a) => a.seats > 0);
  const companySeats = ledger.unassigned;

  if (held.length === 0 && ledger.botAllotment === 0) return COMPANY_HOLDER;

  const parts: string[] = [];
  // Counts only when the company still holds seats — otherwise the names alone
  // already say the whole story.
  const showCounts = companySeats > 0;
  for (const a of held) parts.push(showCounts ? `${a.name} (${a.seats})` : a.name);
  if (ledger.botAllotment > 0) {
    parts.push(showCounts ? `${BOT_HOLDER} (${ledger.botAllotment})` : BOT_HOLDER);
  }
  if (companySeats > 0) parts.push(`Company (${companySeats})`);

  return parts.join(' + ');
}

/**
 * The values this booking can be found under in the Holder filter.
 *
 * Separate from the label because the label is a sentence about one booking
 * ("QFC Group (20) + Company (30)") while a filter needs the plain things a
 * person picks: an agent, the company, the bot. A shared booking is findable
 * under every agent on it.
 */
export function holderFilterKeys(ledger: SeatLedger, agents: HolderPart[]): string[] {
  const keys = agents.filter((a) => a.seats > 0).map((a) => a.name);
  if (ledger.botAllotment > 0) keys.push(BOT_HOLDER);
  if (ledger.unassigned > 0 || keys.length === 0) keys.push(COMPANY_HOLDER);
  return [...new Set(keys)];
}

export function holderKind(ledger: SeatLedger, agentCount: number): HolderKind {
  const holders =
    (ledger.agentSeats > 0 ? 1 : 0) +
    (ledger.botAllotment > 0 ? 1 : 0) +
    (ledger.unassigned > 0 ? 1 : 0);
  if (holders === 0) return 'unassigned'; // a 0-seat booking
  if (holders > 1) return 'mixed';
  if (ledger.unassigned > 0) return 'unassigned';
  if (ledger.botAllotment > 0) return 'bot';
  return agentCount > 1 ? 'mixed' : 'agent';
}
