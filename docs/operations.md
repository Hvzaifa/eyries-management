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
| `npx tsx scripts/reset-bookings.ts` | **yes** with `--commit` | Clears bookings and everything hanging off them (rounds, ticketing, allocations, assignments, recoveries) but **keeps agents** and the lookup tables. Backs up to `backups/<timestamp>/` first. Dry-runs by default |
| `npx tsx scripts/reset-transactional-data.ts` | **yes** with `--commit` | **Irreversible.** Clears bookings, EMD rounds, ticketing, allocations, agents, assignments and the activity log, and restarts the SR# at 1. Keeps licenses, branches and airlines, and never touches auth accounts. Dry-runs by default. **Back up first** |

### Retired one-off scripts (removed 2026-09-25)

These did their job and were taken out of the working tree. None is needed to
build or run the system. Each is recoverable from git:

| Files | What they were | Restore with |
|---|---|---|
| `db/apply-agents.ts`, `apply-agent-assignments.ts`, `apply-agent-recoveries.ts`, `apply-emd-statuses.ts`, `apply-iata-payments.ts`, `apply-drop-dashboard-view.ts` | One-off migrations, all applied to production (2026-09-19 → 2026-09-24). Every change is also in `db/schema.sql`, so `npm run db:apply` still builds or heals a database without them | `git checkout archive/one-off-scripts -- <path>` |
| `scripts/map-legacy-agents.ts`, `src/lib/legacy-agents.ts` (+ test) | Proposed agents and seat hand-overs from the legacy sheet's free-text `investor_company` | `git checkout archive/one-off-scripts -- <path>` |
| `scripts/emd-deadline-review.ts` | Report on the 8 rounds that existed before the 2026-09-20 reset | `git checkout archive/one-off-scripts -- <path>` |
| `scripts/import-legacy.ts`, `src/lib/legacy-import.ts` (+ test), `scripts/apply-completion-rule.ts`, `scripts/merge-duplicate-branches.ts`, `scripts/make-sample-sheet.ts` | The master-sheet importer and its helpers | `git checkout 9a6c1e0 -- <path>` |

`archive/one-off-scripts` is a branch holding exactly those files on top of
`main` as it stood on 2026-09-25. It is not meant to be merged — only read from.

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
`CRON_SECRET` (daily job), `GEMINI_API_KEY` (AI intake),
`SEED_*_PASSWORD` (user seeding).

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

- **RLS is enabled on all eleven tables with no policies**, which denies the
  public `anon` role entirely. Authorisation lives in the app layer
  (`src/lib/auth.ts`); RLS is a deny-by-default backstop, not a second
  authorisation model.
- **The one SQL view, `refunded_emd_rounds`, declares `security_invoker = on`.**
  Without it a view runs with its owner's privileges and bypasses the RLS
  beneath it — which is exactly how the refund ledger was once publicly
  readable. (`dashboard_totals`, the other, was dropped on 2026-09-24.)
- **Response headers** (`next.config.ts`): frame, content-type, referrer and HSTS
  headers; a `Permissions-Policy` switching off camera, microphone, location,
  payment and USB; `X-Powered-By` removed; and a **Content-Security-Policy in
  Report-Only mode**. After one deploy with no violations in the browser
  console, rename the header to `Content-Security-Policy` to enforce it.
- **Reads verify the session locally, writes ask the Auth server.** Pages and
  the middleware use `auth.getClaims()` (`src/lib/server/session.ts`); every
  server action that writes goes through `requireUser()`, which uses
  `auth.getUser()` so a disabled account is refused immediately rather than
  when its token expires.
- `/api/ai/parse-pnr`, the one route that spends money per call, is limited to
  20 requests per user per minute (`src/lib/rate-limit.ts`). Per instance, not
  global — it stops a runaway loop, the login requirement is the real gate.
- `npm audit --omit=dev` was at **0 vulnerabilities** on 2026-09-24. Two
  transitive packages are pinned through `overrides` in `package.json` —
  `postcss` inside Next and `deepmerge-ts` inside the Prisma CLI — because the
  patched versions are outside the ranges those packages declare. Remove the
  overrides when a Next or Prisma upgrade brings them in natively.
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

### Owner action: switch Supabase to asymmetric JWT signing keys

Until this is done, `getClaims()` still asks the Auth server on every request,
so the ~300 ms per navigation it is meant to save is not saved yet. The code is
correct either way.

1. Supabase Dashboard → **Project Settings → JWT Keys**.
2. Click **Migrate JWT secret**. This imports the current secret and creates a
   new asymmetric key on standby. Nothing changes for users yet.
3. Click **Rotate keys**. New tokens are signed with the new key; Supabase:
   *"Non-expired access tokens will remain to be accepted, so no users will be
   forcefully signed out"*, with no downtime.
