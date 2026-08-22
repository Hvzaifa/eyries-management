# EMD Group Booking Management System — Instructions for Claude Code

Read this file first, every session, before touching any code.

## What this project is

We are replacing a manual Excel/Google Sheet used to track group airline seat bookings (PNRs) bought from airlines against EMD (guarantee) deposits, paid in one or more rounds, until seats are ticketed. The sheet is slow to fill in and error-prone. This system replaces it — nothing more, nothing less. Do not add features beyond what `docs/phases/` describes for the current phase.

Full context, if you need it:
- `docs/architecture.md` — tech stack and system diagram (locked in, do not change without asking)
- `docs/data-model.md` — the finalized database schema and field meanings
- `docs/business-rules.md` — the actual money/date logic (EMD % table, deadline behavior, statuses)
- `docs/decisions.md` — a running log of resolved ambiguities. **Check this before assuming anything about a field's meaning.**
- `docs/phases/` — one file per build phase, each broken into small, reviewable steps
- `PROGRESS.md` — which step we're currently on. Update it when a step is confirmed done.

## Golden rules

1. **One step at a time.** Each file in `docs/phases/` is broken into numbered steps. Build exactly one step per session unless told otherwise. Do not jump ahead to a later step or a later phase.
2. **Never guess business logic.** If a rule isn't written in `docs/business-rules.md` or `docs/decisions.md`, stop and ask rather than inventing a default. Money and deadline logic is the one place a wrong guess costs real money.
3. **Never invent a database field.** Only fields in `docs/data-model.md` exist. If a screen seems to need a field that isn't there, ask before adding one.
4. **Write tests for anything involving dates, percentages, or money.** Specifically: the EMD-1 percentage lookup, seat-allocation math, deadline-flagging logic, and total calculations. These are the places a silent bug is expensive.
5. **After finishing a step, summarize what you built and any assumption you made, however small**, so it can be reviewed before the next step starts. Don't silently continue to the next step in the same turn.
6. **Log every resolved ambiguity** by appending an entry to `docs/decisions.md` — don't just act on a clarification and forget it.
7. **Keep it simple.** If a step can be done with a plain function and a database query, don't reach for a library, a queue, a microservice, or a new framework. This system serves a small internal team, not a large-scale product.
8. **Security defaults, not afterthoughts:** every database query goes through parameterized queries or an ORM (never string-built SQL); every file upload goes to private storage with signed/time-limited URLs, never public buckets; every page other than login requires an authenticated session; secrets always come from environment variables, never hardcoded; never log full request bodies that might contain payment references.

## Tech stack (locked — see docs/architecture.md for why)

- Next.js + TypeScript, single codebase, App Router
- PostgreSQL via Supabase, accessed through Prisma (or the Supabase client — pick one in Step 1 and stay consistent)
- Supabase Auth for login
- TanStack Table for grid views
- Resend for email
- Supabase Storage for files
- Claude API — used only in Phase 2, only to parse pasted airline text into a draft form. It never decides money or deadline logic.
- Hosting: Vercel

## Current status

See `PROGRESS.md` for exactly where we are. Start there, every session.
