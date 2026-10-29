# Phase 9 — The procurement workflow

**Status: signed off 2026-10-20 (the owner asked for Step 1 to begin). Steps 1–3
built and reviewed (2026-10-28); Steps 4 and 5 built 2026-10-28, Step 6 built 2026-10-29, awaiting review.** **Built before Phase 8** (owner, 2026-10-14).

Goal: bring the system in line with the proposed workflow in
`Group Procurement.xlsx` ("Proposed Workflow" sheet), as the owner ruled on
2026-10-13. Every rule here comes from the `decisions.md` entry **"2026-10-13 —
Owner rulings on the proposed workflow"**, and the 2026-10-14 entry that
follows it. The item codes (A1, B4, …) refer to the 2026-10-13 entry. If a case isn't covered there, stop and ask (rule 2).

This phase reverses several earlier rulings: the two EMD statuses, the
four-condition `cancelled`, Head-Office-only splitting, optional flight times,
calculated ticket balances and the daily alert email. Each step that reverses
one must also update `business-rules.md` and `data-model.md` in the same
change, and mark the old wording superseded rather than deleting it.

Everything that touches money, dates, percentages or seat counts needs unit
tests (rule 4).

**Production writes.** Every schema change goes through `db/schema.sql` (the
create block **and** the healing section) and is mirrored in
`prisma/schema.prisma`, applied with a dry-run-by-default script as in
Phase 6. Every change to existing rows, such as relabelling statuses, is a
production write: back up first and get the owner's go-ahead (`operations.md`).

**Do exactly one step per session. Update `PROGRESS.md` after each step is
reviewed and confirmed working.**

The **ledger** (C2) is not in this phase. It is
[Phase 10](phase-10-ledger.md), built after this one.

---

## Fields this phase adds

Listed here so the owner can approve them in one place (rule 3). Every one was
approved in principle on 2026-10-13. The names are proposals.

| Table | Field / value | Step | Ruling |
|---|---|---|---|
| `pnrs` | `outbound_arrival_date`, `inbound_arrival_date` (date, nullable) | 1 | A4 |
| `flight_stops` | `arrival_date`, `departure_date` (date, nullable) | 1 | A4 |
| `pnrs.status` | new value `released` | 2 | A2, B3 |
| `emd_rounds.status` | new value `refund_requested` | 3 | A1 |
| `agent_assignments` | `penalty_amount` (numeric, nullable): the penalty charged to this agent | 4 | A9, A10, B3 |
| `ticketing` | `company_penalty_amount` (numeric, nullable): the penalty on the company's own seats | 4 | A9, A10 |
| `agent_assignments`, `ticketing` | `penalty_license_id` (fk → licenses, nullable): the license the penalty EMD was issued against, required whenever its amount is entered | 4 | 2026-10-14 |
| `emd_rounds.status` | new value `forfeited` | 5 | B3 |
| `pnrs` | `penalty_paid` (boolean, nullable): set only on a cancelled PNR | 5 | B3 |
| new table `agent_paybacks` | `assignment_id`, `amount`, `paid_on`, `reference`, `created_by`, `created_at`: money returned to an agent | 5 | 2026-10-14 |

No field is added for release, cancel or branch-move **reasons**. They go in
`activity_log`, which Head Office already reads.

---

## Step 1 — Flight times and ticketing deadline required on new PNRs

- **New PNRs only** must have, on every flight including stops:
  - a departure time and an arrival time;
  - for overnight flights, the arrival date.
- **New PNRs only** must also have a **ticket issuance deadline** (A6). For SV
  it's still pre-filled as outbound − 3 days.
- Existing bookings stay editable without these fields. This follows the
  precedent in `business-rules.md`: a rule tightened today must not make
  yesterday's record uneditable.
- The AI intake draft and the Excel mapping must fill the new fields where the
  source has them. Otherwise the reviewer is asked for them.
- Tests: an arrival date earlier than the departure is refused; a same-day
  arrival leaves the arrival date blank or equal; an old booking without times
  still saves.
- Deliverable: a new booking can't be saved without times and a ticketing
  deadline, and an existing one can.

## Step 2 — Release replaces cancelled (pre-EMD-1)

- Add `released` to `pnrs.status`.
- **Release action** (A2):
  - A branch may release its own PNRs. Head Office may release any PNR.
  - It's refused once any EMD round exists. Head Office is no exception.
  - It's refused if any agent on the PNR has a recorded payment.
  - A reason is required, and is written to `activity_log` in the same
    transaction.
  - Unpaid agents' assignments end with the release, and each one is logged.
  - The release can't be undone. The edit form can't move a PNR out of
    `released`.
- **Flag, don't act:** a PNR whose EMD-1 issuance deadline has passed with no
  EMD issued shows as "at risk — confirm with airline". A person releases it.
  The system never changes the status itself.
