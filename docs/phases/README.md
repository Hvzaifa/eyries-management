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
| [5 — Ticketing](phase-5-ticketing.md) | **In progress** | Ticketing fields on the detail page, fed into the daily alert |

Phase 5 Step 2 is "stop here". Anything beyond it goes back to the project owner
for a "does this happen often enough to justify automating it" conversation
before it becomes a new phase document.
