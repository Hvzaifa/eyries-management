# Business Rules

These are facts, not implementation choices. If a screen needs logic not described here, stop and ask — do not infer a rule from the shape of the data.

## Airline EMD policies (auto-suggested, never enforced)

EMD percentage suggestions are **per airline**. Only airlines with an uploaded policy get automatic suggestions; every other airline's percentages are set manually by staff until its policy arrives.

### Saudia (SV) — Umrah, year-round excluding Ramadhan

Based on days between `request_date` and `outbound_date` (uploaded policy sheet, 2026-08-23):

| Time to departure | 1st EMD (deposit) | 2nd EMD (balance / full payment) |
|---|---|---|
| 60+ days | 15% within 14 days of confirmation | 85% (+20 days to departure) |
| 30–59 days | 30% within 10 days | 70% (+10 days) |
| 15–29 days | 50% within 3 days | 50% (+7 days) |
| 7–14 days | 70% within 3 days | 30% (+5 days) |
| 2–6 days | 100% within 1 day | — |
| under 2 days | 100% immediate | — |

- Exactly 60 days falls in the top band (15%), per the owner's earlier ruling.
- The Hajj (Intl/Dom), Ramadhan-Umrah, and Tour Operator rows of the airline's table are **not** implemented — owner instruction: umrah only. No imported booking departs during Ramadhan; revisit if that changes.
- The 2nd EMD % is a suggestion for the *next* deposit round (`round_number = 2`); it is shown as guidance at booking creation and recorded when staff actually add that round.
- The older generic EMD-1 table that used to live here (61–90→15 … <7→no round) is **superseded** by this airline-scoped policy.

This only applies to suggestions — always a default the UI pre-fills, editable by staff, never a validation that blocks saving a different value.

## How EMD rounds actually work

A PNR is not limited to a fixed number of rounds. The real cycle:

1. Round 1 is issued with its deadline.
2. If the company can't cover the next portion before the deadline, they request a refund from the airline **before** the deadline (the airline does not cancel the PNR at this point).
3. The next day, the company requests a **date extension**, which becomes round 2 with a new deadline.
4. This can repeat (round 3, round 4, ...) — there is no hard cap. Build `emd_rounds` as an open-ended list per PNR, not fixed columns.

### PNR TL as the EMD-1 deadline (owner rule, 2026-08-24)

`pnrs.pnr_tl_date` **is** the round-1 deadline until the deposit-confirmation email has been sent to the airline. The booking form pre-fills the round deadline from the PNR TL date; staff can override it.

### EMD-2 auto-generation (owner rule, 2026-08-24 — Phase 3 scope)

The 2nd EMD must only auto-generate **after staff verify the airline's email confirmation** of the 1st EMD, and its percentage then follows the SV policy table above. This is gated on the Phase 3 email infrastructure (sent-log + a verified-confirmation state) — it is intentionally **not** built during Phase 1; until then, round 2 is added manually.

## What happens if a deadline is missed with no extension requested

The PNR is marked **"at risk — confirm with airline"**. The system never automatically marks a PNR as cancelled — only a human, after confirming with the airline, changes status to cancelled. The software reflects reality; it doesn't decide it.

## EMD vs ticket payment — keep these separate

- **EMD** = a guarantee deposit that the seats are held. Base fare only, no taxes.
- **Ticket payment** = the actual payment when tickets are issued (base fare + taxes). This happens after EMD rounds are done, in the `ticketing` stage.
- After ticket payment is made, the company requests a refund of the EMD amount from the airline. This is recorded as `refund_amount` / `refund_date` on the relevant `emd_rounds` row.
- **Do not attempt to reconcile or net EMD refunds against ticket payments in this system.** Record both as facts. Reconciliation is an accounting question, not a v1 feature — revisit only if explicitly asked.

## Refund status
`emd_rounds.status = 'refunded'` is how a round is marked once the airline refunds it. There is no separate refund table — see data-model.md.

## Parent/child PNR splits
An agent may only want part of a PNR's total seats. When that happens, a child PNR record is created (`parent_pnr_id` set), and an `allocations` row records how many seats moved.

**`pnrs.seats` is the number of seats that PNR still holds** — the split decrements the parent at the moment it happens, so `seats` already excludes everything given to children. A parent's "seats remaining" therefore *is* its `seats`; the `allocations` rows are the record of what was split away, never a further deduction from it. Both numbers are written by the system, never typed by staff.

> Superseded wording: this rule previously read "the calculated total minus everything allocated to children", which described a model where the parent kept its original total. The project owner replaced that on 2026-09-01 (a 30-seat parent split by 10 shows 20 seats). Applying both at once double-counted every split — see `docs/decisions.md`, 2026-09-07.

## Out of scope for this phase (selling side — do not build)
Ticket cancellations, ticket loss tracking, and penalty EMD calculations (the rule where >25% unsold seats after ticketing triggers a penalty, with no penalty under 10% cancelled) belong to the **selling side** of the business and are explicitly not part of this system yet.
