# Business Rules

These are facts, not implementation choices. If a screen needs logic not described here, stop and ask — do not infer a rule from the shape of the data.

## What an EMD deadline is (owner correction, 2026-09-21)

**An EMD deadline is an ISSUANCE deadline, not a payment deadline.** Issuing an
EMD is what secures the PNR, and the airline requires EMDs to be issued on the
schedule its policy sets out. A round's deadline is the time limit that EMD
secures the booking to, and by that date staff must do one of two things:

1. **issue the next EMD** (the balance, or an extension), or
2. **issue the tickets** — which ends the cycle, because a ticketed booking
   needs no further EMD.

The **ticket** issuance deadline is a different date, tracked separately in
`ticketing` (for SV, 72 hours before departure). Do not conflate the two.

> **When an EMD must be PAID is a separate clock, on the IATA side.** It is
> described under "Paying IATA" below and never derived from any deadline in
> this section. The airline's deadline is about issuing; IATA's is about money.
> (Until 2026-09-22 payment was out of scope entirely — the owner supplied the
> remittance calendar on that date.)

### The 3-day safety margin (owner rule, 2026-09-21)

The system sets its **1st EMD** deadline **3 days before** the airline's own
policy date. The airline's staff routinely send the PNR and seats 2–3 days after
the request, and Sundays fall in between with offices shut, so an EMD issued
exactly on the policy date is issued late — and a late EMD does not secure the
PNR.

The margin is **floored at immediate**: where the policy already allows only 1
day, subtracting 3 does not produce a date in the past, it produces *today*.
The margin applies to the **1st EMD only** — the 2nd EMD keeps the policy's own
dates, because by then the booking is long confirmed and those dates are
anchored to departure rather than to anything the airline must send us.

## Airline EMD policies (auto-suggested, never enforced)

EMD percentage suggestions are **per airline**. Only airlines with an uploaded policy get automatic suggestions; every other airline's percentages are set manually by staff until its policy arrives.

### Saudia (SV) — Umrah, year-round excluding Ramadhan

Based on days between `request_date` and `outbound_date` (uploaded policy sheet, 2026-08-23). Every figure below is **when the EMD must be issued**:

| Time to departure | 1st EMD (deposit) | System issues by | 2nd EMD (balance) |
|---|---|---|---|
| 60+ days | 15%, issue within 14 days of confirmation | **11 days** | 85%, issue by departure − 20 |
| 30–59 days | 30%, within 10 days | **7 days** | 70%, departure − 10 |
| 15–29 days | 50%, within 3 days | **immediate** | 50%, departure − 7 |
| 7–14 days | 70%, within 3 days | **immediate** | 30%, departure − 5 |
| 2–6 days | 100%, within 1 day | **immediate** | — |
| under 2 days | 100%, immediate | **immediate** | — |

The "System issues by" column is the policy figure less the 3-day margin above.
The four short bands collapse to *immediate*, which is correct: a booking two
weeks from departure needs its EMD issued now, and a deadline of today reads as
**due today**, never as overdue.

- Exactly 60 days falls in the top band (15%), per the owner's earlier ruling.
- The Hajj (Intl/Dom), Ramadhan-Umrah, and Tour Operator rows of the airline's table are **not** implemented — owner instruction: umrah only. No imported booking departs during Ramadhan; revisit if that changes.
- The 2nd EMD % is a suggestion for the *next* deposit round (`round_number = 2`); it is shown as guidance at booking creation and recorded when staff actually add that round.
- The older generic EMD-1 table that used to live here (61–90→15 … <7→no round) is **superseded** by this airline-scoped policy.

This only applies to suggestions — always a default the UI pre-fills, editable by staff, never a validation that blocks saving a different value.

## Who issues an EMD, and what a booking starts with (owner rulings, 2026-09-21)

**Only Head Office issues EMDs.** A branch creates the booking; it never issues
a round, including at creation time. The booking form therefore asks for the
**deadline to issue the first EMD** and nothing else about EMDs — pre-filled
from the airline's policy where one exists, typed in where it does not, and
stored as `pnrs.pnr_tl_date`, the time limit the PNR rests with us.

