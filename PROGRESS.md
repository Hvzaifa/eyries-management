# Progress Tracker

Update this file every time a step is reviewed and confirmed working. This is the first thing to read each session — it tells you (and Claude Code) exactly where to resume.

**Current phase:** Phase 1 — Foundation + Deadline Engine
**Current step:** Step 5 — Manual entry / edit form
**Status:** In progress

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
(Add a new row every time a step changes status. Keep old rows — this becomes the project history.)