4. **Stop there. Do NOT revoke the legacy JWT secret.** The app's
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` is itself a JWT signed by that secret —
   revoking it would make the app's own key invalid. Revoking is only safe after
   switching the app to Supabase's new publishable/secret API keys, which is a
   separate change.

Checked before recommending this: nothing in this repository verifies JWTs
with the legacy secret itself (no `jose`/`jsonwebtoken`), and there are no Edge
Functions — the two things Supabase warns rotation can break. It can be undone:
a previously used key can be moved back to standby and rotated to.

## Where page time goes, and how to check it

Measured on 2026-09-24 with 4 bookings in the database, from Pakistan to the
Singapore database (network round trip ~100 ms):

| | Before | After |
|---|---|---|
| One trivial query | 504 ms (≈5 round trips) | 101 ms (1) |
| Dashboard data (`listPnrs`) | 13 queries, 2,067 ms | 2 queries, 117 ms |
| Booking page data (`getPnrDetail`) | 23 queries, 3,740 ms | 3 queries, 212 ms |
| Form options | 20 queries, 1,244 ms | 5 queries, 111 ms |

Those are from a laptop. In production the functions now run in the same region
as the database, so each round trip is a few milliseconds rather than ~100.

The costs multiply: **round-trip time × round trips per query × queries in
series.** When something feels slow again, measure those three before reaching
for a cache. Count queries with Prisma's query log (`NODE_ENV=development`
prints each one) and look for `await`s that could run together.

## Backups

There is no automated backup beyond Supabase's own. **Before any destructive
operation, dump the data first** — every table to timestamped JSON under
`backups/` (gitignored; it holds live business data). The full re-import on
2026-09-07 did this and the procedure is recorded in `decisions.md`.

Restoring means re-inserting from those JSON files in FK-safe order:
`pnrs` → `emd_rounds` / `ticketing` / `allocations` → `activity_log`.

## Re-importing the master sheet

**The importer was removed on 2026-09-25**, with the data it imported: bookings
are entered through the app since the 2026-09-20 reset. The owner intends to
re-import once the sheet has been cleaned into a proper format. When that
happens:

1. Restore the tooling (see "Retired one-off scripts" above):
   `git checkout 9a6c1e0 -- scripts/import-legacy.ts src/lib/legacy-import.ts src/lib/legacy-import.test.ts scripts/apply-completion-rule.ts`
   and, for agents, `git checkout archive/one-off-scripts -- scripts/map-legacy-agents.ts src/lib/legacy-agents.ts src/lib/legacy-agents.test.ts`.
2. **Check it against the current schema before trusting it.** It was written
   before phases 6–7 (agents, recoveries), the two-status EMD model, the IATA
   `payment_date` and the per-round agent schedule. Run its tests, then a dry
   run, and compare what it proposes against `docs/data-model.md`.
3. **Back up first.** The wipe is irreversible.
4. Delete transactional tables only — **keep the lookup tables**. User accounts
   resolve their branch by *name* against `branches`, so dropping those rows
   locks every branch account out.
5. Reset the serial: `ALTER SEQUENCE pnrs_sr_no_seq RESTART WITH 1` — the
   importer never set `sr_no`.
6. Import with `--commit`, then run `scripts/apply-completion-rule.ts --commit`.

The importer **flagged rather than guessed**: rows with an incomplete EMD round
or a duplicate PNR code were reported and left out, never silently repaired.
Keep that behaviour for the cleaned data.

## Deploying to Vercel

The app is a standard Next.js App Router project; nothing about the deployment is
unusual except the two items called out below, both of which have bitten before.

### One-time setup

1. Push `main` to GitHub (`origin` is already configured).
2. In the Vercel dashboard, **Add New → Project**, import the repository, and
   accept the detected Next.js settings. Do not override the build command —
   `postinstall` handles Prisma (see below).

   `vercel.json` declares `"framework": "nextjs"` so this is not left to the
   project's dashboard preset. If a build ever fails before it starts with
   *"Project framework is set to X, but no services are declared"*, the preset
   in **Settings → General → Framework Preset** is wrong; set it to **Next.js**.
   The first deploy of this project failed exactly that way, with the preset on
   "services".
3. Add the environment variables from the table below, for **Production**,
   **Preview** and **Development**.
4. Deploy. The site runs at this point.
5. *If you want the daily alert email's link to work*, set `NEXT_PUBLIC_APP_URL`
   to the URL Vercel assigned and **redeploy** — `NEXT_PUBLIC_*` values are
   inlined at build time, so setting it alone does nothing until a rebuild.
   Nothing else depends on it.

### Environment variables

| Variable | Needed on Vercel | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **yes** | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **yes** | Public by design; RLS is what protects the data |
| `DATABASE_URL` | **yes** | Pooled connection, port **6543**, `?pgbouncer=true` — serverless opens many short-lived connections and the direct port will exhaust them |
| `DIRECT_URL` | **yes** | Port 5432, used for schema work |
| `CRON_SECRET` | **yes** | Vercel sends it to the cron route automatically |
| `RESEND_API_KEY`, `ALERT_FROM_EMAIL`, `STAFF_ALERT_EMAILS` | for email | Deadline alerts and airline emails |
| `NEXT_PUBLIC_APP_URL` | for email | **Not needed for the site to run** — it appears in exactly one place, the "Open the dashboard" link inside the daily alert email (`src/lib/deadlines.ts`). Without it that link falls back to `http://localhost:3000` and points at the recipient's own machine |
| `GEMINI_API_KEY` | for AI intake | Google AI Studio key. Paste-and-parse and screenshot upload both fail without it. It must be a **Gemini** key — the code posts to Gemini's OpenAI-compatible endpoint, so a key from any other provider returns 401 no matter what the variable is named |
| `GEMINI_MODEL` | optional | Pins one model instead of the `gemini-2.5-flash` → `gemini-2.5-flash-lite` fallback. Lets a misbehaving model be routed around from the dashboard without a redeploy |
| `SUPABASE_SERVICE_ROLE_KEY`, `SEED_*_PASSWORD` | **no** | Local scripts only. Do not put the service-role key on Vercel — it bypasses RLS |

