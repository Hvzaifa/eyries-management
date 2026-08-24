# Decisions Log

Every time an ambiguous field, rule, or edge case gets resolved — by the project owner, or by asking during a build session — add an entry here. Check this file before assuming the meaning of anything not fully spelled out in `data-model.md` or `business-rules.md`.

---

### 2026-08-21 — Totals row at top of old sheet
**Question:** Does the totals row at the top of the sheet mean anything beyond a sum?
**Answer:** No — it's purely a running total, nothing else. Implemented as a calculated dashboard summary, not stored data.

### 2026-08-21 — "EMD REFUND" sheet
**Question:** Is the second sheet tab a separate system to build?
**Answer:** No. Discarded as a separate concept — the "OB 01JUN26 Onward" sheet (i.e. the main `pnrs` + `emd_rounds` model) is the only thing being replicated. The refund log is just a filtered view of `emd_rounds` where `status = 'refunded'`.

### 2026-08-21 — Duplicate PNR rows with changed values (e.g. same PNR, seats drop from 10 to 0 across two SR# rows)
**Question:** Is this an amendment to the same deal, or a data-entry habit of copying a row forward?
**Answer:** Unresolved — likely a data-entry error in the legacy sheet, not a real business rule. **Do not build logic that assumes duplicate PNR values are meaningful.** Treat `pnr` as a plain field, not a unique key, unless told otherwise. If the new system ever produces a duplicate PNR value, don't silently allow it — surface a warning to the user rather than either blocking it or ignoring it.

### 2026-08-21 — GDS PNR field
**Question:** What is `gds_pnr` for?
**Answer:** Believed to be used when an agent books directly through a GDS (e.g. Travelport) rather than through the company as middleman. Confidence on this is low. Stored as an optional free-text field for now — do not build validation or logic around it until confirmed.

### 2026-08-21 — Segment field (Employment / Umrah / Tour)
**Question:** Is this a fixed list?
**Answer:** Not confirmed — could be a fixed set of categories or could include data-entry inconsistency. Built as free text with autocomplete suggestions from previously used values, **not** a locked dropdown/enum, so it doesn't break if a new or inconsistent value appears. Revisit if the project owner confirms a fixed list later.

### 2026-08-23 — Database access library (architecture.md said "pick one in Step 1")
**Question:** Prisma or the Supabase client for database access?
**Answer:** Both, with a strict split. **Prisma** is the only way application code queries business data (`pnrs`, `emd_rounds`, etc.). The **Supabase JS client is used only for Auth** now and Storage later — never for querying business tables. Decided during the post-Step-2 hardening pass.

### 2026-08-23 — Public signup disabled
**Question:** Should the login screen allow self-service signup with a role picker?
**Answer:** No. Anyone could have created themselves an `admin` account. Public signup was removed entirely; users are created by an administrator via `npm run db:seed:users` (Supabase Admin API) until a proper admin user-management screen exists. Role assignment is admin-managed, per Phase 1 Step 2.

### 2026-08-23 — dashboard_totals: definition of total_paid / total_refunded
**Question:** data-model.md requires "total paid" and "total refunded" but doesn't define them precisely.
**Answer:** Implemented as gross facts (never netted): `total_paid` = sum of `emd_amount` over rounds whose status is `paid`, `refund_requested`, or `refunded` (money that actually left); `total_refunded` = sum of `refund_amount` where status is `refunded`. Both scoped to active PNRs like the rest of the view. Flag for review at Step 3 sign-off.

