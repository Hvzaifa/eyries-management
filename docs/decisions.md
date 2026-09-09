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
- [2026-08-23 — dashboard_totals: definition of total_paid / total_refunded](#2026-08-23-dashboard-totals-definition-of-total-paid-total-refunded)
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
- [2026-08-24 — deadline_date becomes optional (legacy import reality)](#2026-08-24-deadline-date-becomes-optional-legacy-import-reality)
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
- [2026-08-29 — raw_airline_text field added to pnrs](#2026-08-29-raw-airline-text-field-added-to-pnrs)

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

## Template for new entries

```
### YYYY-MM-DD — <short title>
**Question:** <the ambiguity>
**Answer:** <what was decided, and by whom if relevant>
```
