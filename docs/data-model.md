# Data Model

This is the full, confirmed field list. Nothing outside this document should become a database field without first being added here and logged in `decisions.md`.

The runnable version of this is `db/schema.sql` — treat that as the source of truth for exact types; this file is the source of truth for *meaning*.

## `licenses` (lookup table)
The supplier account the deal is booked under. Admin-editable dropdown, not free text. The list is in `prisma/seed.ts`.

| Field | Type | Notes |
|---|---|---|
| code | text, unique, nullable | The supplier code from the owner's `suppliers.xlsx`, e.g. `TA-ISB-BSP`, `TF-BSP` (2026-10-20). **Shown wherever a license is shown**, like a branch code; dropdowns show "code — name" |
| name | text, unique | The full name the owner gave, e.g. `Travel Advisor Islamabad`, `Time 2 Fly`. Equal to the code where none was given (`TU-PIA (PSA)`, `SIX SIGMA`) |

An upload may write either; both are matched (`matchLookup`, `src/lib/lookups.ts`).

## `branches` (lookup table)
City office that holds/requested the PNR (e.g. Rawalpindi, Islamabad, Peshawar, Faisalabad). Admin-editable dropdown.

| Field | Type | Notes |
|---|---|---|
| name | text, unique (case-insensitive) | The full name, e.g. `Rawalpindi`. **A branch login is matched on this** (`app_metadata.branch_name`), ignoring case |
| code | text, unique, nullable | e.g. `RWP`, `STH-LHE` (owner, 2026-10-19). **Shown wherever a branch is shown**; the name is the fallback for a row without one. The 21 branches and their codes are listed in `prisma/seed.ts` |

## `airlines` (lookup table)
Code, name, contact email(s) for sending deposit-confirmation / extension-request emails.

Names follow the owner's supplier sheet (`suppliers.xlsx`, Airlines tab) exactly, e.g. `Emirates-(EK)`; PIA is stored under its IATA code `PK` (2026-10-19). The list is in `prisma/seed.ts`.

