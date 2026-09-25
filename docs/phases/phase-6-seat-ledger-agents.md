# Phase 6 — Seat ledger and agent hand-over

Goal: know who holds every seat. Staff can hand seats to an agent — the whole
PNR, a child PNR, or N seats — and take them back, with the counts calculated
rather than typed.

**No money in this phase.** What an agent owes is Phase 7. Build the ledger
first: every later figure is a fraction of these seat counts.

Read `business-rules.md` → "Selling side" before starting, and
`decisions.md` 2026-09-19 for the 24 rulings behind it.

**Do exactly one step per session. Update `PROGRESS.md` after each step is
reviewed and confirmed working.**

---

## Step 1 — Agents

- New `agents` table per `data-model.md`, applied through `db/schema.sql` (both
  the create block **and** the healing section) and mirrored in
  `prisma/schema.prisma`.
- `/agents` list plus create and edit, head office and branch.
- `name_key` is the lower-cased, trimmed name with a unique index, so the same
  agent cannot exist twice under two spellings. Creating a duplicate must say
  which agent already exists, not fail with a database error.
- Visibility: head office sees every agent; a branch sees only agents whose
  `created_by_branch_id` is one of its own branch rows (ruling 8).
- Deliverable: an agent can be created from both account types, a branch cannot
  see another branch's agents, and a case-variant duplicate is refused.

## Step 2 — Assignments and the seat ledger

- New `agent_assignments` table (seats and the commercial fields; the money
  fields are stored now and only *used* in Phase 7).
- New `src/lib/inventory.ts` — the seat maths, as pure functions with unit tests
  (rule 4). One place decides: agent seats, bot allotment, unassigned, and
  whether a proposed change is legal.
- Server actions: assign seats to an agent, release them, and move them between
  agents. **Release and move are head office only** (ruling 7).
- Every write is transactional, locks the PNR row (`SELECT … FOR UPDATE` through
  a parameterised `$queryRaw`), re-checks the invariant inside the transaction,
  and writes `activity_log` in the same transaction.
- `validateSplit` (`src/lib/seats.ts`) must take assignments into account: a
  split may only take **unassigned** seats.
- `updatePnr` must refuse to reduce `seats` below what is already assigned — the
  same shape as the ticket-count guard added in Phase 5 Step 1.
- Deliverable: a 30-seat PNR shows 30 unassigned; assigning 10 to an agent leaves
  20; assigning 25 more is refused; releasing returns them; a branch account
  cannot move seats between agents; `pnrs.seats` and `total_emd_value` are
  unchanged throughout.

## Step 3 — Seeing it

- **Seat ownership panel** on the PNR detail page: unassigned, each agent with
  its seats, and (from Phase 8) the bot. Assign, release and move live here.
- **Holder** column and filter on the dashboard, derived: `Company Investment`,
  the agent's name when the booking is wholly theirs, the agents listed when they
  share it, and seat counts where the company still holds part (see
  business-rules.md → "Who a booking belongs to").
- `/agents/[id]`: that agent's assignments across PNRs, read-only for now.
- The ticketing lesson applies — when `agent_assignments` starts writing to
  `activity_log`, add the table to the history query in `getPnrDetail`, or the
  entries will be written and never shown.
- Deliverable: the dashboard can be filtered to one agent's bookings, and the
  detail page shows where every seat of a PNR sits.

## Step 4 — Mapping the legacy agent bookings

- A standalone script, **dry-run by default** like `import-legacy.ts`, proposing
  `agents` rows and assignments from `investor_company` on existing PNRs:
  `COMPANY INVESTMENT` stays unassigned; everything else is a candidate agent.
- It **flags rather than guesses** (the standing import rule). Multi-agent names
  such as `KJ/QFC/MAQBOOL` cannot be split by the script — a human decides how
  many seats each agent holds. Names carrying a B2B code have it extracted.
- Output: a review CSV for the owner. `--commit` only after approval.
- **This is a prerequisite for Phase 8 going live**, because unassigned seats are
  meaningless if agent-held bookings still look unassigned.
- Deliverable: a review file listing every proposed agent and assignment, and a
  committed run whose totals the owner has signed off.
