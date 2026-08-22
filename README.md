# Eyries — EMD Group Booking Management System

Internal tool that replaces the manual spreadsheet used to track group airline seat
bookings (PNRs) bought against EMD guarantee deposits, paid in one or more rounds
until ticketing.

See `docs/` for the locked architecture (`architecture.md`), data model
(`data-model.md`), business rules (`business-rules.md`), decision log
(`decisions.md`), and the current build phase (`docs/phases/`). `PROGRESS.md`
tracks exactly where the build stands — read it first.

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
6. `npm run db:seed:users` — create sample users (admin/staff/viewer).
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

## Conventions

- One phase step per session; update `PROGRESS.md` after each confirmed step.
- Never guess business or money logic — check `docs/business-rules.md` and
  `docs/decisions.md`, otherwise stop and ask.
- Secrets live in `.env` (gitignored); `.env.example` documents required keys.