A new booking has **no EMD rounds**. Its rounds section shows what has to happen
next: *"1st EMD to be issued by ‹date ›"*. Once the first is issued the same
block reads *"2nd EMD to be issued by ‹date ›"*, taken from the time limit that
EMD secured. **The date belongs to the booking, not to the round card** — a
deadline printed on a round reads as that round's own due date, when it is the
time limit for issuing the *next* one.

The **EMD amount is calculated**, not typed: the booking's value (`seats × fare`)
times the round's percentage. Staff see it filled in and can correct it, because
the airline occasionally issues an EMD for a figure of its own.

### Issuing EMDs in bulk

Head Office ticks bookings on the dashboard and issues their EMDs in one pass.
Every figure is derived from the booking and its airline policy — round number,
percentage, amount, and the new time limit — and every one stays editable. The
**EMD number is the only thing typed**, because it is the only thing that cannot
be calculated: the airline issues it.

A batch is **all or nothing**. One bad row means none are issued, and the
message names the booking. A booking that cannot take an EMD (cancelled,
completed, or no seats) is shown with the reason rather than quietly dropped.

## How EMD rounds actually work

A PNR is not limited to a fixed number of rounds. The real cycle:

1. Round 1 is issued, securing the PNR until its deadline.
2. If the company can't cover the next portion before the deadline, they request a refund from the airline **before** the deadline (the airline does not cancel the PNR at this point).
3. The next day, the company requests a **date extension**, which becomes round 2 with a new deadline.
4. This can repeat (round 3, round 4, ...) — there is no hard cap. Build `emd_rounds` as an open-ended list per PNR, not fixed columns.
5. The cycle ends when the **tickets are issued** — no further EMD is needed.

### PNR TL as the EMD-1 deadline (owner rule, 2026-08-24, restated 2026-09-21)

`pnrs.pnr_tl_date` **is** the deadline to issue the first EMD, and it is what a
new booking is created with. Once rounds exist it follows the earliest one still
outstanding, so it is always "the next EMD issuance deadline" — which is what
the booking page shows above the rounds.

### EMD-2 auto-generation (owner rule, 2026-08-24 — Phase 3 scope)

The 2nd EMD must only auto-generate **after staff verify the airline's email confirmation** of the 1st EMD, and its percentage then follows the SV policy table above. This is gated on the Phase 3 email infrastructure (sent-log + a verified-confirmation state) — it is intentionally **not** built during Phase 1; until then, round 2 is added manually.

## What happens if a deadline is missed with no extension requested

The PNR is marked **"at risk — confirm with airline"**. The system never automatically marks a PNR as cancelled — only a human, after confirming with the airline, changes status to cancelled. The software reflects reality; it doesn't decide it.

## EMD vs ticket payment — keep these separate

- **EMD** = a guarantee deposit that the seats are held. Base fare only, no taxes.
- **Issuing an EMD and paying it are two different events.** Issuing it secures
  the PNR with the airline. Paying it is an obligation to IATA, falling due on
  the remittance day of the billing period the EMD was issued in — see "Paying
  IATA" above.
- **Ticket payment** = the actual payment when tickets are issued (base fare + taxes). This happens after EMD rounds are done, in the `ticketing` stage.
- After ticket payment is made, the company requests a refund of the EMD amount from the airline. This is recorded as `refund_amount` / `refund_date` on the relevant `emd_rounds` row.
- **Do not attempt to reconcile or net EMD refunds against ticket payments in this system.** Record both as facts. Reconciliation is an accounting question, not a v1 feature — revisit only if explicitly asked.

## EMD round status — two values only (owner ruling, 2026-09-21)

`issued` and `refunded`. A round is **issued** — which is what secures the PNR —
until it is **refunded**. There is no separate refund table; see data-model.md.

`paid`, `refund_requested` and `expired` were removed. Payment is **not** a
status: an EMD that has been paid is still `issued`, because the airline still
holds it. Since 2026-09-22 payment is recorded on its own field,
`emd_rounds.payment_date` — see "Paying IATA" below.

## Paying IATA (owner rulings, 2026-09-22)

Issuing an EMD and paying for it are two obligations to two different parties,
running on two different clocks:

