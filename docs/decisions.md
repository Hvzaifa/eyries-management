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

---

## Template for new entries

```
### YYYY-MM-DD — <short title>
**Question:** <the ambiguity>
**Answer:** <what was decided, and by whom if relevant>
```