## `pnrs` (the core table)

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| sr_no | serial | Shown to staff, auto-incrementing |
| request_date | date | |
| investor_company | text | **No longer entered** (2026-09-20). Every new booking is stamped `COMPANY INVESTMENT`; who holds the seats is the seat ledger's answer. Imported rows keep the name the sheet recorded, shown read-only, and an edit never rewrites it |
| license_id | fk → licenses | |
| branch_id | fk → branches | |
| parent_pnr_id | fk → pnrs, nullable | ~~Self-reference. Set = this is a child of a split.~~ **Superseded 2026-10-29** (Phase 9 Step 6): splits live in `pnr_splits` inside the booking. Unused, always null; may be dropped later |
| pnr | text | The airline's booking reference. **Unique from 2026-09-20**, compared ignoring case and spacing — enforced in the app until the imported rows are cleared, then as a unique index (see `src/lib/booking-entry.ts`) |
| gds_pnr | text, nullable | Free text for now — only used when an agent books directly via GDS instead of through the company (see decisions.md) |
| segment | text | Travel purpose. **A fixed list from 2026-09-20: Umrah / One Way / Tour** (Employment until 2026-10-20, when it was replaced and its bookings renamed) (it was free text while the imported sheet's values were inconsistent). Stored as text so an imported value outside the list stays readable and editable |
| airline_id | fk → airlines | |
| seats | integer | |
| outbound_date | date, nullable | **The outbound flight's departure date** (on a one-way trip, the only flight's). Drives the EMD policy and SV ticketing deadline |
| inbound_date | date, nullable | **The inbound (return) flight's departure date.** Always null on a one-way trip |
| sector | text | e.g. "ISB-JED-MED-ISB". **Built from the flight cities, never typed** (2026-09-26); **stops are included** (2026-09-28), so ISB→DXB→JED reads ISB-DXB-JED: one way `ISB-JED`; round trip the outbound pair then the inbound pair, with the inbound departure dropped when it equals the outbound arrival (`ISB-JED-ISB`). Kept as a column because every email, table and the refund view reads it |
| trip_type | enum('one_way','round_trip'), nullable | Added 2026-09-26. Null only on bookings saved before flight details existed; the edit form asks for it |
| outbound_departure_city, outbound_arrival_city | text, nullable | 3-letter airport codes, uppercase. Required by the form |
| outbound_departure_time, outbound_arrival_time | time, nullable | Local times as printed on the booking. **Required on a booking entered in the app** (`created_by` set; Phase 9 Step 1, 2026-10-20). ~~Optional~~, which still holds for imported bookings |
| outbound_arrival_date | date, nullable | **The day the outbound flight lands** (Phase 9 Step 1), saved as entered — **the departure day too, never left empty** on a booking entered in the app (owner, 2026-10-20). Null only on imported bookings. Never read from an upload: worked out from the times |
| outbound_flight_code | text, nullable | e.g. `SV727` — designator + number, uppercase, no space. Required by the form |
| inbound_departure_city, inbound_arrival_city | text, nullable | As outbound. Required on a round trip; null on one way |
| inbound_departure_time, inbound_arrival_time | time, nullable | As outbound: required on a booking entered in the app (2026-10-20); ~~optional, like every flight time (owner, 2026-09-26)~~ still true of imported bookings |
| inbound_arrival_date | date, nullable | As `outbound_arrival_date`, against `inbound_date` |
| inbound_flight_code | text, nullable | Required on a round trip; null on one way |
| outbound_baggage_pieces, inbound_baggage_pieces | integer 0–10, nullable | **Checked bags per passenger** on that flight (2026-09-26). Optional. `0` means no checked bag. One way uses the outbound pair; inbound is null |
| meal_included | boolean, default false | Meal included in the package — **for the booking as a whole, not per flight** (2026-09-28) |
| outbound_baggage_kg, inbound_baggage_kg | integer 1–100, nullable | **Weight limit of each bag**, in kg — "2PC 23KG" is pieces 2, kg 23, i.e. 23 kg per bag, not in total. Optional, and may be set without a piece count (weight-concept allowances like "30KG") |
| pnr_tl_date | date, nullable | PNR time-limit / void date |
| airline_taxes | numeric, nullable | |
| psf | numeric, nullable | **No longer entered** (owner, 2026-10-20). A new booking is bought on company investment and stores none; PSF is charged only to agents, through their charge or discount (`agent_assignments`). Kept for the bookings that already carry one, and editable only on those |
| fare | numeric | Per-seat base fare |
| total_emd_value | numeric, generated | = seats × fare (excl. tax & PSF). **Calculated by the system, never typed in.** |
| penalty_paid | boolean, nullable | Phase 9 Step 5 (B3): whether the airline's penalty on a **cancelled** booking is paid. Set to false on cancellation, null otherwise; Head Office switches it. Once true, the forfeited rounds paid to IATA go on "To be refunded" |
| status | enum('active','released','cancelled','completed') | `released` added 2026-10-20 (Phase 9 Step 2, A2): the booking ended **before EMD-1**, set only by the Release action with a reason (kept in `activity_log` as `releaseReason`), never undone. `cancelled` = the EMD-2 or ticketing deadline was missed; flagged, and set by a person with the Cancel action and a reason (`cancelReason`, `cancelTrigger` in `activity_log`), never undone (Phase 9 Step 5; ~~automatic~~ owner, 2026-10-28). The booking form sets only `active` / `completed` |
| raw_airline_text | text, nullable | Original pasted airline message from AI intake (Phase 2). Only populated for PNRs created via the AI parse flow. |
| created_at, updated_at, created_by | | |

## `flight_stops` (2026-09-28)

Stops on a connecting flight — one row per stop. A new table rather than columns because a flight may have several.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| pnr_id | fk → pnrs, cascade | |
| leg | enum('outbound','inbound') | A one-way trip uses `outbound` |
| position | integer 1–3 | Order along the flight |
| city | text, 3 uppercase letters | The stop's airport code |
| flight_code | text, nullable | The **onward** flight from this stop — the aircraft may change there. Null = the same flight continues |
| arrival_time, departure_time | time, nullable | Local times at the stop. Required on a booking entered in the app (Phase 9 Step 1) |
| arrival_date, departure_date | date, nullable | The day the stop is reached / left (Phase 9 Step 1), saved as entered, **required on a booking entered in the app even on the departure day** (owner, 2026-10-20). Null only on imported bookings. A split moves them with the child's new departure date |
| created_at | | |

Unique on (pnr_id, leg, position). An edit replaces a booking's stops as a set and logs each flight's before/after as one line (`outboundStops` / `inboundStops`). A split copies them to the child. RLS enabled like every other table.

