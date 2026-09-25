# Decisions log

Every time an ambiguous field, rule, or edge case gets resolved — by the project
owner, or by asking during a build session — it is recorded here.

**Check this file before assuming the meaning of anything** not fully spelled out
in [`data-model.md`](data-model.md) or [`business-rules.md`](business-rules.md).
Several "obvious improvements" have already been tried, reverted, and written up
below; the entry usually explains why the obvious thing was wrong.

Entries are in date order, oldest first. Where two entries conflict, **the later
one wins** — superseded rules are kept rather than deleted, because knowing that
a rule was tried and dropped is itself useful.

## How to add an entry

Append a new entry to the end of the log using the template at the bottom of this
file, and add a line for it in the index. Give the date, the question, and the
answer including who decided it. If it fixed a bug, say what the bug actually did
— that is the part a future reader needs.

## Index

### August 2026

- [2026-08-21 — Totals row at top of old sheet](#2026-08-21-totals-row-at-top-of-old-sheet)
- [2026-08-21 — "EMD REFUND" sheet](#2026-08-21-emd-refund-sheet)
- [2026-08-21 — Duplicate PNR rows with changed values (e.g. same PNR, seats drop from 10 to 0 across two SR# rows)](#2026-08-21-duplicate-pnr-rows-with-changed-values-eg-same-pnr-seats-drop-from-10-to-0-across-two-sr-rows)
- [2026-08-21 — GDS PNR field](#2026-08-21-gds-pnr-field)
- [2026-08-21 — Segment field (Employment / Umrah / Tour)](#2026-08-21-segment-field-employment-umrah-tour)
- [2026-08-23 — Database access library (architecture.md said "pick one in Step 1")](#2026-08-23-database-access-library-architecturemd-said-pick-one-in-step-1)
- [2026-08-23 — Public signup disabled](#2026-08-23-public-signup-disabled)
- [2026-08-23 — dashboard_totals: definition of total_paid / total_refunded](#2026-08-23-dashboard_totals-definition-of-total_paid--total_refunded)
- [2026-08-23 — Migration approach stays raw SQL, not prisma migrate](#2026-08-23-migration-approach-stays-raw-sql-not-prisma-migrate)
- [2026-08-23 — Urgency colour: which round statuses are "unresolved"](#2026-08-23-urgency-colour-which-round-statuses-are-unresolved)
- [2026-08-23 — Dashboard totals scoping vs filters](#2026-08-23-dashboard-totals-scoping-vs-filters)
- [2026-08-23 — Money display format](#2026-08-23-money-display-format)
- [2026-08-23 — EMD-1 table gap: exactly 60 days](#2026-08-23-emd-1-table-gap-exactly-60-days)
- [2026-08-23 — EMD-1 table gap: more than 90 days](#2026-08-23-emd-1-table-gap-more-than-90-days)
- [2026-08-23 — Under 7 days: enforcing "no EMD round at all"](#2026-08-23-under-7-days-enforcing-no-emd-round-at-all)
- [2026-08-23 — EMD suggestions now airline-scoped (SV only)](#2026-08-23-emd-suggestions-now-airline-scoped-sv-only)
- [2026-08-23 — SV policy: which Umrah variant](#2026-08-23-sv-policy-which-umrah-variant)
- [2026-08-23 — 2nd EMD = full-payment percentage of SV policy](#2026-08-23-2nd-emd-full-payment-percentage-of-sv-policy)
- [2026-08-23 — Legacy import conventions ("OB 01JUN26 Onward")](#2026-08-23-legacy-import-conventions-ob-01jun26-onward)
- [2026-08-24 — deadline_date becomes optional (legacy import reality)](#2026-08-24-deadline_date-becomes-optional-legacy-import-reality)
- [2026-08-24 — 0-seat rows are dropped at import](#2026-08-24-0-seat-rows-are-dropped-at-import)
- [2026-08-24 — PNR TL = EMD-1 deadline; EMD-2 gated on verified airline email](#2026-08-24-pnr-tl-emd-1-deadline-emd-2-gated-on-verified-airline-email)
- [2026-08-24 — One-time completion of past trips from the legacy import](#2026-08-24-one-time-completion-of-past-trips-from-the-legacy-import)
- [2026-08-24 — Airline lookup names confirmed](#2026-08-24-airline-lookup-names-confirmed)
- [2026-08-24 — Dashboard default sort](#2026-08-24-dashboard-default-sort)
- [2026-08-24 — Deadline alert scope (Step 7)](#2026-08-24-deadline-alert-scope-step-7)
- [2026-08-25 — Deadline alerts: future dates only](#2026-08-25-deadline-alerts-future-dates-only)
- [2026-08-25 — EMD-2 deadline derivation (dates band)](#2026-08-25-emd-2-deadline-derivation-dates-band)
- [2026-08-25 — Bulk request-date clusters flagged, not changed](#2026-08-25-bulk-request-date-clusters-flagged-not-changed)
- [2026-08-25 — >100% round percentages: later duplicate round replaces earlier](#2026-08-25-100-round-percentages-later-duplicate-round-replaces-earlier)
- [2026-08-25 — Completion rule v2: outbound passed + EMD refunded](#2026-08-25-completion-rule-v2-outbound-passed-emd-refunded)
- [2026-08-25 — Sheet data is immutable; replacement pass undone](#2026-08-25-sheet-data-is-immutable-replacement-pass-undone)
- [2026-08-25 — Status definitions finalized](#2026-08-25-status-definitions-finalized)
- [2026-08-26 — Date parsing fix: the workbook's midnight-PKT convention](#2026-08-26-date-parsing-fix-the-workbooks-midnight-pkt-convention)
- [2026-08-29 — raw_airline_text field added to pnrs](#2026-08-29-raw_airline_text-field-added-to-pnrs)

### September 2026

- [2026-09-01 — EMD behavior when a PNR is split](#2026-09-01-emd-behavior-when-a-pnr-is-split)
- [2026-09-01 — Parent seats display after split](#2026-09-01-parent-seats-display-after-split)
- [2026-09-01 — Child PNR always requires a new PNR code from the airline](#2026-09-01-child-pnr-always-requires-a-new-pnr-code-from-the-airline)
- [2026-09-02 — EMD-1 Deadlines and PNR TL Sync](#2026-09-02-emd-1-deadlines-and-pnr-tl-sync)
- [2026-09-07 — SQL views bypassed RLS: the refund ledger was publicly readable](#2026-09-07-sql-views-bypassed-rls-the-refund-ledger-was-publicly-readable)
- [2026-09-07 — db/schema.sql never enabled RLS, so the protection was not reproducible](#2026-09-07-dbschemasql-never-enabled-rls-so-the-protection-was-not-reproducible)
- [2026-09-07 — The daily deadline job never ran in production](#2026-09-07-the-daily-deadline-job-never-ran-in-production)
- [2026-09-07 — `next build` failed, so nothing could deploy](#2026-09-07-next-build-failed-so-nothing-could-deploy)
- [2026-09-07 — Refund log crashed on a refunded round with no date](#2026-09-07-refund-log-crashed-on-a-refunded-round-with-no-date)
- [2026-09-07 — Refund validation: both money paths accepted anything](#2026-09-07-refund-validation-both-money-paths-accepted-anything)
- [2026-09-07 — Batch airline email was an open mail relay](#2026-09-07-batch-airline-email-was-an-open-mail-relay)
- [2026-09-07 — Working passwords for real accounts were committed to the repository](#2026-09-07-working-passwords-for-real-accounts-were-committed-to-the-repository)
- [2026-09-07 — Public view exposure closed on the live database](#2026-09-07-public-view-exposure-closed-on-the-live-database)
- [2026-09-07 — EMD-1 deadline for short-notice bookings (owner ruling)](#2026-09-07-emd-1-deadline-for-short-notice-bookings-owner-ruling)
- [2026-09-07 — updatePnr was not transactional](#2026-09-07-updatepnr-was-not-transactional)
- [2026-09-07 — recordEmdRefund trusted the form for which PNR to update](#2026-09-07-recordemdrefund-trusted-the-form-for-which-pnr-to-update)
- [2026-09-07 — The PNR-code list ignored branch scoping](#2026-09-07-the-pnr-code-list-ignored-branch-scoping)
- [2026-09-07 — xlsx upgraded off the abandoned npm build; upload size capped](#2026-09-07-xlsx-upgraded-off-the-abandoned-npm-build-upload-size-capped)
- [2026-09-07 — Low-severity pass](#2026-09-07-low-severity-pass)
- [2026-09-07 — EMD-1 vs EMD-2 deadlines: scope confirmed, and the two anchors were crossing](#2026-09-07-emd-1-vs-emd-2-deadlines-scope-confirmed-and-the-two-anchors-were-crossing)
- [2026-09-07 — Codebase cleanup: Ollama removed, dead code deleted, actions split](#2026-09-07-codebase-cleanup-ollama-removed-dead-code-deleted-actions-split)
- [2026-09-07 — Full data replacement from the updated master sheet](#2026-09-07-full-data-replacement-from-the-updated-master-sheet)
- [2026-09-07 — Documentation restructured](#2026-09-07-documentation-restructured)
- [2026-09-07 — EMD Issuance Time and Default Deadline Time](#2026-09-07-emd-issuance-time-and-default-deadline-time)
- [2026-09-07 — Authorization Overhaul (Head Office vs Branch)](#2026-09-07-authorization-overhaul-head-office-vs-branch)
- [2026-09-07 — 'Issued' Status replacing 'Pending'](#2026-09-07-issued-status-replacing-pending)
- [2026-09-07 — db/schema.sql had drifted from the live database](#2026-09-07-dbschemasql-had-drifted-from-the-live-database)
- [2026-09-07 — Branch scoping failed open; duplicate branch rows made it non-deterministic](#2026-09-07-branch-scoping-failed-open-duplicate-branch-rows-made-it-non-deterministic)
- [2026-09-07 — Branch names are case-insensitive; duplicate rows merged](#2026-09-07-branch-names-are-case-insensitive-duplicate-rows-merged)
- [2026-09-07 — Split seat maths double-counted; `unallocatedSeats` used the wrong allocations](#2026-09-07-split-seat-maths-double-counted-unallocatedseats-used-the-wrong-allocations)
- [2026-09-07 — PNR TL sync compared Date objects by identity](#2026-09-07-pnr-tl-sync-compared-date-objects-by-identity)
- [2026-09-07 — PNR TL defined: the time limit the PNR rests with us](#2026-09-07-pnr-tl-defined-the-time-limit-the-pnr-rests-with-us)
- [2026-09-07 — createPnr wrote the booking before it finished validating it](#2026-09-07-createpnr-wrote-the-booking-before-it-finished-validating-it)
- [2026-09-07 — SR# column was rendering blank](#2026-09-07-sr-column-was-rendering-blank)
- [2026-09-07 — Branch dashboard totals used a different "total paid" than head office](#2026-09-07-branch-dashboard-totals-used-a-different-total-paid-than-head-office)
- [2026-09-08 — `/pnrs/new` crashed for branch accounts: a constant imported across the client boundary](#2026-09-08-pnrsnew-crashed-for-branch-accounts-a-constant-imported-across-the-client-boundary)
- [2026-09-09 — AI intake moved to Gemini; Groq, Cerebras and OpenRouter removed](#2026-09-09-ai-intake-moved-to-gemini-groq-cerebras-and-openrouter-removed)
- [2026-09-09 — Dashboard cards follow the filters; unfiltered still means active](#2026-09-09-dashboard-cards-follow-the-filters-unfiltered-still-means-active)
- [2026-09-19 — Ticketing stage: SV's 72-hour rule, and what the daily alert now covers](#2026-09-19-ticketing-stage-svs-72-hour-rule-and-what-the-daily-alert-now-covers)
- [2026-09-19 — The selling side comes into scope: agents, the WhatsApp bot, and the seat ledger](#2026-09-19-the-selling-side-comes-into-scope-agents-the-whatsapp-bot-and-the-seat-ledger)
- [2026-09-19 — Seat ledger: three decisions the phase document did not settle](#2026-09-19-seat-ledger-three-decisions-the-phase-document-did-not-settle)
- [2026-09-19 — Legacy agent mapping: keep the names exactly as recorded](#2026-09-19-legacy-agent-mapping-keep-the-names-exactly-as-recorded)
- [2026-09-20 — The imported data is not the standard: entry rules tightened](#2026-09-20-the-imported-data-is-not-the-standard-entry-rules-tightened)
- [2026-09-20 — What the Holder column actually says](#2026-09-20-what-the-holder-column-actually-says)
- [2026-09-20 — Agent terms: the three questions the phase document left open](#2026-09-20-agent-terms-the-three-questions-the-phase-document-left-open)
- [2026-09-20 — Recoveries: correcting a payment, and overpayment](#2026-09-20-recoveries-correcting-a-payment-and-overpayment)
- [2026-09-20 — Filtering the dashboard to one holder shows their share](#2026-09-20-filtering-the-dashboard-to-one-holder-shows-their-share)
- [2026-09-20 — Agent dues: what "the EMD money the airline is holding" counts](#2026-09-20-agent-dues-what-the-emd-money-the-airline-is-holding-counts)
- [2026-09-21 — **EMD deadlines are ISSUANCE deadlines, not payment deadlines**](#2026-09-21-emd-deadlines-are-issuance-deadlines-not-payment-deadlines)
- [2026-09-21 — Who issues an EMD, what it is worth, and the two statuses](#2026-09-21-who-issues-an-emd-what-it-is-worth-and-the-two-statuses)
- [2026-09-22 — Bulk EMD issuance](#2026-09-22-bulk-emd-issuance)

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

### 2026-08-25 — Deadline alerts: future dates only

**Question:** Should the daily alert include already-overdue deadlines?
**Answer:** No — owner instruction: future deadlines only (today through +2 days). Overdue rounds are visible on the dashboard but never emailed. Implemented in `isDueForAlert` + the SQL filter.

### 2026-08-25 — EMD-2 deadline derivation (dates band)

**Question:** When the recorded EMD-2 % disagrees with the band implied by request/outbound dates (62 of 107 cases), which decides the deadline timing?
**Answer:** **Dates band** — always derived from request→outbound days (60+→−20d, 30–59→−10d, 15–29→−7d, 7–14→−5d; under 7 days has no EMD-2). Recorded % stays as the historical fact. The daily job now sets missing EMD-2 deadlines on active SV-Umrah PNRs whose EMD-1 is settled (paid/refunded); 107 deadlines were set (one month-shift bug caught and corrected same day). For new UI bookings the same rule applies and the create form previews the policy EMD-2 deadline.

### 2026-08-25 — Bulk request-date clusters flagged, not changed

**Question:** The sheet contains 9 request dates carrying 33–155 rows each (e.g. 155 rows "17-May-2026"); owner says 17-May has no record.
**Answer:** Verified the import is faithful — the clusters exist in the source sheet. Owner instruction: flag only, decision comes later. All clusters + affected PNRs listed in `data-review-flags.md`.

### 2026-08-25 — >100% round percentages: later duplicate round replaces earlier

**Question:** 55 PNRs had round percentages exceeding 100% (e.g. 30+70+30).
**Answer:** Owner rule: when a later round's percentage exactly matches an earlier round's, it is a re-issue that REPLACES the earlier one (later round's data wins, earlier deleted, rounds renumbered sequentially, everything activity-logged). 55 PNRs adjusted. PNRs with no matching pair, or still ≠100 after replacement (38), are left as recorded and listed in `data-review-flags.md`.

### 2026-08-25 — Completion rule v2: outbound passed + EMD refunded

**Question:** What status for PNRs whose outbound passed and whose EMD was refunded?
**Answer:** Completed. 105 active PNRs met the test (incl. 9UWZ2A, the r2-without-r1 oddity — its single refunded round qualified it). Activity-logged per row. The 18 active PNRs with outbound passed but EMD-1 still *pending* are NOT covered by any ruling — left untouched, flagged in `data-review-flags.md`.

### 2026-08-25 — Sheet data is immutable; replacement pass undone

**Question:** The owner clarified that imported sheet data are live company records and must stay consistent with the original — conflicting with the earlier >100% replacement instruction.
**Answer:** **Sheet-recorded facts (round numbers, percentages, amounts, dates, refund states) are immutable** — no pass may restructure them. The replacement pass was undone: all 55 affected PNRs had their rounds rebuilt exactly as the sheet records them (verified: round count back to 1,727; structures match the sheet). The replacement rule is void. Status rules remain active management (see completion/cancelled entries). EMD-2 deadlines continue to be derived from outbound/request dates per the dates-band rule — the only thing ever written on top of sheet data, per explicit owner instruction.

### 2026-08-25 — Status definitions finalized

**Question:** What exactly qualifies a PNR as completed or cancelled?
**Answer:**
- **Completed** = outbound date has passed AND the complete EMD amount has been refunded (every round refunded, refund totals matching). 564 PNRs qualify; 6 that had unrefunded pending rounds were reverted to active.
- **Cancelled** (all four conditions required): total EMD value = 0 AND no outstanding paid EMD (any paid amount was refunded) AND outbound date passed AND PNR time limit expired. **Zero current records meet this** (no record has total EMD value 0) — the rule stands for future data.

### 2026-08-26 — Date parsing fix: the workbook's midnight-PKT convention

**Question:** Owner reported dates one day early (e.g. 8K7FGY request 22 Jun in system vs 23 Jun in the sheet).
**Answer:** The workbook stores every date (all 7,616 cells, uniformly) as "midnight PKT of the true day" expressed in UTC (~19:00Z), with a float-rounding artifact landing the stored instant 12 seconds short (18:59:48Z). Reading the UTC calendar day therefore yields the previous day. Fixed in `parseExcelDate`/`sheetDateToIso`: nudge +60s and read the calendar date in Asia/Karachi — recovering exactly what Excel displays. Full re-import performed from the owner's updated sheet; cell-by-cell verification of all 1,005 imported records shows zero mismatches (dates, amounts, percentages, round details). Rules re-applied after import: 580 completed / 425 active; 19 EMD-2 deadlines set on active PNRs. Two rows with blank investor company (8WKIIF, 8WL7KL) are flagged rather than invented.

### 2026-08-29 — raw_airline_text field added to pnrs

**Question:** Phase 2 Step 2 requires storing the original pasted airline message alongside the PNR. Where does it go?
**Answer:** New nullable `raw_airline_text text` column on the `pnrs` table. Only populated when a PNR is created via the AI paste-and-parse flow; null for manually-entered PNRs and all legacy-imported records. Added to `docs/data-model.md`, `db/schema.sql`, and `prisma/schema.prisma`. Approved by project owner before implementation.

### 2026-09-01 — EMD behavior when a PNR is split

**Question:** How do EMD rounds work when a parent PNR is split into child allocations?
**Answer:** Two scenarios: (1) If EMD-1 has already been paid before the split, the parent and child keep the same EMD-1 (the original amount, which covered the full seats). EMD-2 amounts are then recalculated proportionally based on seat allocation — e.g. a 30-seat PNR at fare 80k has total EMD value 2,400,000; if 10 seats split to a child, the parent's EMD-2 is recalculated for 20 seats (1,360,000) and the child gets EMD-2 for 10 seats (680,000). (2) If split occurs before any EMD has been paid, all EMD rounds are created fresh on the child proportional to its seat allocation — the parent's existing rounds are also adjusted to reflect its new (reduced) seat count. Decided by project owner.

### 2026-09-01 — Parent seats display after split

**Question:** After splitting, should the parent PNR display the original total seats or only the remaining unallocated seats?
**Answer:** The parent PNR's `seats` field should display only the remaining seats. When 10 seats are split from a 30-seat parent, the parent shows 20 seats. Decided by project owner.

### 2026-09-01 — Child PNR always requires a new PNR code from the airline

**Question:** Can a child PNR be created without a new PNR code?
**Answer:** No. A PNR split is requested from the airline and they provide a new PNR number for the child. There is no possibility of creating a child PNR without a new number assigned by the airline. The split happens when a subset of passengers need a different inbound date. Additionally, GDS PNR is assigned when a ticket is issued from a GDS other than Amadeus; if issued from Amadeus, the GDS PNR equals the original PNR number. Decided by project owner.

### 2026-09-02 — EMD-1 Deadlines and PNR TL Sync

- **Decision:** EMD-1 deadlines are now auto-calculated upon PNR creation (+10 days for 15% deposits, +6 days for 30% deposits, and +0 days for anything else). PNR TL is strictly synonymous with the currently active EMD's deadline date. If a user manually edits an EMD round, the system will automatically sync the parent PNR TL to match the deadline of the earliest pending EMD round.
- **Reasoning:** Matches business logic for "Umrah Year-round" Saudia policy deposits, ensures the system doesn't rely on staff manually entering the date on creation, and keeps the overall booking TL in lockstep with the financial deadlines.

### 2026-09-07 — SQL views bypassed RLS: the refund ledger was publicly readable

**Question:** Row Level Security is enabled on all eight tables with zero policies, which denies the public `anon` role everything. Does that actually protect the data?
**Answer:** No — not through the two SQL views. **Verified live: 1,338 rows of the complete refund ledger were readable by anyone on the internet.**

**Why the tables were safe but the views were not.** Supabase publishes everything in the `public` schema through its PostgREST API, authorised by the anon key — and that key ships publicly in the browser bundle by design (`NEXT_PUBLIC_SUPABASE_ANON_KEY`). RLS was the only thing standing between that key and this data, and on the tables it worked: `anon` got HTTP 200 with an empty array.

A **view**, however, runs with its *owner's* privileges unless `security_invoker` is set, and both views were created without it (`reloptions = null`). So the view executed as `postgres` — the table owner, which holds BYPASSRLS — and cheerfully returned everything RLS had just locked away. The protection was one indirection away from being no protection at all.

Measured with nothing but the public anon key:

    GET /rest/v1/refunded_emd_rounds  -> 200, content-range: 0-999/1338
    GET /rest/v1/dashboard_totals     -> 200, 1 row

`refunded_emd_rounds` exposes 23 columns — `pnr`, `gds_pnr`, `emd_number`, `emd_amount`, `refund_amount`, `refund_date`, `sector`, `seats`, `outbound_date`, `airline_code`, `branch_name` — for every branch. `dashboard_totals` exposes company-wide financial totals. Both are readable without logging in.

**What changed:** both views now declare `with (security_invoker = on)`, so they are evaluated as the *caller*. The application is unaffected — Prisma connects as `postgres`, which owns the tables and holds BYPASSRLS (verified: `rolbypassrls = true`, `relforcerowsecurity = false`), so it still sees all 1,338 rows. `anon` is now subject to the tables' RLS through the view and therefore sees nothing. Grants to `anon` and `authenticated` are also revoked from both views, so PostgREST cannot reach them even if the option is ever lost.

Confirmed safe to change: the Supabase client in this codebase is **auth-only** — `grep` finds `supabase.auth.*` calls and not a single `.from()` or `.rpc()`. No application read path goes through PostgREST.

**Not yet applied to the live database.** The write was blocked by the sandbox and is the owner's to run: `psql "$DIRECT_URL" -f db/apply-security.sql`. **Until that runs, the refund ledger remains public.**

### 2026-09-07 — db/schema.sql never enabled RLS, so the protection was not reproducible

**Question:** RLS is enabled on the live database, but no `enable row level security` statement exists anywhere in the repository. Where did it come from, and what does a fresh database look like?
**Answer:** It was enabled by hand in the Supabase dashboard and never written down. `create table` leaves RLS **off**, so a database rebuilt from `db/schema.sql` — the documented setup path in README steps 3–5 — came up with RLS disabled and `anon` holding both `SELECT` and `INSERT` on every table (verified via `has_table_privilege`). That is the entire booking database world-readable *and* world-writable, using a key that ships in the client bundle.

This is the same class of failure as the 2026-09-07 schema-drift entry: a change applied straight to the live database and never mirrored into the file that rebuilds it. The consequence here is simply more severe — the drift *was* the security posture. Any staging environment, rebuild, or disaster recovery would have been silently public.

**What changed:** `db/schema.sql` now enables RLS on all eight tables explicitly, with a comment explaining why the app is unaffected (Prisma connects as the owning `postgres` role, which bypasses RLS) and why the lines cannot be omitted. Re-running is a no-op. No policies were added — authorisation stays in the app layer (`src/lib/auth.ts`), exactly as before; RLS here is a deny-by-default backstop against the public API, not a second authorisation model to keep in sync.

### 2026-09-07 — The daily deadline job never ran in production

**Question:** `vercel.json` schedules `/api/cron/deadline-check` daily, and the route checks `CRON_SECRET`. Did the job ever actually run once deployed?
**Answer:** No. The middleware matcher in `src/middleware.ts` matched `/api/cron/deadline-check`, and Vercel Cron calls it as an anonymous HTTP request with no Supabase session — so `updateSession` redirected it to `/login` and the route's `CRON_SECRET` check was never reached. The job returned a 307 every night and did nothing.

This is the feature phase-1 describes as "the part that stops missed deadlines from day one", on a system where a missed deadline costs real money.

**Why it went unnoticed:** Step 7 was verified with `npm run job:deadline-check`, which calls `sendDeadlineAlert()` in `src/lib/deadlines.ts` directly. That path has no HTTP layer and therefore no middleware, so the job worked perfectly every time anyone tested it. The bug lived only on the deployed path that nobody could easily exercise by hand.

**What changed:** `api/cron` is excluded from the middleware matcher, with a comment saying why it must stay excluded. This does not weaken anything — the route still authenticates itself with the `CRON_SECRET` bearer token via `timingSafeEqual`; that check simply becomes reachable. Verified against the new pattern: `/api/cron/deadline-check` is exempt while `/`, `/login`, `/pnrs/*`, `/refunds` and `/api/ai/parse-pnr` all still run middleware.

**Worth noting for the owner:** the job has therefore never sent a real alert in production. Deadlines that passed since deployment were never emailed.

### 2026-09-07 — `next build` failed, so nothing could deploy

**Question:** Typecheck and all 81 unit tests pass. Does the app build?
**Answer:** No — `next build` exited 1. Next runs ESLint during a production build and fails on errors, and there were 13: twelve `no-explicit-any` and one `prefer-const`, across `actions.ts`, `parse-excel.ts`, `parse-booking.ts`, `pnrs.ts` and `bulk-refund-form.tsx`. All were introduced in the Phase 3/4 refinement work.

`npm run typecheck` and `npm test` both passing while `npm run build` fails is a nasty gap, because the two commands anyone runs during development say everything is fine.

**What changed:** all thirteen fixed with real types rather than `eslint-disable` comments, so the types now document what the code actually handles:
- `requirePnrEditor`'s return is `Prisma.PnrGetPayload<...>` — exactly the shape its own query selects.
- `catch (err: any)` became `catch (err)` with an `instanceof Error` narrowing, which also fixes a latent crash: a thrown non-Error has no `.message`, so the old handler would have thrown *inside* the error handler.
- `RefundedEmdRoundRow`'s money columns are `Prisma.Decimal`, verified by probing what `$queryRaw` actually returns for `numeric` (a Decimal instance, not a string or number).
- `parse-excel.ts`'s four helpers take `unknown`, which is what a spreadsheet cell genuinely is.
- `updateState` in `bulk-refund-form.tsx` is now generic over `keyof RefundState`, so field and value are checked against each other rather than both being `any`.

Verified: `next build` exits 0 and generates all 14 routes; typecheck clean; 81/81 tests still pass.

### 2026-09-07 — Refund log crashed on a refunded round with no date

**Question:** `RefundedEmdRoundRow` typed `refund_date` as `Date` and `refund_amount` as a Decimal, both non-null, and `/refunds` called `row.refund_date.toISOString()` directly. Is that safe?
**Answer:** No — and it was already failing. Both columns are nullable in the database, and **one live round is refunded with neither**: `8N32CG` round 2. Head office sees every row, so opening the Refund Log threw `Cannot read properties of null` and the whole page 500'd. The `ORDER BY refund_date DESC NULLS LAST` in the same query shows the nullability was understood at query level and forgotten at render level.

**What changed:** both fields are typed `| null` (which is what the database says), and the page renders `—` for each. `refund_amount` is guarded separately and deliberately: `formatPkr(Number(null))` produces `"PKR 0.00"`, so without its own check a missing amount would have quietly displayed as a refund of zero — worse than a crash, because nobody would notice.

**Verified** against live data: all 1,338 rows render, the one incomplete round shows `— / —`.

**Left for the owner:** `8N32CG` round 2 is marked refunded with no amount and no date recorded. The page no longer breaks on it, but the underlying record is still incomplete. Sheet data is immutable without instruction (2026-08-25), so nothing was changed.

### 2026-09-07 — Refund validation: both money paths accepted anything

**Question:** `recordEmdRefund` checked only that the amount was non-null and not NaN; `processBulkRefunds` checked nothing at all. What could actually be written?
**Answer:** A negative refund. An `Infinity`. An unparseable date reaching Prisma as `Invalid Date`. A second refund on a round already refunded, silently replacing the original amount and date with no record of what they had been. And in bulk, a round that no longer existed was skipped with `continue` while the batch still reported success — so a partly-bad batch refunded some rounds, not others, and said nothing.

Two subtler ones found while fixing it:
- `new Date('2026-02-30')` does not throw; it rolls over to 2 March. An impossible date became a real, wrong one.
- The bulk form sends `Number(amountBox)`, and `Number('')` is **0**, not `NaN` — so an amount box left empty recorded a refund of zero and passed every check.

**What changed:** one shared validator, `src/lib/refunds.ts`, used by both paths so they cannot drift. It rejects a missing/NaN/infinite amount, a negative amount, a missing or malformed date, an impossible date (by comparing the parsed date back to the input), and any round already refunded. The bulk path now validates the **entire batch before writing any of it** — all-or-nothing, naming the offending row (`"8N32CG round 2: ..."`) rather than failing silently — and rejects duplicate round ids in one batch, which would have double-written. The form refuses to submit a blank amount. A `MAX_BULK_REFUNDS` cap of 500 keeps the transaction inside its timeout.

CLAUDE.md rule 4 names money as test-required and both paths had no tests; there are now **18 unit tests** in `refunds.test.ts`, including the leap-year and February-30 cases.

**Deliberately NOT enforced — owner's call:** that a refund may not exceed its round's EMD amount. It sounds self-evident, but it is written nowhere in `business-rules.md`, and **one existing round already exceeds it**. Enforcing it would contradict recorded company data, and sheet data is immutable without instruction. Flagged here rather than guessed (rule 2).

### 2026-09-07 — Batch airline email was an open mail relay

**Question:** `sendBatchAirlineEmails` takes `recipient`, `subject` and `body` from the browser and sends them through Resend from the company's verified domain. What does it validate?
**Answer:** Nothing. `airlineId` was destructured and then never used; the "(Mismatch)" flagging in the UI was cosmetic, with nothing enforcing it server-side. Any head-office session could send arbitrary text to any address on earth, over the company's sending identity. The default recipient was also hardcoded to a personal Gmail address, with the field labelled *"To (Overrides for testing: huzaifakhalil18@gmail.com)"* — test scaffolding that shipped.

**What changed.** `airlines.contact_emails` is defined in `data-model.md` as "contact email(s) for sending deposit-confirmation / extension-request emails", so the airline record is the authority on where its mail may go. The action now requires that:
- the target airline exists, and **has** a contact address recorded;
- the recipient is one of that airline's addresses (case-insensitive);
- every PNR in the batch belongs to that airline — otherwise one airline is told about another's bookings;
- `RESEND_API_KEY` is actually configured, instead of sending `Bearer undefined`.

The recipient field is now a dropdown of that airline's own addresses, reset whenever the airline changes so a previous airline's address can never carry over. No hardcoded address remains.

**Consequence the owner should know:** only **4 of 9 airlines** currently have a contact email on file (EK, PIA, QR, SV). The other five — 9P, FZ, PA, PF, UL — cannot be emailed until their address is added to the airline record, and the UI now says so explicitly. This is deliberate: an email meant for an airline should go to the airline, and "we don't know its address" is a data gap to fill, not a reason to allow sending anywhere.

**Also fixed:** phase-3 Step 4 requires "every sent email is logged against the PNR (subject, body, timestamp, recipient)". The log entry said only `"batch email sent to airline"` — no record of what any airline was actually told. It now records the recipient in `old_value` and the subject and body in `new_value`, with `changed_at` as the timestamp. Mapped onto the existing `activity_log` columns; no new field invented (rule 3).

### 2026-09-07 — Working passwords for real accounts were committed to the repository

**Question:** `scripts/seed-users.ts` read passwords as `process.env.SEED_HQ_PASSWORD || 'Eyries@HQ2026'`. Is the fallback a placeholder?
**Answer:** No — it is a live credential. Anyone who ran `npm run db:seed:users` without setting the environment variables got exactly those passwords, and nothing told them so. `Eyries@HQ2026` is the head-office account: the one that can refund EMDs, split PNRs and email airlines. It sat in a file readable by anyone with repository access. This is a direct breach of CLAUDE.md rule 8 ("secrets always come from environment variables, never hardcoded").

**What changed:** the fallbacks are gone. Each account names a required env var, and the script resolves and checks **all** of them before touching Supabase — so a missing password stops the run before any account is created, rather than seeding half the users. Passwords under 8 characters are rejected with a clearer message than Supabase's. The error explains why there is no default. The five variables are documented in `.env.example`.

**Action required by the owner, which code cannot do:** if the seed was ever run without those variables set, **those passwords are live right now** and must be rotated — head office first.

### 2026-09-07 — Public view exposure closed on the live database

**Question:** The `security_invoker` fix was written into `db/schema.sql` but not applied. Is the refund ledger still public?
**Answer:** It was, until now. **Applied to the live database** via `db/apply-security.ts --commit` (written because the project has no `psql` dependency; it runs everything in one transaction and verifies the app can still read both views *before* committing, then a dry run was performed first).

**Before:** `GET /rest/v1/refunded_emd_rounds` with the public anon key returned `200` and `content-range: 0-999/1338`.
**After:** `401` — `permission denied for view refunded_emd_rounds`. Same for `dashboard_totals`. The tables continue to return `200 []` exactly as before, and the application still reads 1,338 refund rows and 435 active PNRs.

### 2026-09-07 — EMD-1 deadline for short-notice bookings (owner ruling)

**Question:** `business-rules.md`'s SV table gives a deadline for every band (50% within 3 days, 70% within 3 days, 100% within 1 day, immediate under 2). The 2026-09-02 decision says "+10 days for 15% deposits, +6 days for 30% deposits, and **+0 days for anything else**". Every band except the two longest therefore pre-filled a deadline of **today**, so a short-notice booking was created already red/overdue. Which applies?
**Answer:** **Owner ruling: follow the SV policy table.** The 2026-09-02 entry only ever named the two long bands; "+0 for anything else" was a catch-all, not a considered rule for the short ones. The +10 and +6 figures stay exactly as the owner set them (the table itself says 14 and 10).

Resulting mapping — now `emd1DaysToDeadline()` in `src/lib/emd.ts`:

| Days to departure | Suggested EMD-1 deadline | Source |
|---|---|---|
| 60+ | +10 days | owner ruling 2026-09-02 |
| 30–59 | +6 days | owner ruling 2026-09-02 |
| 15–29 | +3 days | SV table ("50% within 3 days") |
| 7–14 | +3 days | SV table ("70% within 3 days") |
| 2–6 | +1 day | SV table ("100% within 1 day") |
| under 2 | same day | SV table ("100% immediate") |

**Keyed on the band, not the typed percentage.** A percentage cannot identify a band on its own — 100% appears in two of them (+1 day at 2–6 days out, but immediate under 2). For the standard percentages both readings agree exactly. 16 unit tests cover every band and boundary (rule 4: deadline logic is test-required).

**Also corrected while here:** the suggestion fired for *any* airline whose typed percentage happened to be 15 or 30, applying Saudia's policy to airlines that have none. It is now gated on `suggestion.applicable`, per the 2026-08-23 ruling that only airlines with an uploaded policy get a prefill. Non-SV bookings get no auto-deadline and staff enter it, which is what that decision always said should happen.

### 2026-09-07 — updatePnr was not transactional

**Question:** `createPnr`, `createEmdRound` and `recordEmdRefund` were made transactional on 2026-09-07. Was `updatePnr`?
**Answer:** No — it was missed, and it is the most-used write path in the app. `prisma.pnr.update()` and `activityLog.createMany()` ran as two separate statements, so a failure between them left the booking changed with **no record of who changed what**. `data-model.md` requires every write to `pnrs` to also write to `activity_log`. Both now commit together or not at all.

### 2026-09-07 — recordEmdRefund trusted the form for which PNR to update

**Question:** The refund action read `pnr_id` from the submitted form and used it to re-sync the PNR TL and revalidate the page. Why not read it from the round?
**Answer:** No reason — it was simply available in the form. A wrong or tampered `pnr_id` would have re-synced and revalidated a **different booking** than the one being refunded. The round already records which PNR it belongs to, so `existing.pnrId` is now used and the form field is ignored. The database is the authority on its own relationships.

### 2026-09-07 — The PNR-code list ignored branch scoping

**Question:** `getPnrFormOptions` returned every PNR code in the company to every user, to drive the duplicate-PNR warning. Is that consistent with branch scoping?
**Answer:** No. `listPnrs`, `getPnrDetail`, `getDashboardTotals` and `listRefundedRounds` are all branch-scoped; this one handed a branch account a list of all 1,014 codes, including every other branch's, straight into the browser. A branch user only needs warning about duplicates they could have created.

Now scoped through the same `pnrBranchFilter`, including its deny case (an unresolved branch gets an empty list, not the full one). Also `distinct`, so the payload no longer carries duplicates. **Verified:** head office 1,014 codes, a Rawalpindi account 392, an unresolved branch 0.

### 2026-09-07 — xlsx upgraded off the abandoned npm build; upload size capped

**Question:** `xlsx@0.18.5` carries a prototype-pollution advisory (GHSA-4r6h-8v6p-xvw6) and a ReDoS (GHSA-5pgg-2g8v-p4x9), both reachable from an authenticated spreadsheet upload, and `npm audit` reports "No fix available". Is that the end of it?
**Answer:** No — SheetJS stopped publishing to npm, so the registry copy is frozen at the vulnerable version while the project itself has moved on. Upgraded to **0.20.3 from the vendor's own CDN** (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, the distribution channel SheetJS documents). Both advisories now clear, and the parser was re-verified end-to-end against a generated workbook.

**Also:** the image upload path was capped at ~10 MB and the spreadsheet path was capped at nothing — any size was decoded into memory and handed to the parser. Now ~5 MB, which is generous for these sheets. And the endpoint no longer returns the raw thrown message to the browser: an upstream provider's error body is logged server-side and the caller gets a generic message.

**Still outstanding (not fixed):** `next` and its `sharp`/`postcss` dependencies carry 6 high-severity advisories. The only fix is `next@16`, a major version jump that would need its own testing pass — deliberately out of scope for a bug-fix session, and recorded here so it is not forgotten.

### 2026-09-07 — Low-severity pass

**Question:** Several small correctness and hygiene issues surfaced during the full-codebase read. What was done?
**Answer:**

- **The alert email escaped only one of three untrusted fields.** `investorCompany` went through `escapeHtml`; `pnrCode` and `airlineCode` — both free text from staff entry and the legacy import — were interpolated raw into the HTML. All three are escaped now, and `escapeHtml` also handles `'`, which it previously did not.
- **The auth callback had no redirect screening.** `src/app/login/actions.ts` screened its redirect through `getSafeRedirectUrl`, but `/auth/callback` interpolated `?next=` straight into a redirect. The helper now lives in `src/lib/safe-redirect.ts` (it could not be exported from a `'use server'` file, which may only export async functions) and both paths share it, with 8 unit tests covering protocol-relative URLs, the `/\` variant, absolute URLs and smuggled schemes.
- **`deadlines.ts`'s docstring contradicted its own code**, still describing overdue rounds as included after the 2026-08-25 ruling excluded them.
- **Dead code removed:** a `new Resend(...)` client constructed at module load in `actions.ts` and never used (email actually goes out through a direct REST call — two ways to send mail, one dead); the unused `pnrId` prop on `EditRoundButton`; an `autoPnrTlDate` in `pnr-form.tsx` that nothing rendered; four unused imports; `actions.ts.bak` and `test-ollama.ts`.
- **README corrected:** it still told a new developer that seeded users are "admin/staff/viewer", the roles replaced on 2026-09-07. Now documents head office / branch, the mandatory `SEED_*_PASSWORD` variables, `npm test`, and `db/apply-security.ts`.

ESLint went from 29 problems (13 errors) to **3 warnings**. The three that remain are deliberate: an `<img>` rendering a data-URI preview (`next/image` cannot optimise data URIs), an underscore-prefixed unused parameter that keeps a permission helper's signature uniform, and one in a scratch script.

**A trap worth recording:** `npm run typecheck` reported success while `npm run build` failed on a real type error. `tsconfig.json` sets `incremental: true`, and a stale `tsconfig.tsbuildinfo` had let tsc skip the offending file. Deleting it makes the two agree. Noted in the README's conventions — if typecheck and build ever disagree again, that is why.

### 2026-09-07 — EMD-1 vs EMD-2 deadlines: scope confirmed, and the two anchors were crossing

**Question:** The 2026-09-07 deadline ruling (+10/+6/+3/+3/+1/same-day) — does it apply to EMD-2 as well? And what governs a booking that has only one EMD?
**Answer:** Owner clarification: **the band offsets are EMD-1 only.** EMD-2 follows the SV policy — counted backward from departure (−20/−10/−7/−5). Where a booking has only one EMD (100%, under 7 days out), that round *is* EMD-1 and keeps the EMD-1 timing: +1 day at 2–6 days out, same day under 2, exactly as the 1st-EMD column of the SV table reads.

**Confirmed against the code, no change needed for the scope itself:** `emd1DaysToDeadline` is called in exactly one place — the round-1 deadline field on the create form. Every EMD-2 deadline is computed separately through `emd2DaysBeforeDeparture` in three places (`createPnr`'s auto round 2, the form preview, and the nightly backfill), none of which the earlier change touched.

**But checking that surfaced a real defect.** The two deadlines are anchored to different things — EMD-1 counts forward from confirmation, EMD-2 counts backward from departure — so on short-notice bookings they cross:

| Days to departure | EMD-1 | EMD-2 (policy) | |
|---|---|---|---|
| 10 | today+3 | departure−5 = today+5 | fine |
| **8** | today+3 | departure−5 = today+3 | **same day as EMD-1** |
| **7** | today+3 | departure−5 = today+2 | **a day BEFORE EMD-1** |

Round 2 falling due before round 1 is incoherent on its own, and it also breaks the PNR TL rule (2026-09-07, "the deadline of the earliest round still outstanding"): round 2 would already be overdue at the moment round 1 was issued.

**Owner ruling:** keep both policies exactly as written, but never let EMD-2 land on or before EMD-1 — push it to the day after. Implemented as `clampEmd2Deadline()` in `src/lib/emd.ts` and applied in all three EMD-2 paths, so the form preview cannot promise a date the server then moves. Only the crossing bands are affected; every other band returns its policy date untouched.

Nine unit tests cover it, including the month-end, year-end and leap-day rollovers, idempotency, and a sweep asserting that **every** SV band now yields EMD-2 strictly after EMD-1.

**Correction to the record:** this was first described as affecting only the exactly-7-days case. It affects **7 and 8 days** — at 8 days the two dates collide rather than invert, which is equally wrong. The clamp tests `<=`, so both are covered.

**Not changed:** the single-EMD case, per the ruling above — it was already correct.

### 2026-09-07 — Codebase cleanup: Ollama removed, dead code deleted, actions split

**Question:** Owner instruction — remove everything unused, apply YAGNI, drop Ollama, and structure the codebase properly. What went, what stayed, and why?

**Ollama removed.** `parse-booking.ts` put a local Ollama provider at the *head* of the fallback chain whenever `OLLAMA_MODEL` was set. It can only ever work on a developer's own machine; on Vercel it is a guaranteed connection failure and a wasted retry before any real provider is reached. Gone, along with its `apiKey !== 'ollama'` special case in the request headers. The remaining chain (Groq → Cerebras → OpenRouter) was flattened out of nested `if/else` branches into a single `buildCandidates()` function, so the order is readable in one place. `docs/reference/parsing-notes.md` no longer claims the model is `gemma3:4b`.

**Dead code deleted** (each verified to have zero importers first):
- The `admin`/`staff`/`viewer` compat shims in `auth.ts` — `UserRole`, `getUserRole`, `canEdit`, `isAdmin` — left behind by the 2026-09-07 authorisation overhaul and marked `@deprecated` at the time. Their only consumer was `scripts/test-auth-roles.ts`, which asserted things about a role model that no longer exists; both are gone.
- `canCreatePnr()` (returned an unconditional `true` and was never called) and `canEmailAirline()` (its one call site went with the batch-email rework).
- `escapeHtml` and `dashboardUrl` are now module-private — exported but only ever used inside `deadlines.ts`.

**`prisma/seed-sample-pnrs.ts` deleted — and it was a live hazard.** A filename search suggested it was unreferenced, but it was reached through a *dynamic* import in `prisma/seed.ts`, so it survived the first sweep. Reading that call site showed `npm run db:seed` — documented in the README as "seed lookup tables" — also inserted eight fabricated `TEST-*` bookings. Running the documented setup command against production would have written fake bookings into live data. The scaffolding dated from Phase 1 Step 3, when it was used to eyeball urgency colours before real data existed; 1,015 real bookings and the urgency unit tests have long superseded it. `seed()` now does only what the README says. Verified 0 `TEST-*` rows in the live database before removing.

**Structure.**
- `src/lib/types/auth.ts` → `src/lib/auth.ts`. It holds branch scoping and permission logic, not types, and `types/` contained nothing else.
- `src/app/pnr-table.tsx` → `src/components/pnr-table.tsx`. A component sitting in the routes tree.
- **`src/app/pnrs/actions.ts` (1,063 lines) split by concern** into `actions/pnr.ts` (create/edit/split a booking), `actions/emd.ts` (rounds and refunds) and `actions/email.ts` (batch airline email). Nine import sites updated to the specific module they need.
- Shared pieces moved out of the action files into plain modules: `src/lib/form.ts` (`str`/`dateVal`/`numVal`, so "empty string means absent" is decided once) and `src/lib/server/` (`guards.ts` for `requireUser`/`requireHeadOffice`/`requirePnrEditor`, `pnr-tl.ts` for the TL sync rule).

  `src/lib/server/` is deliberately **not** a `'use server'` module. Everything exported from one of those becomes a callable endpoint; authorisation guards are internal checks and should not be reachable from a browser.

**Deliberately kept**, despite being one-off tools that have already done their job: `scripts/import-legacy.ts` + `src/lib/legacy-import.ts` (and its tests), `scripts/make-sample-sheet.ts`, and `scripts/merge-duplicate-branches.ts`. They are documented phase deliverables, they carry the tested date-parsing quirks recorded on 2026-08-26, `schema.sql` names the merge script as a prerequisite, and none of them ship in the app bundle. Deleting them would cost reproducibility for a rebuild and buy nothing at runtime. Say the word if they should go.

**Result:** ESLint 0 problems (from 29 at the start of this hardening work, via 3 warnings), typecheck clean, 124/124 tests, build green, no exported symbol in `src/` without an importer.

### 2026-09-07 — Full data replacement from the updated master sheet

**Question:** Owner instruction — wipe the current data and re-import from `Groups EMD Master Sheet.xlsx`, then complete every PNR whose outbound date has passed and whose EMDs are all refunded.

**Two blockers had to be fixed before anything could run:**

1. **The importer would have been rejected by the database.** `scripts/import-legacy.ts` still wrote `status: 'pending'` for unrefunded rounds. `pending` was renamed to `issued` on 2026-09-07 and the `emd_rounds` CHECK constraint now refuses the old value, so *every* unrefunded round would have failed to insert. The importer had not been touched since the rename. Fixed to write `issued`.
2. **The importer only ever inserts — it has no delete step.** Re-running it over the existing data would have produced a duplicate of every booking rather than replacing anything. The wipe had to be done separately and deliberately.

**What was done, in order:**
- **Backed up everything first** to `backups/<timestamp>/` as JSON (1,015 PNRs, 1,818 rounds, 989 ticketing, 41 allocations, 3,440 log entries, plus the lookups). `backups/` added to `.gitignore` — it holds live business data. The wipe is otherwise irreversible.
- **Deleted the transactional tables only**, in FK-safe order. **Lookup tables were deliberately kept**: user accounts resolve their branch by *name* against the `branches` table, so dropping those rows would have locked every branch account out of the system. The importer reuses existing lookups by name and creates only what is missing (it mapped sheet airline `PK` onto the existing PIA row, as before).
- **Reset the `pnrs_sr_no_seq` sequence.** `sr_no` is a database serial the importer never sets, so without a reset the fresh data would have started numbering at 1016. It now reads SR#1–1501.
- **Imported**: 1,621 data rows considered; 105 zero-seat rows and 968 empty template rows skipped per the 2026-08-24 rulings; **1,501 bookings inserted** with 2,589 EMD rounds, 1,483 ticketing rows and 4,090 activity-log entries. 34 children linked to parents; 30 parent codes referenced by children do not exist in the sheet and were left unlinked, as before.
- **Applied the completion rule** via a new `scripts/apply-completion-rule.ts` (dry-run by default): **644 bookings marked completed**, each activity-logged.

**The completion rule as implemented** (docs/decisions.md 2026-08-25, reaffirmed by the owner today): outbound date in the past **AND** at least one EMD round **AND** every round `refunded`. The "at least one round" clause is load-bearing — without it a booking with no rounds satisfies "all rounds refunded" vacuously and would be completed for no reason. Only `active` rows are considered; `cancelled` stays human-only per business-rules.md.

**Verified both directions** after the run: of the 644 completed rows, 0 have an outbound date that has not passed and 0 have a round that is not refunded; and 0 qualifying rows were left active. Final state: **1,501 PNRs (857 active / 644 completed)**, 2,589 rounds (666 issued / 1,923 refunded), SR# 1–1501. App paths smoke-tested against the new data — dashboard, totals, refund log, detail page, branch scoping (Rawalpindi 639 PNRs / 924 refunds) — and the views are still closed to the public key (HTTP 401).

**Owner's attention — 120 rows were NOT imported.** The importer flags rather than guesses, per Phase 1 Step 6, so these are reported and left out: 61 rows whose EMD round 1 has no payment %, 59 with no complete EMD round at all, plus duplicate-PNR pairs. They are listed in the import output. This is the same behaviour as the previous imports (121 flagged then), not a regression — but it does mean the database holds 1,501 of the sheet's 1,621 usable rows.

### 2026-09-07 — EMD Issuance Time and Default Deadline Time

- **Decision:** Added `issuanceTime` to `EmdRound` schema. When an EMD round is created or updated, if a deadline time is not explicitly provided, it defaults to the `issuanceTime`. This ensures that the exact time of EMD issuance determines the deadline time limit (e.g., if issued at 11:00 AM, the deadline is set to 11:00 AM).
- **Reasoning:** Matches project boundaries as requested, adding precise time tracking to issuance which directly informs the exact hour of the deadline.

### 2026-09-07 — Authorization Overhaul (Head Office vs Branch)

- **Decision:** Replaced the legacy `admin`/`staff`/`viewer` roles with a new `AccountType` model (`headoffice` vs `branch`). Branch users are restricted to viewing and editing only their branch's PNRs, and lose edit capability entirely once any EMD round has been issued (paid/refunded). Only the Head Office account can manage EMDs, split PNRs, or email airlines. PNR creation is auto-scoped to the branch for branch users, while Head Office users can select any branch.
- **Reasoning:** Enforces strict geographic separation and a maker/checker dynamic (Branches as Makers of PNRs, Head Office as Checker/Manager of EMDs) per project owner's requirements. Branch name resolution is case-insensitive.

### 2026-09-07 — 'Issued' Status replacing 'Pending'

- **Decision:** The EMD round status `pending` has been completely replaced with `issued`. Additionally, a PNR is locked for branch users if *any* EMD round has been issued (regardless of whether it has been paid or not). This aligns with the fact that creating an EMD round in the system represents the act of it being issued, starting the timeline until the payment deadline.
- **Reasoning:** Enforces strict geoscoping and locks PNRs at the true point of EMD issuance, as requested by the project owner.

### 2026-09-07 — db/schema.sql had drifted from the live database

**Question:** Recent changes (the `pending` → `issued` rename, `issuance_time`, and per-round `license_id`) were applied straight to the live database and to `prisma/schema.prisma`, but never to `db/schema.sql` — the file `npm run db:apply` runs and which Step 1 designates as the source of truth for types. What should `schema.sql` say, and how do we stop the two drifting again?
**Answer:** `schema.sql` was corrected to match the live database exactly (verified column-by-column against it, not inferred from the Prisma schema):
- `emd_rounds.status` now defaults to `'issued'` and its CHECK lists `issued` in place of `pending`.
- `emd_rounds.issuance_time` and `emd_rounds.license_id` (FK → `licenses`, `on update cascade on delete set null`) are declared.
- `idx_emd_rounds_deadline` is dropped and recreated with the predicate `status = 'issued'`; it had been left filtering on `pending`, which now matches zero rows, so the daily deadline query was running unindexed.
- `refunded_emd_rounds` lists its columns explicitly instead of `er.*`, and is dropped/recreated rather than replaced.

Two structural rules follow from this, both now documented in the file's header:
1. **Every post-launch schema change must appear twice** — once in the `create table` block (fresh databases) and once in the new healing section of `alter table ... if not exists` / constraint statements (existing databases). `create table if not exists` never alters a live table, so a change written only in the create block silently does nothing on a database that already exists.
2. **A view must never `select er.*`.** Adding a column to `emd_rounds` changes such a view's column order, and `create or replace view` cannot reorder or rename existing columns — so the wildcard turns any future column addition into a failed migration.

The healing section carries any database still on the old vocabulary across the rename. The three statements have exactly one workable order, which is easy to get wrong: **drop the old CHECK constraint → rewrite the rows → add the new constraint.** While the old constraint is still in force it permits `pending` and rejects `issued`, so rewriting first fails; and the new constraint refuses to validate while any `pending` row remains. (The first draft of this fix had the update before the drop and failed on exactly that — caught by the verification described below.) The update affects **zero rows** in the live database, whose statuses are only `refunded`/`issued`/`paid`.

**Verification:** both paths were exercised against a scratch schema inside a transaction that was rolled back, so nothing was persisted. Path A rebuilt the *old* schema, inserted a `pending` round, then applied the new file twice: the legacy row healed to `issued`, both columns and the FK appeared, an app-style insert succeeded, and the index predicate switched to `issued`. Path B applied the new file twice to an empty schema: default status `issued`, both views queryable, and a *new* row with `status = 'pending'` correctly rejected.

**Why this mattered:** `db/schema.sql` is the documented setup path (README steps 3–5). While it was stale, a fresh database built from it got an `emd_rounds` table whose CHECK constraint rejected `'issued'` — so *every* EMD round the application writes would have been refused, and re-running it against the existing database would have failed on the `refunded_emd_rounds` view. Found during a full-codebase read; the schema was corrected but **not re-applied** — running `npm run db:apply` is the owner's call.

### 2026-09-07 — Branch scoping failed open; duplicate branch rows made it non-deterministic

**Question:** The branch/head-office split from the 2026-09-07 authorization overhaul scopes every query with `user.branchId`. What happens when that id is null, and what happens now that the legacy import has created more than one `branches` row per real branch?
**Answer:** Both cases were wrong, and the fix is the same principle in each: **an access rule that cannot be evaluated must deny, never allow.**

**(a) Unresolved branch fell open.** `resolveAuthUser` sets `branchId = null` when an account's `branch_name` matches no row, and every guard was written as "scope *if* we have an id": `listPnrs` fell back to `{}` (an unfiltered query returning all 1,015 PNRs), `getPnrDetail` skipped its check entirely, and `canEditPnr` compared `null !== null`, which is false — so such an account could also edit any PNR that has no branch assigned (there is one). The single worst-case account — one with a mistyped branch name — got **more** access than a correctly configured branch user, not less.

**(b) One real branch is spread across several rows.** `branches` holds case-variant duplicates: the Step-1 seed created `Rawalpindi`/`Islamabad`/`Peshawar`/`Faisalabad` and the legacy import then created `RAWALPINDI` (392 PNRs), `ISLAMABAD`, `PESHAWAR` (77), `FAISALABAD` (124) — while the seeded rows hold 0–1 PNRs. `resolveAuthUser` used `findFirst` with no ordering, so which row a branch user resolved to was **arbitrary**: the Rawalpindi account could legitimately have landed on the empty `Rawalpindi` row and seen 0 of its 392 bookings, with nothing in the UI to indicate anything was missing.

**What changed:**
- `AuthUser` now carries `branchIds: string[]` — *every* row matching the account's branch name — and scoping uses `branchId: { in: branchIds }`, so a branch sees its bookings regardless of which case-variant row they were filed under. `branchId` remains the single row NEW bookings are stamped with; where duplicates exist it is chosen deterministically as the row holding the most bookings (oldest row breaking ties).
- New `pnrBranchFilter(user)` returns the Prisma filter, or **`null` meaning "deny everything"**. It deliberately does not return `{}` for the deny case, because `{}` is what caused the original bug. `listPnrs`, `getDashboardTotals`, `getPnrDetail` and `listRefundedRounds` all short-circuit on null.
- `canEditPnr` now denies an unresolved branch, denies a PNR with no branch (rather than matching null to null), and accepts any case-variant row of the user's own branch.
- `createPnr` refuses to create when a branch account has no resolvable branch, instead of writing an unscoped PNR.
- `updatePnr` no longer stamps a branch user's primary branch onto the record it saves; it preserves the PNR's existing branch, so an edit cannot silently move a booking between duplicate rows. Only head office can reassign a branch.
- `scripts/seed-users.ts` now refuses to create any account whose `branch_name` does not exist in `branches`, listing the known branches. It does **not** create the missing branch — inventing a branch the business may not have is not the script's call.
- Thirteen unit tests in `src/lib/auth.test.ts` cover the deny paths specifically, including the null-vs-null case. `vitest.config.mts` was added so tests can resolve the `@/…` alias.

**Also fixed, same family:**
- **The refund log had no branch scoping at all.** `/refunds` called `listRefundedRounds()` with no user, so any branch account could read every branch's refunds (1,338 rows). Now scoped through the view's `pnr_id`, keeping the "refund log is a view, not a table" rule intact. A Rawalpindi account now sees 695.
- **The edit lock disagreed with itself.** `getPnrDetail` treats *any* EMD round as locking a booking (hiding the Edit button), but the `updatePnr` server action only counted `paid`/`refunded` rounds — so a branch user could still edit a locked booking by posting the form directly. The action now matches the page and the 2026-09-07 ruling: any round locks it.
- Branch dashboard totals counted only `paid` for "total paid" while the head-office view counts `paid` + `refund_requested` + `refunded`. Aligned to the view, per the 2026-08-23 definition.

**Open for the owner — not decided here:** should the duplicate branch rows be merged (e.g. `Rawalpindi` into `RAWALPINDI`)? Merging rewrites which branch existing bookings point at, and sheet-recorded data is immutable without an explicit instruction, so nothing was merged. The application is correct either way; merging would only simplify the data. Related: `branches` also contains `B2C`, `CSD`, `GUJRANWALA`, `MULTAN`, `RAHIM YAR KHAN` and `SIALKOT` from the import, which have no user accounts — worth confirming whether they are real branches.

**Verified** against live data, read-only: head office sees 1,015 PNRs across 14 branches and 1,338 refunds; a Rawalpindi account sees 392 PNRs (both `Rawalpindi` and `RAWALPINDI` rows) and 695 refunds, and is blocked from a Lahore booking; an account with an unmatched branch name now sees 0 PNRs, 0 refunds and zeroed totals, and can neither read nor edit the unbranched PNR.

### 2026-09-07 — Branch names are case-insensitive; duplicate rows merged

**Question:** `branches` held the same office twice, differing only in letter case — `Rawalpindi` (seeded 2026-08-21, 0 bookings) and `RAWALPINDI` (created by the legacy import 2026-08-22, 392 bookings), and the same for Islamabad, Peshawar and Faisalabad. Are these one branch or two?
**Answer:** **One.** Owner ruling: a branch name identifies a branch regardless of case. The duplicates were merged into a single row each.

**How the split happened:** the `branches.name` unique constraint compares text exactly, so `Rawalpindi` and `RAWALPINDI` were legal as separate rows. The Step-1 seed created the title-case rows; the import then auto-created lookup rows named after the sheet's upper-case text (per the 2026-08-23 legacy-import conventions entry) rather than matching the existing ones. All imported bookings attached to the import's rows.

**What was done** (`scripts/merge-duplicate-branches.ts`, dry-run by default, run with `--commit`): for each case-insensitive name group, the row already holding the most bookings was kept (oldest breaking ties), the other rows' PNRs were repointed onto it, and the emptied rows deleted — all in one transaction per group, with an `activity_log` entry per repointed PNR recording `branch_id` old → new.

**Result:** 12 branch rows, down from 16. Exactly **one** booking moved — `XYZ123` (SR#1006), from `Islamabad` to `ISLAMABAD`; the other three groups had all their bookings on the surviving row already. Total PNRs unchanged at 1,015, and no booking changed branch in any meaningful sense: the branch NAME each one belongs to is identical before and after, only the row id differs. Islamabad now correctly shows 3 bookings where the split previously showed 1 and 2.

**Preventing a recurrence:**
- `db/schema.sql` adds `create unique index idx_branches_name_lower on branches (lower(name))`, so a case-variant of an existing branch can no longer be inserted. It is **not yet live** — it applies on the next `npm run db:apply`, which must run *after* the merge (verified as applying cleanly to the merged data, and as rejecting a new `rawalpindi` row).
- `prisma/seed.ts` now looks branches up case-insensitively. Its exact-match lookup was the original cause: re-running the seed today would otherwise recreate `Rawalpindi` alongside `RAWALPINDI`.
- The `branchIds` list in `resolveAuthUser` (added earlier the same day) is retained. It is now redundant for these four branches but still correct, and it keeps the app right if duplicates ever reappear from another source.

**Deliberately not changed:** the surviving rows keep their imported upper-case names; nothing was renamed for tidiness. `B2C`, `CSD`, `GUJRANWALA`, `MULTAN`, `RAHIM YAR KHAN` and `SIALKOT` remain as-is and still have no user accounts — whether they are real branches is an open question for the owner.

### 2026-09-07 — Split seat maths double-counted; `unallocatedSeats` used the wrong allocations

**Question:** Two rules about parent seats were both live at once. `business-rules.md` and `phase-4-splitting.md` say a parent's remaining seats are "the calculated total minus everything allocated to children"; the owner's 2026-09-01 ruling says the parent's `seats` field itself displays only the remaining seats (30-seat parent split by 10 shows 20). Which applies?
**Answer:** The **2026-09-01 ruling**. `pnrs.seats` is the number of seats a PNR still holds, so it IS the unallocated count — the `allocations` rows are the record of what was split away, never a further deduction. `business-rules.md` has been updated and its old wording marked superseded.

Applying both rules at once meant subtracting each split twice. Two separate defects came out of it:

**(a) `splitPnr` validated against a double-counted limit.** It computed `parent.seats - sum(its children's allocations)` on a `seats` value the split had already decremented. Legacy-imported parents made it worse: the import stored each row's own seats with children imported as separate rows, so children's allocations frequently exceed the parent's stored seats. Measured on live data, the server's limit disagreed with the number the form offered on **all 37** parents with children, and was **negative on 12 of them** — meaning the split button offered up to N seats and the server then refused every possible value.

**(b) `getPnrDetail` subtracted the wrong set entirely.** Prisma exposes two relations that are easy to confuse: `parentAllocations` (rows where this PNR is the parent — seats given away) and `childAllocations` (rows where this PNR is the child — seats received). `unallocatedSeats` was computed as `seats − childAllocations`, i.e. this PNR's own seats minus what it had received as somebody's child. For a top-level parent that sum is zero, so the displayed figure was accidentally right for the wrong reason, and would have gone wrong the moment a PNR was both a child and a parent.

**What changed:**
- New `src/lib/seats.ts` holds the rule once — `unallocatedSeats`, `validateSplit`, `seatsGivenToChildren` — with 11 unit tests (`seats.test.ts`). CLAUDE.md rule 4 names seat-allocation maths as test-required, and it had none.
- `splitPnr` and `getPnrDetail` both call it, so the form's limit and the server's limit can no longer drift apart. Verified on live data: 0 of 37 disagree, 0 negative.
- `validateSplit` also rejects fractional and non-finite requests, which the old `<= 0` check let through.
- The PNR detail page's seats hint said "(40 unallocated)" beside "40 seats". It now reports what was actually split away — "(10 split to children)".

**Not changed:** no seat counts in the database were altered. This was a reading bug, not bad data; the 12 parents whose children exceed their seats are faithful to the sheet and stay as they are.

### 2026-09-07 — PNR TL sync compared Date objects by identity

**Question:** After an EMD round is edited, `updateEmdRound` re-syncs `pnrs.pnr_tl_date` to the earliest issued round's deadline and logs the change. The guard was `existing.pnr.pnrTlDate !== newTlDate`. Is that a correct change-detector?
**Answer:** No. `!==` on two `Date` objects compares object identity, not the moment they hold — it is **always true** for two separately-constructed Dates, even for the same instant. So every round edit wrote a `pnrs` update and an `activity_log` entry claiming the PNR TL had moved when it had not, quietly filling the booking's change history with fabricated edits.

Not yet visible in the data only because the feature is young: `activity_log` holds exactly one `pnr_tl_date` entry and it is a genuine change (empty → 2026-11-03). The next edit that left the TL untouched would have produced the first false one.

**What changed:** a `sameDate(a, b)` helper in `src/lib/urgency.ts` compares by `getTime()` and handles nulls; `updateEmdRound` uses it. Three unit tests cover it, including an explicit assertion that `a !== b` is true for equal Dates — so the trap is documented where the next person will meet it. Any future "has this date changed?" check should go through `sameDate`; the field-diff loop in `updatePnr` is already safe because it stringifies both sides before comparing.

**Left alone:** which round drives the TL. The code takes the lowest-numbered round with status `issued`, matching "the earliest pending EMD round" in the 2026-09-02 decision. If "earliest" was meant as *nearest deadline* rather than *lowest round number*, that is an owner call, not something to change silently.

### 2026-09-07 — PNR TL defined: the time limit the PNR rests with us

**Question:** Which EMD round's deadline is the PNR TL, and when does it move? (Left open in the 2026-09-07 date-comparison entry, which noted "earliest" could mean lowest round number or nearest deadline.)
**Answer:** Owner definition: **the PNR TL is the time limit the PNR rests with us.** It starts as **EMD-1's deadline**. If EMD-1 is paid before that deadline, then once the airline confirms and staff update the round's status, the TL becomes **EMD-2's deadline**. Generalised: the TL is the deadline of the earliest round still outstanding (`status = 'issued'`); when no round is outstanding the last round's deadline stands and the TL is never blanked. So "earliest" means the earliest *unsettled* round, which is the lowest round number — settling EMD-1 hands the TL to EMD-2.

**What changed:** the rule lived in one place — inside `updateEmdRound` — so it only fired when a round was edited. Every other path that changes a round's status skipped it, leaving the TL pointing at a deadline that was already settled:
- `recordEmdRefund` (the Refund button) — refunding EMD-1 settles it, so the TL should move to EMD-2. It did not.
- `processBulkRefunds` — same, across a whole batch.
- `createEmdRound` (adding round 3/4) — no sync at all.

It is now a single `syncPnrTlDate()` helper called from all four write paths, plus `createPnr`, which sets the TL to EMD-1's deadline directly at creation (making the sync provably redundant there, and saving round trips). The helper compares dates with `sameDate()`, so re-running it changes nothing and logs nothing.

**Verified** against the live database inside a rolled-back transaction: a new booking with EMD-1 due 17 Sep and EMD-2 due 20 Nov gets TL = 17 Sep; marking EMD-1 paid moves TL to 20 Nov and logs exactly one change; running the sync twice more logs nothing further; refunding EMD-2 leaves the TL at 20 Nov rather than blanking it.

**Still owner's call:** nothing automatically marks EMD-1 as paid — a person sets the status after the airline confirms, per business-rules.md ("Sending always requires a human click", and the EMD-2 gating rule). This change only makes the TL follow that status once it is set.

### 2026-09-07 — createPnr wrote the booking before it finished validating it

**Question:** `createPnr` created the PNR row and its activity-log entry, and only then checked the EMD round fields and the EMD number format. What happens when that check fails?
**Answer:** The booking stayed. The staff member saw "EMD Number is required", reasonably assumed nothing had been saved, and a PNR with no EMD round was left in the system — invisible in the sense that nobody was looking for it, and indistinguishable from a deliberately round-less booking. Nothing cleaned it up.

**What changed:** `createPnr` now validates every field — core fields, branch resolution, round completeness, EMD-number format — **before any write**, then performs the PNR, both EMD rounds and all activity-log entries inside **one transaction**. Either the whole booking exists or none of it does. `redirect()` stays outside the transaction, since it throws internally and would otherwise roll back the booking it was redirecting to.

`createEmdRound` and `recordEmdRefund` were also single-statement sequences with separate log writes; both are now transactional too, so a round can never exist without its log entry (and vice versa).

**Transaction timeout:** wrapping more work in a transaction exposed Prisma's 5-second default, which a hosted database on a slow link can exceed — this was hit while testing. The multi-step transactions now pass an explicit 20s timeout (`TX_TIMEOUT_MS`): long enough to survive latency, short enough to fail fast if the database is genuinely unreachable.

### 2026-09-07 — SR# column was rendering blank

**Question:** The dashboard's SR# column showed nothing.
**Answer:** `pnr-table.tsx` declared `accessorKey: 'sr_no'` — the database column name — while the row objects carry `srNo`. TanStack Table finds no such key and renders an empty cell; it does not warn. Corrected to `srNo`, with a comment noting that the accessor must match the `PnrListRow` field, not the DB column. Sorting on that column now works too, having previously sorted every row on `undefined`.

### 2026-09-07 — Branch dashboard totals used a different "total paid" than head office

**Question:** The branch-scoped totals query counted only `status = 'paid'`, while the `dashboard_totals` view head office sees counts `paid` + `refund_requested` + `refunded`.
**Answer:** Aligned to the view's definition, per the 2026-08-23 ruling that `total_paid` is gross money that actually left, never netted. Fixed as part of the branch-scoping work earlier the same day; recorded here for completeness since it was raised as a separate issue. The same figures now mean the same thing whoever is logged in.

### 2026-09-07 — Documentation restructured

**Question:** Owner instruction — format the docs and session files cleanly and structure them the way a production repository would, so that an agent reads them before implementing anything. What was wrong with the previous layout?

**Answer:** Four things.

**1. There was no entry point.** `CLAUDE.md` listed the documents as a flat bullet list with no stated order and no indication of what each was *authoritative* for. A new session had to guess what mattered. There is now a `docs/README.md` index that names the four must-read documents in order, says what each one governs, and states where each kind of fact belongs — so the next person writing a rule knows whether it goes in `business-rules.md`, `data-model.md` or `decisions.md`. `CLAUDE.md` now opens with "Before you write any code" pointing at it.

**2. `decisions.md` had split in two.** Fourteen entries had been appended *below* the "Template for new entries" section, so the log ran 2026-08-21 → 2026-09-07, then hit the template, then started again at 2026-09-02. Anyone reading top to bottom would have stopped at the template believing they had reached the end, missing a third of the log — including the authorisation overhaul and the `pending` → `issued` rename. The file was rebuilt: all 69 entries in one date-ordered sequence, a month-grouped index of all 69 linking to each entry, and the template moved to the bottom where it belongs. Verified: 69 entries, 69 working anchors, chronological, and no content lost.

**3. Three raw AI transcripts were sitting in `docs/` as if they were documentation.** `session-1` to `session-3` are ~12,000 lines of unedited model thinking and tool calls. Everything of value in them had already been distilled into `decisions.md` and `PROGRESS.md`, and much of what they describe was later revised or reverted — so reading them as documentation would actively mislead.

**They were deleted on the owner's instruction the same day**, after a check that nothing unique was lost. The transcripts contained 15 owner turns — the one category of content that could not be reconstructed from code or from this log — and each was verified to already have a corresponding entry here: the SV-only EMD policy and umrah-only scope, exactly-60-days at 15%, future-deadlines-only alerts, EMD-2 deadlines derived from the dates band, the 17-May request-date cluster, sheet immutability, the completed and four-condition cancelled status rules, and the one-day-early date bug (reported with `8K7FGY` as the example, which this log names). The files remain in git history at commit `5798601` if ever needed.

**4. Loose files with no home.** `parsing-notes.md` sat at the docs root beside the governing documents despite being an observation, not a rule; it moved to `docs/reference/` with a README drawing that distinction explicitly. `docs/phases/` gained an index showing which phases are complete and which is current.

**Also added: `docs/operations.md`.** The runbook did not exist. Several things only one person knew were written down for the first time: which commands write to a live database, that `npm run typecheck` can pass while `npm run build` fails because of the incremental cache, that every schema change must appear twice in `schema.sql`, why both SQL views need `security_invoker = on`, that lookup tables must survive a re-import or every branch account is locked out, that the `sr_no` sequence needs resetting, and that `api/cron` must stay out of the middleware matcher or the daily job silently stops running.

**Layout now:**

```
docs/
  README.md            index + required reading order
  architecture.md      stack, system diagram, out of scope (locked)
  business-rules.md    money and date logic
  data-model.md        field meanings
  decisions.md         69 entries, indexed, chronological
  operations.md        runbook: scripts, DB, backups, security, cron
  phases/README.md     + phase-0..5
  reference/README.md  + parsing-notes.md
  sessions/README.md   + one session note
```

All 31 internal documentation links verified to resolve.

---

### 2026-09-08 — `/pnrs/new` crashed for branch accounts: a constant imported across the client boundary

**Question:** `/pnrs/new` threw `Cannot read properties of undefined (reading 'trim')` in production while working locally. Why the difference, and what was undefined?

**Answer:** Neither production nor "the browser" was the variable — **the account was**. The page crashed for branch users and worked for head office, and the local login happened to be head office.

`EMPTY_PNR`, the blank form defaults, was exported from `components/pnr-form.tsx` — a `'use client'` module — and imported by `app/pnrs/new/page.tsx`, a server component. Every *value* exported from a client module is replaced in the server bundle by a client-reference stub:

```js
const EMPTY_PNR = registerClientReference(function() { throw new Error("Attempted to call EMPTY_PNR() from the server ...
```

The page used it two ways, and only one of them survived that substitution:

- **Head office:** `initial = EMPTY_PNR`. Passing the stub straight through as a prop is fine — React serialises the reference and the browser resolves it back to the real object from the client chunk. Worked by luck.
- **Branch:** `initial = { ...EMPTY_PNR, branchId }`. Spreading the stub copies none of the 19 defaults, so `initial.pnr` was `undefined` and `values.pnr.trim()` threw during the form's first render.

**Fix:** `PnrFormValues` and `EMPTY_PNR` moved to `src/lib/pnr-form-values.ts`, a plain module with no `'use client'`, so the server gets the real object. `pnr-form.tsx` now imports the type from there and exports only its component.

**The general rule this establishes:** a server component may import *types* from a client module (they are erased at compile time) but **never a value** — no constants, no helper functions, no lookup tables. Shared values belong in a neutral module both sides import. The failure is silent: it type-checks, it builds, and it can work on the code path that passes the value straight through, so it surfaces only for whichever user hits the path that reads into it.

---

### 2026-09-09 — AI intake moved to Gemini; Groq, Cerebras and OpenRouter removed

**Question:** `/api/ai/parse-pnr` returned 500 for both paste and screenshot upload, locally and in production. Replacing the `LLM_API_KEY` *value* with a Gemini key did not help. What was wrong, and what should the provider chain be?

**Answer:** Two separate faults, one of which hid the other.

**1. The env var name is only a label; the URL decides the provider.** The code posted to a hardcoded `https://openrouter.ai/...`, so a Gemini key placed in `LLM_API_KEY` was sent to OpenRouter and got a 401. Verified both ways: OpenRouter `401`, Gemini's OpenAI-compatible endpoint `200`. The route reports every failure as the same generic 500, so a misrouted key looked identical to a parse failure.

**2. The vision path could never have worked.** Screenshots were sent to `openrouter/free`, which is not a model — it is a *router* that picks a different free model per request, and its pool includes `nvidia/nemotron-3.5-content-safety:free`, a safety **classifier**. When the lottery landed there the reply was `User Safety: safe`, or `User Safety: unsafe / Safety Categories: PII/Privacy` — a booking full of passenger names and PNRs reads as PII — `JSON.parse` threw, and the request 500'd. Nothing was wrong with the upload: the same screenshot succeeded on a retry when the router happened to pick a real model. Never pin a router as a model.

**The chain was fiction.** The documented order was Groq → Cerebras → OpenRouter, but on checking: every Groq model ID (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`) and the Cerebras one (`llama3.1-70b`) returned **404 — those models no longer exist**, and the Cerebras account answered **402, no credit**. Neither key is set on Vercel, so in production the "fallback" had always been a single provider. Three providers were carrying zero traffic and two could not have served any.

**Now: Gemini only** — `gemini-2.5-flash`, falling back to `gemini-2.5-flash-lite` for text. Gemini is multimodal, so a screenshot goes to the same model as pasted text and the image path is no longer the fragile one. This is the same reasoning that removed Ollama on 2026-09-07: a provider that cannot work on the deployed app is not a fallback, it is a delay before the one that can. `GEMINI_API_KEY` replaces `LLM_API_KEY`; `GEMINI_MODEL` replaces `LLM_MODEL`.

**Removed as dead in the same pass:** the `apiKey` and `model` options on `parseAirlineMessage` (no caller ever passed either), the `model` field the route accepted from the request body (the browser never sent it, and honouring it would have let any signed-in user aim the key at a model of their choosing — pinning a model is an operator decision), the never-assigned `rawText` field on `ParsedField`, and the `.split('/').pop()?.replace(':free', '')` that tidied OpenRouter model names for display and is a no-op on a Gemini ID.

**Still open:** `docs/architecture.md` names the **Claude API** for this feature, and the implementation has never matched it. Left as-is pending the owner's call, since architecture.md is locked.

---

### 2026-09-09 — Dashboard cards follow the filters; unfiltered still means active

**Question:** The five summary cards ignored the filter bar — they always showed every active PNR, whatever the table below was showing. They should react to status, airline and branch, including combinations. But the table lists **all** statuses by default while the cards counted **active only**: with no status chosen, should the cards now include cancelled and completed bookings?

**Answer (owner's ruling):** **No — with no status filter the cards keep their old meaning, active PNRs only.** Picking a status switches them wholly to it. The alternative, mirroring the table exactly, was rejected because it would have moved the headline figures the day it shipped: cancelled bookings would start inflating Total EMD Value, and a cancelled booking is not live exposure. Branch, airline and the search box always apply, so `active + PA + RAWALPINDI` totals exactly those rows.

The count card is relabelled from the filter — "Completed PNRs", "Cancelled PNRs" — because "Active PNRs" sitting above a count of cancelled bookings is how a filtered dashboard misleads someone.

**Why the totals moved out of SQL.** The figures came from the `dashboard_totals` view, which is aggregated over every active PNR and cannot see a filter the browser applies; the page carried a note admitting the cards "do not change with the filters below". Filters are client state, so the cards now sum the rows already in the browser — no round-trip per keystroke. `listPnrs` gained `totalPaid` / `totalRefunded` per PNR to make that possible, using the same one pass over `emd_rounds` that already found the next deadline.

**This deleted a duplicated money rule rather than adding a third copy.** "Paid" meant `emd_amount` for rounds in `('paid','refund_requested','refunded')` and was written out three times — the SQL view, a hand-written branch-scoped raw query, and now a TypeScript path. `getDashboardTotals()` and `DashboardTotals` were removed, leaving `lib/dashboard.ts` as the only definition. The `dashboard_totals` view still exists in `db/schema.sql`; dropping it is a migration, not a code change.

**Money is summed in whole paisa.** Amounts are `decimal(14,2)` in Postgres but plain JS numbers once filtered client-side, and summing hundreds of floats drifts. `sumMoney()` totals integer paisa so the cards stay exact to the paisa staff reconcile against.

**No investor-company dropdown.** One was built and then removed the same day: the filter bar's search box already matches on investor company, so a fourth select earned its screen space only by duplicating a control that was already there. Anyone re-adding it should know why it is not trivial — `investor_company` is free text on the booking form, so the same client exists under several spellings (the data holds both `"COMPANY INVESTMENT"` and `"Company investment"`), and an exact-match dropdown would list one company twice and split its money across the two entries, showing 8 active PNRs where there are 731. A normalised key, as branch names already use, is the fix.

**Verified against the live database, not just unit tests.** Across all 1,501 PNRs the new client-side totals reproduce the `dashboard_totals` view exactly — 857 active PNRs, 51,731 seats, PKR 6,114,583,575 EMD value, PKR 1,059,506,806 paid, PKR 1,059,312,309 refunded — and the rewritten deadline lookup returns an identical `nextPendingDeadline` and `hasPendingRound` for every row. Seven filter combinations were reconciled against equivalent SQL, including `active + SV + RAWALPINDI` (322 PNRs) against `active + RAWALPINDI` (323), confirming the dimensions compose.

---

### 2026-09-19 — Ticketing stage: SV's 72-hour rule, and what the daily alert now covers

**Question:** Phase 5 Step 1 puts the `ticketing` fields on the PNR detail page and feeds their deadlines into the daily job. Three things were undecided: where the ticket-issuance deadline comes from, who may edit ticketing, and whether ticket counts are checked against seats.

**Answers:**

**1. SV issues tickets 72 hours before departure (owner ruling).** Only the outbound *date* exists in the data model — no departure time anywhere — so the rule is applied as `outbound_date − 3 days`. Claiming to honour "72 hours" any more precisely would be invented precision. New SV bookings are created with the deadline already recorded (`createPnr`, activity-logged), and the ticketing form pre-fills an **empty** field with it; a date staff have already recorded is never overwritten by the suggestion. Other airlines have no stored policy and are entered by hand, matching the 2026-08-23 rule that only airlines with an uploaded policy get a prefill.

**Existing bookings were not touched.** They did not need to be: 846 of the 857 active bookings already carry both ticketing deadlines from the legacy sheet. Writing a derived date over live records would be a data change, not a code change, and sheet data is immutable without instruction (2026-08-25).

**2. Ticketing editing is Head Office only.** Nothing in the phase documents says who may edit it, so it follows the 2026-09-07 authorisation model: branches make bookings, head office manages the money. A branch account is in any case locked out of a booking the moment any EMD round exists, which is true of every booking that reaches ticketing — so a branch-editable ticketing form would have been unreachable in practice. **Flagged for the owner:** if branch staff are expected to record ticket issuance, this one guard changes.

**3. Ticket counts ARE bounded by the seats — owner rule, given the same day.** This was first built the cautious way: counts validated only for being whole and non-negative, with `seats − issued` offered as an overwritable suggestion, because nothing written down said the two had to relate and guessing a money-adjacent rule is what rule 2 forbids. The owner then supplied the rule: **tickets issued and tickets still to be issued are the seats.** So:

- `tickets_issued > seats` is rejected, and so is a `balance_tickets` over the seats or a pair that sums above them;
- `balance_tickets` is no longer typed at all. `balanceTicketsFor(seats, issued)` derives it, the form renders it read-only, and **the server recomputes it regardless of what the browser posts** — a read-only input is a UI convenience, never an authority;
- `updatePnr` refuses to reduce `seats` below the tickets already issued, which is the same rule seen from the other side, and recalculates the stored balance when the seats change (activity-logged like any other write to `ticketing`).

A property test asserts the two halves can never disagree: for a range of seat counts, every balance the system derives is accepted by the validator.

**No live data conflicts with the new rule:** all 1,483 ticketing rows carry the two dates only — zero have a ticket count or a status recorded — so nothing had to be corrected and nothing stored could be overwritten.

The impossible-date check is the same trap found in the refund path on 2026-09-07: `new Date('2026-02-30')` does not throw, it rolls over to 2 March, so an impossible date silently becomes a real, wrong one. It is caught by parsing and comparing back.

**What the daily job now does.** Per the phase instruction to extend the job rather than add a second one, the same run also reports `ticketing` deadlines — both kinds — in their own table inside the same email, under the same rules as EMD rounds: active PNRs only, future only (today through +2 days), and never a deadline that has not been recorded. One subtlety worth recording: the query matches a ticketing *row* when **either** date falls in the window, so each date is re-tested individually before it becomes an alert — otherwise a row matched on its name-update date would also have reported a ticket-issuance date months away.

**Bug found by the owner the same day: ticketing edits were invisible in the change history.** `saveTicketing` wrote its per-field entries correctly — six of them were already in the live log — but `getPnrDetail`'s history query asked only for `tableName = 'pnrs'` and `'emd_rounds'`, so every ticketing edit was filtered out before it reached the page. The entries were never lost, only unqueried. `'ticketing'` (keyed by the PNR's own id, since `pnr_id` is that table's primary key) is now included. Verified on `7XAT6R`: the owner's own edits — tickets issued blank → 35 → 50, with the balance following 15 → 0 — now appear. **Worth remembering when a new table starts writing to `activity_log`: writing the entry is only half of it, and the half that fails silently is the reading.**

**4. Unissued tickets after the deadline are considered cancelled (owner rule, asked the same day).** If the issuance deadline passes with a balance outstanding, those seats were never ticketed and count as cancelled.

Owner's ruling on how to treat it: **show it, store nothing.** `cancelledTickets()` derives the figure from the deadline and the counts, and the booking page renders it. There is no `cancelled_tickets` column — inventing one would breach rule 3, and a stored count would go stale the moment the airline extended the deadline. Extending it makes the notice disappear on its own, which a written-down number could not do.

It is a reading of the facts, not a state: `pnrs.status` is untouched, `cancelled` stays human-only, and cancelled-ticket *tracking* / ticket loss / penalty EMD remain selling-side work that is still out of scope (architecture.md).

**Blank is not zero — and the data proves why that distinction matters.** The function returns null (say nothing) when no ticket count has been recorded, rather than reading blank as "none issued". Measured against the live database: under the implemented rule **0 of 1,483** bookings are flagged today, while the blank-means-zero reading would have declared **125 active bookings wholly cancelled** — every seat of each — purely because nobody had ever typed a ticket count. The owner ruled for "say nothing" before this was measured; the measurement confirms the cost of the other reading.

Surfacing is the booking page only (owner's choice): not the dashboard, not the daily email.

**Measured against live data before shipping:** 48 ticketing deadlines on active bookings fall inside the next two days, so the next alert email is materially bigger than it was. That is the point of the feature, but the owner should expect it.

---

### 2026-09-19 — The selling side comes into scope: agents, the WhatsApp bot, and the seat ledger

**Question:** The system has only ever covered the buying side; `architecture.md` listed "the selling side of the business (agent sales, ticket cancellations, penalty EMD)" as explicitly out of scope. The owner now wants selling brought into order: seats handed to agents who pay the company back, and the rest sold to customers through an external WhatsApp bot. What exactly is being built?

**Answer:** Settled over 2026-09-16/17 in a planning conversation with the owner — 24 rulings, recorded here as the source the phase documents are written from. `architecture.md`'s out-of-scope list has been amended (penalty EMD and ticket loss stay out).

**The shape of it.** Both sides are views over the **same PNR record**. There is no separate agent booking or B2C booking, and no "investment type" column: who holds a seat is *derived* from the assignments against it.

**General**
1. **Staff-only.** Agents are records, not logins.
2. **Every PNR starts unassigned.** Staff move seats to agents or to the bot; the bot sells **only** what has been assigned to it. Unassigned is a real in-between state, not a synonym for "company stock for sale" — an early draft of the plan had it the other way round and the owner corrected it.
3. Several agents can hold seats in one PNR (`KJ/QFC/MAQBOOL` in the legacy data is one PNR, three agents).
4. Existing data: everything starts unassigned; the ~126 agent-named PNRs are proposed as assignments in a review sheet and committed only after the owner approves.

**Access**
5. Head office and branches both use the selling screens; branches on their own PNRs only.
6. A branch may: create agents, assign unassigned seats to an agent, assign and reclaim unsold bot seats and set the price, and record recoveries, charges and discounts.
7. **Only head office** may take seats back from an agent or move them between agents.
8. Head office sees every agent; a branch sees only agents it created — but on its own PNR it still sees the name and balance of any agent holding seats, and can record that agent's payments.

**Agent money**
9. Charge, discount and the tax tick are set **per agent on the PNR**, not per EMD round: two agents on one PNR can have different terms.
10. Additional charge = % of base fare **or** fixed PKR per seat. Discount is a **separate field** with the same two forms, and the two are never used together.
11. Airline tax = `pnrs.airline_taxes` (**per seat** — confirmed against the data: 45,862 against a fare of 115,170) × agent seats, charged only if staff tick it.
12. **Agent total = seats × fare + charge − discount + (seats × airline tax if ticked).** Owner-confirmed worked example: 10 × 100,000 + 5% × 1,000,000 + 10 × 20,000 = **PKR 1,250,000**.
13. **EMD share:** at every EMD deadline the agent must have paid `(agent seats ÷ PNR seats) × the EMD money the airline currently holds`, less what they have already paid, due **3 days before** that deadline. Confirmed against the extension cycle: R1 450,000 → QFC (10 of 30 seats) owes 150,000; R1 refunded and extension R2 450,000 issued → still 150,000, already paid, **nothing further due**; R3 2,550,000 issued → owes a share of R2+R3 minus the 150,000 already paid. A payment into a round later refunded therefore stands as credit rather than being returned.
14. When the airline refunds the EMDs after ticketing, the agent's payments are **credited** against their total; the remainder falls due **3 days before the ticket-issuance deadline**.
15. **Margin excludes tax** — "the taxes are paid to government, they shouldn't determine margin or the profit company makes". Agent margin = charge − discount.
16. The daily staff alert lists notices due today or in the next 2 days (future only, like the EMD alert). **Staff click to send**, to the agent's recorded contact only.

**Ticketing**
17. SV issues tickets 72 hours before departure → deadline pre-filled as outbound − 3 days, editable; other airlines entered by staff. Built the same day — see the ticketing entry above.

**Bot**
18. Price is **per seat, all-inclusive**, editable here. Bot margin per seat = price − fare − airline tax.
19. The bot sends **no customer data**. It runs the customer conversation and its own payment accounting in its own backend; this system knows seat counts.
20. A booking is **held** until the bot reports payment received, then **sold**.
21. A hold unpaid after **8 hours** is released automatically; a payment reported after that is refused and the customer books again.
22. **A sold booking is final** — the API can cancel a booking only while it is still held, and there are no partial cancellations.
23. Staff can reclaim **unsold** bot seats, never below what is sold or held.

**The one rule everything hangs off — and the mistake it prevents.** `pnrs.seats` is a **buying-side fact that the selling side never writes**. `total_emd_value` is `seats × fare`, so decrementing `seats` on each sale — the obvious reading of "unallocated seats should decrease by 1" — would have silently shrunk each booking's EMD value as it sold. Seats are therefore divided by *derivation*: agent seats and bot allotment come from their own tables, and unassigned is the remainder. This is the same principle as parent/child allocations, where reading the rule two ways at once double-counted every split (2026-09-07).

**Decided by default, not by the owner — flagged for confirmation:** for a write arriving through `/api/v1` there is no user, so `activity_log.changed_by` is left null and the calling client is named in `new_value`. `changed_by` is a user id and an API client is not a user; inventing a fake user row would be worse. Say so if the audit trail should carry the client id instead.

**Still to settle before phase 8 is built:** whether an unpaid hold's 8 hours should ever differ per package, and what the bot should show a customer when a package sells out mid-conversation. Neither blocks phase 6 or 7.

---

### 2026-09-19 — Seat ledger: three decisions the phase document did not settle

**Question:** Phase 6 Step 2 says to build the ledger and the assign / release / move actions. Three things it does not say: what happens when the same agent is given seats twice, whether a move carries the agent's commercial terms with it, and how a branch's permission to assign interacts with the EMD edit lock.

**Answers, all recorded here because they are conventions a later session would otherwise re-decide differently:**

**1. Assigning to an agent who already holds seats tops up the existing row.** The alternative — a second live assignment for the same agent on the same PNR — would mean two rows to reconcile for every later question ("what does QFC owe on this booking?"), and phase 7 computes dues per assignment. One live row per agent per PNR keeps that a single sum. Partial release reduces the row; releasing everything sets `released_at` and the row stays as history.

**2. Commercial terms do NOT travel when seats move between agents.** A charge or discount was negotiated with the agent who had the seats; carrying it onto the receiving agent would silently make one agent's deal another's. A moved-to assignment starts with no charge and no discount, for head office to set.

**3. A branch may assign seats on its own booking even after an EMD round exists.** `canEditPnr` refuses once any round is issued, which is right for editing a booking's details and wrong here: seats are handed to agents precisely while deposits are running, so reusing that guard would have made the feature unusable for branches. The assignment actions therefore use their own check — same branch, no EMD condition. Release and move remain head-office-only (ruling 7).

**Two guards the ledger imposes on the buying side**, both written as the same shape as the phase-5 ticket-count guard: a split may only take **unassigned** seats, and `pnrs.seats` cannot be reduced below what agents hold. Without the first, seats an agent holds could be moved to a different PNR behind their back.

**`validateSplit`'s message was reworded.** It said "the parent PNR only holds N seats", which became a lie the moment agents existed — a PNR can hold 50 seats and have 0 available to split. It now says "available to split", and `splitPnr` adds how many seats agents hold when that is the reason.

**Verified against live data, not only unit tests:** two connections tried to take all 50 seats of the same booking at the same moment; the PNR-row lock serialised them and exactly one succeeded, leaving 0 unassigned and `overAllocated = false`. Releasing 4 returned 4; a full release returned all 50. `pnrs.seats` was unchanged throughout, which is the whole point of deriving the ledger rather than decrementing it.

**Step 3 postscript — the dashboard join was the wrong shape.** The Holder column needs each booking's assignments, and the obvious way to get them is a nested `include` on the booking query. Measured against the live database that cost ~200ms on top of an already-slow 1.9s query for 1,501 bookings — *with an empty `agent_assignments` table*, because Prisma resolves a nested include by matching every parent row whether or not any child exists. Reading the assignments as one flat query and grouping them in memory reads only the rows that exist, and running it in parallel with the booking query keeps it off the critical path. The underlying 1.9s (every booking fetched on every dashboard load) is the known pagination item, not something this step introduced.

---

### 2026-09-19 — Legacy agent mapping: keep the names exactly as recorded

**Question:** 126 active bookings carry an agent name in `investor_company` — free text typed into a spreadsheet for two years. The first implementation followed the standing "flag rather than guess" rule: it proposed an agent only where the text named exactly one, and flagged the other 49 (39 of them shared names like `KJ/QFC/MAQBOOL`, plus 8 `Agent Investment` placeholders, one `40 SEATS SI/15 SEATS BR`, and one shared with company investment). How should those be resolved?

**Owner ruling:** *"Keep them the same. Transfer them to agent side even if multiple name exists within a single PNR. Don't split seats between them. Keep all the data same. Anything other than Company Investment goes to agent side."*

So the cautious reading was wrong for this data. **Every value except `COMPANY INVESTMENT` becomes an agent named verbatim**, and each booking's whole seat count goes to it:

- `KJ/QFC/MAQBOOL` is **one agent record of that name**, not three. Which of the three holds how many seats is not written anywhere, and the owner does not want it invented — the shared booking stays as the sheet recorded it until somebody decides otherwise.
- Names keep their codes: `QFC GROUP (PVT) LTD-RWP-B2B6022` is stored exactly like that. The B2B code is *also* read out into `b2b_code`, which reads the text without altering it.
- Placeholders (`Agent Investment`) and seat-count names (`40 SEATS MAQBOOL TRAVEL`) transfer as written.
- The only value that could not be mapped is a blank one — an agent cannot be created without a name. There were none on active bookings.

**Why this is safe where the usual caution was not.** Nothing here derives money or dates; it records who the sheet says holds the seats. Getting a *shape* wrong (three agents where the business means one loose grouping) is visible on screen and correctable by a person. The flagging rule still applies to everything that computes a figure.

**What the CSV keeps.** The analysis that used to skip a row now rides along as a note — "for later cleanup: several agents on one booking" — plus a warning where two agent names look like typos of each other (`MABOOL` beside `MAQBOOL`, 1 and 2 bookings). Nothing is merged on that basis.

**Committed to production:** 126 assignments across 42 new agents, each one activity-logged with the originating text. Verified afterwards: **0 bookings over-allocated**; the only assignments whose seats differ from the booking's own are the four the owner made by hand while testing the panel; `pnrs.seats` and `total_emd_value` untouched, as the ledger design requires. Active seats now read 5,670 held by agents against 46,259 unassigned.

**Scope decision, not asked for and therefore recorded:** active bookings only. Assignments exist so the system knows which seats are still sellable, and a completed booking has none; mapping the 241 finished agent-named bookings would add rows nobody can act on and would drop historic bookings into agents' ledgers in phase 7. `--include-completed` exists if that history is ever wanted.

---

### 2026-09-20 — The imported data is not the standard: entry rules tightened

**Question:** A long list of rules in this system are lenient *because the imported spreadsheet was messy* — duplicate PNR codes allowed, segment left as free text, EMD deadlines nullable, refunds uncapped, `investor_company` typed by hand. Each was the right call while the sheet was the only data. Is it still?

**Owner ruling:** *"The system should not mould according to the data currently in the database — rather the data will be re-entered in a clean manner, so adjust everything if needed."*

That inverts the assumption every one of those decisions rested on. The imported rows are **history to read**, not the shape to build to. The owner chose to **keep them visible** for now, so nothing was deleted and nothing was rewritten; the rules apply to what is entered from here on.

**Tightened (all four chosen by the owner):**

| Rule | Why it was lenient | Now |
|---|---|---|
| PNR code | the sheet contained duplicates; blocking would have made those rows uneditable (2026-08-21) | unique, ignoring case and spacing — including the new code a split gives a child |
| Segment | the sheet's values were inconsistent, so a locked list would have rejected real rows (2026-08-21) | a fixed list: Umrah / Employment / Tour |
| EMD deadline | 2,057 imported rounds have none (2026-08-24) | required on every round created or edited in the app; the column stays nullable for the old rows |
| Refund amount | not written in business-rules.md, and one imported round exceeded its EMD (2026-09-07) | may not exceed the round's EMD amount |

**Who a booking belongs to.** Owner: *"Every booking that comes in is under company investment until it is assigned to an agent or bot."* So `investor_company` is **no longer entered at all** — new bookings are stamped `COMPANY INVESTMENT`, and the seat ledger answers the question. The Holder column now reads in the business's own words: `Company Investment`, or the agent's name once seats are theirs (see the 2026-09-20 holder-wording entry below). The split form no longer asks for a child's investor either: a child is company investment until its seats are assigned.

**Two mistakes worth recording, both caught before they shipped.** Applying the "stamp COMPANY INVESTMENT" rule mechanically put it into `updatePnr` as well, which would have **erased the imported investor name on every edit** — destroying exactly what the owner kept the rows to read. And the new duplicate check, run unmodified in `updatePnr`, matched the booking being edited and would have made every existing booking unsaveable. Both now exclude the record being edited, and the same principle is written into the business rules: *a rule tightened today must not make yesterday's record unopenable.* An unchanged out-of-list segment is likewise left alone.

**Measured against the live data before and after:** 0 of 1,503 bookings have a code the new rule rejects, 0 duplicate codes exist, every segment in use is already one of the three, and 0 rounds have a refund exceeding their EMD — so tightening costs nothing today and only prevents tomorrow's mistakes. (The one over-refunded round the 2026-09-07 entry mentions is no longer present; the data was re-imported since.)

**Deferred deliberately:** the PNR-code uniqueness is an application check, not a unique index, because an index cannot be added while old rows might still contain duplicates. `src/lib/booking-entry.ts` carries the exact statement to add once the imported data is cleared.

**Still lenient, and why:** `emd_rounds.deadline_date` and `segment` stay nullable/text in the database, and the branch-name matching still resolves several rows per branch. All three exist to keep the imported rows readable. They become candidates for tightening at the schema level on the day those rows are dropped.


---

### 2026-09-20 — Agent terms: the three questions the phase document left open

**Question:** Phase 7 Step 1 gives the formula — `seats × fare + charge − discount + (seats × tax if ticked)` — and the owner's worked example. Three things it does not say, all of which a money screen has to answer the moment it is opened: what a percentage is a percentage *of*, whether a charge or a discount may be unreasonably large, and what happens to a value left in a box whose term is then switched off.

**Answers, recorded because a later session would otherwise decide them differently:**

**1. A percentage is a percentage of the base fare, never of the total.** The owner's example reads "5% × 1,000,000" where 1,000,000 is 10 seats at a 100,000 fare — so the charge is computed before the tax is added, not on top of it. The difference is real money: on that booking, 5% of base is 50,000 and 5% of base-plus-tax would be 60,000. A unit test asserts the base reading explicitly, so the cheaper misreading cannot creep back in.

**2. A discount may not exceed the base fare; a charge has no ceiling.** These are not the same kind of rule. The discount limit is arithmetic — a larger one makes the agent's total negative, i.e. the company paying an agent to take seats, which is not a deal anyone meant to strike. A charge ceiling would be policy, and the owner's stated reason for charges is *"if the overall market is doing well the company will add a margin on top"*; picking a maximum margin would be inventing a business rule (golden rule 2). So a 150% charge saves, and a 101% discount is refused with the reason. **Flagged for the owner:** if there is a sane maximum markup, say so and it becomes one line.

**3. A value whose term is switched to "None" is dropped, not kept.** The database requires type and value to agree (`(charge_type = 'none') = (charge_value is null)`), and a stored amount attached to no term is the classic half-saved row that resurfaces later as a wrong total. The form posts the two sides separately and only the chosen one carries a type, which is also how the charge-XOR-discount rule is made unbreakable in the UI rather than merely refused at save time: the form offers **one** adjustment and asks which it is. Filling in both and learning at save time is a worse experience than not being able to express it.

**Zero is not a term.** A 0% charge is refused with "a charge of zero is the same as none". Otherwise the same intention is storable two ways and every later screen has to handle both.

**Margin excludes tax, and the code cannot quietly drift on it** (ruling 15). `agentMargin` is `charge − discount`, and a test asserts that the margin with the tax tick on equals the margin with it off — so a future change that folds tax into profit fails a test that says why rather than silently inflating what the company thinks it earns.

**Money is summed in whole paisa**, the discipline `sumMoney()` already follows in `lib/dashboard.ts`: these are `numeric(12,2)` columns but plain floats in JavaScript, and a percentage of a fare lands on fractions that accumulate. Staff reconcile these figures against a bank statement.

**Terms are set by branches too, on their own bookings** — the owner listed "record recoveries, charges and discounts" among what a branch does (ruling 6). Only *moving* seats between agents stays head-office-only. The write locks the PNR row and re-reads the assignment inside the transaction, because `seats` is what the discount is checked against and head office may be releasing seats at that moment.

**Verified against the live database** in rolled-back transactions: the owner's example written through Postgres `numeric` and read back totals exactly **1,250,000** with a 50,000 margin; a second agent on the same booking with a per-seat discount totals independently (ruling 9); `pnrs.seats` and the generated `total_emd_value` are untouched by any of it; and both database checks fire as intended — a charge and discount together, and a type with no value, are each refused by Postgres, not only by the app.


---

### 2026-09-20 — Recoveries: correcting a payment, and overpayment

**Question:** Phase 7 Step 2 says to record payments received and calculate outstanding. It does not say what happens when a payment is typed wrongly, or when an agent pays more than they owe. Both happen in any payments ledger, and both change what the screen must show.

**Decided by default, not by the owner — flagged for confirmation:**

**1. A wrong payment is deleted, by head office, and the deletion is logged.** The alternatives were worse: leaving no correction at all means one fat-fingered zero makes an agent's balance permanently wrong, and allowing a negative "payment" means money going *back* to the agent is indistinguishable from a typo being undone — two different events in one column. So `amount` carries a database check `> 0`, and `deleteRecovery` is head-office-only (undoing money is not a branch's call, even on its own booking, where it may freely *record* payments per ruling 6). **Say if a branch should be able to delete its own mistakes**, or if deletion should be barred entirely in favour of something else.

**2. An overpayment is allowed and shows as credit.** Refusing it would refuse a real event: ruling 13 already has an agent's payment standing as credit when a round is refunded and an extension issued. `outstanding` is therefore clamped at zero and the excess is reported separately as `credit`, the same shape as `seatLedger`'s `overAllocated` — a screen reading "−50,000 outstanding" looks like a bug, where "50,000 in credit" is a fact someone can act on.

**3. A payment cannot be dated in the future**, and the "today" it is compared against comes from the **server** in Pakistan time, not the browser. A laptop with a wrong clock or a foreign time zone would otherwise make today's payment unrecordable, or let tomorrow's through.

**4. A released assignment cannot take a payment.** Its seats went back to the company, so its total is zero and any payment against it would sit there as a permanent phantom credit. The message points staff at the agent's current seats instead.

**Where the log entry is keyed, and why it is not obvious.** Recovery entries carry the **assignment's** id, not the recovery's own. A recovery can be deleted, and an `activity_log` row keyed on a row that no longer exists can never be found by the booking's history query — the payment would vanish from the record along with the mistake it documents. The same reasoning as `ticketing`, whose entries carry the PNR's id. This is the third time the phase-5 lesson has applied: **writing the entry is only half of it** — the read query has to ask for the table too, and it was added here with the feature rather than after a bug report.

**The payment reference never reaches a log line** (CLAUDE.md rule 8). It is stored and shown to staff, and `describeRecovery()` builds the log text without it. Verified rather than assumed: the live check recorded a payment with reference `CHQ-SECRET-99881` and confirmed the string does not appear in the entry the action writes.

**Verified against the live database** in rolled-back transactions, on the owner's own worked example (10 seats, 5% charge, tax ticked, total 1,250,000): recording 150,000 left exactly 1,100,000 outstanding; paying the remaining 1,100,000 settled it to zero; a further 50,000 showed as 50,000 credit with outstanding still zero. The database refused an amount of 0 and of −5,000 by check constraint, and the app refused a future date and an impossible one (`2026-02-30`, which JavaScript silently rolls into March). `pnrs.seats` and the generated `total_emd_value` were untouched throughout. The new table answers the anon key exactly as every other does — `200 []` on a read, `401` on a write.


---

### 2026-09-20 — Filtering the dashboard to one holder shows their share

**Question (owner's report):** filtering the dashboard by an agent kept the right bookings but described the wrong thing. AFY883 has 99 seats — Ansar e Madinah 30, Eyries Holidays 30, company 39 — and selecting one agent showed a row of 99 seats and cards claiming that agent held 99. *"If Ansar e Madinah is selected in filter only Ansar e Madinah PNRs/seats should be shown… dynamic, not hardcoded."*

**The filter itself was right.** `holderFilterKeys` deliberately lists every holder on a booking so a shared booking is findable under each of them — an agent's shared bookings are still their bookings. What was wrong is that the row kept describing the whole booking after the filter had narrowed the question to one holder.

**Answer: when one holder is selected, each row is replaced by that holder's share before the table sees it** (`src/lib/holder-view.ts`). Cells, sorting, the visible count and the cards all read the projected rows, so there is one set of figures on screen instead of two that disagree. The alternative — patching only the card totals — was rejected because the row beneath would still have read 99 seats beside a card reading 30.

**Owner's three rulings, 2026-09-20:**
1. **Money follows the seats.** EMD value, paid and refunded show that holder's share, which is the shape of ruling 13's own `(agent seats ÷ PNR seats) × EMD money held`.
2. **Only the Holder dropdown** turns the share view on. The search box is unchanged: it matches many fields at once, so a partial word has no single holder to compute a share for.
3. **Scope is the dashboard** — the cards and the table beneath them. The booking's own page already breaks the seats down per agent.

**How each figure divides, and why they are not all the same calculation.** Seats are simply the holder's own count. **EMD value is exact, not prorated**: `total_emd_value` is the generated `seats × fare`, so a holder's share of it is `heldSeats × fare` — no rounding enters at all. Only **paid** and **refunded** are real money against the whole booking and must actually be divided.

**The odd paisa stays with the company.** 30/99, 30/99 and 39/99 of an amount do not divide evenly, and rounding each part independently loses a paisa — after which the company's view would stop equalling "the booking minus the agents", which is precisely the reconciliation a person does by eye. So the other holders are rounded and the company takes the remainder (or, with no company seats, the largest agent does). Proved on the live booking: 4,500,000 splits 1,363,636.36 / 1,363,636.36 / 1,772,727.28, and 0.01 splits 0 / 0 / 0.01 — both exact.

**Four traps found in review and closed before shipping:**
- **`data: rows.map(...)` inline would have broken the cards.** A fresh array each render rebuilds every row object and invalidates the memoised filtered model the cards read — the same memoisation whose comment already warns against exactly this. The projection is wrapped in `useMemo`.
- **The search box would have matched everything.** `globalFilterFn` stringifies every row value, and `holderParts` is an array of objects, so `"[object Object]"` would have made a search for "o" or "ct" return all 1,500 bookings. It now stringifies primitives and arrays of primitives only.
- **A share could have exceeded the booking.** `seatLedger` clamps unassigned seats at zero, so over-allocated rows can leave agents holding more seats than the booking has. The divisor is the larger of the booking's seats and the holders' total, so no share can inflate past the booking's own figure.
- **A null EMD value would have printed `PKR 0.00`.** A holder of every seat now returns the stored row untouched rather than a rebuilt one, keeping `null` as `null` and the column's em dash.

**Two names are now reserved for agents.** `Company Investment` and `B2C / Bot` are the fixed holder keys, so an agent carrying one would be a single filter entry meaning two different things — and a share computed for the wrong one. `validateAgent` refuses them, compared through `agentNameKey` so a case or spacing variant cannot slip past. A name that merely *contains* one ("Company Investment Partners") is still fine.

**The Holder select is now controlled** and clears itself if the chosen holder leaves the list — an agent whose seats are released, or whose bookings a branch scope filters away. Left alone, a stale filter matches nothing: an empty table under cards reading zero.

**These are buying-side display figures and the labels say so** — *Seats Held*, *EMD Value (Share)*, *Paid (Share)* — under a line naming the holder. What an agent **owes** is a different number entirely (`agentTotal` in `agent-money.ts`, built from that assignment's charge, discount and tax, and not seat-prorated); nothing here may be read as that.

**Verified against the live data** by running the real dashboard pipeline over the owner's four bookings: *Ansar e Madinah* → 1 booking, 30 seats, EMD 3,450,000, cell `Ansar e Madinah (30 of 99)`; *Eyries Holidays* → the same booking at its own 30; *Company Investment* → 149 seats across 3 bookings, including 39 on AFY883; *MAQBOOL TRAVEL* (30 of 30) → unchanged figures and no count, because the booking is wholly theirs. Every booking reconciles exactly: the sum of its holders' shares equals its own seats and money.


---

### 2026-09-20 — Agent dues: what "the EMD money the airline is holding" counts

**Question:** Ruling 13 says an agent must have paid `(agent seats ÷ PNR seats) × the EMD money the airline is currently holding`, less what they have already paid, 3 days before each deadline. To compute that, three things had to be pinned down that the ruling does not state: **which round statuses count as "held"**, whether the EMD share and the final balance **add together**, and what a payment counts against.

**Answers:**

**1. Held = `issued` + `paid` + `refund_requested`.** `refunded` is excluded, and that exclusion is the whole mechanism of the owner's extension example: when R1 is refunded and R2 issued in its place, the money the airline holds does not double, so the agent is not asked for it twice. `refund_requested` still counts because the money has not come back yet. **`issued` counts even though the company has not paid the airline yet** — the agent's share falls due *before* the deadline the company itself must pay by, which is the entire point of collecting early.

**`expired` is excluded, and that one is a reading rather than a ruling.** The status is a leftover from the spreadsheet era and no document defines it; treating it as "no longer with the airline" matches the other rules, but **say so if an expired round should still count as held.**

**2. The EMD share and the final balance are never added together.** The EMD share is a **milestone inside** the agent's total, not an extra charge: an agent who has paid their EMD share still owes the rest of their total by ticketing. Adding them would roughly double what is chased. `agentDues()` therefore returns both and a single `next` — whichever unmet obligation falls first — and the screens show one figure at a time.

**3. A recovery counts against both.** There is one pot of money from an agent, so a payment reduces the EMD share due *and* the final balance. That is ruling 14 already ("the agent's payments are credited against their total"), and it is what makes the extension example come out at zero.

**Two guards, same shape as elsewhere:** the seat ratio is clamped at 1, because `seatLedger` clamps unassigned seats at zero and over-allocated rows could otherwise ask one agent for more than the airline holds in total; and a zero-seat booking yields zero rather than dividing by zero.

**No ticketing deadline, no due date, no reminder** (ruling 17). The balance shows as outstanding with the reason written next to it — *"no due date until the ticketing deadline is set"* — rather than a date this system invented. For SV the deadline is pre-filled at booking time and for every other airline staff enter it, so a guess here would silently overwrite a person's responsibility. Where both an EMD share and an undated balance are owed, `next` prefers the dated one: an undated balance cannot be chased.

**Verified through real database rows**, not only unit tests — the owner's extension cycle was replayed in a rolled-back transaction, reading back through Prisma's `Decimal` and `Date` types at every stage:

| Stage | Airline holds | Agent's share | Due |
|---|---|---|---|
| R1 450,000 issued | 450,000 | 150,000 | **150,000** by 2026-10-07 |
| 150,000 paid; R1 refunded, R2 450,000 issued | 450,000 | 150,000 | **0** — the payment stands as credit |
| R3 2,550,000 issued alongside R2 | 3,000,000 | 1,000,000 | **850,000** by 2026-10-29 |

The balance behaved as specified too: total 1,250,000 less 150,000 paid = 1,100,000, due 2026-11-14 — outbound (20 Nov) minus 6, being SV's 72-hour issuance deadline minus the agent's 3 days. Clearing the ticketing deadline removed the due date and left the balance outstanding.


---

### 2026-09-21 — EMD deadlines are ISSUANCE deadlines, not payment deadlines

**Question:** none — the owner corrected a misunderstanding that has been in the system since Phase 1.

**The correction:** *"There is a big miscommunication in the EMD rounds, specifically deadlines. The SV policy didn't state payment deadline time limit ranges but it was the date of issuance of EMDs deadline. Airline wants issuance of EMDs according to policy they provide. Payment deadline is concerned with IATA which we'll discuss and build later… For now we are only concerned with issuance of EMDs as they secure the PNR."*

Everything built on `emd_rounds.deadline_date` — the urgency colours, the daily alert, the PNR TL rule, the agent's EMD share — was described as being about **paying** the EMD. It is about **issuing** it. The dates were right; what they meant was wrong.

**What the date means (owner, 2026-09-21):** issuing an EMD secures the PNR until that date. By then staff must either **issue the next EMD**, or **issue the tickets** — *"if the user can sell/issue the tickets he doesn't have to issue a second EMD"* — which ends the cycle. The **ticket** issuance deadline is a different date (SV: 72 hours before departure) and already lives in `ticketing`.

**The 3-day margin was about issuance too, and it now has its reason written down.** *"Airline staff may email you about the PNR/seats 2–3 days after the request date, and if we set issuance according to policy we'll miss deadlines, hence to be proactive we keep it 3 days closer."* Sundays fall in between, with offices shut. An EMD issued exactly on the policy date is an EMD issued late, and a late EMD does not secure the PNR.

**The numbers, and one deliberate reversal.** The policy figures now live in their own function (`emd1PolicyDaysToIssue`) so the airline's sheet stays auditable against the code, and the margin is a single constant applied to them:

| Days to departure | Policy: issue within | System stores | Was |
|---|---|---|---|
| 60+ | 14 days | **11** | 10 |
| 30–59 | 10 days | **7** | 6 |
| 15–29 | 3 days | **immediate** | 3 |
| 7–14 | 3 days | **immediate** | 3 |
| 2–6 | 1 day | **immediate** | 1 |
| under 2 | immediate | **immediate** | 0 |

**The floor is the rule, not a guard** — the owner was explicit: *"make sure subtracting 3 days doesn't make the deadline go beyond immediate issuance… it shouldn't turn into negative but rather the deadline is immediate."* So 1 − 3 is *today*, never two days ago.

**This knowingly reverses part of the 2026-09-07 ruling**, which set the short bands to 3/3/1/0 precisely so short-notice bookings were not created looking overdue. That complaint does not return: a deadline of **today** renders as *due today* (red), not as *overdue*. And the reading has changed — a booking two weeks from departure genuinely must have its EMD issued now.

**The 2nd EMD keeps the policy's own dates** (departure − 20/10/7/5), owner ruling: *"No — keep the policy dates."* The margin exists because the airline is slow to send a new booking's PNR and seats; by the time the balance is due the booking is long confirmed, and those dates are anchored to departure rather than to anything the airline must send.

**One behaviour change beyond wording:** `backfillEmd2Deadlines` now skips a **fully ticketed** booking, since issuing the tickets is the other way to meet the deadline and a deadline written onto such a booking would manufacture an alert for work nobody has to do. Flagged as a **reading** of the owner's answer rather than a stated rule, and kept narrow — only bookings whose tickets are *all* issued are skipped, because a partly ticketed booking still needs its EMD for the seats that remain.

**What deliberately did NOT change.** `payment_pct` and `status = 'paid'` stay as they are: the owner corrected what the *deadline* means, not that EMDs get paid. `paid` records an event that happened; when it had to happen is the IATA question, for later. `total_paid` and `total_refunded` keep their 2026-08-23 definitions. The agent's EMD share still hangs off the issuance deadline, because it is the only deadline the system has — if the IATA rules give agents a different clock, `agent-dues.ts` is the line to revisit, and its docstring says so.

**Flagged for the owner, not fixed:** "Paid" now means two unrelated things on adjacent screens — an EMD round's status, and money received from an agent (`agent_recoveries`). Worth separate words before it confuses someone reconciling.

**The existing rounds were left alone**, per the owner: *"show me what would change first."* New `scripts/emd-deadline-review.ts` reports each recorded deadline against what the corrected rule suggests, and writes nothing without `--commit`. Its first run over the 8 live rounds: all four **2nd EMD** deadlines already match the policy exactly; three 1st-EMD deadlines differ (BDZ960 −11 days, AFY883 −8, ABC321 +1). The report anchors round 1 on the **request date** rather than today, because the airline's clock runs from the request, and judging a recorded date against today would make every older booking look wrong.

---

### 2026-09-21 — Who issues an EMD, what it is worth, and the two statuses

**Question:** five defects reported against the EMD rounds — a branch could issue them, a booking with no rounds showed nothing about what to do next, the amount was typed from scratch, the statuses included values nobody could define, and the round card printed a deadline that was not its own.

**Answers, all the owner's:**

**1. Only Head Office issues EMDs.** Adding, editing and refunding a round were *already* head-office-only; the leak was the **new-booking form**, which showed a "First EMD round" section to everyone, so a branch issued an EMD as a side effect of creating a booking. The round fields are gone from that form for **everyone**, Head Office included — *"HQ rarely creates new PNR bookings as they are usually done by branches. HQ mostly issues EMDs."* One path for issuing instead of two.

**2. A booking now starts with a deadline, not a round.** The form asks only *when the first EMD must be issued*, stored in the existing **`pnr_tl_date`** rather than a new column: it is the same fact the field already held, and `syncPnrTlDate` already moves it on to the earliest outstanding round. So one field answers "what is the next EMD issuance deadline?" in both states, and the booking page shows it above the rounds — *"if there are no EMD rounds at all the section should show the deadline to issue the first EMD; if the 1st is issued it starts showing the deadline to issue the 2nd."*

**3. The deadline left the round card.** A date labelled "deadline" on round 1 reads as round 1's own due date, when it is the time limit for issuing round **2**. It is now one block per booking, naming the EMD that is next. Per-round overdue styling went with it: a round issued on time is not late because a later one was not issued.

**4. Where the first deadline comes from.** Calculated from the airline's policy, and **typed in where an airline has no policy** — *"Airline doesn't give TL for individual PNRs, it hands out policies."* Only SV has one today, so every other airline's booking asks for the date. The form says which of the two is happening.

**5. The EMD amount is calculated:** `seats × fare × payment %`, pre-filled and **editable**, because the airline occasionally issues an EMD for a figure of its own. The amount follows the percentage until someone types over it, and the form shows the arithmetic it used plus an "edited" marker when the two diverge.

**6. Two statuses: `issued` and `refunded`.** `paid`, `refund_requested` and `expired` are gone. **When an EMD is paid is governed by the IATA calendar**, which this system does not model yet, so `paid` was a fact nobody could place in time; the other two were never defined anywhere. The database check now permits exactly two values, and any legacy row carrying a removed status maps to `issued` — none of the three meant the deposit had come back.

**The knock-on that needed a decision: the dashboard's "Total Paid" card.** It summed rounds whose status was `paid`, `refund_requested` or `refunded`, so with `paid` gone it would have counted almost nothing. The owner chose to make it say what it can now actually say: **"EMD Issued" — the deposit the airline is currently holding** (every round not refunded). `PnrListRow.totalPaid` was renamed `totalIssued` rather than left as a name meaning something else. `total_refunded` is unchanged.

**Two consequences worth recording.** `splitPnr` treated `paid`/`refund_requested`/`refunded` as "EMD-1 is settled, do not re-split it"; that is now simply `refunded`. The EMD-2 deadline backfill used the same test and gets the same treatment. Neither changes behaviour for data entered from here on, because the removed statuses can no longer be set.

**Still to come, and deliberately not built here:** Head Office wants to issue EMDs in **bulk** — tick several bookings on the dashboard, click once, and issue against all of them with only the EMD number typed per booking. Sequenced after these corrections so it is built against the corrected model rather than the one that was about to change.

**Verified against the live database**, in rolled-back transactions: a branch-shaped booking is created with **0 rounds** and a first-EMD deadline of policy − 3 days; issuing round 1 pre-fills 15% and PKR 937,500 on a 50-seat booking at 125,000, and secures the PNR to outbound − 20; the deposit and balance amounts re-add to the booking's exact value in all three bands tested; and the database refuses `paid`, `refund_requested`, `expired` and `pending` while accepting `issued` and `refunded`.


---

### 2026-09-22 — Bulk EMD issuance

**Question:** the owner asked for the screen described when we split issuing from booking: *"The HQ account should have a separate EMD bulk issuance form/button where the user doesn't have to type in PNR numbers to fetch details. The dashboard should have a checkbox option where the user can check say 5 boxes and click issue EMDs, then all related details of those PNRs are fetched and shown against individual PNRs for staff to issue."* What was left to decide was the shape, not the intent.

**How the selection travels.** The ticked bookings go to `/pnrs/bulk-emd?ids=…` as a query parameter rather than session storage, so the screen survives a reload, opens in a second tab, and can be handed to a colleague. A batch is capped at 100 bookings — the practical limit is what fits on a screen, and the cap keeps the transaction bounded either way.

**"Select all" means what is visible.** The header checkbox ticks the rows the filters currently leave, never every booking in the database. Selection is held by **booking id, not row index**, so a booking ticked and then filtered out of view is still ticked when the filter is cleared — the alternative silently drops work a person thought they had queued.

**One function decides what an EMD should be.** `nextEmdSuggestion()` in `lib/emd.ts` returns the round number, percentage, amount and new time limit, and both the single Add Round modal and the bulk screen call it. Two places deriving "what should this EMD be?" separately is how a bulk run quietly issues different amounts from the one-at-a-time path. The detail page's own copy of that logic, written the day before, was deleted in favour of it.

**The batch is all-or-nothing**, validated in full before a single row is written, with the failing booking named — the same shape as `processBulkRefunds`, for the same reason: a partly-applied batch leaves staff unsure which bookings now carry an EMD. Two guards beyond per-row validation: the same booking cannot appear twice (it would issue two rounds numbered from the same starting point), and **the same EMD number cannot be used for two bookings** — an EMD number identifies one document the airline issued, so a repeat is a typo. Uniqueness is checked *within the batch only*; enforcing it across the whole database would be inventing a rule nobody has stated.

**Ineligible bookings are shown, not hidden.** A cancelled or completed booking, or one with no seats, appears greyed with the reason. Someone who ticked six boxes and sees five rows cannot tell which one went missing or why.

**A dedup that the work exposed:** the 13-digit EMD-number pattern existed in three places — issuing one round, editing one, and now issuing many. It is one tested `isValidEmdNumber()` in `lib/bulk-emd.ts`, with the hint text alongside it so the three paths cannot drift in what they accept or in what they tell the person.

**Why the constants live outside the action:** a `'use server'` module may export nothing but async functions, so a constant or a type declared there fails the build — which it did, first time. `lib/bulk-emd.ts` holds the cap, the validator and the shared shapes, which also keeps the action's database code out of the browser bundle.

**Verified against the live database** in a rolled-back transaction: three branch-created bookings with no rounds, in three different policy bands, pre-filled as `50 × 125,000 → 15% = PKR 937,500 securing until 2026-12-01`, `30 × 115,000 → 30% = PKR 1,035,000 until 2026-10-22`, and `20 × 100,000 → 50% = PKR 1,000,000 until 2026-10-05`. After issuing, each booking carried one round and its next issuance deadline had moved to the date that EMD secured.


### 2026-09-22 — Paying IATA: the second clock on every EMD

**Question:** the owner supplied `IATA-Calender.pdf` and the rule for reading it: *"Airlines are concerned with EMD issuance while IATA is concerned with payment. There are fields called billing from and billing to — if an EMD is issued between these dates then the corresponding Remittance Day is the deadline to make payment to IATA. Only consider those rows that contain Remittance Frequency as 4 times per month."* This closes the gap left open on 2026-09-21, when payment was declared out of scope because no rule existed for it.

**The calendar.** 48 periods, 1 Jan – 31 Dec 2026, contiguous with no gaps or overlaps, all PKR, transcribed into `src/lib/iata-calendar.ts`. The PDF's other 365 rows carry a frequency of `EasyPay` — a different settlement product — and are excluded, as instructed. `Billing Availability` is unused: it is when the invoice becomes downloadable, not a date anyone must act on.

**The figures are transcribed, never computed.** The lag from a period's close to its remittance day runs between 7 and 10 days with no derivable pattern — it moves with weekends and holidays — so there is no formula to fall back on. An EMD issued outside the loaded calendar gets **no date at all**, shown as "outside the loaded calendar" rather than blank: the money is owed, the day is simply not known. Extrapolating would fabricate a settlement date for real money.

**Scope of what was loaded.** The owner asked for "onwards of today's date till what it is available". The whole of 2026 is in the file rather than only the remainder — the earlier periods cost nothing, and without them an EMD issued earlier this year would report "no payment date" when the date is known and has passed.

**The deadline is derived, never stored.** No column holds it; it is read from the calendar using `issuance_date` every time. If IATA republishes, every figure in the system moves with it, and there is no stored copy to drift.

**Payment is a column, not a status.** `emd_rounds.payment_date` records the day the money went. `status` stays `issued`/`refunded`: **a paid EMD is still issued, because the airline still holds it.** Folding payment into `status` is precisely what made the old `paid` value wrong on 2026-09-21, and re-adding it would have repeated the mistake. Nothing was backfilled — the calendar can say when a round was *due*, never that it was *paid*.

**Rounds 3 and 4 are rounds 1 and 2 re-issued.** The most consequential thing learned here, and nothing in the system had captured it. The owner: *"Rounds three and four are the same as rounds one and two — they are only created if rounds 1–2 are refunded before payment, to re-issue them with new EMD numbers so the payment deadline moves to the next cycle."*

So **a refund is not always money coming back.** It can be a cancellation of the billing, after which the obligation reappears on the replacement round one cycle later. This is a deliberate cash-flow move, and it explains why `emd_rounds` was specified as open-ended from Phase 1.

**The cut-off is the BILLING window, not the payment day** — the owner corrected this the same day, after a first implementation had used the remittance day:

> *"To shift to the next payment deadline cycle the EMD has to be refunded before the billing-to date or on that date. For example if an EMD was issued on 20 Sept and the company decides it cannot pay in this deadline cycle till 30 Sept, the company issues a refund with IATA before or on 23 Sept and issues a new EMD on 24 Sept so that its deadline moves to the next cycle."*

An EMD issued 20 Sep sits in `20260903W`, which bills 16–23 Sep and settles 30 Sep. Refund on or before **23 Sep** and re-issue on the **24th**, which lands in `20260904W` and settles **7 Oct**. Once the window closes the EMD has already been billed; a refund after that is a **separate credit in a later period** and the original bill still falls due. The first implementation would have treated a refund on 26 Sep as cancelling the bill — **writing off money the company still had to pay.** This is the single most expensive mistake available in this feature, and it is why each side of the boundary is pinned down by its own test.

**What is owed, therefore:** a round with no recorded payment whose refund, if any, came too late to cancel the billing. The trap this creates: **a round refunded after its billing window but never paid is still owed, and is not `issued`.** Every query written as "issued and unpaid" silently loses it — so none of them are written that way. `iataPaymentState()` decides, and `iata-dues.ts`, the daily alert and the dashboard row all filter on its verdict rather than on `status`. The partial index was widened to match (`where payment_date is null`, with the `status` clause dropped), which needed a `drop index` first for the same reason documented on `idx_emd_rounds_deadline`.

**The roll-by date is surfaced, not just enforced.** Every owed round shows the last day a refund could still move it to the next cycle — its period's billing-to date — on the round card and on `/iata`, and it disappears once that day has passed. It is the decision staff actually make, and it is one field off data already there.

**Also established:** *"The airline isn't concerned with money — the refund request will be sent to IATA and hence IATA will process them."* The refund counterparty is IATA, not the airline. `business-rules.md` previously implied the airline handled refunds.

**Two separate indicators, not one merged colour** (owner's choice when asked). The dashboard gets its own IATA Payment column with its own urgency, beside the issuance deadline rather than merged into it. The two measure different things against different counterparties, and a booking is routinely relaxed on one and urgent on the other — one colour would hide whichever is not driving it. Same reasoning inside the daily email, where IATA payments get their own table: merging them would put an issuance time limit and a remittance day in one column under one heading, which is the exact confusion the 2026-09-21 correction was about.

**A settlement view, because IATA settles a period at once** (owner's choice). `/iata` groups what is owed by remittance day with a total per day — what accounts actually pays — rather than only answering per booking. Head Office only: paying IATA is a head-office settlement and a branch has no reason to see company-wide obligations.

**The calendar lives in code** (owner's choice). Loading 2027 is a developer task, not an admin one. No table was added, and the figures sit under the same tests as every other date rule.

**Alerts stay future-only.** IATA payments join the daily email inside the same 2-day window as everything else, and an overdue payment is *never* emailed — it stays on the dashboard and the `/iata` page. That keeps the 2026-08-25 rule intact: the daily email does not nag.

**Flagged, not acted on:** the owner noted that a refund used to roll a bill *"doesn't actually add to total refunded"* — no money left, so none came back. The dashboard's `total_refunded` currently sums `refund_amount` for every refunded round regardless, so a rolled round inflates it. That figure carries a protected 2026-08-23 definition and the remark was made in passing, so it is recorded here for a decision rather than changed. With the corrected rule the condition is now precisely expressible: **count a refund only when it did not cancel its own billing** — that is, when a payment date is recorded, or the refund landed after the period's billing-to date.

**Verified against the live database** in rolled-back transactions. EMDs issued 15 Sep, 22 Sep, 24 Sep and 28 Dec resolved to periods 20260902W/20260903W/20260904W/20261204W and remittance days 22 Sep, 30 Sep, 7 Oct and 7 Jan 2027; marking one paid removed it from the owed list. The corrected boundary was then checked on four rounds all issued 20 Sep: never refunded → owed; refunded **on** 23 Sep → rolled, not owed; refunded 24 Sep → **still owed on 30 Sep**, flagged `after-billing`; refunded 28 Sep (before the remittance day, after the window) → **still owed**. The owner's manoeuvre end to end: refund by 23 Sep, re-issue 24 Sep, bill moves 30 Sep → 7 Oct. Finally the settlement query itself, run inside the transaction: of four bookings it returned three (the cancelled booking excluded) and owed two of those, dropping the round that had rolled and keeping the late-refunded one with its flag.


### 2026-09-22 — Telling the agent (phase 7 step 4)

**Question:** the phase file specifies the behaviour; what it does not settle is who may send a notice, what the notice says, and how the recipient guard is enforced.

**The daily email never writes to an agent.** It reports to staff who is due, with a link to each agent, and sending is a human click on that page. The phase file asked for this and it is the right shape: an automated demand for money, sent to an outside party over the company's own verified domain, is not a decision a cron job should make. The email says so in its own text, so nobody assumes the agent has already been told.

**The recipient guard is the airline guard, applied again.** A notice may go only to an address recorded on that agent, checked on the server in `validateAgentNotice()`. The batch airline email was an open mail relay precisely because its check was cosmetic — the UI flagged a mismatch and the server accepted whatever arrived (2026-09-07). The form here goes further and makes the recipient a **select of recorded addresses**, never a text field, but the server check is what actually holds. Consequence, accepted deliberately: **an agent with no address on file cannot be sent anything.** Falling back to an address typed at send time is the relay again. The UI says "no email on file" rather than offering a button that would only fail.

**Who may send — a judgement, not a stated rule.** `canEditAgent`: a branch chases the agents it created, Head Office chases any. The reasoning is that this function already governs who may change `contact_emails`, and those addresses are the only places a notice can go — so anyone who can change the destination can certainly send to it. It also matches `recordRecovery`, which a branch may already do for its own agents. Airline email is Head-Office-only, but airlines are company-wide records while agents are branch-owned. **Flagged for the owner:** if a branch should not be able to email its agents, this is one guard to change.

**What the notice says.** It names the booking, seats, amount, date and what the money is for, and nothing else. No EMD rounds, no percentages, no airline deadlines — none of that is the agent's business, and quoting it invites an argument about arithmetic they cannot check. The EMD share is described as **part of** the total and never as an extra charge (ruling 13): an agent told they owe a deposit *and* a balance would reasonably conclude they were being billed twice. Subject and body are editable; the recipient is not.

**Two things are never chased**, both following rulings already made: an obligation with **no due date** (no ticketing deadline recorded — the system will not invent one and will not chase one it invented, ruling 17), and an **inactive agent**, which is a record kept for history. Overdue notices are not emailed either, keeping the 2026-08-25 future-only rule: they stay on the agent page.

**A duplication removed while it was still cheap.** The agent list, the agent page and the daily alert were each assembling `AgentTerms` from the same columns and calling `agentDues` themselves — three copies of money logic, which is how two screens come to disagree about what an agent owes. They now share `duesForAssignment()` in `agent-dues.ts`, which also returns the margin. This is the same fix, for the same reason, as `nextEmdSuggestion()` on the EMD side (2026-09-22 bulk issuance entry). The `isTermType` fallback matters and is tested: `charge_type` is a text column, so an unrecognised value must become `'none'` rather than flow into the arithmetic as an unknown term.

**The agent list now carries money**, which needed the assignments read in the *same* query as the agents — a row-per-agent lookup is the classic N+1 on a page rendered on every visit.

**Verified against the live database** in a rolled-back transaction, reconciled by hand. A 30-seat booking at 100,000 fare with 20,000 tax, EMD round 1 of 450,000 due 26 Sep, ticketing 27 Sep, two agents holding 10 seats each on 5% terms with tax charged: each owes **PKR 1,250,000** with margin **50,000** — the owner's worked example (ruling 15) reached through the shared mapper. The agent with a 100,000 payment recorded shows **50,000** due and the other **150,000**, both being 10/30 of the 450,000 EMD less what was recovered, dated **23 Sep** — three days before the round's own deadline — and both inside today's alert window. The guard was exercised on five recipients: recorded address accepted, a different case accepted, an unrelated address refused, a lookalike suffix (`ops@zz.example.attacker.test`) refused, and an agent with no recorded address refused outright.

### 2026-09-22 — The agent's EMD money is per round, and has no deadline

**The instruction:** *"When a PNR is assigned to agents the agents should show payment to make for each round. No round deadline needs to be added as the staff knows to collect money from agents before an EMD is issued. Agents' money will be collected for an EMD round before it is issued."*

**This withdraws a rule, it does not add one.** Ruling 13 put the agent's EMD share 3 days before the airline's deadline, and that date drove both the agent screens and the daily alert. There is now **no payment date on an agent's EMD share at all**. The airline's own issuance deadline is still carried as context — it is roughly when the money has to be in hand — but nothing computes a due date from it. `AGENT_NOTICE_DAYS_BEFORE` survives for the final balance only, and its docstring says so.

**A breakdown of one balance, not separately settled debts** (owner's choice when asked). Payments stay a single pot against the assignment and no round reference was added to `agent_recoveries`. This is what keeps ruling 13 working: a round refunded and replaced leaves the agent's payment standing as credit rather than stranded against a round that no longer exists. The alternative — tagging each payment to a round — would have needed a new column and a new answer to what happens to that tag when the round is refunded.

**Agents see rounds 1 and 2, whatever the booking calls them.** *"No need to show refunded rounds for agents as the amount stays the same so agents will follow round 1 and 2."* When rounds 1 and 2 are pulled inside their billing window and re-issued as 3 and 4 (the IATA roll-forward of the same day), the booking holds four rounds and the agent owes for two deposits at unchanged amounts. Refunded rounds are omitted and the survivors renumbered from 1 — the internal numbering would have an agent asking why they are being billed for a fourth round.

**The not-yet-issued round is shown, and is not arrears.** Money is collected *before* a round is issued, so the next round is priced from the airline's policy through `nextEmdSuggestion()` and shown as a collection to make. It is deliberately **excluded** from `EmdShare.required`: the airline is not holding that money, and counting it would report an agent as behind on a deposit that does not exist. Where no policy covers the airline the line is simply absent rather than guessed.

**The shares add up exactly.** Each round's share is the *difference between two cumulative roundings*, not a rounding of each round on its own. Rounding independently lets the parts drift a paisa per round from the whole, so a four-round schedule could print a column that does not sum to the figure beside it. Tested against `emdShareDue` with amounts that divide badly by three, and tested that the upcoming round quotes the identical figure before and after it is issued — a collection that changes the moment the EMD is issued is a collection nobody trusts.

**Ordering, and why it is not a date comparison.** An outstanding EMD share is always the agent's next obligation, ahead of the balance, because no booking reaches ticketing without its EMDs. Sorting the two by date — as the code did — would now push the undated EMD share behind a balance falling months later, understating what has to be collected this week. `agentDues` returns the EMD share first as a matter of fact rather than of sorting.

**Dropped from the daily alert** (owner's choice). The alert emails dated obligations only, so the EMD share leaves it by having no date rather than by a special case — the test asserts the outcome the ruling asked for, not the mechanism. It is chased from the screen instead.

**A regression caught and fixed while making the change:** the "send notice" button appeared only when the next obligation had a date, so removing the date from the EMD share would have made the most common collection the one thing staff could no longer chase. `buildAgentNotice` now accepts a null date and writes *"Due: before the next EMD is issued"* in place of a date line. The owner removed the deadline, not the ability to ask.

**Verified against the live database** in a rolled-back transaction. A 30-seat booking with rounds 1 (450,000) and 2 (900,000) refunded and re-issued as rounds 3 and 4: an agent holding 10 seats sees exactly two lines — **Round 1 = 150,000** and **Round 2 = 300,000** — summing to `required` of 450,000 to the paisa, less 200,000 received, leaving **250,000** to collect, with a null due date and no place in the alert. Separately, with only round 1 issued, the SV policy prices round 2 at 85% and the agent's schedule shows **850,000 to collect before it is issued**, while `required` stays at 150,000.

### 2026-09-23 — "EMDs to be issued" on a date, and naming which EMD is next

**The request:** *"Add another card named EMDs to be issued… when a user selects a date from a filter it should show how much EMDs are meant to be issued on that day and the dashboard shows only the rows that match that deadline… In the dashboard the next deadline column appears 'no issued round' if EMD hasn't been issued at all, but it should show the deadline of issuance for the first round, and if second is to be issued it should specify in small text whether second or first."*

**The figure is the deposits, not the bookings' value** (owner's choice when asked). `seats × fare × the next round's policy percentage`, summed — the money that has to be ready that day. The booking's `total_emd_value` was the other reading and would have answered a different question under the same label.

**That date exactly, not "on or before"** (owner's choice). The card is one day's work; overdue items stay under their own date rather than piling onto whichever date is picked.

**Blank until a date is picked** (owner's choice). A total with no date against it means something else.

**An underivable amount is counted, never zeroed.** Where no airline policy covers the booking the amount is null, staff type it at issuance, and the card reports "N need a manual amount" beside the total. Folding nulls in as zero would make a day's total quietly short, and a short total is worse than one that admits what it is missing.

**"No issued round" was backwards.** The column read `nextPendingDeadline` — the earliest deadline among rounds *already issued* — so a booking that had never had an EMD showed a phrase that sounded like nothing was pending. That is exactly the booking with work outstanding. The row now carries `nextIssuanceDeadline`, which falls back to `pnr_tl_date` (the first EMD's time limit, set when the booking is entered) and is labelled with the round it belongs to via `nextEmdLabel()`.

**The same fix applied to the urgency banner**, which was not asked for but is the same defect: "N bookings need attention within 2 days" counted only bookings with an existing round, so a booking whose *first* EMD was due tomorrow was absent from the very warning meant to catch it. It now reads the same date the column shows.

**The card and the rows cannot disagree.** `matchesIssuanceDate()` is the column's filter function and the predicate `emdsToIssueOn()` counts with — one definition, used twice, rather than a column filter that happens to be written the same way. Without that the table's filter would have matched on the date alone and shown cancelled bookings the card had excluded.

**`nextEmdAmount` is apportioned in a holder view**, like every other money figure there. Left whole, filtering the dashboard to one agent would have quoted the booking's full deposit under that agent's name. A null share stays null — an amount nobody can derive has no share either.

**A known gap, not introduced here:** a booking whose rounds were refunded and re-issued under the IATA roll-forward (rounds 1–2 becoming 3–4) has four rounds recorded, so the next is labelled the "5th EMD" and `nextEmdSuggestion` has no policy percentage for it — the amount shows as manual. The label and the missing amount are both consequences of counting every round ever recorded, which is how the detail page and the bulk screen already count. Worth revisiting together if the roll-forward becomes common; changing it here alone would make three screens disagree.

**Verified against the live database** in a rolled-back transaction, with today at 2026-09-23. Five bookings — three due 20 Sep (one of them an airline with no policy, one already carrying round 1), one due 21 Sep, one cancelled. Picking **20 Sep** gave **PKR 3,352,500 across 3 bookings, 1 needing a manual amount**, and the table left exactly those three: `937,500` for a 1st EMD, `2,415,000` for a 2nd, and the policy-less one as manual. The cancelled booking was excluded from both. Picking 21 Sep gave its one booking alone, proving the date is matched exactly. With no date picked the card reported nothing.

### 2026-09-24 — Why pages were slow, and what fixed it (performance and security pass)

**Question:** *"Figure out why loading data takes so much time… Should the system use Redis… simplify database tables/reduce unwanted fields… introduce loading screens… security up to the mark. Search the web for verifiable strategies, not random guesses."*

**Everything below was measured before it was changed.** The database held **4 bookings** — volume was never the cause. The cost was round trips, multiplied three ways:

1. **The functions ran on the wrong continent.** `vercel.json` set no region, and Vercel's documented default for new projects is Washington D.C. (`iad1`). The database and Auth are in Singapore. Fixed with `"regions": ["sin1"]`; Hobby allows one region.
2. **Every Prisma query cost about five round trips.** Measured A/B on the same database: 504 ms with the built-in engine in `pgbouncer=true` mode, 102 ms without the flag, 103 ms through node-postgres on the same transaction pooler. Fixed with the `@prisma/adapter-pg` driver adapter; `pgbouncer=true` is stripped from the URL in code so no deployed variable had to change. Prisma's own guidance is not to set that flag on modern poolers.
3. **Too many queries, too many in series.** An `include` issued one query per relation — 23 for one booking page. The `relationJoins` preview makes it one LATERAL JOIN; independent reads on the booking and bulk-EMD pages now run together.

Result: booking page data **3,740 ms → 212 ms**, dashboard **2,067 ms → 117 ms**, from a laptop 100 ms from the database. In production the region fix removes most of the remaining round-trip cost too.

**The adapter was proved to return identical data before it was kept.** node-postgres parses `date` columns differently from Prisma's engine, and a timezone shift would have moved every deadline by a day. Every table and relation, `date`/`time`/`timestamptz`/`numeric`/`text[]`, the generated `total_emd_value` and the refund view were read through both clients and compared field by field, under both `TZ=UTC` (Vercel) and `TZ=Asia/Karachi`: identical. Writes were checked the same way — a date, a time and two awkward amounts (`333,333.33`, `149,999.99`) landed exactly. An interactive transaction with `SELECT … FOR UPDATE` still locks through the pooler.

**Auth.** Pages and middleware each called `getUser()`, which always asks Supabase Auth (~300 ms). They now use `getClaims()`, which verifies the JWT against the project's published keys — a local check once the project uses asymmetric signing keys (owner action, steps in `operations.md`), and a server check until then, so it is never weaker. One `cache()`-wrapped helper (`lib/server/session.ts`) is shared by the page and `AppHeader`, which used to resolve the account again. **Server actions that write deliberately keep `getUser()`**: a signed JWT stays valid until it expires even if the account is disabled, and a revoked user must not move money in those minutes. Reads get the fast path; writes keep the authoritative check.

**Redis: not added.** It addresses none of the three causes, adds a network hop and a service pages would depend on, and would cache money figures that must be exact. The plan did propose caching the lookup lists with Next's built-in cache instead — **measurement ruled that out too**: those lists now load in parallel with two live queries in one ~106 ms round trip, so caching them saves 0 ms while making an airline's changed contact addresses appear late. Not built.

**Schema: no fields removed.** With 4 rows, table width is not a measurable cost, no column is unused in code, and rule 3 requires owner sign-off per field. The one thing removed is the **`dashboard_totals` view**, unused since 2026-09-09 — one fewer object to keep revoked from the public roles.

**Loading and errors.** `loading.tsx` skeletons for every main route; Next.js prefetches them, so a click shows the page's shape immediately instead of nothing. `error.tsx` offers a retry and shows **only the error digest, never its message** — a database error can carry query text.

**Security.**
- `next` **15.5.23 → 15.5.26**, closing two *critical unauthenticated remote code execution* advisories (GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4). `npm audit --omit=dev` went from 6 vulnerabilities (1 critical, 5 high) to **0**, the last two via `overrides` pinning patched `postcss` (inside Next) and `deepmerge-ts` (inside the Prisma CLI) — within postcss's major, and one major up for deepmerge-ts, verified by `prisma validate`/`generate`.
- Content-Security-Policy added **in Report-Only mode** first, built from what the app actually loads; `Permissions-Policy` added; `X-Powered-By` removed.
- `/api/ai/parse-pnr` rate-limited to 20 per user per minute — per instance on serverless, stated as such.
- Checked and left alone: every server action is guarded; both API routes authenticate; RLS on 11/11 tables; no server secret in client code; forged session cookies are rejected (tested against a production build).
- **A pre-existing bug fixed in passing:** `db/apply-security.ts` refused to commit whenever the refund log was empty, treating "no rows" as "no access" — so since the 2026-09-20 reset it could not be re-applied at all. It now treats a successful query as proof of access.

**Owner caution recorded in `operations.md`, corrected 2026-09-25:** the first version said to rotate but never revoke because the app's anon key was a JWT signed by the legacy secret. That was not checked, and was wrong — the app uses a new `sb_publishable_…` key, and the project already publishes an ES256 key. Revoking is still unnecessary (it gains nothing, and a legacy `service_role` key used for seeding users would stop working), but not for the reason first given.

### 2026-09-25 — AI screenshot upload failing with "failed to parse" (500)

**Report:** the deployed AI intake returned 500 on image upload.

**Three causes found, all producing the same generic 500 in the deployed code:**
1. **The production key.** Earlier the same day `GEMINI_API_KEY` was found not to be a valid Gemini key (401 everywhere). A new key went into the local `.env` at 16:29 — 23 minutes *after* the 16:06 deploy — and works (verified). Vercel's environment variable is separate and must be updated there; the local file never reaches production. The deployed route turned a 401 into "Could not parse this input", which reads like a bad screenshot.
2. **A busy provider with no fallback.** Google answered 503 *"This model is currently experiencing high demand"* on 1 of 3 probes for two models that afternoon. The screenshot path had exactly one model and no retry, so any busy moment became a failed upload.
3. **A retired backup model.** The text path's fallback `gemini-2.5-flash-lite` now answers 404 *"no longer available to new users"*.

**Fixes.** Both paths now try `gemini-2.5-flash` then `gemini-3.5-flash-lite` (Google's named replacement), each chosen by testing — a rendered booking confirmation parsed with every field correct (PNR, seats, fare, taxes, both dates, sector, segment) by both, three runs in a row on the default path. `gemini-3.5-flash` and `gemini-flash-latest` were also tried and rejected: both returning 503 at the time. A busy or timed-out model gets one retry after 1.5 s; the whole attempt is capped at 55 s, inside Vercel's function limit. Failures are now three distinct messages — key problem, provider busy, unparseable reply — so staff are never told their screenshot is at fault when it is not. `AiBusyError` is raised only when *every* failure was transient; one genuine rejection among them keeps the parse-failure message.

**Also this day:** the Content-Security-Policy moved from Report-Only to enforced after the owner saw no violations in the deployed app; the built login page references no external resource. The Supabase project was found to be already on asymmetric (ES256) JWT signing keys with a new-style publishable API key, so the "rotate keys" owner step was unnecessary.

## Template for new entries

```
### YYYY-MM-DD — <short title>
**Question:** <the ambiguity>
**Answer:** <what was decided, and by whom if relevant>
```