| | Counterparty | What it is | Where it comes from |
|---|---|---|---|
| **Issuance deadline** | the airline | issue the next EMD, or the tickets, or the PNR stops being secured | the airline's policy (`emd.ts`) |
| **Payment deadline** | IATA | money leaving the company for an EMD already issued | the IATA remittance calendar (`iata-calendar.ts`) |

**The airline is not concerned with the money.** Payment goes to IATA, and a
refund is requested from IATA, which processes it — the airline's interest is
only that the EMD exists and secures the seats.

### Reading the calendar

IATA publishes billing periods with a **Billing From**, a **Billing To** and a
**Remittance Day**. **An EMD issued between a period's billing-from and
billing-to dates must be paid on that period's remittance day.**

Only rows whose **Remittance Frequency is "4 times per month"** apply to this
company. The published calendar also carries a daily row per date with a
frequency of `EasyPay`, which is a different settlement product and is ignored.
The `Billing Availability` column is unused — it is when the invoice becomes
downloadable, not a date anyone must act on.

The 2026 calendar holds 48 periods covering 1 Jan – 31 Dec 2026, contiguous with
no gaps. The lag from the close of a period to its remittance day varies between
7 and 10 days with no derivable pattern, so **these dates are transcribed, never
computed, and never extrapolated.** An EMD issued outside the loaded calendar
shows no payment date — the money is still owed, the day is simply not yet
known, and the next calendar must be loaded.

### Rolling a payment into the next cycle

A refund is **not always money coming back**. It can be a **cancellation of the
billing**, after which the company re-issues the same EMD with a new number in a
later billing period, moving the bill one cycle forward. This is a deliberate
cash-flow move, not an exception, and it is why `emd_rounds` is open-ended:

> **Rounds 3 and 4 are rounds 1 and 2 re-issued.** They exist only when rounds
> 1–2 were refunded in time, so their payment deadline lands in the next cycle.

**The deadline that governs the roll is the BILLING window, not the payment
day.** The refund must land **on or before the `Billing To` date of the period
the EMD was issued in**, and the replacement EMD must be issued after it. The
owner's worked example (2026-09-22):

> An EMD issued **20 Sep** falls in period `20260903W`, which bills 16–23 Sep
> and settles **30 Sep**. The company decides it cannot pay in that cycle, so it
> refunds with IATA **on or before 23 Sep** and issues a new EMD on **24 Sep** —
> which falls in `20260904W` and settles **7 Oct**.

Once the billing window closes the EMD has been billed, and a refund after that
is a **separate credit in a later period**: the original bill still falls due on
its own remittance day. Refunding on 26 September in the example above would
*not* move anything — the money is still due on the 30th.

A refund that lands **inside** its billing window therefore does not add to
total refunded: no money ever left, so none came back. A refund after it does,
because the payment goes out and the credit returns separately.

### What is owed

A round is owed to IATA when it has **no recorded payment date** and its refund,
if any, **came too late to cancel the billing**. Three ways a round stops being
owed, and one trap:

- **paid** — a payment date is recorded;
- **refunded on or before the billing-to date** — the billing was cancelled and
  the bill moved to the round that replaced it; chasing both would count it
  twice;
- refunded **after** payment — the money went and came back.

The trap: a round **refunded after its billing window closed but never paid is
still owed.** It is not `issued`, so any query written as "issued and unpaid"
silently loses it. `iataPaymentState()` is the one place that decides, and every
query filters on its verdict rather than on `status`.

### Recording payment

`emd_rounds.payment_date` records the day the money actually went, which may
differ from the due date. It cannot be in the future and cannot precede the EMD's
own issuance date. Marking a round paid is Head Office only, like issuing one:
paying IATA is a head-office settlement.

The payment deadline gets **its own column and its own colour** on the dashboard,
beside the issuance deadline rather than merged with it. A booking is routinely
comfortable on one clock and urgent on the other, and a single merged colour
would hide whichever is not driving it.

## Reading the dashboard: what has to be issued, and when (2026-09-23)

