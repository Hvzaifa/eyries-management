# Eyries — EMD Group Booking Management System

Internal tool that replaces the manual spreadsheet used to track group airline seat
bookings (PNRs) bought against EMD guarantee deposits, paid in one or more rounds
until ticketing.

**Documentation starts at [`docs/README.md`](docs/README.md)** — it indexes every
document and says what each one is authoritative for. [`PROGRESS.md`](PROGRESS.md)
tracks exactly where the build stands; read it first every session.
[`docs/operations.md`](docs/operations.md) is the runbook for anything that
touches the database.

## Stack

Next.js + TypeScript (App Router) · PostgreSQL via Supabase · Prisma for data
access · Supabase Auth · TanStack Table · Resend · Vercel hosting.

## Setup

1. `npm install`
2. `cp .env.example .env` and fill in all values (Supabase dashboard → Project
   Settings → API; the service role key is only needed for `db:seed:users`).
3. `npx prisma generate` — generate the Prisma client.
4. `npm run db:apply` — apply `db/schema.sql` (idempotent; safe to re-run).
5. `npm run db:seed` — seed lookup tables (licenses, branches, airlines).
6. `npm run db:seed:users` — create sample users. Accounts are **head office**
   or **branch** (the old admin/staff/viewer roles were replaced on 2026-09-07 —
   see `docs/decisions.md`). Passwords come from `SEED_*_PASSWORD` env vars; the
   script refuses to run without them and has no defaults.
7. `npm run dev` — http://localhost:3000

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm run db:apply` | Apply `db/schema.sql` to the database |
| `npm run db:seed` | Seed lookup tables |
| `npm run db:seed:users` | Create/reset sample auth users (needs service role key) |
| `npm test` | Unit tests (vitest) |
| `npm run job:deadline-check` | Dry-run the daily deadline alert (add `-- --send` to deliver) |
| `npm run db:security` | Dry-run the RLS / view security statements (add `-- --commit` to apply) |

## Layout

```
src/
  app/                      routes only
    pnrs/actions/           server actions, one file per concern
      pnr.ts                create / edit / split a booking
      emd.ts                EMD rounds, single and bulk refunds
      email.ts              batch airline email
  components/               all React components
  lib/                      framework-free logic, unit-tested
    auth.ts                 account type, branch scoping, permissions
    emd.ts  seats.ts        the money and seat rules
    refunds.ts  urgency.ts  deadlines.ts
    form.ts                 reading typed values out of FormData
    ai/                     paste-and-parse (LLM + deterministic Excel)
    server/                 server-only helpers, NOT server actions
      guards.ts             requireUser / requireHeadOffice / requirePnrEditor
      pnr-tl.ts             the PNR TL sync rule
```

`lib/server/` is deliberately not `'use server'`: everything exported from such
a module becomes a callable endpoint, and these are internal checks.

## Conventions

- One phase step per session; update `PROGRESS.md` after each confirmed step.
- Never guess business or money logic — check `docs/business-rules.md` and
  `docs/decisions.md`, otherwise stop and ask.
- Secrets live in `.env` (gitignored); `.env.example` documents required keys.
  Never write a fallback secret into code — a default password in a script is a
  published credential.
- Run `npm run build` before calling a change done. `npm run typecheck` uses an
  incremental cache (`tsconfig.tsbuildinfo`) and can report success while the
  build fails; delete that file if the two ever disagree.