### The two things that catch people

**Prisma and Vercel's build cache.** Vercel restores a cached `node_modules`
between builds, which skips `prisma generate`, and the deployed app then runs
against a stale or missing client. `package.json` carries
`"postinstall": "prisma generate"` — Prisma's documented fix. If a deploy starts
failing with "Prisma has detected that this project was built on Vercel", that
hook has gone missing.

**`api/cron` must stay out of the middleware matcher.** Vercel Cron calls the
route with no session; if middleware sees it, the request is redirected to
`/login` and the job silently never runs. It did exactly that until 2026-09-07.

### After the first deploy — verify, do not assume

```bash
# 1. The public views must stay closed (this is the important one)
curl -s -o /dev/null -w '%{http_code}\n' \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/refunded_emd_rounds?select=*&limit=1" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"          # expect 401

# 2. The cron route rejects an unauthenticated caller...
curl -s -o /dev/null -w '%{http_code}\n' https://<app>/api/cron/deadline-check   # expect 401

# 3. ...and accepts the real secret, rather than redirecting to /login
curl -s -o /dev/null -w '%{http_code}\n' https://<app>/api/cron/deadline-check \
  -H "Authorization: Bearer $CRON_SECRET"              # expect 200, NOT 307
```

A **307** on the third check means middleware is intercepting the cron again.

Then in the app: log in, confirm the dashboard loads, open a booking, and confirm
a branch account sees only its own branch.

### Supabase settings

Login is email/password (`signInWithPassword`), which needs no redirect
allowlisting — so basic login works on a fresh domain with no Supabase change.
Still set **Authentication → URL Configuration → Site URL** to the deployed URL,
or password-reset emails will link to the wrong host.

## Loading a new IATA calendar

The IATA remittance calendar lives in code, at `src/lib/iata-calendar.ts`. It is
**transcribed from IATA's published PDF, never computed** — the gap between a
billing period closing and its remittance day varies with weekends and holidays,
so there is no formula. The loaded calendar currently covers **1 Jan – 31 Dec
2026**.

An EMD issued past the end of the calendar gets no payment date. It is not
treated as settled: the booking shows "Not in calendar" on the dashboard and the
EMD appears under "Outside the loaded calendar" on `/iata`. So the symptom of a
stale calendar is visible, not silent.

To load the next year:

1. Get the calendar PDF for the country and currency the company settles in
   (Pakistan, PKR).
2. Take **only** rows whose `Remittance Frequency` is **"4 times per month"**.
   The PDF also carries a daily row per date with a frequency of `EasyPay` —
   a different settlement product, and not ours. `Billing Availability` is
   unused.
3. Append one `{ code, billingFrom, billingTo, remittanceDay }` entry per row to
   `IATA_PERIODS`, in date order, ISO dates.
4. Run `npx vitest run src/lib/iata-calendar.test.ts`. The tests check the
   transcription itself, not just the lookup: periods must be contiguous with no
   gaps or overlaps, every day of the year must fall in exactly one period, each
   month must have four, remittance must follow its billing window by 7–10 days,
   and each period code must agree with its own dates. A mistyped date fails
   there rather than surfacing as a wrong settlement figure.
5. Update the year in the first test (`holds the 48 ... periods`) and the
   coverage sentence above.

Nothing needs to be migrated or re-derived afterwards: payment deadlines are
read from the calendar on every request, never stored, so the new dates apply to
existing rounds immediately.

## The daily job

Vercel Cron calls `/api/cron/deadline-check` at 03:00 daily, authenticating with
`CRON_SECRET`. `api/cron` **must stay excluded from the middleware matcher** in
`src/middleware.ts`: cron arrives with no session, so middleware would redirect it
to `/login` and the job would never run. It did exactly that, silently, until
2026-09-07.

One run produces one email with up to four tables: **EMD issuance time limits**,
**ticketing deadlines**, **IATA payments due** and **agent money due** (the last
two added 2026-09-22). They are separate tables on purpose — an issuance time
limit and a remittance day in one column under one heading is the confusion the
2026-09-21 correction was about, and agent money is owed *to* the company rather
than *by* it. All four use the same window: **today through two days out, future
only**. Overdue items are never emailed; they stay on the dashboard and, for
payments, on `/iata` (owner rule, 2026-08-25).

The email **never writes to an airline or an agent** — it goes to
`STAFF_ALERT_EMAILS` only. Sending an agent their notice is a human click on
`/agents/[id]`, restricted to that agent's recorded contact addresses.
