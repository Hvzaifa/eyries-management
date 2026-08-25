# Progress Tracker

Update this file every time a step is reviewed and confirmed working. This is the first thing to read each session — it tells you (and Claude Code) exactly where to resume.

**Current phase:** Phase 1 — Foundation + Deadline Engine
**Current step:** Step 7 — Daily deadline-check job
**Status:** In progress — built & dry-run verified; live email test pending RESEND_API_KEY + STAFF_ALERT_EMAILS from owner

---

## How to update this file

After a step is built and you've personally checked it against real sample data, change its status to `Done` and move "Current step" to the next one. If a step is in progress, mark it `In progress` so a new session picks up correctly instead of restarting it.

---

## Log

| Date | Phase | Step | Status | Notes |
|---|---|---|---|---|
| 2026-08-22 | Phase 1 | Step 1: DB schema | Done | Project setup initialized, Supabase migration verified, lookup tables seeded (3 licenses, 4 branches, 4 airlines). Schema fully applied + made idempotent during hardening pass; dashboard_totals view completed with paid/refunded totals |
| 2026-08-23 | Phase 1 | Step 2: Authentication | Done | Auth implemented, login works with sample users. Public signup removed (admin-created accounts only), seed-users.ts rewritten to Supabase Admin API |
| 2026-08-23 | Phase 1 | Step 3: PNR List Dashboard | Done | TanStack Table with sorting/filtering, urgency colours (pending-only rounds), dashboard totals from SQL view, PKR formatting, light cream theme, vitest + 12 urgency unit tests |
| 2026-08-23 | Phase 1 | Step 4: PNR detail page | Done | /pnrs/[id] with all core fields, ordered EMD rounds, ticketing + parent/child sections, activity history; shared AppHeader; rows linked from dashboard |
| 2026-08-23 | Phase 1 | Step 5: Manual entry / edit form | Done | Create + edit forms with role guards, activity logging per field, duplicate-PNR two-step warning, unit-tested EMD-1 suggestion (60-day gap resolved to 15%, >90 → 15%, <7 hides round section) |
| 2026-08-24 | Phase 1 | Step 6: Excel import | In progress | Real sheet imported: 972 PNRs / 1727 rounds / 956 ticketing rows; SV-only EMD policy engine live; deadline_date now nullable; 119 rows flagged in flagged-rows-review.csv awaiting owner review |
| 2026-08-24 | Phase 1 | Post-import data pass | Done | 465 past-trip PNRs → completed (activity-logged); airlines renamed (9P/FZ/PF/UL); dashboard defaults to outbound-date ascending |
| 2026-08-24 | Phase 1 | Step 7: Deadline-check job | In progress | Cron route + Resend email built, dry-run verified against test deadline; awaiting owner's RESEND_API_KEY + STAFF_ALERT_EMAILS for live delivery test |
(Add a new row every time a step changes status. Keep old rows — this becomes the project history.)