**Every active booking has a next issuance deadline, whether or not it has an
EMD yet.** A booking with no rounds carries `pnr_tl_date`, the time limit for
its *first* EMD; once rounds exist the deadline follows the earliest open one.
The dashboard's **Next Deadline** column shows that date and, underneath it,
**which** EMD is due — "1st EMD", "2nd EMD" — with what the policy says it is
worth.

> This corrects a display that read "No issued round" for a booking that had
> never had an EMD (owner, 2026-09-23). That is precisely the booking with work
> outstanding, and its first EMD might be due tomorrow. The same date now also
> drives the "needs attention within 2 days" banner, which previously counted
> only bookings that already had a round.

### The "EMDs To Issue" card

Pick a date and the card totals **the deposits to be issued that day** —
`seats × fare × the next round's policy percentage` — and the table narrows to
the bookings behind it. It answers "how much money do I need ready on the
20th", which is not the same question as the booking's total EMD value.

- **That date exactly**, never "on or before". The figure is one day's work;
  anything overdue from an earlier date stays under its own date.
- **Blank until a date is picked.** A total with no date against it would be a
  different question answered.
- **Only active bookings.** A cancelled or completed booking has no EMD to
  issue, whatever date it still carries.
- **An amount that cannot be derived is counted, never assumed to be zero.**
  Where no airline policy covers the booking, staff type the figure when they
  issue it, and the card says how many such bookings are in the day rather than
  reporting a total that is quietly short.

The card and the rows beneath it are filtered by the same function, so they can
never disagree about which bookings a date covers.

## Parent/child PNR splits
An agent may only want part of a PNR's total seats. When that happens, a child PNR record is created (`parent_pnr_id` set), and an `allocations` row records how many seats moved.

**`pnrs.seats` is the number of seats that PNR still holds** — the split decrements the parent at the moment it happens, so `seats` already excludes everything given to children. A parent's "seats remaining" therefore *is* its `seats`; the `allocations` rows are the record of what was split away, never a further deduction from it. Both numbers are written by the system, never typed by staff.

> Superseded wording: this rule previously read "the calculated total minus everything allocated to children", which described a model where the parent kept its original total. The project owner replaced that on 2026-09-01 (a 30-seat parent split by 10 shows 20 seats). Applying both at once double-counted every split — see `docs/decisions.md`, 2026-09-07.

## Entering a booking (owner rulings, 2026-09-20)

The imported spreadsheet is **history to read, not the standard to build to** —
the data is being re-entered cleanly. Several rules that were lenient only
because the sheet was messy are now enforced for everything entered from here on.
The imported rows stay exactly as they are.

| Rule | Was | Is |
|---|---|---|
| **PNR code** | duplicates allowed with a warning | **unique**, compared ignoring case and spacing. Entering an existing code is refused, including for a child PNR from a split |
| **Segment** | free text with autocomplete | a fixed list: **Umrah, Employment, Tour** |
| **EMD deadline** | nullable, because 2,057 imported rounds had none | required on every round created or edited in the app |
| **Refund amount** | any amount accepted | may **not exceed the round's own EMD amount** |
| **Investor company** | typed on every booking | **not entered at all** — see below |

### Who a booking belongs to

**Every booking is bought on company investment**, and stays that way until its
seats are handed to an agent or put on sale through the bot. So `investor_company`
is no longer typed: the **seat ledger** answers the question, and the dashboard's
**Holder** column says who holds the seats now:

| Situation | Holder reads |
|---|---|
| Nothing handed over | `Company Investment` |
| Whole booking to one agent | `QFC Group` — it belongs to them now |
| Part to one agent | `QFC Group (20) + Company (30)` |
| Shared between agents | `QFC Group + KJ Travels` |
| Agents plus company seats | `QFC Group (20) + KJ Travels (20) + Company (10)` |
| On sale through the bot | `B2C / Bot`, listed the same way when partial |

Seat counts appear only where the company still holds part of the booking —
otherwise the names alone say it. The **filter** matches the parts, not the
sentence, so picking an agent finds every booking they hold seats on, including
shared ones.

Imported bookings keep the name the sheet recorded, shown read-only on the edit
form. An edit never rewrites it.

### Editing an imported booking