### 2026-08-23 — Migration approach stays raw SQL, not prisma migrate
**Question:** Step 1 applies schema via `db/schema.sql` + `db/apply-schema.ts`; Prisma migrations would be the more standard route.
**Answer:** Keep the raw-SQL approach for now (it also owns the two SQL views, which Prisma can't express). Made idempotent so re-running heals partial applications — which had in fact happened: the live DB was missing everything after `airlines`. Revisit if drift between `db/schema.sql` and `prisma/schema.prisma` becomes a problem.

### 2026-08-23 — Urgency colour: which round statuses are "unresolved"
**Question:** Step 3 colours rows by "nearest unresolved `emd_rounds.deadline_date`", but "unresolved" wasn't defined across the five round statuses.
**Answer:** Only `status = 'pending'` counts as unresolved. Paid, refund_requested, refunded, and expired rounds never drive the row colour. Decided by project owner at start of Step 3. A PNR with no pending rounds shows green; a PNR whose status ≠ active is grey regardless.

### 2026-08-23 — Dashboard totals scoping vs filters
**Question:** data-model.md says totals are "scoped to whatever filter staff has applied"; phase-1 Step 3 says to show totals from the (global) `dashboard_totals` view.
**Answer:** For Step 3 the totals row always shows the global view values, regardless of active filters. Filter-scoped recomputation would require defining money-aggregation logic in app code — deferred until the owner explicitly asks for it. Decided by project owner at start of Step 3.

### 2026-08-23 — Money display format
**Question:** No currency is specified anywhere in the docs for fare/taxes/PSF/EMD columns.
**Answer:** Initially plain numbers with no symbol. **Updated same day at owner review: currency is PKR.** Money columns show `(PKR)` in their headers, totals cards render `PKR x,xxx.xx` via the shared `formatPkr()` helper (`src/lib/format.ts`).

### 2026-08-23 — EMD-1 table gap: exactly 60 days
**Question:** business-rules.md jumps from 30–59 (30%) to 61–90 (15%); exactly 60 is undefined.
**Answer:** Initially "no suggestion at 60 days". **Revised same day by project owner: exactly 60 days now suggests the lower band, 15%**, so the full mapping is <7 none / 7–14 → 100% / 15–29 → 50% / 30–59 → 30% / 60–90 → 15% / >90 → 15%. Still only a default, never enforced.

### 2026-08-23 — EMD-1 table gap: more than 90 days
**Question:** The highest written band ends at 90 days.
**Answer:** Bookings more than 90 days out get the lowest band (15%) as the starting suggestion, editable as always. Decided by project owner during Step 5.

### 2026-08-23 — Under 7 days: enforcing "no EMD round at all"
**Question:** How strictly should the create form enforce "< 7 days = full ticket payment, no EMD round"?
**Answer:** Strictly for the default flow — the inline first-round section is hidden and replaced with an explanatory note; a round cannot be added from the create form in that case. Decided by project owner during Step 5.

### 2026-08-23 — EMD suggestions now airline-scoped (SV only)
**Question:** The owner uploaded SV's updated policy (1st + 2nd EMD) and instructed that the suggestion rule apply to SV only, with other airlines set manually until their policies arrive.
**Answer:** `suggestEmd1` replaced by `suggestEmdPlan({airlineCode, segment, requestDate, outboundDate})`. Non-SV airlines → no prefill, manual entry. This supersedes the earlier "exactly 60 days → 15%" generic ruling and the old under-7-days "hide round section" behavior (the SV table covers every band; non-SV bookings simply get no suggestion).

### 2026-08-23 — SV policy: which Umrah variant
**Question:** SV's sheet has separate rows for "Umrah (Ramadhan)" and "Umrah Year-round excluding Ramadhan".
**Answer:** Year-round-excluding-Ramadhan implemented. Owner said "umrah only, no hajj or tour"; the imported data has zero Ramadhan-window departures (outbounds Jun–Oct 2026), so nothing is affected today. Ramadhan variant deferred until the owner asks.

### 2026-08-23 — 2nd EMD = full-payment percentage of SV policy
**Question:** Does SV's "X% full payment (+N days)" map onto `emd_rounds`?
**Answer:** Yes — recorded as `round_number = 2` when staff add it (Phase 3 screen). At creation time the form only *displays* the suggested pair (e.g. 15% / 85%) as guidance. Consistent with the open-ended rounds model; EMD-vs-ticket-payment separation in business-rules.md is unaffected.

### 2026-08-23 — Legacy import conventions ("OB 01JUN26 Onward")
**Question:** How should ambiguous legacy-sheet values be interpreted?
**Answer:** (a) PAYMENT %AGE cells are fractions (`0.15`=15%, `1`=100%). (b) Airline code `PK` maps to the existing PIA lookup entry (IATA equivalence); other unknown airline/license/branch values are auto-created as lookup rows named after their code/text and listed in the import report for the owner to rename. (c) A round is imported when its number/amount/time-limit present; status becomes `refunded` when a refund amount/date exists, otherwise `pending`. (d) Child rows (`PARENT PNR` set) link to parents that exist in the sheet and get an `allocations` row sized by the child's own seats; parents without their own row stay unlinked and are reported. (e) Selling-side columns (cancelled tickets, ticket loss, penalty EMD) are ignored per scope.

### 2026-08-24 — deadline_date becomes optional (legacy import reality)
**Question:** The legacy sheet has zero EMD time-limit dates (0 of 2,057 rounds) but `emd_rounds.deadline_date` was NOT NULL.
**Answer:** Column made nullable so legacy rounds import with "no deadline recorded" (urgency shows green until backfilled). Owner rule: **new bookings created through the UI must always have an EMD time limit** — the create form requires it and pre-fills it from the PNR TL date. Decided by project owner.

### 2026-08-24 — 0-seat rows are dropped at import
**Question:** 96 sheet rows carry `NO OF SEATS = 0` (many being the duplicate/continuation rows).
**Answer:** Owner instruction: rows with 0 seats are removed and never inserted — they are counted in the import report, not flagged for review. Rows with a missing seats value remain flagged as errors.

### 2026-08-24 — PNR TL = EMD-1 deadline; EMD-2 gated on verified airline email
**Question:** How do deadlines and the 2nd EMD relate to the airline confirmation workflow?
**Answer:** (1) `pnr_tl_date` serves as the EMD-1 deadline until the deposit-confirmation email is sent to the airline — the booking form auto-fills the round deadline from it. (2) The 2nd EMD auto-generates from the SV policy percentages **only after staff verify the airline's email confirmation**; until the Phase 3 email infrastructure exists, round 2 is entered manually. Logged as a Phase 3 design requirement.

### 2026-08-24 — One-time completion of past trips from the legacy import
**Question:** What happens to imported PNRs whose travel dates have passed?
**Answer:** Owner instruction: any PNR whose outbound OR inbound date is before today is marked `completed` (465 rows; 176 of them had only an outbound date recorded — owner confirmed either date counts). No rows were marked `cancelled` — nothing in the imported data explicitly says cancelled; that status stays human-only per business-rules.md. Applied once via script with per-row activity-log entries; **not** standing automation — future completions are manual unless the owner asks for a rule.

### 2026-08-24 — Airline lookup names confirmed
**Question:** Imported airlines carried bare codes as names (9P, FZ, PF, UL).
**Answer:** Owner-confirmed names: 9P = Fly Jinnah, FZ = flydubai, PF = AirSial, UL = Srilankan Airlines. `PA` pending owner confirmation (left as code). Seed list updated to match.

### 2026-08-24 — Dashboard default sort
**Question:** How should the PNR list be ordered by default?
**Answer:** Outbound date ascending (closest departure first), undated rows last — per owner request so active bookings read in departure order. SR# remains available by clicking the column.

### 2026-08-24 — Deadline alert scope (Step 7)
**Question:** The phase doc says "every pending round with deadline within 2 days" — does that include overdue rounds and rounds on non-active PNRs?
**Answer:** Overdue pending rounds ARE included (a daily job that skips already-late deadlines would never report them — aligned with the step's purpose of stopping missed deadlines). Rounds on cancelled/completed PNRs are excluded, consistent with the grey urgency rule. Rounds with no deadline are never alerted. Recipients come from the `STAFF_ALERT_EMAILS` env var; the job is read-only and sends one summary email per day. Decided during Step 7 implementation; flagged for owner confirmation.

---

## Template for new entries

```
### YYYY-MM-DD — <short title>
**Question:** <the ambiguity>
**Answer:** <what was decided, and by whom if relevant>
```