- **Existing data** (production write, owner go-ahead): `cancelled` PNRs with
  no EMD round become `released`. Those with rounds stay `cancelled`. Run a
  dry run first that lists both groups.
- Everywhere `cancelled` is excluded must also exclude `released`: the
  dashboard, the alerts, the EMD actions and agent money. Search for every
  `'cancelled'` in `src/` (about 20 files).
- Deliverable: a branch releases its own pre-EMD PNR with a reason, and Head
  Office sees the reason in the history. Release is refused after EMD-1 and
  when an agent has paid.

## Step 3 — Refund requested and the new "To be refunded"

- Add `refund_requested` to the EMD round statuses (A1).
  - A branch may mark its own PNRs' rounds. Head Office may mark any round.
  - It can't go back to `issued`.
  - Only Head Office records the refund (`recordEmdRefund`, bulk refund). That
    now accepts `issued` or `refund_requested` rounds.
- **Money held:** a `refund_requested` round is no longer held. It's excluded
  from:
  - the dashboard's held totals;
  - the "currently holding" figure behind agents' EMD shares
    (`agent-money.ts`).

  Tests must cover an agent whose share drops when a round is requested.
- **To be refunded** (A6), on the Refunds page:
  - It lists rounds **paid to IATA** on PNRs where:
    - the ticket issuance deadline passed at least a day ago, **or**
    - all tickets are confirmed issued (Step 4).
  - Later, it also lists forfeited rounds once the penalty is marked paid
    (Step 5).
  - Rounds not paid to IATA are never listed.
  - A paid round stays on the main dashboard until then.
- The system only **flags**. A person marks the rounds as refund requested.
- Deliverable: a paid EMD-1 stays on the dashboard until the day after the
  ticket deadline, then appears on "To be refunded". Marking it requested
  removes it from the held totals, and Head Office records the refund.

## Step 4 — Ticket tracking and unissued seats

- **"All tickets issued?"** (A8): Head Office and branches can answer it, each
  for their own PNRs, at any time.
  - **Yes:** the remaining count is 0, and the PNR's paid EMDs go on "To be
    refunded" immediately.
  - **No:** the user types how many tickets remain.
  - `balance_tickets` becomes the typed field. `tickets_issued` is worked out
    as `seats − balance_tickets`. This reverses the 2026-09-19 direction.
  - A blank count still means "not answered", never zero.