A booking entered before these rules is still editable: an unchanged segment
outside the fixed list is left alone, and the duplicate check ignores the booking
being edited. A rule tightened today must not make yesterday's record unopenable.


## Ticketing stage

Two deadlines are tracked per booking in `ticketing`: the **name update deadline**
and the **ticket issuance deadline**. Both are staff-entered, and both feed the
same daily deadline alert as EMD rounds — same window (today through +2 days),
same exclusions (never a cancelled or completed PNR, never a date that has not
been recorded, never an overdue one).

### Saudia (SV) ticket-issuance policy (owner rule, 2026-09-17)

SV requires tickets to be issued **72 hours before departure**. Only the outbound
*date* is stored — there is no departure time in the data model — so the
suggestion is `outbound_date − 3 days`. A new SV booking is created with that
deadline already recorded, and the ticketing form pre-fills it when the field is
empty. **Staff can always overwrite it**, like every other policy default.

Airlines other than SV have no stored ticketing policy: staff enter both
deadlines themselves, exactly as with EMD percentages.

### Ticket counts (owner rule, 2026-09-19)

Tickets issued and tickets still to be issued **are** the seats on the booking:

- `tickets_issued` may never exceed `pnrs.seats`;
- `balance_tickets` = `seats − tickets_issued`. It is **calculated by the system,
  never typed** — the same treatment as `total_emd_value` and the seat-allocation
  figures. The form shows it read-only and the server recomputes it on every
  save, so the two counts cannot drift apart;
- a booking's `seats` therefore cannot be edited below the tickets already
  issued, and raising the seats recalculates the balance.

### Unissued tickets after the deadline (owner rule, 2026-09-19)

Once the **ticket issuance deadline has passed**, any seats still unissued are
**considered cancelled**. The booking page says so; **nothing is stored**. There
is no cancelled-ticket field, the figure is worked out from the deadline and the
counts, and extending the deadline with the airline clears it by itself.

"Considered cancelled" is a reading of the facts, not a state the system enters:
it never changes `pnrs.status`, and `cancelled` remains human-only (see the
status rules). Cancelled-ticket *tracking*, ticket loss and penalty EMD remain
selling-side work and are still out of scope.

A booking with **no ticket count recorded at all** says nothing, whatever its
deadline. Blank is not zero — every legacy row carries deadlines and no counts,
so reading blank as "none issued" would declare those bookings wholly cancelled
on data nobody entered.

---

# Selling side

Who the seats are sold to. In scope from 2026-09-16 (owner instruction); see
`decisions.md` for the rulings behind every rule below.

## The seat ledger — one rule everything else hangs off

Every PNR is bought on company investment and starts **unassigned**. Staff then
decide who sells its seats. A PNR's seats divide into three, and **every figure is
calculated, never typed**:

```
pnrs.seats                          buying-side fact — selling NEVER changes it
 ├─ agent seats    = Σ active agent assignments
 ├─ bot allotment  = seats staff assigned to the WhatsApp bot
 │    ├─ sold      = bot bookings the bot has reported paid
 │    ├─ on hold   = bot bookings still held and not yet expired
 │    └─ available = allotment − sold − on hold        ← what the bot may sell
 └─ unassigned     = seats − agent seats − bot allotment
```

**`pnrs.seats` is never written by the selling side.** `total_emd_value =
seats × fare`, so decrementing it on a sale would silently shrink the booking's
EMD value. "Seats remaining" is derived, exactly as parent/child allocations are.

The invariant, enforced server-side inside a row-locking transaction:
**agent seats + bot allotment ≤ pnrs.seats**.

Consequences:
- **Unassigned seats are not for sale.** The bot offers only what has been
  assigned to it. A new PNR sells nothing until a staff member says so.
- A split takes seats **from unassigned only**.
- Seats can be reclaimed from the bot only while they are neither sold nor held.
- Head office can move seats from one agent to another; a branch cannot.

### Reading the dashboard when one holder is filtered

