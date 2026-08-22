# Phase 5 — Ticketing Stage

## Step 1 — Ticketing fields on PNR detail
- Add the `ticketing` table's fields to the PNR detail page: name-update deadline, ticket-issuance deadline, status, tickets issued, balance tickets.
- These deadlines should feed into the same daily deadline-check job from Phase 1 Step 7 — extend that job's query rather than building a second job.
- Deliverable: a PNR with ticketing deadlines within 2 days appears in the same daily alert email as EMD deadlines.

## Step 2 — Stop here
- Do not build cancelled-ticket tracking, ticket loss, or penalty EMD logic — these belong to the selling side and are out of scope (see `docs/architecture.md` and `docs/business-rules.md`).
- This is the end of the buying-side system as scoped. Any further feature requests go back to the project owner for a real "does this happen often enough to justify automating it" conversation before becoming a new phase document.
