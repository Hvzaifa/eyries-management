# Phase 1 — Foundation + Deadline Engine

Goal: a working system for manual entry, viewing, and deadline alerts — the part that stops missed deadlines from day one, even before any AI parsing exists.

**Do exactly one step per session. Update `PROGRESS.md` after each step is reviewed and confirmed working. Do not start the next step in the same session unless explicitly told to.**

---

## Step 1 — Project setup + database schema
- Initialize the Next.js + TypeScript project per `docs/architecture.md`.
- Set up Supabase project connection via environment variables (see `.env.example` — never hardcode credentials).
- Apply `db/schema.sql` as the initial migration. Confirm every table matches `docs/data-model.md` field-for-field — if anything is unclear, stop and ask rather than improvising a column.
- Seed `licenses`, `branches`, and `airlines` lookup tables with placeholder rows so later steps have something to reference (the project owner will replace these with the real list from Phase 0).
- Deliverable: migration runs cleanly, tables exist, seed data present.

## Step 2 — Authentication
- Wire up Supabase Auth, email/password login.
- Three roles: `admin` (full access, manage lookup tables and users), `staff` (create/edit PNRs, record payments, send emails), `viewer` (read-only). Keep this simple — do not build a granular permissions matrix beyond these three roles.
- Every page except login requires a session.
- Deliverable: can create a user, log in, log out, and confirm role-based access blocks a viewer from editing.

## Step 3 — PNR list (dashboard)
- Table view of all PNRs using TanStack Table: sortable, filterable columns matching `docs/data-model.md`.
- Colour-coded urgency based on the nearest unresolved `emd_rounds.deadline_date`: red ≤ 2 days, amber ≤ 5 days, green otherwise, grey if `status != 'active'`.
- Show the dashboard totals (from the `dashboard_totals` view) at the top of the page.
- Deliverable: list loads real seed data, sorts and filters correctly, urgency colours are visibly correct against test dates.

## Step 4 — PNR detail page
- One page per PNR: all core fields, its list of `emd_rounds` (in order), `ticketing` info if present, and its `allocations` (parent/child) if any.
- Show `activity_log` entries for this PNR as a simple change history.
- Deliverable: clicking a PNR in the list opens a detail page with everything from `docs/data-model.md` visible and correctly labeled.

## Step 5 — Manual entry / edit form
- Form covering every field in `pnrs`. On save, also allow adding the first `emd_rounds` entry inline.
- Implement the EMD-1 % auto-suggestion from `docs/business-rules.md` as a plain, unit-tested function — write test cases for each row of that table plus edge cases at the day-count boundaries (e.g. exactly 30 days, exactly 90 days).
- Every save writes to `activity_log`.
- Deliverable: can create and edit a PNR through the UI; auto-suggested EMD-1 % is correct and editable; activity log records the change.

## Step 6 — One-time Excel import tool
- A separate, standalone script (not part of the main app UI) that reads the legacy sheet and inserts rows into `pnrs` and `emd_rounds`.
- Given the "duplicate PNR, changed seat count across rows" issue logged in `docs/decisions.md`, the import script must **flag** (not silently resolve) any duplicate `pnr` values it finds, printing a report for a human to review before those rows are committed.
- Deliverable: running the script against a real export produces a report of clean rows vs. flagged rows, and only clean rows get inserted automatically.

## Step 7 — Daily deadline-check job
- A scheduled job (once daily) that finds every `emd_rounds` row with `status = 'pending'` and `deadline_date` within 2 days, and sends one summary email to staff (via Resend) listing them.
- Does not change any data — read-only, alert-only.
- Deliverable: manually trigger the job against test data with a deadline 1 day away and confirm the email arrives with correct content.

---

**End of Phase 1.** Ship to the team for parallel use alongside the old sheet for at least a week before starting Phase 2.