Picking a holder in the dashboard's Holder filter narrows the question to that
holder, so every figure on the page becomes **their share of each booking**:
their seats, `their seats × fare` as EMD value, and their portion of the money
paid and refunded, divided by seat count. The Holder column shows
`Ansar e Madinah (30 of 99)` so a share is never mistaken for a booking's own
total, and the cards are relabelled *Seats Held*, *EMD Value (Share)* and so on.
The odd paisa of a division stays with the company, so a booking's holders always
re-add to the booking itself. With no holder selected nothing changes: every row
is the whole booking, as before.

This is the **buying side** seen per holder. It is not what the agent owes —
that is the agent total below, built from their own charge, discount and tax.

## Handing seats to an agent

Seats go to an agent in one of three ways, all the same underlying assignment:
the whole PNR, a child PNR (split first, then assign), or N seats inside a PNR.
**Several agents can hold seats in one PNR**, each with their own terms.

### What an agent owes

Set **per agent on the PNR** — two agents on one PNR may differ:

| Component | Rule |
|---|---|
| Base | `agent seats × fare` |
| Additional charge | **% of base fare** or **fixed PKR per seat** |
| Discount | separate field, same two forms. **Charge and discount are not used together** |
| Airline tax | `pnrs.airline_taxes` (per seat) × agent seats, **only if staff tick it** |

> **Agent total = seats × fare + charge − discount + (seats × airline tax, if ticked).**

Worked example, confirmed by the owner: 10 seats, fare 100,000, tax 20,000/seat
ticked, charge 5% of base fare → `1,000,000 + 50,000 + 200,000` = **PKR 1,250,000**.

A **percentage is a percentage of the base fare** (`seats × fare`), worked out
before the tax is added — the example above reads "5% × 1,000,000", where
1,000,000 is the 10 seats at 100,000. A **discount may not exceed the base
fare**, which would leave the company owing the agent for taking seats; a charge
has no ceiling, because a strong market is exactly when one is added. A charge or
discount of zero is not a term — it is "None".

**Margin excludes tax** — taxes are collected for the government and are not
company profit. Agent margin = charge − discount.

### When the agent must pay

Two obligations. **Only the second has a date.**

1. **EMD share — collected before each round is issued, with no deadline.**
   Owner ruling, 2026-09-22: *"No round deadline needs to be added, as the staff
   know to collect money from agents before an EMD is issued. Agents' money will
   be collected for an EMD round before it is issued."* This **withdraws** the
   earlier rule that put the EMD share 3 days before the airline's deadline.
   There is now no payment date on an agent's EMD share at all; the airline's
   own issuance deadline is still shown as context, because it is roughly when
   the money has to be in hand.

   At any moment the agent must have paid `(agent seats ÷ PNR seats) × the EMD
   money the airline is currently holding`, less everything they have already
   paid. "Currently holding" is every `issued` round — the EMD is a guarantee
   the airline holds against the booking whoever has paid what for it — and a
   `refunded` one does not count, which is what stops an extension charging the
   agent twice. So:
   - a round the agent paid into that is later refunded and replaced by an
     extension leaves their payment standing as **credit** — they top up only the
     difference when a new round raises the required amount;
   - when the airline refunds the EMDs after ticketing, the agent's payments
     **stay credited** against their total. They are not returned.

