# Build phases

The plan, one file per phase, each broken into numbered steps.

**Build exactly the step [`../../PROGRESS.md`](../../PROGRESS.md) names as
current — one step per session.** Do not start the next step or phase in the same
session unless explicitly told to. After a step, summarise what was built and
every assumption made, however small, so it can be reviewed.

| Phase | Status | Covers |
|---|---|---|
| [0 — Data audit](phase-0-data-audit.md) | Complete (no code) | Reference only: what the legacy sheet meant |
| [1 — Foundation](phase-1-foundation.md) | Complete | Schema, auth, dashboard, detail page, manual entry, Excel import, deadline job |
| [2 — AI intake](phase-2-ai-intake.md) | Complete | Paste-and-parse into a reviewed draft |
| [3 — Payments & emails](phase-3-payments-emails.md) | Complete | Round 2 automation, refunds, refund log, airline email |
| [4 — Splitting](phase-4-splitting.md) | Complete | Parent/child seat allocation and navigation |
| [5 — Ticketing](phase-5-ticketing.md) | Complete | Ticketing fields on the detail page, fed into the daily alert |

**End of the buying side.** Phase 5 Step 2 says "stop here", and that still
stands for buying-side features: anything further goes back to the project owner
for a "does this happen often enough to justify automating it" conversation.

## Selling side

Brought into scope by the project owner on 2026-09-16/17 — the 24 rulings that
define it are in [`../decisions.md`](../decisions.md) and the rules themselves in
[`../business-rules.md`](../business-rules.md). Build in order: each phase needs
the one before it.

| Phase | Status | Covers |
|---|---|---|
| [6 — Seat ledger & agents](phase-6-seat-ledger-agents.md) | Complete | Agents, assigning and releasing seats, the Holder view, mapping the legacy agent bookings |
| [7 — Agent money](phase-7-agent-money.md) | **Next** | Charges, discounts, tax, EMD share, recoveries, outstanding, dues notices |
| [8 — Bot sales](phase-8-bot-sales.md) | Not started | Allotments and prices, the API for the WhatsApp bot, holds and payments |

Phase 8 cannot go live until Phase 6 Step 4 is committed: until agent-held
bookings carry assignments, unassigned seats are not really unassigned.
