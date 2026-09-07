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
| investor_company | text | The client/agent buying the seats |
| license_id | fk → licenses | |
| branch_id | fk → branches | |
| parent_pnr_id | fk → pnrs, nullable | Self-reference. Null = top-level PNR. Set = this is a child of a split |
| pnr | text | |
| gds_pnr | text, nullable | Free text for now — only used when an agent books directly via GDS instead of through the company (see decisions.md) |
| segment | text | Travel purpose (Employment / Umrah / Tour, etc). **Free text with autocomplete suggestions, not a locked dropdown** — see decisions.md for why |
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
| deadline_date | date, nullable | Nullable only because legacy-imported rounds have no recorded time limit — new rounds created in the UI always require one (see decisions.md, 2026-08-24) |
| deadline_time | time, nullable | |
| status | enum('issued','paid','refund_requested','refunded','expired') | `issued` replaced `pending` on 2026-09-07 — creating a round in the system *is* the act of issuing it. Only `issued` counts as "unresolved" for urgency colours and deadline alerts |
| refund_amount | numeric, nullable | Filled only when status = refunded |
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

Every write to `pnrs`, `emd_rounds`, `ticketing`, and `allocations` must also write here.

## Dashboard totals
Not a table — a calculated query mirroring the totals row at the top of the old sheet: total seats, total EMD value, total paid, total refunded, scoped to whatever filter the staff member currently has applied.