2. **The remainder, before ticketing.** Charge, tax and whatever is left of the
   total fall due 3 days before the **ticket issuance deadline** (for SV, that
   deadline is itself outbound − 3 days, so the agent's money is due outbound − 6).
   With no ticketing deadline recorded, the balance shows as outstanding with no
   due date and no reminder fires.

An outstanding EMD share is always the agent's **next** obligation, ahead of the
balance, because no booking reaches ticketing without its EMDs. It is ordered
first by that fact, not by comparing dates — it has none.

#### Showing the EMD share per round

*"When a PNR is assigned to agents the agents should show payment to make for
each round"* (owner, 2026-09-22). The agent's EMD money is displayed **broken
down per round** — on the booking's seat-ownership panel and on the agent's own
page. Three rules govern that display:

- It is a **breakdown of one running balance**, not a set of separately settled
  debts. Payments stay one pot against the assignment, which is what keeps the
  credit rule above working when a round is refunded and replaced.
- **Refunded rounds are not shown to agents, and the survivors are renumbered
  from 1.** When rounds 1 and 2 are pulled inside their billing window and
  re-issued as 3 and 4, the agent owes for the same two deposits at the same
  amounts: *"no need to show refunded rounds for agents as the amount stays the
  same, so agents will follow round 1 and 2."* Showing the internal numbering
  would have an agent asking why they are being billed for a fourth round.
- **The next round, not yet issued, is shown as money to collect** — priced from
  the airline's policy — but is **not** counted as required, because the airline
  is not holding it yet. It sits below the line as a collection to make, never
  as arrears. Where no policy covers the airline, no upcoming line appears
  rather than a guessed one.

The per-round shares **add up to the required total exactly**: each is the
difference between two cumulative roundings, not a rounding of each round on its
own, so a four-round schedule cannot display a column that fails to add up to
the figure beside it.

The two are **not added together**: the EMD share is a milestone inside the
agent's total, not an extra charge, and one payment counts against both.

**Recoveries** are the payments received from agents. Outstanding = total −
recoveries, always calculated. A recovery is money that arrived, so it is
positive and cannot be dated in the future; a payment recorded by mistake is
**deleted by head office** (and the deletion is recorded) rather than cancelled
out by a negative entry. Paying more than the balance is allowed and shows as
**credit**, which is the same credit rule 13 describes when a round is refunded
and re-issued.

### Telling the agent (built 2026-09-22)

The daily staff alert lists notices due today or in the next 2 days — future
only, matching the EMD alert; missed ones are not repeated. Since it emails
**dated** obligations only, that means agent **balances**: the EMD share has no
date and is deliberately out of the alert (owner ruling, 2026-09-22). It is
chased from the screen instead, where the per-round schedule shows what is still
to collect.

Three things are deliberately never emailed:

- the **EMD share**, as above;
- a balance with **no due date**, because no ticketing deadline has been
  recorded. The system will not invent one and will not chase one it invented;
- an **inactive agent**, which is a record kept for history, not someone to
  chase.

A notice can still be **sent by hand** for an EMD share. It asks for the money
without quoting a date, saying instead that it is due before the next EMD is
issued — the deadline was withdrawn, not the ability to chase.

**The daily email tells staff who is due. It never writes to an agent.**
Sending is a human click on the agent's page, because an automated demand for
money, sent to an outside party over the company's own domain, is not a
decision a cron job should make.

**The recipient must be one of that agent's recorded contact addresses**, and
that is checked on the server, not in the form. This is the rule that closed the
airline batch email, which took a recipient, a subject and a body straight from
the browser and sent them over the company's verified domain — an open mail
relay (`decisions.md`, 2026-09-07). An agent with no address on file therefore
cannot be sent anything; falling back to an address typed at send time would be
the relay again.

Subject and body are pre-filled and editable. The default text names the
booking, the seats, the amount and the date, and says what the money is for. It
does **not** mention EMD rounds, percentages or the airline's deadlines — none
of that is the agent's business, and quoting it invites an argument about
arithmetic they cannot check. An EMD share is described as **part of** the total
and never as an extra charge, because an agent told they owe a deposit *and* a
balance would reasonably conclude they were being billed twice.

Every notice sent is recorded against the seat hand-over with its recipient,
subject and body, and shows in the booking's history. No payment reference ever
appears in a notice or a log line.

## Selling through the WhatsApp bot

Seats assigned to the bot are sold to individual and group customers.

- **Price is per seat and all-inclusive** (fare, taxes and margin together),
  editable in this system at any time. Bot margin per seat = price − fare −
  airline tax.
- The bot **holds** seats while the customer pays. A hold lasts **at most 8
  hours**; after that the seats are back on sale and a payment reported late is
  refused — the customer books again.
- The bot reports the payment; that makes the booking **sold**. A sold booking is
  **final**: it cannot be cancelled or returned through the API, and there are no
  partial cancellations.
- The bot sends **no customer data** — seat counts only.

## Out of scope, still (do not build)
Ticket loss tracking and penalty EMD calculations (the rule where >25% unsold
seats after ticketing triggers a penalty, with no penalty under 10% cancelled).
The selling side coming into scope does not bring these with it.
