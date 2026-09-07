# Operations

How to run, change and recover this system. Everything here writes to a real
database holding real bookings — read the warning on a command before running it.

---

## Commands

| Command | Writes? | Purpose |
|---|---|---|
| `npm run dev` | no | Dev server on :3000 |
| `npm run build` | no | Production build. **Run before calling any change done** |
| `npm test` | no | Unit tests (vitest) |
| `npm run lint` / `npm run typecheck` | no | ESLint / TypeScript |
| `npm run db:apply` | **yes** | Applies `db/schema.sql`. Idempotent |
| `npm run db:security` | **yes** with `-- --commit` | RLS + view protection. Dry-runs by default |
| `npm run db:seed` | **yes** | Lookup tables only (licenses, branches, airlines) |
| `npm run db:seed:users` | **yes** | Creates/resets auth accounts. Needs `SEED_*_PASSWORD` |
| `npm run job:deadline-check` | **yes** (backfill) | Dry-runs the daily alert; `-- --send` delivers it |
| `npx tsx scripts/apply-completion-rule.ts` | **yes** with `--commit` | Completes finished bookings. Dry-runs by default |
| `npx tsx scripts/import-legacy.ts <file.xlsx>` | **yes** with `--commit` | Imports the master sheet. Dry-runs by default |

> `npm run typecheck` can report success while `npm run build` fails: TypeScript
> uses an incremental cache (`tsconfig.tsbuildinfo`) that can go stale. If the
> two ever disagree, delete that file. **Trust the build.**

## Environment

All secrets come from `.env` (gitignored); `.env.example` lists every key. There
are deliberately **no fallback values in code** — a default password written into
a script is a published credential.

Required to run: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`DATABASE_URL`, `DIRECT_URL`.
Required for specific features: `SUPABASE_SERVICE_ROLE_KEY` (user seeding),
`RESEND_API_KEY` + `ALERT_FROM_EMAIL` + `STAFF_ALERT_EMAILS` (email),
`CRON_SECRET` (daily job), `LLM_API_KEY` / `GROQ_API_KEY` / `CEREBREAS_API_KEY`
(AI intake), `SEED_*_PASSWORD` (user seeding).

## Changing the database

`db/schema.sql` is the single source of truth for types and is applied with
`npm run db:apply`. **Every post-launch change must appear twice in it:** once in
the `create table` block (for a fresh database) and once in the healing section
as an `alter table ... if not exists` (for an existing one). `create table if not
exists` never alters a live table, so a change written only in the create block
silently does nothing where it matters.

Changes applied straight to the live database or via Prisma must be mirrored back
into `schema.sql`, or a fresh deployment will not match production. This has gone
wrong before — see `decisions.md`, 2026-09-07 "db/schema.sql had drifted".

## Security posture

- **RLS is enabled on all eight tables with no policies**, which denies the
  public `anon` role entirely. Authorisation lives in the app layer
  (`src/lib/auth.ts`); RLS is a deny-by-default backstop, not a second
  authorisation model.
- **Both SQL views declare `security_invoker = on`.** Without it a view runs with
  its owner's privileges and bypasses the RLS beneath it — which is exactly how
  the refund ledger was once publicly readable.
- The app is unaffected by either: Prisma connects as `postgres`, which owns the
  tables and holds `BYPASSRLS`.
- Apply or re-check all of this with `npm run db:security` (dry run) then
  `npm run db:security -- --commit`.

Verify from outside with the public key — both must return `401`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/refunded_emd_rounds?select=*&limit=1" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

## Backups

There is no automated backup beyond Supabase's own. **Before any destructive
operation, dump the data first** — every table to timestamped JSON under
`backups/` (gitignored; it holds live business data). The full re-import on
2026-09-07 did this and the procedure is recorded in `decisions.md`.

Restoring means re-inserting from those JSON files in FK-safe order:
`pnrs` → `emd_rounds` / `ticketing` / `allocations` → `activity_log`.

## Re-importing the master sheet

1. **Back up first.** The wipe is irreversible.
2. Dry-run: `npx tsx scripts/import-legacy.ts "Groups EMD Master Sheet.xlsx"`.
3. Delete transactional tables only — **keep the lookup tables**. User accounts
   resolve their branch by *name* against `branches`, so dropping those rows
   locks every branch account out.
4. Reset the serial: `ALTER SEQUENCE pnrs_sr_no_seq RESTART WITH 1` — the
   importer never sets `sr_no`, so without this the fresh data keeps counting
   from wherever the old data stopped.
5. Import with `--commit`, then run `scripts/apply-completion-rule.ts --commit`.

The importer **flags rather than guesses**: rows with an incomplete EMD round or
a duplicate PNR code are reported and left out, never silently repaired. Expect a
flagged count and review it — those rows do not reach the database.

## The daily job

Vercel Cron calls `/api/cron/deadline-check` at 03:00 daily, authenticating with
`CRON_SECRET`. `api/cron` **must stay excluded from the middleware matcher** in
`src/middleware.ts`: cron arrives with no session, so middleware would redirect it
to `/login` and the job would never run. It did exactly that, silently, until
2026-09-07.
