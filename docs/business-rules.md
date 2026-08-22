# Business Rules

These are facts, not implementation choices. If a screen needs logic not described here, stop and ask — do not infer a rule from the shape of the data.

## EMD-1 percentage (auto-suggested, not enforced)

Based on days between `request_date` and `outbound_date`:

| Days: request → departure | EMD-1 % |
|---|---|
| 61–90 | 15% |
| 30–59 | 30% |
| 15–29 | 50% |
| 7–14 | 100% |
| < 7 | Full ticket payment — no EMD round at all |

This only applies to `round_number = 1`. This is a **default the UI suggests**, editable by staff — never a hard validation that blocks saving a different value.

## How EMD rounds actually work

A PNR is not limited to a fixed number of rounds. The real cycle:

1. Round 1 is issued with its deadline.
2. If the company can't cover the next portion before the deadline, they request a refund from the airline **before** the deadline (the airline does not cancel the PNR at this point).
3. The next day, the company requests a **date extension**, which becomes round 2 with a new deadline.
4. This can repeat (round 3, round 4, ...) — there is no hard cap. Build `emd_rounds` as an open-ended list per PNR, not fixed columns.

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
An agent may only want part of a PNR's total seats. When that happens, a child PNR record is created (`parent_pnr_id` set), and an `allocations` row records how many seats moved. The parent's "seats remaining" is always the calculated total minus everything allocated to children — never a manually typed number.

## Out of scope for this phase (selling side — do not build)
Ticket cancellations, ticket loss tracking, and penalty EMD calculations (the rule where >25% unsold seats after ticketing triggers a penalty, with no penalty under 10% cancelled) belong to the **selling side** of the business and are explicitly not part of this system yet.
