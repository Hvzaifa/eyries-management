# Phase 7 — Agent money: dues, recoveries and notices

Goal: know what each agent owes, what they have paid, what is left, and when to
tell them.

This is the phase where a wrong guess costs real money. **Every rule is written
in `business-rules.md` → "Selling side" → "What an agent owes"** and confirmed
with the owner on 2026-09-17 (`decisions.md`, rulings 9–16). If a case is not
covered there, stop and ask (rule 2). Everything here is test-required (rule 4).

Depends on Phase 6: dues are a fraction of the seat counts it establishes.

---

## Step 1 — What an agent owes

- Commercial terms on the assignment: charge (% of base fare, or PKR per seat),
  discount (separate field, same forms, never both), and the airline-tax tick.
- New `src/lib/agent-money.ts`, pure and unit-tested:
  - `agentTotal()` = `seats × fare + charge − discount + (seats × airline tax if
    ticked)`. The owner's worked example is a required test case: 10 seats, fare
    100,000, tax 20,000, charge 5% → **1,250,000**.
  - `agentMargin()` = charge − discount. **Tax is never margin** (ruling 15).
  - Money is summed in whole paisa, as `sumMoney()` in `lib/dashboard.ts` does —
    floats drift, and staff reconcile to the paisa.
- Deliverable: terms can be set per agent on a PNR, two agents on the same PNR
  can differ, and the totals match the owner's example exactly.

## Step 2 — Recoveries

- New `agent_recoveries` table and the "record recovery" action.
- Validation in the shape of `src/lib/refunds.ts`: no negative, NaN, infinite or
  blank amount; no impossible date (`new Date('2026-02-30')` rolls over rather
  than throwing); transactional with its `activity_log` entry.
- **Outstanding = agent total − recoveries**, calculated, never stored.
- The payment `reference` must never reach a log line (rule 8).
- Deliverable: payments can be recorded against an assignment, and the agent's
  outstanding balance moves by exactly the amount recorded.

## Step 3 — When it is due

- `emdShareDue()`: `(agent seats ÷ PNR seats) × EMD money the airline currently
  holds`, minus recoveries. Due **3 days before** the earliest open round's
  deadline.
- Required test — the extension cycle, from the owner's own example (ruling 13):
  R1 450,000 with 10 of 30 seats → 150,000 due; R1 refunded and extension R2
  450,000 issued → **0 due**, the earlier payment stands as credit; R3 2,550,000
  issued → a share of R2+R3 minus the 150,000 already paid.
- `finalBalanceDue()`: everything left, due 3 days before the **ticket issuance
  deadline**. For SV that deadline is outbound − 3, so the money is due
  outbound − 6 — a worthwhile test case. **No ticketing deadline recorded → no
  due date and no reminder**, shown as outstanding.
- Deliverable: for a real booking, the schedule of what the agent owes and when
  can be read off the agent page and reconciled by hand.

## Step 4 — Telling the agent

- Agent dues join the **existing** daily alert (extend the job, as Phase 5 did —
  do not add a second job): notices due today or in the next 2 days, future only.
- "Send notice" is a **human click**, and the recipient must be one of that
  agent's `contact_emails` — the same guard that closed the airline open relay
  (`decisions.md`, 2026-09-07). Subject, body and recipient are logged.
- `/agents` and `/agents/[id]` show total, recovered, outstanding, next due date
  and margin.
- Deliverable: a staff member receives the daily email listing agents due, opens
  the agent, sends the notice, and sees it recorded against the assignment.