- **Unissued seats after the ticketing deadline** (replaces "considered
  cancelled"):
  - **SV (A9):** up to `floor(10% × seats)` may go unissued. Beyond that the
    page shows the limit has been passed, and staff enter the penalty.
  - **Other airlines (A10):** every unissued seat is set for a manual penalty,
    and staff enter it.
  - **Who pays:** for agents' seats, the penalty goes on that agent's
    assignment (`penalty_amount`) and is added to what the agent owes. For the
    company's own seats it goes in `company_penalty_amount`.
- **Partial ticketing never cancels** the PNR.
- Tests:
  - the 10% floor (25 → 2, 30 → 3, 9 → 0);
  - SV versus other airlines;
  - an agent's total rising by their penalty;
  - Yes → immediate "To be refunded".
- Deliverable: a 30-seat SV booking with 3 unissued shows no penalty, and with
  6 unissued asks for one. A PIA booking with 1 unissued asks for one.

## Step 5 — Cancellation, forfeiture and paying agents back

> **Changed by the owner on 2026-10-28:** nothing is cancelled automatically.
> A booking meeting either trigger is **flagged**, and a person (a branch on its
> own bookings, Head Office on any) cancels it with a reason, or leaves it
> active. Only bookings created from 29 Oct 2026 are flagged. The rest of the
> process follows as below. See `decisions.md` 2026-10-28, Step 5.

- ~~**Automatic cancellation** (2026-10-14). The daily job cancels a PNR when
  either trigger's due date has passed:~~ **Flagged for cancellation** when
  either trigger's due date has passed:
  - **EMD-2:** the deadline recorded on EMD-1 (the policy date for SV, the
    staff-entered date for other airlines) passed without EMD-2 being issued.
    A booking whose EMD-1 already covers 100% never triggers.
  - **ticketing:** EMD-2 was issued, the ticketing deadline passed, and staff
    **recorded that no tickets were issued**. A blank count never triggers.
- It applies **only to PNRs created after this step goes live**. Existing
  bookings are never touched.
- There is **no manual cancellation** and **no reversal**.
- **On cancellation:**
  - The PNR's issued rounds become `forfeited`.
  - `activity_log` records which trigger fired, with a null user, as API writes
    do. A test proves a PNR created before go-live is never cancelled.
  - It can't be undone.
- **Before the first run:** a dry run must show **zero** existing PNRs
  affected. Show it to the owner before the job is switched on.
- **Penalty paid** (`penalty_paid`, yes/no). Once it's marked yes, the
  forfeited rounds go on "To be refunded".
- **The penalty** is entered in two parts: each agent's share
  (`penalty_amount`) and the company's share (`company_penalty_amount`). The
  ledger (Phase 10) posts both.
- **Agents:**
  - They don't owe the unpaid rest of their EMD share.
  - Staff enter the penalty charged to each agent (`penalty_amount`).
  - The system shows the amount to pay back: what the agent has paid, less
    their penalty.
  - Staff **record the payback** in `agent_paybacks` (date and amount). This
    uses the same validation as `refunds.ts`, a transaction, and an
    `activity_log` entry, and the payment reference never reaches a log line.
    Recording it brings the amount owed back down to zero.
- Tests:
  - an agent who paid 200,000 with a 50,000 penalty is owed 150,000;
  - an agent who paid nothing owes nothing more;
  - forfeited rounds stay out of the held totals until refunded.
- Deliverable: a cancelled PNR shows its forfeited EMDs, the penalty-paid
  switch moves them to "To be refunded", and each agent shows what they're
  owed back.

## Step 6 — Splits (SV only)

Replaces the Phase 4 split rules, `decisions.md` 2026-09-01.

> **Changed by the owner on 2026-10-29:** a split is kept **inside the
> booking**, like an agent's seats — no new booking, no dashboard row, and the
> PNR code is optional. The booking keeps its seat count and one set of EMDs;
> the split has its own dates, ticket deadline and ticket count. The child-booking
> points below (edit-locked child, the child's next EMD, deadlines copied to it)
> no longer apply. See `decisions.md` 2026-10-29 and `business-rules.md`
> "Splits".

- **SV only.** Splitting any other airline's PNR is refused.
- **Branches may split** their own PNRs, including after EMD-1 is issued. The
  child is edit-locked like its parent.
- **Split before any EMD is issued:** nothing has been issued, so each PNR
  gets its own rounds, calculated on its own seats.
- **Split after an EMD is issued** (owner confirmed, 2026-10-14):
  - Issued EMDs stay on the parent. The parent shows them as issued before the
    split, for the original seats. This is derived from the issuance date and
    the split's `created_at`.
  - The child shows only its next EMD, with a note that EMD-1 was paid by the
    parent.
  - Rounds not yet issued are calculated for each PNR on its own seats.
- **This fixes the current bug:** `splitPnr` tests `emd1.status ===
  'refunded'`, and the new test is "has any EMD been issued".
- **Deadlines:**
  - The child's EMD deadlines are copied from the parent.
  - If the child's outbound date moved, its ticket issuance deadline is
    recalculated as outbound − 3 days.
- **Agents:**
  - One split takes one agent's seats, or only unassigned seats, never both.
  - Seats stay with the same agent, and the terms are copied unchanged to the
    child.
  - The agent's money is counted **collectively** across the parent and the
    child: one total, one set of payments.
  - Required test: QFC, 30 seats, split 15 + 15. It must give the same total,
    EMD share and outstanding as the unsplit booking.
- **Refunds:**
  - The parent's EMDs, including the EMD-1 that covers the child's seats, go
    on "To be refunded" after the **parent's** ticketing deadline.
  - The child's own EMDs follow the child's deadline.
- Deliverable: QFC's 30-seat SV booking after EMD-1 can be split 15 + 15 by a
  branch, with a new outbound date for the child. EMD-1 stays on the parent,
  and QFC still owes and is credited as one 30-seat deal.

## Step 7 — Moving a PNR between branches

- Head Office only, whole PNR only (B4). A reason and the receiving branch are
  logged.
- Refused if any seats are assigned to an agent.
- The edit form must stop changing `branch_id` directly. Today Head Office can
  change it there, with no reason and no agent check (`updatePnr`).
- Deliverable: Head Office moves an unassigned PNR to another branch with a
  reason. After that the old branch can't see it and the new one can.

## Step 8 — Branch refund emails

- Branches may send the **refund email only** (A5), for their own PNRs:
  - sent through the system;
  - to one of the airline's recorded addresses (the open-relay fix stands);
  - with **Head Office copied**.
- The email is logged against each PNR, as the batch email is.
- Branches still can't send other airline emails.
- Deliverable: a branch sends a refund email for its PNRs to the airline's
  recorded address, and Head Office receives a copy.

## Step 9 — Alerts in the system

- The alerts the daily job emails today become **in-app** (A7):
  - same 0–2 day window, future only;
  - a branch sees its own PNRs' alerts, and Head Office sees all of them.
- The **daily alert email to the staff list stops**. Agent dues notices stay a
  human click (Phase 7). Check what else the cron does before removing anything
  from it.
- Deliverable: a branch user sees their own upcoming deadlines and no other
  branch's, and no staff alert email is sent.

---

## Sign-off

Every question raised while drafting was answered on 2026-10-14 (`decisions.md`).
This file is ready for the owner's sign-off. Once signed off, `PROGRESS.md`
moves to Phase 9 Step 1.
