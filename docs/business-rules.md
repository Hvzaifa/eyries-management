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
new booking is created with. Once rounds exist it is **the latest round's
deadline** — each EMD secures the PNR to a new time limit, so issuing round 2
meets round 1's whether or not round 1's refund has been recorded (corrected
2026-09-28; it used to follow the earliest round still `issued`, which called
such bookings overdue).

### What the dashboard lists, and the Refunds page (owner, 2026-09-28)

The dashboard is kept to work still to be done there: **active bookings with an
EMD still to issue, an IATA payment not yet recorded, or a paid EMD whose refund
is not due yet** (`isDashboardWork` in `src/lib/dashboard.ts`; the third since
Phase 9 Step 3). ~~A round that is **issued, paid to IATA and not yet refunded**
is listed on the Refunds page under **To be refunded**.~~ *(Superseded
2026-10-28, Phase 9 Step 3 — see "To be refunded" below.)* The page's other
button, **Refunds recorded**, is the refund log. Cancelled and completed
bookings appear on the dashboard when the status filter asks for them, and the
search box finds any booking.

### To be refunded (Phase 9 Step 3, A6; owner, 2026-10-13 and 2026-10-28)

A round is listed on the Refunds page under **To be refunded** when it is
**paid to IATA** (recorded, or assumed from a passed remittance day) and its
booking's refund is **due** (`refundTiming` in `src/lib/refunds.ts`):

