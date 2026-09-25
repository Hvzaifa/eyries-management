# Data Model

This is the full, confirmed field list. Nothing outside this document should become a database field without first being added here and logged in `decisions.md`.

The runnable version of this is `db/schema.sql` — treat that as the source of truth for exact types; this file is the source of truth for *meaning*.

## `licenses` (lookup table)
Subsidiaries the deal is booked under (e.g. "TRV ADV", "SIX SIGMA"). Admin-editable dropdown, not free text.

## `branches` (lookup table)
City office that holds/requested the PNR (e.g. Rawalpindi, Islamabad, Peshawar, Faisalabad). Admin-editable dropdown.

## `airlines` (lookup table)
Code, name, contact email(s) for sending deposit-confirmation / extension-request emails.

## `pnrs` (the core table)

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| sr_no | serial | Shown to staff, auto-incrementing |
| request_date | date | |
| investor_company | text | **No longer entered** (2026-09-20). Every new booking is stamped `COMPANY INVESTMENT`; who holds the seats is the seat ledger's answer. Imported rows keep the name the sheet recorded, shown read-only, and an edit never rewrites it |
| license_id | fk → licenses | |
| branch_id | fk → branches | |
| parent_pnr_id | fk → pnrs, nullable | Self-reference. Null = top-level PNR. Set = this is a child of a split |
| pnr | text | The airline's booking reference. **Unique from 2026-09-20**, compared ignoring case and spacing — enforced in the app until the imported rows are cleared, then as a unique index (see `src/lib/booking-entry.ts`) |
| gds_pnr | text, nullable | Free text for now — only used when an agent books directly via GDS instead of through the company (see decisions.md) |
| segment | text | Travel purpose. **A fixed list from 2026-09-20: Umrah / Employment / Tour** (it was free text while the imported sheet's values were inconsistent). Stored as text so an imported value outside the list stays readable and editable |
| airline_id | fk → airlines | |
| seats | integer | |
| outbound_date | date, nullable | |
| inbound_date | date, nullable | |
| sector | text | e.g. "ISB-JED-MED-ISB" |
| pnr_tl_date | date, nullable | PNR time-limit / void date |
| deal_pct | numeric, nullable | Company's cut |
| issued_status | enum('issued','unissued') | |
| airline_taxes | numeric, nullable | |
| psf | numeric, nullable | |
| fare | numeric | Per-seat base fare |
| total_emd_value | numeric, generated | = seats × fare (excl. tax & PSF). **Calculated by the system, never typed in.** |
| status | enum('active','cancelled','completed') | |
| raw_airline_text | text, nullable | Original pasted airline message from AI intake (Phase 2). Only populated for PNRs created via the AI parse flow. |
| created_at, updated_at, created_by | | |

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
| status | enum('issued','refunded') | Reduced to two values on 2026-09-21: a round is `issued` — which secures the PNR — until it is `refunded`. `paid`, `refund_requested` and `expired` were removed. **Payment is not a status** and never was: a paid EMD is still `issued`, because the airline still holds it. `issued` is what counts as "unresolved" for urgency colours and deadline alerts |
| payment_date | date, nullable | **The day this EMD was paid to IATA** (2026-09-22). Null = no payment recorded. A separate axis from `status`, which is why the old `paid` status was wrong. The *deadline* is **not stored**: it is derived from the IATA remittance calendar using `issuance_date` (`src/lib/iata-calendar.ts`), so republishing the calendar moves every figure with it. Head Office only. A round is owed to IATA when this is null **and** its refund, if any, landed after the billing-to date of the period it was issued in — a refund inside that window cancels the billing instead. Never filter on `status` for this: a round refunded after its window is still owed and is not `issued`. See business-rules.md, "Paying IATA" |
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
| ticket_issuance_deadline | date, nullable | |
| status | text | |
| tickets_issued | integer, nullable | |
| balance_tickets | integer, nullable | |

No cancelled-ticket, ticket-loss, or penalty-EMD fields — those belong to the selling side, out of scope for now.

## `allocations`
How a parent PNR's seats are split across child PNRs/agents.

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
| created_at | | |

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

Charge and discount are **never both set** — a database check enforces it.
Everything the agent owes is **calculated** from these fields plus the PNR's fare,
tax and seats. There is no stored "amount due" column, and no `agent_dues` table:
a stored due goes stale the moment an EMD round changes.

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