## `emd_rounds` (open-ended — no fixed limit on round count)

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| pnr_id | fk → pnrs | |
| round_number | integer | 1, 2, 3... no upper limit |
| issuance_date | date | |
| issuance_time | time, nullable | Time the EMD was issued. When a round is saved without an explicit deadline time, the deadline time defaults to this (see decisions.md, 2026-09-07) |
| payment_pct | numeric | See business-rules.md for the round-1 auto-suggestion rule |
| emd_number | text, nullable | Airline's reference. The UI requires it for new rounds: 13 digits, formatted `123 4567890123` |
| emd_amount | numeric | |
| deadline_date | date, nullable | **An ISSUANCE deadline, never a payment one** (2026-09-21): the time limit this EMD secures the PNR to, by which the next EMD — or the tickets — must be issued. Nullable only because imported rounds have no recorded time limit. **Every round created or edited in the app requires one** (2026-08-24, reaffirmed 2026-09-20) |
| deadline_time | time, nullable | |
| status | enum('issued','refund_requested','forfeited','refunded') | `issued` → `refund_requested` → `refunded` (Phase 9 Step 3, A1, 2026-10-28). **`forfeited`** (Step 5): set on every held round when the booking is cancelled; not money held; refundable (by Head Office) only once `pnrs.penalty_paid` is true; never set or undone in the Edit round form. ~~Reduced to two values on 2026-09-21: `paid`, `refund_requested` and `expired` were removed.~~ *`refund_requested` came back in Phase 9 Step 3; `paid` and `expired` stay removed.* A round is `issued` — which secures the PNR — until a refund is requested or recorded. **`refund_requested`** means a person asked for the refund and Head Office has not recorded it: it is **no longer money held** (left out of EMD Issued and agents' EMD shares) and **never goes back to `issued`**. A branch marks its own bookings' rounds, Head Office any, and only rounds on "To be refunded". Head Office records the refund from `issued` or `refund_requested`. **Payment is not a status** and never was: a paid EMD is still `issued`, because the airline still holds it. `issued` is what counts as "unresolved" for urgency colours and deadline alerts |
| payment_date | date, nullable | **The day this EMD was paid to IATA** (2026-09-22). Null = no payment recorded. A separate axis from `status`, which is why the old `paid` status was wrong. The *deadline* is **not stored**: it is derived from the IATA remittance calendar using `issuance_date` (`src/lib/iata-calendar.ts`), so republishing the calendar moves every figure with it. Head Office only. Null does **not** mean unpaid. From 2026-10-03, a passed remittance day reads as **paid (assumed)** on that day, the calendar date. A refund after the billing window does not settle a round: it stays owed until that day (2026-10-04). That is worked out by `iataPaymentState()`, never written here, and recording a real date replaces it. A round is owed only while this is null, its remittance day is today or ahead, and it was not refunded inside its billing window. See business-rules.md, "Paying IATA" |
| refund_amount | numeric, nullable | Filled only when status = refunded. **May not exceed `emd_amount`** (2026-09-20) |
| refund_date | date, nullable | |
| license_id | fk → licenses, nullable | Which license actually paid for **this round**. Rounds of the same PNR may be paid by different licenses, so this is not inherited from `pnrs.license_id` (see decisions.md, 2026-09-07) |
| created_at, updated_at | | |

The old "EMD REFUND" sheet is **not** a separate table — it's `emd_rounds` filtered to `status = 'refunded'`. Build it as a saved filter/view in Phase 3, not a duplicate table.

## `ticketing`

| Field | Type | Notes |
|---|---|---|
| pnr_id | fk → pnrs | one-to-one |
| name_update_deadline | date, nullable | |
| ticket_issuance_deadline | date, nullable | **Required on a booking entered in the app, and no later than `outbound_date`** (Phase 9 Step 1, A6; owner, 2026-10-20). Entered on the new-booking form (SV pre-filled as outbound − 3 days); changed afterwards under Ticketing, where it cannot be cleared. Null on imported bookings that never had one |
| status | text | |
| tickets_issued | integer, nullable | **Worked out** as `seats − balance_tickets` (Phase 9 Step 4, A8, reversing 2026-09-19). Kept fixed when the seats change later |
| balance_tickets | integer, nullable | **Typed**: tickets remaining, from the "All tickets issued?" answer. 0 = Yes, all issued; null = not answered, never zero |
| company_penalty_amount | numeric(14,2), nullable, ≥ 0 | The airline's penalty on the **company's own** unissued seats (Phase 9 Step 4, A9/A10). Entered by staff |
| penalty_license_id | fk → licenses, nullable | The license the company's penalty EMD was issued against. Required exactly when `company_penalty_amount` is set (database check) |

~~No cancelled-ticket, ticket-loss, or penalty-EMD fields — those belong to the selling side, out of scope for now.~~ *(Superseded 2026-10-28, Phase 9 Step 4: penalty amounts and their licenses are stored here and on `agent_assignments`. There is still no cancelled-ticket field; unissued seats are the remaining count.)*

## `pnr_splits` (Phase 9 Step 6, 2026-10-29)
Part of a booking's seats flying on other dates, kept inside the booking. No
separate booking is created; the booking keeps its full `seats` and its one set
of EMD rounds.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| pnr_id | fk → pnrs | The booking it lives in |
| assignment_id | fk → agent_assignments, nullable | Whose seats: that agent's assignment, or **null = the company's unassigned seats**. One holder per split |
| seats | integer, > 0 | Fixed once made |
| pnr_code | text, nullable | The airline's new code, if any. Stored normalised (no spaces, upper case); unique across splits (index) and checked against bookings in the app |
| outbound_date | date | |
| inbound_date | date, nullable | Null on a one-way booking; never before `outbound_date` (check) |
| ticket_issuance_deadline | date, nullable | Required in the app; SV pre-fills outbound − 3; not after `outbound_date` |
| tickets_issued | integer, nullable | Worked out: seats − balance |
| balance_tickets | integer, nullable, 0–seats | Typed: tickets remaining. 0 = all issued; null = not answered |
| created_by, created_at | | |

Logged on the booking (`activity_log.table_name = 'pnr_splits'`, `record_id` =
the booking). Removable until a ticket count is recorded.

## `allocations` — superseded 2026-10-29
~~How a parent PNR's seats are split across child PNRs/agents.~~ Replaced by
`pnr_splits` (Phase 9 Step 6). Empty and no longer read or written; may be
dropped later.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| parent_pnr_id | fk → pnrs | |
| child_pnr_id | fk → pnrs | |
| seats_allocated | integer | |
| created_at | | |

Seat counts shown anywhere in the UI (e.g. "seats remaining") must be **calculated from this table**, never manually typed.

---

# Selling side (phases 6–8)

Added 2026-09-19 from the owner's rulings of 2026-09-16/17. Nothing here changes
an existing column: the selling side **reads** `pnrs.seats` and never writes it.

## `agents` (lookup table)
The travel agents seats are handed to. Records, not user accounts — agents do not
log in.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| name | text | As staff know them, e.g. `QFC GROUP (PVT) LTD` |
| name_key | text, unique | Lower-cased, trimmed `name`. Stops the same agent existing twice under different spellings — the trap that split `Rawalpindi`/`RAWALPINDI` across two branch rows |
| b2b_code | text, nullable | e.g. `B2B6022`, where the legacy investor text carries one |
| contact_emails | text[] | Where dues notices may be sent. **A notice can go nowhere else** |
| contact_phone | text, nullable | |
| created_by_branch_id | fk → branches, nullable | Null = created by head office. Drives visibility: head office sees all agents, a branch sees only the ones it created |
| active | boolean | |
| dts_code | text, nullable | Agent registration details (owner, 2026-10-19). All three optional: agents recorded before then have none |
| address | text, nullable | |
| iata_number | text, nullable | |
| unbooked_balance | numeric(14,2), nullable, ≥ 0 | Owed on bookings **not yet in the system** (owner, 2026-10-29, from the Branch-Wise Client Ageing Report). Included in the agent's balance left on the Agents pages |
| unbooked_baseline | numeric(14,2), nullable | The agent's receivable in the system (all branches) when `unbooked_balance` was recorded. Receivable added since comes out of `unbooked_balance`, worked out live. Set exactly when `unbooked_balance` is (check) |
| created_at | | |

The agent's `b2b_code` is shown beside the PNR of every booking they hold seats on, on the dashboard and the booking page (2026-10-19).

## `agent_assignments`
Seats of one PNR held by one agent, with that agent's commercial terms. Several
rows per PNR are normal (shared PNRs).

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| pnr_id | fk → pnrs | |
| agent_id | fk → agents | |
| seats | integer | Seats this agent holds. A whole-PNR hand-over is one row covering all of them |
| charge_type | enum('none','pct','per_seat') | Additional charge: % of base fare, or PKR per seat |
| charge_value | numeric, nullable | |
| discount_type | enum('none','pct','per_seat') | Same two forms |
| discount_value | numeric, nullable | |
| charge_tax | boolean | Whether this agent pays the airline tax |
| assigned_at, assigned_by | | |
| released_at | timestamptz, nullable | Set when seats are taken back. Released rows stay as history and stop counting against the ledger |
| penalty_amount | numeric(14,2), nullable, ≥ 0 | The airline's penalty charged to this agent for unissued seats (Phase 9 Step 4, A9/A10). Entered by staff; **added to what the agent owes, never to margin** |
| penalty_license_id | fk → licenses, nullable | The license the penalty EMD was issued against. Required exactly when `penalty_amount` is set (database check) |

Charge and discount are **never both set** — a database check enforces it.
Everything the agent owes is **calculated** from these fields plus the PNR's fare,
tax and seats. There is no stored "amount due" column, and no `agent_dues` table:
a stored due goes stale the moment an EMD round changes.

## `agent_paybacks` (Phase 9 Step 5)
Money paid **back** to an agent after their booking was cancelled: what they paid
less their penalty. Kept apart from `agent_recoveries`, which stays receipts only.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| assignment_id | fk → agent_assignments | |
| amount | numeric(14,2), > 0 | Never more than is owed back (checked in the app, inside a lock) |
| paid_on | date | Not in the future |
| reference | text, nullable | Payment reference. **Never written to logs** |
| created_by | uuid | Head Office only |
| created_at | timestamptz | |

To pay back = recoveries − penalty − paybacks, calculated, never stored. Logged
against the assignment id (`tableName = 'agent_paybacks'`), amount and date only.

## `agent_recoveries`
Money actually received from an agent. "Recovery" is the company's term.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| assignment_id | fk → agent_assignments | |
| amount | numeric | |
| received_date | date | |
| method | text, nullable | |
| reference | text, nullable | Payment reference. **Never written to logs** |
| recorded_by | uuid | The staff member who recorded it. Not a foreign key — users live in Supabase Auth, not in a table here, the same as `pnrs.created_by` |
| created_at | | |

Outstanding = agent total − sum of recoveries. Calculated, never stored.

`amount` carries a `check (amount > 0)`: a payment is money that arrived. A
recovery entered by mistake is **deleted** (head office only, and the deletion
is logged), never cancelled out by a negative row that would read as a refund to
the agent. A payment larger than the balance is allowed and shows as **credit** —
ruling 13 has an agent's money standing as credit when a round is refunded and
re-issued, so refusing an overpayment would refuse a real event.

Its `activity_log` entries are keyed by **`assignment_id`, not by the recovery's
own id** — a deleted recovery's id matches no row, so entries keyed on it could
never be read back and the payment would disappear from the history along with
the mistake. `reference` is never written to a log line (CLAUDE.md rule 8).

## `bot_allotments`
Seats of a PNR put on sale through the WhatsApp bot, and their price.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| pnr_id | fk → pnrs, unique | One allotment per PNR |
| seats | integer | Seats the bot may sell. Reducing it below what is sold or held is refused |
| price_per_seat | numeric | **All-inclusive** price the customer pays — fare, taxes and margin together |
| updated_by, updated_at | | |

## `bot_bookings`
One customer booking as reported by the bot. **No customer personal data** — seat
counts only.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| allotment_id | fk → bot_allotments | |
| api_client_id | fk → api_clients | Which integration reported it |
| external_ref | text | The bot's own id for the booking. **Unique per client**, so a retry never books twice |
| seats | integer | |
| status | enum('held','sold','cancelled','expired') | |
| held_until | timestamptz | 8 hours from creation. A hold past this stops counting against the seats and cannot be paid |
| paid_at, cancelled_at | timestamptz, nullable | |
| created_at | | |

Sold, held and available seat counts are all **derived from these rows**, never
stored on the allotment.

## `api_clients`
Machine callers of `/api/v1`. The WhatsApp bot is one row.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| name | text | |
| key_prefix | text | Short, non-secret; identifies which key was presented |
| key_hash | text | SHA-256 of the key. **The key itself is shown once at creation and never stored** |
| scopes | text[] | Which endpoints this key may call |
| active | boolean | False revokes the key immediately |
| last_used_at | timestamptz, nullable | |

## `activity_log`
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| table_name | text | |
| record_id | uuid | |
| field_name | text | |
| old_value | text | |
| new_value | text | |
| changed_by | fk → users | |
| changed_at | timestamp | |

Every write to `pnrs`, `emd_rounds`, `ticketing`, `allocations` — and, from phase
6, `agent_assignments`, `agent_recoveries`, `bot_allotments` and `bot_bookings` —
must also write here, in the same transaction.

**Writing the entry is only half of it.** Ticketing entries were written
correctly from day one of Phase 5 Step 1 and never appeared, because the detail
page's history query listed only two table names (`decisions.md`, 2026-09-19).
When a new table starts logging, add it to that query too.

For a write made through `/api/v1` there is no user: `changed_by` is null and the
calling client is named in `new_value`. `changed_by` is a user id and an API
client is not a user.

## Dashboard totals
Not a table — a calculated query mirroring the totals row at the top of the old sheet: total seats, total EMD value, total paid, total refunded, scoped to whatever filter the staff member currently has applied.