- **every ticket is issued** — tickets issued ≥ seats, from the count staff type
  under Ticketing today (owner, 2026-10-28: use it now; Step 4's "All tickets
  issued?" replaces how it is entered), or
- the **ticket issuance deadline passed at least a day ago** (deadline earlier
  than today), or
- the booking has **no ticket deadline** and its **outbound date has passed**
  (owner, 2026-10-28). Until then it stays on the dashboard, flagged "No ticket
  deadline — add one under Ticketing". No date is guessed.

Until it is due, a paid EMD **stays on the main dashboard**. Rounds not paid to
IATA are never listed. A blank ticket count never counts as all issued. Later,
forfeited rounds also go on the list once the penalty is marked paid (Step 5).

**The system only flags.** A person marks the rounds **refund requested**:
- a branch on its own bookings, Head Office on any;
- only a round on the list, from the list (several bookings at once) or from the
  round on the booking page;
- it can't be undone: a requested round never goes back to `issued`, and the
  Edit round form can't set or undo it.

A requested round **stays on the list, labelled "Requested"** (a filter picks
To request / Requested) until **Head Office records the refund**, singly or in
bulk, which accepts `issued` or `refund_requested` rounds.

A requested round is **no longer money held**: it leaves the dashboard's EMD
Issued figure and the "currently holding" figure behind agents' EMD shares, so
an agent's share drops as soon as a round is requested. For IATA it is
unchanged — a request is not a refund, so it neither rolls a bill nor
cancels a payment.

### Two EMDs, then tickets (owner, 2026-09-28)

The policy has two EMDs. Once two rounds exist, **no 3rd or 4th EMD is
suggested** anywhere — one exists only if staff create it. What remains is
issuing the tickets, and the system keeps no record of whether tickets have
been issued, so that deadline is shown **for information only**: grey, never
red or amber, not in the "needs attention" banner, not in the daily EMD alert.
The rule is `nextStep()` in `src/lib/issuance.ts`.

### EMD-2 auto-generation (owner rule, 2026-08-24 — Phase 3 scope)

The 2nd EMD must only auto-generate **after staff verify the airline's email confirmation** of the 1st EMD, and its percentage then follows the SV policy table above. This is gated on the Phase 3 email infrastructure (sent-log + a verified-confirmation state) — it is intentionally **not** built during Phase 1; until then, round 2 is added manually.

## What happens if a deadline is missed with no extension requested

The PNR is marked **"at risk — confirm with airline"**. ~~The system never automatically marks a PNR as cancelled — only a human, after confirming with the airline, changes status to cancelled.~~ *(Superseded 2026-10-13/14: before EMD-1 a person **releases** the booking — below; after it, ~~cancellation becomes automatic in Phase 9 Step 5~~ a missed EMD-2 or ticketing deadline is **flagged and a person cancels** — owner, 2026-10-28; see "Cancelled".)* The software reflects reality; it doesn't decide it.

## Released (Phase 9 Step 2; rulings A2 and B3, 2026-10-13)

A booking that ends **before EMD-1 is issued** is **released**, not cancelled:
deliberately, or because the EMD-1 deadline was missed. **Cancelled** now means
the EMD-2 or ticketing deadline was missed and a person cancelled it (Step 5).

- **Who:** a branch may release its own bookings; Head Office may release any.
- **Refused** once any EMD round exists (Head Office too), when the booking is
  not active, and when **any agent has paid anything on it** (owner,
  2026-10-20). Paid seats can no longer be taken back (2026-10-23), so a
  payment now always sits on seats the agent still holds.
- **A reason is required.** It is written to the change history in the same
  transaction, where Head Office reads it.
- Agents still holding seats lose them with the release; each is logged.
- **It cannot be undone.** The edit form cannot move a booking out of
  `released`, and no EMD can be issued or seat assigned on it.
- **Flag, don't act.** An active booking whose EMD-1 deadline (`pnr_tl_date`)
  has passed with no EMD shows **"At risk — confirm with airline"** on the
  dashboard and the booking page. A person releases it; the system never does.
  The deadline day itself is not yet "passed".
- **The edit form sets only active or completed** (owner, 2026-10-20). Released
  needs the Release action; cancelled needs the Cancel action on a flagged
  booking (Step 5). The form can move a booking out of neither.
- A released booking counts nowhere that only active bookings count: the
  dashboard work list, alerts, EMD issuance, IATA dues and agent money. The
  dashboard's status filter lists it.

## Cancelled (Phase 9 Step 5; B3, 2026-10-13/14; owner, 2026-10-28)

~~The daily job cancels a PNR automatically~~ *(owner, 2026-10-28, reversing
2026-10-14: the daily job never cancels).* The system **flags** a booking and a
person decides.

**The flag — "Cancellation review"** (dashboard and booking page; the daily
email is unchanged). Only an **active** booking **created on or after
29 Oct 2026** (Pakistan time; owner: "created from tomorrow") — every earlier
booking, imported or entered, is never flagged:
- **EMD-2:** EMD-1 is the only EMD issued, covers less than 100%, and the
  deadline recorded on EMD-1 has passed (the day itself is not yet passed);
- **Ticketing:** the EMDs are complete — EMD-2 issued, **or EMD-1 covering
  100%** (owner, 2026-10-28) — the ticket issuance deadline has passed, and
  staff **recorded that no tickets were issued** (remaining = every seat). A
  blank count never flags; partial ticketing never flags.

**A rolled round and its re-issue count as one EMD for the flags** (owner,
2026-10-28): a round refunded inside its IATA billing window to move the bill is
the same EMD as the round that re-issues it, so a re-issued EMD-1 numbered
round 2 is not EMD-2. If the re-issue carries no deadline, the rolled round's at
the same percentage stands for it. **The booking page and dashboard still show
and count every round.**

**Deciding.** A branch on its own bookings, Head Office on any (as release),
with a **reason**. Only a flagged booking can be cancelled — there is no other
manual cancellation. **It can't be undone.** If staff keep it active, the flag
stays until its cause goes away (EMD-2 issued, or a ticket count recorded).

**On cancellation** (one transaction, each change logged with the flag that
fired and the reason):
- every round the airline still holds — `issued` or `refund_requested` — becomes
  **`forfeited`** ("the whole PNR is forfeited"). A refunded round keeps its
  refund; a rolled one is only the earlier record of an EMD whose re-issue is
  forfeited;
- `penalty_paid` is set to **No**;
- agents keep their seats on record; no seat can then be assigned, moved, taken
  back or re-priced.

**Forfeited** rounds are not money held (they leave EMD Issued and agents' EMD
shares) but are still owed to IATA on the calendar as before. **Penalty paid**
(Head Office): once **Yes**, the forfeited rounds **paid to IATA** go on "To be
refunded" (labelled "Forfeited · penalty paid", their own filter) and Head
Office records their refund directly; they are not requested. A forfeited round
cannot be refunded, or changed in the Edit round form, before then. The switch
can go back to No until one of them has been refunded.

**Penalties** are entered as in Step 4 — each agent's (`penalty_amount`) and
the company's (`company_penalty_amount`), each with its penalty EMD's license —
from the moment the booking is cancelled (Head Office, or a branch on its own).

**Agents** (B3; owner, 2026-10-14 and 2026-10-28):
- they owe **only their penalty** — not their fare, terms, or the unpaid rest of
  their EMD share; no margin is earned;
- paid **less** than the penalty: they **owe the difference** (undated);
- paid **more**: the rest is **paid back** — paid − penalty − paybacks so far;
- nothing is paid back while the penalty is **blank** (blank is not zero; enter
  0 for none);
- **Head Office records each payback** (`agent_paybacks`: amount, date,
  optional reference), in parts if needed, **never more than is owed back**;
  amount and date go to the history, never the reference;
- cancelled bookings **now count on the agents pages** (reversing 2026-10-05),
  showing what is owed or "to pay back".

## EMD vs ticket payment — keep these separate

- **EMD** = a guarantee deposit that the seats are held. Base fare only, no taxes.
- **Issuing an EMD and paying it are two different events.** Issuing it secures
  the PNR with the airline. Paying it is an obligation to IATA, falling due on
  the remittance day of the billing period the EMD was issued in — see "Paying
  IATA" above.
- **Ticket payment** = the actual payment when tickets are issued (base fare + taxes). This happens after EMD rounds are done, in the `ticketing` stage.
- After ticket payment is made, the company requests a refund of the EMD amount from the airline. This is recorded as `refund_amount` / `refund_date` on the relevant `emd_rounds` row.
- **Do not attempt to reconcile or net EMD refunds against ticket payments in this system.** Record both as facts. Reconciliation is an accounting question, not a v1 feature — revisit only if explicitly asked.

## EMD round status (owner ruling, 2026-09-21; Phase 9 Step 3, 2026-10-28)

`issued` → `refund_requested` → `refunded`. A round is **issued** — which is
what secures the PNR — until a refund is requested or recorded. There is no
separate refund table; see data-model.md. ~~Two values only.~~ *(Superseded by
A1: `refund_requested` is back — see "To be refunded" above.)*

`paid` and `expired` were removed (`refund_requested` too, until Phase 9 Step 3
brought it back). Payment is **not** a
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

Once the billing window closes the EMD has been billed. **A refund can be
claimed at any time** (owner, 2026-10-04), but only one inside the billing window
moves the bill. That is the edge case the company uses to shift a remittance
date. A refund after the window never changes the payment: it **still falls due
in full on the calendar's remittance day**, and the refunded amount is credited
on a later cycle's remittance day. The owner's example: an EMD due 30 Sep and
refunded 28 Sep is still paid on 30 Sep, with the refund credited in the next
cycle. The system does not show that credit (owner's choice, 2026-10-04). It
records the refund and counts it in Total Refunded.

**Total Refunded leaves out in-window refunds** (owner, 2026-10-03): no money
ever left, so none came back. Every other refund counts, because the payment
went out and the money returned (`refundCounts()` in `iata-payments.ts`). On
the live data this took Total Refunded from PKR 740.4M to PKR 120.3M: 400
in-window refunds of PKR 620.2M had been counted. Total EMD Value (seats ×
fare) and EMD Issued (rounds still held) were never affected.

### What is owed

A round is owed to IATA only while its **remittance day is today or ahead** and
nothing settles it. It stops being owed when:

- **paid** — a payment date is recorded;
- **its remittance day has passed** — read as **paid on that day (assumed)**
  (owner, 2026-10-03). Staff pay IATA on time but rarely record it, so a passed
  day is never shown as overdue. This is worked out live, never written to the
  database. Recording the real date replaces the assumption, and the booking
  page offers "Record payment date" for it;
- **refunded on or before the billing-to date** — rolled: the billing was
  cancelled and the bill moved to the round that replaced it. Chasing both would
  count it twice;
A refund **after the billing-to date** does not stop a round being owed. It stays
payable on its remittance day and then reads as paid (assumed) on that day, like
any round. A refund with **no recorded date** can't be placed against the
window, so it is treated the same way. Both are listed on the IATA page under
"Refunded but still payable". **Dates always come from the IATA calendar.** An
assumed payment is always dated on the remittance day, never moved by a
refund. An EMD issued **outside the loaded calendar** has no
remittance day, so it stays owed and undated until the calendar is loaded.

An assumed payment counts as paid everywhere a recorded one does:
- it leaves the dashboard and the IATA page;
- it appears on the Refunds page's **To be refunded** list, marked "assumed";
- it is pre-ticked in bulk refund.

`iataPaymentState()` is the one place that decides. Every query filters on its
verdict, never on `status` or on `payment_date` alone.

### The IATA page, by license (owner, 2026-09-29)

The IATA page has one button per license, plus **All licenses**, which is what
the page opens on. Clicking a license narrows **everything** on the page to that
license's EMDs: the three cards (outstanding, EMDs awaiting payment, next
settlement), the settlement groups by remittance day, and both warning boxes
(refunded too late; outside the loaded calendar). **Every license gets a
button**, including those owing nothing, which show "Nothing outstanding".

**Which license an EMD falls under:** the round's own `license_id`, the license
that actually paid for it, and **when that is blank, the booking's**. Every
imported round has none, so today each EMD sits under its booking's license. A
booking whose rounds were paid by different licenses shows each round under its
own. A **No license** button appears only if an owed EMD has neither, so nothing
owed can drop out of every button: the licenses always add up to the whole.

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
its *first* EMD; after round 1 it is the time limit round 1 secured; after the
2nd EMD there is no EMD deadline, and the column reads "2 EMDs issued · Tickets
by …" in grey (see "Two EMDs, then tickets").
The dashboard's **Next Deadline** column shows that date and, underneath it,
**which** EMD is due — "1st EMD", "2nd EMD" — with what the policy says it is
worth.

> This corrects a display that read "No issued round" for a booking that had
> never had an EMD (owner, 2026-09-23). That is precisely the booking with work
> outstanding, and its first EMD might be due tomorrow. The same date now also
> drives the "needs attention within 2 days" banner, which previously counted
> only bookings that already had a round.

### The "EMDs To Issue" card

Pick **one day or a range** from the calendar (2026-09-29; it was one date
until then) and the card totals **the deposits to be issued in those days** —
`seats × fare × the next round's policy percentage` — and the table narrows to
the bookings behind it. It answers "how much money do I need ready on the
20th", which is not the same question as the booking's total EMD value.

- **The picked days exactly, both ends included**, never "on or before". A
  single day is one day's work; anything overdue from an earlier date stays
  under its own date. In the calendar, the first click picks a day and a second
  click makes it a range; days with EMDs due are dotted.
- **Blank until something is picked.** A total with no date against it would be
  a different question answered.
- **Only active bookings.** A cancelled or completed booking has no EMD to
  issue, whatever date it still carries.
- **An amount that cannot be derived is counted, never assumed to be zero.**
  Where no airline policy covers the booking, staff type the figure when they
  issue it, and the card says how many such bookings are in the day rather than
  reporting a total that is quietly short.

The card and the rows beneath it are filtered by the same function, so they can
never disagree about which bookings a date or range covers (`matchesIssuanceRange`).

## Splits (Phase 9 Step 6; A3/D1; owner, 2026-10-29)

~~An agent may only want part of a PNR's total seats. When that happens, a child PNR record is created (`parent_pnr_id` set), and an `allocations` row records how many seats moved.~~
~~**`pnrs.seats` is the number of seats that PNR still holds** — the split decrements the parent at the moment it happens.~~
*(Superseded 2026-10-29: a split is no longer a separate booking.)*

A **split** is part of a booking's seats flying on other dates, kept **inside
the booking** (`pnr_splits`), shown on the booking page like the agents' seats.
It **creates no booking and no dashboard row**; the dashboard shows a note under
the PNR ("Split: 15 seats · 9XYZ12 · out …"), and search finds the booking by a
split's code.

- **SV only.** Head Office on any booking, a **branch on its own**, including
  after EMD-1 (A3). Only an active booking.
- **Seats:** from **one holder** — one agent's seats, or the company's
  unassigned seats, never both. An agent's split seats stay theirs on the same
  terms, so their money is still **one deal** (one total, one set of payments).
  The booking **keeps its full seat count** (a 30-seat booking with 15 split
  still has 30). Seats in a split cannot be taken back, moved, or (the company's)
  assigned to an agent until the split is removed; the booking's seats cannot be
  reduced below what is split.
- **What it records:** seats, an **optional new PNR code** (unique across
  bookings and splits, ignoring case and spaces), its **outbound and inbound
  dates** (dates only — same flights, times, fare and baggage), its own **ticket
  issuance deadline** (SV pre-fills its outbound − 3; required; not after its
  outbound) and its own **"All tickets issued?"** answer. A split with the
  booking's own dates and no new code is refused (it records nothing).
- **EMDs:** **one set for all seats.** The booking's rounds cover the split; no
  round is recalculated or copied.
- **Ticketing:** the booking's own answer covers its **seats not in a split**;
  each split answers for its own.
- **Refund timing:** the booking's paid EMDs go on "To be refunded" only once
  **every part** is done — the day after the **latest** ticket deadline among the
  booking and its splits, or once every part has all tickets issued.
- **Unissued seats, penalties and the "no tickets issued" cancellation flag**
  are judged for the **whole booking**: unissued = remaining on the booking +
  on its splits, once every part's ticketing has closed and every part has a
  count; SV's 10% is of all the seats; one penalty entry, opening once every part
  has departed. The flag needs every part past its deadline with no tickets.
- **Editing:** a split's dates, code, ticket deadline and ticket answer can be
  edited; its seats and holder cannot. It can be **removed** (seats back on the
  booking) until a ticket count is recorded on it. Every change is logged on
  the booking's history.

The old child-booking model's `pnrs.parent_pnr_id` and `allocations` are
superseded and no longer read or written (both were empty).

> Superseded wording: this rule previously read "the calculated total minus everything allocated to children", which described a model where the parent kept its original total. The project owner replaced that on 2026-09-01 (a 30-seat parent split by 10 shows 20 seats). Applying both at once double-counted every split — see `docs/decisions.md`, 2026-09-07.

## Entering a booking (owner rulings, 2026-09-20)

The imported spreadsheet is **history to read, not the standard to build to** —
the data is being re-entered cleanly. Several rules that were lenient only
because the sheet was messy are now enforced for everything entered from here on.
The imported rows stay exactly as they are.

| Rule | Was | Is |
|---|---|---|
| **PNR code** | duplicates allowed with a warning | **unique**, compared ignoring case and spacing. Entering an existing code is refused, including for a child PNR from a split |
| **Segment** | free text with autocomplete | a fixed list: **Umrah, One Way, Tour** (Employment was replaced by One Way, and its 275 bookings renamed, on 2026-10-20) |
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

### Flight times and the ticket deadline (Phase 9 Step 1, 2026-10-20)

These apply to every booking **entered in the app**: the booking form, an AI
draft or a spreadsheet upload confirmed through it, or a split. They apply on
creation and on every later save (owner: "bookings made from UI"). Such a booking
has a `created_by`; imported bookings have none and stay as they were. (The 1,599 imported bookings were deleted on 2026-10-23, so from then on every booking is entered in the app.)

- **Every flight time is required:** departure and arrival on each flight, and
  arrival and departure at each stop (A4). *Supersedes "flight times optional"
  (2026-09-26) for these bookings; imported bookings keep optional times.*
- **Every date is required:** the arrival date of each flight, and the arrival
  and departure dates at each stop, **even when it is the departure day**
  (owner, 2026-10-20). They are saved exactly as entered. A landing at an
  earlier time than the moment before on the same date (JED 18:10 → ISB 01:10,
  dated the 30th) is allowed, since it happens flying west, but the form warns
  that after midnight it is the next day. On a typed booking the boxes start
  empty; a draft or upload fills them.
- **On every booking, imported ones included:** no date may be earlier than the
  one before it, a stop cannot be left before it is reached on the same date,
  and the return cannot depart before the outbound flight lands.
- **A ticket issuance deadline is required** (A6), and it may **not be after the
  outbound departure date** (owner, 2026-10-20). For SV the form fills in
  outbound − 3 days, which staff may change. It cannot be cleared later under
  Ticketing, and an edit cannot move the departure date before it.
- **Uploads never read an arrival date from the sheet** (owner, 2026-10-20). The
  export's dates were wrong on about 1 sector in 5. The upload works the date
  out instead and always fills it: the next day when a flight lands at an
  earlier time than it left (marked for the reviewer to check), otherwise the
  departure day. With no times in the sheet it stays empty for the reviewer.


## Ticketing stage

Two deadlines are tracked per booking in `ticketing`: the **name update deadline**
and the **ticket issuance deadline**. Both are staff-entered, and both feed the
same daily deadline alert as EMD rounds — same window (today through +2 days),
same exclusions (never a cancelled or completed PNR, never a date that has not
been recorded, never an overdue one).

### Saudia (SV) ticket-issuance policy (owner rule, 2026-09-17)

SV requires tickets to be issued **72 hours before departure**, applied as
`outbound_date − 3 days` (calendar days, not 72 hours from the departure time;
reaffirmed A4, 2026-10-13). ~~A new SV booking is created with that deadline
already recorded~~ *(superseded 2026-10-20: every new booking enters its ticket
issuance deadline on the form, and for SV the form pre-fills this date).* The
ticketing form pre-fills it when the field is empty. **Staff can always
overwrite it**, like every other policy default.

Airlines other than SV have no stored ticketing policy: staff enter both
deadlines themselves, exactly as with EMD percentages.

### Who edits ticketing (Phase 9 Step 4; owner, 2026-10-28)

Head Office on any booking, a **branch on its own bookings** — the whole form
(deadlines, status, ticket count), **at any time**. The booking's EMD-1 edit lock
does not apply here: every booking reaches ticketing after its EMDs. Penalties
for unissued seats follow the same rule.

### Ticket counts — "All tickets issued?" (A8, Phase 9 Step 4)

~~`balance_tickets` = `seats − tickets_issued`, calculated, never typed (owner
rule, 2026-09-19).~~ *(Reversed by A8, 2026-10-13, built 2026-10-28.)*

Staff answer **"All tickets issued?"**:
- **Yes** — nothing remains (`balance_tickets` = 0, `tickets_issued` = seats), and
  the booking's paid EMDs go on **To be refunded** straight away;
- **No** — staff type **how many tickets remain** (1 to the seats);
  `tickets_issued` is worked out as `seats − balance_tickets`. "No" with 0
  remaining is refused: answer Yes;
- **not answered** — both blank. **Blank is never zero.**

If the **seats change** after a count is recorded, **tickets issued stays
fixed** and the remainder is recalculated (owner, 2026-10-28); seats cannot go
below the tickets already issued.

### Unissued seats after ticketing (A9, A10, Phase 9 Step 4)

~~Once the ticket issuance deadline has passed, any seats still unissued are
considered cancelled.~~ *(Superseded by A9/A10, built 2026-10-28.)*
**Partial ticketing never cancels the booking.**

Ticketing **closes** the day after the ticket issuance deadline (a booking with
no deadline: the day after its outbound date — the reading given for such
bookings on 2026-10-28). From then the booking page reports the unissued seats:

- **SV (A9):** up to **10% of the seats, rounded down**, may go unissued without
  a penalty (25 → 2, 30 → 3, 9 → 0). Beyond that the page says the limit has
  been passed and the airline's penalty applies.
- **Other airlines (A10):** every unissued seat is set for a **manual
  penalty**.

**Entering the penalty** (owner, 2026-10-28) opens once the **outbound date has
passed and a penalty is called for** (SV beyond its 10%, or any unissued seat on
another airline). Head Office on any booking, a branch on its own. Staff enter
**amounts only** — whose seats went unissued is not recorded:
- one amount for **each agent** on the booking (`agent_assignments.penalty_amount`),
  **added to what that agent owes** but **never to margin** (it passes to the
  airline, like tax). It sits in the agent's balance under the balance's usual
  due date, so it shows as **overdue** until paid;
- one amount for the **company's own seats** (`ticketing.company_penalty_amount`),
  only while the company holds seats;
- each with the **license its penalty EMD was issued against**, required
  whenever an amount is entered (2026-10-14).

Blank means no penalty; zero is accepted (a waived penalty). Every change is
logged. The ledger (Phase 10) will post entry 3 from these.

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
- ~~A split takes seats **from unassigned only**.~~ A split takes seats from
  **one holder** — one agent or the company's unassigned seats — and they stay
  with that holder (Phase 9 Step 6).
- Seats can be reclaimed from the bot only while they are neither sold nor held.
- Head office can move seats from one agent to another; a branch cannot.
- **Paid seats stay with the agent** (owner, 2026-10-23). Once any payment is
  recorded against an agent's seats on a booking, none of that agent's seats
  there can be taken back or moved to another agent. Deleting a payment
  recorded by mistake (Head Office) frees them again.

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
   agent twice. A `refund_requested` round does not count either (Phase 9
   Step 3, A1): the share drops when the round is requested. So:
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

**Owed on bookings not yet in the system** (owner, 2026-10-29). Where an
agent's balance in the Branch-Wise Client Ageing Report was larger than every
booking the system holds for them, their bookings in the system were recorded
as fully recovered and the excess is stored on the agent
(`agents.unbooked_balance`), with the receivable it was measured against. It is
**included in the agent's balance left** on the Agents pages and named
separately ("incl. … on bookings not yet in the system"). As the missing
bookings are added, their receivable **comes out of the excess**, so the
balance stays the same until the excess is used up; after that new bookings add
to the balance as normal. Measured across every branch, so a branch sees the
same figure Head Office does. Worked out live (`unbookedRemaining`), never
rewritten.

**Recoveries** are the payments received from agents. Outstanding = total −
recoveries, always calculated. A recovery is money that arrived, so it is
positive and cannot be dated in the future; a payment recorded by mistake is
**deleted by head office** (and the deletion is recorded) rather than cancelled
out by a negative entry. Paying more than the balance is allowed and shows as
**credit**, which is the same credit rule 13 describes when a round is refunded
and re-issued.

### The Agents pages (owner, 2026-10-05)

**Seat types come from the booking's segment:**

| Seat type | Segment | Meaning (owner) |
|---|---|---|
| **Umrah** | Umrah | return seats, Saudi Arabia only |
| **One way** | One Way (Employment until 2026-10-20) | no return; Saudi employment or any destination |
| **Tour** | Tour | return seats, any destination except Saudi Arabia |

A segment outside the list shows as "Other", and only when present.

**What each figure is:**
- **Receivable** is the agent total above (seats × fare + charge − discount + ticked tax).
- **Group seats recovery** is the payments received.
- **Balance receivable** is the outstanding amount, summed booking by booking. An overpayment shows as credit and is not netted against another booking.
- **Only active and completed bookings count.** An agent can still owe after travel. Cancelled and released bookings are left out.

**An agent's page** has two views, switched by buttons:
- **All PNRs combined** (the default): seats and receivable per type, total receivable, recovered, balance.
- **By PNR**: the same per booking, with the agent's share of each EMD round folded under each row, and the notice button.

**The Agents list** shows the same totals for every visible agent, then one row per agent: seats, receivable, recovered, balance. Contacts and the B2B code are on the agent's page.

**Who sees what:**
- **Head Office** sees every agent and every booking, plus **margin**, which is Head Office only.
- **A branch** sees the agents holding seats on its own bookings (plus any agent it created), with **figures from its own bookings only**: Karachi never sees Rawalpindi's recovery. Both are enforced in the query.
- **Sending notices:** a branch may send a payment notice for its own bookings, even to an agent Head Office created. Editing the agent's record stays with whoever created it.
- **Assigning seats:** who a branch may hand seats to (`agentVisibilityFilter`) is unchanged.

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
~~Ticket loss tracking and penalty EMD calculations (the rule where >25% unsold
seats after ticketing triggers a penalty, with no penalty under 10% cancelled).
The selling side coming into scope does not bring these with it.~~
*(Superseded by A9/A10, 2026-10-13, built in Phase 9 Step 4: see "Unissued seats
after ticketing". Penalties are entered by staff, never calculated.)*
